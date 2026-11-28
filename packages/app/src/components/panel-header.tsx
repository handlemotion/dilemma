import type { DragEvent, KeyboardEvent, ReactNode } from 'react'
import {
  dockPanelSlots,
  dockBeforeViewport,
  dockSide,
  panelTitles,
  type DockDrop,
  type DockPanel,
  type DockSide,
  type ViewportPosition,
  type WorkspaceDrag,
} from '../dock-layout.ts'
import { Icon } from '../icons/central.tsx'
import { useUi } from '../ui-store.ts'

const panelDragType = 'application/x-dilemma-panel'
const moveShortcuts = 'Alt+ArrowLeft Alt+ArrowRight Alt+Shift+ArrowLeft Alt+Shift+ArrowRight'
const titleId = (panel: DockPanel, tab: DockPanel) => `dock-title-${panel}-${tab}`
const panelBodyId = (panel: DockPanel) => `dock-body-${panel}`
const viewportPositions = ['left', 'center', 'right'] as const satisfies readonly ViewportPosition[]
const gripClass =
  'grid size-5 shrink-0 cursor-grab place-items-center rounded-sm text-faint hover:bg-control active:cursor-grabbing'

function gripDragProps(panel: WorkspaceDrag) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(panelDragType, panel)
      event.dataTransfer.effectAllowed = 'move'
      useUi.getState().setDraggedPanel(panel)
    },
    onDragEnd: () => useUi.getState().setDraggedPanel(null),
  }
}

function GripIcon() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <path d="M2 4h8M2 8h8" />
    </svg>
  )
}

export function ViewportGrip() {
  return (
    <span
      {...gripDragProps('viewport')}
      role="button"
      tabIndex={0}
      aria-label="Move viewport"
      aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+Home"
      title="Drag the viewport. Alt+Arrow to move, Alt+Home to center."
      className={gripClass}
      onKeyDown={(event) => {
        if (!event.altKey) return
        const { key } = event
        if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home') return
        event.preventDefault()
        const { viewportPosition, moveViewport } = useUi.getState()
        const index = viewportPositions.indexOf(viewportPosition)
        const next = index + (key === 'ArrowLeft' ? -1 : 1)
        const position = key === 'Home' ? 'center' : viewportPositions[next]
        if (position) moveViewport(position)
      }}
    >
      <GripIcon />
    </span>
  )
}

const sideTabId = (side: DockSide, panel: DockPanel) => `side-tab-${side}-${panel}`

function focusTitle(panel: DockPanel) {
  const { dockLayout, collapsedDockPanels } = useUi.getState()
  const side = dockSide(dockLayout, panel)
  const id =
    dockLayout[side].panels.length > 1
      ? collapsedDockPanels[panel]
        ? `dock-collapse-${panel}`
        : sideTabId(side, panel)
      : titleId(panel, panel)
  requestAnimationFrame(() => document.getElementById(id)?.focus())
}

function selectTab(panel: DockPanel) {
  useUi.getState().activatePanel(panel)
  focusTitle(panel)
}

function onDockKey(event: KeyboardEvent<HTMLButtonElement>, panel: DockPanel, side: DockSide) {
  const { key, altKey, shiftKey } = event
  const { dockLayout, moveDockPanel } = useUi.getState()
  if (altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    event.preventDefault()
    moveDockPanel(panel, key === 'ArrowLeft' ? 'left' : 'right', shiftKey ? 'stack' : 'swap')
    focusTitle(panel)
    return
  }

  const panels = dockLayout[side].panels
  if (altKey || panels.length < 2) return
  const index = panels.indexOf(panel)
  const indices: Partial<Record<string, number>> = {
    Home: 0,
    End: panels.length - 1,
    ArrowUp: index - 1,
    ArrowDown: index + 1,
  }
  const next = indices[key]
  if (next === undefined) return
  event.preventDefault()
  const target = panels[(next + panels.length) % panels.length]
  if (target) selectTab(target)
}

function DockGrip({ panel }: { panel: DockPanel }) {
  return (
    <span
      {...gripDragProps(panel)}
      aria-hidden="true"
      title={`Drag ${panelTitles[panel]} to dock`}
      className={gripClass}
    >
      <GripIcon />
    </span>
  )
}

export function PanelHeader({ panel, children }: { panel: DockPanel; children?: ReactNode }) {
  const layout = useUi((s) => s.dockLayout)
  const side = dockSide(layout, panel)
  const dock = layout[side]
  const grouped = dock.panels.length > 1
  return (
    <div data-panel-header className="workspace-header justify-between">
      <div
        role={grouped ? undefined : 'tablist'}
        aria-label={grouped ? undefined : `${side === 'left' ? 'Left' : 'Right'} dock`}
        className="flex min-w-0 items-center gap-0.5"
      >
        <DockGrip panel={panel} />
        {grouped ? (
          <h2 id={titleId(panel, panel)} className="truncate px-1 text-ink">
            {panelTitles[panel]}
          </h2>
        ) : (
          <button
            id={titleId(panel, panel)}
            type="button"
            role="tab"
            aria-selected="true"
            aria-controls={panelBodyId(panel)}
            aria-keyshortcuts={moveShortcuts}
            title="Alt+Arrow to move, Alt+Shift+Arrow to group."
            className="h-[26px] truncate rounded-md px-1 text-ink"
            onKeyDown={(event) => onDockKey(event, panel, side)}
          >
            {panelTitles[panel]}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

export function SidePanel({ panel, children }: { panel: DockPanel; children: ReactNode }) {
  const layout = useUi((s) => s.dockLayout)
  const collapsed = useUi((s) => s.collapsedDockPanels)
  const viewportPosition = useUi((s) => s.viewportPosition)
  const side = dockSide(layout, panel)
  const { panels } = layout[side]
  const index = panels.indexOf(panel)
  const slot = dockPanelSlots(panels, collapsed)[index]
  const beforeViewport = dockBeforeViewport(side, viewportPosition)
  const tabWidth = panels.length > 1 ? 28 : 0
  return (
    <aside
      id={panel === 'outliner' ? 'outliner-panel' : undefined}
      aria-label={panelTitles[panel]}
      style={{
        gridColumnStart: side === 'left' ? 'left-dock' : 'right-dock',
        top: slot?.top,
        height: slot?.height,
        marginInlineStart: beforeViewport ? tabWidth : undefined,
        marginInlineEnd: beforeViewport ? undefined : tabWidth,
      }}
      className={`relative row-start-3 flex min-h-0 min-w-0 flex-col self-start overflow-hidden border-line bg-panel ${index > 0 ? 'border-t' : ''}`}
    >
      {children}
    </aside>
  )
}

export function SideDockTabs({
  side,
  beforeViewport,
}: {
  side: DockSide
  beforeViewport: boolean
}) {
  const { panels, active } = useUi((s) => s.dockLayout[side])
  const collapsed = useUi((s) => s.collapsedDockPanels)
  const slots = dockPanelSlots(panels, collapsed)
  return (
    <div
      data-animation-tools
      role="group"
      aria-label={side === 'left' ? 'Left dock' : 'Right dock'}
      style={{ gridTemplateRows: slots.map(({ height }) => height).join(' ') }}
      className={`pointer-events-auto absolute inset-y-0 grid w-7 overflow-hidden border-line bg-workspace-header ${beforeViewport ? 'left-0 border-r' : 'right-0 border-l'}`}
    >
      {panels.map((panel, index) => (
        <div
          key={panel}
          role="presentation"
          className={`min-h-0 overflow-y-auto [scrollbar-width:none] ${index > 0 ? 'border-t border-line' : ''}`}
        >
          <div className="grid h-8 place-items-center border-b border-line bg-workspace-header">
            <button
              id={`dock-collapse-${panel}`}
              type="button"
              className="shell-icon size-5 rounded-sm p-0"
              aria-expanded={!collapsed[panel]}
              aria-controls={panelBodyId(panel)}
              aria-keyshortcuts={moveShortcuts}
              aria-label={`${collapsed[panel] ? 'Expand' : 'Collapse'} ${panelTitles[panel]}`}
              title={`${collapsed[panel] ? 'Expand' : 'Collapse'} ${panelTitles[panel]}`}
              onClick={() => useUi.getState().toggleDockPanel(panel)}
              onKeyDown={(event) => {
                if (event.altKey) onDockKey(event, panel, side)
              }}
            >
              <Icon name="chevronDown" size={14} className={collapsed[panel] ? '-rotate-90' : ''} />
            </button>
          </div>
          <button
            id={sideTabId(side, panel)}
            type="button"
            hidden={collapsed[panel]}
            aria-current={panel === active || undefined}
            aria-controls={panelBodyId(panel)}
            aria-keyshortcuts={moveShortcuts}
            className="grid w-full place-items-center border-b border-line pt-2.5 pb-2.5 text-muted hover:bg-control aria-[current=true]:bg-panel aria-[current=true]:text-ink aria-[current=true]:hover:bg-panel [writing-mode:vertical-rl]"
            onKeyDown={(event) => onDockKey(event, panel, side)}
            onClick={() => selectTab(panel)}
            onDragOver={(event) => {
              const dragged = useUi.getState().draggedPanel
              if (
                dragged &&
                dragged !== 'viewport' &&
                dragged !== panel &&
                panels.includes(dragged)
              )
                allowPanelDrop(event)
            }}
            onDrop={(event) => {
              const dragged = useUi.getState().draggedPanel
              if (
                dragged &&
                dragged !== 'viewport' &&
                dragged !== panel &&
                panels.includes(dragged)
              )
                dropPanel(event, side, 'reorder')
            }}
          >
            {panelTitles[panel]}
          </button>
        </div>
      ))}
    </div>
  )
}

export function PanelContent({
  panel,
  children,
  className,
}: {
  panel: DockPanel
  children: ReactNode
  className: string
}) {
  const grouped = useUi((s) => s.dockLayout[dockSide(s.dockLayout, panel)].panels.length > 1)
  const collapsed = useUi((s) => s.collapsedDockPanels[panel])
  return (
    <div
      id={panelBodyId(panel)}
      role={grouped ? 'region' : 'tabpanel'}
      hidden={grouped && collapsed}
      aria-labelledby={titleId(panel, panel)}
      className={className}
    >
      {children}
    </div>
  )
}

export function PanelDropTarget({
  side,
  drop,
  label,
  className,
}: {
  side: DockSide
  drop: DockDrop
  label: string
  className: string
}) {
  return (
    <DropTarget
      label={label}
      className={className}
      onDrop={(event) => dropPanel(event, side, drop)}
    />
  )
}

export function ViewportDropTargets() {
  return (
    <div className="z-30 col-start-2 col-end-[-1] row-start-3 mt-8 grid grid-cols-3">
      {viewportPositions.map((position) => (
        <DropTarget
          key={position}
          label={position === 'center' ? 'Center viewport' : `Move viewport ${position}`}
          className="min-w-0"
          onDrop={(event) => {
            if (event.dataTransfer.getData(panelDragType) !== 'viewport') return
            event.preventDefault()
            event.stopPropagation()
            useUi.getState().moveViewport(position)
          }}
        />
      ))}
    </div>
  )
}

function DropTarget({
  label,
  className,
  onDrop,
}: {
  label: string
  className: string
  onDrop(event: DragEvent): void
}) {
  return (
    <div
      aria-hidden="true"
      className={`${className} grid place-items-center border border-dashed border-accent/50 bg-panel/85 text-center text-ink data-over:bg-primary/20`}
      onDragOver={(event) => {
        if (allowPanelDrop(event)) event.currentTarget.dataset.over = ''
      }}
      onDragLeave={(event) => delete event.currentTarget.dataset.over}
      onDrop={(event) => {
        delete event.currentTarget.dataset.over
        onDrop(event)
      }}
    >
      <span className="pointer-events-none px-1">{label}</span>
    </div>
  )
}

function allowPanelDrop(event: DragEvent): boolean {
  if (!event.dataTransfer.types.includes(panelDragType)) return false
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  return true
}

function dropPanel(event: DragEvent, side: DockSide, drop: DockDrop) {
  const { draggedPanel, moveDockPanel } = useUi.getState()
  if (
    !draggedPanel ||
    draggedPanel === 'viewport' ||
    event.dataTransfer.getData(panelDragType) !== draggedPanel
  )
    return
  event.preventDefault()
  event.stopPropagation()
  moveDockPanel(draggedPanel, side, drop)
}
