import { bitmapDataUrl, canvasBlob } from './export'
import type { Doc, SceneObject } from './model'

export const isTauri = '__TAURI_INTERNALS__' in window

/** The extension projects are saved with. */
export const PROJECT_EXTENSION = 'kit'
/** Projects were saved as `.shot` before the app was renamed; those still open. */
const PROJECT_EXTENSIONS = [PROJECT_EXTENSION, 'shot']

export function isProjectFile(name: string): boolean {
  const lower = name.toLowerCase()
  return PROJECT_EXTENSIONS.some((extension) => lower.endsWith(`.${extension}`))
}

export interface FileType {
  name: string
  extensions: string[]
}

/**
 * Ask where to save, then write what `produce` returns for the chosen extension. Returns the
 * saved path, or null when the user cancelled or there was nothing to save.
 */
export async function saveAs(
  suggestedName: string,
  types: FileType[],
  produce: (extension: string) => Promise<Uint8Array | null>,
): Promise<string | null> {
  const fallback = types[0].extensions[0]
  if (!isTauri) {
    // A browser cannot ask for a location or format, so it downloads the first type offered.
    const bytes = await produce(fallback)
    if (!bytes) return null
    const name = `${suggestedName}.${fallback}`
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([bytes as BlobPart]))
    link.download = name
    link.click()
    URL.revokeObjectURL(link.href)
    return name
  }

  const { save } = await import('@tauri-apps/plugin-dialog')
  let path = await save({ defaultPath: `${suggestedName}.${fallback}`, filters: types })
  if (!path) return null
  const known = types.flatMap((type) => type.extensions)
  let extension = path.split('.').pop()?.toLowerCase() ?? ''
  if (!known.includes(extension)) {
    extension = fallback
    path = `${path}.${fallback}`
  }
  return (await write(path, await produce(extension))) ? path : null
}

/** Write to a path the user already picked in a save dialog this session. */
export async function write(path: string, bytes: Uint8Array | null): Promise<boolean> {
  if (!bytes) return false
  const { writeFile } = await import('@tauri-apps/plugin-fs')
  await writeFile(path, bytes)
  return true
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']
const MEDIA_TYPES: Record<string, string> = { jpg: 'image/jpeg', svg: 'image/svg+xml' }

/**
 * Show the desktop app's own open dialog, which can list project files next to images (the
 * webview's file picker filters by media type and so hides them). Null when cancelled.
 */
export async function pickFile(): Promise<{ file: File; path: string } | null> {
  const [{ open }, { readFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ])
  const path = await open({
    multiple: false,
    filters: [
      { name: 'Images and projects', extensions: [...IMAGE_EXTENSIONS, ...PROJECT_EXTENSIONS] },
      { name: 'Kreskit project', extensions: PROJECT_EXTENSIONS },
      { name: 'Images', extensions: IMAGE_EXTENSIONS },
    ],
  })
  if (!path) return null
  const name = path.split(/[\\/]/).pop() ?? path
  // Bytes read from disk carry no media type, and the image decoder is not obliged to guess one.
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  const type = MEDIA_TYPES[extension] ?? (IMAGE_EXTENSIONS.includes(extension) ? `image/${extension}` : '')
  return { file: new File([(await readFile(path)) as BlobPart], name, { type }), path }
}

/** Put the flattened image on the system clipboard. */
export async function copyCanvas(canvas: HTMLCanvasElement): Promise<void> {
  const blob = await canvasBlob(canvas, 'image/png')
  if (isTauri) {
    // The native clipboard is the reliable route to other desktop apps, above all on Wayland.
    const [{ Image }, { writeImage }] = await Promise.all([
      import('@tauri-apps/api/image'),
      import('@tauri-apps/plugin-clipboard-manager'),
    ])
    const image = await Image.fromBytes(new Uint8Array(await blob.arrayBuffer()))
    await writeImage(image)
    return
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

// --- project files ---

interface ProjectFile {
  app: 'kreskit'
  version: 1
  /** The base image as a PNG data URL. */
  image: string | null
  /** As in the document, except that a placed picture's bitmap is stored as a PNG data URL. */
  objects: readonly unknown[]
}

const decode = async (dataUrl: string): Promise<ImageBitmap> =>
  createImageBitmap(await (await fetch(dataUrl)).blob())

export function serializeProject(doc: Doc): Uint8Array {
  const project: ProjectFile = {
    app: 'kreskit',
    version: 1,
    image: doc.image ? bitmapDataUrl(doc.image) : null,
    objects: doc.objects.map((obj) =>
      obj.type === 'image' ? { ...obj, bitmap: bitmapDataUrl(obj.bitmap) } : obj,
    ),
  }
  return new TextEncoder().encode(JSON.stringify(project))
}

export async function parseProject(text: string): Promise<Doc> {
  const project = JSON.parse(text) as Partial<ProjectFile>
  // 'shotmark' was the app's working name; projects saved under it are still valid.
  const app: string | undefined = project.app
  if ((app !== 'kreskit' && app !== 'shotmark') || !Array.isArray(project.objects)) {
    throw new Error('Not a Kreskit project')
  }
  const image = project.image ? await decode(project.image) : null
  const objects = await Promise.all(
    (project.objects as SceneObject[]).map(async (obj) =>
      obj.type === 'image' ? { ...obj, bitmap: await decode(obj.bitmap as unknown as string) } : obj,
    ),
  )
  return { image, objects }
}
