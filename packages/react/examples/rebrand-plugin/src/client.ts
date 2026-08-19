window.__ModuleLoader__.load({
  id: 'dsh-example-rebrand',
  factory: (require) => {
    const module: BrowserPluginModule = { exports: {} }
    const React = require('react')

    function CustomBrand() {
      return React.createElement('strong', null, 'Custom DSH')
    }

    module.exports.apply = () => {}
    module.exports.CustomBrand = CustomBrand
    return module.exports
  },
})
