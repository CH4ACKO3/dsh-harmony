# Harmony 是什么？

**dsh-harmony 在运行时修改 DeepSeek Harness 插件。** 要增加服务、工具、Slot 或页面，请使用官方插件 API；现有行为没有扩展点时，再使用 Harmony。

一个 Provider 可以在目标插件加载前重写它、替换具名函数，或装饰函数调用。变换后的源码只存在于内存，Harmony 不会改写磁盘上的安装包。

## 选择扩展方式

| 方式 | 适用场景 | 代价 |
| --- | --- | --- |
| 官方插件 API | 注册服务、Slot、工具和页面 | 没有扩展点就无法修改内部实现 |
| 维护 Fork | 不受限制地修改源码 | 需要持续合并上游，多个 Fork 难以协调 |
| **dsh-harmony** | 运行时修改 Host 和 WebUI 插件 | Patch 必须跟随目标编译结构变化 |

Harmony 保留现有的 `dsh` 命令、Loader 和插件装配流程。在 Loader 执行插件前，它会收集 Patch、排好顺序并逐个应用。设计灵感来自 [C# 和 .NET 的 Harmony](https://github.com/pardeike/Harmony)。

## 运行路径

全局命令依次经过：

```text
系统 dsh 命令
  -> Harmony shim
  -> dsh-harmony/bin
  -> @deepseek-ai/dsh/lib/bin.js
  -> Loader + Host
  -> 同源 WebUI + /api + WebSocket
```

Harmony 先安装 CommonJS 和 ESM 变换 Hook，再原样转发 CLI 参数。它不代理 WebUI 流量，不创建第二个 Host，也不保存另一套后端地址。

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| Harmony | Hook、Patch 发现、排序、验证、检查和重载事务 | 第二套后端或 WebUI 代理 |
| DSH Host | WebUI 静态资源、`/api` RPC 和 WebSocket | 其他 Host 的会话 |
| WebUI | 与当前 Host 建立同源连接 | 单独选择后端地址 |
| Desktop | 一个本地 Host 进程及其就绪地址 | 改写 Harness 协议 |

## Harmony 处理什么

- **源码 Patch**：通过 TypeScript AST 变换 `lib/index.js`、`lib/client.js` 或其他编译目标。
- **语义 Patch**：对具名函数和类方法执行 `before`、`after`、`around` 或 `replace`。
- **加载器 Patch**：在 Node 默认加载器运行前，转译显式指定目标包所发布的 TypeScript。
- **全局 Patch 顺序**：从 Provider 声明开始，允许单个 Patch 覆盖关系，并接受用户精确控制的跨 Provider 排列。
- **组合 Patch**：把普通 Patch 组织成一个排序、启停与跨文件事务单元。
- **事务**：提交重载前预检 Provider、顺序和启停状态变化。
- **检查**：展示原始源码、每一步 Patch 结果和最终运行时源码。
- **工具 API**：让插件与本地工具读取、预检、检查和事务式更新 profile。

Harmony 不使用数值优先级。Provider 只声明自己知道的先后关系，其余冲突交给用户移动整个 Provider 或单个 Patch 来处理。运行时，Harmony 从全局列表中取出会修改每个文件的 Patch；互不相关的文件可以并行处理。若一个 Patch 同时修改多个文件，它会等到自己在这些文件上都排到下一位再开始，因此结果仍符合用户保存的顺序。

## Host 与浏览器目标

Node 目标通过 Loader Tree 重载。同一目标包中的相对 ESM 导入共享一代 Patch；CommonJS 重载会清理该包内部的 `require` 图。

`lib/client.js` 等浏览器目标使用 Harness 现有的 `clientModules.rebuilt` 事件。Harmony 更新 Bundle revision 并发送正常的 HMR 事件，因此 WebUI 只重载发生变化的客户端插件。Provider 所属的样式标签也会按已启用 Patch 的顺序移动。

## 失败与回滚

提交更新前，Harmony 会按保存的顺序尝试修改所有受影响目标。单个 Patch 无法匹配或应用时会被报告并跳过，Host 继续运行。如果 Provider 声明无法加载或目标插件无法重载，Harmony 会保留原来的 Loader Tree 和 profile 设置。目标包从未被改写，所以卸载 Harmony 后不需要修复文件。

下一步：[安装运行时](/zh/guide/installation)或[编写 Patch](/zh/patches/authoring)。
