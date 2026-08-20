import semver from 'semver'

export type HarmonyPluginCompatibilityRanges = Record<string, string>

export interface HarmonyPluginCompatibilityDeclarations {
  requires: HarmonyPluginCompatibilityRanges
  conflicts: HarmonyPluginCompatibilityRanges
  integrates: HarmonyPluginCompatibilityRanges
}

export interface HarmonyPluginPackage {
  name: string
  version: string
  compatibility: HarmonyPluginCompatibilityDeclarations
}

export interface HarmonyActivePlugin {
  name: string
  entryIds: string[]
}

export interface HarmonyPluginRef {
  package: string
  version: string
  entryIds: string[]
}

export type HarmonyPluginCompatibilityFinding =
  | {
      kind: 'conflict'
      left: HarmonyPluginRef
      right: HarmonyPluginRef
      declaredBy: string[]
    }
  | {
      kind: 'requirement'
      owner: HarmonyPluginRef
      target: {
        package: string
        range: string
        version: string | null
        entryIds: string[]
      }
      reason: 'missing' | 'inactive' | 'version'
    }
  | {
      kind: 'integration'
      owner: HarmonyPluginRef
      target: HarmonyPluginRef
      range: string
    }

const fields = ['requires', 'conflicts', 'integrates'] as const

function parseRanges(value: unknown, owner: string, field: typeof fields[number]): HarmonyPluginCompatibilityRanges {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`dsh-harmony: ${JSON.stringify(owner)} dsh.plugin.compatibility.${field} must be an object`)
  }
  const ranges: HarmonyPluginCompatibilityRanges = {}
  for (const [name, range] of Object.entries(value)) {
    if (name.length === 0 || typeof range !== 'string' || semver.validRange(range) === null) {
      throw new TypeError(`dsh-harmony: ${JSON.stringify(owner)} has invalid ${field} range for ${JSON.stringify(name)}`)
    }
    ranges[name] = range
  }
  return ranges
}

export function parsePluginCompatibility(value: unknown, owner: string): HarmonyPluginCompatibilityDeclarations {
  if (value === undefined) return { requires: {}, conflicts: {}, integrates: {} }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`dsh-harmony: ${JSON.stringify(owner)} dsh.plugin.compatibility must be an object`)
  }
  for (const field of Object.keys(value)) {
    if (!fields.includes(field as typeof fields[number])) {
      throw new TypeError(`dsh-harmony: ${JSON.stringify(owner)} has unknown compatibility field ${JSON.stringify(field)}`)
    }
  }
  const declaration = value as Record<string, unknown>
  return {
    requires: parseRanges(declaration.requires, owner, 'requires'),
    conflicts: parseRanges(declaration.conflicts, owner, 'conflicts'),
    integrates: parseRanges(declaration.integrates, owner, 'integrates'),
  }
}

export function evaluatePluginCompatibility(
  packages: HarmonyPluginPackage[],
  activePlugins: HarmonyActivePlugin[],
): HarmonyPluginCompatibilityFinding[] {
  const packageByName = new Map(packages.map(plugin => [plugin.name, plugin]))
  const activeByName = new Map(activePlugins.map(plugin => [plugin.name, plugin]))
  const ref = (plugin: HarmonyPluginPackage): HarmonyPluginRef => ({
    package: plugin.name,
    version: plugin.version,
    entryIds: [...(activeByName.get(plugin.name)?.entryIds ?? [])],
  })
  const conflicts = new Map<string, Extract<HarmonyPluginCompatibilityFinding, { kind: 'conflict' }>>()
  const findings: HarmonyPluginCompatibilityFinding[] = []

  for (const plugin of packages) {
    if (!activeByName.has(plugin.name)) continue

    for (const [targetName, range] of Object.entries(plugin.compatibility.conflicts)) {
      if (targetName === plugin.name) continue
      const target = packageByName.get(targetName)
      if (target === undefined || !activeByName.has(targetName)
        || !semver.satisfies(target.version, range, { includePrerelease: true })) continue
      const [left, right] = plugin.name < targetName ? [plugin, target] : [target, plugin]
      const key = `${left.name}\0${right.name}`
      const finding = conflicts.get(key) ?? {
        kind: 'conflict' as const,
        left: ref(left),
        right: ref(right),
        declaredBy: [],
      }
      if (!finding.declaredBy.includes(plugin.name)) finding.declaredBy.push(plugin.name)
      conflicts.set(key, finding)
    }

    for (const [targetName, range] of Object.entries(plugin.compatibility.requires)) {
      if (targetName === plugin.name) continue
      const target = packageByName.get(targetName)
      const active = activeByName.get(targetName)
      const reason = target === undefined
        ? 'missing' as const
        : active === undefined
          ? 'inactive' as const
          : !semver.satisfies(target.version, range, { includePrerelease: true })
              ? 'version' as const
              : undefined
      if (reason === undefined) continue
      findings.push({
        kind: 'requirement',
        owner: ref(plugin),
        target: {
          package: targetName,
          range,
          version: target?.version ?? null,
          entryIds: [...(active?.entryIds ?? [])],
        },
        reason,
      })
    }

    for (const [targetName, range] of Object.entries(plugin.compatibility.integrates)) {
      if (targetName === plugin.name) continue
      const target = packageByName.get(targetName)
      if (target === undefined || !activeByName.has(targetName)
        || !semver.satisfies(target.version, range, { includePrerelease: true })) continue
      findings.push({ kind: 'integration', owner: ref(plugin), target: ref(target), range })
    }
  }

  return [
    ...[...conflicts.values()].map(item => ({ ...item, declaredBy: [...item.declaredBy].sort() })),
    ...findings,
  ]
    .sort((left, right) => {
      const rank = { conflict: 0, requirement: 1, integration: 2 }
      const leftOwner = left.kind === 'conflict' ? left.left.package : left.owner.package
      const rightOwner = right.kind === 'conflict' ? right.left.package : right.owner.package
      const leftTarget = left.kind === 'conflict' ? left.right.package : left.target.package
      const rightTarget = right.kind === 'conflict' ? right.right.package : right.target.package
      return rank[left.kind] - rank[right.kind]
        || leftOwner.localeCompare(rightOwner)
        || leftTarget.localeCompare(rightTarget)
    })
}
