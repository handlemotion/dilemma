import { Menu } from '@base-ui/react/menu'
import { Menubar } from '@base-ui/react/menubar'
import type { CameraDrag } from '@dilemma/view'
import { Fragment, useRef, type ReactNode } from 'react'
import { COMPOSITION_GRIDS, SHADING_MODES, useUi, type ViewportSettings } from '../ui-store.ts'
import { ViewportGrip } from './panel-header.tsx'
import { ViewportPoseTools, ViewportTransformTools } from './transform-tools.tsx'

const glyphs = {
  pan: 'M9 12V6a1.5 1.5 0 0 1 3 0v5m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-1V6a1.5 1.5 0 0 1 3 0v6m0-1a1.5 1.5 0 0 1 3 0v1a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.5-2L4.3 14A1.6 1.6 0 0 1 6.6 12L9 14',
  orbit:
    'M19.9 9.3c1.4 1.4 1.9 2.9 1.2 4.1C20 15.5 15 16.8 10 16.2S1.8 13.4 3 11.2c.4-.8 1.3-1.4 2.5-1.9M17 12a5 5 0 1 0-10 0 5 5 0 0 0 10 0Zm-3 7 3-3-3-3',
  frame: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5M9 9h6v6H9z',
  lock: 'M6 11h12v9H6zm2 0V8a4 4 0 0 1 8 0v3m-4 4v1',
  unlock: 'M6 11h12v9H6zm2 0V8a4 4 0 0 1 7.8-1.2M12 15v1',
  focus: 'M3 6h18v12H3zm4 3h10v6H7z',
  guides: 'M4 5h16v14H4zm5.33 0v14m5.34-14v14M4 9.67h16M4 14.33h16',
  shading: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-4.3-7.1L4.9 15.7m14-7.8L7.9 18.9m12-5.4-6.4 6.4',
  check: 'm5 12 4 4L19 6',
}

const cameraActionClass = 'shell-icon shell-toggle size-6 rounded-sm disabled:opacity-50'

const menuItemClass =
  'selection-tint relative isolate flex cursor-default items-center gap-1.5 rounded-sm px-2 py-1 text-ink outline-none data-highlighted:bg-control data-disabled:opacity-50'

export function WorkspaceToolRail() {
  return (
    <div
      data-animation-tools
      role="toolbar"
      aria-label="Workspace tools"
      aria-orientation="vertical"
      className="col-start-1 row-start-3 flex min-h-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-shell p-1 [scrollbar-width:none]"
    >
      <ViewportTransformTools />
      <span aria-hidden="true" className="my-1 w-4 shrink-0 border-t border-line" />
      <ViewportPoseTools />
    </div>
  )
}

type CameraMove = (deltaX: number, deltaY: number) => void

interface ViewportMenuProps {
  onFrame(): void
  beginCameraDrag(action: CameraDrag): CameraMove | null
}

const cameraArrowKeys: Partial<Record<string, [number, number]>> = {
  ArrowLeft: [-12, 0],
  ArrowRight: [12, 0],
  ArrowUp: [0, -12],
  ArrowDown: [0, 12],
}

function CameraDragButton({
  action,
  label,
  disabled,
  beginCameraDrag,
}: {
  action: CameraDrag
  label: string
  disabled: boolean
  beginCameraDrag: ViewportMenuProps['beginCameraDrag']
}) {
  const drag = useRef<{ pointer: number; x: number; y: number; move: CameraMove } | null>(null)
  return (
    <button
      type="button"
      className={`${cameraActionClass} touch-none enabled:cursor-grab enabled:active:cursor-grabbing`}
      aria-label={label}
      aria-description="Drag this button, or use the arrow keys when focused."
      title={`Drag to ${label.toLowerCase()}`}
      disabled={disabled}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || drag.current) return
        const move = beginCameraDrag(action)
        if (!move) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, move }
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current || current.pointer !== event.pointerId) return
        current.move(event.clientX - current.x, event.clientY - current.y)
        current.x = event.clientX
        current.y = event.clientY
      }}
      onLostPointerCapture={(event) => {
        if (drag.current?.pointer === event.pointerId) drag.current = null
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && drag.current) {
          event.stopPropagation()
          event.currentTarget.releasePointerCapture(drag.current.pointer)
          drag.current = null
          return
        }
        const delta = cameraArrowKeys[event.key]
        if (!delta || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
        event.preventDefault()
        event.stopPropagation()
        beginCameraDrag(action)?.(...delta)
      }}
    >
      <Glyph name={action === 'pan' ? 'pan' : 'orbit'} />
    </button>
  )
}

function ViewportActions({ onFrame, beginCameraDrag }: ViewportMenuProps) {
  const settings = useUi((s) => s.viewportSettings)
  const setSettings = useUi((s) => s.setViewportSettings)
  return (
    <div role="toolbar" aria-label="Viewport shortcuts" className="ms-auto flex shrink-0 gap-1">
      <CameraDragButton
        action="pan"
        label="Pan camera"
        disabled={settings.cameraLocked}
        beginCameraDrag={beginCameraDrag}
      />
      <CameraDragButton
        action="turn"
        label="Orbit camera"
        disabled={settings.cameraLocked}
        beginCameraDrag={beginCameraDrag}
      />
      <button
        type="button"
        className={cameraActionClass}
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
        className={cameraActionClass}
        aria-label="Lock camera"
        aria-pressed={settings.cameraLocked}
        title={settings.cameraLocked ? 'Unlock camera' : 'Lock camera'}
        onClick={() => setSettings({ cameraLocked: !settings.cameraLocked })}
      >
        <Glyph name={settings.cameraLocked ? 'lock' : 'unlock'} />
      </button>
      <button
        type="button"
        className={cameraActionClass}
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
        <GuideItems />
      </ViewportMenu>
      <ViewportMenu label="Shading mode" icon="shading" active={settings.shading !== 'materials'}>
        <ShadingItems />
      </ViewportMenu>
    </div>
  )
}

export function ViewportMenuBar({ onFrame, beginCameraDrag }: ViewportMenuProps) {
  const { cameraLocked, cameraFrame } = useUi((s) => s.viewportSettings)
  const setSettings = useUi((s) => s.setViewportSettings)
  return (
    <div data-animation-tools className="workspace-header">
      <ViewportGrip />
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
      <ViewportActions onFrame={onFrame} beginCameraDrag={beginCameraDrag} />
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
  const { floorGrid, compositionGrid, skeletonInPose } = useUi((s) => s.viewportSettings)
  const setSettings = useUi((s) => s.setViewportSettings)
  return (
    <>
      <ViewportToggle
        label="Floor grid"
        value={floorGrid}
        onChange={(value) => setSettings({ floorGrid: value })}
      />
      <ViewportToggle
        label="Skeleton in Pose Mode"
        value={skeletonInPose}
        onChange={(value) => setSettings({ skeletonInPose: value })}
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
        data-icon-active={active || undefined}
      >
        {icon ? <Glyph name={icon} /> : label}
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

function Glyph({ name, size = 16 }: { name: keyof typeof glyphs; size?: number }) {
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
