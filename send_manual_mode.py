#!/usr/bin/env python3
"""Send one ugvSetMode command to switch a vehicle to manual driving mode."""

import argparse
import json
import os
import ssl
import sys
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("缺少依赖，请先运行: py -m pip install paho-mqtt", file=sys.stderr)
    raise SystemExit(2)


def load_bridge_env() -> Path | None:
    """Load local Bridge settings without overriding explicit shell variables."""
    env_path = Path(__file__).resolve().parent / "omo-mqtt-bridge" / ".env"
    if not env_path.is_file():
        return None

    for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key:
            os.environ.setdefault(key, value)
    return env_path


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        print(f"缺少环境变量 {name}", file=sys.stderr)
        raise SystemExit(2)
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description="发送手动驾驶模式切换指令")
    parser.add_argument("--ugv-id", default="OMO_0008", help="车辆编号")
    parser.add_argument("--speed-mode", type=int, choices=(1, 2, 5), default=1)
    args = parser.parse_args()

    loaded_env = load_bridge_env()
    if loaded_env:
        print(f"已读取 Bridge 配置: {loaded_env}")

    mqtt_url = required_env("MQTT_URL")
    username = required_env("MQTT_USERNAME")
    password = required_env("MQTT_PASSWORD")
    parsed = urlparse(mqtt_url)
    if parsed.scheme not in ("mqtt", "mqtts", "ws", "wss") or not parsed.hostname:
        print("MQTT_URL 必须是 mqtt://、mqtts://、ws:// 或 wss:// 地址", file=sys.stderr)
        return 2

    transport = "websockets" if parsed.scheme in ("ws", "wss") else "tcp"
    port = parsed.port or (8883 if parsed.scheme in ("mqtts", "wss") else 1883)
    client_id = f"manual-mode-{args.ugv_id}-{uuid.uuid4().hex[:8]}"
    client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv5, transport=transport)
    client.username_pw_set(username, password)
    if parsed.scheme in ("mqtts", "wss"):
        client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
    if transport == "websockets" and parsed.path and parsed.path != "/":
        client.ws_set_options(path=parsed.path)

    connected = threading.Event()
    connect_error = []

    def on_connect(_client, _userdata, _flags, reason_code, *_extra):
        if reason_code == 0:
            connected.set()
        else:
            connect_error.append(str(reason_code))
            connected.set()

    client.on_connect = on_connect
    client.connect(parsed.hostname, port, keepalive=30)
    client.loop_start()
    try:
        if not connected.wait(10):
            print("连接 MQTT 超时", file=sys.stderr)
            return 1
        if connect_error:
            print(f"连接 MQTT 失败: {connect_error[0]}", file=sys.stderr)
            return 1

        timestamp = str(int(time.time() * 1000))
        topic = f"ugv/{args.ugv_id}/platform"
        message = {
            "header": {
                "messageNo": "001",
                "messageType": "ugvSetMode",
                "timestamp": timestamp,
            },
            "payload": {
                "ugvID": args.ugv_id,
                "mode": 3,
                "speedMode": args.speed_mode,
            },
        }
        payload = json.dumps(message, ensure_ascii=False, separators=(",", ":"))
        result = client.publish(topic, payload, qos=0, retain=False)
        result.wait_for_publish(timeout=5)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            print(f"发布失败，MQTT rc={result.rc}", file=sys.stderr)
            return 1

        print(f"发送成功\nTopic: {topic}\nQoS: 0\nPayload: {payload}")
        return 0
    finally:
        client.disconnect()
        client.loop_stop()


if __name__ == "__main__":
    raise SystemExit(main())
