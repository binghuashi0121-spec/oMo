const { createHash } = require('node:crypto');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readHidden } = require('./bootstrap-admin-cli');

const root = path.resolve(__dirname, '..', '..');
const webRoot = path.join(root, 'omo-admin-web');
const distRoot = path.join(webRoot, 'dist');

function validateMapKey(value) {
  if (typeof value !== 'string' || !/^[A-Z0-9]{5}(?:-[A-Z0-9]{5}){5}$/.test(value)) {
    throw new Error('腾讯地图 Web Key 格式无效（应为 6 组 5 位大写字母或数字，以连字符分隔）');
  }
}

function createNpmInvocation(options = {}) {
  const execPath = options.execPath ?? process.execPath;
  const npmExecPath = options.npmExecPath ?? process.env.npm_execpath;
  if (!npmExecPath) throw new Error('无法定位 npm；请通过 npm run staging:web:build 运行本脚本');
  return { command: execPath, args: [npmExecPath, 'run', 'build'] };
}

function collectFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const absolute = path.join(directory, name);
    return statSync(absolute).isDirectory() ? collectFiles(absolute) : [absolute];
  });
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function main() {
  if (process.argv.length !== 2) throw new Error('地图 Key 只能通过本机隐藏输入，禁止使用命令参数');
  if (process.env.VITE_TENCENT_MAP_KEY) throw new Error('请清除 VITE_TENCENT_MAP_KEY；本脚本只接受隐藏交互输入');

  let mapKey = (await readHidden('输入 staging 腾讯地图 Web Key（不回显）：')).trim();
  validateMapKey(mapKey);
  const env = { ...process.env, VITE_USE_MOCK: 'false', VITE_TENCENT_MAP_KEY: mapKey };
  const invocation = createNpmInvocation();
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: webRoot,
    env,
    stdio: 'inherit',
    shell: false,
  });
  mapKey = '';
  delete env.VITE_TENCENT_MAP_KEY;
  if (result.error) {
    throw new Error(`无法启动 Web 构建（${result.error.code || 'unknown'}）`);
  }
  if (result.status !== 0) throw new Error(`Web 构建失败（退出码 ${result.status ?? 'unknown'}）`);

  const files = collectFiles(distRoot).sort();
  const indexFile = path.join(distRoot, 'index.html');
  console.log(`[PASS] 真实 API + 腾讯地图构建完成；文件数 ${files.length}`);
  console.log(`[PASS] dist/index.html SHA-256 ${sha256(indexFile)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[staging-web-build]', error instanceof Error ? error.message : '构建失败');
    process.exitCode = 1;
  });
}

module.exports = { validateMapKey, createNpmInvocation };
