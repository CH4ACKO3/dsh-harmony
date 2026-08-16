import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import '@fontsource-variable/atkinson-hyperlegible-next'
import '@fontsource-variable/source-code-pro'
import './style.css'

export default {
  extends: DefaultTheme,
} satisfies Theme
