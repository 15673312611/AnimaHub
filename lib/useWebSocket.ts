"use client";

import { useEffect, useCallback, useRef } from 'react';
import { wsService } from './websocket';

interface VideoStatusUpdate {
  type: 'VIDEO_STATUS_UPDATE';
  videoId: number;
  projectId: number;
  status: string;
  progress: number;
  videoUrl?: string;
  errorMessage?: string;
  timestamp: number;
}

interface ImageStatusUpdate {
  type: 'IMAGE_STATUS_UPDATE';
  imageId: number;
  projectId?: number;
  videoId?: number;
  userId?: number;
  status: string;
  imageUrl?: string;
  prompt?: string;
  model?: string;
  ratio?: string;
  errorMessage?: string;
  timestamp: number;
}

type WebSocketMessage = VideoStatusUpdate | ImageStatusUpdate | { type: string; data: any };

/**
 * 订阅项目的 WebSocket 消息
 */
export function useProjectWebSocket(
  projectId: number | null,
  onMessage: (message: WebSocketMessage) => void,
  onReconnect?: () => void
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!projectId) return;

    // 防止重复订阅
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    // 连接 WebSocket
    wsService.connect();

    // 订阅项目频道
    const handler = (message: WebSocketMessage) => {
      onMessageRef.current(message);
    };

    wsService.subscribeToProject(projectId, handler);
    
    // 注册重连回调
    const unsubscribeReconnect = wsService.onReconnect(() => {
      if (onReconnectRef.current) {
        onReconnectRef.current();
      }
    });

    return () => {
      subscribedRef.current = false;
      wsService.unsubscribeFromProject(projectId, handler);
      unsubscribeReconnect();
    };
  }, [projectId]);
}

/**
 * 视频状态更新 Hook
 */
export function useVideoStatusUpdates(
  projectId: number | null,
  onVideoUpdate: (videoId: number, status: string, videoUrl?: string) => void
) {
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'VIDEO_STATUS_UPDATE') {
      const update = message as VideoStatusUpdate;
      onVideoUpdate(update.videoId, update.status, update.videoUrl);
    }
  }, [onVideoUpdate]);

  useProjectWebSocket(projectId, handleMessage);
}

interface ScriptImageUpdate {
  type: 'SCRIPT_IMAGE_UPDATE';
  scriptId: number;
  itemType: 'character' | 'scene';
  itemId: number;
  status: string;
  imageUrl?: string;
  errorMessage?: string;
  timestamp: number;
}

/**
 * 订阅剧本的 WebSocket 消息（人物/场景图片生成）
 */
export function useScriptWebSocket(
  scriptId: number | null,
  onMessage: (message: ScriptImageUpdate) => void,
  onReconnect?: () => void
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;
  const subscribedRef = useRef(false);
  useEffect(() => {
    if (!scriptId) return;

    // 防止重复订阅
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    // 连接 WebSocket
    wsService.connect();

    // 创建稳定的 handler 引用
    const handler = (message: any) => {
      if (message.type === 'SCRIPT_IMAGE_UPDATE') {
        onMessageRef.current(message as ScriptImageUpdate);
      }
    };

    wsService.subscribeToScript(scriptId, handler);
    
    // 注册重连回调
    const unsubscribeReconnect = wsService.onReconnect(() => {
      if (onReconnectRef.current) {
        onReconnectRef.current();
      }
    });

    return () => {
      subscribedRef.current = false;
      wsService.unsubscribeFromScript(scriptId, handler);
      unsubscribeReconnect();
    };
  }, [scriptId]);
}

/**
 * AI Agent 工作流消息类型
 */
export interface AiAgentWebSocketMessage {
  type: string;
  workflowId: number;
  characterId?: number;
  sceneId?: number;
  shotId?: number;
  itemId?: number;
  taskId?: number;
  targetId?: number;
  taskType?: string;
  /**
   * 四宫格视频槽位索引（后端在视频完成/失败时可能携带）。
   * 0-3
   */
  slotIndex?: number;
  imageUrl?: string;
  videoUrl?: string;
  error?: string;
  count?: number;
}

/**
 * 订阅 AI Agent 工作流的 WebSocket 消息
 */
export function useAiAgentWebSocket(
  workflowId: number | null,
  onMessage: (message: AiAgentWebSocketMessage) => void,
  onReconnect?: () => void
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!workflowId) return;

    // 防止重复订阅
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    // 连接 WebSocket
    wsService.connect();

    // 创建 handler
    const handler = (message: any) => {
      onMessageRef.current(message as AiAgentWebSocketMessage);
    };

    wsService.subscribeToAiAgentWorkflow(workflowId, handler);
    
    // 注册重连回调
    const unsubscribeReconnect = wsService.onReconnect(() => {
      if (onReconnectRef.current) {
        onReconnectRef.current();
      }
    });

    return () => {
      subscribedRef.current = false;
      wsService.unsubscribeFromAiAgentWorkflow(workflowId, handler);
      unsubscribeReconnect();
    };
  }, [workflowId]);
}
