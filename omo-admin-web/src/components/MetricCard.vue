<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import type { AppIconName } from '@/icons/registry';

withDefaults(defineProps<{
  icon: AppIconName;
  tone?: 'orange' | 'green' | 'blue' | 'red';
  label: string;
  value: string | number;
  note: string;
  alert?: boolean;
}>(), { tone: 'orange', alert: false });
</script>

<template>
  <article class="metric-card" :class="{ alert }">
    <div class="metric-icon" :class="tone"><AppIcon :name="icon" /></div>
    <div><span>{{ label }}</span><strong>{{ value }}</strong><small>{{ note }}</small></div>
  </article>
</template>
