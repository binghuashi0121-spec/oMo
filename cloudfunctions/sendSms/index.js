// cloudfunctions/sendSms/index.js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const phone = event.phone;
  const wxContext = cloud.getWXContext();

  // 1. 生成6位随机验证码
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // 只有明确打开开关的非生产开发环境才返回 debug_code。
  const envName = String((wxContext && wxContext.ENV) || '').toLowerCase();
  const isDevEnv = process.env.NODE_ENV !== 'production' &&
    (envName.includes('dev') || envName.includes('test') || envName.includes('local'));
  const debugCodeEnabled = process.env.SMS_DEBUG_CODE_ENABLED === 'true';

  try {
    // 2. 将验证码存入 SmsCode 集合
    await db.collection('SmsCode').add({
      data: {
        phone,
        code,
        createTime: db.serverDate(),
        expireTime: db.serverDate({ offset: 5 * 60 * 1000 }),
        used: false
      }
    });

    const result = {
      code: 0,
      msg: '验证码发送成功'
    };

    if (isDevEnv && debugCodeEnabled) {
      result.debug_code = code;
    }

    return result;
  } catch (err) {
    console.error(err);
    return {
      code: 500,
      msg: '验证码发送失败'
    };
  }
};
