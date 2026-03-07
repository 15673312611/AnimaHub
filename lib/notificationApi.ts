import api from './api';

// 类型定义
export interface Notification {
  id: number;
  title: string;
  content: string;
  type: 'INFO' | 'IMPORTANT' | 'WARNING';
  isRead: boolean;
  createdAt: string;
}

export interface NotificationSummary {
  unreadCount: number;
}

// 获取通知摘要（未读数量）
export async function getNotificationSummary(): Promise<NotificationSummary> {
  const response = await api.get('/notifications/summary');
  return response.data;
}

// 获取所有通知列表
export async function getNotifications(): Promise<Notification[]> {
  const response = await api.get('/notifications');
  return response.data;
}

// 获取未读通知列表
export async function getUnreadNotifications(): Promise<Notification[]> {
  const response = await api.get('/notifications/unread');
  return response.data;
}

// 标记单个通知为已读
export async function markAsRead(notificationId: number): Promise<void> {
  await api.post(`/notifications/${notificationId}/read`);
}

// 标记所有通知为已读
export async function markAllAsRead(): Promise<void> {
  await api.post('/notifications/read-all');
}

// 批量标记通知为已读
export async function markAsReadBatch(notificationIds: number[]): Promise<void> {
  await api.post('/notifications/read-batch', notificationIds);
}
