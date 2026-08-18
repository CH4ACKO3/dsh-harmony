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
assert.equal(dictionaries.zh.intro, '拖动插件封面移动整堆；展开后可将单个 Patch 拖到任意位置。')
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
assert.match(clientSource, /harmony-preview-light\.webp/)
assert.match(clientSource, /harmony-preview\.webp/)
assert.match(clientSource, /harmony-icon-mono\.png/)
assert.match(clientSource, /\/dsh-harmony\/patches/)
assert.match(clientSource, /const displayName = \(name\) => name\.replace\(\/\^@\[\^\/\]\+\\\/\/, ''\)/)
assert.ok(clientSource.includes("[packageScope(plugin.name), plugin.author].filter(Boolean).join(' · ')"))
assert.doesNotMatch(clientSource, /deepseekScope/)
assert.match(clientSource, /next\.error \?\? `\$\{response\.status\}`/)
assert.match(clientSource, /if \(current\)\s+setInspection/)
assert.match(clientSource, /if \(saving\)\s+return/)
assert.match(clientSource, /const reconcilePatchView =/)
assert.match(clientSource, /dshHarmonyStackCover/)
assert.match(clientSource, /element\.animate\(/)
assert.match(clientSource, /const insertPatches =/)
assert.match(clientSource, /const undoPatchOrder =/)
assert.match(clientSource, /const next = \[\.\.\.savedPatchOrder\]/)
assert.match(clientSource, /setExpandedKeys\(new Set\(\)\)/)
assert.match(clientSource, /className: 'dshHarmonyFooterActions'/)
assert.match(clientSource, /onClick: undoPatchOrder/)
assert.match(clientSource, /selectedAuthor \? h\('span', null, `\$\{t\('author'\)\}: \$\{selectedAuthor\}`\)/)
assert.match(clientSource, /const stackStatusWeight = \{ normal: 1, disabled: 0\.5, warning: 1\.5, error: 1\.5 \}/)
assert.match(clientSource, /Math\.max\(base \* stackStatusWeight\[status\], stackMinGap\)/)
assert.match(clientSource, /const positions = \[0\]/)
assert.match(clientSource, /const dragStartDistance = 8/)
assert.match(clientSource, /const longPressDelay = 620/)
assert.match(clientSource, /const recallPluginPatches =/)
assert.match(clientSource, /\.sort\(\(left, right\) => left\.index - right\.index\)/)
assert.match(clientSource, /active\.recalled = true/)
assert.match(clientSource, /!active\.moved && event\.type === 'pointerup'/)
assert.match(clientSource, /suppressCardClick\.current = true/)
assert.match(clientSource, /const bottom = positions\[depth \+ 1\]/)
assert.match(clientSource, /return \{ bottom, left: inset, right: inset \}/)
assert.match(clientSource, /dshHarmonyPatchCard\[data-status=warning\]/)
assert.match(clientSource, /dshHarmonyPatchCard\[data-status=error\]/)
assert.match(clientSource, /dshHarmonyPatchCard\[data-status=disabled\]/)
assert.doesNotMatch(clientSource, /orderConflict/)
assert.doesNotMatch(clientSource, /dshHarmonyBadge/)
assert.match(clientSource, /dshHarmonySettingsPanel:has\(\.dshHarmonyPage\)\{width:1200px\}/)
assert.match(clientSource, /dshHarmonySettingsPanel\{transition:width \.28s/)
assert.match(clientSource, /grid-template-columns:minmax\(250px,450px\) minmax\(0,1fr\)/)
assert.match(clientSource, /grid-template-columns:minmax\(260px,450px\) minmax\(0,1fr\)/)
assert.match(clientSource, /coverRefs\.current\.get\(node\.id\) \?\? event\.currentTarget/)
assert.match(clientSource, /selected\?\.kind === 'patch' && selected\.key === key/)
assert.match(clientSource, /data-owner-selected/)
assert.match(clientSource, /box-shadow:inset 0 0 0 1px var\(--dsh-card-border\)/)
assert.doesNotMatch(clientSource, /box-shadow:inset 0 0 0 2px var\(--dsh-card-border\)/)
assert.match(clientSource, /data-has-selection/)
assert.match(clientSource, /dshHarmonyStack:not\(\[data-owner-selected=true\]\).*width:75%/)
assert.match(clientSource, /dshHarmonyPatchCard:not\(\[data-owner-selected=true\]\)\{width:75%\}/)
assert.match(clientSource, /dshHarmonyStack\[data-selected=true\] \.dshHarmonyStackCover/)
assert.match(clientSource, /dshHarmonyPatchCard\[data-selected=true\]/)
assert.doesNotMatch(clientSource, /dshHarmonyStackSummary:hover[^}]*background/)
assert.doesNotMatch(clientSource, /dshHarmonyPatchCard\[data-selected=true\]\{background/)
assert.match(clientSource, /const stackHealthColor =/)
assert.match(clientSource, /const stackCoverColor =/)
assert.match(clientSource, /filter\(status => status !== 'disabled'\)/)
assert.match(clientSource, /if \(statuses\.length === 0\)\s+return 'var\(--dsw-alias-label-tertiary\)'/)
assert.match(clientSource, /statuses\.every\(status => status === 'disabled'\)/)
assert.match(clientSource, /const warning = statuses\.filter\(status => status === 'warning'\)\.length \/ statuses\.length/)
assert.match(clientSource, /const error = statuses\.filter\(status => status === 'error'\)\.length \/ statuses\.length/)
assert.match(clientSource, /const warningWithinNonError = nonError === 0 \? 0 : warning \/ nonError/)
assert.match(clientSource, /color-mix\(in srgb,#fff/)
assert.match(clientSource, /dshHarmonyStackState/)
assert.match(clientSource, /stackHealthColor\(keys\)\} 10%,var\(--dsw-alias-bg-layer-2\)/)
assert.match(clientSource, /style: \{ background: stackCoverColor\(node\.keys\) \}/)
assert.match(clientSource, /height: `\$\{dragPreview\.height\}px`, background: stackCoverColor\(dragPreview\.keys\)/)
assert.match(clientSource, /patchDeclaration/)
assert.match(clientSource, /\.dshHarmonyStack\[data-collapsed=true\] \.dshHarmonyStackCover\{position:relative;inset:auto\}/)
assert.match(clientSource, /bottom: `\$\{geometry\.height - layer\.bottom\}px`/)
assert.match(clientSource, /if \(!active\.moved\) \{\s+cancelLongPress\(\);\s+active\.moved = true;\s+started = true;\s+setDraggingKeys\(active\.keys\)/)
assert.match(clientSource, /const dropProjectionAt =/)
assert.match(clientSource, /const reconcileMerges =/)
assert.match(clientSource, /const patchBounds = \(key\) =>/)
assert.match(clientSource, /element\?\.parentElement \?\? element/)
assert.match(clientSource, /const top = Math\.min\(\.\.\.bounds\.map\(value => value\.top\)\)/)
assert.match(clientSource, /if \(clientY < top \|\| clientY > bottom\)\s+remove\.push\(\.\.\.boundaries\)/)
assert.match(clientSource, /window\.addEventListener\('pointerup', finish, true\)/)
assert.match(clientSource, /const target = active\.moved \? dropProjectionAt\(event\.clientX, event\.clientY\)\.target : active\.target;\s+drag\.current = null/)
assert.match(clientSource, /dshHarmonyDropSlot/)
assert.doesNotMatch(clientSource, /const beginDrag[\s\S]{0,250}event\.preventDefault\(\)/)
assert.doesNotMatch(clientSource, /dshHarmonyStackOpen/)
assert.match(clientSource, /JSON\.stringify\(\{ patchOrder \}\)/)
assert.doesNotMatch(clientSource, /JSON\.stringify\(\{ order, patchOrder \}\)/)
