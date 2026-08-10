<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { vehicleMarkerSvgDataUri, type VehicleMarkerStatus } from '@/icons/registry';
import type { ScenicArea, Vehicle } from '@/types/domain';

const props = defineProps<{ scenic: ScenicArea; vehicles: Vehicle[]; selectedVehicleId?: string }>();
const emit = defineEmits<{ select: [vehicle: Vehicle] }>();
const mapKey = import.meta.env.VITE_TENCENT_MAP_KEY || '';
const container = ref<HTMLElement>();
const loadError = ref('');
let map: any; let markerLayer: any; let lineLayer: any;

const routeCoordinates = computed(() => {
  const feature = props.scenic.routeGeoJson.features.find((item: any) => item.geometry?.type === 'LineString') as any;
  return (feature?.geometry?.coordinates || []) as number[][];
});
const bounds = computed(() => {
  const points = [...routeCoordinates.value, ...props.vehicles.map((item) => [item.positionGcj02.longitude, item.positionGcj02.latitude])];
  const xs = points.map((item) => item[0]); const ys = points.map((item) => item[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
});
function fallbackPoint(lon: number, lat: number) {
  const box = bounds.value; const pad = 9;
  const x = pad + ((lon - box.minX) / Math.max(box.maxX - box.minX, 0.00001)) * (100 - pad * 2);
  const y = 100 - pad - ((lat - box.minY) / Math.max(box.maxY - box.minY, 0.00001)) * (100 - pad * 2);
  return { x, y };
}
const fallbackPath = computed(() => routeCoordinates.value.map(([lon, lat]) => { const p = fallbackPoint(lon, lat); return `${p.x},${p.y}`; }).join(' '));

function loadSdk(): Promise<void> {
  if (window.TMap) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const callback = `omoTMapReady_${Date.now()}`;
    (window as any)[callback] = () => { delete (window as any)[callback]; resolve(); };
    const script = document.createElement('script');
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(mapKey)}&callback=${callback}`;
    script.onerror = () => reject(new Error('腾讯地图 SDK 加载失败'));
    document.head.appendChild(script);
  });
}

function renderLayers() {
  if (!map || !window.TMap) return;
  markerLayer?.setMap(null); lineLayer?.setMap(null);
  const TMap = window.TMap;
  lineLayer = new TMap.MultiPolyline({
    map,
    styles: { route: new TMap.PolylineStyle({ color: '#EF5B24', width: 7, borderWidth: 2, borderColor: '#ffffff', lineCap: 'round' }) },
    geometries: [{ id: 'route', styleId: 'route', paths: routeCoordinates.value.map(([lon, lat]) => new TMap.LatLng(lat, lon)) }],
  });
  markerLayer = new TMap.MultiMarker({
    map,
    styles: {
      available: new TMap.MarkerStyle({ width: 40, height: 40, anchor: { x: 20, y: 20 }, src: vehicleMarkerSvgDataUri('available') }),
      active: new TMap.MarkerStyle({ width: 40, height: 40, anchor: { x: 20, y: 20 }, src: vehicleMarkerSvgDataUri('active') }),
      charging: new TMap.MarkerStyle({ width: 40, height: 40, anchor: { x: 20, y: 20 }, src: vehicleMarkerSvgDataUri('charging') }),
      offline: new TMap.MarkerStyle({ width: 40, height: 40, anchor: { x: 20, y: 20 }, src: vehicleMarkerSvgDataUri('offline') }),
      fault: new TMap.MarkerStyle({ width: 40, height: 40, anchor: { x: 20, y: 20 }, src: vehicleMarkerSvgDataUri('fault') }),
      selected: new TMap.MarkerStyle({ width: 48, height: 48, anchor: { x: 24, y: 24 }, src: vehicleMarkerSvgDataUri('available', true) }),
    },
    geometries: props.vehicles.map((vehicle) => ({ id: vehicle.id, styleId: vehicle.id === props.selectedVehicleId ? 'selected' : vehicle.status as VehicleMarkerStatus, position: new TMap.LatLng(vehicle.positionGcj02.latitude, vehicle.positionGcj02.longitude), properties: { vehicleId: vehicle.id } })),
  });
  markerLayer.on('click', (event: any) => { const found = props.vehicles.find((item) => item.id === event.geometry?.id); if (found) emit('select', found); });
}

async function initialize() {
  if (!mapKey || !container.value) return;
  try {
    await loadSdk(); await nextTick(); const TMap = window.TMap;
    map = new TMap.Map(container.value, { center: new TMap.LatLng(props.scenic.centerGcj02.latitude, props.scenic.centerGcj02.longitude), zoom: props.scenic.zoom, pitch: 0, rotation: 0 });
    renderLayers();
  } catch (error) { loadError.value = error instanceof Error ? error.message : '地图加载失败'; }
}

watch(() => [props.scenic.id, props.vehicles, props.selectedVehicleId], () => {
  if (map && window.TMap) { map.setCenter(new window.TMap.LatLng(props.scenic.centerGcj02.latitude, props.scenic.centerGcj02.longitude)); map.setZoom(props.scenic.zoom); renderLayers(); }
}, { deep: true });
onMounted(initialize);
onBeforeUnmount(() => { markerLayer?.setMap(null); lineLayer?.setMap(null); map?.destroy?.(); });
</script>

<template>
  <div class="map-canvas">
    <div v-if="mapKey && !loadError" ref="container" class="map-sdk" />
    <div v-else class="map-fallback">
      <div class="fallback-grid" />
      <svg class="fallback-route" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline :points="fallbackPath" fill="none" stroke="#ef5b24" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" /></svg>
      <button v-for="vehicle in vehicles" :key="vehicle.id" class="fallback-marker" :class="[`is-${vehicle.status}`, { selected: vehicle.id === selectedVehicleId }]" :style="{ left: `${fallbackPoint(vehicle.positionGcj02.longitude, vehicle.positionGcj02.latitude).x}%`, top: `${fallbackPoint(vehicle.positionGcj02.longitude, vehicle.positionGcj02.latitude).y}%` }" :aria-label="`查看车辆 ${vehicle.vehicleNo}`" @click="emit('select', vehicle)"><AppIcon name="vehicle" /><span class="fallback-marker-label">{{ vehicle.vehicleNo.replace('OMO-', '') }}</span></button>
      <div class="map-key-notice"><AppIcon name="info" /><div><strong>{{ loadError || '地图安全降级模式' }}</strong><span>{{ loadError ? '请检查网络或腾讯地图 Key 配置。' : '配置 VITE_TENCENT_MAP_KEY 后启用腾讯地图；车辆与路线仍可操作。' }}</span></div></div>
    </div>
    <div class="map-watermark">GCJ-02 展示坐标 · {{ scenic.shortName }}</div>
  </div>
</template>
