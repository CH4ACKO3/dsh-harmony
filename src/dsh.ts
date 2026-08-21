import { createRequire, findPackageJSON } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

type AppBoot = typeof import('@deepseek-ai/dsh-app-boot')

const require = createRequire(import.meta.url)
const configuredEntry = process.env.DSH_HARMONY_DSH_ENTRY

export const dshEntry = configuredEntry === undefined
  ? require.resolve('@deepseek-ai/dsh/lib/bin.js')
  : resolve(configuredEntry)

const dshRequire = createRequire(dshEntry)
process.env.DSH_HARMONY_ACTIVE = '1'

const appBoot: AppBoot = await import(
  pathToFileURL(dshRequire.resolve('@deepseek-ai/dsh-app-boot')).href
)

export const { initProfile, PROFILE_TEMPLATES, resolveProfileDir } = appBoot

const resolvedDshInstallAnchor = findPackageJSON('@deepseek-ai/dsh', pathToFileURL(dshEntry))
if (resolvedDshInstallAnchor === undefined) throw new Error('dsh-harmony: cannot locate the active @deepseek-ai/dsh package')
const dshInstallAnchor = resolvedDshInstallAnchor

function packageNameOf(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:') || specifier.includes(':')) {
    return undefined
  }
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
}

function collectEntryPackages(entries: readonly EntryOptions[], packages: Set<string>): void {
  for (const entry of entries) {
    const name = packageNameOf(entry.name)
    if (name !== undefined) packages.add(name)
    if (entry.group && Array.isArray(entry.config)) collectEntryPackages(entry.config as EntryOptions[], packages)
  }
}

export function configuredProfileCandidates(
  name: string,
  profileDir: string,
  patchFiles: string[] = [],
  userLayer = true,
): string[] {
  const profileApi = appBoot as Partial<Pick<AppBoot,
    'composeEntries' | 'loadOptionalPatches' | 'loadOverlayPatches' | 'loadProfile'>>
  if (typeof profileApi.loadProfile !== 'function' || typeof profileApi.composeEntries !== 'function') return []
  const home = dirname(dirname(profileDir))
  const profile = profileApi.loadProfile('dsh', name, dshInstallAnchor, home, { userLayer })
  const layers = [
    profile.layers.flatMap(layer => layer.patches),
    profile.patches,
  ]
  if (userLayer) {
    layers.push(profileApi.loadOptionalPatches?.('dsh', join(home, 'cordis.patch.yml')) ?? [])
    if (profileApi.loadOverlayPatches !== undefined) {
      layers.push(patchFiles.flatMap(file => profileApi.loadOverlayPatches!('dsh', resolve(file))))
    }
  }
  const packages = new Set(profile.layers.map(layer => layer.packageName))
  collectEntryPackages(profileApi.composeEntries(layers), packages)
  const bundleManifests = new Map(profile.layers.map(layer => [
    layer.packageName,
    join(layer.packageDir, 'package.json'),
  ]))
  const anchors = [
    join(profileDir, 'package.json'),
    ...profile.layers.map(layer => join(layer.packageDir, 'package.json')),
    dshInstallAnchor,
  ]
  return [...packages].map(packageName => {
    const bundled = bundleManifests.get(packageName)
    if (bundled !== undefined) return bundled
    for (const anchor of anchors) {
      try {
        const manifest = findPackageJSON(packageName, pathToFileURL(anchor))
        if (manifest !== undefined) return manifest
      } catch {}
    }
    return packageName
  })
}
