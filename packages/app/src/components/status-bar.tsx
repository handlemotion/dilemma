import { Select } from '@base-ui/react/select'
import { Icon } from '../icons/central.tsx'
import { PLAYBACK_SPEEDS, useUi } from '../ui-store.ts'

const speedItems = PLAYBACK_SPEEDS.map((speed) => ({ value: speed, label: `${speed}×` }))

export function StatusBar() {
  const error = useUi((s) => s.error)
  const speed = useUi((s) => s.playbackSpeed)

  return (
    <footer className="col-span-full flex min-w-0 items-center gap-4 border-t border-line bg-panel px-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {error && (
          <>
            <p role="alert" className="truncate text-red-800 select-text" title={error}>
              {error}
            </p>
            <button
              type="button"
              className="shrink-0 rounded px-1 py-0.5 text-red-800 underline hover:bg-red-50"
              onClick={() => useUi.getState().setError(null)}
            >
              Dismiss
            </button>
          </>
        )}
      </div>
      <Select.Root
        items={speedItems}
        value={speed}
        onValueChange={(value) => {
          if (value !== null) useUi.getState().setPlaybackSpeed(value)
        }}
      >
        <Select.Trigger
          aria-label="Playback speed"
          className="flex h-[26px] shrink-0 items-stretch rounded-md bg-control text-ink hover:bg-control-hover"
        >
          <span className="flex items-center px-2 text-muted" aria-hidden="true">
            Playback speed
          </span>
          <span className="flex min-w-16 items-center justify-between gap-2 border-l border-control-divider px-2">
            <Select.Value className="tabular-nums" />
            <Select.Icon className="text-faint" aria-hidden="true">
              <Icon name="chevronDown" size={12} />
            </Select.Icon>
          </span>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            align="end"
            side="top"
            sideOffset={4}
            alignItemWithTrigger={false}
            className="z-50"
          >
            <Select.Popup className="min-w-16 rounded border border-line bg-raised py-1 text-[12px] text-ink shadow-xl">
              {speedItems.map(({ value, label }) => (
                <Select.Item
                  key={value}
                  value={value}
                  className="selection-tint relative isolate cursor-default px-2 py-1 tabular-nums outline-none data-highlighted:bg-line data-selected:font-semibold"
                >
                  <Select.ItemText>{label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </footer>
  )
}
