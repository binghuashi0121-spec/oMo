import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AllowForcedPassword, Public } from '../common/public.decorator';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private cookieOptions(secure: boolean) { return { httpOnly: true, secure, sameSite: 'strict' as const, path: '/api/admin/v1' }; }
  @Public() @Post('login') async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) { const result = await this.auth.login(dto.username, dto.password, req.ip || req.socket.remoteAddress || 'unknown', String(req.header('user-agent') || ''), req.requestId); res.cookie('omo_admin_session', result.rawToken, { ...this.cookieOptions(this.auth.cookieSecure()), maxAge: 8 * 60 * 60_000 }); return this.auth.sessionInfo(result.user, result.session); }
  @AllowForcedPassword() @Post('logout') async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { await this.auth.logout(req.adminUser!, req.adminSession!, req.requestId); res.clearCookie('omo_admin_session', this.cookieOptions(this.auth.cookieSecure())); }
  @AllowForcedPassword() @Get('me') me(@Req() req: Request) { return this.auth.sessionInfo(req.adminUser!, req.adminSession!); }
  @AllowForcedPassword() @Post('password') async password(@Body() dto: ChangePasswordDto, @Req() req: Request) { await this.auth.changePassword(req.adminUser!, req.adminSession!, dto.currentPassword, dto.newPassword, req.requestId); }
}
