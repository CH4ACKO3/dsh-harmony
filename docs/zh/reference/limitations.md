# 限制

Harmony 修改编译后的运行时代码，因此保证范围止于明确边界。

## Patch 模块

Provider Patch 文件必须使用 CommonJS，以便实时 Loader 更新路径同步收集。

## 编译结构

源码选择器依赖目标包的编译结果。升级可能改变名称、嵌套、JSX 输出或 Bundler Helper，而可见功能保持不变。请锁定兼容的 `target.version`、保持精确 `expect`，并在发布检查中运行 `dsh harmony status`。

## 语义目标

语义 Patch 支持具名函数声明和类方法；参数必须是具名 Identifier；不支持 Generator。

语义处理器在 Node.js 中执行，因此 `lib/client.js` 等浏览器 Bundle 必须使用源码 Patch。

同一函数只能有一个启用的语义 `replace`，冲突事务会被拒绝。

## Provider 顺序

`before` 和 `after` 是针对 Provider 包名的顺序偏好。互相矛盾的约束可能没有完美顺序；自动排序只最小化违规，不覆盖手动列表。

`conflicts` 只产生警告，不阻止安装或运行。

## 运行时所有权

Harmony 不会：

- 修改安装后的目标文件；
- 代理 WebUI 流量；
- 提供第二个 Host 或 Session Store；
- 让全局安装影响仍直接启动内置 CLI 的上游 Desktop；
- 推断任意两个源码变换在语义上是否兼容。
