export type DockPanel = 'outliner' | 'inspector'
export type DockSide = 'left' | 'right'
export type DockDrop = 'stack' | 'swap' | 'reorder'

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
  left: { panels: ['outliner'], active: 'outliner' },
  right: { panels: ['inspector'], active: 'inspector' },
}

export function dockSide(layout: DockLayout, panel: DockPanel): DockSide {
  return layout.left.panels.includes(panel) ? 'left' : 'right'
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
  return {
    ...layout,
    [from]: { panels: remaining, active: remaining[0] ?? null },
    [to]: { panels: [...target.panels, panel], active: panel },
  }
}
