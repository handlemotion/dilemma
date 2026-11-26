import type { Character, Clip, EditorState, JointRef } from '@dilemma/core'
import {
  compileClip,
  compileSkeleton,
  createPose,
  solvePose,
  WORLD_STRIDE,
  type CompiledClip,
  type CompiledSkeleton,
  type Pose,
} from '@dilemma/solve'
import {
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
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
import { MeshPicker } from './picking.ts'
import { framingSphere, Rig, type NavigationPreferences } from './rig.ts'

/** Render resources for one character: its scene and one object per joint, in joint order. */
export interface ViewCharacter {
  root: Object3D
  bones: Object3D[]
}

export interface ViewportEvents {
  /** A click in the viewport. `null` means empty space. The app turns this into a selection change. */
  pick(joint: JointRef | null, additive: boolean): void
}

interface Entry {
  character: Character
  assets: ViewCharacter
  skeleton: CompiledSkeleton
  pose: Pose
  overlay: JointOverlay
  picker: MeshPicker
}

const PICK_RADIUS_PX = 12

/**
 * Draws the solved pose of the current editor state and turns clicks into
 * events. Holds render caches only; the editor state is always passed in.
 */
export class Viewport {
  readonly stats = { fps: 0, frameMs: 0 }
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(35, 1, 0.01, 1000)
  private rig: Rig
  private last = performance.now()
  private entries = new Map<string, Entry>()
  private assets: ReadonlyMap<string, ViewCharacter> = new Map()
  private clips = new WeakMap<Clip, CompiledClip>()
  private state: EditorState | null = null
  private raf = 0
  private resize: ResizeObserver
  private down: { x: number; y: number } | null = null
  private frameTimes: number[] = []

  constructor(
    private canvas: HTMLCanvasElement,
    private events: ViewportEvents,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new Color('#1b1d21')
    this.scene.add(new HemisphereLight('#ffffff', '#3a3f47', 1.6))
    const key = new DirectionalLight('#ffffff', 2)
    key.position.set(3, 6, 4)
    this.scene.add(key)
    const grid = new GridHelper(10, 20, '#4b5563', '#30343b')
    this.scene.add(grid)

    this.rig = new Rig(this.camera, canvas, () => this.selectionCenter())
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)
    this.resize = new ResizeObserver(() => this.onResize())
    this.resize.observe(canvas)
    this.onResize()
    this.raf = requestAnimationFrame(this.tick)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.resize.disconnect()
    this.rig.dispose()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    for (const entry of this.entries.values()) this.remove(entry)
    this.renderer.dispose()
  }

  setNavigation(preferences: NavigationPreferences): void {
    this.rig.setPreferences(preferences)
  }

  setAssets(assets: ReadonlyMap<string, ViewCharacter>): void {
    this.assets = assets
    if (this.state) this.sync(this.state)
  }

  setState(state: EditorState): void {
    const previous = this.state
    this.state = state
    if (!previous || previous.doc !== state.doc) this.sync(state)
    if (!previous || previous.selection !== state.selection) this.paintSelection(state)
  }

  /** Frame the selected joints, or every character when nothing is selected. */
  frameSelection(): void {
    const points: Vector3[] = []
    const selected = this.state?.selection.joints ?? []
    for (const entry of this.entries.values()) {
      const joints =
        selected.length > 0
          ? selected.filter((ref) => ref.characterId === entry.character.id).map((ref) => ref.joint)
          : Array.from({ length: entry.skeleton.count }, (_, i) => i)
      for (const j of joints) points.push(worldPosition(entry.pose, j))
    }
    if (points.length === 0) return
    const sphere = points.length === 1 ? new Sphere(points[0], 0.25) : framingSphere(points)
    this.rig.frame(sphere)
  }

  private sync(state: EditorState): void {
    for (const [id, entry] of this.entries) {
      const next = state.doc.characters.find((c) => c.id === id)
      if (next !== entry.character || this.assets.get(id) !== entry.assets) {
        this.remove(entry)
        this.entries.delete(id)
      }
    }
    const added: Entry[] = []
    for (const character of state.doc.characters) {
      if (this.entries.has(character.id)) continue
      const assets = this.assets.get(character.id)
      if (!assets) continue
      const skeleton = compileSkeleton(character.skeleton)
      const pose = createPose(skeleton)
      solvePose(skeleton, null, 0, pose)
      const overlay = new JointOverlay(skeleton, jointRadius(pose, skeleton))
      for (const bone of assets.bones) {
        bone.matrixAutoUpdate = false
        bone.matrixWorldAutoUpdate = false
      }
      this.scene.add(assets.root, overlay.group)
      const picker = new MeshPicker(assets.root, assets.bones)
      const entry = { character, assets, skeleton, pose, overlay, picker }
      this.entries.set(character.id, entry)
      added.push(entry)
    }
    this.paintSelection(state)
    if (added.length > 0 && this.entries.size === added.length) this.frameSelection()
  }

  private remove(entry: Entry): void {
    this.scene.remove(entry.assets.root, entry.overlay.group)
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
    this.rig.update((start - this.last) / 1000)
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
      solvePose(entry.skeleton, compiled, playhead?.frame ?? 0, entry.pose)
      const w = entry.pose.world
      entry.assets.bones.forEach((bone, i) => {
        bone.matrixWorld.fromArray(w, i * WORLD_STRIDE)
        bone.matrixWorldNeedsUpdate = false
      })
      entry.overlay.update(entry.pose)
    }
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
  }

  private onPointerDown = (event: PointerEvent) => {
    this.down = event.button === 0 && !event.altKey ? { x: event.clientX, y: event.clientY } : null
  }

  private onPointerUp = (event: PointerEvent) => {
    const down = this.down
    this.down = null
    if (!down || this.rig.active) return
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return
    const rect = this.canvas.getBoundingClientRect()
    this.events.pick(
      this.pickJoint(event.clientX - rect.left, event.clientY - rect.top),
      event.shiftKey,
    )
  }

  /** Nearest joint to a point in CSS pixels, within PICK_RADIUS_PX, preferring the one closer to the camera. */
  private pickJoint(x: number, y: number): JointRef | null {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    const p = new Vector3()
    let best: { ref: JointRef; dist: number; depth: number } | null = null
    for (const entry of this.entries.values()) {
      for (let j = 0; j < entry.skeleton.count; j++) {
        p.copy(worldPosition(entry.pose, j)).project(this.camera)
        if (p.z < -1 || p.z > 1) continue
        const sx = ((p.x + 1) / 2) * width
        const sy = ((1 - p.y) / 2) * height
        const dist = Math.hypot(sx - x, sy - y)
        if (dist > PICK_RADIUS_PX) continue
        if (
          !best ||
          dist < best.dist - 2 ||
          (Math.abs(dist - best.dist) <= 2 && p.z < best.depth)
        ) {
          best = { ref: { characterId: entry.character.id, joint: j }, dist, depth: p.z }
        }
      }
    }
    return best?.ref ?? this.pickMesh(x, y, width, height)
  }

  /** The joint that weighs most where the mesh was clicked, when no joint dot was. */
  private pickMesh(x: number, y: number, width: number, height: number): JointRef | null {
    const raycaster = new Raycaster()
    raycaster.setFromCamera(new Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), this.camera)
    let best: { ref: JointRef; distance: number } | null = null
    for (const entry of this.entries.values()) {
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
