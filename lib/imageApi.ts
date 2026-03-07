import api from "./api";

export interface ImageGenerateParams {
  prompt: string;
  model?: string;
  modelId?: number | string;
  size?: string;
  referenceImages?: string[];
  referenceImage?: string | null;
}

export interface ImageStatusResponse {
  status?: string;
  imageUrl?: string;
  errorMessage?: string;
  [key: string]: any;
}

export const imageApi = {
  generate: (params: ImageGenerateParams) => api.post("/images/generate", params),
  getStatus: (id: number | string) => api.get(`/images/${id}/status`),
  getHistory: (params?: { page?: number; pageSize?: number }) =>
    api.get("/images/history", { params }),
};
