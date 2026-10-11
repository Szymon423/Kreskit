import { EMPTY_DOC, type Doc, type SceneObject } from './model'

const HISTORY_LIMIT = 200
/** Edits sharing a merge key within this many milliseconds become one undo step. */
const MERGE_WINDOW = 800

/** Holds the document and its undo history. Docs are immutable, so history is just a stack of them. */
export class Store {
  private current: Doc = EMPTY_DOC
  private undoStack: Doc[] = []
  private redoStack: Doc[] = []
  private listeners = new Set<() => void>()
  private lastMerge = { key: '', time: 0 }

  get doc(): Doc {
    return this.current
  }

  subscribe(listener: () => void): void {
    this.listeners.add(listener)
  }

  /** A merge key folds rapid repeats of the same edit (a slider drag, held arrow key) into one undo step. */
  commit(doc: Doc, mergeKey = ''): void {
    if (doc === this.current) return
    const now = Date.now()
    const merges =
      mergeKey !== '' && mergeKey === this.lastMerge.key && now - this.lastMerge.time < MERGE_WINDOW
    if (!merges) {
      this.undoStack.push(this.current)
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    }
    this.lastMerge = { key: mergeKey, time: now }
    this.redoStack = []
    this.set(doc)
  }

  /** Commit a change to the object list only. */
  update(
    change: (objects: readonly SceneObject[]) => readonly SceneObject[],
    mergeKey = '',
  ): void {
    const objects = change(this.current.objects)
    if (objects !== this.current.objects) this.commit({ ...this.current, objects }, mergeKey)
  }

  undo(): void {
    const doc = this.undoStack.pop()
    if (!doc) return
    this.redoStack.push(this.current)
    this.lastMerge.key = ''
    this.set(doc)
  }

  redo(): void {
    const doc = this.redoStack.pop()
    if (!doc) return
    this.undoStack.push(this.current)
    this.lastMerge.key = ''
    this.set(doc)
  }

  private set(doc: Doc): void {
    this.current = doc
    for (const listener of this.listeners) listener()
  }
}
