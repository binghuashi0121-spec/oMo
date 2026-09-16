import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cloudbase from '@cloudbase/node-sdk';
import { randomUUID } from 'node:crypto';
import type { Adjustment, AdminSessionRecord, AdminUserRecord, AuditRecord, Order, OrderNote, PageResult, ScenicArea, Settlement, Vehicle, VehicleCommand } from '../domain/models';
import { assertAdjustment, computeEffectiveAmount, maskPhone, normalizeOrderStatus, normalizeVehicleStatus, resolveVehicleCoordinates, toIso } from '../domain/rules';
import { memoryOrders, memoryScenics, memorySettlements, memoryVehicles } from './memory-seed';

type DocumentRecord = Record<string, any>;

@Injectable()
export class RepositoryService implements OnModuleInit {
  private readonly driver: 'memory' | 'cloudbase';
  private app: any;
  private db: any;
  private readonly scenics = structuredClone(memoryScenics);
  private readonly vehicles = structuredClone(memoryVehicles);
  private readonly orders = structuredClone(memoryOrders);
  private readonly settlements = structuredClone(memorySettlements);
  private readonly notes: OrderNote[] = [];
  private readonly adjustments: Adjustment[] = [];
  private readonly users: AdminUserRecord[] = [];
  private readonly sessions: AdminSessionRecord[] = [];
  private readonly audits: AuditRecord[] = [];
  private readonly commands: VehicleCommand[] = [];

  constructor(@Inject(ConfigService) private readonly config = new ConfigService()) {
    this.driver = this.config.get('DATA_DRIVER', 'memory') === 'cloudbase' ? 'cloudbase' : 'memory';
  }

  onModuleInit() { this.initialize(); }
  initialize() {
    if (this.driver !== 'cloudbase' || this.db) return;
    const env = this.config.get<string>('CLOUDBASE_ENV_ID');
    if (!env) throw new ServiceUnavailableException('DATA_DRIVER=cloudbase 时必须配置 CLOUDBASE_ENV_ID');
    const options: Record<string, string> = { env };
    const secretId = this.config.get<string>('TENCENTCLOUD_SECRETID'); const secretKey = this.config.get<string>('TENCENTCLOUD_SECRETKEY');
    if (secretId && secretKey) Object.assign(options, { secretId, secretKey });
    this.app = cloudbase.init(options as any); this.db = this.app.database();
  }
  isCloudbase() { return this.driver === 'cloudbase'; }
  rawDatabase() { this.initialize(); return this.db; }

  private async all(collection: string, limit = 10_000): Promise<DocumentRecord[]> {
    this.initialize();
    const rows: DocumentRecord[] = []; const pageSize = 100;
    for (let skip = 0; rows.length < limit; skip += pageSize) {
      const result = await this.db.collection(collection).skip(skip).limit(Math.min(pageSize, limit - rows.length)).get();
      const page = Array.isArray(result?.data) ? result.data : result?.data ? [result.data] : [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows;
  }
  private async findDoc(collection: string, id: string): Promise<DocumentRecord | null> {
    this.initialize();
    try { const result = await this.db.collection(collection).doc(id).get(); const data = Array.isArray(result?.data) ? result.data[0] : result?.data; return data || null; }
    catch { return null; }
  }
  private async whereOne(collection: string, condition: DocumentRecord): Promise<DocumentRecord | null> {
    this.initialize(); const result = await this.db.collection(collection).where(condition).limit(1).get(); return Array.isArray(result?.data) ? result.data[0] || null : result?.data || null;
  }
  private async add(collection: string, value: DocumentRecord) {
    this.initialize();
    const documentId = String(value._id || value.id || '').trim();
    if (documentId) {
      const { _id, ...document } = value;
      await this.db.collection(collection).doc(documentId).set(document);
      return documentId;
    }
    const result = await this.db.collection(collection).add(value);
    return result?.id || result?._id;
  }
  private async update(collection: string, id: string, value: DocumentRecord) { this.initialize(); await this.db.collection(collection).doc(id).update(value); }
  private async remove(collection: string, id: string) { this.initialize(); await this.db.collection(collection).doc(id).remove(); }

  async ping() { if (!this.isCloudbase()) return { ok: true, latencyMs: 1 }; const started = Date.now(); try { await this.db.collection('scenic_areas').limit(1).get(); return { ok: true, latencyMs: Date.now() - started }; } catch (error) { return { ok: false, latencyMs: Date.now() - started, message: error instanceof Error ? error.message : 'CloudBase probe failed' }; } }

  async listScenicAreas(): Promise<ScenicArea[]> {
    if (!this.isCloudbase()) return structuredClone(this.scenics);
    const docs = await this.all('scenic_areas'); if (!docs.length) return structuredClone(memoryScenics);
    return docs.map((doc) => ({ id: doc._id || doc.id, name: doc.name, shortName: doc.shortName || doc.name, status: doc.status === 'maintenance' ? 'maintenance' : 'active', centerGcj02: doc.centerGcj02, zoom: Number(doc.zoom || 16), routeGeoJson: doc.routeGeoJson || { type: 'FeatureCollection', features: [] }, isDemo: Boolean(doc.isDemo) }));
  }
  async requireScenic(id: string) { const found = (await this.listScenicAreas()).find((item) => item.id === id); if (!found) throw new NotFoundException('景区不存在或不可访问'); return found; }

  private normalizeVehicle(doc: DocumentRecord): Vehicle {
    const id = String(doc._id || doc.id || doc.ugvID || doc.vehicleId); const latest=doc.latestPayload?.payload||doc.statusInfo||doc.payload||{}; const coordinates=resolveVehicleCoordinates(doc);
    return { id, scenicAreaId: doc.scenicAreaId || 'tianmashan', vehicleNo: String(doc.vehicleNo || doc.ugvID || id), status: normalizeVehicleStatus(doc.status || doc.businessStatus || doc.runtimeStatus || latest.status), batteryPercent: Number(doc.batteryPercent ?? doc.electiricQuantity ?? doc.battery ?? latest.electiricQuantity ?? latest.battery ?? 0), heartbeatAt: toIso(doc.heartbeatAt || doc.lastReportAt || doc.lastMessageAt || doc.updateTime || doc.updatedAt), positionWgs84: coordinates.positionWgs84, positionGcj02: coordinates.positionGcj02, activeOrderId: doc.activeOrderId || doc.tripId, speedKph: Number(doc.speedKph ?? doc.speed ?? latest.speed ?? 0), isDemo: Boolean(doc.isDemo) };
  }
  async listVehicles(scenicAreaId: string): Promise<Vehicle[]> { await this.requireScenic(scenicAreaId); const rows = this.isCloudbase() ? (await this.all('vehicles')).map((doc) => this.normalizeVehicle(doc)) : this.vehicles; return structuredClone(rows.filter((item) => item.scenicAreaId === scenicAreaId)); }

  private cents(doc: DocumentRecord) { const directRaw=doc.originalAmountCents ?? doc.totalAmountCents ?? doc.amountCents; const direct = directRaw === null || directRaw === undefined || directRaw === '' ? Number.NaN : Number(directRaw); if (Number.isFinite(direct)) return Math.round(direct); return Math.round(Number(doc.totalFee ?? doc.actualFee ?? doc.amount ?? doc.total ?? doc.fee?.total ?? doc.cost ?? 0) * 100); }
  private normalizeOrder(doc: DocumentRecord): Order {
    const id = String(doc._id || doc.id || doc.tripId); const startAt = doc.startAt || doc.startTime; const endAt = doc.endAt || doc.endTime; const duration = Number(doc.durationMinutes ?? (startAt && endAt ? (new Date(toIso(endAt)).getTime() - new Date(toIso(startAt)).getTime()) / 60_000 : 0)); const distanceKm = Number(doc.distanceKm ?? doc.totalKm ?? doc.distance ?? (Number(doc.distanceMeters ?? doc.total_metre ?? 0) / 1000)); const original = this.cents(doc);
    return { id, scenicAreaId: doc.scenicAreaId || 'tianmashan', orderNo: String(doc.orderNo || doc.tripNo || id), userMasked: doc.userMasked || maskPhone(doc.phone || doc.userPhone || doc.openid), vehicleId: String(doc.vehicleId || doc.ugvID || ''), vehicleNo: String(doc.vehicleNo || doc.ugvID || ''), status: normalizeOrderStatus(doc.status), startAt: startAt ? toIso(startAt) : undefined, endAt: endAt ? toIso(endAt) : undefined, createdAt: toIso(doc.createdAt || doc.createTime), distanceKm: Number(distanceKm.toFixed(2)), durationMinutes: Math.max(0, Math.round(duration)), originalAmountCents: original, effectiveAmountCents: original, noteCount: 0, isDemo: Boolean(doc.isDemo) };
  }
  async listOrders(input: { scenicAreaId?: string; keyword?: string; status?: string; page: number; pageSize: number }): Promise<PageResult<Order>> {
    if (input.scenicAreaId && input.scenicAreaId !== 'all') await this.requireScenic(input.scenicAreaId);
    let rows = this.isCloudbase() ? (await this.all('trips')).map((doc) => this.normalizeOrder(doc)) : structuredClone(this.orders);
    const notes = this.isCloudbase() ? (await this.all('admin_order_notes')) : this.notes; const settlements = await this.allSettlements();
    rows = rows.map((row) => { const settlement = settlements.find((item) => item.orderId === row.id); return { ...row, effectiveAmountCents: settlement?.effectiveAmountCents ?? row.originalAmountCents, noteCount: notes.filter((item: any) => item.orderId === row.id).length }; });
    if (input.scenicAreaId && input.scenicAreaId !== 'all') rows = rows.filter((item) => item.scenicAreaId === input.scenicAreaId);
    if (input.status) rows = rows.filter((item) => item.status === normalizeOrderStatus(input.status));
    if (input.keyword) { const keyword = input.keyword.toLowerCase(); rows = rows.filter((item) => [item.orderNo, item.vehicleNo, item.userMasked].some((value) => value.toLowerCase().includes(keyword))); }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); const start = (input.page - 1) * input.pageSize; return { items: rows.slice(start, start + input.pageSize), total: rows.length, page: input.page, pageSize: input.pageSize };
  }
  async findOrder(id: string): Promise<Order | null> { const row = this.isCloudbase() ? await this.findDoc('trips', id) : this.orders.find((item) => item.id === id); if (!row) return null; const order = this.isCloudbase() ? this.normalizeOrder(row as any) : structuredClone(row as Order); const notes = await this.listOrderNotes(id); const settlement = (await this.allSettlements()).find((item) => item.orderId === id); return { ...order, notes, noteCount: notes.length, effectiveAmountCents: settlement?.effectiveAmountCents ?? order.originalAmountCents }; }
  async listOrderNotes(orderId: string): Promise<OrderNote[]> { const rows = this.isCloudbase() ? await this.all('admin_order_notes') : this.notes; return structuredClone(rows.filter((item: any) => item.orderId === orderId).map((item: any) => ({ ...item, id: item.id || item._id, createdAt: toIso(item.createdAt) }))); }
  async appendOrderNote(value: Omit<OrderNote, 'id'>): Promise<OrderNote> { const note = { ...value, id: randomUUID() }; if (this.isCloudbase()) await this.add('admin_order_notes', { ...note, _id: note.id }); else this.notes.push(note); return structuredClone(note); }

  private normalizeAdjustment(item: DocumentRecord): Adjustment { return { ...item, id: item.id || item._id, createdAt: toIso(item.createdAt), amountCents: Number(item.amountCents) } as Adjustment; }
  private async allAdjustments() { const rows = this.isCloudbase() ? await this.all('financial_adjustments') : this.adjustments; return rows.map((item: any) => this.normalizeAdjustment(item)); }
  private normalizeSettlement(doc: DocumentRecord): Settlement {
    const original = this.cents(doc);
    const rawPaymentStatus = String(doc.paymentStatus || doc.payStatus || '').toLowerCase();
    const paymentStatus: Settlement['paymentStatus'] = rawPaymentStatus === 'demo_pending' || rawPaymentStatus === 'pending' || rawPaymentStatus === 'unpaid'
      ? 'demo_pending'
      : rawPaymentStatus === 'demo_refunded' || rawPaymentStatus === 'refunded'
        ? 'demo_refunded'
        : 'demo_paid';
    return { id: String(doc._id || doc.id || doc.settlementId), scenicAreaId: doc.scenicAreaId || 'tianmashan', orderId: String(doc.orderId || doc.tripId || ''), orderNo: String(doc.orderNo || doc.tripNo || doc.orderId || doc.tripId || ''), originalAmountCents: original, adjustmentAmountCents: 0, effectiveAmountCents: original, paymentStatus, settledAt: toIso(doc.settledAt || doc.endTime || doc.createdAt || doc.createTime), isDemo: Boolean(doc.isDemo) };
  }
  private async allSettlements(): Promise<Settlement[]> { const raw = this.isCloudbase() ? (await this.all('trip_settlements')).map((doc) => this.normalizeSettlement(doc)) : structuredClone(this.settlements); const adjustments = await this.allAdjustments(); return raw.map((item) => { const own = adjustments.filter((adjustment) => adjustment.settlementId === item.id); const effective = computeEffectiveAmount(item.originalAmountCents, own); return { ...item, adjustments: own, adjustmentAmountCents: effective - item.originalAmountCents, effectiveAmountCents: effective }; }); }
  async listSettlements(input: { scenicAreaId?: string; keyword?: string; page: number; pageSize: number }): Promise<PageResult<Settlement>> { if (input.scenicAreaId && input.scenicAreaId !== 'all') await this.requireScenic(input.scenicAreaId); let rows = await this.allSettlements(); if (input.scenicAreaId && input.scenicAreaId !== 'all') rows = rows.filter((item) => item.scenicAreaId === input.scenicAreaId); if (input.keyword) rows = rows.filter((item) => item.orderNo.toLowerCase().includes(input.keyword!.toLowerCase())); rows.sort((a,b) => b.settledAt.localeCompare(a.settledAt)); const start = (input.page - 1) * input.pageSize; return { items: rows.slice(start, start + input.pageSize), total: rows.length, page: input.page, pageSize: input.pageSize }; }
  async findSettlement(id: string) { return (await this.allSettlements()).find((item) => item.id === id) || null; }
  async findAdjustmentByIdempotency(idempotencyKey: string) { return (await this.allAdjustments()).find((item) => item.idempotencyKey === idempotencyKey) || null; }
  async appendAdjustmentInvariant(value: Omit<Adjustment, 'id'>): Promise<{ adjustment: Adjustment; beforeAmountCents: number; afterAmountCents: number; duplicate: boolean }> {
    const evaluate = (settlement: Settlement, adjustments: Adjustment[], duplicate?: Adjustment | null) => {
      const beforeAmountCents = computeEffectiveAmount(settlement.originalAmountCents, adjustments);
      if (duplicate) {
        if (duplicate.settlementId !== settlement.id) throw new BadRequestException('幂等键已用于其他结算');
        const sameRequest = duplicate.type === value.type
          && duplicate.amountCents === value.amountCents
          && duplicate.reason === value.reason
          && (duplicate.reversedAdjustmentId || '') === (value.reversedAdjustmentId || '');
        if (!sameRequest) throw new BadRequestException('幂等键已用于不同的调账请求');
        return { adjustment: duplicate, beforeAmountCents, afterAmountCents: beforeAmountCents, duplicate: true };
      }
      let signedAmountCents = value.amountCents;
      if (value.type === 'reversal') {
        const source = adjustments.find((item) => item.id === value.reversedAdjustmentId);
        if (!source || source.type === 'reversal') throw new NotFoundException('可撤销的原调账流水不存在');
        if (adjustments.some((item) => item.reversedAdjustmentId === source.id)) throw new BadRequestException('该调账流水已经撤销');
        signedAmountCents = -source.amountCents;
      } else if (value.reversedAdjustmentId) {
        throw new BadRequestException('只有撤销流水可以引用原调账流水');
      }
      const afterAmountCents = assertAdjustment(settlement.originalAmountCents, adjustments, signedAmountCents);
      const adjustment: Adjustment = { ...value, amountCents: signedAmountCents, id: randomUUID() };
      return { adjustment, beforeAmountCents, afterAmountCents, duplicate: false };
    };

    if (!this.isCloudbase()) {
      const settlement = this.settlements.find((item) => item.id === value.settlementId);
      if (!settlement) throw new NotFoundException('结算不存在');
      const own = this.adjustments.filter((item) => item.settlementId === settlement.id);
      const duplicate = this.adjustments.find((item) => item.idempotencyKey === value.idempotencyKey);
      const result = evaluate(settlement, own, duplicate);
      if (!result.duplicate) this.adjustments.push(result.adjustment);
      return structuredClone(result);
    }

    this.initialize();
    try {
      return await this.db.runTransaction(async (transaction: any) => {
      const settlementResult = await transaction.collection('trip_settlements').doc(value.settlementId).get();
      const settlementDoc = Array.isArray(settlementResult?.data) ? settlementResult.data[0] : settlementResult?.data;
      if (!settlementDoc) throw new NotFoundException('结算不存在');
      const settlement = this.normalizeSettlement(settlementDoc);
      if (settlement.scenicAreaId !== value.scenicAreaId) throw new BadRequestException('调账景区与结算不一致');

      const adjustmentResult = await transaction.collection('financial_adjustments').where({ settlementId: value.settlementId }).limit(1000).get();
      const duplicateResult = await transaction.collection('financial_adjustments').where({ idempotencyKey: value.idempotencyKey }).limit(1).get();
      const adjustmentRows = Array.isArray(adjustmentResult?.data) ? adjustmentResult.data : adjustmentResult?.data ? [adjustmentResult.data] : [];
      if (adjustmentRows.length >= 1000) throw new BadRequestException('单笔结算调账流水已超过安全上限');
      const adjustments = adjustmentRows.map((item: DocumentRecord) => this.normalizeAdjustment(item));
      const duplicateDoc = Array.isArray(duplicateResult?.data) ? duplicateResult.data[0] : duplicateResult?.data;
      const result = evaluate(settlement, adjustments, duplicateDoc ? this.normalizeAdjustment(duplicateDoc) : null);
      if (result.duplicate) return result;

      const { id, ...document } = result.adjustment;
      await transaction.collection('financial_adjustments').doc(id).set(document);
      // This derived-only update makes concurrent adjustments conflict and retry while
      // preserving every original settlement amount field unchanged.
      await transaction.collection('trip_settlements').doc(settlement.id).update({
        adminEffectiveAmountCents: result.afterAmountCents,
        adminAdjustmentVersion: adjustments.length + 1,
        adminAdjustedAt: result.adjustment.createdAt,
      });
      return result;
      });
    } catch (error) {
      // A concurrent request for the same idempotency key may lose at the unique
      // index after the transaction read. Re-read and return the committed row.
      const duplicateDoc = await this.whereOne('financial_adjustments', { idempotencyKey: value.idempotencyKey }).catch(() => null);
      if (!duplicateDoc) throw error;
      const settlement = await this.findSettlement(value.settlementId);
      if (!settlement) throw error;
      return evaluate(settlement, settlement.adjustments || [], this.normalizeAdjustment(duplicateDoc));
    }
  }

  async findAdminByUsername(username: string): Promise<AdminUserRecord | null> { const row = this.isCloudbase() ? await this.whereOne('admin_users', { username }) : this.users.find((item) => item.username === username); return row ? { ...(row as any), id: (row as any).id || (row as any)._id } : null; }
  async findAdminById(id: string): Promise<AdminUserRecord | null> { const row = this.isCloudbase() ? await this.findDoc('admin_users', id) : this.users.find((item) => item.id === id); return row ? { ...(row as any), id: (row as any).id || (row as any)._id } : null; }
  async createAdmin(value: AdminUserRecord) { if (this.isCloudbase()) await this.add('admin_users', { ...value, _id: value.id }); else this.users.push(structuredClone(value)); }
  async updateAdmin(id: string, value: Partial<AdminUserRecord>) { if (this.isCloudbase()) await this.update('admin_users', id, value); else { const found = this.users.find((item) => item.id === id); if (found) Object.assign(found, value); } }
  async createSession(value: AdminSessionRecord) { if (this.isCloudbase()) await this.add('admin_sessions', { ...value, _id: value.id }); else this.sessions.push(structuredClone(value)); }
  async findSessionByTokenHash(tokenHash: string): Promise<AdminSessionRecord | null> { const row = this.isCloudbase() ? await this.whereOne('admin_sessions', { tokenHash }) : this.sessions.find((item) => item.tokenHash === tokenHash); return row ? { ...(row as any), id: (row as any).id || (row as any)._id } : null; }
  async touchSession(id: string, lastSeenAt: string) { if (this.isCloudbase()) await this.update('admin_sessions', id, { lastSeenAt }); else { const found = this.sessions.find((item) => item.id === id); if (found) found.lastSeenAt = lastSeenAt; } }
  async deleteSession(id: string) { if (this.isCloudbase()) await this.remove('admin_sessions', id); else { const index = this.sessions.findIndex((item) => item.id === id); if (index >= 0) this.sessions.splice(index, 1); } }
  async addAudit(value: AuditRecord) { if (this.isCloudbase()) await this.add('admin_audit_logs', { ...value, _id: value.id }); else this.audits.push(structuredClone(value)); }
  getMemoryAudits() { return structuredClone(this.audits); }

  async findCommandByIdempotency(idempotencyKey: string) { const rows = this.isCloudbase() ? await this.all('vehicle_commands') : this.commands; const row = rows.find((item: any) => item.idempotencyKey === idempotencyKey); return row ? { ...row, id: (row as any).id || (row as any)._id } as VehicleCommand : null; }
  async appendCommand(value: VehicleCommand) { if (this.isCloudbase()) await this.add('vehicle_commands', { ...value, _id: value.id }); else this.commands.unshift(structuredClone(value)); }
  async updateCommand(id: string, value: Partial<VehicleCommand>) { if (this.isCloudbase()) await this.update('vehicle_commands', id, value); else { const found = this.commands.find((item) => item.id === id); if (found) Object.assign(found, value); } }
  async listCommands(scenicAreaId?: string) { const rows = this.isCloudbase() ? await this.all('vehicle_commands') : this.commands; return structuredClone(rows.map((item: any) => ({ ...item, id: item.id || item._id })).filter((item: any) => !scenicAreaId || scenicAreaId === 'all' || item.scenicAreaId === scenicAreaId).sort((a: any,b: any) => b.createdAt.localeCompare(a.createdAt)).slice(0,100)) as VehicleCommand[]; }
}
