import { useEffect, useRef, useState } from 'react'
import type { MenuAction } from '../electron/ipc.ts'
import { exportAnimation, importCharacter, openProject, saveProject } from './actions.ts'
import { deleteKeys, keySelection } from './animation.ts'
import { bridge } from './bridge.ts'
import { Inspector } from './components/inspector.tsx'
import { Outliner } from './components/outliner.tsx'
import { PanelHeader } from './components/panel-header.tsx'
import { StatusBar } from './components/status-bar.tsx'
import { Timeline } from './components/timeline.tsx'
import { AnimationActions, TransformTools, transformTools } from './components/transform-tools.tsx'
import {
  DEFAULT_TIMELINE_HEIGHT,
  TRACK_HEIGHT,
  keyframeInDirection,
  timelineHeight,
} from './components/timeline-tracks.ts'
import { activeViewport, ViewportPanel } from './components/viewport-panel.tsx'
import { editor, useEditorState } from './editor.ts'
import { Icon, type IconName } from './icons/central.tsx'
import { usePlayback } from './playback.ts'
import { PREVIEW_END, useUi } from './ui-store.ts'

const SIDE_PANEL_LIMIT = 0.34

export function App() {
  usePlayback()
  useShortcuts()
  const canUndo = useEditorState((s) => s.canUndo)
  const canRedo = useEditorState((s) => s.canRedo)
  const sizes = useUi((s) => s.panelSizes)
  const outlinerWidth =
    sizes.outliner === undefined ? 'clamp(160px, 20vw, 240px)' : `${sizes.outliner}px`
  const inspectorWidth =
    sizes.inspector === undefined ? 'clamp(176px, 23vw, 272px)' : `${sizes.inspector}px`
  const sideLimit = `${SIDE_PANEL_LIMIT * 100}vw`
  const timelineCharacter = useEditorState(({ doc, playhead }) => {
    const clip = doc.clips.find((item) => item.id === playhead.clipId)
    return doc.characters.find((character) => character.id === clip?.characterId)
  })
  const timelineExpanded = useUi((s) => s.expandedTimelineCharacterId === timelineCharacter?.id)
  const jointCount = timelineCharacter?.skeleton.joints.length ?? 0
  const timelineMin = DEFAULT_TIMELINE_HEIGHT + (timelineExpanded && jointCount ? TRACK_HEIGHT : 0)
  const timelineSize = timelineHeight(jointCount, timelineExpanded, sizes.timeline)
  const loading = useUi((s) => s.loading)
  const projectPath = useUi((s) => s.projectPath)
  const clipId = useEditorState((s) => s.playhead.clipId)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className="grid h-full"
      style={{
        gridTemplateColumns: `min(${outlinerWidth}, ${sideLimit}) minmax(0, 1fr) min(${inspectorWidth}, ${sideLimit})`,
        gridTemplateRows: `43px 40px minmax(0, 1fr) min(${timelineSize}px, max(${timelineMin}px, 55vh)) 35px`,
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
        className={`drag-region relative col-span-full flex items-center gap-2 border-b border-line bg-timeline p-2 ${
          bridge?.platform === 'darwin' ? 'pl-[76px]' : 'pl-2'
        }`}
      >
        <IconButton
          onClick={() => editor.undo()}
          disabled={!canUndo}
          title="Undo (⌘Z)"
          icon="undo"
        />
        <IconButton
          onClick={() => editor.redo()}
          disabled={!canRedo}
          title="Redo (⇧⌘Z)"
          icon="redo"
        />
        <span
          className="absolute top-1/2 left-1/2 max-w-1/2 -translate-x-1/2 -translate-y-1/2 truncate font-medium text-muted"
          title={projectPath ?? undefined}
        >
          {projectPath
            ?.split(/[\\/]/)
            .pop()
            ?.replace(/\.dilemma$/i, '') ?? 'Dilemma'}
        </span>
        {bridge && (
          <button
            type="button"
            className="shell-action ml-auto"
            disabled={!clipId || Boolean(loading)}
            onClick={() => void exportAnimation()}
          >
            Export GLB
          </button>
        )}
      </header>

      <AnimationActions />
      <aside
        aria-label="Outliner"
        className="relative flex min-h-0 min-w-0 flex-col border-r border-line bg-panel"
      >
        <PanelDivider panel="outliner" label="Resize Outliner" min={144} />
        <Outliner />
      </aside>

      <main className="relative min-h-0 min-w-0 overflow-hidden bg-timeline">
        <ViewportPanel />
        <TransformTools />
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
      </main>

      <aside
        aria-label="Properties"
        className="relative flex min-h-0 min-w-0 flex-col border-l border-line bg-panel"
      >
        <PanelDivider panel="inspector" label="Resize Inspector" min={144} />
        <PanelHeader title="Properties" />
        <div className="min-h-0 flex-1 overflow-auto">
          <Inspector />
        </div>
      </aside>

      <div className="relative col-span-full min-h-0 min-w-0">
        <PanelDivider panel="timeline" label="Resize timeline" min={timelineMin} />
        <Timeline />
      </div>
      <StatusBar />
    </div>
  )
}

function PanelDivider({
  panel,
  label,
  min,
}: {
  panel: 'outliner' | 'inspector' | 'timeline'
  label: string
  min: number
}) {
  const vertical = panel !== 'timeline'
  const growsRight = panel === 'outliner'
  const drag = useRef<{ pointer: number; origin: number; size: number; moved: boolean } | null>(
    null,
  )
  const sizeOf = (target: HTMLElement) => {
    const rect = target.parentElement!.getBoundingClientRect()
    return vertical ? rect.width : rect.height
  }
  const resize = (size: number) => {
    const max = vertical ? window.innerWidth * SIDE_PANEL_LIMIT : window.innerHeight * 0.55
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
          ? `inset-y-0 w-2 cursor-col-resize before:inset-y-0 before:w-px ${growsRight ? '-right-1 before:right-[3px]' : '-left-1 before:left-[3px]'}`
          : 'inset-x-0 -top-1 h-2 cursor-row-resize before:inset-x-0 before:h-px before:top-1'
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
        const delta = growsRight ? current - drag.current.origin : drag.current.origin - current
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
        const grow = vertical ? (growsRight ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp'
        const shrink = vertical ? (growsRight ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown'
        if (event.key !== grow && event.key !== shrink) return
        event.preventDefault()
        resize(sizeOf(event.currentTarget) + (event.key === grow ? 16 : -16))
      }}
    />
  )
}

function IconButton(props: { onClick(): void; disabled?: boolean; title: string; icon: IconName }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      aria-label={props.title}
      className="shell-icon"
    >
      <Icon name={props.icon} size={15} />
    </button>
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
    const seekKeyframe = (direction: -1 | 1) => {
      const { playhead, doc, selection } = editor.getState()
      const clip = doc.clips.find((item) => item.id === playhead.clipId)
      if (!clip) return
      useUi.getState().setPlaying(false)
      const frame = keyframeInDirection(clip, playhead.frame, direction, selection.joints)
      if (frame !== undefined) editor.setPlayhead({ frame })
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
      if (
        e.target instanceof Element &&
        e.target.closest(
          '[data-timeline-track], [role="combobox"], [role="listbox"], [data-animation-tools], button[aria-expanded]',
        )
      )
        return
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
      const tool =
        !mod && !e.altKey && !e.isComposing
          ? transformTools.find(({ shortcut }) => shortcut === e.key.toLowerCase())
          : undefined
      if (tool) {
        e.preventDefault()
        useUi.getState().setTransformMode(tool.mode)
      } else if (e.key === 'f' && !mod) run('frame')
      else if (e.key === 'Escape') {
        const viewport = activeViewport()
        if (!viewport?.cancelTransform() && !viewport?.cancelSelection()) editor.select([])
      } else if (e.key.toLowerCase() === 's' && !mod && !e.altKey && !e.repeat) keySelection()
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !mod && deleteKeys()) {
        e.preventDefault()
      } else if ((e.key === ',' || e.key === '.') && !mod && !e.altKey && !e.isComposing) {
        e.preventDefault()
        seekKeyframe(e.key === ',' ? -1 : 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
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
