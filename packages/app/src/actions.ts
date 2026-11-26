import { addCharacter } from '@dilemma/core'
import { loadGltf } from '@dilemma/io'
import { bridge } from './bridge.ts'
import { editor } from './editor.ts'
import { useUi } from './ui-store.ts'
import type { OpenedFile } from '../electron/ipc.ts'

export async function importCharacter(file?: File | OpenedFile): Promise<void> {
  const ui = useUi.getState()
  try {
    const opened =
      file && !(file instanceof File)
        ? file
        : file
          ? bridge
            ? await bridge.openDroppedFile(file)
            : { url: URL.createObjectURL(file), name: file.name, path: file.name }
          : await bridge?.openCharacter()
    if (!opened) return
    ui.setError(null)
    ui.setLoading(opened.name)
    const imported = await loadGltf(opened.url, { name: opened.name.replace(/\.(glb|gltf)$/i, '') })
    imported.character.source.uri = opened.path
    // Assets first, so the viewport has the mesh when the document arrives.
    ui.addAssets(imported.character.id, imported.assets)
    editor.run(addCharacter(imported.character, imported.clips))
  } catch (error) {
    ui.setError(error instanceof Error ? error.message : String(error))
  } finally {
    ui.setLoading(null)
  }
}
