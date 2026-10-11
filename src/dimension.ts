import Konva from 'konva'
import type { DimensionObject } from './model'

type Point = { x: number; y: number }

/** Everything needed to draw a dimension, shared by the canvas and the SVG export. */
export interface DimensionGeometry {
  /** Ends of the dimension line, where the arrow tips sit. */
  from: Point
  to: Point
  mid: Point
  /** Unit vector the offset is measured along. */
  normal: Point
  /** The dimension line shortened to the bases of its arrowheads. */
  shaft: [Point, Point]
  /** One filled triangle per arrowhead, as flat x,y lists starting at the tip. */
  heads: number[][]
  /** Extension lines from the measured points out to the dimension line. */
  extensions: [Point, Point][]
  /** Rotation for the label, in degrees: it always reads left to right, or top to bottom when vertical. */
  angle: number
  /** True when the label belongs below the line (in its own reading direction) to stay on the outer side. */
  labelBelow: boolean
  /** Clear space between the line and the label. */
  labelGap: number
}

export function dimensionGeometry(obj: DimensionObject): DimensionGeometry {
  const [ax, ay, bx, by] = obj.points
  const { strokeWidth } = obj.style
  const linear = obj.type === 'dimension'

  let dir = { x: 1, y: 0 }
  if (linear && obj.axis === 'vertical') {
    dir = { x: 0, y: 1 }
  } else if (!linear || obj.axis === 'aligned') {
    const length = Math.hypot(bx - ax, by - ay)
    if (length > 0) dir = { x: (bx - ax) / length, y: (by - ay) / length }
  }
  const normal = { x: -dir.y, y: dir.x }
  const offset = linear ? obj.offset : 0

  const from = { x: ax + normal.x * offset, y: ay + normal.y * offset }
  // With a locked axis the second point is projected onto the dimension line.
  const along = (bx - ax) * dir.x + (by - ay) * dir.y
  const to = { x: from.x + dir.x * along, y: from.y + dir.y * along }

  let angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI
  if (angle > 90) angle -= 180
  if (angle <= -90) angle += 180
  // The label goes on the side of the dimension line facing away from what is measured, which
  // is the side the offset points to. "Up" for the label is its own top, turned by its angle.
  const radians = (angle * Math.PI) / 180
  const up = { x: Math.sin(radians), y: -Math.cos(radians) }
  const labelBelow = (up.x * normal.x + up.y * normal.y) * offset < 0

  // The arrowheads are plain filled triangles: a stroked head would poke its mitred tip past
  // the extension line, and the tip has to land exactly on the measured point.
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const ux = length > 0 ? (to.x - from.x) / length : 1
  const uy = length > 0 ? (to.y - from.y) / length : 0
  const headLength = Math.min(Math.max(11.5, strokeWidth * 4.6), length / 2)
  const headWidth = headLength * 0.6
  const shaft: [Point, Point] = [from, to]
  const heads: number[][] = []
  // A radius is measured from the centre, so only the end on the circle gets an arrowhead.
  const tips = [obj.type === 'radius' ? null : { at: from, sign: 1 }, { at: to, sign: -1 }]
  tips.forEach((tip, index) => {
    if (!tip || length === 0) return
    // The shaft stops at the base of the head so its square end cannot show beside the tip.
    const base = { x: tip.at.x + ux * headLength * tip.sign, y: tip.at.y + uy * headLength * tip.sign }
    shaft[index] = base
    heads.push([
      tip.at.x,
      tip.at.y,
      base.x - (uy * headWidth) / 2,
      base.y + (ux * headWidth) / 2,
      base.x + (uy * headWidth) / 2,
      base.y - (ux * headWidth) / 2,
    ])
  })

  const overshoot = strokeWidth * 2 + 4
  const extensions: [Point, Point][] = []
  if (linear) {
    for (const [start, end] of [
      [{ x: ax, y: ay }, from],
      [{ x: bx, y: by }, to],
    ]) {
      const reach = Math.hypot(end.x - start.x, end.y - start.y)
      if (reach < 0.5) continue
      const ex = (end.x - start.x) / reach
      const ey = (end.y - start.y) / reach
      extensions.push([start, { x: end.x + ex * overshoot, y: end.y + ey * overshoot }])
    }
  }

  return {
    from,
    to,
    mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
    normal,
    shaft,
    heads,
    extensions,
    angle,
    labelBelow,
    labelGap: strokeWidth / 2 + 3,
  }
}

/** Width of the extension lines, which are drawn finer than the dimension line. */
export function extensionWidth(obj: DimensionObject): number {
  return Math.max(1, obj.style.strokeWidth / 2)
}

export function createDimensionNode(): Konva.Group {
  const group = new Konva.Group()
  group.add(
    new Konva.Line({ name: 'ext0' }),
    new Konva.Line({ name: 'ext1' }),
    new Konva.Line({ name: 'shaft' }),
    new Konva.Line({ name: 'head0', closed: true, strokeEnabled: false }),
    new Konva.Line({ name: 'head1', closed: true, strokeEnabled: false }),
    new Konva.Text({ name: 'label' }),
  )
  return group
}

export function updateDimensionNode(group: Konva.Group, obj: DimensionObject): void {
  const { stroke, strokeWidth, opacity, fontFamily, fontSize } = obj.style
  const geometry = dimensionGeometry(obj)
  const { shaft, mid } = geometry

  // Resetting position and scale here undoes whatever a drag or transform left on the group.
  group.setAttrs({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity })

  group.findOne<Konva.Line>('.shaft')!.setAttrs({
    points: [shaft[0].x, shaft[0].y, shaft[1].x, shaft[1].y],
    stroke,
    strokeWidth,
    hitStrokeWidth: 14,
  })
  for (const index of [0, 1]) {
    const head = geometry.heads[index]
    group
      .findOne<Konva.Line>(`.head${index}`)!
      .setAttrs({ visible: head !== undefined, points: head ?? [], fill: stroke })

    const extension = geometry.extensions[index]
    group.findOne<Konva.Line>(`.ext${index}`)!.setAttrs({
      visible: extension !== undefined,
      points: extension ? [extension[0].x, extension[0].y, extension[1].x, extension[1].y] : [],
      stroke,
      strokeWidth: extensionWidth(obj),
      hitStrokeWidth: 10,
    })
  }

  const label = group.findOne<Konva.Text>('.label')!
  label.setAttrs({ text: obj.text, fontFamily, fontSize, fill: stroke, rotation: geometry.angle, ...mid })
  // Centre the label along the line and move it clear of the stroke, on the outer side.
  label.offsetX(label.width() / 2)
  label.offsetY(geometry.labelBelow ? -geometry.labelGap : label.height() + geometry.labelGap)
}
