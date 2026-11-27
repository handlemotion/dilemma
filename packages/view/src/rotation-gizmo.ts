import type { JointRef, Quat } from '@dilemma/core'
import { LOCAL_STRIDE, WORLD_STRIDE, type Pose } from '@dilemma/solve'
import { Matrix4, Object3D, Quaternion, Vector3, type Camera, type Scene } from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

export interface RotationEvents {
  rotationStart(joint: JointRef): void
  rotationChange(rotation: Quat | null): void
  rotationEnd(commit: boolean): void
}

/** Turns a three.js gizmo gesture into a local joint rotation. */
export class RotationGizmo {
  private controls: TransformControls
  private proxy = new Object3D()
  private joint: JointRef | null = null
  private world = new Matrix4()
  private scale = new Vector3()
  private local = new Quaternion()
  private basisInverse = new Quaternion()
  private result = new Quaternion()

  constructor(
    private scene: Scene,
    camera: Camera,
    private canvas: HTMLCanvasElement,
    private events: RotationEvents,
  ) {
    const controls = new TransformControls(camera, canvas)
    this.controls = controls
    controls.setMode('rotate')
    controls.setSpace('local')
    controls.setSize(0.75)
    controls.detach()
    scene.add(this.proxy, controls.getHelper())
    canvas.addEventListener('pointerdown', this.onPress, true)
    canvas.addEventListener('lostpointercapture', this.onCaptureLost)
    controls.addEventListener('mouseDown', this.onStart)
    controls.addEventListener('objectChange', this.onChange)
    controls.addEventListener('mouseUp', this.onEnd)
  }

  get dragging(): boolean {
    return this.controls.dragging
  }

  update(joint: JointRef | null, pose: Pose | undefined): void {
    if (this.dragging) return
    this.joint = joint
    if (!joint || !pose) {
      if (this.controls.object) this.controls.detach()
      return
    }
    this.world
      .fromArray(pose.world, joint.joint * WORLD_STRIDE)
      .decompose(this.proxy.position, this.proxy.quaternion, this.scale)
    this.proxy.quaternion.normalize()
    this.local.fromArray(pose.local, joint.joint * LOCAL_STRIDE + 3)
    if (!this.controls.object) this.controls.attach(this.proxy)
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPress, true)
    this.canvas.removeEventListener('lostpointercapture', this.onCaptureLost)
    this.scene.remove(this.proxy, this.controls.getHelper())
    this.controls.dispose()
  }

  private onPress = (event: PointerEvent) => {
    if (this.dragging) return
    this.controls.enabled =
      Boolean(this.controls.object) &&
      event.button === 0 &&
      !event.altKey &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey
  }

  private onStart = () => {
    if (!this.joint) return
    this.basisInverse.copy(this.proxy.quaternion).invert()
    this.events.rotationStart(this.joint)
  }

  private onChange = () => {
    if (!this.dragging || !this.joint) return
    const q = this.result
      .copy(this.local)
      .multiply(this.basisInverse)
      .multiply(this.proxy.quaternion)
      .normalize()
    if (1 - Math.abs(q.dot(this.local)) < 1e-12) {
      this.events.rotationChange(null)
    } else {
      this.events.rotationChange(q.toArray())
    }
  }

  private onEnd = () => this.events.rotationEnd(true)

  private onCaptureLost = () => {
    if (!this.dragging) return
    this.events.rotationEnd(false)
    this.controls.pointerUp(null)
  }
}
