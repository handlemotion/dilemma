import { Select } from '@base-ui/react/select'
import type { Clip } from '@dilemma/core'
import { useEffect, useRef, type ReactNode } from 'react'
import { editor, useEditorState } from '../editor.ts'
import { PREVIEW_END, PREVIEW_FPS, useUi, type TimelineRange } from '../ui-store.ts'

const PAD = 6
const TRACK_HEIGHT = 40
const HEADER = 40
export const DEFAULT_TIMELINE_HEIGHT = HEADER + TRACK_HEIGHT + 1
const WORK_AREA_HEIGHT = 15
const RULER = HEADER - WORK_AREA_HEIGHT

/** Frame ruler, key markers and transient range selection. */
export function Timeline() {
  const doc = useEditorState((s) => s.doc)
  const playhead = useEditorState((s) => s.playhead)
  const selection = useEditorState((s) => s.selection)
  const playing = useUi((s) => s.playing)
  const setPlaying = useUi((s) => s.setPlaying)
  const clip = doc.clips.find((c) => c.id === playhead.clipId) ?? null
  const canvas = useRef<HTMLCanvasElement>(null)
  const gesture = useRef<{
    pointer: number
    anchor: number
    mode: 'scrub' | 'select' | 'start' | 'end' | 'move'
    workStart: number
    workEnd: number
  } | null>(null)
  const previewFrame = useUi((s) => s.previewFrame)
  const timelineRange = useUi((s) => s.timelineRange)
  const clipId = clip?.id ?? null
  const start = clip?.start ?? 0
  const end = clip?.end ?? PREVIEW_END
  const workArea = useUi((s) => s.workArea)
  const frame = clip ? playhead.frame : previewFrame
  const range = timelineRange?.clipId === clipId ? timelineRange : null
  const clamp = (value: number) => Math.min(end, Math.max(start, value))

  const workStart = clamp(workArea?.clipId === clipId ? workArea.start : start)
  const workEnd = Math.max(workStart, clamp(workArea?.clipId === clipId ? workArea.end : end))
  const fps = Math.max(1, Math.round(clip?.fps ?? PREVIEW_FPS))
  const totalSeconds = Math.floor(frame / fps)
  const timecode = [Math.floor(totalSeconds / 60), totalSeconds % 60, frame % fps]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')

  useEffect(() => {
    function clearSelection(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      const ui = useUi.getState()
      const drag = gesture.current
      if (drag?.mode !== 'select' && ui.timelineRange?.clipId !== clipId) return
      event.preventDefault()
      ui.setTimelineRange(null)
      if (drag?.mode === 'select') {
        gesture.current = null
        const el = canvas.current
        if (el?.hasPointerCapture(drag.pointer)) el.releasePointerCapture(drag.pointer)
      }
    }
    window.addEventListener('keydown', clearSelection, true)
    return () => window.removeEventListener('keydown', clearSelection, true)
  }, [clipId])

  const selectedJoints = new Set(
    selection.joints.filter((j) => j.characterId === clip?.characterId).map((j) => j.joint),
  )
  const keyFrames = clip ? keysFor(clip, selectedJoints) : []

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const redraw = () => draw(el, start, end, frame, keyFrames, range, workStart, workEnd)
    redraw()
    const observer = new ResizeObserver(redraw)
    observer.observe(el)
    return () => observer.disconnect()
  })

  function seek(value: number) {
    setPlaying(false)
    if (clip) editor.setPlayhead({ frame: clamp(value) })
    else useUi.getState().setPreviewFrame(clamp(value))
  }

  function frameAt(clientX: number, rect: DOMRect) {
    const fraction = (clientX - rect.left - PAD) / Math.max(1, rect.width - PAD * 2)
    return clamp(Math.round(start + fraction * (end - start)))
  }

  function modeAt(clientX: number, clientY: number, rect: DOMRect) {
    const row = clientY - rect.top
    if (row >= HEADER) return 'select'
    if (row < RULER) return 'scrub'
    const width = Math.max(1, rect.width - PAD * 2)
    const x = (value: number) => PAD + ((value - start) / Math.max(1, end - start)) * width
    const pointer = clientX - rect.left
    const fromStart = Math.abs(pointer - x(workStart))
    const fromEnd = Math.abs(pointer - x(workEnd))
    if (Math.min(fromStart, fromEnd) <= 6) {
      return fromStart < fromEnd || (fromStart === fromEnd && pointer < x(workStart))
        ? 'start'
        : 'end'
    }
    return pointer > x(workStart) && pointer < x(workEnd) ? 'move' : 'scrub'
  }

  function selectRange(anchor: number, edge: number) {
    useUi.getState().setTimelineRange(anchor === edge ? null : { clipId, anchor, edge })
  }

  return (
    <div className="grid h-full grid-cols-[max-content_minmax(0,1fr)] overflow-hidden border-t border-line bg-panel">
      <div className="flex min-h-0 min-w-0 flex-col border-r border-line">
        <div
          role="group"
          aria-label="Timeline controls"
          className="flex shrink-0 items-center gap-2 border-b border-line px-2"
          style={{ height: HEADER }}
        >
          <span
            title={`Frame ${frame} of ${end}`}
            aria-label="Current time"
            className="min-w-10 rounded-md bg-control px-2 py-1 text-center font-mono tabular-nums text-ink"
          >
            {timecode}
          </span>
          <div role="group" aria-label="Playback" className="flex items-center gap-1.5">
            <TransportButton
              label="First frame"
              disabled={frame === start}
              onClick={() => seek(start)}
            >
              <path d="M2 2v8m7-8-5 4 5 4z" />
            </TransportButton>
            <TransportButton
              label="Previous frame"
              disabled={frame === start}
              onClick={() => seek(frame - 1)}
            >
              <path d="M9 2 4 6l5 4z" />
            </TransportButton>
            <TransportButton
              label={playing ? 'Pause' : 'Play'}
              shortcut="Space"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <path d="M3 2h2v8H3zm4 0h2v8H7z" /> : <path d="M3 2v8l7-4z" />}
            </TransportButton>
            <TransportButton
              label="Next frame"
              disabled={frame === end}
              onClick={() => seek(frame + 1)}
            >
              <path d="m3 2 5 4-5 4z" />
            </TransportButton>
            <TransportButton label="Last frame" disabled={frame === end} onClick={() => seek(end)}>
              <path d="M10 2v8M3 2l5 4-5 4z" />
            </TransportButton>
          </div>
        </div>
        {clip && (
          <div className="flex min-w-0 items-center gap-2 px-2 py-0.5">
            <ClipSelect clips={doc.clips} value={clip.id} />
            <span className="shrink-0 text-faint">{clip.fps} fps</span>
          </div>
        )}
      </div>
      <canvas
        key={clipId}
        ref={canvas}
        tabIndex={0}
        aria-label={`Timeline, frame ${frame}. Use arrows to seek, Shift and arrows to select, or brackets to set work area bounds.`}
        className="block h-full min-h-0 w-full touch-none cursor-crosshair bg-timeline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        onKeyDown={(e) => {
          if (e.key === '[' || e.key === ']') {
            e.preventDefault()
            useUi.getState().setWorkArea({
              clipId,
              start: e.key === '[' ? Math.min(frame, workEnd) : workStart,
              end: e.key === ']' ? Math.max(frame, workStart) : workEnd,
            })
          }
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          const next = clamp(
            (e.shiftKey && range ? range.edge : frame) + (e.key === 'ArrowLeft' ? -1 : 1),
          )
          if (e.shiftKey) selectRange(range?.anchor ?? frame, next)
          else seek(next)
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.isPrimary) return
          e.preventDefault()
          e.currentTarget.blur()
          const rect = e.currentTarget.getBoundingClientRect()
          const anchor = frameAt(e.clientX, rect)
          const mode = modeAt(e.clientX, e.clientY, rect)
          e.currentTarget.style.cursor = cursorFor(mode, true)
          gesture.current = { pointer: e.pointerId, anchor, mode, workStart, workEnd }
          e.currentTarget.setPointerCapture(e.pointerId)
          if (mode === 'select') selectRange(anchor, anchor)
          if (mode === 'select' || mode === 'scrub') seek(anchor)
        }}
        onPointerMove={(e) => {
          const drag = gesture.current
          const rect = e.currentTarget.getBoundingClientRect()
          if (!drag) {
            e.currentTarget.style.cursor = cursorFor(modeAt(e.clientX, e.clientY, rect))
            return
          }
          if (drag.pointer !== e.pointerId) return
          const edge = frameAt(e.clientX, rect)
          const setWorkArea = useUi.getState().setWorkArea
          switch (drag.mode) {
            case 'select':
              selectRange(drag.anchor, edge)
              break
            case 'scrub':
              seek(edge)
              break
            case 'start':
              setWorkArea({ clipId, start: Math.min(edge, drag.workEnd), end: drag.workEnd })
              break
            case 'end':
              setWorkArea({ clipId, start: drag.workStart, end: Math.max(edge, drag.workStart) })
              break
            case 'move': {
              const delta = Math.max(
                start - drag.workStart,
                Math.min(end - drag.workEnd, edge - drag.anchor),
              )
              setWorkArea({ clipId, start: drag.workStart + delta, end: drag.workEnd + delta })
              break
            }
          }
        }}
        onDoubleClick={(e) => {
          const y = e.clientY - e.currentTarget.getBoundingClientRect().top
          if (y >= RULER && y < HEADER) useUi.getState().setWorkArea(null)
        }}
        title={`Work area ${workStart}–${workEnd}. Drag its handles to trim or double-click to reset.`}
        onLostPointerCapture={(e) => {
          gesture.current = null
          e.currentTarget.style.cursor = cursorFor(
            modeAt(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()),
          )
        }}
      />
    </div>
  )
}

function cursorFor(mode: string, dragging = false): string {
  if (mode === 'start' || mode === 'end') return 'ew-resize'
  if (mode === 'move') return dragging ? 'grabbing' : 'grab'
  return mode === 'scrub' ? 'ew-resize' : 'crosshair'
}

function ClipSelect({ clips, value }: { clips: Clip[]; value: string | null }) {
  return (
    <Select.Root
      value={value}
      onValueChange={(id) => {
        const clip = clips.find((c) => c.id === id)
        if (!clip) return
        useUi.getState().setPlaying(false)
        useUi.getState().setTimelineRange(null)
        editor.setPlayhead({ clipId: clip.id, frame: clip.start })
      }}
      items={clips.map((c) => ({ value: c.id, label: c.name }))}
    >
      <Select.Trigger
        aria-label="Clip"
        className="flex h-[26px] min-w-0 max-w-48 items-center justify-between gap-2 rounded border border-line bg-control px-2 text-ink hover:border-faint"
      >
        <Select.Value className="truncate" />
        <Select.Icon className="text-faint">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} className="z-50">
          <Select.Popup className="min-w-(--anchor-width) rounded border border-line bg-raised py-1 text-[12px] text-ink shadow-xl">
            {clips.map((c) => (
              <Select.Item
                key={c.id}
                value={c.id}
                className="cursor-default px-2 py-1 outline-none data-highlighted:bg-line"
              >
                <Select.ItemText>{c.name}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

/** Key frames to mark: the selected joints' keys, or every key in the clip when nothing is selected. */
function keysFor(clip: Clip, joints: Set<number>): number[] {
  const frames = new Set<number>()
  for (const track of clip.tracks) {
    if (joints.size > 0 && !joints.has(track.joint)) continue
    for (const f of track.frames) frames.add(f)
  }
  return [...frames]
}

function draw(
  el: HTMLCanvasElement,
  start: number,
  end: number,
  frame: number,
  keys: number[],
  range: TimelineRange | null,
  workStart: number,
  workEnd: number,
): void {
  const dpr = window.devicePixelRatio
  const width = el.clientWidth
  const height = el.clientHeight
  const pixelWidth = Math.round(width * dpr)
  const pixelHeight = Math.round(height * dpr)
  if (el.width !== pixelWidth || el.height !== pixelHeight) {
    el.width = pixelWidth
    el.height = pixelHeight
  }
  const ctx = el.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const usableWidth = Math.max(1, width - PAD * 2)
  const pxPerFrame = usableWidth / Math.max(1, end - start)
  const x = (f: number) => Math.round(PAD + (f - start) * pxPerFrame)
  const minStep = 44 / pxPerFrame
  const scale = 10 ** Math.max(0, Math.floor(Math.log10(minStep)))
  const step = ([1, 2, 5, 10].find((n) => n * scale >= minStep) ?? 10) * scale
  const minor = Math.max(1, step % 5 === 0 ? step / 5 : step / 2)
  const palette = getComputedStyle(el)
  ctx.fillStyle = palette.getPropertyValue('--color-panel')
  ctx.fillRect(0, 0, width, HEADER)
  ctx.fillStyle = palette.getPropertyValue('--color-line')
  ctx.fillRect(0, HEADER - 1, width, 1)
  for (let y = HEADER + TRACK_HEIGHT; y < height; y += TRACK_HEIGHT) ctx.fillRect(0, y, width, 1)

  ctx.font = '10px ui-monospace, SF Mono, Menlo, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let f = start; f <= end; f += Number.isInteger(minor) ? minor : step) {
    const major = (f - start) % step === 0
    const tick = x(f)
    ctx.fillStyle = major ? '#a0a5b3' : '#ccd0da'
    ctx.fillRect(tick, RULER - (major ? 6 : 3), 1, major ? 5 : 2)
    if (major) {
      ctx.fillStyle = '#edeef3'
      ctx.fillRect(tick, HEADER, 1, height - HEADER)
      ctx.fillStyle = palette.getPropertyValue('--color-muted')
      ctx.textAlign = f === start ? 'left' : f === end ? 'right' : 'center'
      if (f === start || f === end || x(end) - tick >= 34) ctx.fillText(String(f), tick, 6)
    }
  }

  if (end > start && (end - start) % step !== 0) {
    ctx.fillStyle = '#a0a5b3'
    ctx.fillRect(x(end), RULER - 6, 1, 5)
    ctx.fillStyle = palette.getPropertyValue('--color-muted')
    ctx.textAlign = 'right'
    ctx.fillText(String(end), x(end), 6)
  }

  const blue = palette.getPropertyValue('--color-primary').trim()
  const stripTop = RULER + 3
  const stripHeight = 9
  const workX = x(workStart)
  const workRight = x(workEnd)
  ctx.fillStyle = palette.getPropertyValue('--color-control')
  ctx.fillRect(PAD, stripTop, usableWidth, stripHeight)
  ctx.fillStyle = '#d5d7dd'
  ctx.fillRect(workX, stripTop, Math.max(1, workRight - workX), stripHeight)
  ctx.fillStyle = '#969ba6'
  ctx.fillRect(workX - 1, stripTop, 3, stripHeight)
  ctx.fillRect(workRight - 1, stripTop, 3, stripHeight)
  if (range) {
    const left = x(Math.min(range.anchor, range.edge))
    const right = x(Math.max(range.anchor, range.edge))
    ctx.fillStyle = blue
    ctx.globalAlpha = 0.14
    ctx.fillRect(left, HEADER, Math.max(1, right - left), Math.min(TRACK_HEIGHT, height - HEADER))
    ctx.globalAlpha = 1
  }

  ctx.fillStyle = blue
  const mid = HEADER + TRACK_HEIGHT / 2
  const size = Math.min(4, Math.max(1.5, pxPerFrame / 3))
  for (const f of keys) {
    const cx = x(f)
    ctx.beginPath()
    ctx.moveTo(cx, mid - size)
    ctx.lineTo(cx + size, mid)
    ctx.lineTo(cx, mid + size)
    ctx.lineTo(cx - size, mid)
    ctx.fill()
  }

  const px = x(frame)
  ctx.fillStyle = palette.getPropertyValue('--color-ink')
  ctx.fillRect(px, RULER, 1, height - RULER)
  ctx.beginPath()
  ctx.moveTo(px - 4, RULER - 8)
  ctx.lineTo(px + 5, RULER - 8)
  ctx.lineTo(px + 5, RULER - 4)
  ctx.lineTo(px + 0.5, RULER + 1)
  ctx.lineTo(px - 4, RULER - 4)
  ctx.closePath()
  ctx.fill()
}

function TransportButton(props: {
  label: string
  shortcut?: string
  disabled?: boolean
  onClick(): void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="shell-icon"
      disabled={props.disabled}
      onClick={props.onClick}
      aria-label={props.label}
      title={props.shortcut ? `${props.label} (${props.shortcut})` : props.label}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 12 12"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth=".7"
        aria-hidden
      >
        {props.children}
      </svg>
    </button>
  )
}
