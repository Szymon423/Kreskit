import Konva from 'konva'
import { createDimensionNode, updateDimensionNode } from './dimension'
import { isDimension, type DimensionObject, type SceneObject } from './model'
import { TEXT_LINE_HEIGHT } from './textedit'

export type ObjectNode = Konva.Shape | Konva.Group

export function createNode(obj: SceneObject): ObjectNode {
  switch (obj.type) {
    case 'rect':
      return new Konva.Rect()
    case 'ellipse':
      return new Konva.Ellipse()
    case 'line':
      return new Konva.Line()
    case 'arrow':
      return new Konva.Arrow()
    case 'pen':
    case 'highlighter':
      return new Konva.Line()
    case 'text':
      return new Konva.Text()
    case 'image':
      return new Konva.Image()
    case 'dimension':
    case 'radius':
    case 'diameter':
      return createDimensionNode()
  }
}

/** Make a node look like its object. */
export function applyAttrs(node: ObjectNode, obj: SceneObject): void {
  if (isDimension(obj)) updateDimensionNode(node as Konva.Group, obj)
  else node.setAttrs(nodeAttrs(obj))
}

/** Every Konva attribute an object controls, so applying it also undoes leftover drag offsets and scales. */
function nodeAttrs(obj: Exclude<SceneObject, DimensionObject>): Record<string, unknown> {
  const { stroke, strokeWidth, fill, opacity } = obj.style
  const common = {
    stroke,
    strokeWidth,
    opacity,
    // Thin outlines would otherwise be hard to click.
    hitStrokeWidth: Math.max(strokeWidth, 14),
    scaleX: 1,
    scaleY: 1,
  }
  switch (obj.type) {
    case 'rect':
      return {
        ...common,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        rotation: obj.rotation,
        fill,
        lineJoin: 'round',
      }
    case 'ellipse':
      return {
        ...common,
        x: obj.x,
        y: obj.y,
        radiusX: obj.radiusX,
        radiusY: obj.radiusY,
        rotation: obj.rotation,
        fill,
      }
    case 'line':
    case 'arrow':
      return {
        ...common,
        x: 0,
        y: 0,
        rotation: 0,
        points: obj.points,
        lineCap: 'round',
        fill: stroke,
        pointerAtBeginning: obj.style.arrowHeads === 'both',
        pointerLength: Math.max(10, strokeWidth * 3.5),
        pointerWidth: Math.max(10, strokeWidth * 3.5),
      }
    case 'image':
      return {
        ...common,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        rotation: obj.rotation,
        image: obj.bitmap,
        stroke: null,
        strokeWidth: 0,
        hitStrokeWidth: 0,
      }
    case 'pen':
    case 'highlighter':
      return {
        ...common,
        x: 0,
        y: 0,
        rotation: 0,
        points: obj.points,
        lineCap: 'round',
        lineJoin: 'round',
        tension: 0.5,
      }
    case 'text':
      return {
        ...common,
        x: obj.x,
        y: obj.y,
        rotation: obj.rotation,
        text: obj.text,
        fontFamily: obj.style.fontFamily,
        fontSize: obj.style.fontSize,
        lineHeight: TEXT_LINE_HEIGHT,
        fill: stroke,
        stroke: null,
        strokeWidth: 0,
        hitStrokeWidth: 0,
      }
  }
}
