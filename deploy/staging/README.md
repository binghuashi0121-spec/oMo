# oMo staging 发布门禁

本目录只有不含密钥的发布意图。唯一可用的环境显示名为 `omo-platform-staging`，已购买的环境 ID 为 `omo-platform-staging-d3acae2142c`；其他环境 ID 和现有生产 ID 均被本地检查拒绝。不要运行天马山历史迁移脚本、导入生产备份或修改 `omo-mini-program/project.config.json`。

## 1. 检查点与准备

在 Git 检查点之后，使用 Node 22 和已授权的 CloudBase CLI。先运行 `npm run staging:test` 与 `npm run staging:check`；后者确认服务规格、全部 10 个云函数目录、集合/索引文件和 MQTT 隔离配置。任何云端写入前还应核对当前 `tcb env list` 返回的环境 ID、显示名、套餐及地域，明确排除生产环境。

用户已购买 staging 环境，不再运行 `tcb env create`。2026-09-17 的截图显示环境 `UNAVAILABLE`；必须先在控制台确认环境变为可用，并在 CLI 登录后用 `tcb env list` 复核 ID、显示名、套餐、地域和服务能力。若仍不可用，停止云端写入并调查初始化状态，不删除重建，也不改用生产环境。

## 2. 部署前参数检查

仅在本地临时进程环境中设置非密钥参数：

```powershell
$env:OMO_STAGING_ENV_ID='omo-platform-staging-d3acae2142c'
$env:OMO_STAGING_ENV_NAME='omo-platform-staging'
$env:OMO_STAGING_MQTT_URL='mqtts://<独立测试 Broker 主机>:8883'
$env:OMO_STAGING_WEB_ORIGIN='https://<最终默认域名>'
$env:TCB_ENV=$env:OMO_STAGING_ENV_ID
$env:CLOUDBASE_ENV_ID=$env:OMO_STAGING_ENV_ID
node scripts/staging/check-config.js deploy
```

不打印、提交或记录 MQTT 密码、CAM 密钥、管理员初始密码、地图 Key、微信上传私钥。云托管配置与密钥放在 CloudBase 控制台 Secret；独立 Broker 账号只授权测试 Topic。`MQTT_CLIENT_ID=omo-mqtt-bridge-staging`，`WECHAT_APP_ID` 与小程序 AppID 一致。Bridge 和 API 测试窗口均固定 `min=1,max=1`。

## 3. 按顺序发布与停机门禁

1. 设置并核对 staging 环境变量后，先运行 `npm --prefix omo-admin-api run cloudbase:staging:setup` 查看无写入预览。仅在确认是全新环境后，临时设置 `DATA_DRIVER=cloudbase` 与 `STAGING_SETUP_APPLY=CREATE_FRESH_STAGING_ONLY` 再运行同一命令。脚本只创建集合、两个测试景区和一台 `OMO_STAGING_0001` 测试车，已有测试数据会导致停止而非覆盖。按 `manifest.json` 指向的两份索引规格在控制台创建并核对索引，特别核对四个管理唯一索引。一次性 staging 管理员单独初始化，首次改密后撤去初始化凭据。
2. 部署独立 EMQX Cloud TLS Broker 后，用单独测试客户端确认 TLS、Topic ACL 和唯一 Client ID；禁止连接生产 Broker。
3. 部署 `mqtt-bridge-staging`（端口 3000），设置 `OMO_STAGING_MODE=true`，启动时强制检查环境 ID、TLS、独立账号和固定 Client ID。`/mqtt/health` 的 `cloudbase.ready` 与 `mqtt.connected` 都为 true 才继续。CloudBase CLI 实际版本帮助中的参数是 `--service-name`、`--source`、`--min-num 1`、`--max-num 1`、`--wait`；先运行本地配置检查并核对 CLI 帮助，不以旧文档中 `--dry-run` 一定可用为前提。
4. 将清单中的 10 个小程序云函数逐个部署到指定环境，部署后查询所属环境和调用结果，不使用生产函数作兜底。
5. 部署 `admin-api-staging`（端口 3001，`DATA_DRIVER=cloudbase`、`NODE_ENV=production`、`COOKIE_SECURE=true`、`DEV_BOOTSTRAP_ADMIN_ENABLED=false`、精确 HTTPS `ADMIN_WEB_ORIGIN`），检查 `/live`、登录和受保护接口。
6. `VITE_USE_MOCK=false` 构建 Web，记录 `dist` 校验值。静态托管使用 `tcb hosting deploy ./omo-admin-web/dist / -e <ID> --safe --verify`，不使用 `--prune`。配置 `/api/*` 到 API 且保留路径、SPA 错误页为 `index.html`，实际默认域名必须 HTTPS。
7. 腾讯地图 Web Key 只允许最终 staging 域名；配置后重新构建并发布，不把 Key 写入 Git。地图 SDK Marker 必须实测，降级地图不算通过。
8. 将小程序 trial 环境 ID 更新为同一个 ID，运行 `node scripts/staging/check-config.js trial`；再用微信开发者工具 CLI 上传 `staging-YYYYMMDD-HHmm`，仅设置体验成员，不提交正式审核。

每一步失败立即停止。Web 发布前保留上一版本和校验值；云托管保留上一修订；第一次部署失败不切换生产。静态托管 `--safe` 远端备份默认不会自动清理。当前测试只可标记“手机真机 + MQTT 模拟车辆”，iPhone、Android 缺一时列为未验证；最小实例数降回 0 应在验收报告完成后另行确认。
