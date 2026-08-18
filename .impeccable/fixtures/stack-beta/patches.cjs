const target = { package: '@deepseek-ai/dsh-client-ui-sidebar', files: ['lib/client.js'] }

module.exports = ['beta-shell', 'beta-sidebar', 'beta-search', 'beta-account', 'beta-help'].map(id => ({
  id,
  target,
  select: 'SourceFile',
  expect: 1,
  apply() {},
}))
