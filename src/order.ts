export interface HarmonyProvider {
  name: string
  before: string[]
  after: string[]
}

export interface HarmonyOrderViolation {
  before: string
  after: string
  declaredBy: string
}

interface Edge extends HarmonyOrderViolation {
  from: number
  to: number
}

function edgesOf(order: string[], providers: HarmonyProvider[]): Edge[] {
  const index = new Map(order.map((name, position) => [name, position]))
  const edges = new Map<string, Edge>()
  const add = (before: string, after: string, declaredBy: string): void => {
    const from = index.get(before)
    const to = index.get(after)
    if (from === undefined || to === undefined || from === to) return
    const key = `${from}:${to}`
    if (!edges.has(key)) edges.set(key, { before, after, declaredBy, from, to })
  }
  for (const provider of providers) {
    for (const target of provider.before) add(provider.name, target, provider.name)
    for (const target of provider.after) add(target, provider.name, provider.name)
  }
  return [...edges.values()]
}

export function orderViolations(order: string[], providers: HarmonyProvider[]): HarmonyOrderViolation[] {
  const position = new Map(order.map((name, index) => [name, index]))
  return edgesOf(order, providers)
    .filter(edge => position.get(edge.before)! > position.get(edge.after)!)
    .map(({ before, after, declaredBy }) => ({ before, after, declaredBy }))
}

function components(size: number, edges: Edge[]): number[][] {
  const outgoing = Array.from({ length: size }, () => [] as number[])
  for (const edge of edges) outgoing[edge.from]!.push(edge.to)
  const stack: number[] = []
  const stacked = new Set<number>()
  const discovered = Array<number>(size).fill(-1)
  const low = Array<number>(size).fill(0)
  const result: number[][] = []
  let nextIndex = 0

  const visit = (node: number): void => {
    discovered[node] = nextIndex
    low[node] = nextIndex++
    stack.push(node)
    stacked.add(node)
    for (const target of outgoing[node]!) {
      if (discovered[target] === -1) {
        visit(target)
        low[node] = Math.min(low[node]!, low[target]!)
      } else if (stacked.has(target)) {
        low[node] = Math.min(low[node]!, discovered[target]!)
      }
    }
    if (low[node] !== discovered[node]) return
    const component: number[] = []
    while (true) {
      const member = stack.pop()!
      stacked.delete(member)
      component.push(member)
      if (member === node) break
    }
    result.push(component)
  }

  for (let node = 0; node < size; node += 1) {
    if (discovered[node] === -1) visit(node)
  }
  return result
}

interface Candidate {
  violations: number
  inversions: number
  order: number[]
}

function orderComponent(component: number[], edges: Edge[]): number[] {
  component = [...component].sort((a, b) => a - b)
  if (component.length === 1) return component
  const local = new Map(component.map((node, index) => [node, index]))
  const incoming = Array.from({ length: component.length }, () => 0n)
  for (const edge of edges) {
    const from = local.get(edge.from)
    const to = local.get(edge.to)
    if (from !== undefined && to !== undefined) incoming[to] |= 1n << BigInt(from)
  }
  const full = (1n << BigInt(component.length)) - 1n
  const memo = new Map<bigint, Candidate>()
  const count = (value: bigint): number => {
    let total = 0
    while (value !== 0n) {
      value &= value - 1n
      total += 1
    }
    return total
  }
  const solve = (placed: bigint): Candidate => {
    if (placed === full) return { violations: 0, inversions: 0, order: [] }
    const cached = memo.get(placed)
    if (cached !== undefined) return cached
    let best: Candidate | undefined
    for (let node = 0; node < component.length; node += 1) {
      const bit = 1n << BigInt(node)
      if ((placed & bit) !== 0n) continue
      const remaining = full ^ (placed | bit)
      const tail = solve(placed | bit)
      const candidate = {
        violations: count(incoming[node]! & remaining) + tail.violations,
        inversions: count(remaining & (bit - 1n)) + tail.inversions,
        order: [component[node]!, ...tail.order],
      }
      if (best === undefined
        || candidate.violations < best.violations
        || (candidate.violations === best.violations && candidate.inversions < best.inversions)) {
        best = candidate
      }
    }
    memo.set(placed, best!)
    return best!
  }
  return solve(0n).order
}

export function autoSortOrder(order: string[], providers: HarmonyProvider[]): string[] {
  const edges = edgesOf(order, providers)
  const groups = components(order.length, edges)
  const groupOf = new Map<number, number>()
  groups.forEach((group, index) => group.forEach(node => groupOf.set(node, index)))
  const outgoing = groups.map(() => new Set<number>())
  const incoming = groups.map(() => 0)
  for (const edge of edges) {
    const from = groupOf.get(edge.from)!
    const to = groupOf.get(edge.to)!
    if (from === to || outgoing[from]!.has(to)) continue
    outgoing[from]!.add(to)
    incoming[to]! += 1
  }
  const rank = groups.map(group => Math.min(...group))
  const remaining = new Set(groups.map((_, index) => index))
  const result: string[] = []
  while (remaining.size > 0) {
    const next = [...remaining]
      .filter(index => incoming[index] === 0)
      .sort((a, b) => rank[a]! - rank[b]!)[0]!
    remaining.delete(next)
    for (const node of orderComponent(groups[next]!, edges)) result.push(order[node]!)
    for (const target of outgoing[next]!) incoming[target]! -= 1
  }
  return result
}
