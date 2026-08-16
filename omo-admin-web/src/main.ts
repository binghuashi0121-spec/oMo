import { createApp } from 'vue';
import { createPinia } from 'pinia';
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import './styles/main.css';
import './styles/optimizations.css';

const pinia = createPinia();
window.addEventListener('omo-admin-session-expired', () => {
  const auth = useAuthStore(pinia);
  const currentPath = router.currentRoute.value.fullPath;
  auth.expire();
  if (router.currentRoute.value.name !== 'login') router.replace({ name: 'login', query: { redirect: currentPath, expired: '1' } });
});

createApp(App).use(pinia).use(router).mount('#app');
