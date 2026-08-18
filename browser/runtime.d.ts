type BrowserStateAction<T> = T | ((current: T) => T)
type BrowserStateSetter<T> = (value: BrowserStateAction<T>) => void

interface BrowserReactRuntime {
  Fragment: unknown
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown
  useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void
  useLayoutEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void
  useMemo<T>(factory: () => T, dependencies: readonly unknown[]): T
  useRef<T>(initial: T): { current: T }
  useState<T>(initial: T): [T, BrowserStateSetter<T>]
}

interface BrowserPluginModule {
  exports: Record<string, unknown>
}

interface BrowserPluginRecord {
  id: string
  factory(require: (name: 'react') => BrowserReactRuntime): Record<string, unknown>
}

interface Window {
  __ModuleLoader__: {
    load(record: BrowserPluginRecord): void
  }
  __dshHarmonyBeforeSettingsClose?: () => Promise<boolean>
}
