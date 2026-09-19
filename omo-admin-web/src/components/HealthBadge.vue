<script setup lang="ts">
import type { HealthLevel } from '@/types/domain';
defineProps<{ level: HealthLevel; text?: string }>();
const labels: Record<HealthLevel, string> = { healthy: '健康', degraded: '降级', critical: '故障' };
</script>
<template><span class="health-badge" :class="`is-${level}`"><i />{{ text || labels[level] }}</span></template>
