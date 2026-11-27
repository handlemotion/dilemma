import { addCharacter, type Skeleton } from '@dilemma/core'
import { exportGlb, loadGltf, type CharacterAssets } from '@dilemma/io'
import { compileClip, compileSkeleton, createPose, solvePose } from '@dilemma/solve'
import { activeClip } from './animation.ts'
import { bridge } from './bridge.ts'
import { rememberBrowserSource } from './browser-session.ts'
import { editor } from './editor.ts'
import { useUi } from './ui-store.ts'
import { FBX_BAKE_FPS, type OpenedFile } from '../electron/ipc.ts'

let observedDoc = editor.getState().doc
let savedProject = JSON.stringify(observedDoc)
let fileQueue = Promise.resolve()

const unsubscribeProject = editor.subscribe(({ doc }) => {
  if (doc === observedDoc) return
  observedDoc = doc
  useUi.setState({ projectDirty: JSON.stringify(doc) !== savedProject })
})
import.meta.hot?.dispose(unsubscribeProject)

function fileOperation(activity: string, run: () => Promise<void>): Promise<void> {
  fileQueue = fileQueue.then(async () => {
    const ui = useUi.getState()
    ui.setLoading(activity)
    ui.setError(null)
    try {
      await run()
    } catch (error) {
      ui.setError(error instanceof Error ? error.message : String(error))
    } finally {
      ui.setLoading(null)
    }
  })
  return fileQueue
}

export function importCharacter(file?: File | OpenedFile): Promise<void> {
  return fileOperation('Importing character…', async () => {
    const browserFile = !bridge && file instanceof File ? file : null
    const browserUrl = browserFile ? URL.createObjectURL(browserFile) : null
    try {
      const opened =
        file && !(file instanceof File)
          ? file
          : file
            ? bridge
              ? await bridge.openDroppedFile(file)
              : { url: browserUrl!, name: file.name, path: file.name }
            : await bridge?.openCharacter()
      if (!opened) return
      const imported = await loadGltf(opened.url, {
        name: opened.name.replace(/\.(glb|gltf)$/i, ''),
      })
      imported.character.source.uri = opened.path
      // Assets first, so the viewport has the mesh when the document arrives.
      useUi.getState().addAssets(imported.character.id, imported.assets)
      if (browserFile) rememberBrowserSource(imported.character.id, browserFile)
      editor.run(addCharacter(imported.character, imported.clips))
    } finally {
      if (browserUrl) URL.revokeObjectURL(browserUrl)
    }
  })
}

export function saveProject(saveAs = false): Promise<void> {
  return fileOperation('Saving project…', async () => {
    const { doc } = editor.getState()
    const ui = useUi.getState()
    const file = await bridge?.saveProject(doc, ui.projectPath, saveAs)
    if (!file) return
    savedProject = JSON.stringify(doc)
    useUi.setState({
      projectPath: file,
      projectDirty: observedDoc !== doc && JSON.stringify(observedDoc) !== savedProject,
    })
  })
}

export function openProject(): Promise<void> {
  return fileOperation('Opening project…', async () => {
    const opened = await bridge?.openProject()
    if (!opened) return
    const { doc, sources } = opened
    const assets = new Map<string, CharacterAssets>()
    const characters = await Promise.all(
      doc.characters.map(async (character, i) => {
        const source = sources[i]!
        const imported = await loadGltf(source.url, {
          id: character.id,
          name: character.name,
          skipAnimations: true,
        })
        if (!sameSkeleton(imported.character.skeleton, character.skeleton)) {
          throw new Error(`The source skeleton has changed for ${character.name}: ${source.path}`)
        }
        assets.set(character.id, imported.assets)
        return { ...character, source: { uri: source.path } }
      }),
    )
    const current = editor.getState().doc
    if (
      JSON.stringify(current) !== savedProject &&
      !window.confirm('Open this project and discard unsaved changes?')
    )
      return
    const restored = { ...doc, characters }
    const ui = useUi.getState()
    ui.setPlaying(false)
    ui.setTransformDraft(null)
    ui.setTimelineRange(null)
    ui.setWorkArea(null)
    ui.setPreviewFrame(restored.sceneTiming.start)
    ui.setAssets(assets)
    savedProject = JSON.stringify(restored)
    editor.load(restored)
    ui.setProjectPath(opened.path)
  })
}

function sameSkeleton(source: Skeleton, saved: Skeleton): boolean {
  return (
    source.joints.length === saved.joints.length &&
    source.joints.every((joint, index) => {
      const previous = saved.joints[index]!
      const { translation, rotation, scale } = joint.rest
      const channels = [previous.rest.translation, previous.rest.rotation, previous.rest.scale]
      return (
        joint.name === previous.name &&
        joint.parent === previous.parent &&
        [translation, rotation, scale].every((values, channel) =>
          values.every((value, i) => Math.abs(value - channels[channel]![i]!) < 1e-6),
        )
      )
    })
  )
}

export function exportAnimation(format: 'glb' | 'fbx' = 'glb'): Promise<void> {
  return fileOperation(`Exporting ${format.toUpperCase()}…`, async () => {
    const clip = activeClip()
    if (!clip) return
    const character = editor
      .getState()
      .doc.characters.find((entry) => entry.id === clip.characterId)
    const assets = useUi.getState().assets.get(clip.characterId)
    if (!character || !assets) throw new Error('The clip has no loaded character.')
    const skeleton = compileSkeleton(character.skeleton)
    const compiled = compileClip(clip, skeleton.count)
    const pose = createPose(skeleton)
    const bake = format === 'fbx' ? { ...clip, fps: FBX_BAKE_FPS } : clip
    const bytes = await exportGlb(assets, bake, (frame) => {
      solvePose(skeleton, compiled, frame, pose)
      return pose.local
    })
    if (format === 'fbx') {
      await bridge?.exportFbx(bytes, clip.name, clip.fps, clip.end - clip.start)
    } else {
      await bridge?.exportGlb(bytes, clip.name)
    }
  })
}
