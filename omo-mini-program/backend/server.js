const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// 模拟数据库
const mockDB = {
  trips: [],
  users: []
};

// 根路由检查
app.get('/', (req, res) => {
  res.send('oMo Backend Service is Running!');
});

// 1. 用户登录接口 (模拟)
app.post('/api/login', (req, res) => {
  const { code } = req.body;
  console.log('Received login code:', code);
  
  // 真实场景：使用 code 换取微信 openid
  // 这里直接模拟成功
  res.json({
    code: 0,
    msg: 'success',
    data: {
      token: 'mock_token_' + Date.now(),
      userInfo: {
        id: 1,
        name: '微信用户'
      }
    }
  });
});

// 2. 结束行程接口
app.post('/api/trip/end', (req, res) => {
  const { tripId, location } = req.body;
  console.log('Ending trip:', tripId, location);
  
  // 模拟计算费用
  const fee = 12.5;
  
  res.json({
    code: 0,
    msg: 'success',
    data: {
      fee: fee,
      endTime: new Date().toISOString()
    }
  });
});

// 3. 获取车辆位置接口
app.get('/api/vehicles', (req, res) => {
  // 模拟返回几辆车的位置
  res.json({
    code: 0,
    data: [
      { id: 1, lat: 39.908823, lng: 116.397470 }, // 北京天安门附近示例
      { id: 2, lat: 39.909823, lng: 116.398470 }
    ]
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});