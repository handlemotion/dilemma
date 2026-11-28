import { PerspectiveCamera, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { TranslateDrag } from './translate-drag.ts'

it('moves an off-center grab by the exact screen delta without a jump or camera drift', () => {
  const width = 900
  const height = 600
  const camera = new PerspectiveCamera(37, width / height, 0.01, 100)
  camera.position.set(2, 1.8, 3)
  camera.lookAt(0, 1, 0)
  camera.updateMatrixWorld()
  const originalView = camera.clone()
  const handle = new Vector3(0.1, 1.05, -0.15)
  const origin = handle.clone().project(camera)
  const drag = new TranslateDrag()
  const point = new Vector3()
  drag.begin(handle, camera, 460, 286, width, height)
  expect(drag.position(460, 286, point).distanceTo(handle)).toBeLessThan(1e-10)

  camera.position.set(-5, 2, 4)
  camera.lookAt(0, 1, 0)
  camera.updateMatrixWorld()
  const moved = drag.position(469, 316, point).project(originalView)
  expect(((moved.x - origin.x) * width) / 2).toBeCloseTo(9, 8)
  expect(((origin.y - moved.y) * height) / 2).toBeCloseTo(30, 8)
  expect(moved.z).toBeCloseTo(origin.z, 10)
})
