import { Viewport } from '@dilemma/view'
import { useEffect, useRef } from 'react'
import { beginRotation, finishRotation, previewRotation, selectJoints } from '../animation.ts'
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
      rotationStart: beginRotation,
      rotationChange: previewRotation,
      rotationEnd: finishRotation,
    })
    current = viewport
    // lets a script drive the viewport when the app is checked without a person
    if (import.meta.env.DEV) Object.assign(window, { __viewport: viewport })
    viewport.setNavigation(navigationOf(usePreferences.getState()))
    const offPreferences = usePreferences.subscribe((p) => viewport.setNavigation(navigationOf(p)))
    viewport.setAssets(useUi.getState().assets)
    let previous = editor.getState()
    viewport.setState(previous)
    const offEditor = editor.subscribe((state) => {
      if (
        useUi.getState().rotationDraft &&
        (state.doc !== previous.doc ||
          state.playhead !== previous.playhead ||
          state.selection !== previous.selection)
      )
        finishRotation(false)
      previous = state
      viewport.setState(state)
    })
    const offUi = useUi.subscribe((ui, prev) => {
      if (ui.assets !== prev.assets) viewport.setAssets(ui.assets)
      if (ui.rotationDraft !== prev.rotationDraft) {
        const draft = ui.rotationDraft
        viewport.setRotationPreview(
          draft?.rotation ? { joint: draft.joint, rotation: draft.rotation } : null,
        )
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
