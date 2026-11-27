import type { CharacterAssets } from '@dilemma/io'
import { create } from 'zustand'

export const PREVIEW_END = 120
export const PREVIEW_FPS = 30

export interface TimelineRange {
  clipId: string | null
  anchor: number
  edge: number
}

/** UI and render-resource state. Never document state: that lives in the editor. */
interface UiState {
  dockTab: 'outliner' | 'inspector'
  setDockTab(dockTab: UiState['dockTab']): void
  panelSizes: Partial<Record<'dock' | 'timeline', number>>
  setPanelSize(panel: keyof UiState['panelSizes'], size: number | undefined): void
  workArea: { clipId: string | null; start: number; end: number } | null
  setWorkArea(workArea: UiState['workArea']): void
  previewFrame: number
  timelineRange: TimelineRange | null
  setPreviewFrame(frame: number): void
  setTimelineRange(range: TimelineRange | null): void
  playing: boolean
  loading: string | null
  error: string | null
  /** Meshes and bones per character id, from io. */
  assets: ReadonlyMap<string, CharacterAssets>
  fps: number
  setPlaying(playing: boolean): void
  setLoading(name: string | null): void
  setError(error: string | null): void
  addAssets(id: string, assets: CharacterAssets): void
  setFps(fps: number): void
}

export const useUi = create<UiState>((set) => ({
  dockTab: 'outliner',
  setDockTab: (dockTab) => set({ dockTab }),
  panelSizes: {},
  setPanelSize: (panel, size) => set((s) => ({ panelSizes: { ...s.panelSizes, [panel]: size } })),
  workArea: null,
  setWorkArea: (workArea) => set({ workArea, playing: false }),
  previewFrame: 0,
  timelineRange: null,
  setPreviewFrame: (previewFrame) => set({ previewFrame }),
  setTimelineRange: (timelineRange) => set({ timelineRange }),
  playing: false,
  loading: null,
  error: null,
  assets: new Map(),
  fps: 0,
  setPlaying: (playing) => set({ playing }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  addAssets: (id, assets) => set((s) => ({ assets: new Map(s.assets).set(id, assets) })),
  setFps: (fps) => set({ fps }),
}))
