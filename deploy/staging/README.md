# oMo staging 发布门禁

本目录只有不含密钥的发布意图。唯一可用的环境显示名为 `omo-platform-staging`，当前文档型数据库环境 ID 为 `omo-platform-staging-d5a30d0fd8f`；其他环境 ID 和现有生产 ID 均被本地检查拒绝。不要运行天马山历史迁移脚本、导入生产备份或修改 `omo-mini-program/project.config.json`。

## 1. 检查点与准备

在 Git 检查点之后，使用 Node 22 和已授权的 CloudBase CLI。先运行 `npm run staging:test` 与 `npm run staging:check`；后者确认服务规格、全部 10 个云函数目录、集合/索引文件和 MQTT 隔离配置。任何云端写入前还应核对当前 `tcb env list` 返回的环境 ID、显示名、套餐及地域，明确排除生产环境。

用户已创建新的 staging 文档型数据库环境，不再运行 `tcb env create`。在 CLI 登录后用 `tcb env list` 复核 ID、显示名、套餐、地域和服务能力。若不可用，停止云端写入并调查初始化状态，不删除重建，也不改用生产环境。

2026-09-17 只读核验：旧 ID `omo-platform-staging-d3acae2142c` 已 `ISOLATE`，其数据库为 PostgreSQL，不作本轮目标。新 ID `omo-platform-staging-d5a30d0fd8f` 为 `NORMAL`，`Databases[0].Status=RUNNING`，静态托管 `online`，只读 NoSQL `listCollections` 返回空集合清单。所有写入、部署和验收只允许新 ID。

## 2. 部署前参数检查

仅在本地临时进程环境中设置非密钥参数：

```powershell
$env:OMO_STAGING_ENV_ID='omo-platform-staging-d5a30d0fd8f'
$env:OMO_STAGING_ENV_NAME='omo-platform-staging'
$env:OMO_STAGING_MQTT_URL='mqtts://<独立测试 Broker 主机>:8883'
$env:OMO_STAGING_WEB_ORIGIN='https://<最终默认域名>'
$env:TCB_ENV=$env:OMO_STAGING_ENV_ID
$env:CLOUDBASE_ENV_ID=$env:OMO_STAGING_ENV_ID
node scripts/staging/check-config.js deploy
```

不打印、提交或记录 MQTT 密码、CAM 密钥、管理员初始密码、地图 Key、微信上传私钥。云托管配置与密钥放在 CloudBase 控制台 Secret；独立 Broker 账号只授权测试 Topic。`MQTT_CLIENT_ID=omo-mqtt-bridge-staging`，`WECHAT_APP_ID` 与小程序 AppID 一致。Bridge 和 API 测试窗口均固定 `min=1,max=1`。

## 3. 按顺序发布与停机门禁

1. 设置并核对 staging 环境变量、`OMO_TCB_CLI_ENTRY`（本机 CLI 的 `node_modules/@cloudbase/cli/bin/tcb` 绝对路径）后，运行 `npm run staging:nosql -- --verify` 进行无写入回读。已创建的 16 个集合、22 条索引和 3 条测试数据不可重新初始化或覆盖。随后在本机交互终端临时设置 `STAGING_ADMIN_APPLY=CREATE_ONE_TIME_ADMIN_ONLY`，运行 `npm run staging:admin -- --apply`，按提示隐藏输入并确认初始密码；脚本只创建 `staging_admin`，以 Argon2id 哈希存储，标记首次登录强制改密，并在账号已存在时拒绝再写入。运行后清除该临时确认变量；初始密码只由用户本人保存，不发送到聊天或提交到仓库。
2. 部署独立 EMQX Cloud TLS Broker 后，用单独测试客户端确认 TLS、Topic ACL 和唯一 Client ID；禁止连接生产 Broker。
3. 部署 `mqtt-bridge-staging`（端口 3000），设置 `OMO_STAGING_MODE=true`，启动时强制检查环境 ID、TLS、独立账号和固定 Client ID。`/mqtt/health` 的 `cloudbase.ready` 与 `mqtt.connected` 都为 true 才继续。CloudBase CLI 实际版本帮助中的参数是 `--service-name`、`--source`、`--min-num 1`、`--max-num 1`、`--wait`；先运行本地配置检查并核对 CLI 帮助，不以旧文档中 `--dry-run` 一定可用为前提。
4. 将清单中的 10 个小程序云函数逐个部署到指定环境，部署后查询所属环境和调用结果，不使用生产函数作兜底。
5. 部署 `admin-api-staging`（端口 3001，`DATA_DRIVER=cloudbase`、`NODE_ENV=production`、`COOKIE_SECURE=true`、`DEV_BOOTSTRAP_ADMIN_ENABLED=false`、精确 HTTPS `ADMIN_WEB_ORIGIN`），检查 `/live`、登录和受保护接口。
6. `VITE_USE_MOCK=false` 构建 Web，记录 `dist` 校验值。静态托管使用 `tcb hosting deploy ./omo-admin-web/dist / -e <ID> --safe --verify`，不使用 `--prune`。配置 `/api/*` 到 API 且保留路径、SPA 错误页为 `index.html`，实际默认域名必须 HTTPS。
7. 腾讯地图 Web Key 只允许最终 staging 域名；配置后重新构建并发布，不把 Key 写入 Git。地图 SDK Marker 必须实测，降级地图不算通过。
8. 将小程序 trial 环境 ID 更新为同一个 ID，运行 `node scripts/staging/check-config.js trial`；再用微信开发者工具 CLI 上传 `staging-YYYYMMDD-HHmm`，仅设置体验成员，不提交正式审核。

每一步失败立即停止。Web 发布前保留上一版本和校验值；云托管保留上一修订；第一次部署失败不切换生产。静态托管 `--safe` 远端备份默认不会自动清理。当前测试只可标记“手机真机 + MQTT 模拟车辆”，iPhone、Android 缺一时列为未验证；最小实例数降回 0 应在验收报告完成后另行确认。

2026-09-17 数据层执行记录：上述 CLI 初始化在 `omo-platform-staging-d5a30d0fd8f` 成功，输出 `PASS: 16 collections, 22 indexes, 3 seeds`。一次性管理员与 Broker 尚未创建；不因集合和索引通过就启动后续部署。

只读 `--verify` 已再次回读通过；一次性管理员脚本已就绪，但需用户在本机交互终端输入密码，当前尚未执行创建。不要通过 `BOOTSTRAP_ADMIN_PASSWORD` 环境变量或命令参数传密码。数据库核验及管理员创建完成后，方可进入 Broker 门禁。

## 4. 本机管理员与独立 Broker 操作

管理员只在本机终端操作。上述五个非密钥环境变量及 `OMO_TCB_CLI_ENTRY` 均设置为本环境后运行：

```powershell
npm run staging:nosql -- --verify
$env:STAGING_ADMIN_APPLY='CREATE_ONE_TIME_ADMIN_ONLY'
npm run staging:admin -- --apply
Remove-Item Env:STAGING_ADMIN_APPLY
```

脚本在交互终端隐藏读取两次密码，不接受重定向输入或 `BOOTSTRAP_ADMIN_PASSWORD`。若已存在管理员，停止而不是重置；执行者自己保管初始密码。确认输出 `PASS` 后再进入 Broker 阶段。

用户在 [EMQX Cloud 控制台](https://cloud-intl.emqx.com/)登录，新建独立项目 `omo-platform-staging` 和 Serverless 部署 `omo-mqtt-staging`，选择控制台可用的亚太地区，确认月度消费上限 **0**、状态 Running。不得选择付费 Dedicated；免费额度耗尽后停用而非自动付费。[官方创建说明](https://docs.emqx.com/en/cloud/latest/create/serverless.html) · [消费上限说明](https://docs.emqx.com/en/cloud/latest/deployments/spend_limit.html)

实际已收到候选地址 `f12f196e.ala.eu-central-1.emqxsl.com:8883`。用户同意沿用欧洲 `eu-central-1` 部署先做 staging 测试，无需再创建亚太 Broker；但控制台 Running、Serverless 套餐、月消费上限 0 尚待截图核对。本机 DNS、8883 TCP、TLS 1.3 与证书校验已通过；CloudBase 上海侧出站连通性必须在 Bridge 部署后用 `/mqtt/health` 单独验证，本机结果不可代替。

在“访问控制 → 客户端认证”创建两个**不同账号**，密码只保存在用户控制台/本机忽略文件；在“客户端授权”按用户名配置：

| 账号用途 | 允许订阅 | 允许发布 |
| --- | --- | --- |
| Bridge | `ugv/+/device`、`ugv/+/response` | `ugv/OMO_STAGING_0001/platform` |
| 模拟车 | `ugv/OMO_STAGING_0001/platform` | `ugv/OMO_STAGING_0001/device`、`ugv/OMO_STAGING_0001/response` |

另在 All Users 添加 Topic `#` 的 Publish & Subscribe Deny 规则作兜底。Serverless 默认黑名单模式，仅配置允许规则并不会拒绝其他 Topic；用户名规则优先于 All Users 兜底。[官方授权说明](https://docs.emqx.com/en/cloud/latest/deployments/default_authz.html)

已在被 Git 忽略的 `scripts/.env.broker` 中预填上述 TLS 地址；用户只需在本机填入 Bridge 与模拟车的不同账号和密码。凭据不得写在 URL 中，不发送到聊天。**仅在 Bridge 尚未启动时**运行：

```powershell
node --env-file=scripts/.env.broker scripts/staging/broker-smoke.js
```

脚本使用两个不同 Client ID，检查 TLS 和三条授权消息方向，并验证越权、错误密码与明文 1883 端口；通过后再将 Bridge 凭据配置到 CloudBase 安全配置。若连接不稳、ACL 不可确认或消费上限不是 0，停止后续服务部署。
