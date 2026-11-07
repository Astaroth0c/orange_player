const { cpSync } = require('node:fs')
const { resolve } = require('node:path')

const destination = __dirname
const source = resolve(__dirname, '../web/dist')
for (const entry of ['index.html', 'assets', 'orange-icon.svg', 'manifest.webmanifest', 'sw.js']) {
  const input = resolve(source, entry)
  try { cpSync(input, resolve(destination, entry), { recursive: true, force: true }) } catch { /* Optional PWA files are absent in a TV package. */ }
}
