#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  discoverProfile,
  currentProfile,
  getPatchInspections,
  getPatchOrderViolations,
  getPatchStatuses,
  inspectPatchTargets,
  installFileTransforms,
  installModuleHooks,
} from './runtime.js'
import {
  inspectHarmonyRuntime,
  readHarmonyRuntime,
  updateHarmonyProfile,
  updateRuntimePatch,
} from './control.js'
import { createHarmonyProfileView } from './profile.js'
import { runHarmonyTui } from './tui.js'
import type { HarmonyInspection, HarmonyProfileUpdateResult } from './index.js'

const require = createRequire(import.meta.url)
const writeStdout = (output: string) => new Promise<void>((resolve, reject) => {
  process.stdout.write(output, error => error === null || error === undefined ? resolve() : reject(error))
})
const HARMONY_HELP = `Usage:
  dsh harmony [--profile <name>]
  dsh harmony status [--json] [--profile <name>]
  dsh harmony inspect [package] [--file <file>] [--json] [--profile <name>]
  dsh harmony enable <provider/id> [--json] [--profile <name>]
  dsh harmony disable <provider/id> [--json] [--profile <name>]
  dsh harmony enable-provider <provider> [--json] [--profile <name>]
  dsh harmony disable-provider <provider> [--json] [--profile <name>]
`

function fail(message: string): never {
  process.stderr.write(`error: ${message}\n`)
  process.exit(1)
}
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
  if (!existsSync(join(profileDir!, 'package.json'))) {
    fail(`profile ${JSON.stringify(profile)} does not exist; create it with dsh plugin --profile ${profile} add <package>`)
  }
  const harmonyArgs = []
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === '--profile') {
      index += 1
      continue
    }
    if (!args[index]!.startsWith('--profile=')) harmonyArgs.push(args[index]!)
  }
  const command = harmonyArgs[0]
  const json = harmonyArgs.includes('--json')
  const offlineInspection = (): { mode: 'offline'; profile: ReturnType<typeof createHarmonyProfileView> } & HarmonyInspection => {
    installModuleHooks()
    discoverProfile(profileDir!)
    inspectPatchTargets(true)
    const patches = getPatchStatuses()
    const patchCounts = new Map(currentProfile().plugins.map(plugin => [plugin.name, 0]))
    for (const patch of patches) patchCounts.set(patch.owner, (patchCounts.get(patch.owner) ?? 0) + 1)
    return {
      mode: 'offline',
      profile: createHarmonyProfileView(currentProfile(), patchCounts, getPatchOrderViolations()),
      patches,
      targets: getPatchInspections(),
    }
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    if (harmonyArgs.length !== 1) fail('help takes no arguments')
    await writeStdout(HARMONY_HELP)
    process.exit(0)
  }

  if (command === 'status') {
    if (harmonyArgs.some((arg, index) => index > 0 && arg !== '--json')) fail('status accepts only --json')
    const live = await readHarmonyRuntime(profileDir!)
    const status = live === undefined
      ? (() => {
          const offline = offlineInspection()
          return { mode: 'offline' as const, profile: offline.profile, patches: offline.patches }
        })()
      : { mode: 'live' as const, ...live }
    if (json) {
      await writeStdout(`${JSON.stringify(status, null, 2)}\n`)
    } else {
      await writeStdout(`profile  ${status.profile.dir.split('/').at(-1)} (${status.mode})\n`)
      for (const conflict of status.profile.pluginConflicts) {
        await writeStdout(`warning  ${conflict.left.package}@${conflict.left.version} conflicts with ${conflict.right.package}@${conflict.right.version}\n`)
      }
      for (const patch of status.patches) {
        const targets = patch.targets.map(target => `${target.package}/${target.files.join('|')}`).join(', ')
        await writeStdout(`${patch.state.padEnd(8)} ${patch.key} [${patch.kind}] -> ${patch.file ?? targets}\n`)
        await writeStdout(`  loaded=${patch.loaded} matches=${patch.matches} generation=${patch.generation}${patch.error === undefined ? '' : `\n  ${patch.error}`}\n`)
      }
    }
    process.exit(status.patches.some(patch => patch.state === 'failed') ? 1 : 0)
  }

  if (command === 'inspect') {
    let packageName: string | undefined
    let file: string | undefined
    for (let index = 1; index < harmonyArgs.length; index += 1) {
      const argument = harmonyArgs[index]!
      if (argument === '--json') continue
      if (argument === '--file') {
        file = harmonyArgs[++index]
        if (file === undefined || file.startsWith('-')) fail('--file requires a value')
        continue
      }
      if (argument.startsWith('-')) fail(`unknown option ${JSON.stringify(argument)}`)
      if (packageName !== undefined) fail('inspect accepts at most one package')
      packageName = argument
    }
    const live = await inspectHarmonyRuntime(profileDir!, packageName, file)
    const inspection = live ?? (() => {
      const offline = offlineInspection()
      return {
        patches: offline.patches,
        targets: getPatchInspections(packageName, file),
      }
    })()
    if (inspection.targets.length === 0) fail('no matching Patch target was found')
    if (json) {
      await writeStdout(`${JSON.stringify(inspection, null, 2)}\n`)
    } else {
      for (const target of inspection.targets) {
        await writeStdout(`=== ${target.package}/${target.file} ===\n`)
        await writeStdout(`--- original ---\n${target.original}\n`)
        for (const step of target.steps) await writeStdout(`--- ${step.key} (${step.matches} match) ---\n${step.source}\n`)
        await writeStdout(`--- final ---\n${target.final}\n`)
      }
    }
    process.exit(0)
  }

  if (['enable', 'disable', 'enable-provider', 'disable-provider'].includes(command ?? '')) {
    const positional = harmonyArgs.slice(1).filter(argument => argument !== '--json')
    if (positional.length !== 1 || positional[0]!.startsWith('-')) fail(`${command} requires exactly one target`)
    if (harmonyArgs.slice(1).some(argument => argument.startsWith('-') && argument !== '--json')) {
      fail(`unknown option for ${command}`)
    }
    const target = positional[0]!
    const provider = command!.endsWith('-provider')
    const enabled = command!.startsWith('enable')
    const toggle = provider ? { owner: target, enabled } : { key: target, enabled }
    const live = await updateRuntimePatch(profileDir!, toggle)
    let result: HarmonyProfileUpdateResult
    let patches: HarmonyInspection['patches']
    if (live !== undefined) {
      result = live.result
      patches = live.patches
    } else {
      const offline = offlineInspection()
      const matches = provider
        ? offline.patches.filter(patch => patch.owner === target)
        : offline.patches.filter(patch => patch.key === target)
      if (matches.length === 0) fail(`unknown ${provider ? 'Provider' : 'Patch'} ${JSON.stringify(target)}`)
      const disabled = new Set(offline.profile.disabled)
      if (provider) {
        for (const patch of matches) disabled.delete(patch.key)
        if (enabled) disabled.delete(`${target}/*`)
        else disabled.add(`${target}/*`)
      } else {
        const patch = matches[0]!
        if (disabled.has(`${patch.owner}/*`)) {
          fail(`Provider ${JSON.stringify(patch.owner)} is disabled; enable it first`)
        }
        if (enabled) disabled.delete(target)
        else disabled.add(target)
      }
      result = await updateHarmonyProfile(profileDir!, { disabled: [...disabled] })
      patches = offlineInspection().patches
    }
    if (json) await writeStdout(`${JSON.stringify({ result, patches }, null, 2)}\n`)
    else await writeStdout(`${provider ? 'Provider' : 'Patch'} ${target} ${enabled ? 'enabled' : 'disabled'} (${result.mode})\n`)
    process.exit(0)
  }

  if (command !== undefined) fail(`unknown harmony command ${JSON.stringify(command)}\n${HARMONY_HELP}`)
  const live = await readHarmonyRuntime(profileDir!)
  if (live === undefined) {
    installModuleHooks()
    discoverProfile(profileDir!)
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
