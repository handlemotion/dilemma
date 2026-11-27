import {
  findCharacter,
  type Clip,
  type Joint,
  type JointRef,
  type TransformChannel,
  type TransformKey,
  type Vec3,
} from '@dilemma/core'
import { compileClip, compileSkeleton, LOCAL_STRIDE, sampleClip } from '@dilemma/solve'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Euler, MathUtils, Quaternion } from 'three'
import { beginTransform } from '../animation.ts'
import { useEditorState } from '../editor.ts'
import { Icon } from '../icons/central.tsx'
import { useUi } from '../ui-store.ts'
import { InspectorSection } from './inspector-section.tsx'
import { SceneInspector } from './scene-inspector.tsx'

const axes = ['X', 'Y', 'Z'] as const
const properties = [
  { channel: 'translations', label: 'Position', step: 0.01 },
  { channel: 'rotations', label: 'Rotation', step: 0.5 },
  { channel: 'scales', label: 'Scale', step: 0.01 },
] as const

function toAxes(key: TransformKey): Vec3 {
  if (key.channel !== 'rotations') return key.value
  const { x, y, z } = new Euler().setFromQuaternion(new Quaternion(...key.value), 'XYZ')
  return [MathUtils.radToDeg(x), MathUtils.radToDeg(y), MathUtils.radToDeg(z)]
}

function toKey(channel: TransformChannel, values: Vec3): TransformKey {
  if (channel !== 'rotations') return { channel, value: values }
  const [x, y, z] = values.map(MathUtils.degToRad)
  return {
    channel,
    value: new Quaternion().setFromEuler(new Euler(x, y, z, 'XYZ')).toArray(),
  }
}

export function Inspector() {
  const { doc, selection, playhead } = useEditorState()
  const previewFrame = useUi((state) => state.previewFrame)
  const active = doc.clips.find((clip) => clip.id === playhead.clipId)
  const selected = selection.joints.flatMap((ref) => {
    const character = findCharacter(doc, ref.characterId)
    const joint = character?.skeleton.joints[ref.joint]
    return character && joint ? [{ ref, character, joint }] : []
  })
  const animatedSkeleton = selected.find(({ character }) => character.id === active?.characterId)
    ?.character.skeleton
  const skeleton = useMemo(
    () => (animatedSkeleton ? compileSkeleton(animatedSkeleton) : null),
    [animatedSkeleton],
  )
  const compiled = useMemo(
    () => (active && skeleton ? compileClip(active, skeleton.count) : null),
    [active, skeleton],
  )
  const local = useMemo(() => {
    if (!skeleton) return null
    const values = skeleton.rest.slice()
    if (compiled) sampleClip(compiled, playhead.frame, values)
    return values
  }, [compiled, playhead.frame, skeleton])
  if (!selected.length) return <SceneInspector timing={doc.sceneTiming} />

  const showCharacter = selected.some(({ ref }) => ref.characterId !== selected[0]?.ref.characterId)
  return (
    <div>
      {selected.map(({ ref, character, joint }, index) => {
        const id = JSON.stringify([ref.characterId, ref.joint])
        const clip = active?.characterId === ref.characterId ? active : undefined
        return (
          <JointInspector
            key={id}
            id={id}
            defaultExpanded={index === 0}
            selected={ref}
            joint={joint}
            characterName={showCharacter ? character.name : undefined}
            clip={clip}
            frame={clip ? playhead.frame : active ? doc.sceneTiming.start : previewFrame}
            local={clip ? local : null}
          />
        )
      })}
    </div>
  )
}

function JointInspector({
  id,
  defaultExpanded,
  selected,
  joint,
  characterName,
  clip,
  frame,
  local,
}: {
  id: string
  defaultExpanded: boolean
  selected: JointRef
  joint: Joint
  characterName: string | undefined
  clip: Clip | undefined
  frame: number
  local: Float64Array | null
}) {
  return (
    <InspectorSection
      id={id}
      title={joint.name}
      summary={characterName}
      defaultExpanded={defaultExpanded}
    >
      <JointProperties
        key={JSON.stringify([clip?.id, frame])}
        selected={selected}
        joint={joint}
        clip={clip}
        frame={frame}
        local={local}
      />
    </InspectorSection>
  )
}

function JointProperties({
  selected,
  joint,
  clip,
  frame,
  local,
}: {
  selected: JointRef
  joint: Joint
  clip: Clip | undefined
  frame: number
  local: Float64Array | null
}) {
  const draft = useUi((state) => state.transformDraft)
  const unkeyed = useUi((state) => state.unkeyedTransforms)
  const track = clip?.tracks.find((entry) => entry.joint === selected.joint)
  const preview =
    draft?.joint.characterId === selected.characterId && draft.joint.joint === selected.joint
      ? draft.key
      : null
  const offset = selected.joint * LOCAL_STRIDE
  const transform = local
    ? ({
        translation: [local[offset]!, local[offset + 1]!, local[offset + 2]!],
        rotation: [local[offset + 3]!, local[offset + 4]!, local[offset + 5]!, local[offset + 6]!],
        scale: [local[offset + 7]!, local[offset + 8]!, local[offset + 9]!],
      } satisfies Joint['rest'])
    : joint.rest
  const keys = {
    translations: { channel: 'translations', value: transform.translation },
    rotations: { channel: 'rotations', value: transform.rotation },
    scales: { channel: 'scales', value: transform.scale },
  } satisfies Record<TransformChannel, TransformKey>

  return (
    <>
      {properties.map(({ channel, label, step }) => {
        const pendingKey = unkeyed.find(
          ({ joint: ref, key }) =>
            ref.characterId === selected.characterId &&
            ref.joint === selected.joint &&
            key.channel === channel,
        )?.key
        const key = pendingKey?.channel === channel ? pendingKey : keys[channel]
        const values = toAxes(key)
        const shown = preview?.channel === channel ? toAxes(preview) : values
        const keyed = track?.[channel]?.frames.includes(frame) ?? false

        return (
          <section key={channel} aria-label={label} className="border-t border-line p-1">
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-xs leading-5 font-medium text-muted">{label}</h3>
              <button
                type="button"
                className="grid size-5 place-items-center rounded-md text-muted hover:bg-control hover:text-ink data-keyed:text-accent"
                aria-label={`Set ${label.toLowerCase()} key`}
                aria-description={keyed ? 'Keyed at the current frame' : undefined}
                title={keyed ? 'Keyed at the current frame' : `Set ${label.toLowerCase()} key`}
                data-keyed={keyed || undefined}
                onClick={() => {
                  const edit = beginTransform(selected)
                  edit.preview(key)
                  edit.finish(true, true)
                }}
              >
                <Icon name="keyframe" size={12} className={keyed ? 'fill-current' : undefined} />
              </button>
            </div>
            <div className="grid gap-1">
              {axes.map((axis, index) => (
                <AxisField
                  key={axis}
                  axis={axis}
                  label={`${label} ${axis}`}
                  value={shown[index]!}
                  step={step}
                  start={() => {
                    const edit = beginTransform(selected)
                    return {
                      preview(next) {
                        const updated: Vec3 = [...values]
                        updated[index] = next
                        edit.preview(next === values[index] ? null : toKey(channel, updated))
                      },
                      finish: edit.finish,
                    }
                  }}
                />
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}

interface AxisEdit {
  preview(value: number): void
  finish(commit: boolean): void
}

interface Scrub {
  pointer: number
  x: number
  value: number
  next: number
  edit: AxisEdit
}

function parseValue(text: string): number {
  const number = text.trim().replace(',', '.')
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(number) ? Number(number) : NaN
}

function AxisField({
  axis,
  label,
  value,
  step,
  start,
}: {
  axis: string
  label: string
  value: number
  step: number
  start(): AxisEdit
}) {
  const input = useRef<HTMLInputElement>(null)
  const grip = useRef<HTMLSpanElement>(null)
  const drag = useRef<Scrub | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [scrubValue, setScrubValue] = useState<number | null>(null)
  const display = String(Number((scrubValue ?? value).toFixed(4)))

  useLayoutEffect(() => () => drag.current?.edit.finish(false), [])

  function commit(next: number) {
    if (!Number.isFinite(next) || next === value) return
    const edit = start()
    edit.preview(next)
    edit.finish(true)
  }

  function endScrub(keepValue: boolean) {
    const current = drag.current
    if (!current) return
    drag.current = null
    setScrubValue(null)
    if (grip.current?.hasPointerCapture(current.pointer)) {
      grip.current.releasePointerCapture(current.pointer)
    }
    current.edit.finish(keepValue)
  }

  return (
    <div className="inspector-field" data-scrubbing={scrubValue !== null || undefined}>
      <span aria-hidden="true" className="pl-2 text-[11px] font-medium text-muted">
        {axis}
      </span>
      <span
        ref={grip}
        aria-hidden="true"
        className="inspector-scrub"
        title={`Drag to adjust ${label.toLowerCase()}`}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0 || drag.current) return
          event.preventDefault()
          input.current?.focus()
          setText(null)
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = {
            pointer: event.pointerId,
            x: event.clientX,
            value,
            next: value,
            edit: start(),
          }
          setScrubValue(value)
        }}
        onPointerMove={(event) => {
          const current = drag.current
          if (!current || current.pointer !== event.pointerId) return
          const delta = event.clientX - current.x
          const speed = event.altKey ? 0.1 : event.shiftKey ? 10 : 1
          const next = current.value + delta * step * speed
          if (next === current.next || !Number.isFinite(next)) return
          current.next = next
          setScrubValue(next)
          current.edit.preview(next)
        }}
        onPointerUp={(event) => {
          const current = drag.current
          if (current?.pointer !== event.pointerId) return
          endScrub(true)
          if (current.next !== current.value) input.current?.blur()
        }}
        onLostPointerCapture={(event) => {
          if (drag.current?.pointer === event.pointerId) endScrub(false)
        }}
      />
      <input
        ref={input}
        type="text"
        inputMode="decimal"
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        value={text ?? display}
        onFocus={(event) => {
          useUi.getState().setPlaying(false)
          event.currentTarget.select()
        }}
        onChange={(event) => setText(event.currentTarget.value)}
        onBlur={() => {
          if (drag.current) endScrub(false)
          if (text !== null) commit(parseValue(text))
          setText(null)
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Escape') {
            event.preventDefault()
            setText(null)
            endScrub(false)
          } else if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          } else if (
            !event.metaKey &&
            !event.ctrlKey &&
            (event.key === 'ArrowUp' || event.key === 'ArrowDown')
          ) {
            event.preventDefault()
            if (drag.current) return
            const typed = text === null ? value : parseValue(text)
            const base = Number.isFinite(typed) ? typed : value
            const direction = event.key === 'ArrowUp' ? 1 : -1
            const speed = event.altKey ? 0.1 : event.shiftKey ? 10 : 1
            commit(base + direction * step * speed)
            setText(null)
          }
        }}
      />
    </div>
  )
}
