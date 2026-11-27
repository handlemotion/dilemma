import { FileTree, useFileTree } from '@pierre/trees/react'
import jointIcon from 'lucide-static/icons/bone.svg?raw'
import characterIcon from 'lucide-static/icons/person-standing.svg?raw'
import type { Character, JointRef } from '@dilemma/core'
import { useLayoutEffect, useMemo, useRef, type CSSProperties, type MouseEvent } from 'react'
import { selectJoints } from '../animation.ts'
import { editor, useEditorState } from '../editor.ts'
import { useUi } from '../ui-store.ts'

interface TreeNode {
  path: string
  name: string
  joint?: JointRef
}

const mask = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

const treeStyle = {
  '--trees-bg-override': 'var(--color-timeline)',
  '--trees-fg-override': 'var(--color-ink)',
  '--trees-accent-override': 'var(--color-accent)',
  '--trees-selected-bg-override': 'var(--color-control-hover)',
  '--trees-selected-focused-border-color-override': 'var(--color-faint)',
  '--trees-icon-width-override': '14px',
  '--trees-font-family-override': 'var(--font-sans)',
  '--trees-font-size-override': '12px',
  '--trees-padding-inline-override': '0px',
  '--trees-item-padding-x-override': '8px',
  '--trees-level-gap-override': '10px',
  '--trees-item-margin-x-override': '0px',
  '--trees-border-radius-override': '0px',
  '--trees-item-row-gap-override': '0px',
  '--trees-indent-guide-bg-override': '#c3c7d0',
} as CSSProperties

const treeCss = `
  :host {
    --outliner-icon-gap: 4px;
    --outliner-connector-width: 4px;
  }
  [data-file-tree-virtualized-scroll] { scrollbar-gutter: auto; }
  [data-item-section="spacing"] > [data-item-section="spacing-item"] {
    position: relative;
    opacity: 1;
    transition: none;
  }
  [data-item-section="spacing"] > [data-item-section="spacing-item"]:not(:last-child) {
    border-inline-start-color: transparent;
  }
  [role="treeitem"] {
    --outliner-last-sibling: calc(1 - sign(abs(
      attr(aria-setsize type(<number>), 0) - attr(aria-posinset type(<number>), 0)
    )));
  }
  [data-item-section="spacing"] > [data-item-section="spacing-item"]:last-child {
    align-self: flex-start;
    height: calc(100% - 50% * var(--outliner-last-sibling, 0));
  }
  [data-item-section="spacing"] > [data-item-section="spacing-item"]:last-child::after {
    content: "";
    position: absolute;
    inset-inline-start: 0;
    top: calc(var(--trees-row-height) / 2 - 1px);
    width: var(--outliner-connector-width);
    border-top: 1px solid var(--trees-indent-guide-bg);
  }
  [data-item-section="icon"] { margin-inline-end: var(--outliner-icon-gap); }
  [data-item-type="file"] > [data-item-section="icon"] { visibility: hidden; }
  [data-item-type="file"] [data-item-section="spacing-item"]:last-child::after {
    width: calc(var(--outliner-connector-width) + var(--trees-icon-width) + var(--outliner-icon-gap));
  }
  [data-item-section="content"] { display: flex; align-items: center; gap: var(--outliner-icon-gap); }
  [data-item-section="content"]::before {
    content: "";
    flex: 0 0 14px;
    height: 14px;
    background: currentColor;
    mask: ${mask(jointIcon)} center / contain no-repeat;
  }
  :host(:not([data-focused-branch])) [data-item-path]:not([data-item-parent-path]) > [data-item-section="content"]::before {
    mask-image: ${mask(characterIcon)};
  }
`

/** Pierre paths are view IDs. The editor owns the corresponding joint selection. */
export function Outliner() {
  const characters = useEditorState((s) => s.doc.characters)
  const selected = useEditorState((s) => s.selection.joints)
  const focus = useUi((s) => s.outlinerFocus)
  const setFocus = useUi((s) => s.setOutlinerFocus)
  const nodes = useMemo(() => treeNodes(characters), [characters])
  const focused = focus ? nodes.get(focus) : undefined
  const prefix = focused ? focused.path.slice(0, focused.path.lastIndexOf('/') + 1) : ''
  const visible = useMemo(() => {
    const rows = new Map<string, TreeNode>()
    for (const node of nodes.values()) {
      if (!focused || node.path === focused.path || node.path.startsWith(focused.path + '/')) {
        rows.set(node.path.slice(prefix.length), node)
      }
    }
    return rows
  }, [nodes, focused, prefix])

  const lead = selected.at(-1)
  const selectedNode = lead && [...nodes.values()].find((node) => sameJoint(node.joint, lead))
  const selectedPath =
    selectedNode && visible.has(selectedNode.path.slice(prefix.length))
      ? selectedNode.path.slice(prefix.length)
      : null
  const searchInput = useRef<HTMLInputElement>(null)
  const pendingReveal = useRef<string | null>(null)
  const syncing = useRef(false)
  const liveRows = useRef(visible)
  const { model } = useFileTree({
    paths: [],
    density: 'compact',
    initialExpansion: 1,
    flattenEmptyDirectories: false,
    fileTreeSearchMode: 'hide-non-matches',
    itemHeight: 26,
    unsafeCSS: treeCss,
    composition: { contextMenu: { triggerMode: 'right-click' } },
    onSearchChange(value) {
      if (searchInput.current && searchInput.current.value !== (value ?? '')) {
        searchInput.current.value = value ?? ''
      }
    },
    onSelectionChange(paths) {
      if (syncing.current) return
      const joints = paths.flatMap((path) => {
        const joint = liveRows.current.get(path.replace(/\/$/, ''))?.joint
        return joint ? [joint] : []
      })
      const current = editor.getState().selection.joints
      if (
        current.length !== joints.length ||
        joints.some((joint, i) => !sameJoint(current[i], joint))
      ) {
        selectJoints(joints)
      }
    },
  })

  useLayoutEffect(() => {
    liveRows.current = visible
    syncing.current = true
    const parents = new Set([...visible.keys()].map((path) => path.slice(0, path.lastIndexOf('/'))))
    model.resetPaths([...visible.keys()].map((path) => (parents.has(path) ? path + '/' : path)))
    syncing.current = false
  }, [model, visible])

  useLayoutEffect(() => {
    syncing.current = true
    const paths = new Set(
      [...visible].flatMap(([path, node]) =>
        node.joint && selected.some((joint) => sameJoint(node.joint, joint)) ? [path] : [],
      ),
    )
    for (const path of model.getSelectedPaths()) {
      if (!paths.has(path.replace(/\/$/, ''))) model.getItem(path)?.deselect()
    }
    for (const path of paths) model.getItem(path)?.select()
    syncing.current = false
  }, [model, selected, visible])

  useLayoutEffect(() => {
    const path = pendingReveal.current
    if (!path || !visible.has(path)) return
    pendingReveal.current = null
    revealPath(model, path)
  }, [model, visible])

  function reveal() {
    if (selectedPath) revealPath(model, selectedPath)
    else if (selectedNode) {
      pendingReveal.current = selectedNode.path
      setFocus(null)
    }
  }

  function toggleJoint(event: MouseEvent) {
    if (!event.shiftKey) return
    const row = event.nativeEvent
      .composedPath()
      .find(
        (entry): entry is HTMLElement =>
          entry instanceof HTMLElement && entry.hasAttribute('data-item-path'),
      )
    const path = row?.dataset.itemPath?.replace(/\/$/, '')
    if (!path || !visible.get(path)?.joint) return
    event.preventDefault()
    event.stopPropagation()
    model.getItem(path)?.toggleSelect()
  }

  if (characters.length === 0) return null
  const crumbs = focused
    ? focused.path
        .split('/')
        .map((_, index, parts) => nodes.get(parts.slice(0, index + 1).join('/')))
    : []
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-timeline">
      <div className="shrink-0 p-2">
        <input
          ref={searchInput}
          type="search"
          aria-label="Find a joint"
          placeholder="Find a joint"
          className="h-7 w-full rounded-md bg-control px-2 text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
          onChange={(event) => model.setSearch(event.currentTarget.value || null)}
        />
      </div>
      {focused && (
        <nav
          aria-label="Outliner branch"
          className="flex shrink-0 gap-1 overflow-x-auto px-2 pb-2 whitespace-nowrap"
        >
          <button
            type="button"
            className="text-muted hover:text-ink"
            onClick={() => setFocus(null)}
          >
            Scene
          </button>
          {crumbs.map(
            (node) =>
              node && (
                <button
                  type="button"
                  key={node.path}
                  className="text-muted hover:text-ink"
                  aria-current={node.path === focus ? 'location' : undefined}
                  onClick={() => setFocus(node.path)}
                >
                  <span aria-hidden>› </span>
                  {node.name}
                </button>
              ),
          )}
        </nav>
      )}
      <FileTree
        model={model}
        style={treeStyle}
        data-focused-branch={focused?.joint ? true : undefined}
        className="min-h-0 flex-1 overflow-hidden"
        onClickCapture={toggleJoint}
        renderContextMenu={(item, menu) => {
          const node = visible.get(item.path.replace(/\/$/, ''))
          return (
            <div className="min-w-32 rounded-md border border-line bg-panel p-1 shadow-md">
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-control disabled:opacity-50"
                disabled={!selectedNode}
                onClick={() => {
                  menu.close()
                  reveal()
                }}
              >
                Reveal selection
              </button>
              {item.kind === 'directory' && node && (
                <button
                  type="button"
                  className="block w-full rounded px-2 py-1 text-left hover:bg-control"
                  onClick={() => {
                    menu.close()
                    model.closeSearch()
                    setFocus(node.path)
                  }}
                >
                  Focus branch
                </button>
              )}
            </div>
          )
        }}
      />
    </div>
  )
}

function revealPath(model: ReturnType<typeof useFileTree>['model'], path: string) {
  model.closeSearch()
  const parts = path.split('/')
  for (let i = 1; i < parts.length; i++) {
    const item = model.getItem(parts.slice(0, i).join('/'))
    if (item && 'expand' in item) item.expand()
  }
  model.scrollToPath(path, { offset: 'nearest', focus: false })
}

function sameJoint(a: JointRef | undefined, b: JointRef): boolean {
  return a?.characterId === b.characterId && a.joint === b.joint
}

function treeNodes(characters: readonly Character[]): Map<string, TreeNode> {
  const nodes = new Map<string, TreeNode>()
  function add(parent: string, label: string, joint?: JointRef): string {
    const name = label.replaceAll('/', '∕').replaceAll('\\', '∖').trim()
    const segment = !name || name === '.' || name === '..' ? 'Unnamed' : name
    const base = parent ? parent + '/' + segment : segment
    let path = base
    for (let index = 2; nodes.has(path); index++) path = `${base} (${index})`
    nodes.set(path, { path, name: label || segment, ...(joint && { joint }) })
    return path
  }

  for (const character of characters) {
    const root = add('', character.name)
    const paths: string[] = []
    character.skeleton.joints.forEach((joint, index) => {
      paths.push(
        add(paths[joint.parent] ?? root, joint.name, { characterId: character.id, joint: index }),
      )
    })
  }
  return nodes
}
