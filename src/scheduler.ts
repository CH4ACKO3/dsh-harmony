export interface HarmonyPatchScheduleItem {
  key: string
  files: readonly string[]
}

/**
 * Slice a total Patch order into per-file queues. A batch contains only Patches
 * that are simultaneously at the head of every file they affect, so its items
 * are independent and may execute concurrently.
 */
export function schedulePatchBatches(items: readonly HarmonyPatchScheduleItem[]): string[][] {
  const keys = new Set<string>()
  const queues = new Map<string, string[]>()
  const filesByKey = new Map<string, string[]>()
  const rank = new Map<string, number>()
  for (const item of items) {
    if (keys.has(item.key)) throw new Error(`dsh-harmony: duplicate scheduled Patch ${JSON.stringify(item.key)}`)
    keys.add(item.key)
    rank.set(item.key, rank.size)
    const files = [...new Set(item.files)]
    filesByKey.set(item.key, files)
    for (const file of files) {
      const queue = queues.get(file) ?? []
      queue.push(item.key)
      queues.set(file, queue)
    }
  }

  const cursor = new Map([...queues].map(([file]) => [file, 0]))
  const headCount = new Map(items.map(item => [item.key, 0]))
  let ready = new Set(items.filter(item => filesByKey.get(item.key)!.length === 0).map(item => item.key))
  for (const queue of queues.values()) {
    const key = queue[0]!
    const count = headCount.get(key)! + 1
    headCount.set(key, count)
    if (count === filesByKey.get(key)!.length) ready.add(key)
  }
  const batches: string[][] = []
  let processed = 0
  while (processed < items.length) {
    if (ready.size === 0) throw new Error('dsh-harmony: Patch file schedule is deadlocked')
    const batch = [...ready].sort((left, right) => rank.get(left)! - rank.get(right)!)
    batches.push(batch)
    processed += batch.length
    ready = new Set()
    for (const key of batch) {
      for (const file of filesByKey.get(key)!) {
        const nextCursor = cursor.get(file)! + 1
        cursor.set(file, nextCursor)
        const next = queues.get(file)![nextCursor]
        if (next === undefined) continue
        const count = headCount.get(next)! + 1
        headCount.set(next, count)
        if (count === filesByKey.get(next)!.length) ready.add(next)
      }
    }
  }
  return batches
}
