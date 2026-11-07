const { cpSync, mkdirSync, rmSync } = require('node:fs')
const { resolve } = require('node:path')

const destination = resolve(__dirname, 'resources/web')
rmSync(destination, { recursive: true, force: true })
mkdirSync(destination, { recursive: true })
cpSync(resolve(__dirname, '../web/dist'), destination, { recursive: true })
