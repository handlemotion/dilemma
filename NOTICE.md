# Notice

Dilemma is licensed under the GNU Affero General Public License, version 3 only
(AGPL-3.0-only). See [LICENSE](LICENSE). Forks and hosted versions must publish
their source under the same license.

## Code taken from other projects

Each file taken from another project keeps its original copyright line and is
listed here, with where it came from, in the same pull request that adds it.

Taken from Enclose, Copyright (C) 2026 Glauber, AGPL-3.0-only, at
[github.com/enclosedev/enclose](https://github.com/enclosedev/enclose) commit `b2da08e`.
Each file keeps that copyright line and says what changed. The Enclose name and mark
are not licensed with its code and are not used in Dilemma.

| File in Dilemma                                                          | Taken from                                                      | Changes                                                                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/view/src/platform.ts`                                          | `apps/desktop/src/lib/platform.ts`                              | none                                                                                                       |
| `packages/view/src/scroll.ts`, `scroll.test.ts`                          | `apps/desktop/src/lib/scroll.ts`, `scroll.test.ts`              | import paths                                                                                               |
| `packages/view/src/navigation.ts`, `navigation.test.ts`                  | `apps/desktop/src/lib/navigation.ts`, `navigation.test.ts`      | animation presets (Maya, Blender, trackpad), right drag may zoom, Maya Alt drags                           |
| `packages/view/src/rig.ts`                                               | `apps/desktop/src/components/viewport/rig.tsx`                  | input handling only, on plain three.js and camera-controls; no flat views; turns about the selected joints |
| `packages/app/src/preferences.ts`                                        | `apps/desktop/src/lib/preferences.ts`                           | navigation preferences only, Maya defaults                                                                 |
| `packages/app/src/components/navigation-settings.tsx`                    | `apps/desktop/src/components/settings.tsx` (Navigation section) | a Base UI popover instead of a settings page                                                               |
| `packages/app/electron/atomic.ts`, `atomic.test.ts`                      | `apps/desktop/electron/atomic.ts`, `atomic.test.ts`             | import path, temp folder name                                                                              |
| `packages/app/electron/main.ts` (single-instance and open-file handling) | `apps/desktop/electron/main.ts`                                 | opens character files instead of links                                                                     |

## Dependencies

Runtime dependencies must be MIT, Apache-2.0, BSD, MPL-2.0, GPL-3.0 or
AGPL-3.0. Anything else needs approval first.

| Package          | License | Used for               |
| ---------------- | ------- | ---------------------- |
| three            | MIT     | Rendering, glTF import |
| react, react-dom | MIT     | Panels and dialogs     |
| @base-ui/react   | MIT     | UI primitives          |
| zustand          | MIT     | UI state               |
| electron         | MIT     | Desktop shell          |
| tailwindcss      | MIT     | Styling (build time)   |

## Test assets

Test characters come from the Khronos glTF Sample Assets and are not stored in
this repository. `pnpm fetch-assets` downloads them with each model's
LICENSE.md into `fixtures/khronos/`.
