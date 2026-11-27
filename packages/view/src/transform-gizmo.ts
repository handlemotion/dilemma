import type { JointRef, TransformKey } from '@dilemma/core'
import { LOCAL_STRIDE, WORLD_STRIDE, type CompiledSkeleton, type Pose } from '@dilemma/solve'
import { Matrix4, Object3D, Quaternion, Vector3, type Camera, type Scene } from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

export type TransformMode = 'select' | 'translate' | 'rotate' | 'scale'

export interface TransformEvents {
  transformStart(joint: JointRef): void
  transformChange(key: TransformKey | null): void
  transformEnd(commit: boolean): void
}

/** Adapts three.js handles to changes in one joint's local transform. */
export class TransformGizmo {
  private controls: TransformControls
  private proxy = new Object3D()
  private mode: TransformMode = 'rotate'
  private joint: JointRef | null = null
  private draggingPointer: number | null = null
  private pointer: number | null = null
  private parentInverse = new Matrix4()
  private world = new Matrix4()
  private localPosition = new Vector3()
  private localRotation = new Quaternion()
  private localScale = new Vector3()
  private worldRotationInverse = new Quaternion()
  private ancestorRotation = new Quaternion()
  private resultRotation = new Quaternion()
  private resultVector = new Vector3()

  constructor(
    private scene: Scene,
    camera: Camera,
    private canvas: HTMLCanvasElement,
    private events: TransformEvents,
  ) {
    this.controls = new TransformControls(camera, canvas)
    this.controls.setMode('rotate')
    this.controls.setSpace('local')
    this.controls.setSize(0.75)
    this.controls.detach()
    scene.add(this.proxy, this.controls.getHelper())
    canvas.addEventListener('pointerdown', this.onPress, true)
    canvas.addEventListener('pointercancel', this.onCaptureLost)
    canvas.addEventListener('lostpointercapture', this.onCaptureLost)
    this.controls.addEventListener('mouseDown', this.onStart)
    this.controls.addEventListener('objectChange', this.onChange)
    this.controls.addEventListener('mouseUp', this.onEnd)
  }

  get dragging(): boolean {
    return this.controls.dragging
  }

  setMode(mode: TransformMode): void {
    if (mode === this.mode) return
    this.cancel()
    this.mode = mode
    if (mode === 'select') this.controls.detach()
    else {
      this.controls.setMode(mode)
      this.controls.setSpace(mode === 'translate' ? 'world' : 'local')
    }
  }

  update(joint: JointRef | null, pose?: Pose, skeleton?: CompiledSkeleton): void {
    if (this.dragging) return
    this.joint = joint
    if (this.mode === 'select' || !joint || !pose || !skeleton) {
      if (this.controls.object) this.controls.detach()
      return
    }

    const localOffset = joint.joint * LOCAL_STRIDE
    const parent = skeleton.parents[joint.joint]!
    this.parentInverse.identity()
    if (this.mode === 'translate' && parent >= 0) {
      this.parentInverse.fromArray(pose.world, parent * WORLD_STRIDE)
      if (this.parentInverse.determinant() === 0) {
        this.controls.detach()
        return
      }
      this.parentInverse.invert()
    }

    this.localPosition.fromArray(pose.local, localOffset)
    this.localRotation.fromArray(pose.local, localOffset + 3)
    this.localScale.fromArray(pose.local, localOffset + 7)
    this.world.fromArray(pose.world, joint.joint * WORLD_STRIDE)
    this.proxy.position.setFromMatrixPosition(this.world)
    this.proxy.quaternion.copy(this.localRotation)
    // Compose the rotation basis from the hierarchy so scaled parents cannot shear the handles.
    for (let i = parent; i >= 0; i = skeleton.parents[i]!) {
      this.ancestorRotation.fromArray(pose.local, i * LOCAL_STRIDE + 3)
      this.proxy.quaternion.premultiply(this.ancestorRotation)
    }
    this.proxy.quaternion.normalize()
    this.proxy.scale.setScalar(1)
    this.proxy.updateMatrixWorld()
    if (!this.controls.object) this.controls.attach(this.proxy)
    this.controls.enabled = true
  }

  cancel(): boolean {
    const pointer = this.draggingPointer
    if (pointer === null) return false
    this.draggingPointer = null
    this.controls.pointerUp(null)
    // Remove the addon's temporary pointermove handler even without a native pointerup.
    this.controls.disconnect()
    this.controls.connect(this.canvas)
    if (this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer)
    this.events.transformEnd(false)
    return true
  }

  dispose(): void {
    this.cancel()
    this.canvas.removeEventListener('pointerdown', this.onPress, true)
    this.canvas.removeEventListener('pointercancel', this.onCaptureLost)
    this.canvas.removeEventListener('lostpointercapture', this.onCaptureLost)
    this.scene.remove(this.proxy, this.controls.getHelper())
    this.controls.dispose()
  }

  private onPress = (event: PointerEvent) => {
    if (this.dragging) return
    this.pointer = event.pointerId
    this.controls.enabled =
      Boolean(this.controls.object) &&
      event.isPrimary &&
      event.button === 0 &&
      !event.altKey &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey
  }

  private onStart = () => {
    if (!this.joint || this.pointer === null) return
    this.draggingPointer = this.pointer
    this.worldRotationInverse.copy(this.proxy.quaternion).invert()
    this.events.transformStart(this.joint)
  }

  private onChange = () => {
    if (this.draggingPointer === null) return
    let key: TransformKey | null = null
    if (this.mode === 'translate') {
      const translation = this.resultVector
        .copy(this.proxy.position)
        .applyMatrix4(this.parentInverse)
      if (translation.distanceToSquared(this.localPosition) > 1e-16) {
        key = { channel: 'translations', value: translation.toArray() }
      }
    } else if (this.mode === 'rotate') {
      const rotation = this.resultRotation
        .copy(this.localRotation)
        .multiply(this.worldRotationInverse)
        .multiply(this.proxy.quaternion)
        .normalize()
      if (1 - Math.abs(rotation.dot(this.localRotation)) >= 1e-12) {
        key = { channel: 'rotations', value: rotation.toArray() }
      }
    } else if (this.mode === 'scale') {
      const scale = this.resultVector.copy(this.localScale).multiply(this.proxy.scale)
      if (scale.distanceToSquared(this.localScale) > 1e-16) {
        key = { channel: 'scales', value: scale.toArray() }
      }
    }
    this.events.transformChange(key?.value.every(Number.isFinite) ? key : null)
  }

  private onEnd = () => {
    if (this.draggingPointer === null) return
    this.draggingPointer = null
    this.events.transformEnd(true)
  }

  private onCaptureLost = (event: PointerEvent) => {
    if (event.pointerId === this.draggingPointer) this.cancel()
  }
}
