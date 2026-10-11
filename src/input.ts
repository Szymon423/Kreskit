import { PROJECT_EXTENSION, isTauri, parseProject } from './files'
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
      if (blob instanceof File && blob.name.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`)) {
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

  window.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    document.body.classList.add('drop-target')
  })
  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) document.body.classList.remove('drop-target')
  })
  window.addEventListener('drop', (e) => {
    e.preventDefault()
    document.body.classList.remove('drop-target')
    const file = imageFrom(e.dataTransfer) ?? e.dataTransfer?.files[0]
    if (file) void load(file)
    else onError('Drop an image or project file')
  })

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    // Reset so picking the same file twice still fires a change event.
    fileInput.value = ''
    if (file) void load(file)
  })

  return load
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
