import { Inject, Injectable } from '@nestjs/common';
import { RepositoryService } from '../database/repository.service';
import type { OverviewSummary, VehicleStatus } from '../domain/models';
import { SystemService } from './system.service';

export const shanghaiDate = (value: string | number | Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value));

@Injectable()
export class OverviewService {
  constructor(
    @Inject(RepositoryService) private readonly repository: RepositoryService,
    @Inject(SystemService) private readonly system: SystemService,
  ) {}

  async summary(scenicAreaId: string): Promise<OverviewSummary> {
    const scenicIds = scenicAreaId === 'all'
      ? (await this.repository.listScenicAreas()).map((item) => item.id)
      : [scenicAreaId];
    const [vehicleLists, orderPage, settlementPage, health] = await Promise.all([
      Promise.all(scenicIds.map((id) => this.repository.listVehicles(id))),
      this.repository.listOrders({ scenicAreaId, page: 1, pageSize: 10_000 }),
      this.repository.listSettlements({ scenicAreaId, page: 1, pageSize: 10_000 }),
      this.system.health(scenicAreaId),
    ]);
    const vehicles = vehicleLists.flat();
    const today = shanghaiDate(Date.now());
    const countVehicles = (status: VehicleStatus) => vehicles.filter((item) => item.status === status).length;
    const terminalToday = (status: 'completed' | 'cancelled') => orderPage.items.filter((item) => (
      item.status === status && shanghaiDate(item.endAt || item.createdAt) === today
    )).length;
    const todaySettlements = settlementPage.items.filter((item) => shanghaiDate(item.settledAt) === today);

    return {
      updatedAt: new Date().toISOString(),
      scenicAreaId,
      vehicles: {
        total: vehicles.length,
        available: countVehicles('available'),
        active: countVehicles('active'),
        charging: countVehicles('charging'),
        offline: countVehicles('offline'),
        fault: countVehicles('fault'),
      },
      orders: {
        waitingPickup: orderPage.items.filter((item) => item.status === 'waiting_pickup').length,
        active: orderPage.items.filter((item) => item.status === 'active').length,
        completedToday: terminalToday('completed'),
        cancelledToday: terminalToday('cancelled'),
      },
      finance: {
        settlementCountToday: todaySettlements.length,
        effectiveAmountCentsToday: todaySettlements.reduce((sum, item) => sum + item.effectiveAmountCents, 0),
      },
      health: { level: health.level, incidentCount: health.incidents.length },
      recentOrders: orderPage.items.slice(0, 5),
      activeVehicles: vehicles.filter((item) => item.status === 'active').slice(0, 4),
    };
  }
}
