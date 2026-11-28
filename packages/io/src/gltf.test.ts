import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { fromGltf, guessFps } from './gltf.ts'
import { syntheticGltf } from './fixtures.ts'
import { compareWithThree } from './testing.ts'

const MM = 1e-3

/**
 * Node can't decode images, and the comparison only needs the skeleton and skinning, so
 * every texture loads as a blank one.
 */
async function parse(data: string | ArrayBuffer, resourcePath = '') {
  const loader = new GLTFLoader()
  loader.register(() => ({
    name: 'BLANK_TEXTURES',
    loadTexture: () => Promise.resolve(new Texture()),
  }))
  return loader.parseAsync(data, resourcePath)
}

describe('glTF import', () => {
  it('builds the skeleton, baking the armature transform into the root', async () => {
    const imported = fromGltf(await parse(syntheticGltf()), 'arm.gltf', { id: 'arm' })
    const { joints } = imported.character.skeleton
    expect(joints.map((j) => [j.name, j.parent])).toEqual([
      ['root', -1],
      ['elbow', 0],
      ['wrist', 1],
    ])
    expect(imported.character.name).toBe('arm')
    expect(joints[0]!.rest.scale[0]).toBeCloseTo(0.5, 6)
    expect(joints[1]!.rest.translation).toEqual([0, 1, 0])
  })

  it('bakes the clip onto integer frames at the detected rate', async () => {
    const imported = fromGltf(await parse(syntheticGltf()), 'arm.gltf')
    const clip = imported.clips[0]!
    expect(clip).toMatchObject({ name: 'Wave', fps: 30, start: 0, end: 20 })
    for (const track of clip.tracks) {
      for (const channel of [track.translations, track.rotations, track.scales]) {
        if (channel) expect(channel.frames?.every(Number.isInteger)).toBe(true)
      }
    }
    // The wrist never moves relative to its parent, so it has no track.
    expect(clip.tracks.map((t) => t.joint).toSorted()).toEqual([0, 1])
  })

  it('matches three.js joint and skinned vertex positions at every frame', async () => {
    const json = syntheticGltf()
    const imported = fromGltf(await parse(json), 'arm.gltf')
    const reference = await parse(json)
    const divergence = compareWithThree(imported, {
      root: reference.scene,
      animations: reference.animations,
    })
    expect(divergence.joint).toBeLessThan(MM / 10)
    expect(divergence.vertex).toBeLessThan(MM / 10)
  })

  it('serializes to plain JSON', async () => {
    const imported = fromGltf(await parse(syntheticGltf()), 'arm.gltf')
    const data = { character: imported.character, clips: imported.clips }
    expect(JSON.parse(JSON.stringify(data))).toEqual(data)
  })

  it('refuses a file without a skinned mesh', async () => {
    const json = JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{}],
    })
    await expect(parse(json).then((g) => fromGltf(g, 'empty.gltf'))).rejects.toThrow(
      /no skinned mesh/,
    )
  })

  it('guesses frame rates from key times', () => {
    expect(guessFps([0, 1 / 24, 2 / 24])).toBe(24)
    expect(guessFps([0, 1 / 30, 0.5])).toBe(30)
    expect(guessFps([0, 0.0123])).toBe(30)
  })
})

/**
 * Khronos sample characters, fetched by `pnpm fetch-assets` into
 * fixtures/khronos/. Each must load and match three.js within 1 mm.
 */
const KHRONOS = path.resolve(import.meta.dirname, '../../../fixtures/khronos')
const samples = existsSync(KHRONOS)
  ? readdirSync(KHRONOS, { recursive: true, encoding: 'utf8' }).filter((f) =>
      /\.(glb|gltf)$/i.test(f),
    )
  : []

describe.skipIf(samples.length === 0)('Khronos sample characters', () => {
  it.each(samples)('%s matches three.js within 1 mm', async (file) => {
    const full = path.join(KHRONOS, file)
    const bytes = readFileSync(full)
    const data = file.endsWith('.glb')
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : bytes.toString('utf8')
    const dir = `file://${path.dirname(full)}/`
    const imported = fromGltf(await parse(data, dir), full)
    const reference = await parse(data, dir)
    const divergence = compareWithThree(imported, {
      root: reference.scene,
      animations: reference.animations,
    })
    expect(divergence.joint).toBeLessThan(MM)
    expect(divergence.vertex).toBeLessThan(MM)
  })
})
