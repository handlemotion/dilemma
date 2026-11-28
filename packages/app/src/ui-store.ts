import {
  DEFAULT_SCENE_TIMING,
  CURVE_AXES,
  type AxisCurves,
  type Clip,
  type CurveAxis,
  type KeyProperty,
  type JointRef,
  type PoseKey,
  type SceneTiming,
} from '@dilemma/core'
import type {
  TransformMode,
  TransformPreview,
  ViewportDisplay,
  ViewportMarquee,
} from '@dilemma/view'
import type { CharacterAssets } from '@dilemma/io'
import { create } from 'zustand'
import type { TimelineRowId } from './components/timeline-tracks.ts'
import type { CurvePoint } from './components/curve-graph.ts'
import {
  defaultDockLayout,
  dockSide,
  movePanel,
  type DockDrop,
  type DockLayout,
  type DockPanel,
  type DockSide,
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

export interface CurveTarget {
  clipId: string
  joint: number
  property: KeyProperty
}

export interface CurveDraft extends CurveTarget {
  curves: AxisCurves
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
  outlinerOpen: boolean
  toggleOutliner(): void
  dockLayout: DockLayout
  draggedPanel: DockPanel | null
  setDraggedPanel(panel: DockPanel | null): void
  activatePanel(panel: DockPanel): void
  moveDockPanel(panel: DockPanel, side: DockSide, drop: DockDrop): void
  inspectorExpansion: Partial<Record<string, boolean>>
  setInspectorExpanded(joint: string, expanded: boolean): void
  panelSizes: Partial<Record<DockSide | 'timeline' | 'curves', number>>
  setPanelSize(panel: keyof UiState['panelSizes'], size: number | undefined): void
  workArea: WorkArea | null
  setWorkArea(workArea: UiState['workArea']): void
  previewFrame: number
  timelineMode: 'keys' | 'curves'
  setTimelineMode(mode: UiState['timelineMode']): void
  curveProperty: KeyProperty | null
  setCurveProperty(property: UiState['curveProperty']): void
  curveAxes: readonly CurveAxis[]
  setCurveAxes(axes: readonly CurveAxis[]): void
  curveSelection: CurvePoint[]
  setCurveSelection(points: CurvePoint[]): void
  curveTarget: CurveTarget | null
  setCurveTarget(target: CurveTarget | null): void
  curveDraft: CurveDraft | null
  setCurveDraft(draft: CurveDraft | null): void
  timelineRange: TimelineRange | null
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
  unkeyedTransforms: readonly TransformPreview[]
  setUnkeyedTransforms(transforms: readonly TransformPreview[]): void
  loading: string | null
  error: string | null
  projectPath: string | null
  projectDirty: boolean
  viewportSettings: ViewportSettings
  setViewportSettings(settings: Partial<ViewportSettings>): void
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
  outlinerOpen: false,
  toggleOutliner: () =>
    set(({ dockLayout, outlinerOpen }) => {
      const side = dockSide(dockLayout, 'outliner')
      const dock = dockLayout[side]
      const closing = outlinerOpen && dock.active === 'outliner'
      const active = closing && dock.panels.includes('inspector') ? 'inspector' : 'outliner'
      return {
        outlinerOpen: !closing,
        dockLayout: { ...dockLayout, [side]: { ...dock, active } },
      }
    }),
  dockLayout: defaultDockLayout,
  draggedPanel: null,
  setDraggedPanel: (draggedPanel) => set({ draggedPanel }),
  activatePanel: (panel) =>
    set(({ dockLayout, outlinerOpen }) => {
      const side = dockSide(dockLayout, panel)
      return {
        outlinerOpen: outlinerOpen || panel === 'outliner',
        dockLayout: { ...dockLayout, [side]: { ...dockLayout[side], active: panel } },
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
  timelineMode: 'keys',
  setTimelineMode: (timelineMode) => set({ timelineMode, timelineRange: null, curveSelection: [] }),
  curveProperty: null,
  setCurveProperty: (curveProperty) => set({ curveProperty, curveSelection: [] }),
  curveAxes: CURVE_AXES,
  setCurveAxes: (curveAxes) =>
    set((state) => ({
      curveAxes,
      curveSelection: state.curveSelection.filter(({ axis }) => curveAxes.includes(axis)),
    })),
  curveSelection: [],
  setCurveSelection: (curveSelection) => set({ curveSelection }),
  curveTarget: null,
  setCurveTarget: (curveTarget) => set({ curveTarget, curveSelection: [] }),
  curveDraft: null,
  setCurveDraft: (curveDraft) => set({ curveDraft }),
  timelineRange: null,
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
    cameraFrame: false,
    compositionGrid: 'none',
  },
  setViewportSettings: (settings) =>
    set((state) => ({ viewportSettings: { ...state.viewportSettings, ...settings } })),
  viewportMarquee: null,
  setViewportMarquee: (viewportMarquee) => set({ viewportMarquee }),
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
