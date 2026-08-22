import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compareSessionPatchProfiles,
  HARMONY_INSTANCE_PROFILE_FILE,
  HARMONY_SESSION_PROFILE_FILE,
  harmonyDataRoot,
  HarmonySessionProfileStore,
  type HarmonySessionPatchProfile,
} from './session-profile.js'

const patch = (key: string, fingerprint = `${key}-fingerprint`) => ({
  key,
  providerVersion: '1.0.0',
  fingerprint,
})

const profile = (keys: string[], recordedAt = 1): HarmonySessionPatchProfile => ({
  recordedAt,
  patches: keys.map(key => patch(key)),
})

describe('session Patch profiles', () => {
  it('detects added, missing, changed, and reordered Patches independently', () => {
    expect(compareSessionPatchProfiles(
      { recordedAt: 1, patches: [patch('a'), patch('b'), patch('c'), patch('gone')] },
      { recordedAt: 2, patches: [patch('c'), patch('b', 'changed'), patch('a'), patch('new')] },
    )).toEqual({
      missing: ['gone'],
      added: ['new'],
      changed: ['b'],
      reordered: true,
    })
  })

  it('binds a session once and preserves its original ordered profile', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-harmony-session-profile-'))
    const store = new HarmonySessionProfileStore(directory)
    await store.bind('session-1', profile(['a', 'b']))
    await store.bind('session-1', profile(['b', 'a'], 2))
    await store.flush()

    expect(store.check('session-1', profile(['a', 'b'], 3)).state).toBe('match')
    expect(store.check('session-1', profile(['b', 'a'], 3))).toMatchObject({
      state: 'mismatch',
      difference: { missing: [], added: [], changed: [], reordered: true },
    })
    expect(JSON.parse(readFileSync(join(directory, HARMONY_SESSION_PROFILE_FILE), 'utf8')))
      .toMatchObject({ schemaVersion: 1, sessions: { 'session-1': { recordedAt: 1 } } })
  })

  it('reports legacy sessions as untracked without writing a false binding', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-harmony-session-profile-'))
    const store = new HarmonySessionProfileStore(directory)
    expect(store.check('legacy', profile(['a']))).toMatchObject({ state: 'untracked' })
  })

  it('checks and advances the instance profile once at startup', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-harmony-instance-profile-'))
    const store = new HarmonySessionProfileStore(directory)
    await expect(store.startInstance('web', profile(['a', 'b']))).resolves.toMatchObject({ state: 'initialized' })
    await expect(store.startInstance('tui', profile(['a', 'b'], 2))).resolves.toMatchObject({ state: 'match' })
    await expect(store.startInstance('tui', profile(['b', 'c'], 3))).resolves.toMatchObject({
      state: 'mismatch',
      recorded: { profile: 'tui' },
      current: { profile: 'tui' },
      difference: { missing: ['a'], added: ['c'], changed: [], reordered: false },
    })
    await expect(store.startInstance('headless', profile(['b', 'c'], 4))).resolves.toMatchObject({ state: 'match' })
    expect(JSON.parse(readFileSync(join(directory, HARMONY_INSTANCE_PROFILE_FILE), 'utf8')))
      .toMatchObject({ schemaVersion: 1, profile: 'headless', recordedAt: 4 })
  })

  it('uses DSH_HOME for ordinary profiles and keeps embedded profiles local', () => {
    expect(harmonyDataRoot('/tmp/example/profiles/web')).toBe('/tmp/example')
    expect(harmonyDataRoot('/tmp/embedded-profile')).toBe('/tmp/embedded-profile')
  })
})
