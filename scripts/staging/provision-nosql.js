const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const manifest = require('../../deploy/staging/manifest.json');
const adminSchema = require('../../omo-admin-api/cloudbase/schema/collections.json');
const adminIndexes = require('../../omo-admin-api/cloudbase/schema/indexes.json');
const businessIndexes = require('../cloudbase/index-specs.json');

const environmentId = 'omo-platform-staging-d5a30d0fd8f';
const collections = [...new Set([...adminSchema.collections, ...adminSchema.existingCollectionsExtended, 'SmsCode', 'User', 'Session'])];
const indexSpecs = [...adminIndexes.indexes, ...businessIndexes.indexes];
const route = (coordinates) => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { name: '运营路线' }, geometry: { type: 'LineString', coordinates } }],
});
const seeds = [
  { collection: 'scenic_areas', id: 'tianmashan', document: {
    id: 'tianmashan', name: '天马山景区', shortName: '天马山', status: 'active',
    centerGcj02: { longitude: 112.9471, latitude: 28.17045 }, zoom: 17,
    routeGeoJson: route([[112.94658, 28.17072], [112.94684, 28.17047], [112.94706, 28.17034], [112.94730, 28.17027], [112.94764, 28.17025]]),
  } },
  { collection: 'scenic_areas', id: 'lakeside-demo', document: {
    id: 'lakeside-demo', name: '湖畔示范景区', shortName: '湖畔示范', status: 'active',
    centerGcj02: { longitude: 112.9884, latitude: 28.201 }, zoom: 16, isDemo: true,
    routeGeoJson: route([[112.9871, 28.2012], [112.9887, 28.2018], [112.9898, 28.2009], [112.9884, 28.2001], [112.9871, 28.2012]]),
  } },
  { collection: 'vehicles', id: 'OMO_STAGING_0001', document: {
    ugvID: 'OMO_STAGING_0001', vehicleNo: 'OMO_STAGING_0001', scenicAreaId: 'tianmashan',
    status: 'available', activeOrderId: null, batteryPercent: 100, speedKph: 0,
    positionWgs84: { longitude: 112.94170, latitude: 28.17314 },
  } },
];

function assertTarget(env = process.env) {
  if (manifest.environmentId !== environmentId || env.OMO_STAGING_ENV_ID !== environmentId ||
      env.TCB_ENV !== environmentId || env.CLOUDBASE_ENV_ID !== environmentId ||
      env.OMO_STAGING_ENV_NAME !== manifest.environmentName) {
    throw new Error('环境配置与已核验的文档型数据库 staging 环境不一致');
  }
}

function normalizeResult(result) {
  const data = result?.data?.results?.[0];
  if (!Array.isArray(data)) throw new Error('CloudBase 返回格式异常');
  return data;
}

function createCliRunner(cliEntry, env = process.env) {
  if (!cliEntry || !fs.existsSync(cliEntry)) throw new Error('需设置 OMO_TCB_CLI_ENTRY 指向已安装的 CloudBase CLI bin/tcb');
  return (table, command, commandType = 'COMMAND') => {
    const request = JSON.stringify([{ TableName: table, CommandType: commandType, Command: JSON.stringify(command) }]);
    const result = spawnSync(process.execPath, [cliEntry, '-e', environmentId, 'db', 'nosql', 'execute', '--command', request, '--json'],
      { env, encoding: 'utf8', maxBuffer: 2_000_000, timeout: 30_000 });
    if (result.status !== 0) throw new Error(`CloudBase ${table} ${commandType} 失败：${String(result.stderr || result.stdout || result.error).trim()}`);
    return normalizeResult(JSON.parse(result.stdout));
  };
}

function indexName(spec) {
  return spec.name || spec.fields.map(({ field, order }) => `${field}_${order === 'desc' ? '-1' : '1'}`).join('_');
}

function indexDefinition(spec) {
  return {
    key: Object.fromEntries(spec.fields.map(({ field, order }) => [field, order === 'desc' ? -1 : 1])),
    name: indexName(spec),
    ...(spec.unique ? { unique: true } : {}),
  };
}

function provision(run) {
  const before = run('scenic_areas', { listCollections: 1 }).map((item) => item.name);
  const unexpected = before.filter((name) => !collections.includes(name));
  if (unexpected.length) throw new Error(`环境包含计划外集合，停止：${unexpected.join(', ')}`);
  for (const name of collections) {
    if (!before.includes(name)) { run(name, { create: name }); console.log(`created collection: ${name}`); }
  }
  const after = run('scenic_areas', { listCollections: 1 }).map((item) => item.name);
  for (const name of collections) if (!after.includes(name)) throw new Error(`集合未创建成功：${name}`);
  for (const spec of indexSpecs) {
    const existing = run(spec.collection, { listIndexes: spec.collection }).map((item) => item.name);
    const definition = indexDefinition(spec);
    if (!existing.includes(definition.name)) {
      run(spec.collection, { createIndexes: spec.collection, indexes: [definition] });
      console.log(`created index: ${spec.collection}.${definition.name}`);
    }
  }
  for (const spec of indexSpecs) {
    const existing = run(spec.collection, { listIndexes: spec.collection }).map((item) => item.name);
    if (!existing.includes(indexName(spec))) throw new Error(`索引未创建成功：${spec.collection}.${indexName(spec)}`);
  }
  const now = new Date().toISOString();
  for (const seed of seeds) {
    const existing = run(seed.collection, { find: seed.collection, filter: { _id: seed.id }, limit: 1 }, 'QUERY');
    if (existing.length) {
      if (existing[0]._id !== seed.id) throw new Error(`种子数据冲突：${seed.collection}/${seed.id}`);
      console.log(`kept seed: ${seed.collection}/${seed.id}`);
      continue;
    }
    run(seed.collection, { insert: seed.collection, documents: [{ _id: seed.id, ...seed.document, createdAt: now, updatedAt: now }] }, 'INSERT');
    console.log(`seeded: ${seed.collection}/${seed.id}`);
  }
  for (const seed of seeds) {
    const found = run(seed.collection, { find: seed.collection, filter: { _id: seed.id }, limit: 1 }, 'QUERY');
    if (found.length !== 1) throw new Error(`种子数据回读失败：${seed.collection}/${seed.id}`);
  }
  console.log(`PASS: ${collections.length} collections, ${indexSpecs.length} indexes, ${seeds.length} seeds`);
}

if (require.main === module) {
  try {
    assertTarget();
    console.log(`target=${environmentId}; collections=${collections.length}; indexes=${indexSpecs.length}; seeds=${seeds.length}`);
    if (process.argv[2] !== '--apply') {
      console.log('DRY RUN ONLY. Pass --apply with STAGING_SETUP_APPLY=CREATE_FRESH_STAGING_ONLY to write.');
    } else {
      if (process.env.STAGING_SETUP_APPLY !== 'CREATE_FRESH_STAGING_ONLY') throw new Error('缺少写入确认变量');
      provision(createCliRunner(path.resolve(process.env.OMO_TCB_CLI_ENTRY || '')));
    }
  } catch (error) {
    console.error('[staging-nosql]', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = { assertTarget, collections, indexSpecs, seeds, indexDefinition, provision };
