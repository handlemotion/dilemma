import type { JointRef } from '@dilemma/core'
import { WORLD_STRIDE, type Pose } from '@dilemma/solve'
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Points,
  PointsMaterial,
} from 'three'

export interface MotionTrailData {
  joint: JointRef
  start: number
  end: number
  points: Float32Array
  keyPoints: Float32Array
}

export class MotionTrail {
  readonly group = new Group()
  private line = new Line(
    new BufferGeometry(),
    new LineBasicMaterial({
      color: '#007be6',
      depthTest: false,
      depthWrite: false,
      allowOverride: false,
    }),
  )
  private keys = new Points(
    new BufferGeometry(),
    new PointsMaterial({
      color: '#007be6',
      size: 5,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      allowOverride: false,
    }),
  )
  private position = new BufferAttribute(new Float32Array(3), 3)
  private cursor = new Points(
    new BufferGeometry().setAttribute('position', this.position),
    new PointsMaterial({
      color: '#fa4c4d',
      size: 7,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      allowOverride: false,
    }),
  )
  private data: MotionTrailData | null = null

  constructor() {
    this.group.visible = false
    this.line.renderOrder = 3
    this.keys.renderOrder = 4
    this.cursor.renderOrder = 5
    this.cursor.frustumCulled = false
    this.group.add(this.line, this.keys, this.cursor)
  }

  setData(data: MotionTrailData | null): void {
    this.data = data
    this.group.visible = data !== null
    this.cursor.visible = false
    for (const [object, points] of [
      [this.line, data?.points],
      [this.keys, data?.keyPoints],
    ] as const) {
      object.geometry.dispose()
      object.geometry = new BufferGeometry()
      object.visible = !!points?.length
      if (points?.length) object.geometry.setAttribute('position', new BufferAttribute(points, 3))
    }
  }

  setFrame(characterId: string, frame: number, pose: Pose): void {
    const data = this.data
    if (data?.joint.characterId !== characterId) return
    this.cursor.visible = frame >= data.start && frame <= data.end
    if (!this.cursor.visible) return
    const offset = data.joint.joint * WORLD_STRIDE + 12
    this.position.setXYZ(0, pose.world[offset]!, pose.world[offset + 1]!, pose.world[offset + 2]!)
    this.position.needsUpdate = true
  }

  dispose(): void {
    for (const object of [this.line, this.keys, this.cursor]) {
      object.geometry.dispose()
      object.material.dispose()
    }
  }
}
