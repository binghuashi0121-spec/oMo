import { describe, expect, it } from 'vitest';
import { mockApi } from '../src/api/mock';

describe('admin web mock contract', () => {
  it('requires the demo administrator account and creates a session', async () => {
    await expect(mockApi.login({ username:'guest', password:'123456' })).rejects.toThrow();
    const session=await mockApi.login({username:'admin',password:'123456'}); expect(session.user.role).toBe('super_admin'); expect((await mockApi.me()).user.id).toBe(session.user.id);
  });
  it('isolates map and order data by scenic area', async () => {
    const scenics=await mockApi.scenicAreas(); expect(scenics).toHaveLength(2); const tianma=await mockApi.mapVehicles('tianmashan'); const lake=await mockApi.mapVehicles('lakeside-demo'); expect(tianma.every((item)=>item.scenicAreaId==='tianmashan')).toBe(true); expect(lake.every((item)=>item.scenicAreaId==='lakeside-demo')).toBe(true); const orders=await mockApi.orders({scenicAreaId:'lakeside-demo'}); expect(orders.items.every((item)=>item.scenicAreaId==='lakeside-demo')).toBe(true);
  });
  it('keeps original settlement immutable across adjustment and reversal', async () => {
    const before=await mockApi.settlement('settle-2'); const key=crypto.randomUUID(); const adjusted=await mockApi.adjustSettlement('settle-2',{type:'credit',amountCents:300,reason:'测试运营补偿',idempotencyKey:key}); const duplicate=await mockApi.adjustSettlement('settle-2',{type:'credit',amountCents:300,reason:'测试运营补偿',idempotencyKey:key}); expect(duplicate.adjustments).toHaveLength(1); await expect(mockApi.adjustSettlement('settle-2',{type:'credit',amountCents:301,reason:'测试运营补偿',idempotencyKey:key})).rejects.toThrow(/幂等键/); expect(adjusted.originalAmountCents).toBe(before.originalAmountCents); expect(adjusted.effectiveAmountCents).toBe(before.effectiveAmountCents-300); const row=adjusted.adjustments!.at(-1)!; const reversed=await mockApi.reverseAdjustment('settle-2',row.id,'测试撤销补偿',crypto.randomUUID()); expect(reversed.originalAmountCents).toBe(before.originalAmountCents); expect(reversed.effectiveAmountCents).toBe(before.effectiveAmountCents); expect(reversed.adjustments).toHaveLength(2);
  });
  it('does not report healthy in degraded MQTT scenario', async () => { const result=await mockApi.setMockHealthScenario!('degraded'); expect(result.level).toBe('degraded'); expect(result.components.find((item)=>item.key==='mqtt')?.level).toBe('degraded'); });
  it('accepts only simulated command whitelist', async () => { await expect(mockApi.sendVehicleCommand({scenicAreaId:'tianmashan',vehicleId:'veh-0008',commandKey:'raw_topic',params:{},reason:'测试拒绝原始指令',idempotencyKey:crypto.randomUUID()})).rejects.toThrow(/白名单/); const command=await mockApi.sendVehicleCommand({scenicAreaId:'tianmashan',vehicleId:'veh-0008',commandKey:'query_status',params:{},reason:'测试查询状态',idempotencyKey:crypto.randomUUID()}); expect(command).toMatchObject({simulated:true,status:'sent'}); });
});
