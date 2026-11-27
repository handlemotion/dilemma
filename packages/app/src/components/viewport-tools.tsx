import { Menu } from '@base-ui/react/menu'
import { Fragment, type ReactNode } from 'react'
import { COMPOSITION_GRIDS, SHADING_MODES, useUi, type ViewportSettings } from '../ui-store.ts'

const glyphs = {
  frame: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5M9 9h6v6H9z',
  lock: 'M6 11h12v9H6zm2 0V8a4 4 0 0 1 8 0v3m-4 4v1',
  unlock: 'M6 11h12v9H6zm2 0V8a4 4 0 0 1 7.8-1.2M12 15v1',
  focus: 'M3 6h18v12H3zm4 3h10v6H7z',
  guides: 'M4 5h16v14H4zm5.33 0v14m5.34-14v14M4 9.67h16M4 14.33h16',
  shading: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-4.3-7.1L4.9 15.7m14-7.8L7.9 18.9m12-5.4-6.4 6.4',
  check: 'm5 12 4 4L19 6',
}

const toolClass =
  'selection-tint relative isolate grid size-[22px] shrink-0 place-items-center rounded-sm text-muted enabled:hover:bg-control enabled:hover:text-ink disabled:text-faint disabled:opacity-50'

const menuItemClass =
  'selection-tint relative isolate flex cursor-default items-center gap-1.5 rounded-sm px-2 py-1 text-ink outline-none data-highlighted:bg-control'

export function ViewportToolbar({ onFrame }: { onFrame(): void }) {
  const settings = useUi((s) => s.viewportSettings)
  const setSettings = useUi((s) => s.setViewportSettings)
  return (
    <div
      data-animation-tools
      role="toolbar"
      aria-label="Viewport display"
      className="flex h-8 shrink-0 items-center gap-0.5 border-b border-line bg-panel px-2"
    >
      <button
        type="button"
        className={toolClass}
        aria-label="Frame selection"
        aria-keyshortcuts="F"
        title="Frame selection (F)"
        disabled={settings.cameraLocked}
        onClick={onFrame}
      >
        <Glyph name="frame" />
      </button>
      <button
        type="button"
        className={toolClass}
        aria-label="Lock camera"
        aria-pressed={settings.cameraLocked}
        title={settings.cameraLocked ? 'Unlock camera' : 'Lock camera'}
        onClick={() => setSettings({ cameraLocked: !settings.cameraLocked })}
      >
        <Glyph name={settings.cameraLocked ? 'lock' : 'unlock'} />
      </button>
      <button
        type="button"
        className={toolClass}
        aria-label="Camera focus"
        aria-pressed={settings.cameraFrame}
        title="Camera focus (16:9)"
        onClick={() => setSettings({ cameraFrame: !settings.cameraFrame })}
      >
        <Glyph name="focus" />
      </button>
      <ViewportMenu
        label="Viewport guides"
        icon="guides"
        active={settings.compositionGrid !== 'none'}
      >
        <Menu.CheckboxItem
          className={menuItemClass}
          checked={settings.floorGrid}
          data-tinted={settings.floorGrid || undefined}
          onCheckedChange={(floorGrid) => setSettings({ floorGrid })}
        >
          <Checkmark checked={settings.floorGrid} />
          Floor grid
        </Menu.CheckboxItem>
        <Menu.Separator className="my-1 border-t border-line" />
        <Menu.RadioGroup
          aria-label="Composition grid"
          value={settings.compositionGrid}
          onValueChange={(compositionGrid: ViewportSettings['compositionGrid']) =>
            setSettings({ compositionGrid })
          }
        >
          {COMPOSITION_GRIDS.map(({ value, label }) => (
            <Menu.RadioItem
              key={value}
              value={value}
              className={menuItemClass}
              data-tinted={settings.compositionGrid === value || undefined}
              closeOnClick={false}
            >
              <Checkmark checked={settings.compositionGrid === value} />
              {value === 'none' ? 'No composition grid' : label}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </ViewportMenu>
      <ViewportMenu label="Shading mode" icon="shading" active={settings.shading !== 'materials'}>
        <Menu.RadioGroup
          aria-label="Shading mode"
          value={settings.shading}
          onValueChange={(shading: ViewportSettings['shading']) => setSettings({ shading })}
        >
          {SHADING_MODES.map(({ value, label }) => (
            <Menu.RadioItem
              key={value}
              value={value}
              className={menuItemClass}
              data-tinted={settings.shading === value || undefined}
              closeOnClick
            >
              <Checkmark checked={settings.shading === value} />
              {label}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </ViewportMenu>
    </div>
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
  icon: 'guides' | 'shading'
  active: boolean
  children: ReactNode
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        className={toolClass}
        aria-label={label}
        title={label}
        data-tinted={active || undefined}
      >
        <Glyph name={icon} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={5} className="z-50">
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

function Glyph({ name, size = 14 }: { name: keyof typeof glyphs; size?: number }) {
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
