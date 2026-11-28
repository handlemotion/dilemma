import { useCallback, useEffect, useRef, useState } from 'react'
import type { MenuAction } from '../electron/ipc.ts'
import { exportAnimation, importCharacter, openProject, saveProject } from './actions.ts'
import { deleteKeys, keySelection, newClip } from './animation.ts'
import { bridge } from './bridge.ts'
import { AnimationToolbar } from './components/animation-toolbar.tsx'
import { AppMenuBar } from './components/app-menu-bar.tsx'
import { Inspector } from './components/inspector.tsx'
import { Outliner } from './components/outliner.tsx'
import {
  PanelContent,
  PanelDropTarget,
  PanelHeader,
  SideDockTabs,
  SidePanel,
  ViewportDropTargets,
} from './components/panel-header.tsx'
import { StatusBar } from './components/status-bar.tsx'
import { Timeline } from './components/timeline.tsx'
import { MainToolbar, transformTools } from './components/transform-tools.tsx'
import {
  DEFAULT_TIMELINE_HEIGHT,
  TIMELINE_HEADER_HEIGHT,
  TRACK_HEIGHT,
  keyframeInDirection,
  timelineHeight,
} from './components/timeline-tracks.ts'
import { activeViewport, ViewportPanel } from './components/viewport-panel.tsx'
import { ViewportMenuBar, WorkspaceToolRail } from './components/viewport-tools.tsx'
import { ProjectTitleBar } from './components/window-controls.tsx'
import { dockBeforeViewport, dockSide, panelTitles, type DockSide } from './dock-layout.ts'
import { editor, useEditorState } from './editor.ts'
import { usePlayback } from './playback.ts'
import { updateRigSetup } from './rig-setup.ts'
import { useUi } from './ui-store.ts'

const SIDE_PANEL_LIMIT = 0.34

export function App() {
  const fileInput = useRef<HTMLInputElement>(null)
  const runMenuAction = useCallback((action: MenuAction) => {
    if (action === 'open') {
      if (bridge) void importCharacter()
      else fileInput.current?.click()
    } else if (action === 'openProject') void openProject()
    else if (action === 'saveProject' || action === 'saveProjectAs') {
      void saveProject(action === 'saveProjectAs')
    } else if (action === 'exportGlb') void exportAnimation()
    else if (action === 'exportFbx') void exportAnimation('fbx')
    else if (action === 'undo') editor.undo()
    else if (action === 'redo') editor.redo()
    else if (action === 'frame') activeViewport()?.frameSelection()
    else if (action === 'newClip') newClip()
    else if (action === 'keySelection') keySelection()
    else if (action === 'deleteKeys') deleteKeys()
    else if (action === 'togglePlayback') {
      const ui = useUi.getState()
      ui.setPlaying(!ui.playing)
    } else if (action === 'toggleLoopPlayback') {
      const ui = useUi.getState()
      ui.setLoopPlayback(!ui.loopPlayback)
    }
  }, [])
  usePlayback()
  useShortcuts(runMenuAction)
  const sizes = useUi((s) => s.panelSizes)
  const layout = useUi((s) => s.dockLayout)
  const draggedPanel = useUi((s) => s.draggedPanel)
  const viewportPosition = useUi((s) => s.viewportPosition)
  const panelDragging = draggedPanel !== null && draggedPanel !== 'viewport'
  const leftWidth = sizes.left === undefined ? 'clamp(184px, 22vw, 272px)' : `${sizes.left}px`
  const rightWidth = sizes.right === undefined ? 'clamp(272px, 32vw, 430px)' : `${sizes.right}px`
  const sideLimit = `${SIDE_PANEL_LIMIT * 100}vw`
  const leftOpen = layout.left.panels.length > 0
  const rightOpen = layout.right.panels.length > 0
  const leftColumn = `[left-dock] ${leftOpen ? `min(${leftWidth}, ${sideLimit})` : '0px'}`
  const rightColumn = `[right-dock] ${rightOpen ? `min(${rightWidth}, ${sideLimit})` : '0px'}`
  const viewportColumn = '[viewport] minmax(0, 1fr)'
  const workspaceColumns = {
    left: `${viewportColumn} ${leftColumn} ${rightColumn}`,
    center: `${leftColumn} ${viewportColumn} ${rightColumn}`,
    right: `${leftColumn} ${rightColumn} ${viewportColumn}`,
  }
  const timelineCharacter = useEditorState(({ doc, playhead }) => {
    const clip = doc.clips.find((item) => item.id === playhead.clipId)
    return doc.characters.find((character) => character.id === clip?.characterId)
  })
  const timelineExpanded = useUi((s) => s.expandedTimelineCharacterId === timelineCharacter?.id)
  const jointCount = timelineCharacter?.skeleton.joints.length ?? 0
  const timelineMin = timelineCharacter
    ? DEFAULT_TIMELINE_HEIGHT + (timelineExpanded && jointCount ? TRACK_HEIGHT : 0)
    : TIMELINE_HEADER_HEIGHT + 1
  const timelineSize = timelineCharacter
    ? timelineHeight(jointCount, timelineExpanded, sizes.timeline)
    : timelineMin
  const loading = useUi((s) => s.loading)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className="grid h-full"
      style={{
        gridTemplateColumns: `40px ${workspaceColumns[viewportPosition]}`,
        gridTemplateRows: `32px 40px minmax(0, 1fr) 40px min(${timelineSize}px, max(${timelineMin}px, 55vh)) minmax(36px, auto)`,
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0]
        if (!file) return
        e.preventDefault()
        setDragging(false)
        void importCharacter(file)
      }}
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
      <ProjectTitleBar>
        {bridge?.platform !== 'darwin' && <AppMenuBar run={runMenuAction} />}
      </ProjectTitleBar>
      <MainToolbar run={runMenuAction} />
      <WorkspaceToolRail />
      <SidePanel panel="outliner">
        <Outliner />
      </SidePanel>

      <main className="relative col-start-[viewport] row-start-3 flex min-h-0 min-w-0 flex-col overflow-hidden bg-viewport">
        <ViewportMenuBar
          onFrame={() => runMenuAction('frame')}
          beginCameraDrag={(action) => activeViewport()?.beginCameraDrag(action) ?? null}
        />
        <div className="relative min-h-0 flex-1">
          <ViewportPanel />
          {dragging && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-2 rounded-md border border-dashed border-accent"
            />
          )}
          {loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p role="status" className="rounded-md bg-raised p-3 text-muted">
                {loading}
              </p>
            </div>
          )}
        </div>
        {panelDragging && !leftOpen && (
          <PanelDropTarget
            side="left"
            drop="stack"
            label="Dock left"
            className={`absolute inset-y-0 z-20 w-20 ${dockBeforeViewport('left', viewportPosition) ? 'left-0' : 'right-0'}`}
          />
        )}
        {panelDragging && !rightOpen && (
          <PanelDropTarget
            side="right"
            drop="stack"
            label="Dock right"
            className={`absolute inset-y-0 z-20 w-20 ${dockBeforeViewport('right', viewportPosition) ? 'left-0' : 'right-0'}`}
          />
        )}
      </main>

      <SidePanel panel="inspector">
        <PanelHeader panel="inspector" />
        <PanelContent panel="inspector" className="min-h-0 flex-1 overflow-auto p-1">
          <Inspector />
        </PanelContent>
      </SidePanel>
      <SideDockFrame side="left" />
      <SideDockFrame side="right" />
      {draggedPanel === 'viewport' && <ViewportDropTargets />}

      <AnimationToolbar />
      <div className="relative col-span-full row-start-5 min-h-0 min-w-0">
        {timelineCharacter && (
          <PanelDivider panel="timeline" label="Resize timeline" min={timelineMin} />
        )}
        <Timeline />
      </div>
      <StatusBar />
    </div>
  )
}

function SideDockFrame({ side }: { side: DockSide }) {
  const layout = useUi((s) => s.dockLayout)
  const dragged = useUi((s) => s.draggedPanel)
  const viewportPosition = useUi((s) => s.viewportPosition)
  const dock = layout[side]
  const { panels } = dock
  if (!panels.length) return null
  const beforeViewport = dockBeforeViewport(side, viewportPosition)
  const title = panelTitles[dock.active ?? panels[0]!]
  const receivingDrop = dragged && dragged !== 'viewport' && dockSide(layout, dragged) !== side
  return (
    <div
      className={`pointer-events-none relative z-10 row-start-3 min-h-0 min-w-0 border-line ${beforeViewport ? 'border-r' : 'border-l'}`}
      style={{ gridColumnStart: side === 'left' ? 'left-dock' : 'right-dock' }}
    >
      <PanelDivider panel={side} label={`Resize ${title}`} min={144} growsRight={beforeViewport} />
      {dock.panels.length > 1 && <SideDockTabs side={side} beforeViewport={beforeViewport} />}
      {receivingDrop && (
        <div
          className={`pointer-events-auto absolute inset-x-0 top-8 bottom-0 z-20 flex ${beforeViewport ? '' : 'flex-row-reverse'}`}
        >
          <PanelDropTarget side={side} drop="swap" label="Swap" className="w-12 shrink-0" />
          <PanelDropTarget
            side={side}
            drop="stack"
            label="Stack vertically"
            className="min-w-0 flex-1"
          />
        </div>
      )}
    </div>
  )
}

function PanelDivider({
  panel,
  label,
  min,
  growsRight = false,
}: {
  panel: DockSide | 'timeline'
  label: string
  min: number
  growsRight?: boolean
}) {
  const vertical = panel !== 'timeline'
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
      className={`pointer-events-auto absolute z-10 touch-none outline-none before:pointer-events-none before:absolute before:content-[''] hover:before:bg-accent data-resizing:before:bg-accent focus-visible:before:bg-accent ${
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

function useShortcuts(run: (action: MenuAction) => void): void {
  useEffect(() => {
    const step = (delta: number) => {
      const { playhead, doc } = editor.getState()
      const clip = doc.clips.find((c) => c.id === playhead.clipId)
      const ui = useUi.getState()
      ui.setPlaying(false)
      if (!clip) {
        const { start, end } = doc.sceneTiming
        ui.setPreviewFrame(Math.min(end, Math.max(start, ui.previewFrame + delta)))
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
      const frame = keyframeInDirection(
        clip,
        playhead.frame,
        direction,
        selection.joints,
        doc.characters.find((character) => character.id === clip.characterId),
      )
      if (frame !== undefined) editor.setPlayhead({ frame })
    }
    const isEditing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.closest('[role="dialog"]') !== null)
    const onSpace = (e: KeyboardEvent) => {
      if (useUi.getState().rigSetup || (e.code !== 'Space' && e.key !== ' ')) return
      if (
        e.target instanceof Element &&
        e.target.closest(
          '[data-timeline-track], [data-timeline-footer], [role="combobox"], [role="listbox"], [role="menu"], [data-animation-tools], [data-panel-header], button[aria-expanded]',
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
      if (
        e.defaultPrevented ||
        isEditing(e.target) ||
        (e.target instanceof Element && e.target.closest('[role="menu"], [role="menubar"]'))
      )
        return
      const mod = e.metaKey || e.ctrlKey
      const setup = useUi.getState().rigSetup
      if (setup && !mod) {
        if (e.key === 'Escape' && setup.pickRole) {
          updateRigSetup({ pickRole: null, error: null })
        } else if (e.key.toLowerCase() === 'f') run('frame')
        return
      }
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
  }, [run])
}
