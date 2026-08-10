import type { AdminSessionRecord, AdminUserRecord } from '../domain/models';

export interface AdminRequestContext {
  requestId: string;
  adminUser?: AdminUserRecord;
  adminSession?: AdminSessionRecord;
  scenicScope?: string;
}
