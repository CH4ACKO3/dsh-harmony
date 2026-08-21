import { emitKeypressEvents } from 'node:readline'
import type { ReadStream, WriteStream } from 'node:tty'
import {
  inspectHarmonyRuntime,
  readHarmonyRuntime,
  reloadHarmonyRuntime,
  updateHarmonyProfile,
} from './control.js'
import type { HarmonyPatchStatus, HarmonyProfileUpdateResult } from './index.js'
import { terminalLocale, terminalText, type HarmonyLocale } from './locale.js'
import { autoSortOrder, autoSortPatchOrder, orderViolations } from './order.js'
import {
  createHarmonyProfileView,
  HARMONY_PLUGIN,
  pinHarmonyOrder,
  type HarmonyProfileUpdate,
  type HarmonyProfileView,
} from './profile.js'
import {
  currentProfile,
  discoverProfile,
  getPatchInspections,
  getPatchOrderViolations,
  getPatchStatuses,
  inspectPatchTargets,
  installModuleHooks,
} from './runtime.js'

const ESC = '\u001b['
const copy = (locale: HarmonyLocale, english: string, chinese: string): string => terminalText(locale, english, chinese)
const patchStateLabel = (locale: HarmonyLocale, state: string): string => locale === 'zh' ? ({
  bound: '已绑定', disabled: '已停用', failed: '失败', pending: '等待中', shadowed: '被覆盖', skipped: '已跳过',
} as Record<string, string>)[state] ?? state : state
const reloadStateLabel = (locale: HarmonyLocale, state: string): string => locale === 'zh' ? ({
  idle: '空闲', reloading: '重载中', succeeded: '成功', failed: '失败',
} as Record<string, string>)[state] ?? state : state

function relation(provider: HarmonyProfileView['plugins'][number], locale: HarmonyLocale): string {
  const parts = []
  if (provider.before.length > 0) parts.push(copy(locale,
    `Before ${provider.before.join(', ')}`,
    `前于 ${provider.before.join(', ')}`,
  ))
  if (provider.after.length > 0) parts.push(copy(locale,
    `After ${provider.after.join(', ')}`,
    `后于 ${provider.after.join(', ')}`,
  ))
  const declaration = (field: keyof typeof provider.compatibility): string[] => Object.entries(provider.compatibility[field])
    .map(([name, range]) => range === '*' ? name : `${name}@${range}`)
  const required = declaration('requires')
  const conflicts = declaration('conflicts')
  const integrations = declaration('integrates')
  if (required.length > 0) parts.push(copy(locale, `Requires ${required.join(', ')}`, `需要 ${required.join(', ')}`))
  if (conflicts.length > 0) parts.push(copy(locale, `Conflicts with ${conflicts.join(', ')}`, `冲突于 ${conflicts.join(', ')}`))
  if (integrations.length > 0) parts.push(copy(locale, `Integrates with ${integrations.join(', ')}`, `联动于 ${integrations.join(', ')}`))
  return parts.join(copy(locale, '; ', '；'))
}

export function renderHarmonyTui(
  profile: HarmonyProfileView,
  selected: number,
  message: string,
  height = Number.POSITIVE_INFINITY,
  locale: HarmonyLocale = terminalLocale(),
): string {
  const byName = new Map(profile.plugins.map(plugin => [plugin.name, plugin]))
  const violations = orderViolations(profile.order, profile.plugins)
  const conflicting = new Set(violations.flatMap(item => [item.before, item.after]))
  const compatibilityWarnings = profile.compatibility.filter(item => item.kind !== 'integration')
  const incompatible = new Set(compatibilityWarnings.flatMap(item => item.kind === 'conflict'
    ? [item.left.package, item.right.package]
    : [item.owner.package, item.target.package]))
  const header = [
    `${ESC}1mDSH Harmony${ESC}0m  ${copy(locale, 'profile', '配置')}: ${profile.dir.split('/').at(-1)}`,
    '',
    copy(locale,
      '[Provider]  Patch   Tab switch   ↑/↓ select   u/d move   a auto-sort   r reload   q quit',
      '[Provider]  Patch   Tab 切换   ↑/↓ 选择   u/d 移动   a 自动排序   r 重载   q 退出',
    ),
    '',
  ]
  const providerBlocks = profile.order.map((name, index) => {
    const provider = byName.get(name)!
    const cursor = index === selected ? `${ESC}36m▶${ESC}0m` : ' '
    const warning = conflicting.has(name)
      ? `${ESC}31m!${ESC}0m`
      : incompatible.has(name) ? `${ESC}33m!${ESC}0m` : ' '
    const block = [`${cursor} ${String(index + 1).padStart(2)} ${warning} ${name}${name === HARMONY_PLUGIN ? copy(locale, '  [pinned]', '  [固定]') : ''}`]
    const detail = relation(provider, locale)
    if (detail.length > 0) block.push(`       ${ESC}2m${detail}${ESC}0m`)
    return block
  })
  const footer = ['']
  if (violations.length === 0) {
    footer.push(`${ESC}32m${copy(locale, 'All order constraints are satisfied.', '顺序约束已全部满足。')}${ESC}0m`)
  } else {
    footer.push(`${ESC}31m${copy(locale,
      `${violations.length} order constraints cannot be satisfied by the current list:`,
      `${violations.length} 条顺序约束无法由当前列表满足：`,
    )}${ESC}0m`)
    for (const violation of violations) {
      footer.push(copy(locale,
        `  - ${violation.before} must precede ${violation.after} (declared by ${violation.declaredBy})`,
        `  - ${violation.before} 必须在 ${violation.after} 前（由 ${violation.declaredBy} 声明）`,
      ))
    }
  }
  if (compatibilityWarnings.length > 0) {
    footer.push('', `${ESC}33m${copy(locale,
      `${compatibilityWarnings.length} compatibility warnings (Harmony does not change plugin state):`,
      `${compatibilityWarnings.length} 条兼容性警告（Harmony 不改变插件状态）：`,
    )}${ESC}0m`)
    for (const item of compatibilityWarnings) {
      footer.push(item.kind === 'conflict' ? copy(locale,
        `  - ${item.left.package}@${item.left.version} conflicts with ${item.right.package}@${item.right.version} (declared by ${item.declaredBy.join(', ')})`,
        `  - ${item.left.package}@${item.left.version} 与 ${item.right.package}@${item.right.version} 冲突（由 ${item.declaredBy.join(', ')} 声明）`,
      ) : copy(locale,
        `  - ${item.owner.package}@${item.owner.version} requires ${item.target.package}@${item.target.range} (${item.reason})`,
        `  - ${item.owner.package}@${item.owner.version} 需要 ${item.target.package}@${item.target.range}（${item.reason}）`,
      ))
    }
  }
  if (message.length > 0) footer.push('', `${ESC}33m${message}${ESC}0m`)

  if (!Number.isFinite(height)) {
    return [...header, ...(providerBlocks.length === 0
      ? [copy(locale, '  No Harmony patch plugins are installed.', '  没有已安装的 Harmony patch 插件。')]
      : providerBlocks.flat()), ...footer].join('\n')
  }

  const compactFooter = [
    '',
    violations.length === 0
      ? `${ESC}32m${copy(locale, 'All order constraints are satisfied.', '顺序约束已全部满足。')}${ESC}0m`
      : `${ESC}31m${copy(locale, `${violations.length} order constraints are not satisfied.`, `${violations.length} 条顺序约束未满足。`)}${ESC}0m`,
    ...(compatibilityWarnings.length === 0
      ? [] : [`${ESC}33m${copy(locale, `${compatibilityWarnings.length} compatibility warnings.`, `${compatibilityWarnings.length} 条兼容性警告。`)}${ESC}0m`]),
    ...(message.length === 0 ? [] : [`${ESC}33m${message}${ESC}0m`]),
  ]
  const available = Math.max(1, Math.floor(height) - header.length - compactFooter.length)
  if (providerBlocks.length === 0) {
    return [...header, copy(locale, '  No Harmony patch plugins are installed.', '  没有已安装的 Harmony patch 插件。'), ...compactFooter]
      .slice(0, Math.max(1, Math.floor(height))).join('\n')
  }
  selected = Math.max(0, Math.min(selected, providerBlocks.length - 1))
  let best: { start: number; end: number; count: number; balance: number } | undefined
  for (let start = 0; start <= selected; start += 1) {
    let blockLines = 0
    for (let end = start + 1; end <= providerBlocks.length; end += 1) {
      blockLines += providerBlocks[end - 1]!.length
      if (end <= selected) continue
      const total = blockLines + (start > 0 ? 1 : 0) + (end < providerBlocks.length ? 1 : 0)
      if (total > available) continue
      const candidate = {
        start,
        end,
        count: end - start,
        balance: Math.abs(selected - start - (end - selected - 1)),
      }
      if (best === undefined || candidate.count > best.count
        || candidate.count === best.count && candidate.balance < best.balance) best = candidate
    }
  }
  const visible = best === undefined
    ? [providerBlocks[selected]![0]!]
    : [
        ...(best.start > 0 ? [copy(locale, `  … ${best.start} items above`, `  … ${best.start} 项在上方`)] : []),
        ...providerBlocks.slice(best.start, best.end).flat(),
        ...(best.end < providerBlocks.length
          ? [copy(locale, `  … ${providerBlocks.length - best.end} items below`, `  … ${providerBlocks.length - best.end} 项在下方`)]
          : []),
      ]
  return [...header, ...visible, ...compactFooter]
    .slice(0, Math.max(1, Math.floor(height))).join('\n')
}

function patchTarget(patch: HarmonyPatchStatus): string {
  return patch.targets.map(target => `${target.package}/${target.file}`).join(', ')
}

export function renderHarmonyPatchTui(
  profile: HarmonyProfileView,
  patches: HarmonyPatchStatus[],
  selected: number,
  message: string,
  height = Number.POSITIVE_INFINITY,
  locale: HarmonyLocale = terminalLocale(),
): string {
  const byKey = new Map(patches.map(patch => [patch.key, patch]))
  const ordered = profile.patchOrder.map(key => byKey.get(key)).filter((patch): patch is HarmonyPatchStatus => patch !== undefined)
  selected = Math.max(0, Math.min(selected, Math.max(0, ordered.length - 1)))
  const selectedPatch = ordered[selected]
  const header = [
    `${ESC}1mDSH Harmony${ESC}0m  ${copy(locale, 'profile', '配置')}: ${profile.dir.split('/').at(-1)}`,
    '',
    copy(locale,
      ' Provider  [Patch]   Tab switch   ↑/↓ select   u/d move   Space toggle   p Provider   a auto-sort   i inspect   r reload   q quit',
      ' Provider  [Patch]   Tab 切换   ↑/↓ 选择   u/d 移动   Space 启停   p Provider   a 自动排序   i 检查   r 重载   q 退出',
    ),
    '',
  ]
  const blocks = ordered.map((patch, index) => {
    const cursor = index === selected ? `${ESC}36m▶${ESC}0m` : ' '
    const state = patch.state === 'bound'
      ? `${ESC}32m●${ESC}0m`
      : patch.state === 'failed' ? `${ESC}31m!${ESC}0m`
        : patch.state === 'disabled' ? `${ESC}2m○${ESC}0m` : `${ESC}33m…${ESC}0m`
    const kind = copy(locale, ({
      source: 'source', semantic: 'semantic', loader: 'loader', composite: 'composite',
    })[patch.kind], ({
      source: '源码', semantic: '语义', loader: '加载器', composite: '组合',
    })[patch.kind])
    const matches = copy(locale,
      `${patch.matches} match${patch.matches === 1 ? '' : 'es'}`,
      `${patch.matches} 次匹配`,
    )
    return `${cursor} ${String(index + 1).padStart(3)} ${state} ${patch.key}  ${ESC}2m${kind} · ${matches}${ESC}0m`
  })
  const footer = [
    '',
    profile.patchOrderViolations.length === 0
      ? `${ESC}32m${copy(locale, 'All Patch order constraints are satisfied.', 'Patch 顺序约束已全部满足。')}${ESC}0m`
      : `${ESC}31m${copy(locale,
        `${profile.patchOrderViolations.length} Patch order constraints are not satisfied.`,
        `${profile.patchOrderViolations.length} 条 Patch 顺序约束未满足。`,
      )}${ESC}0m`,
    ...(selectedPatch === undefined ? [] : [
      copy(locale,
        `${selectedPatch.state} · generation ${selectedPatch.generation} · ${patchTarget(selectedPatch)}`,
        `${patchStateLabel(locale, selectedPatch.state)} · 代次 ${selectedPatch.generation} · ${patchTarget(selectedPatch)}`,
      ),
      ...(selectedPatch.error === undefined ? [] : [`${ESC}31m${selectedPatch.error}${ESC}0m`]),
    ]),
    ...(message.length === 0 ? [] : [`${ESC}33m${message}${ESC}0m`]),
  ]
  if (!Number.isFinite(height)) {
    return [...header, ...(blocks.length === 0
      ? [copy(locale, '  No Harmony Patches are registered.', '  没有已注册的 Harmony Patch。')]
      : blocks), ...footer].join('\n')
  }
  const limit = Math.max(1, Math.floor(height))
  const available = Math.max(1, limit - header.length - footer.length)
  if (blocks.length === 0) {
    return [...header, copy(locale, '  No Harmony Patches are registered.', '  没有已注册的 Harmony Patch。'), ...footer]
      .slice(0, limit).join('\n')
  }
  const count = Math.max(1, available - 2)
  let start = Math.max(0, selected - Math.floor(count / 2))
  let end = Math.min(blocks.length, start + count)
  start = Math.max(0, end - count)
  const visible = [
    ...(start > 0 ? [copy(locale, `  … ${start} items above`, `  … ${start} 项在上方`)] : []),
    ...blocks.slice(start, end),
    ...(end < blocks.length ? [copy(locale, `  … ${blocks.length - end} items below`, `  … ${blocks.length - end} 项在下方`)] : []),
  ]
  return [...header, ...visible, ...footer].slice(0, limit).join('\n')
}

export async function saveHarmonyTuiOrder(
  profileDir: string,
  order: string[],
  configured: string[] = [],
): Promise<HarmonyProfileUpdateResult> {
  order = pinHarmonyOrder(order)
  return updateHarmonyProfile(profileDir, { order }, configured)
}

export async function saveHarmonyTuiPatchOrder(
  profileDir: string,
  patchOrder: string[],
  configured: string[] = [],
): Promise<HarmonyProfileUpdateResult> {
  return updateHarmonyProfile(profileDir, { patchOrder }, configured)
}

function updateMessage(result: HarmonyProfileUpdateResult, action: string, locale: HarmonyLocale): string {
  return result.mode === 'live'
    ? copy(locale,
        `${action}; Harness committed generation ${result.generation} and completed the hot reload.`,
        `${action}；Harness 已提交 generation ${result.generation} 并完成热重载。`,
      )
    : copy(locale,
        `${action}; the profile is not running, so this will take effect on its next start.`,
        `${action}；profile 当前未运行，将在下次启动时生效。`,
      )
}

export async function runHarmonyTui(
  profileDir: string,
  input: ReadStream = process.stdin,
  output: WriteStream = process.stdout,
  locale: HarmonyLocale = terminalLocale(),
  configured: string[] = [],
): Promise<void> {
  if (!input.isTTY || !output.isTTY) throw new Error(copy(locale,
    'dsh harmony requires an interactive terminal',
    'dsh harmony 需要交互式终端',
  ))
  const offlineState = () => {
    installModuleHooks()
    discoverProfile(profileDir, false, configured)
    inspectPatchTargets()
    const patches = getPatchStatuses()
    const patchCounts = new Map(currentProfile().plugins.map(plugin => [plugin.name, 0]))
    for (const patch of patches) patchCounts.set(patch.owner, (patchCounts.get(patch.owner) ?? 0) + 1)
    return {
      mode: 'offline' as const,
      profile: createHarmonyProfileView(currentProfile(), patchCounts, getPatchOrderViolations()),
      patches,
    }
  }
  const readState = async () => {
    const live = await readHarmonyRuntime(profileDir)
    return live === undefined ? offlineState() : { mode: 'live' as const, ...live }
  }
  let state = await readState()
  let profile = state.profile
  let patches = state.patches
  let page: 'providers' | 'patches' = 'providers'
  let providerSelected = 0
  let patchSelected = 0
  let message = ''
  let saving = false
  const acceptState = (next: Awaited<ReturnType<typeof readState>>): void => {
    state = next
    profile = next.profile
    patches = next.patches
    providerSelected = Math.min(providerSelected, Math.max(0, profile.order.length - 1))
    patchSelected = Math.min(patchSelected, Math.max(0, profile.patchOrder.length - 1))
  }
  const draw = (): void => {
    const view = page === 'providers'
      ? renderHarmonyTui(profile, providerSelected, message, output.rows, locale)
      : renderHarmonyPatchTui(profile, patches, patchSelected, message, output.rows, locale)
    output.write(`${ESC}?25l${ESC}2J${ESC}H${view}`)
  }
  const persist = async (input: HarmonyProfileUpdate, action: string): Promise<boolean> => {
    saving = true
    message = copy(locale, 'Validating and applying settings…', '正在预检并应用设置…')
    draw()
    try {
      const result = await updateHarmonyProfile(profileDir, {
        ...input,
        expectedRevision: profile.revision,
      }, configured)
      acceptState(await readState())
      message = updateMessage(result, action, locale)
      return true
    } catch (error) {
      try {
        acceptState(await readState())
      } catch {}
      message = copy(locale,
        `Save failed: ${error instanceof Error ? error.message : String(error)}`,
        `保存失败：${error instanceof Error ? error.message : String(error)}`,
      )
      return false
    } finally {
      saving = false
    }
  }
  const moveProvider = async (offset: number): Promise<void> => {
    if (profile.order[providerSelected] === HARMONY_PLUGIN) return
    const target = providerSelected + offset
    const firstMovable = profile.order[0] === HARMONY_PLUGIN ? 1 : 0
    if (target < firstMovable || target >= profile.order.length) return
    const order = [...profile.order]
    ;[order[providerSelected], order[target]] = [order[target]!, order[providerSelected]!]
    if (await persist({ order }, copy(locale, 'Provider order saved', 'Provider 顺序已保存'))) providerSelected = target
  }
  const movePatch = async (offset: number): Promise<void> => {
    const target = patchSelected + offset
    if (target < 0 || target >= profile.patchOrder.length) return
    const patchOrder = [...profile.patchOrder]
    ;[patchOrder[patchSelected], patchOrder[target]] = [patchOrder[target]!, patchOrder[patchSelected]!]
    if (await persist({ patchOrder }, copy(locale, 'Patch order saved', 'Patch 顺序已保存'))) patchSelected = target
  }
  const togglePatch = async (): Promise<void> => {
    const patch = patches.find(item => item.key === profile.patchOrder[patchSelected])
    if (patch === undefined) return
    const disabled = new Set(profile.disabled)
    if (disabled.has(patch.key)) disabled.delete(patch.key)
    else disabled.add(patch.key)
    await persist({ disabled: [...disabled] }, copy(locale,
      `${patch.key} ${disabled.has(patch.key) ? 'disabled' : 'enabled'}`,
      `${patch.key} 已${disabled.has(patch.key) ? '停用' : '启用'}`,
    ))
  }
  const toggleProvider = async (): Promise<void> => {
    const patch = patches.find(item => item.key === profile.patchOrder[patchSelected])
    if (patch === undefined) return
    const disabled = new Set(profile.disabled)
    const providerKey = `${patch.owner}/*`
    const enable = disabled.has(providerKey)
    if (enable) disabled.delete(providerKey)
    else disabled.add(providerKey)
    await persist({ disabled: [...disabled] }, copy(locale,
      `Provider ${patch.owner} ${enable ? 'enabled' : 'disabled'}`,
      `Provider ${patch.owner} 已${enable ? '启用' : '停用'}`,
    ))
  }
  const reload = async (): Promise<void> => {
    saving = true
    message = state.mode === 'live'
      ? copy(locale, 'Reloading Harmony…', '正在重载 Harmony…')
      : copy(locale, 'Rescanning the offline profile…', '正在重新扫描离线 profile…')
    draw()
    try {
      const reloaded = state.mode === 'live' ? await reloadHarmonyRuntime(profileDir) : undefined
      state = reloaded === undefined ? await readState() : { mode: 'live' as const, ...reloaded }
      profile = state.profile
      patches = state.patches
      message = reloaded === undefined
        ? copy(locale, 'Offline profile rescanned.', '已重新扫描离线 profile。')
        : copy(locale,
            `Reload complete: ${reloaded.reload.state}.`,
            `重载完成：${reloadStateLabel(locale, reloaded.reload.state)}。`,
          )
    } catch (error) {
      message = copy(locale,
        `Reload failed: ${error instanceof Error ? error.message : String(error)}`,
        `重载失败：${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      saving = false
    }
  }
  const inspectPatch = async (): Promise<void> => {
    const patch = patches.find(item => item.key === profile.patchOrder[patchSelected])
    if (patch === undefined) return
    try {
      const target = patch.targets.length === 1 ? patch.targets[0] : undefined
      const live = state.mode === 'live'
        ? await inspectHarmonyRuntime(profileDir, target?.package, target?.file)
        : undefined
      const inspections = live?.targets ?? (state.mode === 'offline' ? getPatchInspections(target?.package, target?.file) : [])
      const matched = inspections.filter(item => item.steps.some(step => step.key === patch.key))
      message = matched.length === 0
        ? copy(locale,
            `${patch.key} has no transform results to inspect.`,
            `${patch.key} 当前没有可检查的变换结果。`,
          )
        : copy(locale,
            `Inspecting ${matched.length} targets: ${matched.map(item => `${item.package}/${item.file} [${item.steps.map(step => step.key).join(' → ')}]`).join('; ')}`,
            `检查 ${matched.length} 个目标：${matched.map(item => `${item.package}/${item.file} [${item.steps.map(step => step.key).join(' → ')}]`).join('；')}`,
          )
    } catch (error) {
      message = copy(locale,
        `Inspection failed: ${error instanceof Error ? error.message : String(error)}`,
        `检查失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  emitKeypressEvents(input)
  input.setRawMode(true)
  input.resume()
  draw()
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      input.off('keypress', onKey)
      output.off('resize', draw)
      input.setRawMode(false)
      output.write(`${ESC}?25h${ESC}2J${ESC}H`)
      resolve()
    }
    const onKey = async (text: string, key: { name?: string; ctrl?: boolean }): Promise<void> => {
      if (saving) return
      if (key.ctrl && key.name === 'c' || key.name === 'escape' || text === 'q') return finish()
      if (key.name === 'tab' || text === '\t') page = page === 'providers' ? 'patches' : 'providers'
      if (key.name === 'up' || text === 'k') {
        if (page === 'providers') providerSelected = Math.max(0, providerSelected - 1)
        else patchSelected = Math.max(0, patchSelected - 1)
      }
      if (key.name === 'down' || text === 'j') {
        if (page === 'providers') providerSelected = Math.min(Math.max(0, profile.order.length - 1), providerSelected + 1)
        else patchSelected = Math.min(Math.max(0, profile.patchOrder.length - 1), patchSelected + 1)
      }
      if (text === 'u') await (page === 'providers' ? moveProvider(-1) : movePatch(-1))
      if (text === 'd') await (page === 'providers' ? moveProvider(1) : movePatch(1))
      if (page === 'patches' && (key.name === 'space' || text === ' ')) await togglePatch()
      if (page === 'patches' && text === 'p') await toggleProvider()
      if (text === 'a') {
        if (page === 'providers') {
          const order = pinHarmonyOrder(autoSortOrder(profile.order, profile.plugins))
          const remaining = orderViolations(order, profile.plugins).length
          await persist({ order }, copy(locale,
            `Auto-sort complete; ${remaining} constraints remain unsatisfied`,
            `自动排序完成，仍有 ${remaining} 条约束无法满足`,
          ))
        } else {
          const items = patches.map(patch => ({
            key: patch.key,
            owner: patch.owner,
            index: patch.index,
            ...(patch.before === undefined ? {} : { before: patch.before }),
            ...(patch.after === undefined ? {} : { after: patch.after }),
          }))
          const patchOrder = autoSortPatchOrder(profile.patchOrder, items, profile.plugins)
          await persist({ patchOrder }, copy(locale, 'Patch auto-sort complete', 'Patch 自动排序完成'))
        }
      }
      if (page === 'patches' && text === 'i') await inspectPatch()
      if (text === 'r') await reload()
      draw()
    }
    input.on('keypress', onKey)
    output.on('resize', draw)
  })
}
