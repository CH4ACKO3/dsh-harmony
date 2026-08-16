import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

type Dictionaries = Record<'zh' | 'en', Record<string, string>>

interface Registration {
  options: { id: string; name?: string; label?: () => string; locale?: string }
  component: unknown
}

interface ClientContext {
  effect(register: () => unknown): void
  locale: {
    register(namespace: string, value: Dictionaries): () => void
    bind(namespace: string): (key: string) => string
  }
  slots: {
    inject(name: string, mount: () => void): void
    register(options: Registration['options'], component: unknown): void
  }
}

interface ClientModule {
  inject: string[]
  apply(ctx: ClientContext): void
}

interface ClientRecord {
  id: string
  factory(require: (name: string) => unknown): ClientModule
}

let record: ClientRecord | undefined
const effects: Promise<unknown>[] = []
runInNewContext(readFileSync(new URL('../browser-dist/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(value: unknown) { record = value as ClientRecord } } },
  document: { querySelector() { return {} } },
  fetch: async () => ({ json: async () => ({ state: 'active' }) }),
  navigator: { language: 'zh-CN' },
})

const loaded = record
assert.ok(loaded !== undefined)
assert.equal(loaded.id, 'dsh-harmony')
const client = loaded.factory(name => {
  assert.equal(name, 'react')
  return {
    createElement() {},
    useEffect() {},
    useMemo() {},
    useRef() {},
    useState() {},
  }
})
assert.deepEqual(Array.from(client.inject), ['slots', 'locale'])

const registrations: Registration[] = []
let dictionaries: Dictionaries | undefined
client.apply({
  effect(register) {
    effects.push(Promise.resolve(register()))
  },
  locale: {
    register(namespace, value) {
      assert.equal(namespace, 'dsh-harmony')
      dictionaries = value
      return () => {}
    },
    bind(namespace) {
      assert.equal(namespace, 'dsh-harmony')
      return key => dictionaries?.en[key] ?? key
    },
  },
  slots: {
    inject(name, mount) {
      assert.ok(['shell.overlay', 'settings.section'].includes(name))
      mount()
    },
    register(options, component) {
      registrations.push({ options, component })
    },
  },
})
await Promise.all(effects)

const registration = registrations.find(value => value.options.id === 'harmony')
assert.ok(registration !== undefined)
assert.ok(registration.options.label !== undefined)
assert.equal(registration.options.id, 'harmony')
assert.equal(registration.options.label(), 'Harmony')
assert.equal(registration.options.locale, 'dsh-harmony')
assert.ok(dictionaries !== undefined)
assert.deepEqual(Object.keys(dictionaries.zh), Object.keys(dictionaries.en))
assert.equal(dictionaries.zh.intro, '拖动插件来调整 Patch 的应用顺序')
assert.equal(dictionaries.zh.patchPage, 'Patch 状态')
assert.equal(dictionaries.zh.runtimeDesktopTitle, 'Desktop 尚未通过 Harmony 启动')
assert.match(dictionaries.zh.runtimeDesktopBody, /安装全局启动器不会修改 Desktop 内置 Host/)
assert.equal(dictionaries.en.runtimeDesktopTitle, 'Desktop is not running through Harmony')
assert.equal(dictionaries.zh.reloadStarting, 'Harmony 正在重载')
assert.equal(dictionaries.zh.reloadSucceeded, 'Harmony 重载成功')
assert.equal(dictionaries.zh.reloadFailed, 'Harmony 重载失败')
assert.equal(typeof registration.component, 'function')
assert.equal(registrations.find(value => value.options.id === 'harmony-runtime')?.options.name, 'shell.overlay')
assert.equal(registrations.find(value => value.options.id === 'harmony-reload-notifications')?.options.name, 'shell.overlay')
const clientSource = readFileSync(new URL('../browser-dist/client.js', import.meta.url), 'utf8')
assert.match(clientSource, /harmony-preview-light\.png/)
assert.match(clientSource, /harmony-preview\.png/)
assert.match(clientSource, /harmony-icon-mono\.png/)
assert.match(clientSource, /\/dsh-harmony\/patches/)
assert.match(clientSource, /const displayName = \(name\) => name\.replace\(\/\^@\[\^\/\]\+\\\/\/, ''\)/)
assert.ok(clientSource.includes("[packageScope(plugin.name), plugin.author].filter(Boolean).join(' · ')"))
assert.doesNotMatch(clientSource, /deepseekScope/)
assert.match(clientSource, /next\.error \?\? `\$\{response\.status\}`/)
assert.match(clientSource, /if \(current\)\s+setInspection/)
assert.match(clientSource, /if \(saving\)\s+return/)
