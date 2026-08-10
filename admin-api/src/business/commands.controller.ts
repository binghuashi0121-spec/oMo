import { Body, Controller, Get, Inject, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { resolveScenicScope } from '../common/scope';
import { RepositoryService } from '../database/repository.service';
import { VehicleCommandDto } from './admin.dto';
import { CommandsService } from './commands.service';
@Controller('vehicle-commands')
export class CommandsController { constructor(@Inject(CommandsService) private readonly commands: CommandsService, @Inject(RepositoryService) private readonly repository: RepositoryService) {} @Post() create(@Body() dto: VehicleCommandDto,@Req() req: Request) { const scope = resolveScenicScope(req.scenicScope,dto.scenicAreaId,false); dto.scenicAreaId = scope; return this.commands.create(dto,req); } @Get() list(@Query('scenicAreaId') requested:string,@Req() req:Request) { const scope=resolveScenicScope(req.scenicScope,requested,true); return this.repository.listCommands(scope); } }
