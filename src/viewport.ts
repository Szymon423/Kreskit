import Konva from 'konva'

const MIN_SCALE = 0.05
const MAX_SCALE = 32
const FIT_MARGIN = 48

/** Konva stage that fills its container, with zoom and pan. */
export class Viewport {
  readonly stage: Konva.Stage
  readonly imageLayer: Konva.Layer
  onZoom: (scale: number) => void = () => {}
  /** Fired when the space key starts or stops turning drags into pans. */
  onPanMode: (active: boolean) => void = () => {}

  private container: HTMLDivElement
  private image: Konva.Image | null = null
  private bitmap: ImageBitmap | null = null
  private spaceDown = false
  private panFrom: { x: number; y: number } | null = null

  constructor(container: HTMLDivElement) {
    this.container = container
    this.stage = new Konva.Stage({
      container,
      width: container.clientWidth,
      height: container.clientHeight,
    })
    this.imageLayer = new Konva.Layer({ listening: false })
    this.stage.add(this.imageLayer)

    new ResizeObserver(() => {
      this.stage.size({ width: container.clientWidth, height: container.clientHeight })
    }).observe(container)

    container.addEventListener('wheel', this.onWheel, { passive: false })
    container.addEventListener('pointerdown', this.onPointerDown)
    container.addEventListener('pointermove', this.onPointerMove)
    container.addEventListener('pointerup', this.onPointerUp)
    container.addEventListener('pointercancel', this.onPointerUp)
    // Middle click would otherwise start autoscroll (Windows) or paste (Linux).
    container.addEventListener('auxclick', (e) => e.preventDefault())
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
    window.addEventListener('blur', () => this.setSpace(false))
  }

  get scale(): number {
    return this.stage.scaleX()
  }

  /** True while pointer input belongs to panning rather than to the editor. */
  get panning(): boolean {
    return this.spaceDown || this.panFrom !== null
  }

  setImage(source: ImageBitmap | null): void {
    if (source === this.bitmap) return
    this.bitmap = source
    this.image?.destroy()
    this.image = null
    if (!source) return
    this.image = new Konva.Image({ image: source, width: source.width, height: source.height })
    this.imageLayer.add(this.image)
    this.fit()
  }

  /** Scale the image down to fit the window, never above 100%. */
  fit(): void {
    if (!this.image) return
    const { width, height } = this.stage.size()
    const scale = Math.min(
      1,
      (width - FIT_MARGIN) / this.image.width(),
      (height - FIT_MARGIN) / this.image.height(),
    )
    this.applyScale(Math.max(scale, MIN_SCALE))
    this.center()
  }

  actualSize(): void {
    this.zoomAt(1, { x: this.stage.width() / 2, y: this.stage.height() / 2 })
  }

  zoomBy(factor: number): void {
    this.zoomAt(this.stage.scaleX() * factor, {
      x: this.stage.width() / 2,
      y: this.stage.height() / 2,
    })
  }

  /** Set the zoom level while keeping the given screen point stationary. */
  private zoomAt(scale: number, screen: { x: number; y: number }): void {
    const old = this.stage.scaleX()
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
    const world = {
      x: (screen.x - this.stage.x()) / old,
      y: (screen.y - this.stage.y()) / old,
    }
    this.applyScale(next)
    this.stage.position({ x: screen.x - world.x * next, y: screen.y - world.y * next })
  }

  private applyScale(scale: number): void {
    this.stage.scale({ x: scale, y: scale })
    // Keep individual pixels sharp when zoomed in on a screenshot.
    this.imageLayer.imageSmoothingEnabled(scale < 2)
    this.onZoom(scale)
  }

  private center(): void {
    if (!this.image) return
    const scale = this.stage.scaleX()
    this.stage.position({
      x: Math.round((this.stage.width() - this.image.width() * scale) / 2),
      y: Math.round((this.stage.height() - this.image.height() * scale) / 2),
    })
  }

  private setSpace(down: boolean): void {
    if (down === this.spaceDown) return
    this.spaceDown = down
    this.container.classList.toggle('panning', down)
    this.onPanMode(down)
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || isTextTarget(e.target)) return
    e.preventDefault()
    this.setSpace(e.type === 'keydown')
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const rect = this.container.getBoundingClientRect()
    // Pinch gestures arrive as small ctrl+wheel deltas, so give them more weight.
    const speed = e.ctrlKey ? 0.01 : 0.0015
    this.zoomAt(this.stage.scaleX() * Math.exp(-e.deltaY * speed), {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  private onPointerDown = (e: PointerEvent): void => {
    const middle = e.button === 1
    if (!middle && !(e.button === 0 && this.spaceDown)) return
    e.preventDefault()
    this.panFrom = { x: e.clientX - this.stage.x(), y: e.clientY - this.stage.y() }
    this.container.setPointerCapture(e.pointerId)
    this.container.classList.add('panning', 'dragging')
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.panFrom) return
    this.stage.position({ x: e.clientX - this.panFrom.x, y: e.clientY - this.panFrom.y })
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.panFrom) return
    this.panFrom = null
    this.container.releasePointerCapture(e.pointerId)
    this.container.classList.remove('dragging')
    this.container.classList.toggle('panning', this.spaceDown)
  }
}

export function isTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  )
}
