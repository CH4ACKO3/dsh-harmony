# 限制

Harmony 在运行时修改编译产物。下面列出它无法恢复、推断或安全修改的情况。

## Patch 模块

Provider Patch 文件必须使用 CommonJS，以便实时 Loader 更新路径同步收集。

Source Patch 的 `apply()` 抛错时，Harmony 会丢弃它在内存中的编辑，并从上一份源码继续。Patch 自己执行的文件写入、网络请求、全局修改或其它操作无法撤销，因此声明和 `apply()` 应保持确定性，不要产生副作用。

## Loader 回滚

替换 Loader Fiber 前，Harmony 会先执行新的插件模块。执行或启动失败时，它会恢复原来的 Fiber 和 CommonJS 缓存，但模块顶层已经发生的副作用无法撤销。每次 ESM 重载使用新的 generation URL，所以 Node.js 会保留这些模块实例，直到 Host 退出。

需要实时重载的插件不应在模块顶层创建定时器或监听器、写入文件，或修改全局单例。请在 Cordis 插件生命周期内注册这些副作用，让 Loader 在释放插件时负责清理。长时间、高频率重载 ESM 插件后，请重启 Host。

## 编译结构

Source selector 依赖目标包的编译结构。升级可能改变名称、嵌套、JSX 输出或 Bundler Helper，即使界面功能看起来没有变化。请锁定 `target.version`，为 `expect` 填写确切数量，并在发布前运行 `dsh harmony status`。

## TypeScript 加载

`typescript` Loader Patch 只转译语法，不执行类型检查，也不读取目标包的 `tsconfig.json`。Import 仍须符合 Node 的解析规则。Harmony 不会增加 TypeScript 路径别名，也不会推断缺失的扩展名；它只加载指定包和版本中的 TypeScript 文件。

## 语义目标

语义 Patch 支持具名函数声明和类方法；参数必须是具名 Identifier；不支持 Generator。

语义处理器在 Node.js 中执行，因此 `lib/client.js` 等浏览器 Bundle 必须使用源码 Patch。

同一函数只采用全局 Patch 顺序中的第一个已启用语义 `replace`；后续替换会被标记为 `failed` 并跳过。

## Provider 顺序

`before` 和 `after` 是针对 Provider 包名的相对关系，不是数值优先级。互相矛盾的约束可能没有完美顺序；自动排序只最小化违规，不覆盖手动 Provider 或 Patch 列表。

`conflicts` 只产生警告，不阻止安装或运行。

## React Component 声明

`component()` 支持已初始化变量和具名函数声明。Harmony 会把函数声明改写为已初始化的 `const`，让后续 Component Patch 可以修改同一绑定。新绑定不再提升；如果文件在声明前读取组件，请使用核心 Source Patch。

原始 Component TSQuery 不会告诉 Harmony JSX 调用使用了哪个绑定，因此不会生成 Component 调用路径 trace。Studio 需要这项 trace 时，请使用 `{ name }`。

## 运行时所有权

Harmony 不会：

- 修改安装后的目标文件；
- 代理 WebUI 流量；
- 提供第二个 Host 或 Session Store；
- 让全局安装影响仍直接启动内置 CLI 的上游 Desktop；
- 推断任意两个源码变换在语义上是否兼容。
