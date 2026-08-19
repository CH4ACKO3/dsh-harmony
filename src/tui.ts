import { emitKeypressEvents } from 'node:readline'
import type { ReadStream, WriteStream } from 'node:tty'
import { readHarmonyRuntime, updateHarmonyProfile } from './control.js'
import type { HarmonyProfileUpdateResult } from './index.js'
import { autoSortOrder, orderViolations } from './order.js'
import { HARMONY_PLUGIN, pinHarmonyOrder, readHarmonyProfile, type HarmonyProfileView } from './profile.js'

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
    '↑/↓ 选择   u/d 移动   a 自动排序   r 同步插件   q 退出',
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

export async function saveHarmonyTuiOrder(profileDir: string, order: string[]): Promise<HarmonyProfileUpdateResult> {
  order = pinHarmonyOrder(order)
  return updateHarmonyProfile(profileDir, { order })
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
  const readProfile = async () => (await readHarmonyRuntime(profileDir))?.profile ?? readHarmonyProfile(profileDir)
  let profile = await readProfile()
  let selected = 0
  let message = ''
  let saving = false
  const draw = (): void => {
    output.write(`${ESC}?25l${ESC}2J${ESC}H${renderHarmonyTui(profile, selected, message, output.rows)}`)
  }
  const persist = async (order: string[], action: string): Promise<boolean> => {
    saving = true
    message = '正在预检并应用顺序…'
    draw()
    try {
      const result = await saveHarmonyTuiOrder(profileDir, order)
      profile = result.profile
      selected = Math.min(selected, Math.max(0, order.length - 1))
      message = updateMessage(result, action)
      return true
    } catch (error) {
      message = `保存失败：${error instanceof Error ? error.message : String(error)}`
      return false
    } finally {
      saving = false
    }
  }
  const move = async (offset: number): Promise<void> => {
    if (profile.order[selected] === HARMONY_PLUGIN) return
    const target = selected + offset
    const firstMovable = profile.order[0] === HARMONY_PLUGIN ? 1 : 0
    if (target < firstMovable || target >= profile.order.length) return
    const order = [...profile.order]
    ;[order[selected], order[target]] = [order[target]!, order[selected]!]
    if (await persist(order, '顺序已保存')) selected = target
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
      if (key.name === 'up' || text === 'k') selected = Math.max(0, selected - 1)
      if (key.name === 'down' || text === 'j') selected = Math.min(profile.order.length - 1, selected + 1)
      if (text === 'u') await move(-1)
      if (text === 'd') await move(1)
      if (text === 'a') {
        const order = pinHarmonyOrder(autoSortOrder(profile.order, profile.plugins))
        await persist(order, `自动排序完成，最少仍有 ${orderViolations(order, profile.plugins).length} 条约束无法满足`)
      }
      if (text === 'r') {
        await persist((await readProfile()).order, '已同步当前安装的插件')
      }
      draw()
    }
    input.on('keypress', onKey)
    output.on('resize', draw)
  })
}
