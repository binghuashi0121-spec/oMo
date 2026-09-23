import { ForbiddenException, HttpException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { RepositoryService } from '../database/repository.service';
import type { AdminSessionRecord, AdminUserRecord } from '../domain/models';
import { hashPassword, verifyPassword } from './password-hash';

const ABSOLUTE_SESSION_MS = 8 * 60 * 60_000;
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_LIMIT = 5;
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export type PublicAdminUser = Pick<AdminUserRecord, 'id' | 'username' | 'displayName' | 'role' | 'mustChangePassword'>;

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, number[]>();
  constructor(@Inject(RepositoryService) private readonly repository: RepositoryService, @Inject(ConfigService) private readonly config: ConfigService) {}
  private attemptKey(username: string, ip: string) { return `${username.toLowerCase()}|${ip}`; }
  private currentAttempts(key: string) { const cutoff = Date.now() - LOGIN_WINDOW_MS; const values = (this.attempts.get(key) || []).filter((value) => value > cutoff); this.attempts.set(key, values); return values; }
  private assertRateLimit(key: string) { const attempts = this.currentAttempts(key); if (attempts.length >= LOGIN_LIMIT) throw new HttpException({ code: 'AUTH_RATE_LIMITED', message: '登录失败次数过多，请 15 分钟后再试' }, 429); }
  private registerFailure(key: string) { const attempts = this.currentAttempts(key); attempts.push(Date.now()); this.attempts.set(key, attempts); }

  async login(usernameRaw: string, password: string, ip: string, userAgent: string, requestId: string) {
    const username = usernameRaw.trim().toLowerCase(); const key = this.attemptKey(username, ip); this.assertRateLimit(key); const user = await this.repository.findAdminByUsername(username);
    const valid = user ? await verifyPassword(user.passwordHash, password) : (await hashPassword(password), false);
    if (!user || !user.active || !valid) { this.registerFailure(key); await this.audit('anonymous', 'auth.login_failed', 'admin_username_hash', hashToken(username), requestId, { ip }).catch(() => undefined); throw new UnauthorizedException('账号或密码错误'); }
    this.attempts.delete(key); const rawToken = randomBytes(32).toString('base64url'); const now = new Date(); const session: AdminSessionRecord = { id: randomUUID(), userId: user.id, tokenHash: hashToken(rawToken), csrfToken: randomBytes(24).toString('base64url'), createdAt: now.toISOString(), lastSeenAt: now.toISOString(), absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_SESSION_MS).toISOString(), ip, userAgent: userAgent.slice(0, 300) }; await this.repository.createSession(session); await this.audit(user.id, 'auth.login', 'admin_session', session.id, requestId, { ip }); return { rawToken, session, user: this.publicUser(user) };
  }
  publicUser(user: AdminUserRecord): PublicAdminUser { return { id: user.id, username: user.username, displayName: user.displayName, role: user.role, mustChangePassword: user.mustChangePassword }; }
  sessionInfo(user: AdminUserRecord | PublicAdminUser, session: AdminSessionRecord) { return { user: 'passwordHash' in user ? this.publicUser(user) : user, csrfToken: session.csrfToken, expiresAt: session.absoluteExpiresAt }; }
  async logout(user: AdminUserRecord, session: AdminSessionRecord, requestId: string) { await this.repository.deleteSession(session.id); await this.audit(user.id, 'auth.logout', 'admin_session', session.id, requestId, {}); }
  async changePassword(user: AdminUserRecord, session: AdminSessionRecord, currentPassword: string, newPassword: string, requestId: string) { if (!(await verifyPassword(user.passwordHash, currentPassword))) throw new ForbiddenException('当前密码不正确'); if (currentPassword === newPassword) throw new ForbiddenException('新密码不能与当前密码相同'); const passwordHash = await hashPassword(newPassword); await this.repository.updateAdmin(user.id, { passwordHash, mustChangePassword: false, updatedAt: new Date().toISOString() }); user.passwordHash = passwordHash; user.mustChangePassword = false; await this.audit(user.id, 'auth.password_changed', 'admin_user', user.id, requestId, { sessionId: session.id }); }
  async audit(actorId: string, action: string, targetType: string, targetId: string, requestId: string, detail: Record<string, unknown>, scenicAreaId?: string) { await this.repository.addAudit({ id: randomUUID(), actorId, action, targetType, targetId, requestId, detail, scenicAreaId, createdAt: new Date().toISOString() }); }
  cookieSecure() { return this.config.get('NODE_ENV') === 'production' || this.config.get('COOKIE_SECURE', 'false') === 'true'; }
}
