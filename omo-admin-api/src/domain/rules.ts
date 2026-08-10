import { BadRequestException } from '@nestjs/common';
import type { Adjustment, HealthLevel, OrderStatus, VehicleStatus } from './models';

export const normalizeOrderStatus = (value: unknown): OrderStatus => {
  const status = String(value || '').toLowerCase();
  if (status === 'ongoing') return 'active';
  if (['waiting_pickup', 'active', 'completed', 'cancelled'].includes(status)) return status as OrderStatus;
  return 'cancelled';
};
export const normalizeVehicleStatus = (value: unknown): VehicleStatus => {
  const status = String(value || '').toLowerCase();
  if (['idle', 'online'].includes(status)) return 'available';
  if (['in_use', 'busy', 'running'].includes(status)) return 'active';
  if (['faulty', 'maintenance', 'error'].includes(status)) return 'fault';
  if (['available', 'active', 'charging', 'offline', 'fault'].includes(status)) return status as VehicleStatus;
  return 'offline';
};

const PI = Math.PI; const A = 6378245.0; const EE = 0.00669342162296594323;
function transformLat(x: number, y: number) { let result = -100 + 2 * x + 3 * y + .2 * y * y + .1 * x * y + .2 * Math.sqrt(Math.abs(x)); result += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3; result += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3; result += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3; return result; }
function transformLon(x: number, y: number) { let result = 300 + x + 2 * y + .1 * x * x + .1 * x * y + .1 * Math.sqrt(Math.abs(x)); result += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3; result += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3; result += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3; return result; }
export function wgs84ToGcj02(latitude: number, longitude: number) {
  if (longitude < 72.004 || longitude > 137.8347 || latitude < .8293 || latitude > 55.8271) return { latitude, longitude };
  let dLat = transformLat(longitude - 105, latitude - 35); let dLon = transformLon(longitude - 105, latitude - 35); const radLat = latitude / 180 * PI; let magic = Math.sin(radLat); magic = 1 - EE * magic * magic; const sqrtMagic = Math.sqrt(magic); dLat = dLat * 180 / ((A * (1 - EE)) / (magic * sqrtMagic) * PI); dLon = dLon * 180 / (A / sqrtMagic * Math.cos(radLat) * PI); return { latitude: latitude + dLat, longitude: longitude + dLon };
}

export function resolveVehicleCoordinates(doc: Record<string, any>) {
  const latest = doc.latestPayload?.payload && typeof doc.latestPayload.payload === 'object' ? doc.latestPayload.payload : doc.statusInfo && typeof doc.statusInfo === 'object' ? doc.statusInfo : doc.payload && typeof doc.payload === 'object' ? doc.payload : {};
  const numberOrNaN = (value: unknown) => { if (value === null || value === undefined || value === '') return Number.NaN; const result = Number(value); return Number.isFinite(result) ? result : Number.NaN; };
  const bridgeRawLatitude = numberOrNaN(doc.rawLatitude ?? latest.rawLatitude);
  const bridgeRawLongitude = numberOrNaN(doc.rawLongitude ?? latest.rawLongitude);
  const hasBridgeRaw = Number.isFinite(bridgeRawLatitude) && Number.isFinite(bridgeRawLongitude);
  const rawLatitude = numberOrNaN(doc.positionWgs84?.latitude ?? (hasBridgeRaw ? bridgeRawLatitude : doc.latitude ?? doc.lat ?? latest.latitude ?? latest.lat));
  const rawLongitude = numberOrNaN(doc.positionWgs84?.longitude ?? (hasBridgeRaw ? bridgeRawLongitude : doc.longitude ?? doc.lng ?? latest.longitude ?? latest.lng));
  const sourceLatitude = Number.isFinite(rawLatitude) ? rawLatitude : 0;
  const sourceLongitude = Number.isFinite(rawLongitude) ? rawLongitude : 0;
  const explicitDisplayLatitude = numberOrNaN(doc.positionGcj02?.latitude);
  const explicitDisplayLongitude = numberOrNaN(doc.positionGcj02?.longitude);
  const bridgeDisplayLatitude = numberOrNaN(doc.latitude ?? doc.lat ?? latest.latitude ?? latest.lat);
  const bridgeDisplayLongitude = numberOrNaN(doc.longitude ?? doc.lng ?? latest.longitude ?? latest.lng);
  const hasExplicitDisplay = Number.isFinite(explicitDisplayLatitude) && Number.isFinite(explicitDisplayLongitude);
  const hasBridgeDisplay = hasBridgeRaw && Number.isFinite(bridgeDisplayLatitude) && Number.isFinite(bridgeDisplayLongitude);
  const display = hasExplicitDisplay
    ? { latitude: explicitDisplayLatitude, longitude: explicitDisplayLongitude }
    : hasBridgeDisplay
      ? { latitude: bridgeDisplayLatitude, longitude: bridgeDisplayLongitude }
      : wgs84ToGcj02(sourceLatitude, sourceLongitude);
  return { positionWgs84: { latitude: sourceLatitude, longitude: sourceLongitude }, positionGcj02: display };
}

export function computeEffectiveAmount(originalAmountCents: number, adjustments: Adjustment[]): number { return originalAmountCents + adjustments.reduce((sum, item) => sum + item.amountCents, 0); }
export function assertAdjustment(originalAmountCents: number, adjustments: Adjustment[], signedAmountCents: number) { if (!Number.isInteger(signedAmountCents) || signedAmountCents === 0) throw new BadRequestException('调账金额必须是非零整数分'); const next = computeEffectiveAmount(originalAmountCents, adjustments) + signedAmountCents; if (next < 0) throw new BadRequestException('调账后最终应收不得小于 0'); return next; }
export function aggregateHealth(levels: HealthLevel[]): HealthLevel { if (levels.includes('critical')) return 'critical'; if (levels.includes('degraded')) return 'degraded'; return 'healthy'; }
export function isSessionExpired(session: { absoluteExpiresAt: string; lastSeenAt: string }, now = Date.now(), idleMs = 30 * 60_000) { return new Date(session.absoluteExpiresAt).getTime() <= now || new Date(session.lastSeenAt).getTime() + idleMs <= now; }
export function maskPhone(value: unknown) { const text = String(value || ''); return /^\d{11}$/.test(text) ? `${text.slice(0, 3)}****${text.slice(-4)}` : text ? '***' : '未知用户'; }
export function toIso(value: unknown, fallback = new Date().toISOString()) { if (value instanceof Date) return value.toISOString(); if (typeof value === 'number' || (typeof value === 'string' && /^\d{10,13}$/.test(value))) { const numeric=Number(value); const milliseconds=Math.abs(numeric)<1_000_000_000_000?numeric*1000:numeric; const parsed=new Date(milliseconds); return Number.isNaN(parsed.getTime())?fallback:parsed.toISOString(); } if (value && typeof value === 'object') { const item = value as any; if (item.$date) return new Date(item.$date).toISOString(); if (item._seconds) return new Date(Number(item._seconds) * 1000).toISOString(); } const parsed = new Date(String(value || '')); return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString(); }
