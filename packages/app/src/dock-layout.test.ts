import { describe, expect, it } from 'vitest'
import { defaultDockLayout, movePanel } from './dock-layout.ts'

describe('side dock layout', () => {
  it('swaps the two panels when a title is dropped at the outer edge', () => {
    const swapped = movePanel(defaultDockLayout, 'outliner', 'right', 'swap')
    expect(swapped).toEqual({
      left: { panels: ['inspector'], active: 'inspector' },
      right: { panels: ['outliner'], active: 'outliner' },
    })
  })

  it('tabs the moved panel with the destination and restores a split when detached', () => {
    const stacked = movePanel(defaultDockLayout, 'outliner', 'right', 'stack')
    expect(stacked).toEqual({
      left: { panels: [], active: null },
      right: { panels: ['inspector', 'outliner'], active: 'outliner' },
    })
    expect(movePanel(stacked, 'outliner', 'left', 'swap')).toEqual(defaultDockLayout)
  })

  it('reorders tabs in place and activates the dropped tab', () => {
    const stacked = movePanel(defaultDockLayout, 'inspector', 'left', 'stack')
    const reordered = movePanel(stacked, 'outliner', 'left', 'reorder')
    expect(reordered.left).toEqual({ panels: ['inspector', 'outliner'], active: 'outliner' })
    expect(reordered.right).toEqual({ panels: [], active: null })
  })
})
