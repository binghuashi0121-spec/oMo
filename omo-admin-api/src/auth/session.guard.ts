import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import { RepositoryService } from '../database/repository.service';
import { isSessionExpired } from '../domain/rules';
import { ALLOW_FORCED_PASSWORD, IS_PUBLIC } from '../common/public.decorator';
import { hashToken } from './auth.service';

function safeEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(RepositoryService) private readonly repository: RepositoryService) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest(); const token = String(req.cookies?.omo_admin_session || ''); if (!token) throw new UnauthorizedException('未登录或会话已失效'); const session = await this.repository.findSessionByTokenHash(hashToken(token)); if (!session || isSessionExpired(session)) { if (session) await this.repository.deleteSession(session.id); throw new UnauthorizedException('未登录或会话已失效'); }
    const user = await this.repository.findAdminById(session.userId); if (!user || !user.active) throw new UnauthorizedException('管理员账号不可用'); req.adminUser = user; req.adminSession = session; req.scenicScope = String(req.header('x-omo-scenic-area-id') || 'all');
    const allowForced = this.reflector.getAllAndOverride<boolean>(ALLOW_FORCED_PASSWORD, [context.getHandler(), context.getClass()]); if (user.mustChangePassword && !allowForced) throw new ForbiddenException('首次登录必须先修改密码');
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) { const csrf = String(req.header('x-csrf-token') || ''); if (!csrf || !safeEqual(csrf, session.csrfToken)) throw new ForbiddenException('CSRF 校验失败'); }
    const isBackgroundHealthProbe = req.method === 'GET' && String(req.originalUrl || req.url || '').includes('/system/health');
    if (!isBackgroundHealthProbe && Date.now() - new Date(session.lastSeenAt).getTime() > 60_000) { session.lastSeenAt = new Date().toISOString(); await this.repository.touchSession(session.id, session.lastSeenAt); }
    return true;
  }
}
