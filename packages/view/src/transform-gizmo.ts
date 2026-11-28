import {
  CONTROL_IDS,
  controlKind,
  type ControlId,
  type JointRef,
  type PoseKey,
} from '@dilemma/core'
import {
  canSolveLimb,
  LOCAL_STRIDE,
  WORLD_STRIDE,
  type CompiledSkeleton,
  type Pose,
} from '@dilemma/solve'
import { Line, Matrix4, Mesh, Object3D, Quaternion, Vector3, type Camera, type Scene } from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { TranslateDrag } from './translate-drag.ts'

export type TransformMode = 'translate' | 'rotate' | 'scale' | 'ik'

export interface TransformEvents {
  transformStart(joint: JointRef): void
  transformChange(key: PoseKey | null): void
  transformEnd(commit: boolean): void
}

/** Adapts three.js handles to changes in one joint's local transform. */
export class TransformGizmo {
  private controls: TransformControls
  private proxy = new Object3D()
  private mode: TransformMode = 'rotate'
  private editMode: TransformMode = 'rotate'
  private control: ControlId | undefined
  private joint: JointRef | null = null
  private draggingPointer: number | null = null
  private scaleAnchor: number | null = null
  private directTranslate = false
  private translateDrag = new TranslateDrag()
  private parentInverse = new Matrix4()
  private world = new Matrix4()
  private localPosition = new Vector3()
  private startTarget = new Vector3()
  private startLocalPosition = new Vector3()
  private localRotation = new Quaternion()
  private localScale = new Vector3()
  private worldRotationInverse = new Quaternion()
  private ancestorRotation = new Quaternion()
  private resultRotation = new Quaternion()
  private resultVector = new Vector3()

  constructor(
    private scene: Scene,
    private camera: Camera,
    private canvas: HTMLCanvasElement,
    private events: TransformEvents,
  ) {
    this.controls = new TransformControls(camera, canvas)
    // The viewport owns the gesture so a press can grab either a handle or a bone.
    this.controls.disconnect()
    canvas.style.touchAction = 'none'
    this.controls.setMode('rotate')
    this.controls.setSpace('local')
    this.controls.setSize(0.75)
    this.controls.detach()
    const helper = this.controls.getHelper()
    helper.traverse((object) => {
      if (!(object instanceof Mesh || object instanceof Line)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) material.allowOverride = false
    })
    scene.add(this.proxy, helper)
    this.controls.addEventListener('objectChange', this.onChange)
  }

  get dragging(): boolean {
    return this.draggingPointer !== null
  }

  setMode(mode: TransformMode): void {
    if (mode === this.mode) return
    this.cancel()
    this.mode = mode
    this.setEditMode(mode)
  }

  private setEditMode(mode: TransformMode): void {
    if (mode === this.editMode) return
    this.editMode = mode
    this.controls.setMode(mode === 'ik' ? 'translate' : mode)
    this.controls.setSpace(mode === 'translate' || mode === 'ik' ? 'world' : 'local')
  }

  update(
    joint: JointRef | null,
    pose?: Pose,
    skeleton?: CompiledSkeleton,
    confirmed = false,
  ): void {
    if (this.dragging) return
    this.joint = joint
    this.control = this.mode === 'ik' ? joint?.control : undefined
    if (!joint || !pose || !skeleton) {
      if (this.controls.object) this.controls.detach()
      return
    }

    const localOffset = joint.joint * LOCAL_STRIDE
    const parent = skeleton.parents[joint.joint]!
    this.world.fromArray(pose.world, joint.joint * WORLD_STRIDE)
    this.proxy.position.setFromMatrixPosition(this.world)
    const kind = this.control ? controlKind(this.control) : undefined
    this.setEditMode(
      kind === 'rotation' ? 'rotate' : kind === 'translation' ? 'translate' : this.mode,
    )
    if (this.editMode === 'ik') {
      if (this.control) {
        const index = CONTROL_IDS.indexOf(this.control)
        if (
          pose.pinned[index] ||
          (kind === 'target' && !canSolveLimb(skeleton, pose, joint.joint))
        ) {
          this.controls.detach()
          return
        }
        this.proxy.position.fromArray(pose.controlPositions, index * 3)
        this.proxy.quaternion.identity()
        this.attach()
        return
      }
      if (
        (confirmed && pose.ik.tip !== joint.joint) ||
        (pose.ik.tip >= 0 && pose.ik.tip !== joint.joint) ||
        !canSolveLimb(skeleton, pose, joint.joint)
      ) {
        this.controls.detach()
        return
      }
      if (pose.ik.tip === joint.joint) this.proxy.position.fromArray(pose.ik.target)
      this.proxy.quaternion.identity()
      this.attach()
      return
    }
    this.parentInverse.identity()
    if (this.editMode === 'translate' && parent >= 0) {
      this.parentInverse.fromArray(pose.world, parent * WORLD_STRIDE)
      if (this.parentInverse.determinant() === 0) {
        this.controls.detach()
        return
      }
      this.parentInverse.invert()
    }

    const source = this.control ? pose.controlLocal : pose.authored
    this.localPosition.fromArray(source, localOffset)
    this.localRotation.fromArray(source, localOffset + 3)
    this.localScale.fromArray(source, localOffset + 7)
    this.proxy.quaternion.fromArray(pose.local, localOffset + 3)
    // Compose the rotation basis from the hierarchy so scaled parents cannot shear the handles.
    for (let i = parent; i >= 0; i = skeleton.parents[i]!) {
      this.ancestorRotation.fromArray(pose.local, i * LOCAL_STRIDE + 3)
      this.proxy.quaternion.premultiply(this.ancestorRotation)
    }
    this.proxy.quaternion.normalize()
    this.attach()
  }

  private attach(): void {
    this.proxy.scale.setScalar(1)
    this.proxy.updateMatrixWorld()
    if (!this.controls.object) this.controls.attach(this.proxy)
    this.controls.enabled = true
  }

  hover(event: PointerEvent): void {
    if (this.dragging || event.pointerType === 'touch') return
    this.controls.pointerHover(this.controlPointer(event.clientX, event.clientY, event.button))
  }

  grabHandle(event: PointerEvent): boolean {
    if (!this.joint || !this.controls.object) return false
    const pointer = this.controlPointer(event.clientX, event.clientY, 0)
    this.controls.getHelper().updateMatrixWorld(true)
    this.controls.pointerHover(pointer)
    return this.startControls(event.pointerId, pointer)
  }

  grabJoint(pointerId: number, x: number, y: number): boolean {
    if (!this.joint || !this.controls.object) return false
    if (this.editMode === 'scale') {
      // A joint press can land on the scale pivot. Use pointer travel there,
      // since the handles' radial scale divides by the starting radius.
      this.scaleAnchor = x - y
      this.start(pointerId, this.joint)
      return true
    }
    if (this.editMode === 'rotate') {
      this.controls.axis = 'XYZE'
      return this.startControls(pointerId, this.controlPointer(x, y, 0))
    }
    const { width, height } = this.canvas.getBoundingClientRect()
    if (!width || !height) return false
    this.controls.axis = null
    this.directTranslate = true
    this.translateDrag.begin(this.proxy.position, this.camera, x, y, width, height)
    this.start(pointerId, this.joint)
    return true
  }

  move(event: PointerEvent): boolean {
    if (event.pointerId !== this.draggingPointer) return false
    if (this.directTranslate) {
      this.translateDrag.position(event.clientX, event.clientY, this.proxy.position)
      this.proxy.updateMatrixWorld()
      this.onChange()
    } else if (this.scaleAnchor === null) {
      this.controls.pointerMove(this.controlPointer(event.clientX, event.clientY, -1))
    } else {
      this.proxy.scale.setScalar(Math.exp((event.clientX - event.clientY - this.scaleAnchor) / 150))
      this.onChange()
    }
    return true
  }

  finish(pointerId: number): boolean {
    return pointerId === this.draggingPointer && this.end(true)
  }

  cancel(pointerId = this.draggingPointer): boolean {
    return pointerId === this.draggingPointer && this.end(false)
  }

  private end(commit: boolean): boolean {
    const pointer = this.draggingPointer
    if (pointer === null) return false
    this.draggingPointer = null
    this.scaleAnchor = null
    this.directTranslate = false
    this.controls.pointerUp(null)
    if (this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer)
    this.events.transformEnd(commit)
    return true
  }

  dispose(): void {
    this.cancel()
    this.scene.remove(this.proxy, this.controls.getHelper())
    this.controls.dispose()
  }

  private controlPointer(x: number, y: number, button: number): PointerEvent {
    const rect = this.canvas.getBoundingClientRect()
    // TransformControls expects NDC x/y and button despite its DOM PointerEvent type.
    return {
      x: ((x - rect.left) / rect.width) * 2 - 1,
      y: 1 - ((y - rect.top) / rect.height) * 2,
      button,
    } as PointerEvent
  }

  private startControls(pointerId: number, pointer: PointerEvent): boolean {
    if (!this.joint || this.controls.axis === null) return false
    this.controls.getHelper().updateMatrixWorld(true)
    this.controls.pointerDown(pointer)
    if (!this.controls.dragging) return false
    this.start(pointerId, this.joint)
    return true
  }

  private start(pointerId: number, joint: JointRef): void {
    this.draggingPointer = pointerId
    this.startTarget.copy(this.proxy.position)
    this.startLocalPosition.copy(this.proxy.position).applyMatrix4(this.parentInverse)
    this.worldRotationInverse.copy(this.proxy.quaternion).invert()
    this.events.transformStart(joint)
  }

  private onChange = () => {
    if (this.draggingPointer === null) return
    let key: PoseKey | null = null
    if (this.editMode === 'ik') {
      if (this.proxy.position.distanceToSquared(this.startTarget) > 1e-16) {
        key = { channel: 'ikTarget', value: this.proxy.position.toArray() }
      }
    } else if (this.editMode === 'translate') {
      const translation = this.resultVector
        .copy(this.proxy.position)
        .applyMatrix4(this.parentInverse)
        .sub(this.startLocalPosition)
        .add(this.localPosition)
      if (translation.distanceToSquared(this.localPosition) > 1e-16) {
        key = { channel: 'translations', value: translation.toArray() }
      }
    } else if (this.editMode === 'rotate') {
      const rotation = this.resultRotation
        .copy(this.localRotation)
        .multiply(this.worldRotationInverse)
        .multiply(this.proxy.quaternion)
        .normalize()
      if (1 - Math.abs(rotation.dot(this.localRotation)) >= 1e-12) {
        key = { channel: 'rotations', value: rotation.toArray() }
      }
    } else {
      const scale = this.resultVector.copy(this.localScale).multiply(this.proxy.scale)
      if (scale.distanceToSquared(this.localScale) > 1e-16) {
        key = { channel: 'scales', value: scale.toArray() }
      }
    }
    if (key && this.control) key = { channel: 'control', control: this.control, value: key.value }
    this.events.transformChange(key?.value.every(Number.isFinite) ? key : null)
  }
}
