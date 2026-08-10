import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RepositoryService } from '../database/repository.service';
import { aggregateHealth } from '../domain/rules';
import type { HealthLevel } from '../domain/models';

@Injectable()
export class SystemService {
  constructor(@Inject(RepositoryService) private readonly repository: RepositoryService, @Inject(ConfigService) private readonly config: ConfigService) {}
  private async mqttHealth() {
    const checkedAt = new Date().toISOString(); const url = this.config.get<string>('MQTT_BRIDGE_HEALTH_URL');
    if (!url) return { key:'mqtt',name:'MQTT 网关',level:'degraded' as HealthLevel,message:'未配置同环境私有健康探针',checkedAt };
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(),2500);
    try { const token = this.config.get<string>('MQTT_BRIDGE_INTERNAL_TOKEN'); const response = await fetch(url,{signal:controller.signal,headers:token?{authorization:`Bearer ${token}`}:{}}); const body:any = await response.json(); if (!response.ok) return {key:'mqtt',name:'MQTT 网关',level:'critical' as HealthLevel,message:`健康接口返回 HTTP ${response.status}`,checkedAt}; if (!body?.mqtt?.connected) return {key:'mqtt',name:'MQTT 网关',level:'degraded' as HealthLevel,message:'HTTP 可访问，但 MQTT Broker 已断开',checkedAt}; return {key:'mqtt',name:'MQTT 网关',level:'healthy' as HealthLevel,message:'Broker 连接正常',checkedAt}; }
    catch (error) { return {key:'mqtt',name:'MQTT 网关',level:'degraded' as HealthLevel,message:error instanceof Error?`健康探针失败：${error.message}`:'健康探针失败',checkedAt}; }
    finally { clearTimeout(timeout); }
  }
  async health(scenicAreaId: string) {
    const checkedAt = new Date().toISOString(); const started=Date.now(); const db=await this.repository.ping(); const adminApi={key:'admin-api',name:'Admin API',level:'healthy' as HealthLevel,message:'响应正常',checkedAt,latencyMs:Date.now()-started}; const cloudbase={key:'cloudbase',name:'CloudBase 数据库',level:(db.ok?'healthy':'critical') as HealthLevel,message:db.ok?'读写探针正常':db.message||'数据库不可用',checkedAt,latencyMs:db.latencyMs}; const mqtt=await this.mqttHealth();
    const scenicIds=scenicAreaId==='all'?(await this.repository.listScenicAreas()).map((item)=>item.id):[scenicAreaId]; const vehicleLists=await Promise.all(scenicIds.map((id)=>this.repository.listVehicles(id))); const vehicles=vehicleLists.flat(); const stale=vehicles.filter((item)=>Date.now()-new Date(item.heartbeatAt).getTime()>5*60_000).length; const heartbeat={key:'heartbeat',name:'车辆心跳',level:(stale?stale===vehicles.length?'critical':'degraded':'healthy') as HealthLevel,message:stale?`${stale} 台车辆超过 5 分钟未上报`:`${vehicles.length} 台车辆心跳正常`,checkedAt}; const commands=await this.repository.listCommands(scenicAreaId); const recent=commands.filter((item)=>Date.now()-new Date(item.createdAt).getTime()<30*60_000); const failures=recent.filter((item)=>['failed','timed_out'].includes(item.status)).length; const commandStatus={key:'commands',name:'模拟指令回执',level:(failures?'degraded':'healthy') as HealthLevel,message:failures?`近 30 分钟 ${failures} 条模拟指令失败或超时`:'近 30 分钟无失败',checkedAt}; const components=[adminApi,cloudbase,mqtt,heartbeat,commandStatus]; const level=aggregateHealth(components.map((item)=>item.level)); const incidents=components.filter((item)=>item.level!=='healthy').map((item,index)=>({id:`${item.key}-${index}`,title:`${item.name}异常`,level:item.level,occurredAt:checkedAt,detail:item.message})); return { level,summary:level==='healthy'?'全部核心服务运行正常':level==='degraded'?'系统可用，但存在需要关注的异常':'核心服务故障，请立即处理',checkedAt,dataFreshnessAt:checkedAt,components,incidents };
  }
}
