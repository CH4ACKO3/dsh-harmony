import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

let record
const effects = []
runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(value) { record = value } } },
  document: { querySelector() { return {} } },
  fetch: async () => ({ json: async () => ({ state: 'active' }) }),
  navigator: { language: 'zh-CN' },
})

assert.equal(record.id, 'dsh-harmony')
const client = record.factory(name => {
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

const registrations = []
let dictionaries
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
      return key => dictionaries.en[key]
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
assert.equal(registration.options.id, 'harmony')
assert.equal(registration.options.label(), 'Harmony')
assert.equal(registration.options.locale, 'dsh-harmony')
assert.deepEqual(Object.keys(dictionaries.zh), Object.keys(dictionaries.en))
assert.equal(dictionaries.zh.intro, '拖动插件来调整 Patch 的应用顺序')
assert.equal(dictionaries.zh.patchPage, 'Patch 状态')
assert.equal(typeof registration.component, 'function')
assert.equal(registrations.find(value => value.options.id === 'harmony-runtime').options.name, 'shell.overlay')
const clientSource = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
assert.match(clientSource, /harmony-preview-light\.png/)
assert.match(clientSource, /harmony-preview\.png/)
assert.match(clientSource, /harmony-icon-mono\.png/)
assert.match(clientSource, /\/dsh-harmony\/patches/)
assert.ok(clientSource.includes("const displayName = name => name.replace(/^@[^/]+\\//, '')"))
assert.ok(clientSource.includes("[packageScope(plugin.name), plugin.author].filter(Boolean).join(' · ')"))
assert.doesNotMatch(clientSource, /deepseekScope/)
assert.match(clientSource, /next\.error \?\? `\$\{response\.status\}`/)
assert.match(clientSource, /if \(current\) setInspection/)
assert.match(clientSource, /if \(saving\) return/)
