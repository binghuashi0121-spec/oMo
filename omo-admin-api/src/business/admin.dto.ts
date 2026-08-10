import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
export class PageQueryDto { @IsOptional() @IsString() scenicAreaId?: string; @IsOptional() @IsString() @Length(0, 80) keyword?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20; }
export class OrderQueryDto extends PageQueryDto { @IsOptional() @IsIn(['waiting_pickup','active','ongoing','completed','cancelled']) status?: string; }
export class AddNoteDto { @IsString() @Length(2, 300) content!: string; }
export class AdjustmentDto { @IsIn(['charge','credit']) type!: 'charge' | 'credit'; @Type(() => Number) @IsInt() @Min(1) amountCents!: number; @IsString() @Length(4, 160) reason!: string; @IsUUID() idempotencyKey!: string; }
export class ReverseAdjustmentDto { @IsString() @Length(4, 160) reason!: string; @IsUUID() idempotencyKey!: string; }
export class VehicleCommandDto { @IsString() scenicAreaId!: string; @IsString() vehicleId!: string; @IsIn(['query_status','sound_horn','safe_stop','resume_trip']) commandKey!: string; @IsObject() params!: Record<string, unknown>; @IsString() @Length(4, 160) reason!: string; @IsUUID() idempotencyKey!: string; }
