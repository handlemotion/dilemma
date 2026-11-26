// Puts the packaged app in /Applications, replacing the one there. For v0 the app is
// updated by hand this way: pull, then `pnpm install-app` from the repository root.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const release = path.resolve(import.meta.dirname, '..', 'release')
const folder = readdirSync(release).find((name) => name.startsWith('mac'))
const built = folder && path.join(release, folder, 'Dilemma.app')
if (!built || !existsSync(built)) throw new Error('No packaged app. Run `pnpm run package` first.')

// There's no developer certificate for v0. Packaging leaves Electron's own signature
// broken, and Apple silicon won't open an app like that, so it gets an ad-hoc signature,
// which is enough for an app built on this Mac.
execFileSync('codesign', ['--force', '--deep', '--sign', '-', built], { stdio: 'inherit' })

const target = '/Applications/Dilemma.app'
// A running copy keeps its old files open: quit it first.
try {
  execFileSync('osascript', ['-e', 'quit app "Dilemma"'], { stdio: 'ignore' })
} catch {
  // not running
}
execFileSync('rm', ['-rf', target])
execFileSync('ditto', [built, target])
console.log(`Installed ${target}`)
