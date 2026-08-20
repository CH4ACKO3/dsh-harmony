import { expect, test } from 'vitest'
import { terminalLocale, terminalText } from './locale.js'

test('uses the standard terminal locale variables in precedence order', () => {
  expect(terminalLocale({ LANG: 'zh_CN.UTF-8' })).toBe('zh')
  expect(terminalLocale({ LANG: 'zh_CN.UTF-8', LC_MESSAGES: 'en_US.UTF-8' })).toBe('en')
  expect(terminalLocale({ LANG: 'zh_CN.UTF-8', LC_MESSAGES: 'zh_CN.UTF-8', LC_ALL: 'C' })).toBe('en')
  expect(terminalLocale({}, 'zh-CN')).toBe('zh')
  expect(terminalLocale({}, 'en-US')).toBe('en')
})

test('selects text for the resolved locale', () => {
  expect(terminalText('en', 'Saved', '已保存')).toBe('Saved')
  expect(terminalText('zh', 'Saved', '已保存')).toBe('已保存')
})
