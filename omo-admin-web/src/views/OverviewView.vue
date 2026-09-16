<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import { useAppStore } from '@/stores/app';
import type { OverviewSummary, VehicleStatus } from '@/types/domain';
import { money, orderStatusLabel, relativeFreshness, vehicleStatusLabel } from '@/utils/format';
import AppIcon from '@/components/AppIcon.vue';

const appStore = useAppStore();
const router = useRouter();
const loading = ref(false);
const error = ref('');
const summary = ref<OverviewSummary | null>(null);
const vehicleStatuses: VehicleStatus[] = ['available', 'active', 'charging', 'offline', 'fault'];
let loadId = 0;

const counts = computed(() => ({
  total: summary.value?.vehicles.total || 0,
  available: summary.value?.vehicles.available || 0,
  active: summary.value?.vehicles.active || 0,
  alerts: (summary.value?.vehicles.offline || 0) + (summary.value?.vehicles.fault || 0),
  waiting: summary.value?.orders.waitingPickup || 0,
  activeOrders: summary.value?.orders.active || 0,
  completed: summary.value?.orders.completedToday || 0,
}));

const activeVehicles = computed(() => summary.value?.activeVehicles || []);
const recentOrders = computed(() => summary.value?.recentOrders || []);
const readiness = computed(() => summary.value?.health.level === 'healthy' ? '全部系统在线' : summary.value?.health.level === 'critical' ? '存在关键故障' : '系统降级运行');

async function load() {
  if (!appStore.scenicAreas.length) return;
  const id = ++loadId;
  const scope = appStore.selectedScenicAreaId;
  loading.value = true;
  error.value = '';
  try {
    const result = await api.overview(scope);
    if (id !== loadId || scope !== appStore.selectedScenicAreaId) return;
    summary.value = result;
  } catch (reason) {
    if (id === loadId) error.value = reason instanceof Error ? reason.message : '运营数据加载失败';
  } finally {
    if (id === loadId) loading.value = false;
  }
}

watch(() => [appStore.selectedScenicAreaId, appStore.scenicAreas.length], load, { immediate: true });
</script>

<template>
  <div class="overview-page" v-loading="loading">
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false"><template #icon><AppIcon name="x-circle" /></template><template #default><el-button link type="danger" @click="load">重新加载</el-button></template></el-alert>

    <section class="overview-hero">
      <div class="overview-hero-copy">
        <h2>全域运营态势</h2>
        <div class="hero-actions"><el-button type="primary" size="large" @click="router.push('/map')"><AppIcon name="map-pin" />进入实时地图</el-button><el-button size="large" @click="router.push('/system')">查看系统诊断</el-button></div>
      </div>
      <div class="readiness-orbit" :class="`is-${summary?.health.level || 'degraded'}`">
        <div class="orbit-ring"><span>{{ summary?.health.incidentCount || 0 }}</span><small>当前事件</small></div>
        <strong>{{ readiness }}</strong>
        <small>{{ summary?.updatedAt ? `更新于 ${relativeFreshness(summary.updatedAt)}` : '等待首次同步' }}</small>
      </div>
    </section>

    <section class="command-metrics">
      <article><span>车辆在线态势</span><strong>{{ counts.total }}</strong><small><b class="is-success">{{ counts.available }} 可用</b> · {{ counts.active }} 行程中</small></article>
      <article><span>待处理订单</span><strong>{{ counts.waiting + counts.activeOrders }}</strong><small>{{ counts.waiting }} 待取车 · {{ counts.activeOrders }} 进行中</small></article>
      <article><span>今日有效结算</span><strong>{{ money(summary?.finance.effectiveAmountCentsToday || 0) }}</strong><small>{{ summary?.finance.settlementCountToday || 0 }} 笔结算记录</small></article>
      <article :class="{ alert: counts.alerts }"><span>运营告警</span><strong>{{ counts.alerts + (summary?.health.incidentCount || 0) }}</strong><small>{{ counts.alerts }} 台异常车辆 · {{ summary?.health.incidentCount || 0 }} 个系统事件</small></article>
    </section>

    <section class="overview-grid">
      <article class="panel lifecycle-panel">
        <div class="command-panel-head"><div><h3>小程序业务主链路</h3></div><span>实时对应</span></div>
        <div class="journey-flow">
          <div><i class="step-index">01</i><span>确认用车</span><strong>{{ counts.waiting }}<small>待取车</small></strong></div>
          <AppIcon name="arrow" />
          <div><i class="step-index">02</i><span>开始行程</span><strong>{{ counts.activeOrders }}<small>进行中</small></strong></div>
          <AppIcon name="arrow" />
          <div><i class="step-index">03</i><span>结束结算</span><strong>{{ counts.completed }}<small>已完成</small></strong></div>
        </div>
        <div class="active-fleet-head"><span>正在运行的车辆</span><button @click="router.push('/map')">查看全部 <AppIcon name="arrow" /></button></div>
        <div class="active-fleet-list" v-if="activeVehicles.length">
          <button v-for="vehicle in activeVehicles" :key="vehicle.id" @click="router.push('/map')"><span class="vehicle-signal"><i />{{ vehicle.vehicleNo }}</span><strong>{{ vehicle.batteryPercent }}%</strong><small>{{ relativeFreshness(vehicle.heartbeatAt) }}</small></button>
        </div>
        <div v-else class="command-empty">当前没有行程中的车辆</div>
      </article>

      <article class="panel recent-orders-panel">
        <div class="command-panel-head"><div><h3>最近订单</h3></div><button @click="router.push('/orders')">订单中心 <AppIcon name="arrow" /></button></div>
        <div class="compact-orders" v-if="recentOrders.length">
          <button v-for="order in recentOrders" :key="order.id" @click="router.push('/orders')">
            <div><strong>{{ order.orderNo }}</strong><small>{{ order.vehicleNo }} · {{ order.userMasked }}</small></div>
            <span :class="`order-state is-${order.status}`">{{ orderStatusLabel[order.status] }}</span>
            <b>{{ money(order.effectiveAmountCents) }}</b>
          </button>
        </div>
        <div v-else class="command-empty">当前范围暂无订单</div>
      </article>
    </section>

    <section class="panel fleet-radar">
      <div class="command-panel-head"><div><h3>车队状态</h3></div><span>{{ counts.total }} 台车辆</span></div>
      <div class="fleet-status-row">
        <div v-for="statusName in vehicleStatuses" :key="statusName" :class="`is-${statusName}`"><i /><span>{{ vehicleStatusLabel[statusName] }}</span><strong>{{ summary?.vehicles[statusName] || 0 }}</strong></div>
      </div>
    </section>
  </div>
</template>
