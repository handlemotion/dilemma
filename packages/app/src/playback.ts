import { useEffect } from 'react'
import { editor } from './editor.ts'
import { useUi } from './ui-store.ts'

/** While playing, advance the playhead on wall-clock time, looping over the clip. */
export function usePlayback(): void {
  const playing = useUi((s) => s.playing)

  useEffect(() => {
    if (!playing) return
    const { playhead, doc } = editor.getState()
    const clip = doc.clips.find((c) => c.id === playhead.clipId)
    if (!clip || clip.end <= clip.start) {
      useUi.getState().setPlaying(false)
      return
    }
    const length = clip.end - clip.start + 1
    const startFrame = playhead.frame >= clip.end ? clip.start : playhead.frame
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const elapsed = Math.floor(((now - t0) / 1000) * clip.fps)
      editor.setPlayhead({ frame: clip.start + ((startFrame - clip.start + elapsed) % length) })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}
