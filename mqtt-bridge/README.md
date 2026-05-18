# MQTT Bridge Service（微信云托管）

这是一个用于共享车/无人车项目的 MQTT 桥接后端服务。

业务链路：

微信小程序 -> 云托管 HTTP 接口 -> MQTT Broker -> Bittly 模拟车辆  
Bittly 模拟车辆 -> MQTT Broker -> 云托管订阅 -> 云数据库 -> 小程序读取

---

## 1. 技术栈

- Node.js（JavaScript）
- Express
- mqtt
- @cloudbase/node-sdk

---

## 2. 项目结构

```text
mqtt-bridge/
├─ package.json
├─ app.js
├─ Dockerfile
├─ .env.example
└─ README.md
```

---

## 3. 环境变量说明（这里需要替换）

必须配置：

- `MQTT_URL`：MQTT Broker 地址（例如 `mqtt://rk88.foundstech.com:1883`）
- `MQTT_USERNAME`：MQTT 用户名
- `MQTT_PASSWORD`：MQTT 密码
- `MQTT_CLIENT_ID`：MQTT 客户端 ID（建议唯一）
- `TCB_ENV`：微信云开发环境 ID
- `TENCENTCLOUD_SECRETID`：腾讯云 CAM 固定密钥 `SecretId`
- `TENCENTCLOUD_SECRETKEY`：腾讯云 CAM 固定密钥 `SecretKey`
- `PORT`：HTTP 端口（云托管通常自动注入）

可选：

- `MQTT_SUB_TOPICS`：订阅 topics，逗号分隔  
  默认：`ugv/+/device,ugv/+/response`
- `TCB_DISABLE_METADATA_PROBE`：是否禁用 CloudBase SDK 对腾讯云实例元数据的探测  
  默认：`true`  
  如果日志里出现 `connect ETIMEDOUT 169.254.0.23:80`，建议保持为 `true`

---

## 4. 建议创建的数据库集合

请在微信云开发数据库中创建：

1. `vehicles`  
   存放车辆最新状态（按 `ugvID` 查询），例如最新 topic、最新 payload、更新时间等。

2. `mqtt_logs`  
   存放所有收到的 MQTT 消息日志，包括原始字符串、解析结果、解析错误、时间。

3. `command_history`  
   存放平台下发命令历史，包括 topic、payload、发送结果、错误信息、时间。

建议索引（可选但推荐）：

- `vehicles.ugvID`（唯一或普通索引）
- `mqtt_logs.createdAt`
- `command_history.createdAt`

---

## 5. HTTP 接口

### 5.1 GET /health

用于健康检查，返回服务运行状态和 MQTT 连接状态。

### 5.2 POST /sendCommand

请求体：

```json
{
  "topic": "ugv/AB101/platform",
  "payload": {
    "header": {
      "messageNo": "cmd-001",
      "messageType": "ugvSetMode",
      "timestamp": 1735570000000
    },
    "payload": {
      "ugvID": "AB101",
      "mode": 1
    }
  }
}
```

逻辑：

- 将 payload 转 JSON 字符串
- 发布到指定 MQTT topic
- 成功/失败都记录到 `command_history`

### 5.3 GET /vehicleStatus?ugvID=AB101

从 `vehicles` 集合读取该车辆最新状态并返回。

---

## 6. 本地运行

```bash
cd mqtt-bridge
npm install
cp .env.example .env
# 然后编辑 .env，填入真实配置
npm start
```

本地测试：

- `GET http://localhost:3000/health`
- `POST http://localhost:3000/sendCommand`
- `GET http://localhost:3000/vehicleStatus?ugvID=AB101`

---

## 7. Docker 构建与运行

构建镜像：

```bash
docker build -t mqtt-bridge:1.0.0 .
```

运行容器：

```bash
docker run -p 3000:3000 \
  -e MQTT_URL="mqtt://YOUR_BROKER_HOST:1883" \
  -e MQTT_USERNAME="YOUR_MQTT_USERNAME" \
  -e MQTT_PASSWORD="YOUR_MQTT_PASSWORD" \
  -e MQTT_CLIENT_ID="mqtt-bridge-001" \
  -e TCB_ENV="YOUR_TCB_ENV_ID" \
  -e TENCENTCLOUD_SECRETID="YOUR_TENCENTCLOUD_SECRETID" \
  -e TENCENTCLOUD_SECRETKEY="YOUR_TENCENTCLOUD_SECRETKEY" \
  -e PORT=3000 \
  mqtt-bridge:1.0.0
```

---

## 8. 部署到微信云开发-云托管

1. 在仓库中准备 `mqtt-bridge` 目录（包含 `Dockerfile`）。
2. 云托管新建服务，选择该目录构建。
3. 在云托管环境变量中填写：
   - `MQTT_URL`
   - `MQTT_USERNAME`
   - `MQTT_PASSWORD`
   - `MQTT_CLIENT_ID`
   - `TCB_ENV`
   - `TENCENTCLOUD_SECRETID`
   - `TENCENTCLOUD_SECRETKEY`
   - `PORT`（一般由平台注入，可不手动填）
4. 开放 HTTP 访问路径，确认服务可访问。
5. 用 `/health` 验证 MQTT 是否连接成功。

### 实例数建议（非常重要）

建议设置：

- 最小实例数 = 1
- 最大实例数 = 1

原因：

1. 防止缩容到 0：实例销毁会导致 MQTT 长连接断开。  
2. 防止多实例重复订阅：多个实例会同时消费同一 topic，导致重复写库和业务混乱。

---

## 9. 小程序端 wx.cloud.callContainer 示例

```js
// 发送命令示例：ugvSetMode
wx.cloud.callContainer({
  config: {
    env: '你的云开发环境ID'
  },
  path: '/sendCommand',
  method: 'POST',
  header: {
    'content-type': 'application/json'
  },
  data: {
    topic: 'ugv/AB101/platform',
    payload: {
      header: {
        messageNo: 'cmd-001',
        messageType: 'ugvSetMode',
        timestamp: Date.now()
      },
      payload: {
        ugvID: 'AB101',
        mode: 1
      }
    }
  },
  success(res) {
    console.log('sendCommand success:', res);
    wx.showToast({ title: '指令发送成功', icon: 'success' });
  },
  fail(err) {
    console.error('sendCommand fail:', err);
    wx.showToast({ title: '指令发送失败', icon: 'none' });
  }
});
```

---

## 10. 示例消息结构（加分项）

### 10.1 模式控制命令（ugvSetMode）

```json
{
  "header": {
    "messageNo": "cmd-001",
    "messageType": "ugvSetMode",
    "timestamp": 1735570000000
  },
  "payload": {
    "ugvID": "AB101",
    "mode": 1
  }
}
```

### 10.2 车辆状态上报示例

```json
{
  "header": {
    "messageNo": "1735571234567",
    "messageType": "ugvRealtimeInfo",
    "timestamp": 1735571234567
  },
  "payload": {
    "ugvID": "AB101",
    "mode": 1,
    "status": "running",
    "electricQuantity": 82.5,
    "longitude": 116.397451,
    "latitude": 39.909187,
    "speed": 1.2,
    "isCharging": 0,
    "timestamp": 1735571234567
  }
}
```

### 10.3 车辆响应回执示例

```json
{
  "header": {
    "messageNo": "resp-cmd-001",
    "messageType": "ugvSetMode",
    "timestamp": 1735571235567
  },
  "payload": {
    "ugvID": "AB101",
    "ret_code": 0,
    "ret_msg": "ok"
  }
}
```

---

## 11. 后续扩展建议

1. 多命令类型  
   - 在 `messageType` 维度增加统一校验和路由（如 `ugvSetMove`、`ugvStop`）。

2. 更多车辆  
   - 按 `ugvID` 做索引，必要时分表/归档日志集合。

3. 权限校验  
   - 在 `/sendCommand` 增加用户身份校验（如小程序登录态、角色权限、车辆授权关系）。

4. 命令日志查询  
   - 新增 `GET /commandHistory`，支持按 `ugvID`、时间范围、发送结果分页查询。

---

## 12. 本地联调流程

以下流程适用于本地已经配置好 `.env`，并且使用腾讯云 CAM `SecretId` / `SecretKey` 访问 CloudBase 的场景。

### 12.0 推荐流程：本地一次性排完再部署

每次修改 `mqtt-bridge` 后，建议固定按下面顺序执行，不要一边改一边频繁上云：

1. 先停掉本地后台服务，避免旧进程干扰：

```bash
npm run mqtt-bridge:stop
```

2. 确认本地 `MQTT_CLIENT_ID` 与云端不同，避免多个连接互踢。

3. 启动本地服务并等待 `/health` 就绪：

```bash
npm run real-device:prepare
```

4. 检查本地健康状态：
   - `mqtt.connected = true`
   - `cloudbase.ready = true`
   - `cloudbase.metadataProbeDisabled = true`
   - `cloudbase.metadataProbePatchApplied = true`
  
   
>https://omo-mqtt-prod-2g4zisao87d6ec54-1398935092.ap-shanghai.app.tcloudbase.com/mqtt/health
为health


1. 用 MQTTX 循环发送 `ugv/OMO_0008/device`，确认：
   - 服务日志持续出现 `[MQTT] message received`
   - `mqtt_logs` 有新增
   - `vehicles` 有更新
   - `/vehicleStatus?ugvID=OMO_0008` 返回最新数据

2. 如果改动涉及下发指令，再用隔离测试话题验证 `/sendCommand`，不要直接发真实控制 topic。

3. 本地确认没有新的 `[DB]`、`[MQTT]`、`[HTTP]` 异常后，再统一部署到云托管。

4. 部署后只做最小云端验收：
   - `/mqtt/health`
   - `/mqtt/vehicleStatus?ugvID=OMO_0008`
   - 小程序 `wx.cloud.callContainer()` 是否恢复正常

如果云端验证失败，优先检查：

- `/mqtt` 路由是否指向最新服务
- 新版本是否拿到 `100%` 流量
- 云端是否只有 `1` 个实例
- 云端 `MQTT_CLIENT_ID` 是否与本地不同

### 12.1 启动服务

推荐直接在仓库根目录执行一键准备命令：

```bash
npm run real-device:prepare
```

如果 Windows PowerShell 因执行策略拦截 `npm.ps1`，可以改用：

```bash
npm.cmd run real-device:prepare
```

这条命令会自动完成：

- 检查 `mqtt-bridge/.env` 中的 `TCB_ENV`
- 检查 `TENCENTCLOUD_SECRETID` / `TENCENTCLOUD_SECRETKEY`
- 按需执行 `mqtt-bridge` 依赖安装
- 后台启动 `mqtt-bridge`
- 等待 `/health` 就绪

如果你只是想单独确保 `mqtt-bridge` 已启动，也可以执行：

```bash
npm run mqtt-bridge:ensure
```

如果你在 VS Code 中联调，也可以直接运行任务：

- `准备真机联调环境`
- `停止 mqtt-bridge`

停止后台服务：

```bash
npm run mqtt-bridge:stop
```

如果你仍希望手动启动，也可以继续使用：

```bash
cd mqtt-bridge
npm install
npm start
```

如果 Windows PowerShell 因执行策略拦截 `npm.ps1`，可以改用：

```bash
npm.cmd install
npm.cmd start
```

启动成功后，控制台应看到类似日志：

```text
[BOOT] CloudBase init ready env=YOUR_ENV_ID authMode=secretPair timeout=10000ms
[HTTP] service listening on 0.0.0.0:3000
[MQTT] connected: mqtt://YOUR_BROKER_HOST:1883
```

### 12.2 检查健康状态

浏览器或命令行访问：

```bash
GET http://127.0.0.1:3000/health
```

至少确认下面这些字段：

- `mqtt.connected = true`
- `cloudbase.authMode = secretPair`
- `cloudbase.ready = true`

### 12.3 用 MQTTX 验证 MQTT -> 服务 -> 云数据库

在 MQTTX 中：

1. 连接与你 `.env` 中一致的 Broker。
2. 发布 Topic：`ugv/OMO_0008/device`
3. Payload 使用下面这条消息。
4. 设置每 `5s` 循环发送一次。

```json
{"header":{"messageNo":"57","messageType":"ugvRealtimeInfo","timestamp":"1774601344342"},"payload":{"altitude":0,"autoStatus":0,"electiricQuantity":0,"isCharging":0,"latitude":0,"longitude":0,"mode":0,"odom_metre":0,"speed":0,"status":"online","total_metre":0.0034543958064561066,"ugvID":"OMO_0008"}}
```

服务侧预期现象：

- 控制台会持续打印 `[MQTT] message received`
- `/health` 中的 `lastMessageTopic` 会变成 `ugv/OMO_0008/device`
- `/health` 中的 `lastMessageUgvID` 会变成 `OMO_0008`

云数据库预期现象：

- `mqtt_logs` 集合会持续新增记录
- `vehicles` 集合里 `ugvID=OMO_0008` 的文档会持续更新

接口验证：

```bash
GET http://127.0.0.1:3000/vehicleStatus?ugvID=OMO_0008
```

返回结果里应能看到：

- `latestPayload.header.messageNo = "57"`
- `latestTopic = "ugv/OMO_0008/device"`
- `lat = 0`
- `lng = 0`
- `status.status = "online"`

### 12.4 安全验证 /sendCommand

为了避免误向真实车辆下发控制指令，本地联调时建议不要直接发到 `ugv/xxx/platform`，而是先发到隔离测试话题，例如：

```text
debug/mqtt-bridge/sendCommand/时间戳
```

示例请求：

```http
POST /sendCommand
Content-Type: application/json
```

```json
{
  "topic": "debug/mqtt-bridge/sendCommand/1774699234150",
  "payload": {
    "header": {
      "messageNo": "cmd-test-1774699234150",
      "messageType": "mqttBridgeDebug",
      "timestamp": 1774699234150
    },
    "payload": {
      "source": "local-test",
      "ok": true
    }
  }
}
```

推荐验证方式：

1. 在 MQTTX 中先订阅这个 `debug/...` 话题。
2. 调用 `/sendCommand`。
3. 确认 MQTTX 能收到原样 payload。
4. 到 CloudBase 的 `command_history` 集合里确认新增一条记录，且：
   - `topic` 与请求一致
   - `result = "success"`
   - `payloadRaw` 与发送内容一致

### 12.5 MQTTX 联调模板：等待页 / 自动驾驶 / 进入进行中

当你使用 MQTTX 联调“快捷叫车 -> 等待接驾 -> 自动进入进行中”时，建议同时准备 3 个页：

1. 订阅 `ugv/OMO_0008/platform`
2. 发布 `ugv/OMO_0008/response`
3. 循环发布 `ugv/OMO_0008/device`

作用分别是：

- `platform`：观察小程序当前下发了什么命令
- `response`：模拟车辆对平台命令的回执
- `device`：模拟车辆实时位置和状态

#### 12.5.1 联调顺序

1. 小程序里选择上车点，进入等待页。
2. 在 MQTTX 订阅 `ugv/OMO_0008/platform`。
3. 等待页会下发这几类命令：
   - `ugvSetMode`
   - `autoDriving` `opt_mode=1`（路径规划）
   - `autoDriving` `opt_mode=2`（开始自动驾驶）
4. 每看到一条关键命令，就往 `ugv/OMO_0008/response` 手动发一条成功回执。
5. 同时让 `ugv/OMO_0008/device` 持续上报车辆位置。
6. 当 `device` 上报的坐标进入上车点 `30m` 范围内，等待页会自动进入进行中页。

注意：

- 等待页状态文案现在会优先根据 `response` 更新。
- 是否自动进入进行中，仍然取决于 `device` 上报的位置是否进入 `30m`。

#### 12.5.2 response：模式切换成功回执

Topic：

```text
ugv/OMO_0008/response
```

Payload：

```json
{
  "header": {
    "messageNo": "resp-mode-1",
    "messageType": "ugvSetMode",
    "timestamp": 1774800001000
  },
  "payload": {
    "ugvID": "OMO_0008",
    "ret_code": 0,
    "ret_msg": "切换自动驾驶模式成功"
  }
}
```

#### 12.5.3 response：路径规划成功回执

Topic：

```text
ugv/OMO_0008/response
```

Payload：

```json
{
  "header": {
    "messageNo": "resp-auto-plan-1",
    "messageType": "autoDriving",
    "timestamp": 1774800002000
  },
  "payload": {
    "ugvID": "OMO_0008",
    "ret_code": 0,
    "ret_msg": "路径规划成功",
    "url": "mock://route/omo_0008",
    "total_distance": 28
  }
}
```

#### 12.5.4 response：开始自动驾驶成功回执

Topic：

```text
ugv/OMO_0008/response
```

Payload：

```json
{
  "header": {
    "messageNo": "resp-auto-start-1",
    "messageType": "autoDriving",
    "timestamp": 1774800003000
  },
  "payload": {
    "ugvID": "OMO_0008",
    "ret_code": 0,
    "ret_msg": "开始自动驾驶成功",
    "total_distance": 28
  }
}
```

#### 12.5.5 response：失败回执模板

如果你要验证等待页失败提示，可以发一条失败回执：

```json
{
  "header": {
    "messageNo": "resp-auto-fail-1",
    "messageType": "autoDriving",
    "timestamp": 1774800004000
  },
  "payload": {
    "ugvID": "OMO_0008",
    "ret_code": 1001,
    "ret_msg": "路径规划失败"
  }
}
```

#### 12.5.6 device：持续上报实时位置

Topic：

```text
ugv/OMO_0008/device
```

建议把等待页显示的“上车点坐标”直接填到下面的 `pickup` 里。  
如果你不确定坐标，以页面显示为准，不要手抄近似地址。

MQTTX 脚本示例：

```js
const pickup = { latitude: 28.166313, longitude: 112.947510 }

const track = [
  { latitude: pickup.latitude + 0.00030, longitude: pickup.longitude + 0.00030, speed: 1, total_metre: 0 },
  { latitude: pickup.latitude + 0.00012, longitude: pickup.longitude + 0.00012, speed: 1, total_metre: 12 },
  { latitude: pickup.latitude + 0.00004, longitude: pickup.longitude + 0.00004, speed: 0.5, total_metre: 22 },
  { latitude: pickup.latitude, longitude: pickup.longitude, speed: 0, total_metre: 30 }
]

function handlePayload(value, msgType, index) {
  const i = (Number.isFinite(index) ? index : 0) % track.length
  const p = track[i]

  return JSON.stringify({
    header: {
      messageNo: String(i + 1),
      messageType: "ugvRealtimeInfo",
      timestamp: String(Date.now())
    },
    payload: {
      ugvID: "OMO_0008",
      status: "online",
      autoStatus: 0,
      mode: 2,
      speed: p.speed,
      odom_metre: 0,
      total_metre: p.total_metre,
      electiricQuantity: 80,
      isCharging: 0,
      altitude: 0,
      latitude: p.latitude,
      longitude: p.longitude
    }
  })
}

execute(handlePayload)
```

推荐发送频率：

- `device`：每 `5s` 一次即可
- `response`：不要循环发送，看到 `platform` 新命令后手动点一次发送

#### 12.5.7 最省事的跑通方法

如果你只是想先把等待页跑通到进行中：

1. 进入等待页
2. 先发 3 条成功回执：
   - `ugvSetMode` 成功
   - `autoDriving opt_mode=1` 成功
   - `autoDriving opt_mode=2` 成功
3. 再把 `device` 的最后一个点直接发成等待页显示的“上车点坐标”

预期现象：

- 等待页文案会变成“路径规划成功，车辆正在自动驾驶赶来”
- 等待页的“实时距离”会逐步减小
- 当距离小于等于 `30m` 时，会自动进入进行中页

#### 12.5.8 联调时的排查顺序

如果没有进入进行中，优先检查：

1. 等待页显示的“上车点坐标”和你 `device` 里发的最后一个点是否一致
2. 等待页显示的“实时距离”是否真的小于等于 `30m`
3. `/mqtt/vehicleStatus?ugvID=OMO_0008` 返回的坐标是否已经是你刚发的坐标
4. `response` 是否已经写入了 `latestResponse`

---

### 12.6 常见问题

1. `/health` 里 `mqtt.connected=false`
   - 检查 `MQTT_URL`、`MQTT_USERNAME`、`MQTT_PASSWORD`
   - 检查本机到 Broker 的网络连通性

2. `/health` 里 `cloudbase.ready=false`
   - 检查 `TCB_ENV`
   - 检查 `TENCENTCLOUD_SECRETID`
   - 检查 `TENCENTCLOUD_SECRETKEY`

3. `mqtt_logs` 有数据但 `vehicleStatus` 查不到
   - 确认上报消息中带有 `ugvID`
   - 确认 Topic 结构符合 `ugv/{deviceId}/device`

4. 本地 `npm start` 无法执行
   - Windows PowerShell 下优先使用 `npm.cmd start`
