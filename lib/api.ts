import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3101/api',
  // 暂时移除 withCredentials，因为它与 allowedOriginPatterns("*") 冲突
  // withCredentials: true,
});

// 新 token 的响应头名称
const NEW_TOKEN_HEADER = 'x-new-token';

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
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
    if (error.response?.status === 401 || error.response?.status === 403) {
      // 如果是认证错误，清除 token 并跳转到登录页
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
