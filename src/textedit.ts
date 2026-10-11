import type { Style } from './model'

export const TEXT_LINE_HEIGHT = 1.2

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
export function openTextEditor(options: Options): { finish(): void } {
  const { text, style, origin, scale, transform, singleLine = false, onDone } = options
  const area = document.createElement('textarea')
  area.className = singleLine ? 'text-editor boxed' : 'text-editor'
  area.value = text
  area.spellcheck = false
  const fontSize = style.fontSize * scale
  Object.assign(area.style, {
    left: `${origin.x}px`,
    top: `${origin.y}px`,
    fontSize: `${fontSize}px`,
    fontFamily: style.fontFamily,
    lineHeight: String(TEXT_LINE_HEIGHT),
    color: style.stroke,
    transform,
  })

  const fitToContent = (): void => {
    area.style.width = '0'
    area.style.height = '0'
    // Leave room for the next character so typing never scrolls the text sideways.
    area.style.width = `${area.scrollWidth + fontSize}px`
    area.style.height = `${area.scrollHeight}px`
  }

  let done = false
  const finish = (): void => {
    if (done) return
    done = true
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
  fitToContent()
  // The click that opened the editor is still being processed and would take focus straight back.
  setTimeout(() => {
    area.focus()
    if (singleLine) area.setSelectionRange(area.value.length, area.value.length)
    else area.select()
    area.addEventListener('blur', finish)
  })

  return { finish }
}
