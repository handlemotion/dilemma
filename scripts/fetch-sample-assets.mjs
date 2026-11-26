// Downloads the skinned test characters from the Khronos glTF Sample Assets
// into fixtures/khronos/, with each model's license file. Tests that need them
// skip when they are missing. Check LICENSE.md in each folder before reuse.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models'
const MODELS = [
  { name: 'CesiumMan', file: 'glTF-Binary/CesiumMan.glb' },
  { name: 'RiggedFigure', file: 'glTF-Binary/RiggedFigure.glb' },
  { name: 'Fox', file: 'glTF-Binary/Fox.glb' },
]

const root = path.resolve(import.meta.dirname, '..', 'fixtures', 'khronos')

for (const model of MODELS) {
  const dir = path.join(root, model.name)
  await mkdir(dir, { recursive: true })
  for (const file of [model.file, 'LICENSE.md']) {
    const url = `${BASE}/${model.name}/${file}`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: ${response.status}`)
    await writeFile(path.join(dir, path.basename(file)), Buffer.from(await response.arrayBuffer()))
  }
  console.log(`fetched ${model.name}`)
}
