"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition, useCallback, memo } from "react";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Plus,
  Settings, 
  Film, 
  LogOut, 
  BookOpen,
  Coins,
  Image as ImageIcon,
  Library,
  LucideIcon
} from "lucide-react";

const navItems = [
  { name: "工作台", href: "/dashboard", icon: LayoutDashboard },
  { name: "剧本", href: "/scripts", icon: BookOpen },
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
          <span>AnimaHub</span>
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

      {/* User Profile / Bottom Section */}
      <div className="p-4 border-t border-white/5 bg-black/20">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xs font-bold text-white">
            U
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="text-sm font-medium text-white truncate">创作者</div>
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <Coins className="w-3 h-3" /> 100 积分
            </div>
          </div>
        </div>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <LogOut className="w-3 h-3" /> 退出登录
        </button>
      </div>
    </div>
  );
}
