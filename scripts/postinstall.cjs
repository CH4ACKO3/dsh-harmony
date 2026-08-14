const { dirname, join } = require('node:path')
const { ensureBootstrap, installShim, resolveCommandPath, resolveDshHome } = require('./install-shim.cjs')

if (process.env.npm_config_global !== 'true') process.exit(0)

const prefix = process.env.npm_config_prefix
const packageRoot = dirname(__dirname)
const globalModules = dirname(packageRoot)
const paths = {
  command: resolveCommandPath(prefix),
  harmony: join(packageRoot, 'lib/bin.js'),
  official: join(globalModules, '@deepseek-ai/dsh/lib/bin.js'),
}

installShim(paths)
ensureBootstrap({ home: resolveDshHome(), ...paths })
process.stdout.write('dsh-harmony installed into the existing dsh command\n')
