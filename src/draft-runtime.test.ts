import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { HarmonyDraftRuntime, type ClientGraph, type DraftRuntimeAdapter } from './draft-runtime.js'

function linkedDraft(): { profile: string; root: string } {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-draft-'))
  const root = join(profile, 'node_modules', 'draft-plugin')
  mkdirSync(root, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'draft-plugin': 'link:../draft-plugin' } }))
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'draft-plugin',
    type: 'module',
    exports: { '.': './index.js', './client': './client.js' },
    dsh: { client: { platform: 'web' }, harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(root, 'index.js'), 'export function apply() {}\n')
  writeFileSync(join(root, 'client.js'), 'export {}\n')
  return { profile, root }
}

function adapter(profileDir: string, created = false) {
  let graph: ClientGraph = { rev: 'graph-staged', entries: [{ id: 'draft-plugin' }] }
  const calls: string[] = []
  const value: DraftRuntimeAdapter = {
    profileDir,
    async setProviderStaged(name, staged) { calls.push(`stage:${name}:${staged}`) },
    async ensureLoaderEntry(name) {
      calls.push(`loader:${name}`)
      return { id: 'draft-entry', created }
    },
    async removeLoaderEntry(id) { calls.push(`remove:${id}`) },
    async waitForClientEntry(name) {
      calls.push(`graph:${name}`)
      return graph
    },
    clientGraph() { return graph },
    async applyBuild(name) {
      calls.push(`build:${name}`)
      graph = { rev: 'graph-built', entries: [{ id: 'draft-plugin' }] }
      return graph
    },
  }
  return { value, calls, setGraph(next: ClientGraph) { graph = next } }
}

test('stages a linked Draft until the Preview confirms its client graph', async () => {
  const { profile, root } = linkedDraft()
  const host = adapter(profile)
  const runtime = new HarmonyDraftRuntime(host.value)
  try {
    const handle = await runtime.prepareDraft({ root })
    expect(handle.snapshot()).toEqual({
      name: 'draft-plugin', root: realpathSync(root), state: 'staged', graphRev: 'graph-staged',
    })
    expect(host.calls).toEqual([
      'stage:draft-plugin:true', 'loader:draft-plugin', 'graph:draft-plugin',
    ])

    const active = await handle.activateAfterPreviewReady('graph-staged')
    expect(active.state).toBe('active')
    expect(host.calls.at(-1)).toBe('stage:draft-plugin:false')

    await handle.deactivate()
    expect(host.calls.slice(-2)).toEqual(['stage:draft-plugin:true', 'stage:draft-plugin:false'])
  } finally {
    rmSync(profile, { recursive: true })
  }
})

test('removes a Studio-created Loader entry before releasing the staged provider', async () => {
  const { profile, root } = linkedDraft()
  const host = adapter(profile, true)
  const runtime = new HarmonyDraftRuntime(host.value)
  try {
    const handle = await runtime.prepareDraft({ root })
    await handle.deactivate()
    expect(host.calls.slice(-2)).toEqual(['remove:draft-entry', 'stage:draft-plugin:false'])
  } finally {
    rmSync(profile, { recursive: true })
  }
})

test('keeps the provider staged when Preview confirmation does not match', async () => {
  const { profile, root } = linkedDraft()
  const host = adapter(profile)
  const runtime = new HarmonyDraftRuntime(host.value)
  try {
    const handle = await runtime.prepareDraft({ root })
    await expect(handle.activateAfterPreviewReady('another-graph')).rejects.toThrow('did not confirm')
    expect(handle.snapshot().state).toBe('staged')
    expect(host.calls.filter(call => call.endsWith(':false'))).toHaveLength(0)
    await runtime.dispose()
  } finally {
    rmSync(profile, { recursive: true })
  }
})

test('accepts the live Preview graph when another client entry settled after staging', async () => {
  const { profile, root } = linkedDraft()
  const host = adapter(profile)
  const runtime = new HarmonyDraftRuntime(host.value)
  try {
    const handle = await runtime.prepareDraft({ root })
    host.setGraph({ rev: 'graph-settled', entries: [{ id: 'draft-plugin' }, { id: 'late-client' }] })
    await expect(handle.activateAfterPreviewReady('graph-settled')).resolves.toMatchObject({
      state: 'active', graphRev: 'graph-settled',
    })
  } finally {
    await runtime.dispose()
    rmSync(profile, { recursive: true })
  }
})

test('keeps an applied build pending until the reloaded Preview confirms its graph', async () => {
  const { profile, root } = linkedDraft()
  const host = adapter(profile)
  const runtime = new HarmonyDraftRuntime(host.value)
  try {
    const handle = await runtime.prepareDraft({ root })
    await handle.activateAfterPreviewReady('graph-staged')

    const pending = await handle.applyBuild()
    expect(pending).toMatchObject({ state: 'preview-pending', graphRev: 'graph-built' })
    await expect(handle.activateAfterPreviewReady('graph-staged')).rejects.toThrow('did not confirm')
    expect(handle.snapshot().state).toBe('preview-pending')

    const active = await handle.activateAfterPreviewReady('graph-built')
    expect(active.state).toBe('active')
    expect(host.calls).toContain('build:draft-plugin')
  } finally {
    await runtime.dispose()
    rmSync(profile, { recursive: true })
  }
})

test('keeps an active Draft active when applying its build fails', async () => {
  const { profile, root } = linkedDraft()
  const host = adapter(profile)
  host.value.applyBuild = async () => { throw new Error('build transaction failed') }
  const runtime = new HarmonyDraftRuntime(host.value)
  try {
    const handle = await runtime.prepareDraft({ root })
    await handle.activateAfterPreviewReady('graph-staged')
    await expect(handle.applyBuild()).rejects.toThrow('build transaction failed')
    expect(handle.snapshot().state).toBe('active')
  } finally {
    await runtime.dispose()
    rmSync(profile, { recursive: true })
  }
})

test('rejects directories that are not linked client plugins in the current profile', async () => {
  const { profile, root } = linkedDraft()
  const host = adapter(profile)
  const runtime = new HarmonyDraftRuntime(host.value)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'draft-plugin', dsh: {} }))
  try {
    await expect(runtime.prepareDraft({ root })).rejects.toThrow('must declare dsh.client.platform')
    expect(host.calls).toEqual([])
  } finally {
    rmSync(profile, { recursive: true })
  }
})
