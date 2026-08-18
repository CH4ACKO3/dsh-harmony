import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  updateStoppedHarmonyProfile,
  type HarmonyProfileUpdate,
  type HarmonyProfileView,
} from './profile.js'

const RUNTIME_FILE = '.dsh-harmony-runtime.json'

interface RuntimeAddress {
  pid: number
  url: string
}

function addressFile(profileDir: string): string {
  return join(profileDir, RUNTIME_FILE)
}

export function publishRuntimeAddress(profileDir: string, host: string, port: number): () => void {
  const path = addressFile(profileDir)
  const temporary = `${path}.${process.pid}.tmp`
  const address: RuntimeAddress = {
    pid: process.pid,
    url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`,
  }
  writeFileSync(temporary, `${JSON.stringify(address)}\n`)
  renameSync(temporary, path)
  return () => {
    if (!existsSync(path)) return
    const current = JSON.parse(readFileSync(path, 'utf8')) as RuntimeAddress
    if (current.pid === process.pid) unlinkSync(path)
  }
}

function sameOrder(left: string[] | undefined, right: string[]): boolean {
  return left?.length === right.length && left.every((item, index) => item === right[index])
}

export async function updateRuntimeProfile(
  profileDir: string,
  input: HarmonyProfileUpdate,
): Promise<HarmonyProfileView | undefined> {
  const path = addressFile(profileDir)
  if (!existsSync(path)) return undefined
  const address = JSON.parse(readFileSync(path, 'utf8')) as RuntimeAddress
  try {
    process.kill(address.pid, 0)
  } catch {
    return undefined
  }
  let response: Response
  try {
    response = await fetch(`${address.url}/dsh-harmony/profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('dsh-harmony: running Harness did not finish the profile update within 30 seconds')
    }
    throw new Error('dsh-harmony: could not contact the running Harness', { cause: error })
  }
  const body = await response.json() as HarmonyProfileView & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `dsh-harmony: runtime returned HTTP ${response.status}`)
  const disabled = input.disabled === undefined ? undefined : [...new Set(input.disabled)]
  if (body.dir !== profileDir
    || input.order !== undefined && !sameOrder(body.order, input.order)
    || input.patchOrder !== undefined && !sameOrder(body.patchOrder, input.patchOrder)
    || disabled !== undefined && !sameOrder(body.disabled, disabled)) {
    throw new Error('dsh-harmony: runtime response does not match the requested profile update')
  }
  return body
}

/** Update a profile through its running transaction, or atomically on disk when stopped. */
export async function updateHarmonyProfile(
  profileDir: string,
  input: HarmonyProfileUpdate,
): Promise<HarmonyProfileView> {
  return await updateRuntimeProfile(profileDir, input) ?? updateStoppedHarmonyProfile(profileDir, input)
}
