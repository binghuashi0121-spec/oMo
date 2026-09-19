import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RepositoryService } from '../database/repository.service';
import { assertEntityScope, resolveScenicScope } from '../common/scope';
import { AuthService } from '../auth/auth.service';
import { AddNoteDto, OrderQueryDto } from './admin.dto';
@Controller('orders')
export class OrdersController {
  constructor(@Inject(RepositoryService) private readonly repository: RepositoryService, @Inject(AuthService) private readonly auth: AuthService) {}
  @Get() async list(@Query() query: OrderQueryDto, @Req() req: Request) { const scenicAreaId = resolveScenicScope(req.scenicScope, query.scenicAreaId, true); return this.repository.listOrders({ ...query, scenicAreaId }); }
  @Get(':id') async detail(@Param('id') id: string, @Req() req: Request) { const order = await this.repository.findOrder(id); if (!order) throw new NotFoundException('订单不存在'); assertEntityScope(req.scenicScope, order.scenicAreaId); return order; }
  @Post(':id/notes') async note(@Param('id') id: string, @Body() dto: AddNoteDto, @Req() req: Request) { const order = await this.repository.findOrder(id); if (!order) throw new NotFoundException('订单不存在'); assertEntityScope(req.scenicScope, order.scenicAreaId); const note = await this.repository.appendOrderNote({ orderId: id, scenicAreaId: order.scenicAreaId, content: dto.content.trim(), createdAt: new Date().toISOString(), createdBy: req.adminUser!.displayName }); await this.auth.audit(req.adminUser!.id, 'order.note_added', 'order', id, req.requestId, { noteId: note.id, contentLength: dto.content.trim().length }, order.scenicAreaId); return this.repository.findOrder(id); }
}
