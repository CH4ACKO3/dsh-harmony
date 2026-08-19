import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  HarmonyInspection,
  HarmonyProfileUpdateResult,
  HarmonyRuntimeProfileUpdateResult,
} from './index.js'
import {
  updateStoppedHarmonyProfile,
  type HarmonyProfileUpdate,
} from './profile.js'
import type { HarmonyReloadStatus } from './installer.js'

const RUNTIME_FILE = '.dsh-harmony-runtime.json'

interface RuntimeAddress {
  pid: number
  token: string
  url: string
}

export interface HarmonyRuntimeStatus {
  profile: HarmonyRuntimeProfileUpdateResult['profile']
  patches: HarmonyInspection['patches']
  reload: HarmonyReloadStatus
}

export interface HarmonyPatchUpdateResult {
  result: HarmonyRuntimeProfileUpdateResult
  patches: HarmonyInspection['patches']
}

function addressFile(profileDir: string): string {
  return join(profileDir, RUNTIME_FILE)
}

export function publishRuntimeAddress(profileDir: string, url: string, token: string): () => void {
  const path = addressFile(profileDir)
  const temporary = `${path}.${process.pid}.tmp`
  const address: RuntimeAddress = {
    pid: process.pid,
    token,
    url,
  }
  writeFileSync(temporary, `${JSON.stringify(address)}\n`, { mode: 0o600 })
  renameSync(temporary, path)
  return () => {
    if (!existsSync(path)) return
    const current = JSON.parse(readFileSync(path, 'utf8')) as RuntimeAddress
    if (current.pid === process.pid) unlinkSync(path)
  }
}

async function runtimeRequest(
  profileDir: string,
  path: string,
  init: RequestInit = {},
): Promise<Response | undefined> {
  const filename = addressFile(profileDir)
  if (!existsSync(filename)) return undefined
  const address = JSON.parse(readFileSync(filename, 'utf8')) as RuntimeAddress
  try {
    process.kill(address.pid, 0)
  } catch {
    return undefined
  }
  try {
    return await fetch(`${address.url}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${address.token}`,
      },
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('dsh-harmony: running Harness did not finish the request within 30 seconds')
    }
    throw new Error('dsh-harmony: could not contact the running Harness', { cause: error })
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `dsh-harmony: runtime returned HTTP ${response.status}`)
  return body
}

export async function readHarmonyRuntime(profileDir: string): Promise<HarmonyRuntimeStatus | undefined> {
  const response = await runtimeRequest(profileDir, '/dsh-harmony/status')
  return response === undefined ? undefined : responseJson<HarmonyRuntimeStatus>(response)
}

export async function inspectHarmonyRuntime(
  profileDir: string,
  packageName?: string,
  file?: string,
): Promise<HarmonyInspection | undefined> {
  const query = new URLSearchParams()
  if (packageName !== undefined) query.set('package', packageName)
  if (file !== undefined) query.set('file', file)
  const suffix = query.size === 0 ? '' : `?${query}`
  const response = await runtimeRequest(profileDir, `/dsh-harmony/inspect${suffix}`)
  return response === undefined ? undefined : responseJson<HarmonyInspection>(response)
}

export async function updateRuntimePatch(
  profileDir: string,
  input: { key?: string; owner?: string; enabled: boolean },
): Promise<HarmonyPatchUpdateResult | undefined> {
  const response = await runtimeRequest(profileDir, '/dsh-harmony/patches', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return response === undefined ? undefined : responseJson<HarmonyPatchUpdateResult>(response)
}

function sameOrder(left: string[] | undefined, right: string[]): boolean {
  return left?.length === right.length && left.every((item, index) => item === right[index])
}

export async function updateRuntimeProfile(
  profileDir: string,
  input: HarmonyProfileUpdate,
): Promise<HarmonyRuntimeProfileUpdateResult | undefined> {
  const response = await runtimeRequest(profileDir, '/dsh-harmony/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (response === undefined) return undefined
  const body = await responseJson<HarmonyRuntimeProfileUpdateResult>(response)
  const disabled = input.disabled === undefined ? undefined : [...new Set(input.disabled)]
  if (body.mode !== 'live'
    || body.profile.dir !== profileDir
    || input.order !== undefined && !sameOrder(body.profile.order, input.order)
    || input.patchOrder !== undefined && !sameOrder(body.profile.patchOrder, input.patchOrder)
    || disabled !== undefined && !sameOrder(body.profile.disabled, disabled)) {
    throw new Error('dsh-harmony: runtime response does not match the requested profile update')
  }
  return body
}

/** Update a profile through its running transaction, or atomically on disk when stopped. */
export async function updateHarmonyProfile(
  profileDir: string,
  input: HarmonyProfileUpdate,
): Promise<HarmonyProfileUpdateResult> {
  return await updateRuntimeProfile(profileDir, input) ?? {
    mode: 'offline',
    profile: updateStoppedHarmonyProfile(profileDir, input),
  }
}
