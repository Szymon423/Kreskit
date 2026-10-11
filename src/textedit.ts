import type { Style } from './model'

export const TEXT_LINE_HEIGHT = 1.2

/** Controls that restyle the text being edited; using them must not end the edit. */
const STYLE_CONTROLS = '#stylebar, .palette'

export interface TextEditor {
  finish(): void
  /** Make the editor look like the given style, for changes made while it is open. */
  restyle(style: Style): void
}

interface Options {
  text: string
  style: Style
  /** The window position the editor is anchored to. */
  origin: { x: number; y: number }
  scale: number
  /** CSS transform placing the editor relative to the origin, e.g. a rotation. */
  transform: string
  /** One-line values: Enter finishes, and the caret starts after the existing text. */
  singleLine?: boolean
  onDone: (text: string) => void
}

/** Put a textarea over the canvas, styled to match the text it stands in for. */
export function openTextEditor(options: Options): TextEditor {
  const { text, style, origin, scale, transform, singleLine = false, onDone } = options
  const area = document.createElement('textarea')
  area.className = singleLine ? 'text-editor boxed' : 'text-editor'
  area.value = text
  area.spellcheck = false
  let fontSize = style.fontSize * scale
  Object.assign(area.style, {
    left: `${origin.x}px`,
    top: `${origin.y}px`,
    lineHeight: String(TEXT_LINE_HEIGHT),
    transform,
  })

  const fitToContent = (): void => {
    area.style.width = '0'
    area.style.height = '0'
    // Leave room for the next character so typing never scrolls the text sideways.
    area.style.width = `${area.scrollWidth + fontSize}px`
    area.style.height = `${area.scrollHeight}px`
  }

  const restyle = (next: Style): void => {
    fontSize = next.fontSize * scale
    Object.assign(area.style, {
      fontSize: `${fontSize}px`,
      fontFamily: next.fontFamily,
      color: next.stroke,
      // A dimension's value is edited in an opaque box, which should stay readable.
      opacity: singleLine ? '' : String(next.opacity),
    })
    fitToContent()
  }

  // Using a style control takes focus away from the text; that must not count as clicking away.
  let usingControls = false
  const trackPointer = (e: PointerEvent): void => {
    usingControls = e.target instanceof Element && e.target.closest(STYLE_CONTROLS) !== null
  }
  /** Once a style control is done with, typing should carry on where it left off. */
  const refocus = (): void => {
    setTimeout(() => {
      const active = document.activeElement
      const busy = active instanceof HTMLElement && active.closest(STYLE_CONTROLS) !== null
      if (!done && !busy) area.focus()
    })
  }

  let done = false
  const finish = (): void => {
    if (done) return
    done = true
    window.removeEventListener('pointerdown', trackPointer, true)
    document.removeEventListener('change', refocus, true)
    document.removeEventListener('click', refocus, true)
    area.remove()
    onDone(area.value)
  }

  area.addEventListener('input', fitToContent)
  area.addEventListener('keydown', (e) => {
    const enter = e.key === 'Enter' && (singleLine || e.ctrlKey || e.metaKey)
    if (e.key === 'Escape' || enter) {
      e.preventDefault()
      finish()
    }
  })
  document.body.append(area)
  restyle(style)
  window.addEventListener('pointerdown', trackPointer, true)
  document.addEventListener('change', refocus, true)
  document.addEventListener('click', refocus, true)
  // The click that opened the editor is still being processed and would take focus straight back.
  setTimeout(() => {
    area.focus()
    if (singleLine) area.setSelectionRange(area.value.length, area.value.length)
    else area.select()
    area.addEventListener('blur', () => {
      if (!usingControls) finish()
    })
  })

  return { finish, restyle }
}
