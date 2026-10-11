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

const BASE: Style = {
  stroke: PALETTE[0],
  strokeWidth: 4,
  fill: null,
  opacity: 1,
  fontFamily: FONTS.Sans,
  fontSize: 28,
  arrowHeads: 'end',
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

const STORAGE_KEY = 'kreskit.styles'

/** Each tool's last-used style, remembered across sessions. */
export function loadStyles(): Record<ObjectType, Style> {
  const styles = { ...DEFAULTS }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    for (const type of Object.keys(styles) as ObjectType[]) {
      // Merge over the defaults so styles saved by an older version still get new fields.
      styles[type] = { ...styles[type], ...saved[type] }
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
