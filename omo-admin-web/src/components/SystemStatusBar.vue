<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import type { AppIconName } from '@/icons/registry';
import type { SystemHealth } from '@/types/domain';
import { relativeFreshness } from '@/utils/format';

const props = withDefaults(defineProps<{ health: SystemHealth | null; refreshing?: boolean }>(), { refreshing: false });
defineEmits<{ refresh: [] }>();
const icon = computed<AppIconName>(() => props.health?.level === 'healthy' ? 'check-circle' : props.health?.level === 'critical' ? 'x-circle' : 'warning');
const label = computed(() => props.health?.level === 'healthy' ? '系统正常' : props.health?.level === 'critical' ? '系统故障' : '系统降级');
</script>

<template>
  <div class="system-bar" :class="`is-${health?.level || 'loading'}`" role="status" aria-live="polite">
    <div class="system-summary"><AppIcon :name="icon" /><strong>{{ health ? label : '状态检查中' }}</strong><span>{{ health?.summary || '正在聚合各服务健康状态…' }}</span></div>
    <div class="system-meta" v-if="health"><span>数据更新于 {{ relativeFreshness(health.dataFreshnessAt) }}</span><router-link to="/system">查看诊断</router-link><el-button text circle aria-label="刷新系统状态" :loading="refreshing" @click="$emit('refresh')"><AppIcon v-if="!refreshing" name="refresh" /></el-button></div>
  </div>
</template>
