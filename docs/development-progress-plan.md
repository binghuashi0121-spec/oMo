# oMo 平台总开发进度与后续实施计划

> 文档用途：作为新 Codex 对话、开发人员交接和阶段验收的统一上下文。
>
> 最近核对日期：2026-09-16
> 仓库根目录：`C:\Users\13417\Desktop\omo-platform`
> 当前分支：`web-admin-system`
> GitHub 远程：`origin`
> 当前基线提交：`b7854a7 feat: optimize admin dashboard experience`

## 1. 项目目标

oMo 是一个共享无人车/漫步车平台。当前仓库同时维护微信小程序、运营管理后台、管理 API 和 MQTT 网关。

第一期管理后台面向单一超级管理员，目标是完成以下闭环：

1. 在地图中查看多景区车辆位置、状态、电量、心跳和当前订单。
2. 查询订单、查看详情并追加内部备注。
3. 查看演示结算、追加不可变人工调账并通过反向流水撤销。
4. 查看 Admin API、CloudBase、MQTT、车辆心跳和模拟指令状态。
5. 在后台生成车辆模拟指令和模拟回执，但不向真实 MQTT Broker 发布。
6. 小程序、MQTT Bridge 和后台最终通过同一个独立 CloudBase 开发环境进行联合调试。

## 2. 固定决策与范围

### 2.1 技术方案

- 管理 Web：Vue 3、TypeScript、Vite、Element Plus、Pinia、Vue Router、ECharts。
- 管理 API：Node.js、TypeScript、NestJS。
- 地图：腾讯地图 Web SDK；没有 Key 时保留完整 SVG 降级地图。
- 小程序：微信小程序原生框架和 CloudBase 云函数。
- 车辆网关：Node.js MQTT Bridge，通过 CloudBase Run 承载。
- 数据：CloudBase 数据库。
- Web 部署：CloudBase 静态托管。
- API 部署：CloudBase Run，通过 HTTP 网关统一暴露 `/api/*`。
- 主题：品牌橙 `#EF5B24`、米白背景、桌面端优先。
- Node.js：开发和部署优先使用 Node.js 22。

### 2.2 一期业务边界

- 单一超级管理员，不提供公开注册。
- 预配置多景区和景区切换，不建设景区 CRUD 或地图编辑器。
- 支付、退款均为演示流程，不接入微信真实支付。
- 后台车辆控制只生成模拟记录，不触达真实 MQTT。
- 不提供订单强制结束、订单取消或数据导出。
- 人工调账只追加流水，不覆盖原始结算。

### 2.3 安全边界

- 小程序不得从本地存储伪造或上传 OpenID 身份头。
- MQTT Bridge 只信任 CloudBase 私有链路注入的身份。
- `/sendCommand` 不接受原始 MQTT Topic 或 Payload。
- 小程序车辆指令必须校验用户、活动订单和车辆归属。
- 后台 API 使用 Argon2id、Secure/HttpOnly Cookie、CSRF、登录限频和审计日志。
- 密钥、地图 Key、CAM 凭据和 MQTT 凭据不得提交 Git 或发送到聊天。
- 现有生产环境 `omo-mqtt-prod-2g4zisao87d6ec54` 不用于开发写入或联调。

## 3. 仓库结构

四个项目必须保持在仓库根目录同一级：

```text
omo-platform/
├── omo-mini-program/   微信小程序、云函数、初始化数据
├── omo-admin-web/      Vue 3 运营管理后台
├── omo-admin-api/      NestJS 管理 API
├── omo-mqtt-bridge/    MQTT 与 CloudBase 网关
├── deploy/             部署配置样例
├── docs/               设计、运行、部署和交接文档
├── scripts/            环境、备份、MQTT 和真机辅助脚本
├── package.json        根目录快捷命令
└── README.md           项目说明和小程序验收清单
```

不要在任一子项目中重新创建 `.git`，Git 根目录只能是 `omo-platform/.git`。

## 4. 系统连接关系

```text
微信小程序
  ├─ CloudBase 云函数 ──────────────┐
  └─ wx.cloud.callContainer ── MQTT Bridge
                                      ├─ MQTT Broker
                                      └─ CloudBase 数据库

管理 Web ── /api/admin/v1 ── Admin API ── CloudBase 数据库
                                      └─ 只读取 MQTT Bridge 健康状态
```

小程序不直接访问管理 Web，管理 Web 也不直接访问小程序。两端通过同一个 CloudBase 开发环境中的车辆、订单、运行数据和结算记录实现数据联动。

## 5. 当前开发进度

### 5.1 总体里程碑

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 仓库重构 | 已完成 | 四个子项目已整理为同级目录并推送 GitHub |
| A：交互前端原型 | 用户验收通过 | 当前 Web 视觉和页面结构已冻结，只允许联调、安全和部署修复 |
| A+：前端质量优化 | 用户验收通过 | 自动刷新、请求竞态、旧数据状态、可访问性和包体优化已完成 |
| B：真实 Admin API | staging 验证中 | `admin-api-staging` 修订 008 已注入专用服务端 API Key；存活探针及连续无效登录稳定性门禁通过，首次改密和登录后接口待用户验证 |
| B：CloudBase staging 环境 | 数据层已初始化 | 新环境 `omo-platform-staging-d5a30d0fd8f` 文档型数据库 RUNNING；16 个集合、22 条索引和 3 条测试种子已回读通过，`staging_admin` 已创建且必须首次改密 |
| B：小程序与后台联合联调 | 进行中 | Admin API 已接通数据库；等待真实车辆只读 MQTT 资料、小程序 trial 和真机互联 |
| C：安全整改 | 代码基本完成 | 云端重新部署、凭据轮换和真机验证尚未完成 |
| 正式设计与使用文档 | 待开始 | 当前只有技术部署文档 |
| D：开发环境部署 | 部分完成 | Admin API CloudBase Run 已部署；Web 静态托管、小程序 trial 与真实车辆只读联调仍待完成 |
| D：生产验收和上线 | 未开始 | 必须在开发环境稳定后再讨论 |

### 5.2 管理 Web

已完成：

- `/login`、`/map`、`/orders`、`/finance`、`/system`。
- `/overview` 运营总览，并通过单一只读聚合接口加载。
- 左侧导航、顶部景区切换、全局系统状态栏和桌面内容区。
- oMo Logo 和本地内联 SVG 业务图标。
- 地图车辆筛选、图例、车辆详情、GeoJSON 路线和无 Key 降级地图。
- 车辆数据 15 秒自动刷新；页面不可见时暂停，恢复可见时立即刷新。
- 景区快速切换时丢弃旧请求结果，避免跨景区数据覆盖。
- 首次错误、后台刷新错误、旧数据和无数据状态区分。
- 订单组合筛选、分页、详情和追加内部备注。
- 财务汇总、趋势图、结算详情、调账和撤销。
- 系统健康、降级、故障和模拟车辆指令。
- Element Plus 按需导入；ECharts 仅随财务路由异步加载。
- 1280×900、1440×900、1920×1080 桌面布局。

当前状态：Web 前端已由用户验收并冻结。尚待完成：

- 使用真实腾讯地图浏览器 Key 验证 Marker、域名白名单和地图加载。
- 接入 staging CloudBase 数据并完成云端联调。

### 5.3 Admin API

已完成：

- `/api/admin/v1` 统一接口前缀和 `code/message/data/requestId` 响应。
- 管理员登录、退出、当前会话和首次修改密码。
- 8 小时绝对会话、30 分钟空闲过期、登录失败限频。
- 景区列表和地图配置。
- 车辆、订单、备注、财务、调账、撤销和系统状态接口。
- 景区隔离和跨景区访问检查。
- `ongoing → active`、`idle/online → available` 等旧状态兼容。
- WGS84 原始坐标和 GCJ-02 展示坐标区分。
- 整数分金额、不可变调账、反向撤销和幂等键。
- 模拟车辆指令，不连接 MQTT Broker。
- CloudBase 数据适配器、集合初始化和天马山迁移脚本。
- 只读 `GET /api/admin/v1/overview` 聚合接口，按北京时间统计。
- 仅 development/test 可启用的同进程管理员初始化；生产环境启用时拒绝启动。
- Bridge 健康状态同时检查 CloudBase ready 和 MQTT connected。

当前缺口：

- 本地 `DATA_DRIVER=memory` 真实 API 浏览器联调已通过，但数据仍只在进程内存在。
- 尚未使用 staging CloudBase 验证集合、索引、权限和云端响应。

### 5.4 小程序

已完成的已有能力：

- 登录、车辆查询、扫码/手工输入、确认用车、演示支付、等待取车、进行中、还车和明细。
- `trips`、`trip_runtime`、`trip_settlements` 等云端业务逻辑。
- 小程序不再使用本地 OpenID 作为 MQTT Bridge 身份。
- 页面 Bridge 调用已统一收敛到 `utils/bridgeApi.js`，底层继续使用 `wx.cloud.callContainer`。
- 已按 `develop → development`、`trial → staging`、`release → production` 建立严格环境映射；缺少环境 ID 时阻止启动，不回退生产。
- 订单、车辆、结算云函数已写入规范 `orderNo`、状态、整数分金额、`activeOrderId`、时间和里程字段。

当前缺口：

- development 和 staging 环境 ID 尚未提供，因此对应构建会明确报“环境未配置”。
- 多项取消、恢复、低电量、故障车、临时停车和弱网验收仍未打勾。
- 云函数规范字段已完成本地静态契约验证，但尚未在独立 staging 环境部署和运行验证。

### 5.5 MQTT Bridge

已完成：

- 可信 CloudBase 身份提取。
- 拒绝客户端 OpenID 回退。
- 指令类型、车辆 ID 和参数白名单。
- 用户活动订单与车辆归属验证。
- `/health` 区分 HTTP、CloudBase 和 MQTT 状态。
- `mqtt_logs`、`command_history`、车辆和行程运行数据写入逻辑。
- 车辆遥测同步写入规范电量、WGS84/GCJ-02、速度和心跳字段；行程链路同步维护规范订单与结算字段。

尚待完成：

- 部署独立 `mqtt-bridge-dev`。
- 配置开发 MQTT Broker 和唯一 Client ID。
- 验证 `cloudbase.ready=true` 与 `mqtt.connected=true`。
- 验证 MQTT 断开、恢复、重复订阅和消息落库。
- 生产历史 MQTT 凭据外部轮换。

## 6. 最近验证基线

最近一次完整本地验证日期：2026-09-20。

| 检查项 | 结果 |
| --- | --- |
| Web 单元测试 | 15/15 通过 |
| Web TypeScript 与生产构建 | 通过 |
| Admin API 单元/集成测试 | 32/32 通过 |
| Admin API 构建和脚本类型检查 | 通过 |
| MQTT Bridge 安全测试 | 6/6 通过 |
| 小程序环境与云函数字段契约测试 | 7/7 通过 |
| Playwright 桌面端测试 | 24/24 通过 |
| Playwright 分辨率 | 1280×900、1440×900、1920×1080 |
| Playwright 本地真实 API 主流程 | 1/1 通过（登录、首次改密、总览、地图、订单、财务、系统、退出） |
| Web 主入口 gzip | 约 64 KB |

财务路由包含 ECharts，单独异步文件较大，但不进入地图、订单或系统页面的首屏主入口，目前不作为阻塞项。

Admin API 于 2026-09-20 在 staging 修订 008 完成运行门禁：`/live` 返回 200，三次独立无效登录均返回 401，且每次请求后 `/live` 仍为 200，不再出现实例重启导致的 502/503。该结果只证明 Admin API 与 CloudBase 认证链路稳定，不代表微信真机、MQTT Broker 或真实车辆验收。`omo-mini-program/project.config.json` 继续作为用户本地修改保留。

### 6.1 staging 环境只读核验（2026-09-17）

- 旧环境 `omo-platform-staging-d3acae2142c` 为 PostgreSQL 类型，现为 `ISOLATE`，不作本轮目标；不删除、不写入。
- 新环境 `omo-platform-staging-d5a30d0fd8f` 为文档型数据库类型，个人版、`Status=NORMAL`、未自动续费，到期时间 2026-10-17 23:59:59。`Databases[0].Status=RUNNING`，地域 `ap-shanghai`，静态托管 `online`。
- 对新环境执行只读 NoSQL `listCollections` 返回空集合清单，确认数据层可访问。后续只向新 ID 初始化集合、索引和测试数据；生产环境与旧环境均不作兜底。
- 使用已授权 CloudBase CLI 在新 ID 执行 `staging:nosql -- --apply`；完成并回读 16 个集合、22 条索引和 3 条种子（两个景区、一台 `OMO_STAGING_0001` 测试车）。一次性管理员、隔离 MQTT Broker、云函数、云托管、Web 和 trial 仍未部署。
- 后续只读 `staging:nosql -- --verify` 再次通过。已实现本机隐藏输入密码的一次性 staging 管理员初始化脚本及独立 TLS Broker 冒烟脚本；两者尚未对云端执行。staging 配置测试现为 10/10。下一步需要用户在本机终端输入管理员初始密码，并登录 EMQX Cloud 创建月消费上限 0 的 Serverless 测试部署。
- 用户提供欧洲 `eu-central-1` EMQX Broker 候选地址并同意先沿用；本机 8883 TCP 和 TLS 1.3 证书验证通过。控制台 Running、消费上限 0、两账号 ACL 和 CloudBase 上海侧连通性仍未验证；管理员集合回读为 0。不得据本机 TLS 通过而部署后续服务。
- 2026-09-18 复核：CloudBase staging `EnvStatus=NORMAL`、文档数据库 `RUNNING`、已部署云函数 0。`scripts/.env.broker` 已在本机忽略文件中预填非秘密的欧洲 TLS 地址，但两个账号和密码均未填写；管理员集合仍为 0。未进入 Bridge 部署。

## 7. 当前工作区特别说明

截至 2026-09-04，`omo-mini-program/project.config.json` 存在一项未提交修改，内容主要是微信开发者工具重新排列或省略项目配置字段。

新对话必须：

1. 先运行 `git status --short --branch`。
2. 检查该文件差异是否由用户或微信开发者工具产生。
3. 不得擅自撤销、覆盖或提交这项修改。
4. 后续开发应尽量避开该文件；若必须修改，先向用户说明重叠范围。

## 8. 下一步开发顺序

### 阶段 1：联调前代码准备

目标：在不依赖 CloudBase 新环境、不碰生产环境的情况下消除已知阻塞。

#### 1.1 小程序环境配置分离

- [x] 新增小程序环境配置模块。
- [x] 分离 `development`、`staging`、`production`。
- [ ] 配置 CloudBase 环境 ID、服务名、路径前缀和环境标识。
- [x] 默认开发构建不得指向生产环境。
- [ ] 生产构建不得开启 `ALLOW_WX_DEVTOOLS`。
- [x] 页面或日志清晰显示当前环境。
- [x] 增加配置校验，防止环境 ID 和服务名错配。
- [x] 不提交任何密钥。

验收：切换开发/生产配置不需要修改业务页面，且生产配置不会被开发工具意外覆盖。

#### 1.2 本地真实 Admin API 登录

- [x] 增加显式启用的开发管理员初始化开关。
- [x] 只允许 `NODE_ENV=development/test`。
- [x] 不提供默认用户名或默认密码。
- [x] 在 API 当前进程的 memory repository 中创建管理员。
- [x] 生产环境检测到开关时拒绝启动。
- [x] 增加登录、首次改密、重启行为和生产拒绝测试。
- [x] 更新 `.env.example` 和运行文档。

验收：`VITE_USE_MOCK=false` 时，Web 可以登录本地 API，完成地图、订单、财务、系统和退出流程。

#### 1.3 前端冻结

- [x] 用户完成全部页面的视觉复核。
- [x] 确认菜单、字段、操作入口和文案。
- [x] 冻结第一期页面结构和 API 类型。
- [ ] 将真实地图 Key 验收登记为开发环境任务。

### 阶段 2：正式文档

部署前新增 `docs/oMo后台管理系统V1.0设计与使用说明书.md`，后续可输出 DOCX。

- [ ] 项目背景与一期范围。
- [ ] 系统架构和数据流。
- [ ] 登录与超级管理员规则。
- [ ] 地图、订单、财务、系统页面说明。
- [ ] 多景区、状态、金额、坐标和时间口径。
- [ ] Admin API 接口目录。
- [ ] CloudBase 集合、字段和索引。
- [ ] 小程序、Bridge、Web 联调方法。
- [ ] 安全设计和审计规则。
- [ ] 测试、部署、回滚和故障排查。
- [ ] 已知限制和第二期建议。

当前 `docs/admin-system.md` 继续作为技术运行和部署手册，不删除。

### 阶段 3：CloudBase 开发环境

前置：用户可以创建或授权独立 CloudBase dev/test/staging 环境。

- [x] 创建明确含 `staging` 的独立环境；文档型数据库已就绪。
- [x] 创建业务与管理集合和索引，回读 16 个集合与 22 条索引。
- [x] 写入 `tianmashan`、第二个演示景区和一台模拟车辆。
- [ ] 创建专用微信测试账号、测试车辆和开发 Broker。
- [ ] 部署小程序云函数。
- [ ] 部署 `mqtt-bridge-dev`。
- [ ] 创建超级管理员。
- [ ] Admin API 设置 `DATA_DRIVER=cloudbase`。
- [ ] Web 设置 `VITE_USE_MOCK=false`。
- [ ] 只对开发数据执行备份、dry-run 和迁移。

严禁在该阶段对 `omo-mqtt-prod-2g4zisao87d6ec54` 执行写入、迁移或部署。

### 阶段 4：小程序与后台联合联调

主链路：

```text
登录
→ 选择/扫码车辆
→ 确认用车
→ 演示支付
→ waiting_pickup
→ active
→ MQTT 位置/电量/心跳/里程
→ 结束行程
→ completed
→ trip_settlements
→ Web 订单与财务
```

必须验证：

- [ ] 小程序创建订单后 Web 订单页可见。
- [ ] 车辆状态、当前订单和地图位置一致。
- [ ] 地图最迟在自动刷新周期内显示新数据。
- [ ] 结束订单后车辆恢复可用。
- [ ] 结算金额与小程序明细一致。
- [ ] WGS84 与 GCJ-02 不发生重复转换。
- [ ] 景区切换不泄漏其他景区数据。
- [ ] 订单备注只追加、不覆盖。
- [ ] 调账不修改原始金额，撤销产生反向流水。
- [ ] 重复幂等请求不创建重复流水或指令。
- [ ] 后台模拟指令不产生真实 MQTT publish。
- [ ] MQTT 断开时系统不得显示全部正常。

安全验证：

- [ ] 未登录 Admin API 返回 401。
- [ ] CSRF 缺失或错误时写请求被拒绝。
- [ ] 伪造 OpenID 被拒绝。
- [ ] 原始 MQTT Topic/Payload 被拒绝。
- [ ] 跨用户车辆指令被拒绝。
- [ ] 跨景区实体 ID 被拒绝。
- [ ] 登录失败限频生效。

### 阶段 5：开发环境部署

- [ ] `admin-api` 部署到 CloudBase Run。
- [ ] `admin-web` 部署到 CloudBase 静态托管。
- [ ] HTTP 网关 `/api/*` 路由到 API。
- [ ] 静态路由 `/*` 和 Vue history 回退配置正确。
- [ ] 设置 HTTPS、开发域名和 CORS Origin。
- [ ] 腾讯地图 Key 设置域名白名单。
- [ ] 检查登录失败率、API 错误率、MQTT、车辆失联和数据库查询。
- [ ] 输出开发环境验收报告。

### 阶段 6：生产发布准备

只有开发环境稳定后才进入本阶段。

- [ ] 生产数据只读预检。
- [ ] 生产备份。
- [ ] 迁移 dry-run 和数量/金额核对。
- [ ] MQTT、CAM 等历史凭据外部轮换。
- [ ] 已备案域名和 HTTPS。
- [ ] iPhone 和 Android 真机回归。
- [ ] 小程序主流程连续成功 3 次。
- [ ] 取消流程连续成功 2 次。
- [ ] 低电量、未结束行程、临时停车边界通过。
- [ ] 云端无新的 DB、MQTT 或 HTTP 错误。
- [ ] 明确回滚方案和发布负责人。

## 9. 统一验收状态颗粒度

所有任务使用以下状态，不要只写“完成”：

1. `未开始`
2. `开发中`
3. `代码完成`
4. `本地验证通过`
5. `开发环境验证通过`
6. `用户验收通过`
7. `已部署`

每项完成必须同时记录：

- 影响的文件和提交。
- 执行过的测试命令。
- 测试数量和结果。
- 未执行的浏览器、真机、云端或硬件验证。
- 是否涉及生产环境。
- 是否仍有未提交的用户修改。

## 10. 常用命令

```powershell
cd C:\Users\13417\Desktop\omo-platform

# 当前 Git 状态
git status --short --branch
git log -5 --oneline --decorate

# Web 本地开发
npm run admin:web:dev

# Admin API 本地开发
npm run admin:api:dev

# Web 单测与构建 + API 测试与构建
npm run admin:check

# Web 浏览器自动化
npm --prefix omo-admin-web run test:e2e

# MQTT Bridge 安全测试
npm --prefix omo-mqtt-bridge test
```

Web 默认地址：`http://localhost:4173`。
Admin API 默认地址：`http://127.0.0.1:3001`。
存活接口：`http://127.0.0.1:3001/api/admin/v1/live`。

## 11. 新对话执行规则

1. 一切以当前 Git 仓库和文件内容为准。
2. 开始前检查分支、远程、最新提交和工作区修改。
3. 保留用户已有修改，不执行 `git reset --hard` 或覆盖式恢复。
4. 不连接、不迁移、不修改生产 CloudBase。
5. 默认不推送、不合并、不部署，除非用户明确授权。
6. 前端页面结构冻结后，联调阶段只做必要修复。
7. 真实地图、微信支付和真实后台车辆控制仍不属于一期。
8. 完成修改后必须运行相关测试，并明确没有执行的验证。
9. 提交前执行敏感信息扫描，不能提交 `.env`、Key 或凭据。
10. `omo-mini-program/project.config.json` 当前有未提交修改，必须先确认归属。

## 12. 可直接复制到新对话的启动提示

```text
请继续开发 C:\Users\13417\Desktop\omo-platform 中的 oMo 平台。

请先完整读取 docs/development-progress-plan.md 和 docs/admin-system.md，再检查当前 Git 分支、远程、最新提交以及所有未提交修改。一切以当前 Git 仓库为准，不要覆盖用户已有修改，不要连接或修改生产 CloudBase 环境 omo-mqtt-prod-2g4zisao87d6ec54，不要擅自推送、合并或部署。

当前基线分支应为 web-admin-system，基线提交为 b7854a7。四个同级项目是 omo-mini-program、omo-admin-web、omo-admin-api、omo-mqtt-bridge。前端原型和优化已完成并通过本地自动化验证；真实 CloudBase 开发环境、小程序与后台共享数据联调、部署和真机验收尚未完成。

当前优先任务：
1. 保留并核对 omo-mini-program/project.config.json 的现有未提交修改；
2. 实现小程序 development/staging/production 环境配置分离；
3. 修复 DATA_DRIVER=memory 下管理员初始化不能在 API 进程中保留的问题，只允许显式开发环境使用；
4. 将 Web 设置为 VITE_USE_MOCK=false，完成 Web 到本地真实 Admin API 的登录和功能联调；
5. 更新测试和文档，运行 Web、API、MQTT Bridge 和 Playwright 验证；
6. 汇报修改文件、测试结果、剩余云端/真机验证，不进行 CloudBase 部署。
```
