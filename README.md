# Dilemma

An open source desktop tool for 3D character animation. Drop in a skinned
character, confirm the joints, start posing. Contacts are clips on the
timeline, editing one key re-solves its neighbors, and the work returns to
Maya and Blender as editable animation.

Status: milestone 1, load and look. macOS first.

## Develop

Requires Node 24 and pnpm 11.

```sh
pnpm install
pnpm dev            # start the app
pnpm run check      # typecheck, lint, format check, tests
pnpm fetch-assets   # download the Khronos test characters
```

In the app: ⌘O or drop a `.glb`/`.gltf`. Alt-drag orbits, middle-drag pans,
Alt-right-drag or pinch zooms, a two-finger swipe orbits, Shift-swipe pans,
F frames the selection. Space plays, arrow keys step a frame.

## License

AGPL-3.0-only. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
