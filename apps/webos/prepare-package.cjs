const { cpSync, mkdirSync, rmSync } = require('node:fs')
const { resolve } = require('node:path')

const appRoot = __dirname
const staging = resolve(appRoot, 'package-src')
rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })
for (const file of ['appinfo.json', 'icon.png', 'largeIcon.png', 'index.html', 'orange-icon.svg', 'manifest.webmanifest', 'sw.js', 'assets']) {
  cpSync(resolve(appRoot, file), resolve(staging, file), { recursive: true })
}
