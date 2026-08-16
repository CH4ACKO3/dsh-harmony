const { replaceElement } = require('dsh-harmony-react')

module.exports = replaceElement({
  id: 'custom-sidebar-brand',
  target: {
    package: '@deepseek-ai/dsh-client-ui-sidebar',
    version: '0.1.0-rc.6',
  },
  select: { component: 'BrandWordmark' },
  expect: 1,
  with: {
    module: 'dsh-example-rebrand',
    export: 'CustomBrand',
  },
})
