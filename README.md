# oMo 微信小程序

## 项目说明

这是一个围绕共享无人车/漫步车业务的小程序项目，包含：

- 小程序前端页面与业务流程
- 云函数
- `mqtt-bridge` 云托管服务
- CloudBase 云数据库读写链路

当前联调重点流程为：

`shouye2 -> jiaochejiemian -> querenyongche1 -> zhifu -> dengdaiquche -> jinhangzhong -> mingxi`

## 目录结构

- `pages/`：小程序页面
- `components/`：小程序组件
- `cloudfunctions/`：云函数
- `mqtt-bridge/`：MQTT 到 CloudBase 的桥接服务
- `omo-admin-web/`：Vue 3 桌面端运营管理台
- `admin-api/`：NestJS 管理 API
- `docs/admin-system.md`：后台本地运行、迁移、部署与验收说明
- `scripts/`：本地检查、启动、辅助脚本
- `database_import/`：云数据库初始化/导入数据

## 开发备注

- `mqtt-bridge` 的安全联调与部署说明见 [mqtt-bridge/README.md](mqtt-bridge/README.md)
- 管理后台实施与 CloudBase dev 部署说明见 [docs/admin-system.md](docs/admin-system.md)
- 小程序调用云托管时，容器路径前缀在 [app.js](app.js) 中配置为 `/mqtt`
- 车辆搜索主键当前按 `ugvID` 使用，不按文档 `_id` 直接给用户暴露

## 上线前逐项打勾的测试清单

### 一、账号与入口

- [x] 首次进入小程序可正常登录/获取验证码
- [x] 验证码登录成功后可进入首页
- [x] 退出登录后再次进入会回到未登录状态
- [x] 登录过期后会被正确要求重新登录
- [x] 首页 `shouye2` 能正常加载车辆，不报错、不白屏
- [x] 手动输入页输入 `OMO_0008` 这类车辆 ID 可正常进入确认页

### 二、选车与用车主流程

- [x] `shouye2 -> jiaochejiemian -> querenyongche1 -> zhifu -> dengdaiquche -> jinhangzhong -> mingxi` 全链路可完整走通
- [x] 确认页能正确显示：序号=`ugvID`、核载人数=`2人`、剩余续航
- [x] 支付页点击支付后能成功创建行程并进入等待页
- [x] 等待页在正常条件下可进入进行中页
- [x] 进行中页可正常结束行程并进入明细页
- [x] 明细页能正常展示订单号、费用、时间信息

### 三、取消与恢复

- [ ] 支付页点击取消不会卡死
- [x] 等待页点击取消叫车后能正确取消行程并返回首页
- [ ] 行程中途退出小程序，再进入能恢复到正确页面
- [ ] 已有未结束行程时，再次开锁会被拦截并正确跳去处理旧行程
- [ ] 旧行程取消或结束后，可以重新发起新行程

### 四、业务边界

- [ ] 低电量车辆在选车页不会被当作可用车
- [ ] 低电量车辆即使手动输入 ID，也会在确认页被拦截
- [ ] 故障/维护状态车辆不会进入可用流程
- [ ] 临时停车“开始/结束”可正常切换
- [ ] 临时停车费用会累计，结束订单时总价正确
- [x] 固定坐标 MQTT 场景下，流程能跑通且不会报错
- [ ] 伪轨迹 MQTT 场景下，里程、轨迹、费用会增长

### 五、云端与数据

- [ ] `/mqtt/health` 返回 `cloudbase.ready=true`
- [ ] `/mqtt/health` 返回 `mqtt.connected=true`
- [ ] 云函数 `unlockVehicle` 已重新部署
- [ ] 云函数 `cancelWaitingTrip` 已重新部署
- [ ] 云函数 `startTrip` 已重新部署
- [ ] 云函数 `updateTripData` 已重新部署
- [ ] `vehicles` 集合会持续更新车辆状态
- [ ] `trips` 集合会正确创建/结束订单
- [ ] `trip_runtime` 会写入里程、位置、停车记录
- [ ] `mqtt_logs`、`command_history` 会正常落库

### 六、异常与稳定性

- [ ] MQTT 断开后恢复，页面不会崩
- [ ] 云函数失败时，页面有明确提示
- [ ] 网络较差时重复点击支付/取消，不会生成重复订单
- [ ] 页面切后台再切回前台，不会出现状态错乱
- [ ] 真机上没有新的 WXSS 本地图片报错
- [ ] 真机上没有新的 `callFunction` / `callContainer` 超时报错

### 七、上线前收尾

- [ ] 等待页“测试到达/直接进入行程”按钮在正式版不可见
- [ ] 本地和云端 `MQTT_CLIENT_ID` 不冲突
- [ ] CAM 密钥、MQTT 账号密码已轮换并妥善保存
- [ ] iPhone 真机测过一遍
- [ ] Android 真机测过一遍
- [ ] 隐私协议、用户协议、客服电话、提审材料已准备

### 上线判定

- [ ] 主流程连续成功 3 次
- [ ] 取消流程连续成功 2 次
- [ ] 低电量/未结束行程/停车这 3 个边界都验证通过
- [ ] 云端日志无新的 `[DB]`、`[MQTT]`、`[HTTP]` 失败日志
