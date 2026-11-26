// Copyright (C) 2026 Glauber. Licensed AGPL-3.0-only.
// Taken from Enclose, apps/desktop/src/lib/platform.ts (github.com/enclosedev/enclose at b2da08e).
// Changed for Dilemma: unchanged. See NOTICE.md.

/** Whether this is a Mac, where the key for shortcuts is Cmd and elsewhere it is Ctrl. */
export const MAC = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** Whether this is Windows, which calls some things by names of its own. */
export const WINDOWS = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
