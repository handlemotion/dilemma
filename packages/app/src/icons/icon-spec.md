# Dilemma action icons

Dilemma uses original action icons for the main toolbar, viewport tools and other controls that drive the animation workflow. Use Central for compact controls such as menus, search, play and pause, and keyframe indicators. Keep playback glyphs neutral.

## Drawing and use

| Property | Dilemma action icons                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas   | 20 × 20 viewBox, rendered at 20 CSS pixels                                                                                                                       |
| Keyline  | Aim for 2 px of space around the ink. Center the silhouette by eye.                                                                                              |
| Stroke   | 1.5 px with round caps and joins. Check straight edges at actual size.                                                                                           |
| Fill     | Use solid arrowheads, pivots and handles when they carry meaning. Leave at least 1 px of clear space between separate marks at 20 px.                            |
| Color    | Inherit `currentColor` from the action group. Keep that color on hover and selection. Dim disabled glyphs.                                                       |
| Controls | Keep icon-only toolbar buttons on the existing 30 px targets. Give the button an accessible name and use the label and shortcut in its tooltip where applicable. |

Draw the silhouette first. Use round nodes for joints and square handles for transform points. Reserve the diamond for keyframes. Show direction with a single arrow where the action has one direction. Check neighboring glyphs at 20 px in the real toolbar. Large toolbar icon buttons use white fills without borders. Compact icon buttons sit flat at rest. A selected icon button uses a light blue fill.

## Action group colors

| Group     | Glyph color         | Examples                        |
| --------- | ------------------- | ------------------------------- |
| History   | Indigo `#6453dc`    | Undo, Redo                      |
| Setup     | Orchid `#a52dde`    | Import Character, New Clip      |
| Workspace | Cobalt `#3166b4`    | Outliner                        |
| Transform | Azure `#007be6`     | Move, Rotate, Scale             |
| Pose      | Jade `#008f76`      | Pose, Pin Effector, Rig Mapping |
| Keying    | Amber `#c76900`     | Set Key                         |
| Export    | Coral red `#fa4c4d` | Export Animation                |

Apply `data-action-group` to a workflow action or its containing group. The theme supplies the glyph color. Use `shell-toggle` and `aria-pressed` for a button with a persistent on or off state. The light blue fill marks selection. The focus outline marks keyboard focus.

## Starting lineup

| Action                  | Drawing                                 | Placement           |
| ----------------------- | --------------------------------------- | ------------------- |
| Move                    | Four directions around a pivot          | Workspace tool rail |
| Rotate                  | Circular arrow around a pivot           | Workspace tool rail |
| Scale                   | Axes with square handles                | Workspace tool rail |
| Pose                    | Bent joint chain with a square effector | Workspace tool rail |
| Pin Effector            | Pushpin                                 | Workspace tool rail |
| Import Character        | Character silhouette and inward arrow   | Main toolbar        |
| New Clip                | Clip frame and plus                     | Main toolbar        |
| Rig Setup / Rig Mapping | Parent node with two children           | Main toolbar        |
| Export Animation        | Upward arrow from a tray                | Main toolbar        |
| Set Key                 | Filled keyframe diamond and plus        | Keying controls     |

The SVGs live in [action.tsx](action.tsx). Render them with `<ActionIcon name="move" />` and put the name and state on the button. The SVG is decorative.

## Research and skills

- Apple's guidance favors familiar, simplified silhouettes, similar optical weight and centering by eye. [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/icons)
- Material uses keylines to balance shapes and recommends pixel alignment at the intended size. Carbon also uses a 20 px size for interface icons. [Material system icons](https://m2.material.io/design/iconography/system-icons.html), [IBM Carbon icon guidelines](https://www.carbondesignsystem.com/building-blocks/foundations/icons/guidelines)
- W3C gives an icon-only button its accessible name at the control and hides the decorative SVG from assistive technology. [W3C SVG icons](https://design-system.w3.org/styles/svg-icons.html)
- The local `icons` skill supplied the review sheet and the `reuse` skill guided the Central audit. The sheet measured 22 existing assets on the 24 × 24 viewBox and found a typical 1.5 px round stroke. The two families use different viewBox sizes, so compare apparent weight at the size each glyph renders.
- The external `icon-set-generator` covers custom SVG families. The local `icons` skill already covers measurement and visual comparison against Dilemma’s actual glyphs. [Jezweb design-assets skills](https://github.com/jezweb/claude-skills#design--frontend)
