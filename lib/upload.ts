import api from "./api";

/**
 * 使用预签名 URL 上传文件到 OSS
 * @param file 要上传的文件
 * @param folder 存储目录，默认 "uploads"
 * @returns 上传后的文件 URL
 */
export async function uploadToOss(file: File, folder: string = "uploads"): Promise<string> {
  // 1. 获取预签名 URL
  const presignRes = await api.post("/oss/presign", {
    fileName: file.name,
    contentType: file.type,
    folder
  });

  const { uploadUrl, fileUrl, contentType } = presignRes.data;

  // 2. 直接上传到 OSS
  await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType
    },
    body: file
  });

  // 3. 返回最终访问 URL
  return fileUrl;
}
