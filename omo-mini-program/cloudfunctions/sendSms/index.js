// cloudfunctions/sendSms/index.js
const cloud = require('wx-server-sdk');
const { canReturnDebugCode } = require('./debugPolicy');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const phone = event.phone;
  const wxContext = cloud.getWXContext();

  // 1. 生成6位随机验证码
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // 调试码只允许目标 staging 环境与目标小程序 AppID，正式环境始终关闭。
  const debugCodeEnabled = canReturnDebugCode(wxContext, process.env);

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

    if (debugCodeEnabled) {
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
