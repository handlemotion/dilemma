// Puts the locally packaged app in /Applications, replacing the one there.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const release = path.resolve(import.meta.dirname, '..', 'release')
const folder = readdirSync(release).find((name) => name.startsWith('mac'))
const built = folder && path.join(release, folder, 'Dilemma.app')
if (!built || !existsSync(built)) throw new Error('No packaged app. Run `pnpm run package` first.')

// The local package skips signing. Apply an ad-hoc signature so the app can open on this Mac.
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
