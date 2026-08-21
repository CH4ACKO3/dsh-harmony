import fs from 'node:fs'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
import { dirname, isAbsolute, relative } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'

const nativeReadFileSync = fs.readFileSync.bind(fs)
const nativeReadFile = fs.promises.readFile.bind(fs.promises)
let moduleHooksInstalled = false

function filenameOf(path: unknown): string | undefined {
  if (typeof path === 'string') return path
  if (Buffer.isBuffer(path)) return path.toString()
  return path instanceof URL && path.protocol === 'file:' ? fileURLToPath(path) : undefined
}

function moduleSourceText(source: string | ArrayBuffer | NodeJS.TypedArray): string {
  if (typeof source === 'string') return source
  if (source instanceof ArrayBuffer) return Buffer.from(source).toString('utf8')
  return Buffer.from(source.buffer, source.byteOffset, source.byteLength).toString('utf8')
}

function isUtf8Read(options: unknown): boolean {
  const encoding = typeof options === 'string'
    ? options
    : typeof options === 'object' && options !== null
      ? (options as { encoding?: unknown }).encoding
      : undefined
  return encoding === 'utf8' || encoding === 'utf-8'
}

export interface FileTransformHooks {
  targetFilename(filename: string): string | undefined
  isModuleSourceLoading(filename: string): boolean
  transform(filename: string, source: string): string
}

export function installNodeFileTransforms(runtime: FileTransformHooks): void {
  fs.readFileSync = ((path: Parameters<typeof fs.readFileSync>[0], ...args: unknown[]) => {
    const value = nativeReadFileSync(path, ...args as [])
    const filename = filenameOf(path)
    if (filename === undefined || (!Buffer.isBuffer(value) && typeof value !== 'string')) return value
    if (typeof value === 'string' && !isUtf8Read(args[0])) return value
    const target = runtime.targetFilename(filename)
    if (target === undefined || runtime.isModuleSourceLoading(target)) return value
    const output = runtime.transform(target, value.toString())
    return Buffer.isBuffer(value) ? Buffer.from(output) : output
  }) as typeof fs.readFileSync
  fs.promises.readFile = (async (path: Parameters<typeof fs.promises.readFile>[0], ...args: unknown[]) => {
    const value = await nativeReadFile(path, ...args as [])
    const filename = filenameOf(path)
    if (filename === undefined || (!Buffer.isBuffer(value) && typeof value !== 'string')) return value
    if (typeof value === 'string' && !isUtf8Read(args[0])) return value
    const target = runtime.targetFilename(filename)
    if (target === undefined || runtime.isModuleSourceLoading(target)) return value
    const output = runtime.transform(target, value.toString())
    return Buffer.isBuffer(value) ? Buffer.from(output) : output
  }) as typeof fs.promises.readFile
  syncBuiltinESMExports()
}

export interface ModuleTransformHooks<Loader> {
  aliases: { index: string; plugin: string; settings: string; manifest: string }
  currentGeneration(): number
  canonicalFilename(filename: string): string
  targetFilename(filename: string, generation: number): string | undefined
  packageDirectory(filename: string): string | undefined
  resolveTypeScriptDependency(specifier: string, parentUrl: string | undefined, generation: number): string | undefined
  activeTypeScriptLoader(filename: string, generation: number): Loader | undefined
  transpileTypeScript(filename: string, source: string, loader: Loader): { format: 'module' | 'commonjs'; source: string }
  transform(filename: string, source: string, generation: number): string
  beginModuleSourceLoad(filename: string): void
  endModuleSourceLoad(filename: string): void
}

export function installNodeModuleHooks<Loader>(runtime: ModuleTransformHooks<Loader>): void {
  if (moduleHooksInstalled) return
  const runtimeDirectory = dirname(fileURLToPath(runtime.aliases.manifest))
  const isRuntimeModule = (url: string): boolean => {
    if (!url.startsWith('file:')) return false
    const path = relative(runtimeDirectory, fileURLToPath(url))
    return path === '' || !path.startsWith('..') && !isAbsolute(path)
  }
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const marker = '?dsh-harmony='
      const index = specifier.lastIndexOf(marker)
      const cleanSpecifier = index === -1 ? specifier : specifier.slice(0, index)
      if (cleanSpecifier === 'dsh-harmony') return { url: runtime.aliases.index, shortCircuit: true }
      if (cleanSpecifier === 'dsh-harmony:plugin') return { url: runtime.aliases.plugin, shortCircuit: true }
      if (cleanSpecifier === 'dsh-harmony/settings') return { url: runtime.aliases.settings, shortCircuit: true }
      if (cleanSpecifier === 'dsh-harmony/package.json') return { url: runtime.aliases.manifest, shortCircuit: true }
      let nextGeneration = index === -1 ? undefined : specifier.slice(index + marker.length)
      const inherited = context.parentURL?.startsWith('file:')
        ? new URL(context.parentURL).searchParams.get('dsh-harmony') ?? undefined
        : undefined
      let result
      try {
        result = nextResolve(cleanSpecifier, context)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error
        const filename = runtime.resolveTypeScriptDependency(
          cleanSpecifier,
          context.parentURL,
          Number(nextGeneration ?? inherited ?? runtime.currentGeneration()),
        )
        if (filename === undefined) throw error
        result = { url: pathToFileURL(filename).href, shortCircuit: true }
        nextGeneration ??= inherited
      }
      if (nextGeneration === undefined && context.parentURL?.startsWith('file:') && result.url.startsWith('file:')) {
        if (inherited !== undefined) {
          const parentDirectory = runtime.packageDirectory(fileURLToPath(context.parentURL))
          const childDirectory = runtime.packageDirectory(fileURLToPath(result.url))
          if (parentDirectory === childDirectory) nextGeneration = inherited
        }
      }
      if (nextGeneration === undefined) return result
      if (isRuntimeModule(result.url)) return result
      const url = new URL(result.url)
      url.searchParams.set('dsh-harmony', nextGeneration)
      return { ...result, url: url.href, shortCircuit: true }
    },
    load(url, context, nextLoad) {
      const path = url.startsWith('file:') ? fileURLToPath(url) : undefined
      const requested = Number(new URL(url).searchParams.get('dsh-harmony') ?? runtime.currentGeneration())
      const loader = path === undefined ? undefined : runtime.activeTypeScriptLoader(path, requested)
      if (path !== undefined && loader !== undefined) {
        const filename = runtime.canonicalFilename(path)
        const source = nativeReadFileSync(filename, 'utf8')
        const transformed = runtime.transform(filename, source, requested)
        return { ...runtime.transpileTypeScript(filename, transformed, loader), shortCircuit: true }
      }
      const filename = path === undefined ? undefined : runtime.targetFilename(path, requested)
      if (filename !== undefined) runtime.beginModuleSourceLoad(filename)
      let result
      try {
        result = nextLoad(url, context)
      } finally {
        if (filename !== undefined) runtime.endModuleSourceLoad(filename)
      }
      if (filename !== undefined && (result.format === 'module' || result.format === 'commonjs') && result.source != null) {
        return { ...result, source: runtime.transform(filename, moduleSourceText(result.source), requested) }
      }
      return result
    },
  })
  moduleHooksInstalled = true
}
