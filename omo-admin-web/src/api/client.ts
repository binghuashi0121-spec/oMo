import type { ApiEnvelope } from '@/types/domain';

const API_BASE = import.meta.env.VITE_ADMIN_API_BASE || '/api/admin/v1';
let csrfToken = '';
let scenicContext = localStorage.getItem('omo-admin-scenic-scope') || 'tianmashan';

export function setCsrfToken(value: string): void {
  csrfToken = value;
}

export function setScenicContext(value: string): void {
  scenicContext = value || 'all';
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  headers.set('accept', 'application/json');
  if (options.body) headers.set('content-type', 'application/json');
  headers.set('x-omo-scenic-area-id', scenicContext);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('x-csrf-token', csrfToken);

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !envelope || envelope.code !== 'OK') {
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('omo-admin-session-expired'));
    const error = new Error(envelope?.message || `请求失败（${response.status}）`) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = envelope?.code;
    throw error;
  }
  return envelope.data;
}

export function queryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
