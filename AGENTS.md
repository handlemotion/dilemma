# Dilemma, rules for agents

Dilemma is an AGPL-3.0-only desktop app for 3D character animation. It imports a skinned character, lets an animator pose and key it with full-body IK and contacts, and sends the animation back to Maya and Blender. It covers bodies and hands, no faces.

## Layout

There are five packages under `packages/`, and a package only imports the ones below it.

| Package | What it does                                                                    | What it may import        |
| ------- | ------------------------------------------------------------------------------- | ------------------------- |
| `core`  | document model, commands, undo, selection, playhead                             | nothing                   |
| `solve` | the pose solve, deterministic, on typed arrays                                  | `core`                    |
| `io`    | glTF import, and later export and project files                                 | `core`, three.js          |
| `view`  | the three.js viewport, which draws the solved pose and reports clicks and drags | `core`, `solve`, three.js |
| `app`   | the Electron shell and the React UI                                             | all of the above          |

`pnpm run check` runs the typecheck, oxlint with the layer rule, oxfmt and vitest, the same as CI. `pnpm dev` starts the app, and `pnpm fetch-assets` downloads the Khronos test characters.

## Hard rules

1. `core` and `solve` import nothing from React, three.js, Electron, Node or the DOM. oxlint fails the build if they do, and their tsconfigs leave out the DOM types.
2. Every change to the document is a `Command` with an inverse, run through `Editor.run`. No code changes the document directly.
3. `view` keeps no state of its own. It draws the solved pose and reports what the user clicked or dragged.
4. `solve` is deterministic. The same document at the same frame gives the same pose, so it never reads a clock or a random number.
5. `solve` works on typed arrays, not object graphs.
6. The document is plain JSON with a `version`. Only bump `DOCUMENT_VERSION` together with a migration in `core/src/migrate.ts` and a test that loads the old version.
7. Units and axes follow glTF: meters, Y up, right-handed, quaternions as `[x, y, z, w]`.
8. Key times are integer frames against the clip's fps, never float seconds.
9. A full pose solve for a 70-joint humanoid takes under 2 ms. A test measures it.
10. UI state lives in zustand. Document state never does.

## License and reuse

- A file taken from another AGPL project keeps its copyright line, and the same pull request adds it to `NOTICE.md`.
- Reused code follows the layer rules too, so nothing that imports React, three.js or Electron goes into `core` or `solve`.
- Don't use another project's name or mark in the product.
- Dependencies have to be MIT, Apache-2.0, BSD, MPL-2.0, GPL-3.0 or AGPL-3.0. Ask before adding anything else.
- Blender runs as a separate command-line process. Don't copy its code in.
- The Maya bridge lives in its own folder and links nothing from Autodesk's SDK into the app.

## Roadmap

[docs/roadmap.md](docs/roadmap.md) has where the product is headed, the milestones and the decisions still open. It's a direction, not a spec.
