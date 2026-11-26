import type { Command } from './commands.ts'
import { emptyDocument, type DilemmaDocument } from './document.ts'

/** A joint on a character. Selection points at document data, it is not part of it. */
export interface JointRef {
  characterId: string
  joint: number
}

export interface Selection {
  joints: JointRef[]
}

export interface Playhead {
  clipId: string | null
  /** Integer frame against the clip's fps. */
  frame: number
}

export interface EditorState {
  doc: DilemmaDocument
  selection: Selection
  playhead: Playhead
  canUndo: boolean
  canRedo: boolean
}

type Listener = (state: EditorState) => void

/**
 * Owns the document, the command log, selection and playhead. The only way
 * to change the document is `run`. Undo and redo replay inverses from the log.
 */
export class Editor {
  private state: EditorState
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  private listeners = new Set<Listener>()

  constructor(doc: DilemmaDocument = emptyDocument()) {
    this.state = {
      doc,
      selection: { joints: [] },
      playhead: { clipId: null, frame: 0 },
      canUndo: false,
      canRedo: false,
    }
  }

  getState(): EditorState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  run(command: Command): void {
    const { doc, inverse } = command.apply(this.state.doc)
    this.undoStack.push(inverse)
    this.redoStack = []
    this.commit({ doc: doc })
  }

  undo(): boolean {
    const inverse = this.undoStack.pop()
    if (!inverse) return false
    const { doc, inverse: redo } = inverse.apply(this.state.doc)
    this.redoStack.push(redo)
    this.commit({ doc: doc })
    return true
  }

  redo(): boolean {
    const command = this.redoStack.pop()
    if (!command) return false
    const { doc, inverse } = command.apply(this.state.doc)
    this.undoStack.push(inverse)
    this.commit({ doc: doc })
    return true
  }

  /** Replace the whole document, as on open. Clears history. */
  load(doc: DilemmaDocument): void {
    this.undoStack = []
    this.redoStack = []
    this.commit({ doc, selection: { joints: [] }, playhead: firstPlayhead(doc) })
  }

  select(joints: JointRef[]): void {
    this.commit({ selection: { joints } })
  }

  setPlayhead(playhead: Partial<Playhead>): void {
    const next = { ...this.state.playhead, ...playhead }
    next.frame = Math.round(next.frame)
    if (next.clipId === this.state.playhead.clipId && next.frame === this.state.playhead.frame) {
      return
    }
    this.commit({ playhead: next })
  }

  private commit(patch: Partial<EditorState>): void {
    const next: EditorState = {
      ...this.state,
      ...patch,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    }
    if (patch.doc) {
      next.selection = pruneSelection(next.selection, next.doc)
      const clipId = next.playhead.clipId
      if (!clipId || !next.doc.clips.some((c) => c.id === clipId)) {
        next.playhead = firstPlayhead(next.doc)
      }
    }
    this.state = next
    for (const listener of this.listeners) listener(next)
  }
}

function firstPlayhead(doc: DilemmaDocument): Playhead {
  const clip = doc.clips[0]
  return clip ? { clipId: clip.id, frame: clip.start } : { clipId: null, frame: 0 }
}

function pruneSelection(selection: Selection, doc: DilemmaDocument): Selection {
  const joints = selection.joints.filter((ref) => {
    const character = doc.characters.find((c) => c.id === ref.characterId)
    return character !== undefined && ref.joint < character.skeleton.joints.length
  })
  return joints.length === selection.joints.length ? selection : { joints }
}
