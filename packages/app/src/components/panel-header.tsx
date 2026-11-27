import type { DragEvent, KeyboardEvent, ReactNode } from 'react'
import {
  dockSide,
  panelTitles,
  type DockDrop,
  type DockPanel,
  type DockSide,
} from '../dock-layout.ts'
import { useUi } from '../ui-store.ts'

const panelDragType = 'application/x-dilemma-panel'
const moveShortcuts = 'Alt+ArrowLeft Alt+ArrowRight Alt+Shift+ArrowLeft Alt+Shift+ArrowRight'
const titleId = (panel: DockPanel, tab: DockPanel) => `dock-title-${panel}-${tab}`
const panelBodyId = (panel: DockPanel) => `dock-body-${panel}`

function focusTitle(tab: DockPanel) {
  requestAnimationFrame(() => document.getElementById(titleId(tab, tab))?.focus())
}

function selectTab(tab: DockPanel) {
  useUi.getState().activatePanel(tab)
  focusTitle(tab)
}

export function PanelHeader({ panel, children }: { panel: DockPanel; children?: ReactNode }) {
  const layout = useUi((s) => s.dockLayout)
  const side = dockSide(layout, panel)
  const { panels } = layout[side]
  const stacked = panels.length > 1

  function onTitleKey(event: KeyboardEvent<HTMLButtonElement>, tab: DockPanel) {
    const { key, altKey, shiftKey } = event
    if (altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      event.preventDefault()
      useUi
        .getState()
        .moveDockPanel(tab, key === 'ArrowLeft' ? 'left' : 'right', shiftKey ? 'stack' : 'swap')
      focusTitle(tab)
    } else if (stacked && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
      event.preventDefault()
      const next =
        key === 'Home'
          ? panels[0]
          : key === 'End'
            ? panels.at(-1)
            : panels.find((value) => value !== tab)
      if (next) selectTab(next)
    }
  }

  function titleProps(tab: DockPanel) {
    return {
      id: titleId(panel, tab),
      draggable: true,
      'aria-keyshortcuts': moveShortcuts,
      title: 'Drag to dock. Alt+Arrow to move, Alt+Shift+Arrow to group.',
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => onTitleKey(event, tab),
      onDragStart: (event: DragEvent<HTMLButtonElement>) => {
        event.dataTransfer.setData(panelDragType, tab)
        event.dataTransfer.effectAllowed = 'move'
        useUi.getState().setDraggedPanel(tab)
      },
      onDragEnd: () => useUi.getState().setDraggedPanel(null),
    }
  }

  return (
    <div
      data-panel-header
      className="flex h-9 shrink-0 items-center justify-between gap-1 border-b border-line p-1"
    >
      <div
        role="tablist"
        aria-label={`${side === 'left' ? 'Left' : 'Right'} dock`}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
        style={
          stacked && children
            ? { maskImage: 'linear-gradient(to right, black calc(100% - 12px), transparent)' }
            : undefined
        }
      >
        {panels.map((tab) => (
          <button
            {...titleProps(tab)}
            key={tab}
            type="button"
            role="tab"
            aria-selected={tab === panel}
            aria-controls={panelBodyId(tab)}
            tabIndex={tab === panel ? 0 : -1}
            className={`h-[26px] shrink-0 cursor-grab rounded-md px-1 text-muted hover:bg-control aria-selected:text-ink ${stacked ? 'aria-selected:bg-control' : ''}`}
            onClick={() => selectTab(tab)}
            onDragOver={(event) => {
              const dragged = useUi.getState().draggedPanel
              if (dragged && dragged !== tab && panels.includes(dragged)) allowPanelDrop(event)
            }}
            onDrop={(event) => {
              const dragged = useUi.getState().draggedPanel
              if (dragged && dragged !== tab && panels.includes(dragged))
                dropPanel(event, side, 'reorder')
            }}
          >
            {panelTitles[tab]}
          </button>
        ))}
        {stacked && children && <span aria-hidden="true" className="w-3 shrink-0" />}
      </div>
      {children}
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
  return (
    <div
      id={panelBodyId(panel)}
      role="tabpanel"
      aria-labelledby={titleId(panel, panel)}
      className={`p-1 ${className}`}
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
    <div
      aria-hidden="true"
      className={`${className} grid place-items-center border border-dashed border-accent/50 bg-panel/85 text-center text-ink data-over:bg-primary/20`}
      onDragOver={(event) => {
        if (allowPanelDrop(event)) event.currentTarget.dataset.over = ''
      }}
      onDragLeave={(event) => delete event.currentTarget.dataset.over}
      onDrop={(event) => {
        delete event.currentTarget.dataset.over
        dropPanel(event, side, drop)
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
  if (!draggedPanel || event.dataTransfer.getData(panelDragType) !== draggedPanel) return
  event.preventDefault()
  event.stopPropagation()
  moveDockPanel(draggedPanel, side, drop)
}
