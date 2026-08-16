import { computed, onScopeDispose, ref } from 'vue';

export type RequestMode = 'initial' | 'manual' | 'poll';

export interface LatestRequestResult<T> {
  accepted: boolean;
  data?: T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '数据加载失败，请稍后重试';
}

export function useLatestRequest(staleAfterMs = 60_000) {
  const initialLoading = ref(false);
  const refreshing = ref(false);
  const hasData = ref(false);
  const error = ref('');
  const lastSuccessAt = ref('');
  const now = ref(Date.now());
  let sequence = 0;
  let disposed = false;
  const clock = window.setInterval(() => { now.value = Date.now(); }, 5_000);

  const isStale = computed(() => Boolean(
    hasData.value
    && lastSuccessAt.value
    && now.value - new Date(lastSuccessAt.value).getTime() >= staleAfterMs,
  ));

  async function run<T>(loader: () => Promise<T>, mode: RequestMode = 'manual'): Promise<LatestRequestResult<T>> {
    const requestId = ++sequence;
    const firstLoad = !hasData.value;
    if (firstLoad) initialLoading.value = true;
    else refreshing.value = true;
    if (mode !== 'poll') error.value = '';

    try {
      const data = await loader();
      if (disposed || requestId !== sequence) return { accepted: false };
      hasData.value = true;
      error.value = '';
      lastSuccessAt.value = new Date().toISOString();
      now.value = Date.now();
      return { accepted: true, data };
    } catch (cause) {
      if (disposed || requestId !== sequence) return { accepted: false };
      error.value = errorMessage(cause);
      return { accepted: true };
    } finally {
      if (!disposed && requestId === sequence) {
        initialLoading.value = false;
        refreshing.value = false;
      }
    }
  }

  function reset(): void {
    sequence += 1;
    initialLoading.value = false;
    refreshing.value = false;
    hasData.value = false;
    error.value = '';
    lastSuccessAt.value = '';
  }

  function invalidate(): void {
    sequence += 1;
    initialLoading.value = false;
    refreshing.value = false;
  }

  onScopeDispose(() => {
    disposed = true;
    sequence += 1;
    window.clearInterval(clock);
  });

  return {
    initialLoading,
    refreshing,
    hasData,
    error,
    lastSuccessAt,
    isStale,
    run,
    reset,
    invalidate,
  };
}
