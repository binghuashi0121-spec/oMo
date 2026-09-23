#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
增强版 OSM 地图显示工具 - 集成 MQTT 实时定位功能
支持加载 OSM 文件、显示路径、接收 MQTT 实时经纬度并标注在地图上
"""

import tkinter as tk
from tkinter import ttk, filedialog, scrolledtext
import xml.etree.ElementTree as ET
import math
import json
from typing import List, Tuple, Dict, Optional
import os
import threading
import time
import paho.mqtt.client as mqtt

class MQTTManager:
    """MQTT 连接管理类"""
    def __init__(self, callback=None):
        self.client = mqtt.Client()
        self.client.username_pw_set('aisave', 'tianma')
        self.client.on_message = self.on_message
        self.is_connected = False
        self.loop_started = False
        self.callback = callback
        
        self.last_msg_time = time.time()
        self.clear_timer = None
        
        # 服务器列表
        self.servers = {
            'rk88.foundstech.com': 'rk88.foundstech.com',
            'tbuggy.tech': 'tbuggy.tech',
            'rtp.wilsonzou.com': 'rtp.wilsonzou.com',
            'car.wilsonzou.com': 'car.wilsonzou.com',
            '192.168.1.117': '192.168.1.117'
        }
        
        # 设备数据
        self.ugv_id = ""
        self.device_data = {
            'ugvID': "",
            'mode': 0,
            'status': 0,
            'electiricQuantity': 0,
            'longitude': 0.0,
            'latitude': 0.0,
            'altitude': 0.0,
            'speed': 0.0,
            'isCharging': 0,
            'autoStatus': 0,
            'total_metre': 0.0,
            'odom_metre': 0.0,
            'response': ""
        }

        self.last_response_data = ""
        
        self.mode_map = {
            0: "无控制模式（锁车状态）",
            1: "APP控制",
            2: "自动驾驶",
            3: "手动驾驶",
            4: "遥控"
        }
        
        self.auto_status_map = {
            0: "未开启",
            1: "开始自动驾驶，路线规划中",
            2: "自动驾驶中",
            3: "中途停车",
            4: "自动避让停车",
            5: "退出自动驾驶",
            6: "自动驾驶完成"
        }

    def on_message(self, client, userdata, msg):
        """处理 MQTT 消息"""
        if not self.ugv_id:
            return
        
        try:
            if msg.topic == f"ugv/{self.ugv_id}/device":
                message = json.loads(msg.payload.decode())
                header = message.get("header", {})
                message_type = header.get("messageType", "")
                
                if message_type == "ugvRealtimeInfo":
                    self.check_timeout_task()
                    payload = message.get("payload", {})
                    
                    # 更新设备数据
                    self.device_data = {
                        'ugvID': payload.get("ugvID", ""),
                        'mode': payload.get("mode", 0),
                        'status': payload.get("status", 0),
                        'electiricQuantity': payload.get("electiricQuantity", 0),
                        'longitude': payload.get("longitude", 0.0),
                        'latitude': payload.get("latitude", 0.0),
                        'altitude': payload.get("altitude", 0.0),
                        'speed': payload.get("speed", 0.0),
                        'isCharging': payload.get("isCharging", 0),
                        'autoStatus': payload.get("autoStatus", 0),
                        'total_metre': payload.get("total_metre", 0.0),
                        'odom_metre': payload.get("odom_metre", 0.0),
                        'response': self.last_response_data
                    }
                    
                    # 调用回调函数更新 UI
                    if self.callback:
                        self.callback(self.device_data)

            if msg.topic == f"ugv/{self.ugv_id}/response":
                message = json.loads(msg.payload.decode())
                self.last_response_data = f"type: {message.get('header', {}).get('messageType', 'Unknown')}, payload: {message.get('payload', {})}"
                self.device_data['response'] = self.last_response_data
                if self.callback:
                    self.callback(self.device_data)

        except Exception as e:
            print(f"MQTT 消息处理错误: {e}")

    def check_timeout_task(self):
        """检查超时任务"""
        self.last_msg_time = time.time()
        if self.clear_timer:
            self.clear_timer.cancel()
        self.clear_timer = threading.Timer(6.0, self.clear_timeout)
        self.clear_timer.start()

    def clear_timeout(self):
        """超时清除"""
        if self.callback:
            self.callback(None)

    def connect(self, server: str, ugv_id: str) -> bool:
        """连接到 MQTT 服务器"""
        try:
            self.ugv_id = ugv_id
            self.client.connect(server, 1883, 60)
            
            if not self.loop_started:
                self.client.loop_start()
                self.loop_started = True
            
            # 订阅主题
            self.client.subscribe(f"ugv/{self.ugv_id}/device", 0)
            self.client.subscribe(f"ugv/{self.ugv_id}/response", 0)
            
            self.is_connected = True
            return True
        except Exception as e:
            print(f"MQTT 连接失败: {e}")
            return False

    def disconnect(self):
        """断开 MQTT 连接"""
        try:
            if self.loop_started:
                self.client.loop_stop()
                self.loop_started = False
            self.client.disconnect()
            self.is_connected = False
        except Exception as e:
            print(f"MQTT 断开失败: {e}")

    def publish(self, message: str) -> bool:
        """发送 MQTT 消息"""
        if self.is_connected and self.ugv_id:
            try:
                self.client.publish(f"ugv/{self.ugv_id}/platform", message, 2)
                return True
            except Exception as e:
                print(f"MQTT 发送失败: {e}")
                return False
        return False
    
    def mqtt_pub(self, message: str) -> bool:
        return self.publish(message)

    #"rtmp_url": "rtmp://rk88.foundstech.com:1935/live/livestream_1"
    #"rtmp_url": "rtmp://192.168.1.108:1935/live/livestream_1"
    def start_rtmp(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "gstRtmpStart", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "camera_id": 1,
            "rtmp_url": "rtmp://rk88.foundstech.com:1935/live/livestream_1"}}
        }}"""
        self.mqtt_pub(json_str)

    def stop_rtmp(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "gstRtmpStop", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "camera_id": 1}}
        }}"""
        self.mqtt_pub(json_str)

    def start_udp(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "gstUdpStart", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "camera_id": 1,
            "udp_ip": "127.0.0.1", "udp_port": 5000}}
        }}"""
        self.mqtt_pub(json_str)

    def stop_udp(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "gstUdpStop", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "camera_id": 1}}
        }}"""
        self.mqtt_pub(json_str)

    def start_video(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "gstVideoStart", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "camera_id": 1,
            "video_path": "/home/ugv_ws/video/"}}
        }}"""
        self.mqtt_pub(json_str)

    def stop_video(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "gstVideoStop", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "camera_id": 1,
            "upload": 0, "file_url": "", "token": ""}}
        }}"""
        self.mqtt_pub(json_str)

    def take_photo(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "gstTakePhoto", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "camera_id": 1,
            "photo_path": "/home/ugv_ws/photo/",
            "upload": 0, "file_url": "", "token": ""}}
        }}"""
        self.mqtt_pub(json_str)

    def plan_route(self, lon, lat):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "autoDriving", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "opt_mode":1,
            "longitude": {lon}, "latitude": {lat}, "upload":0, "file_url": ""}}
        }}"""
        self.mqtt_pub(json_str)

    def start_auto_driving(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "autoDriving", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "opt_mode":2,
            "upload":0, "max_speed":2}}
        }}"""
        self.mqtt_pub(json_str)
    
    def stop_at_place(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "autoDriving", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "opt_mode":3,
            "upload":0}}
        }}"""
        self.mqtt_pub(json_str)

    def continue_auto_driving(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "autoDriving", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "opt_mode":4,
            "upload":0}}
        }}"""
        self.mqtt_pub(json_str)

    def exit_auto_driving(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "autoDriving", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "opt_mode":5,
            "upload":0}}
        }}"""
        self.mqtt_pub(json_str)

    def set_lock_mode(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "ugvSetMode", "timestamp": 1714015206002}},
            "payload": {{"ugvID": "{self.ugv_id}", "mode": 0, "speedMode": 1}}
        }}"""
        self.mqtt_pub(json_str)

    def set_manual_mode(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "ugvSetMode", "timestamp": 1714015206002}},
            "payload": {{"ugvID": "{self.ugv_id}", "mode": 3, "speedMode": 1}}
        }}"""
        self.mqtt_pub(json_str)

    def set_remote_mode(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "ugvSetMode", "timestamp": 1714015206002}},
            "payload": {{"ugvID": "{self.ugv_id}", "mode": 1, "speedMode": 1}}
        }}"""
        self.mqtt_pub(json_str)

    def osm_record_start(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "osmRecord", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "opt_mode": 1}}
        }}"""
        self.mqtt_pub(json_str)

    def osm_record_stop(self):
        json_str = f"""{{
            "header": {{"messageNo": "001", "messageType": "osmRecord", "timestamp": "1714015206002"}},
            "payload": {{"ugvID": "{self.ugv_id}", "opt_mode": 2, "upload":0, "file_url": ""}}
        }}"""
        self.mqtt_pub(json_str)
        

class EnhancedOSMViewer:
    def __init__(self, root):
        self.root = root
        self.root.title("🕹️无人车控制平台")
        self.root.geometry("1600x1030")

        # 初始化 MQTT
        self.mqtt = MQTTManager(callback=self.on_mqtt_data_received)

        # 数据存储
        self.osm_data = None
        self.nodes = {}
        self.ways = []
        self.relations = []
        self.bounds = None

        # 显示参数
        self.canvas_width = 900
        self.canvas_height = 700
        self.scale = 1.0
        self.pan_x = 0
        self.pan_y = 0

        # 拖拽参数
        self.dragging = False
        self.drag_start_x = 0
        self.drag_start_y = 0
        self.drag_start_pan_x = 0
        self.drag_start_pan_y = 0

        # 路径类型过滤变量
        self.filter_vars = {}

        # 实时位置数据
        self.location_history = []  # 存储历史位置
        self.current_location = None
        self.location_color = '#FF0000'  # 当前位置颜色（红色）
        self.history_color = '#FFA500'   # 历史位置颜色（橙色）

        # 视频与 RTMP 状态
        self.rtmp_streaming = False
        self.recording_video = False
        self.photo_index = 0

        # 遥控模式状态
        self.remote_control_enabled = False
        self.remote_thread = None
        self.remote_stop_event = threading.Event()
        self.remote_speed = 0.0
        self.remote_angle = 0.0
        self.remote_speed_step = 0.2
        self.remote_angle_step = 0.2
        self.remote_move_lock = threading.Lock()

        # 路径类型颜色映射
        self.highway_colors = {
            'motorway': '#ff0000',
            'trunk': '#ff6600',
            'primary': '#ffaa00',
            'secondary': '#ffff00',
            'tertiary': '#00ff00',
            'residential': '#00ffff',
            'unclassified': '#888888',
            'footway': '#aa00ff',
            'cycleway': '#ff00ff',
            'path': '#aaaaaa',
            'track': '#00aa00',
            'gps_track': '#0088ff',
        }

        # 节点显示参数
        self.node_colors = {}  # node_id -> color
        self.default_node_color = '#0000FF'  # 默认节点颜色（蓝色）
        self.selected_node_color = '#FF0000'  # 选中节点颜色（红色）
        self.selected_node_id = None  # 当前选中节点ID
        self.show_nodes = True  # 是否显示节点

        self.setup_ui()

    def setup_ui(self):
        """设置用户界面"""
        # 设置样式
        style = ttk.Style()
        style.configure('TButton', font=('Arial', 9), padding=2)
        style.configure('TLabel', font=('Arial', 9))
        style.configure('TCheckbutton', font=('Arial', 9))
        style.configure('TCombobox', font=('Arial', 9))
        style.configure('TEntry', font=('Arial', 9))

        # 主框架
        main_frame = tk.Frame(self.root, bg='#f5f5f5')
        main_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 左侧控制面板
        left_panel = tk.Frame(main_frame, width=280, bg='#ffffff', relief='solid', borderwidth=1)
        left_panel.pack(side=tk.LEFT, fill=tk.Y, padx=(0,5), pady=0)
        left_panel.pack_propagate(False)

        # MQTT 连接控制
        mqtt_frame = tk.LabelFrame(left_panel, text="MQTT 连接设置", padx=8, pady=8, bg='#ffffff', font=('Arial', 10, 'bold'))
        mqtt_frame.pack(fill=tk.X, pady=(10,5), padx=10)

        tk.Label(mqtt_frame, text="服务器:", bg='#ffffff', font=('Arial', 9)).pack(anchor=tk.W, pady=(0,2))
        self.server_var = tk.StringVar(value='rk88.foundstech.com')
        self.server_combo = ttk.Combobox(mqtt_frame, textvariable=self.server_var,
                                         values=list(self.mqtt.servers.keys()), state='readonly')
        self.server_combo.pack(fill=tk.X, pady=(0,5))

        tk.Label(mqtt_frame, text="UGV ID:", bg='#ffffff', font=('Arial', 9)).pack(anchor=tk.W, pady=(0,2))
        self.ugv_id_var = tk.StringVar(value='OMO_0001')
        self.ugv_entry = ttk.Entry(mqtt_frame, textvariable=self.ugv_id_var)
        self.ugv_entry.pack(fill=tk.X, pady=(0,8))

        button_frame = tk.Frame(mqtt_frame, bg='#ffffff')
        button_frame.pack(fill=tk.X)
        self.mqtt_connect_btn = tk.Button(button_frame, text="连接 MQTT", command=self.connect_mqtt,
                                         bg='#4CAF50', fg='white', font=('Arial', 9, 'bold'), relief='flat', padx=10)
        self.mqtt_connect_btn.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0,2))
        self.mqtt_disconnect_btn = tk.Button(button_frame, text="断开", command=self.disconnect_mqtt, state=tk.DISABLED,
                                            bg='#f44336', fg='white', font=('Arial', 9, 'bold'), relief='flat', padx=10)
        self.mqtt_disconnect_btn.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(2,0))

        self.mqtt_status_var = tk.StringVar(value="未连接")
        status_label = tk.Label(mqtt_frame, textvariable=self.mqtt_status_var, fg="red", bg='#ffffff', font=('Arial', 9, 'bold'))
        status_label.pack(anchor=tk.W, pady=(5,0))

        # 文件控制
        file_frame = tk.LabelFrame(left_panel, text="文件控制", padx=8, pady=8, bg='#ffffff', font=('Arial', 10, 'bold'))
        file_frame.pack(fill=tk.X, pady=5, padx=10)

        load_btn = tk.Button(file_frame, text="📁 加载 OSM 文件", command=self.load_osm_file,
                            bg='#2196F3', fg='white', font=('Arial', 9), relief='flat', padx=10, pady=3)
        load_btn.pack(fill=tk.X)

        # 实时信息
        info_frame = tk.LabelFrame(left_panel, text="实时信息", padx=8, pady=8, bg='#ffffff', font=('Arial', 10, 'bold'))
        info_frame.pack(fill=tk.BOTH, expand=True, pady=(5,10), padx=10)

        self.info_text = scrolledtext.ScrolledText(info_frame, height=12, width=35, wrap=tk.WORD,
                                                  font=('Arial', 8), bg='#f8f8f8', relief='flat', borderwidth=1)
        self.info_text.pack(fill=tk.BOTH, expand=True)

        self.selected_node_var = tk.StringVar(value="选中节点: 无")
        node_label = tk.Label(info_frame, textvariable=self.selected_node_var, anchor=tk.W, justify=tk.LEFT,
                             bg='#ffffff', font=('Arial', 8), fg='#666666')
        node_label.pack(fill=tk.X, pady=(5, 0))

        # 右侧地图区域
        right_panel = tk.Frame(main_frame, bg='#f5f5f5')
        right_panel.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)

        # 创建左侧画布区域和右侧按钮区域
        canvas_frame = tk.Frame(right_panel, bg='#f5f5f5')
        canvas_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        button_panel = tk.Frame(right_panel, width=200, bg='#ffffff', relief='solid', borderwidth=1)
        button_panel.pack(side=tk.RIGHT, fill=tk.Y, padx=(5,0), pady=0)
        button_panel.pack_propagate(False)

        # 右侧按钮面板标题
        button_title = tk.Label(button_panel, text="控制面板", bg='#ffffff', font=('Arial', 12, 'bold'), pady=10)
        button_title.pack(side=tk.TOP, fill=tk.X)

        # 地图控制按钮
        map_frame = tk.LabelFrame(button_panel, text="地图控制", padx=5, pady=5, bg='#ffffff', font=('Arial', 10, 'bold'))
        map_frame.pack(fill=tk.X, pady=(0,5), padx=5)

        map_controls = [
            ("🎯", "居中显示", self.center_map, '#607D8B'),
            ("🔍", "适应窗口", self.fit_to_window, '#607D8B'),
            ("🗑️", "清除历史", self.clear_history, '#607D8B'),
            ("🎨", "重置节点颜色", self.reset_node_colors, '#607D8B'),
        ]

        for icon, text, cmd, color in map_controls:
            btn = tk.Button(map_frame, text=f"{icon} {text}", command=cmd,
                           bg=color, fg='white', font=('Arial', 9), relief='flat', padx=8, pady=3, anchor='w')
            btn.pack(fill=tk.X, pady=1)

        # 节点显示控制
        self.node_var = tk.BooleanVar(value=True)
        node_cb = tk.Checkbutton(map_frame, text="👁️ 显示节点", variable=self.node_var,
                                command=self.update_display, bg='#ffffff', font=('Arial', 9), selectcolor='#4CAF50', anchor='w')
        node_cb.pack(fill=tk.X, pady=(3,1))

        # 媒体控制按钮
        media_frame = tk.LabelFrame(button_panel, text="媒体控制", padx=5, pady=5, bg='#ffffff', font=('Arial', 10, 'bold'))
        media_frame.pack(fill=tk.X, pady=5, padx=5)

        media_controls = [
            ("📹", "开始RTMP推流", self.start_rtmp_stream, '#FF9800'),
            ("⏹️", "停止RTMP推流", self.stop_rtmp_stream, '#f44336'),
            ("🎥", "开始视频录制", self.start_video_recording, '#9C27B0'),
            ("⏹️", "停止视频录制", self.stop_video_recording, '#f44336'),
            ("📸", "拍照", self.capture_photo, '#3F51B5'),
        ]

        for icon, text, cmd, color in media_controls:
            btn = tk.Button(media_frame, text=f"{icon} {text}", command=cmd,
                           bg=color, fg='white', font=('Arial', 9), relief='flat', padx=8, pady=3, anchor='w')
            btn.pack(fill=tk.X, pady=1)

        # 驾驶控制按钮
        driving_frame = tk.LabelFrame(button_panel, text="驾驶控制", padx=5, pady=5, bg='#ffffff', font=('Arial', 10, 'bold'))
        driving_frame.pack(fill=tk.X, pady=5, padx=5)

        driving_controls = [
            ("🗺️", "规划路线", self.plan_route, '#4CAF50'),
            ("▶️", "开始自动驾驶", self.start_autonomous_driving, '#4CAF50'),
            ("⏸️", "原地停车", self.stop_at_current_location, '#FF9800'),
            ("▶️", "继续自动驾驶", self.resume_autonomous_driving, '#4CAF50'),
            ("⏹️", "退出自动驾驶", self.exit_autonomous_driving, '#f44336'),
            ("🕹️", "手动模式", self.switch_to_manual_mode, '#2196F3'),
            ("�️", "遥控模式", self.toggle_remote_control_mode, '#3F51B5'),
            ("🔒", "锁车模式", self.switch_to_lock_mode, '#9E9E9E'),
        ]

        for icon, text, cmd, color in driving_controls:
            btn = tk.Button(driving_frame, text=f"{icon} {text}", command=cmd,
                           bg=color, fg='white', font=('Arial', 9), relief='flat', padx=8, pady=3, anchor='w')
            btn.pack(fill=tk.X, pady=1)

        # 遥控模式控制
        remote_frame = tk.LabelFrame(button_panel, text="遥控模式", padx=5, pady=5, bg='#ffffff', font=('Arial', 10, 'bold'))
        remote_frame.pack(fill=tk.X, pady=5, padx=5)

        self.remote_status_var = tk.StringVar(value="遥控: 已停止")
        remote_status_label = tk.Label(remote_frame, textvariable=self.remote_status_var,
                                       bg='#ffffff', font=('Arial', 9), anchor='w', justify=tk.LEFT)
        remote_status_label.pack(fill=tk.X, pady=(0,4))

        self.remote_display_var = tk.StringVar(value="速度: 0.00    转角: 0.00")
        remote_display_label = tk.Label(remote_frame, textvariable=self.remote_display_var,
                                        bg='#ffffff', font=('Arial', 9), anchor='w')
        remote_display_label.pack(fill=tk.X, pady=(0,5))

        rc_button_frame = tk.Frame(remote_frame, bg='#ffffff')
        rc_button_frame.pack(fill=tk.X)

        btn_forward = tk.Button(rc_button_frame, text="前", command=self.increase_speed,
                                bg='#4CAF50', fg='white', font=('Arial', 9), relief='flat', padx=8, pady=8)
        btn_forward.grid(row=0, column=1, sticky='ew', padx=2, pady=2)

        btn_left = tk.Button(rc_button_frame, text="左", command=self.increase_angle,
                             bg='#2196F3', fg='white', font=('Arial', 9), relief='flat', padx=8, pady=8)
        btn_left.grid(row=1, column=0, sticky='ew', padx=2, pady=2)

        btn_right = tk.Button(rc_button_frame, text="右", command=self.decrease_angle,
                              bg='#2196F3', fg='white', font=('Arial', 9), relief='flat', padx=8, pady=8)
        btn_right.grid(row=1, column=2, sticky='ew', padx=2, pady=2)

        btn_backward = tk.Button(rc_button_frame, text="后", command=self.decrease_speed,
                                 bg='#FF9800', fg='white', font=('Arial', 9), relief='flat', padx=8, pady=8)
        btn_backward.grid(row=2, column=1, sticky='ew', padx=2, pady=2)

        for idx in range(3):
            rc_button_frame.columnconfigure(idx, weight=1)

        btn_toggle_remote = tk.Button(remote_frame, text="启动遥控发送", command=self.toggle_remote_control_mode,
                                      bg='#673AB7', fg='white', font=('Arial', 9, 'bold'), relief='flat', padx=8, pady=4)
        btn_toggle_remote.pack(fill=tk.X, pady=(5,0))

        # 录制控制按钮
        recording_frame = tk.LabelFrame(button_panel, text="录制控制", padx=5, pady=5, bg='#ffffff', font=('Arial', 10, 'bold'))
        recording_frame.pack(fill=tk.X, pady=(5,0), padx=5)

        recording_controls = [
            ("🔴", "开始录制路网", self.start_recording, '#f44336'),
            ("⏹️", "停止录制路网", self.stop_recording, '#9E9E9E'),
        ]

        for icon, text, cmd, color in recording_controls:
            btn = tk.Button(recording_frame, text=f"{icon} {text}", command=cmd,
                           bg=color, fg='white', font=('Arial', 9), relief='flat', padx=8, pady=3, anchor='w')
            btn.pack(fill=tk.X, pady=1)

        # 画布
        self.canvas = tk.Canvas(canvas_frame, width=self.canvas_width,
                               height=self.canvas_height, bg='#ffffff', relief='solid', borderwidth=1)
        self.canvas.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 绑定事件
        self.canvas.bind("<ButtonPress-1>", self.on_canvas_click)
        self.canvas.bind("<ButtonPress-3>", self.on_right_click)
        self.canvas.bind("<B1-Motion>", self.on_drag_motion)
        self.canvas.bind("<ButtonRelease-1>", self.on_button_release)
        # Linux兼容的鼠标滚轮事件
        self.canvas.bind("<Button-4>", lambda e: self.zoom_in())
        self.canvas.bind("<Button-5>", lambda e: self.zoom_out())
        # Windows的鼠标滚轮事件（保留兼容性）
        self.canvas.bind("<MouseWheel>", self.on_mouse_wheel)
        self.canvas.bind("<Motion>", self.on_mouse_motion)

        # 底部状态栏
        bottom_frame = tk.Frame(self.root, bd=1, relief=tk.SUNKEN)
        bottom_frame.pack(side=tk.BOTTOM, fill=tk.X)

        self.status_var = tk.StringVar()
        self.status_var.set("请加载 OSM 文件")
        self.status_label = tk.Label(bottom_frame, textvariable=self.status_var,
                         anchor=tk.W)
        self.status_label.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(5, 0))

        # 鼠标位置显示
        self.mouse_var = tk.StringVar()
        mouse_label = tk.Label(bottom_frame, textvariable=self.mouse_var,
                      anchor=tk.E)
        mouse_label.pack(side=tk.RIGHT, padx=(0, 5))

    def set_status(self, message: str, fg: str = "black"):
        """设置底部状态栏信息"""
        self.status_var.set(message)
        self.status_label.config(fg=fg)

    def connect_mqtt(self):
        """连接 MQTT"""
        ugv_id = self.ugv_id_var.get().strip()
        if not ugv_id:
            self.set_status("警告: 请输入 UGV ID", fg="orange")
            return
        
        server = self.server_var.get()
        try:
            connected = self.mqtt.connect(server, ugv_id)
        except Exception as e:
            self.set_status(f"MQTT 连接失败: {e}", fg="red")
            return

        if connected:
            self.mqtt_connect_btn.config(state=tk.DISABLED)
            self.mqtt_disconnect_btn.config(state=tk.NORMAL)
            self.server_combo.config(state='disabled')
            self.ugv_entry.config(state='disabled')
            self.mqtt_status_var.set(f"已连接: {server}")
            self.set_status(f"已连接到 {server}，UGV ID: {ugv_id}", fg="green")
            self.root.update_idletasks()
        else:
            self.set_status("错误: 连接失败，请检查服务器设置", fg="red")

    def disconnect_mqtt(self):
        """断开 MQTT 连接"""
        self.mqtt.disconnect()
        self.mqtt_connect_btn.config(state=tk.NORMAL)
        self.mqtt_disconnect_btn.config(state=tk.DISABLED)
        self.server_combo.config(state='readonly')
        self.ugv_entry.config(state='normal')
        self.mqtt_status_var.set(f"mqtt 未连接")
        self.set_status(f"mqtt 已断开", fg="red")
        self.info_text.delete(1.0, tk.END)

    def on_mqtt_data_received(self, data: Optional[Dict]):
        """处理接收到的 MQTT 数据"""
        if data is None:
            self.current_location = None
            self.info_text.delete(1.0, tk.END)
            self.info_text.insert(tk.END, "离线")
        else:
            # 更新当前位置
            lat = data.get('latitude', 0.0)
            lon = data.get('longitude', 0.0)
            
            if lat != 0 and lon != 0:
                # 添加到历史位置：仅当距离上一个记录点大于 1 米
                if not self.location_history or self._location_distance_meters(lat, lon, *self.location_history[-1]) > 1.0:
                    self.location_history.append((lat, lon))
                self.current_location = (lat, lon)
                
                # 自动调整地图以显示当前位置
                if self.bounds:
                    self.fit_to_current_location()
            
            # 更新信息显示
            self.update_info_display(data)
            
            # 更新地图显示
            self.update_display(mode="dynamic")

    def update_info_display(self, data: Dict):
        """更新信息显示"""
        self.info_text.delete(1.0, tk.END)
        
        info_text = f"""设备ID: {data.get('ugvID', '未知')}

位置信息:
  经度: {data.get('longitude', 0.0):.12f}
  纬度: {data.get('latitude', 0.0):.12f}
  海拔: {data.get('altitude', 0.0):.2f}m

状态信息:
  模式: {self.mqtt.mode_map.get(data.get('mode', 0), '未知')}
  车速: {data.get('speed', 0.0):.2f}m/s
  电量: {data.get('electiricQuantity', 0):.0f}%
  充电: {'充电中' if data.get('isCharging', 0) == 1 else '未充电'}

自动驾驶:
  状态: {self.mqtt.auto_status_map.get(data.get('autoStatus', 0), '未知')}
  总里程:   {data.get('total_metre', 0.0):.2f}m
  本次里程: {data.get('odom_metre', 0.0):.2f}m

response:
  {data.get('response', '无')}
"""
        self.info_text.insert(tk.END, info_text)

    def fit_to_current_location(self):
        """适应当前位置"""
        if self.current_location and self.bounds:
            lat, lon = self.current_location
            # 检查当前位置是否在地图边界内
            if (self.bounds['min_lat'] <= lat <= self.bounds['max_lat'] and
                self.bounds['min_lon'] <= lon <= self.bounds['max_lon']):
                # 位置在地图范围内，不需要调整
                pass

    def _location_distance_meters(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """计算两点经纬度之间的距离（米）"""
        # Haversine 公式
        rad = math.pi / 180.0
        dlat = (lat2 - lat1) * rad
        dlon = (lon2 - lon1) * rad
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(dlon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        earth_radius = 6371000.0
        return earth_radius * c

    def load_osm_file(self):
        """加载 OSM 文件"""
        file_path = filedialog.askopenfilename(
            title="选择 OSM 文件",
            filetypes=[("OSM files", "*.osm"), ("All files", "*.*")]
        )

        if not file_path:
            return

        try:
            self.parse_osm_file(file_path)
            self.fit_to_window()
            self.update_display()
            self.status_var.set(f"已加载: {os.path.basename(file_path)} - {len(self.ways)} 条路径")
        except Exception as e:
            self.set_status(f"加载 OSM 文件失败: {e}", fg="red")
            import traceback
            traceback.print_exc()

    def parse_osm_file(self, file_path: str):
        """解析 OSM 文件"""
        tree = ET.parse(file_path)
        root = tree.getroot()

        # 解析节点
        self.nodes = {}
        for node in root.findall('node'):
            node_id = int(node.get('id'))
            lat = float(node.get('lat'))
            lon = float(node.get('lon'))
            self.nodes[node_id] = (lat, lon)

        # 解析边界
        bounds = root.find('bounds')
        if bounds is not None:
            self.bounds = {
                'min_lat': float(bounds.get('minlat')),
                'max_lat': float(bounds.get('maxlat')),
                'min_lon': float(bounds.get('minlon')),
                'max_lon': float(bounds.get('maxlon'))
            }
        else:
            if self.nodes:
                lats = [lat for lat, lon in self.nodes.values()]
                lons = [lon for lat, lon in self.nodes.values()]
                self.bounds = {
                    'min_lat': min(lats),
                    'max_lat': max(lats),
                    'min_lon': min(lons),
                    'max_lon': max(lons)
                }

        # 解析路径
        self.ways = []
        for way in root.findall('way'):
            way_id = way.get('id')
            node_refs = []

            for nd in way.findall('nd'):
                node_refs.append(int(nd.get('ref')))

            tags = {}
            for tag in way.findall('tag'):
                tags[tag.get('k')] = tag.get('v')

            if 'highway' in tags:
                highway_type = tags['highway']
            elif way_id.startswith('-'):
                highway_type = 'gps_track'
            else:
                highway_type = 'track'

            way_data = {
                'id': way_id,
                'nodes': node_refs,
                'tags': tags,
                'name': tags.get('name', f'{highway_type} {way_id}'),
                'type': highway_type
            }
            self.ways.append(way_data)

        # 解析关系
        self.relations = []
        for relation in root.findall('relation'):
            rel_id = relation.get('id')
            members = []
            tags = {}

            for member in relation.findall('member'):
                members.append({
                    'type': member.get('type'),
                    'ref': member.get('ref'),
                    'role': member.get('role')
                })

            for tag in relation.findall('tag'):
                tags[tag.get('k')] = tag.get('v')

            self.relations.append({
                'id': rel_id,
                'members': members,
                'tags': tags
            })

    def lat_lon_to_canvas(self, lat: float, lon: float) -> Tuple[float, float]:
        """将经纬度坐标转换为画布坐标"""
        if not self.bounds:
            return (self.canvas_width / 2, self.canvas_height / 2)

        lat_range = self.bounds['max_lat'] - self.bounds['min_lat']
        lon_range = self.bounds['max_lon'] - self.bounds['min_lon']

        if lat_range == 0 or lon_range == 0:
            return (self.canvas_width / 2, self.canvas_height / 2)

        # 计算相对位置（0-1）
        rel_x = (lon - self.bounds['min_lon']) / lon_range
        rel_y = (lat - self.bounds['min_lat']) / lat_range
        rel_y = 1 - rel_y  # Y轴反向

        # 计算未缩放时的画布宽度和高度
        content_height = self.canvas_height * 0.9
        content_width = content_height * (lon_range / lat_range)
        
        if content_width > self.canvas_width * 0.9:
            content_width = self.canvas_width * 0.9
            content_height = content_width * (lat_range / lon_range)

        base_scale = content_height / lat_range

        # 计算内容在画布上的起始位置（居中）
        scaled_width = lon_range * base_scale * self.scale
        scaled_height = lat_range * base_scale * self.scale
        
        start_x = (self.canvas_width - scaled_width) / 2
        start_y = (self.canvas_height - scaled_height) / 2

        # 计算最终坐标
        canvas_x = start_x + rel_x * scaled_width + self.pan_x
        canvas_y = start_y + rel_y * scaled_height + self.pan_y

        return (canvas_x, canvas_y)

    def canvas_to_lat_lon(self, canvas_x: float, canvas_y: float) -> Tuple[float, float]:
        """将画布坐标转换为经纬度"""
        if not self.bounds:
            return (0, 0)

        lat_range = self.bounds['max_lat'] - self.bounds['min_lat']
        lon_range = self.bounds['max_lon'] - self.bounds['min_lon']

        if lat_range == 0 or lon_range == 0:
            center_lat = (self.bounds['max_lat'] + self.bounds['min_lat']) / 2
            center_lon = (self.bounds['max_lon'] + self.bounds['min_lon']) / 2
            return (center_lat, center_lon)

        # 计算基础缩放比例
        content_height = self.canvas_height * 0.9
        content_width = content_height * (lon_range / lat_range)
        
        if content_width > self.canvas_width * 0.9:
            content_width = self.canvas_width * 0.9
            content_height = content_width * (lat_range / lon_range)

        base_scale = content_height / lat_range

        # 计算内容起始位置
        scaled_width = lon_range * base_scale * self.scale
        scaled_height = lat_range * base_scale * self.scale
        
        start_x = (self.canvas_width - scaled_width) / 2
        start_y = (self.canvas_height - scaled_height) / 2

        # 反向计算相对位置
        rel_x = (canvas_x - start_x - self.pan_x) / scaled_width if scaled_width != 0 else 0.5
        rel_y = (canvas_y - start_y - self.pan_y) / scaled_height if scaled_height != 0 else 0.5

        # 限制在0-1范围内
        rel_x = max(0, min(1, rel_x))
        rel_y = max(0, min(1, rel_y))

        # 转换为经纬度
        lon = self.bounds['min_lon'] + rel_x * lon_range
        lat = self.bounds['max_lat'] - rel_y * lat_range

        return (lat, lon)

    def update_display(self, mode="all"):
        """更新地图显示
        mode: "all" - 重绘所有, "static" - 只重绘静态元素, "dynamic" - 只重绘动态元素
        """
        if mode == "all":
            self.canvas.delete("all")
            if not self.ways:
                return
            # 绘制静态元素
            self._draw_static()
            # 绘制动态元素
            self._draw_dynamic()
        elif mode == "static":
            self.canvas.delete("static")
            self._draw_static()
        elif mode == "dynamic":
            self.canvas.delete("dynamic")
            self._draw_dynamic()

    def _draw_static(self):
        """绘制静态元素"""
        # 绘制网格
        self.draw_grid()

        # 绘制路径
        for way in self.ways:
            highway_type = way.get('type', 'unclassified')
            if self.filter_vars.get(highway_type, tk.BooleanVar(value=True)).get():
                self.draw_way(way)

        # 绘制边界
        if self.bounds:
            self.draw_bounds()

        # 绘制节点
        if self.show_nodes and self.node_var.get():
            self.draw_nodes()

    def _draw_dynamic(self):
        """绘制动态元素"""
        # 绘制历史轨迹
        self.draw_history_track()

        # 绘制当前位置
        if self.current_location:
            self.draw_current_location()

    def draw_grid(self):
        """在地图绘制区域绘制 5 米 × 5 米灰色网格"""
        if not self.bounds:
            return

        min_lat, max_lat = self.bounds['min_lat'], self.bounds['max_lat']
        min_lon, max_lon = self.bounds['min_lon'], self.bounds['max_lon']

        lat_mid = (min_lat + max_lat) / 2.0
        lon_mid = (min_lon + max_lon) / 2.0
        lat_scale_m_per_deg = 111320.0
        lon_scale_m_per_deg = lat_scale_m_per_deg * math.cos(math.radians(lat_mid))

        lat_range_m = (max_lat - min_lat) * lat_scale_m_per_deg
        lon_range_m = (max_lon - min_lon) * lon_scale_m_per_deg

        # 取当前地图可视范围的包围框像素尺寸来估算每像素对应距离
        corners = [
            self.lat_lon_to_canvas(max_lat, min_lon),
            self.lat_lon_to_canvas(max_lat, max_lon),
            self.lat_lon_to_canvas(min_lat, min_lon),
            self.lat_lon_to_canvas(min_lat, max_lon),
        ]
        xs = [x for x, _ in corners]
        ys = [y for _, y in corners]
        width_px = max(xs) - min(xs)
        height_px = max(ys) - min(ys)

        if width_px <= 0 or height_px <= 0:
            return

        meters_per_pixel_x = lon_range_m / width_px if width_px > 0 else float('inf')
        meters_per_pixel_y = lat_range_m / height_px if height_px > 0 else float('inf')
        meters_per_pixel = max(1e-6, min(meters_per_pixel_x, meters_per_pixel_y))

        # 网格间隔按像素宽度换算，确保在当前缩放下大致为 5 米
        grid_step_m = 5.0
        step_px = grid_step_m / meters_per_pixel
        if step_px < 6:
            step_px = 6

        # 只在可视区域内绘制有限数量的网格线，避免渲染过多
        max_lines = 120

        # 垂直网格线：按经度递增
        start_x = min(xs)
        end_x = max(xs)
        start_y = min(ys)
        end_y = max(ys)

        # 用地图左上角/右下角的经纬度生成“世界坐标”网格
        line_count = 0
        for x_m in range(0, int(lon_range_m) + 1, int(grid_step_m)):
            lon = min_lon + (x_m / lon_scale_m_per_deg)
            if lon > max_lon:
                break
            start = self.lat_lon_to_canvas(max_lat, lon)
            end = self.lat_lon_to_canvas(min_lat, lon)
            if not (start[0] < end_x + 5 and start[0] > start_x - 5):
                continue
            self.canvas.create_line(start[0], start[1], end[0], end[1], fill='#bdbdbd', width=1, dash=(2, 2), tags=("static", "grid"))
            line_count += 1
            if line_count >= max_lines:
                break

        # 水平网格线：按纬度递增
        line_count = 0
        for y_m in range(0, int(lat_range_m) + 1, int(grid_step_m)):
            lat = min_lat + (y_m / lat_scale_m_per_deg)
            if lat > max_lat:
                break
            start = self.lat_lon_to_canvas(lat, min_lon)
            end = self.lat_lon_to_canvas(lat, max_lon)
            if not (start[1] < end_y + 5 and start[1] > start_y - 5):
                continue
            self.canvas.create_line(start[0], start[1], end[0], end[1], fill='#bdbdbd', width=1, dash=(2, 2), tags=("static", "grid"))
            line_count += 1
            if line_count >= max_lines:
                break

    def draw_way(self, way: Dict):
        """绘制路径"""
        highway_type = way.get('type', 'unclassified')
        color = self.highway_colors.get(highway_type, '#000000')

        points = []
        for node_id in way['nodes']:
            if node_id in self.nodes:
                lat, lon = self.nodes[node_id]
                x, y = self.lat_lon_to_canvas(lat, lon)
                points.extend([x, y])

        if len(points) >= 4:
            width = 1
            if highway_type in ['motorway', 'trunk']:
                width = 4
            elif highway_type in ['primary', 'secondary']:
                width = 3
            elif highway_type == 'tertiary':
                width = 2

            self.canvas.create_line(points, fill=color, width=width, smooth=True,
                                   tags=(f"way_{way['id']}", "static"))

    def draw_bounds(self):
        """绘制地图边界"""
        if not self.bounds:
            return

        min_lat, min_lon = self.bounds['min_lat'], self.bounds['min_lon']
        max_lat, max_lon = self.bounds['max_lat'], self.bounds['max_lon']

        points = [
            self.lat_lon_to_canvas(min_lat, min_lon),
            self.lat_lon_to_canvas(min_lat, max_lon),
            self.lat_lon_to_canvas(max_lat, max_lon),
            self.lat_lon_to_canvas(max_lat, min_lon),
            self.lat_lon_to_canvas(min_lat, min_lon)
        ]

        flat_points = []
        for x, y in points:
            flat_points.extend([x, y])

        self.canvas.create_line(flat_points, fill='blue', width=2, dash=(5, 5), tags="static")

    def draw_nodes(self):
        """绘制节点"""
        if not self.nodes:
            return

        for node_id, (lat, lon) in self.nodes.items():
            x, y = self.lat_lon_to_canvas(lat, lon)
            
            # 获取节点颜色
            color = self.node_colors.get(node_id, self.default_node_color)
            
            # 绘制节点为圆形
            radius = 3  # 节点半径
            self.canvas.create_oval(x-radius, y-radius, x+radius, y+radius,
                                   fill=color, outline='black', width=1,
                                   tags=(f"node_{node_id}", "static"))

    def draw_history_track(self):
        """绘制历史轨迹"""
        if len(self.location_history) < 2:
            return
        
        points = []
        for lat, lon in self.location_history:
            x, y = self.lat_lon_to_canvas(lat, lon)
            points.extend([x, y])
        
        # 绘制轨迹线
        self.canvas.create_line(points, fill=self.history_color, width=2, smooth=True, tags=("history_track", "dynamic"))
        
        # 绘制历史点（每10个点绘制一个）
        for i, (lat, lon) in enumerate(self.location_history[::10]):
            x, y = self.lat_lon_to_canvas(lat, lon)
            self.canvas.create_oval(x-3, y-3, x+3, y+3, fill=self.history_color, tags=("history_point", "dynamic"))

    def draw_current_location(self):
        """绘制当前位置"""
        if not self.current_location:
            return
        
        lat, lon = self.current_location
        x, y = self.lat_lon_to_canvas(lat, lon)
        
        # 绘制位置圆点
        radius = 8
        self.canvas.create_oval(x-radius, y-radius, x+radius, y+radius,
                               fill=self.location_color, outline='darkred', width=2, tags=("current_location", "dynamic"))
        
        # 绘制位置标签
        self.canvas.create_text(x, y-15, text=f"({lat:.6f}, {lon:.6f})",
                               fill='black', tags=("location_label", "dynamic"), font=("Arial", 8))

    def on_canvas_click(self, event):
        """画布点击事件"""
        # 查找点击的项目
        clicked_items = self.canvas.find_overlapping(event.x-3, event.y-3, event.x+3, event.y+3)

        # 优先检查节点点击
        node_clicked = False
        for item in clicked_items:
            tags = self.canvas.gettags(item)
            for tag in tags:
                if tag.startswith('node_'):
                    try:
                        node_id = int(tag[5:])  # 移除 'node_' 前缀并转换为整数
                    except ValueError:
                        continue
                    self.select_node(node_id)
                    node_clicked = True
                    return  # 节点点击后立即返回，不处理其他点击

        # 检查路径点击
        path_clicked = False
        for item in clicked_items:
            tags = self.canvas.gettags(item)
            for tag in tags:
                if tag.startswith('way_'):
                    way_id = tag[4:]  # 移除 'way_' 前缀
                    self.show_way_info(way_id)
                    path_clicked = True
                    break
            if path_clicked:
                break

        # 如果没有点击到节点或路径，开始拖拽
        if not node_clicked and not path_clicked:
            self.dragging = True
            self.drag_start_x = event.x
            self.drag_start_y = event.y
            self.drag_start_pan_x = self.pan_x
            self.drag_start_pan_y = self.pan_y
            self.canvas.config(cursor="fleur")  # 改变鼠标指针为移动样式

    def on_right_click(self, event):
        """右键点击事件"""
        lat, lon = self.canvas_to_lat_lon(event.x, event.y)
        self.mouse_var.set(f"坐标: {lat:.6f}, {lon:.6f}")

    def show_way_info(self, way_id: str):
        """显示路径信息"""
        for way in self.ways:
            if way['id'] == way_id:
                self.canvas.delete("highlight")
                highway_type = way.get('type', 'unclassified')
                color = self.highway_colors.get(highway_type, '#000000')

                points = []
                for node_id in way['nodes']:
                    if node_id in self.nodes:
                        lat, lon = self.nodes[node_id]
                        x, y = self.lat_lon_to_canvas(lat, lon)
                        points.extend([x, y])

                if len(points) >= 4:
                    self.canvas.create_line(points, fill='yellow', width=6, smooth=True,
                                           tags="highlight")
                break

    def clear_history(self):
        """清除历史轨迹"""
        self.location_history = []
        self.update_display(mode="dynamic")

    def select_node(self, node_id: str):
        """选中节点并显示经纬度"""
        # 取消之前的节点高亮
        if self.selected_node_id and self.selected_node_id != node_id:
            self.node_colors.pop(self.selected_node_id, None)

        self.selected_node_id = node_id
        self.node_colors.clear()
        self.node_colors[node_id] = self.selected_node_color
        self.update_selected_node_info(node_id)
        self.update_display()

    def update_selected_node_info(self, node_id: str):
        """更新左侧选中节点信息"""
        if node_id in self.nodes:
            lat, lon = self.nodes[node_id]
            self.selected_node_var.set(
                f"选中节点: {node_id}  经度: {lon:.6f}  纬度: {lat:.6f}"
            )
        else:
            self.selected_node_var.set("选中节点: 无")

    def reset_node_colors(self):
        """重置所有节点颜色"""
        self.node_colors.clear()
        self.selected_node_id = None
        self.selected_node_var.set("选中节点: 无")
        self.update_display()

    def zoom_in(self):
        """放大"""
        self.scale *= 1.1
        self.update_display()

    def zoom_out(self):
        """缩小"""
        self.scale /= 1.1
        self.update_display()

    def center_map(self):
        """居中显示地图"""
        self.pan_x = 0
        self.pan_y = 0
        self.update_display()

    def fit_to_window(self):
        """适应窗口大小"""
        if not self.bounds:
            return

        self.scale = 1.0
        self.center_map()

    def on_mouse_wheel(self, event):
        """鼠标滚轮缩放"""
        if event.delta > 0:
            self.zoom_in()
        else:
            self.zoom_out()

    def on_drag_motion(self, event):
        """拖拽移动事件"""
        if self.dragging:
            # 计算移动距离
            delta_x = event.x - self.drag_start_x
            delta_y = event.y - self.drag_start_y

            # 移动现有元素
            self.canvas.move("all", delta_x - (self.pan_x - self.drag_start_pan_x), 
                           delta_y - (self.pan_y - self.drag_start_pan_y))

            # 更新平移量
            self.pan_x = self.drag_start_pan_x + delta_x
            self.pan_y = self.drag_start_pan_y + delta_y

    def on_button_release(self, event):
        """鼠标释放事件"""
        if self.dragging:
            self.dragging = False
            self.canvas.config(cursor="")  # 恢复默认鼠标指针

    def on_mouse_motion(self, event):
        """鼠标移动事件"""
        if not self.dragging:
            lat, lon = self.canvas_to_lat_lon(event.x, event.y)
            self.mouse_var.set(f"坐标: {lat:.6f}, {lon:.6f}")
        else:
            # 拖拽时显示移动信息
            delta_x = event.x - self.drag_start_x
            delta_y = event.y - self.drag_start_y
            self.mouse_var.set(f"移动: {delta_x:+.0f}, {delta_y:+.0f}")

    def export_path_data(self):
        """导出路径数据"""
        if not self.ways:
            self.set_status("警告: 没有路径数据可导出", fg="orange")
            return

        file_path = filedialog.asksaveasfilename(
            title="保存路径数据",
            defaultextension=".json",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")]
        )

        if not file_path:
            return

        try:
            export_data = {
                'bounds': self.bounds,
                'ways': self.ways,
                'nodes': {str(k): v for k, v in self.nodes.items()},
                'location_history': self.location_history
            }

            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, indent=2, ensure_ascii=False)

            self.set_status(f"路径数据已导出到: {file_path}", fg="green")
        except Exception as e:
            self.set_status(f"导出失败: {e}", fg="red")


    def start_rtmp_stream(self):
        """开始 RTMP 推流"""
        if self.rtmp_streaming:
            self.set_status("提示: RTMP 已在推流中", fg="orange")
            return
        self.rtmp_streaming = True
        self.status_var.set("RTMP 推流已开始")
        self.mqtt.start_rtmp()

    def stop_rtmp_stream(self):
        """停止 RTMP 推流"""
        if not self.rtmp_streaming:
            self.set_status("提示: RTMP 推流尚未开始", fg="orange")
            return
        self.rtmp_streaming = False
        self.status_var.set("RTMP 推流已停止")
        self.mqtt.stop_rtmp()

    def start_video_recording(self):
        """开始视频录制"""
        if self.recording_video:
            self.set_status("提示: 视频录制已在进行中", fg="orange")
            return
        self.recording_video = True
        self.status_var.set("视频录制已开始")
        self.mqtt.start_video()

    def stop_video_recording(self):
        """停止视频录制"""
        if not self.recording_video:
            self.set_status("提示: 视频录制尚未开始", fg="orange")
            return
        self.recording_video = False
        self.status_var.set("视频录制已停止")
        self.mqtt.stop_video()

    def capture_photo(self):
        """拍照"""
        self.photo_index += 1
        self.status_var.set(f"已拍照: photo_{self.photo_index}.png")
        self.mqtt.take_photo()

    def plan_route(self):
        """规划路线"""
        if not self.selected_node_id:
            self.set_status("警告: 请先选择目标节点", fg="orange")
            return
        self.status_var.set(f"正在规划到节点 {self.selected_node_id} 的路线")
        lat, lon = self.nodes[self.selected_node_id]
        self.mqtt.plan_route(lon, lat)

    def start_autonomous_driving(self):
        """开始自动驾驶"""
        if not self.mqtt.is_connected:
            self.set_status("警告: 请先连接 MQTT", fg="orange")
            return
        self.status_var.set("开始自动驾驶")
        self.mqtt.start_auto_driving()

    def stop_at_current_location(self):
        """原地停车"""
        if not self.mqtt.is_connected:
            self.set_status("警告: 请先连接 MQTT", fg="orange")
            return
        self.status_var.set("原地停车")
        self.mqtt.stop_at_place()

    def resume_autonomous_driving(self):
        """继续自动驾驶"""
        if not self.mqtt.is_connected:
            self.set_status("警告: 请先连接 MQTT", fg="orange")
            return
        self.status_var.set("继续自动驾驶")
        self.mqtt.continue_auto_driving()

    def exit_autonomous_driving(self):
        """退出自动驾驶"""
        if not self.mqtt.is_connected:
            self.set_status("警告: 请先连接 MQTT", fg="orange")
            return
        self.status_var.set("退出自动驾驶")
        self.mqtt.exit_auto_driving()

    def switch_to_manual_mode(self):
        """切换到手动模式"""
        if not self.mqtt.is_connected:
            self.set_status("警告: 请先连接 MQTT", fg="orange")
            return
        self.status_var.set("切换到手动模式")
        self.mqtt.set_manual_mode()

    def switch_to_lock_mode(self):
        """切换到锁车模式"""
        if not self.mqtt.is_connected:
            self.set_status("警告: 请先连接 MQTT", fg="orange")
            return
        self.status_var.set("切换到锁车模式")
        self.mqtt.set_lock_mode()

    def toggle_remote_control_mode(self):
        """切换遥控模式发送线程"""
        if not self.mqtt.is_connected:
            self.set_status("警告: 请先连接 MQTT", fg="orange")
            return

        if self.remote_control_enabled:
            self.stop_remote_control()
        else:
            self.start_remote_control()

    def start_remote_control(self):
        """开始遥控模式发送 ugvSetMove 消息"""
        if self.remote_control_enabled:
            self.set_status("遥控模式已在运行", fg="orange")
            return

        self.mqtt.set_remote_mode()
        self.remote_stop_event.clear()
        self.remote_control_enabled = True
        self.remote_speed = 0.0
        self.remote_angle = 0.0
        self.update_remote_display()
        self.remote_thread = threading.Thread(target=self._remote_control_loop, daemon=True)
        self.remote_thread.start()
        self.remote_status_var.set("遥控: 已开启")
        self.set_status("已开启遥控模式，开始发送 ugvSetMove 消息", fg="green")

    def stop_remote_control(self):
        """停止遥控模式发送"""
        if not self.remote_control_enabled:
            self.set_status("遥控模式尚未运行", fg="orange")
            return

        self.remote_stop_event.set()
        self.remote_control_enabled = False
        self.mqtt.set_lock_mode()  # 停止遥控后切换回锁车模式
        self.remote_speed = 0.0
        self.remote_angle = 0.0
        self.send_remote_move_message()
        self.update_remote_display()
        self.remote_status_var.set("遥控: 已停止")
        self.set_status("已停止遥控模式", fg="red")

    def _remote_control_loop(self):
        while not self.remote_stop_event.is_set():
            self.send_remote_move_message()
            time.sleep(0.1)

    def send_remote_move_message(self):
        """发送 ugvSetMove 控制消息"""
        if not self.mqtt.is_connected:
            return

        with self.remote_move_lock:
            payload = {
                "ugvID": self.mqtt.ugv_id,
                "speed": max(-1.0, min(1.0, self.remote_speed)),
                "angle": max(-1.0, min(1.0, self.remote_angle))
            }

        message = json.dumps({
            "header": {
                "messageNo": "001",
                "messageType": "ugvSetMove",
                "timestamp": str(int(time.time() * 1000))
            },
            "payload": payload
        })
        self.mqtt.mqtt_pub(message)

    def update_remote_display(self):
        """更新遥控当前速度和转角显示"""
        self.remote_display_var.set(
            f"速度: {self.remote_speed:.2f}    转角: {self.remote_angle:.2f}"
        )

    def increase_speed(self):
        """前进：增加速度百分比"""
        if not self.remote_control_enabled:
            self.set_status("请先开启遥控模式", fg="orange")
            return
        with self.remote_move_lock:
            self.remote_speed = min(1.0, self.remote_speed + self.remote_speed_step)
        self.update_remote_display()
        self.set_status(f"速度已调整: {self.remote_speed:.2f}", fg="green")

    def decrease_speed(self):
        """后退：减少速度百分比"""
        if not self.remote_control_enabled:
            self.set_status("请先开启遥控模式", fg="orange")
            return
        with self.remote_move_lock:
            self.remote_speed = max(-1.0, self.remote_speed - self.remote_speed_step)
        self.update_remote_display()
        self.set_status(f"速度已调整: {self.remote_speed:.2f}", fg="green")

    def increase_angle(self):
        """左转：增加转角百分比"""
        if not self.remote_control_enabled:
            self.set_status("请先开启遥控模式", fg="orange")
            return
        with self.remote_move_lock:
            self.remote_angle = min(1.0, self.remote_angle + self.remote_angle_step)
        self.update_remote_display()
        self.set_status(f"转角已调整: {self.remote_angle:.2f}", fg="green")

    def decrease_angle(self):
        """右转：减少转角百分比"""
        if not self.remote_control_enabled:
            self.set_status("请先开启遥控模式", fg="orange")
            return
        with self.remote_move_lock:
            self.remote_angle = max(-1.0, self.remote_angle - self.remote_angle_step)
        self.update_remote_display()
        self.set_status(f"转角已调整: {self.remote_angle:.2f}", fg="green")

    def start_recording(self):
        """开始录制路网"""
        if not self.mqtt.is_connected:
            self.set_status("警告: 请先连接 MQTT", fg="orange")
            return
        self.status_var.set("开始录制路网")
        self.mqtt.osm_record_start()

    def stop_recording(self):
        """停止录制路网"""
        if not self.mqtt.is_connected:
            self.set_status("警告: 请先连接 MQTT", fg="orange")
            return
        self.status_var.set("停止录制路网")
        self.mqtt.osm_record_stop()

def main():
    root = tk.Tk()
    app = EnhancedOSMViewer(root)
    root.mainloop()

if __name__ == "__main__":
    main()
