import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import { buildElectron } from './build-electron.mjs'

const server = await createServer({ configFile: 'vite.config.ts' })
await Promise.all([server.listen(), buildElectron({ dev: true })])
const url = server.resolvedUrls?.local[0]
if (!url) throw new Error('Vite did not report a local URL.')

const electron = createRequire(import.meta.url)('electron')
const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
})
child.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
