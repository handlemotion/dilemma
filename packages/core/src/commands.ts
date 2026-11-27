import type { Character, Clip, DilemmaDocument, JointTrack, Quat } from './document.ts'

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

export function addClip(clip: Clip): Command {
  return editClip(clip.id, 'Add clip', (current) => {
    if (current) throw new Error(`Clip ${clip.id} already exists.`)
    return clip
  })
}

export function setRotationKey(
  target: Clip | string,
  joint: number,
  frame: number,
  rotation: Quat,
): Command {
  const id = typeof target === 'string' ? target : target.id
  return editClip(id, 'Set rotation key', (current) => {
    const clip = current ?? (typeof target === 'string' ? undefined : target)
    if (!clip) throw new Error(`No clip ${id}.`)
    return editRotation(clip, joint, frame, rotation)
  })
}

export function deleteRotationKeys(
  id: string,
  joints: number[],
  start: number,
  end: number,
): Command {
  return editClip(id, 'Delete rotation keys', (clip) => {
    if (!clip) throw new Error(`No clip ${id}.`)
    const tracks = clip.tracks.flatMap((track): JointTrack[] => {
      if (!joints.includes(track.joint) || !track.rotations) return [track]
      const { frames, values } = track.rotations
      const kept = frames.filter((frame) => frame < start || frame > end)
      if (kept.length === frames.length) return [track]
      if (kept.length === 0) {
        const { joint, translations, scales } = track
        return translations || scales
          ? [{ joint, ...(translations && { translations }), ...(scales && { scales }) }]
          : []
      }
      return [
        {
          ...track,
          rotations: {
            frames: kept,
            values: values.filter((_, index) => {
              const frame = frames[Math.floor(index / 4)]!
              return frame < start || frame > end
            }),
          },
        },
      ]
    })
    return { ...clip, tracks }
  })
}

function editRotation(clip: Clip, joint: number, frame: number, rotation: Quat): Clip {
  if (!Number.isInteger(frame) || frame < clip.start || frame > clip.end) {
    throw new Error('The key must be on an integer frame within the clip.')
  }
  const tracks = [...clip.tracks]
  const index = tracks.findIndex((track) => track.joint === joint)
  const track = tracks[index]
  const frames = [...(track?.rotations?.frames ?? [])]
  const values = [...(track?.rotations?.values ?? [])]
  const first = frames.findIndex((key) => key >= frame)
  const key = first < 0 ? frames.length : first
  const count = frames[key] === frame ? 1 : 0
  frames.splice(key, count, frame)
  values.splice(key * 4, count * 4, ...rotation)
  tracks[index < 0 ? tracks.length : index] = { ...track, joint, rotations: { frames, values } }
  return { ...clip, tracks }
}

function editClip(
  id: string,
  label: string,
  edit: (clip: Clip | undefined) => Clip | undefined,
  insertAt?: number,
): Command {
  return {
    label,
    apply(doc) {
      const clips = [...doc.clips]
      const index = clips.findIndex((clip) => clip.id === id)
      const previous = clips[index]
      const next = edit(previous)
      if (next) {
        const character = doc.characters.find((entry) => entry.id === next.characterId)
        if (!character || next.tracks.some(({ joint }) => !character.skeleton.joints[joint])) {
          throw new Error('The clip refers to a missing character or joint.')
        }
        clips.splice(index < 0 ? (insertAt ?? clips.length) : index, index < 0 ? 0 : 1, next)
      } else if (index >= 0) clips.splice(index, 1)
      return { doc: { ...doc, clips }, inverse: editClip(id, label, () => previous, index) }
    },
  }
}
