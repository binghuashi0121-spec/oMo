-- 初始化数据库结构脚本

-- 1. 创建用户表
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID',
  `openid` VARCHAR(64) NOT NULL UNIQUE COMMENT '微信OpenID',
  `nickname` VARCHAR(64) DEFAULT '微信用户' COMMENT '昵称',
  `avatar_url` VARCHAR(255) COMMENT '头像URL',
  `phone` VARCHAR(20) COMMENT '手机号',
  `balance` DECIMAL(10, 2) DEFAULT 0.00 COMMENT '余额',
  `is_admin` TINYINT DEFAULT 0 COMMENT '是否管理员: 0否 1是',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 创建车辆表
CREATE TABLE IF NOT EXISTS `vehicles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '车辆ID',
  `qr_code` VARCHAR(64) NOT NULL UNIQUE COMMENT '车辆二维码/编号',
  `lat` DECIMAL(10, 6) NOT NULL COMMENT '当前纬度',
  `lng` DECIMAL(10, 6) NOT NULL COMMENT '当前经度',
  `battery` INT DEFAULT 100 COMMENT '剩余电量%',
  `status` TINYINT DEFAULT 0 COMMENT '状态: 0空闲 1使用中 2故障 3维护中',
  `model` VARCHAR(50) DEFAULT 'Standard' COMMENT '车型',
  `last_active_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '最后活跃时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 创建行程/订单表
CREATE TABLE IF NOT EXISTS `trips` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT '订单ID',
  `user_id` INT NOT NULL COMMENT '用户ID',
  `vehicle_id` INT NOT NULL COMMENT '车辆ID',
  `status` TINYINT DEFAULT 0 COMMENT '状态: 0进行中 1已完成 2已取消',
  `start_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '开始时间',
  `end_time` TIMESTAMP NULL COMMENT '结束时间',
  `start_lat` DECIMAL(10, 6) COMMENT '起点纬度',
  `start_lng` DECIMAL(10, 6) COMMENT '起点经度',
  `end_lat` DECIMAL(10, 6) COMMENT '终点纬度',
  `end_lng` DECIMAL(10, 6) COMMENT '终点经度',
  `distance` INT DEFAULT 0 COMMENT '行驶距离(米)',
  `cost` DECIMAL(10, 2) DEFAULT 0.00 COMMENT '费用(元)',
  `pay_status` TINYINT DEFAULT 0 COMMENT '支付状态: 0未支付 1已支付',
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 插入一些测试数据
INSERT INTO `vehicles` (`qr_code`, `lat`, `lng`, `battery`, `status`) VALUES 
('AB101', 39.908823, 116.397470, 85, 0),
('CD102', 39.909823, 116.398470, 92, 0),
('EF103', 39.907823, 116.396470, 45, 0);