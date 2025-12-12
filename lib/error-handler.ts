/**
 * 统一错误处理工具
 */

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

/**
 * 从 API 错误响应中提取错误信息
 */
export function extractErrorMessage(error: any): string {
  // Axios 错误
  if (error.response) {
    const data = error.response.data;
    
    // 后端返回的错误信息
    if (data?.error) {
      return data.error;
    }
    
    if (data?.message) {
      return data.message;
    }
    
    // HTTP 状态码错误
    const status = error.response.status;
    switch (status) {
      case 400:
        return '请求参数错误';
      case 401:
        return '未授权，请重新登录';
      case 403:
        return '没有权限访问';
      case 404:
        return '请求的资源不存在';
      case 500:
        return '服务器内部错误';
      case 502:
        return '网关错误';
      case 503:
        return '服务暂时不可用';
      default:
        return `请求失败 (${status})`;
    }
  }
  
  // 网络错误
  if (error.request) {
    return '网络连接失败，请检查网络';
  }
  
  // 其他错误
  if (error.message) {
    return error.message;
  }
  
  return '未知错误';
}

/**
 * 格式化错误信息用于显示
 */
export function formatErrorForDisplay(error: any): string {
  const message = extractErrorMessage(error);
  
  // 添加 emoji 图标
  if (message.includes('网络')) {
    return `🌐 ${message}`;
  }
  
  if (message.includes('权限') || message.includes('授权')) {
    return `🔒 ${message}`;
  }
  
  if (message.includes('不存在') || message.includes('未找到')) {
    return `🔍 ${message}`;
  }
  
  if (message.includes('服务器')) {
    return `⚠️ ${message}`;
  }
  
  return `❌ ${message}`;
}

/**
 * 处理 API 错误并显示 toast
 */
export function handleApiError(error: any, toast: (message: string, type: string) => void, defaultMessage?: string) {
  const message = formatErrorForDisplay(error);
  toast(defaultMessage || message, 'error');
  
  // 开发环境下打印详细错误
  if (process.env.NODE_ENV === 'development') {
    console.error('API Error:', error);
  }
}

/**
 * 安全执行异步操作
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  toast: (message: string, type: string) => void,
  options?: {
    successMessage?: string;
    errorMessage?: string;
    onSuccess?: (data: T) => void;
    onError?: (error: any) => void;
  }
): Promise<T | null> {
  try {
    const result = await fn();
    
    if (options?.successMessage) {
      toast(options.successMessage, 'success');
    }
    
    if (options?.onSuccess) {
      options.onSuccess(result);
    }
    
    return result;
  } catch (error) {
    handleApiError(error, toast, options?.errorMessage);
    
    if (options?.onError) {
      options.onError(error);
    }
    
    return null;
  }
}
