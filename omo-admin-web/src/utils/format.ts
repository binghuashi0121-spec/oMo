import dayjs from 'dayjs';

export function money(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export function shanghaiTime(value?: string): string {
  if (!value) return '—';
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
}

export function relativeFreshness(value: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  return shanghaiTime(value);
}

export const orderStatusLabel: Record<string, string> = {
  waiting_pickup: '待取车',
  active: '进行中',
  completed: '已完成',
  cancelled: '已取消',
};

export const vehicleStatusLabel: Record<string, string> = {
  available: '可用',
  active: '行程中',
  charging: '充电中',
  offline: '离线',
  fault: '故障',
};
