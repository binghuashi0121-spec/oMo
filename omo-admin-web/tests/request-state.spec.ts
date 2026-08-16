import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLatestRequest } from '../src/composables/useLatestRequest';
import { useVisiblePolling } from '../src/composables/useVisiblePolling';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('latest request state', () => {
  it('rejects an older response after a newer request has completed', async () => {
    const first = deferred<string>();
    let state!: ReturnType<typeof useLatestRequest>;
    const wrapper = mount(defineComponent({ setup() { state = useLatestRequest(); return () => null; } }));

    const oldRequest = state.run(() => first.promise);
    const latestRequest = state.run(async () => 'lakeside-demo');
    await expect(latestRequest).resolves.toEqual({ accepted: true, data: 'lakeside-demo' });
    first.resolve('tianmashan');
    await expect(oldRequest).resolves.toEqual({ accepted: false });
    wrapper.unmount();
  });

  it('keeps successful data available and reports refresh errors', async () => {
    let state!: ReturnType<typeof useLatestRequest>;
    const wrapper = mount(defineComponent({ setup() { state = useLatestRequest(); return () => null; } }));
    await state.run(async () => ['vehicle']);
    await state.run(async () => { throw new Error('network unavailable'); }, 'poll');
    expect(state.hasData.value).toBe(true);
    expect(state.error.value).toBe('network unavailable');
    expect(state.initialLoading.value).toBe(false);
    wrapper.unmount();
  });

  it('marks successful data stale after the configured threshold', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T00:00:00Z'));
    let state!: ReturnType<typeof useLatestRequest>;
    const wrapper = mount(defineComponent({ setup() { state = useLatestRequest(5_000); return () => null; } }));
    await state.run(async () => 'ready');
    expect(state.isStale.value).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.isStale.value).toBe(true);
    wrapper.unmount();
  });
});

describe('visible polling', () => {
  it('pauses while hidden and refreshes immediately when visible again', async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const callback = vi.fn();
    const wrapper = mount(defineComponent({ setup() { useVisiblePolling(callback, 15_000); return () => null; } }));

    await vi.advanceTimersByTimeAsync(15_000);
    expect(callback).toHaveBeenCalledTimes(1);
    visibility = 'hidden';
    await vi.advanceTimersByTimeAsync(15_000);
    expect(callback).toHaveBeenCalledTimes(1);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callback).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
