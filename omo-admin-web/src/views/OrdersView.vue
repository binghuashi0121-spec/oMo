<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '@/api';
import { useLatestRequest } from '@/composables/useLatestRequest';
import { useAppStore } from '@/stores/app';
import type { Order } from '@/types/domain';
import { money, orderStatusLabel, shanghaiTime } from '@/utils/format';
import AppIcon from '@/components/AppIcon.vue';
import MetricCard from '@/components/MetricCard.vue';
import PageDataState from '@/components/PageDataState.vue';

const appStore = useAppStore();
const requestState = useLatestRequest(120_000);
const orders = ref<Order[]>([]);
const total = ref(0);
const query = reactive({ keyword: '', status: '', page: 1, pageSize: 10 });
const selected = ref<Order | null>(null);
const drawerOpen = ref(false);
const noteText = ref('');
const savingNote = ref(false);
const activeCount = computed(() => orders.value.filter((item) => item.status === 'active').length);
const completedCount = computed(() => orders.value.filter((item) => item.status === 'completed').length);
const scenicName = (id: string) => appStore.scenicAreas.find((item) => item.id === id)?.shortName || id;

function tagType(status: string) {
  return status === 'completed' ? 'success' : status === 'active' ? 'primary' : status === 'cancelled' ? 'info' : 'warning';
}

async function load() {
  const scenicAreaId = appStore.selectedScenicAreaId;
  const snapshot = { scenicAreaId, ...query };
  const result = await requestState.run(() => api.orders(snapshot));
  if (!result.accepted || !result.data || scenicAreaId !== appStore.selectedScenicAreaId) return;
  orders.value = result.data.items;
  total.value = result.data.total;
}

function search() {
  query.page = 1;
  void load();
}

async function openOrder(value: unknown) {
  const order = value as Order;
  try {
    const detail = await api.order(order.id);
    if (order.scenicAreaId !== appStore.selectedScenicAreaId && appStore.selectedScenicAreaId !== 'all') return;
    selected.value = detail;
    drawerOpen.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '订单详情加载失败');
  }
}

async function saveNote() {
  if (!selected.value || noteText.value.trim().length < 2) {
    ElMessage.warning('请输入至少 2 个字的内部备注');
    return;
  }
  savingNote.value = true;
  try {
    selected.value = await api.addOrderNote(selected.value.id, noteText.value.trim());
    noteText.value = '';
    ElMessage.success('内部备注已追加且不可覆盖');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '内部备注保存失败');
  } finally {
    savingNote.value = false;
  }
}

watch(() => appStore.selectedScenicAreaId, () => {
  query.page = 1;
  selected.value = null;
  drawerOpen.value = false;
  orders.value = [];
  total.value = 0;
  requestState.reset();
  void load();
}, { immediate: true });
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
      <section class="metric-strip three">
        <MetricCard icon="eye" label="筛选结果" :value="total" :note="appStore.selectedScenicAreaId === 'all' ? '全部景区' : scenicName(appStore.selectedScenicAreaId)" />
        <MetricCard icon="activity" tone="blue" label="当前页进行中" :value="activeCount" note="仅统计本页运营订单" />
        <MetricCard icon="message" tone="green" label="当前页已完成" :value="completedCount" note="仅统计本页查询结果" />
      </section>
      <section class="panel">
        <div class="panel-toolbar">
          <div><h2>订单查询</h2><p>只读查看业务状态，可追加内部备注；不提供强制结束或取消操作</p></div>
          <div class="toolbar-controls">
            <el-input v-model="query.keyword" placeholder="订单号 / 车辆 / 手机" clearable style="width: 220px" @keyup.enter="search"><template #prefix><AppIcon name="search" /></template></el-input>
            <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 132px" @change="search"><el-option v-for="item in ['waiting_pickup','active','completed','cancelled']" :key="item" :label="orderStatusLabel[item]" :value="item" /></el-select>
            <el-button type="primary" :loading="requestState.refreshing.value" @click="search"><AppIcon name="search" />查询</el-button>
          </div>
        </div>
        <el-table :data="orders" stripe class="data-table order-table">
          <el-table-column prop="orderNo" label="订单号" min-width="170"><template #default="{ row }"><div class="order-primary"><div class="primary-cell"><strong>{{ row.orderNo }}</strong><el-tag v-if="row.isDemo" size="small" type="warning">演示</el-tag></div><small>{{ row.noteCount }} 条内部备注</small></div></template></el-table-column>
          <el-table-column v-if="appStore.selectedScenicAreaId === 'all'" label="景区" width="92"><template #default="{ row }">{{ scenicName(row.scenicAreaId) }}</template></el-table-column>
          <el-table-column prop="vehicleNo" label="车辆" width="105" />
          <el-table-column prop="userMasked" label="用户" width="115" />
          <el-table-column label="状态" width="92"><template #default="{ row }"><el-tag :type="tagType(row.status)" effect="light">{{ orderStatusLabel[row.status] }}</el-tag></template></el-table-column>
          <el-table-column label="里程 / 时长" min-width="120"><template #default="{ row }">{{ row.distanceKm.toFixed(2) }} km<br><span class="table-secondary">{{ row.durationMinutes }} 分钟</span></template></el-table-column>
          <el-table-column label="有效金额" width="105"><template #default="{ row }"><strong>{{ money(row.effectiveAmountCents) }}</strong></template></el-table-column>
          <el-table-column label="创建时间" width="160"><template #default="{ row }">{{ shanghaiTime(row.createdAt) }}</template></el-table-column>
          <el-table-column label="操作" width="62"><template #default="{ row }"><el-button link type="primary" @click="openOrder(row)">详情</el-button></template></el-table-column>
        </el-table>
        <div class="pagination-row"><span>共 {{ total }} 条</span><el-pagination v-model:current-page="query.page" :page-size="query.pageSize" :total="total" layout="prev, pager, next" @current-change="load" /></div>
      </section>
    </div>
  </PageDataState>

  <el-drawer v-model="drawerOpen" title="订单详情" size="520px"><template v-if="selected"><div class="drawer-title-row"><div><p class="eyebrow">ORDER DETAIL</p><h2>{{ selected.orderNo }}</h2></div><el-tag :type="tagType(selected.status)">{{ orderStatusLabel[selected.status] }}</el-tag></div><el-descriptions :column="2" border class="detail-descriptions"><el-descriptions-item label="所属景区">{{ scenicName(selected.scenicAreaId) }}</el-descriptions-item><el-descriptions-item label="车辆">{{ selected.vehicleNo }}</el-descriptions-item><el-descriptions-item label="用户">{{ selected.userMasked }}</el-descriptions-item><el-descriptions-item label="金额">{{ money(selected.effectiveAmountCents) }}</el-descriptions-item><el-descriptions-item label="开始时间">{{ shanghaiTime(selected.startAt) }}</el-descriptions-item><el-descriptions-item label="结束时间">{{ shanghaiTime(selected.endAt) }}</el-descriptions-item><el-descriptions-item label="里程">{{ selected.distanceKm.toFixed(2) }} km</el-descriptions-item><el-descriptions-item label="时长">{{ selected.durationMinutes }} 分钟</el-descriptions-item></el-descriptions><div class="subsection"><div class="subsection-head"><h3>内部备注</h3><span class="muted-text">仅管理员可见</span></div><el-timeline v-if="selected.notes?.length" class="notes-timeline"><el-timeline-item v-for="note in selected.notes" :key="note.id" :timestamp="`${note.createdBy} · ${shanghaiTime(note.createdAt)}`" type="primary">{{ note.content }}</el-timeline-item></el-timeline><el-empty v-else description="暂无内部备注" :image-size="72" /></div><div class="note-compose"><el-input v-model="noteText" type="textarea" :rows="3" maxlength="300" show-word-limit placeholder="追加一条内部备注，保存后不覆盖历史内容" /><el-button type="primary" :loading="savingNote" @click="saveNote">追加备注</el-button></div></template></el-drawer>
</template>
