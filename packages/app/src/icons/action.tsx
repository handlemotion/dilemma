const glyphs = {
  move: (
    <>
      <path
        d="M10 2l2.5 4.5h-5L10 2Zm8 8-4.5 2.5v-5L18 10Zm-8 8-2.5-4.5h5L10 18ZM2 10l4.5-2.5v5L2 10Z"
        fill="currentColor"
        stroke="none"
      />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  rotate: (
    <>
      <path d="M15 5a7 7 0 1 0 2 6M15 2v3h-3" />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  scale: (
    <>
      <path d="M5 4v11h11M5 15l10-10" />
      <rect x="3.5" y="2.5" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="3.5" y="13.5" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="13.5" y="3.5" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="14.5" y="13.5" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
    </>
  ),
  pose: (
    <>
      <path d="m4.5 14.5 5-9 6 5" />
      <circle cx="4.5" cy="14.5" r="2" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="5.5" r="2" fill="currentColor" stroke="none" />
      <rect x="13.5" y="8.5" width="4" height="4" rx="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  pinEffector: (
    <>
      <path d="M10 12v5" />
      <path
        d="M6.5 3h7v1.5h-2v4.75l2.5 2.75H6l2.5-2.75V4.5h-2V3Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  importCharacter: (
    <>
      <circle cx="6.5" cy="6" r="2.5" fill="currentColor" stroke="none" />
      <path d="M2.5 16v-2a4 4 0 0 1 8 0v2h-8Z" fill="currentColor" stroke="none" />
      <path d="M18 9h-5m2.5-2.5L13 9l2.5 2.5" />
    </>
  ),
  newClip: (
    <>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M7 4v12m3-6h4m-2-2v4" />
    </>
  ),
  rigMapping: (
    <>
      <path d="M10 5v5m-5 5v-5h10v5" />
      <circle cx="10" cy="4.5" r="2" fill="currentColor" stroke="none" />
      <circle cx="5" cy="15.5" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15.5" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  exportAnimation: (
    <>
      <path d="M3 13v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
      <path d="M10 13V4M6 8l4-4 4 4" />
    </>
  ),
  setKey: (
    <>
      <path d="m7 5.5 4.5 4.5-4.5 4.5L2.5 10 7 5.5Z" fill="currentColor" stroke="none" />
      <path d="M13 6h4m-2-2v4" />
    </>
  ),
  keysView: (
    <>
      <path d="M3 5.5h14M3 14.5h14" />
      <path
        d="m7 5.5 2.5-2.5 2.5 2.5L9.5 8 7 5.5Zm-2 9L7.5 12l2.5 2.5L7.5 17 5 14.5Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  curvesView: (
    <>
      <path d="M3.5 3v13.5H17M6.5 13.5c4.5 0 3.5-8 9-8" />
      <path
        d="m5 13.5 1.5-1.5L8 13.5 6.5 15 5 13.5ZM14 5.5 15.5 4 17 5.5 15.5 7 14 5.5Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  deleteKey: (
    <>
      <path d="m7 5.5 4.5 4.5L7 14.5 2.5 10 7 5.5Z" fill="currentColor" stroke="none" />
      <path d="M13 6h4" />
    </>
  ),
  fitCurves: <path d="M3 7V3h4m6 0h4v4m0 6v4h-4m-6 0H3v-4m3.5-.5c3.5 0 3.5-5 7-5" />,
  resetPosition: (
    <>
      <path d="M3.75 6V3.75H6m8 0h2.25V6m0 8v2.25H14m-8 0H3.75V14" />
      <path d="m13.5 6.5-6 6m0-3.5v3.5H11" />
    </>
  ),
  resetRotation: (
    <>
      <path d="M15.25 7a6 6 0 1 0 .75 5m0-8.5V7h-3.5" />
      <path d="M10 7.5V11l2 1.5" />
    </>
  ),
  resetSelected: (
    <>
      <path d="M6.25 3.75h-2.5v12.5h2.5m7.5-12.5h2.5v12.5h-2.5" />
      <path d="M12.75 12.5v-1.25a2 2 0 0 0-2-2h-3.5m2-2-2 2 2 2" />
    </>
  ),
  mirrorPose: (
    <>
      <path d="M10 3v2.5m0 3.25v2.5m0 3.25V17" />
      <path d="M6.5 6.75v6.5H3l3.5-6.5Zm7 0v6.5H17l-3.5-6.5Z" />
    </>
  ),
  copyPose: (
    <>
      <path d="M3.75 12.75V5A1.25 1.25 0 0 1 5 3.75h7.75" />
      <rect x="7.25" y="7.25" width="9" height="9" rx="1.25" />
      <path d="m11.75 9.75 2 2-2 2-2-2 2-2Z" fill="currentColor" stroke="none" />
    </>
  ),
  pastePose: (
    <>
      <path d="M7.25 5.75H5.5a1 1 0 0 0-1 1V16a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6.75a1 1 0 0 0-1-1h-1.75" />
      <rect x="7.25" y="3.25" width="5.5" height="3.5" rx="1" />
      <path d="m10 9 2.75 2.75L10 14.5l-2.75-2.75L10 9Z" fill="currentColor" stroke="none" />
    </>
  ),
  matchWorld: (
    <>
      <path d="M3.5 10.25h7.25m-2.25-2.5 2.5 2.5-2.5 2.5" />
      <path d="M6 5.5a6.25 6.25 0 1 1 0 9.5m4.25-11c2.5 1.25 3.5 3.25 3.5 6.25s-1 5-3.5 6.25" />
    </>
  ),
  tween: (
    <>
      <path
        d="m4.25 7 3 3-3 3-3-3 3-3Zm11.5 0 3 3-3 3-3-3 3-3Z"
        fill="currentColor"
        stroke="none"
      />
      <path d="m10 8 2 2-2 2-2-2 2-2Z" />
    </>
  ),
  holdPose: (
    <>
      <path d="m5 6.25 3.75 3.75L5 13.75 1.25 10 5 6.25Z" fill="currentColor" stroke="none" />
      <path d="M10.5 10h5m.75-3.75v7.5" />
    </>
  ),
  addContact: (
    <>
      <path d="M3.25 15.25h13.5m-12-4.75a4.75 4.75 0 0 1 4.75-4.75m2.25 4.75h5m-2.5-2.5v5" />
      <circle cx="4.75" cy="12.25" r="1.75" fill="currentColor" stroke="none" />
    </>
  ),
  removeContact: <path d="m6 6 8 8m0-8-8 8" />,
  motionTrails: (
    <>
      <path d="M3.5 14.75c1.25-7.5 3.75-9.5 6.5-6.75 2.25 2.25 4.75 4 6.5-3.5" />
      <circle cx="3.5" cy="14.75" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="10" cy="8" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="4.5" r="1.75" fill="currentColor" stroke="none" />
    </>
  ),
}

export type ActionIconName = keyof typeof glyphs

export function ActionIcon({ name }: { name: ActionIconName }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyphs[name]}
    </svg>
  )
}
