import { FileTree, useFileTree, useFileTreeSelector } from '@pierre/trees/react'
import type { Character, JointRef } from '@dilemma/core'
import { useLayoutEffect, useMemo, useRef, type CSSProperties, type MouseEvent } from 'react'
import { selectJoints } from '../animation.ts'
import { editor, useEditorState } from '../editor.ts'
import { Icon } from '../icons/central.tsx'
import characterIcon from '../icons/outliner-character.svg?raw'
import jointIcon from '../icons/outliner-joint.svg?raw'
import outlinerSprite from '../icons/outliner-sprite.svg?raw'
import { useUi } from '../ui-store.ts'
import { PanelHeader } from './panel-header.tsx'

interface TreeNode {
  path: string
  name: string
  joint?: JointRef
}

const mask = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

const treeStyle = {
  '--trees-bg-override': 'var(--color-panel)',
  '--trees-bg-muted-override': 'var(--color-control)',
  '--trees-fg-override': 'var(--color-ink)',
  '--trees-accent-override': 'var(--color-accent)',
  '--trees-selected-bg-override': 'var(--color-panel)',
  '--trees-selected-focused-border-color-override': 'var(--color-faint)',
  '--trees-icon-width-override': '14px',
  '--trees-font-family-override': 'var(--font-sans)',
  '--trees-font-size-override': '12px',
  '--trees-padding-inline-override': '0px',
  '--trees-item-padding-x-override': '6px',
  '--trees-level-gap-override': '10px',
  '--trees-item-margin-x-override': 'calc(var(--spacing) * 1.5)',
  '--trees-border-radius-override': 'var(--radius-md)',
  '--trees-item-row-gap-override': '0px',
  '--trees-indent-guide-bg-override': '#c3c7d0',
} as CSSProperties

const treeCss = `
  :host {
    --outliner-icon-gap: 3px;
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
  [data-item-selected="true"]::after {
    position: absolute;
    z-index: 1;
    inset: 0;
    border-radius: inherit;
    background: var(--color-primary);
    opacity: var(--selection-tint-opacity);
    mix-blend-mode: multiply;
    pointer-events: none;
    content: "";
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
  const hasCharacters = characters.length > 0
  const searchOpen = useUi((s) => s.outlinerSearchOpen) && hasCharacters
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
  const { treePaths, branches } = useMemo(() => {
    const parents = new Set<string>()
    for (const path of visible.keys()) {
      const separator = path.lastIndexOf('/')
      if (separator !== -1) parents.add(path.slice(0, separator))
    }
    return {
      treePaths: [...visible.keys()].map((path) => (parents.has(path) ? path + '/' : path)),
      branches: [...parents],
    }
  }, [visible])

  const lead = selected.at(-1)
  const selectedNode = lead && [...nodes.values()].find((node) => sameJoint(node.joint, lead))
  const selectedPath =
    selectedNode && visible.has(selectedNode.path.slice(prefix.length))
      ? selectedNode.path.slice(prefix.length)
      : null
  const searchInput = useRef<HTMLInputElement>(null)
  const searchButton = useRef<HTMLButtonElement>(null)
  const pendingReveal = useRef<string | null>(null)
  const syncing = useRef(false)
  const liveRows = useRef(visible)
  const { model } = useFileTree({
    paths: [],
    density: 'compact',
    initialExpansion: 'closed',
    flattenEmptyDirectories: false,
    fileTreeSearchMode: 'hide-non-matches',
    itemHeight: 28,
    icons: {
      spriteSheet: outlinerSprite,
      remap: { 'file-tree-icon-chevron': { name: 'outliner-chevron', viewBox: '0 0 24 24' } },
    },
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
  const allExpanded = useFileTreeSelector(
    model,
    (tree) =>
      branches.length > 0 &&
      branches.every((path) => {
        const item = tree.getItem(path)
        return item && 'isExpanded' in item && item.isExpanded()
      }),
  )

  useLayoutEffect(() => {
    liveRows.current = visible
    syncing.current = true
    model.resetPaths(treePaths, {
      initialExpandedPaths: branches.filter((path) => !path.includes('/')),
    })
    syncing.current = false
  }, [branches, model, treePaths, visible])

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

  useLayoutEffect(() => {
    if (searchOpen) searchInput.current?.focus()
  }, [searchOpen])

  function toggleSearch() {
    if (searchOpen) {
      model.closeSearch()
      searchButton.current?.focus()
    }
    useUi.getState().setOutlinerSearchOpen(!searchOpen)
  }

  const expansionLabel = allExpanded ? 'Collapse all' : 'Expand all'
  const crumbs = focused
    ? focused.path
        .split('/')
        .map((_, index, parts) => nodes.get(parts.slice(0, index + 1).join('/')))
    : []
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PanelHeader title="Outliner">
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label={expansionLabel}
            aria-expanded={allExpanded}
            aria-controls={hasCharacters ? 'outliner-tree' : undefined}
            title={expansionLabel}
            className="shell-icon"
            disabled={branches.length === 0}
            onClick={() => {
              model.closeSearch()
              model.resetPaths(treePaths, { initialExpandedPaths: allExpanded ? [] : branches })
            }}
          >
            <Icon name={allExpanded ? 'collapseAll' : 'expandAll'} size={16} />
          </button>
          <button
            ref={searchButton}
            type="button"
            aria-label="Search Outliner"
            aria-expanded={searchOpen}
            aria-controls={searchOpen ? 'outliner-joint-search' : undefined}
            title="Search Outliner"
            className="shell-icon"
            disabled={!hasCharacters}
            onClick={toggleSearch}
          >
            <Icon name="search" size={14} />
          </button>
        </div>
      </PanelHeader>
      {searchOpen && (
        <input
          id="outliner-joint-search"
          ref={searchInput}
          type="search"
          aria-label="Find a joint"
          placeholder="Find a joint"
          className="h-10 w-full shrink-0 rounded-none border-b border-line bg-transparent px-3 text-ink outline-none placeholder:text-faint focus-visible:border-accent"
          onChange={(event) => model.setSearch(event.currentTarget.value || null)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            toggleSearch()
          }}
        />
      )}
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
                  className="flex shrink-0 items-center gap-0.5 text-muted hover:text-ink"
                  aria-current={node.path === focus ? 'location' : undefined}
                  onClick={() => setFocus(node.path)}
                >
                  <Icon name="chevronRight" size={12} />
                  {node.name}
                </button>
              ),
          )}
        </nav>
      )}
      {hasCharacters && (
        <FileTree
          id="outliner-tree"
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
      )}
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
