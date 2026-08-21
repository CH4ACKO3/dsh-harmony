import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import '@fontsource-variable/atkinson-hyperlegible-next'
import '@fontsource-variable/source-code-pro'
import EcosystemShowcase from './components/EcosystemShowcase.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('EcosystemShowcase', EcosystemShowcase)
  },
} satisfies Theme
