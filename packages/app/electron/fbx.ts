import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { missing, writeWholeSoon } from './atomic.ts'
import { FBX_BAKE_FPS } from './ipc.ts'

const execFileAsync = promisify(execFile)

// Blender cannot read scripts from Electron's ASAR. Pass our fixed script and keep data in argv.
const convert = String.raw`
import sys
from math import isclose
import bpy

source, target, name, rate, last_frame = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = name or 'Animation'
fps = float(rate)
# The intermediate GLB uses a whole frame rate so the importer puts each sample on its frame.
scene.render.fps = ${FBX_BAKE_FPS}
scene.render.fps_base = 1.0
if bpy.ops.import_scene.gltf(filepath=source) != {'FINISHED'}:
    raise RuntimeError('Could not import the baked GLB.')

scene.render.fps = max(1, min(32767, round(fps)))
scene.render.fps_base = scene.render.fps / fps
scene.frame_start = 0
scene.frame_end = int(last_frame)
if not isclose(scene.render.fps / scene.render.fps_base, fps, rel_tol=1e-6) or scene.frame_end != int(last_frame):
    raise RuntimeError('The clip timing is outside Blender\'s supported range.')
scene.frame_set(0)
if bpy.ops.export_scene.fbx(
    filepath=target,
    object_types={'ARMATURE', 'EMPTY', 'MESH'},
    add_leaf_bones=False,
    apply_scale_options='FBX_SCALE_UNITS',
    bake_anim_use_nla_strips=False,
    bake_anim_use_all_actions=False,
    bake_anim_simplify_factor=0.0,
    path_mode='COPY',
    embed_textures=True,
) != {'FINISHED'}:
    raise RuntimeError('Could not write the FBX.')
`

async function blenderExecutable(): Promise<string> {
  const executable = 'Blender.app/Contents/MacOS/Blender'
  const folders = [
    '/Applications',
    path.join(homedir(), 'Applications'),
    path.join(homedir(), 'Library/Application Support/Steam/steamapps/common/Blender'),
  ]
  for (const folder of folders) {
    const file = path.join(folder, executable)
    try {
      await access(file, constants.X_OK)
      return file
    } catch {
      // Try the next installation.
    }
  }
  return 'blender'
}

export async function writeFbx(
  file: string,
  bytes: ArrayBuffer,
  name: string,
  fps: number,
  lastFrame: number,
): Promise<void> {
  const executable = await blenderExecutable()
  const temp = await mkdtemp(path.join(tmpdir(), 'dilemma-fbx-'))
  try {
    const input = path.join(temp, 'animation.glb')
    const output = path.join(temp, 'animation.fbx')
    await writeFile(input, new Uint8Array(bytes))
    try {
      await execFileAsync(
        executable,
        [
          '--background',
          '--factory-startup',
          '--disable-autoexec',
          '--python-exit-code',
          '1',
          '--python-expr',
          convert,
          '--',
          input,
          output,
          name,
          String(fps),
          String(lastFrame),
        ],
        { cwd: temp, timeout: 120_000 },
      )
    } catch (error) {
      if (missing(error)) {
        throw new Error('Blender was not found. Install Blender to export FBX.', { cause: error })
      }
      const failure = error as { killed?: boolean; stderr?: string; stdout?: string }
      if (failure.killed) {
        throw new Error('Blender took too long to export the FBX.', { cause: error })
      }
      console.error('Blender FBX export failed', failure.stderr, failure.stdout)
      throw new Error('Blender could not convert the baked animation to FBX.', { cause: error })
    }
    const fbx = await readFile(output)
    if (!fbx.length) throw new Error('Blender returned an empty FBX file.')
    await writeWholeSoon(file, fbx)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}
