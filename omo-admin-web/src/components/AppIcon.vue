<script setup lang="ts">
import { computed } from 'vue';
import { iconPaths, type AppIconName } from '@/icons/registry';

const props = withDefaults(defineProps<{ name: AppIconName; label?: string; size?: number | string }>(), { size: '1em' });
const paths = computed(() => iconPaths[props.name] ?? iconPaths.info);
</script>

<template>
  <svg
    class="app-icon"
    :data-icon="name"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  >
    <path v-for="path in paths" :key="path" :d="path" />
  </svg>
</template>
