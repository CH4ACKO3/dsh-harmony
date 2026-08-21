<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ecosystemCategories,
  ecosystemEntries,
  type EcosystemCategory,
} from '../../ecosystem'

const props = withDefaults(defineProps<{
  locale?: 'en' | 'zh'
  mode?: 'compact' | 'full'
  limit?: number
}>(), {
  locale: 'en',
  mode: 'full',
  limit: 3,
})

const selected = ref<EcosystemCategory | 'all'>('all')
const shown = ref(ecosystemEntries.slice(0, props.limit))
const categories = [...new Set(ecosystemEntries.map(entry => entry.category))]
const copy = computed(() => props.locale === 'zh' ? {
  all: '全部',
  repository: '源码',
  target: '作用于',
} : {
  all: 'All',
  repository: 'Source',
  target: 'Targets',
})
const entries = computed(() => props.mode === 'compact'
  ? shown.value
  : selected.value === 'all'
    ? ecosystemEntries
    : ecosystemEntries.filter(entry => entry.category === selected.value))

onMounted(() => {
  if (props.mode !== 'compact') return
  const shuffled = [...ecosystemEntries]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!]
  }
  shown.value = shuffled.slice(0, props.limit)
})
</script>

<template>
  <section class="ecosystem-directory" :class="`ecosystem-directory--${mode}`">
    <nav v-if="mode === 'full'" class="ecosystem-filters" :aria-label="locale === 'zh' ? '按分类筛选' : 'Filter by category'">
      <button type="button" :aria-pressed="selected === 'all'" @click="selected = 'all'">
        {{ copy.all }} <span>{{ ecosystemEntries.length }}</span>
      </button>
      <button
        v-for="category in categories"
        :key="category"
        type="button"
        :aria-pressed="selected === category"
        @click="selected = category"
      >
        {{ ecosystemCategories[category][locale] }}
        <span>{{ ecosystemEntries.filter(entry => entry.category === category).length }}</span>
      </button>
    </nav>

    <ul class="ecosystem-list">
      <li v-for="entry in entries" :key="entry.packageName" class="ecosystem-entry">
        <div class="ecosystem-entry__identity">
          <span class="ecosystem-entry__category">{{ ecosystemCategories[entry.category][locale] }}</span>
          <h3><a :href="entry.repository">{{ entry.name }}</a></h3>
          <code>{{ entry.packageName }}</code>
        </div>
        <div class="ecosystem-entry__body">
          <p>{{ entry.description[locale] }}</p>
          <p class="ecosystem-entry__targets">
            <span>{{ copy.target }}</span>
            {{ entry.targets.join(' · ') }}
          </p>
        </div>
        <div class="ecosystem-entry__actions">
          <code>{{ entry.install }}</code>
          <a :href="entry.repository">{{ copy.repository }}</a>
        </div>
      </li>
    </ul>
  </section>
</template>
