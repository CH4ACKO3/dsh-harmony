import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const configuredEntry = process.env.DSH_HARMONY_DSH_ENTRY

export const dshEntry = configuredEntry === undefined
  ? require.resolve('@deepseek-ai/dsh/lib/bin.js')
  : resolve(configuredEntry)

const dshRequire = createRequire(dshEntry)
process.env.DSH_HARMONY_ACTIVE = '1'

export const { initProfile, PROFILE_TEMPLATES, resolveProfileDir } = await import(
  pathToFileURL(dshRequire.resolve('@deepseek-ai/dsh-app-boot')).href
)
