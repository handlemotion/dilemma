import { migrate } from '@dilemma/core'
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeWholeSoon } from './atomic.ts'
import { writeFbx } from './fbx.ts'
import {
  ASSET_SCHEME,
  Channels,
  type MenuAction,
  type OpenedFile,
  type OpenedProject,
} from './ipc.ts'

const CHARACTER_EXTENSIONS = ['glb', 'gltf']
const PROJECT_FILTER = { name: 'Dilemma project', extensions: ['dilemma'] }

/** Folders the user opened a file from. The asset protocol serves nothing outside them. */
const allowedRoots = new Map<string, string>()
const projectFiles = new Set<string>()

protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])

async function allow(file: string): Promise<OpenedFile> {
  const resolved = path.resolve(file)
  const ext = path.extname(resolved).slice(1).toLowerCase()
  if (!CHARACTER_EXTENSIONS.includes(ext))
    throw new Error(`Dilemma opens .glb and .gltf files, not .${ext}.`)
  if (!(await stat(resolved)).isFile()) throw new Error(`${resolved} is not a file.`)
  const actual = await realpath(resolved)
  const root = path.dirname(actual)
  const token = [...allowedRoots].find(([, dir]) => dir === root)?.[0] ?? randomUUID()
  allowedRoots.set(token, root)
  return {
    path: resolved,
    url: `${ASSET_SCHEME}://${token}/${encodeURIComponent(path.basename(actual))}`,
    name: path.basename(resolved),
  }
}

function inside(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return (
    Boolean(relative) &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

async function openProject(file: string): Promise<OpenedProject> {
  const doc = migrate(JSON.parse(await readFile(file, 'utf8')))
  const sources = await Promise.all(
    doc.characters.map(async (character) => {
      const source = path.resolve(path.dirname(file), character.source.uri)
      try {
        return await allow(source)
      } catch (error) {
        throw new Error(`Could not open the source for ${character.name}: ${source}`, {
          cause: error,
        })
      }
    }),
  )
  projectFiles.add(file)
  return { path: file, doc, sources }
}

/** The window once its page has loaded, and the files asked for before then. */
let loaded: BrowserWindow | null = null
const waiting: string[] = []

/** Open a character file in the window: one passed on the command line, dropped on the Dock, or DILEMMA_OPEN. */
function openPath(file: string): void {
  if (!loaded || loaded.isDestroyed()) {
    waiting.push(file)
    return
  }
  const window = loaded
  void allow(file).then(
    (opened) => window.webContents.send(Channels.openFile, opened),
    (error: unknown) => console.error(error),
  )
}

/** The character files among a process's arguments. */
const filesIn = (argv: string[]) =>
  argv.filter((arg) => !arg.startsWith('-') && /\.(glb|gltf)$/i.test(arg))

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f5f6f8',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 10 },
    autoHideMenuBar: !isMac,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  window.once('ready-to-show', () => window.show())
  window.webContents.once('did-finish-load', () => {
    loaded = window
    for (const file of waiting.splice(0)) openPath(file)
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  const devServer = process.env['VITE_DEV_SERVER_URL']
  if (devServer) void window.loadURL(devServer)
  else void window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  return window
}

function send(action: MenuAction): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(Channels.menu, action)
}

function showExportDialog(name: string, format: 'glb' | 'fbx') {
  return dialog.showSaveDialog({
    title: `Export ${format.toUpperCase()}`,
    defaultPath: `${name.replace(/[\\/:]/g, '_') || 'Animation'}.${format}`,
    filters: [{ name: format === 'glb' ? 'Binary glTF' : 'FBX', extensions: [format] }],
  })
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      {
        label: 'File',
        submenu: [
          { label: 'Import Character…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
          {
            label: 'Open Project…',
            accelerator: 'Shift+CmdOrCtrl+O',
            click: () => send('openProject'),
          },
          { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: () => send('saveProject') },
          {
            label: 'Save Project As…',
            accelerator: 'Shift+CmdOrCtrl+S',
            click: () => send('saveProjectAs'),
          },
          { label: 'Export GLB…', click: () => send('exportGlb') },
          { label: 'Export FBX…', click: () => send('exportFbx') },
          { type: 'separator' },
          isMac ? { role: 'close' } : { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          // Undo and redo go to the document's command log, not the web contents.
          { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
          { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: () => send('redo') },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Timeline',
        submenu: [
          { label: 'Play / Pause', click: () => send('togglePlayback') },
          { label: 'Toggle Loop Playback', click: () => send('toggleLoopPlayback') },
          { type: 'separator' },
          { label: 'New Clip', click: () => send('newClip') },
          { label: 'Set Key', click: () => send('keySelection') },
          { label: 'Delete Selected Keys', click: () => send('deleteKeys') },
        ],
      },
      { role: 'windowMenu' },
    ]),
  )
}

// Copyright (C) 2026 Glauber, AGPL-3.0-only: the single-instance handling below follows
// Enclose's apps/desktop/electron/main.ts (github.com/enclosedev/enclose at b2da08e).
// One app at a time: starting it again, as opening a file with it does, goes to the one
// that is open.
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', (_event, argv) => {
  for (const file of filesIn(argv.slice(1))) openPath(file)
  const window = loaded ?? BrowserWindow.getAllWindows()[0]
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
})
// (on a Mac, before the app is ready too, where a file is what started it)
app.on('open-file', (event, file) => {
  event.preventDefault()
  openPath(file)
})
const initial = process.env['DILEMMA_OPEN']
if (initial) waiting.push(initial)
waiting.push(...filesIn(process.argv.slice(app.isPackaged ? 1 : 2)))

void app.whenReady().then(() => {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const root = allowedRoots.get(url.hostname)
      if (root && request.method === 'GET') {
        const file = path.resolve(root, decodeURIComponent(url.pathname.slice(1)))
        if (inside(root, file)) {
          const actual = await realpath(file)
          if (inside(root, actual) && (await stat(actual)).isFile()) {
            return await net.fetch(pathToFileURL(actual).toString())
          }
        }
      }
    } catch {
      return new Response('Not found', { status: 404 })
    }
    return new Response('Not found', { status: 404 })
  })

  ipcMain.handle(Channels.openCharacter, async (): Promise<OpenedFile | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Import Character',
      properties: ['openFile'],
      filters: [{ name: 'glTF character', extensions: CHARACTER_EXTENSIONS }],
    })
    const file = result.filePaths[0]
    return result.canceled || !file ? null : allow(file)
  })
  ipcMain.handle(Channels.allowFile, (_event, file: unknown) => {
    if (typeof file !== 'string') throw new Error('Expected a file path.')
    return allow(file)
  })
  ipcMain.handle(Channels.openProject, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Project',
      properties: ['openFile'],
      filters: [PROJECT_FILTER],
    })
    const file = result.filePaths[0]
    return result.canceled || !file ? null : openProject(path.resolve(file))
  })
  ipcMain.handle(
    Channels.saveProject,
    async (_event, raw: unknown, current: unknown, saveAs: unknown) => {
      const doc = migrate(raw)
      let file = typeof current === 'string' && projectFiles.has(current) ? current : null
      if (!file || saveAs === true) {
        const result = await dialog.showSaveDialog({
          title: 'Save Project',
          defaultPath: file ?? 'Untitled.dilemma',
          filters: [PROJECT_FILTER],
        })
        if (result.canceled || !result.filePath) return null
        file = path.resolve(result.filePath)
      }
      const characters = doc.characters.map((character) => ({
        ...character,
        source: { uri: path.relative(path.dirname(file), character.source.uri) },
      }))
      await writeWholeSoon(file, `${JSON.stringify({ ...doc, characters }, null, 2)}\n`)
      projectFiles.add(file)
      return file
    },
  )
  ipcMain.handle(Channels.exportGlb, async (_event, bytes: unknown, name: unknown) => {
    if (!(bytes instanceof ArrayBuffer) || typeof name !== 'string') {
      throw new Error('Expected a binary GLB and a clip name.')
    }
    const result = await showExportDialog(name, 'glb')
    if (result.canceled || !result.filePath) return null
    await writeWholeSoon(result.filePath, new Uint8Array(bytes))
    return result.filePath
  })
  ipcMain.handle(
    Channels.exportFbx,
    async (_event, bytes: unknown, name: unknown, fps: unknown, lastFrame: unknown) => {
      if (
        !(bytes instanceof ArrayBuffer) ||
        typeof name !== 'string' ||
        typeof fps !== 'number' ||
        !Number.isFinite(fps) ||
        fps <= 0 ||
        typeof lastFrame !== 'number' ||
        !Number.isSafeInteger(lastFrame) ||
        lastFrame < 0
      ) {
        throw new Error('Expected a baked GLB and valid clip timing.')
      }
      const result = await showExportDialog(name, 'fbx')
      if (result.canceled || !result.filePath) return null
      await writeFbx(result.filePath, bytes, name, fps, lastFrame)
      return result.filePath
    },
  )

  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
