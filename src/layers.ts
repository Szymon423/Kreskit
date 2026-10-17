import type { Doc, ObjectType, SceneObject } from './model'

const NAMES: Record<ObjectType, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  arrow: 'Arrow',
  pen: 'Pen stroke',
  highlighter: 'Highlight',
  text: 'Text',
  image: 'Image',
  dimension: 'Dimension',
  radius: 'Radius',
  diameter: 'Diameter',
}

/** Marks a row as the one being dragged; layers are reordered only within the panel. */
export const DRAG_TYPE = 'application/x-kreskit-layer'

interface Actions {
  /** Select the given objects; `toggle` adds or removes the clicked one instead of replacing. */
  select(id: string, toggle: boolean): void
  /** Put an object directly in front of (`above`) or behind another one. */
  move(id: string, targetId: string, above: boolean): void
}

/** The side panel listing every object, front to back, for selecting and reordering them. */
export class LayersPanel {
  private root: HTMLElement
  private list = document.createElement('ol')
  private actions: Actions
  private dragged: string | null = null

  constructor(root: HTMLElement, actions: Actions) {
    this.root = root
    this.actions = actions
    const heading = document.createElement('h2')
    heading.textContent = 'Layers'
    root.append(heading, this.list)
  }

  get open(): boolean {
    return !this.root.hidden
  }

  set open(value: boolean) {
    this.root.hidden = !value
  }

  render(doc: Doc, selection: ReadonlySet<string>): void {
    if (!this.open) return
    this.list.replaceChildren()
    // The document holds objects back to front; a layer list reads front to back.
    for (const obj of [...doc.objects].reverse()) {
      this.list.append(this.row(obj, selection.has(obj.id)))
    }
    if (doc.objects.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'none'
      empty.textContent = 'Nothing drawn yet'
      this.list.prepend(empty)
    }
  }

  private row(obj: SceneObject, selected: boolean): HTMLLIElement {
    const item = document.createElement('li')
    // A div rather than a button: some engines refuse to start a drag on a button.
    const button = document.createElement('div')
    button.className = selected ? 'layer selected' : 'layer'
    button.draggable = true
    const swatch = document.createElement('span')
    swatch.className = 'swatch'
    swatch.style.setProperty('--swatch', obj.type === 'image' ? 'transparent' : obj.style.stroke)
    const label = document.createElement('span')
    label.className = 'label'
    label.textContent = describe(obj)
    button.title = label.textContent
    button.append(swatch, label)
    item.append(button)

    button.addEventListener('click', (e) => {
      this.actions.select(obj.id, e.shiftKey || e.ctrlKey || e.metaKey)
    })

    button.addEventListener('dragstart', (e) => {
      this.dragged = obj.id
      e.dataTransfer?.setData(DRAG_TYPE, obj.id)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    })
    button.addEventListener('dragend', () => {
      this.dragged = null
      this.clearMarks()
    })
    item.addEventListener('dragover', (e) => {
      if (!this.dragged || this.dragged === obj.id) return
      e.preventDefault()
      this.clearMarks()
      item.classList.add(isUpperHalf(item, e) ? 'drop-above' : 'drop-below')
    })
    item.addEventListener('dragleave', () => item.classList.remove('drop-above', 'drop-below'))
    item.addEventListener('drop', (e) => {
      // The window treats any other drop as a file being opened.
      e.preventDefault()
      e.stopPropagation()
      const dragged = this.dragged
      this.clearMarks()
      if (dragged && dragged !== obj.id) this.actions.move(dragged, obj.id, isUpperHalf(item, e))
    })
    return item
  }

  private clearMarks(): void {
    for (const item of this.list.querySelectorAll('.drop-above, .drop-below')) {
      item.classList.remove('drop-above', 'drop-below')
    }
  }
}

function isUpperHalf(element: HTMLElement, e: DragEvent): boolean {
  const box = element.getBoundingClientRect()
  return e.clientY < box.top + box.height / 2
}

function describe(obj: SceneObject): string {
  const name = NAMES[obj.type]
  const text = 'text' in obj ? obj.text.trim().split('\n')[0] : ''
  return text ? `${name}: ${text}` : name
}
