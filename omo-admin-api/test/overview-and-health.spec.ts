import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shanghaiDate } from '../src/business/overview.service';
import { SystemService } from '../src/business/system.service';

const repository = {
  ping: async () => ({ ok: true, latencyMs: 1 }),
  listVehicles: async () => [],
  listScenicAreas: async () => [{ id: 'tianmashan' }],
  listCommands: async () => [],
} as any;

describe('overview dates and bridge health', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the Asia/Shanghai calendar day at UTC boundaries', () => {
    expect(shanghaiDate('2026-09-14T15:59:59.000Z')).toBe('2026-09-14');
    expect(shanghaiDate('2026-09-14T16:00:00.000Z')).toBe('2026-09-15');
  });

  it('is critical when bridge CloudBase is not ready', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cloudbase: { ready: false }, mqtt: { connected: true } }) })));
    const result = await new SystemService(repository, new ConfigService({ MQTT_BRIDGE_HEALTH_URL: 'http://bridge/mqtt/health' })).health('tianmashan');
    expect(result.components.find((item) => item.key === 'mqtt')).toMatchObject({ level: 'critical', message: 'MQTT 网关无法访问 CloudBase' });
  });

  it('is degraded when MQTT is disconnected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cloudbase: { ready: true }, mqtt: { connected: false } }) })));
    const result = await new SystemService(repository, new ConfigService({ MQTT_BRIDGE_HEALTH_URL: 'http://bridge/mqtt/health' })).health('tianmashan');
    expect(result.components.find((item) => item.key === 'mqtt')).toMatchObject({ level: 'degraded' });
  });
});
