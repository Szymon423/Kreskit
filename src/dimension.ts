import Konva from 'konva'
import { headedSegment, type Head, type Point } from './heads'
import type { DimensionObject } from './model'

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
  /** The endings at the start and end of the dimension line; null where there is none. */
  heads: [Head | null, Head | null]
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
  const { strokeWidth, scale } = obj.style
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

  // A crossbar would vanish into the extension line it sits on, so a dimension's tick is the
  // drafting kind: a 45° slash. A radius is measured from the centre, so only its outer end gets one.
  const headLength = Math.max(11.5 * scale, strokeWidth * 4.6)
  const { shaft, heads } = headedSegment(from, to, {
    shape: obj.style.headShape,
    start: obj.type !== 'radius',
    end: true,
    length: headLength,
    width: headLength * 0.6,
    tickAngle: 45,
  })

  const overshoot = strokeWidth * 2 + 4 * scale
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
    labelGap: strokeWidth / 2 + 3 * scale,
  }
}

/** Width of the extension lines, which are drawn finer than the dimension line. */
export function extensionWidth(obj: DimensionObject): number {
  return Math.max(obj.style.scale, obj.style.strokeWidth / 2)
}

/** Konva attributes that make a line node draw one head: a fill for the pointed kinds, a stroke for a tick. */
export function headAttrs(head: Head | null, style: { stroke: string; strokeWidth: number }): object {
  return {
    visible: head !== null,
    points: head?.points ?? [],
    closed: head?.filled ?? false,
    fillEnabled: head?.filled ?? false,
    strokeEnabled: !(head?.filled ?? true),
    fill: style.stroke,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
  }
}

export function createDimensionNode(): Konva.Group {
  const group = new Konva.Group()
  group.add(
    new Konva.Line({ name: 'ext0' }),
    new Konva.Line({ name: 'ext1' }),
    new Konva.Line({ name: 'shaft' }),
    new Konva.Line({ name: 'head0' }),
    new Konva.Line({ name: 'head1' }),
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
    hitStrokeWidth: 14 * obj.style.scale,
  })
  for (const index of [0, 1]) {
    group.findOne<Konva.Line>(`.head${index}`)!.setAttrs(headAttrs(geometry.heads[index], obj.style))

    const extension = geometry.extensions[index]
    group.findOne<Konva.Line>(`.ext${index}`)!.setAttrs({
      visible: extension !== undefined,
      points: extension ? [extension[0].x, extension[0].y, extension[1].x, extension[1].y] : [],
      stroke,
      strokeWidth: extensionWidth(obj),
      hitStrokeWidth: 10 * obj.style.scale,
    })
  }

  const label = group.findOne<Konva.Text>('.label')!
  label.setAttrs({ text: obj.text, fontFamily, fontSize, fill: stroke, rotation: geometry.angle, ...mid })
  // Centre the label along the line and move it clear of the stroke, on the outer side.
  label.offsetX(label.width() / 2)
  label.offsetY(geometry.labelBelow ? -geometry.labelGap : label.height() + geometry.labelGap)
}
