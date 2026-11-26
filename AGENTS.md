# Dilemma: rules for agents

Dilemma is an AGPL-3.0-only desktop tool for 3D character animation: import a
skinned character, pose and key with full-body IK and contacts, bake back to
Maya and Blender. Body and hands only.

## Layout

Five packages under `packages/`. Imports only point down.

| Package | Role                                                                 | May import                |
| ------- | -------------------------------------------------------------------- | ------------------------- |
| `core`  | Document model, commands, undo, selection, playhead                  | nothing                   |
| `solve` | Deterministic pose solve on typed arrays                             | `core`                    |
| `io`    | glTF import (and later export, project files)                        | `core`, three.js          |
| `view`  | three.js viewport: draws the solved pose, turns gestures into events | `core`, `solve`, three.js |
| `app`   | Electron shell and React UI                                          | everything above          |

`pnpm run check` runs typecheck, oxlint (with the boundary rule), oxfmt and
vitest. `pnpm dev` starts the app. `pnpm fetch-assets` downloads the Khronos
test characters.

## Hard rules

1. `core` and `solve` import nothing from React, three.js, Electron, Node or
   the DOM. oxlint and their tsconfigs (no DOM lib) enforce it.
2. Every document change is a `Command` with an inverse, run through
   `Editor.run`. Nothing mutates the document directly.
3. `view` owns no state. It draws the solved pose and reports gestures.
4. `solve` is deterministic: same document and time, same pose. No clock, no
   randomness.
5. `solve` works on typed arrays, not object graphs.
6. The document is plain JSON with a `version`. Bump `DOCUMENT_VERSION` only
   with a migration in `core/src/migrate.ts` and a test for it.
7. glTF conventions: meters, Y up, right-handed, quaternions `[x, y, z, w]`.
8. Key times are integer frames against the clip's fps. Never float seconds.
9. A full pose solve for a 70-joint humanoid stays under 2 ms. A test measures it.
10. UI state goes in zustand. Document state never does.

## License and reuse

- Code taken from another AGPL project keeps its copyright line and is listed
  in `NOTICE.md`, in the same pull request.
- Reused code still obeys the layer rules: nothing that imports React,
  three.js or Electron goes into `core` or `solve`.
- Do not use another project's name or mark in the product.
- Dependencies: MIT, Apache-2.0, BSD, MPL-2.0, GPL-3.0 or AGPL-3.0. Ask first
  for anything else.
- Blender runs as a separate command-line process. Do not vendor its code.
- The Maya bridge lives in its own folder and links nothing from Autodesk's SDK
  into the app.

## Milestones

Each milestone is done when its checks pass. Do not start work past the
current milestone without its own brief.
