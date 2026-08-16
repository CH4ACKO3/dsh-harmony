---
layout: home

hero:
  name: dsh-harmony
  text: 改变插件，但不改动插件文件。
  tagline: DeepSeek Harness 的运行时 Patch 协调层，提供确定的顺序、事务式重载和可检查的源码变换链路。
  image:
    src: /harmony-icon.png
    alt: Harmony 交织环形图标
  actions:
    - theme: brand
      text: 安装 Harmony
      link: /zh/guide/installation
    - theme: alt
      text: 编写第一个 Patch
      link: /zh/patches/authoring
---

<HomeFlow locale="zh" />

<section class="home-follow">
  <div>
    <h2>一个顺序，处处一致。</h2>
    <p>Web 设置页和终端界面操作同一份 profile 状态。调整 Provider 顺序、检查冲突、停用单个 Patch，并且只热重载受影响的目标。</p>
    <p><a href="/zh/guide/operations">了解排序与重载 →</a></p>
  </div>
  <img src="/harmony-preview-light.png" alt="DeepSeek Harness 设置中的 Harmony 插件顺序和 Patch 状态页面">
</section>

<section class="home-start">
  <h2>从你当前的问题开始。</h2>
  <div class="home-start__links">
    <a href="/zh/guide/introduction"><strong>理解运行时路径</strong><span>Harmony 与 Loader、Host、WebUI 分别负责什么。</span></a>
    <a href="/zh/patches/authoring"><strong>Patch 编译后的模块</strong><span>源码选择器、语义处理器、顺序和冲突。</span></a>
    <a href="/zh/integrations/react"><strong>修改 React 树</strong><span>面向编译后 jsx 和 jsxs 调用的类型化工厂。</span></a>
    <a href="/zh/help/troubleshooting"><strong>修复失败的 Patch</strong><span>状态码、源码检查和首次启动问题。</span></a>
  </div>
</section>
