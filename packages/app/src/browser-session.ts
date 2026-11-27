import { migrate, type DilemmaDocument } from '@dilemma/core'
import { loadGltf } from '@dilemma/io'
import { bridge } from './bridge.ts'
import { editor } from './editor.ts'
import { useUi } from './ui-store.ts'

const STORE = 'workspace'
const KEY = 'current'
const sourceFiles = new Map<string, File>()

interface SavedWorkspace {
  document: DilemmaDocument
  files: [string, File][]
}

export function rememberBrowserSource(id: string, file: File): void {
  sourceFiles.set(id, file)
}

export async function restoreBrowserWorkspace(): Promise<void> {
  if (bridge) return
  const ui = useUi.getState()
  try {
    const db = await openDatabase()
    const saved = await new Promise<SavedWorkspace | undefined>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(KEY)
      request.addEventListener('success', () => resolve(request.result), { once: true })
      request.addEventListener('error', () => reject(request.error), { once: true })
    })
    if (saved) {
      const document = migrate(saved.document)
      const files = new Map(saved.files)
      const restored = await Promise.all(
        document.characters.map(async (character) => {
          const file = files.get(character.id)
          if (!file) throw new Error(`Missing source for ${character.name}.`)
          const url = URL.createObjectURL(file)
          try {
            const { assets } = await loadGltf(url, { id: character.id, name: character.name })
            return { id: character.id, file, assets }
          } finally {
            URL.revokeObjectURL(url)
          }
        }),
      )
      for (const { id, file, assets } of restored) {
        rememberBrowserSource(id, file)
        ui.addAssets(id, assets)
      }
      editor.load(document)
    }

    let lastSaved = editor.getState().doc
    editor.subscribe(({ doc }) => {
      if (doc === lastSaved) return
      lastSaved = doc
      try {
        const files: SavedWorkspace['files'] = []
        for (const character of doc.characters) {
          const file = sourceFiles.get(character.id)
          if (!file) throw new Error(`Missing source for ${character.name}.`)
          files.push([character.id, file])
        }
        const save = db.transaction(STORE, 'readwrite')
        save.addEventListener('abort', () => ui.setError('Could not save the browser workspace.'), {
          once: true,
        })
        save.objectStore(STORE).put({ document: doc, files } satisfies SavedWorkspace, KEY)
      } catch {
        ui.setError('Could not save the browser workspace.')
      }
    })
  } catch (error) {
    ui.setError(
      `Could not restore the browser workspace. ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dilemma', 1)
    request.addEventListener('upgradeneeded', () => request.result.createObjectStore(STORE), {
      once: true,
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
}
