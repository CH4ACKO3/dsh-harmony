import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

export const HARMONY_SESSION_PROFILE_FILE = 'harmony-sessions.json'
export const HARMONY_INSTANCE_PROFILE_FILE = 'harmony-instance.json'
const SCHEMA_VERSION = 1

export interface HarmonySessionPatch {
  key: string
  providerVersion: string
  fingerprint: string
}

export interface HarmonySessionPatchProfile {
  recordedAt: number
  patches: HarmonySessionPatch[]
}

interface HarmonySessionProfileState {
  schemaVersion: typeof SCHEMA_VERSION
  sessions: Record<string, HarmonySessionPatchProfile>
}

export interface HarmonySessionPatchDifference {
  missing: string[]
  added: string[]
  changed: string[]
  reordered: boolean
}

export type HarmonySessionPatchCheck = {
  sessionId: string
  state: 'untracked'
  current: HarmonySessionPatchProfile
} | {
  sessionId: string
  state: 'match'
  recorded: HarmonySessionPatchProfile
  current: HarmonySessionPatchProfile
} | {
  sessionId: string
  state: 'mismatch'
  recorded: HarmonySessionPatchProfile
  current: HarmonySessionPatchProfile
  difference: HarmonySessionPatchDifference
}

export interface HarmonyInstancePatchProfile extends HarmonySessionPatchProfile {
  profile: string
}

export type HarmonyInstancePatchCheck = {
  state: 'initialized'
  current: HarmonyInstancePatchProfile
} | {
  state: 'match'
  recorded: HarmonyInstancePatchProfile
  current: HarmonyInstancePatchProfile
} | {
  state: 'mismatch'
  recorded: HarmonyInstancePatchProfile
  current: HarmonyInstancePatchProfile
  difference: HarmonySessionPatchDifference
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`dsh-harmony: session Patch profile ${field} must be a non-empty string`)
  }
  return value
}

function profile(value: unknown, field: string): HarmonySessionPatchProfile {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`dsh-harmony: session Patch profile ${field} must be an object`)
  }
  const input = value as { recordedAt?: unknown; patches?: unknown }
  if (!Number.isSafeInteger(input.recordedAt) || (input.recordedAt as number) < 0) {
    throw new TypeError(`dsh-harmony: session Patch profile ${field}.recordedAt must be a non-negative safe integer`)
  }
  if (!Array.isArray(input.patches)) {
    throw new TypeError(`dsh-harmony: session Patch profile ${field}.patches must be an array`)
  }
  const keys = new Set<string>()
  const patches = input.patches.map((value, index) => {
    if (typeof value !== 'object' || value === null) {
      throw new TypeError(`dsh-harmony: session Patch profile ${field}.patches[${index}] must be an object`)
    }
    const input = value as { key?: unknown; providerVersion?: unknown; fingerprint?: unknown }
    const patch = {
      key: string(input.key, `${field}.patches[${index}].key`),
      providerVersion: string(input.providerVersion, `${field}.patches[${index}].providerVersion`),
      fingerprint: string(input.fingerprint, `${field}.patches[${index}].fingerprint`),
    }
    if (keys.has(patch.key)) {
      throw new TypeError(`dsh-harmony: session Patch profile ${field}.patches contains duplicate ${JSON.stringify(patch.key)}`)
    }
    keys.add(patch.key)
    return patch
  })
  return { recordedAt: input.recordedAt as number, patches }
}

function readState(rootDir: string): HarmonySessionProfileState {
  const filename = join(rootDir, HARMONY_SESSION_PROFILE_FILE)
  if (!existsSync(filename)) return { schemaVersion: SCHEMA_VERSION, sessions: {} }
  const input = JSON.parse(readFileSync(filename, 'utf8')) as { schemaVersion?: unknown; sessions?: unknown }
  if (input.schemaVersion !== SCHEMA_VERSION) {
    throw new TypeError(`dsh-harmony: unsupported session Patch profile schema ${JSON.stringify(input.schemaVersion)}`)
  }
  if (typeof input.sessions !== 'object' || input.sessions === null || Array.isArray(input.sessions)) {
    throw new TypeError('dsh-harmony: session Patch profile sessions must be an object')
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    sessions: Object.fromEntries(Object.entries(input.sessions).map(([sessionId, value]) => [
      string(sessionId, 'session id'),
      profile(value, `sessions[${JSON.stringify(sessionId)}]`),
    ])),
  }
}

function instanceProfile(value: unknown): HarmonyInstancePatchProfile {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('dsh-harmony: instance Patch profile must be an object')
  }
  const input = value as { schemaVersion?: unknown; profile?: unknown }
  if (input.schemaVersion !== SCHEMA_VERSION) {
    throw new TypeError(`dsh-harmony: unsupported instance Patch profile schema ${JSON.stringify(input.schemaVersion)}`)
  }
  return {
    ...profile(value, 'instance'),
    profile: string(input.profile, 'instance.profile'),
  }
}

function readInstanceProfile(rootDir: string): HarmonyInstancePatchProfile | undefined {
  const filename = join(rootDir, HARMONY_INSTANCE_PROFILE_FILE)
  if (!existsSync(filename)) return undefined
  return instanceProfile(JSON.parse(readFileSync(filename, 'utf8')))
}

function cloneProfile(value: HarmonySessionPatchProfile): HarmonySessionPatchProfile {
  return { recordedAt: value.recordedAt, patches: value.patches.map(patch => ({ ...patch })) }
}

function cloneInstanceProfile(value: HarmonyInstancePatchProfile): HarmonyInstancePatchProfile {
  return { ...cloneProfile(value), profile: value.profile }
}

export function harmonyDataRoot(profileDir: string): string {
  const profilesDir = dirname(profileDir)
  return basename(profilesDir) === 'profiles' ? dirname(profilesDir) : profileDir
}

export class HarmonySessionProfileStore {
  private tail = Promise.resolve()

  constructor(private readonly rootDir: string) {}

  bind(sessionId: string, current: HarmonySessionPatchProfile): Promise<HarmonySessionPatchProfile> {
    const operation = this.tail.then(async () => {
      const filename = join(this.rootDir, HARMONY_SESSION_PROFILE_FILE)
      return withFileLock(filename, async () => {
        const state = readState(this.rootDir)
        const existing = state.sessions[sessionId]
        if (existing !== undefined) return cloneProfile(existing)
        const bound = cloneProfile(current)
        state.sessions[sessionId] = bound
        await writeFileAtomic(filename, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
        return cloneProfile(bound)
      })
    })
    this.tail = operation.then(() => undefined, () => undefined)
    return operation
  }

  check(sessionId: string, current: HarmonySessionPatchProfile): HarmonySessionPatchCheck {
    const recorded = readState(this.rootDir).sessions[sessionId]
    if (recorded === undefined) return { sessionId, state: 'untracked', current: cloneProfile(current) }
    const difference = compareSessionPatchProfiles(recorded, current)
    if (difference.missing.length === 0 && difference.added.length === 0
      && difference.changed.length === 0 && !difference.reordered) {
      return { sessionId, state: 'match', recorded: cloneProfile(recorded), current: cloneProfile(current) }
    }
    return {
      sessionId,
      state: 'mismatch',
      recorded: cloneProfile(recorded),
      current: cloneProfile(current),
      difference,
    }
  }

  flush(): Promise<void> {
    return this.tail
  }

  startInstance(profileName: string, current: HarmonySessionPatchProfile): Promise<HarmonyInstancePatchCheck> {
    const operation: Promise<HarmonyInstancePatchCheck> = this.tail.then(async () => {
      const filename = join(this.rootDir, HARMONY_INSTANCE_PROFILE_FILE)
      return withFileLock(filename, async () => {
        const next = { ...cloneProfile(current), profile: profileName }
        const recorded = readInstanceProfile(this.rootDir)
        if (recorded === undefined) {
          await writeFileAtomic(filename, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...next }, null, 2)}\n`, { mode: 0o600 })
          return { state: 'initialized', current: cloneInstanceProfile(next) }
        }
        const difference = compareSessionPatchProfiles(recorded, next)
        if (difference.missing.length === 0 && difference.added.length === 0
          && difference.changed.length === 0 && !difference.reordered) {
          await writeFileAtomic(filename, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...next }, null, 2)}\n`, { mode: 0o600 })
          return {
            state: 'match',
            recorded: cloneInstanceProfile(recorded),
            current: cloneInstanceProfile(next),
          }
        }
        await writeFileAtomic(filename, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...next }, null, 2)}\n`, { mode: 0o600 })
        return {
          state: 'mismatch',
          recorded: cloneInstanceProfile(recorded),
          current: cloneInstanceProfile(next),
          difference,
        }
      })
    })
    this.tail = operation.then(() => undefined, () => undefined)
    return operation
  }
}

export function compareSessionPatchProfiles(
  recorded: HarmonySessionPatchProfile,
  current: HarmonySessionPatchProfile,
): HarmonySessionPatchDifference {
  const expected = new Map(recorded.patches.map(patch => [patch.key, patch]))
  const actual = new Map(current.patches.map(patch => [patch.key, patch]))
  const missing = recorded.patches.filter(patch => !actual.has(patch.key)).map(patch => patch.key)
  const added = current.patches.filter(patch => !expected.has(patch.key)).map(patch => patch.key)
  const changed = recorded.patches.filter((patch) => {
    const next = actual.get(patch.key)
    return next !== undefined
      && (next.providerVersion !== patch.providerVersion || next.fingerprint !== patch.fingerprint)
  }).map(patch => patch.key)
  const recordedCommon = recorded.patches.filter(patch => actual.has(patch.key)).map(patch => patch.key)
  const currentCommon = current.patches.filter(patch => expected.has(patch.key)).map(patch => patch.key)
  const reordered = recordedCommon.some((key, index) => currentCommon[index] !== key)
  return { missing, added, changed, reordered }
}
