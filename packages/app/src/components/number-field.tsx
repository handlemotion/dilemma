import { useState } from 'react'

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  digits,
  unit,
  appearance = 'footer',
  onCommit,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: 1 | 'any'
  digits?: number
  unit?: string
  appearance?: 'footer' | 'inspector'
  onCommit(value: number): void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const inspector = appearance === 'inspector'
  return (
    <label
      className={
        inspector
          ? 'flex h-6 min-w-0 items-center gap-1 rounded-md bg-control px-2 has-[:focus-visible]:inset-ring-2 has-[:focus-visible]:inset-ring-accent'
          : 'flex min-w-10 items-center justify-center gap-1 px-2 last:rounded-e-md hover:bg-control-hover has-[:focus-visible]:inset-ring-2 has-[:focus-visible]:inset-ring-accent'
      }
      title={label}
    >
      <input
        aria-label={label}
        type="number"
        required
        min={min}
        max={max}
        step={step}
        value={draft ?? value}
        className={`h-full outline-none select-text [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ${inspector ? 'w-full min-w-0 text-right tabular-nums' : 'text-center'}`}
        style={digits === undefined ? undefined : { width: `${Math.max(unit ? 2 : 3, digits)}ch` }}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => {
          const next = event.currentTarget.valueAsNumber
          if (event.currentTarget.validity.valid && Number.isFinite(next) && next !== value)
            onCommit(next)
          setDraft(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (event.currentTarget.reportValidity()) event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(null)
          }
        }}
      />
      {unit && (
        <span aria-hidden="true" className="text-muted">
          {unit}
        </span>
      )}
    </label>
  )
}
