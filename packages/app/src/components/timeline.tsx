import { Select } from '@base-ui/react/select'
import { findCharacter, type Clip, type DilemmaDocument } from '@dilemma/core'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyEvent,
  type ReactNode,
} from 'react'
import { selectJoints } from '../animation.ts'
import { editor, useEditorState } from '../editor.ts'
import { PREVIEW_END, PREVIEW_FPS, useUi, type TimelineRange } from '../ui-store.ts'
import {
  PREVIEW_ROW,
  TIMELINE_HEADER_HEIGHT as HEADER,
  TRACK_HEIGHT,
  timelineRowAt,
  timelineRows,
  type TimelineRow,
  type TimelineRowId,
} from './timeline-tracks.ts'
import { formatTimelineTime, parseTimelineTime } from './timeline-timecode.ts'

const PAD = 6
const WORK_AREA_HEIGHT = 15
const RULER = HEADER - WORK_AREA_HEIGHT

export function Timeline() {
  const doc = useEditorState((s) => s.doc)
  const clipId = useEditorState((s) => s.playhead.clipId)
  const clip = doc.clips.find((item) => item.id === clipId) ?? null
  return <TimelineContent key={clip?.id} doc={doc} clip={clip} />
}

type Drag = { pointer: number; anchor: number } & (
  | { mode: 'select'; rowId: TimelineRowId }
  | { mode: 'scrub' }
  | { mode: 'start' | 'end' | 'move'; workStart: number; workEnd: number }
)

function TimelineContent({ doc, clip }: { doc: DilemmaDocument; clip: Clip | null }) {
  const playheadFrame = useEditorState((s) => s.playhead.frame)
  const selection = useEditorState((s) => s.selection)
  const playing = useUi((s) => s.playing)
  const setPlaying = useUi((s) => s.setPlaying)
  const character = clip ? findCharacter(doc, clip.characterId) : undefined
  const expanded = useUi((s) => s.expandedTimelineCharacterId === character?.id)
  const activeRow = useUi((s) => s.activeTimelineRow)
  const canvas = useRef<HTMLCanvasElement>(null)
  const timecodeField = useRef<HTMLInputElement>(null)
  const trackList = useRef<HTMLDivElement>(null)
  const paint = useRef<(() => void) | null>(null)
  const gesture = useRef<Drag | null>(null)
  const previewFrame = useUi((s) => s.previewFrame)
  const timelineRange = useUi((s) => s.timelineRange)
  const clipId = clip?.id ?? null
  const start = clip?.start ?? 0
  const end = clip?.end ?? PREVIEW_END
  const workArea = useUi((s) => s.workArea)
  const frame = clip ? playheadFrame : previewFrame
  const allRows = useMemo(
    () => (character && clip ? timelineRows(character, clip) : [PREVIEW_ROW]),
    [character, clip],
  )
  const rows = useMemo(() => (expanded ? allRows : allRows.slice(0, 1)), [allRows, expanded])
  const summary = allRows[0]!
  const selectedJoints = useMemo(
    () =>
      new Set(selection.joints.filter((j) => j.characterId === character?.id).map((j) => j.joint)),
    [selection.joints, character?.id],
  )
  const lastSelectedJoint = Array.from(selectedJoints).at(-1)
  const selectedRowIndex = rows.findIndex((row) => row.joint === lastSelectedJoint)
  const rangeRow =
    timelineRange?.clipId === clipId
      ? rows.find((row) => row.id === timelineRange.rowId)
      : undefined
  const range = rangeRow ? timelineRange : null
  const keyboardRow =
    (activeRow?.clipId === clipId && rows.find((row) => row.id === activeRow.rowId)) ||
    rows[selectedRowIndex] ||
    summary
  const clamp = (value: number) => Math.min(end, Math.max(start, value))

  const workStart = clamp(workArea?.clipId === clipId ? workArea.start : start)
  const workEnd = Math.max(workStart, clamp(workArea?.clipId === clipId ? workArea.end : end))
  const fps = Math.max(1, Math.round(clip?.fps ?? PREVIEW_FPS))
  const timecode = formatTimelineTime(frame, fps)

  useLayoutEffect(() => {
    const field = timecodeField.current
    if (field && document.activeElement !== field) field.value = timecode
  }, [timecode])

  useEffect(() => {
    const previous = useUi.getState()
    if (previous.timelineRange && previous.timelineRange.clipId !== clipId)
      previous.setTimelineRange(null)
    if (previous.activeTimelineRow && previous.activeTimelineRow.clipId !== clipId)
      previous.setActiveTimelineRow(null)

    function clearSelection(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.target === timecodeField.current) return
      const ui = useUi.getState()
      if (ui.transformDraft) return
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

  useLayoutEffect(() => {
    const list = trackList.current
    if (!list || selectedRowIndex < 1) return
    const top = selectedRowIndex * TRACK_HEIGHT
    if (top < list.scrollTop + TRACK_HEIGHT) list.scrollTop = top - TRACK_HEIGHT
    else if (top + TRACK_HEIGHT > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + TRACK_HEIGHT - list.clientHeight
    }
  }, [selectedRowIndex, selectedJoints, expanded])

  useLayoutEffect(() => {
    const el = canvas.current
    if (!el) return
    paint.current = () =>
      draw(
        el,
        start,
        end,
        frame,
        rows,
        selectedJoints,
        range,
        workStart,
        workEnd,
        trackList.current?.scrollTop ?? 0,
      )
    paint.current()
    return () => {
      paint.current = null
    }
  }, [start, end, frame, rows, selectedJoints, range, workStart, workEnd])

  useEffect(() => {
    const redraw = () => paint.current?.()
    const observer = new ResizeObserver(redraw)
    if (canvas.current) observer.observe(canvas.current)
    return () => observer.disconnect()
  }, [])

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
    if (row >= HEADER) {
      return timelineRowAt(rows, row - HEADER, trackList.current?.scrollTop ?? 0)
        ? 'select'
        : 'scrub'
    }
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

  function activateRow(rowId: TimelineRowId) {
    useUi.getState().setActiveTimelineRow({ clipId, rowId })
  }

  function selectRange(rowId: TimelineRowId, anchor: number, edge: number) {
    useUi.getState().setTimelineRange(anchor === edge ? null : { clipId, rowId, anchor, edge })
  }

  function handleTimelineKey(event: ReactKeyEvent, rowId: TimelineRowId) {
    if (event.key === '[' || event.key === ']') {
      event.preventDefault()
      useUi.getState().setWorkArea({
        clipId,
        start: event.key === '[' ? Math.min(frame, workEnd) : workStart,
        end: event.key === ']' ? Math.max(frame, workStart) : workEnd,
      })
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const rowRange = range?.rowId === rowId ? range : null
    const offset = event.key === 'ArrowLeft' ? -1 : 1
    const next = clamp((event.shiftKey && rowRange ? rowRange.edge : frame) + offset)
    if (event.shiftKey) {
      activateRow(rowId)
      selectRange(rowId, rowRange?.anchor ?? frame, next)
    } else seek(next)
  }

  function toggleTracks() {
    if (!character) return
    const ui = useUi.getState()
    if (expanded) {
      if (rangeRow?.joint != null) ui.setTimelineRange(null)
      activateRow(summary.id)
    }
    ui.setExpandedTimelineCharacter(expanded ? null : character.id)
  }

  const rangeDescription =
    range && rangeRow
      ? ` ${rangeRow.name || 'Preview'} range, frames ${Math.min(range.anchor, range.edge)} to ${Math.max(range.anchor, range.edge)}.`
      : ''

  return (
    <div className="group/timeline grid h-full grid-cols-[max-content_minmax(0,1fr)] overflow-hidden border-t border-line bg-panel">
      <div className="flex min-h-0 min-w-0 flex-col border-r border-line">
        <div
          role="group"
          aria-label="Timeline controls"
          className="flex shrink-0 items-center gap-2 border-b border-line px-2"
          style={{ height: HEADER }}
        >
          <input
            ref={timecodeField}
            type="text"
            defaultValue={timecode}
            autoComplete="off"
            spellCheck={false}
            title={`Frame ${frame} of ${end}`}
            aria-label="Current time"
            aria-description="Enter a frame number, seconds like 1s, or a timecode like 00:01:00."
            className="shrink-0 rounded-md bg-control px-2 py-1 text-center font-mono tabular-nums text-ink outline-none select-text ring-muted ring-inset focus-visible:ring-1 group-has-[canvas:focus-visible]/timeline:ring-1"
            style={{ width: `calc(${timecode.length}ch + 1rem)` }}
            onFocus={(event) => {
              setPlaying(false)
              event.currentTarget.select()
            }}
            onChange={(event) => event.currentTarget.setCustomValidity('')}
            onBlur={(event) => {
              const field = event.currentTarget
              const enteredFrame = parseTimelineTime(field.value, fps)
              const next = enteredFrame === undefined ? frame : clamp(enteredFrame)
              field.setCustomValidity('')
              field.value = formatTimelineTime(next, fps)
              if (next !== frame) seek(next)
            }}
            onKeyDown={(event) => {
              const field = event.currentTarget
              if (event.key === 'Enter') {
                event.preventDefault()
                if (parseTimelineTime(field.value, fps) === undefined) {
                  field.setCustomValidity('Enter a frame like 24 or a time like 00:01:00.')
                  field.reportValidity()
                  return
                }
              } else if (event.key === 'Escape') {
                event.preventDefault()
                field.value = timecode
              } else {
                return
              }
              canvas.current?.focus({ preventScroll: true })
            }}
          />
          <div role="group" aria-label="Playback" className="flex items-center gap-1.5">
            <TransportButton
              label="First frame"
              disabled={frame === start}
              onClick={() => seek(start)}
            >
              <path d="M2 2v8m7-8-5 4 5 4z" />
            </TransportButton>
            <TransportButton
              label={playing ? 'Pause' : 'Play'}
              shortcut="Space"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <path d="M3 2h2v8H3zm4 0h2v8H7z" /> : <path d="M3 2v8l7-4z" />}
            </TransportButton>
            <TransportButton label="Last frame" disabled={frame === end} onClick={() => seek(end)}>
              <path d="M10 2v8M3 2l5 4-5 4z" />
            </TransportButton>
          </div>
        </div>
        <div
          ref={trackList}
          onScroll={() => paint.current?.()}
          className="min-h-0 flex-1 overflow-y-auto [contain:inline-size] [scrollbar-width:thin]"
          style={{ scrollPaddingTop: TRACK_HEIGHT }}
        >
          <div
            className="selection-tint sticky top-0 z-10 isolate flex items-center gap-2 bg-panel px-2"
            data-tinted={!expanded && selectedJoints.size > 0 ? '' : undefined}
            style={{ height: TRACK_HEIGHT }}
          >
            {character && allRows.length > 1 ? (
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left font-medium text-ink hover:bg-control"
                data-timeline-track
                aria-expanded={expanded}
                aria-controls="timeline-joint-tracks"
                onClick={toggleTracks}
                onKeyDown={(e) => handleTimelineKey(e, summary.id)}
                title={summary.name}
              >
                <svg
                  aria-hidden="true"
                  className={`size-3 shrink-0 text-faint ${expanded ? 'rotate-90' : ''}`}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 4 4 4-4 4" />
                </svg>
                <span className="truncate">{summary.name}</span>
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{summary.name}</span>
            )}
            {doc.clips.length > 1 && <ClipSelect clips={doc.clips} value={clipId} />}
          </div>
          <div id="timeline-joint-tracks" role="group" aria-label="Joint tracks" hidden={!expanded}>
            {expanded &&
              rows.slice(1).map((row) => {
                const joint = row.joint!
                const selected = selectedJoints.has(joint)
                return (
                  <button
                    key={row.id}
                    type="button"
                    className="selection-tint relative isolate block w-full truncate border-t border-line pr-2 text-left text-muted hover:bg-control hover:text-ink"
                    style={{ height: TRACK_HEIGHT, paddingLeft: 18 + Math.min(10, row.depth) * 10 }}
                    data-timeline-track
                    aria-pressed={selected}
                    title={row.name}
                    onClick={() => {
                      if (!character) return
                      activateRow(row.id)
                      selectJoints([{ characterId: character.id, joint }])
                    }}
                    onKeyDown={(event) => handleTimelineKey(event, row.id)}
                  >
                    {row.name}
                  </button>
                )
              })}
          </div>
        </div>
      </div>
      <canvas
        ref={canvas}
        tabIndex={0}
        aria-label="Timeline frames"
        aria-description={`Frame ${frame}.${rangeDescription} Use arrows to seek, Shift and arrows to select, comma and period to jump between keys, or brackets to set work area bounds.`}
        className="block h-full min-h-0 w-full touch-none cursor-crosshair bg-timeline outline-none"
        onKeyDown={(e) => handleTimelineKey(e, keyboardRow.id)}
        onWheel={(e) => {
          const list = trackList.current
          if (!list || e.ctrlKey || e.metaKey) return
          const scale = e.deltaMode === 1 ? TRACK_HEIGHT : e.deltaMode === 2 ? list.clientHeight : 1
          list.scrollTop += e.deltaY * scale
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.isPrimary) return
          e.preventDefault()
          e.currentTarget.focus({ preventScroll: true })
          const rect = e.currentTarget.getBoundingClientRect()
          const anchor = frameAt(e.clientX, rect)
          const mode = modeAt(e.clientX, e.clientY, rect)
          const row = timelineRowAt(
            rows,
            e.clientY - rect.top - HEADER,
            trackList.current?.scrollTop ?? 0,
          )
          const pointer = e.pointerId
          if (mode === 'select' && row) {
            gesture.current = { pointer, anchor, mode, rowId: row.id }
            activateRow(row.id)
            selectRange(row.id, anchor, anchor)
            seek(anchor)
          } else if (mode === 'scrub') {
            gesture.current = { pointer, anchor, mode }
            seek(anchor)
          } else if (mode !== 'select') {
            gesture.current = { pointer, anchor, mode, workStart, workEnd }
          }
          e.currentTarget.style.cursor = cursorFor(mode, true)
          e.currentTarget.setPointerCapture(pointer)
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
              selectRange(drag.rowId, drag.anchor, edge)
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
        onPointerUp={(e) => {
          const drag = gesture.current
          if (drag?.mode !== 'select' || drag.pointer !== e.pointerId) return
          const edge = frameAt(e.clientX, e.currentTarget.getBoundingClientRect())
          selectRange(drag.rowId, drag.anchor, edge)
        }}
        onPointerCancel={(e) => {
          const drag = gesture.current
          if (drag?.mode === 'select' && drag.pointer === e.pointerId) {
            useUi.getState().setTimelineRange(null)
          }
        }}
        onDoubleClick={(e) => {
          const y = e.clientY - e.currentTarget.getBoundingClientRect().top
          if (y >= RULER && y < HEADER) useUi.getState().setWorkArea(null)
        }}
        title={`Work area ${workStart}–${workEnd}. Drag its handles to trim or double-click to reset.`}
        onLostPointerCapture={(e) => {
          if (gesture.current?.pointer === e.pointerId) gesture.current = null
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
        useUi.getState().setActiveTimelineRow(null)
        editor.setPlayhead({ clipId: clip.id, frame: clip.start })
      }}
      items={clips.map((c) => ({ value: c.id, label: c.name }))}
    >
      <Select.Trigger aria-label="Clip" title="Choose clip" className="shell-icon">
        <Select.Icon aria-hidden="true">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          align="end"
          side="top"
          sideOffset={4}
          alignItemWithTrigger={false}
          className="z-50"
        >
          <Select.Popup className="min-w-32 max-w-64 rounded border border-line bg-raised py-1 text-[12px] text-ink shadow-xl">
            {clips.map((c) => (
              <Select.Item
                key={c.id}
                value={c.id}
                className="selection-tint relative isolate cursor-default truncate px-2 py-1 outline-none data-highlighted:bg-line data-selected:font-semibold"
                title={c.name}
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

function draw(
  el: HTMLCanvasElement,
  start: number,
  end: number,
  frame: number,
  rows: readonly TimelineRow[],
  selectedJoints: ReadonlySet<number>,
  range: TimelineRange | null,
  workStart: number,
  workEnd: number,
  scrollTop: number,
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
  ctx.fillStyle = palette.getPropertyValue('--color-timeline')
  ctx.fillRect(0, HEADER, width, height - HEADER)
  ctx.fillStyle = palette.getPropertyValue('--color-panel')
  ctx.fillRect(0, 0, width, HEADER)
  ctx.fillStyle = palette.getPropertyValue('--color-line')
  ctx.fillRect(0, HEADER - 1, width, 1)

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
  const selectionOpacity = Number(palette.getPropertyValue('--selection-tint-opacity'))
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
  const size = Math.min(4, Math.max(1.5, pxPerFrame / 3))
  function drawRow(row: TimelineRow, top: number) {
    if (row.joint !== null) {
      ctx.fillStyle = palette.getPropertyValue('--color-line')
      ctx.fillRect(0, top, width, 1)
    }
    ctx.fillStyle = blue
    const mid = top + TRACK_HEIGHT / 2
    let previousX = -1
    ctx.beginPath()
    for (const f of row.frames) {
      const cx = x(f)
      if (cx === previousX) continue
      previousX = cx
      ctx.moveTo(cx, mid - size)
      ctx.lineTo(cx + size, mid)
      ctx.lineTo(cx, mid + size)
      ctx.lineTo(cx - size, mid)
      ctx.closePath()
    }
    ctx.fill()

    const selected =
      row.id === 'character'
        ? rows.length === 1 && selectedJoints.size > 0
        : row.joint !== null && selectedJoints.has(row.joint)
    const selectedRange = range?.rowId === row.id ? range : null
    if (selected) {
      ctx.save()
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = blue
      ctx.globalAlpha = selectionOpacity
      ctx.fillRect(0, top, width, TRACK_HEIGHT)
      ctx.restore()
    }
    if (selectedRange) {
      const left = x(Math.min(selectedRange.anchor, selectedRange.edge))
      const right = x(Math.max(selectedRange.anchor, selectedRange.edge))
      const span = Math.max(1, right - left)
      ctx.save()
      ctx.fillStyle = blue
      ctx.globalAlpha = 0.14
      ctx.fillRect(left, top, span, TRACK_HEIGHT)
      ctx.globalAlpha = 1
      ctx.fillRect(left, top, span, 2)
      ctx.fillRect(left, top, 1, TRACK_HEIGHT)
      ctx.fillRect(right, top, 1, TRACK_HEIGHT)
      ctx.restore()
    }
  }

  drawRow(rows[0]!, HEADER)
  const jointTop = HEADER + TRACK_HEIGHT
  if (height > jointTop && rows.length > 1) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, jointTop, width, height - jointTop)
    ctx.clip()
    for (let index = 1 + Math.floor(scrollTop / TRACK_HEIGHT); index < rows.length; index++) {
      const top = HEADER + index * TRACK_HEIGHT - scrollTop
      if (top >= height) break
      drawRow(rows[index]!, top)
    }
    ctx.restore()
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
