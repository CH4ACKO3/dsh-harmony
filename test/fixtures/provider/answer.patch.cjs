module.exports = [{
  id: 'test-patch',
  target: { package: 'hook-target', file: 'lib/helper.js' },
  select: 'NumericLiteral[text="1"]',
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '2')
  },
}, {
  id: 'lazy-patch',
  target: { package: 'hook-target', file: 'lib/lazy.js' },
  select: 'NumericLiteral[text="1"]',
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '2')
  },
}]
