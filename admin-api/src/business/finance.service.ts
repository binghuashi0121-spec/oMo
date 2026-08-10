import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { RepositoryService } from '../database/repository.service';
import { AuthService } from '../auth/auth.service';
import type { AdjustmentDto, ReverseAdjustmentDto } from './admin.dto';

@Injectable()
export class FinanceService {
  private readonly locks = new Map<string, Promise<void>>();
  constructor(@Inject(RepositoryService) private readonly repository: RepositoryService, @Inject(AuthService) private readonly auth: AuthService) {}
  private async locked<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.locks.set(key, queued);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.locks.get(key) === queued) this.locks.delete(key);
    }
  }
  async adjust(settlementId: string, dto: AdjustmentDto, req: Request) { return this.locked(settlementId, async () => { const settlement = await this.repository.findSettlement(settlementId); if (!settlement) throw new NotFoundException('结算不存在'); const signed = dto.type === 'credit' ? -dto.amountCents : dto.amountCents; const result = await this.repository.appendAdjustmentInvariant({ settlementId, scenicAreaId: settlement.scenicAreaId, amountCents: signed, type: dto.type, reason: dto.reason.trim(), idempotencyKey: dto.idempotencyKey, createdAt: new Date().toISOString(), createdBy: req.adminUser!.displayName }); if (!result.duplicate) await this.auth.audit(req.adminUser!.id, 'finance.adjustment_added', 'settlement', settlementId, req.requestId, { adjustmentId: result.adjustment.id, amountCents: result.adjustment.amountCents, beforeAmountCents: result.beforeAmountCents, afterAmountCents: result.afterAmountCents, reason: dto.reason.trim() }, settlement.scenicAreaId); return this.repository.findSettlement(settlementId); }); }
  async reverse(settlementId: string, adjustmentId: string, dto: ReverseAdjustmentDto, req: Request) { return this.locked(settlementId, async () => { const settlement = await this.repository.findSettlement(settlementId); if (!settlement) throw new NotFoundException('结算不存在'); const source = settlement.adjustments?.find((item) => item.id === adjustmentId); if (!source || source.type === 'reversal') throw new NotFoundException('可撤销的原调账流水不存在'); const result = await this.repository.appendAdjustmentInvariant({ settlementId, scenicAreaId: settlement.scenicAreaId, amountCents: -source.amountCents, type: 'reversal', reason: dto.reason.trim(), reversedAdjustmentId: adjustmentId, idempotencyKey: dto.idempotencyKey, createdAt: new Date().toISOString(), createdBy: req.adminUser!.displayName }); if (!result.duplicate) await this.auth.audit(req.adminUser!.id, 'finance.adjustment_reversed', 'settlement', settlementId, req.requestId, { adjustmentId: result.adjustment.id, reversedAdjustmentId: adjustmentId, amountCents: result.adjustment.amountCents, beforeAmountCents: result.beforeAmountCents, afterAmountCents: result.afterAmountCents }, settlement.scenicAreaId); return this.repository.findSettlement(settlementId); }); }
}
