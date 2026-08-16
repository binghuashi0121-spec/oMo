<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api, isMockMode } from '@/api';
import { useLatestRequest } from '@/composables/useLatestRequest';
import { useVisiblePolling } from '@/composables/useVisiblePolling';
import { useAppStore } from '@/stores/app';
import HealthBadge from '@/components/HealthBadge.vue';
import PageDataState from '@/components/PageDataState.vue';
import type { HealthLevel, VehicleCommand } from '@/types/domain';
import { commandKeyLabel, commandStatusLabel, hasDefinedLatency, shanghaiTime } from '@/utils/format';

const appStore = useAppStore();
const requestState = useLatestRequest(90_000);
const commands = ref<VehicleCommand[]>([]);
const health = computed(() => appStore.health);
const healthyCount = computed(() => health.value?.components.filter((item) => item.level === 'healthy').length || 0);

function commandTagType(status: string) {
  return status === 'acked' ? 'success' : ['timed_out', 'failed'].includes(status) ? 'danger' : status === 'pending' ? 'info' : 'primary';
}

function incidentAdvice(title: string, level: HealthLevel) {
  if (/数据库/.test(title)) return '建议检查 CloudBase 探针、访问权限与最近错误日志。';
  if (/MQTT/.test(title)) return '建议检查网关连接、Broker 状态及私有链路健康度。';
  return level === 'critical' ? '建议立即检查核心依赖并暂停高风险运营操作。' : '建议核对对应组件状态和最近一次成功时间。';
}

async function load() {
  if (requestState.initialLoading.value || requestState.refreshing.value) return;
  const scenicAreaId = appStore.selectedScenicAreaId;
  const result = await requestState.run(() => Promise.all([
    api.systemHealth(scenicAreaId),
    api.vehicleCommands(scenicAreaId),
  ]));
  if (!result.accepted || !result.data || scenicAreaId !== appStore.selectedScenicAreaId) return;
  appStore.health = result.data[0];
  commands.value = result.data[1];
}

async function scenario(level: HealthLevel) {
  if (!api.setMockHealthScenario) return;
  appStore.health = await api.setMockHealthScenario(level);
  ElMessage.success(`已切换为${level === 'healthy' ? '健康' : level === 'degraded' ? '降级' : '故障'}演示状态`);
}

watch(() => appStore.selectedScenicAreaId, () => {
  commands.value = [];
  requestState.reset();
  void load();
}, { immediate: true });

useVisiblePolling(load, 30_000);
</script>

<template>
  <PageDataState
    :initial-loading="requestState.initialLoading.value"
    :has-data="requestState.hasData.value"
    :error="requestState.error.value"
    :stale="requestState.isStale.value"
    :last-success-at="requestState.lastSuccessAt.value"
    @retry="load"
  >
    <div class="page-stack">
      <section class="system-hero" :class="`is-${health?.level || 'degraded'}`" aria-live="polite">
        <div><p class="eyebrow">SYSTEM READINESS</p><h2>{{ health?.summary || '正在聚合系统状态' }}</h2><p>HTTP 可访问只代表存活；MQTT 断开、数据库不可用或车辆心跳异常都会降低就绪状态。</p></div>
        <div class="health-score"><strong>{{ healthyCount }}/{{ health?.components.length || 0 }}</strong><span>组件健康</span><small>{{ shanghaiTime(health?.checkedAt) }}</small></div>
      </section>
      <section class="panel" v-if="isMockMode"><div class="demo-scenario"><div><strong>状态演示控制器</strong><span>仅改变 Mock 数据，用于评审状态栏与诊断交互</span></div><el-button-group><el-button type="success" plain @click="scenario('healthy')">健康</el-button><el-button type="warning" plain @click="scenario('degraded')">降级</el-button><el-button type="danger" plain @click="scenario('critical')">故障</el-button></el-button-group></div></section>
      <section class="health-grid" v-if="health">
        <article v-for="component in health.components" :key="component.key" class="health-card" :class="`is-${component.level}`">
          <div class="health-card-head"><HealthBadge :level="component.level" /><span v-if="hasDefinedLatency(component.latencyMs)">{{ component.latencyMs }} ms</span></div>
          <h3>{{ component.name }}</h3><p>{{ component.message }}</p><small>检查于 {{ shanghaiTime(component.checkedAt) }}</small>
        </article>
      </section>
      <section class="two-column">
        <article class="panel"><div class="panel-title"><div><h2>当前事件</h2><p>需要运营人员关注的聚合异常</p></div></div><div class="incident-list" v-if="health?.incidents.length"><div v-for="incident in health.incidents" :key="incident.id" class="incident-item"><HealthBadge :level="incident.level" /><div><strong>{{ incident.title }}</strong><p>{{ incident.detail }}</p><p class="incident-advice">{{ incidentAdvice(incident.title, incident.level) }}</p><small>{{ shanghaiTime(incident.occurredAt) }}</small></div></div></div><el-empty v-else description="当前没有系统事件" :image-size="86" /></article>
        <article class="panel"><div class="panel-title"><div><h2>模拟指令回执</h2><p>后台指令不会发布至 MQTT Broker</p></div><el-tag type="warning">SIMULATED</el-tag></div><el-table :data="commands.slice(0,6)" size="small" empty-text="尚无模拟指令"><el-table-column label="指令" min-width="130"><template #default="{ row }">{{ commandKeyLabel[row.commandKey] || row.commandKey }}</template></el-table-column><el-table-column prop="vehicleId" label="车辆" min-width="110" /><el-table-column label="状态" width="105"><template #default="{ row }"><el-tag :type="commandTagType(row.status)" size="small">{{ commandStatusLabel[row.status] || row.status }}</el-tag></template></el-table-column><el-table-column label="时间" width="155"><template #default="{ row }">{{ shanghaiTime(row.updatedAt) }}</template></el-table-column></el-table></article>
      </section>
      <section class="panel"><div class="panel-title"><div><h2>状态判定规则</h2><p>第一期健康聚合验收契约</p></div></div><div class="rule-grid"><div><b>健康</b><span>API、数据库、MQTT 均正常，车辆心跳与指令失败率在阈值内。</span></div><div><b>降级</b><span>核心业务仍可查询，但存在 MQTT 断开、部分车辆失联或依赖延迟。</span></div><div><b>故障</b><span>数据库、认证或多个核心依赖不可用，需要立即干预。</span></div></div></section>
    </div>
  </PageDataState>
</template>
