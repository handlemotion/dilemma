import { useEffect } from 'react'
import { editor, useEditorState } from './editor.ts'
import { PREVIEW_END, PREVIEW_FPS, useUi } from './ui-store.ts'

/** While playing, advance the playhead on wall-clock time, looping over the clip. */
export function usePlayback(): void {
  const playing = useUi((s) => s.playing)

  const clipId = useEditorState((s) => s.playhead.clipId)
  const workArea = useUi((s) => s.workArea)

  useEffect(() => {
    if (!playing) return
    const { playhead, doc } = editor.getState()
    const clip = doc.clips.find((c) => c.id === clipId)
    const baseStart = clip?.start ?? 0
    const baseEnd = clip?.end ?? PREVIEW_END
    const area = workArea?.clipId === (clip?.id ?? null) ? workArea : null
    const start = Math.max(baseStart, Math.min(baseEnd, area?.start ?? baseStart))
    const end = Math.max(start, Math.min(baseEnd, area?.end ?? baseEnd))
    const frame = clip ? playhead.frame : useUi.getState().previewFrame
    const fps = clip?.fps ?? PREVIEW_FPS
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
      offset = (offset + elapsed * fps * ui.playbackSpeed) % length
      const next = start + Math.floor(offset)
      if (clip) editor.setPlayhead({ frame: next })
      else if (useUi.getState().previewFrame !== next) useUi.getState().setPreviewFrame(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, clipId, workArea])
}
