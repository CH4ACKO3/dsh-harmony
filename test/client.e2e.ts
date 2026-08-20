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
type FakeStyle = {
  dataset: { plugin: string }
  before(value: FakeMarker): void
}
type FakeMarker = { replaceWith(value: FakeStyle): void }
const style = (plugin: string): FakeStyle => ({
  dataset: { plugin },
  before(marker) {
    const index = headStyles.indexOf(this)
    marker.replaceWith = value => {
      const current = headStyles.indexOf(value)
      if (current >= 0) headStyles.splice(current, 1)
      const target = headStyles.indexOf(marker as unknown as FakeStyle)
      headStyles.splice(target, 1, value)
    }
    headStyles.splice(index, 0, marker as unknown as FakeStyle)
  },
})
const alphaFirst = style('alpha')
const unowned = style('ordinary')
const beta = style('beta')
const alphaSecond = style('alpha')
const headStyles = [alphaFirst, unowned, beta, alphaSecond]
const fakeHead = {
  querySelectorAll() { return [...headStyles] },
}
runInNewContext(readFileSync(new URL('../browser-dist/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(value: unknown) { record = value as ClientRecord } } },
  document: {
    querySelector() { return {} },
    head: fakeHead,
    createComment() { return { replaceWith() {} } },
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  queueMicrotask,
  fetch: async (url: string) => ({
    ok: true,
    json: async () => url === '/dsh-harmony/profile'
      ? { order: [], patchOrder: ['alpha/first', 'beta/only', 'alpha/last'], disabled: [], plugins: [{ name: 'alpha', harmony: true }, { name: 'beta', harmony: true }], orderViolations: [], patchOrderViolations: [], pluginConflicts: [] }
      : { state: 'active' },
  }),
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
await new Promise(resolve => setImmediate(resolve))
assert.deepEqual(headStyles, [beta, unowned, alphaFirst, alphaSecond])

const registration = registrations.find(value => value.options.id === 'harmony')
assert.ok(registration !== undefined)
assert.ok(registration.options.label !== undefined)
assert.equal(registration.options.id, 'harmony')
assert.equal(registration.options.label(), 'Harmony')
assert.equal(registration.options.locale, 'dsh-harmony')
assert.ok(dictionaries !== undefined)
assert.deepEqual(Object.keys(dictionaries.zh), Object.keys(dictionaries.en))
assert.equal(dictionaries.zh.patchKindSource, '源码 Patch')
assert.equal(dictionaries.en.patchOperationReplace, 'Replace')
assert.equal(typeof registration.component, 'function')
assert.equal(registrations.find(value => value.options.id === 'harmony-runtime')?.options.name, 'shell.overlay')
assert.equal(registrations.find(value => value.options.id === 'harmony-reload-notifications')?.options.name, 'shell.overlay')
