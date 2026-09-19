import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { RepositoryService } from '../src/database/repository.service';
import { passwordHashOptions } from '../src/auth/auth.service';

async function main() {
  const username = String(process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
  const displayName = String(process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME || '超级管理员').trim();
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) throw new Error('BOOTSTRAP_ADMIN_USERNAME 格式无效');
  if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) throw new Error('BOOTSTRAP_ADMIN_PASSWORD 至少 12 位，并包含大写字母、小写字母和数字');
  const repository = new RepositoryService(new ConfigService()); repository.initialize();
  if (await repository.findAdminByUsername(username)) throw new Error(`管理员 ${username} 已存在，初始化脚本不会覆盖`);
  const now = new Date().toISOString();
  await repository.createAdmin({ id: randomUUID(), username, displayName, role: 'super_admin', passwordHash: await argon2.hash(password, passwordHashOptions), mustChangePassword: true, active: true, createdAt: now, updatedAt: now });
  console.log(`管理员 ${username} 已创建；首次登录必须修改密码。`);
}
main().catch((error) => { console.error('[bootstrap-admin]', error instanceof Error ? error.message : error); process.exitCode = 1; });
