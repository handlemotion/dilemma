# Shell design

Start with the general shell. It establishes where animators look for tools, selection and time before those areas gain more controls.

## Workspace

- One connected frame. The title rail holds the native macOS controls, the centered project filename, and the unsaved-changes indicator. The icon toolbar beneath it holds history, character import, clip creation, rig confirmation, and animation export. App menus use the native macOS menu bar or the title rail on other platforms. The left rail holds joint transforms, Pose, and Pin Effector. The viewport has its own View, Camera, Display, and Shading menus with Pan, Orbit, and the camera configuration shortcuts at the right end of the same row. Drag directly on Pan or Orbit to move the camera while the current editing tool stays active. Use F to frame the selection. Outliner and Properties open together in the right dock, with Outliner above Properties. The right dock grows to 430 px on wider windows. Drag the viewport grip to place the viewport left, center, or right. Drag a panel by its two-line grip to swap docks or stack it vertically with another panel. The side rail shares the header fill. Each collapse button lines up with its header, and the selected tab below it uses the shell fill. A collapsed panel keeps its header and gives its space to the other panel. Drag a panel to the empty side to separate the docks.
- The timeline runs edge to edge beneath the viewport and side panels. The timeline is 37 px tall without an active clip and 73 px tall with a collapsed character track. The transport and timecode share a header with the frame ruler and thin draggable work area. The combined ruler and work-area header and each track row are 36 px tall. Playback loops over the work area. Double-click the work area strip to reset it. Drag on the ruler to scrub or in the track area to select a frame range. Before a clip is loaded the ruler shows frames 0–120. Contact ranges will need room for labels and trim handles.
- Use one-pixel dividers between docked regions. Use rounded corners on controls and floating surfaces.

## Palette

| Role              | Value     | Use                                                        |
| ----------------- | --------- | ---------------------------------------------------------- |
| Shell and panels  | `#f5f6f8` | Title, toolbars, dock bodies, and timeline ruler           |
| Workspace headers | `#eef0f4` | Viewport and panel headers                                 |
| Timeline tracks   | `#eef0f3` | Track background                                           |
| Viewport          | `#e6e9ee` | 3D scene background                                        |
| Raised            | `#ffffff` | Buttons, fields, and menus                                 |
| Icon selection    | `#e4f2fc` | Selected icon buttons                                      |
| Control hover     | `#e7eaf0` | Panel grips, action buttons, and fields                    |
| Divider           | `#e4e7ec` | Panel boundaries                                           |
| Text              | `#22242b` | Primary labels                                             |
| Playhead          | `#fa4c4d` | Timeline cursor and current frame badge                    |
| Muted text        | `#565b68` | Secondary labels                                           |
| Faint text        | `#656b79` | Low-emphasis labels                                        |
| Brand blue        | `#0c8ce9` | Primary actions, focus, timeline keys, and range selection |
| Amber             | `#fab94c` | Selected viewport joints                                   |

Large toolbar icon buttons use white fills without borders. Compact icon buttons sit flat at rest. Selected icon buttons use a light blue fill, and workflow glyphs keep their action-group colors. Compact transport controls use neutral Central Icons with a 1 px corner radius. The timeline timecode sits flat until hovered or focused. Property fields use a white fill. Disabled actions are dimmed. See the [action icon spec](../packages/app/src/icons/icon-spec.md).

## Density and alignment

- Use a 4 px spacing grid. Default to even padding on all four sides in roughly 9 out of 10 components. Start with 12 px for panel headers and 4 px for square controls. Fixed-height labeled buttons and indented tree rows are exceptions.
- Use 36 px for standard rows such as timeline rows. The title rail, dock headers, and viewport menu are 32 px tall. The main toolbar is 40 px tall and the left tool rail is 40 px wide. Both use 30 × 30 px buttons with 20 px icons. Use 4 px of padding around dock headers, panel contents, and toolbars. The viewport canvas and timeline ruler stay flush with their edges. Compact tree rows have their own height.
- Measure from a shared axis. Center icons in their buttons and buttons on the toolbar's horizontal centerline. Align panel labels and fields to a shared 12 px leading inset. Measure from the painted edges of glyphs when an icon appears off-center.
- Check at 1024 × 640 and 1440 × 900. Measure the timeline against the window edges, check shared insets and centerlines in the inspector, and verify visible keyboard focus. Try a long joint name and a long clip name.

## Build order

1. Establish the connected shell, palette and transport placement. Check the viewport with a real character at laptop size.
2. Add dock resizing and an Outliner with collapsible branches, Reveal Selection and Focus Branch. Show breadcrumbs during branch focus so an animator can move back up.
3. Add contextual rig confirmation for Body, Hands and Preview Pose when mapping work is needed. Keep selection and camera placement consistent when moving into animation.
4. Grow the timeline with keys and contacts as those editing features arrive.
