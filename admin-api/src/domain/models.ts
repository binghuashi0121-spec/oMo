export type HealthLevel = 'healthy' | 'degraded' | 'critical';
export type VehicleStatus = 'available' | 'active' | 'charging' | 'offline' | 'fault';
export type OrderStatus = 'waiting_pickup' | 'active' | 'completed' | 'cancelled';
export type CommandStatus = 'pending' | 'sent' | 'acked' | 'failed' | 'timed_out';
export interface Coordinate { latitude: number; longitude: number }
export interface ScenicArea { id: string; name: string; shortName: string; status: 'active' | 'maintenance'; centerGcj02: Coordinate; zoom: number; routeGeoJson: Record<string, unknown>; isDemo?: boolean }
export interface Vehicle { id: string; scenicAreaId: string; vehicleNo: string; status: VehicleStatus; batteryPercent: number; heartbeatAt: string; positionWgs84: Coordinate; positionGcj02: Coordinate; activeOrderId?: string; speedKph: number; isDemo?: boolean }
export interface OrderNote { id: string; orderId: string; scenicAreaId: string; content: string; createdAt: string; createdBy: string }
export interface Order { id: string; scenicAreaId: string; orderNo: string; userMasked: string; vehicleId: string; vehicleNo: string; status: OrderStatus; startAt?: string; endAt?: string; createdAt: string; distanceKm: number; durationMinutes: number; originalAmountCents: number; effectiveAmountCents: number; noteCount: number; notes?: OrderNote[]; isDemo?: boolean }
export interface Adjustment { id: string; settlementId: string; scenicAreaId: string; amountCents: number; type: 'charge' | 'credit' | 'reversal'; reason: string; reversedAdjustmentId?: string; idempotencyKey: string; createdAt: string; createdBy: string }
export interface Settlement { id: string; scenicAreaId: string; orderId: string; orderNo: string; originalAmountCents: number; adjustmentAmountCents: number; effectiveAmountCents: number; paymentStatus: 'demo_paid' | 'demo_pending' | 'demo_refunded'; settledAt: string; adjustments?: Adjustment[]; isDemo?: boolean }
export interface AdminUserRecord { id: string; username: string; displayName: string; role: 'super_admin'; passwordHash: string; mustChangePassword: boolean; active: boolean; createdAt: string; updatedAt: string }
export interface AdminSessionRecord { id: string; userId: string; tokenHash: string; csrfToken: string; createdAt: string; lastSeenAt: string; absoluteExpiresAt: string; ip: string; userAgent: string }
export interface AuditRecord { id: string; actorId: string; action: string; targetType: string; targetId: string; scenicAreaId?: string; requestId: string; detail: Record<string, unknown>; createdAt: string }
export interface VehicleCommand { id: string; scenicAreaId: string; vehicleId: string; commandKey: string; params: Record<string, unknown>; reason: string; idempotencyKey: string; status: CommandStatus; createdAt: string; updatedAt: string; createdBy: string; simulated: true }
export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number }
