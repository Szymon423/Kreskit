import Konva from 'konva'
import { dimensionGeometry } from './dimension'
import {
  isDimension,
  isDimensionType,
  newId,
  translate,
  type DimensionObject,
  type ImageObject,
  type LineObject,
  type ObjectType,
  type SceneObject,
  type Style,
  type TextObject,
} from './model'
import { applyAttrs, createNode, type ObjectNode } from './nodes'
import type { Store } from './store'
import type { StyleContext } from './stylebar'
import { loadStyles, saveStyles } from './styles'
import { openTextEditor } from './textedit'
import type { Viewport } from './viewport'

/** Every object type has a drawing tool except placed images, which arrive by pasting. */
export type Tool = 'select' | Exclude<ObjectType, 'image'>

type Point = { x: number; y: number }
/** Objects defined by two points, edited with endpoint handles rather than a bounding box. */
type Segment = LineObject | DimensionObject

type Gesture =
  | { kind: 'draw'; start: Point; obj: SceneObject; node: ObjectNode }
  | { kind: 'marquee'; start: Point; additive: boolean }

const ACCENT = '#2f6fed'
const DUPLICATE_OFFSET = 16
/** Drags shorter than this many screen pixels count as a click, not a shape. */
const MIN_DRAW = 4
/** How close, in screen pixels, something must come to a snap target to jump onto it. */
const SNAP_DISTANCE = 7
const GUIDE_COLOR = '#ff3ea5'
/** Long enough to cross any view of the document. */
const GUIDE_REACH = 1e5
const NOTHING: ReadonlySet<string> = new Set()
/** How far, in screen pixels, a new dimension line sits from the points it measures. */
const DIMENSION_OFFSET = 32
/** How far, in screen pixels, a freehand stroke may be moved to smooth it. */
const SMOOTHING = 1.5

const HANDLE_ATTRS = {
  visible: false,
  draggable: true,
  fill: '#fff',
  stroke: ACCENT,
  strokeScaleEnabled: false,
  strokeWidth: 1.5,
}
/** What a new dimension's value starts as, ready for the number to be typed after it. */
const DIMENSION_PREFIX: Record<DimensionObject['type'], string> = {
  dimension: '',
  radius: 'R',
  diameter: 'Ø',
}

const CORNER_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const ALL_ANCHORS = [...CORNER_ANCHORS, 'top-center', 'bottom-center', 'middle-left', 'middle-right']

/** Renders the document with Konva and turns pointer and key input into document edits. */
export class Editor {
  onToolChange: (tool: Tool) => void = () => {}
  /** Whether things snap to each other; holding Ctrl gives the opposite for as long as it is held. */
  snapping = true
  /** Fired with the style the style bar should show, or null when it has nothing to edit. */
  onStyleContext: (context: StyleContext | null) => void = () => {}

  private store: Store
  private viewport: Viewport
  private stage: Konva.Stage
  private objectLayer = new Konva.Layer()
  private overlayLayer = new Konva.Layer()
  private transformer = new Konva.Transformer({
    flipEnabled: false,
    rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
    borderStroke: ACCENT,
    anchorStroke: ACCENT,
    anchorSize: 9,
    ignoreStroke: true,
  })
  private marquee = new Konva.Rect({
    visible: false,
    listening: false,
    stroke: ACCENT,
    fill: 'rgba(47, 111, 237, 0.12)',
    strokeScaleEnabled: false,
    strokeWidth: 1,
  })
  /** Lines showing what the thing being moved has snapped to: [vertical, horizontal]. */
  private guides: [Konva.Line, Konva.Line]
  /** Endpoint handles shown when exactly one line, arrow or dimension is selected. */
  private endpoints: [Konva.Circle, Konva.Circle]
  /** Slides a dimension line towards or away from the points it measures. */
  private offsetHandle: Konva.Circle

  private nodes = new Map<string, ObjectNode>()
  private selection = new Set<string>()
  private tool: Tool = 'select'
  private gesture: Gesture | null = null
  private readPending = false
  private styles = loadStyles()
  /** The text or dimension value being typed, with the style it will be saved with. */
  private editing: {
    type: TextObject['type'] | DimensionObject['type']
    style(): Style
    restyle(patch: Partial<Style>): void
    finish(): void
  } | null = null

  constructor(store: Store, viewport: Viewport) {
    this.store = store
    this.viewport = viewport
    this.stage = viewport.stage
    this.endpoints = [this.makeEndpoint(0), this.makeEndpoint(1)]
    this.offsetHandle = this.makeOffsetHandle()
    const guide = (): Konva.Line =>
      new Konva.Line({
        visible: false,
        listening: false,
        stroke: GUIDE_COLOR,
        strokeWidth: 1,
        strokeScaleEnabled: false,
      })
    this.guides = [guide(), guide()]
    this.overlayLayer.add(
      ...this.guides,
      this.transformer,
      this.marquee,
      ...this.endpoints,
      this.offsetHandle,
    )
    this.stage.add(this.objectLayer, this.overlayLayer)

    this.stage.on('pointerdown', (e) => this.onPointerDown(e))
    this.stage.on('pointermove', (e) => this.onPointerMove(e.evt))
    this.stage.on('dblclick', (e) => {
      const obj = this.objectAt(e.target)
      if (this.tool !== 'select' || !obj) return
      if (obj.type === 'text' || isDimension(obj)) this.editText(obj, false)
    })
    window.addEventListener('pointerup', () => this.onPointerUp())

    // Konva moves and scales the nodes itself; when it is done, read the result back into the document.
    this.objectLayer.on('dragmove', (e) => {
      this.snapDragged(e.evt)
      this.placeEndpoints()
    })
    this.objectLayer.on('dragend', () => {
      this.hideGuides()
      this.readNodesSoon()
    })
    this.transformer.on('transform', () => this.bakeScale())
    this.transformer.on('transformend', () => {
      this.hideGuides()
      this.readNodesSoon()
    })
    // Resizing snaps too: the handle being dragged is pulled onto nearby targets.
    this.transformer.anchorDragBoundFunc((_previous, next, evt) => {
      const anchor = this.transformer.getActiveAnchor() ?? ''
      const scale = this.viewport.scale
      // A side handle only moves one edge, so only that axis is worth snapping.
      const xs = /left|right/.test(anchor) ? [(next.x - this.stage.x()) / scale] : []
      const ys = /top|bottom/.test(anchor) ? [(next.y - this.stage.y()) / scale] : []
      const shift = this.snapShift(xs, ys, this.selection, evt)
      return { x: next.x + shift.x * scale, y: next.y + shift.y * scale }
    })

    store.subscribe(() => this.render())
  }

  setTool(tool: Tool): void {
    this.editing?.finish()
    this.tool = tool
    if (tool !== 'select') this.selection.clear()
    this.stage.container().style.cursor = tool === 'select' ? '' : 'crosshair'
    this.syncSelection()
    this.onToolChange(tool)
  }

  /** While space-panning, shapes must not react to the drag. */
  setPanMode(active: boolean): void {
    this.objectLayer.listening(!active)
    this.overlayLayer.listening(!active)
  }

  /** Overlay handles are sized in screen pixels, so they need redoing after a zoom. */
  zoomChanged(): void {
    // The text editor is positioned for one zoom level; close it rather than let it drift.
    this.editing?.finish()
    this.placeEndpoints()
  }

  /** Restyle the selection, or the active tool when nothing is selected. Either way the tool remembers it. */
  applyStyle(patch: Partial<Style>): void {
    if (this.editing) {
      // The text being typed is what the style bar is showing, so that is what changes.
      const { type } = this.editing
      this.styles[type] = { ...this.styles[type], ...patch }
      saveStyles(this.styles)
      this.editing.restyle(patch)
      this.emitStyleContext()
      return
    }
    const selected = this.store.doc.objects.filter((o) => this.selection.has(o.id))
    const types = selected.length > 0 ? selected.map((o) => o.type) : [this.tool]
    for (const type of types) {
      if (type !== 'select') this.styles[type] = { ...this.styles[type], ...patch }
    }
    saveStyles(this.styles)
    if (selected.length > 0) {
      this.store.update(
        (objects) =>
          objects.map((o) =>
            this.selection.has(o.id) ? { ...o, style: { ...o.style, ...patch } } : o,
          ),
        `style:${Object.keys(patch)}`,
      )
    } else {
      this.emitStyleContext()
    }
  }

  /** Place a picture on top of the document, centred in the current view, and select it. */
  addImage(bitmap: ImageBitmap): void {
    const scale = this.viewport.scale
    const { width, height } = bitmap
    const picture: ImageObject = {
      id: newId(),
      type: 'image',
      style: this.styles.image,
      bitmap,
      x: Math.round((this.stage.width() / 2 - this.stage.x()) / scale - width / 2),
      y: Math.round((this.stage.height() / 2 - this.stage.y()) / scale - height / 2),
      width,
      height,
      rotation: 0,
    }
    this.store.update((objects) => [...objects, picture])
    this.setTool('select')
    this.select([picture.id])
  }

  /** Returns true when the key was used. */
  handleKey(e: KeyboardEvent): boolean {
    const mod = e.ctrlKey || e.metaKey
    if (mod) {
      switch (e.code) {
        case 'KeyZ':
          if (e.shiftKey) this.store.redo()
          else this.store.undo()
          return true
        case 'KeyY':
          this.store.redo()
          return true
        case 'KeyA':
          this.setTool('select')
          this.select(this.store.doc.objects.map((o) => o.id))
          return true
        case 'KeyD':
          this.duplicate()
          return true
        case 'BracketRight':
          this.reorder(true, e.shiftKey)
          return true
        case 'BracketLeft':
          this.reorder(false, e.shiftKey)
          return true
      }
      return false
    }

    if (e.shiftKey && (e.code === 'KeyR' || e.code === 'KeyD')) {
      this.setTool(e.code === 'KeyR' ? 'radius' : 'diameter')
      return true
    }
    const step = e.shiftKey ? 10 : 1
    switch (e.code) {
      case 'KeyD':
        this.setTool('dimension')
        return true
      case 'KeyV':
        this.setTool('select')
        return true
      case 'KeyR':
        this.setTool('rect')
        return true
      case 'KeyO':
        this.setTool('ellipse')
        return true
      case 'KeyL':
        this.setTool('line')
        return true
      case 'KeyA':
        this.setTool('arrow')
        return true
      case 'KeyP':
        this.setTool('pen')
        return true
      case 'KeyH':
        this.setTool('highlighter')
        return true
      case 'KeyT':
        this.setTool('text')
        return true
      case 'Escape':
        if (this.tool === 'select') this.select([])
        else this.setTool('select')
        return true
      case 'Delete':
      case 'Backspace':
        this.store.update((objects) => {
          const kept = objects.filter((o) => !this.selection.has(o.id))
          return kept.length === objects.length ? objects : kept
        })
        return true
      case 'ArrowLeft':
        return this.nudge(-step, 0)
      case 'ArrowRight':
        return this.nudge(step, 0)
      case 'ArrowUp':
        return this.nudge(0, -step)
      case 'ArrowDown':
        return this.nudge(0, step)
    }
    return false
  }

  // --- document edits ---

  private nudge(dx: number, dy: number): boolean {
    if (this.selection.size === 0) return false
    this.store.update(
      (objects) => objects.map((o) => (this.selection.has(o.id) ? translate(o, dx, dy) : o)),
      'nudge',
    )
    return true
  }

  private duplicate(): void {
    const copies = this.store.doc.objects
      .filter((o) => this.selection.has(o.id))
      .map((o) => ({ ...translate(o, DUPLICATE_OFFSET, DUPLICATE_OFFSET), id: newId() }))
    if (copies.length === 0) return
    this.store.update((objects) => [...objects, ...copies])
    this.select(copies.map((o) => o.id))
  }

  /** Move the selection one step (or all the way) towards the front or the back. */
  private reorder(forward: boolean, allTheWay: boolean): void {
    this.store.update((objects) => {
      const picked = (o: SceneObject) => this.selection.has(o.id)
      if (!objects.some(picked)) return objects
      if (allTheWay) {
        const rest = objects.filter((o) => !picked(o))
        const moved = objects.filter(picked)
        return forward ? [...rest, ...moved] : [...moved, ...rest]
      }
      // Walk from the destination end so neighbouring selected objects keep their order.
      const next = forward ? [...objects].reverse() : [...objects]
      for (let i = 1; i < next.length; i++) {
        if (picked(next[i]) && !picked(next[i - 1])) {
          ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
        }
      }
      return forward ? next.reverse() : next
    })
  }

  // --- rendering ---

  private render(): void {
    const { image, objects } = this.store.doc
    this.viewport.setImage(image)

    const live = new Set(objects.map((o) => o.id))
    for (const [id, node] of this.nodes) {
      if (live.has(id)) continue
      node.destroy()
      this.nodes.delete(id)
      this.selection.delete(id)
    }
    objects.forEach((obj, index) => {
      let node = this.nodes.get(obj.id)
      if (!node) {
        node = createNode(obj)
        node.id(obj.id)
        this.nodes.set(obj.id, node)
        this.objectLayer.add(node)
      }
      applyAttrs(node, obj)
      node.zIndex(index)
    })
    this.syncSelection()
  }

  private select(ids: Iterable<string>): void {
    this.selection = new Set(ids)
    this.syncSelection()
  }

  private selectedSegment(): Segment | null {
    if (this.selection.size !== 1) return null
    const [id] = this.selection
    const obj = this.store.doc.objects.find((o) => o.id === id)
    if (!obj) return null
    return obj.type === 'line' || obj.type === 'arrow' || isDimension(obj) ? obj : null
  }

  private syncSelection(): void {
    const selecting = this.tool === 'select'
    for (const node of this.nodes.values()) node.draggable(selecting)

    // A lone line or dimension gets endpoint handles instead of a bounding box.
    const line = this.selectedSegment()
    const boxed = line ? [] : [...this.selection].map((id) => this.nodes.get(id)!)
    // Text resizes by font size, so it only gets corner handles that keep its proportions.
    const textOnly = boxed.length > 0 && boxed.every((node) => node instanceof Konva.Text)
    // Pictures keep their proportions from the corners too; the side handles still stretch them.
    const pictures = boxed.length > 0 && boxed.every((node) => node instanceof Konva.Image)
    this.transformer.keepRatio(textOnly || pictures)
    this.transformer.enabledAnchors(textOnly ? CORNER_ANCHORS : ALL_ANCHORS)
    this.transformer.nodes(boxed)
    for (const handle of this.endpoints) handle.visible(line !== null)
    this.offsetHandle.visible(line?.type === 'dimension')
    this.placeEndpoints()
    this.emitStyleContext()
  }

  private emitStyleContext(): void {
    if (this.editing) {
      this.onStyleContext({ style: this.editing.style(), types: new Set([this.editing.type]) })
      return
    }
    const selected = this.store.doc.objects.filter((o) => this.selection.has(o.id))
    if (selected.length > 0) {
      this.onStyleContext({ style: selected[0].style, types: new Set(selected.map((o) => o.type)) })
    } else if (this.tool !== 'select') {
      this.onStyleContext({ style: this.styles[this.tool], types: new Set([this.tool]) })
    } else {
      this.onStyleContext(null)
    }
  }

  /** The object a clicked node belongs to; dimensions are groups, so the hit may be on a child. */
  private objectAt(target: Konva.Node): SceneObject | undefined {
    let node: Konva.Node | null = target
    while (node && node.getParent() !== this.objectLayer) node = node.getParent()
    const id = node?.id()
    return id ? this.store.doc.objects.find((o) => o.id === id) : undefined
  }

  // --- text editing ---

  /** Edit a text object in place, or a dimension's value in a box over its line. */
  private editText(obj: TextObject | DimensionObject, isNew: boolean): void {
    const node = this.nodes.get(obj.id)
    const inPlace = obj.type === 'text'
    // Editing started from a drawing tool goes back to that tool, ready for the next one.
    const fromSelect = this.tool === 'select'
    if (inPlace) node?.hide()
    this.select([])
    const scale = this.viewport.scale
    const frame = this.stage.container().getBoundingClientRect()
    const anchor = obj.type === 'text' ? obj : dimensionGeometry(obj).mid
    // Style changes made while typing collect here and are saved together with the text.
    let edited = obj
    const editor = openTextEditor({
      text: obj.text,
      style: obj.style,
      scale,
      origin: {
        x: frame.left + this.stage.x() + anchor.x * scale,
        y: frame.top + this.stage.y() + anchor.y * scale,
      },
      transform: obj.type === 'text' ? `rotate(${obj.rotation}deg)` : 'translate(-50%, -100%)',
      singleLine: !inPlace,
      onDone: (value) => {
        // A dimension may be left without a value; a text object with no text is nothing at all.
        const text = inPlace ? value : value.trim()
        this.editing = null
        node?.show()
        if (inPlace && text.trim() === '') {
          // Emptying a text removes it; an empty new text was never added.
          this.store.update((objects) => (isNew ? objects : objects.filter((o) => o.id !== obj.id)))
          this.emitStyleContext()
          return
        }
        const saved = { ...edited, text }
        if (isNew) {
          this.store.update((objects) => [...objects, saved])
        } else if (text !== obj.text || edited !== obj) {
          this.store.update((objects) => objects.map((o) => (o.id === obj.id ? saved : o)))
        }
        if (fromSelect) this.select([obj.id])
        else this.emitStyleContext()
      },
    })
    this.editing = {
      type: obj.type,
      style: () => edited.style,
      finish: editor.finish,
      restyle: (patch) => {
        edited = { ...edited, style: { ...edited.style, ...patch } }
        editor.restyle(edited.style)
        // A dimension stays visible under its value box, so show the change on it straight away.
        if (node && !inPlace) applyAttrs(node, edited)
      },
    }
    this.emitStyleContext()
  }

  private makeEndpoint(index: 0 | 1): Konva.Circle {
    const handle = new Konva.Circle(HANDLE_ATTRS)
    const pointsWhileDragging = (evt: MouseEvent): Segment['points'] | null => {
      const line = this.selectedSegment()
      if (!line) return null
      const fixed = { x: line.points[index ? 0 : 2], y: line.points[index ? 1 : 3] }
      const moved = evt.shiftKey
        ? snapAngle(fixed, handle.position())
        : this.snapPoint(handle.position(), new Set([line.id]), evt)
      handle.position(moved)
      return index ? [fixed.x, fixed.y, moved.x, moved.y] : [moved.x, moved.y, fixed.x, fixed.y]
    }
    handle.on('dragmove', (e) => {
      const line = this.selectedSegment()
      const points = pointsWhileDragging(e.evt)
      if (!line || !points) return
      const moved = { ...line, points }
      applyAttrs(this.nodes.get(line.id)!, moved)
      if (moved.type === 'dimension') this.offsetHandle.position(dimensionGeometry(moved).mid)
    })
    handle.on('dragend', (e) => {
      const line = this.selectedSegment()
      const points = pointsWhileDragging(e.evt)
      this.hideGuides()
      if (!line || !points) return
      this.store.update((objects) => objects.map((o) => (o.id === line.id ? { ...line, points } : o)))
    })
    return handle
  }

  private makeOffsetHandle(): Konva.Circle {
    const handle = new Konva.Circle(HANDLE_ATTRS)
    const whileDragging = (): DimensionObject | null => {
      const dim = this.selectedSegment()
      if (dim?.type !== 'dimension') return null
      const { normal } = dimensionGeometry(dim)
      const pulled = handle.position()
      const offset = (pulled.x - dim.points[0]) * normal.x + (pulled.y - dim.points[1]) * normal.y
      const moved = { ...dim, offset }
      // The handle can only slide along the normal, so put it back on the line it controls.
      handle.position(dimensionGeometry(moved).mid)
      return moved
    }
    handle.on('dragmove', () => {
      const moved = whileDragging()
      if (moved) applyAttrs(this.nodes.get(moved.id)!, moved)
    })
    handle.on('dragend', () => {
      const moved = whileDragging()
      if (moved) this.store.update((objects) => objects.map((o) => (o.id === moved.id ? moved : o)))
    })
    return handle
  }

  private placeEndpoints(): void {
    const line = this.selectedSegment()
    const node = line && this.nodes.get(line.id)
    if (!node) return
    // Go through the node so the handles follow the line while it is being dragged.
    const transform = node.getTransform()
    const [x1, y1, x2, y2] = line.points
    this.endpoints[0].position(transform.point({ x: x1, y: y1 }))
    this.endpoints[1].position(transform.point({ x: x2, y: y2 }))
    if (line.type === 'dimension') {
      this.offsetHandle.position(transform.point(dimensionGeometry(line).mid))
    }
    this.offsetHandle.radius(6 / this.viewport.scale)
    for (const handle of this.endpoints) handle.radius(6 / this.viewport.scale)
  }

  // --- snapping ---

  /** Every x and y worth aligning to: the image's edges and centre, and the same for each other object. */
  private snapTargets(exclude: ReadonlySet<string>): { xs: number[]; ys: number[] } {
    const xs: number[] = []
    const ys: number[] = []
    const { image, objects } = this.store.doc
    if (image) {
      xs.push(0, image.width / 2, image.width)
      ys.push(0, image.height / 2, image.height)
    }
    for (const obj of objects) {
      if (exclude.has(obj.id)) continue
      if (obj.type === 'line' || obj.type === 'arrow' || isDimension(obj)) {
        xs.push(obj.points[0], obj.points[2])
        ys.push(obj.points[1], obj.points[3])
      } else if (obj.type !== 'pen' && obj.type !== 'highlighter') {
        // Freehand strokes are left out: their bounding box is not something you would aim for.
        const box = this.nodes
          .get(obj.id)!
          .getClientRect({ relativeTo: this.objectLayer, skipStroke: true })
        xs.push(box.x, box.x + box.width / 2, box.x + box.width)
        ys.push(box.y, box.y + box.height / 2, box.y + box.height)
      }
    }
    return { xs, ys }
  }

  /**
   * How far to shift something so that one of its x positions and one of its y positions land on
   * a snap target. Shows a guide for each axis that snapped.
   */
  private snapShift(xs: number[], ys: number[], exclude: ReadonlySet<string>, evt: MouseEvent): Point {
    this.hideGuides()
    if (this.snapping === (evt.ctrlKey || evt.metaKey)) return { x: 0, y: 0 }
    const targets = this.snapTargets(exclude)
    const reach = SNAP_DISTANCE / this.viewport.scale
    const nearest = (own: number[], others: number[]): { shift: number; at: number } | null => {
      let best: { shift: number; at: number } | null = null
      for (const value of own) {
        for (const at of others) {
          const shift = at - value
          if (Math.abs(shift) <= reach && (!best || Math.abs(shift) < Math.abs(best.shift))) {
            best = { shift, at }
          }
        }
      }
      return best
    }
    const x = nearest(xs, targets.xs)
    const y = nearest(ys, targets.ys)
    if (x) this.guides[0].setAttrs({ visible: true, points: [x.at, -GUIDE_REACH, x.at, GUIDE_REACH] })
    if (y) this.guides[1].setAttrs({ visible: true, points: [-GUIDE_REACH, y.at, GUIDE_REACH, y.at] })
    return { x: x?.shift ?? 0, y: y?.shift ?? 0 }
  }

  private snapPoint(point: Point, exclude: ReadonlySet<string>, evt: MouseEvent): Point {
    const shift = this.snapShift([point.x], [point.y], exclude, evt)
    return { x: point.x + shift.x, y: point.y + shift.y }
  }

  /** Snap the object being dragged. Only for a single object: Konva moves a multi-selection itself. */
  private snapDragged(evt: MouseEvent): void {
    if (this.selection.size !== 1) return
    const [id] = this.selection
    const obj = this.store.doc.objects.find((o) => o.id === id)
    const node = this.nodes.get(id)
    if (!obj || !node) return

    let xs: number[]
    let ys: number[]
    if (obj.type === 'line' || obj.type === 'arrow' || isDimension(obj)) {
      // Two-point objects align by the points themselves, not by the box around their drawing.
      const transform = node.getTransform()
      const a = transform.point({ x: obj.points[0], y: obj.points[1] })
      const b = transform.point({ x: obj.points[2], y: obj.points[3] })
      xs = [a.x, b.x]
      ys = [a.y, b.y]
    } else {
      const box = node.getClientRect({ relativeTo: this.objectLayer, skipStroke: true })
      xs = [box.x, box.x + box.width / 2, box.x + box.width]
      ys = [box.y, box.y + box.height / 2, box.y + box.height]
    }
    const shift = this.snapShift(xs, ys, this.selection, evt)
    node.position({ x: node.x() + shift.x, y: node.y() + shift.y })
  }

  private hideGuides(): void {
    for (const guide of this.guides) guide.visible(false)
  }

  // --- reading Konva's drags and transforms back into the document ---

  /** Fold the transformer's scale into width/height as it happens, so strokes keep their width. */
  private bakeScale(): void {
    for (const node of this.transformer.nodes()) {
      if (node instanceof Konva.Rect || node instanceof Konva.Image) {
        const box: Konva.Shape = node
        box.setAttrs({
          width: node.width() * node.scaleX(),
          height: node.height() * node.scaleY(),
          scaleX: 1,
          scaleY: 1,
        })
      } else if (node instanceof Konva.Ellipse) {
        node.setAttrs({
          radiusX: node.radiusX() * node.scaleX(),
          radiusY: node.radiusY() * node.scaleY(),
          scaleX: 1,
          scaleY: 1,
        })
      } else if (node instanceof Konva.Text) {
        node.setAttrs({ fontSize: node.fontSize() * node.scaleY(), scaleX: 1, scaleY: 1 })
      }
    }
  }

  /** Several nodes end a drag in the same tick; read them all back as one undo step. */
  private readNodesSoon(): void {
    if (this.readPending) return
    this.readPending = true
    queueMicrotask(() => {
      this.readPending = false
      this.store.update((objects) =>
        objects.map((o) => (this.selection.has(o.id) ? readNode(o, this.nodes.get(o.id)!) : o)),
      )
    })
  }

  // --- pointer gestures ---

  private onPointerDown(e: Konva.KonvaEventObject<PointerEvent>): void {
    if (e.evt.button !== 0 || this.viewport.panning) return
    if (this.editing) {
      // Clicking away from the text being edited only finishes the edit.
      this.editing.finish()
      return
    }
    let start = this.stage.getRelativePointerPosition()
    if (!start) return

    if (this.tool === 'text') {
      const hit = this.objectAt(e.target)
      if (hit?.type === 'text') {
        this.editText(hit, false)
      } else {
        const style = this.styles.text
        this.editText({ id: newId(), type: 'text', style, ...start, rotation: 0, text: '' }, true)
      }
      return
    }

    if (this.tool !== 'select') {
      if (this.tool !== 'pen' && this.tool !== 'highlighter') {
        start = this.snapPoint(start, NOTHING, e.evt)
      }
      const id = newId()
      const style = this.styles[this.tool]
      const obj: SceneObject = isDimensionType(this.tool)
        ? {
            id,
            type: this.tool,
            style,
            points: [start.x, start.y, start.x, start.y],
            offset: -DIMENSION_OFFSET / this.viewport.scale,
            axis: 'aligned',
            text: DIMENSION_PREFIX[this.tool],
          }
        : shapeFromDrag(this.tool, id, style, start, start, false)
      const node = createNode(obj)
      applyAttrs(node, obj)
      node.listening(false)
      this.overlayLayer.add(node)
      this.gesture = { kind: 'draw', start, obj, node }
      return
    }

    const id = this.objectAt(e.target)?.id
    if (id) {
      if (e.evt.shiftKey) {
        const next = new Set(this.selection)
        if (!next.delete(id)) next.add(id)
        this.select(next)
      } else if (!this.selection.has(id)) {
        this.select([id])
      }
    } else if (e.target === this.stage) {
      if (!e.evt.shiftKey) this.select([])
      this.gesture = { kind: 'marquee', start, additive: e.evt.shiftKey }
    }
  }

  private onPointerMove(evt: PointerEvent): void {
    const gesture = this.gesture
    const pointer = this.stage.getRelativePointerPosition()
    if (!gesture || !pointer) return
    const shift = evt.shiftKey
    let pos = pointer

    if (gesture.kind === 'draw') {
      const { obj } = gesture
      const freehand = obj.type === 'pen' || obj.type === 'highlighter'
      // Shift already constrains the shape (except for a dimension, where it only locks the axis).
      if (!freehand && (!shift || obj.type === 'dimension')) {
        pos = this.snapPoint(pointer, NOTHING, evt)
      }
      if (obj.type === 'pen' || obj.type === 'highlighter') {
        // Skip points closer than ~2 screen pixels: they add weight to the stroke, not detail.
        const [lastX, lastY] = obj.points.slice(-2)
        if (Math.hypot(pos.x - lastX, pos.y - lastY) * this.viewport.scale < 2) return
        gesture.obj = { ...obj, points: [...obj.points, pos.x, pos.y] }
      } else if (isDimension(obj)) {
        const { start } = gesture
        // Shift locks a linear dimension to whichever axis the drag mostly follows.
        const locked = shift && obj.type === 'dimension'
        const wide = Math.abs(pos.x - start.x) >= Math.abs(pos.y - start.y)
        const tip = shift && !locked ? snapAngle(start, pos) : pos
        gesture.obj = {
          ...obj,
          points: [start.x, start.y, tip.x, tip.y],
          axis: locked ? (wide ? 'horizontal' : 'vertical') : 'aligned',
        }
      } else if (obj.type !== 'text' && obj.type !== 'image') {
        gesture.obj = shapeFromDrag(obj.type, obj.id, obj.style, gesture.start, pos, shift)
      }
      applyAttrs(gesture.node, gesture.obj)
    } else {
      this.marquee.setAttrs({
        visible: true,
        x: Math.min(gesture.start.x, pos.x),
        y: Math.min(gesture.start.y, pos.y),
        width: Math.abs(pos.x - gesture.start.x),
        height: Math.abs(pos.y - gesture.start.y),
      })
    }
  }

  private onPointerUp(): void {
    const gesture = this.gesture
    if (!gesture) return
    this.gesture = null
    this.hideGuides()

    if (gesture.kind === 'draw') {
      const drawn = gesture.node.getClientRect({ skipStroke: true })
      gesture.node.destroy()
      // getClientRect is in screen pixels, which is the right unit for telling a click from a drag.
      if (Math.max(drawn.width, drawn.height) < MIN_DRAW) return
      let { obj } = gesture
      if (obj.type === 'pen' || obj.type === 'highlighter') {
        // Dropping the hand's jitter leaves few enough points for the curve through them to be smooth.
        obj = { ...obj, points: simplify(obj.points, SMOOTHING / this.viewport.scale) }
      }
      // The tool stays active, so the next shape can be drawn straight away.
      const added = obj
      this.store.update((objects) => [...objects, added])
      // A dimension is not much use without its value, so ask for it straight away.
      if (isDimension(added)) this.editText(added, false)
      return
    }

    if (this.marquee.visible()) {
      const box = this.marquee.getClientRect()
      const hit = [...this.nodes]
        .filter(([, node]) => Konva.Util.haveIntersection(box, node.getClientRect()))
        .map(([id]) => id)
      this.select(gesture.additive ? [...this.selection, ...hit] : hit)
      this.marquee.visible(false)
    }
  }
}

/** The object as Konva left it after a drag or transform. */
function readNode(obj: SceneObject, node: ObjectNode): SceneObject {
  switch (obj.type) {
    case 'rect':
    case 'image':
      return {
        ...obj,
        x: node.x(),
        y: node.y(),
        width: node.width() * node.scaleX(),
        height: node.height() * node.scaleY(),
        rotation: node.rotation(),
      }
    case 'dimension':
    case 'radius':
    case 'diameter': {
      const transform = node.getTransform()
      const a = transform.point({ x: obj.points[0], y: obj.points[1] })
      const b = transform.point({ x: obj.points[2], y: obj.points[3] })
      const scale = (Math.abs(node.scaleX()) + Math.abs(node.scaleY())) / 2
      return {
        ...obj,
        points: [a.x, a.y, b.x, b.y],
        offset: obj.offset * scale,
        // A rotated dimension can no longer be horizontal or vertical.
        axis: node.rotation() === 0 ? obj.axis : 'aligned',
      }
    }
    case 'ellipse': {
      const ellipse = node as Konva.Ellipse
      return {
        ...obj,
        x: node.x(),
        y: node.y(),
        radiusX: ellipse.radiusX() * node.scaleX(),
        radiusY: ellipse.radiusY() * node.scaleY(),
        rotation: node.rotation(),
      }
    }
    case 'line':
    case 'arrow': {
      // Lines have no position of their own: fold whatever Konva applied into the endpoints.
      const transform = node.getTransform()
      const a = transform.point({ x: obj.points[0], y: obj.points[1] })
      const b = transform.point({ x: obj.points[2], y: obj.points[3] })
      return { ...obj, points: [a.x, a.y, b.x, b.y] }
    }
    case 'pen':
    case 'highlighter': {
      const transform = node.getTransform()
      const points: number[] = []
      for (let i = 0; i < obj.points.length; i += 2) {
        const p = transform.point({ x: obj.points[i], y: obj.points[i + 1] })
        points.push(p.x, p.y)
      }
      return { ...obj, points }
    }
    case 'text': {
      const fontSize = (node as Konva.Text).fontSize() * node.scaleY()
      return {
        ...obj,
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        style: { ...obj.style, fontSize },
      }
    }
  }
}

/** The shape produced by dragging from `start` to `end`; Shift constrains it. */
function shapeFromDrag(
  type: Exclude<ObjectType, 'text' | 'image' | DimensionObject['type']>,
  id: string,
  style: Style,
  start: Point,
  end: Point,
  constrain: boolean,
): SceneObject {
  if (type === 'pen' || type === 'highlighter') {
    return { id, type, style, points: [start.x, start.y] }
  }
  if (type === 'line' || type === 'arrow') {
    const tip = constrain ? snapAngle(start, end) : end
    return { id, type, style, points: [start.x, start.y, tip.x, tip.y] }
  }

  let dx = end.x - start.x
  let dy = end.y - start.y
  if (constrain) {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    dx = side * (dx < 0 ? -1 : 1)
    dy = side * (dy < 0 ? -1 : 1)
  }
  const x = Math.min(start.x, start.x + dx)
  const y = Math.min(start.y, start.y + dy)
  const width = Math.abs(dx)
  const height = Math.abs(dy)
  if (type === 'rect') return { id, type, style, x, y, width, height, rotation: 0 }
  return {
    id,
    type,
    style,
    x: x + width / 2,
    y: y + height / 2,
    radiusX: width / 2,
    radiusY: height / 2,
    rotation: 0,
  }
}

/** Move `to` so the line from `from` runs at a multiple of 45°. */
function snapAngle(from: Point, to: Point): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const step = Math.PI / 4
  const angle = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / step) * step
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length }
}

/** Ramer-Douglas-Peucker: drop points that sit within `tolerance` of the line through their neighbours. */
function simplify(points: number[], tolerance: number): number[] {
  const count = points.length / 2
  if (count < 3) return points
  const keep = new Uint8Array(count)
  keep[0] = keep[count - 1] = 1
  const spans: [number, number][] = [[0, count - 1]]
  while (spans.length > 0) {
    const [first, last] = spans.pop()!
    const ax = points[first * 2]
    const ay = points[first * 2 + 1]
    const dx = points[last * 2] - ax
    const dy = points[last * 2 + 1] - ay
    const length = Math.hypot(dx, dy)
    let farthest = -1
    let worst = tolerance
    for (let i = first + 1; i < last; i++) {
      const px = points[i * 2] - ax
      const py = points[i * 2 + 1] - ay
      // Distance to the chord, or to its start when the stroke loops back on itself.
      const distance = length === 0 ? Math.hypot(px, py) : Math.abs(px * dy - py * dx) / length
      if (distance > worst) {
        worst = distance
        farthest = i
      }
    }
    if (farthest === -1) continue
    keep[farthest] = 1
    spans.push([first, farthest], [farthest, last])
  }
  const result: number[] = []
  for (let i = 0; i < count; i++) {
    if (keep[i]) result.push(points[i * 2], points[i * 2 + 1])
  }
  return result
}
