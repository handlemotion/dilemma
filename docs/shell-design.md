# Shell design

Start with the general shell. It establishes where animators look for tools, selection and time before those areas gain more controls.

## Workspace

- One connected frame. The top toolbar owns project actions. Use F to frame the selection in the viewport. The right dock owns hierarchy and selection details.
- The timeline runs edge to edge beneath the viewport and dock. The timeline is 81 px tall by default. The transport and timecode share a header with the frame ruler and thin draggable work area. The action row, combined ruler and work-area header, and each track row are 40 px tall. Playback loops over the work area. Double-click the work area strip to reset it. Drag on the ruler to scrub or in the track area to select a frame range. Before a clip is loaded the ruler shows frames 0–120. Contact ranges will need room for labels and trim handles.
- Use one-pixel dividers between docked regions. Use rounded corners on controls and floating surfaces.

## Palette

| Role                  | Value     | Use                                                        |
| --------------------- | --------- | ---------------------------------------------------------- |
| Window                | `#f5f6f8` | Behind shell surfaces                                      |
| Panel                 | `#ffffff` | Toolbar, dock, and timeline ruler                          |
| Timeline and viewport | `#f6f7fa` | Tracks and viewport background                             |
| Control               | `#f0f1f4` | Button and frame readout fills                             |
| Control hover         | `#e7e9ee` | Enabled button hover                                       |
| Divider               | `#e9eaf0` | Panel boundaries                                           |
| Text                  | `#22242b` | Primary labels and playhead                                |
| Muted text            | `#565b68` | Secondary labels                                           |
| Faint text            | `#656b79` | Low-emphasis labels                                        |
| Brand blue            | `#4c94fa` | Primary actions, focus, timeline keys, and range selection |
| Amber                 | `#fab94c` | Selected viewport joints                                   |

Keep button fills visible at rest and when disabled. On hover, enabled icon buttons use a deeper gray fill and a darker icon. Dim the icon on disabled actions. Use white text on blue primary actions.

## Density and alignment

- Use a 4 px spacing grid. Default to even padding on all four sides in roughly 9 out of 10 components. Start with 12 px for panel headers and 4 px for square controls. Fixed-height labeled buttons and indented tree rows are exceptions.
- Use 26 × 26 px icon buttons with centered 14–16 px glyphs. Use 26 px height and 8 px horizontal padding for labeled buttons. Give toolbars 8 px of padding on all sides. A 26 px control and a 1 px divider make a 43 px row.
- Measure from a shared axis. Center icons in their buttons and buttons on the toolbar's horizontal centerline. Align panel labels and fields to a shared 12 px leading inset. Measure from the painted edges of glyphs when an icon appears off-center.
- Check at 1024 × 640 and 1440 × 900. Measure the timeline against the window edges, check shared insets and centerlines in the inspector, and verify visible keyboard focus. Try a long joint name and a long clip name.

## Build order

1. Establish the connected shell, palette and transport placement. Check the viewport with a real character at laptop size.
2. Add dock resizing and an Outliner with collapsible branches, Reveal Selection and Focus Branch. Show breadcrumbs during branch focus so an animator can move back up.
3. Add contextual rig confirmation for Body, Hands and Preview Pose when mapping work is needed. Keep selection and camera placement consistent when moving into animation.
4. Grow the timeline with keys and contacts as those editing features arrive.
