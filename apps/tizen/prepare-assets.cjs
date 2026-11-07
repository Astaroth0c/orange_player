const { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs')
const { resolve } = require('node:path')

const destination = __dirname
const build = resolve(__dirname, '../web/dist')
const temp = resolve(__dirname, 'web-build')
rmSync(temp, { recursive: true, force: true })
mkdirSync(temp, { recursive: true })
cpSync(build, temp, { recursive: true })
let html = readFileSync(resolve(temp, 'index.html'), 'utf8')
html = html.replace('<head>', '<head>\n    <script src="$WEBAPIS/webapis/webapis.js"></script>')
html = html.replace('<script type="module"', '<script src="./tv-bridge.js"></script>\n    <script type="module"')
writeFileSync(resolve(temp, 'index.html'), html)
cpSync(resolve(__dirname, 'tv-bridge.js'), resolve(temp, 'tv-bridge.js'))
for (const entry of ['index.html', 'assets', 'orange-icon.svg', 'manifest.webmanifest', 'sw.js']) {
  const source = resolve(temp, entry)
  try { cpSync(source, resolve(destination, entry), { recursive: true, force: true }) } catch { /* Optional PWA files are absent in a vendor-specific build. */ }
}
rmSync(temp, { recursive: true, force: true })
