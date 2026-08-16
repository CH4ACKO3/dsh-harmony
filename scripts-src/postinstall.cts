import { join } from 'node:path'
import {
  ensureBootstrap,
  installShim,
  resolveCommandPath,
  resolveDshHome,
  resolveGlobalModules,
} from './install-shim.cjs'

if (process.env.npm_config_global !== 'true') process.exit(0)

const prefix = process.env.npm_config_prefix
if (prefix === undefined || prefix === '') throw new Error('npm did not provide its global installation prefix')
const globalModules = resolveGlobalModules(prefix)
const packageRoot = join(globalModules, 'dsh-harmony')
const paths = {
  command: resolveCommandPath(prefix),
  harmony: join(packageRoot, 'lib/bin.js'),
  official: join(globalModules, '@deepseek-ai/dsh/lib/bin.js'),
}

installShim(paths)
ensureBootstrap({ home: resolveDshHome(), ...paths })
process.stdout.write('dsh-harmony installed into the existing dsh command\n')
