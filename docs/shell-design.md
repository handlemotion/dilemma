# Shell design

Start with the general shell. It establishes where animators look for tools, selection and time before those areas gain more controls.

## Workspace

- One connected frame. The title rail holds the native macOS controls, the centered project filename, and the unsaved-changes indicator. The icon toolbar beneath it holds history, character import, and clip creation. App menus use the native macOS menu bar or the title rail on other platforms. The left rail holds the Outliner toggle and editing tools, starting with Limb IK. The viewport has its own View, Camera, Display, and Shading menus with shortcuts at the right end of the same row. Move, Rotate, and Scale float at the bottom of the viewport. Use F to frame the selection. The Outliner opens on the left by default and Properties starts on the right. Drag their tabs to the opposite dock's outer edge to swap sides, or into the dock to group them. Drag a grouped tab to the empty side to split the docks again.
- The timeline runs edge to edge beneath the viewport and side panels. The timeline is 73 px tall by default. The transport and timecode share a header with the frame ruler and thin draggable work area. The combined ruler and work-area header and each track row are 36 px tall. Playback loops over the work area. Double-click the work area strip to reset it. Drag on the ruler to scrub or in the track area to select a frame range. Before a clip is loaded the ruler shows frames 0–120. Contact ranges will need room for labels and trim handles.
- Use one-pixel dividers between docked regions. Use rounded corners on controls and floating surfaces.

## Palette

| Role                 | Value     | Use                                                        |
| -------------------- | --------- | ---------------------------------------------------------- |
| Shell and panels     | `#e9ebef` | Title, toolbars, docks, viewport menu, and timeline ruler  |
| Timeline tracks      | `#e6e8ed` | Track background                                           |
| Viewport             | `#dde0e6` | 3D scene background                                        |
| Raised               | `#ffffff` | Buttons, fields, menus, and floating islands               |
| Flat control hover   | `#dce0e6` | Hover on grey surfaces                                     |
| Raised control hover | `#f3f4f6` | Hover on white buttons and fields                          |
| Divider              | `#d7dbe2` | Panel boundaries                                           |
| Text                 | `#22242b` | Primary labels and playhead                                |
| Muted text           | `#565b68` | Secondary labels                                           |
| Faint text           | `#656b79` | Low-emphasis labels                                        |
| Brand blue           | `#0c8ce9` | Primary actions, focus, timeline keys, and range selection |
| Amber                | `#fab94c` | Selected viewport joints                                   |

Action buttons, idle mode tools, and property fields use white fills. Give the active viewport tool a solid blue fill and white icon, and dim disabled actions.

## Density and alignment

- Use a 4 px spacing grid. Default to even padding on all four sides in roughly 9 out of 10 components. Start with 12 px for panel headers and 4 px for square controls. Fixed-height labeled buttons and indented tree rows are exceptions.
- Use 36 px for standard rows, including dock headers and timeline rows. The title rail is 32 px tall and the viewport menu is 28 px tall. The main toolbar is 40 px tall and the left tool rail is 40 px wide. Both tool rails use 30 × 30 px buttons with 20 px icons. Use 4 px of padding around dock headers, panel contents, and toolbars. The viewport canvas and timeline ruler stay flush with their edges. Compact tree rows have their own height.
- Measure from a shared axis. Center icons in their buttons and buttons on the toolbar's horizontal centerline. Align panel labels and fields to a shared 12 px leading inset. Measure from the painted edges of glyphs when an icon appears off-center.
- Check at 1024 × 640 and 1440 × 900. Measure the timeline against the window edges, check shared insets and centerlines in the inspector, and verify visible keyboard focus. Try a long joint name and a long clip name.

## Build order

1. Establish the connected shell, palette and transport placement. Check the viewport with a real character at laptop size.
2. Add dock resizing and an Outliner with collapsible branches, Reveal Selection and Focus Branch. Show breadcrumbs during branch focus so an animator can move back up.
3. Add contextual rig confirmation for Body, Hands and Preview Pose when mapping work is needed. Keep selection and camera placement consistent when moving into animation.
4. Grow the timeline with keys and contacts as those editing features arrive.
