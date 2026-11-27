import {
  TRANSFORM_CHANNELS,
  type Character,
  type Clip,
  type DilemmaDocument,
  type JointTrack,
  type KeyChannel,
  type Quat,
  type TransformChannel,
  type TransformKey,
} from './document.ts'

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

const channelLabel = {
  translations: 'translation',
  rotations: 'rotation',
  scales: 'scale',
} satisfies Record<TransformChannel, string>

export interface JointKey {
  joint: number
  key: TransformKey
}

export function setTransformKey(
  target: Clip | string,
  joint: number,
  frame: number,
  key: TransformKey,
): Command {
  return setTransformKeys(target, frame, [{ joint, key }])
}

export function setTransformKeys(
  target: Clip | string,
  frame: number,
  keys: readonly JointKey[],
): Command {
  const id = typeof target === 'string' ? target : target.id
  const single = keys.length === 1 ? keys[0] : undefined
  const label = single ? `Set ${channelLabel[single.key.channel]} key` : 'Set transform keys'
  return editClip(id, label, (current) => {
    const clip = current ?? (typeof target === 'string' ? undefined : target)
    if (!clip) throw new Error(`No clip ${id}.`)
    if (!Number.isInteger(frame) || frame < clip.start || frame > clip.end) {
      throw new Error('The key must be on an integer frame within the clip.')
    }
    const tracks = [...clip.tracks]
    for (const { joint, key } of keys) {
      if (!key.value.every(Number.isFinite)) throw new Error('The key values must be finite.')
      const index = tracks.findIndex((track) => track.joint === joint)
      const track = tracks[index]
      const frames = [...(track?.[key.channel]?.frames ?? [])]
      const values = [...(track?.[key.channel]?.values ?? [])]
      const first = frames.findIndex((existing) => existing >= frame)
      const offset = first < 0 ? frames.length : first
      const count = frames[offset] === frame ? 1 : 0
      const size = key.value.length
      frames.splice(offset, count, frame)
      values.splice(offset * size, count * size, ...key.value)
      tracks[index < 0 ? tracks.length : index] = {
        ...track,
        joint,
        [key.channel]: { frames, values },
      }
    }
    return { ...clip, tracks }
  })
}

export function setRotationKey(
  target: Clip | string,
  joint: number,
  frame: number,
  rotation: Quat,
): Command {
  return setTransformKey(target, joint, frame, { channel: 'rotations', value: rotation })
}

export function deleteTransformKeys(
  id: string,
  joints: number[],
  start: number,
  end: number,
  channels: readonly TransformChannel[] = TRANSFORM_CHANNELS,
): Command {
  const label = channels.length === 1 ? `Delete ${channelLabel[channels[0]!]} keys` : 'Delete keys'
  const jointSet = new Set(joints)
  return editClip(id, label, (clip) => {
    if (!clip) throw new Error(`No clip ${id}.`)
    const tracks = clip.tracks.flatMap((track): JointTrack[] => {
      if (!jointSet.has(track.joint)) return [track]
      const next = { ...track }
      for (const name of channels) {
        const channel = track[name]
        if (!channel) continue
        const kept = outsideRange(channel, name === 'rotations' ? 4 : 3, start, end)
        if (kept) next[name] = kept
        else delete next[name]
      }
      return next.translations || next.rotations || next.scales ? [next] : []
    })
    return { ...clip, tracks }
  })
}

export function deleteRotationKeys(
  id: string,
  joints: number[],
  start: number,
  end: number,
): Command {
  return deleteTransformKeys(id, joints, start, end, ['rotations'])
}

function outsideRange(
  channel: KeyChannel,
  stride: number,
  start: number,
  end: number,
): KeyChannel | undefined {
  const { frames, values } = channel
  const kept = frames.filter((frame) => frame < start || frame > end)
  if (kept.length === frames.length) return channel
  if (kept.length === 0) return undefined
  return {
    frames: kept,
    values: values.filter((_, index) => {
      const frame = frames[Math.floor(index / stride)]!
      return frame < start || frame > end
    }),
  }
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
