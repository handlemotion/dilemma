// Test fixtures. Not exported from the package.

const f32 = (values: number[]) => new Float32Array(values)

/**
 * A three-joint arm under a rotated, scaled armature node, skinning a strip of
 * six vertices, with a 20-frame clip at 30 fps.
 */
export function syntheticGltf(): string {
  const positions = f32([-0.1, 0, 0, 0.1, 0, 0, -0.1, 1, 0, 0.1, 1, 0, -0.1, 2, 0, 0.1, 2, 0])
  const joints = new Uint8Array([
    0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0,
  ])
  const weights = f32(Array.from({ length: 6 }, () => [1, 0, 0, 0]).flat())
  // Inverse bind matrices: joints at y = 0, 1, 2 in armature space.
  const ibm = f32([0, 1, 2].flatMap((y) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -y, 0, 1]))
  const s = Math.SQRT1_2
  const times = f32([0, 10 / 30, 20 / 30])
  const rotations = f32([0, 0, 0, 1, 0, 0, s, s, 0, 0, 1, 0])
  const rootMoves = f32([0, 0, 0, 0.5, 0, 0, 0.5, 0.25, 0])
  const indices = new Uint16Array([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4])

  const chunks = [positions, joints, weights, ibm, times, rotations, rootMoves, indices]
  const views: { byteOffset: number; byteLength: number }[] = []
  let length = 0
  for (const chunk of chunks) {
    views.push({ byteOffset: length, byteLength: chunk.byteLength })
    length += Math.ceil(chunk.byteLength / 4) * 4
  }
  const buffer = new Uint8Array(length)
  chunks.forEach((chunk, i) => buffer.set(new Uint8Array(chunk.buffer), views[i]!.byteOffset))

  return JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 4] }],
    nodes: [
      { name: 'Armature', rotation: [0, s, 0, s], scale: [0.5, 0.5, 0.5], children: [1] },
      { name: 'root', children: [2] },
      { name: 'elbow', translation: [0, 1, 0], children: [3] },
      { name: 'wrist', translation: [0, 1, 0] },
      { name: 'Arm', mesh: 0, skin: 0 },
    ],
    skins: [{ joints: [1, 2, 3], inverseBindMatrices: 3, skeleton: 1 }],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 }, indices: 7 }],
      },
    ],
    animations: [
      {
        name: 'Wave',
        samplers: [
          { input: 4, output: 5, interpolation: 'LINEAR' },
          { input: 4, output: 6, interpolation: 'LINEAR' },
        ],
        channels: [
          { sampler: 0, target: { node: 2, path: 'rotation' } },
          { sampler: 1, target: { node: 1, path: 'translation' } },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 6,
        type: 'VEC3',
        min: [-0.1, 0, 0],
        max: [0.1, 2, 0],
      },
      { bufferView: 1, componentType: 5121, count: 6, type: 'VEC4' },
      { bufferView: 2, componentType: 5126, count: 6, type: 'VEC4' },
      { bufferView: 3, componentType: 5126, count: 3, type: 'MAT4' },
      { bufferView: 4, componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [20 / 30] },
      { bufferView: 5, componentType: 5126, count: 3, type: 'VEC4' },
      { bufferView: 6, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 7, componentType: 5123, count: 12, type: 'SCALAR' },
    ],
    bufferViews: views.map((v) => ({ buffer: 0, ...v })),
    buffers: [
      {
        byteLength: length,
        uri: `data:application/octet-stream;base64,${Buffer.from(buffer).toString('base64')}`,
      },
    ],
  })
}
