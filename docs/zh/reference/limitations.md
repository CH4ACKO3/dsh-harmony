# 限制

Harmony 修改编译后的运行时代码，因此保证范围止于明确边界。

## Patch 模块

Provider Patch 文件必须使用 CommonJS，以便实时 Loader 更新路径同步收集。

源码 Patch 的 `apply()` 抛错时，Harmony 会丢弃该 Patch 的内存编辑，并从上一个源码结果继续；但无法撤销 Patch 代码自行执行的文件写入、网络请求、全局修改或其它副作用。Patch 声明与 `apply()` 应保持确定性且不产生副作用。

## Loader 回滚

Harmony 会在替换当前 Loader Fiber 之前求值候选插件模块。如果模块求值或启动失败，Harmony 会恢复原有 Fiber 和 CommonJS 缓存，但无法撤销已经在模块顶层发生的副作用。每次 ESM 重载都会使用不同的 generation URL，因此 Node.js 会保留这些模块实例，直到 Host 进程退出。

需要实时重载的插件不应在模块顶层创建定时器或监听器、写入文件，或修改全局单例。请在 Cordis 插件生命周期内注册这些副作用，让 Loader 在释放插件时负责清理。长时间、高频率重载 ESM 插件后，请重启 Host。

## 编译结构

源码选择器依赖目标包的编译结果。升级可能改变名称、嵌套、JSX 输出或 Bundler Helper，而可见功能保持不变。请锁定兼容的 `target.version`、保持精确 `expect`，并在发布检查中运行 `dsh harmony status`。

## TypeScript 加载

`typescript` 加载器 Patch 只转译语法，不执行类型检查，也不会读取目标包的 `tsconfig.json`。运行时导入仍须符合 Node 的解析规则；Harmony 不会增加 TypeScript 路径别名，也不会推断缺失的扩展名。加载范围仅限声明的目标包与版本中的 TypeScript 文件。

## 语义目标

语义 Patch 支持具名函数声明和类方法；参数必须是具名 Identifier；不支持 Generator。

语义处理器在 Node.js 中执行，因此 `lib/client.js` 等浏览器 Bundle 必须使用源码 Patch。

同一函数只采用全局 Patch 顺序中的第一个已启用语义 `replace`；后续替换会被标记为 `failed` 并跳过。

## Provider 顺序

`before` 和 `after` 是针对 Provider 包名的相对关系，不是数值优先级。互相矛盾的约束可能没有完美顺序；自动排序只最小化违规，不覆盖手动 Provider 或 Patch 列表。

`conflicts` 只产生警告，不阻止安装或运行。

## React Component 声明

`component()` 支持已初始化变量和具名函数声明。为了让后续 Component Patch 继续组合，函数声明会被改写为已初始化的 `const` 绑定，因此不再具有声明提升。组件在声明前被引用时，请使用核心 Source Patch。

原始 Component TSQuery 无法可靠识别 JSX 调用点所引用的绑定，因此不会生成 Component 调用路径 trace。Studio 需要 trace 时请使用 `{ name }`。

## 运行时所有权

Harmony 不会：

- 修改安装后的目标文件；
- 代理 WebUI 流量；
- 提供第二个 Host 或 Session Store；
- 让全局安装影响仍直接启动内置 CLI 的上游 Desktop；
- 推断任意两个源码变换在语义上是否兼容。
