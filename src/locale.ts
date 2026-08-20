export type HarmonyLocale = 'en' | 'zh'

export function terminalLocale(
  env: NodeJS.ProcessEnv = process.env,
  systemLocale = Intl.DateTimeFormat().resolvedOptions().locale,
): HarmonyLocale {
  const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG || systemLocale
  return /^zh(?:[-_]|$)/i.test(locale) ? 'zh' : 'en'
}

export function terminalText(locale: HarmonyLocale, english: string, chinese: string): string {
  return locale === 'zh' ? chinese : english
}
