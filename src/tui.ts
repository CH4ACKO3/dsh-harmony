import { emitKeypressEvents } from 'node:readline'
import type { ReadStream, WriteStream } from 'node:tty'
import {
  inspectHarmonyRuntime,
  readHarmonyRuntime,
  reloadHarmonyRuntime,
  updateHarmonyProfile,
} from './control.js'
import type { HarmonyPatchStatus, HarmonyProfileUpdateResult } from './index.js'
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

function relation(provider: HarmonyProfileView['plugins'][number]): string {
  const parts = []
  if (provider.before.length > 0) parts.push(`前于 ${provider.before.join(', ')}`)
  if (provider.after.length > 0) parts.push(`后于 ${provider.after.join(', ')}`)
  const conflicts = Object.entries(provider.conflicts).map(([name, range]) => range === '*' ? name : `${name}@${range}`)
  if (conflicts.length > 0) parts.push(`声明不兼容 ${conflicts.join(', ')}`)
  return parts.join('；')
}

export function renderHarmonyTui(
  profile: HarmonyProfileView,
  selected: number,
  message: string,
  height = Number.POSITIVE_INFINITY,
): string {
  const byName = new Map(profile.plugins.map(plugin => [plugin.name, plugin]))
  const violations = orderViolations(profile.order, profile.plugins)
  const conflicting = new Set(violations.flatMap(item => [item.before, item.after]))
  const incompatible = new Set(profile.pluginConflicts.flatMap(item => [item.left.package, item.right.package]))
  const header = [
    `${ESC}1mDSH Harmony${ESC}0m  profile: ${profile.dir.split('/').at(-1)}`,
    '',
    '[Provider]  Patch   Tab 切换   ↑/↓ 选择   u/d 移动   a 自动排序   r 重载   q 退出',
    '',
  ]
  const providerBlocks = profile.order.map((name, index) => {
    const provider = byName.get(name)!
    const cursor = index === selected ? `${ESC}36m▶${ESC}0m` : ' '
    const warning = conflicting.has(name)
      ? `${ESC}31m!${ESC}0m`
      : incompatible.has(name) ? `${ESC}33m!${ESC}0m` : ' '
    const block = [`${cursor} ${String(index + 1).padStart(2)} ${warning} ${name}${name === HARMONY_PLUGIN ? '  [固定]' : ''}`]
    const detail = relation(provider)
    if (detail.length > 0) block.push(`       ${ESC}2m${detail}${ESC}0m`)
    return block
  })
  const footer = ['']
  if (violations.length === 0) {
    footer.push(`${ESC}32m顺序约束已全部满足。${ESC}0m`)
  } else {
    footer.push(`${ESC}31m${violations.length} 条顺序约束无法由当前列表满足：${ESC}0m`)
    for (const violation of violations) {
      footer.push(`  - ${violation.before} 必须在 ${violation.after} 前（由 ${violation.declaredBy} 声明）`)
    }
  }
  if (profile.pluginConflicts.length > 0) {
    footer.push('', `${ESC}33m${profile.pluginConflicts.length} 条插件冲突（仅警告，插件仍保持启用）：${ESC}0m`)
    for (const item of profile.pluginConflicts) {
      footer.push(`  - ${item.left.package}@${item.left.version} 与 ${item.right.package}@${item.right.version} 不兼容（由 ${item.declaredBy.join(', ')} 声明）`)
    }
  }
  if (message.length > 0) footer.push('', `${ESC}33m${message}${ESC}0m`)

  if (!Number.isFinite(height)) {
    return [...header, ...(providerBlocks.length === 0 ? ['  没有已安装的 Harmony patch 插件。'] : providerBlocks.flat()), ...footer].join('\n')
  }

  const compactFooter = [
    '',
    violations.length === 0
      ? `${ESC}32m顺序约束已全部满足。${ESC}0m`
      : `${ESC}31m${violations.length} 条顺序约束未满足。${ESC}0m`,
    ...(profile.pluginConflicts.length === 0
      ? [] : [`${ESC}33m${profile.pluginConflicts.length} 条插件冲突（仅警告）。${ESC}0m`]),
    ...(message.length === 0 ? [] : [`${ESC}33m${message}${ESC}0m`]),
  ]
  const available = Math.max(1, Math.floor(height) - header.length - compactFooter.length)
  if (providerBlocks.length === 0) {
    return [...header, '  没有已安装的 Harmony patch 插件。', ...compactFooter]
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
        ...(best.start > 0 ? [`  … ${best.start} 项在上方`] : []),
        ...providerBlocks.slice(best.start, best.end).flat(),
        ...(best.end < providerBlocks.length ? [`  … ${providerBlocks.length - best.end} 项在下方`] : []),
      ]
  return [...header, ...visible, ...compactFooter]
    .slice(0, Math.max(1, Math.floor(height))).join('\n')
}

function patchTarget(patch: HarmonyPatchStatus): string {
  return patch.targets.map(target => `${target.package}/${target.files.join('|')}`).join(', ')
}

export function renderHarmonyPatchTui(
  profile: HarmonyProfileView,
  patches: HarmonyPatchStatus[],
  selected: number,
  message: string,
  height = Number.POSITIVE_INFINITY,
): string {
  const byKey = new Map(patches.map(patch => [patch.key, patch]))
  const ordered = profile.patchOrder.map(key => byKey.get(key)).filter((patch): patch is HarmonyPatchStatus => patch !== undefined)
  selected = Math.max(0, Math.min(selected, Math.max(0, ordered.length - 1)))
  const selectedPatch = ordered[selected]
  const header = [
    `${ESC}1mDSH Harmony${ESC}0m  profile: ${profile.dir.split('/').at(-1)}`,
    '',
    ' Provider  [Patch]   Tab 切换   ↑/↓ 选择   u/d 移动   Space 启停   p Provider   a 自动排序   i 检查   r 重载   q 退出',
    '',
  ]
  const blocks = ordered.map((patch, index) => {
    const cursor = index === selected ? `${ESC}36m▶${ESC}0m` : ' '
    const state = patch.state === 'bound'
      ? `${ESC}32m●${ESC}0m`
      : patch.state === 'failed' ? `${ESC}31m!${ESC}0m`
        : patch.state === 'disabled' ? `${ESC}2m○${ESC}0m` : `${ESC}33m…${ESC}0m`
    return `${cursor} ${String(index + 1).padStart(3)} ${state} ${patch.key}  ${ESC}2m${patch.kind} · ${patch.matches} match${patch.matches === 1 ? '' : 'es'}${ESC}0m`
  })
  const footer = [
    '',
    profile.patchOrderViolations.length === 0
      ? `${ESC}32mPatch 顺序约束已全部满足。${ESC}0m`
      : `${ESC}31m${profile.patchOrderViolations.length} 条 Patch 顺序约束未满足。${ESC}0m`,
    ...(selectedPatch === undefined ? [] : [
      `${selectedPatch.state} · generation ${selectedPatch.generation} · ${patchTarget(selectedPatch)}`,
      ...(selectedPatch.error === undefined ? [] : [`${ESC}31m${selectedPatch.error}${ESC}0m`]),
    ]),
    ...(message.length === 0 ? [] : [`${ESC}33m${message}${ESC}0m`]),
  ]
  if (!Number.isFinite(height)) {
    return [...header, ...(blocks.length === 0 ? ['  没有已注册的 Harmony Patch。'] : blocks), ...footer].join('\n')
  }
  const limit = Math.max(1, Math.floor(height))
  const available = Math.max(1, limit - header.length - footer.length)
  if (blocks.length === 0) return [...header, '  没有已注册的 Harmony Patch。', ...footer].slice(0, limit).join('\n')
  const count = Math.max(1, available - 2)
  let start = Math.max(0, selected - Math.floor(count / 2))
  let end = Math.min(blocks.length, start + count)
  start = Math.max(0, end - count)
  const visible = [
    ...(start > 0 ? [`  … ${start} 项在上方`] : []),
    ...blocks.slice(start, end),
    ...(end < blocks.length ? [`  … ${blocks.length - end} 项在下方`] : []),
  ]
  return [...header, ...visible, ...footer].slice(0, limit).join('\n')
}

export async function saveHarmonyTuiOrder(profileDir: string, order: string[]): Promise<HarmonyProfileUpdateResult> {
  order = pinHarmonyOrder(order)
  return updateHarmonyProfile(profileDir, { order })
}

export async function saveHarmonyTuiPatchOrder(profileDir: string, patchOrder: string[]): Promise<HarmonyProfileUpdateResult> {
  return updateHarmonyProfile(profileDir, { patchOrder })
}

function updateMessage(result: HarmonyProfileUpdateResult, action: string): string {
  return result.mode === 'live'
    ? `${action}；Harness 已提交 generation ${result.generation} 并完成热重载。`
    : `${action}；profile 当前未运行，将在下次启动时生效。`
}

export async function runHarmonyTui(
  profileDir: string,
  input: ReadStream = process.stdin,
  output: WriteStream = process.stdout,
): Promise<void> {
  if (!input.isTTY || !output.isTTY) throw new Error('dsh harmony requires an interactive terminal')
  const offlineState = () => {
    installModuleHooks()
    discoverProfile(profileDir)
    inspectPatchTargets(true)
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
  const draw = (): void => {
    const view = page === 'providers'
      ? renderHarmonyTui(profile, providerSelected, message, output.rows)
      : renderHarmonyPatchTui(profile, patches, patchSelected, message, output.rows)
    output.write(`${ESC}?25l${ESC}2J${ESC}H${view}`)
  }
  const persist = async (input: HarmonyProfileUpdate, action: string): Promise<boolean> => {
    saving = true
    message = '正在预检并应用设置…'
    draw()
    try {
      const result = await updateHarmonyProfile(profileDir, input)
      state = await readState()
      profile = state.profile
      patches = state.patches
      providerSelected = Math.min(providerSelected, Math.max(0, profile.order.length - 1))
      patchSelected = Math.min(patchSelected, Math.max(0, profile.patchOrder.length - 1))
      message = updateMessage(result, action)
      return true
    } catch (error) {
      message = `保存失败：${error instanceof Error ? error.message : String(error)}`
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
    if (await persist({ order }, 'Provider 顺序已保存')) providerSelected = target
  }
  const movePatch = async (offset: number): Promise<void> => {
    const target = patchSelected + offset
    if (target < 0 || target >= profile.patchOrder.length) return
    const patchOrder = [...profile.patchOrder]
    ;[patchOrder[patchSelected], patchOrder[target]] = [patchOrder[target]!, patchOrder[patchSelected]!]
    if (await persist({ patchOrder }, 'Patch 顺序已保存')) patchSelected = target
  }
  const togglePatch = async (): Promise<void> => {
    const patch = patches.find(item => item.key === profile.patchOrder[patchSelected])
    if (patch === undefined) return
    const disabled = new Set(profile.disabled)
    const providerKey = `${patch.owner}/*`
    if (disabled.has(providerKey)) {
      message = `Provider ${patch.owner} 已停用；按 p 启用整个 Provider。`
      return
    }
    if (disabled.has(patch.key)) disabled.delete(patch.key)
    else disabled.add(patch.key)
    await persist({ disabled: [...disabled] }, `${patch.key} 已${disabled.has(patch.key) ? '停用' : '启用'}`)
  }
  const toggleProvider = async (): Promise<void> => {
    const patch = patches.find(item => item.key === profile.patchOrder[patchSelected])
    if (patch === undefined) return
    const disabled = new Set(profile.disabled)
    const providerKey = `${patch.owner}/*`
    const enable = disabled.has(providerKey)
    for (const item of patches) if (item.owner === patch.owner) disabled.delete(item.key)
    if (enable) disabled.delete(providerKey)
    else disabled.add(providerKey)
    await persist({ disabled: [...disabled] }, `Provider ${patch.owner} 已${enable ? '启用' : '停用'}`)
  }
  const reload = async (): Promise<void> => {
    saving = true
    message = state.mode === 'live' ? '正在重载 Harmony…' : '正在重新扫描离线 profile…'
    draw()
    try {
      const reloaded = state.mode === 'live' ? await reloadHarmonyRuntime(profileDir) : undefined
      state = reloaded === undefined ? await readState() : { mode: 'live' as const, ...reloaded }
      profile = state.profile
      patches = state.patches
      message = reloaded === undefined ? '已重新扫描离线 profile。' : `重载完成：${reloaded.reload.state}。`
    } catch (error) {
      message = `重载失败：${error instanceof Error ? error.message : String(error)}`
    } finally {
      saving = false
    }
  }
  const inspectPatch = async (): Promise<void> => {
    const patch = patches.find(item => item.key === profile.patchOrder[patchSelected])
    if (patch === undefined) return
    try {
      const target = patch.targets.length === 1 && patch.file !== undefined ? patch.targets[0] : undefined
      const live = state.mode === 'live'
        ? await inspectHarmonyRuntime(profileDir, target?.package, patch.file)
        : undefined
      const inspections = live?.targets ?? (state.mode === 'offline' ? getPatchInspections(target?.package, patch.file) : [])
      const matched = inspections.filter(item => item.steps.some(step => step.key === patch.key))
      message = matched.length === 0
        ? `${patch.key} 当前没有可检查的变换结果。`
        : `检查 ${matched.length} 个目标：${matched.map(item => `${item.package}/${item.file} [${item.steps.map(step => step.key).join(' → ')}]`).join('；')}`
    } catch (error) {
      message = `检查失败：${error instanceof Error ? error.message : String(error)}`
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
          await persist({ order }, `自动排序完成，最少仍有 ${orderViolations(order, profile.plugins).length} 条约束无法满足`)
        } else {
          const items = patches.map(patch => ({
            key: patch.key,
            owner: patch.owner,
            index: patch.index,
            ...(patch.before === undefined ? {} : { before: patch.before }),
            ...(patch.after === undefined ? {} : { after: patch.after }),
          }))
          const patchOrder = autoSortPatchOrder(profile.patchOrder, items, profile.plugins)
          await persist({ patchOrder }, `Patch 自动排序完成`)
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
