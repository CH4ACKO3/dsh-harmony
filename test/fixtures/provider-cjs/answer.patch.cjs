module.exports = {
  id: 'test-patch',
  target: { package: 'hook-target-cjs', files: ['lib/helper.cjs'] },
  select: 'NumericLiteral[text="1"]',
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '2')
  },
}
