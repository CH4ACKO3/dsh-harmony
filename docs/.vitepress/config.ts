import { defineConfig } from 'vitepress'

const repository = 'https://github.com/memorax-ai/dsh-harmony'

const englishSidebar = [
  {
    text: 'Guide',
    items: [
      { text: 'What is Harmony?', link: '/guide/introduction' },
      { text: 'Installation', link: '/guide/installation' },
      { text: 'Order, inspect, reload', link: '/guide/operations' },
    ],
  },
  {
    text: 'Write patches',
    items: [{ text: 'Patch authoring', link: '/patches/authoring' }],
  },
  {
    text: 'Integrations',
    items: [
      { text: 'React patches', link: '/integrations/react' },
      { text: 'Studio previews', link: '/integrations/studio' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'CLI and configuration', link: '/reference/cli' },
      { text: 'Limitations', link: '/reference/limitations' },
      { text: 'Troubleshooting', link: '/help/troubleshooting' },
    ],
  },
]

const chineseSidebar = [
  {
    text: '指南',
    items: [
      { text: 'Harmony 是什么？', link: '/zh/guide/introduction' },
      { text: '安装', link: '/zh/guide/installation' },
      { text: '排序、检查与重载', link: '/zh/guide/operations' },
    ],
  },
  {
    text: '编写 Patch',
    items: [{ text: 'Patch 编写指南', link: '/zh/patches/authoring' }],
  },
  {
    text: '集成',
    items: [
      { text: 'React Patch', link: '/zh/integrations/react' },
      { text: 'Studio 预览', link: '/zh/integrations/studio' },
    ],
  },
  {
    text: '参考',
    items: [
      { text: 'CLI 与配置', link: '/zh/reference/cli' },
      { text: '限制', link: '/zh/reference/limitations' },
      { text: '故障排查', link: '/zh/help/troubleshooting' },
    ],
  },
]

const designContract = `<!--
THESIS: Harmony opens as a concise technical brand page: the runtime Patch model is immediately visible, while documentation and independent community providers remain easy to discover.
OWN-WORLD: Cool paper, solid cobalt accents, flat capability panels, compact actions, and typography optimized for sustained technical reading.
STORY: Readers identify Harmony, choose the Patch layer they need, then enter installation, authoring, or the independently maintained provider ecosystem.
FIRST VIEWPORT: A left-led brand block pairs the Harmony mark with its exact library definition and two documentation actions; a two-column capability index follows directly.
FORM: Short technical documentation portal and open directory derived from the established layered service manual, seed be380533.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`

export default defineConfig({
  title: 'Harmony',
  description: 'Runtime Patch coordination for DeepSeek Harness plugins.',
  base: '/dsh-harmony/',
  cleanUrls: true,
  lastUpdated: true,
  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
  },
  sitemap: { hostname: 'https://memorax-ai.github.io/dsh-harmony/' },
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/dsh-harmony/harmony-icon.png' }],
    ['meta', { name: 'theme-color', content: '#075ff7' }],
  ],
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      title: 'Harmony',
      description: 'Runtime Patch coordination for DeepSeek Harness plugins.',
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'Harmony',
      description: 'DeepSeek Harness 插件的运行时 Patch 协调层。',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/guide/introduction' },
          { text: 'Patch API', link: '/zh/patches/authoring' },
          { text: '生态', link: '/zh/ecosystem' },
          { text: 'React', link: '/zh/integrations/react' },
          { text: 'npm', link: 'https://www.npmjs.com/package/dsh-harmony' },
        ],
        sidebar: chineseSidebar,
        outline: { label: '本页目录', level: [2, 3] },
        editLink: { pattern: `${repository}/edit/docs/docs/:path`, text: '在 GitHub 上编辑此页' },
        lastUpdated: { text: '最后更新' },
        docFooter: { prev: '上一页', next: '下一页' },
        footer: { message: '基于 MIT License 发布。', copyright: 'Copyright © 2026 CH4ACKO3' },
      },
    },
  },
  themeConfig: {
    logo: '/harmony-icon.png',
    socialLinks: [{ icon: 'github', link: repository }],
    search: { provider: 'local' },
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Patch API', link: '/patches/authoring' },
      { text: 'Ecosystem', link: '/ecosystem' },
      { text: 'React', link: '/integrations/react' },
      { text: 'npm', link: 'https://www.npmjs.com/package/dsh-harmony' },
    ],
    sidebar: englishSidebar,
    outline: { label: 'On this page', level: [2, 3] },
    editLink: { pattern: `${repository}/edit/docs/docs/:path`, text: 'Edit this page on GitHub' },
    lastUpdated: { text: 'Last updated' },
    docFooter: { prev: 'Previous', next: 'Next' },
    footer: { message: 'Released under the MIT License.', copyright: 'Copyright © 2026 CH4ACKO3' },
  },
  transformHtml(html) {
    return html.replace('<body>', `<body>\n${designContract}`)
  },
})
