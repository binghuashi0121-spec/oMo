<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '@/api';
import type { Vehicle, VehicleCommand } from '@/types/domain';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{ modelValue: boolean; vehicle: Vehicle | null }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; sent: [command: VehicleCommand] }>();
const submitting = ref(false);
const form = reactive({ commandKey: 'query_status', reason: '', simulateTimeout: false });
const options = [
  { value: 'query_status', label: '模拟查询车辆状态', risk: '低' },
  { value: 'sound_horn', label: '模拟鸣笛提示', risk: '低' },
  { value: 'safe_stop', label: '模拟安全停车', risk: '中' },
  { value: 'resume_trip', label: '模拟继续行程', risk: '中' },
];
const selected = computed(() => options.find((item) => item.value === form.commandKey));
watch(() => props.modelValue, (open) => { if (open) { form.commandKey = 'query_status'; form.reason = ''; form.simulateTimeout = false; } });

async function submit() {
  if (!props.vehicle || form.reason.trim().length < 4) { ElMessage.warning('请填写至少 4 个字的操作原因'); return; }
  await ElMessageBox.confirm(`仅生成模拟记录，不会向 ${props.vehicle.vehicleNo} 的 MQTT Broker 发布。确认继续？`, '模拟指令二次确认', { confirmButtonText: '确认模拟发送', cancelButtonText: '取消', type: 'warning' });
  submitting.value = true;
  try {
    const command = await api.sendVehicleCommand({ scenicAreaId: props.vehicle.scenicAreaId, vehicleId: props.vehicle.id, commandKey: form.commandKey, params: { simulateTimeout: form.simulateTimeout }, reason: form.reason.trim(), idempotencyKey: crypto.randomUUID() });
    emit('sent', command); emit('update:modelValue', false); ElMessage.success('模拟指令已进入回执队列');
  } finally { submitting.value = false; }
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="车辆控制中心（模拟）" width="560px" @update:model-value="emit('update:modelValue', $event)">
    <el-alert title="安全隔离已启用" description="第一期后台指令全部写入模拟记录，不连接 MQTT Broker，也不会改变真实车辆状态。" type="warning" :closable="false" show-icon><template #icon><AppIcon name="warning" /></template></el-alert>
    <div v-if="vehicle" class="command-target"><span>目标车辆</span><strong>{{ vehicle.vehicleNo }}</strong><small>{{ vehicle.scenicAreaId }}</small></div>
    <el-form label-position="top" class="dialog-form">
      <el-form-item label="白名单指令"><el-select v-model="form.commandKey" style="width: 100%"><el-option v-for="item in options" :key="item.value" :label="`${item.label} · 风险${item.risk}`" :value="item.value" /></el-select></el-form-item>
      <el-form-item label="操作原因（写入审计）"><el-input v-model="form.reason" type="textarea" :rows="3" maxlength="120" show-word-limit placeholder="例如：现场运营人员反馈车辆状态未刷新" /></el-form-item>
      <el-checkbox v-model="form.simulateTimeout">演示“回执超时”状态</el-checkbox>
    </el-form>
    <template #footer><el-button @click="emit('update:modelValue', false)">取消</el-button><el-button type="primary" :loading="submitting" @click="submit">模拟发送 · {{ selected?.label }}</el-button></template>
  </el-dialog>
</template>
