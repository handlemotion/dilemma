import { Viewport } from '@dilemma/view'
import { useEffect, useRef } from 'react'
import { beginTransform, finishTransform, previewTransform, selectJoints } from '../animation.ts'
import { editor } from '../editor.ts'
import { navigationOf, usePreferences } from '../preferences.ts'
import { useUi } from '../ui-store.ts'

let current: Viewport | null = null

/** The mounted viewport, for commands like Frame Selection. */
export function activeViewport(): Viewport | null {
  return current
}

/**
 * Hosts the three.js viewport. Editor state flows to it by subscription,
 * outside React rendering, so a per-frame update never re-renders React.
 */
export function ViewportPanel() {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const viewport = new Viewport(canvas.current!, {
      pick(joint, additive) {
        const { joints } = editor.getState().selection
        if (!joint) {
          if (!additive) editor.select([])
          return
        }
        if (!additive) return selectJoints([joint])
        const has = joints.some(
          (j) => j.characterId === joint.characterId && j.joint === joint.joint,
        )
        selectJoints(
          has
            ? joints.filter(
                (j) => !(j.characterId === joint.characterId && j.joint === joint.joint),
              )
            : [...joints, joint],
        )
      },
      transformStart: beginTransform,
      transformChange: previewTransform,
      transformEnd: finishTransform,
    })
    current = viewport
    // lets a script drive the viewport when the app is checked without a person
    if (import.meta.env.DEV) Object.assign(window, { __viewport: viewport })
    viewport.setNavigation(navigationOf(usePreferences.getState()))
    const offPreferences = usePreferences.subscribe((p) => viewport.setNavigation(navigationOf(p)))
    viewport.setAssets(useUi.getState().assets)
    viewport.setTransformMode(useUi.getState().transformMode)
    let previous = editor.getState()
    viewport.setState(previous)
    const offEditor = editor.subscribe((state) => {
      if (
        state.doc !== previous.doc ||
        state.playhead !== previous.playhead ||
        state.selection !== previous.selection
      )
        viewport.cancelTransform()
      previous = state
      viewport.setState(state)
    })
    const offUi = useUi.subscribe((ui, prev) => {
      if (ui.assets !== prev.assets) viewport.setAssets(ui.assets)
      if (ui.transformMode !== prev.transformMode) viewport.setTransformMode(ui.transformMode)
      if (ui.playing && !prev.playing) viewport.cancelTransform()
      if (ui.transformDraft !== prev.transformDraft) {
        const draft = ui.transformDraft
        viewport.setTransformPreview(draft?.key ? { joint: draft.joint, key: draft.key } : null)
      }
    })
    const stats = setInterval(() => useUi.getState().setFps(viewport.stats.fps), 500)
    return () => {
      clearInterval(stats)
      offEditor()
      offUi()
      offPreferences()
      viewport.dispose()
      current = null
    }
  }, [])

  return <canvas ref={canvas} className="block h-full w-full outline-none" tabIndex={-1} />
}
