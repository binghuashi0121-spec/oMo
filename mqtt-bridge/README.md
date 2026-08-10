# MQTT Bridge（微信云托管）

小程序通过 CloudBase 私有链路调用本服务；服务订阅车辆上报并把经过校验的行程指令发布到 MQTT Broker。

## 安全边界

- 生产环境必须关闭普通公网入口，只保留 `wx.cloud.callContainer` 可达的 CloudBase 私有访问路径。
- 用户身份只读取平台注入的 `x-wx-openid`、`x-wx-env` 和 `x-wx-source`，不接受客户端自行提交的 `openid` 或 `x-openid`。真机来源为 `wx_client`；只有 dev/test/stage 环境或显式调试开关才接受 `wx_devtools`。
- `POST /sendCommand` 不接受原始 MQTT `topic` 或 `payload`。服务只接受协议白名单，并在服务端生成 `ugv/{ugvID}/platform`。
- 发布前必须确认当前 OpenID 拥有 `waiting_pickup/active/ongoing` 行程，且行程绑定车辆与 `ugvID` 一致。
- Web 管理后台第一期不调用本接口；后台车辆指令只在 `admin-api` 中模拟，不会触达 Broker。
- 仓库不保存 Broker、CAM 或其他真实凭据。历史上使用过的 MQTT 凭据需要在 Broker 侧轮换。

## 环境变量

复制 `.env.example` 为本地 `.env`，只在本机或 CloudBase 服务变量中填写真实值：

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `MQTT_URL` | 是 | 例如 `mqtt://broker.example.invalid:1883` |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | 是 | Broker 凭据 |
| `MQTT_CLIENT_ID` | 是 | 每个实例唯一 |
| `TCB_ENV` | 是 | CloudBase 环境 ID，也用于核对平台身份头 |
| `WECHAT_APP_ID` | 生产建议 | 配置后同时核对平台注入的 AppID |
| `DEFAULT_SCENIC_AREA_ID` | 否 | 未预配置旧设备的兼容景区，默认 `tianmashan`；新设备应先在 `vehicles` 中显式绑定景区 |
| `ALLOW_WX_DEVTOOLS` | 否 | 仅开发联调可设为 `true`，生产保持 `false` |
| `TENCENTCLOUD_SECRETID` / `TENCENTCLOUD_SECRETKEY` | 仅本地 | 云内优先使用服务身份，不把固定密钥写入镜像 |
| `MQTT_SUB_TOPICS` | 否 | 默认 `ugv/+/device,ugv/+/response` |
| `TCB_DISABLE_METADATA_PROBE` | 否 | 默认建议 `true` |
| `PORT` | 否 | 默认 `3000` |

## 接口

### `GET /health`

返回 HTTP、CloudBase 与 MQTT 连接状态。不能只凭 HTTP 200 判断服务正常，必须同时检查 `mqtt.connected`。

车辆上报后，网关会从已配置的车辆记录向 `mqtt_logs`、`trips`、`trip_runtime`、`trip_settlements` 和 `command_history` 持续传播 `scenicAreaId`，避免新数据跨景区混用。

### `GET /vehicleStatus?ugvID=OMO_0008`

读取车辆最新状态。车辆编号只允许字母、数字、下划线和连字符；请求必须来自 CloudBase 私有身份，且当前用户拥有绑定该车辆的活动行程。

### `POST /sendCommand`

仅供小程序经 `wx.cloud.callContainer` 调用。示例：

```json
{
  "ugvID": "OMO_0008",
  "messageType": "ugvSetMode",
  "command": {
    "ugvID": "OMO_0008",
    "mode": 3,
    "speedMode": 1
  }
}
```

允许的 `messageType` 为 `ugvSetMode`、`ugvSetMove`、`autoDriving`；每种命令都有字段、数值范围和 HTTPS URL 校验。以下请求必须被拒绝：

- 携带 `topic` 或 `payload`；
- 伪造或缺失 CloudBase 身份头；
- 用户没有绑定该车辆的活动行程；
- 命令类型、车辆编号或参数不在白名单。

本地 HTTP 客户端不会获得平台注入身份，因此调用 `/sendCommand` 返回 401 是预期行为。真实联调应从开发环境小程序经 `callContainer` 发起。

## 本地检查

```powershell
cd mqtt-bridge
npm install
npm test
node --check app.js
npm start
```

未配置真实 Broker/CloudBase 时只运行测试与语法检查，不要为测试填入生产凭据。

## CloudBase 部署要求

1. 使用 Node.js 20 或 22 构建 `mqtt-bridge/Dockerfile`。
2. 最小实例数和最大实例数均设为 1，避免 MQTT 长连接缩容及重复订阅。
3. 通过服务环境变量注入凭据，并对历史 MQTT 凭据执行外部轮换。
4. 关闭普通公网入口；只允许同环境私有链路和小程序 `callContainer`。
5. 路由 `/mqtt/*` 到该服务后，检查 `/mqtt/health` 中 CloudBase 与 MQTT 均正常。
6. 用开发账号验证伪造 OpenID、原始 Topic/Payload、跨车辆行程全部被拒绝。

车辆消息结构和 MQTTX 联调样例应使用隔离的开发 Broker 与车辆编号，不要在仓库文档中保存生产地址或凭据。
