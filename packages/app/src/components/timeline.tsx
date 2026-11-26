import { Select } from '@base-ui/react/select'
import type { Clip } from '@dilemma/core'
import { useCallback, useEffect, useRef } from 'react'
import { editor, useEditorState } from '../editor.ts'
import { useUi } from '../ui-store.ts'

const PAD = 12
const RULER = 18

/** A bare timeline: frames, key markers and the playhead, drawn on a canvas. */
export function Timeline() {
  const doc = useEditorState((s) => s.doc)
  const playhead = useEditorState((s) => s.playhead)
  const selection = useEditorState((s) => s.selection)
  const playing = useUi((s) => s.playing)
  const setPlaying = useUi((s) => s.setPlaying)
  const clip = doc.clips.find((c) => c.id === playhead.clipId) ?? null
  const canvas = useRef<HTMLCanvasElement>(null)
  const scrubbing = useRef(false)

  const selectedJoints = new Set(
    selection.joints.filter((j) => j.characterId === clip?.characterId).map((j) => j.joint),
  )
  const keyFrames = clip ? keysFor(clip, selectedJoints) : []

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    draw(el, clip, playhead.frame, keyFrames)
  })

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const observer = new ResizeObserver(() =>
      draw(el, clip, editor.getState().playhead.frame, keyFrames),
    )
    observer.observe(el)
    return () => observer.disconnect()
  })

  const frameAt = useCallback(
    (clientX: number) => {
      const el = canvas.current
      if (!el || !clip) return 0
      const rect = el.getBoundingClientRect()
      const t = (clientX - rect.left - PAD) / Math.max(1, rect.width - PAD * 2)
      return Math.min(
        clip.end,
        Math.max(clip.start, Math.round(clip.start + t * (clip.end - clip.start))),
      )
    },
    [clip],
  )

  return (
    <div className="flex h-full flex-col border-t border-line bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-3">
        <button
          type="button"
          disabled={!clip}
          onClick={() => setPlaying(!playing)}
          className="flex h-6 w-6 items-center justify-center rounded text-ink hover:bg-raised disabled:text-faint"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className="w-24 font-mono tabular-nums text-muted">
          {clip ? `${playhead.frame} / ${clip.end}` : '—'}
        </span>
        {doc.clips.length > 0 && <ClipSelect clips={doc.clips} value={clip?.id ?? null} />}
        {clip && <span className="text-faint">{clip.fps} fps</span>}
      </div>
      <canvas
        ref={canvas}
        className="block min-h-0 w-full flex-1 cursor-ew-resize"
        onPointerDown={(e) => {
          if (!clip) return
          e.currentTarget.setPointerCapture(e.pointerId)
          scrubbing.current = true
          setPlaying(false)
          editor.setPlayhead({ frame: frameAt(e.clientX) })
        }}
        onPointerMove={(e) => {
          if (scrubbing.current) editor.setPlayhead({ frame: frameAt(e.clientX) })
        }}
        onPointerUp={() => {
          scrubbing.current = false
        }}
      />
    </div>
  )
}

function ClipSelect({ clips, value }: { clips: Clip[]; value: string | null }) {
  return (
    <Select.Root
      value={value}
      onValueChange={(id) => {
        const clip = clips.find((c) => c.id === id)
        if (clip) editor.setPlayhead({ clipId: clip.id, frame: clip.start })
      }}
      items={clips.map((c) => ({ value: c.id, label: c.name }))}
    >
      <Select.Trigger className="flex h-6 min-w-32 items-center justify-between gap-2 rounded border border-line bg-raised px-2 text-ink hover:border-faint">
        <Select.Value />
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

function draw(el: HTMLCanvasElement, clip: Clip | null, frame: number, keys: number[]): void {
  const dpr = window.devicePixelRatio
  const width = el.clientWidth
  const height = el.clientHeight
  if (el.width !== width * dpr || el.height !== height * dpr) {
    el.width = width * dpr
    el.height = height * dpr
  }
  const ctx = el.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  if (!clip) return

  const span = Math.max(1, clip.end - clip.start)
  const x = (f: number) => PAD + ((f - clip.start) / span) * (width - PAD * 2)
  const pxPerFrame = (width - PAD * 2) / span
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => s * pxPerFrame >= 40) ?? 1000

  ctx.font = '10px ui-monospace, SF Mono, Menlo, monospace'
  ctx.textBaseline = 'top'
  for (let f = clip.start; f <= clip.end; f++) {
    const major = (f - clip.start) % step === 0
    if (!major && pxPerFrame < 4) continue
    ctx.fillStyle = major ? '#4b5563' : '#30343b'
    ctx.fillRect(Math.round(x(f)), major ? 0 : RULER - 6, 1, major ? height : 6)
    if (major) {
      ctx.fillStyle = '#9aa1ab'
      ctx.fillText(String(f), Math.round(x(f)) + 3, 3)
    }
  }

  ctx.fillStyle = '#7dd3fc'
  const mid = RULER + (height - RULER) / 2
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

  ctx.fillStyle = '#fbbf24'
  const px = Math.round(x(frame))
  ctx.fillRect(px, 0, 1, height)
  ctx.fillRect(px - 4, 0, 9, 4)
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M3 1.5v9l7.5-4.5z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" />
    </svg>
  )
}
