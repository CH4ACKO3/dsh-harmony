#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  discoverProfile,
  getPatchInspections,
  getPatchStatuses,
  inspectPatchTargets,
  installFileTransforms,
  installModuleHooks,
} from './runtime.js'
import { runHarmonyTui } from './tui.js'

const require = createRequire(import.meta.url)
const configuredDshEntry = process.env.DSH_HARMONY_DSH_ENTRY
const dshEntry = configuredDshEntry === undefined
  ? require.resolve('@deepseek-ai/dsh/lib/bin.js')
  : resolve(configuredDshEntry)
const dshRequire = createRequire(dshEntry)
process.env.DSH_HARMONY_ACTIVE = '1'
const { initProfile, PROFILE_TEMPLATES, resolveProfileDir } = await import(
  pathToFileURL(dshRequire.resolve('@deepseek-ai/dsh-app-boot')).href
)

const args = process.argv.slice(2)
const isPluginCommand = args[0] === 'plugin'
const isHarmonyCommand = args[0] === 'harmony'
const isDefaultDump = args.includes('--dump-default-config')
const profileOption = args.findIndex(argument => argument === '--profile' || argument.startsWith('--profile='))
if (isHarmonyCommand && profileOption !== -1 && args[profileOption] === '--profile'
  && (args[profileOption + 1] === undefined || args[profileOption + 1]!.startsWith('-'))) {
  process.stderr.write("error: option '--profile <name>' argument missing\n")
  process.exit(1)
}
const declaredProfile = profileOption === -1
  ? undefined
  : args[profileOption] === '--profile' ? args[profileOption + 1] : args[profileOption]!.slice('--profile='.length)
const profile = args[0] === 'web' || isHarmonyCommand && declaredProfile === undefined
  ? 'web'
  : declaredProfile
const profileDir = profile === undefined ? undefined : resolveProfileDir(profile)
const overlay = join(dirname(dirname(fileURLToPath(import.meta.url))), 'harmony.patch.yml')
const hasHarmonyBundle = profileDir !== undefined && existsSync(join(profileDir, 'package.json'))
  && (JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
    dsh?: { profile?: { bundles?: string[] } }
  }).dsh?.profile?.bundles?.includes('dsh-harmony') === true

if (isHarmonyCommand) {
  if (!existsSync(join(profileDir!, 'package.json')) && PROFILE_TEMPLATES[profile!] !== undefined) {
    initProfile(profileDir!, PROFILE_TEMPLATES[profile!])
  }
  installModuleHooks()
  discoverProfile(profileDir!)
  const harmonyArgs = []
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === '--profile') {
      index += 1
      continue
    }
    if (!args[index]!.startsWith('--profile=')) harmonyArgs.push(args[index]!)
  }
  const command = harmonyArgs[0]
  if (command === 'status' || command === 'inspect') {
    inspectPatchTargets(command === 'status')
    if (command === 'status') {
      const patches = getPatchStatuses()
      for (const patch of patches) {
        process.stdout.write(`${patch.state.padEnd(8)} ${patch.key} -> ${patch.target.package}/${patch.file ?? patch.target.files.join('|')}${patch.error === undefined ? '' : `\n  ${patch.error}`}\n`)
      }
      process.exit(patches.some(patch => patch.state === 'failed') ? 1 : 0)
    } else {
      const packageName = harmonyArgs[1]
      const fileIndex = args.indexOf('--file')
      const file = fileIndex === -1 ? undefined : args[fileIndex + 1]
      const inspections = getPatchInspections(packageName, file)
      for (const inspection of inspections) {
        process.stdout.write(`=== ${inspection.package}/${inspection.file} ===\n`)
        process.stdout.write(`--- original ---\n${inspection.original}\n`)
        for (const step of inspection.steps) process.stdout.write(`--- ${step.key} (${step.matches} match) ---\n${step.source}\n`)
        process.stdout.write(`--- final ---\n${inspection.final}\n`)
      }
    }
    process.exit(0)
  }
  await runHarmonyTui(profileDir!)
  process.exit(0)
}

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
