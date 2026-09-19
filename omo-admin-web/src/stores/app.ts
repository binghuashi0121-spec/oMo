import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '@/api';
import { setScenicContext } from '@/api/client';
import type { ScenicArea, SystemHealth } from '@/types/domain';

const STORAGE_KEY = 'omo-admin-scenic-scope';

export const useAppStore = defineStore('app', () => {
  const scenicAreas = ref<ScenicArea[]>([]);
  const selectedScenicAreaId = ref(localStorage.getItem(STORAGE_KEY) || 'tianmashan');
  setScenicContext(selectedScenicAreaId.value);
  const health = ref<SystemHealth | null>(null);
  const healthRefreshing = ref(false);
  let healthRequestId = 0;
  const selectedScenic = computed(() => scenicAreas.value.find((item) => item.id === selectedScenicAreaId.value));

  async function loadScenicAreas() {
    scenicAreas.value = await api.scenicAreas();
    if (selectedScenicAreaId.value !== 'all' && !selectedScenic.value) selectScenicArea(scenicAreas.value[0]?.id || 'all');
  }
  function selectScenicArea(id: string) { selectedScenicAreaId.value = id; localStorage.setItem(STORAGE_KEY, id); setScenicContext(id); }
  async function refreshHealth() {
    const requestId = ++healthRequestId;
    const scenicAreaId = selectedScenicAreaId.value;
    healthRefreshing.value = true;
    try {
      const result = await api.systemHealth(scenicAreaId);
      if (requestId === healthRequestId && scenicAreaId === selectedScenicAreaId.value) health.value = result;
      return result;
    } finally {
      if (requestId === healthRequestId) healthRefreshing.value = false;
    }
  }

  return { scenicAreas, selectedScenicAreaId, selectedScenic, health, healthRefreshing, loadScenicAreas, selectScenicArea, refreshHealth };
});
