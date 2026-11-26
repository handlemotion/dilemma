import { useEffect, useState } from 'react'
import { importCharacter } from './actions.ts'
import { bridge } from './bridge.ts'
import { NavigationSettings } from './components/navigation-settings.tsx'
import { Outliner } from './components/outliner.tsx'
import { Timeline } from './components/timeline.tsx'
import { activeViewport, ViewportPanel } from './components/viewport-panel.tsx'
import { editor, useEditorState } from './editor.ts'
import { usePlayback } from './playback.ts'
import { useUi } from './ui-store.ts'

export function App() {
  usePlayback()
  useShortcuts()
  const empty = useEditorState((s) => s.doc.characters.length === 0)
  const canUndo = useEditorState((s) => s.canUndo)
  const canRedo = useEditorState((s) => s.canRedo)
  const loading = useUi((s) => s.loading)
  const error = useUi((s) => s.error)
  const fps = useUi((s) => s.fps)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className="grid h-full grid-cols-[1fr_240px] grid-rows-[38px_1fr_132px]"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) void importCharacter(file)
      }}
    >
      <header
        className={`drag-region col-span-2 flex items-center gap-1 border-b border-line bg-panel pr-3 ${
          bridge?.platform === 'darwin' ? 'pl-20' : 'pl-3'
        }`}
      >
        <span className="mr-3 font-medium tracking-wide text-ink">Dilemma</span>
        <ToolbarButton
          onClick={() => void importCharacter()}
          disabled={!bridge}
          title="Import Character (⌘O)"
        >
          Import
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.undo()} disabled={!canUndo} title="Undo (⌘Z)">
          Undo
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.redo()} disabled={!canRedo} title="Redo (⇧⌘Z)">
          Redo
        </ToolbarButton>
        <ToolbarButton
          onClick={() => activeViewport()?.frameSelection()}
          title="Frame Selection (F)"
        >
          Frame
        </ToolbarButton>
        <span className="ml-auto font-mono tabular-nums text-faint">{fps} fps</span>
        <NavigationSettings />
      </header>

      <main className="relative min-h-0 min-w-0">
        <ViewportPanel />
        {(empty || dragging) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p
              className={`rounded-lg border border-dashed px-6 py-4 text-[13px] ${
                dragging ? 'border-accent text-accent' : 'border-line text-muted'
              }`}
            >
              {loading ? `Loading ${loading}…` : 'Drop a skinned .glb or .gltf here, or press ⌘O'}
            </p>
          </div>
        )}
        {error && (
          <div className="absolute top-3 left-3 max-w-md rounded border border-red-400/40 bg-red-950/80 px-3 py-2 text-red-200">
            {error}
            <button
              type="button"
              className="ml-3 text-red-300 underline"
              onClick={() => useUi.getState().setError(null)}
            >
              Dismiss
            </button>
          </div>
        )}
        <NavigationHint />
      </main>

      <aside className="row-span-2 min-h-0 border-l border-line bg-panel">
        <h2 className="border-b border-line px-3 py-2 text-[11px] font-medium tracking-wider text-faint uppercase">
          Skeleton
        </h2>
        <div className="h-[calc(100%-33px)]">
          <Outliner />
        </div>
      </aside>

      <div className="min-w-0">
        <Timeline />
      </div>
    </div>
  )
}

function ToolbarButton(props: {
  onClick(): void
  disabled?: boolean
  title: string
  children: string
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className="rounded px-2 py-1 text-muted hover:bg-raised hover:text-ink disabled:text-faint disabled:hover:bg-transparent"
    >
      {props.children}
    </button>
  )
}

function NavigationHint() {
  return (
    <p className="pointer-events-none absolute right-3 bottom-2 text-[11px] text-faint">
      Alt-drag turns · middle-drag pans · right-drag or pinch zooms · two-finger swipe turns · F
      frames
    </p>
  )
}

function useShortcuts(): void {
  useEffect(() => {
    const step = (delta: number) => {
      const { playhead, doc } = editor.getState()
      const clip = doc.clips.find((c) => c.id === playhead.clipId)
      if (!clip) return
      useUi.getState().setPlaying(false)
      editor.setPlayhead({
        frame: Math.min(clip.end, Math.max(clip.start, playhead.frame + delta)),
      })
    }
    const run = (action: 'open' | 'undo' | 'redo' | 'frame') => {
      if (action === 'open') void importCharacter()
      else if (action === 'undo') editor.undo()
      else if (action === 'redo') editor.redo()
      else activeViewport()?.frameSelection()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const mod = e.metaKey || e.ctrlKey
      if (e.code === 'Space') {
        e.preventDefault()
        const ui = useUi.getState()
        ui.setPlaying(!ui.playing)
      } else if (e.key === 'f' && !mod) run('frame')
      else if (e.key === 'Escape') editor.select([])
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (!bridge && mod && e.key === 'z') run(e.shiftKey ? 'redo' : 'undo')
    }
    window.addEventListener('keydown', onKey)
    const offMenu = bridge?.onMenu(run)
    const offOpen = bridge?.onOpenFile((file) => void importCharacter(file))
    return () => {
      window.removeEventListener('keydown', onKey)
      offMenu?.()
      offOpen?.()
    }
  }, [])
}
