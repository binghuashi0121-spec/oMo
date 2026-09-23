<script setup lang="ts">
import type { VehicleStatus } from '@/types/domain';
import { vehicleStatusLabel } from '@/utils/format';

const statuses: VehicleStatus[] = ['available', 'active', 'charging', 'offline', 'fault'];
</script>

<template>
  <div class="vehicle-legend" aria-label="车辆状态图例">
    <span v-for="status in statuses" :key="status"><i :class="`dot is-${status}`" />{{ vehicleStatusLabel[status] }}</span>
  </div>
</template>
