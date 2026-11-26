import { Viewport } from '@dilemma/view'
import { useEffect, useRef } from 'react'
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
        if (!additive) return editor.select([joint])
        const has = joints.some(
          (j) => j.characterId === joint.characterId && j.joint === joint.joint,
        )
        editor.select(
          has
            ? joints.filter(
                (j) => !(j.characterId === joint.characterId && j.joint === joint.joint),
              )
            : [...joints, joint],
        )
      },
    })
    current = viewport
    // lets a script drive the viewport when the app is checked without a person
    if (import.meta.env.DEV) Object.assign(window, { __viewport: viewport })
    viewport.setNavigation(navigationOf(usePreferences.getState()))
    const offPreferences = usePreferences.subscribe((p) => viewport.setNavigation(navigationOf(p)))
    viewport.setAssets(useUi.getState().assets)
    viewport.setState(editor.getState())
    const offEditor = editor.subscribe((state) => viewport.setState(state))
    const offUi = useUi.subscribe((ui, prev) => {
      if (ui.assets !== prev.assets) viewport.setAssets(ui.assets)
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
