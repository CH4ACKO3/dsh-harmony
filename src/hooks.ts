import fs from 'node:fs'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
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
  canonicalFilename(filename: string): string
  isJavaScript(filename: string): boolean
  isModuleSourceLoading(filename: string): boolean
  transform(filename: string, source: string): string
}

export function installNodeFileTransforms(runtime: FileTransformHooks): void {
  fs.readFileSync = ((path: Parameters<typeof fs.readFileSync>[0], ...args: unknown[]) => {
    const value = nativeReadFileSync(path, ...args as [])
    const filename = filenameOf(path)
    if (filename === undefined || !runtime.isJavaScript(filename) || (!Buffer.isBuffer(value) && typeof value !== 'string')) return value
    if (typeof value === 'string' && !isUtf8Read(args[0])) return value
    const canonical = runtime.canonicalFilename(filename)
    if (runtime.isModuleSourceLoading(canonical)) return value
    const output = runtime.transform(canonical, value.toString())
    return Buffer.isBuffer(value) ? Buffer.from(output) : output
  }) as typeof fs.readFileSync
  fs.promises.readFile = (async (path: Parameters<typeof fs.promises.readFile>[0], ...args: unknown[]) => {
    const value = await nativeReadFile(path, ...args as [])
    const filename = filenameOf(path)
    if (filename === undefined || !runtime.isJavaScript(filename) || (!Buffer.isBuffer(value) && typeof value !== 'string')) return value
    if (typeof value === 'string' && !isUtf8Read(args[0])) return value
    const canonical = runtime.canonicalFilename(filename)
    if (runtime.isModuleSourceLoading(canonical)) return value
    const output = runtime.transform(canonical, value.toString())
    return Buffer.isBuffer(value) ? Buffer.from(output) : output
  }) as typeof fs.promises.readFile
  syncBuiltinESMExports()
}

export interface ModuleTransformHooks<Loader> {
  aliases: { index: string; plugin: string; manifest: string }
  currentGeneration(): number
  canonicalFilename(filename: string): string
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
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'dsh-harmony') return { url: runtime.aliases.index, shortCircuit: true }
      if (specifier === 'dsh-harmony:plugin') return { url: runtime.aliases.plugin, shortCircuit: true }
      if (specifier === 'dsh-harmony/package.json') return { url: runtime.aliases.manifest, shortCircuit: true }
      const marker = '?dsh-harmony='
      const index = specifier.lastIndexOf(marker)
      const cleanSpecifier = index === -1 ? specifier : specifier.slice(0, index)
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
      const url = new URL(result.url)
      url.searchParams.set('dsh-harmony', nextGeneration)
      return { ...result, url: url.href, shortCircuit: true }
    },
    load(url, context, nextLoad) {
      const path = url.startsWith('file:') ? fileURLToPath(url) : undefined
      const filename = path === undefined ? undefined : runtime.canonicalFilename(path)
      const requested = Number(new URL(url).searchParams.get('dsh-harmony') ?? runtime.currentGeneration())
      const loader = filename === undefined ? undefined : runtime.activeTypeScriptLoader(filename, requested)
      if (filename !== undefined && loader !== undefined) {
        const source = nativeReadFileSync(filename, 'utf8')
        const transformed = runtime.transform(filename, source, requested)
        return { ...runtime.transpileTypeScript(filename, transformed, loader), shortCircuit: true }
      }
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
