"use client";

import { usePathname } from "next/navigation";
import { Suspense, memo } from "react";
import { Sidebar } from "./Sidebar";
import Navbar from "./Navbar";
import { ToastProvider } from "./ui/toast-provider";

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

  if (isAuthPage) {
    return (
      <ToastProvider>
        <div className="min-h-screen w-full">{children}</div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-black">
        {!isProjectPage && <MemoizedSidebar />}
        <main className="flex-1 overflow-auto h-screen">
          <MemoizedNavbar />
          <Suspense fallback={<PageLoader />}>
            {children}
          </Suspense>
        </main>
      </div>
    </ToastProvider>
  );
}
