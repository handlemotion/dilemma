// Graph editor adapted from real-timeline-editor (curveEditor.ts and curveMath.ts), MIT.
// Copyright (c) 2026 Illia Komsa. See NOTICE.md and licenses/real-timeline-editor.txt.
import {
  curveHandles,
  curveValue,
  type AxisCurves,
  type CurveAxis,
  type CurveKey,
  type CurveTangent,
} from '@dilemma/core'

export interface CurvePoint {
  axis: CurveAxis
  frame: number
}

interface GraphState {
  curves: AxisCurves
  axes: readonly CurveAxis[]
  selection: readonly CurvePoint[]
  start: number
  end: number
  frame: number
  workStart: number
  workEnd: number
}

interface GraphOptions {
  select(points: CurvePoint[]): void
  seek(frame: number): void
  commit(curves: AxisCurves, label: string): boolean
  preview(curves: AxisCurves | null): void
  keydown(event: KeyboardEvent): void
}

type Point = { x: number; y: number }
type Hit = CurvePoint & { side?: 'in' | 'out' }
type Drag = { pointer: number; origin: Point } & (
  | { kind: 'keys'; points: readonly CurvePoint[]; min: number; max: number; delta: number }
  | { kind: 'handle'; hit: CurvePoint & { side: 'in' | 'out' } }
  | { kind: 'box'; edge: Point; previous: readonly CurvePoint[] }
  | { kind: 'pan'; left: number; top: number }
  | { kind: 'scrub' }
)

export const AXIS_COLORS = ['#c24453', '#268358', '#3d61ca'] as const
const GUTTER = 58
const RULER = 22
const PAD = 18

export function mapCurves(
  curves: AxisCurves,
  map: (keys: CurveKey[], axis: CurveAxis) => CurveKey[],
): AxisCurves {
  return [map(curves[0], 0), map(curves[1], 1), map(curves[2], 2)]
}

export function hasPoint(points: readonly CurvePoint[], axis: CurveAxis, frame: number): boolean {
  return points.some((point) => point.axis === axis && point.frame === frame)
}

export function tangentFor(keys: readonly CurveKey[], index: number, mode: CurveTangent['mode']) {
  const tangent = curveHandles(keys, index)
  const { outDx, outDy, inDx, inDy } = tangent
  const outLength = Math.hypot(outDx, outDy)
  if (mode === 'free' || outLength === 0) return { ...tangent, mode }
  const ratio = Math.hypot(inDx, inDy) / outLength
  return { ...tangent, mode, inDx: -outDx * ratio, inDy: -outDy * ratio }
}

function moveHandle(
  keys: CurveKey[],
  frame: number,
  side: 'in' | 'out',
  time: number,
  value: number,
): CurveKey[] {
  const index = keys.findIndex((key) => key.frame === frame)
  const key = keys[index]!
  const neighbor = keys[index + (side === 'in' ? -1 : 1)]
  if (!neighbor) return keys
  const span = neighbor.frame - frame
  const dx = clamp(time - frame, Math.min(0, span), Math.max(0, span))
  const dy = value - key.value
  const base = key.tangent ?? tangentFor(keys, index, 'free')
  const tangent =
    side === 'in' ? { ...base, inDx: dx, inDy: dy } : { ...base, outDx: dx, outDy: dy }
  const length = Math.hypot(dx, dy)
  if (tangent.mode === 'aligned' && length > 0) {
    const opposite = side === 'in' ? 'out' : 'in'
    const ratio = Math.hypot(tangent[`${opposite}Dx`], tangent[`${opposite}Dy`]) / length
    tangent[`${opposite}Dx`] = -dx * ratio
    tangent[`${opposite}Dy`] = -dy * ratio
  }
  return keys.with(index, { ...key, tangent })
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function gridStep(minimum: number) {
  const power = 10 ** Math.floor(Math.log10(minimum))
  return ([1, 2, 5, 10].find((factor) => factor * power >= minimum) ?? 10) * power
}

function handles(
  keys: CurveKey[],
  index: number,
): { side: 'in' | 'out'; frame: number; value: number }[] {
  const { frame, value, interpolation } = keys[index]!
  const { inDx, inDy, outDx, outDy } = curveHandles(keys, index)
  const points: ReturnType<typeof handles> = []
  const prev = keys[index - 1]
  const next = keys[index + 1]
  if (prev?.interpolation === 'bezier')
    points.push({ side: 'in', frame: Math.max(prev.frame, frame + inDx), value: value + inDy })
  if (next && interpolation === 'bezier')
    points.push({ side: 'out', frame: Math.min(next.frame, frame + outDx), value: value + outDy })
  return points
}

export function mountCurveGraph(host: HTMLElement, options: GraphOptions, initial: GraphState) {
  let state = initial
  let selection = initial.selection
  let drag: Drag | null = null
  let draft: AxisCurves | null = null
  let animation = 0
  let needsFit = true
  let left = 0
  let top = 1
  let pxPerFrame = 1
  let pxPerValue = 100
  const canvas = document.createElement('canvas')
  canvas.className =
    'block size-full touch-none outline-none focus-visible:inset-ring-1 focus-visible:inset-ring-primary'
  canvas.setAttribute('aria-label', 'Animation curve graph')
  canvas.setAttribute(
    'aria-description',
    'Drag keys or tangent handles. Drag empty space to box select. Drag the ruler to scrub. Scroll to zoom, or hold Shift to zoom values. Middle drag to pan.',
  )
  canvas.tabIndex = 0
  host.append(canvas)
  const ctx = canvas.getContext('2d')!
  const colors = getComputedStyle(canvas)
  const bg = colors.getPropertyValue('--color-timeline').trim()
  const panel = colors.getPropertyValue('--color-panel').trim()
  const grid = colors.getPropertyValue('--color-line').trim()
  const text = colors.getPropertyValue('--color-muted').trim()
  const accent = colors.getPropertyValue('--color-primary').trim()
  const x = (frame: number) => GUTTER + (frame - left) * pxPerFrame
  const y = (value: number) => RULER + (top - value) * pxPerValue
  const frameAt = (px: number) => left + (px - GUTTER) / pxPerFrame
  const valueAt = (py: number) => top - (py - RULER) / pxPerValue
  const current = () => draft ?? state.curves
  const position = (event: MouseEvent): Point => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const invalidate = () => {
    animation ||= requestAnimationFrame(() => {
      animation = 0
      paint()
    })
  }

  function fit(selectedOnly = false) {
    const { clientWidth: width, clientHeight: height } = canvas
    if (width <= GUTTER + PAD * 2 || height <= RULER + PAD * 2) {
      needsFit = true
      return
    }
    needsFit = false
    let minFrame = Infinity
    let maxFrame = -Infinity
    let min = Infinity
    let max = -Infinity
    for (const axis of state.axes) {
      const keys = current()[axis]
      keys.forEach((key, index) => {
        if (selectedOnly && selection.length && !hasPoint(selection, axis, key.frame)) return
        const hasIn = keys[index - 1]?.interpolation === 'bezier'
        const hasOut = key.interpolation === 'bezier' && index < keys.length - 1
        const h = curveHandles(keys, index)
        min = Math.min(
          min,
          key.value,
          key.value + (hasIn ? h.inDy : 0),
          key.value + (hasOut ? h.outDy : 0),
        )
        max = Math.max(
          max,
          key.value,
          key.value + (hasIn ? h.inDy : 0),
          key.value + (hasOut ? h.outDy : 0),
        )
        minFrame = Math.min(minFrame, key.frame)
        maxFrame = Math.max(maxFrame, key.frame)
      })
    }
    if (!Number.isFinite(min)) [min, max] = [-0.5, 0.5]
    if (min === max) [min, max] = [min - 0.5, max + 0.5]
    if (!selectedOnly || !Number.isFinite(minFrame)) {
      minFrame = state.start
      maxFrame = state.end
    }
    if (minFrame === maxFrame) [minFrame, maxFrame] = [minFrame - 5, maxFrame + 5]
    pxPerFrame = (width - GUTTER - PAD * 2) / (maxFrame - minFrame)
    pxPerValue = (height - RULER - PAD * 2) / (max - min)
    left = minFrame - PAD / pxPerFrame
    top = max + PAD / pxPerValue
    invalidate()
  }

  const line = (x1: number, y1: number, x2: number, y2: number, color: string) => {
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  function paintCurve(axis: CurveAxis, width: number) {
    const keys = current()[axis]
    const first = keys[0]
    const last = keys.at(-1)
    if (!first || !last) return
    const start = frameAt(GUTTER)
    const end = frameAt(width)
    ctx.strokeStyle = AXIS_COLORS[axis]
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(GUTTER, y(curveValue(keys, start)!))
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i]!
      const b = keys[i + 1]!
      if (a.frame > end) break
      if (b.frame < start) continue
      if (a.frame >= start) ctx.lineTo(x(a.frame), y(a.value))
      if (a.interpolation === 'bezier') {
        const from = Math.max(a.frame, start)
        const to = Math.min(b.frame, end)
        const count = Math.max(2, Math.ceil(((to - from) * pxPerFrame) / 4))
        for (let sample = 1; sample < count; sample++) {
          const at = from + ((to - from) * sample) / count
          ctx.lineTo(x(at), y(curveValue(keys, at)!))
        }
        ctx.lineTo(x(to), y(curveValue(keys, to)!))
      } else if (a.interpolation === 'constant') {
        ctx.lineTo(x(b.frame), y(a.value))
        ctx.lineTo(x(b.frame), y(b.value))
      } else ctx.lineTo(x(b.frame), y(b.value))
    }
    ctx.lineTo(width, y(curveValue(keys, end)!))
    ctx.stroke()
    ctx.lineWidth = 1
    keys.forEach((key, index) => {
      const selected = hasPoint(selection, axis, key.frame)
      const px = x(key.frame)
      const py = y(key.value)
      if (selected) {
        for (const handle of handles(keys, index)) {
          const hx = x(handle.frame)
          const hy = y(handle.value)
          line(px, py, hx, hy, AXIS_COLORS[axis])
          ctx.beginPath()
          ctx.arc(hx, hy, 3.5, 0, 2 * Math.PI)
          ctx.fillStyle = panel
          ctx.fill()
          ctx.stroke()
        }
      }
      ctx.beginPath()
      ctx.moveTo(px, py - 4)
      ctx.lineTo(px + 4, py)
      ctx.lineTo(px, py + 4)
      ctx.lineTo(px - 4, py)
      ctx.closePath()
      ctx.fillStyle = AXIS_COLORS[axis]
      ctx.fill()
      if (selected) {
        ctx.fillStyle = '#0c8ce955'
        ctx.globalCompositeOperation = 'multiply'
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = accent
        ctx.stroke()
      }
    })
  }

  function paint() {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width <= GUTTER || height <= RULER) return
    const dpr = window.devicePixelRatio || 1
    const pixelWidth = Math.round(width * dpr)
    const pixelHeight = Math.round(height * dpr)
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = panel
    ctx.fillRect(0, 0, width, RULER)
    ctx.fillRect(0, RULER, GUTTER, height)
    line(0, RULER + 0.5, width, RULER + 0.5, grid)
    line(GUTTER + 0.5, RULER, GUTTER + 0.5, height, grid)
    ctx.font = '10px ui-monospace, monospace'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    const valueStep = gridStep(30 / pxPerValue)
    const topTick = Math.floor(top / valueStep)
    for (let i = 0; i < 100; i++) {
      const value = (topTick - i) * valueStep
      const py = Math.round(y(value)) + 0.5
      if (py > height - 6) break
      if (py < RULER + 6) continue
      line(GUTTER, py, width, py, grid)
      ctx.fillStyle = text
      ctx.fillText(Number(value.toPrecision(5)).toString(), GUTTER - 7, py)
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(GUTTER, 0, width - GUTTER, height)
    ctx.clip()
    ctx.fillStyle = '#66708512'
    const start = clamp(x(state.workStart), GUTTER, width)
    const end = clamp(x(state.workEnd), GUTTER, width)
    ctx.fillRect(GUTTER, RULER, start - GUTTER, height - RULER)
    ctx.fillRect(end, RULER, width - end, height - RULER)
    ctx.textAlign = 'center'
    const timeStep = Math.max(1, gridStep(56 / pxPerFrame))
    for (
      let i = 0, frame = Math.ceil(left / timeStep) * timeStep;
      i < 100 && x(frame) < width;
      frame += timeStep, i++
    ) {
      const px = Math.round(x(frame)) + 0.5
      line(px, RULER - 5, px, height, grid)
      ctx.fillStyle = text
      ctx.fillText(String(frame), px, 8)
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(GUTTER, RULER, width - GUTTER, height - RULER)
    ctx.clip()
    for (const axis of state.axes) paintCurve(axis, width)
    ctx.restore()
    const playhead = Math.round(x(state.frame)) + 0.5
    line(playhead, 0, playhead, height, accent)
    if (drag?.kind === 'box') {
      const { origin, edge } = drag
      const bx = Math.min(origin.x, edge.x)
      const by = Math.min(origin.y, edge.y)
      const w = Math.abs(origin.x - edge.x)
      const h = Math.abs(origin.y - edge.y)
      ctx.fillStyle = '#0c8ce922'
      ctx.fillRect(bx, by, w, h)
      ctx.strokeStyle = accent
      ctx.strokeRect(bx + 0.5, by + 0.5, w, h)
    }
    ctx.restore()
  }

  function hitAt(point: Point): Hit | undefined {
    let nearest: Hit | undefined
    let distance = 7
    for (const axis of state.axes) {
      const keys = current()[axis]
      keys.forEach((key, index) => {
        const picked = hasPoint(selection, axis, key.frame)
        const candidates = picked ? [...handles(keys, index), key] : [key]
        for (const candidate of candidates) {
          const d = Math.hypot(point.x - x(candidate.frame), point.y - y(candidate.value))
          if (d > distance) continue
          distance = d
          nearest =
            'side' in candidate
              ? { axis, frame: key.frame, side: candidate.side }
              : { axis, frame: key.frame }
        }
      })
    }
    return nearest
  }

  function select(points: CurvePoint[]) {
    selection = points
    options.select(points)
    invalidate()
  }

  function beginKeys(hit: CurvePoint, additive: boolean, pointer: number, origin: Point): Drag {
    const picked = hasPoint(selection, hit.axis, hit.frame)
    const points = additive
      ? picked
        ? selection.filter((point) => point.axis !== hit.axis || point.frame !== hit.frame)
        : [...selection, hit]
      : picked
        ? [...selection]
        : [hit]
    select(points)
    let min = -Infinity
    let max = Infinity
    for (const { axis, frame } of points) {
      const keys = state.curves[axis]
      const prev = keys.findLast((key) => key.frame < frame && !hasPoint(points, axis, key.frame))
      const next = keys.find((key) => key.frame > frame && !hasPoint(points, axis, key.frame))
      min = Math.max(min, (prev ? prev.frame + 1 : state.start) - frame)
      max = Math.min(max, (next ? next.frame - 1 : state.end) - frame)
    }
    return { kind: 'keys', pointer, origin, points, min, max, delta: 0 }
  }

  function preview(curves: AxisCurves) {
    draft = curves
    options.preview(curves)
    invalidate()
  }

  function endDrag(cancel: boolean) {
    const finished = drag
    drag = null
    const curves = draft
    draft = null
    if (curves) options.preview(null)
    if (finished && curves) {
      const committed =
        !cancel &&
        options.commit(
          curves,
          finished.kind === 'handle' ? 'Edit curve tangent' : 'Move curve keys',
        )
      if (finished.kind === 'keys') {
        select(
          committed
            ? finished.points.map(({ axis, frame }) => ({ axis, frame: frame + finished.delta }))
            : [...finished.points],
        )
      }
    } else if (finished?.kind === 'box') {
      if (cancel) select([...finished.previous])
      else select([...selection])
    }
    if (finished && canvas.hasPointerCapture(finished.pointer))
      canvas.releasePointerCapture(finished.pointer)
    invalidate()
  }

  const seek = (point: Point) =>
    options.seek(clamp(Math.round(frameAt(point.x)), state.start, state.end))

  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || drag || (event.button !== 0 && event.button !== 1)) return
    const origin = position(event)
    if (origin.x < GUTTER) return
    event.preventDefault()
    canvas.focus({ preventScroll: true })
    const pointer = event.pointerId
    if (event.button === 1 || event.altKey) drag = { kind: 'pan', pointer, origin, left, top }
    else if (origin.y < RULER) {
      drag = { kind: 'scrub', pointer, origin }
      seek(origin)
    } else {
      const hit = hitAt(origin)
      if (hit?.side) drag = { kind: 'handle', pointer, origin, hit: { ...hit, side: hit.side } }
      else if (hit) drag = beginKeys(hit, event.shiftKey, pointer, origin)
      else {
        const previous = selection
        if (!event.shiftKey) select([])
        drag = { kind: 'box', pointer, origin, edge: origin, previous }
      }
    }
    canvas.setPointerCapture(pointer)
    invalidate()
  })
  canvas.addEventListener('pointermove', (event) => {
    const point = position(event)
    const active = drag
    if (!active) {
      canvas.style.cursor =
        point.x < GUTTER
          ? 'default'
          : point.y < RULER
            ? 'ew-resize'
            : hitAt(point)
              ? 'move'
              : 'crosshair'
      return
    }
    if (active.pointer !== event.pointerId) return
    let dx = point.x - active.origin.x
    let dy = point.y - active.origin.y
    switch (active.kind) {
      case 'keys': {
        if (!active.points.length || (!draft && Math.hypot(dx, dy) < 3)) return
        if (event.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0
          else dx = 0
        }
        active.delta = clamp(Math.round(dx / pxPerFrame), active.min, active.max)
        const dv = -dy / pxPerValue
        const delta = active.delta
        selection = active.points.map(({ axis, frame }) => ({ axis, frame: frame + delta }))
        preview(
          mapCurves(state.curves, (keys, axis) =>
            keys.map((key) =>
              hasPoint(active.points, axis, key.frame)
                ? { ...key, frame: key.frame + delta, value: key.value + dv }
                : key,
            ),
          ),
        )
        break
      }
      case 'handle': {
        if (!draft && Math.hypot(dx, dy) < 2) return
        const { axis, frame, side } = active.hit
        preview(
          mapCurves(state.curves, (keys, component) =>
            component === axis
              ? moveHandle(keys, frame, side, frameAt(point.x), valueAt(point.y))
              : keys,
          ),
        )
        break
      }
      case 'pan':
        left = active.left - dx / pxPerFrame
        top = active.top + dy / pxPerValue
        break
      case 'scrub':
        seek(point)
        break
      case 'box': {
        active.edge = point
        const points = event.shiftKey ? [...active.previous] : []
        for (const axis of state.axes) {
          for (const key of state.curves[axis]) {
            const px = x(key.frame) - active.origin.x
            const py = y(key.value) - active.origin.y
            if (
              px >= Math.min(0, dx) &&
              px <= Math.max(0, dx) &&
              py >= Math.min(0, dy) &&
              py <= Math.max(0, dy) &&
              !hasPoint(points, axis, key.frame)
            ) {
              points.push({ axis, frame: key.frame })
            }
          }
        }
        selection = points
        break
      }
    }
    invalidate()
  })
  canvas.addEventListener('pointerup', (event) => {
    if (drag?.pointer === event.pointerId) endDrag(false)
  })
  canvas.addEventListener('lostpointercapture', (event) => {
    if (drag?.pointer === event.pointerId) endDrag(true)
  })
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      if (drag) return
      const point = position(event)
      const factor = Math.exp(-event.deltaY * 0.002)
      if (event.shiftKey) {
        const value = valueAt(point.y)
        pxPerValue = clamp(
          pxPerValue * factor,
          Math.min(pxPerValue, 1e-9),
          Math.max(pxPerValue, 1e9),
        )
        top = value + (point.y - RULER) / pxPerValue
      } else {
        const frame = frameAt(point.x)
        pxPerFrame = clamp(pxPerFrame * factor, 1e-9, 200)
        left = frame - (point.x - GUTTER) / pxPerFrame
      }
      invalidate()
    },
    { passive: false },
  )
  canvas.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      if (drag) endDrag(true)
      else select([])
    } else if (!drag) options.keydown(event)
  })
  const resize = new ResizeObserver(() => {
    if (needsFit) fit()
    invalidate()
  })
  resize.observe(host)
  fit()

  return {
    focus: () => canvas.focus({ preventScroll: true }),
    fit,
    update(next: GraphState) {
      const changed = next.curves !== state.curves || next.axes !== state.axes
      if (drag && changed) endDrag(true)
      if (next.selection !== state.selection || changed) selection = next.selection
      const refit =
        next.axes !== state.axes ||
        (!state.curves.some((keys) => keys.length) && next.curves.some((keys) => keys.length))
      state = next
      if (refit) fit()
      invalidate()
    },
    destroy() {
      endDrag(true)
      resize.disconnect()
      cancelAnimationFrame(animation)
      canvas.remove()
    },
  }
}
