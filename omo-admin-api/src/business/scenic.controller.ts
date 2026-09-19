import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RepositoryService } from '../database/repository.service';
import { resolveScenicScope } from '../common/scope';
@Controller()
export class ScenicController {
  constructor(@Inject(RepositoryService) private readonly repository: RepositoryService) {}
  @Get('scenic-areas') async list() { return this.repository.listScenicAreas(); }
  @Get('map/vehicles') async vehicles(@Query('scenicAreaId') requested: string, @Req() req: Request) { const scope = resolveScenicScope(req.scenicScope, requested, false); return this.repository.listVehicles(scope); }
}
