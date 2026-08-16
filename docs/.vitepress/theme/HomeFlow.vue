<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ locale?: 'en' | 'zh' }>()

const copy = computed(() => props.locale === 'zh'
  ? {
      label: '一条运行时路径',
      title: '原始文件保持不变，变换只存在于运行中。',
      description: 'Harmony 在 Loader 执行插件之前收集、排序并应用 Patch。每一步都可以检查，失败的更新不会覆盖上一代运行状态。',
      steps: [
        { title: '原始插件', meta: '磁盘 · 未修改', code: 'lib/client.js' },
        { title: '有序 Patch', meta: '预检 · 可追踪', code: 'provider/id' },
        { title: '运行时代码', meta: 'Host + WebUI', code: 'generation + 1' },
      ],
    }
  : {
      label: 'One runtime path',
      title: 'Original files stay untouched. Transformation lives in memory.',
      description: 'Harmony collects, orders, and applies Patches before the Loader executes a plugin. Every step is inspectable, and a failed update never replaces the previous running generation.',
      steps: [
        { title: 'Original plugin', meta: 'on disk · untouched', code: 'lib/client.js' },
        { title: 'Ordered Patches', meta: 'preflighted · traced', code: 'provider/id' },
        { title: 'Runtime source', meta: 'Host + WebUI', code: 'generation + 1' },
      ],
    })
</script>

<template>
  <section class="harmony-flow" :aria-label="copy.label">
    <div class="harmony-flow__intro">
      <h2>{{ copy.title }}</h2>
      <span>{{ copy.description }}</span>
    </div>
    <div class="harmony-flow__track">
      <article v-for="(step, index) in copy.steps" :key="step.title" class="harmony-flow__step">
        <span class="harmony-flow__index">{{ index + 1 }}</span>
        <div>
          <h3>{{ step.title }}</h3>
          <p>{{ step.meta }}</p>
          <code>{{ step.code }}</code>
        </div>
      </article>
    </div>
  </section>
</template>
