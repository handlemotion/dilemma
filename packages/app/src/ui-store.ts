import {
  DEFAULT_SCENE_TIMING,
  type Clip,
  type JointRef,
  type PoseKey,
  type RigMapping,
  type RigRole,
  type SceneTiming,
} from '@dilemma/core'
import type {
  TransformMode,
  TransformPreview,
  ViewportControlHover,
  ViewportDisplay,
  ViewportMarquee,
} from '@dilemma/view'
import type { CharacterAssets } from '@dilemma/io'
import { create } from 'zustand'
import type { TimelineRowId } from './components/timeline-tracks.ts'
import {
  defaultDockLayout,
  dockSide,
  movePanel,
  type DockDrop,
  type DockLayout,
  type DockPanel,
  type DockSide,
  type ViewportPosition,
  type WorkspaceDrag,
} from './dock-layout.ts'

export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const

type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

interface WorkArea {
  clipId: string | null
  start: number
  end: number
}

export function resolveWorkArea(
  clip: Clip | null | undefined,
  sceneTiming: SceneTiming,
  workArea: WorkArea | null,
): WorkArea {
  const clipId = clip?.id ?? null
  const { start: first, end: last } = clip ?? sceneTiming
  const area = workArea?.clipId === clipId ? workArea : null
  const start = Math.max(first, Math.min(last, area?.start ?? first))
  const end = Math.max(start, Math.min(last, area?.end ?? last))
  return { clipId, start, end }
}

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
  key: PoseKey | null
}

export interface RigSetupDraft {
  characterId: string
  step: number | null
  confirmedSteps: readonly number[]
  joints: RigMapping['joints']
  previewRole: RigRole | null
  pickRole: RigRole | null
  error: string | null
}

export interface ViewportSettings extends ViewportDisplay {
  cameraFrame: boolean
  compositionGrid: 'none' | 'thirds' | 'golden'
}

export const SHADING_MODES = [
  { value: 'materials', label: 'Materials' },
  { value: 'clay', label: 'Clay' },
  { value: 'wireframe', label: 'Wireframe' },
] as const

export const COMPOSITION_GRIDS = [
  { value: 'none', label: 'None' },
  { value: 'thirds', label: 'Rule of thirds' },
  { value: 'golden', label: 'Golden ratio' },
] as const

/** UI and render-resource state. Never document state: that lives in the editor. */
interface UiState {
  outlinerFocus: string | null
  setOutlinerFocus(focus: string | null): void
  dockLayout: DockLayout
  collapsedDockPanels: Partial<Record<DockPanel, boolean>>
  toggleDockPanel(panel: DockPanel): void
  draggedPanel: WorkspaceDrag | null
  setDraggedPanel(panel: WorkspaceDrag | null): void
  viewportPosition: ViewportPosition
  moveViewport(position: ViewportPosition): void
  activatePanel(panel: DockPanel): void
  moveDockPanel(panel: DockPanel, side: DockSide, drop: DockDrop): void
  inspectorExpansion: Partial<Record<string, boolean>>
  setInspectorExpanded(joint: string, expanded: boolean): void
  panelSizes: Partial<Record<DockSide | 'timeline', number>>
  setPanelSize(panel: keyof UiState['panelSizes'], size: number | undefined): void
  workArea: WorkArea | null
  setWorkArea(workArea: UiState['workArea']): void
  previewFrame: number
  timelineRange: TimelineRange | null
  selectedContact: { clipId: string; id: string } | null
  setSelectedContact(contact: UiState['selectedContact']): void
  activeTimelineRow: TimelineRowRef | null
  expandedTimelineCharacterId: string | null
  setActiveTimelineRow(row: TimelineRowRef | null): void
  setExpandedTimelineCharacter(id: string | null): void
  setPreviewFrame(frame: number): void
  setTimelineRange(range: TimelineRange | null): void
  playing: boolean
  loopPlayback: boolean
  setLoopPlayback(loopPlayback: boolean): void
  playbackSpeed: PlaybackSpeed
  setPlaybackSpeed(speed: PlaybackSpeed): void
  autoKey: boolean
  setAutoKey(autoKey: boolean): void
  showMotionTrails: boolean
  setShowMotionTrails(visible: boolean): void
  unkeyedTransforms: readonly TransformPreview[]
  setUnkeyedTransforms(transforms: readonly TransformPreview[]): void
  loading: string | null
  error: string | null
  projectPath: string | null
  projectDirty: boolean
  viewportSettings: ViewportSettings
  setViewportSettings(settings: Partial<ViewportSettings>): void
  hoveredControl: ViewportControlHover | null
  setHoveredControl(hover: ViewportControlHover | null): void
  viewportMarquee: ViewportMarquee | null
  setViewportMarquee(rect: ViewportMarquee | null): void
  rigSetup: RigSetupDraft | null
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
  dockLayout: defaultDockLayout,
  collapsedDockPanels: {},
  toggleDockPanel: (panel) =>
    set(({ collapsedDockPanels }) => ({
      collapsedDockPanels: { ...collapsedDockPanels, [panel]: !collapsedDockPanels[panel] },
    })),
  draggedPanel: null,
  setDraggedPanel: (draggedPanel) => set({ draggedPanel }),
  viewportPosition: 'center',
  moveViewport: (viewportPosition) => set({ viewportPosition, draggedPanel: null }),
  activatePanel: (panel) =>
    set(({ dockLayout, collapsedDockPanels }) => {
      const side = dockSide(dockLayout, panel)
      return {
        dockLayout: { ...dockLayout, [side]: { ...dockLayout[side], active: panel } },
        collapsedDockPanels: collapsedDockPanels[panel]
          ? { ...collapsedDockPanels, [panel]: false }
          : collapsedDockPanels,
      }
    }),
  moveDockPanel: (panel, side, drop) =>
    set(({ dockLayout }) => ({
      dockLayout: movePanel(dockLayout, panel, side, drop),
      draggedPanel: null,
    })),
  inspectorExpansion: {},
  setInspectorExpanded: (joint, expanded) =>
    set((state) => ({ inspectorExpansion: { ...state.inspectorExpansion, [joint]: expanded } })),
  panelSizes: {},
  setPanelSize: (panel, size) => set((s) => ({ panelSizes: { ...s.panelSizes, [panel]: size } })),
  workArea: null,
  setWorkArea: (workArea) => set({ workArea, playing: false }),
  previewFrame: DEFAULT_SCENE_TIMING.start,
  timelineRange: null,
  selectedContact: null,
  setSelectedContact: (selectedContact) => set({ selectedContact }),
  activeTimelineRow: null,
  expandedTimelineCharacterId: null,
  setActiveTimelineRow: (activeTimelineRow) => set({ activeTimelineRow }),
  setExpandedTimelineCharacter: (expandedTimelineCharacterId) =>
    set({ expandedTimelineCharacterId }),
  setPreviewFrame: (previewFrame) =>
    set((state) =>
      state.previewFrame === previewFrame ? state : { previewFrame, unkeyedTransforms: [] },
    ),
  setTimelineRange: (timelineRange) => set({ timelineRange }),
  playing: false,
  loopPlayback: true,
  setLoopPlayback: (loopPlayback) => set({ loopPlayback }),
  playbackSpeed: 1,
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  autoKey: true,
  setAutoKey: (autoKey) => set({ autoKey }),
  showMotionTrails: false,
  setShowMotionTrails: (showMotionTrails) => set({ showMotionTrails }),
  unkeyedTransforms: [],
  setUnkeyedTransforms: (unkeyedTransforms) => set({ unkeyedTransforms }),
  loading: null,
  error: null,
  projectPath: null,
  projectDirty: false,
  viewportSettings: {
    cameraLocked: false,
    floorGrid: true,
    shading: 'materials',
    skeletonInPose: false,
    cameraFrame: false,
    compositionGrid: 'none',
  },
  setViewportSettings: (settings) =>
    set((state) => ({ viewportSettings: { ...state.viewportSettings, ...settings } })),
  hoveredControl: null,
  setHoveredControl: (hoveredControl) =>
    set((state) => (state.hoveredControl === hoveredControl ? state : { hoveredControl })),
  viewportMarquee: null,
  setViewportMarquee: (viewportMarquee) => set({ viewportMarquee }),
  rigSetup: null,
  transformMode: 'rotate',
  setTransformMode: (transformMode) => set({ transformMode }),
  transformDraft: null,
  assets: new Map(),
  fps: 0,
  setPlaying: (playing) => set(playing ? { playing, unkeyedTransforms: [] } : { playing }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setProjectPath: (projectPath) => set({ projectPath }),
  setTransformDraft: (transformDraft) => set({ transformDraft }),
  addAssets: (id, assets) => set((s) => ({ assets: new Map(s.assets).set(id, assets) })),
  setAssets: (assets) => set({ assets }),
  setFps: (fps) => set({ fps }),
}))
