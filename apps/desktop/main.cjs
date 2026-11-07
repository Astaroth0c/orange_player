const { app, BrowserWindow, ipcMain, protocol } = require('electron')
const { URL } = require('node:url')
const path = require('node:path')

protocol.registerSchemesAsPrivileged([{
  scheme: 'orange-media',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}])

function httpUrl(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) media sources are supported.')
  return url
}

function proxiedUrl(remoteUrl) {
  return `orange-media://proxy/stream?url=${encodeURIComponent(remoteUrl)}`
}

function rewritePlaylist(text, upstreamUrl) {
  const proxy = value => proxiedUrl(new URL(value, upstreamUrl).href)
  return text.split(/\r?\n/).map(line => {
    if (!line.trim()) return line
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${proxy(uri)}"`)
    return proxy(line.trim())
  }).join('\n')
}

let mainWindow

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: '#101419',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', event => {
    if (!event.url.startsWith('file://')) event.preventDefault()
  })
  await mainWindow.loadFile(path.join(__dirname, 'resources/web/index.html'))
}

app.whenReady().then(async () => {
  protocol.handle('orange-media', async request => {
    try {
      const target = httpUrl(new URL(request.url).searchParams.get('url') || '')
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range, Content-Type' } })
      const headers = new Headers()
      const range = request.headers.get('range')
      if (range) headers.set('range', range)
      const upstream = await fetch(target, { headers, signal: request.signal })
      const contentType = upstream.headers.get('content-type') || ''
      const playlist = /mpegurl/i.test(contentType) || /\.m3u8?($|\?)/i.test(target.pathname + target.search)
      let body = upstream.body
      if (playlist) body = rewritePlaylist(await upstream.text(), target.href)
      const responseHeaders = new Headers({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
        'Cache-Control': 'no-store',
      })
      for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        if (playlist && key === 'content-length') continue
        const value = upstream.headers.get(key)
        if (value) responseHeaders.set(key, value)
      }
      if (playlist) responseHeaders.set('content-type', 'application/vnd.apple.mpegurl')
      return new Response(body, { status: upstream.status, headers: responseHeaders })
    } catch {
      return new Response('Media source unavailable', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } })
    }
  })

  ipcMain.handle('orange:fetch-text', async (_event, value) => {
    const target = httpUrl(value)
    const response = await fetch(target, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) return { ok: false, status: response.status, text: '' }
    const text = await response.text()
    if (text.length > 64 * 1024 * 1024) throw new Error('Source response exceeds the 64 MB limit.')
    return { ok: true, status: response.status, text }
  })
  ipcMain.handle('orange:media-url', (_event, value) => proxiedUrl(httpUrl(value).href))

  await createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
