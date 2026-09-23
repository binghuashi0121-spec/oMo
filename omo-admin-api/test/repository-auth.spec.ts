import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { RepositoryService } from '../src/database/repository.service';

function repository(config: Record<string, string>) {
  return new RepositoryService(new ConfigService({
    DATA_DRIVER: 'cloudbase',
    CLOUDBASE_ENV_ID: 'omo-platform-staging-test',
    TCB_DISABLE_METADATA_PROBE: 'true',
    ...config,
  }));
}

describe('CloudBase repository authentication gate', () => {
  it('rejects the obsolete runtime-auth flag without real credentials', () => {
    expect(() => repository({ CLOUDBASE_RUNTIME_AUTH: 'true' }).initialize())
      .toThrow(ServiceUnavailableException);
  });

  it('accepts an injected server API Key', () => {
    expect(() => repository({ CLOUDBASE_APIKEY: 'staging-test-api-key' }).initialize())
      .not.toThrow();
  });

  it('rejects an incomplete CAM key pair', () => {
    expect(() => repository({ TENCENTCLOUD_SECRETID: 'id-only' }).initialize())
      .toThrow('CloudBase CAM 密钥对配置不完整');
  });
});
