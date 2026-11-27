export function formatTimelineTime(frame: number, fps: number): string {
  const absoluteFrame = Math.abs(frame)
  const seconds = Math.floor(absoluteFrame / fps)
  const timecode = [Math.floor(seconds / 60), seconds % 60, absoluteFrame % fps]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
  return frame < 0 ? `-${timecode}` : timecode
}

/** Parse a frame number, seconds with an s suffix, or MM:SS[:FF]. */
export function parseTimelineTime(input: string, fps: number): number | undefined {
  const text = input.trim()
  const sign = text.startsWith('-') ? -1 : 1
  const value = text.replace(/^[+-]/u, '')
  let frame: number
  if (/^\d+$/u.test(value)) {
    frame = Number(value)
  } else if (/^\d+(?:\.\d+)?s$/iu.test(value)) {
    frame = Math.round(Number(value.slice(0, -1)) * fps)
  } else if (/^\d+:\d{1,2}(?::\d+)?$/u.test(value)) {
    const [minutes, seconds, frames = 0] = value.split(':').map(Number)
    if (seconds! >= 60 || frames >= fps) return undefined
    frame = (minutes! * 60 + seconds!) * fps + frames
  } else {
    return undefined
  }

  if (!Number.isSafeInteger(frame)) return undefined
  return sign * frame
}
