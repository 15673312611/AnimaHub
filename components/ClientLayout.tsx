"use client";

import { usePathname } from "next/navigation";
import { Suspense, memo, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import Navbar from "./Navbar";
import { ToastProvider } from "./ui/toast-provider";
import { ConfirmProvider } from "./ui/confirm-dialog";
import { prefetchRegisterSettings } from "@/lib/register-settings";

const CHUNK_RELOAD_TS_KEY = "__anima_chunk_reload_ts__";
const CHUNK_RELOAD_COOLDOWN_MS = 15000;

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

  useEffect(() => {
    prefetchRegisterSettings();
  }, []);

  useEffect(() => {
    const cleanupStaleServiceWorkers = async () => {
      if (!("serviceWorker" in navigator)) return;
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (!registrations.length) return;

      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    };

    void cleanupStaleServiceWorkers().catch(() => {});
  }, []);

  useEffect(() => {
    const shouldReloadForChunkError = (text: string) =>
      /ChunkLoadError|Loading chunk [\w/-]+ failed|Failed to load chunk|Failed to fetch dynamically imported module/i.test(
        text
      );

    const reloadOnce = () => {
      const now = Date.now();
      const last = Number(sessionStorage.getItem(CHUNK_RELOAD_TS_KEY) || 0);
      if (now - last < CHUNK_RELOAD_COOLDOWN_MS) return;
      sessionStorage.setItem(CHUNK_RELOAD_TS_KEY, String(now));
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      const text = [event.message, event.error?.message].filter(Boolean).join(" ");
      if (shouldReloadForChunkError(text)) reloadOnce();
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const text =
        typeof reason === "string"
          ? reason
          : reason instanceof Error
            ? `${reason.name} ${reason.message}`
            : JSON.stringify(reason);
      if (shouldReloadForChunkError(text)) reloadOnce();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

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
