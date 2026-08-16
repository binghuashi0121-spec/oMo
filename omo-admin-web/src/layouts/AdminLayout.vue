<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import AppIcon from '@/components/AppIcon.vue';
import SystemStatusBar from '@/components/SystemStatusBar.vue';
import { isMockMode } from '@/api';
import brandLogo from '@/assets/brand/oMo_logo.png';

const appStore = useAppStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
let timer: number | undefined;
const isMap = computed(() => route.name === 'map');
const scenicOptions = computed(() => isMap.value ? appStore.scenicAreas : [{ id: 'all', name: '全部景区' } as any, ...appStore.scenicAreas]);

watch(isMap, (value) => {
  if (value && appStore.selectedScenicAreaId === 'all') appStore.selectScenicArea(appStore.scenicAreas[0]?.id || 'tianmashan');
});
watch(() => appStore.selectedScenicAreaId, () => {
  if (appStore.scenicAreas.length) void appStore.refreshHealth().catch(() => undefined);
});

async function logout() {
  await ElMessageBox.confirm('确认退出管理后台？', '退出登录', { confirmButtonText: '退出', cancelButtonText: '取消' });
  await authStore.logout();
  await router.replace('/login');
}

onMounted(async () => {
  await appStore.loadScenicAreas();
  if (isMap.value && appStore.selectedScenicAreaId === 'all') appStore.selectScenicArea(appStore.scenicAreas[0]?.id || 'tianmashan');
  await appStore.refreshHealth();
  timer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && !appStore.healthRefreshing) void appStore.refreshHealth().catch(() => undefined);
  }, 30_000);
});
onBeforeUnmount(() => { if (timer) window.clearInterval(timer); });
</script>

<template>
  <div class="admin-shell">
    <aside class="sidebar">
      <div class="brand">
        <img class="brand-logo" :src="brandLogo" alt="oMo共享车" width="145" height="51" />
        <span class="brand-console-label">运营管理台</span>
      </div>
      <el-menu :default-active="route.path" router class="nav-menu">
        <el-menu-item index="/map"><AppIcon name="map-pin" /><span>车辆地图</span></el-menu-item>
        <el-menu-item index="/orders"><AppIcon name="file-text" /><span>订单管理</span></el-menu-item>
        <el-menu-item index="/finance"><AppIcon name="chart" /><span>财务中心</span></el-menu-item>
        <el-menu-item index="/system"><AppIcon name="monitor" /><span>系统诊断</span></el-menu-item>
      </el-menu>
      <div class="sidebar-foot">
        <span class="demo-chip" v-if="isMockMode">MOCK 原型</span>
        <button class="user-button" aria-label="退出登录" @click="logout"><span>{{ authStore.user?.displayName }}</span><AppIcon name="logout" /></button>
      </div>
    </aside>
    <section class="main-column">
      <header class="topbar">
        <div><p class="eyebrow">oMo OPERATIONS</p><h1>{{ route.meta.title }}</h1></div>
        <div class="topbar-actions">
          <span class="selector-label">运营范围</span>
          <el-select :model-value="appStore.selectedScenicAreaId" style="width: 210px" @change="appStore.selectScenicArea">
            <el-option v-for="item in scenicOptions" :key="item.id" :label="item.name" :value="item.id">
              <span>{{ item.name }}</span><el-tag v-if="item.isDemo" size="small" type="warning" class="option-tag">演示</el-tag>
            </el-option>
          </el-select>
          <div class="date-box"><span>{{ new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date()) }}</span><small>Asia/Shanghai</small></div>
        </div>
      </header>
      <SystemStatusBar :health="appStore.health" :refreshing="appStore.healthRefreshing" @refresh="appStore.refreshHealth" />
      <main class="page-content"><router-view /></main>
    </section>
  </div>
</template>
