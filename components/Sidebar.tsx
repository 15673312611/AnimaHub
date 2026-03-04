"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition, useCallback, memo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Plus,
  Settings,
  Film,
  LogOut,
  Coins,
  Image as ImageIcon,
  Library,
  PenTool,
  LucideIcon,
} from "lucide-react";
import { coinApi } from "@/lib/coinApi";

// NOTE: Legacy storyboard/script *parser* UI lives at `/scripts`.
// It is intentionally hidden from the sidebar to avoid confusion with the new Script Workshop.
const navItems = [
  { name: "工作台", href: "/dashboard", icon: LayoutDashboard },
  { name: "剧本工坊", href: "/script-workshop", icon: PenTool },
  { name: "公共素材库", href: "/assets", icon: Library },
  { name: "AI 生图", href: "/ai-image", icon: ImageIcon },
  { name: "设置", href: "/settings", icon: Settings },
];

// 将导航项抽离为独立的 memo 组件，避免不必要的重渲染
const NavItem = memo(function NavItem({ 
  item, 
  isActive, 
  isPending,
  onClick 
}: { 
  item: { name: string; href: string; icon: LucideIcon };
  isActive: boolean;
  isPending: boolean;
  onClick: (href: string) => void;
}) {
  const Icon = item.icon;
  
  return (
    <button
      onClick={() => onClick(item.href)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        isActive
          ? "bg-white/10 text-white"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
        isPending && "opacity-70"
      )}
    >
      <Icon className={cn("w-4 h-4", isActive ? "text-purple-400" : "text-zinc-500")} />
      <span>{item.name}</span>
    </button>
  );
});

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [coinBalance, setCoinBalance] = useState<number | null>(null);

  // 获取漫币余额
  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await coinApi.getBalance();
        setCoinBalance(res.data.balance);
      } catch (err) {
        console.error('获取漫币余额失败', err);
      }
    };
    fetchBalance();
  }, []);

  // 使用 startTransition 包裹导航，让 UI 保持响应
  const handleNavigation = useCallback((href: string) => {
    startTransition(() => {
      router.push(href);
    });
  }, [router]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    router.push('/login');
  }, [router]);

  return (
    <div className="w-64 bg-zinc-950 border-r border-white/5 h-screen flex flex-col">
      {/* Logo Section */}
      <div className="p-6 pb-2">
        <div className="flex items-center gap-2 font-bold text-xl text-white tracking-tight">
          <div className="w-8 h-8 bg-white text-black rounded-lg flex items-center justify-center">
            <Film className="w-5 h-5 fill-current" />
          </div>
          <span>妙笔动画</span>
        </div>
      </div>

      {/* Primary Action */}
      <div className="px-4 py-4">
        <Link href="/create-simple" prefetch={true}>
          <button className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20">
            <Plus className="w-4 h-4" />
            <span>新建项目</span>
          </button>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <NavItem
              key={item.href}
              item={item}
              isActive={isActive}
              isPending={isPending}
              onClick={handleNavigation}
            />
          );
        })}
      </nav>
    </div>
  );
}
