# CloudBase Migration Toolkit

This folder contains local scripts to enforce the migration plan for the new CloudBase environment.

## 1) Pre-check env consistency

```bash
npm run cloudbase:check-env
```

This checks:
- `app.js` -> `CLOUD_ENV_ID`
- `omo-mqtt-bridge/.env` -> `TCB_ENV`
- `omo-mqtt-bridge/.env` -> `TENCENTCLOUD_SECRETID`
- `omo-mqtt-bridge/.env` -> `TENCENTCLOUD_SECRETKEY`

`CLOUD_ENV_ID` and `TCB_ENV` must be the same value, and the CAM secret pair must both be configured.

## 2) Inspect JSON backup before import

```bash
npm run cloudbase:backup:inspect
```

This prints:
- available collections in `database_import/`
- row count
- sample keys
- required/core collection completeness
- import order

## 3) Validate backup consistency

```bash
npm run cloudbase:backup:validate
```

Optional required vehicle ID:

```bash
node scripts/cloudbase/validate-import.js AB101
```

This validates:
- `trips.runtimeId` can be found in `trip_runtime`
- required vehicle exists (`AB101` by default)
- no user has multiple `active` trips

## 4) Collections to create in CloudBase Console

- vehicles
- trips
- trip_runtime
- trip_settlements
- SmsCode
- User
- Session
- mqtt_logs
- command_history

## 5) Indexes to create in CloudBase Console

Use `index-specs.json` as source of truth:

- `scripts/cloudbase/index-specs.json`

## 6) Recommended import order

1. vehicles, User
2. trips
3. trip_runtime, trip_settlements
4. Session, SmsCode
5. mqtt_logs, command_history

## 7) Manual deployment checklist

1. Deploy cloud functions: `checkActiveTrip`, `endTrip`, `loginWithPhone`, `sendSms`, `unlockVehicle`, `updateTripData`, `wechatLogin`
2. Deploy `omo-mqtt-bridge` cloud hosting service
3. Set cloud hosting env vars:
   - `MQTT_URL`
   - `MQTT_USERNAME`
   - `MQTT_PASSWORD`
   - `MQTT_CLIENT_ID`
   - `TCB_ENV` (same as `CLOUD_ENV_ID`)
   - `TENCENTCLOUD_SECRETID`
   - `TENCENTCLOUD_SECRETKEY`
   - `PORT`
4. Keep hosting instances fixed to `min=1`, `max=1`
5. Verify `/health` returns `mqtt.connected=true`
