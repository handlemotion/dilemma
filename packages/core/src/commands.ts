import {
  TRANSFORM_CHANNELS,
  validSceneTiming,
  type Character,
  type Clip,
  type DilemmaDocument,
  type ControlKey,
  type EffectorPin,
  type JointTrack,
  type KeyChannel,
  type Quat,
  type SceneTiming,
  type TransformChannel,
  type TransformKey,
  type Vec3,
} from './document.ts'
import {
  controlJoint,
  controlKind,
  validRigMapping,
  type ControlId,
  type Effector,
  type RigMapping,
} from './rig.ts'

/**
 * Every change to the document is a command. `apply` returns the next
 * document and the command that undoes it. Documents are never mutated:
 * commands return new objects and share untouched parts.
 */
export interface Command {
  readonly label: string
  apply(doc: DilemmaDocument): { doc: DilemmaDocument; inverse: Command }
}

export function setSceneTiming(timing: Partial<SceneTiming>): Command {
  return {
    label: 'Set scene timing',
    apply(doc) {
      const sceneTiming = { ...doc.sceneTiming, ...timing }
      if (!validSceneTiming(sceneTiming)) {
        throw new Error(
          'Enter a positive frame rate and a whole-frame range in start-to-end order.',
        )
      }
      return { doc: { ...doc, sceneTiming }, inverse: setSceneTiming(doc.sceneTiming) }
    },
  }
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

export function setRigMapping(id: string, rig: RigMapping | undefined): Command {
  return {
    label: 'Confirm rig',
    apply(doc) {
      const index = doc.characters.findIndex((character) => character.id === id)
      const character = doc.characters[index]
      if (!character || (rig && !validRigMapping(character.skeleton, rig))) {
        throw new Error('Choose a distinct, valid joint for each rig role.')
      }
      const updated = { ...character }
      if (rig) updated.rig = rig
      else delete updated.rig
      const characters = [...doc.characters]
      characters[index] = updated
      return { doc: { ...doc, characters }, inverse: setRigMapping(id, character.rig) }
    },
  }
}

export function setControlKey(target: Clip | string, frame: number, key: ControlKey): Command {
  return editPoseClip(target, 'Set pose key', (clip, character) => {
    if (controlJoint(character.skeleton, character.rig, key.control) === undefined) {
      throw new Error('Confirm the rig before keying this control.')
    }
    if (!Number.isInteger(frame) || frame < clip.start || frame > clip.end) {
      throw new Error('The key must be on an integer frame within the clip.')
    }
    const width = controlKind(key.control) === 'rotation' ? 4 : 3
    if (key.value.length !== width || !key.value.every(Number.isFinite)) {
      throw new Error('The pose key has invalid values.')
    }
    return {
      ...clip,
      controls: {
        ...clip.controls,
        [key.control]: insertKey(clip.controls?.[key.control], frame, key.value),
      },
    }
  })
}

export function setEffectorPin(
  target: Clip | string,
  control: Effector,
  pin: EffectorPin | undefined,
): Command {
  return editPoseClip(target, pin ? 'Pin effector' : 'Unpin effector', (clip, character) => {
    if (controlJoint(character.skeleton, character.rig, control) === undefined) {
      throw new Error('Confirm the rig before pinning this effector.')
    }
    const pins = { ...clip.pins }
    if (pin) {
      if (
        pin.position.length !== 3 ||
        pin.rotation.length !== 4 ||
        !pin.position.every(Number.isFinite) ||
        !pin.rotation.every(Number.isFinite)
      ) {
        throw new Error('The effector pin has invalid values.')
      }
      pins[control] = pin
    } else delete pins[control]
    return { ...clip, pins }
  })
}

function editPoseClip(
  target: Clip | string,
  label: string,
  edit: (clip: Clip, character: Character) => Clip,
): Command {
  const id = typeof target === 'string' ? target : target.id
  return editClip(id, label, (current, doc) => {
    const clip = current ?? (typeof target === 'string' ? undefined : target)
    const character = doc.characters.find((entry) => entry.id === clip?.characterId)
    if (!clip || !character) throw new Error('The clip has no character.')
    return edit(clip, character)
  })
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

export function setClipTiming(
  id: string,
  timing: Partial<Pick<Clip, 'start' | 'end' | 'fps'>>,
): Command {
  return editClip(id, 'Set clip timing', (clip) => {
    if (!clip) throw new Error(`No clip ${id}.`)
    const next = { ...clip, ...timing }
    const { start, end, fps } = next
    if ((start | 0) !== start || (end | 0) !== end || start > end)
      throw new Error('Enter whole clip frames with the start at or before the end.')
    if (!Number.isFinite(fps) || fps <= 0) throw new Error('Clip FPS must be greater than zero.')

    const excludesKeys = (channel: KeyChannel | undefined) => {
      const frames = channel?.frames
      return !!frames?.length && (frames[0]! < start || frames[frames.length - 1]! > end)
    }
    if (
      excludesKeys(clip.limb?.targets) ||
      Object.values(clip.controls ?? {}).some(excludesKeys) ||
      clip.tracks.some((track) =>
        TRANSFORM_CHANNELS.some((channel) => excludesKeys(track[channel])),
      )
    ) {
      throw new Error(
        'The clip range must include all keys. Use Preview for a shorter playback range.',
      )
    }
    return next
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
      tracks[index < 0 ? tracks.length : index] = {
        ...track,
        joint,
        [key.channel]: insertKey(track?.[key.channel], frame, key.value),
      }
    }
    return { ...clip, tracks }
  })
}

function insertKey(channel: KeyChannel | undefined, frame: number, value: readonly number[]) {
  const frames = [...(channel?.frames ?? [])]
  const values = [...(channel?.values ?? [])]
  const first = frames.findIndex((existing) => existing >= frame)
  const offset = first < 0 ? frames.length : first
  const count = frames[offset] === frame ? 1 : 0
  frames.splice(offset, count, frame)
  values.splice(offset * value.length, count * value.length, ...value)
  return { frames, values }
}

export function setLimbTargetKey(target: Clip | string, tip: number, frame: number, value: Vec3) {
  const id = typeof target === 'string' ? target : target.id
  return editClip(id, 'Set IK target key', (current) => {
    const clip = current ?? (typeof target === 'string' ? undefined : target)
    if (!clip) throw new Error(`No clip ${id}.`)
    if (!Number.isInteger(frame) || frame < clip.start || frame > clip.end) {
      throw new Error('The key must be on an integer frame within the clip.')
    }
    if (clip.limb && clip.limb.tip !== tip) throw new Error('The clip already has an IK limb.')
    if (!value.every(Number.isFinite)) throw new Error('The key values must be finite.')
    return { ...clip, limb: { tip, targets: insertKey(clip.limb?.targets, frame, value) } }
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
  return deleteClipKeys(id, joints, start, end, { channels })
}

export function deleteClipKeys(
  id: string,
  joints: number[],
  start: number,
  end: number,
  {
    channels = TRANSFORM_CHANNELS,
    limb = false,
    controls = [],
  }: {
    channels?: readonly TransformChannel[]
    limb?: boolean
    controls?: readonly ControlId[]
  } = {},
): Command {
  const label =
    !limb && !controls.length && channels.length === 1
      ? `Delete ${channelLabel[channels[0]!]} keys`
      : 'Delete keys'
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
    const next = { ...clip, tracks }
    if (limb && clip.limb) {
      const targets = outsideRange(clip.limb.targets, 3, start, end)
      if (targets) next.limb = { ...clip.limb, targets }
      else delete next.limb
    }
    if (controls.length && clip.controls) {
      next.controls = { ...clip.controls }
      for (const control of controls) {
        const channel = next.controls[control]
        if (!channel) continue
        const kept = outsideRange(channel, controlKind(control) === 'rotation' ? 4 : 3, start, end)
        if (kept) next.controls[control] = kept
        else delete next.controls[control]
      }
    }
    return next
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
  edit: (clip: Clip | undefined, doc: DilemmaDocument) => Clip | undefined,
  insertAt?: number,
): Command {
  return {
    label,
    apply(doc) {
      const clips = [...doc.clips]
      const index = clips.findIndex((clip) => clip.id === id)
      const previous = clips[index]
      const next = edit(previous, doc)
      if (next) {
        const character = doc.characters.find((entry) => entry.id === next.characterId)
        if (!character || next.tracks.some(({ joint }) => !character.skeleton.joints[joint])) {
          throw new Error('The clip refers to a missing character or joint.')
        }
        if (next.limb) {
          const joints = character.skeleton.joints
          const middle = joints[next.limb.tip]?.parent ?? -1
          if ((joints[middle]?.parent ?? -1) < 0) {
            throw new Error('The IK tip needs two parent joints.')
          }
        }
        clips.splice(index < 0 ? (insertAt ?? clips.length) : index, index < 0 ? 0 : 1, next)
      } else if (index >= 0) clips.splice(index, 1)
      return { doc: { ...doc, clips }, inverse: editClip(id, label, () => previous, index) }
    },
  }
}
