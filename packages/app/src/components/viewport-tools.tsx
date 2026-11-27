import { Menu } from '@base-ui/react/menu'
import { Menubar } from '@base-ui/react/menubar'
import { Fragment, type ReactNode } from 'react'
import { dockSide } from '../dock-layout.ts'
import { COMPOSITION_GRIDS, SHADING_MODES, useUi, type ViewportSettings } from '../ui-store.ts'
import { LimbIkTool } from './transform-tools.tsx'

const glyphs = {
  outliner: 'M5 5h4v4H5zm10 5h4v4h-4zm0 7h4v4h-4zM7 9v10h8m-8-7h8',
  frame: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5M9 9h6v6H9z',
  lock: 'M6 11h12v9H6zm2 0V8a4 4 0 0 1 8 0v3m-4 4v1',
  unlock: 'M6 11h12v9H6zm2 0V8a4 4 0 0 1 7.8-1.2M12 15v1',
  focus: 'M3 6h18v12H3zm4 3h10v6H7z',
  guides: 'M4 5h16v14H4zm5.33 0v14m5.34-14v14M4 9.67h16M4 14.33h16',
  shading: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-4.3-7.1L4.9 15.7m14-7.8L7.9 18.9m12-5.4-6.4 6.4',
  check: 'm5 12 4 4L19 6',
}

const cameraActionClass =
  'selection-tint relative isolate grid size-6 shrink-0 place-items-center rounded-sm text-muted enabled:hover:bg-control enabled:hover:text-ink disabled:text-faint disabled:opacity-50'

const menuItemClass =
  'selection-tint relative isolate flex cursor-default items-center gap-1.5 rounded-sm px-2 py-1 text-ink outline-none data-highlighted:bg-control data-disabled:opacity-50'

export function WorkspaceToolRail() {
  const outlinerVisible = useUi(
    (s) => s.outlinerOpen && s.dockLayout[dockSide(s.dockLayout, 'outliner')].active === 'outliner',
  )
  return (
    <div
      data-animation-tools
      role="toolbar"
      aria-label="Workspace tools"
      aria-orientation="vertical"
      className="col-start-1 row-start-3 flex min-h-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-shell p-1 [scrollbar-width:none]"
    >
      <button
        type="button"
        className="shell-icon shell-rail-icon selection-tint relative isolate"
        aria-label="Outliner"
        aria-expanded={outlinerVisible}
        aria-controls="outliner-panel"
        title={outlinerVisible ? 'Hide Outliner' : 'Show Outliner'}
        data-tinted={outlinerVisible || undefined}
        onClick={() => useUi.getState().toggleOutliner()}
      >
        <Glyph name="outliner" />
      </button>
      <span aria-hidden="true" className="my-1 w-4 shrink-0 border-t border-line" />
      <LimbIkTool />
    </div>
  )
}

function ViewportActions({ onFrame }: { onFrame(): void }) {
  const settings = useUi((s) => s.viewportSettings)
  const setSettings = useUi((s) => s.setViewportSettings)
  return (
    <div role="toolbar" aria-label="Viewport shortcuts" className="ms-auto flex shrink-0 gap-1">
      <button
        type="button"
        className={cameraActionClass}
        aria-label="Frame selection"
        aria-keyshortcuts="F"
        title="Frame selection (F)"
        disabled={settings.cameraLocked}
        onClick={onFrame}
      >
        <Glyph name="frame" size={16} />
      </button>
      <button
        type="button"
        className={cameraActionClass}
        aria-label="Lock camera"
        aria-pressed={settings.cameraLocked}
        title={settings.cameraLocked ? 'Unlock camera' : 'Lock camera'}
        onClick={() => setSettings({ cameraLocked: !settings.cameraLocked })}
      >
        <Glyph name={settings.cameraLocked ? 'lock' : 'unlock'} size={16} />
      </button>
      <button
        type="button"
        className={cameraActionClass}
        aria-label="Camera focus"
        aria-pressed={settings.cameraFrame}
        title="Camera focus (16:9)"
        onClick={() => setSettings({ cameraFrame: !settings.cameraFrame })}
      >
        <Glyph name="focus" size={16} />
      </button>
      <ViewportMenu
        label="Viewport guides"
        icon="guides"
        active={settings.compositionGrid !== 'none'}
      >
        <GuideItems />
      </ViewportMenu>
      <ViewportMenu label="Shading mode" icon="shading" active={settings.shading !== 'materials'}>
        <ShadingItems />
      </ViewportMenu>
    </div>
  )
}

export function ViewportMenuBar({ onFrame }: { onFrame(): void }) {
  const { cameraLocked, cameraFrame } = useUi((s) => s.viewportSettings)
  const setSettings = useUi((s) => s.setViewportSettings)
  return (
    <div
      data-animation-tools
      className="flex h-7 shrink-0 items-center gap-1 border-b border-line bg-panel px-1"
    >
      <Menubar
        aria-label="Viewport menu"
        modal={false}
        className="flex min-w-0 items-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:none]"
      >
        <ViewportMenu label="View">
          <Menu.Item className={menuItemClass} disabled={cameraLocked} onClick={onFrame}>
            Frame Selection <kbd className="ms-auto ps-4 text-faint">F</kbd>
          </Menu.Item>
        </ViewportMenu>
        <ViewportMenu label="Camera">
          <ViewportToggle
            label="Lock Camera"
            value={cameraLocked}
            onChange={(value) => setSettings({ cameraLocked: value })}
          />
          <ViewportToggle
            label="Camera Focus"
            value={cameraFrame}
            onChange={(value) => setSettings({ cameraFrame: value })}
          />
        </ViewportMenu>
        <ViewportMenu label="Display">
          <GuideItems />
        </ViewportMenu>
        <ViewportMenu label="Shading">
          <ShadingItems />
        </ViewportMenu>
      </Menubar>
      <ViewportActions onFrame={onFrame} />
    </div>
  )
}

function ViewportToggle({
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
      className={menuItemClass}
      checked={value}
      data-tinted={value || undefined}
      onCheckedChange={onChange}
      closeOnClick
    >
      <Checkmark checked={value} />
      {label}
    </Menu.CheckboxItem>
  )
}

function GuideItems() {
  const { floorGrid, compositionGrid } = useUi((s) => s.viewportSettings)
  const setSettings = useUi((s) => s.setViewportSettings)
  return (
    <>
      <ViewportToggle
        label="Floor grid"
        value={floorGrid}
        onChange={(value) => setSettings({ floorGrid: value })}
      />
      <Menu.Separator className="my-1 border-t border-line" />
      <Menu.RadioGroup
        aria-label="Composition grid"
        value={compositionGrid}
        onValueChange={(value: ViewportSettings['compositionGrid']) =>
          setSettings({ compositionGrid: value })
        }
      >
        {COMPOSITION_GRIDS.map(({ value, label }) => (
          <Menu.RadioItem
            key={value}
            value={value}
            className={menuItemClass}
            data-tinted={compositionGrid === value || undefined}
            closeOnClick={false}
          >
            <Checkmark checked={compositionGrid === value} />
            {value === 'none' ? 'No composition grid' : label}
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </>
  )
}

function ShadingItems() {
  const shading = useUi((s) => s.viewportSettings.shading)
  const setSettings = useUi((s) => s.setViewportSettings)
  return (
    <Menu.RadioGroup
      aria-label="Shading mode"
      value={shading}
      onValueChange={(value: ViewportSettings['shading']) => setSettings({ shading: value })}
    >
      {SHADING_MODES.map(({ value, label }) => (
        <Menu.RadioItem
          key={value}
          value={value}
          className={menuItemClass}
          data-tinted={shading === value || undefined}
          closeOnClick
        >
          <Checkmark checked={shading === value} />
          {label}
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  )
}

export function ViewportGuides() {
  const cameraFrame = useUi((s) => s.viewportSettings.cameraFrame)
  const compositionGrid = useUi((s) => s.viewportSettings.compositionGrid)
  if (!cameraFrame && compositionGrid === 'none') return null

  const divisions =
    compositionGrid === 'thirds'
      ? [100 / 3, 200 / 3]
      : compositionGrid === 'golden'
        ? [38.2, 61.8]
        : []
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden [container-type:size]"
    >
      <div
        className={
          cameraFrame
            ? 'relative aspect-video outline outline-ink/50 shadow-[0_0_0_100vmax_rgb(0_0_0/0.12)]'
            : 'relative size-full'
        }
        style={
          cameraFrame
            ? { width: 'min(86cqw, 86cqh * 16 / 9, (100cqh - 56px) * 16 / 9)' }
            : undefined
        }
      >
        {divisions.map((division) => (
          <Fragment key={division}>
            <span className="absolute inset-y-0 w-px bg-ink/35" style={{ left: `${division}%` }} />
            <span className="absolute inset-x-0 h-px bg-ink/35" style={{ top: `${division}%` }} />
          </Fragment>
        ))}
        {cameraFrame && (
          <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-full bg-ink px-1.5 text-[10px] leading-4 font-medium text-white tabular-nums">
            16:9
          </span>
        )}
      </div>
    </div>
  )
}

function ViewportMenu({
  label,
  icon,
  active,
  children,
}: {
  label: string
  icon?: 'guides' | 'shading'
  active?: boolean
  children: ReactNode
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        className={
          icon
            ? cameraActionClass
            : 'h-5 shrink-0 rounded-sm px-1 text-ink hover:bg-control data-popup-open:bg-control'
        }
        aria-label={label}
        title={label}
        data-tinted={active || undefined}
      >
        {icon ? <Glyph name={icon} size={16} /> : label}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align={icon ? 'end' : 'start'}
          sideOffset={4}
          className="z-50"
        >
          <Menu.Popup className="grid min-w-32 rounded-md border border-line bg-raised p-1 text-xs outline-none">
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

function Checkmark({ checked }: { checked: boolean }) {
  return (
    <span className="grid size-3 shrink-0 place-items-center text-accent">
      {checked && <Glyph name="check" size={12} />}
    </span>
  )
}

function Glyph({ name, size = 20 }: { name: keyof typeof glyphs; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={glyphs[name]} />
    </svg>
  )
}
