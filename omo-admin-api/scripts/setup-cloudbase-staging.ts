import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { RepositoryService } from '../src/database/repository.service';
import { memoryScenics } from '../src/database/memory-seed';
const adminSchema = require('../cloudbase/schema/collections.json') as { collections: string[]; existingCollectionsExtended: string[] };
const adminIndexes = require('../cloudbase/schema/indexes.json') as { indexes: unknown[] };
const businessIndexes = require('../../scripts/cloudbase/index-specs.json') as { indexes: unknown[] };

const purchasedEnvId = 'omo-platform-staging-d5a30d0fd8f';
const vehicleId = 'OMO_STAGING_0001';
const collections = [...new Set([
  ...adminSchema.collections,
  ...adminSchema.existingCollectionsExtended,
  'SmsCode', 'User', 'Session',
])];

function assertTarget() {
  const envId = String(process.env.OMO_STAGING_ENV_ID || '').trim();
  if (envId !== purchasedEnvId) throw new Error('目标不是已购买的 staging 环境 ID');
  if (process.env.OMO_STAGING_ENV_NAME !== 'omo-platform-staging') throw new Error('必须核对 staging 环境显示名');
  if (process.env.CLOUDBASE_ENV_ID !== envId || process.env.TCB_ENV !== envId) throw new Error('CloudBase 环境变量必须与 staging ID 一致');
  return envId;
}

async function documentExists(db: any, collection: string, id: string) {
  const result = await db.collection(collection).doc(id).get();
  return Array.isArray(result?.data) ? result.data.length > 0 : Boolean(result?.data);
}

async function createCollection(db: any, name: string) {
  try {
    await db.createCollection(name);
    console.log(`created collection: ${name}`);
  } catch (error) {
    const message = String((error as Error)?.message || error);
    if (!/(exist|already|Existed)/i.test(message)) throw error;
    console.log(`kept collection: ${name}`);
  }
}

async function main() {
  const envId = assertTarget();
  console.log(`target=${envId}; collections=${collections.length}; indexSpecs=${adminIndexes.indexes.length + businessIndexes.indexes.length}; scenics=2; vehicles=1`);
  if (process.env.STAGING_SETUP_APPLY !== 'CREATE_FRESH_STAGING_ONLY') {
    console.log('DRY RUN ONLY. No CloudBase connection or write was made. Set STAGING_SETUP_APPLY=CREATE_FRESH_STAGING_ONLY for an explicitly approved new environment.');
    return;
  }
  if (process.env.DATA_DRIVER !== 'cloudbase') throw new Error('写入必须显式设置 DATA_DRIVER=cloudbase');
  const repository = new RepositoryService(new ConfigService());
  repository.initialize();
  const db = repository.rawDatabase();
  for (const name of collections) await createCollection(db, name);
  const now = new Date().toISOString();
  for (const scenic of memoryScenics) {
    if (await documentExists(db, 'scenic_areas', scenic.id)) throw new Error(`景区 ${scenic.id} 已存在；停止，避免覆盖现有数据`);
    await db.collection('scenic_areas').doc(scenic.id).set({ ...scenic, createdAt: now, updatedAt: now });
    console.log(`seeded scenic: ${scenic.id}`);
  }
  if (await documentExists(db, 'vehicles', vehicleId)) throw new Error(`车辆 ${vehicleId} 已存在；停止，避免覆盖现有数据`);
  await db.collection('vehicles').doc(vehicleId).set({
    ugvID: vehicleId, vehicleNo: vehicleId, scenicAreaId: 'tianmashan', status: 'available',
    activeOrderId: null, batteryPercent: 100, speedKph: 0,
    positionWgs84: { longitude: 112.94170, latitude: 28.17314 },
    createdAt: now, updatedAt: now,
  });
  console.log(`seeded vehicle: ${vehicleId}`);
  console.log('集合与测试数据已创建。必须按两份索引规格在控制台创建并核对索引，之后再单独运行一次性管理员初始化。');
}

main().catch((error) => {
  console.error('[staging-setup]', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
