import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { AdminUser } from '@/types/domain';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AdminUser | null>(null);
  const initialized = ref(false);

  async function restore(): Promise<boolean> {
    try { user.value = (await api.me()).user; return true; }
    catch { user.value = null; return false; }
    finally { initialized.value = true; }
  }
  async function login(username: string, password: string) { const session = await api.login({ username, password }); user.value = session.user; }
  async function changePassword(currentPassword: string, newPassword: string) { await api.changePassword({ currentPassword, newPassword }); if (user.value) user.value.mustChangePassword = false; }
  async function logout() { try { await api.logout(); } finally { user.value = null; } }
  function expire() { user.value = null; initialized.value = true; }

  return { user, initialized, restore, login, changePassword, logout, expire };
});
