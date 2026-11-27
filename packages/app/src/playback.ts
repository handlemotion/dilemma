import { useEffect } from 'react'
import { editor, useEditorState } from './editor.ts'
import { resolveWorkArea, useUi } from './ui-store.ts'

/** While playing, advance the playhead on wall-clock time within the work area. */
export function usePlayback(): void {
  const playing = useUi((s) => s.playing)
  const clip = useEditorState(({ doc, playhead }) =>
    doc.clips.find(({ id }) => id === playhead.clipId),
  )
  const sceneTiming = useEditorState(({ doc }) => doc.sceneTiming)
  const workArea = useUi((s) => s.workArea)
  const { clipId, start, end } = resolveWorkArea(clip, sceneTiming, workArea)
  const fps = (clip ?? sceneTiming).fps

  useEffect(() => {
    if (!playing) return
    const frame = clipId ? editor.getState().playhead.frame : useUi.getState().previewFrame
    const length = end - start + 1
    const startFrame = frame < start || frame >= end ? start : frame
    let offset = startFrame - start
    let lastTick = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const ui = useUi.getState()
      if (!ui.playing) return
      const elapsed = Math.max(0, now - lastTick) / 1000
      lastTick = now
      offset += elapsed * fps * ui.playbackSpeed
      const finished = !ui.loopPlayback && offset >= length
      if (ui.loopPlayback) offset %= length
      const next = Math.min(end, start + Math.floor(offset))
      if (clipId) editor.setPlayhead({ frame: next })
      else ui.setPreviewFrame(next)
      if (finished) {
        ui.setPlaying(false)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, clipId, start, end, fps])
}
