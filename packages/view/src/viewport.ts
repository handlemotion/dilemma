import {
  CONTROL_IDS,
  selectedControl,
  type ControlId,
  type Character,
  type Clip,
  type EditorState,
  type JointRef,
  type PoseKey,
} from '@dilemma/core'
import {
  compileClip,
  compilePosePreview,
  compileSkeleton,
  createPose,
  solvePose,
  WORLD_STRIDE,
  type CompiledClip,
  type CompiledSkeleton,
  type Pose,
  type PosePreview,
} from '@dilemma/solve'
import {
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Sphere,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three'
import { JointOverlay } from './joints.ts'
import { MotionTrail, type MotionTrailData } from './motion-trail.ts'
import { MeshPicker } from './picking.ts'
import { PoseControls } from './pose-controls.ts'
import { framingSphere, Rig, type CameraDrag, type NavigationPreferences } from './rig.ts'
import { TransformGizmo, type TransformEvents, type TransformMode } from './transform-gizmo.ts'

/** Render resources for one character: its scene and one object per joint, in joint order. */
export interface ViewCharacter {
  root: Object3D
  bones: Object3D[]
}

export interface ViewportEvents extends TransformEvents {
  /** A joint pick in the viewport. `null` means empty space. */
  pick(joint: JointRef | null, additive: boolean): void
  pickBox(joints: JointRef[], additive: boolean): void
  marquee(rect: ViewportMarquee | null): void
  hoverControl(hover: ViewportControlHover | null): void
}

export interface ViewportMarquee {
  x: number
  y: number
  width: number
  height: number
}

export interface ViewportControlHover {
  control: ControlId
  outOfReach: boolean
  x: number
  y: number
}

export interface RigSetupPreview {
  characterId: string
  overview: boolean
  focusHeight: number | null
  focusJoints: readonly number[]
  highlightedJoints: readonly number[]
  picking: boolean
}

export interface RigSetupSpace {
  right: number
  bottom: number
}

export interface ViewportDisplay {
  cameraLocked: boolean
  floorGrid: boolean
  shading: 'materials' | 'clay' | 'wireframe'
  skeletonInPose: boolean
}

interface SelectionPointer {
  id: number
  x: number
  y: number
  additive: boolean
  hit: JointRef | null
  direct: boolean
  dragging: boolean
}

interface SkeletonHit {
  ref: JointRef
  distance: number
  depth: number
  dot: boolean
}

export interface TransformPreview {
  joint: JointRef
  key: PoseKey
}

interface Entry {
  character: Character
  assets: ViewCharacter
  skeleton: CompiledSkeleton
  pose: Pose
  overlay: JointOverlay
  picker: MeshPicker
  controls: PoseControls
}

const PICK_RADIUS_PX = 12
const BONE_RADIUS_PX = 6
const DRAG_THRESHOLD_PX = 4
const RIG_OVERVIEW_TURN = Math.PI / 12

/**
 * Draws the solved pose of the current editor state and turns clicks into
 * events. Holds render caches only; the editor state is always passed in.
 */
export class Viewport {
  readonly stats = { fps: 0, frameMs: 0 }
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(35, 1, 0.01, 1000)
  private grid = new GridHelper(10, 20, '#afb6c3', '#c1c7d2')
  private motionTrail = new MotionTrail()
  private clay = new MeshStandardMaterial({ color: '#a9aeb8', roughness: 0.8 })
  private wireframe = new MeshBasicMaterial({ color: '#535c6b', wireframe: true })
  private rig: Rig
  private gizmo: TransformGizmo
  private transformMode: TransformMode = 'rotate'
  private skeletonInPose = false
  private setupPreview: RigSetupPreview | null = null
  private setupSpace: RigSetupSpace | null = null
  private setupCamera: { position: Vector3; target: Vector3 } | null = null
  private cameraLocked = false
  private transformPreviews = new Map<string, PosePreview>()
  private last = performance.now()
  private entries = new Map<string, Entry>()
  private assets: ReadonlyMap<string, ViewCharacter> = new Map()
  private clips = new WeakMap<Clip, CompiledClip>()
  private state: EditorState | null = null
  private raf = 0
  private resize: ResizeObserver
  private selectionPointer: SelectionPointer | null = null
  private frameTimes: number[] = []

  constructor(
    private canvas: HTMLCanvasElement,
    background: string,
    private events: ViewportEvents,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new Color(background)
    this.scene.add(new HemisphereLight('#ffffff', '#404040', 1.6))
    const key = new DirectionalLight('#ffffff', 2)
    key.position.set(3, 6, 4)
    this.scene.add(key)
    this.grid.material.allowOverride = false
    this.scene.add(this.grid, this.motionTrail.group)

    this.rig = new Rig(this.camera, canvas, () => this.selectionCenter())
    this.gizmo = new TransformGizmo(this.scene, this.camera, canvas, events)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerleave', this.clearControlHover)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    canvas.addEventListener('lostpointercapture', this.onPointerCancel)
    this.resize = new ResizeObserver(() => this.onResize())
    this.resize.observe(canvas)
    this.onResize()
    this.raf = requestAnimationFrame(this.tick)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.resize.disconnect()
    this.rig.dispose()
    this.gizmo.dispose()
    this.cancelSelection()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerleave', this.clearControlHover)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
    this.canvas.removeEventListener('lostpointercapture', this.onPointerCancel)
    for (const entry of this.entries.values()) this.remove(entry)
    this.grid.dispose()
    this.motionTrail.dispose()
    this.clay.dispose()
    this.wireframe.dispose()
    this.renderer.dispose()
  }

  setNavigation(preferences: NavigationPreferences): void {
    this.rig.setPreferences(preferences)
  }

  beginCameraDrag(action: CameraDrag): ((deltaX: number, deltaY: number) => void) | null {
    if (this.selectionPointer || this.gizmo.dragging) return null
    return this.rig.beginShortcutDrag(action)
  }

  setDisplay({ cameraLocked, floorGrid, shading, skeletonInPose }: ViewportDisplay): void {
    this.skeletonInPose = skeletonInPose
    const lockChanged = cameraLocked !== this.cameraLocked
    this.cameraLocked = cameraLocked
    this.rig.setLocked(cameraLocked)
    if (lockChanged && this.setupPreview && this.setupSpace) this.frameRigSetup()
    this.grid.visible = floorGrid
    this.scene.overrideMaterial =
      shading === 'clay' ? this.clay : shading === 'wireframe' ? this.wireframe : null
  }

  setAssets(assets: ReadonlyMap<string, ViewCharacter>): void {
    this.assets = assets
    if (this.state) this.sync(this.state)
  }

  setMotionTrail(data: MotionTrailData | null): void {
    this.motionTrail.setData(data)
  }

  setState(state: EditorState): void {
    const previous = this.state
    this.state = state
    if (!previous || previous.doc !== state.doc) this.sync(state)
    if (!previous || previous.selection !== state.selection) {
      this.paintSelection(state)
      this.updateGizmo()
    }
  }

  setTransformMode(mode: TransformMode): void {
    this.clearControlHover()
    this.transformMode = mode
    this.gizmo.setMode(mode)
  }

  setRigSetupPreview(preview: RigSetupPreview | null): void {
    const previous = this.setupPreview
    if (Boolean(preview) !== Boolean(previous)) {
      this.cancelTransform()
      this.cancelSelection()
      this.clearControlHover()
    }
    this.setupPreview = preview
    this.canvas.style.cursor = preview?.picking ? 'crosshair' : ''
    this.updateGizmo()
    const controls = this.rig.controls
    if (preview && !previous) {
      this.setupCamera = {
        position: controls.getPosition(new Vector3()),
        target: controls.getTarget(new Vector3()),
      }
    }
    if (!preview && this.setupCamera) {
      const { position, target } = this.setupCamera
      this.setupCamera = null
      this.setupSpace = null
      this.camera.clearViewOffset()
      if (!this.cameraLocked) {
        void controls.setLookAt(
          position.x,
          position.y,
          position.z,
          target.x,
          target.y,
          target.z,
          this.animateCamera,
        )
      }
    } else if (
      preview &&
      this.setupSpace &&
      (preview.characterId !== previous?.characterId ||
        preview.overview !== previous.overview ||
        preview.focusHeight !== previous.focusHeight)
    ) {
      this.frameRigSetup()
    }
  }

  setRigSetupSpace(space: RigSetupSpace): void {
    if (space.right === this.setupSpace?.right && space.bottom === this.setupSpace.bottom) return
    const animate = this.setupSpace === null && this.animateCamera
    this.setupSpace = space
    this.frameRigSetup(animate)
  }

  private get animateCamera(): boolean {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  private frameRigSetup(animate = this.animateCamera): void {
    const preview = this.setupPreview
    const space = this.setupSpace
    if (!preview || !space) return
    if (this.cameraLocked) {
      this.camera.clearViewOffset()
      return
    }
    const entry = this.entries.get(preview.characterId)
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (!entry || width === 0 || height === 0) return
    const right = Math.min(space.right, width * 0.75)
    const bottom = Math.min(space.bottom, height * 0.75)
    this.camera.setViewOffset(width, height, right / 2, bottom / 2, width, height)
    const bounds = new Box3().expandByObject(entry.assets.root)
    if (bounds.isEmpty()) {
      for (let joint = 0; joint < entry.skeleton.count; joint++) {
        bounds.expandByPoint(worldPosition(entry.pose, joint))
      }
    }
    if (bounds.isEmpty()) return
    const body = framingSphere([bounds.min, bounds.max])
    let sphere = body
    if (preview.focusHeight !== null) {
      const points = preview.focusJoints.map((joint) => worldPosition(entry.pose, joint))
      if (points.length === 0) {
        const center = bounds.getCenter(new Vector3())
        center.y = bounds.min.y + (bounds.max.y - bounds.min.y) * preview.focusHeight
        sphere = new Sphere(center, body.radius * 0.56)
      } else {
        sphere = framingSphere(points)
        sphere.radius = Math.max(sphere.radius * 1.25, body.radius * 0.27)
      }
    }
    const initialView = this.setupCamera
    const direction =
      preview.overview && initialView && this.animateCamera
        ? initialView.position
            .clone()
            .sub(initialView.target)
            .applyAxisAngle(this.camera.up, -RIG_OVERVIEW_TURN)
        : undefined
    this.rig.frameWithGuide(
      sphere,
      (width - right) / width,
      (height - bottom) / height,
      animate,
      direction,
    )
  }

  setTransformPreviews(previews: readonly TransformPreview[]): void {
    this.transformPreviews.clear()
    for (const [id, entry] of this.entries) {
      const edits = previews
        .filter(({ joint }) => joint.characterId === id)
        .map(({ joint, key }) => ({ joint: joint.joint, key }))
      if (edits.length)
        this.transformPreviews.set(id, compilePosePreview(entry.skeleton.count, edits))
    }
  }

  cancelTransform(): boolean {
    const cancelled = this.gizmo.cancel()
    if (cancelled) this.clearSelectionPointer()
    return cancelled
  }

  cancelSelection(): boolean {
    const pointer = this.selectionPointer
    if (!pointer) return false
    this.clearSelectionPointer()
    if (this.canvas.hasPointerCapture(pointer.id)) this.canvas.releasePointerCapture(pointer.id)
    return true
  }

  /** Frame selected handles or joints, or fit the visible character meshes. */
  frameSelection(): void {
    if (this.setupPreview) {
      this.frameRigSetup()
      return
    }
    const points: Vector3[] = []
    const selected = this.state?.selection.joints ?? []
    if (!selected.length) {
      const bounds = new Box3()
      for (const { assets } of this.entries.values()) {
        bounds.expandByObject(assets.root, true)
      }
      if (!bounds.isEmpty()) points.push(bounds.min, bounds.max)
    }
    for (const ref of selected) {
      const entry = this.entries.get(ref.characterId)
      if (!entry) continue
      const control = this.selectedPoseControl(entry)?.control
      points.push(
        control
          ? new Vector3().fromArray(entry.pose.controlPositions, CONTROL_IDS.indexOf(control) * 3)
          : worldPosition(entry.pose, ref.joint),
      )
    }
    if (points.length === 0) return
    const sphere = points.length === 1 ? new Sphere(points[0], 0.25) : framingSphere(points)
    this.rig.frame(sphere)
  }

  private sync(state: EditorState): void {
    for (const [id, entry] of this.entries) {
      const next = state.doc.characters.find((c) => c.id === id)
      if (
        !next ||
        next.skeleton !== entry.character.skeleton ||
        this.assets.get(id) !== entry.assets
      ) {
        this.remove(entry)
        this.entries.delete(id)
      } else if (next.rig !== entry.character.rig) {
        entry.character = next
        entry.skeleton.controls.set(compileSkeleton(next.skeleton, next.rig).controls)
      }
    }
    const added: Entry[] = []
    for (const character of state.doc.characters) {
      if (this.entries.has(character.id)) continue
      const assets = this.assets.get(character.id)
      if (!assets) continue
      const skeleton = compileSkeleton(character.skeleton, character.rig)
      const pose = createPose(skeleton)
      solvePose(skeleton, null, 0, pose)
      const radius = jointRadius(pose, skeleton)
      const overlay = new JointOverlay(skeleton, radius)
      const controls = new PoseControls(character.id, skeleton)
      for (const bone of assets.bones) {
        bone.matrixAutoUpdate = false
        bone.matrixWorldAutoUpdate = false
      }
      this.scene.add(assets.root, overlay.group, controls.group)
      const picker = new MeshPicker(assets.root, assets.bones)
      const entry = { character, assets, skeleton, pose, overlay, picker, controls }
      this.entries.set(character.id, entry)
      added.push(entry)
    }
    this.paintSelection(state)
    if (
      this.setupPreview &&
      added.some(({ character }) => character.id === this.setupPreview?.characterId)
    )
      this.frameRigSetup()
    else if (added.length > 0 && this.entries.size === added.length) this.frameSelection()
  }

  private remove(entry: Entry): void {
    this.scene.remove(entry.assets.root, entry.overlay.group, entry.controls.group)
    entry.controls.dispose()
    entry.overlay.dispose()
    entry.picker.dispose()
  }

  private paintSelection(state: EditorState): void {
    for (const entry of this.entries.values()) {
      const set = new Set(
        state.selection.joints
          .filter((r) => r.characterId === entry.character.id)
          .map((r) => r.joint),
      )
      entry.overlay.setSelected(set)
    }
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick)
    const start = performance.now()
    if (!this.gizmo.dragging && !this.selectionPointer?.direct) {
      this.rig.update((start - this.last) / 1000)
    }
    this.camera.updateMatrixWorld()
    this.last = start
    this.solveAll()
    this.renderer.render(this.scene, this.camera)
    this.stats.frameMs = performance.now() - start
    this.frameTimes.push(now)
    while (this.frameTimes.length > 0 && now - this.frameTimes[0]! > 1000) this.frameTimes.shift()
    this.stats.fps = this.frameTimes.length
  }

  private solveAll(): void {
    const playhead = this.state?.playhead
    const clip = playhead?.clipId
      ? this.state?.doc.clips.find((c) => c.id === playhead.clipId)
      : undefined
    for (const entry of this.entries.values()) {
      const compiled =
        clip && clip.characterId === entry.character.id ? this.compiled(clip, entry) : null
      solvePose(
        entry.skeleton,
        compiled,
        playhead?.frame ?? 0,
        entry.pose,
        this.transformPreviews.get(entry.character.id),
      )
      this.motionTrail.setFrame(entry.character.id, playhead?.frame ?? 0, entry.pose)
      const w = entry.pose.world
      entry.assets.bones.forEach((bone, i) => {
        bone.matrixWorld.fromArray(w, i * WORLD_STRIDE)
        bone.matrixWorldNeedsUpdate = false
      })
      const preview =
        this.setupPreview?.characterId === entry.character.id ? this.setupPreview : null
      entry.overlay.update(
        entry.pose,
        this.showJointOverlay(entry),
        preview?.highlightedJoints,
        this.camera,
        this.canvas.clientHeight,
      )
      entry.controls.update(
        entry.pose,
        this.transformMode === 'ik' && !this.setupPreview,
        this.selectedPoseControl(entry)?.control,
        this.camera,
        this.canvas.clientHeight,
      )
    }
    this.updateGizmo()
  }

  private updateGizmo(): void {
    const selected = this.state?.selection.joints
    const joint = !this.setupPreview && selected?.length === 1 ? selected[0]! : null
    const entry = joint ? this.entries.get(joint.characterId) : undefined
    this.gizmo.update(
      entry && joint
        ? (this.selectedPoseControl(entry) ?? {
            characterId: joint.characterId,
            joint: joint.joint,
          })
        : joint,
      entry?.pose,
      entry?.skeleton,
      entry?.character.rig?.confirmed,
    )
  }

  private showJointOverlay(entry: Entry): boolean {
    if (this.setupPreview)
      return this.setupPreview.picking && this.setupPreview.characterId === entry.character.id
    return (
      this.transformMode !== 'ik' ||
      this.skeletonInPose ||
      (!entry.character.rig?.confirmed && entry.pose.ik.tip >= 0)
    )
  }

  private selectedPoseControl(entry: Entry): JointRef | null {
    if (this.transformMode !== 'ik') return null
    const joints = this.state?.selection.joints
    const selected = joints?.length === 1 ? joints[0] : undefined
    if (selected?.characterId !== entry.character.id) return null
    const control = selectedControl(entry.character.skeleton, entry.character.rig, selected)
    return control ? { ...selected, control } : null
  }

  private compiled(clip: Clip, entry: Entry): CompiledClip {
    let compiled = this.clips.get(clip)
    if (!compiled) {
      compiled = compileClip(clip, entry.skeleton.count)
      this.clips.set(clip, compiled)
    }
    return compiled
  }

  private onResize(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width === 0 || height === 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    if (this.setupPreview && this.setupSpace) this.frameRigSetup(false)
  }

  private onPointerDown = (event: PointerEvent) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      event.altKey ||
      this.rig.active ||
      this.gizmo.dragging ||
      this.selectionPointer
    )
      return
    const rect = this.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (this.setupPreview) {
      if (this.setupPreview.picking) {
        const hit = this.pickSkeleton(x, y)
        if (hit?.dot) this.events.pick(hit.ref, false)
      }
      return
    }
    this.clearControlHover()
    const hit = this.pickControl(x, y) ?? this.pickSkeleton(x, y)
    const canTransform = !event.shiftKey && !event.ctrlKey && !event.metaKey
    // A pose handle or the center of a joint dot takes priority over a nearby axis.
    if (
      canTransform &&
      !hit?.ref.control &&
      !(hit?.dot && hit.distance <= PICK_RADIUS_PX / 2) &&
      this.gizmo.grabHandle(event)
    ) {
      this.canvas.setPointerCapture(event.pointerId)
      return
    }
    const direct = canTransform && hit !== null
    this.selectionPointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      additive: event.shiftKey,
      hit: hit?.ref ?? null,
      direct,
      dragging: false,
    }
    this.canvas.setPointerCapture(event.pointerId)
    if (direct) this.events.pick(hit.ref, false)
  }

  private onPointerMove = (event: PointerEvent) => {
    if (this.setupPreview) {
      this.canvas.style.cursor = this.setupPreview.picking ? 'crosshair' : ''
      return
    }
    if (this.gizmo.move(event)) return
    const pointer = this.selectionPointer
    if (this.gizmo.dragging || this.rig.active) return
    if (!pointer) {
      this.gizmo.hover(event)
      const rect = this.canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const hit = this.pickControl(x, y)
      const control = hit?.ref.control
      this.events.hoverControl(
        control ? { control, x, y, outOfReach: Boolean(hit?.outOfReach) } : null,
      )
      this.canvas.style.cursor = control ? 'grab' : ''
      return
    }
    if (pointer.id !== event.pointerId) return
    if (!pointer.dragging && !passedDragThreshold(pointer, event)) return
    if (pointer.direct) {
      if (pointer.dragging) return
      pointer.dragging = true
      const selected = this.state?.selection.joints
      const joint = selected?.length === 1 ? selected[0] : undefined
      const hit = pointer.hit
      if (hit && joint?.characterId === hit.characterId && joint.joint === hit.joint) {
        // Selection may have changed the active clip since the last render.
        this.solveAll()
        if (this.gizmo.grabJoint(pointer.id, pointer.x, pointer.y)) {
          this.clearSelectionPointer()
          this.gizmo.move(event)
        }
      }
      return
    }
    pointer.dragging = true
    this.events.marquee(this.selectionRectangle(pointer, event))
  }

  private onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0 || this.gizmo.finish(event.pointerId)) return
    const pointer = this.selectionPointer
    if (pointer?.id !== event.pointerId) return
    this.clearSelectionPointer()
    if (pointer.direct || this.rig.active || this.gizmo.dragging) return
    if (pointer.dragging || passedDragThreshold(pointer, event)) {
      this.events.pickBox(
        this.jointsInRectangle(this.selectionRectangle(pointer, event)),
        pointer.additive,
      )
    } else {
      const rect = this.canvas.getBoundingClientRect()
      this.events.pick(
        pointer.hit ?? this.pickMesh(pointer.x - rect.left, pointer.y - rect.top),
        pointer.additive,
      )
    }
  }

  private clearControlHover = () => {
    this.events.hoverControl(null)
    this.canvas.style.cursor = ''
  }

  private onPointerCancel = (event: PointerEvent) => {
    this.gizmo.cancel(event.pointerId)
    if (this.selectionPointer?.id === event.pointerId) this.clearSelectionPointer()
  }

  private clearSelectionPointer(): void {
    const pointer = this.selectionPointer
    if (pointer?.dragging && !pointer.direct) this.events.marquee(null)
    this.selectionPointer = null
  }

  private selectionRectangle(pointer: SelectionPointer, event: PointerEvent): ViewportMarquee {
    const rect = this.canvas.getBoundingClientRect()
    const x = (value: number) => Math.min(rect.width, Math.max(0, value - rect.left))
    const y = (value: number) => Math.min(rect.height, Math.max(0, value - rect.top))
    const x1 = x(pointer.x)
    const x2 = x(event.clientX)
    const y1 = y(pointer.y)
    const y2 = y(event.clientY)
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    }
  }

  private jointsInRectangle(rect: ViewportMarquee): JointRef[] {
    const selected: JointRef[] = []
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    const p = new Vector3()
    for (const entry of this.entries.values()) {
      if (!this.showJointOverlay(entry)) continue
      for (let joint = 0; joint < entry.skeleton.count; joint++) {
        const offset = joint * WORLD_STRIDE + 12
        const world = entry.pose.world
        p.set(world[offset]!, world[offset + 1]!, world[offset + 2]!).project(this.camera)
        if (p.z < -1 || p.z > 1) continue
        const x = ((p.x + 1) * width) / 2
        const y = ((1 - p.y) * height) / 2
        if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height)
          selected.push({ characterId: entry.character.id, joint })
      }
    }
    return selected
  }

  private pickControl(x: number, y: number): (SkeletonHit & { outOfReach: boolean }) | null {
    if (this.transformMode !== 'ik' || this.setupPreview) return null
    let hit: (SkeletonHit & { outOfReach: boolean }) | null = null
    for (const entry of this.entries.values()) {
      const candidate = entry.controls.pick(
        x,
        y,
        this.canvas.clientWidth,
        this.canvas.clientHeight,
        this.camera,
      )
      if (candidate && nearer(hit, candidate.distance, candidate.depth)) hit = candidate
    }
    return hit
  }

  /** Pick the visible joint dots first, then the parent-to-child bone segments. */
  private pickSkeleton(x: number, y: number): SkeletonHit | null {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    const point = new Vector2(x, y)
    let dot: SkeletonHit | null = null
    let bone: SkeletonHit | null = null
    for (const entry of this.entries.values()) {
      if (!this.showJointOverlay(entry)) continue
      const characterId = entry.character.id
      const projected = Array.from({ length: entry.skeleton.count }, (_, joint) => {
        const p = worldPosition(entry.pose, joint).project(this.camera)
        p.x = ((p.x + 1) * width) / 2
        p.y = ((1 - p.y) * height) / 2
        return p
      })
      for (let joint = 0; joint < projected.length; joint++) {
        const p = projected[joint]!
        if (p.z < -1 || p.z > 1) continue
        const distance = Math.hypot(p.x - x, p.y - y)
        if (distance <= PICK_RADIUS_PX && nearer(dot, distance, p.z)) {
          dot = { ref: { characterId, joint }, distance, depth: p.z, dot: true }
        }
        const parent = entry.skeleton.parents[joint]!
        const a = projected[parent]
        if (!a || a.z < -1 || a.z > 1) continue
        const along = segmentFraction(point, a, p)
        const depth = a.z + (p.z - a.z) * along
        const distanceToBone = Math.hypot(
          x - (a.x + (p.x - a.x) * along),
          y - (a.y + (p.y - a.y) * along),
        )
        if (distanceToBone <= BONE_RADIUS_PX && nearer(bone, distanceToBone, depth)) {
          // The parent is the joint whose rotation moves this segment.
          bone = {
            ref: { characterId, joint: parent },
            distance: distanceToBone,
            depth,
            dot: false,
          }
        }
      }
    }
    return dot ?? bone
  }

  /** The joint that weighs most where the mesh was clicked. */
  private pickMesh(x: number, y: number): JointRef | null {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    const raycaster = new Raycaster()
    raycaster.setFromCamera(new Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), this.camera)
    let best: { ref: JointRef; distance: number } | null = null
    for (const entry of this.entries.values()) {
      if (!this.showJointOverlay(entry)) continue
      const hit = entry.picker.pick(raycaster.ray)
      if (hit && (!best || hit.distance < best.distance)) {
        best = {
          ref: { characterId: entry.character.id, joint: hit.joint },
          distance: hit.distance,
        }
      }
    }
    return best?.ref ?? null
  }

  /** The middle of the selected joints, for the view to turn about. */
  private selectionCenter(): Vector3 | null {
    if (this.setupPreview) return null
    const selected = this.state?.selection.joints ?? []
    if (selected.length === 0) return null
    const center = new Vector3()
    let count = 0
    for (const ref of selected) {
      const entry = this.entries.get(ref.characterId)
      if (!entry) continue
      center.add(worldPosition(entry.pose, ref.joint))
      count++
    }
    return count > 0 ? center.divideScalar(count) : null
  }
}

function passedDragThreshold(pointer: SelectionPointer, event: PointerEvent): boolean {
  return Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > DRAG_THRESHOLD_PX
}

function nearer(hit: SkeletonHit | null, distance: number, depth: number): boolean {
  return (
    !hit ||
    distance < hit.distance - 2 ||
    (Math.abs(distance - hit.distance) <= 2 && depth < hit.depth)
  )
}

function segmentFraction(point: Vector2, a: Vector3, b: Vector3): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  if (length === 0) return 0
  return Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
}

function worldPosition(pose: Pose, joint: number): Vector3 {
  const o = joint * WORLD_STRIDE
  return new Vector3(pose.world[o + 12], pose.world[o + 13], pose.world[o + 14])
}

/** Dot size from the character's height, so tiny and huge rigs both read. */
function jointRadius(pose: Pose, skeleton: CompiledSkeleton): number {
  const points = Array.from({ length: skeleton.count }, (_, i) => worldPosition(pose, i))
  const radius = new Sphere().setFromPoints(points).radius
  return Math.max(radius * 0.012, 0.002)
}
