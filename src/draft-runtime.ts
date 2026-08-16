import { readFileSync, realpathSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface DraftPackage {
  root: string
}

export interface DraftState {
  name: string
  root: string
  state: 'staged' | 'active' | 'preview-pending' | 'closed'
  graphRev: string
}

export interface DraftHandle {
  snapshot(): DraftState
  activateAfterPreviewReady(graphRev: string): Promise<DraftState>
  applyBuild(): Promise<DraftState>
  deactivate(): Promise<void>
}

export interface ClientGraph {
  rev: string
  entries: Array<{ id: string }>
}

export interface DraftRuntimeAdapter {
  profileDir: string
  setProviderStaged(name: string, staged: boolean): Promise<void>
  ensureLoaderEntry(name: string): Promise<{ id: string; created: boolean }>
  removeLoaderEntry(id: string): Promise<void>
  waitForClientEntry(name: string): Promise<ClientGraph>
  clientGraph(): ClientGraph
  applyBuild(name: string): Promise<ClientGraph>
}

interface DraftRecord {
  name: string
  root: string
  state: 'preparing' | 'staged' | 'active' | 'preview-pending' | 'closed'
  graphRev: string
  entryId?: string
  createdEntry: boolean
}

function resolveDraft(profileDir: string, input: DraftPackage): { name: string; root: string } {
  if (!isAbsolute(input.root)) throw new Error('dsh-harmony: Draft root must be an absolute path')
  const root = realpathSync(input.root)
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    name?: unknown
    dsh?: { client?: { platform?: unknown } }
  }
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    throw new Error('dsh-harmony: Draft package name must be a non-empty string')
  }
  if (manifest.dsh?.client?.platform !== 'web') {
    throw new Error(`dsh-harmony: Draft ${JSON.stringify(manifest.name)} must declare dsh.client.platform as "web"`)
  }
  const profileManifest = join(profileDir, 'package.json')
  const profile = JSON.parse(readFileSync(profileManifest, 'utf8')) as { dependencies?: Record<string, string> }
  if (!(manifest.name in (profile.dependencies ?? {}))) {
    throw new Error(`dsh-harmony: Draft ${JSON.stringify(manifest.name)} is not a dependency of the current profile`)
  }
  const installedManifest = findPackageJSON(manifest.name, pathToFileURL(profileManifest))
  if (installedManifest === undefined || realpathSync(dirname(installedManifest)) !== root) {
    throw new Error(`dsh-harmony: Draft ${JSON.stringify(manifest.name)} is not linked to the selected root`)
  }
  try {
    createRequire(profileManifest).resolve(`${manifest.name}/client`)
  } catch {
    throw new Error(`dsh-harmony: Draft ${JSON.stringify(manifest.name)} must export "./client"`)
  }
  return { name: manifest.name, root }
}

export class HarmonyDraftRuntime {
  private current?: DraftRecord

  constructor(private readonly adapter: DraftRuntimeAdapter) {}

  async prepareDraft(input: DraftPackage): Promise<DraftHandle> {
    if (this.current !== undefined) throw new Error('dsh-harmony: another Draft is already open')
    const draft: DraftRecord = {
      ...resolveDraft(this.adapter.profileDir, input),
      state: 'preparing',
      graphRev: '',
      createdEntry: false,
    }
    this.current = draft
    let staged = false
    try {
      await this.adapter.setProviderStaged(draft.name, true)
      staged = true
      const entry = await this.adapter.ensureLoaderEntry(draft.name)
      draft.entryId = entry.id
      draft.createdEntry = entry.created
      const graph = await this.adapter.waitForClientEntry(draft.name)
      draft.graphRev = graph.rev
      draft.state = 'staged'
      return {
        snapshot: () => this.snapshot(draft),
        activateAfterPreviewReady: graphRev => this.activate(draft, graphRev),
        applyBuild: () => this.applyBuild(draft),
        deactivate: () => this.deactivate(draft),
      }
    } catch (error) {
      if (draft.createdEntry && draft.entryId !== undefined) await this.adapter.removeLoaderEntry(draft.entryId)
      if (staged) await this.adapter.setProviderStaged(draft.name, false)
      this.current = undefined
      throw error
    }
  }

  async dispose(): Promise<void> {
    if (this.current !== undefined) await this.deactivate(this.current)
  }

  private snapshot(draft: DraftRecord): DraftState {
    if (draft.state === 'preparing') throw new Error('dsh-harmony: Draft is still preparing')
    return { name: draft.name, root: draft.root, state: draft.state, graphRev: draft.graphRev }
  }

  private async activate(draft: DraftRecord, graphRev: string): Promise<DraftState> {
    if (this.current !== draft || (draft.state !== 'staged' && draft.state !== 'preview-pending')) {
      throw new Error('dsh-harmony: Draft is not waiting for Preview confirmation')
    }
    const graph = this.adapter.clientGraph()
    if (graph.rev !== graphRev || !graph.entries.some(entry => entry.id === draft.name)) {
      throw new Error('dsh-harmony: Preview did not confirm the Draft client graph')
    }
    if (draft.state === 'staged') await this.adapter.setProviderStaged(draft.name, false)
    draft.state = 'active'
    draft.graphRev = this.adapter.clientGraph().rev
    return this.snapshot(draft)
  }

  private async applyBuild(draft: DraftRecord): Promise<DraftState> {
    if (this.current !== draft || draft.state !== 'active') throw new Error('dsh-harmony: Draft is not active')
    const graph = await this.adapter.applyBuild(draft.name)
    if (!graph.entries.some(entry => entry.id === draft.name)) {
      throw new Error('dsh-harmony: Draft left the client graph while applying its build')
    }
    draft.graphRev = graph.rev
    draft.state = 'preview-pending'
    return this.snapshot(draft)
  }

  private async deactivate(draft: DraftRecord): Promise<void> {
    if (this.current !== draft || draft.state === 'closed') return
    if (draft.state === 'active' || draft.state === 'preview-pending') {
      await this.adapter.setProviderStaged(draft.name, true)
      draft.state = 'staged'
    }
    if (draft.createdEntry && draft.entryId !== undefined) await this.adapter.removeLoaderEntry(draft.entryId)
    await this.adapter.setProviderStaged(draft.name, false)
    draft.state = 'closed'
    this.current = undefined
  }
}
