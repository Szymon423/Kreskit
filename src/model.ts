import type { HeadShape } from './heads'

/** One style shape for every object; each object type uses the fields that apply to it. */
export interface Style {
  /** Outline colour, or the text colour for text objects. */
  stroke: string
  strokeWidth: number
  fill: string | null
  opacity: number
  fontFamily: string
  fontSize: number
  /** Which ends of an arrow carry a head. */
  arrowHeads: 'end' | 'both'
  /** What those heads, and the ends of a dimension line, look like. */
  headShape: HeadShape
  /**
   * How much the object was enlarged to suit its image (see sizeFactor in styles.ts). The lengths
   * above are real pixels; dividing them by this gives the image-independent values the style
   * bar shows, and the small fixed sizes in the drawing code are multiplied by it.
   */
  scale: number
}

interface Base {
  id: string
  style: Style
}

export interface RectObject extends Base {
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

/** x/y is the centre, matching how the ellipse rotates. */
export interface EllipseObject extends Base {
  type: 'ellipse'
  x: number
  y: number
  radiusX: number
  radiusY: number
  rotation: number
}

export interface LineObject extends Base {
  type: 'line' | 'arrow'
  points: [number, number, number, number]
}

/** A freehand stroke as a flat x,y,x,y... list. */
export interface PathObject extends Base {
  type: 'pen' | 'highlighter'
  points: number[]
}

export interface TextObject extends Base {
  type: 'text'
  x: number
  y: number
  rotation: number
  text: string
}

/**
 * A CAD-style dimension between two measured points. `radius` and `diameter` are drawn straight
 * between the points; `dimension` is drawn on a parallel line `offset` away, joined by extension lines.
 */
export interface DimensionObject extends Base {
  type: 'dimension' | 'radius' | 'diameter'
  points: [number, number, number, number]
  offset: number
  /** A locked axis measures only the horizontal or vertical distance between the points. */
  axis: 'aligned' | 'horizontal' | 'vertical'
  /** The value shown; typed by the user, never measured. */
  text: string
}

/** A further picture placed on the canvas, on top of the base image. Only its opacity is styled. */
export interface ImageObject extends Base {
  type: 'image'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  bitmap: ImageBitmap
}

export type SceneObject =
  | ImageObject
  | RectObject
  | EllipseObject
  | LineObject
  | PathObject
  | TextObject
  | DimensionObject
export type ObjectType = SceneObject['type']

/** The whole document. Treated as immutable: every edit produces a new Doc. */
export interface Doc {
  image: ImageBitmap | null
  /** Back to front. */
  objects: readonly SceneObject[]
}

export const EMPTY_DOC: Doc = { image: null, objects: [] }

const DIMENSION_TYPES: readonly string[] = ['dimension', 'radius', 'diameter']

export function isDimensionType(type: string): type is DimensionObject['type'] {
  return DIMENSION_TYPES.includes(type)
}

export function isDimension(obj: SceneObject): obj is DimensionObject {
  return isDimensionType(obj.type)
}

export function newId(): string {
  return crypto.randomUUID()
}

export function translate(obj: SceneObject, dx: number, dy: number): SceneObject {
  if ('points' in obj) {
    const points = obj.points.map((value, i) => value + (i % 2 ? dy : dx))
    return { ...obj, points } as SceneObject
  }
  return { ...obj, x: obj.x + dx, y: obj.y + dy }
}
