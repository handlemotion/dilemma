import type { Character, JointRef } from '@dilemma/core'
import { editor, useEditorState } from '../editor.ts'

/** Characters and their joints. Clicking a joint selects it, Shift adds to the selection. */
export function Outliner() {
  const characters = useEditorState((s) => s.doc.characters)
  const selection = useEditorState((s) => s.selection)

  if (characters.length === 0) {
    return <p className="px-3 py-3 text-faint">No characters yet.</p>
  }
  return (
    <div className="h-full overflow-y-auto py-1">
      {characters.map((character) => (
        <CharacterTree key={character.id} character={character} selected={selection.joints} />
      ))}
    </div>
  )
}

function CharacterTree({ character, selected }: { character: Character; selected: JointRef[] }) {
  const joints = character.skeleton.joints
  const depth: number[] = []
  joints.forEach((j, i) => (depth[i] = j.parent >= 0 ? depth[j.parent]! + 1 : 0))
  const isSelected = (i: number) =>
    selected.some((s) => s.characterId === character.id && s.joint === i)

  return (
    <section>
      <h3 className="truncate px-3 pt-1 pb-1 text-muted">
        {character.name}
        <span className="ml-2 font-normal text-faint">{joints.length} joints</span>
      </h3>
      <ul className="px-1.5">
        {joints.map((joint, i) => (
          <li key={joint.id}>
            <button
              type="button"
              onClick={(e) => {
                const ref = { characterId: character.id, joint: i }
                if (!e.shiftKey) return editor.select([ref])
                const rest = selected.filter(
                  (s) => !(s.characterId === character.id && s.joint === i),
                )
                editor.select(rest.length === selected.length ? [...selected, ref] : rest)
              }}
              className={`block w-full truncate rounded-md py-0.5 pr-3 text-left ${
                isSelected(i)
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted hover:bg-raised hover:text-ink'
              }`}
              style={{ paddingLeft: 6 + depth[i]! * 10 }}
              title={joint.name}
            >
              {joint.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
