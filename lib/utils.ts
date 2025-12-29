import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 将图片URL转换为缩略图URL（阿里云OSS图片处理）
 * @param url 原始图片URL
 * @param width 缩略图宽度，默认200px
 * @returns 缩略图URL
 * 
 * 使用场景：
 * - 列表卡片: 200px
 * - 素材缩略图: 76px (FragmentEditor中的素材展示)
 * - AI接口调用: 200px
 * 
 * 不使用缩略图的场景：
 * - 用户点击查看大图时
 * - 实际提交生成任务时（需要原图URL）
 * - 下载功能
 */
export function toThumbnailUrl(url: string, width: number = 200): string {
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
