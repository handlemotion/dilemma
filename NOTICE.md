# Notice

Dilemma is Copyright (C) 2026 Rodrigo Jiménez, licensed under the GNU Affero General Public License, version 3 only (AGPL-3.0-only). The full text is in [LICENSE](LICENSE). Forks and hosted versions have to publish their source under the same license.

## Code from Enclose

Some files come from Enclose, Copyright (C) 2026 Glauber, AGPL-3.0-only, taken from [github.com/enclosedev/enclose](https://github.com/enclosedev/enclose) at commit `b2da08e`. Each one keeps that copyright line at the top and says what we changed. The Enclose name and mark don't come with its code, so we only use the name here and in those file headers, to say where the code is from.

Any file we take from another project gets a row here in the same pull request that adds it.

| File in Dilemma                                                             | Taken from                                                 | What we changed                                                                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `packages/view/src/platform.ts`                                             | `apps/desktop/src/lib/platform.ts`                         | nothing                                                                                                                             |
| `packages/view/src/scroll.ts`, `scroll.test.ts`                             | `apps/desktop/src/lib/scroll.ts`, `scroll.test.ts`         | import paths                                                                                                                        |
| `packages/view/src/navigation.ts`, `navigation.test.ts`                     | `apps/desktop/src/lib/navigation.ts`, `navigation.test.ts` | presets for Maya, Blender and trackpads, a right drag can zoom, and Alt drags work like Maya's                                      |
| `packages/view/src/rig.ts`                                                  | `apps/desktop/src/components/viewport/rig.tsx`             | only the mouse and trackpad handling, on plain three.js and camera-controls, without flat views, turning around the selected joints |
| `packages/app/src/preferences.ts`                                           | `apps/desktop/src/lib/preferences.ts`                      | only the navigation preferences, with Maya's buttons as the default                                                                 |
| `packages/app/electron/atomic.ts`, `atomic.test.ts`                         | `apps/desktop/electron/atomic.ts`, `atomic.test.ts`        | import path and temp folder name                                                                                                    |
| `packages/app/electron/main.ts`, the single-instance and open-file handling | `apps/desktop/electron/main.ts`                            | it opens character files in place of links                                                                                          |

## Dependencies

Runtime dependencies have to be MIT, Apache-2.0, BSD, MPL-2.0, GPL-3.0 or AGPL-3.0. Anything else needs an OK first.

| Package          | License    | What we use it for                  |
| ---------------- | ---------- | ----------------------------------- |
| three            | MIT        | rendering and glTF import           |
| camera-controls  | MIT        | the viewport camera                 |
| three-mesh-bvh   | MIT        | picking joints by clicking the mesh |
| react, react-dom | MIT        | panels and menus                    |
| @base-ui/react   | MIT        | UI parts like popovers and selects  |
| zustand          | MIT        | UI state                            |
| @pierre/trees    | Apache-2.0 | the Outliner tree                   |
| electron         | MIT        | the desktop shell                   |
| tailwindcss      | MIT        | styling, at build time              |

## Curve editor

The graph widget and tangent evaluation in `packages/app/src/components/curve-graph.ts` and `packages/core/src/curves.ts` adapt parts of [real-timeline-editor](https://github.com/v1vendi/real-timeline-editor/tree/a85c5a81f0e03d13414ee60fd98fb3cd37b6834a) by Illia Komsa, copyright (c) 2026, under the MIT License. Dilemma uses its own frame model, graph theme and command history. The [full license](licenses/real-timeline-editor.txt) ships with the desktop package.

## Test characters

The skinned characters the import tests use come from the Khronos glTF Sample Assets and aren't in this repository. `pnpm fetch-assets` downloads them into `fixtures/khronos/`, each with its own LICENSE.md.

## Central Icons

The interface embeds selected Central Icons from `@central-icons-react/round-outlined-radius-3-stroke-1.5` and `@central-icons-react/round-filled-radius-1-stroke-1.5`, both version `1.2.39`. The glyphs in `packages/app/src/icons/` are copyright © David & Storm GbR – Iconists and are covered by the [Iconists license](https://iconists.co/license).

The desktop package includes this notice and the Pierre Trees license and notice at `licenses/pierre-trees/`.
