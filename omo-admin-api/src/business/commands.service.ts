import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { RepositoryService } from '../database/repository.service';
import { AuthService } from '../auth/auth.service';
import type { VehicleCommand } from '../domain/models';
import type { VehicleCommandDto } from './admin.dto';
@Injectable()
export class CommandsService {
  constructor(@Inject(RepositoryService) private readonly repository: RepositoryService, @Inject(AuthService) private readonly auth: AuthService) {}
  private sameRequest(command: VehicleCommand, dto: VehicleCommandDto) {
    return command.scenicAreaId === dto.scenicAreaId
      && command.vehicleId === dto.vehicleId
      && command.commandKey === dto.commandKey
      && command.reason === dto.reason.trim()
      && command.params.simulateTimeout === dto.params.simulateTimeout
      && command.params.simulateFailure === dto.params.simulateFailure;
  }
  private duplicateOrThrow(command: VehicleCommand, dto: VehicleCommandDto) {
    if (!this.sameRequest(command, dto)) throw new BadRequestException('幂等键已用于不同的模拟指令请求');
    return command;
  }
  async create(dto: VehicleCommandDto, req: Request) {
    const paramKeys = Object.keys(dto.params);
    if (paramKeys.some((key) => !['simulateTimeout','simulateFailure'].includes(key))
      || (dto.params.simulateTimeout !== undefined && typeof dto.params.simulateTimeout !== 'boolean')
      || (dto.params.simulateFailure !== undefined && typeof dto.params.simulateFailure !== 'boolean')) throw new BadRequestException('模拟指令参数不在白名单中');
    const duplicate = await this.repository.findCommandByIdempotency(dto.idempotencyKey);
    if (duplicate) return this.duplicateOrThrow(duplicate, dto);
    const vehicle = (await this.repository.listVehicles(dto.scenicAreaId)).find((item) => item.id === dto.vehicleId);
    if (!vehicle) throw new NotFoundException('车辆不存在或不属于当前景区');
    if (['safe_stop','resume_trip'].includes(dto.commandKey) && vehicle.status !== 'active') throw new BadRequestException('该模拟指令只允许对行程中的车辆使用');
    const now = new Date().toISOString();
    const command: VehicleCommand = { id: randomUUID(), scenicAreaId: dto.scenicAreaId, vehicleId: dto.vehicleId, commandKey: dto.commandKey, params: dto.params, reason: dto.reason.trim(), idempotencyKey: dto.idempotencyKey, status: 'sent', createdAt: now, updatedAt: now, createdBy: req.adminUser!.displayName, simulated: true };
    try {
      await this.repository.appendCommand(command);
    } catch (error) {
      const concurrent = await this.repository.findCommandByIdempotency(dto.idempotencyKey).catch(() => null);
      if (concurrent) return this.duplicateOrThrow(concurrent, dto);
      throw error;
    }
    await this.auth.audit(req.adminUser!.id,'vehicle_command.simulated','vehicle',dto.vehicleId,req.requestId,{ commandId:command.id,commandKey:dto.commandKey,simulated:true },dto.scenicAreaId);
    setTimeout(() => { const status = dto.params?.simulateTimeout ? 'timed_out' : dto.params?.simulateFailure ? 'failed' : 'acked'; this.repository.updateCommand(command.id,{status,updatedAt:new Date().toISOString()}).catch((error) => console.error('[simulated-command]',error)); },900).unref?.();
    return command;
  }
}
