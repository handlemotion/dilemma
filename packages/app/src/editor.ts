import { Editor, type EditorState } from '@dilemma/core'
import { useSyncExternalStore } from 'react'

/** The one editor for this window. Document, command log, selection and playhead live here. */
export const editor = new Editor()

export function useEditorState(): EditorState
export function useEditorState<T>(select: (state: EditorState) => T): T
export function useEditorState<T>(select?: (state: EditorState) => T): T | EditorState {
  const state = useSyncExternalStore(
    (listener) => editor.subscribe(listener),
    () => editor.getState(),
  )
  return select ? select(state) : state
}
