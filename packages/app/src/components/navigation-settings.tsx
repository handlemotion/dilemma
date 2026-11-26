// Copyright (C) 2026 Glauber. Licensed AGPL-3.0-only.
// Ported from Enclose, apps/desktop/src/components/settings.tsx, its Navigation section
// (github.com/enclosedev/enclose at b2da08e). Changed for Dilemma: a popover in the
// toolbar on Base UI, instead of a settings page on shadcn/ui; only the rows this app
// has. See NOTICE.md.
import { Popover } from '@base-ui/react/popover'
import {
  PRESET_WORDS,
  PRESETS,
  presetOf,
  TURN_SPEED,
  ZOOM_SPEED,
  type Drag,
  type Preset,
} from '@dilemma/view'
import type { ReactNode } from 'react'
import { usePreferences } from '../preferences.ts'

/** How the view answers the hand: scrolling, speeds, what it turns about, mouse buttons. */
export function NavigationSettings() {
  return (
    <Popover.Root>
      <Popover.Trigger
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink data-popup-open:bg-raised data-popup-open:text-ink"
        title="Navigation"
        aria-label="Navigation"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          aria-hidden
        >
          <rect x="4" y="1.5" width="8" height="13" rx="4" />
          <path d="M8 1.5v4.5M4 6h8" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end" className="z-50">
          <Popover.Popup className="w-80 rounded-xl border border-line bg-panel p-3 text-[12px] text-ink shadow-2xl outline-none">
            <Rows />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function Rows() {
  const p = usePreferences()
  const preset = presetOf({ middle: p.middle, right: p.right, shift: p.shift, ctrl: p.ctrl })
  return (
    <div className="flex flex-col gap-3">
      <Section title="Mouse buttons">
        <Row title="Set up like">
          <Choice
            value={preset ?? ''}
            options={(Object.keys(PRESET_WORDS) as Preset[]).map((name) => ({
              value: name,
              label: PRESET_WORDS[name],
            }))}
            onChange={(name) => p.change(PRESETS[name as Preset])}
          />
        </Row>
        <Row title="Middle drag">
          <DragChoice value={p.middle} onChange={(middle) => p.change({ middle })} />
        </Row>
        <Row title="Right drag">
          <DragChoice value={p.right} onChange={(right) => p.change({ right })} />
        </Row>
        <p className="text-faint">
          Alt with left, middle or right drag turns, pans or zooms, as in Maya.
        </p>
      </Section>
      <Section title="Moving around">
        <Row title="Scrolling">
          <Choice
            value={p.scrolling}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'trackpad', label: 'Trackpad' },
              { value: 'wheel', label: 'Mouse' },
            ]}
            onChange={(scrolling) => p.change({ scrolling: scrolling as typeof p.scrolling })}
          />
        </Row>
        <Row title="Turn about">
          <Choice
            value={p.pivot}
            options={[
              { value: 'selection', label: 'Selection' },
              { value: 'view', label: 'View' },
            ]}
            onChange={(pivot) => p.change({ pivot: pivot as typeof p.pivot })}
          />
        </Row>
        <Row title="Turning speed">
          <Speed
            value={p.turnSpeed}
            range={TURN_SPEED}
            onChange={(turnSpeed) => p.change({ turnSpeed })}
          />
        </Row>
        <Row title="Zoom speed">
          <Speed
            value={p.zoomSpeed}
            range={ZOOM_SPEED}
            onChange={(zoomSpeed) => p.change({ zoomSpeed })}
          />
        </Row>
        <Row title="Reverse the wheel">
          <input
            type="checkbox"
            className="ml-auto accent-(--color-accent)"
            checked={p.wheelReversed}
            onChange={(e) => p.change({ wheelReversed: e.target.checked })}
          />
        </Row>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-semibold text-ink">{title}</h3>
      {children}
    </section>
  )
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_1.4fr] items-center gap-2">
      <span className="text-muted">{title}</span>
      <div className="flex">{children}</div>
    </div>
  )
}

function Choice({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange(value: string): void
}) {
  return (
    <div className="flex w-full rounded border border-line p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 truncate rounded-sm px-1.5 py-0.5 ${
            option.value === value ? 'bg-raised text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function DragChoice({ value, onChange }: { value: Drag; onChange(value: Drag): void }) {
  return (
    <Choice
      value={value}
      options={[
        { value: 'turn', label: 'Turn' },
        { value: 'pan', label: 'Pan' },
        { value: 'zoom', label: 'Zoom' },
      ]}
      onChange={(drag) => onChange(drag as Drag)}
    />
  )
}

function Speed({
  value,
  range,
  onChange,
}: {
  value: number
  range: { min: number; max: number }
  onChange(value: number): void
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-(--color-accent)"
      />
      <span className="w-10 text-right font-mono tabular-nums text-faint">
        {Math.round(value * 100)}%
      </span>
    </div>
  )
}
