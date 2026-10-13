export type Point = { x: number; y: number }

/** What sits on the end of an arrow or a dimension line. */
export type HeadShape = 'triangle' | 'sharp' | 'tick' | 'none'

/** One line ending: a filled polygon, or an open stroke for a tick. Points are a flat x,y list. */
export interface Head {
  points: number[]
  filled: boolean
}

export interface HeadedSegment {
  /** The line itself, shortened where a head covers its end. */
  shaft: [Point, Point]
  /** The heads at the start and the end; null where there is none. */
  heads: [Head | null, Head | null]
}

interface Options {
  shape: HeadShape
  start: boolean
  end: boolean
  /** Size of a head along the line and across it, before it is shrunk to fit a short line. */
  length: number
  width: number
  /** Angle between a tick and the line, in degrees: 90 for a crossbar, 45 for a drafting slash. */
  tickAngle: number
}

/** How far into a pointed head its back notch reaches, as a share of the head's length. */
const NOTCH = 0.65

/**
 * A line from `from` to `to` with a head on either end. Heads are fills whose tip lands exactly
 * on the endpoint (a stroked outline would poke past it), and the shaft stops where a head
 * begins so its square end never shows beside the tip.
 */
export function headedSegment(from: Point, to: Point, options: Options): HeadedSegment {
  const span = Math.hypot(to.x - from.x, to.y - from.y)
  const segment: HeadedSegment = { shaft: [from, to], heads: [null, null] }
  if (span === 0 || options.shape === 'none') return segment

  const unit = { x: (to.x - from.x) / span, y: (to.y - from.y) / span }
  // Two heads on a short line must not run into each other.
  const length = Math.min(options.length, span / 2)
  const width = options.width * (length / options.length)

  const ends = [
    { on: options.start, tip: from, out: { x: -unit.x, y: -unit.y } },
    { on: options.end, tip: to, out: unit },
  ]
  ends.forEach(({ on, tip, out }, index) => {
    if (!on) return
    const across = { x: -out.y, y: out.x }
    const back = (distance: number): Point => ({
      x: tip.x - out.x * distance,
      y: tip.y - out.y * distance,
    })
    const wings = (at: Point): number[] => [
      at.x + (across.x * width) / 2,
      at.y + (across.y * width) / 2,
      at.x - (across.x * width) / 2,
      at.y - (across.y * width) / 2,
    ]

    if (options.shape === 'triangle') {
      const [ax, ay, bx, by] = wings(back(length))
      segment.heads[index] = { points: [tip.x, tip.y, ax, ay, bx, by], filled: true }
      segment.shaft[index] = back(length)
    } else if (options.shape === 'sharp') {
      // Two triangles sharing the centre line: the back edge is cut in to a notch.
      const [ax, ay, bx, by] = wings(back(length))
      const notch = back(length * NOTCH)
      segment.heads[index] = {
        points: [tip.x, tip.y, ax, ay, notch.x, notch.y, bx, by],
        filled: true,
      }
      segment.shaft[index] = notch
    } else {
      const angle = (options.tickAngle * Math.PI) / 180
      const along = {
        x: out.x * Math.cos(angle) - out.y * Math.sin(angle),
        y: out.x * Math.sin(angle) + out.y * Math.cos(angle),
      }
      const half = length * 0.6
      segment.heads[index] = {
        points: [
          tip.x - along.x * half,
          tip.y - along.y * half,
          tip.x + along.x * half,
          tip.y + along.y * half,
        ],
        filled: false,
      }
    }
  })
  return segment
}

/**
 * The whole segment as filled polygons, all wound the same way, so that filling them as one
 * path gives their union: an even colour even where a head and the line overlap, which matters
 * as soon as the object is translucent.
 */
export function segmentOutline(segment: HeadedSegment, strokeWidth: number): number[][] {
  const polygons = [strip(segment.shaft[0], segment.shaft[1], strokeWidth)]
  for (const head of segment.heads) {
    if (!head) continue
    if (head.filled) {
      polygons.push(head.points)
    } else {
      const [x1, y1, x2, y2] = head.points
      polygons.push(strip({ x: x1, y: y1 }, { x: x2, y: y2 }, strokeWidth))
    }
  }
  return polygons.map((points) => (signedArea(points) < 0 ? reversed(points) : points))
}

/** A line of the given width as a four-cornered polygon. */
function strip(a: Point, b: Point, width: number): number[] {
  const span = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const nx = (-(b.y - a.y) / span) * (width / 2)
  const ny = ((b.x - a.x) / span) * (width / 2)
  return [a.x + nx, a.y + ny, b.x + nx, b.y + ny, b.x - nx, b.y - ny, a.x - nx, a.y - ny]
}

function signedArea(points: number[]): number {
  let area = 0
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length
    area += points[i] * points[j + 1] - points[j] * points[i + 1]
  }
  return area
}

function reversed(points: number[]): number[] {
  const result: number[] = []
  for (let i = points.length - 2; i >= 0; i -= 2) result.push(points[i], points[i + 1])
  return result
}
