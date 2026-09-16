import type { AdminApi } from './contract';
import type { FeatureCollection } from 'geojson';
import type {
  FinancialAdjustment,
  HealthLevel,
  Order,
  ScenicArea,
  Settlement,
  SystemHealth,
  Vehicle,
  VehicleCommand,
} from '@/types/domain';

const nowIso = (offsetMinutes = 0) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const pause = (ms = 140) => new Promise((resolve) => setTimeout(resolve, ms));

const tianmaRoute = [
  [112.94658, 28.17072], [112.94662, 28.17068], [112.94668, 28.17062], [112.94675, 28.17055],
  [112.94684, 28.17047], [112.94695, 28.17040], [112.94706, 28.17034], [112.94718, 28.17030],
  [112.94730, 28.17027], [112.94742, 28.17025], [112.94753, 28.17024], [112.94764, 28.17025],
];
const lakeRoute = [
  [112.9871, 28.2012], [112.9878, 28.2016], [112.9887, 28.2018], [112.9895, 28.2015],
  [112.9898, 28.2009], [112.9893, 28.2003], [112.9884, 28.2001], [112.9875, 28.2005], [112.9871, 28.2012],
];

function routeFeature(coordinates: number[][]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { name: '运营路线' }, geometry: { type: 'LineString', coordinates } }],
  };
}

const scenicAreas: ScenicArea[] = [
  {
    id: 'tianmashan', name: '天马山景区', shortName: '天马山', status: 'active',
    centerGcj02: { longitude: 112.9471, latitude: 28.17045 }, zoom: 17,
    routeGeoJson: routeFeature(tianmaRoute),
  },
  {
    id: 'lakeside-demo', name: '湖畔示范景区', shortName: '湖畔示范', status: 'active', isDemo: true,
    centerGcj02: { longitude: 112.9884, latitude: 28.2010 }, zoom: 16,
    routeGeoJson: routeFeature(lakeRoute),
  },
];

const vehicles: Vehicle[] = [
  { id: 'veh-0008', scenicAreaId: 'tianmashan', vehicleNo: 'OMO-0008', status: 'active', batteryPercent: 76, heartbeatAt: nowIso(-0.2), positionWgs84: { longitude: 112.94123, latitude: 28.17361 }, positionGcj02: { longitude: 112.94684, latitude: 28.17047 }, activeOrderId: 'trip-24081201', speedKph: 4.2 },
  { id: 'veh-0012', scenicAreaId: 'tianmashan', vehicleNo: 'OMO-0012', status: 'available', batteryPercent: 92, heartbeatAt: nowIso(-0.4), positionWgs84: { longitude: 112.94170, latitude: 28.17314 }, positionGcj02: { longitude: 112.94730, latitude: 28.17027 }, speedKph: 0 },
  { id: 'veh-0016', scenicAreaId: 'tianmashan', vehicleNo: 'OMO-0016', status: 'charging', batteryPercent: 34, heartbeatAt: nowIso(-1.2), positionWgs84: { longitude: 112.94112, latitude: 28.17384 }, positionGcj02: { longitude: 112.94658, latitude: 28.17072 }, speedKph: 0 },
  { id: 'veh-0019', scenicAreaId: 'tianmashan', vehicleNo: 'OMO-0019', status: 'offline', batteryPercent: 18, heartbeatAt: nowIso(-24), positionWgs84: { longitude: 112.94146, latitude: 28.17329 }, positionGcj02: { longitude: 112.94706, latitude: 28.17034 }, speedKph: 0 },
  { id: 'veh-demo-01', scenicAreaId: 'lakeside-demo', vehicleNo: 'DEMO-01', status: 'available', batteryPercent: 88, heartbeatAt: nowIso(-0.1), positionWgs84: { longitude: 112.9817, latitude: 28.2042 }, positionGcj02: { longitude: 112.9878, latitude: 28.2016 }, speedKph: 0, isDemo: true },
  { id: 'veh-demo-02', scenicAreaId: 'lakeside-demo', vehicleNo: 'DEMO-02', status: 'fault', batteryPercent: 43, heartbeatAt: nowIso(-8), positionWgs84: { longitude: 112.9834, latitude: 28.2034 }, positionGcj02: { longitude: 112.9895, latitude: 28.2015 }, speedKph: 0, isDemo: true },
];

const orders: Order[] = [
  { id: 'trip-24081201', scenicAreaId: 'tianmashan', orderNo: 'OM202608100001', userMasked: '138****2068', vehicleId: 'veh-0008', vehicleNo: 'OMO-0008', status: 'active', startAt: nowIso(-38), createdAt: nowIso(-44), distanceKm: 2.14, durationMinutes: 38, originalAmountCents: 2540, effectiveAmountCents: 2540, noteCount: 0 },
  { id: 'trip-24081198', scenicAreaId: 'tianmashan', orderNo: 'OM202608100002', userMasked: '186****7721', vehicleId: 'veh-0012', vehicleNo: 'OMO-0012', status: 'completed', startAt: nowIso(-172), endAt: nowIso(-126), createdAt: nowIso(-180), distanceKm: 3.45, durationMinutes: 46, originalAmountCents: 3275, effectiveAmountCents: 3075, noteCount: 1, notes: [{ id: 'note-1', orderId: 'trip-24081198', content: '游客反馈停车计时存在 2 分钟误差，已核对。', createdAt: nowIso(-110), createdBy: '超级管理员' }] },
  { id: 'trip-24081190', scenicAreaId: 'tianmashan', orderNo: 'OM202608090018', userMasked: '151****3902', vehicleId: 'veh-0016', vehicleNo: 'OMO-0016', status: 'completed', startAt: nowIso(-1180), endAt: nowIso(-1110), createdAt: nowIso(-1190), distanceKm: 5.26, durationMinutes: 70, originalAmountCents: 4730, effectiveAmountCents: 4730, noteCount: 0 },
  { id: 'trip-demo-01', scenicAreaId: 'lakeside-demo', orderNo: 'DEMO202608001', userMasked: '139****0001', vehicleId: 'veh-demo-01', vehicleNo: 'DEMO-01', status: 'completed', startAt: nowIso(-290), endAt: nowIso(-240), createdAt: nowIso(-300), distanceKm: 2.8, durationMinutes: 50, originalAmountCents: 2900, effectiveAmountCents: 2900, noteCount: 0, isDemo: true },
  { id: 'trip-demo-02', scenicAreaId: 'lakeside-demo', orderNo: 'DEMO202608002', userMasked: '137****0002', vehicleId: 'veh-demo-02', vehicleNo: 'DEMO-02', status: 'cancelled', createdAt: nowIso(-90), distanceKm: 0, durationMinutes: 0, originalAmountCents: 0, effectiveAmountCents: 0, noteCount: 0, isDemo: true },
];

const adjustments: FinancialAdjustment[] = [
  { id: 'adj-1', settlementId: 'settle-1', scenicAreaId: 'tianmashan', type: 'credit', amountCents: -200, reason: '停车计时误差补偿', idempotencyKey: 'seed-adjustment-1', createdAt: nowIso(-108), createdBy: '超级管理员' },
];
const settlements: Settlement[] = [
  { id: 'settle-1', scenicAreaId: 'tianmashan', orderId: 'trip-24081198', orderNo: 'OM202608100002', originalAmountCents: 3275, adjustmentAmountCents: -200, effectiveAmountCents: 3075, paymentStatus: 'demo_paid', settledAt: nowIso(-125), adjustments: [adjustments[0]] },
  { id: 'settle-2', scenicAreaId: 'tianmashan', orderId: 'trip-24081190', orderNo: 'OM202608090018', originalAmountCents: 4730, adjustmentAmountCents: 0, effectiveAmountCents: 4730, paymentStatus: 'demo_paid', settledAt: nowIso(-1108), adjustments: [] },
  { id: 'settle-demo-1', scenicAreaId: 'lakeside-demo', orderId: 'trip-demo-01', orderNo: 'DEMO202608001', originalAmountCents: 2900, adjustmentAmountCents: 0, effectiveAmountCents: 2900, paymentStatus: 'demo_paid', settledAt: nowIso(-239), adjustments: [], isDemo: true },
];

let healthScenario: HealthLevel = 'degraded';
const commands: VehicleCommand[] = [];

function health(level: HealthLevel): SystemHealth {
  const checkedAt = nowIso();
  const base = [
    { key: 'admin-api', name: 'Admin API', level: 'healthy' as HealthLevel, message: '响应正常', checkedAt, latencyMs: 42 },
    { key: 'cloudbase', name: 'CloudBase 数据库', level: 'healthy' as HealthLevel, message: '读写探针正常', checkedAt, latencyMs: 86 },
    { key: 'mqtt', name: 'MQTT 网关', level: 'healthy' as HealthLevel, message: '连接正常', checkedAt, latencyMs: 32 },
    { key: 'heartbeat', name: '车辆心跳', level: 'healthy' as HealthLevel, message: '5 / 6 台车辆心跳正常', checkedAt },
    { key: 'commands', name: '指令回执', level: 'healthy' as HealthLevel, message: '近 30 分钟无失败', checkedAt },
  ];
  if (level === 'degraded') {
    base[2] = { ...base[2], level: 'degraded', message: 'Broker 已断开，HTTP 仍可访问' };
    base[3] = { ...base[3], level: 'degraded', message: '1 台车辆超过 5 分钟未上报' };
  }
  if (level === 'critical') {
    base[1] = { ...base[1], level: 'critical', message: '数据库探针连续失败' };
    base[2] = { ...base[2], level: 'critical', message: 'Broker 已断开' };
    base[4] = { ...base[4], level: 'degraded', message: '模拟指令超时率升高' };
  }
  return {
    level,
    summary: level === 'healthy' ? '全部核心服务运行正常' : level === 'degraded' ? '系统可用，但存在需要关注的异常' : '核心服务故障，请立即处理',
    checkedAt,
    dataFreshnessAt: nowIso(-0.3),
    components: base,
    incidents: level === 'healthy' ? [] : [{ id: `incident-${level}`, title: level === 'critical' ? '数据库与 MQTT 服务异常' : 'MQTT 连接中断', level, occurredAt: nowIso(-12), detail: '这是第一期原型的异常演示数据，不代表生产环境状态。' }],
  };
}

function scoped<T extends { scenicAreaId: string }>(items: T[], scenicAreaId?: string): T[] {
  return !scenicAreaId || scenicAreaId === 'all' ? items : items.filter((item) => item.scenicAreaId === scenicAreaId);
}

export const mockApi: AdminApi = {
  async login({ username, password }) {
    await pause();
    if (username.trim() !== 'admin' || password.length < 6) throw new Error('演示模式：请输入 admin 和至少 6 位密码');
    sessionStorage.setItem('omo-admin-mock-session', 'active');
    return { user: { id: 'admin-demo', username: 'admin', displayName: '超级管理员', role: 'super_admin', mustChangePassword: false }, csrfToken: 'mock-csrf-token', expiresAt: nowIso(480) };
  },
  async logout() { sessionStorage.removeItem('omo-admin-mock-session'); },
  async me() {
    if (sessionStorage.getItem('omo-admin-mock-session') !== 'active') throw new Error('未登录');
    return { user: { id: 'admin-demo', username: 'admin', displayName: '超级管理员', role: 'super_admin', mustChangePassword: false }, csrfToken: 'mock-csrf-token', expiresAt: nowIso(480) };
  },
  async changePassword() { await pause(); },
  async overview(scenicAreaId) {
    await pause();
    const scopedVehicles = scoped(vehicles, scenicAreaId);
    const scopedOrders = scoped(orders, scenicAreaId);
    const scopedSettlements = scoped(settlements, scenicAreaId);
    const systemHealth = health(healthScenario);
    const shanghaiDate = (value: string | number | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
    const today = shanghaiDate(Date.now());
    const todaySettlements = scopedSettlements.filter((item) => shanghaiDate(item.settledAt) === today);
    return {
      updatedAt: nowIso(),
      scenicAreaId: scenicAreaId || 'all',
      vehicles: {
        total: scopedVehicles.length,
        available: scopedVehicles.filter((item) => item.status === 'available').length,
        active: scopedVehicles.filter((item) => item.status === 'active').length,
        charging: scopedVehicles.filter((item) => item.status === 'charging').length,
        offline: scopedVehicles.filter((item) => item.status === 'offline').length,
        fault: scopedVehicles.filter((item) => item.status === 'fault').length,
      },
      orders: {
        waitingPickup: scopedOrders.filter((item) => item.status === 'waiting_pickup').length,
        active: scopedOrders.filter((item) => item.status === 'active').length,
        completedToday: scopedOrders.filter((item) => item.status === 'completed' && shanghaiDate(item.endAt || item.createdAt) === today).length,
        cancelledToday: scopedOrders.filter((item) => item.status === 'cancelled' && shanghaiDate(item.endAt || item.createdAt) === today).length,
      },
      finance: {
        settlementCountToday: todaySettlements.length,
        effectiveAmountCentsToday: todaySettlements.reduce((sum, item) => sum + item.effectiveAmountCents, 0),
      },
      health: { level: systemHealth.level, incidentCount: systemHealth.incidents.length },
      recentOrders: structuredClone(scopedOrders.slice(0, 5)),
      activeVehicles: structuredClone(scopedVehicles.filter((item) => item.status === 'active').slice(0, 4)),
    };
  },
  async scenicAreas() { await pause(); return structuredClone(scenicAreas); },
  async mapVehicles(scenicAreaId) {
    const configuredDelay = import.meta.env.MODE === 'test' ? Number(sessionStorage.getItem(`omo-admin-test-map-delay-${scenicAreaId}`) || 0) : 0;
    await pause(configuredDelay || 140);
    if (import.meta.env.MODE === 'test' && sessionStorage.getItem('omo-admin-test-fail-map-once') === '1') {
      sessionStorage.removeItem('omo-admin-test-fail-map-once');
      throw new Error('模拟车辆数据网络异常');
    }
    return structuredClone(scoped(vehicles, scenicAreaId));
  },
  async orders(query) {
    await pause();
    const page = query.page || 1; const pageSize = query.pageSize || 20;
    let items = scoped(orders, query.scenicAreaId);
    if (query.status) items = items.filter((item) => item.status === query.status);
    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();
      items = items.filter((item) => [item.orderNo, item.vehicleNo, item.userMasked].some((value) => value.toLowerCase().includes(keyword)));
    }
    return { items: structuredClone(items.slice((page - 1) * pageSize, page * pageSize)), total: items.length, page, pageSize };
  },
  async order(orderId) {
    await pause(); const found = orders.find((item) => item.id === orderId); if (!found) throw new Error('订单不存在'); return structuredClone(found);
  },
  async addOrderNote(orderId, content) {
    await pause(); const found = orders.find((item) => item.id === orderId); if (!found) throw new Error('订单不存在');
    found.notes ||= []; found.notes.push({ id: id('note'), orderId, content, createdAt: nowIso(), createdBy: '超级管理员' }); found.noteCount = found.notes.length;
    return structuredClone(found);
  },
  async financeSummary(scenicAreaId) {
    await pause(); const items = scoped(settlements, scenicAreaId);
    return {
      originalAmountCents: items.reduce((sum, item) => sum + item.originalAmountCents, 0),
      adjustmentAmountCents: items.reduce((sum, item) => sum + item.adjustmentAmountCents, 0),
      effectiveAmountCents: items.reduce((sum, item) => sum + item.effectiveAmountCents, 0),
      settlementCount: items.length,
      trend: [6, 5, 4, 3, 2, 1, 0].map((daysAgo, index) => ({ date: new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10), amountCents: 1800 + index * 410 + (index % 2) * 680 })),
    };
  },
  async settlements(query) {
    await pause(); const page = query.page || 1; const pageSize = query.pageSize || 20;
    let items = scoped(settlements, query.scenicAreaId);
    if (query.keyword) items = items.filter((item) => item.orderNo.toLowerCase().includes(query.keyword!.toLowerCase()));
    return { items: structuredClone(items.slice((page - 1) * pageSize, page * pageSize)), total: items.length, page, pageSize };
  },
  async settlement(settlementId) {
    await pause(); const found = settlements.find((item) => item.id === settlementId); if (!found) throw new Error('结算不存在'); return structuredClone(found);
  },
  async adjustSettlement(settlementId, input) {
    await pause(); const found = settlements.find((item) => item.id === settlementId); if (!found) throw new Error('结算不存在');
    const signed = input.type === 'credit' ? -Math.abs(input.amountCents) : Math.abs(input.amountCents);
    const duplicate = adjustments.find((item) => item.idempotencyKey === input.idempotencyKey); if (duplicate) { if (duplicate.settlementId !== settlementId || duplicate.type !== input.type || duplicate.amountCents !== signed || duplicate.reason !== input.reason) throw new Error('幂等键已用于不同的调账请求'); return structuredClone(found); }
    if (found.effectiveAmountCents + signed < 0) throw new Error('调账后最终应收不得小于 0');
    const adjustment: FinancialAdjustment = { id: id('adj'), settlementId, scenicAreaId: found.scenicAreaId, type: input.type, amountCents: signed, reason: input.reason, idempotencyKey: input.idempotencyKey, createdAt: nowIso(), createdBy: '超级管理员' };
    adjustments.push(adjustment); found.adjustments ||= []; found.adjustments.push(adjustment); found.adjustmentAmountCents += signed; found.effectiveAmountCents += signed;
    const order = orders.find((item) => item.id === found.orderId); if (order) order.effectiveAmountCents = found.effectiveAmountCents;
    return structuredClone(found);
  },
  async reverseAdjustment(settlementId, adjustmentId, reason, idempotencyKey) {
    await pause(); const found = settlements.find((item) => item.id === settlementId); const source = found?.adjustments?.find((item) => item.id === adjustmentId);
    if (!found || !source) throw new Error('原调账流水不存在');
    const duplicate = adjustments.find((item) => item.idempotencyKey === idempotencyKey); if (duplicate) { if (duplicate.settlementId !== settlementId || duplicate.type !== 'reversal' || duplicate.reason !== reason || duplicate.reversedAdjustmentId !== adjustmentId) throw new Error('幂等键已用于不同的撤销请求'); return structuredClone(found); }
    if (found.adjustments?.some((item) => item.reversedAdjustmentId === adjustmentId)) throw new Error('该流水已经撤销');
    const amountCents = -source.amountCents; if (found.effectiveAmountCents + amountCents < 0) throw new Error('撤销后最终应收不得小于 0');
    const reversal: FinancialAdjustment = { id: id('adj'), settlementId, scenicAreaId: found.scenicAreaId, type: 'reversal', amountCents, reason, reversedAdjustmentId: adjustmentId, idempotencyKey, createdAt: nowIso(), createdBy: '超级管理员' };
    adjustments.push(reversal); found.adjustments ||= []; found.adjustments.push(reversal); found.adjustmentAmountCents += amountCents; found.effectiveAmountCents += amountCents;
    return structuredClone(found);
  },
  async systemHealth() { await pause(); return health(healthScenario); },
  async setMockHealthScenario(level) { healthScenario = level; await pause(40); return health(level); },
  async sendVehicleCommand(input) {
    await pause(); const allowed = ['query_status', 'safe_stop', 'resume_trip', 'sound_horn']; if (!allowed.includes(input.commandKey)) throw new Error('指令不在模拟白名单中');
    const paramKeys = Object.keys(input.params); if (paramKeys.some((key) => !['simulateTimeout','simulateFailure'].includes(key))) throw new Error('模拟指令参数不在白名单中');
    const duplicate = commands.find((item) => item.idempotencyKey === input.idempotencyKey); if (duplicate) { if (duplicate.scenicAreaId !== input.scenicAreaId || duplicate.vehicleId !== input.vehicleId || duplicate.commandKey !== input.commandKey || duplicate.reason !== input.reason || duplicate.params.simulateTimeout !== input.params.simulateTimeout || duplicate.params.simulateFailure !== input.params.simulateFailure) throw new Error('幂等键已用于不同的模拟指令请求'); return structuredClone(duplicate); }
    const vehicle = vehicles.find((item) => item.id === input.vehicleId && item.scenicAreaId === input.scenicAreaId); if (!vehicle) throw new Error('车辆不存在或不属于当前景区');
    const command: VehicleCommand = { id: id('cmd'), ...input, status: 'sent', createdAt: nowIso(), updatedAt: nowIso(), simulated: true };
    commands.unshift(command);
    setTimeout(() => { command.status = input.params.simulateTimeout ? 'timed_out' : input.params.simulateFailure ? 'failed' : 'acked'; command.updatedAt = nowIso(); }, 900);
    return structuredClone(command);
  },
  async vehicleCommands(scenicAreaId) { await pause(); return structuredClone(scoped(commands, scenicAreaId)); },
};
