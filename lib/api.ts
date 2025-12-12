import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  // 暂时移除 withCredentials，因为它与 allowedOriginPatterns("*") 冲突
  // withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：处理认证错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // 如果是认证错误，清除 token
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
