import api from "./api";

export interface CoinInfo {
  balance: number;
  username: string;
}

export interface ModelPrice {
  modelCode: string;
  modelType: string;
  pricePerCall: number;
  isEnabled: boolean;
  description?: string;
}

export interface CoinCheckResult {
  sufficient: boolean;
  balance: number;
  price: number;
  shortage: number;
}

export interface BalanceResponse {
  balance: number;
}

export interface PriceResponse {
  modelCode: string;
  price: number;
}

export const coinApi = {
  // 获取用户漫币余额
  getBalance: () => api.get<BalanceResponse>("/coins/balance"),
  
  // 获取用户漫币信息（余额+用户名）
  getInfo: () => api.get<CoinInfo>("/coins/info"),
  
  // 获取指定模型的价格
  getModelPrice: (modelCode: string) => api.get<PriceResponse>(`/coins/price/${modelCode}`),
  
  // 获取所有模型价格列表
  getAllPricing: () => api.get<ModelPrice[]>("/coins/pricing"),
  
  // 检查余额是否足够
  checkBalance: (modelCode: string) => api.get<CoinCheckResult>(`/coins/check/${modelCode}`),
};
