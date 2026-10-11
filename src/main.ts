import './style.css'
import { choose, isAsking } from './dialog'
import { Editor, type Tool } from './editor'
import { exportBytes, renderToCanvas, type ImageFormat } from './export'
import {
  PROJECT_EXTENSION,
  copyCanvas,
  isTauri,
  pickFile,
  saveAs,
  serializeProject,
  write,
} from './files'
import { listenForImages } from './input'
import { Store } from './store'
import { StyleBar } from './stylebar'
import { Viewport, isTextTarget } from './viewport'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const store = new Store()
const viewport = new Viewport($<HTMLDivElement>('stage'))
const editor = new Editor(store, viewport)
const empty = $('empty')
const status = $('status')
const zoom = $('zoom')
const zoomValue = $('zoom-value')
const fileInput = $<HTMLInputElement>('file')
const toolButtons = [...$('toolbar').querySelectorAll<HTMLButtonElement>('button[data-tool]')]

viewport.onZoom = (scale) => {
  zoomValue.textContent = `${Math.round(scale * 100)}%`
  editor.zoomChanged()
}
$('fit').addEventListener('click', (e) => {
  viewport.fit()
  ;(e.currentTarget as HTMLElement).blur()
})
viewport.onPanMode = (active) => editor.setPanMode(active)

editor.onToolChange = (tool) => {
  for (const button of toolButtons) button.classList.toggle('active', button.dataset.tool === tool)
}
for (const button of toolButtons) {
  button.addEventListener('click', () => {
    editor.setTool(button.dataset.tool as Tool)
    // Keep keyboard focus off the button so Space pans instead of re-clicking it.
    button.blur()
  })
}
const SNAP_KEY = 'kreskit.snap'
const snapButton = $('snap')
function setSnapping(on: boolean): void {
  editor.snapping = on
  snapButton.classList.toggle('active', on)
  snapButton.title = `Snapping ${on ? 'on' : 'off'} (S) – hold Ctrl for the opposite`
  try {
    localStorage.setItem(SNAP_KEY, String(on))
  } catch {
    // Without storage the choice just lasts for this session.
  }
}
snapButton.addEventListener('click', () => {
  setSnapping(!editor.snapping)
  snapButton.blur()
})
let savedSnapping: string | null = null
try {
  savedSnapping = localStorage.getItem(SNAP_KEY)
} catch {
  // Falls back to the default below.
}
setSnapping(savedSnapping !== 'false')

const styleBar = new StyleBar($('stylebar'), (patch) => editor.applyStyle(patch))
editor.onStyleContext = (context) => styleBar.show(context)
editor.setTool('select')

store.subscribe(() => {
  const hasImage = store.doc.image !== null
  empty.hidden = hasImage
  zoom.hidden = !hasImage
})

let statusTimer = 0
function showStatus(message: string): void {
  status.textContent = message
  status.hidden = false
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => (status.hidden = true), 2500)
}

const load = listenForImages(
  fileInput,
  async (image) => {
    status.hidden = true
    // Never let a stray paste wipe out work: with something on the canvas, ask first.
    const choice = isEmpty()
      ? 'replace'
      : await choose('There is already work on the canvas. What should happen to the new image?', [
          { value: 'add', label: 'Add it to the canvas', primary: true },
          { value: 'replace', label: 'Replace everything' },
          { value: 'cancel', label: 'Cancel' },
        ])
    if (choice === 'add') {
      editor.addImage(image)
    } else if (choice === 'replace') {
      // Undo still brings the previous document back.
      store.commit({ image, objects: [] })
      projectPath = null
    }
  },
  async (doc) => {
    status.hidden = true
    const go =
      isEmpty() ||
      (await choose('Opening this project replaces what is on the canvas.', [
        { value: 'cancel', label: 'Cancel', primary: true },
        { value: 'replace', label: 'Replace everything' },
      ])) === 'replace'
    if (!go) return false
    store.commit(doc)
    projectPath = null
    return true
  },
  showStatus,
)

const openFile = (): Promise<void> =>
  report(async () => {
    if (!isTauri) {
      fileInput.click()
      return null
    }
    const picked = await pickFile()
    if (!picked || !(await load(picked.file))) return null
    // A project opened from disk is saved back to where it came from.
    if (picked.path.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`)) projectPath = picked.path
    return null
  })

// --- getting the result out ---

/** Where Ctrl+S writes without asking again; forgotten when a different document is loaded. */
let projectPath: string | null = null

/** Run an output action, reporting how it went in the status line. */
async function report(action: () => Promise<string | null>): Promise<void> {
  try {
    const message = await action()
    if (message) showStatus(message)
  } catch (error) {
    console.error(error)
    showStatus(`Failed: ${error instanceof Error ? error.message : error}`)
  }
}

const isEmpty = (): boolean => !store.doc.image && store.doc.objects.length === 0

const copyImage = (): Promise<void> =>
  report(async () => {
    const canvas = renderToCanvas(store.doc)
    if (!canvas) return 'Nothing to copy yet'
    await copyCanvas(canvas)
    return 'Copied to clipboard'
  })

const exportImage = (): Promise<void> =>
  report(async () => {
    if (isEmpty()) return 'Nothing to export yet'
    const path = await saveAs(
      'screenshot',
      [
        { name: 'PNG image', extensions: ['png'] },
        { name: 'JPEG image', extensions: ['jpg', 'jpeg'] },
        { name: 'SVG drawing', extensions: ['svg'] },
        { name: 'PDF document', extensions: ['pdf'] },
      ],
      (extension) => exportBytes(store.doc, (extension === 'jpeg' ? 'jpg' : extension) as ImageFormat),
    )
    return path && `Exported ${path}`
  })

const saveProject = (): Promise<void> =>
  report(async () => {
    const produce = async (): Promise<Uint8Array> => serializeProject(store.doc)
    if (projectPath) {
      await write(projectPath, await produce())
    } else {
      const types = [{ name: 'Kreskit project', extensions: [PROJECT_EXTENSION] }]
      const path = await saveAs('screenshot', types, produce)
      if (!path) return null
      // Only a real path can be written again; a browser download has to be repeated in full.
      if (path.includes('/') || path.includes('\\')) projectPath = path
    }
    return 'Project saved'
  })

for (const [id, action] of [
  ['copy', copyImage],
  ['export', exportImage],
  ['save', saveProject],
] as const) {
  const button = $(id)
  button.addEventListener('click', () => {
    void action()
    button.blur()
  })
}

window.addEventListener('keydown', (e) => {
  // While a question is on screen the keyboard belongs to it.
  if (isTextTarget(e.target) || isAsking()) return
  if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    setSnapping(!editor.snapping)
    return
  }
  if (viewportShortcut(e) || editor.handleKey(e)) e.preventDefault()
})

function viewportShortcut(e: KeyboardEvent): boolean {
  if (!(e.ctrlKey || e.metaKey)) return false
  switch (e.code) {
    case 'KeyC':
      void copyImage()
      return true
    case 'KeyE':
      void exportImage()
      return true
    case 'KeyS':
      void saveProject()
      return true
    case 'KeyO':
      void openFile()
      return true
    case 'Digit0':
      viewport.fit()
      return true
    case 'Digit1':
      viewport.actualSize()
      return true
    case 'Equal':
      viewport.zoomBy(1.25)
      return true
    case 'Minus':
      viewport.zoomBy(0.8)
      return true
  }
  return false
}

// The webview's own context menu (Reload, Inspect...) has no place in the app.
window.addEventListener('contextmenu', (e) => e.preventDefault())
