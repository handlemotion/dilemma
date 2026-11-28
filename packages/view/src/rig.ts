// Copyright (C) 2026 Glauber. Licensed AGPL-3.0-only.
// Ported from Enclose, apps/desktop/src/components/viewport/rig.tsx
// (github.com/enclosedev/enclose at b2da08e): its handling of the hand on the view.
// Changed for Dilemma: plain three.js and camera-controls instead of react-three-fiber and
// drei, no flat (orthographic) views, meters and Y up, Maya's Alt drags, and the view turns
// about the selected joints rather than a model's parts. See NOTICE.md.

// The camera: how it moves under the hand. Fingers moving across a trackpad pan the
// view sideways and vertically, a pinch zooms, and a mouse wheel zooms unless Shift is held to pan. A drag
// with a mouse's right button, or its middle one, does what the user has said that
// button does (see navigation.ts); with Alt held, the three buttons drag as in Maya.
import CameraControls from 'camera-controls'
import {
  Box3,
  MathUtils,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from 'three'
import { altDragOf, dragOf, PRESETS, type Button, type Buttons } from './navigation.ts'
import { MAC } from './platform.ts'
import { scrollSource } from './scroll.ts'

CameraControls.install({
  THREE: { Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Box3, Sphere, Raycaster },
})

const { ACTION } = CameraControls

/** auto: told apart by how the scroll moves. Or always the one, or always the other. */
export type Scrolling = 'auto' | 'trackpad' | 'wheel'

/** What stays put as the view turns: the middle of the view, or the selected joints. */
export type Pivot = 'view' | 'selection'
export type CameraDrag = 'pan' | 'turn'

export type NavigationPreferences = Buttons & {
  scrolling: Scrolling
  /** how fast the view turns under the hand, against the speed it comes with */
  turnSpeed: number
  /** and how fast it zooms */
  zoomSpeed: number
  /** a wheel zooms the other way round */
  wheelReversed: boolean
  pivot: Pivot
}

export const TURN_SPEED = { min: 0.4, max: 2.5 }
export const ZOOM_SPEED = { min: 0.1, max: 2.5 }

export const DEFAULT_NAVIGATION: NavigationPreferences = {
  ...PRESETS.maya,
  scrolling: 'auto',
  turnSpeed: 1,
  zoomSpeed: 1,
  wheelReversed: false,
  pivot: 'selection',
}

/** How hard a wheel zooms, against the controls' own pace; and a pinch, against a wheel. */
const ZOOM = 3
const PINCH = 2.25
/** Seconds for an explicit Frame Selection transition. */
const FRAME_SMOOTH_TIME = 0.3
/** The longest step of time, in seconds, that a single frame moves the camera by. */
const STEP = 1 / 30
/** How far a wheel would have to scroll to zoom as a drag does, for each pixel of the drag. */
const DRAG_ZOOM = 0.2

/**
 * What a drag is to the controls, by what it does to the view. One that zooms is not
 * theirs: it is passed on as so many turns of a wheel, so that every zoom is of one kind.
 */
const DRAGGED = { turn: ACTION.ROTATE, pan: ACTION.TRUCK, zoom: ACTION.NONE } as const

const buttonOf = (event: PointerEvent): 'left' | Button | null =>
  event.pointerType === 'touch'
    ? null
    : event.button === 0
      ? 'left'
      : event.button === 1
        ? 'middle'
        : event.button === 2
          ? 'right'
          : null

const swallow = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
}

const menu = (event: Event) => event.preventDefault()

export class Rig {
  readonly controls: CameraControls
  private preferences: NavigationPreferences = DEFAULT_NAVIGATION
  private locked = false
  private stopListening: () => void

  constructor(
    readonly camera: PerspectiveCamera,
    private canvas: HTMLCanvasElement,
    /** What the view turns about when the pivot is the selection: null for none. */
    private selectionCenter: () => Vector3 | null,
  ) {
    const controls = new CameraControls(camera, canvas)
    this.controls = controls
    controls.dollyToCursor = true
    controls.smoothTime = FRAME_SMOOTH_TIME
    controls.draggingSmoothTime = 0
    controls.minDistance = 0.02
    controls.maxDistance = 500
    // The main button picks joints unless Alt is held.
    controls.mouseButtons.left = ACTION.NONE
    controls.setLookAt(2.2, 1.6, 3.2, 0, 0.9, 0, false)
    this.apply()
    this.stopListening = this.listen()
  }

  setPreferences(preferences: NavigationPreferences): void {
    this.preferences = preferences
    this.apply()
  }

  beginShortcutDrag(action: CameraDrag): ((deltaX: number, deltaY: number) => void) | null {
    if (this.locked || this.active) return null
    const controls = this.controls
    let started = false
    return (deltaX, deltaY) => {
      const height = this.canvas.clientHeight
      if (this.locked || height === 0 || (deltaX === 0 && deltaY === 0)) return
      if (!started) {
        started = true
        const position = controls.getPosition(new Vector3(), false)
        const target = controls.getTarget(new Vector3(), false)
        void controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z)
        if (action === 'turn') this.orbitAroundSelection()
      }
      if (action === 'pan') {
        const halfHeight =
          controls.distance * Math.tan(MathUtils.degToRad(this.camera.getEffectiveFOV()) / 2)
        const scale = (controls.truckSpeed * halfHeight) / height
        void controls.truck(-deltaX * scale, -deltaY * scale)
      } else {
        const scale = (-2 * Math.PI) / height
        void controls.rotate(
          deltaX * scale * controls.azimuthRotateSpeed,
          deltaY * scale * controls.polarRotateSpeed,
        )
      }
    }
  }

  setLocked(locked: boolean): void {
    if (this.locked === locked) return
    this.locked = locked
    this.controls.enabled = !locked
    if (locked) {
      const position = this.controls.getPosition(new Vector3(), false)
      const target = this.controls.getTarget(new Vector3(), false)
      void this.controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z)
    }
  }

  /** Move the camera by a frame's worth. Returns whether it moved. */
  update(delta: number): boolean {
    return this.controls.update(Math.min(delta, STEP))
  }

  frame(sphere: Sphere, animate = true): void {
    if (this.locked) return
    this.controls.smoothTime = FRAME_SMOOTH_TIME
    void this.controls.fitToSphere(sphere, animate)
  }

  /** Fit within the unobstructed fraction of the camera's view. */
  frameWithGuide(
    sphere: Sphere,
    width: number,
    height: number,
    animate: boolean,
    direction = this.controls
      .getPosition(new Vector3())
      .sub(this.controls.getTarget(new Vector3())),
  ): void {
    if (this.locked) return
    const halfFov = MathUtils.degToRad(this.camera.getEffectiveFOV()) / 2
    const angle = Math.atan(Math.tan(halfFov) * Math.min(width * this.camera.aspect, height))
    const distance = sphere.radius / Math.sin(angle)
    const target = sphere.center
    const position = direction.normalize().multiplyScalar(distance).add(target)
    this.controls.smoothTime = 0.13
    void this.controls.setLookAt(
      position.x,
      position.y,
      position.z,
      target.x,
      target.y,
      target.z,
      animate,
    )
  }

  /** Whether a drag of the controls' own is under way, so a click is no pick. */
  get active(): boolean {
    return this.controls.currentAction !== ACTION.NONE
  }

  dispose(): void {
    this.stopListening()
    this.controls.dispose()
  }

  private apply(): void {
    const { turnSpeed, zoomSpeed } = this.preferences
    this.controls.azimuthRotateSpeed = turnSpeed
    this.controls.polarRotateSpeed = turnSpeed
    this.controls.dollySpeed = ZOOM * zoomSpeed
  }

  private orbitAroundSelection(): void {
    const pivot = this.preferences.pivot === 'selection' ? this.selectionCenter() : null
    if (pivot) this.controls.setOrbitPoint(pivot.x, pivot.y, pivot.z)
  }

  private listen(): () => void {
    const canvas = this.canvas
    const around = canvas.parentElement
    if (!around) return () => {}
    const controls = this.controls
    const source = scrollSource()
    /** scrolls made here for the controls: not to be read a second time */
    const passed = new WeakSet<Event>()
    /** the drag that is zooming: where it began, and how far down the window it has got */
    let zooming: { x: number; y: number; last: number } | null = null

    /**
     * Zoom as a wheel would that scrolled this far, in pixels (or lines, where `mode` is
     * 1), towards the place in the window it is given. A pinch and a zoom drag go to the
     * controls as a turn of a wheel, so every zoom is the same kind, towards the pointer
     * and within the same limits.
     */
    const sendWheel = (
      action: typeof ACTION.DOLLY | typeof ACTION.TRUCK,
      input: WheelEventInit,
    ) => {
      controls.smoothTime = 0
      controls.mouseButtons.wheel = action
      const plain = new WheelEvent('wheel', { ...input, bubbles: true, cancelable: true })
      passed.add(plain)
      canvas.dispatchEvent(plain)
    }

    const press = (event: PointerEvent) => {
      if (this.locked) return
      const button = buttonOf(event)
      if (!button) return
      const held = { shift: event.shiftKey, ctrl: event.ctrlKey }
      const actions = {
        left: event.altKey ? altDragOf('left') : null,
        middle: event.altKey ? altDragOf('middle') : dragOf(this.preferences, 'middle', held),
        right: event.altKey ? altDragOf('right') : dragOf(this.preferences, 'right', held),
      }
      const does = actions[button]
      if (!does) {
        controls.enabled = false
        return
      }
      controls.mouseButtons.left = actions.left ? DRAGGED[actions.left] : ACTION.NONE
      controls.mouseButtons.middle = DRAGGED[actions.middle]
      controls.mouseButtons.right = DRAGGED[actions.right]
      controls.smoothTime = 0
      if (does === 'zoom') zooming = { x: event.clientX, y: event.clientY, last: event.clientY }
      else if (does === 'turn') this.orbitAroundSelection()
    }
    const drag = (event: PointerEvent) => {
      if (!zooming || this.locked) return
      // Alt+right in Maya zooms left and right as well as up and down.
      const down = event.clientY - zooming.last - (event.altKey ? event.movementX : 0)
      zooming.last = event.clientY
      if (down === 0) return
      // Up the window zooms in, as a wheel turned away does, on where the drag began.
      // (Off a Mac the controls count a wheel's pixels for a third as much.)
      sendWheel(ACTION.DOLLY, {
        deltaY: down * DRAG_ZOOM * (MAC ? 1 : 3),
        clientX: zooming.x,
        clientY: zooming.y,
      })
    }
    const lift = () => {
      zooming = null
      controls.enabled = !this.locked
      controls.mouseButtons.left = ACTION.NONE
    }

    const wheel = (event: WheelEvent) => {
      if (passed.has(event)) return
      swallow(event)
      if (this.locked) return
      const { scrolling, wheelReversed } = this.preferences
      const pinch = event.ctrlKey
      const trackpad =
        scrolling === 'trackpad' ||
        (scrolling === 'auto' && !pinch && source(event, performance.now()) === 'fingers')
      const pan = !pinch && (trackpad || event.shiftKey)
      const zoomDirection = wheelReversed ? -1 : 1
      sendWheel(pan ? ACTION.TRUCK : ACTION.DOLLY, {
        deltaX: pan ? event.deltaX : 0,
        deltaY: event.deltaY * (pan ? 1 : pinch ? PINCH : zoomDirection),
        deltaMode: event.deltaMode,
        clientX: event.clientX,
        clientY: event.clientY,
      })
    }

    // capturing, one element up: these run before the controls' own listeners on the canvas
    around.addEventListener('wheel', wheel, { capture: true, passive: false })
    around.addEventListener('pointerdown', press, { capture: true })
    canvas.addEventListener('contextmenu', menu)
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', lift)
    window.addEventListener('pointercancel', lift)
    return () => {
      around.removeEventListener('wheel', wheel, { capture: true })
      around.removeEventListener('pointerdown', press, { capture: true })
      canvas.removeEventListener('contextmenu', menu)
      window.removeEventListener('pointermove', drag)
      window.removeEventListener('pointerup', lift)
      window.removeEventListener('pointercancel', lift)
    }
  }
}

/** A sphere that frames a character from its height: enough room above and below. */
export function framingSphere(points: Vector3[]): Sphere {
  const sphere = new Sphere().setFromPoints(points)
  sphere.radius = Math.max(sphere.radius * 1.15, 0.1)
  return sphere
}
