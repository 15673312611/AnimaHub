"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import Navbar from "./Navbar";

import { ToastProvider } from "./ui/toast-provider";

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
        {!isProjectPage && <Sidebar />}
        <main className="flex-1 overflow-auto h-screen">
          <Navbar />
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
