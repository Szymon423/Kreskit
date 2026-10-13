import { isDimensionType, type ObjectType, type Style } from './model'
import { FONTS, PALETTE } from './styles'

export interface StyleContext {
  style: Style
  /** The object types the style applies to; decides which controls are shown. */
  types: ReadonlySet<ObjectType>
}

type OnChange = (patch: Partial<Style>) => void

const FILLABLE: ObjectType[] = ['rect', 'ellipse']

/** Each line ending with its name and a small drawing of it: a line running to the right. */
const HEAD_SHAPES: [Style['headShape'], string, string][] = [
  ['triangle', 'Triangle ends', '<path d="M2 7h14"/><path d="M24 7l-9-4.500v9z" fill="currentColor" stroke="none"/>'],
  ['sharp', 'Pointed ends', '<path d="M2 7h16"/><path d="M24 7l-10-4.500 3.500 4.500-3.500 4.500z" fill="currentColor" stroke="none"/>'],
  ['tick', 'Tick ends', '<path d="M2 7h21M23 2v10"/>'],
  ['none', 'No ends', '<path d="M2 7h22"/>'],
]
const BOTH_ENDS_ICON =
  '<path d="M9 7h8"/><path d="M2 7l8-4v8zM24 7l-8-4v8z" fill="currentColor" stroke="none"/>'

function icon(body: string): string {
  return `<svg viewBox="0 0 26 14" width="26" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
}

/** The strip of style controls for the active tool or the current selection. */
export class StyleBar {
  private root: HTMLElement
  private popover: HTMLElement | null = null

  private stroke = colorWell('Color')
  private fill = colorWell('Fill')
  private width = slider('Width', 0.5, 40)
  private opacity = slider('Opacity', 10, 100)
  private font = document.createElement('select')
  private size = document.createElement('input')
  private bothEnds = document.createElement('button')
  private shape = document.createElement('div')
  private twoHeaded = false

  constructor(root: HTMLElement, onChange: OnChange) {
    this.root = root

    for (const name of Object.keys(FONTS)) this.font.add(new Option(name, FONTS[name]))
    this.font.title = 'Font'
    Object.assign(this.size, { type: 'number', min: '6', max: '400', title: 'Font size' })
    this.shape.className = 'icon-choice'
    for (const [value, label, drawing] of HEAD_SHAPES) {
      const button = document.createElement('button')
      button.title = label
      button.dataset.value = value
      button.innerHTML = icon(drawing)
      button.addEventListener('click', () => {
        onChange({ headShape: value })
        button.blur()
      })
      this.shape.append(button)
    }
    this.bothEnds.className = 'icon-choice'
    this.bothEnds.title = 'Heads on both ends'
    this.bothEnds.innerHTML = icon(BOTH_ENDS_ICON)
    this.bothEnds.addEventListener('click', () => {
      onChange({ arrowHeads: this.twoHeaded ? 'end' : 'both' })
      this.bothEnds.blur()
    })
    root.append(
      this.stroke.button,
      this.fill.button,
      this.width.label,
      this.opacity.label,
      this.font,
      this.size,
      this.shape,
      this.bothEnds,
    )

    this.stroke.button.addEventListener('click', () =>
      this.openPalette(this.stroke.button, false, (color) => color && onChange({ stroke: color })),
    )
    this.fill.button.addEventListener('click', () =>
      this.openPalette(this.fill.button, true, (color) => onChange({ fill: color })),
    )
    this.width.input.addEventListener('input', () =>
      onChange({ strokeWidth: this.width.input.valueAsNumber }),
    )
    this.opacity.input.addEventListener('input', () =>
      onChange({ opacity: this.opacity.input.valueAsNumber / 100 }),
    )
    this.font.addEventListener('change', () => onChange({ fontFamily: this.font.value }))
    this.size.addEventListener('change', () => {
      const fontSize = Math.min(400, Math.max(6, this.size.valueAsNumber || 0))
      onChange({ fontSize })
    })
    this.size.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.size.blur()
    })
    // Give the keyboard back to the canvas, so Delete and the tool keys keep working.
    for (const control of [this.width.input, this.opacity.input, this.font]) {
      control.addEventListener('change', () => control.blur())
    }

    window.addEventListener('pointerdown', (e) => {
      const target = e.target as Node
      // Clicks on the bar itself are left to the wells, so a second click on one toggles it shut.
      if (this.popover && !this.popover.contains(target) && !root.contains(target)) this.closePalette()
    })
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closePalette()
    })
  }

  show(context: StyleContext | null): void {
    this.root.hidden = context === null
    if (!context) {
      this.closePalette()
      return
    }
    const { style, types } = context
    const has = (...wanted: ObjectType[]) => wanted.some((type) => types.has(type))
    // Dimensions carry a label, so they get the font controls as well as the stroke ones.
    const text = has('text') || [...types].some(isDimensionType)
    const stroked = [...types].some((type) => type !== 'text' && type !== 'image')
    // A placed picture has no colour of its own; only its opacity can change.
    this.stroke.button.hidden = [...types].every((type) => type === 'image')

    this.fill.button.hidden = !has(...FILLABLE)
    this.width.label.hidden = !stroked
    this.font.hidden = !text
    this.size.hidden = !text
    const ended = has('arrow') || [...types].some(isDimensionType)
    this.shape.hidden = !ended
    // Which ends carry a head only matters when there is a head to carry.
    this.bothEnds.hidden = !has('arrow') || style.headShape === 'none'

    // Dimension lines are meant to be fine, so their width control stops well short of the others'.
    const fine = [...types].every(isDimensionType)
    Object.assign(this.width.input, fine ? { max: '6', step: '0.5' } : { max: '40', step: '1' })

    this.stroke.set(style.stroke)
    this.fill.set(style.fill)
    this.font.value = style.fontFamily
    this.twoHeaded = style.arrowHeads === 'both'
    this.bothEnds.classList.toggle('active', this.twoHeaded)
    for (const button of this.shape.querySelectorAll('button')) {
      button.classList.toggle('active', button.dataset.value === style.headShape)
    }
    // Do not overwrite a control the user is in the middle of using.
    if (document.activeElement !== this.width.input) this.width.input.value = String(style.strokeWidth)
    if (document.activeElement !== this.opacity.input) {
      this.opacity.input.value = String(Math.round(style.opacity * 100))
    }
    if (document.activeElement !== this.size) this.size.value = String(Math.round(style.fontSize))
  }

  private openPalette(
    anchor: HTMLElement,
    allowNone: boolean,
    pick: (color: string | null) => void,
  ): void {
    const reopening = this.popover?.dataset.for === anchor.title
    this.closePalette()
    if (reopening) return

    const popover = document.createElement('div')
    popover.className = 'palette'
    popover.dataset.for = anchor.title
    const choose = (color: string | null): void => {
      pick(color)
      this.closePalette()
    }
    if (allowNone) popover.append(swatch(null, 'No fill', () => choose(null)))
    for (const color of PALETTE) popover.append(swatch(color, color, () => choose(color)))

    const custom = document.createElement('input')
    custom.type = 'color'
    custom.title = 'Custom colour'
    // Live updates while the system picker is open; the popover stays until it is dismissed.
    custom.addEventListener('input', () => pick(custom.value))
    popover.append(custom)

    const box = anchor.getBoundingClientRect()
    popover.style.left = `${box.left}px`
    popover.style.top = `${box.bottom + 6}px`
    document.body.append(popover)
    this.popover = popover
  }

  private closePalette(): void {
    this.popover?.remove()
    this.popover = null
  }
}

function swatch(color: string | null, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = 'swatch'
  button.title = title
  paint(button, color)
  button.addEventListener('click', onClick)
  return button
}

function paint(element: HTMLElement, color: string | null): void {
  element.classList.toggle('none', color === null)
  element.style.setProperty('--swatch', color ?? 'transparent')
}

function colorWell(title: string): { button: HTMLButtonElement; set(color: string | null): void } {
  const button = document.createElement('button')
  button.className = 'well'
  button.title = title
  const chip = document.createElement('span')
  chip.className = 'swatch'
  button.append(chip, title)
  return { button, set: (color) => paint(chip, color) }
}

function slider(title: string, min: number, max: number): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = document.createElement('label')
  const input = document.createElement('input')
  Object.assign(input, { type: 'range', min: String(min), max: String(max), title })
  label.append(title, input)
  return { label, input }
}
