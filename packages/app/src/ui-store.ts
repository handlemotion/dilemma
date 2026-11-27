import type { JointRef, TransformKey } from '@dilemma/core'
import type { TransformMode, ViewportMarquee } from '@dilemma/view'
import type { CharacterAssets } from '@dilemma/io'
import { create } from 'zustand'
import type { TimelineRowId } from './components/timeline-tracks.ts'

export const PREVIEW_END = 120
export const PREVIEW_FPS = 30
export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const

type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

export interface TimelineRowRef {
  clipId: string | null
  rowId: TimelineRowId
}

export interface TimelineRange extends TimelineRowRef {
  anchor: number
  edge: number
}

export interface TransformDraft {
  joint: JointRef
  frame: number
  key: TransformKey | null
}

/** UI and render-resource state. Never document state: that lives in the editor. */
interface UiState {
  outlinerFocus: string | null
  setOutlinerFocus(focus: string | null): void
  outlinerSearchOpen: boolean
  setOutlinerSearchOpen(open: boolean): void
  inspectorExpansion: Partial<Record<string, boolean>>
  setInspectorExpanded(joint: string, expanded: boolean): void
  panelSizes: Partial<Record<'outliner' | 'inspector' | 'timeline', number>>
  setPanelSize(panel: keyof UiState['panelSizes'], size: number | undefined): void
  workArea: { clipId: string | null; start: number; end: number } | null
  setWorkArea(workArea: UiState['workArea']): void
  previewFrame: number
  timelineRange: TimelineRange | null
  activeTimelineRow: TimelineRowRef | null
  expandedTimelineCharacterId: string | null
  setActiveTimelineRow(row: TimelineRowRef | null): void
  setExpandedTimelineCharacter(id: string | null): void
  setPreviewFrame(frame: number): void
  setTimelineRange(range: TimelineRange | null): void
  playing: boolean
  playbackSpeed: PlaybackSpeed
  setPlaybackSpeed(speed: PlaybackSpeed): void
  loading: string | null
  error: string | null
  projectPath: string | null
  viewportMarquee: ViewportMarquee | null
  setViewportMarquee(rect: ViewportMarquee | null): void
  transformMode: TransformMode
  setTransformMode(mode: TransformMode): void
  transformDraft: TransformDraft | null
  /** Meshes and bones per character id, from io. */
  assets: ReadonlyMap<string, CharacterAssets>
  fps: number
  setPlaying(playing: boolean): void
  setLoading(name: string | null): void
  setError(error: string | null): void
  setProjectPath(path: string): void
  setTransformDraft(draft: TransformDraft | null): void
  addAssets(id: string, assets: CharacterAssets): void
  setAssets(assets: ReadonlyMap<string, CharacterAssets>): void
  setFps(fps: number): void
}

export const useUi = create<UiState>((set) => ({
  outlinerFocus: null,
  setOutlinerFocus: (outlinerFocus) => set({ outlinerFocus }),
  outlinerSearchOpen: false,
  setOutlinerSearchOpen: (outlinerSearchOpen) => set({ outlinerSearchOpen }),
  inspectorExpansion: {},
  setInspectorExpanded: (joint, expanded) =>
    set((state) => ({ inspectorExpansion: { ...state.inspectorExpansion, [joint]: expanded } })),
  panelSizes: {},
  setPanelSize: (panel, size) => set((s) => ({ panelSizes: { ...s.panelSizes, [panel]: size } })),
  workArea: null,
  setWorkArea: (workArea) => set({ workArea, playing: false }),
  previewFrame: 0,
  timelineRange: null,
  activeTimelineRow: null,
  expandedTimelineCharacterId: null,
  setActiveTimelineRow: (activeTimelineRow) => set({ activeTimelineRow }),
  setExpandedTimelineCharacter: (expandedTimelineCharacterId) =>
    set({ expandedTimelineCharacterId }),
  setPreviewFrame: (previewFrame) => set({ previewFrame }),
  setTimelineRange: (timelineRange) => set({ timelineRange }),
  playing: false,
  playbackSpeed: 1,
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  loading: null,
  error: null,
  projectPath: null,
  viewportMarquee: null,
  setViewportMarquee: (viewportMarquee) => set({ viewportMarquee }),
  transformMode: 'rotate',
  setTransformMode: (transformMode) => set({ transformMode }),
  transformDraft: null,
  assets: new Map(),
  fps: 0,
  setPlaying: (playing) => set({ playing }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setProjectPath: (projectPath) => set({ projectPath }),
  setTransformDraft: (transformDraft) => set({ transformDraft }),
  addAssets: (id, assets) => set((s) => ({ assets: new Map(s.assets).set(id, assets) })),
  setAssets: (assets) => set({ assets }),
  setFps: (fps) => set({ fps }),
}))
