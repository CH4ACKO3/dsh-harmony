import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dshEntry, initProfile, PROFILE_TEMPLATES } from './dsh.js'
import { discoverProfile, installFileTransforms, installModuleHooks } from './runtime.js'

export async function launchDsh(args: string[], profile: string | undefined, profileDir: string | undefined): Promise<void> {
  const isPluginCommand = args[0] === 'plugin'
  const isDefaultDump = args.includes('--dump-default-config')
  const overlay = join(dirname(dirname(fileURLToPath(import.meta.url))), 'harmony.patch.yml')
  const hasHarmonyBundle = profileDir !== undefined && existsSync(join(profileDir, 'package.json'))
    && (JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      dsh?: { profile?: { bundles?: string[] } }
    }).dsh?.profile?.bundles?.includes('dsh-harmony') === true

  installModuleHooks()
  installFileTransforms()

  if (!isPluginCommand && profileDir !== undefined && !existsSync(join(profileDir, 'package.json'))
    && profile !== undefined && PROFILE_TEMPLATES[profile] !== undefined) {
    initProfile(profileDir, PROFILE_TEMPLATES[profile])
  }

  if (!isPluginCommand && profileDir !== undefined && existsSync(join(profileDir, 'package.json'))) {
    discoverProfile(profileDir)
  }

  if (!isPluginCommand && !isDefaultDump && profile !== undefined && !hasHarmonyBundle) {
    if (args[0] === 'web') process.argv.splice(3, 0, '--patch', overlay)
    else process.argv.splice(2, 0, '--patch', overlay)
  }

  await import(pathToFileURL(dshEntry).href)
}
