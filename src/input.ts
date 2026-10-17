import { fileFromPath, isProjectFile, isTauri, parseProject } from './files'
import { DRAG_TYPE as LAYER_DRAG } from './layers'
import type { Doc } from './model'
import { isTextTarget } from './viewport'

type OnImage = (image: ImageBitmap) => void
/** Resolves to whether the project was actually opened (the user may decline). */
type OnProject = (doc: Doc) => Promise<boolean>
type OnError = (message: string) => void

/**
 * Wire up every way an image or a saved project can enter the app: paste, drop and the file
 * picker. Returns the loader itself, for files obtained some other way; it resolves to whether
 * the file could be read.
 */
export function listenForImages(
  fileInput: HTMLInputElement,
  onImage: OnImage,
  onProject: OnProject,
  onError: OnError,
): (file: Blob) => Promise<boolean> {
  const load = async (blob: Blob): Promise<boolean> => {
    try {
      if (blob instanceof File && isProjectFile(blob.name)) {
        return await onProject(await parseProject(await blob.text()))
      } else {
        onImage(await createImageBitmap(blob))
      }
      return true
    } catch {
      onError('That file is not an image or project this app can read')
      return false
    }
  }

  let pasteHandled = false

  window.addEventListener('paste', (e) => {
    if (isTextTarget(e.target)) return
    const file = imageFrom(e.clipboardData)
    if (!file) return
    e.preventDefault()
    pasteHandled = true
    void load(file)
  })

  // Some webviews fire no paste event (or one without image data) when nothing
  // editable is focused, so in the desktop app fall back to the native clipboard.
  window.addEventListener('keydown', (e) => {
    if (!isTauri || !(e.ctrlKey || e.metaKey) || e.code !== 'KeyV' || isTextTarget(e.target)) return
    pasteHandled = false
    setTimeout(async () => {
      if (pasteHandled) return
      try {
        onImage(await readNativeClipboard())
      } catch {
        onError('No image in the clipboard')
      }
    }, 60)
  })

  // In the desktop app files dropped from a file manager arrive only through Tauri: the webview
  // itself gets just their paths, which it is not allowed to read.
  if (isTauri) {
    void import('@tauri-apps/api/webview').then(({ getCurrentWebview }) =>
      getCurrentWebview().onDragDropEvent(({ payload }) => {
        document.body.classList.toggle('drop-target', payload.type === 'enter' || payload.type === 'over')
        if (payload.type !== 'drop') return
        const [path] = payload.paths
        if (!path) return
        fileFromPath(path)
          .then(load)
          .catch(() => onError('Could not read that file'))
      }),
    )
  }

  // Anything dropped on the window that is not a layer being reordered is taken over here. Left
  // alone, the webview treats a dropped image or link as a page and navigates away from the app.
  window.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || e.dataTransfer.types.includes(LAYER_DRAG)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    document.body.classList.add('drop-target')
  })
  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) document.body.classList.remove('drop-target')
  })
  window.addEventListener('drop', (e) => {
    const data = e.dataTransfer
    if (!data || data.types.includes(LAYER_DRAG)) return
    e.preventDefault()
    document.body.classList.remove('drop-target')
    const file = imageFrom(data) ?? data.files[0]
    if (file) {
      void load(file)
      return
    }
    // An image dragged out of a web page arrives as its address rather than as a file.
    const link = droppedLink(data)
    if (link?.startsWith('http')) {
      fetch(link)
        .then((response) => (response.ok ? response.blob() : Promise.reject()))
        .then(load)
        .catch(() => onError('Could not download that image; save it first and drop the file'))
    } else if (link) {
      onError('Only the file name came through; open it with Ctrl+O instead')
    } else {
      onError('Drop an image or project file')
    }
  })

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    // Reset so picking the same file twice still fires a change event.
    fileInput.value = ''
    if (file) void load(file)
  })

  return load
}

function droppedLink(data: DataTransfer): string | null {
  const list = data.getData('text/uri-list') || data.getData('text/plain')
  const first = list.split(/\r?\n/).find((line) => line && !line.startsWith('#'))
  return first?.trim() || null
}

function imageFrom(data: DataTransfer | null): File | null {
  for (const item of data?.items ?? []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile()
  }
  return null
}

async function readNativeClipboard(): Promise<ImageBitmap> {
  const { readImage } = await import('@tauri-apps/plugin-clipboard-manager')
  const image = await readImage()
  const [{ width, height }, rgba] = await Promise.all([image.size(), image.rgba()])
  return createImageBitmap(new ImageData(new Uint8ClampedArray(rgba), width, height))
}
