import type { ReactNode } from 'react'
import { bridge } from '../bridge.ts'
import { useUi } from '../ui-store.ts'

export function ProjectTitleBar({ children }: { children?: ReactNode }) {
  const path = useUi((s) => s.projectPath)
  const dirty = useUi((s) => s.projectDirty)
  const title = path?.split(/[/\\]/).at(-1) || 'Untitled'

  return (
    <header className="drag-region relative col-span-full row-start-1 flex h-8 items-center justify-center bg-shell px-20 text-xs text-muted">
      <div className="absolute inset-y-0 left-0 flex items-center">
        <WindowControls />
      </div>
      <div className="flex min-w-0 items-center gap-1.5" title={path ?? title}>
        <span className="truncate font-medium">{title}</span>
        <span
          className={`size-1.5 shrink-0 rounded-full ${dirty ? 'bg-accent' : 'bg-faint'}`}
          role="img"
          aria-label={dirty ? 'Unsaved changes' : 'No unsaved changes'}
          title={dirty ? 'Unsaved changes' : 'No unsaved changes'}
        />
      </div>
      {children && <div className="absolute inset-y-0 right-1 flex items-center">{children}</div>}
    </header>
  )
}

function WindowControls() {
  if (bridge) {
    return bridge.platform === 'darwin' ? (
      <div aria-hidden="true" className="w-[72px] shrink-0" />
    ) : null
  }

  return (
    <div aria-hidden="true" className="flex shrink-0 items-center gap-2 ps-3 pe-2">
      <span className="size-3 rounded-full bg-[#ff5f57]" />
      <span className="size-3 rounded-full bg-[#febc2e]" />
      <span className="size-3 rounded-full bg-[#28c840]" />
    </div>
  )
}
