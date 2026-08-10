import type { Order, ScenicArea, Settlement, Vehicle } from '../domain/models';

const iso = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const feature = (coordinates: number[][]) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: '运营路线' }, geometry: { type: 'LineString', coordinates } }] });
export const memoryScenics: ScenicArea[] = [
  { id: 'tianmashan', name: '天马山景区', shortName: '天马山', status: 'active', centerGcj02: { longitude: 112.9471, latitude: 28.17045 }, zoom: 17, routeGeoJson: feature([[112.94658,28.17072],[112.94684,28.17047],[112.94706,28.17034],[112.94730,28.17027],[112.94764,28.17025]]) },
  { id: 'lakeside-demo', name: '湖畔示范景区', shortName: '湖畔示范', status: 'active', centerGcj02: { longitude: 112.9884, latitude: 28.201 }, zoom: 16, routeGeoJson: feature([[112.9871,28.2012],[112.9887,28.2018],[112.9898,28.2009],[112.9884,28.2001],[112.9871,28.2012]]), isDemo: true },
];
export const memoryVehicles: Vehicle[] = [
  { id:'veh-0008',scenicAreaId:'tianmashan',vehicleNo:'OMO-0008',status:'active',batteryPercent:76,heartbeatAt:iso(-1),positionWgs84:{longitude:112.94123,latitude:28.17361},positionGcj02:{longitude:112.94684,latitude:28.17047},activeOrderId:'trip-1',speedKph:4.2 },
  { id:'veh-0012',scenicAreaId:'tianmashan',vehicleNo:'OMO-0012',status:'available',batteryPercent:92,heartbeatAt:iso(-1),positionWgs84:{longitude:112.94170,latitude:28.17314},positionGcj02:{longitude:112.94730,latitude:28.17027},speedKph:0 },
  { id:'veh-demo-1',scenicAreaId:'lakeside-demo',vehicleNo:'DEMO-01',status:'fault',batteryPercent:43,heartbeatAt:iso(-8),positionWgs84:{longitude:112.9834,latitude:28.2034},positionGcj02:{longitude:112.9895,latitude:28.2015},speedKph:0,isDemo:true },
];
export const memoryOrders: Order[] = [
  { id:'trip-1',scenicAreaId:'tianmashan',orderNo:'OM202608100001',userMasked:'138****2068',vehicleId:'veh-0008',vehicleNo:'OMO-0008',status:'active',startAt:iso(-38),createdAt:iso(-44),distanceKm:2.14,durationMinutes:38,originalAmountCents:2540,effectiveAmountCents:2540,noteCount:0 },
  { id:'trip-2',scenicAreaId:'tianmashan',orderNo:'OM202608100002',userMasked:'186****7721',vehicleId:'veh-0012',vehicleNo:'OMO-0012',status:'completed',startAt:iso(-172),endAt:iso(-126),createdAt:iso(-180),distanceKm:3.45,durationMinutes:46,originalAmountCents:3275,effectiveAmountCents:3275,noteCount:0 },
  { id:'trip-demo',scenicAreaId:'lakeside-demo',orderNo:'DEMO202608001',userMasked:'139****0001',vehicleId:'veh-demo-1',vehicleNo:'DEMO-01',status:'completed',startAt:iso(-290),endAt:iso(-240),createdAt:iso(-300),distanceKm:2.8,durationMinutes:50,originalAmountCents:2900,effectiveAmountCents:2900,noteCount:0,isDemo:true },
];
export const memorySettlements: Settlement[] = [
  { id:'settle-1',scenicAreaId:'tianmashan',orderId:'trip-2',orderNo:'OM202608100002',originalAmountCents:3275,adjustmentAmountCents:0,effectiveAmountCents:3275,paymentStatus:'demo_paid',settledAt:iso(-125),adjustments:[] },
  { id:'settle-demo',scenicAreaId:'lakeside-demo',orderId:'trip-demo',orderNo:'DEMO202608001',originalAmountCents:2900,adjustmentAmountCents:0,effectiveAmountCents:2900,paymentStatus:'demo_paid',settledAt:iso(-239),adjustments:[],isDemo:true },
];
