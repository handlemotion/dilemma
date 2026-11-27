import { bridge } from '../bridge.ts'

export function WindowControls() {
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
