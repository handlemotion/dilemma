import { Matrix4, Vector3, type Camera } from 'three'

/** Move at the handle's starting depth in the camera's starting view plane. */
export class TranslateDrag {
  private inverseProjection = new Matrix4()
  private origin = new Vector3()
  private x = 0
  private y = 0
  private width = 1
  private height = 1

  begin(point: Vector3, camera: Camera, x: number, y: number, width: number, height: number): void {
    this.origin.copy(point).project(camera)
    this.inverseProjection.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse)
    this.x = x
    this.y = y
    this.width = width
    this.height = height
  }

  position(x: number, y: number, result: Vector3): Vector3 {
    return result
      .set(
        this.origin.x + ((x - this.x) * 2) / this.width,
        this.origin.y - ((y - this.y) * 2) / this.height,
        this.origin.z,
      )
      .applyMatrix4(this.inverseProjection)
  }
}
