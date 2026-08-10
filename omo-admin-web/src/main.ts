import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import './styles/main.css';

const pinia = createPinia();
window.addEventListener('omo-admin-session-expired', () => {
  const auth = useAuthStore(pinia);
  const currentPath = router.currentRoute.value.fullPath;
  auth.expire();
  if (router.currentRoute.value.name !== 'login') router.replace({ name: 'login', query: { redirect: currentPath, expired: '1' } });
});

createApp(App).use(pinia).use(router).use(ElementPlus, { locale: zhCn }).mount('#app');
