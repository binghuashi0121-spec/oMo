const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { runtimeId, distanceIncrement, location, isTempParking, parkingAction } = event;
  
  // 1. 参数校验
  if (!runtimeId) {
    return { code: 1001, msg: '缺少过程ID' };
  }

  try {
    // 2. 权限校验（可选，确保是本人操作）
    // 这里简单起见，假设 runtimeId 是可信的，或者通过 tripId + openid 双重校验

    // 3. 构建更新数据
    // 2. runtime 归属校验，防止越权写入
    let runtimeDoc;
    try {
      runtimeDoc = await db.collection('trip_runtime').doc(runtimeId).get();
    } catch (e) {
      if (e && e.errMsg && e.errMsg.includes('document not exist')) {
        return { code: 1002, msg: '过程记录不存在' };
      }
      throw e;
    }

    const runtime = runtimeDoc.data;
    if (!runtime) {
      return { code: 1002, msg: '过程记录不存在' };
    }

    if (runtime.openid && runtime.openid !== openid) {
      return { code: 1003, msg: '无权操作该过程记录' };
    }

    if (runtime.tripId) {
      try {
        const tripDoc = await db.collection('trips').doc(runtime.tripId).get();
        const trip = tripDoc.data;
        if (!trip || trip.openid !== openid) {
          return { code: 1003, msg: '无权操作该过程记录' };
        }
      } catch (e) {
        if (e && e.errMsg && e.errMsg.includes('document not exist')) {
          return { code: 1002, msg: '关联行程不存在' };
        }
        throw e;
      }
    }

    let updateData = {
        lastUpdateAt: db.serverDate(),
        updateTime: db.serverDate()
    };

    // 3.1 累加里程
    if (distanceIncrement && distanceIncrement > 0) {
      updateData.distanceMetersRaw = _.inc(distanceIncrement);
    }

    // 3.2 更新最后位置
    if (location) {
      updateData.lastLocation = location;
    }

    // 3.3 处理临停状态变更
    // parkingAction: 'start' | 'end'
    if (parkingAction) {
      if (parkingAction === 'start') {
        updateData.isTempParking = true;
        updateData.parkingSessions = _.push({
          startAt: db.serverDate(),
          endAt: null,
          durationSec: 0,
          fee: 0
        });
      } else if (parkingAction === 'end') {
        updateData.isTempParking = false;
        // 读取当前记录，关闭最后一个未结束的停车会话
        const doc = await db.collection('trip_runtime').doc(runtimeId).get();
        const sessions = doc.data.parkingSessions || [];
        if (sessions.length > 0) {
          const lastSession = sessions[sessions.length - 1];
          if (!lastSession.endAt) {
            lastSession.endAt = new Date();
          }
          updateData.parkingSessions = sessions;
        }
      }
    }

    // 4. 执行更新
    await db.collection('trip_runtime').doc(runtimeId).update({
        data: updateData
    });

    return {
        code: 0,
        msg: '更新成功'
    };

  } catch (err) {
    console.error('updateTripData error', err);
    return {
        code: 500,
        msg: '更新失败',
        error: err
    };
  }
};
