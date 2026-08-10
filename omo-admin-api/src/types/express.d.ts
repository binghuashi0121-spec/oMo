import type { AdminSessionRecord, AdminUserRecord } from '../domain/models';
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      adminUser?: AdminUserRecord;
      adminSession?: AdminSessionRecord;
      scenicScope?: string;
    }
  }
}
export {};
