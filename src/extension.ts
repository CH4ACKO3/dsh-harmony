import { readFileSync, realpathSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context, Fiber, Plugin } from '@deepseek-ai/cordis'

export interface HarmonyExtension {
  name: string
  dir: string
  entry: string
}

function insideDirectory(directory: string, filename: string): boolean {
  const path = relative(directory, filename)
  return path === '' || !path.startsWith('..') && !isAbsolute(path)
}

export function discoverHarmonyExtensions(profileDir: string): HarmonyExtension[] {
  const profileManifest = join(profileDir, 'package.json')
  const profile = JSON.parse(readFileSync(profileManifest, 'utf8')) as {
    dependencies?: Record<string, string>
  }
  const extensions: HarmonyExtension[] = []
  for (const dependency of Object.keys(profile.dependencies ?? {})) {
    const manifestPath = findPackageJSON(dependency, pathToFileURL(profileManifest))
    if (manifestPath === undefined) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: string
      dsh?: { harmony?: { extension?: unknown } }
    }
    const declared = manifest.dsh?.harmony?.extension
    if (declared === undefined) continue
    if (typeof declared !== 'string' || declared.length === 0) {
      throw new Error(`dsh-harmony: extension entry for ${JSON.stringify(dependency)} must be a non-empty string`)
    }
    const dir = realpathSync(dirname(manifestPath))
    const entry = realpathSync(resolve(dir, declared))
    if (!insideDirectory(dir, entry)) {
      throw new Error(`dsh-harmony: extension entry for ${JSON.stringify(dependency)} escapes its package directory`)
    }
    extensions.push({ name: manifest.name ?? dependency, dir, entry })
  }
  return extensions
}

function extensionPlugin(name: string, imported: Record<string, unknown>): Plugin {
  const candidate = imported.default
  if (typeof candidate === 'function'
    || typeof candidate === 'object' && candidate !== null && typeof (candidate as { apply?: unknown }).apply === 'function') {
    return candidate as Plugin
  }
  if (typeof imported.apply === 'function') return imported as unknown as Plugin
  throw new Error(`dsh-harmony: extension ${JSON.stringify(name)} does not export a Cordis plugin`)
}

export async function loadHarmonyExtensions(ctx: Context, profileDir: string): Promise<() => Promise<void>> {
  const fibers: Fiber[] = []
  try {
    for (const extension of discoverHarmonyExtensions(profileDir)) {
      const imported = await import(pathToFileURL(extension.entry).href) as Record<string, unknown>
      const fiber = ctx.plugin(extensionPlugin(extension.name, imported))
      fibers.push(fiber)
      await fiber
    }
  } catch (error) {
    await Promise.allSettled(fibers.reverse().map(fiber => fiber.dispose()))
    throw error
  }
  return async () => {
    for (const fiber of fibers.reverse()) await fiber.dispose()
  }
}
