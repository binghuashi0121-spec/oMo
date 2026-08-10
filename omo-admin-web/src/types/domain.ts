import type { FeatureCollection } from 'geojson';

export type HealthLevel = 'healthy' | 'degraded' | 'critical';
export type VehicleStatus = 'available' | 'active' | 'charging' | 'offline' | 'fault';
export type OrderStatus = 'waiting_pickup' | 'active' | 'completed' | 'cancelled';
export type CommandStatus = 'pending' | 'sent' | 'acked' | 'failed' | 'timed_out';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface ScenicArea {
  id: string;
  name: string;
  shortName: string;
  status: 'active' | 'maintenance';
  centerGcj02: Coordinate;
  zoom: number;
  routeGeoJson: FeatureCollection;
  isDemo?: boolean;
}

export interface Vehicle {
  id: string;
  scenicAreaId: string;
  vehicleNo: string;
  status: VehicleStatus;
  batteryPercent: number;
  heartbeatAt: string;
  positionWgs84: Coordinate;
  positionGcj02: Coordinate;
  activeOrderId?: string;
  speedKph: number;
  isDemo?: boolean;
}

export interface OrderNote {
  id: string;
  orderId: string;
  content: string;
  createdAt: string;
  createdBy: string;
}

export interface Order {
  id: string;
  scenicAreaId: string;
  orderNo: string;
  userMasked: string;
  vehicleId: string;
  vehicleNo: string;
  status: OrderStatus;
  startAt?: string;
  endAt?: string;
  createdAt: string;
  distanceKm: number;
  durationMinutes: number;
  originalAmountCents: number;
  effectiveAmountCents: number;
  noteCount: number;
  notes?: OrderNote[];
  isDemo?: boolean;
}

export interface FinancialAdjustment {
  id: string;
  settlementId: string;
  scenicAreaId: string;
  amountCents: number;
  type: 'charge' | 'credit' | 'reversal';
  reason: string;
  reversedAdjustmentId?: string;
  idempotencyKey: string;
  createdAt: string;
  createdBy: string;
}

export interface Settlement {
  id: string;
  scenicAreaId: string;
  orderId: string;
  orderNo: string;
  originalAmountCents: number;
  adjustmentAmountCents: number;
  effectiveAmountCents: number;
  paymentStatus: 'demo_paid' | 'demo_pending' | 'demo_refunded';
  settledAt: string;
  adjustments?: FinancialAdjustment[];
  isDemo?: boolean;
}

export interface FinanceSummary {
  originalAmountCents: number;
  adjustmentAmountCents: number;
  effectiveAmountCents: number;
  settlementCount: number;
  trend: Array<{ date: string; amountCents: number }>;
}

export interface HealthComponent {
  key: string;
  name: string;
  level: HealthLevel;
  message: string;
  checkedAt: string;
  latencyMs?: number;
}

export interface SystemHealth {
  level: HealthLevel;
  summary: string;
  checkedAt: string;
  dataFreshnessAt: string;
  components: HealthComponent[];
  incidents: Array<{ id: string; title: string; level: HealthLevel; occurredAt: string; detail: string }>;
}

export interface VehicleCommand {
  id: string;
  scenicAreaId: string;
  vehicleId: string;
  commandKey: string;
  params: Record<string, unknown>;
  reason: string;
  idempotencyKey: string;
  status: CommandStatus;
  createdAt: string;
  updatedAt: string;
  simulated: true;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: 'super_admin';
  mustChangePassword: boolean;
}

export interface SessionInfo {
  user: AdminUser;
  csrfToken: string;
  expiresAt: string;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrderQuery {
  scenicAreaId?: string;
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface SettlementQuery {
  scenicAreaId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface ApiEnvelope<T> {
  code: string;
  message: string;
  data: T;
  requestId: string;
}
