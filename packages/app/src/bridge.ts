import type { DilemmaBridge } from '../electron/ipc.ts'

declare global {
  interface Window {
    dilemma?: DilemmaBridge
  }
}

/** The Electron bridge. Undefined when the renderer runs in a plain browser tab. */
export const bridge = window.dilemma
