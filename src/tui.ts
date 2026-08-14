import { emitKeypressEvents } from 'node:readline'
import type { ReadStream, WriteStream } from 'node:tty'
import { updateRuntimeOrder } from './control.js'
import { autoSortOrder, orderViolations } from './order.js'
import { HARMONY_PLUGIN, pinHarmonyOrder, synchronizeHarmonyProfile, type HarmonyProfile } from './profile.js'
import { beginProfileUpdate, preflightProfileUpdate } from './runtime.js'

const ESC = '\u001b['

function relation(provider: HarmonyProfile['plugins'][number]): string {
  const parts = []
  if (provider.before.length > 0) parts.push(`前于 ${provider.before.join(', ')}`)
  if (provider.after.length > 0) parts.push(`后于 ${provider.after.join(', ')}`)
  return parts.join('；')
}

export function renderHarmonyTui(profile: HarmonyProfile, selected: number, message: string): string {
  const byName = new Map(profile.plugins.map(plugin => [plugin.name, plugin]))
  const violations = orderViolations(profile.order, profile.plugins)
  const conflicting = new Set(violations.flatMap(item => [item.before, item.after]))
  const lines = [
    `${ESC}1mDSH Harmony${ESC}0m  profile: ${profile.dir.split('/').at(-1)}`,
    '',
    '↑/↓ 选择   u/d 移动   a 自动排序   r 同步插件   q 退出',
    '',
  ]
  if (profile.order.length === 0) lines.push('  没有已安装的 Harmony patch 插件。')
  profile.order.forEach((name, index) => {
    const provider = byName.get(name)!
    const cursor = index === selected ? `${ESC}36m▶${ESC}0m` : ' '
    const conflict = conflicting.has(name) ? `${ESC}31m!${ESC}0m` : ' '
    lines.push(`${cursor} ${String(index + 1).padStart(2)} ${conflict} ${name}${name === HARMONY_PLUGIN ? '  [固定]' : ''}`)
    const detail = relation(provider)
    if (detail.length > 0) lines.push(`       ${ESC}2m${detail}${ESC}0m`)
  })
  lines.push('')
  if (violations.length === 0) {
    lines.push(`${ESC}32m顺序约束已全部满足。${ESC}0m`)
  } else {
    lines.push(`${ESC}31m${violations.length} 条顺序约束无法由当前列表满足：${ESC}0m`)
    for (const violation of violations) {
      lines.push(`  - ${violation.before} 必须在 ${violation.after} 前（由 ${violation.declaredBy} 声明）`)
    }
  }
  if (message.length > 0) lines.push('', `${ESC}33m${message}${ESC}0m`)
  return lines.join('\n')
}

export async function saveHarmonyTuiOrder(profileDir: string, order: string[]): Promise<HarmonyProfile> {
  order = pinHarmonyOrder(order)
  if (!await updateRuntimeOrder(profileDir, order)) {
    preflightProfileUpdate({ order })
    beginProfileUpdate({ order }).commit()
  }
  return synchronizeHarmonyProfile(profileDir)
}

export async function runHarmonyTui(
  profileDir: string,
  input: ReadStream = process.stdin,
  output: WriteStream = process.stdout,
): Promise<void> {
  if (!input.isTTY || !output.isTTY) throw new Error('dsh harmony requires an interactive terminal')
  let profile = synchronizeHarmonyProfile(profileDir)
  let selected = 0
  let message = ''
  let saving = false
  const draw = (): void => {
    output.write(`${ESC}?25l${ESC}2J${ESC}H${renderHarmonyTui(profile, selected, message)}`)
  }
  const persist = async (order: string[], nextMessage: string): Promise<boolean> => {
    saving = true
    message = '正在预检并应用顺序…'
    draw()
    try {
      profile = await saveHarmonyTuiOrder(profileDir, order)
      selected = Math.min(selected, Math.max(0, order.length - 1))
      message = nextMessage
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
    if (await persist(order, '顺序已保存；运行中的 Harness 已完成热重载。')) selected = target
  }

  emitKeypressEvents(input)
  input.setRawMode(true)
  input.resume()
  draw()
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      input.off('keypress', onKey)
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
        await persist(order, `自动排序完成；最少仍有 ${orderViolations(order, profile.plugins).length} 条约束无法满足。`)
      }
      if (text === 'r') {
        profile = synchronizeHarmonyProfile(profileDir)
        selected = Math.min(selected, Math.max(0, profile.order.length - 1))
        message = '已同步当前安装的 Harmony patch 插件。'
      }
      draw()
    }
    input.on('keypress', onKey)
  })
}
