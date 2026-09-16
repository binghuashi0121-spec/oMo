import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { resolveScenicScope } from '../common/scope';
import { OverviewService } from './overview.service';

@Controller()
export class OverviewController {
  constructor(@Inject(OverviewService) private readonly overview: OverviewService) {}

  @Get('overview')
  summary(@Query('scenicAreaId') requested: string, @Req() req: Request) {
    return this.overview.summary(resolveScenicScope(req.scenicScope, requested, true));
  }
}
