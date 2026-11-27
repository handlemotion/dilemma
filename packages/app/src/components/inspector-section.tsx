import { useId, type ReactNode } from 'react'
import { Icon } from '../icons/central.tsx'
import { useUi } from '../ui-store.ts'

export function InspectorSection({
  id,
  title,
  summary,
  defaultExpanded,
  children,
}: {
  id: string
  title: string
  summary?: string | undefined
  defaultExpanded: boolean
  children: ReactNode
}) {
  const railId = useId()
  const propertiesId = useId()
  const expanded = useUi((state) => state.inspectorExpansion[id] ?? defaultExpanded)
  return (
    <article aria-labelledby={railId} className="border-b border-line">
      <h2>
        <button
          id={railId}
          type="button"
          aria-expanded={expanded}
          aria-controls={propertiesId}
          className="group flex h-9 w-full items-center gap-2 px-3 text-left hover:bg-control"
          onClick={() => useUi.getState().setInspectorExpanded(id, !expanded)}
        >
          <Icon
            name="chevronRight"
            size={14}
            className="shrink-0 text-muted group-aria-expanded:rotate-90"
          />
          <span className="min-w-0 flex-1 truncate font-semibold" title={title}>
            {title}
          </span>
          {summary && (
            <span className="max-w-2/5 truncate text-[11px] text-muted" title={summary}>
              {summary}
            </span>
          )}
        </button>
      </h2>
      <div id={propertiesId} hidden={!expanded}>
        {expanded && children}
      </div>
    </article>
  )
}
