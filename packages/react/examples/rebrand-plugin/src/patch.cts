const { element } = require('dsh-harmony-react')

module.exports = element({
  id: 'custom-sidebar-brand',
  target: {
    package: '@deepseek-ai/dsh-client-ui-sidebar',
    version: '0.1.0-rc.7',
    file: 'lib/client.js',
  },
  select: { component: 'BrandWordmark' },
  expect: 1,
  operation: {
    kind: 'replace',
    with: {
      module: 'dsh-example-rebrand',
      export: 'CustomBrand',
    },
  },
})
