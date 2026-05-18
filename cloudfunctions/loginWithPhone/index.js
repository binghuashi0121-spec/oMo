// cloudfunctions/loginWithPhone/index.js
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { phone, code } = event;
  const wxContext = cloud.getWXContext()
  const db = cloud.database();
  const _ = db.command;

  // 1. 参数校验
  if (!phone || !code) {
    return { code: 400, msg: '手机号和验证码不能为空' }
  }

  try {
    // 2. 验证短信验证码
    // 查询该手机号、未过期、未使用的最新一条验证码
    const smsRes = await db.collection('SmsCode')
      .where({
        phone: phone,
        code: code,
        used: false,
        expireTime: _.gt(db.serverDate()) // 过期时间大于当前时间
      })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get();

    if (smsRes.data.length === 0) {
      return { code: 401, msg: '验证码无效或已过期' };
    }

    const smsRecord = smsRes.data[0];

    // 3. 标记验证码为已使用 (防止重放攻击)
    await db.collection('SmsCode').doc(smsRecord._id).update({
      data: { used: true }
    });

    // 4. 用户查找或注册
    const usersCollection = db.collection('User');
    let userRes = await usersCollection.where({ phone: phone }).get();
    let user = null;

    if (userRes.data.length === 0) {
      // 注册新用户
      const newUser = {
        phone: phone,
        openid: wxContext.OPENID,
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        nickname: '微信用户_' + phone.slice(-4),
        role: 'user', // 默认权限
        status: 'active', // 账号状态
        avatarUrl: '', // 默认头像
      };
      const addRes = await usersCollection.add({ data: newUser });
      user = { ...newUser, _id: addRes._id };
    } else {
      // 老用户登录
      user = userRes.data[0];
      // 检查账号状态
      if (user.status === 'banned') {
        return { code: 403, msg: '账号已被禁用' };
      }
      // 更新登录时间
      await usersCollection.doc(user._id).update({
        data: { lastLoginTime: db.serverDate() }
      });
    }

    // 5. 创建会话 (Session)
    // 生成自定义 Token (这里简单使用 UUID 逻辑或时间戳组合)
    const token = 'session_' + wxContext.OPENID + '_' + Date.now() + '_' + Math.random().toString(36).substr(2);
    // 30天过期
    
    // 【调试日志】打印即将写入的 Session 数据
    console.log('正在创建 Session:', { token, userId: user._id, openid: wxContext.OPENID });

    try {
        await db.collection('Session').add({
          data: {
            token: token,
            userId: user._id,
            openid: wxContext.OPENID,
            createTime: db.serverDate(),
            expireTime: db.serverDate({ offset: 30 * 24 * 60 * 60 * 1000 }),
            deviceInfo: event.deviceInfo || {} // 可扩展记录设备信息
          }
        });
        console.log('Session 创建成功');
    } catch (sessionErr) {
        console.error('Session 创建失败:', sessionErr);
        // 即使 Session 创建失败，也让用户登录成功，但返回错误警告
        // 或者你可以选择直接抛出错误
    }

    // 6. 返回结果
    return {
      code: 0,
      msg: '登录成功',
      data: {
        token: token,
        openid: wxContext.OPENID,
        userInfo: {
          _id: user._id,
          phone: user.phone,
          nickname: user.nickname,
          role: user.role,
          avatarUrl: user.avatarUrl
        }
      }
    }

  } catch (err) {
    console.error('Login Error:', err);
    return {
      code: 500,
      msg: '服务器内部错误',
      error: err
    }
  }
}
