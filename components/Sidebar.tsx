"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Plus,
  Settings, 
  Film, 
  LogOut, 
  Palette, 
  Video, 
  Users,
  Lightbulb,
  BookOpen,
  Coins,
  Image as ImageIcon,
  Clapperboard,
  Library
} from "lucide-react";

const navItems = [
  { name: "工作台", href: "/dashboard", icon: LayoutDashboard },
  { name: "素材库", href: "/assets", icon: Library },
  { name: "AI 生图", href: "/ai-image", icon: ImageIcon },
  { name: "AI 视频生成", href: "/sora-video", icon: Clapperboard },
  { name: "漫画工作流", href: "/comic-workflow", icon: BookOpen },
  { name: "设置", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

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
        <Link href="/create-simple">
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
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
              )}
            >
              <item.icon className={cn("w-4 h-4", isActive ? "text-purple-400" : "text-zinc-500 group-hover:text-zinc-300")} />
              <span>{item.name}</span>
            </Link>
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
