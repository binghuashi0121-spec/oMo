import { describe, expect, it } from 'vitest';
import { commandKeyLabel, commandStatusLabel, hasDefinedLatency } from '../src/utils/format';

describe('operational status formatting', () => {
  it('uses Chinese labels for every simulated command state', () => {
    expect(commandStatusLabel).toMatchObject({
      pending: '等待发送',
      sent: '已发送',
      acked: '已确认',
      failed: '失败',
      timed_out: '回执超时',
    });
    expect(commandKeyLabel.safe_stop).toBe('安全停车');
  });

  it('treats zero latency as a valid measurement', () => {
    expect(hasDefinedLatency(0)).toBe(true);
    expect(hasDefinedLatency(undefined)).toBe(false);
  });
});
