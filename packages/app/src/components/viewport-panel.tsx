import { setAxisCurves, type JointRef } from '@dilemma/core'
import { Viewport } from '@dilemma/view'
import { useEffect, useRef } from 'react'
import { beginTransform, selectJoints } from '../animation.ts'
import { editor } from '../editor.ts'
import { navigationOf, usePreferences } from '../preferences.ts'
import { useUi } from '../ui-store.ts'
import { ViewportGuides } from './viewport-tools.tsx'

let current: Viewport | null = null

const jointKey = ({ characterId, joint }: JointRef) => JSON.stringify([characterId, joint])

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
  const marquee = useUi((s) => s.viewportMarquee)

  useEffect(() => {
    let transform: ReturnType<typeof beginTransform> | undefined
    const surface = canvas.current!
    const background = getComputedStyle(surface).getPropertyValue('--color-viewport').trim()
    const viewport = new Viewport(surface, background, {
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
      pickBox(hits, additive) {
        if (!additive) {
          selectJoints(hits)
          return
        }
        if (hits.length === 0) return
        const { joints } = editor.getState().selection
        const existing = new Set(joints.map(jointKey))
        selectJoints([...joints, ...hits.filter((joint) => !existing.has(jointKey(joint)))])
      },
      marquee: useUi.getState().setViewportMarquee,
      transformStart(joint) {
        transform = beginTransform(joint)
      },
      transformChange(key) {
        transform?.preview(key)
      },
      transformEnd(commit) {
        transform?.finish(commit)
        transform = undefined
      },
    })
    current = viewport
    // lets a script drive the viewport when the app is checked without a person
    if (import.meta.env.DEV) Object.assign(window, { __viewport: viewport })
    viewport.setNavigation(navigationOf(usePreferences.getState()))
    const offPreferences = usePreferences.subscribe((p) => viewport.setNavigation(navigationOf(p)))
    viewport.setDisplay(useUi.getState().viewportSettings)
    viewport.setAssets(useUi.getState().assets)
    viewport.setTransformMode(useUi.getState().transformMode)
    let previous = editor.getState()
    viewport.setState(previous)
    const offEditor = editor.subscribe((state) => {
      if (
        state.doc !== previous.doc ||
        state.playhead !== previous.playhead ||
        state.selection !== previous.selection
      ) {
        viewport.cancelTransform()
        if (useUi.getState().transformDraft) useUi.getState().setTransformDraft(null)
      }
      previous = state
      viewport.setState(state)
    })
    const offUi = useUi.subscribe((ui, prev) => {
      if (ui.curveDraft !== prev.curveDraft) {
        const state = editor.getState()
        const draft = ui.curveDraft
        const doc = draft
          ? setAxisCurves(draft.clipId, draft.joint, draft.property, draft.curves).apply(state.doc)
              .doc
          : state.doc
        viewport.setState({ ...state, doc })
      }
      if (ui.viewportSettings !== prev.viewportSettings) viewport.setDisplay(ui.viewportSettings)
      if (ui.assets !== prev.assets) viewport.setAssets(ui.assets)
      if (ui.transformMode !== prev.transformMode) viewport.setTransformMode(ui.transformMode)
      if ((ui.playing && !prev.playing) || ui.previewFrame !== prev.previewFrame) {
        viewport.cancelTransform()
        if (ui.transformDraft) ui.setTransformDraft(null)
      }
      if (
        ui.transformDraft !== prev.transformDraft ||
        ui.unkeyedTransforms !== prev.unkeyedTransforms
      ) {
        const { transformDraft: draft, unkeyedTransforms } = useUi.getState()
        viewport.setTransformPreviews(
          draft?.key
            ? [...unkeyedTransforms, { joint: draft.joint, key: draft.key }]
            : unkeyedTransforms,
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

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvas}
        aria-label="Character viewport"
        className="block h-full w-full outline-none"
        tabIndex={-1}
      />
      <ViewportGuides />
      {marquee && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute border border-primary bg-primary/15 mix-blend-multiply"
          style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
        />
      )}
    </div>
  )
}
