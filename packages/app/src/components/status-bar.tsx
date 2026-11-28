import { Select } from '@base-ui/react/select'
import { setClipTiming, type Clip } from '@dilemma/core'
import type { ReactNode } from 'react'
import { keySelection } from '../animation.ts'
import { editor, useEditorState } from '../editor.ts'
import { ActionIcon } from '../icons/action.tsx'
import { Icon } from '../icons/central.tsx'
import { PLAYBACK_SPEEDS, resolveWorkArea, useUi } from '../ui-store.ts'
import { NumberField } from './number-field.tsx'

const speedItems = PLAYBACK_SPEEDS.map((speed) => ({ value: speed, label: `${speed}×` }))

export function StatusBar() {
  const clip = useEditorState(({ doc, playhead }) =>
    doc.clips.find(({ id }) => id === playhead.clipId),
  )
  const sceneTiming = useEditorState(({ doc }) => doc.sceneTiming)
  const hasSelection = useEditorState(({ selection }) => selection.joints.length > 0)
  const error = useUi((s) => s.error)
  const workArea = useUi((s) => s.workArea)
  const autoKey = useUi((s) => s.autoKey)
  const hasDraft = useUi((s) => s.transformDraft !== null)
  const hasUnkeyed = useUi((s) => s.unkeyedTransforms.length > 0)
  const loop = useUi((s) => s.loopPlayback)
  const { clipId, start, end } = resolveWorkArea(clip, sceneTiming, workArea)
  const { start: clipStart, end: clipEnd, fps } = clip ?? sceneTiming
  const frameDigits = Math.max(String(clipStart).length, String(clipEnd).length)

  return (
    <footer
      data-timeline-footer
      className="col-span-full flex min-h-9 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-panel p-1"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1 whitespace-nowrap">
        {clip ? (
          <ClipTimingFields key={`timing-${clip.id}`} clip={clip} digits={frameDigits} />
        ) : (
          <div className="shell-field">
            <span className="shell-field-cell text-muted">Timeline</span>
            <span className="shell-field-cell">{`${clipStart}–${clipEnd} · ${fps} fps`}</span>
          </div>
        )}
        <div
          key={`preview-${clipId}`}
          role="group"
          aria-label="Preview range"
          className="flex items-center gap-1"
        >
          <div className="shell-field">
            <span className="shell-field-cell text-muted">Preview</span>
            <NumberField
              label="Preview start frame"
              value={start}
              min={clipStart}
              max={end}
              digits={frameDigits}
              onCommit={(frame) => useUi.getState().setWorkArea({ clipId, start: frame, end })}
            />
            <NumberField
              label="Preview end frame"
              value={end}
              min={start}
              max={clipEnd}
              digits={frameDigits}
              onCommit={(frame) => useUi.getState().setWorkArea({ clipId, start, end: frame })}
            />
          </div>
          <button
            type="button"
            className="shell-icon"
            aria-label="Reset preview range"
            title="Reset preview range to the full clip"
            disabled={start === clipStart && end === clipEnd}
            onClick={() => useUi.getState().setWorkArea(null)}
          >
            <Icon name="rotate" size={15} />
          </button>
        </div>
      </div>
      {error && (
        <div className="order-last flex min-w-0 basis-full items-center gap-2 xl:order-none xl:basis-0 xl:grow">
          <p role="alert" className="truncate text-red-800 select-text" title={error}>
            {error}
          </p>
          <button
            type="button"
            className="shrink-0 rounded px-1 py-0.5 text-red-800 underline hover:bg-control"
            onClick={() => useUi.getState().setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="ms-auto flex flex-wrap items-center gap-1 whitespace-nowrap">
        <div
          role="group"
          aria-label="Keying"
          data-action-group="keying"
          className="flex items-center gap-1"
        >
          {hasUnkeyed && (
            <span
              role="status"
              className="text-amber-800"
              title="Set a key to keep these edits. Unkeyed edits clear when you change frames."
            >
              Unkeyed
            </span>
          )}
          <button
            type="button"
            className="shell-action gap-1.5 pe-1"
            aria-keyshortcuts="S"
            title="Set a key for the selected joints (S)"
            disabled={!hasSelection || hasDraft}
            onClick={keySelection}
          >
            <ActionIcon name="setKey" />
            Set Key
          </button>
          <FooterToggle
            label="Auto Key"
            pressed={autoKey}
            title={
              autoKey
                ? 'Auto Key is on. Pose edits create keys.'
                : 'Auto Key is off. Use Set Key to keep edits before leaving the frame.'
            }
            onToggle={() => useUi.getState().setAutoKey(!autoKey)}
          />
        </div>
        <div role="group" aria-label="Preview playback" className="flex items-center gap-1">
          <FooterToggle
            label="Loop"
            pressed={loop}
            title={
              loop
                ? 'Loop is on. Repeat the preview range.'
                : 'Loop is off. Stop at the end of the preview range.'
            }
            onToggle={() => useUi.getState().setLoopPlayback(!loop)}
          >
            <svg
              aria-hidden="true"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 11V9a3 3 0 0 1 3-3h14m-3-3 3 3-3 3m4 4v2a3 3 0 0 1-3 3H4m3-3-3 3 3 3" />
            </svg>
          </FooterToggle>
          <PlaybackSpeed />
        </div>
      </div>
    </footer>
  )
}

function ClipTimingFields({ clip, digits }: { clip: Clip; digits: number }) {
  const { start, end, fps } = clip
  const length = end - start + 1

  function commit(field: 'start' | 'end' | 'fps', value: number) {
    const ui = useUi.getState()
    try {
      editor.run(setClipTiming(clip.id, { [field]: value }))
      ui.setPlaying(false)
    } catch (error) {
      ui.setError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div role="group" aria-label="Clip timing" className="shell-field">
      <span className="shell-field-cell text-muted" title={clip.name}>
        Clip
      </span>
      <NumberField
        label="Clip start frame"
        value={start}
        max={end}
        digits={digits}
        onCommit={(value) => commit('start', value)}
      />
      <NumberField
        label="Clip end frame"
        value={end}
        min={start}
        digits={digits}
        onCommit={(value) => commit('end', value)}
      />
      <NumberField
        label="Clip frame rate"
        value={fps}
        min={0}
        step="any"
        digits={String(fps).length}
        unit="fps"
        onCommit={(value) => commit('fps', value)}
      />
      <span className="shell-field-cell text-muted">{`${length} ${length === 1 ? 'frame' : 'frames'}`}</span>
    </div>
  )
}

function FooterToggle({
  label,
  pressed,
  title,
  onToggle,
  children,
}: {
  label: string
  pressed: boolean
  title: string
  onToggle(): void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      className="shell-action shell-toggle gap-1.5 aria-pressed:text-ink"
      aria-pressed={pressed}
      title={title}
      onClick={onToggle}
    >
      {children}
      {label}
    </button>
  )
}

function PlaybackSpeed() {
  const speed = useUi((s) => s.playbackSpeed)

  return (
    <Select.Root
      items={speedItems}
      value={speed}
      onValueChange={(value) => {
        if (value !== null) useUi.getState().setPlaybackSpeed(value)
      }}
    >
      <Select.Trigger aria-label="Playback speed" className="shell-field hover:bg-control">
        <span className="shell-field-cell text-muted" aria-hidden="true">
          Speed
        </span>
        <span className="shell-field-cell min-w-14 justify-between">
          <Select.Value />
          <Select.Icon className="text-faint" aria-hidden="true">
            <Icon name="chevronDown" size={12} />
          </Select.Icon>
        </span>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          align="end"
          side="top"
          sideOffset={4}
          alignItemWithTrigger={false}
          className="z-50"
        >
          <Select.Popup className="min-w-16 rounded border border-line bg-raised py-1 text-[12px] text-ink shadow-xl">
            {speedItems.map(({ value, label }) => (
              <Select.Item
                key={value}
                value={value}
                className="selection-tint relative isolate cursor-default px-2 py-1 tabular-nums outline-none data-highlighted:bg-line data-selected:font-semibold"
              >
                <Select.ItemText>{label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
