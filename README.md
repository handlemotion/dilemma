# Dilemma

Dilemma is an open source desktop app for animating 3D characters. You drop in a skinned character, confirm its joints and start posing with full-body IK, and the animation goes back to Maya or Blender as keys you can still edit.

We're making it for the animators at our studio, Chow Mein. It changes a lot and it's macOS only for now.

## What we're betting on

Contacts live on the timeline. "Hand grips the cup from frame 20 to 48" is a clip you can drag and trim. Editing one key re-solves the keys around it, so when you drag a motion path the neighboring keys follow with a falloff you control. There's also no rigging step, Dilemma reads the skeleton and skin weights from the file and builds its own controls on top. And whatever you make goes back to Maya and Blender as animation on their own controls, so a team can keep working there.

## Where it is now

Right now it loads a skinned glTF, shows the mesh and skeleton, plays the clip that came in the file, and lets you pick joints in the viewport or the skeleton panel. Posing and keying on plain FK comes next, with save, undo and glTF export, then controls and full-body IK. Contacts, motion paths and the Maya and Blender bridges come after that, and [docs/roadmap.md](docs/roadmap.md) has the rest of the plan.

## Running it

You need Node 24 and pnpm 11.

```sh
pnpm install
pnpm dev
```

Press ⌘O or drop a `.glb` or `.gltf` on the window. The camera moves the way Maya's does, Alt with the left, middle or right button turns, pans or zooms. On a trackpad a two-finger swipe turns and a pinch zooms. F frames the selection, Space plays, and the arrow keys step one frame. The Navigation menu in the toolbar switches the mouse buttons to Blender's layout or a trackpad-first one.

To put it in Applications, run `pnpm install-app`. It builds the app, signs it ad-hoc since there's no developer certificate yet, and replaces `/Applications/Dilemma.app`. There are no automatic updates in v0, so to update you pull and run it again.

`pnpm run check` runs the typecheck, lint, format check and tests, the same as CI. `pnpm fetch-assets` downloads a few skinned characters from the Khronos glTF sample assets for the import tests.

## License

Dilemma is AGPL-3.0-only. If you ship a fork or run it as a service, you have to publish your source under the same license. Some of the code comes from Enclose, which is AGPL-3.0 too, and [NOTICE.md](NOTICE.md) lists which files and what we changed.
