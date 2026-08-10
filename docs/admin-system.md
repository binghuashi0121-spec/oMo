# oMo Web 管理后台一期

## 当前交付范围

- `omo-admin-web`：Vue 3、TypeScript、Vite、Element Plus、Pinia、Vue Router、ECharts。
- `admin-api`：NestJS、TypeScript、Argon2id、HttpOnly Cookie、CSRF、CloudBase/内存双数据适配器。
- 页面：`/login`、`/map`、`/orders`、`/finance`、`/system`。
- 两个预配置景区；地图、订单、财务和状态栏共享景区上下文。
- 管理后台车辆指令仅生成模拟记录，不连接 MQTT Broker。
- 财务为演示支付；调账使用不可变整数分流水，撤销通过反向流水完成。

一期不包含真实微信支付/退款、真实后台车辆控制、多角色、景区 CRUD、地图编辑、订单强制结束或导出。

## 本地运行

要求 Node.js 20.19+ 或 22.12+。当前依赖不支持 Node.js 23；部署镜像固定使用 Node.js 22。

```powershell
# API：默认内存演示数据
Copy-Item admin-api/.env.example admin-api/.env
npm --prefix admin-api install
npm --prefix admin-api run bootstrap:admin
npm --prefix admin-api run start:dev

# Web：默认 Mock；需要联调 API 时把 VITE_USE_MOCK 改为 false
Copy-Item omo-admin-web/.env.example omo-admin-web/.env
npm --prefix omo-admin-web install
npm --prefix omo-admin-web run dev
```

初始化管理员所需的 `BOOTSTRAP_ADMIN_USERNAME`、`BOOTSTRAP_ADMIN_PASSWORD`、`BOOTSTRAP_ADMIN_DISPLAY_NAME` 只放在本地环境或一次性命令环境中。初始化后删除这些变量，首次登录必须修改密码。

完整本地检查：

```powershell
npm --prefix omo-admin-web run test
npm --prefix omo-admin-web run build
npm --prefix omo-admin-web run test:e2e
npm --prefix admin-api run test
npm --prefix admin-api run build
npm --prefix mqtt-bridge test
```

## 管理 API

统一前缀为 `/api/admin/v1`，响应结构为 `code/message/data/requestId`，时间为 UTC ISO 字符串。

| 模块 | 接口 |
| --- | --- |
| 认证 | `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`、`POST /auth/password` |
| 景区/地图 | `GET /scenic-areas`、`GET /map/vehicles` |
| 订单 | `GET /orders`、`GET /orders/:id`、`POST /orders/:id/notes` |
| 财务 | `GET /finance/summary`、结算列表/详情、新增调账、撤销调账 |
| 系统 | `GET /live`、`GET /system/health` |
| 模拟指令 | `GET/POST /vehicle-commands` |

浏览器只保存景区选择，不保存会话令牌。会话 Cookie 为 HttpOnly；生产环境必须启用 Secure。非 GET 请求还必须携带会话返回的 CSRF Token。

## CloudBase 开发环境

以下操作只针对名称明确包含 `dev/test/staging` 的新环境。现有 `omo-mqtt-prod` 不在本阶段操作范围内。

### 1. 创建并选择环境

```powershell
npm install -g @cloudbase/cli
tcb login
tcb env create
tcb env use <dev-environment-id>
Copy-Item deploy/admin/cloudbaserc.example.json cloudbaserc.admin.json
```

不要把 SecretId/SecretKey 写进仓库。交互登录或 CloudBase 工作负载身份优先。

### 2. 建集合、索引和景区

在 `admin-api/.env` 中临时配置：

```dotenv
DATA_DRIVER=cloudbase
CLOUDBASE_ENV_ID=<dev-environment-id>
```

然后执行：

```powershell
npm --prefix admin-api run cloudbase:setup
```

脚本只允许 dev/test/staging 环境，幂等创建管理集合并写入两个预配置景区。集合清单见 `admin-api/cloudbase/schema/collections.json`；索引按 `admin-api/cloudbase/schema/indexes.json` 在控制台创建，尤其要启用管理员账号、会话令牌、调账幂等键和模拟指令幂等键的唯一索引。

### 3. 天马山迁移演练

迁移只补充缺失的 `scenicAreaId=tianmashan` 和样例标记，不改写兼容状态字段，不删除历史数据。必须严格按顺序执行：

```powershell
$env:DATA_DRIVER='cloudbase'
$env:CLOUDBASE_ENV_ID='<dev-environment-id>'

$env:MIGRATION_MODE='backup'
npm --prefix admin-api run migrate:tianmashan

$env:MIGRATION_MODE='dry-run'
npm --prefix admin-api run migrate:tianmashan

$env:MIGRATION_MODE='apply'
$env:MIGRATION_CONFIRM='APPLY_TIANMASHAN'
npm --prefix admin-api run migrate:tianmashan
```

备份和核对状态写入忽略目录 `.cloudbase-admin/`，不会提交 Git。apply 后脚本会核对每个集合的记录数、金额合计和缺失景区数，并输出 `deleted: 0`。

### 4. 部署 admin-api

```powershell
tcb cloudrun deploy -e <dev-environment-id> -s admin-api --port 3001 --source ./admin-api
```

非敏感服务配置参考 `deploy/admin/service-settings.example.json`。CloudBase Run 应使用 Node.js 22、同环境数据库身份和 HTTPS 网关。第一期先保持单实例，并在 HTTP 网关再配置 IP 级登录限频；如果扩容为多实例，需将应用内限频状态迁移到共享存储。上线前先访问 `/api/admin/v1/live`，再登录检查受保护的 `/system/health`。

### 5. 部署 omo-admin-web

```powershell
$env:VITE_USE_MOCK='false'
$env:VITE_ADMIN_API_BASE='/api/admin/v1'
$env:VITE_TENCENT_MAP_KEY='<development-browser-key>'
npm --prefix omo-admin-web run build
tcb hosting deploy omo-admin-web/dist / -e <dev-environment-id>
```

腾讯地图浏览器 Key 会进入前端构建产物，因此必须在腾讯位置服务控制台设置域名白名单；Key 不提交 Git。未提供 Key 时页面会显示完整地图降级界面。

Vue Router 使用 history 模式，静态托管控制台必须把 4xx 错误页面设为 `index.html`，否则刷新子路由会 404。

### 6. HTTP 网关

在同一个开发域名下配置：

- `/api/*` → `admin-api`，保留完整路径；
- `/*` → `omo-admin-web` 静态托管；
- `ADMIN_WEB_ORIGIN` 只列出实际 HTTPS 管理域名；
- 自定义域名和 HTTPS 用于最终上线，默认域名只用于开发测试。

`deploy/admin/http-routes.example.json` 是路由意图清单，不直接包含账号或可执行密钥。应用前用 `tcb routes add --help` 核对当前 CLI 参数，或在 HTTP 访问服务控制台配置。

## 安全与验收门禁

- 小程序不再发送或本地保存 OpenID 身份头；MQTT 网关只信任 CloudBase 私有链路注入的身份。
- `/sendCommand` 拒绝原始 Topic/Payload，并校验命令白名单、用户活动行程和车辆归属。
- 生产 MQTT 网关必须关闭普通公网入口；历史 MQTT 凭据必须在外部轮换。
- 短信调试码只允许非生产环境且显式设置 `SMS_DEBUG_CODE_ENABLED=true`。
- 调账在 CloudBase 事务中追加，事务更新的只是派生管理字段，不覆盖原始金额；并发冲突会重试。
- 系统健康聚合必须单独判断 MQTT 连接，HTTP 可访问但 Broker 断开时显示降级。
- 部署前运行依赖审计和敏感信息扫描。项目已覆盖到兼容的 `lodash.unset` 和 `@tootallnate/once` 修复版；CloudBase Node SDK 3.18.3 仍通过上游数据库包引入 `axios/lodash.set` 公告，当前最新官方 SDK 无兼容修复。禁止把任意用户字段路径传给 SDK，并在腾讯发布修复版后优先升级。

生产发布前还必须完成：开发环境 E2E、小程序真机主流程回归、生产只读预检、生产备份与 dry-run、备案域名/HTTPS、登录失败率/API 错误率/MQTT/车辆心跳/数据库/调账审计监控。

## 官方参考

- [CloudBase CLI](https://cloud.tencent.cn/document/product/876/41539)
- [CloudBase Run 代码部署](https://docs.cloudbase.net/cli-v1/cloudrun/deploy)
- [CloudBase 静态托管 Vue SPA](https://docs.cloudbase.net/recipes/add-hosting-vue)
- [HTTP 访问云托管](https://docs.cloudbase.net/service/access-cloudrun)
- [静态网站托管](https://cloud.tencent.cn/document/product/876/46900)
