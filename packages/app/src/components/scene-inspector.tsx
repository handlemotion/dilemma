import { Select } from '@base-ui/react/select'
import { setSceneTiming, type SceneTiming } from '@dilemma/core'
import type { ReactNode } from 'react'
import { editor } from '../editor.ts'
import { Icon } from '../icons/central.tsx'
import { COMPOSITION_GRIDS, SHADING_MODES, useUi } from '../ui-store.ts'
import { InspectorSection } from './inspector-section.tsx'
import { NumberField } from './number-field.tsx'

function commitTiming(field: keyof SceneTiming, value: number) {
  const ui = useUi.getState()
  try {
    editor.run(setSceneTiming({ [field]: value }))
    if (!editor.getState().playhead.clipId) ui.setPlaying(false)
  } catch (error) {
    ui.setError(error instanceof Error ? error.message : String(error))
  }
}

export function SceneInspector({ timing }: { timing: SceneTiming }) {
  const { fps, start, end } = timing
  const viewport = useUi((state) => state.viewportSettings)
  const setViewport = useUi((state) => state.setViewportSettings)

  return (
    <InspectorSection id="scene" title="Scene Settings" defaultExpanded>
      <SettingsGroup title="Animation Defaults">
        <Setting label="Frame rate">
          <NumberField
            appearance="inspector"
            label="Scene frame rate"
            value={fps}
            min={0}
            step="any"
            unit="fps"
            onCommit={(value) => commitTiming('fps', value)}
          />
        </Setting>
        <Setting label="Start frame">
          <NumberField
            appearance="inspector"
            label="Scene start frame"
            value={start}
            min={-0x80000000}
            max={end}
            onCommit={(value) => commitTiming('start', value)}
          />
        </Setting>
        <Setting label="End frame">
          <NumberField
            appearance="inspector"
            label="Scene end frame"
            value={end}
            min={start}
            max={0x7fffffff}
            onCommit={(value) => commitTiming('end', value)}
          />
        </Setting>
      </SettingsGroup>
      <SettingsGroup title="Viewport">
        <Setting label="Shading">
          <SettingSelect
            label="Shading"
            value={viewport.shading}
            items={SHADING_MODES}
            onChange={(shading) => setViewport({ shading })}
          />
        </Setting>
        <SettingSwitch
          label="Floor grid"
          checked={viewport.floorGrid}
          onChange={(floorGrid) => setViewport({ floorGrid })}
        />
        <SettingSwitch
          label="Camera frame"
          checked={viewport.cameraFrame}
          onChange={(cameraFrame) => setViewport({ cameraFrame })}
        />
        <Setting label="Composition grid">
          <SettingSelect
            label="Composition grid"
            value={viewport.compositionGrid}
            items={COMPOSITION_GRIDS}
            onChange={(compositionGrid) => setViewport({ compositionGrid })}
          />
        </Setting>
        <SettingSwitch
          label="Lock camera"
          checked={viewport.cameraLocked}
          onChange={(cameraLocked) => setViewport({ cameraLocked })}
        />
      </SettingsGroup>
    </InspectorSection>
  )
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="border-t border-line p-1">
      <h3 className="mb-1.5 text-xs leading-5 font-medium text-muted">{title}</h3>
      <div className="grid gap-1">{children}</div>
    </section>
  )
}

const settingRow = 'grid min-h-6 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2'

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={settingRow}>
      <span aria-hidden="true">{label}</span>
      {children}
    </div>
  )
}

function SettingSwitch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange(checked: boolean): void
}) {
  return (
    <label className={`${settingRow} cursor-pointer`}>
      <span>{label}</span>
      <input
        className="peer sr-only"
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span
        aria-hidden="true"
        className="col-start-2 row-start-1 flex h-4 w-7 items-center justify-self-end rounded-full bg-control-divider p-0.5 text-faint peer-checked:justify-end peer-checked:bg-primary peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      >
        <span className="size-3 rounded-full bg-current shadow-xs" />
      </span>
    </label>
  )
}

function SettingSelect<T extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string
  value: T
  items: readonly { value: T; label: string }[]
  onChange(value: T): void
}) {
  return (
    <Select.Root
      items={items}
      value={value}
      onValueChange={(next) => next !== null && onChange(next)}
    >
      <Select.Trigger
        aria-label={label}
        className="flex h-6 min-w-0 items-center justify-between gap-1 rounded-md bg-raised px-2 text-left hover:bg-control-hover"
      >
        <Select.Value className="truncate" />
        <Select.Icon className="shrink-0 text-faint" aria-hidden="true">
          <Icon name="chevronDown" size={12} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="end" sideOffset={4} alignItemWithTrigger={false} className="z-50">
          <Select.Popup className="min-w-[var(--anchor-width)] rounded-md border border-line bg-raised p-1 text-xs shadow-xl">
            {items.map((item) => (
              <Select.Item
                key={item.value}
                value={item.value}
                data-tinted={item.value === value || undefined}
                className="selection-tint relative isolate cursor-default rounded-sm px-2 py-1 outline-none data-highlighted:bg-control"
              >
                <Select.ItemText>{item.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
