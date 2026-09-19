const path = require('node:path');
const { createRequire } = require('node:module');
const { assertTarget, createCliRunner } = require('./provision-nosql');

const username = 'staging_admin';

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('新初始密码需为 12–128 位，包含大写字母、小写字母和数字');
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

async function resetStagingAdmin(run, readSecret, hashSecret) {
  const users = run('admin_users', { find: 'admin_users', filter: { username }, limit: 2 }, 'QUERY');
  if (users.length !== 1) throw new Error('staging_admin 必须恰好存在一条；未修改数据库');
  const user = users[0];
  const id = String(user._id || user.id || '').trim();
  if (!id || user.active !== true) throw new Error('staging_admin 标识无效或已停用；未修改数据库');

  let password = await readSecret('输入新的 staging 初始密码（不回显）：');
  validatePassword(password);
  let confirmation = await readSecret('再次输入确认（不回显）：');
  if (password !== confirmation) throw new Error('两次输入不一致；未修改数据库');
  confirmation = '';
  const passwordHash = await hashSecret(password);
  password = '';
  const now = new Date().toISOString();

  run('admin_users', {
    update: 'admin_users',
    updates: [{ q: { _id: id, username }, u: { $set: { passwordHash, mustChangePassword: true, updatedAt: now } } }],
  }, 'UPDATE');

  const updated = run('admin_users', { find: 'admin_users', filter: { _id: id, username }, limit: 1 }, 'QUERY');
  if (updated.length !== 1 || updated[0].passwordHash !== passwordHash || updated[0].mustChangePassword !== true) {
    throw new Error('staging_admin 回读不匹配；停止后续操作并人工检查');
  }

  const sessions = run('admin_sessions', { find: 'admin_sessions', filter: { userId: id }, limit: 1000 }, 'QUERY');
  for (const session of sessions) {
    const sessionId = String(session._id || session.id || '').trim();
    if (!sessionId) throw new Error('发现无法识别的管理员会话；密码已更新，请检查会话集合');
    run('admin_sessions', { delete: 'admin_sessions', deletes: [{ q: { _id: sessionId }, limit: 1 }] }, 'DELETE');
  }
  const remaining = run('admin_sessions', { find: 'admin_sessions', filter: { userId: id }, limit: 1 }, 'QUERY');
  if (remaining.length) throw new Error('管理员会话未全部失效；密码已更新，请检查会话集合');

  return { username, sessionsInvalidated: sessions.length };
}

if (require.main === module) {
  (async () => {
    assertTarget();
    if (process.argv[2] !== '--apply' || process.env.STAGING_ADMIN_RESET !== 'RESET_STAGING_ADMIN_ONLY') {
      throw new Error('仅允许 staging 目标环境、--apply 和 STAGING_ADMIN_RESET=RESET_STAGING_ADMIN_ONLY');
    }
    if (process.env.BOOTSTRAP_ADMIN_PASSWORD) throw new Error('请清除 BOOTSTRAP_ADMIN_PASSWORD；本脚本只接受隐藏交互输入');

    const cliEntry = path.resolve(process.env.OMO_TCB_CLI_ENTRY || '');
    const run = createCliRunner(cliEntry);
    const argon2 = createRequire(path.resolve(__dirname, '../../omo-admin-api/package.json'))('argon2');
    const result = await resetStagingAdmin(run, readHidden, (secret) => argon2.hash(secret, {
      type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1,
    }));
    console.log(`PASS: ${result.username} 已重置；首次登录需改密；已失效 ${result.sessionsInvalidated} 个旧会话。`);
  })().catch((error) => {
    console.error('[staging-admin-reset]', error instanceof Error ? error.message : '重置失败');
    process.exitCode = 1;
  });
}

module.exports = { validatePassword, readHidden, resetStagingAdmin };
