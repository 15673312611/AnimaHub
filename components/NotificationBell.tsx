"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, CheckCheck, AlertTriangle, Info, AlertCircle, X, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Notification,
  getNotificationSummary,
  getNotifications,
  markAsRead,
  markAllAsRead,
} from "@/lib/notificationApi";
import { wsService } from "@/lib/websocket";

// 通知类型对应的图标和颜色
const notificationTypeConfig = {
  INFO: {
    icon: Info,
    bgColor: "bg-blue-500/10",
    textColor: "text-blue-400",
    borderColor: "border-blue-500/20",
  },
  IMPORTANT: {
    icon: AlertCircle,
    bgColor: "bg-purple-500/10",
    textColor: "text-purple-400",
    borderColor: "border-purple-500/20",
  },
  WARNING: {
    icon: AlertTriangle,
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-400",
    borderColor: "border-amber-500/20",
  },
};

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 获取未读数量
  const fetchUnreadCount = async () => {
    try {
      const summary = await getNotificationSummary();
      setUnreadCount(summary.unreadCount);
    } catch (error) {
      console.error("获取通知数量失败", error);
    }
  };

  // 获取通知列表
  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch (error) {
      console.error("获取通知列表失败", error);
    } finally {
      setIsLoading(false);
    }
  };

  // WebSocket 消息处理
  const handleWsMessage = useCallback((message: any) => {
    if (message.type === "NEW_NOTIFICATION") {
      // 收到新通知，增加未读数
      setUnreadCount((prev) => prev + 1);
      // 如果下拉框是打开的，刷新列表
      if (isOpen) {
        fetchNotifications();
      }
    }
  }, [isOpen]);

  // 初始化：获取未读数量 + 订阅 WebSocket
  useEffect(() => {
    setMounted(true);
    fetchUnreadCount();
    
    // 连接 WebSocket 并订阅通知频道
    wsService.connect();
    wsService.subscribeToNotifications(handleWsMessage);
    
    // 每 60 秒刷新一次未读数量（作为备用）
    const interval = setInterval(fetchUnreadCount, 60000);
    
    return () => {
      clearInterval(interval);
      wsService.unsubscribeFromNotifications();
    };
  }, [handleWsMessage]);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedNotification(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 打开下拉框时加载通知列表
  const handleToggle = () => {
    if (!isOpen) {
      fetchNotifications();
    }
    setIsOpen(!isOpen);
    setSelectedNotification(null);
  };

  // 点击通知项
  const handleNotificationClick = async (notification: Notification) => {
    setSelectedNotification(notification);
    setIsOpen(false); // 关闭下拉框
    setDialogOpen(true);
    
    // 标记为已读
    if (!notification.isRead) {
      try {
        await markAsRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error("标记已读失败", error);
      }
    }
  };

  // 一键已读
  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("标记全部已读失败", error);
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "刚刚";
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString();
  };

  // 关闭弹窗
  const closeDialog = () => {
    setDialogOpen(false);
    setSelectedNotification(null);
  };

  return (
    <>
    <div className="relative" ref={dropdownRef}>
      {/* 铃铛按钮 */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        className="relative text-gray-400 hover:text-white p-2"
      >
        <Bell className="w-5 h-5" />
        {/* 未读红点 */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {/* 下拉面板 */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-gray-900 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gray-900/80">
            <h3 className="text-sm font-medium text-white">消息通知</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllAsRead}
                className="text-xs text-purple-400 hover:text-purple-300 h-auto py-1 px-2"
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1" />
                全部已读
              </Button>
            )}
          </div>

          {/* 通知列表 */}
          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Bell className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">暂无通知</p>
              </div>
            ) : (
              // 通知列表
              <div className="divide-y divide-white/5">
                {notifications.map((notification) => {
                  const config = notificationTypeConfig[notification.type];
                  const Icon = config.icon;

                  return (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-white/5 ${
                        !notification.isRead ? "bg-purple-500/5" : ""
                      }`}
                    >
                      {/* 未读指示器 */}
                      <div className="flex-shrink-0 mt-1.5">
                        {!notification.isRead ? (
                          <div className="w-2 h-2 bg-purple-500 rounded-full" />
                        ) : (
                          <div className="w-2 h-2" />
                        )}
                      </div>

                      {/* 图标 */}
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${config.bgColor}`}
                      >
                        <Icon className={`w-4 h-4 ${config.textColor}`} />
                      </div>

                      {/* 内容 */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium truncate ${
                            notification.isRead ? "text-gray-300" : "text-white"
                          }`}
                        >
                          {notification.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {notification.content}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>

                      {/* 已读标记 */}
                      {notification.isRead && (
                        <Check className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>

    {/* 通知详情弹窗 - 使用 Portal 渲染到 body 解决层级和定位问题 */}
    {mounted && dialogOpen && selectedNotification && createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6" onClick={closeDialog}>
        {/* 遮罩层 - 添加淡入动画 */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" />
        
        {/* 弹窗内容 - 添加缩放和滑入动画 */}
        <div 
          className="relative w-full max-w-2xl bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ring-1 ring-white/5"
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const config = notificationTypeConfig[selectedNotification.type];
            const Icon = config.icon;
            return (
              <>
                {/* 顶部装饰条 - 更加精致的渐变 */}
                <div className={`h-1 w-full ${
                  selectedNotification.type === 'WARNING' 
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600'
                    : selectedNotification.type === 'IMPORTANT'
                    ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-purple-600'
                    : 'bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-600'
                }`} />
                
                <div className="p-6 md:p-8 relative">
                  {/* 背景光效 */}
                  <div className={`absolute top-0 right-0 w-64 h-64 ${config.bgColor} opacity-20 blur-[80px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/3`} />

                  {/* 关闭按钮 */}
                  <button
                    onClick={closeDialog}
                    className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white hover:bg-white/10 rounded-full transition-all duration-200 z-10"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  <div className="relative z-0">
                    {/* 头部信息 */}
                    <div className="flex items-start gap-5">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${config.bgColor} border border-white/10 shadow-inner flex-shrink-0`}>
                        <Icon className={`w-7 h-7 ${config.textColor} drop-shadow-md`} />
                      </div>
                      
                      <div className="flex-1 min-w-0 pt-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${config.bgColor} ${config.textColor} border border-white/5 ring-1 ring-white/5`}>
                            {selectedNotification.type === 'WARNING' ? '警告' : selectedNotification.type === 'IMPORTANT' ? '重要' : '系统通知'}
                          </span>
                          <div className="flex items-center text-xs text-zinc-500 gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatTime(selectedNotification.createdAt)}</span>
                          </div>
                        </div>
                        <h2 className="text-xl md:text-2xl font-bold text-white leading-tight tracking-tight">
                          {selectedNotification.title}
                        </h2>
                      </div>
                    </div>

                    {/* 内容区域 - 更加精致的卡片样式 */}
                    <div className="mt-8">
                      <div className="bg-zinc-900/50 rounded-xl p-6 border border-white/5 shadow-inner">
                        <p className="text-[15px] leading-7 text-zinc-300 whitespace-pre-wrap font-normal">
                          {selectedNotification.content}
                        </p>
                      </div>
                    </div>

                    {/* 底部按钮 */}
                    <div className="mt-8 flex justify-end">
                      <Button
                        onClick={closeDialog}
                        className="bg-white text-black hover:bg-zinc-200 border-0 px-8 py-2.5 h-auto rounded-lg font-medium transition-all shadow-lg hover:shadow-xl active:scale-95"
                      >
                        我知道了
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
