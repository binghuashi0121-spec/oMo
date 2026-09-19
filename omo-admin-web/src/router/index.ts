import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true, title: '登录' } },
    {
      path: '/', component: () => import('@/layouts/AdminLayout.vue'),
      children: [
        { path: '', redirect: '/overview' },
        { path: 'overview', name: 'overview', component: () => import('@/views/OverviewView.vue'), meta: { title: '运营总览' } },
        { path: 'map', name: 'map', component: () => import('@/views/MapView.vue'), meta: { title: '车辆地图' } },
        { path: 'orders', name: 'orders', component: () => import('@/views/OrdersView.vue'), meta: { title: '订单管理' } },
        { path: 'finance', name: 'finance', component: () => import('@/views/FinanceView.vue'), meta: { title: '财务中心' } },
        { path: 'system', name: 'system', component: () => import('@/views/SystemView.vue'), meta: { title: '系统诊断' } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/overview' },
  ],
});

router.beforeEach(async (to) => {
  document.title = `${String(to.meta.title || '运营管理台')} · oMo`;
  const auth = useAuthStore();
  if (!auth.initialized) await auth.restore();
  if (!to.meta.public && !auth.user) return { name: 'login', query: { redirect: to.fullPath } };
  if (auth.user?.mustChangePassword && to.name !== 'login') return { name: 'login', query: { redirect: to.fullPath, firstLogin: '1' } };
  if (to.name === 'login' && auth.user && !auth.user.mustChangePassword) return { name: 'overview' };
  return true;
});

export default router;
