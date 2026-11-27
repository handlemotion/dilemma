// Copyright (C) 2026 Glauber. Licensed AGPL-3.0-only.
// Ported from Enclose, apps/desktop/src/components/viewport/rig.tsx
// (github.com/enclosedev/enclose at b2da08e): its handling of the hand on the view.
// Changed for Dilemma: plain three.js and camera-controls instead of react-three-fiber and
// drei, no flat (orthographic) views, meters and Y up, Maya's Alt drags, and the view turns
// about the selected joints rather than a model's parts. See NOTICE.md.

// The camera: how it moves under the hand. Fingers moving across a trackpad turn the
// view, a pinch zooms, and so does a mouse wheel; with Shift held, either pans. A drag
// with a mouse's right button, or its middle one, does what the user has said that
// button does (see navigation.ts); with Alt held, the three buttons drag as in Maya.
import CameraControls from 'camera-controls'
import {
  Box3,
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
import { altDragOf, dragOf, PRESETS, type Button, type Buttons, type Drag } from './navigation.ts'
import { MAC } from './platform.ts'
import { SCROLL_PAUSE, scrollSource } from './scroll.ts'

CameraControls.install({
  THREE: { Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Box3, Sphere, Raycaster },
})

const { ACTION } = CameraControls

/** auto: told apart by how the scroll moves. Or always the one, or always the other. */
export type Scrolling = 'auto' | 'trackpad' | 'wheel'

/** What stays put as the view turns: the middle of the view, or the selected joints. */
export type Pivot = 'view' | 'selection'

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
/** How far the view turns, in radians a pixel, under fingers moving across a trackpad. */
const SWIPE_TURN = 0.003
const MAX_SWIPE_DELTA = 18
/** Seconds for the camera to settle: quick behind a zoom, unhurried for a turn. */
const SMOOTH = { zoom: 0.1, turn: 0.3 }
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
    controls.smoothTime = SMOOTH.turn
    controls.draggingSmoothTime = 0
    controls.minDistance = 0.02
    controls.maxDistance = 500
    // The main button picks joints: it moves the view only with Alt held (see press).
    controls.mouseButtons.left = ACTION.NONE
    controls.setLookAt(2.2, 1.6, 3.2, 0, 0.9, 0, false)
    this.apply()
    this.stopListening = this.listen()
  }

  setPreferences(preferences: NavigationPreferences): void {
    this.preferences = preferences
    this.apply()
  }

  /** Move the camera by a frame's worth. Returns whether it moved. */
  update(delta: number): boolean {
    return this.controls.update(Math.min(delta, STEP))
  }

  frame(sphere: Sphere, animate = true): void {
    this.controls.smoothTime = SMOOTH.turn
    void this.controls.fitToSphere(sphere, animate)
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

  /** Turn about the pivot: the selection's middle where that is asked for, else the target. */
  private orbit(azimuth: number, polar: number, about: Vector3 | null): void {
    if (about) this.controls.setOrbitPoint(about.x, about.y, about.z)
    void this.controls.rotate(azimuth, polar, false)
  }

  private pivot(): Vector3 | null {
    return this.preferences.pivot === 'selection' ? this.selectionCenter() : null
  }

  private listen(): () => void {
    const canvas = this.canvas
    const around = canvas.parentElement
    if (!around) return () => {}
    const controls = this.controls
    const source = scrollSource()
    /** scrolls made here for the controls: not to be read a second time */
    const passed = new WeakSet<Event>()
    /** when the last pinch came */
    let pinched = -Infinity
    /** the swipe under way: when it last moved, and what it turns the view about */
    const swipe = { at: -Infinity, about: null as Vector3 | null }
    /** the drag that is zooming: where it began, and how far down the window it has got */
    let zooming: { x: number; y: number; last: number } | null = null

    /**
     * Zoom as a wheel would that scrolled this far, in pixels (or lines, where `mode` is
     * 1), towards the place in the window it is given. A pinch and a zoom drag go to the
     * controls as a turn of a wheel, so every zoom is the same kind, towards the pointer
     * and within the same limits.
     */
    const zoom = (delta: number, x: number, y: number, mode = 0, smoothTime = SMOOTH.zoom) => {
      controls.smoothTime = smoothTime
      controls.mouseButtons.wheel = ACTION.DOLLY
      const plain = new WheelEvent('wheel', {
        deltaY: delta,
        deltaMode: mode,
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
      })
      passed.add(plain)
      canvas.dispatchEvent(plain)
    }

    const press = (event: PointerEvent) => {
      const button = buttonOf(event)
      if (!button) return
      if (button === 'left' && !event.altKey) {
        // The controls sit a plain press of the main button out: it picks joints.
        controls.enabled = false
        return
      }
      const held = { shift: event.shiftKey, ctrl: event.ctrlKey }
      const does: Drag = event.altKey
        ? altDragOf(button)
        : dragOf(this.preferences, button as Button, held)
      controls.mouseButtons.left = event.altKey ? DRAGGED[altDragOf('left')] : ACTION.NONE
      controls.mouseButtons.middle =
        DRAGGED[event.altKey ? altDragOf('middle') : dragOf(this.preferences, 'middle', held)]
      controls.mouseButtons.right =
        DRAGGED[event.altKey ? altDragOf('right') : dragOf(this.preferences, 'right', held)]
      controls.smoothTime = 0
      if (does === 'zoom') zooming = { x: event.clientX, y: event.clientY, last: event.clientY }
      else if (does === 'turn') {
        const about = this.pivot()
        if (about) controls.setOrbitPoint(about.x, about.y, about.z)
      }
    }
    const drag = (event: PointerEvent) => {
      if (!zooming) return
      // Alt+right in Maya zooms left and right as well as up and down.
      const down = event.clientY - zooming.last - (event.altKey ? event.movementX : 0)
      zooming.last = event.clientY
      if (down === 0) return
      // Up the window zooms in, as a wheel turned away does, on where the drag began.
      // (Off a Mac the controls count a wheel's pixels for a third as much.)
      zoom(down * DRAG_ZOOM * (MAC ? 1 : 3), zooming.x, zooming.y, 0, 0)
    }
    const lift = () => {
      zooming = null
      controls.enabled = true
      controls.mouseButtons.left = ACTION.NONE
    }

    const turn = (event: WheelEvent, now: number) => {
      // one that follows the last without a pause is the same movement
      if (now - swipe.at > SCROLL_PAUSE) swipe.about = this.pivot()
      swipe.at = now
      // Fingers drift as they pinch, and a swipe coasts on after they lift: neither turns
      // a view that is being zoomed.
      if (now - pinched < SCROLL_PAUSE) return
      // Large scroll packets can arrive when macOS accelerates the gesture.
      const magnitude = Math.hypot(event.deltaX, event.deltaY)
      const scale = magnitude > MAX_SWIPE_DELTA ? MAX_SWIPE_DELTA / magnitude : 1
      const rate = SWIPE_TURN * this.preferences.turnSpeed * scale
      // the view goes the way the fingers do, as it does under a drag
      this.orbit(-event.deltaX * rate, -event.deltaY * rate, swipe.about)
    }

    const wheel = (event: WheelEvent) => {
      if (passed.has(event)) return
      const now = performance.now()
      const { scrolling, wheelReversed } = this.preferences
      const from =
        event.ctrlKey || scrolling === 'wheel'
          ? 'wheel'
          : scrolling === 'trackpad'
            ? 'fingers'
            : source(event, now)
      if (event.shiftKey) {
        controls.mouseButtons.wheel = ACTION.TRUCK
        controls.smoothTime = from === 'fingers' || event.ctrlKey ? 0 : SMOOTH.zoom
        return
      }
      swallow(event)
      // a pinch arrives as a scroll with Ctrl held
      if (!event.ctrlKey && from === 'fingers') {
        turn(event, now)
        return
      }
      if (event.ctrlKey) pinched = now
      // a wheel zooms the other way round for whoever asked: not a pinch, which follows the fingers
      const way = !event.ctrlKey && wheelReversed ? -1 : 1
      zoom(
        event.deltaY * (event.ctrlKey ? PINCH : 1) * way,
        event.clientX,
        event.clientY,
        event.deltaMode,
        event.ctrlKey ? 0 : SMOOTH.zoom,
      )
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
