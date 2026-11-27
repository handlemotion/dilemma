/** Shared between main, preload and renderer. Types and constants only. */
import type { DilemmaDocument } from '@dilemma/core'

export const ASSET_SCHEME = 'dilemma-asset'
export const FBX_BAKE_FPS = 30

export const Channels = {
  openCharacter: 'dilemma:open-character',
  allowFile: 'dilemma:allow-file',
  openProject: 'dilemma:open-project',
  saveProject: 'dilemma:save-project',
  exportGlb: 'dilemma:export-glb',
  exportFbx: 'dilemma:export-fbx',
  menu: 'dilemma:menu',
  openFile: 'dilemma:open-file',
} as const

export type MenuAction =
  | 'open'
  | 'openProject'
  | 'saveProject'
  | 'saveProjectAs'
  | 'exportGlb'
  | 'exportFbx'
  | 'undo'
  | 'redo'
  | 'frame'

export interface OpenedFile {
  path: string
  /** A dilemma-asset:// URL the renderer can load, with sibling buffers and textures. */
  url: string
  name: string
}

export interface OpenedProject {
  path: string
  doc: DilemmaDocument
  sources: OpenedFile[]
}

export interface DilemmaBridge {
  platform: string
  openCharacter(): Promise<OpenedFile | null>
  /** For drag and drop: turns a dropped File into a loadable URL. */
  openDroppedFile(file: File): Promise<OpenedFile>
  openProject(): Promise<OpenedProject | null>
  saveProject(
    document: DilemmaDocument,
    path: string | null,
    saveAs: boolean,
  ): Promise<string | null>
  exportGlb(bytes: ArrayBuffer, name: string): Promise<string | null>
  exportFbx(
    bytes: ArrayBuffer,
    name: string,
    fps: number,
    lastFrame: number,
  ): Promise<string | null>
  onMenu(listener: (action: MenuAction) => void): () => void
  /** Files the main process asks the window to open, such as DILEMMA_OPEN at launch. */
  onOpenFile(listener: (file: OpenedFile) => void): () => void
}
