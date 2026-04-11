import axios from "axios";

const DEFAULT_API_BASE_URL = "http://localhost:3005/api";
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");

const NEW_TOKEN_HEADER = "x-new-token";

const readAuthToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
};

export const getApiBaseUrl = (): string => API_BASE_URL;

export const getApiOrigin = (): string => {
  if (/^https?:\/\//.test(API_BASE_URL)) {
    try {
      return new URL(API_BASE_URL).origin;
    } catch {
      return "";
    }
  }
  if (typeof window !== "undefined") return window.location.origin;
  return "";
};

export const apiFetch = (path: string, init: RequestInit = {}) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const headers = new Headers(init.headers || {});
  const token = readAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...init,
    headers,
  });
};

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = readAuthToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data || "");
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    const newToken = response.headers[NEW_TOKEN_HEADER];
    if (newToken && typeof window !== "undefined") {
      localStorage.setItem("token", newToken);
      console.log("[Auth] Token auto refreshed");
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const currentPath = window.location.pathname;

      if (currentPath === "/login" || currentPath === "/register") {
        return Promise.reject(error);
      }

      localStorage.removeItem("token");
      const returnUrl = `?returnUrl=${encodeURIComponent(currentPath)}`;
      window.location.href = `/login${returnUrl}`;
    }

    return Promise.reject(error);
  }
);

export default api;
