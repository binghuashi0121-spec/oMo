import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { DevelopmentAdminBootstrapService } from '../src/auth/development-admin-bootstrap.service';
import { verifyPassword } from '../src/auth/password-hash';
import { RepositoryService } from '../src/database/repository.service';

function configured(nodeEnv = 'development') {
  const config = new ConfigService({
    NODE_ENV: nodeEnv,
    DATA_DRIVER: 'memory',
    DEV_BOOTSTRAP_ADMIN_ENABLED: 'true',
    BOOTSTRAP_ADMIN_USERNAME: 'LocalAdmin',
    BOOTSTRAP_ADMIN_PASSWORD: 'Local-Integration-A1',
    BOOTSTRAP_ADMIN_DISPLAY_NAME: '本地管理员',
  });
  const repository = new RepositoryService(config);
  return { repository, service: new DevelopmentAdminBootstrapService(repository, config) };
}

describe('development admin bootstrap', () => {
  it('creates the administrator in the running memory repository and remains idempotent', async () => {
    const { repository, service } = configured();
    await service.onModuleInit();
    await service.onModuleInit();
    const user = await repository.findAdminByUsername('localadmin');
    expect(user).toMatchObject({ username: 'localadmin', displayName: '本地管理员', mustChangePassword: true });
    expect(await verifyPassword(user!.passwordHash, 'Local-Integration-A1')).toBe(true);
  });

  it('recreates memory state for a new process instance', async () => {
    const first = configured(); await first.service.onModuleInit();
    const second = configured(); expect(await second.repository.findAdminByUsername('localadmin')).toBeNull();
    await second.service.onModuleInit(); expect(await second.repository.findAdminByUsername('localadmin')).not.toBeNull();
  });

  it('refuses to start in production', async () => {
    const { service } = configured('production');
    await expect(service.onModuleInit()).rejects.toThrow(/仅允许/);
  });
});
