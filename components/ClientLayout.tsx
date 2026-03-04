"use client";

import { usePathname } from "next/navigation";
import { Suspense, memo } from "react";
import { Sidebar } from "./Sidebar";
import Navbar from "./Navbar";
import { ToastProvider } from "./ui/toast-provider";
import { ConfirmProvider } from "./ui/confirm-dialog";

// 简单的加载占位符，保持布局稳定
const PageLoader = memo(function PageLoader() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );
});

// 将 Sidebar 包装为 memo，避免子页面变化时重渲染
const MemoizedSidebar = memo(Sidebar);
const MemoizedNavbar = memo(Navbar);

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/register" || pathname === "/";
  const isProjectPage = pathname?.startsWith("/anime-project/");
  // Script Workshop: list page uses normal app layout; editor/pipeline use full-screen workbench.
  const isScriptWorkshopFullScreenPage =
    pathname?.startsWith("/script-workshop/editor") || pathname?.startsWith("/script-workshop/pipeline");

  if (isAuthPage) {
    return (
      <ToastProvider>
        <ConfirmProvider>
          <div className="min-h-screen w-full">{children}</div>
        </ConfirmProvider>
      </ToastProvider>
    );
  }

  // 全屏模式页面：隐藏全局侧边栏和顶部导航
  const isFullScreenPage = isProjectPage || isScriptWorkshopFullScreenPage;

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen bg-black">
          {!isFullScreenPage && <MemoizedSidebar />}
          <main className="flex-1 overflow-auto h-screen">
            {!isFullScreenPage && <MemoizedNavbar />}
            <Suspense fallback={<PageLoader />}>
              {children}
            </Suspense>
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
