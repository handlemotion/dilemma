import { CONTROL_LABELS, RIG_ROLES, type JointRef } from '@dilemma/core'
import { Viewport, type RigSetupPreview } from '@dilemma/view'
import { useCallback, useEffect, useRef } from 'react'
import { beginTransform, selectJoints } from '../animation.ts'
import { editor, useEditorState } from '../editor.ts'
import { sampleMotionTrail } from '../motion-trail.ts'
import { navigationOf, usePreferences } from '../preferences.ts'
import { pickRigJoint, rigSetupSteps } from '../rig-setup.ts'
import { useUi, type RigSetupDraft } from '../ui-store.ts'
import { RigSetupGuide } from './rig-review.tsx'
import { ViewportGuides } from './viewport-tools.tsx'

let current: Viewport | null = null

const jointKey = ({ characterId, joint, control }: JointRef) =>
  JSON.stringify([characterId, joint, control])

function setupPreview(setup: RigSetupDraft | null): RigSetupPreview | null {
  if (!setup) return null
  const step = setup.step === null ? null : rigSetupSteps[setup.step]!
  const focusHeight = step?.focusHeight ?? null
  const roles = step ? (focusHeight === null ? RIG_ROLES : step.roles) : []
  const mapped = roles.flatMap((role) => {
    const joint = setup.joints[role]
    return joint === undefined ? [] : [joint]
  })
  const highlighted = setup.previewRole && setup.joints[setup.previewRole]
  return {
    characterId: setup.characterId,
    overview: setup.step === null,
    focusHeight,
    focusJoints: mapped.length === roles.length ? mapped : [],
    highlightedJoints: typeof highlighted === 'number' ? [highlighted] : mapped,
    picking: setup.pickRole !== null,
  }
}

function reserveGuideSpace(viewport: Viewport, surface: HTMLCanvasElement, island: HTMLElement) {
  const view = surface.getBoundingClientRect()
  const card = island.getBoundingClientRect()
  const bottom = getComputedStyle(island).getPropertyValue('--rig-guide-edge') === 'bottom'
  viewport.setRigSetupSpace({
    right: bottom ? 0 : Math.max(view.width * 0.38, view.right - card.left + 12),
    bottom: bottom ? Math.max(0, view.bottom - card.top + 12) : 0,
  })
}

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
  const guide = useRef<HTMLElement>(null)
  const view = useRef<Viewport>(null)
  const marquee = useUi((s) => s.viewportMarquee)
  const hovered = useUi((s) => s.hoveredControl)
  const setup = useUi((s) => s.rigSetup)
  const setupCharacter = useEditorState(({ doc }) =>
    doc.characters.find(({ id }) => id === setup?.characterId),
  )
  const attachGuide = useCallback((island: HTMLElement | null) => {
    guide.current = island
    const surface = canvas.current
    if (!island || !surface) return
    const measure = () => {
      if (view.current) reserveGuideSpace(view.current, surface, island)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(surface)
    observer.observe(island)
    measure()
    return () => {
      observer.disconnect()
      guide.current = null
    }
  }, [])

  useEffect(() => {
    let transform: ReturnType<typeof beginTransform> | undefined
    const surface = canvas.current!
    const background = getComputedStyle(surface).getPropertyValue('--color-viewport').trim()
    const viewport = new Viewport(surface, background, {
      pick(joint, additive) {
        if (useUi.getState().rigSetup) {
          if (joint) pickRigJoint(joint)
          return
        }
        const { joints } = editor.getState().selection
        if (!joint) {
          if (!additive) editor.select([])
          return
        }
        if (!additive) return selectJoints([joint])
        const id = jointKey(joint)
        const has = joints.some((j) => jointKey(j) === id)
        selectJoints(has ? joints.filter((j) => jointKey(j) !== id) : [...joints, joint])
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
      hoverControl: useUi.getState().setHoveredControl,
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
    view.current = viewport
    // lets a script drive the viewport when the app is checked without a person
    if (import.meta.env.DEV) Object.assign(window, { __viewport: viewport })
    viewport.setNavigation(navigationOf(usePreferences.getState()))
    const offPreferences = usePreferences.subscribe((p) => viewport.setNavigation(navigationOf(p)))
    viewport.setDisplay(useUi.getState().viewportSettings)
    viewport.setAssets(useUi.getState().assets)
    viewport.setTransformMode(useUi.getState().transformMode)
    let previous = editor.getState()
    viewport.setState(previous)
    viewport.setRigSetupPreview(setupPreview(useUi.getState().rigSetup))
    let trailUpdate = 0
    function updateMotionTrail() {
      if (trailUpdate) cancelAnimationFrame(trailUpdate)
      if (!useUi.getState().showMotionTrails || useUi.getState().rigSetup) {
        trailUpdate = 0
        viewport.setMotionTrail(null)
        return
      }
      trailUpdate = requestAnimationFrame(() => {
        trailUpdate = 0
        const ui = useUi.getState()
        viewport.setMotionTrail(sampleMotionTrail(editor.getState(), ui.workArea, ui.transformMode))
      })
    }
    if (useUi.getState().showMotionTrails) updateMotionTrail()
    if (guide.current) reserveGuideSpace(viewport, surface, guide.current)
    const offEditor = editor.subscribe((state) => {
      if (
        useUi.getState().showMotionTrails &&
        (state.doc !== previous.doc ||
          state.selection !== previous.selection ||
          state.playhead.clipId !== previous.playhead.clipId)
      )
        updateMotionTrail()
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
      if (ui.viewportSettings !== prev.viewportSettings) viewport.setDisplay(ui.viewportSettings)
      if (ui.assets !== prev.assets) viewport.setAssets(ui.assets)
      if (ui.transformMode !== prev.transformMode) viewport.setTransformMode(ui.transformMode)
      if (ui.rigSetup !== prev.rigSetup) viewport.setRigSetupPreview(setupPreview(ui.rigSetup))
      if (
        ui.showMotionTrails !== prev.showMotionTrails ||
        (ui.showMotionTrails &&
          (ui.workArea !== prev.workArea ||
            ui.transformMode !== prev.transformMode ||
            Boolean(ui.rigSetup) !== Boolean(prev.rigSetup)))
      )
        updateMotionTrail()
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
      if (trailUpdate) cancelAnimationFrame(trailUpdate)
      offEditor()
      offUi()
      offPreferences()
      viewport.dispose()
      view.current = null
      current = null
    }
  }, [])

  return (
    <div className="rig-viewport relative h-full w-full">
      <div className="size-full">
        <canvas
          ref={canvas}
          aria-label="Character viewport"
          className="block h-full w-full outline-none"
          tabIndex={-1}
        />
      </div>
      <ViewportGuides />
      {setupCharacter && setup && (
        <RigSetupGuide
          key={setupCharacter.id}
          character={setupCharacter}
          setup={setup}
          guideRef={attachGuide}
          returnFocus={() => canvas.current?.focus()}
        />
      )}
      {hovered && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-ink px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white"
          style={{
            left: `clamp(45px, ${hovered.x}px, calc(100% - 45px))`,
            top: Math.max(22, hovered.y - 14),
          }}
        >
          {CONTROL_LABELS[hovered.control]}
          {hovered.outOfReach && ' · Out of reach'}
        </span>
      )}
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
