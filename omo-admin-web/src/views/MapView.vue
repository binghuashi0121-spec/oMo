<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '@/api';
import { useAppStore } from '@/stores/app';
import type { Vehicle, VehicleCommand, VehicleStatus } from '@/types/domain';
import { relativeFreshness, vehicleStatusLabel } from '@/utils/format';
import AppIcon from '@/components/AppIcon.vue';
import TencentMap from '@/components/TencentMap.vue';
import VehicleControlDialog from '@/components/VehicleControlDialog.vue';

const appStore = useAppStore();
const vehicles = ref<Vehicle[]>([]); const loading = ref(false); const keyword = ref(''); const status = ref<VehicleStatus | ''>('');
const selected = ref<Vehicle | null>(null); const drawerOpen = ref(false); const commandOpen = ref(false); const recentCommands = ref<VehicleCommand[]>([]);
const scenic = computed(() => appStore.selectedScenic);
const filtered = computed(() => vehicles.value.filter((item) => (!status.value || item.status === status.value) && (!keyword.value || item.vehicleNo.toLowerCase().includes(keyword.value.toLowerCase()))));
const stats = computed(() => ({ total: vehicles.value.length, available: vehicles.value.filter((v) => v.status === 'available').length, active: vehicles.value.filter((v) => v.status === 'active').length, alerts: vehicles.value.filter((v) => ['offline', 'fault'].includes(v.status)).length }));

function statusType(value: VehicleStatus) { return value === 'available' ? 'success' : value === 'active' ? 'primary' : value === 'charging' ? 'warning' : 'danger'; }
async function load() {
  if (appStore.selectedScenicAreaId === 'all') return;
  loading.value = true;
  try { vehicles.value = await api.mapVehicles(appStore.selectedScenicAreaId); if (selected.value) selected.value = vehicles.value.find((item) => item.id === selected.value?.id) || null; }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '车辆数据加载失败'); }
  finally { loading.value = false; }
}
function selectVehicle(vehicle: Vehicle) { selected.value = vehicle; drawerOpen.value = true; }
async function commandSent(command: VehicleCommand) {
  recentCommands.value = [command, ...recentCommands.value];
  window.setTimeout(async () => { recentCommands.value = await api.vehicleCommands(appStore.selectedScenicAreaId); }, 1100);
}
watch(() => appStore.selectedScenicAreaId, load, { immediate: true });
</script>

<template>
  <div class="page-stack" v-loading="loading">
    <section class="metric-strip">
      <article class="metric-card"><div class="metric-icon orange"><AppIcon name="vehicle" /></div><div><span>车辆总数</span><strong>{{ stats.total }}</strong><small>当前景区资产</small></div></article>
      <article class="metric-card"><div class="metric-icon green"><AppIcon name="link" /></div><div><span>可用车辆</span><strong>{{ stats.available }}</strong><small>{{ stats.total ? Math.round(stats.available / stats.total * 100) : 0 }}% 可调度</small></div></article>
      <article class="metric-card"><div class="metric-icon blue"><AppIcon name="bolt" /></div><div><span>行程中</span><strong>{{ stats.active }}</strong><small>实时运营车辆</small></div></article>
      <article class="metric-card" :class="{ alert: stats.alerts }"><div class="metric-icon red"><AppIcon name="alert" /></div><div><span>异常车辆</span><strong>{{ stats.alerts }}</strong><small>离线或故障</small></div></article>
    </section>
    <section class="panel map-panel">
      <div class="panel-toolbar">
        <div><h2>实时车辆地图</h2><p>设备 WGS84 原始坐标保留，地图只使用后端提供的 GCJ-02 展示坐标</p></div>
        <div class="toolbar-controls">
          <el-input v-model="keyword" placeholder="搜索车辆编号" clearable style="width: 190px"><template #prefix><AppIcon name="search" /></template></el-input>
          <el-select v-model="status" placeholder="全部状态" clearable style="width: 140px"><el-option v-for="item in ['available','active','charging','offline','fault']" :key="item" :label="vehicleStatusLabel[item]" :value="item" /></el-select>
          <el-button @click="load"><AppIcon name="refresh" />刷新</el-button>
        </div>
      </div>
      <div class="map-workspace" v-if="scenic">
        <TencentMap :scenic="scenic" :vehicles="filtered" :selected-vehicle-id="selected?.id" @select="selectVehicle" />
        <aside class="vehicle-list">
          <div class="vehicle-list-head"><span>车辆列表</span><small>{{ filtered.length }} 台</small></div>
          <button v-for="vehicle in filtered" :key="vehicle.id" class="vehicle-list-item" :class="{ selected: selected?.id === vehicle.id }" @click="selectVehicle(vehicle)">
            <div class="vehicle-avatar"><AppIcon name="vehicle" /></div><div class="vehicle-main"><strong>{{ vehicle.vehicleNo }}</strong><span><i :class="`dot is-${vehicle.status}`" />{{ vehicleStatusLabel[vehicle.status] }} · 电量 {{ vehicle.batteryPercent }}%</span></div><small>{{ relativeFreshness(vehicle.heartbeatAt) }}</small>
          </button>
          <el-empty v-if="!filtered.length" description="没有符合条件的车辆" :image-size="76" />
        </aside>
      </div>
    </section>
  </div>

  <el-drawer v-model="drawerOpen" title="车辆运营详情" size="430px">
    <template v-if="selected">
      <div class="asset-title"><div class="vehicle-avatar large"><AppIcon name="vehicle" /></div><div><h2>{{ selected.vehicleNo }}</h2><el-tag :type="statusType(selected.status)">{{ vehicleStatusLabel[selected.status] }}</el-tag></div></div>
      <div class="detail-grid"><div><span>剩余电量</span><strong>{{ selected.batteryPercent }}%</strong></div><div><span>当前速度</span><strong>{{ selected.speedKph }} km/h</strong></div><div><span>心跳更新</span><strong>{{ relativeFreshness(selected.heartbeatAt) }}</strong></div><div><span>当前订单</span><strong>{{ selected.activeOrderId || '无' }}</strong></div></div>
      <div class="coordinate-box"><strong>坐标契约</strong><p>WGS84 原始：{{ selected.positionWgs84.longitude.toFixed(6) }}, {{ selected.positionWgs84.latitude.toFixed(6) }}</p><p>GCJ-02 展示：{{ selected.positionGcj02.longitude.toFixed(6) }}, {{ selected.positionGcj02.latitude.toFixed(6) }}</p></div>
      <el-button type="primary" class="full-button" @click="commandOpen = true"><AppIcon name="settings" />打开模拟控制中心</el-button>
      <div class="subsection"><div class="subsection-head"><h3>最近模拟指令</h3><el-tag type="warning" size="small">绝不发布 MQTT</el-tag></div><el-timeline v-if="recentCommands.length"><el-timeline-item v-for="command in recentCommands.slice(0, 5)" :key="command.id" :timestamp="command.status" :type="command.status === 'acked' ? 'success' : command.status === 'timed_out' ? 'danger' : 'primary'">{{ command.commandKey }} · {{ command.reason }}</el-timeline-item></el-timeline><el-empty v-else description="尚无模拟指令" :image-size="72" /></div>
    </template>
  </el-drawer>
  <VehicleControlDialog v-model="commandOpen" :vehicle="selected" @sent="commandSent" />
</template>
