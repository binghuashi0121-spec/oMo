process.env.NODE_ENV = 'test';
process.env.DATA_DRIVER = 'memory';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_WEB_ORIGIN = 'http://localhost:4173';
delete process.env.MQTT_BRIDGE_HEALTH_URL;
