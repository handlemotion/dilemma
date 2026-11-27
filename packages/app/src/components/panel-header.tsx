import type { ReactNode } from 'react'

export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 ps-3 pe-2">
      <h2 className="min-w-0 truncate font-normal text-ink">{title}</h2>
      {children}
    </div>
  )
}
