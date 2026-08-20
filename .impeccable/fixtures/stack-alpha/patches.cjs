const target = { package: '@deepseek-ai/dsh-client-ui-sidebar', file: 'lib/client.js' }

module.exports = ['alpha-header', 'alpha-navigation', 'alpha-footer'].map(id => ({
  id,
  target,
  select: 'SourceFile',
  expect: id === 'alpha-footer' ? 2 : 1,
  apply() {},
}))
