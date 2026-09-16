import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { RepositoryService } from '../database/repository.service';
import { passwordHashOptions } from './auth.service';

@Injectable()
export class DevelopmentAdminBootstrapService implements OnModuleInit {
  constructor(
    @Inject(RepositoryService) private readonly repository: RepositoryService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (this.config.get('DEV_BOOTSTRAP_ADMIN_ENABLED', 'false') !== 'true') return;
    const nodeEnv = this.config.get('NODE_ENV', 'development');
    if (!['development', 'test'].includes(nodeEnv)) throw new Error('DEV_BOOTSTRAP_ADMIN_ENABLED 仅允许在 development/test 环境启用');
    if (this.repository.isCloudbase()) throw new Error('开发管理员同进程初始化仅允许 DATA_DRIVER=memory');

    const username = this.config.get<string>('BOOTSTRAP_ADMIN_USERNAME')?.trim().toLowerCase();
    const password = this.config.get<string>('BOOTSTRAP_ADMIN_PASSWORD') || '';
    const displayName = this.config.get<string>('BOOTSTRAP_ADMIN_DISPLAY_NAME')?.trim();
    if (!username || !displayName || password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      throw new Error('启用开发管理员时必须提供用户名、显示名及至少 12 位且包含大小写字母和数字的密码');
    }
    if (await this.repository.findAdminByUsername(username)) return;
    const now = new Date().toISOString();
    await this.repository.createAdmin({
      id: randomUUID(), username, displayName, role: 'super_admin',
      passwordHash: await argon2.hash(password, passwordHashOptions),
      mustChangePassword: true, active: true, createdAt: now, updatedAt: now,
    });
  }
}
