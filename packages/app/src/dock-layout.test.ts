import { describe, expect, it } from 'vitest'
import { defaultDockLayout, movePanel, type DockLayout } from './dock-layout.ts'

const separateDocks: DockLayout = {
  left: { panels: ['outliner'], active: 'outliner' },
  right: { panels: ['inspector'], active: 'inspector' },
}

describe('side dock layout', () => {
  it('opens with Outliner above Properties in the right dock', () => {
    expect(defaultDockLayout.left.panels).toEqual([])
    expect(defaultDockLayout.right.panels).toEqual(['outliner', 'inspector'])
  })

  it('swaps separate docks when a grip is dropped at the outer edge', () => {
    const swapped = movePanel(separateDocks, 'outliner', 'right', 'swap')
    expect(swapped).toEqual({
      left: { panels: ['inspector'], active: 'inspector' },
      right: { panels: ['outliner'], active: 'outliner' },
    })
  })

  it('detaches a panel and restores the stack with Outliner first when docked again', () => {
    const detached = movePanel(defaultDockLayout, 'outliner', 'left', 'stack')
    expect(detached).toEqual(separateDocks)
    expect(movePanel(detached, 'outliner', 'right', 'stack')).toEqual(defaultDockLayout)
  })

  it('reorders a stack without removing either panel', () => {
    expect(movePanel(defaultDockLayout, 'outliner', 'right', 'reorder').right).toEqual({
      panels: ['inspector', 'outliner'],
      active: 'outliner',
    })
  })
})
