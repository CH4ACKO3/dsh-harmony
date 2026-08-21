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
  heading?: string
  intro?: string
  refreshLabel?: string
}>(), {
  locale: 'en',
  mode: 'full',
  limit: 3,
  heading: '',
  intro: '',
  refreshLabel: '',
})

const selected = ref<EcosystemCategory | 'all'>('all')
const shown = ref(ecosystemEntries.slice(0, props.limit))
const categories = [...new Set(ecosystemEntries.map(entry => entry.category))]
const copy = computed(() => props.locale === 'zh' ? {
  all: '全部',
} : {
  all: 'All',
})
const entries = computed(() => props.mode === 'compact'
  ? shown.value
  : selected.value === 'all'
    ? ecosystemEntries
    : ecosystemEntries.filter(entry => entry.category === selected.value))

function refresh() {
  const shuffled = [...ecosystemEntries]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!]
  }
  const next = shuffled.slice(0, props.limit)
  const unchanged = next.length > 1
    && next.every((entry, index) => entry.packageName === shown.value[index]?.packageName)
  shown.value = unchanged ? [...next.slice(1), next[0]!] : next
}

onMounted(() => {
  if (props.mode !== 'compact') return
  refresh()
})
</script>

<template>
  <section class="ecosystem-directory" :class="`ecosystem-directory--${mode}`">
    <header v-if="mode === 'compact' && heading" class="ecosystem-directory__header">
      <div class="ecosystem-directory__title">
        <h2>{{ heading }}</h2>
        <button v-if="refreshLabel" type="button" @click="refresh">
          <span>{{ refreshLabel }}</span>
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path d="M13.4 4.8A6 6 0 1 0 14 8M13.4 4.8V1.9m0 2.9h-2.9" />
          </svg>
        </button>
      </div>
      <p v-if="intro">{{ intro }}</p>
    </header>

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
        </div>
        <div class="ecosystem-entry__actions">
          <code>{{ entry.install }}</code>
        </div>
      </li>
    </ul>
  </section>
</template>
