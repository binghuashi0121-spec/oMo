import type {
  FinanceSummary,
  Order,
  OrderQuery,
  OverviewSummary,
  PageResult,
  ScenicArea,
  SessionInfo,
  Settlement,
  SettlementQuery,
  SystemHealth,
  Vehicle,
  VehicleCommand,
} from '@/types/domain';

export interface AdminApi {
  login(input: { username: string; password: string }): Promise<SessionInfo>;
  logout(): Promise<void>;
  me(): Promise<SessionInfo>;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<void>;
  overview(scenicAreaId?: string): Promise<OverviewSummary>;
  scenicAreas(): Promise<ScenicArea[]>;
  mapVehicles(scenicAreaId: string): Promise<Vehicle[]>;
  orders(query: OrderQuery): Promise<PageResult<Order>>;
  order(id: string): Promise<Order>;
  addOrderNote(id: string, content: string): Promise<Order>;
  financeSummary(scenicAreaId?: string): Promise<FinanceSummary>;
  settlements(query: SettlementQuery): Promise<PageResult<Settlement>>;
  settlement(id: string): Promise<Settlement>;
  adjustSettlement(id: string, input: { type: 'charge' | 'credit'; amountCents: number; reason: string; idempotencyKey: string }): Promise<Settlement>;
  reverseAdjustment(settlementId: string, adjustmentId: string, reason: string, idempotencyKey: string): Promise<Settlement>;
  systemHealth(scenicAreaId?: string): Promise<SystemHealth>;
  setMockHealthScenario?(level: 'healthy' | 'degraded' | 'critical'): Promise<SystemHealth>;
  sendVehicleCommand(input: {
    scenicAreaId: string;
    vehicleId: string;
    commandKey: string;
    params: Record<string, unknown>;
    reason: string;
    idempotencyKey: string;
  }): Promise<VehicleCommand>;
  vehicleCommands(scenicAreaId?: string): Promise<VehicleCommand[]>;
}
