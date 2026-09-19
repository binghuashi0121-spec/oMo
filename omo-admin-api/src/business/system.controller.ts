import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { resolveScenicScope } from '../common/scope';
import { Public } from '../common/public.decorator';
import { SystemService } from './system.service';
@Controller()
export class SystemController { constructor(@Inject(SystemService) private readonly system:SystemService){} @Public() @Get('live') live(){return {service:'omo-admin-api',status:'alive',time:new Date().toISOString()};} @Get('system/health') health(@Query('scenicAreaId') requested:string,@Req() req:Request){const scope=resolveScenicScope(req.scenicScope,requested,true);return this.system.health(scope);} }
