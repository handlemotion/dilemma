import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * Proves the import boundary rule fails CI: lints probe files laid out like
 * the repo, in a temporary copy, with the repo's own oxlint config.
 */
const repo = path.resolve(import.meta.dirname, '..')
const oxlint = path.join(repo, 'node_modules/.bin/oxlint')
const root = mkdtempSync(path.join(tmpdir(), 'dilemma-boundaries-'))
copyFileSync(path.join(repo, '.oxlintrc.json'), path.join(root, '.oxlintrc.json'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function lint(file: string, source: string): { ok: boolean; output: string } {
  const full = path.join(root, file)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, source)
  try {
    const output = execFileSync(oxlint, ['--deny-warnings', '-c', '.oxlintrc.json', file], {
      cwd: root,
      encoding: 'utf8',
    })
    return { ok: true, output }
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string }
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

describe('import boundaries', () => {
  it.each([
    [
      'packages/core/src/probe-three.ts',
      "import { Vector3 } from 'three'\nexport const v = Vector3\n",
    ],
    [
      'packages/core/src/probe-react.ts',
      "import { useState } from 'react'\nexport const u = useState\n",
    ],
    [
      'packages/core/src/probe-solve.ts',
      "import { solvePose } from '@dilemma/solve'\nexport const s = solvePose\n",
    ],
    [
      'packages/solve/src/probe-electron.ts',
      "import { app } from 'electron'\nexport const a = app\n",
    ],
    [
      'packages/solve/src/probe-addon.ts',
      "import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'\nexport const g = GLTFLoader\n",
    ],
    [
      'packages/solve/src/probe-node.ts',
      "import { readFileSync } from 'node:fs'\nexport const r = readFileSync\n",
    ],
    [
      'packages/view/src/probe-react.ts',
      "import { useState } from 'react'\nexport const u = useState\n",
    ],
    [
      'packages/view/src/probe-relative.ts',
      "import { editor } from '../../app/src/editor.ts'\nexport const e = editor\n",
    ],
  ])('%s fails lint', (file, source) => {
    const result = lint(file, source)
    expect(result.ok, result.output).toBe(false)
    expect(result.output).toMatch(/no-restricted-imports/)
  })

  it.each([
    [
      'packages/solve/src/probe-core.ts',
      "import type { Clip } from '@dilemma/core'\nexport type C = Clip\n",
    ],
    [
      'packages/view/src/probe-three.ts',
      "import { Vector3 } from 'three'\nexport const v = Vector3\n",
    ],
    [
      'packages/app/src/probe-react.ts',
      "import { useState } from 'react'\nexport const u = useState\n",
    ],
  ])('%s passes lint', (file, source) => {
    const result = lint(file, source)
    expect(result.ok, result.output).toBe(true)
  })
})
