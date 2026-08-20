const target = { package: '@deepseek-ai/dsh-client-ui-sidebar', file: 'lib/client.js' }

module.exports = [
  'gamma-brand',
  'gamma-history',
  'gamma-library',
  'gamma-shortcuts',
  'gamma-settings',
  'gamma-updates',
  'gamma-profile',
].map(id => ({
  id,
  target,
  select: 'SourceFile',
  expect: 1,
  apply() {},
}))
