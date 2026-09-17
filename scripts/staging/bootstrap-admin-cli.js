const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { assertTarget, createCliRunner } = require('./provision-nosql');

const username = 'staging_admin';
const displayName = 'Staging 管理员';

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('初始密码需为 12–128 位，包含大写字母、小写字母和数字');
  }
}

function readHidden(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('请在本机交互终端运行；密码不能通过参数或管道传入');
  }
  return new Promise((resolve, reject) => {
    let value = '';
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 3) { finish(new Error('已取消密码输入')); return; }
        if (byte === 13 || byte === 10) { finish(); return; }
        if (byte === 8 || byte === 127) { value = value.slice(0, -1); continue; }
        if (byte >= 32 && byte <= 126 && value.length < 128) value += String.fromCharCode(byte);
      }
    };
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function createStagingAdmin(run, readSecret, hashSecret, options = {}) {
  const existing = run('admin_users', { find: 'admin_users', filter: {}, limit: 1 }, 'QUERY');
  if (existing.length) throw new Error('staging 已有管理员；一次性脚本不会添加或覆盖账号');
  let password = await readSecret('输入 staging 管理员初始密码（输入不回显）：');
  validatePassword(password);
  let confirmation = await readSecret('再次输入以确认（输入不回显）：');
  if (password !== confirmation) throw new Error('两次输入的密码不一致；未写入数据库');
  confirmation = '';
  const passwordHash = await hashSecret(password);
  password = '';
  const id = options.id || randomUUID();
  const now = options.now || new Date().toISOString();
  const document = { _id: id, id, username, displayName, role: 'super_admin', passwordHash,
    mustChangePassword: true, active: true, createdAt: now, updatedAt: now };
  run('admin_users', { insert: 'admin_users', documents: [document] }, 'INSERT');
  const found = run('admin_users', { find: 'admin_users', filter: { _id: id }, limit: 1 }, 'QUERY');
  if (found.length !== 1 || found[0].passwordHash !== passwordHash ||
      found[0].mustChangePassword !== true || found[0].username !== username) {
    throw new Error('管理员回读不匹配；停止后续部署并人工检查');
  }
  return { id, username };
}

if (require.main === module) {
  (async () => {
    assertTarget();
    if (process.argv[2] !== '--apply' || process.env.STAGING_ADMIN_APPLY !== 'CREATE_ONE_TIME_ADMIN_ONLY') {
      throw new Error('仅允许 --apply 且设置 STAGING_ADMIN_APPLY=CREATE_ONE_TIME_ADMIN_ONLY');
    }
    if (process.env.BOOTSTRAP_ADMIN_PASSWORD) throw new Error('请先清除 BOOTSTRAP_ADMIN_PASSWORD；本脚本只接受隐藏交互输入');
    const run = createCliRunner(path.resolve(process.env.OMO_TCB_CLI_ENTRY || ''));
    const argon2 = createRequire(path.resolve(__dirname, '../../omo-admin-api/package.json'))('argon2');
    const result = await createStagingAdmin(run, readHidden, (secret) => argon2.hash(secret, {
      type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1,
    }));
    console.log(`PASS: 一次性管理员 ${result.username} 已创建，首次登录须改密；请勿再次运行初始化。`);
  })().catch((error) => {
    console.error('[staging-admin]', error instanceof Error ? error.message : '初始化失败');
    process.exitCode = 1;
  });
}

module.exports = { validatePassword, readHidden, createStagingAdmin };
