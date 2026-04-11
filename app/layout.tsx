import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  title: "妙笔动画 | AI 动漫与视频创作平台",
  description: "妙笔动画是一套面向动画、分镜与商业视频的 AI 创作系统，帮助团队统一角色、风格、镜头与成片输出。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-black text-white antialiased">
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
