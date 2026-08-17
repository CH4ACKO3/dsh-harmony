# Harmony 是什么？

**dsh-harmony 是 DeepSeek Harness 的运行时 Patch 协调层。** 官方插件 API 用于增加能力；Harmony 用于修改已经存在的能力。

一个 Provider 可以在目标插件加载前重写它、替换具名函数，或装饰函数调用。变换后的源码只存在于内存，Harmony 不会改写磁盘上的安装包。

## 选择正确的扩展方式

| 方式 | 适用场景 | 边界与成本 |
| --- | --- | --- |
| 官方插件 API | 注册服务、Slot、工具和页面 | 没有扩展点就无法修改内部实现 |
| 维护 Fork | 不受限制地修改源码 | 需要持续合并上游，多个 Fork 难以协调 |
| **dsh-harmony** | 运行时修改 Host 和 WebUI 插件 | Patch 必须跟随目标编译结构变化 |

Harmony 不是新的安装器，也不替代 Harness Loader。它保留现有 `dsh` 命令和官方插件装配流程，只在 Loader 执行插件前收集、排序和应用 Patch。设计灵感来自 [C# 和 .NET 的 Harmony](https://github.com/pardeike/Harmony)。

## 运行路径

全局命令始终沿同一条路径运行：

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

## Harmony 协调什么

- **源码 Patch**：通过 TypeScript AST 变换 `lib/index.js`、`lib/client.js` 或其他编译目标。
- **语义 Patch**：对具名函数和类方法执行 `before`、`after`、`around` 或 `replace`。
- **加载器 Patch**：在 Node 默认加载器运行前，转译显式指定目标包所发布的 TypeScript。
- **全局顺序**：将手动 Provider 顺序与 `before`、`after` 约束结合。
- **事务**：提交重载前预检 Provider、顺序和启停状态变化。
- **检查**：展示原始源码、每一步 Patch 结果和最终运行时源码。
- **工具 API**：让插件与构建工具查询状态，或以事务方式重载插件及其 Patch 声明。

## Host 与浏览器目标

Node 目标通过 Loader Tree 重载。同一目标包中的相对 ESM 导入共享一代 Patch；CommonJS 重载会清理该包内部的 `require` 图。

`lib/client.js` 等浏览器目标使用 Harness 现有的 `clientModules.rebuilt` 路径。Harmony 重新计算 Bundle revision 并发送原生 HMR 事件，因此 WebUI 只重载发生变化的客户端插件。

## 安全边界

每次更新都会用完整、有序的 Patch 集合检查所有受影响目标。无法匹配或应用的单个 Patch 会被跳过并报告，不会拖垮 Host。Provider 声明加载失败或目标插件重载失败时，Harmony 才会保留上一代 Loader Tree 和 profile 状态。卸载 Harmony 后直接恢复执行原始文件，无需还原任何目标包。

下一步：[安装运行时](/zh/guide/installation)或[编写 Patch](/zh/patches/authoring)。
