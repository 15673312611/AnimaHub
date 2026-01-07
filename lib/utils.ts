import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 将图片URL转换为缩略图URL（阿里云OSS图片处理）
 * @param url 原始图片URL
 * @param width 缩略图宽度，默认800px（不要太小，否则图片会模糊）
 * @returns 缩略图URL
 * 
 * 使用场景：
 * - 默认/通用: 800px（保证清晰度）
 * - 小型参考图: 200px（参考素材选择器中的小图）
 * - 微型缩略图: 76px（FragmentEditor中的素材展示）
 * - AI接口调用: 200px（节省token）
 * 
 * 不使用缩略图的场景：
 * - 用户点击查看大图时（使用原图URL）
 * - 实际提交生成任务时（需要原图URL）
 * - 下载功能
 */
export function toThumbnailUrl(url: string, width: number = 800): string {
  if (!url) return url;
  // 只处理阿里云OSS链接
  if (url.includes("aliyuncs.com")) {
    // 如果已经有处理参数，不重复添加
    if (url.includes("x-oss-process=")) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}x-oss-process=image/resize,w_${width}/quality,q_90/format,webp`;
  }
  return url;
}
