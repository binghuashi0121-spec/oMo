import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertEntityScope, resolveScenicScope } from '../common/scope';
import { RepositoryService } from '../database/repository.service';
import { AdjustmentDto, PageQueryDto, ReverseAdjustmentDto } from './admin.dto';
import { FinanceService } from './finance.service';
const shanghaiDate = (value: string | number | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
@Controller('finance')
export class FinanceController {
  constructor(@Inject(RepositoryService) private readonly repository: RepositoryService, @Inject(FinanceService) private readonly finance: FinanceService) {}
  @Get('summary') async summary(@Query('scenicAreaId') requested: string, @Req() req: Request) { const scenicAreaId = resolveScenicScope(req.scenicScope, requested, true); const result = await this.repository.listSettlements({ scenicAreaId, page: 1, pageSize: 10_000 }); const originalAmountCents = result.items.reduce((sum,item) => sum + item.originalAmountCents,0); const effectiveAmountCents = result.items.reduce((sum,item) => sum + item.effectiveAmountCents,0); const days = Array.from({length:7},(_,index) => shanghaiDate(Date.now() - (6-index)*86_400_000)); const trend = days.map((date) => ({ date, amountCents: result.items.filter((item) => shanghaiDate(item.settledAt) === date).reduce((sum,item) => sum + item.effectiveAmountCents,0) })); return { originalAmountCents, adjustmentAmountCents: effectiveAmountCents - originalAmountCents, effectiveAmountCents, settlementCount: result.total, trend }; }
  @Get('settlements') async list(@Query() query: PageQueryDto, @Req() req: Request) { const scenicAreaId = resolveScenicScope(req.scenicScope, query.scenicAreaId, true); return this.repository.listSettlements({ ...query, scenicAreaId }); }
  @Get('settlements/:id') async detail(@Param('id') id: string, @Req() req: Request) { const row = await this.repository.findSettlement(id); if (!row) throw new NotFoundException('结算不存在'); assertEntityScope(req.scenicScope, row.scenicAreaId); return row; }
  @Post('settlements/:id/adjustments') async adjust(@Param('id') id: string, @Body() dto: AdjustmentDto, @Req() req: Request) { const row = await this.repository.findSettlement(id); if (!row) throw new NotFoundException('结算不存在'); assertEntityScope(req.scenicScope, row.scenicAreaId); return this.finance.adjust(id,dto,req); }
  @Post('settlements/:id/adjustments/:adjustmentId/reverse') async reverse(@Param('id') id: string,@Param('adjustmentId') adjustmentId: string,@Body() dto: ReverseAdjustmentDto,@Req() req: Request) { const row = await this.repository.findSettlement(id); if (!row) throw new NotFoundException('结算不存在'); assertEntityScope(req.scenicScope,row.scenicAreaId); return this.finance.reverse(id,adjustmentId,dto,req); }
}
