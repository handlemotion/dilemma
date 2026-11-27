import { Tabs } from '@base-ui/react/tabs'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { MenuAction } from '../electron/ipc.ts'
import { exportAnimation, importCharacter, openProject, saveProject } from './actions.ts'
import { deleteKeys, keySelection } from './animation.ts'
import { bridge } from './bridge.ts'
import { Outliner } from './components/outliner.tsx'
import { DEFAULT_TIMELINE_HEIGHT, Timeline } from './components/timeline.tsx'
import { activeViewport, ViewportPanel } from './components/viewport-panel.tsx'
import { editor, useEditorState } from './editor.ts'
import { usePlayback } from './playback.ts'
import { PREVIEW_END, useUi } from './ui-store.ts'

export function App() {
  usePlayback()
  useShortcuts()
  const canUndo = useEditorState((s) => s.canUndo)
  const canRedo = useEditorState((s) => s.canRedo)
  const sizes = useUi((s) => s.panelSizes)
  const loading = useUi((s) => s.loading)
  const error = useUi((s) => s.error)
  const projectPath = useUi((s) => s.projectPath)
  const clipId = useEditorState((s) => s.playhead.clipId)
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className="grid h-full"
      style={{
        gridTemplateColumns: `minmax(0, 1fr) ${sizes.dock === undefined ? 'clamp(176px, 23vw, 272px)' : `min(${sizes.dock}px, 55vw)`}`,
        gridTemplateRows: `43px minmax(0, 1fr) min(${sizes.timeline ?? DEFAULT_TIMELINE_HEIGHT}px, max(${DEFAULT_TIMELINE_HEIGHT}px, 55vh))`,
      }}
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
        className={`drag-region col-span-full flex items-center gap-2 border-b border-line bg-panel p-2 ${
          bridge?.platform === 'darwin' ? 'pl-[76px]' : 'pl-2'
        }`}
      >
        <input
          ref={fileInput}
          type="file"
          accept=".glb,.gltf"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file) void importCharacter(file)
            event.currentTarget.value = ''
          }}
        />
        <button
          type="button"
          className="shell-primary"
          disabled={Boolean(loading)}
          onClick={() => {
            if (bridge) void importCharacter()
            else fileInput.current?.click()
          }}
        >
          Import character
        </button>
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
        <span className="mx-auto truncate font-medium text-muted" title={projectPath ?? undefined}>
          {projectPath
            ?.split(/[\\/]/)
            .pop()
            ?.replace(/\.dilemma$/i, '') ?? 'Dilemma'}
        </span>
        {bridge && (
          <button
            type="button"
            className="shell-action"
            disabled={!clipId || Boolean(loading)}
            onClick={() => void exportAnimation()}
          >
            Export GLB
          </button>
        )}
      </header>

      <main className="relative min-h-0 min-w-0 overflow-hidden bg-timeline">
        <ViewportPanel />
        {dragging && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-2 rounded-md border border-dashed border-accent"
          />
        )}
        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p role="status" className="rounded-md bg-panel p-3 text-muted">
              {loading}
            </p>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="absolute top-2 left-2 max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-900"
          >
            {error}
            <button
              type="button"
              className="ml-3 text-red-800 underline"
              onClick={() => useUi.getState().setError(null)}
            >
              Dismiss
            </button>
          </div>
        )}
      </main>

      <aside className="relative flex min-h-0 min-w-0 flex-col border-l border-line bg-panel">
        <PanelDivider panel="dock" label="Resize right dock" vertical min={144} />
        <DockTabs />
      </aside>

      <div className="relative col-span-full min-h-0 min-w-0">
        <PanelDivider panel="timeline" label="Resize timeline" min={DEFAULT_TIMELINE_HEIGHT} />
        <Timeline />
      </div>
    </div>
  )
}

function PanelDivider({
  panel,
  label,
  vertical = false,
  min,
}: {
  panel: 'dock' | 'timeline'
  label: string
  vertical?: boolean
  min: number
}) {
  const drag = useRef<{ pointer: number; origin: number; size: number; moved: boolean } | null>(
    null,
  )
  const sizeOf = (target: HTMLElement) => {
    const rect = target.parentElement!.getBoundingClientRect()
    return vertical ? rect.width : rect.height
  }
  const resize = (size: number) => {
    const max = (vertical ? window.innerWidth : window.innerHeight) * 0.55
    useUi
      .getState()
      .setPanelSize(panel, Math.round(Math.min(Math.max(min, max), Math.max(min, size))))
  }
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      title="Drag to resize. Click to reset."
      className={`absolute z-10 touch-none outline-none before:pointer-events-none before:absolute before:content-[''] hover:before:bg-accent data-resizing:before:bg-accent focus-visible:before:bg-accent ${
        vertical
          ? 'inset-y-0 -left-1 w-2 cursor-col-resize before:inset-y-0 before:left-[3px] before:w-px'
          : `inset-x-0 -top-1 h-2 cursor-row-resize before:inset-x-0 before:h-px before:top-1`
      }`}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return
        event.preventDefault()
        const origin = vertical ? event.clientX : event.clientY
        drag.current = {
          pointer: event.pointerId,
          origin,
          size: sizeOf(event.currentTarget),
          moved: false,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        event.currentTarget.dataset.resizing = ''
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointer !== event.pointerId) return
        const current = vertical ? event.clientX : event.clientY
        const delta = drag.current.origin - current
        if (!drag.current.moved && Math.abs(delta) < 3) return
        drag.current.moved = true
        resize(drag.current.size + delta)
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointer !== event.pointerId) return
        const current = vertical ? event.clientX : event.clientY
        if (!drag.current.moved && Math.abs(drag.current.origin - current) < 3) {
          useUi.getState().setPanelSize(panel, undefined)
        }
      }}
      onLostPointerCapture={(event) => {
        delete event.currentTarget.dataset.resizing
        drag.current = null
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          useUi.getState().setPanelSize(panel, undefined)
          return
        }
        const grow = vertical ? 'ArrowLeft' : 'ArrowUp'
        const shrink = vertical ? 'ArrowRight' : 'ArrowDown'
        if (event.key !== grow && event.key !== shrink) return
        event.preventDefault()
        resize(sizeOf(event.currentTarget) + (event.key === grow ? 16 : -16))
      }}
    />
  )
}

function DockTabs() {
  const active = useUi((s) => s.dockTab)
  const tabClass =
    'relative -mb-px h-8 border-r border-b border-line px-3 text-muted hover:bg-control hover:text-ink data-active:border-b-panel data-active:bg-panel data-active:font-semibold data-active:text-ink'

  return (
    <Tabs.Root
      value={active}
      onValueChange={(value) => {
        if (value === 'outliner' || value === 'inspector') useUi.getState().setDockTab(value)
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <Tabs.List
        aria-label="Right dock"
        className="flex shrink-0 items-end border-b border-line bg-timeline"
      >
        <Tabs.Tab value="outliner" className={tabClass}>
          Outliner
        </Tabs.Tab>
        <Tabs.Tab value="inspector" className={tabClass}>
          Inspector
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="outliner" keepMounted className="min-h-0 flex-1">
        <Outliner />
      </Tabs.Panel>
      <Tabs.Panel value="inspector" className="min-h-0 flex-1 overflow-auto pt-3">
        <SelectionInfo />
      </Tabs.Panel>
    </Tabs.Root>
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
      className="shell-icon"
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
  if (names.length === 0) return null
  return (
    <p className="truncate px-3 pb-3 text-muted" title={names.join(', ')}>
      {names.join(', ')}
    </p>
  )
}

function useShortcuts(): void {
  useEffect(() => {
    const step = (delta: number) => {
      const { playhead, doc } = editor.getState()
      const clip = doc.clips.find((c) => c.id === playhead.clipId)
      const ui = useUi.getState()
      ui.setPlaying(false)
      if (!clip) {
        ui.setPreviewFrame(Math.min(PREVIEW_END, Math.max(0, ui.previewFrame + delta)))
        return
      }
      editor.setPlayhead({
        frame: Math.min(clip.end, Math.max(clip.start, playhead.frame + delta)),
      })
    }
    const run = (action: MenuAction) => {
      if (action === 'open') void importCharacter()
      else if (action === 'openProject') void openProject()
      else if (action === 'saveProject' || action === 'saveProjectAs') {
        void saveProject(action === 'saveProjectAs')
      } else if (action === 'exportGlb') void exportAnimation()
      else if (action === 'undo') editor.undo()
      else if (action === 'redo') editor.redo()
      else activeViewport()?.frameSelection()
    }
    const isEditing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement)
    const onSpace = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return
      if (isEditing(e.target) || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      const ui = useUi.getState()
      ui.setPlaying(!ui.playing)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditing(e.target)) return
      const mod = e.metaKey || e.ctrlKey
      if (e.key === 'f' && !mod) run('frame')
      else if (e.key === 'Escape') editor.select([])
      else if (e.key.toLowerCase() === 's' && !mod && !e.altKey && !e.repeat) keySelection()
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !mod && deleteKeys()) {
        e.preventDefault()
      } else if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        !(e.target instanceof Element && e.target.closest('[role="tablist"]'))
      )
        step(e.key === 'ArrowLeft' ? -1 : 1)
      else if (!bridge && mod && e.key === 'z') run(e.shiftKey ? 'redo' : 'undo')
    }
    window.addEventListener('keydown', onSpace, true)
    window.addEventListener('keydown', onKey)
    const offMenu = bridge?.onMenu(run)
    const offOpen = bridge?.onOpenFile((file) => void importCharacter(file))
    return () => {
      window.removeEventListener('keydown', onSpace, true)
      window.removeEventListener('keydown', onKey)
      offMenu?.()
      offOpen?.()
    }
  }, [])
}
