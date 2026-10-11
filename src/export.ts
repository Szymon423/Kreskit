import Konva from 'konva'
import { dimensionGeometry, extensionWidth } from './dimension'
import type { Doc, SceneObject, Style } from './model'
import { applyAttrs, createNode } from './nodes'
import { TEXT_LINE_HEIGHT } from './textedit'

export type ImageFormat = 'png' | 'jpg' | 'svg' | 'pdf'

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** The document drawn off-screen at its real size, with the area an export should cover. */
interface Scene {
  layer: Konva.Layer
  bounds: Bounds
  destroy(): void
}

/** Null when the document has nothing in it. */
function buildScene(doc: Doc): Scene | null {
  const stage = new Konva.Stage({ container: document.createElement('div'), width: 1, height: 1 })
  const layer = new Konva.Layer()
  stage.add(layer)

  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  const include = (box: Bounds): void => {
    left = Math.min(left, box.x)
    top = Math.min(top, box.y)
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  }

  if (doc.image) {
    const { width, height } = doc.image
    layer.add(new Konva.Image({ image: doc.image, width, height }))
    include({ x: 0, y: 0, width, height })
  }
  // Annotations may reach past the image (dimensions usually do), so the export grows to fit them.
  for (const obj of doc.objects) {
    const node = createNode(obj)
    applyAttrs(node, obj)
    layer.add(node)
    include(node.getClientRect())
  }
  if (left === Infinity) {
    stage.destroy()
    return null
  }

  const x = Math.floor(left)
  const y = Math.floor(top)
  return {
    layer,
    bounds: { x, y, width: Math.ceil(right) - x, height: Math.ceil(bottom) - y },
    destroy: () => stage.destroy(),
  }
}

/** The flattened document as a canvas, or null when there is nothing to draw. */
export function renderToCanvas(doc: Doc, background: string | null = null): HTMLCanvasElement | null {
  const scene = buildScene(doc)
  if (!scene) return null
  const drawn = scene.layer.toCanvas({ ...scene.bounds, pixelRatio: 1 })
  scene.destroy()
  if (!background) return drawn

  const canvas = document.createElement('canvas')
  canvas.width = drawn.width
  canvas.height = drawn.height
  const context = canvas.getContext('2d')!
  context.fillStyle = background
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(drawn, 0, 0)
  return canvas
}

export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))), type, quality)
  })
}

export function bitmapDataUrl(bitmap: ImageBitmap): string {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  return canvas.toDataURL('image/png')
}

/** The document in the given file format, or null when there is nothing to export. */
export async function exportBytes(doc: Doc, format: ImageFormat): Promise<Uint8Array | null> {
  if (format === 'png' || format === 'jpg') {
    // JPEG has no transparency, so anything outside the image needs a real background.
    const canvas = renderToCanvas(doc, format === 'jpg' ? '#ffffff' : null)
    if (!canvas) return null
    const blob = await canvasBlob(canvas, format === 'jpg' ? 'image/jpeg' : 'image/png', 0.92)
    return new Uint8Array(await blob.arrayBuffer())
  }

  if (format === 'svg') {
    const svg = toSvg(doc)
    return svg && new TextEncoder().encode(svg.markup)
  }
  const svg = toSvg(doc, PDF_FONT)
  if (!svg) return null

  // Loaded on demand: the PDF writer is bigger than the rest of the app put together.
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
  const { width, height } = svg
  const pdf = new jsPDF({
    unit: 'pt',
    format: [width, height],
    orientation: width > height ? 'landscape' : 'portrait',
  })
  // PDF's built-in fonts only cover Western European letters, so all text is set in an embedded
  // font with wide coverage. This is why a PDF ignores the font chosen for a text.
  const font = new Uint8Array(await (await fetch(`${import.meta.env.BASE_URL}fonts/DejaVuSans.ttf`)).arrayBuffer())
  let binary = ''
  for (let i = 0; i < font.length; i += 0x8000) {
    binary += String.fromCharCode(...font.subarray(i, i + 0x8000))
  }
  pdf.addFileToVFS('DejaVuSans.ttf', btoa(binary))
  pdf.addFont('DejaVuSans.ttf', PDF_FONT, 'normal')

  const element = new DOMParser().parseFromString(svg.markup, 'image/svg+xml').documentElement
  await svg2pdf(element, pdf, { x: 0, y: 0, width, height })
  return new Uint8Array(pdf.output('arraybuffer'))
}

// --- SVG ---

const PDF_FONT = 'DejaVuSans'
/** From the middle of a row of text down to its baseline, as a share of the font size. */
const BASELINE_DROP = 0.35

/** `font`, when given, replaces every object's own font family. */
function toSvg(doc: Doc, font?: string): { markup: string; width: number; height: number } | null {
  const scene = buildScene(doc)
  if (!scene) return null
  const { x, y, width, height } = scene.bounds
  scene.destroy()

  const parts: string[] = []
  if (doc.image) {
    const size = `width="${doc.image.width}" height="${doc.image.height}"`
    parts.push(`<image ${size} href="${bitmapDataUrl(doc.image)}"/>`)
  }
  for (const obj of doc.objects) {
    const style = font ? { ...obj.style, fontFamily: font } : obj.style
    parts.push(objectSvg({ ...obj, style } as SceneObject))
  }

  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="${x} ${y} ${width} ${height}">\n${parts.join('\n')}\n</svg>\n`
  return { markup, width, height }
}

/** Short, stable number formatting keeps the file small and diffable. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function strokeAttrs(style: Style, width = style.strokeWidth): string {
  return `stroke="${style.stroke}" stroke-width="${n(width)}"`
}

function polygon(points: number[], attrs: string): string {
  return `<polygon points="${points.map(n).join(' ')}" ${attrs}/>`
}

function line(x1: number, y1: number, x2: number, y2: number, attrs: string): string {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${attrs}/>`
}

function textSvg(text: string, style: Style, lineHeight: number, anchor: string, top: number): string {
  const step = style.fontSize * lineHeight
  // Each line is centred on its own row, which is how the canvas lays text out. The baseline is
  // worked out here rather than left to `dominant-baseline`, which PDF conversion ignores.
  const drop = style.fontSize * BASELINE_DROP
  const rows = text
    .split('\n')
    .map((row, i) => `<tspan x="0" y="${n(top + (i + 0.5) * step + drop)}">${escapeXml(row)}</tspan>`)
  return (
    `<text font-family="${escapeXml(style.fontFamily)}" font-size="${n(style.fontSize)}" ` +
    `fill="${style.stroke}" text-anchor="${anchor}" ` +
    `xml:space="preserve">${rows.join('')}</text>`
  )
}

function objectSvg(obj: SceneObject): string {
  const { style } = obj
  const wrap = (body: string, transform = ''): string =>
    `<g opacity="${n(style.opacity)}"${transform ? ` transform="${transform}"` : ''}>${body}</g>`
  const fill = `fill="${style.fill ?? 'none'}"`

  switch (obj.type) {
    case 'image':
      return wrap(
        `<image width="${n(obj.width)}" height="${n(obj.height)}" preserveAspectRatio="none" href="${bitmapDataUrl(obj.bitmap)}"/>`,
        `translate(${n(obj.x)} ${n(obj.y)}) rotate(${n(obj.rotation)})`,
      )
    case 'rect':
      return wrap(
        `<rect width="${n(obj.width)}" height="${n(obj.height)}" ${fill} ${strokeAttrs(style)} stroke-linejoin="round"/>`,
        `translate(${n(obj.x)} ${n(obj.y)}) rotate(${n(obj.rotation)})`,
      )
    case 'ellipse':
      return wrap(
        `<ellipse rx="${n(obj.radiusX)}" ry="${n(obj.radiusY)}" ${fill} ${strokeAttrs(style)}/>`,
        `translate(${n(obj.x)} ${n(obj.y)}) rotate(${n(obj.rotation)})`,
      )
    case 'line':
    case 'arrow': {
      const [x1, y1, x2, y2] = obj.points
      const body = [line(x1, y1, x2, y2, `${strokeAttrs(style)} stroke-linecap="round"`)]
      if (obj.type === 'arrow') {
        const size = Math.max(10, style.strokeWidth * 3.5)
        const length = Math.hypot(x2 - x1, y2 - y1) || 1
        const ux = (x2 - x1) / length
        const uy = (y2 - y1) / length
        const head = (tx: number, ty: number, sign: number): string =>
          polygon(
            [
              tx,
              ty,
              tx - ux * size * sign - (uy * size) / 2,
              ty - uy * size * sign + (ux * size) / 2,
              tx - ux * size * sign + (uy * size) / 2,
              ty - uy * size * sign - (ux * size) / 2,
            ],
            `fill="${style.stroke}" ${strokeAttrs(style)}`,
          )
        body.push(head(x2, y2, 1))
        if (style.arrowHeads === 'both') body.push(head(x1, y1, -1))
      }
      return wrap(body.join(''))
    }
    case 'pen':
    case 'highlighter':
      return wrap(
        `<path d="${freehandPath(obj.points)}" fill="none" ${strokeAttrs(style)} stroke-linecap="round" stroke-linejoin="round"/>`,
      )
    case 'text':
      return wrap(
        textSvg(obj.text, style, TEXT_LINE_HEIGHT, 'start', 0),
        `translate(${n(obj.x)} ${n(obj.y)}) rotate(${n(obj.rotation)})`,
      )
    case 'dimension':
    case 'radius':
    case 'diameter': {
      const geometry = dimensionGeometry(obj)
      const [a, b] = geometry.shaft
      const body = [line(a.x, a.y, b.x, b.y, strokeAttrs(style))]
      for (const [start, end] of geometry.extensions) {
        body.push(line(start.x, start.y, end.x, end.y, strokeAttrs(style, extensionWidth(obj))))
      }
      for (const head of geometry.heads) body.push(polygon(head, `fill="${style.stroke}"`))
      // The label is one row high; put that row above or below the line, as on the canvas.
      const top = geometry.labelBelow ? geometry.labelGap : -geometry.labelGap - style.fontSize
      body.push(
        `<g transform="translate(${n(geometry.mid.x)} ${n(geometry.mid.y)}) rotate(${n(geometry.angle)})">` +
          `${textSvg(obj.text, style, 1, 'middle', top)}</g>`,
      )
      return wrap(body.join(''))
    }
  }
}

/** The same smoothed curve the canvas draws through a freehand stroke's points. */
function freehandPath(points: number[]): string {
  const last = points.length - 2
  const curve: number[] =
    points.length > 4 ? new Konva.Line({ points, tension: 0.5 }).getTensionPoints() : []
  if (curve.length === 0) {
    const rest = []
    for (let i = 2; i < points.length; i += 2) rest.push(`L${n(points[i])} ${n(points[i + 1])}`)
    return `M${n(points[0])} ${n(points[1])}${rest.join('')}`
  }
  // Konva's layout: a quadratic lead-in, cubic segments through the middle, a quadratic lead-out.
  const c = curve.map(n)
  let d = `M${n(points[0])} ${n(points[1])}Q${c[0]} ${c[1]} ${c[2]} ${c[3]}`
  for (let i = 4; i < c.length - 2; i += 6) {
    d += `C${c[i]} ${c[i + 1]} ${c[i + 2]} ${c[i + 3]} ${c[i + 4]} ${c[i + 5]}`
  }
  return `${d}Q${c[c.length - 2]} ${c[c.length - 1]} ${n(points[last])} ${n(points[last + 1])}`
}
