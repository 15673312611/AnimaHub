import axios from 'axios';

const DEFAULT_API_BASE_URL = 'http://localhost:3005/api';
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');

const readAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
};

export const getApiBaseUrl = (): string => API_BASE_URL;

export const getApiOrigin = (): string => {
  if (/^https?:\/\//.test(API_BASE_URL)) {
    try {
      return new URL(API_BASE_URL).origin;
    } catch {
      return '';
    }
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
};

export const apiFetch = (path: string, init: RequestInit = {}) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const headers = new Headers(init.headers || {});
  const token = readAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...init,
    headers,
  });
};

const api = axios.create({
  baseURL: API_BASE_URL,
  // 暂时移除 withCredentials，因为它与 allowedOriginPatterns("*") 冲突
  // withCredentials: true,
});

// 新 token 的响应头名称
const NEW_TOKEN_HEADER = 'x-new-token';

api.interceptors.request.use((config) => {
  const token = readAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // 开发环境打印请求日志
  if (process.env.NODE_ENV === 'development') {
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data || '');
  }
  
  return config;
});

// 响应拦截器：处理 token 自动刷新和认证错误
api.interceptors.response.use(
  (response) => {
    // 检查是否有新 token（后端在 token 快过期时自动刷新）
    const newToken = response.headers[NEW_TOKEN_HEADER];
    if (newToken && typeof window !== 'undefined') {
      localStorage.setItem('token', newToken);
      console.log('[Auth] Token 已自动刷新');
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // 仅在“未登录/鉴权失败”时跳转登录；业务层面的 403（无权限）不应被当成需要重新登录
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        // 如果当前已经在登录页或注册页，不要跳转（避免登录失败时刷新页面）
        if (currentPath === '/login' || currentPath === '/register') {
          return Promise.reject(error);
        }
        localStorage.removeItem('token');
        // 跳转到登录页面,并保存当前路径用于登录后返回
        const returnUrl = `?returnUrl=${encodeURIComponent(currentPath)}`;
        window.location.href = `/login${returnUrl}`;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
