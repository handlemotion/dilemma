import { Menu } from '@base-ui/react/menu'
import { Menubar } from '@base-ui/react/menubar'
import type { ReactNode } from 'react'
import type { MenuAction } from '../../electron/ipc.ts'
import { bridge } from '../bridge.ts'
import { useEditorState } from '../editor.ts'
import { useUi } from '../ui-store.ts'

const itemClass =
  'selection-tint relative isolate flex cursor-default items-center justify-between gap-6 rounded-sm px-2 py-1 text-ink outline-none data-highlighted:bg-control data-disabled:text-faint data-disabled:opacity-55'

export function AppMenuBar({ run }: { run(action: MenuAction): void }) {
  const { doc, playhead, selection, canUndo, canRedo } = useEditorState()
  const loading = useUi((s) => s.loading)
  const playing = useUi((s) => s.playing)
  const loop = useUi((s) => s.loopPlayback)
  const canDeleteKeys = useUi((state) =>
    state.timelineMode === 'curves' && state.curveTarget
      ? state.curveSelection.length > 0
      : state.selectedContact?.clipId === playhead.clipId ||
        Boolean(state.timelineRange && state.timelineRange.rowId !== 'preview'),
  )
  const hasCharacter = doc.characters.length > 0
  const fileDisabled = !bridge || Boolean(loading)
  const mac = bridge?.platform === 'darwin' || (!bridge && navigator.platform.startsWith('Mac'))
  const command = mac ? '⌘' : 'Ctrl+'
  const shifted = mac ? `⇧${command}` : 'Ctrl+Shift+'

  return (
    <Menubar
      data-animation-tools
      aria-label="Application menu"
      modal={false}
      className="flex h-full items-center gap-0.5"
    >
      <AppMenu title="File">
        <Command
          label="Import Character…"
          shortcut={bridge && `${command}O`}
          disabled={Boolean(loading)}
          onClick={() => run('open')}
        />
        <Command
          label="Open Project…"
          shortcut={bridge && `${shifted}O`}
          disabled={fileDisabled}
          onClick={() => run('openProject')}
        />
        <Menu.Separator className="my-1 border-t border-line" />
        <Command
          label="Save Project"
          shortcut={bridge && `${command}S`}
          disabled={fileDisabled}
          onClick={() => run('saveProject')}
        />
        <Command
          label="Save Project As…"
          shortcut={bridge && `${shifted}S`}
          disabled={fileDisabled}
          onClick={() => run('saveProjectAs')}
        />
        <Menu.Separator className="my-1 border-t border-line" />
        <Command
          label="Export GLB…"
          disabled={fileDisabled || !playhead.clipId}
          onClick={() => run('exportGlb')}
        />
        <Command
          label="Export FBX…"
          disabled={fileDisabled || !playhead.clipId}
          onClick={() => run('exportFbx')}
        />
      </AppMenu>
      <AppMenu title="Edit">
        <Command
          label="Undo"
          shortcut={`${command}Z`}
          disabled={!canUndo}
          onClick={() => run('undo')}
        />
        <Command
          label="Redo"
          shortcut={`${shifted}Z`}
          disabled={!canRedo}
          onClick={() => run('redo')}
        />
      </AppMenu>
      <AppMenu title="Timeline">
        <Command
          label={playing ? 'Pause' : 'Play'}
          shortcut="Space"
          onClick={() => run('togglePlayback')}
        />
        <Toggle label="Loop Playback" value={loop} onChange={() => run('toggleLoopPlayback')} />
        <Menu.Separator className="my-1 border-t border-line" />
        <Command label="New Clip" disabled={!hasCharacter} onClick={() => run('newClip')} />
        <Command
          label="Set Key"
          shortcut="S"
          disabled={selection.joints.length === 0}
          onClick={() => run('keySelection')}
        />
        <Command
          label="Delete Selected Keys"
          shortcut="Delete"
          disabled={!canDeleteKeys}
          onClick={() => run('deleteKeys')}
        />
      </AppMenu>
    </Menubar>
  )
}

function AppMenu({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Menu.Root>
      <Menu.Trigger className="inline-flex h-6 items-center rounded-md px-1 text-ink hover:bg-control data-popup-open:bg-control">
        {title}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={5} className="z-50">
          <Menu.Popup className="min-w-36 rounded-md border border-line bg-raised p-1 text-xs outline-none">
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

function Command({
  label,
  shortcut,
  disabled,
  onClick,
}: {
  label: string
  shortcut?: string | undefined
  disabled?: boolean
  onClick(): void
}) {
  return (
    <Menu.Item className={itemClass} disabled={disabled} onClick={onClick}>
      {label}
      {shortcut && (
        <kbd aria-hidden="true" className="text-xs text-faint">
          {shortcut}
        </kbd>
      )}
    </Menu.Item>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange(value: boolean): void
}) {
  return (
    <Menu.CheckboxItem
      className={itemClass}
      checked={value}
      data-tinted={value || undefined}
      onCheckedChange={onChange}
      closeOnClick
    >
      {label}
      {value && (
        <span aria-hidden="true" className="text-accent">
          ✓
        </span>
      )}
    </Menu.CheckboxItem>
  )
}
