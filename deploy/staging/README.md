# oMo staging 发布门禁

本目录只有不含密钥的发布意图。唯一可用的环境显示名为 `omo-platform-staging`，当前文档型数据库环境 ID 为 `omo-platform-staging-d5a30d0fd8f`；目标小程序 AppID 为 `wx6443442c17eb3220`。其他环境 ID、旧小程序 AppID 和现有生产 ID 均被本地检查拒绝。不要运行天马山历史迁移脚本或导入生产备份；`project.config.json` 只允许把 AppID 定向改为上述目标值，其余用户本地设置必须保留。

## 1. 检查点与准备

在 Git 检查点之后，使用 Node 22 和已授权的 CloudBase CLI。先运行 `npm run staging:test` 与 `npm run staging:check`；后者确认服务规格、全部 10 个云函数目录、集合/索引文件和 MQTT 隔离配置。任何云端写入前还应核对当前 `tcb env list` 返回的环境 ID、显示名、套餐及地域，明确排除生产环境。

用户已创建新的 staging 文档型数据库环境，不再运行 `tcb env create`。在 CLI 登录后用 `tcb env list` 复核 ID、显示名、套餐、地域和服务能力。若不可用，停止云端写入并调查初始化状态，不删除重建，也不改用生产环境。

2026-09-17 只读核验：旧 ID `omo-platform-staging-d3acae2142c` 已 `ISOLATE`，其数据库为 PostgreSQL，不作本轮目标。新 ID `omo-platform-staging-d5a30d0fd8f` 为 `NORMAL`，`Databases[0].Status=RUNNING`，静态托管 `online`，只读 NoSQL `listCollections` 返回空集合清单。所有写入、部署和验收只允许新 ID。

## 2. 部署前参数检查

仅在本地临时进程环境中设置非密钥参数：

```powershell
$env:OMO_STAGING_ENV_ID='omo-platform-staging-d5a30d0fd8f'
$env:OMO_STAGING_ENV_NAME='omo-platform-staging'
$env:OMO_STAGING_WEB_ORIGIN='https://<最终默认域名>'
$env:TCB_ENV=$env:OMO_STAGING_ENV_ID
$env:CLOUDBASE_ENV_ID=$env:OMO_STAGING_ENV_ID
node scripts/staging/check-config.js deploy
```

当前部署是 `vendor_real` blocked Bridge，禁止设置 `OMO_STAGING_MQTT_URL`、Broker 凭据或车辆白名单。不打印、提交或记录 MQTT 密码、CAM 密钥、管理员密码、地图 Key、微信上传私钥。`MQTT_CLIENT_ID=omo-mqtt-bridge-staging`，`WECHAT_APP_ID` 与小程序 AppID 一致。Bridge 和 API 固定 `min=1,max=1`。

体验版手机号联调使用 staging 调试验证码。`sendSms` 仅在 `SMS_DEBUG_CODE_ENABLED=true`、`SMS_DEBUG_ENV_ID=omo-platform-staging-d5a30d0fd8f`、`SMS_DEBUG_APP_ID=wx6443442c17eb3220` 与运行时 CloudBase 身份完全一致时返回 `debug_code`；其他环境、AppID 或未显式开启时均不得返回，正式发布前必须关闭。

本轮只从 `deploy/staging/cloudbaserc.json` 部署 `sendSms` 与 `loginWithPhone`。该文件不含秘密，并将函数根目录、staging 环境、运行时和调试码门禁固定下来；不得使用 `--all` 覆盖其他 8 个健康函数。

## 3. 按顺序发布与停机门禁

1. 设置并核对 staging 环境变量、`OMO_TCB_CLI_ENTRY` 后，运行 `npm run staging:nosql -- --verify` 进行无写入回读。已创建的 16 个集合、22 条索引和 3 条测试数据不可重新初始化或覆盖。
2. 部署 `mqtt-bridge-staging`（端口 3000），只设置非敏感 blocked 配置：`OMO_STAGING_MODE=true`、`CLOUDBASE_RUNTIME_AUTH=true`、`MQTT_PROFILE=vendor_real`、`MQTT_CONNECTION_ENABLED=false`、`MQTT_COMMANDS_ENABLED=false`、`MQTT_ALLOWED_UGV_IDS=`、`MQTT_TELEMETRY_SPEED_UNIT=unknown`、`MQTT_COORD_SYSTEM=unknown`、`ALLOW_INSECURE_MQTT=false`。不得设置 Broker URL、用户名或密码。
3. `/mqtt/health` 必须显示 `cloudbase.ready=true`、`mqtt.state=blocked`、`mqtt.connected=false`、车辆数为 0、命令关闭，并明确列出缺少车辆白名单和凭据。该阶段不以 MQTT 连接成功为验收条件。
4. `admin-api-staging` 使用 CloudBase Run 的“API Key 设置”选择 staging 专用服务端 Key，由平台注入 `CLOUDBASE_APIKEY`；不得把 Key 明文写入环境变量文本、命令、日志或仓库。仅设置 `CLOUDBASE_RUNTIME_AUTH=true` 不构成数据库授权。
5. 只读核对已部署的 10 个云函数、`admin-api-staging` 和 Web；现有版本健康时不得无故重复发布。管理员忘记或暴露初始密码时，只能在本机隐藏输入运行 `npm run staging:admin:reset -- --apply`，随后完成首次改密。

## staging 地图与静态 Web

1. 腾讯位置服务创建独立 Web Key，只启用 JavaScript API GL，并将域名白名单限制为最终 CloudBase HTTPS 域名。Key 不进入聊天、命令参数、日志或 Git。
2. 在仓库根目录运行 `npm run staging:web:build`，通过交互终端隐藏输入 Key。脚本固定使用 `VITE_USE_MOCK=false`，成功后只输出文件数和 `dist/index.html` 的 SHA-256。
3. 发布前下载并校验当前静态托管版本；将 `omo-admin-web/dist` 发布到 staging 静态托管根目录。
4. CloudBase HTTP 访问使用同一域名：`/api` 转发至 `admin-api-staging` 并保留路径，`/` 转发至静态托管；静态托管错误页设置为 `index.html`，以支持 SPA 子路由刷新。
5. 发布后验证 `/`、`/overview`、`/map`、`/orders`、`/finance`、`/system` 和 `/api/admin/v1/live`。地图必须加载腾讯底图；失败时恢复上一静态版本，不调整生产环境。
6. 获得授权 `deviceId`、Broker 选择、凭据使用授权、遥测单位和坐标系后，另行部署只读连接修订；连接前只生成 `ugv/{deviceId}/device` 与 `ugv/{deviceId}/response` 精确 Topic。
7. 当前允许在 MQTT blocked 状态下将 trial 固定指向本 staging 环境并上传体验版，只验证登录、车辆读取、`waiting_pickup` 创建/取消及 Web 数据同步。车辆指令被拒绝是安全门禁的预期结果；遥测、行驶、完成订单和结算仍须等待真实车辆只读接入及后续现场测试。

每一步失败立即停止。云托管保留上一修订；第一次部署失败不切换生产。当前 blocked 部署只能标记“Bridge 已部署但未连接”，不能标记为真机、实车或 MQTT 联调通过。

2026-09-17 数据层执行记录：上述 CLI 初始化在 `omo-platform-staging-d5a30d0fd8f` 成功，输出 `PASS: 16 collections, 22 indexes, 3 seeds`。

`staging_admin` 已创建；密码重置脚本仍只接受本机隐藏 TTY 输入。不要通过环境变量、命令参数或聊天传密码。

## 4. 本机管理员与后续真实平台操作

管理员只在本机终端操作。上述五个非密钥环境变量及 `OMO_TCB_CLI_ENTRY` 均设置为本环境后运行：

```powershell
npm run staging:nosql -- --verify
$env:STAGING_ADMIN_RESET='RESET_STAGING_ADMIN_ONLY'
npm run staging:admin:reset -- --apply
Remove-Item Env:STAGING_ADMIN_RESET
```

脚本在交互终端隐藏读取两次密码，不接受重定向输入或 `BOOTSTRAP_ADMIN_PASSWORD`。它只允许重置唯一、启用的 `staging_admin`，强制首次改密并使旧会话失效。

以下独立 EMQX 模拟 Broker 流程保留为历史/备用工具，**不属于当前真实平台 blocked 部署，也不得自动执行**。

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
