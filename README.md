# Dilemma

Dilemma is an open source desktop app for animating 3D characters. You drop in a skinned character, confirm its joints and start posing with full-body IK, and the animation goes back to Maya or Blender as keys you can still edit.

We're making it for the animators at our studio, Chow Mein. It changes a lot and it's macOS only for now.

## What we're betting on

Contacts live on the timeline. "Hand grips the cup from frame 20 to 48" is a clip you can drag and trim. Editing one key re-solves the keys around it, so when you drag a motion path the neighboring keys follow with a falloff you control. There's also no rigging step, Dilemma reads the skeleton and skin weights from the file and builds its own controls on top. And whatever you make goes back to Maya and Blender as animation on their own controls, so a team can keep working there.

## Where it is now

You can import a skinned glTF, play its clips, and key joints in FK or use humanoid Pose controls. The app saves editable projects and exports the active clip as baked GLB or FBX animation. [docs/roadmap.md](docs/roadmap.md) has the rest of the plan.

## Running it

You need Node 24 and pnpm 11.

```sh
pnpm install
pnpm dev
```

Keep the `pnpm dev` desktop window open while working on the UI. Vite applies style and React component edits there as you save. Changes to the Electron main process or preload take effect after restarting the dev app.

Press ⌘O or drop a `.glb` or `.gltf` on the window. The camera moves the way Maya's does, Alt with the left, middle or right button turns, pans or zooms. On a trackpad a two-finger swipe turns and a pinch zooms. F frames the selection, Space plays, and the arrow keys step one frame. The Navigation menu in the toolbar switches the mouse buttons to Blender's layout or a trackpad-first one.

A character import opens **Rig setup** in Properties. Walk through Body, Hands, and Feet to check the suggested joints. Use **Pick** to choose a joint in the viewport, or leave a role unmapped to skip that control. When all seven matches are found, setup opens on Review. Select **Start Posing** to confirm the controls. **Skip setup** keeps the character available for joint editing. In **Pose** mode, drag the blue handles or choose a named control in Properties. Pin a hand or foot from its row to hold it for the clip. When a target is beyond limb reach, the pelvis, spine, and shoulders can help reach it while giving pins priority. Select a limb to show its bend handle. **Display → Skeleton in Pose Mode** shows the underlying joints.

To hold an effector over a frame range, select a foot or hand in **Pose** and use **Add Contact** in the animation toolbar. Select a range first to set exact bounds, or create a contact at the playhead. Drag the center of a contact on the timeline to move it, or drag an edge to trim it. The solver eases into and out of the hold over nearby frames. A grip includes a box prop. Edit its position in Properties to move the grip target.

Select a joint and drag a rotation ring to write a key at the playhead. Use **New clip** to start a fresh animation, **Set key** or S to key the current rotation, and **Delete keys** to remove rotation keys at the playhead or in a selected range. Use **File → Save Project** (⌘S) and **File → Open Project** (⇧⌘O) for `.dilemma` files. Project files reference the original character assets by path, so keep those files and any sibling textures or buffers available. **Export GLB** writes a standalone copy of the character with the active clip baked into it.

**File → Export FBX** writes the character with the active clip baked onto its skeleton for Maya or Blender. It runs your local Blender installation in the background. Dilemma looks in `/Applications`, `~/Applications`, Steam's default library, and the app's `PATH`.

Download the DMG for your Mac from [GitHub Releases](https://github.com/handlemotion/dilemma/releases) and drag Dilemma into Applications. To install from a checkout, run `pnpm install-app`. It builds and signs the app ad hoc and replaces `/Applications/Dilemma.app`.

`pnpm run check` runs the typecheck, lint, format check and tests, the same as CI. `pnpm fetch-assets` downloads a few skinned characters from the Khronos glTF sample assets for the import tests.

## Releasing

Run **Release macOS** from GitHub Actions on `main`. The workflow runs CI, builds Apple Silicon and Intel DMGs, and publishes both with generated release notes for the tagged commit.

Versions use `vYEAR.MAJOR.BATCH` and roll over on January 1 UTC. Choose `routine` to ship a batch of minor features and fixes. Choose `major` to bump the middle number and reset the last one to zero.

- The first routine release of the year is `v2026.0.1` and the next is `v2026.0.2`.
- A major release after `v2026.0.2` is `v2026.1.0`. A major release can also open the year at `v2026.1.0`.

To enable Developer ID signing and Apple notarization, set the GitHub Actions secrets `CSC_LINK` (base64 Developer ID Application `.p12`), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. With no signing secrets, CI signs the app ad hoc. macOS may require you to approve opening the downloaded app in Privacy & Security. [Apple’s instructions](https://support.apple.com/en-us/102445)

## License

Dilemma is AGPL-3.0-only. If you ship a fork or run it as a service, you have to publish your source under the same license. Some of the code comes from Enclose, which is AGPL-3.0 too, and [NOTICE.md](NOTICE.md) lists which files and what we changed.
