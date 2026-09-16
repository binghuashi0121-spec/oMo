<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '@/api';
import { useLatestRequest, type RequestMode } from '@/composables/useLatestRequest';
import { useVisiblePolling } from '@/composables/useVisiblePolling';
import { useAppStore } from '@/stores/app';
import type { Vehicle, VehicleCommand, VehicleStatus } from '@/types/domain';
import { commandKeyLabel, commandStatusLabel, relativeFreshness, vehicleStatusLabel } from '@/utils/format';
import AppIcon from '@/components/AppIcon.vue';
import PageDataState from '@/components/PageDataState.vue';
import TencentMap from '@/components/TencentMap.vue';
import VehicleControlDialog from '@/components/VehicleControlDialog.vue';
import VehicleStatusLegend from '@/components/VehicleStatusLegend.vue';

const REFRESH_INTERVAL_MS = 15_000;
const appStore = useAppStore();
const requestState = useLatestRequest(45_000);
const vehicles = ref<Vehicle[]>([]);
const keyword = ref('');
const status = ref<VehicleStatus | ''>('');
const selected = ref<Vehicle | null>(null);
const drawerOpen = ref(false);
const commandOpen = ref(false);
const recentCommands = ref<VehicleCommand[]>([]);

const scenic = computed(() => appStore.selectedScenic);
const filtered = computed(() => vehicles.value.filter((item) => (
  (!status.value || item.status === status.value)
  && (!keyword.value || item.vehicleNo.toLowerCase().includes(keyword.value.toLowerCase()))
)));
const stats = computed(() => ({
  total: vehicles.value.length,
  available: vehicles.value.filter((vehicle) => vehicle.status === 'available').length,
  active: vehicles.value.filter((vehicle) => vehicle.status === 'active').length,
  alerts: vehicles.value.filter((vehicle) => ['offline', 'fault'].includes(vehicle.status)).length,
}));
const updatedText = computed(() => {
  void requestState.isStale.value;
  return requestState.lastSuccessAt.value ? relativeFreshness(requestState.lastSuccessAt.value) : '尚未更新';
});

function statusType(value: VehicleStatus) {
  return value === 'available' ? 'success' : value === 'active' ? 'primary' : value === 'charging' ? 'warning' : 'danger';
}

async function load(mode: RequestMode = 'manual') {
  const scenicAreaId = appStore.selectedScenicAreaId;
  if (scenicAreaId === 'all' || requestState.initialLoading.value || requestState.refreshing.value) return;
  const result = await requestState.run(() => api.mapVehicles(scenicAreaId), mode);
  if (!result.accepted || !result.data || scenicAreaId !== appStore.selectedScenicAreaId) return;
  vehicles.value = result.data;
  if (selected.value) selected.value = vehicles.value.find((item) => item.id === selected.value?.id) || null;
  if (!selected.value) drawerOpen.value = false;
}

function selectVehicle(vehicle: Vehicle) {
  selected.value = vehicle;
  drawerOpen.value = true;
}

async function commandSent(command: VehicleCommand) {
  recentCommands.value = [command, ...recentCommands.value];
  window.setTimeout(async () => {
    const scenicAreaId = appStore.selectedScenicAreaId;
    const commands = await api.vehicleCommands(scenicAreaId).catch(() => null);
    if (commands && scenicAreaId === appStore.selectedScenicAreaId) recentCommands.value = commands;
  }, 1_100);
}

watch(() => appStore.selectedScenicAreaId, () => {
  selected.value = null;
  drawerOpen.value = false;
  commandOpen.value = false;
  vehicles.value = [];
  recentCommands.value = [];
  requestState.reset();
  void load('initial');
}, { immediate: true });

useVisiblePolling(() => load('poll'), REFRESH_INTERVAL_MS);
</script>

<template>
  <PageDataState
    :initial-loading="requestState.initialLoading.value"
    :has-data="requestState.hasData.value"
    :error="requestState.error.value"
    :stale="requestState.isStale.value"
    :last-success-at="requestState.lastSuccessAt.value"
    @retry="load('manual')"
  >
    <div class="command-map-page">
      <section class="map-command-head">
        <div><h2>{{ scenic?.name || '车辆实时态势' }}</h2><span>车辆数据更新于 {{ updatedText }} · 每 15 秒自动刷新</span></div>
        <div class="map-stat-ribbon">
          <article><span>车队总数</span><strong>{{ stats.total }}</strong></article>
          <article><span>可调度</span><strong>{{ stats.available }}</strong><small>{{ stats.total ? Math.round(stats.available / stats.total * 100) : 0 }}%</small></article>
          <article><span>行程中</span><strong>{{ stats.active }}</strong></article>
          <article :class="{ alert: stats.alerts }"><span>异常</span><strong>{{ stats.alerts }}</strong></article>
        </div>
      </section>

      <section class="map-command-shell" v-if="scenic">
        <div class="map-stage">
          <TencentMap :scenic="scenic" :vehicles="filtered" :selected-vehicle-id="selected?.id" @select="selectVehicle" />
          <div class="map-floating-toolbar">
            <el-input v-model="keyword" placeholder="搜索车辆编号" clearable><template #prefix><AppIcon name="search" /></template></el-input>
            <el-select v-model="status" placeholder="全部状态" clearable><el-option v-for="item in ['available','active','charging','offline','fault']" :key="item" :label="vehicleStatusLabel[item]" :value="item" /></el-select>
            <el-button circle aria-label="刷新" :loading="requestState.refreshing.value" :disabled="requestState.initialLoading.value" @click="load('manual')"><AppIcon v-if="!requestState.refreshing.value" name="refresh" /></el-button>
          </div>
          <div class="map-legend-float"><span>车辆状态</span><VehicleStatusLegend /></div>
          <div class="map-live-indicator"><AppIcon name="pulse" />实时 <span>展示 {{ filtered.length }} / {{ vehicles.length }} 台</span></div>
        </div>
        <aside class="vehicle-list vehicle-command-rail">
          <div class="vehicle-list-head"><div><span>车队信号</span><small>按心跳持续更新</small></div><b>{{ filtered.length }}</b></div>
          <button v-for="vehicle in filtered" :key="vehicle.id" class="vehicle-list-item" :class="[{ selected: selected?.id === vehicle.id }, `is-${vehicle.status}`]" @click="selectVehicle(vehicle)">
            <div class="vehicle-avatar"><AppIcon name="vehicle" /></div>
            <div class="vehicle-main"><strong>{{ vehicle.vehicleNo }}</strong><span><i :class="`dot is-${vehicle.status}`" />{{ vehicleStatusLabel[vehicle.status] }} · {{ vehicle.speedKph }} km/h</span></div>
            <div class="vehicle-telemetry"><strong>{{ vehicle.batteryPercent }}%</strong><small>{{ relativeFreshness(vehicle.heartbeatAt) }}</small></div>
          </button>
          <el-empty v-if="!filtered.length" description="没有符合条件的车辆" :image-size="76" />
          <div class="rail-summary"><span><i class="is-success" />{{ stats.available }} 可用</span><span><i class="is-alert" />{{ stats.alerts }} 异常</span></div>
        </aside>
      </section>
    </div>
  </PageDataState>

  <el-drawer v-model="drawerOpen" title="车辆运营详情" size="430px">
    <template v-if="selected">
      <div class="asset-title"><div class="vehicle-avatar large"><AppIcon name="vehicle" /></div><div><h2>{{ selected.vehicleNo }}</h2><el-tag :type="statusType(selected.status)">{{ vehicleStatusLabel[selected.status] }}</el-tag></div></div>
      <div class="detail-grid"><div><span>剩余电量</span><strong>{{ selected.batteryPercent }}%</strong></div><div><span>当前速度</span><strong>{{ selected.speedKph }} km/h</strong></div><div><span>心跳更新</span><strong>{{ relativeFreshness(selected.heartbeatAt) }}</strong></div><div><span>当前订单</span><strong>{{ selected.activeOrderId || '无' }}</strong></div></div>
      <div class="coordinate-box"><strong>坐标契约</strong><p>WGS84 原始：{{ selected.positionWgs84.longitude.toFixed(6) }}, {{ selected.positionWgs84.latitude.toFixed(6) }}</p><p>GCJ-02 展示：{{ selected.positionGcj02.longitude.toFixed(6) }}, {{ selected.positionGcj02.latitude.toFixed(6) }}</p></div>
      <el-button type="primary" class="full-button" @click="commandOpen = true"><AppIcon name="settings" />打开模拟控制中心</el-button>
      <div class="subsection"><div class="subsection-head"><h3>最近模拟指令</h3><el-tag type="warning" size="small">绝不发布 MQTT</el-tag></div><el-timeline v-if="recentCommands.length"><el-timeline-item v-for="command in recentCommands.slice(0, 5)" :key="command.id" :timestamp="commandStatusLabel[command.status]" :type="command.status === 'acked' ? 'success' : command.status === 'timed_out' ? 'danger' : 'primary'">{{ commandKeyLabel[command.commandKey] || command.commandKey }} · {{ command.reason }}</el-timeline-item></el-timeline><el-empty v-else description="尚无模拟指令" :image-size="72" /></div>
    </template>
  </el-drawer>
  <VehicleControlDialog v-model="commandOpen" :vehicle="selected" @sent="commandSent" />
</template>
