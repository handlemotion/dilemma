import { Select } from '@base-ui/react/select'
import { Icon } from '../icons/central.tsx'

export interface InspectorSelectItem<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

export function InspectorSelect<T extends string>({
  id,
  label,
  value,
  items,
  rigGuide = false,
  onChange,
  onFocus,
}: {
  id?: string
  label: string
  value: T
  items: readonly InspectorSelectItem<T>[]
  rigGuide?: boolean
  onChange(value: T): void
  onFocus?(): void
}) {
  return (
    <Select.Root
      items={items}
      value={value}
      onValueChange={(next) => next !== null && onChange(next)}
    >
      <Select.Trigger
        id={id}
        aria-label={label}
        title={items.find((item) => item.value === value)?.label}
        className={
          rigGuide
            ? 'shell-field h-7 min-w-0 items-center justify-between rounded-e-none text-left hover:bg-control'
            : 'shell-field h-6 min-w-0 items-center justify-between text-left hover:bg-control'
        }
        onFocus={onFocus}
      >
        <Select.Value className="min-w-0 flex-1 truncate px-2" />
        <Select.Icon
          className={`grid shrink-0 place-items-center self-stretch text-faint ${rigGuide ? 'w-5 border-s-0' : 'w-7'}`}
          aria-hidden="true"
        >
          <Icon name="chevronDown" size={12} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          align="start"
          sideOffset={4}
          alignItemWithTrigger={false}
          className="z-50"
        >
          <Select.Popup
            className={`rounded-md border border-line bg-raised text-xs text-ink ${rigGuide ? 'rig-guide-palette w-max min-w-[min(var(--anchor-width),var(--available-width))] max-w-[min(22rem,var(--available-width))]' : 'w-[var(--anchor-width)] min-w-28 max-w-[var(--available-width)] shadow-xl'}`}
          >
            <Select.List className="max-h-[min(16rem,var(--available-height))] overflow-y-auto overscroll-contain p-1">
              {items.map((item) => (
                <Select.Item
                  key={item.value}
                  value={item.value}
                  disabled={item.disabled ?? false}
                  title={item.label}
                  data-tinted={item.value === value || undefined}
                  className="selection-tint relative isolate flex min-h-6 min-w-0 cursor-default items-center rounded-sm px-2 py-1 outline-none data-disabled:text-faint data-highlighted:bg-control"
                >
                  <Select.ItemText className="min-w-0 truncate">{item.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
