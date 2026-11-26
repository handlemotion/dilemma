import { useEffect, useState, type ReactNode } from 'react'
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
      className="grid h-full grid-cols-[232px_minmax(0,1fr)_248px] grid-rows-[38px_minmax(0,1fr)_136px] gap-1.5 px-1.5 pb-1.5"
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
        className={`drag-region col-span-3 flex items-center gap-0.5 ${
          bridge?.platform === 'darwin' ? 'pl-[76px]' : 'pl-1.5'
        }`}
      >
        <IconButton
          onClick={() => void importCharacter()}
          disabled={!bridge}
          title="Import character (⌘O)"
          icon={<path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 11.5v2h11v-2" />}
        />
        <IconButton
          onClick={() => editor.undo()}
          disabled={!canUndo}
          title="Undo (⌘Z)"
          icon={<path d="M5.5 3 2.5 6l3 3M2.5 6h7a4 4 0 0 1 0 8H7" />}
        />
        <IconButton
          onClick={() => editor.redo()}
          disabled={!canRedo}
          title="Redo (⇧⌘Z)"
          icon={<path d="m10.5 3 3 3-3 3M13.5 6h-7a4 4 0 0 0 0 8H9" />}
        />
        <span className="mx-auto font-medium text-muted">Dilemma</span>
      </header>

      <Island className="row-span-2" title="Skeleton">
        <Outliner />
      </Island>

      <main className="relative min-h-0 min-w-0 overflow-hidden rounded-xl bg-stage">
        <ViewportPanel />
        <div className="absolute top-2 right-2 flex gap-0.5 rounded-lg bg-panel/90 p-0.5 backdrop-blur">
          <IconButton
            onClick={() => activeViewport()?.frameSelection()}
            title="Frame selection (F)"
            icon={
              <path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3M8 6.5v3M6.5 8h3" />
            }
          />
          <NavigationSettings />
        </div>
        {(empty || dragging) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p
              className={`rounded-xl border border-dashed px-6 py-4 text-[13px] ${
                dragging ? 'border-accent text-accent' : 'border-line text-muted'
              }`}
            >
              {loading ? `Loading ${loading}…` : 'Drop a skinned .glb or .gltf here, or press ⌘O'}
            </p>
          </div>
        )}
        {error && (
          <div className="absolute top-2 left-2 max-w-md rounded-lg border border-red-400/40 bg-red-950/90 px-3 py-2 text-red-200">
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

      <div className="row-span-2 flex min-h-0 flex-col gap-1.5">
        <Island className="flex-1" title="Selection">
          <SelectionInfo />
        </Island>
        <Island title="Performance">
          <div className="flex items-baseline justify-between px-3 pb-3 font-mono tabular-nums">
            <span className="text-ink">{fps} fps</span>
            <span className="text-faint">viewport</span>
          </div>
        </Island>
      </div>

      <div className="min-w-0">
        <Timeline />
      </div>
    </div>
  )
}

/** A panel on the black window: rounded, with a small title. */
function Island(props: { title: string; className?: string; children: ReactNode }) {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl bg-panel ${props.className ?? ''}`}
    >
      <h2 className="shrink-0 px-3 pt-3 pb-1.5 font-semibold text-ink">{props.title}</h2>
      <div className="min-h-0 flex-1">{props.children}</div>
    </section>
  )
}

function IconButton(props: {
  onClick(): void
  disabled?: boolean
  title: string
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      aria-label={props.title}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink disabled:text-faint disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {props.icon}
      </svg>
    </button>
  )
}

/** The selected joints, by name, with their character. */
function SelectionInfo() {
  const selection = useEditorState((s) => s.selection)
  const characters = useEditorState((s) => s.doc.characters)
  const names = selection.joints.flatMap((ref) => {
    const joint = characters.find((c) => c.id === ref.characterId)?.skeleton.joints[ref.joint]
    return joint ? [joint.name] : []
  })
  return (
    <p className="truncate px-3 pb-3 text-muted" title={names.join(', ')}>
      {names.length === 0 ? 'Nothing selected' : names.join(', ')}
    </p>
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
