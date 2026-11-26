/** Shared between main, preload and renderer. Types and constants only. */

export const ASSET_SCHEME = 'dilemma-asset'

export const Channels = {
  openCharacter: 'dilemma:open-character',
  allowFile: 'dilemma:allow-file',
  menu: 'dilemma:menu',
  openFile: 'dilemma:open-file',
} as const

export type MenuAction = 'open' | 'undo' | 'redo' | 'frame'

export interface OpenedFile {
  path: string
  /** A dilemma-asset:// URL the renderer can load, with sibling buffers and textures. */
  url: string
  name: string
}

export interface DilemmaBridge {
  platform: string
  openCharacter(): Promise<OpenedFile | null>
  /** For drag and drop: turns a dropped File into a loadable URL. */
  openDroppedFile(file: File): Promise<OpenedFile>
  onMenu(listener: (action: MenuAction) => void): () => void
  /** Files the main process asks the window to open, such as DILEMMA_OPEN at launch. */
  onOpenFile(listener: (file: OpenedFile) => void): () => void
}
