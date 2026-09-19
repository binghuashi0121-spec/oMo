import { onMounted, onScopeDispose } from 'vue';

export function useVisiblePolling(callback: () => void | Promise<void>, intervalMs: number) {
  let timer: number | undefined;

  function tick() {
    if (document.visibilityState === 'visible') void callback();
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') void callback();
  }

  onMounted(() => {
    timer = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  onScopeDispose(() => {
    if (timer) window.clearInterval(timer);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  return { tick };
}
