export type EcosystemCategory =
  | 'ui'
  | 'usage'
  | 'theme'
  | 'model'
  | 'identity'
  | 'session'
  | 'memory'
  | 'tools'
  | 'browser'
  | 'vision'
  | 'voice'
  | 'docs'
  | 'skill'
  | 'workflow'
  | 'git'
  | 'notify'
  | 'dev'
  | 'security'
  | 'remote'
  | 'market'
  | 'fun'

export interface EcosystemEntry {
  name: string
  packageName: string
  category: EcosystemCategory
  repository: string
  install: string
  description: { en: string; zh: string }
  targets: string[]
}

export const ecosystemCategories: Record<EcosystemCategory, { en: string; zh: string }> = {
  ui: { en: 'Interface', zh: '界面' },
  usage: { en: 'Usage', zh: '使用体验' },
  theme: { en: 'Themes', zh: '主题' },
  model: { en: 'Models', zh: '模型' },
  identity: { en: 'Identity', zh: '身份' },
  session: { en: 'Sessions', zh: '会话' },
  memory: { en: 'Memory', zh: '记忆' },
  tools: { en: 'Tools', zh: '工具' },
  browser: { en: 'Browser', zh: '浏览器' },
  vision: { en: 'Vision', zh: '视觉' },
  voice: { en: 'Voice', zh: '语音' },
  docs: { en: 'Documents', zh: '文档' },
  skill: { en: 'Skills', zh: '技能' },
  workflow: { en: 'Workflows', zh: '工作流' },
  git: { en: 'Git', zh: 'Git' },
  notify: { en: 'Notifications', zh: '通知' },
  dev: { en: 'Development', zh: '开发' },
  security: { en: 'Security', zh: '安全' },
  remote: { en: 'Remote', zh: '远程' },
  market: { en: 'Market', zh: '市场' },
  fun: { en: 'Fun', zh: '趣味' },
}

// Add one factual entry here in a pull request. The page intentionally has no
// separate registry or approval database: this file is the public catalog.
export const ecosystemEntries: EcosystemEntry[] = [
  {
    name: 'Turn Fold',
    packageName: '@ch4acko3/dsh-turn-fold',
    category: 'ui',
    repository: 'https://github.com/CH4ACKO3/dsh-turn-fold',
    install: 'dsh plugin --profile web add @ch4acko3/dsh-turn-fold',
    description: {
      en: "Collapse each completed turn's agent activity into a summary bar while keeping the final answer visible.",
      zh: '将每个已完成 turn 的 Agent activity 折叠成摘要栏，同时保持最终答复可见。',
    },
    targets: ['Conversation WebUI'],
  },
  {
    name: 'Patchouli',
    packageName: 'dsh-patchouli',
    category: 'memory',
    repository: 'https://github.com/memorax-ai/dsh-patchouli',
    install: 'dsh plugin --profile web add dsh-patchouli',
    description: {
      en: 'Route memory update, retrieval and subscription calls across compatible plugins, with an optional transactional Rust backend.',
      zh: '在兼容插件之间路由记忆更新、检索与订阅调用，并提供可选的事务化 Rust 后端。',
    },
    targets: ['Host', 'WebUI'],
  },
  {
    name: 'The Binding of DSH',
    packageName: 'the-binding-of-dsh',
    category: 'dev',
    repository: 'https://github.com/CH4ACKO3/the-binding-of-dsh',
    install: 'dsh plugin --profile web add the-binding-of-dsh',
    description: {
      en: 'Enable bidirectional service calls through DSH Connection and Typert Gateway.',
      zh: '让 DSH Connection 与 Typert Gateway 支持双向服务调用。',
    },
    targets: ['Host', 'Connection'],
  },
]
