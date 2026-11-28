import { setSceneTiming, type SceneTiming } from '@dilemma/core'
import type { ReactNode } from 'react'
import { editor } from '../editor.ts'
import { COMPOSITION_GRIDS, SHADING_MODES, useUi } from '../ui-store.ts'
import { InspectorSection } from './inspector-section.tsx'
import { InspectorSelect } from './inspector-select.tsx'
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
          <InspectorSelect
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
          <InspectorSelect
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
