import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import { getApiOrigin } from './api';

type MessageHandler = (message: any) => void;
type ReconnectHandler = () => void;

function resolveBrokerUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (fromEnv) return fromEnv;

  const apiOrigin = getApiOrigin();
  if (apiOrigin.startsWith('https://')) {
    return `wss://${apiOrigin.slice('https://'.length)}/ws`;
  }
  if (apiOrigin.startsWith('http://')) {
    return `ws://${apiOrigin.slice('http://'.length)}/ws`;
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/ws`;
  }

  return 'ws://localhost:3005/ws';
}

function resolveAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

class WebSocketService {
  private client: Client | null = null;
  private subscriptions: Map<string, MessageHandler[]> = new Map();
  private stompSubscriptions: Map<string, StompSubscription> = new Map();
  private connected = false;
  private wasConnected = false;
  private reconnectHandlers: Set<ReconnectHandler> = new Set();
  private lastTransportErrorAt = 0;

  connect() {
    // Idempotent: multiple hooks may call connect() before the socket is fully up.
    // Replacing the client while it's connecting/retrying will amplify errors and leak connections.
    if (this.client) {
      if (!this.client.active) {
        this.client.activate();
      }
      return;
    }

    this.client = new Client({
      brokerURL: resolveBrokerUrl(),
      connectHeaders: resolveAuthHeaders(),
      beforeConnect: async () => {
        if (this.client) {
          this.client.connectHeaders = resolveAuthHeaders();
        }
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      debug: (str) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[WS]', str);
        }
      },
      onConnect: () => {
        console.log('WebSocket connected');
        const isReconnect = this.wasConnected;
        this.connected = true;
        this.wasConnected = true;
        this.resubscribeAll();

        if (isReconnect) {
          console.log('WebSocket reconnected, refreshing state');
          this.reconnectHandlers.forEach((handler) => {
            try {
              handler();
            } catch (e) {
              console.error('Reconnect callback failed:', e);
            }
          });
        }
      },
      onDisconnect: () => {
        console.log('WebSocket disconnected');
        this.connected = false;
      },
      onStompError: (frame) => {
        console.error('WebSocket STOMP error:', frame.headers['message']);
      },
      onWebSocketError: (event) => {
        // Avoid spamming production consoles; still log periodically for diagnostics.
        const now = Date.now();
        if (process.env.NODE_ENV === 'development' || now - this.lastTransportErrorAt > 30_000) {
          this.lastTransportErrorAt = now;
          console.error('WebSocket transport error:', event);
        }
      },
      onWebSocketClose: () => {
        this.connected = false;
      },
    });

    this.client.activate();
  }

  disconnect() {
    if (this.client) {
      this.client.deactivate();
      this.client = null;
      this.connected = false;
      this.wasConnected = false;
      this.subscriptions.clear();
      this.stompSubscriptions.clear();
      this.reconnectHandlers.clear();
    }
  }

  onReconnect(handler: ReconnectHandler): () => void {
    this.reconnectHandlers.add(handler);
    return () => {
      this.reconnectHandlers.delete(handler);
      this.maybeAutoDisconnect();
    };
  }

  subscribeToProject(projectId: number, handler: MessageHandler) {
    const destination = `/topic/project/${projectId}`;
    this.subscribe(destination, handler);
  }

  unsubscribeFromProject(projectId: number, handler?: MessageHandler) {
    const destination = `/topic/project/${projectId}`;
    this.unsubscribe(destination, handler);
  }

  subscribeToUserImages(userId: number, handler: MessageHandler) {
    const destination = `/topic/user/${userId}/images`;
    this.subscribe(destination, handler);
  }

  unsubscribeFromUserImages(userId: number, handler?: MessageHandler) {
    const destination = `/topic/user/${userId}/images`;
    this.unsubscribe(destination, handler);
  }

  subscribeToAssets(handler: MessageHandler) {
    const destination = `/topic/assets`;
    this.subscribe(destination, handler);
  }

  unsubscribeFromAssets(handler?: MessageHandler) {
    const destination = `/topic/assets`;
    this.unsubscribe(destination, handler);
  }

  subscribeToScript(scriptId: number, handler: MessageHandler) {
    const destination = `/topic/script/${scriptId}`;
    this.subscribe(destination, handler);
  }

  unsubscribeFromScript(scriptId: number, handler?: MessageHandler) {
    const destination = `/topic/script/${scriptId}`;
    this.unsubscribe(destination, handler);
  }

  subscribeToAiAgentWorkflow(workflowId: number, handler: MessageHandler) {
    const destination = `/topic/ai-agent/workflow/${workflowId}`;
    this.subscribe(destination, handler);
  }

  unsubscribeFromAiAgentWorkflow(workflowId: number, handler?: MessageHandler) {
    const destination = `/topic/ai-agent/workflow/${workflowId}`;
    this.unsubscribe(destination, handler);
  }

  subscribeToNotifications(handler: MessageHandler) {
    const destination = `/topic/notifications`;
    this.subscribe(destination, handler);
  }

  unsubscribeFromNotifications(handler?: MessageHandler) {
    const destination = `/topic/notifications`;
    this.unsubscribe(destination, handler);
  }

  private subscribe(destination: string, handler: MessageHandler) {
    if (!this.subscriptions.has(destination)) {
      this.subscriptions.set(destination, []);
    }
    const handlers = this.subscriptions.get(destination)!;
    if (!handlers.includes(handler)) {
      handlers.push(handler);
    }

    if (this.client?.connected && !this.stompSubscriptions.has(destination)) {
      const subscription = this.client.subscribe(destination, (message: IMessage) => {
        try {
          const data = JSON.parse(message.body);
          const currentHandlers = this.subscriptions.get(destination) || [];
          currentHandlers.forEach((h) => h(data));
        } catch (e) {
          console.error('Failed to parse websocket message:', e);
        }
      });
      this.stompSubscriptions.set(destination, subscription);
    }
  }

  private unsubscribe(destination: string, handler?: MessageHandler) {
    const handlers = this.subscriptions.get(destination);
    if (!handlers) return;

    if (handler) {
      const nextHandlers = handlers.filter((h) => h !== handler);
      if (nextHandlers.length > 0) {
        this.subscriptions.set(destination, nextHandlers);
        return;
      }
    }

    const subscription = this.stompSubscriptions.get(destination);
    if (subscription) {
      subscription.unsubscribe();
      this.stompSubscriptions.delete(destination);
    }
    this.subscriptions.delete(destination);
    this.maybeAutoDisconnect();
  }

  private resubscribeAll() {
    if (!this.client?.connected) return;
    this.stompSubscriptions.clear();

    this.subscriptions.forEach((handlers, destination) => {
      const subscription = this.client!.subscribe(destination, (message: IMessage) => {
        try {
          const data = JSON.parse(message.body);
          handlers.forEach((h) => h(data));
        } catch (e) {
          console.error('Failed to parse websocket message:', e);
        }
      });
      this.stompSubscriptions.set(destination, subscription);
    });
  }

  isConnected() {
    return this.connected;
  }

  private maybeAutoDisconnect() {
    const hasHandlers = Array.from(this.subscriptions.values()).some((handlers) => handlers.length > 0);
    if (hasHandlers) return;
    if (this.reconnectHandlers.size > 0) return;
    if (!this.client) return;

    // No active consumers; stop reconnect loops.
    this.disconnect();
  }
}

export const wsService = new WebSocketService();
