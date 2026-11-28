import {
  axisCurves,
  CURVE_AXES,
  curveValue,
  keyChannel,
  rotationAxes,
  setAxisCurves,
  validAxisCurves,
  type AxisCurves,
  type Character,
  type Clip,
  type CurveInterpolation,
  type CurveKey,
  type CurveTangent,
  type KeyProperty,
  type Vec3,
} from '@dilemma/core'
import {
  compileClip,
  compileSkeleton,
  createPose,
  LOCAL_STRIDE,
  sampleClip,
  solvePose,
} from '@dilemma/solve'
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { deleteKeys, selectJoints } from '../animation.ts'
import { editor } from '../editor.ts'
import { ActionIcon } from '../icons/action.tsx'
import { resolveWorkArea, useUi } from '../ui-store.ts'
import { AXIS_COLORS, hasPoint, mapCurves, mountCurveGraph, tangentFor } from './curve-graph.ts'

const names = ['X', 'Y', 'Z']
const axisGlyphs = ['M4 3l6 8m0-8-6 8', 'm3.5 3 3.5 4 3.5-4M7 7v4', 'M4 3h6l-6 8h6']
const properties = [
  { id: 'translations', label: 'Position (m)' },
  { id: 'rotations', label: 'Rotation (°)' },
  { id: 'scales', label: 'Scale' },
  { id: 'ikTarget', label: 'IK target (m)' },
] as const

const actionClass = 'shell-icon focus-visible:outline-primary'
const fieldClass =
  'h-6 min-w-0 rounded-md bg-raised px-1.5 text-ink outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-45'

interface CurveTimelineProps {
  clip: Clip
  character: Character
  joint: number
  frame: number
  workStart: number
  workEnd: number
  seek(frame: number): void
  controls: ReactNode
  clipPicker: ReactNode
}

export function CurveTimeline(props: CurveTimelineProps) {
  const { character, clip, joint, controls, clipPicker } = props
  const preferred = useUi((state) => state.curveProperty)
  const selected = character.skeleton.joints[joint]!
  const available = properties.filter(({ id }) => id !== 'ikTarget' || joint === clip.limb?.tip)
  const mode = useUi((state) => state.transformMode)
  const property =
    (preferred && available.some(({ id }) => id === preferred) ? preferred : undefined) ??
    (mode === 'ik' && clip.limb?.tip === joint ? 'ikTarget' : undefined) ??
    available.find(({ id }) => keyChannel(clip, joint, id))?.id ??
    'rotations'
  const defaults: Vec3 =
    property === 'translations'
      ? selected.rest.translation
      : property === 'scales'
        ? selected.rest.scale
        : property === 'rotations'
          ? rotationAxes(selected.rest.rotation)
          : [0, 0, 0]
  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-col border-r border-line">
        {controls}
        <div className="grid content-start gap-2 overflow-y-auto px-2 py-2">
          <div className="flex items-center gap-1">
            <select
              className={`${fieldClass} w-0 flex-1`}
              aria-label="Curve joint"
              value={joint}
              title={selected.name}
              onChange={(event) => {
                const index = Number(event.currentTarget.value)
                useUi.getState().setActiveTimelineRow(null)
                selectJoints([{ characterId: character.id, joint: index }])
              }}
            >
              {character.skeleton.joints.map(({ id, name }, index) => (
                <option key={id} value={index}>
                  {name}
                </option>
              ))}
            </select>
            {clipPicker}
          </div>
          <select
            className={fieldClass}
            aria-label="Curve property"
            value={property}
            onChange={(event) =>
              useUi.getState().setCurveProperty(event.currentTarget.value as KeyProperty)
            }
          >
            {available.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <AxisVisibility />
        </div>
      </div>
      <CurveWorkspace
        key={`${joint}/${property}`}
        {...props}
        property={property}
        defaults={defaults}
      />
    </>
  )
}

function AxisVisibility() {
  const axes = useUi((state) => state.curveAxes)
  return (
    <div role="group" aria-label="Visible curve axes" className="flex gap-1">
      {CURVE_AXES.map((axis) => {
        const visible = axes.includes(axis)
        return (
          <button
            key={axis}
            type="button"
            aria-label={`Show ${names[axis]} curve`}
            title={`Show ${names[axis]} curve`}
            aria-pressed={visible}
            className="shell-icon shell-toggle flex-1 focus-visible:outline-primary"
            onClick={() =>
              useUi
                .getState()
                .setCurveAxes(
                  visible
                    ? axes.filter((entry) => entry !== axis)
                    : CURVE_AXES.filter((entry) => axes.includes(entry) || entry === axis),
                )
            }
          >
            <svg
              aria-hidden="true"
              className="size-4"
              viewBox="0 0 14 14"
              fill="none"
              style={{ color: AXIS_COLORS[axis] }}
            >
              <path
                d={axisGlyphs[axis]}
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )
      })}
    </div>
  )
}

function CurveWorkspace({
  clip,
  character,
  joint,
  property,
  defaults,
  frame: playheadFrame,
  workStart,
  workEnd,
  seek,
}: CurveTimelineProps & { property: KeyProperty; defaults: Vec3 }) {
  const channel = keyChannel(clip, joint, property)
  const curves = useMemo(() => axisCurves(channel, property), [channel, property])
  const axes = useUi((state) => state.curveAxes)
  const selection = useUi((state) => state.curveSelection)
  const picked = useMemo(
    () =>
      selection.filter(
        ({ axis, frame }) => axes.includes(axis) && curves[axis].some((key) => key.frame === frame),
      ),
    [selection, axes, curves],
  )
  const host = useRef<HTMLDivElement>(null)
  const graph = useRef<ReturnType<typeof mountCurveGraph> | null>(null)
  const current = useRef({ clip, curves, seek })
  const view = {
    curves,
    axes,
    selection: picked,
    frame: playheadFrame,
    workStart,
    workEnd,
    start: clip.start,
    end: clip.end,
  }
  const initial = useRef(view)

  useLayoutEffect(() => {
    current.current = { clip, curves, seek }
    graph.current?.update(view)
    if (picked.length !== selection.length) useUi.getState().setCurveSelection(picked)
  })

  useLayoutEffect(() => {
    const instance = mountCurveGraph(
      host.current!,
      {
        select: (points) => useUi.getState().setCurveSelection(points),
        seek: (next) => current.current.seek(next),
        commit,
        preview(next) {
          const base = current.current
          const ui = useUi.getState()
          if (!next) ui.setCurveDraft(null)
          else if (isCurrent() && validAxisCurves(next, base.clip.start, base.clip.end)) {
            if (ui.playing) ui.setPlaying(false)
            ui.setCurveDraft({ clipId: clip.id, joint, property, curves: next })
          }
        },
        keydown(event) {
          if (event.metaKey || event.ctrlKey || event.altKey) return
          const key = event.key.toLowerCase()
          if (key === 'delete' || key === 'backspace') deleteKeys()
          else if (key === 'a') {
            const ui = useUi.getState()
            ui.setCurveSelection(
              ui.curveAxes.flatMap((axis) =>
                current.current.curves[axis].map(({ frame }) => ({ axis, frame })),
              ),
            )
          } else if (key === 'f') instance.fit(true)
          else if (key === '[' || key === ']') {
            const { doc, playhead } = editor.getState()
            const active = current.current.clip
            const ui = useUi.getState()
            const { start, end } = resolveWorkArea(active, doc.sceneTiming, ui.workArea)
            ui.setWorkArea({
              clipId: active.id,
              start: key === '[' ? Math.min(playhead.frame, end) : start,
              end: key === ']' ? Math.max(playhead.frame, start) : end,
            })
          } else return
          event.preventDefault()
        },
      },
      initial.current,
    )
    graph.current = instance
    useUi.getState().setCurveTarget({ clipId: clip.id, joint, property })
    return () => {
      instance.destroy()
      graph.current = null
      useUi.getState().setCurveTarget(null)
    }
    // A change of joint, property or clip remounts this workspace.
  }, [clip.id, joint, property])

  function isCurrent() {
    const { doc, playhead } = editor.getState()
    const base = current.current
    const active = doc.clips.find(({ id }) => id === playhead.clipId)
    return active === base.clip
  }

  function commit(next: AxisCurves, label: string) {
    const base = current.current
    if (!isCurrent() || sameCurves(base.curves, next)) return false
    const ui = useUi.getState()
    if (next.some((axis) => axis.length) && !validAxisCurves(next, base.clip.start, base.clip.end))
      return false
    ui.setPlaying(false)
    if (ui.curveProperty !== property) ui.setCurveProperty(property)
    try {
      editor.run(setAxisCurves(base.clip.id, joint, property, next, label))
      return true
    } catch (error) {
      ui.setError(error instanceof Error ? error.message : String(error))
      return false
    }
  }

  function changeSelected(
    label: string,
    edit: (key: CurveKey, index: number, keys: CurveKey[]) => CurveKey,
  ) {
    commit(
      mapCurves(curves, (keys, axis) =>
        keys.map((key, index) =>
          hasPoint(picked, axis, key.frame) ? edit(key, index, keys) : key,
        ),
      ),
      label,
    )
  }

  function addKeys() {
    const { frame } = editor.getState().playhead
    let sampled = curves.map((keys, axis) => curveValue(keys, frame) ?? defaults[axis]!) as Vec3
    if (property === 'rotations' && channel && !channel.curves) {
      const skeleton = compileSkeleton(character.skeleton, character.rig)
      const local = skeleton.rest.slice()
      sampleClip(compileClip(clip, skeleton.count), frame, local)
      const offset = joint * LOCAL_STRIDE + 3
      sampled = rotationAxes(
        [local[offset]!, local[offset + 1]!, local[offset + 2]!, local[offset + 3]!],
        sampled,
      )
    } else if (property === 'ikTarget' && axes.some((axis) => curves[axis].length === 0)) {
      const skeleton = compileSkeleton(character.skeleton, character.rig)
      const pose = createPose(skeleton)
      solvePose(skeleton, compileClip(clip, skeleton.count), frame, pose)
      sampled = [pose.ik.target[0]!, pose.ik.target[1]!, pose.ik.target[2]!]
    }
    const next = mapCurves(curves, (keys, axis) => {
      if (!axes.includes(axis) || keys.some((key) => key.frame === frame)) return keys
      const previous = keys.findLast((key) => key.frame < frame)
      return [
        ...keys,
        {
          frame,
          value: sampled[axis],
          interpolation: previous?.interpolation ?? 'linear',
        },
      ].toSorted((a, b) => a.frame - b.frame)
    })
    commit(next, 'Add curve keys')
    useUi.getState().setCurveSelection(axes.map((axis) => ({ axis, frame })))
  }

  const selectedKeys = picked.flatMap(({ axis, frame }) =>
    curves[axis].filter((key) => key.frame === frame),
  )
  const interpolation = sharedValue(selectedKeys.map((key) => key.interpolation))
  const tangent = sharedValue(selectedKeys.map((key) => key.tangent?.mode ?? 'auto'))
  const empty = !axes.some((axis) => curves[axis].length)
  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-timeline">
      <div className="flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-panel px-2 [scrollbar-width:none]">
        <button
          type="button"
          className={actionClass}
          data-action-group="keying"
          aria-label="Add Key"
          disabled={!axes.length}
          onClick={addKeys}
          title="Add a key at the playhead on each visible axis"
        >
          <ActionIcon name="setKey" />
        </button>
        <button
          type="button"
          className={actionClass}
          data-action-group="keying"
          aria-label="Delete Curve Keys"
          disabled={!picked.length}
          onClick={deleteKeys}
          title="Delete selected keys (Delete)"
        >
          <ActionIcon name="deleteKey" />
        </button>
        <span aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-line" />
        <select
          className={`${fieldClass} w-28 shrink-0`}
          aria-label="Curve interpolation"
          title="Interpolation after each selected key"
          disabled={!picked.length}
          value={interpolation}
          onChange={(event) => {
            const mode = event.currentTarget.value as CurveInterpolation
            changeSelected('Set curve interpolation', (key) => ({ ...key, interpolation: mode }))
          }}
        >
          <option value="" disabled>
            Interpolation
          </option>
          <option value="constant">Stepped</option>
          <option value="linear">Linear</option>
          <option value="bezier">Bézier</option>
        </select>
        <select
          className={`${fieldClass} w-24 shrink-0`}
          aria-label="Curve tangents"
          title="Tangent type for selected keys"
          disabled={!picked.length}
          value={tangent}
          onChange={(event) => {
            const mode = event.currentTarget.value as CurveTangent['mode'] | 'auto'
            changeSelected('Set curve tangents', (key, index, keys) => {
              if (mode !== 'auto') return { ...key, tangent: tangentFor(keys, index, mode) }
              const { tangent: _tangent, ...automatic } = key
              return automatic
            })
          }}
        >
          <option value="" disabled>
            Tangents
          </option>
          <option value="auto">Automatic</option>
          <option value="aligned">Aligned</option>
          <option value="free">Free</option>
        </select>
        <button
          type="button"
          className={actionClass}
          data-action-group="workspace"
          aria-label="Fit Curves"
          onClick={() => graph.current?.fit(false)}
          title="Fit visible curves to the clip (F fits selected keys)"
        >
          <ActionIcon name="fitCurves" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={host} className="absolute inset-0" />
        {empty && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center pl-14 text-muted">
            {axes.length ? 'Add a key at the playhead.' : 'Show an axis to view its curve.'}
          </div>
        )}
      </div>
    </div>
  )
}

function sharedValue(values: readonly string[]): string {
  const first = values[0]
  return first && values.every((value) => value === first) ? first : ''
}

function sameCurves(a: AxisCurves, b: AxisCurves): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
