import type { AdminApi } from './contract';
import { queryString, request, setCsrfToken } from './client';
import type { FinanceSummary, Order, PageResult, ScenicArea, SessionInfo, Settlement, SystemHealth, Vehicle, VehicleCommand } from '@/types/domain';

export const realApi: AdminApi = {
  async login(input) { const data = await request<SessionInfo>('/auth/login', { method: 'POST', body: JSON.stringify(input) }); setCsrfToken(data.csrfToken); return data; },
  async logout() { await request<void>('/auth/logout', { method: 'POST' }); setCsrfToken(''); },
  async me() { const data = await request<SessionInfo>('/auth/me'); setCsrfToken(data.csrfToken); return data; },
  async changePassword(input) { await request<void>('/auth/password', { method: 'POST', body: JSON.stringify(input) }); },
  scenicAreas: () => request<ScenicArea[]>('/scenic-areas'),
  mapVehicles: (scenicAreaId) => request<Vehicle[]>(`/map/vehicles${queryString({ scenicAreaId })}`),
  orders: (query) => request<PageResult<Order>>(`/orders${queryString(query)}`),
  order: (id) => request<Order>(`/orders/${encodeURIComponent(id)}`),
  addOrderNote: (id, content) => request<Order>(`/orders/${encodeURIComponent(id)}/notes`, { method: 'POST', body: JSON.stringify({ content }) }),
  financeSummary: (scenicAreaId) => request<FinanceSummary>(`/finance/summary${queryString({ scenicAreaId })}`),
  settlements: (query) => request<PageResult<Settlement>>(`/finance/settlements${queryString(query)}`),
  settlement: (id) => request<Settlement>(`/finance/settlements/${encodeURIComponent(id)}`),
  adjustSettlement: (id, input) => request<Settlement>(`/finance/settlements/${encodeURIComponent(id)}/adjustments`, { method: 'POST', body: JSON.stringify(input) }),
  reverseAdjustment: (settlementId, adjustmentId, reason, idempotencyKey) => request<Settlement>(`/finance/settlements/${encodeURIComponent(settlementId)}/adjustments/${encodeURIComponent(adjustmentId)}/reverse`, { method: 'POST', body: JSON.stringify({ reason, idempotencyKey }) }),
  systemHealth: (scenicAreaId) => request<SystemHealth>(`/system/health${queryString({ scenicAreaId })}`),
  sendVehicleCommand: (input) => request<VehicleCommand>('/vehicle-commands', { method: 'POST', body: JSON.stringify(input) }),
  vehicleCommands: (scenicAreaId) => request<VehicleCommand[]>(`/vehicle-commands${queryString({ scenicAreaId })}`),
};
