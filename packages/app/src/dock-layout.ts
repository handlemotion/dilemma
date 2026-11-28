export type DockPanel = 'outliner' | 'inspector'
export type DockSide = 'left' | 'right'
export type DockDrop = 'stack' | 'swap' | 'reorder'
export type ViewportPosition = DockSide | 'center'
export type WorkspaceDrag = DockPanel | 'viewport'

interface Dock {
  panels: readonly DockPanel[]
  active: DockPanel | null
}

export type DockLayout = Record<DockSide, Dock>

export const panelTitles: Record<DockPanel, string> = {
  outliner: 'Outliner',
  inspector: 'Properties',
}

export const defaultDockLayout: DockLayout = {
  left: { panels: [], active: null },
  right: { panels: ['outliner', 'inspector'], active: 'outliner' },
}

export function dockSide(layout: DockLayout, panel: DockPanel): DockSide {
  return layout.left.panels.includes(panel) ? 'left' : 'right'
}

export function dockBeforeViewport(side: DockSide, position: ViewportPosition): boolean {
  return position === 'right' || (position === 'center' && side === 'left')
}

/** The pane and its side tab share the same slot. Collapsed slots keep the header. */
export function dockPanelSlots(
  panels: readonly DockPanel[],
  collapsed: Partial<Record<DockPanel, boolean>>,
) {
  if (panels.length < 2) return panels.map((panel) => ({ panel, top: '0px', height: '100%' }))
  const compactCount = panels.filter((panel) => collapsed[panel]).length
  const compact = `min(33px, ${100 / panels.length}%)`
  const expanded = `calc((100% - ${compactCount} * ${compact}) / ${Math.max(1, panels.length - compactCount)})`
  let compactAbove = 0
  return panels.map((panel, index) => {
    const top =
      index === 0
        ? '0px'
        : `calc(${compactAbove} * ${compact} + ${index - compactAbove} * ${expanded})`
    if (collapsed[panel]) compactAbove++
    return { panel, top, height: collapsed[panel] ? compact : expanded }
  })
}

export function movePanel(
  layout: DockLayout,
  panel: DockPanel,
  to: DockSide,
  drop: DockDrop,
): DockLayout {
  const from = dockSide(layout, panel)
  const source = layout[from]
  if (from === to) {
    if (drop !== 'reorder' || source.panels.length < 2) return layout
    return { ...layout, [from]: { ...source, panels: source.panels.toReversed(), active: panel } }
  }

  const target = layout[to]
  if (drop === 'swap' && target.panels.length) {
    return { ...layout, [from]: target, [to]: { ...source, active: panel } }
  }

  const remaining = source.panels.filter((value) => value !== panel)
  const panels = panel === 'outliner' ? [panel, ...target.panels] : [...target.panels, panel]
  return {
    ...layout,
    [from]: { panels: remaining, active: remaining[0] ?? null },
    [to]: { panels, active: panel },
  }
}
