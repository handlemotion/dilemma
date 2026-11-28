import { CONTACT_TRANSITION_FRAMES } from '@dilemma/core'
import { CONTACT_STRIDE } from './skeleton.ts'

/** Sample the neighboring holds and return how strongly they constrain the effector. */
export function sampleContact(track: Float64Array, frame: number, out: Float64Array): number {
  let lo = 0
  let hi = track.length / CONTACT_STRIDE
  while (lo < hi) {
    const middle = (lo + hi) >>> 1
    if (track[middle * CONTACT_STRIDE + 1]! < frame) lo = middle + 1
    else hi = middle
  }

  const next = lo * CONTACT_STRIDE
  const previous = next - CONTACT_STRIDE
  const nextStart = track[next] ?? Infinity
  const previousEnd = track[previous + 1] ?? -Infinity
  if (frame >= nextStart) {
    copyContact(track, next, out)
    return 1
  }

  const gap = nextStart - previousEnd
  if (gap <= CONTACT_TRANSITION_FRAMES) {
    const t = ease((frame - previousEnd) / gap)
    for (let axis = 0; axis < 3; axis++) {
      const from = track[previous + 2 + axis]!
      const to = track[next + 2 + axis]!
      out[axis] = from + (to - from) * t
    }
    blendRotation(out, 3, track, previous + 5, track, next + 5, t)
    return 1
  }

  const radius = Math.min(CONTACT_TRANSITION_FRAMES, gap / 2)
  const sincePrevious = frame - previousEnd
  const untilNext = nextStart - frame
  const distance = Math.min(sincePrevious, untilNext)
  if (distance >= radius) return 0
  copyContact(track, sincePrevious < untilNext ? previous : next, out)
  return ease(1 - distance / radius)
}

function copyContact(track: Float64Array, offset: number, out: Float64Array): void {
  for (let i = 0; i < out.length; i++) out[i] = track[offset + 2 + i]!
}

function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

export function blendRotation(
  out: Float64Array,
  offset: number,
  from: Float64Array,
  a: number,
  to: Float64Array,
  b: number,
  t: number,
): void {
  let dot = 0
  for (let i = 0; i < 4; i++) dot += from[a + i]! * to[b + i]!
  const weight = dot < 0 ? -t : t
  let lengthSquared = 0
  for (let i = 0; i < 4; i++) {
    const value = (1 - t) * from[a + i]! + weight * to[b + i]!
    out[offset + i] = value
    lengthSquared += value * value
  }
  const inverse = 1 / (Math.sqrt(lengthSquared) || 1)
  for (let i = 0; i < 4; i++) out[offset + i] = out[offset + i]! * inverse
}
