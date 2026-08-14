const { spawn } = require('node:child_process')

const [parentText, command, argsText] = process.argv.slice(2)
const parent = Number(parentText)
const args = JSON.parse(argsText)

const timer = setInterval(() => {
  try {
    process.kill(parent, 0)
  } catch {
    clearInterval(timer)
    const child = spawn(process.execPath, [command, ...args], { detached: true, env: process.env, stdio: 'inherit' })
    child.unref()
  }
}, 100)
