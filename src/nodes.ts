import Konva from 'konva'
import { createDimensionNode, updateDimensionNode } from './dimension'
import { headedSegment, segmentOutline } from './heads'
import { isDimension, type DimensionObject, type LineObject, type SceneObject } from './model'
import { TEXT_LINE_HEIGHT } from './textedit'

export type ObjectNode = Konva.Shape | Konva.Group

export function createNode(obj: SceneObject): ObjectNode {
  switch (obj.type) {
    case 'rect':
      return new Konva.Rect()
    case 'ellipse':
      return new Konva.Ellipse()
    case 'line':
      return new Konva.Line()
    case 'arrow':
      return createArrowNode()
    case 'pen':
    case 'highlighter':
      return new Konva.Line()
    case 'text':
      return new Konva.Text()
    case 'image':
      return new Konva.Image()
    case 'dimension':
    case 'radius':
    case 'diameter':
      return createDimensionNode()
  }
}

/** Make a node look like its object. */
export function applyAttrs(node: ObjectNode, obj: SceneObject): void {
  if (isDimension(obj)) updateDimensionNode(node as Konva.Group, obj)
  else if (obj.type === 'arrow') updateArrowNode(node as Konva.Shape, obj)
  else node.setAttrs(nodeAttrs(obj))
}

/** An arrow as filled polygons (see segmentOutline), shared by the canvas and the SVG export. */
export function arrowOutline(obj: LineObject): number[][] {
  const [x1, y1, x2, y2] = obj.points
  const { strokeWidth, scale } = obj.style
  const length = Math.max(12 * scale, strokeWidth * 4)
  const segment = headedSegment(
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    {
      shape: obj.style.headShape,
      start: obj.style.arrowHeads === 'both',
      end: true,
      length,
      width: length * 0.9,
      tickAngle: 90,
    },
  )
  return segmentOutline(segment, strokeWidth)
}

function tracePolygons(context: Konva.Context, polygons: number[][]): void {
  context.beginPath()
  for (const points of polygons) {
    context.moveTo(points[0], points[1])
    for (let i = 2; i < points.length; i += 2) context.lineTo(points[i], points[i + 1])
    context.closePath()
  }
}

/** An arrow is one custom shape: its line and heads are filled together as a single path. */
function createArrowNode(): Konva.Shape {
  const node = new Konva.Shape({
    outline: [],
    axis: [0, 0, 0, 0],
    sceneFunc(context, shape) {
      tracePolygons(context, shape.getAttr('outline'))
      context.fillShape(shape)
    },
    // Clickable on its heads, and along the line with some slack so a thin arrow is easy to grab.
    hitFunc(context, shape) {
      tracePolygons(context, shape.getAttr('outline'))
      context.fillShape(shape)
      const [x1, y1, x2, y2] = shape.getAttr('axis') as number[]
      context.beginPath()
      context.moveTo(x1, y1)
      context.lineTo(x2, y2)
      context.strokeShape(shape)
    },
  })
  // A custom shape has no size of its own; selection, export bounds and hit boxes all need one.
  node.getSelfRect = () => {
    const all = (node.getAttr('outline') as number[][]).flat()
    if (all.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
    const xs = all.filter((_, i) => i % 2 === 0)
    const ys = all.filter((_, i) => i % 2 === 1)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
  }
  return node
}

function updateArrowNode(node: Konva.Shape, obj: LineObject): void {
  const { stroke, strokeWidth, opacity, scale } = obj.style
  node.setAttrs({
    // Resetting position and scale here undoes whatever a drag or transform left on the node.
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity,
    outline: arrowOutline(obj),
    axis: obj.points,
    fill: stroke,
    // Only the hit area is stroked; see hitFunc.
    stroke,
    hitStrokeWidth: Math.max(strokeWidth, 14 * scale),
  })
}

/** Every Konva attribute an object controls, so applying it also undoes leftover drag offsets and scales. */
function nodeAttrs(obj: Exclude<SceneObject, DimensionObject>): Record<string, unknown> {
  const { stroke, strokeWidth, fill, opacity, scale } = obj.style
  const common = {
    stroke,
    strokeWidth,
    opacity,
    // Thin outlines would otherwise be hard to click.
    hitStrokeWidth: Math.max(strokeWidth, 14 * scale),
    scaleX: 1,
    scaleY: 1,
  }
  switch (obj.type) {
    case 'rect':
      return {
        ...common,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        rotation: obj.rotation,
        fill,
        lineJoin: 'round',
      }
    case 'ellipse':
      return {
        ...common,
        x: obj.x,
        y: obj.y,
        radiusX: obj.radiusX,
        radiusY: obj.radiusY,
        rotation: obj.rotation,
        fill,
      }
    case 'line':
    // An arrow is drawn by updateArrowNode; only plain lines get here.
    case 'arrow':
      return { ...common, x: 0, y: 0, rotation: 0, points: obj.points, lineCap: 'round' }
    case 'image':
      return {
        ...common,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        rotation: obj.rotation,
        image: obj.bitmap,
        stroke: null,
        strokeWidth: 0,
        hitStrokeWidth: 0,
      }
    case 'pen':
    case 'highlighter':
      return {
        ...common,
        x: 0,
        y: 0,
        rotation: 0,
        points: obj.points,
        lineCap: 'round',
        lineJoin: 'round',
        tension: 0.5,
      }
    case 'text':
      return {
        ...common,
        x: obj.x,
        y: obj.y,
        rotation: obj.rotation,
        text: obj.text,
        fontFamily: obj.style.fontFamily,
        fontSize: obj.style.fontSize,
        lineHeight: TEXT_LINE_HEIGHT,
        fill: stroke,
        stroke: null,
        strokeWidth: 0,
        hitStrokeWidth: 0,
      }
  }
}
