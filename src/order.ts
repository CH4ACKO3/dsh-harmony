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

export interface HarmonyPatchOrderItem {
  key: string
  owner: string
  index: number
  before?: string[]
  after?: string[]
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

const EXACT_CYCLE_LIMIT = 14

type Priority = (left: number, right: number) => boolean

function pushHeap(heap: number[], node: number, priority: Priority): void {
  let index = heap.push(node) - 1
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2)
    if (!priority(node, heap[parent]!)) break
    heap[index] = heap[parent]!
    index = parent
  }
  heap[index] = node
}

function popHeap(heap: number[], priority: Priority): number | undefined {
  const first = heap[0]
  const last = heap.pop()
  if (heap.length === 0 || last === undefined) return first
  let index = 0
  while (true) {
    const left = index * 2 + 1
    if (left >= heap.length) break
    const right = left + 1
    const child = right < heap.length && priority(heap[right]!, heap[left]!) ? right : left
    if (!priority(heap[child]!, last)) break
    heap[index] = heap[child]!
    index = child
  }
  heap[index] = last
  return first
}

function components(size: number, edges: Edge[]): { groups: number[][]; groupOf: number[] } {
  const outgoing = Array.from({ length: size }, () => [] as number[])
  for (const edge of edges) outgoing[edge.from]!.push(edge.to)
  const stack: number[] = []
  const stacked = Array<boolean>(size).fill(false)
  const discovered = Array<number>(size).fill(-1)
  const low = Array<number>(size).fill(0)
  const groups: number[][] = []
  const groupOf = Array<number>(size)
  let nextIndex = 0

  const enter = (node: number, search: Array<{ node: number; next: number }>): void => {
    discovered[node] = nextIndex
    low[node] = nextIndex++
    stack.push(node)
    stacked[node] = true
    search.push({ node, next: 0 })
  }

  for (let start = 0; start < size; start += 1) {
    if (discovered[start] !== -1) continue
    const search: Array<{ node: number; next: number }> = []
    enter(start, search)
    while (search.length > 0) {
      const frame = search.at(-1)!
      const targets = outgoing[frame.node]!
      if (frame.next < targets.length) {
        const target = targets[frame.next++]!
        if (discovered[target] === -1) {
          enter(target, search)
        } else if (stacked[target]) {
          low[frame.node] = Math.min(low[frame.node]!, discovered[target]!)
        }
        continue
      }
      search.pop()
      const parent = search.at(-1)?.node
      if (parent !== undefined) low[parent] = Math.min(low[parent]!, low[frame.node]!)
      if (low[frame.node] !== discovered[frame.node]) continue
      const group: number[] = []
      while (true) {
        const member = stack.pop()!
        stacked[member] = false
        group.push(member)
        if (member === frame.node) break
      }
      group.sort((left, right) => left - right)
      const groupIndex = groups.push(group) - 1
      for (const member of group) groupOf[member] = groupIndex
    }
  }
  return { groups, groupOf }
}

interface Candidate {
  violations: number
  inversions: number
  order: number[]
}

function exactComponentOrder(component: number[], edges: Edge[]): number[] {
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
        || candidate.violations === best.violations && candidate.inversions < best.inversions) {
        best = candidate
      }
    }
    memo.set(placed, best!)
    return best!
  }
  return solve(0n).order
}

function heuristicComponentOrder(component: number[], edges: Edge[]): number[] {
  const members = new Set(component)
  const incoming = new Map(component.map(node => [node, new Set<number>()]))
  const outgoing = new Map(component.map(node => [node, new Set<number>()]))
  for (const edge of edges) {
    if (!members.has(edge.from) || !members.has(edge.to)) continue
    incoming.get(edge.to)!.add(edge.from)
    outgoing.get(edge.from)!.add(edge.to)
  }
  const remaining = new Set(component)
  const sources: number[] = []
  const sinks: number[] = []
  const ascending: Priority = (left, right) => left < right
  const descending: Priority = (left, right) => left > right
  for (const node of component) {
    if (incoming.get(node)!.size === 0) pushHeap(sources, node, ascending)
    if (outgoing.get(node)!.size === 0) pushHeap(sinks, node, descending)
  }
  const left: number[] = []
  const right: number[] = []
  const take = (heap: number[], priority: Priority, empty: (node: number) => boolean): number | undefined => {
    while (heap.length > 0) {
      const node = popHeap(heap, priority)!
      if (remaining.has(node) && empty(node)) return node
    }
    return undefined
  }
  const remove = (node: number): void => {
    remaining.delete(node)
    for (const source of incoming.get(node)!) {
      if (!remaining.has(source)) continue
      outgoing.get(source)!.delete(node)
      if (outgoing.get(source)!.size === 0) pushHeap(sinks, source, descending)
    }
    for (const target of outgoing.get(node)!) {
      if (!remaining.has(target)) continue
      incoming.get(target)!.delete(node)
      if (incoming.get(target)!.size === 0) pushHeap(sources, target, ascending)
    }
  }

  while (remaining.size > 0) {
    let changed = false
    let node: number | undefined
    while ((node = take(sinks, descending, item => outgoing.get(item)!.size === 0)) !== undefined) {
      remove(node)
      right.push(node)
      changed = true
    }
    while ((node = take(sources, ascending, item => incoming.get(item)!.size === 0)) !== undefined) {
      remove(node)
      left.push(node)
      changed = true
    }
    if (remaining.size === 0) break
    if (changed) continue
    let selected: number | undefined
    let best = Number.NEGATIVE_INFINITY
    for (const item of component) {
      if (!remaining.has(item)) continue
      const score = outgoing.get(item)!.size - incoming.get(item)!.size
      if (score > best) {
        selected = item
        best = score
      }
    }
    remove(selected!)
    left.push(selected!)
  }
  return [...left, ...right.reverse()]
}

function stableTopologicalOrder(order: string[], edges: Edge[]): string[] {
  const indegree = Array<number>(order.length).fill(0)
  const outgoing = Array.from({ length: order.length }, () => [] as number[])
  for (const edge of edges) {
    indegree[edge.to]! += 1
    outgoing[edge.from]!.push(edge.to)
  }
  const ascending: Priority = (left, right) => left < right
  const ready: number[] = []
  for (let node = 0; node < order.length; node += 1) {
    if (indegree[node] === 0) pushHeap(ready, node, ascending)
  }
  const result: string[] = []
  while (ready.length > 0) {
    const node = popHeap(ready, ascending)!
    result.push(order[node]!)
    for (const target of outgoing[node]!) {
      indegree[target]! -= 1
      if (indegree[target] === 0) pushHeap(ready, target, ascending)
    }
  }
  if (result.length !== order.length) throw new Error('dsh-harmony: order dependency graph is still cyclic')
  return result
}

function sortWithFeedbackArcs(order: string[], edges: Edge[]): string[] {
  const { groups, groupOf } = components(order.length, edges)
  const position = Array<number>(order.length).fill(0)
  for (const component of groups) {
    const sorted = component.length <= 1
      ? component
      : component.length <= EXACT_CYCLE_LIMIT
        ? exactComponentOrder(component, edges)
        : heuristicComponentOrder(component, edges)
    sorted.forEach((node, index) => { position[node] = index })
  }
  const acyclic = edges.filter(edge => groupOf[edge.from] !== groupOf[edge.to]
    || position[edge.from]! < position[edge.to]!)
  return stableTopologicalOrder(order, acyclic)
}

export function autoSortOrder(order: string[], providers: HarmonyProvider[]): string[] {
  const edges = edgesOf(order, providers)
  return sortWithFeedbackArcs(order, edges)
}

function patchEdges(
  order: string[],
  patches: HarmonyPatchOrderItem[],
  providers: HarmonyProvider[],
): Edge[] {
  const index = new Map(order.map((key, position) => [key, position]))
  const byOwner = new Map<string, HarmonyPatchOrderItem[]>()
  for (const patch of patches) {
    const owned = byOwner.get(patch.owner) ?? []
    owned.push(patch)
    byOwner.set(patch.owner, owned)
  }
  const provider = new Map(providers.map(item => [item.name, item]))
  const edges = new Map<string, Edge>()
  const add = (before: string, after: string, declaredBy: string): void => {
    const from = index.get(before)
    const to = index.get(after)
    if (from === undefined || to === undefined || from === to) return
    const key = `${from}:${to}`
    if (!edges.has(key)) edges.set(key, { before, after, declaredBy, from, to })
  }
  for (const patch of patches) {
    const specific = patch.before !== undefined || patch.after !== undefined
    const before = specific ? patch.before ?? [] : provider.get(patch.owner)?.before ?? []
    const after = specific ? patch.after ?? [] : provider.get(patch.owner)?.after ?? []
    const declaredBy = specific ? patch.key : patch.owner
    for (const owner of before) {
      for (const target of byOwner.get(owner) ?? []) add(patch.key, target.key, declaredBy)
    }
    for (const owner of after) {
      for (const target of byOwner.get(owner) ?? []) add(target.key, patch.key, declaredBy)
    }
  }
  return [...edges.values()]
}

export function patchOrderViolations(
  order: string[],
  patches: HarmonyPatchOrderItem[],
  providers: HarmonyProvider[],
): HarmonyOrderViolation[] {
  const position = new Map(order.map((key, index) => [key, index]))
  return patchEdges(order, patches, providers)
    .filter(edge => position.get(edge.before)! > position.get(edge.after)!)
    .map(({ before, after, declaredBy }) => ({ before, after, declaredBy }))
}

export function autoSortPatchOrder(
  order: string[],
  patches: HarmonyPatchOrderItem[],
  providers: HarmonyProvider[],
): string[] {
  const edges = patchEdges(order, patches, providers)
  return sortWithFeedbackArcs(order, edges)
}
