<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { isMockMode } from '@/api';
import AppIcon from '@/components/AppIcon.vue';
import brandLogo from '@/assets/brand/oMo_logo.png';

const router = useRouter(); const route = useRoute(); const auth = useAuthStore(); const loading = ref(false);
const form = reactive({ username: isMockMode ? 'admin' : '', password: '' });
const forcePasswordOpen = ref(false); const passwordLoading = ref(false); const passwordForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' });
watch(() => auth.user?.mustChangePassword, (required) => { forcePasswordOpen.value = Boolean(required); }, { immediate: true });
async function submit() {
  if (!form.username || !form.password) { ElMessage.warning('请输入账号和密码'); return; }
  loading.value = true;
  try { await auth.login(form.username, form.password); if (auth.user?.mustChangePassword) { passwordForm.currentPassword = form.password; form.password = ''; return; } await router.replace(String(route.query.redirect || '/overview')); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '登录失败'); }
  finally { loading.value = false; }
}
async function changePassword() { if (!passwordForm.currentPassword) { ElMessage.warning('请输入当前密码'); return; } if (passwordForm.newPassword.length < 12 || !/[A-Z]/.test(passwordForm.newPassword) || !/[a-z]/.test(passwordForm.newPassword) || !/\d/.test(passwordForm.newPassword)) { ElMessage.warning('新密码至少 12 位，并包含大小写字母和数字'); return; } if (passwordForm.newPassword !== passwordForm.confirmPassword) { ElMessage.warning('两次输入的新密码不一致'); return; } passwordLoading.value = true; try { await auth.changePassword(passwordForm.currentPassword, passwordForm.newPassword); Object.assign(passwordForm, { currentPassword: '', newPassword: '', confirmPassword: '' }); forcePasswordOpen.value = false; ElMessage.success('密码已修改，请妥善保管'); await router.replace(String(route.query.redirect || '/overview')); } catch (error) { ElMessage.error(error instanceof Error ? error.message : '密码修改失败'); } finally { passwordLoading.value = false; } }
async function leaveFirstLogin() { await auth.logout(); Object.assign(passwordForm, { currentPassword: '', newPassword: '', confirmPassword: '' }); forcePasswordOpen.value = false; }
</script>

<template>
  <main class="login-page">
    <section class="login-visual">
      <div class="login-brand"><img :src="brandLogo" alt="oMo共享车" width="210" height="74" /><span>运营管理系统</span></div>
      <div class="login-message"><h1>运营管理系统</h1><p>车辆地图 · 订单管理 · 财务中心 · 系统诊断</p></div>
      <div class="login-signal"><span><i class="pulse" />车辆在线监测</span><span>多景区运营</span><span>安全审计</span></div>
    </section>
    <section class="login-panel">
      <div class="login-form-wrap">
        <h2>管理员登录</h2><p class="login-subtitle">请输入超级管理员账号</p>
        <el-alert v-if="route.query.expired === '1'" title="会话已过期" description="为保护管理数据，请重新登录。" type="info" :closable="false" show-icon><template #icon><AppIcon name="info" /></template></el-alert>
        <el-alert v-if="isMockMode" title="当前为 Mock 交互原型" description="账号填 admin，密码输入任意 6 位以上内容。不会连接生产数据。" type="warning" :closable="false" show-icon><template #icon><AppIcon name="warning" /></template></el-alert>
        <el-form label-position="top" size="large" @submit.prevent="submit">
          <el-form-item label="管理员账号"><el-input v-model="form.username" autocomplete="username" placeholder="请输入管理员账号"><template #prefix><AppIcon name="user" /></template></el-input></el-form-item>
          <el-form-item label="密码"><el-input v-model="form.password" type="password" autocomplete="current-password" placeholder="请输入密码" show-password @keyup.enter="submit"><template #prefix><AppIcon name="lock" /></template></el-input></el-form-item>
          <el-button type="primary" size="large" class="login-submit" :loading="loading" @click="submit">安全登录</el-button>
        </el-form>
        <div class="login-security"><span>HttpOnly Cookie</span><span>8 小时会话</span><span>登录限频</span></div>
      </div>
      <footer>oMo 运营管理系统 · 桌面端优先</footer>
    </section>
  </main>
  <el-dialog v-model="forcePasswordOpen" title="首次登录必须修改密码" width="520px" :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false">
    <el-alert title="初始化密码仅可用于首次登录" description="新密码至少 12 位，并同时包含大写字母、小写字母和数字。修改完成前无法访问业务数据。" type="warning" :closable="false" show-icon><template #icon><AppIcon name="warning" /></template></el-alert>
    <el-form label-position="top" class="dialog-form">
      <el-form-item label="当前密码"><el-input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" show-password /></el-form-item>
      <el-form-item label="新密码"><el-input v-model="passwordForm.newPassword" type="password" autocomplete="new-password" show-password /></el-form-item>
      <el-form-item label="再次输入新密码"><el-input v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" show-password @keyup.enter="changePassword" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="leaveFirstLogin">退出登录</el-button><el-button type="primary" :loading="passwordLoading" @click="changePassword">修改密码并进入系统</el-button></template>
  </el-dialog>
</template>
