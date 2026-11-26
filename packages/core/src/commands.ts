import type { Character, Clip, DilemmaDocument } from './document.ts'

/**
 * Every change to the document is a command. `apply` returns the next
 * document and the command that undoes it. Documents are never mutated:
 * commands return new objects and share untouched parts.
 */
export interface Command {
  readonly label: string
  apply(doc: DilemmaDocument): { doc: DilemmaDocument; inverse: Command }
}

export function addCharacter(character: Character, clips: Clip[] = []): Command {
  return {
    label: `Add ${character.name}`,
    apply(doc) {
      if (doc.characters.some((c) => c.id === character.id)) {
        throw new Error(`Character ${character.id} already exists.`)
      }
      return {
        doc: {
          ...doc,
          characters: [...doc.characters, character],
          clips: [...doc.clips, ...clips],
        },
        inverse: removeCharacter(character.id),
      }
    },
  }
}

export function removeCharacter(id: string): Command {
  return {
    label: 'Remove character',
    apply(doc) {
      const index = doc.characters.findIndex((c) => c.id === id)
      const character = doc.characters[index]
      if (!character) throw new Error(`No character ${id}.`)
      const clips = doc.clips.filter((c) => c.characterId === id)
      return {
        doc: {
          ...doc,
          characters: doc.characters.filter((c) => c.id !== id),
          clips: doc.clips.filter((c) => c.characterId !== id),
        },
        inverse: insertCharacter(character, clips, index),
      }
    },
  }
}

function insertCharacter(character: Character, clips: Clip[], index: number): Command {
  return {
    label: `Add ${character.name}`,
    apply(doc) {
      const characters = [...doc.characters]
      characters.splice(index, 0, character)
      return {
        doc: { ...doc, characters, clips: [...doc.clips, ...clips] },
        inverse: removeCharacter(character.id),
      }
    },
  }
}
