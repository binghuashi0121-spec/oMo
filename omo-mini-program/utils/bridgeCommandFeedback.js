function commandFailureFeedback(result = {}) {
  const code = String(result && result.code || '');
  if (code === 'BRIDGE_COMMANDS_DISABLED') {
    return {
      title: '车辆控制未开放',
      content: '当前体验版未开放车辆控制。测试订单已创建，可立即取消，车辆不会收到运动指令。',
      confirmText: '取消订单',
      cancelText: '返回等待页'
    };
  }

  return {
    title: '车辆指令发送失败',
    content: (result && result.msg) || '测试订单已创建，但车辆指令未发送成功。可取消订单后重试。',
    confirmText: '取消订单',
    cancelText: '返回等待页'
  };
}

module.exports = { commandFailureFeedback };
