import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ASSET_SCHEME, Channels, type MenuAction, type OpenedFile } from './ipc.ts'

const CHARACTER_EXTENSIONS = ['glb', 'gltf']

/** Folders the user opened a file from. The asset protocol serves nothing outside them. */
const allowedRoots = new Set<string>()

protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])

function assetUrl(file: string): string {
  return `${ASSET_SCHEME}://file/${encodeURIComponent(file)}`
}

async function allow(file: string): Promise<OpenedFile> {
  const resolved = path.resolve(file)
  const ext = path.extname(resolved).slice(1).toLowerCase()
  if (!CHARACTER_EXTENSIONS.includes(ext))
    throw new Error(`Dilemma opens .glb and .gltf files, not .${ext}.`)
  if (!(await stat(resolved)).isFile()) throw new Error(`${resolved} is not a file.`)
  allowedRoots.add(path.dirname(resolved))
  return { path: resolved, url: assetUrl(resolved), name: path.basename(resolved) }
}

function isAllowed(file: string): boolean {
  for (const root of allowedRoots) {
    const relative = path.relative(root, file)
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return true
  }
  return false
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
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0b0c',
    titleBarStyle: 'hiddenInset',
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

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      {
        label: 'File',
        submenu: [
          { label: 'Import Character…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
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
          {
            label: 'Frame Selection',
            accelerator: 'F',
            click: () => send('frame'),
            registerAccelerator: false,
          },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
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
    const file = path.resolve(decodeURIComponent(new URL(request.url).pathname.slice(1)))
    if (!isAllowed(file)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
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

  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
