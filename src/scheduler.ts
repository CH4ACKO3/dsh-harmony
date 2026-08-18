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
  for (const item of items) {
    if (keys.has(item.key)) throw new Error(`dsh-harmony: duplicate scheduled Patch ${JSON.stringify(item.key)}`)
    keys.add(item.key)
    for (const file of new Set(item.files)) {
      const queue = queues.get(file) ?? []
      queue.push(item.key)
      queues.set(file, queue)
    }
  }

  const cursor = new Map([...queues].map(([file]) => [file, 0]))
  const remaining = new Set(items.map(item => item.key))
  const byKey = new Map(items.map(item => [item.key, item]))
  const batches: string[][] = []
  while (remaining.size > 0) {
    const ready = items.filter(item => remaining.has(item.key) && [...new Set(item.files)]
      .every(file => queues.get(file)![cursor.get(file)!] === item.key))
    if (ready.length === 0) throw new Error('dsh-harmony: Patch file schedule is deadlocked')
    batches.push(ready.map(item => item.key))
    for (const item of ready) {
      remaining.delete(item.key)
      for (const file of new Set(byKey.get(item.key)!.files)) cursor.set(file, cursor.get(file)! + 1)
    }
  }
  return batches
}
