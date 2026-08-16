<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { shanghaiTime } from '@/utils/format';

defineProps<{
  initialLoading: boolean;
  hasData: boolean;
  error?: string;
  stale?: boolean;
  lastSuccessAt?: string;
}>();

defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="page-data-state" :aria-busy="initialLoading">
    <div v-if="initialLoading && !hasData" class="page-loading" v-loading="true" aria-label="正在加载数据" />
    <el-result v-else-if="error && !hasData" icon="error" title="数据加载失败" :sub-title="error">
      <template #extra><el-button type="primary" @click="$emit('retry')"><AppIcon name="refresh" />重新加载</el-button></template>
    </el-result>
    <template v-else>
      <div v-if="error" class="stale-notice" role="status" aria-live="polite">
        <AppIcon name="warning" />
        <span>刷新失败，当前展示上次成功数据<span v-if="lastSuccessAt">（{{ shanghaiTime(lastSuccessAt) }}）</span>：{{ error }}</span>
        <el-button link type="warning" @click="$emit('retry')">立即重试</el-button>
      </div>
      <div v-else-if="stale" class="stale-notice" role="status" aria-live="polite">
        <AppIcon name="warning" />
        <span>数据更新时间较早，请刷新后再进行运营判断。</span>
        <el-button link type="warning" @click="$emit('retry')">立即刷新</el-button>
      </div>
      <slot />
    </template>
  </div>
</template>
