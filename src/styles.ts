import type { ObjectType, Style } from './model'

export const FONTS: Record<string, string> = {
  Sans: 'system-ui, sans-serif',
  Serif: 'Georgia, serif',
  Mono: 'ui-monospace, monospace',
}

export const PALETTE = [
  '#e5383b',
  '#f77f00',
  '#ffd60a',
  '#2fb344',
  '#2f6fed',
  '#8e44ec',
  '#1d1f23',
  '#ffffff',
]

export const BASE: Style = {
  stroke: PALETTE[0],
  strokeWidth: 4,
  fill: null,
  opacity: 1,
  fontFamily: FONTS.Sans,
  fontSize: 28,
  arrowHeads: 'end',
  headShape: 'triangle',
  scale: 1,
}

const DIMENSION: Style = { ...BASE, strokeWidth: 2, fontSize: 22 }

const DEFAULTS: Record<ObjectType, Style> = {
  rect: BASE,
  ellipse: BASE,
  line: BASE,
  arrow: BASE,
  pen: BASE,
  highlighter: { ...BASE, stroke: PALETTE[2], strokeWidth: 22, opacity: 0.4 },
  text: BASE,
  image: BASE,
  dimension: DIMENSION,
  radius: DIMENSION,
  diameter: DIMENSION,
}

/** The image size, by its longer side, at which a tool's sizes are used as they are. */
const REFERENCE_SIDE = 1000
// Outside these limits proportional sizes stop being usable: hairlines on a thumbnail,
// fence posts on a huge scan.
const MIN_FACTOR = 0.4
const MAX_FACTOR = 8

/**
 * How much to enlarge new annotations so they look the same on any image: a line that suits a
 * 1000 px screenshot is drawn four times as wide on a 4000 px one. 1 when there is no image.
 */
export function sizeFactor(image: { width: number; height: number } | null): number {
  if (!image) return 1
  const factor = Math.max(image.width, image.height) / REFERENCE_SIDE
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor))
}

/** Multiply the lengths in a style, or in a change to one, by a factor. */
export function scaleLengths<T extends Partial<Style>>(style: T, factor: number): T {
  const scaled = { ...style }
  if (scaled.strokeWidth !== undefined) scaled.strokeWidth *= factor
  if (scaled.fontSize !== undefined) scaled.fontSize *= factor
  return scaled
}

/** A tool's image-independent style as real pixels for an image with the given size factor. */
export function toPixels(style: Style, factor: number): Style {
  return { ...scaleLengths(style, factor), scale: factor }
}

/** An object's style as the image-independent values the style bar works in. */
export function toRelative(style: Style): Style {
  return scaleLengths(style, 1 / style.scale)
}

const STORAGE_KEY = 'kreskit.styles'

/** Each tool's last-used style, remembered across sessions. */
export function loadStyles(): Record<ObjectType, Style> {
  const styles = { ...DEFAULTS }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    for (const type of Object.keys(styles) as ObjectType[]) {
      // Merge over the defaults so styles saved by an older version still get new fields.
      // Tool styles are image-independent, so their scale is always 1.
      styles[type] = { ...styles[type], ...saved[type], scale: 1 }
    }
  } catch {
    // Unreadable or blocked storage just means starting from the defaults.
  }
  return styles
}

export function saveStyles(styles: Record<ObjectType, Style>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(styles))
  } catch {
    // Not being able to remember styles is not worth interrupting the user for.
  }
}
