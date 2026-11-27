# Roadmap

This is where Dilemma is headed in the long run. It started as the brief I wrote on November 26, 2026, and it's a direction more than a spec, so the order and the details move as we learn from using it.

## What it's for

Dilemma is a desktop app for animating 3D characters. You drop in a skinned character, Dilemma builds controls on it, and you pose and key with full-body IK and contacts. The animation then goes back to Maya and Blender. We're making it for the character animators at our studio, Chow Mein, and we'd like their feedback on real characters as often as we can get it.

A few bets shape everything else, most important first.

1. Contacts are objects on the timeline. "Hand grips the cup from frame 20 to 48" is a clip you drag and trim, not a constraint you key on and off.
2. Editing one key re-solves the keys around it. You drag a motion path and the neighboring keys follow with a falloff.
3. Rigging isn't a step. You drop in a character, confirm the joints and start posing.
4. Work goes back to Maya and Blender as animation you can keep editing there, not only as baked joints.

Some things we're leaving to the tools that already do them well. Dilemma doesn't model, sculpt, texture or render, and it does bodies and hands, no faces. It doesn't run Maya or Blender rigs either, it imports the skeleton, skin weights and shapes and builds its own controls on top. Skin weights come in with the file for now, and automatic weights come later instead of a weight painting tool.

## How it's built

It's an Electron app in TypeScript, with React, Tailwind and Base UI for the panels and a three.js viewport driven directly, so a solve every frame never goes through React. The timeline is our own canvas because it's the heart of the product and no library fits it.

The code is five packages and imports only point down, `app` on top, then `view` and `io`, then `solve`, and `core` under everything. That split is there so the parts can change on their own. If the solver gets slow we can port `solve` to Rust and WebAssembly without touching anything else, and the viewport can move from WebGL to WebGPU behind `view` the same way.

We reuse what's good at loading, drawing, picking and collision, three.js for skinned meshes and glTF, three-mesh-bvh for picking and later for finger contact against surfaces, and Rapier for capsule collisions. Some of the app shell and viewport navigation comes from Enclose, which is AGPL like us. The solver, contacts, the key model and the timeline we write ourselves, since those are the product. The same goes for the Maya and Blender bridges, which are Python plugins.

## The milestones

**M1, load and look.** Import a skinned glTF, show the mesh and skeleton, play the clip inside it, navigate with a mouse or trackpad and pick joints. This one is done.

**M2, pose and key on FK.** Rotate joints with a gizmo, set and delete keys on a simple timeline with frames, key markers and a playhead, and interpolate between keys. Save and load a project file, undo and redo everything, and export glTF with the animation baked. FBX export probably runs through headless Blender, since three.js has no FBX exporter.

**M3, controls and full-body IK.** Controls built automatically on a humanoid skeleton, matched by joint name with a panel for the ones that don't match. Effectors for the hands, feet, hips, chest and head, two-bone IK for the limbs and then a full-body pass, pins that hold an effector in place while the rest moves, and bend hints for elbows and knees. three.js's CCD solver can stand in while ours gets built, and ossos is a good reference for full-body IK.

**M4, contact clips.** Hand to prop and foot to floor as clips on the timeline, with the pose compensated automatically where a contact starts or ends.

**M5, motion paths.** Edit the path in the viewport, with the falloff across neighboring keys.

**M6, collisions.** Capsules for bumping and pushing, and fingers that curl against the surface of a prop.

**M7, bridges.** Plugins that put Dilemma's keys on Maya and Blender controls, so the animation stays editable there.

**M8, automatic rigging.** A skeleton and skin weights for meshes that come in without them, possibly with UniRig running as a Python sidecar.

**M9, fixing weights by posing.** Drag the vertices that look wrong in a pose and Dilemma solves the weights that fix them.

Further out, if it turns out to be useful, Dilemma could get a panel for talking to a coding agent.

## Still open

- Whether keys live on the controls or on the joints. Keys on controls keep the Maya round trip editable, keys on joints keep export simple. We need to settle it before M3.
- How FBX export works for the animators on Maya, headless Blender or something else.
- The project file's extension and what the format is called.
- Windows. It's macOS only for now.
- The licenses of ossos and UniRig, which we haven't checked yet.
