import semver from 'semver'

export type HarmonyPluginConflictDeclarations = Record<string, string>

export interface HarmonyPluginPackage {
  name: string
  version: string
  conflicts: HarmonyPluginConflictDeclarations
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

export interface HarmonyPluginConflict {
  left: HarmonyPluginRef
  right: HarmonyPluginRef
  declaredBy: string[]
}

export function parsePluginConflicts(value: unknown, owner: string): HarmonyPluginConflictDeclarations {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`dsh-harmony: ${JSON.stringify(owner)} dsh.plugin.conflicts must be an object`)
  }
  const conflicts: HarmonyPluginConflictDeclarations = {}
  for (const [name, range] of Object.entries(value)) {
    if (name.length === 0 || typeof range !== 'string' || semver.validRange(range) === null) {
      throw new TypeError(`dsh-harmony: ${JSON.stringify(owner)} has invalid conflict range for ${JSON.stringify(name)}`)
    }
    conflicts[name] = range
  }
  return conflicts
}

export function evaluatePluginConflicts(
  packages: HarmonyPluginPackage[],
  activePlugins: HarmonyActivePlugin[],
): HarmonyPluginConflict[] {
  const packageByName = new Map(packages.map(plugin => [plugin.name, plugin]))
  const activeByName = new Map(activePlugins.map(plugin => [plugin.name, plugin]))
  const conflicts = new Map<string, { conflict: HarmonyPluginConflict; declaredBy: Set<string> }>()

  for (const plugin of packages) {
    if (!activeByName.has(plugin.name)) continue
    for (const [targetName, range] of Object.entries(plugin.conflicts)) {
      if (targetName === plugin.name) continue
      const target = packageByName.get(targetName)
      if (target === undefined || !activeByName.has(targetName)
        || !semver.satisfies(target.version, range, { includePrerelease: true })) continue
      const [leftPackage, rightPackage] = plugin.name < targetName ? [plugin, target] : [target, plugin]
      const key = `${leftPackage.name}\0${rightPackage.name}`
      let item = conflicts.get(key)
      if (item === undefined) {
        item = {
          conflict: {
            left: {
              package: leftPackage.name,
              version: leftPackage.version,
              entryIds: [...activeByName.get(leftPackage.name)!.entryIds],
            },
            right: {
              package: rightPackage.name,
              version: rightPackage.version,
              entryIds: [...activeByName.get(rightPackage.name)!.entryIds],
            },
            declaredBy: [],
          },
          declaredBy: new Set(),
        }
        conflicts.set(key, item)
      }
      item.declaredBy.add(plugin.name)
    }
  }

  return [...conflicts.values()]
    .map(({ conflict, declaredBy }) => ({ ...conflict, declaredBy: [...declaredBy].sort() }))
    .sort((left, right) => left.left.package.localeCompare(right.left.package)
      || left.right.package.localeCompare(right.right.package))
}
