import { build } from 'esbuild'

/** Bundles the main and preload processes. Electron is provided at runtime. */
export async function buildElectron({ dev = false } = {}) {
  const common = {
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    external: ['electron'],
    sourcemap: dev ? 'inline' : false,
    minify: !dev,
    logLevel: 'warning',
  }
  await Promise.all([
    build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist/electron/main.cjs' }),
    build({
      ...common,
      entryPoints: ['electron/preload.ts'],
      outfile: 'dist/electron/preload.cjs',
    }),
  ])
}

if (import.meta.url === `file://${process.argv[1]}`) await buildElectron()
