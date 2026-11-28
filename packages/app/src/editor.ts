import { Editor, type EditorState } from '@dilemma/core'
import { useSyncExternalStore } from 'react'
import { useUi } from './ui-store.ts'

/** The one editor for this window. Document, command log, selection and playhead live here. */
export const editor = new Editor()

let previous = editor.getState()
editor.subscribe((state) => {
  const ui = useUi.getState()
  if (ui.rigSetup && !state.doc.characters.some(({ id }) => id === ui.rigSetup?.characterId)) {
    useUi.setState({ rigSetup: null })
  }
  if (
    ui.selectedContact &&
    (state.playhead.clipId !== ui.selectedContact.clipId ||
      !state.doc.clips
        .find(({ id }) => id === ui.selectedContact?.clipId)
        ?.contacts?.some(({ id }) => id === ui.selectedContact?.id))
  )
    ui.setSelectedContact(null)
  if (state.doc.sceneTiming !== previous.doc.sceneTiming) {
    const { start, end } = state.doc.sceneTiming
    ui.setPreviewFrame(Math.min(end, Math.max(start, ui.previewFrame)))
    const range = ui.timelineRange
    if (
      range?.clipId === null &&
      (Math.min(range.anchor, range.edge) < start || Math.max(range.anchor, range.edge) > end)
    ) {
      ui.setTimelineRange(null)
    }
  }
  if (
    ui.unkeyedTransforms.length &&
    (state.doc !== previous.doc || state.playhead !== previous.playhead)
  ) {
    ui.setUnkeyedTransforms([])
  }
  previous = state
})

export function useEditorState(): EditorState
export function useEditorState<T>(select: (state: EditorState) => T): T
export function useEditorState<T>(select?: (state: EditorState) => T): T | EditorState {
  const state = useSyncExternalStore(
    (listener) => editor.subscribe(listener),
    () => editor.getState(),
  )
  return select ? select(state) : state
}
