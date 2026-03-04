"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Film, LogOut, User, Loader2, Coins, RefreshCw, CreditCard, MessageCircle, UserPlus, X, Copy, Check, Sparkles, Zap, KeyRound } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import NotificationBell from "./NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface UserProfile {
  id: number;
  username: string;
  email: string;
  credits: number;
}

interface RechargePackage {
  id: number;
  coins: number;
  price: number;
  label: string;
  tag?: string;
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showWechatDialog, setShowWechatDialog] = useState(false);
  const [showRechargeDialog, setShowRechargeDialog] = useState(false);
  const [cardKey, setCardKey] = useState("");
  const [recharging, setRecharging] = useState(false);
  const [copiedWechat, setCopiedWechat] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [rechargePackages, setRechargePackages] = useState<RechargePackage[]>([]);
  const [rechargeTab, setRechargeTab] = useState<'packages' | 'cardkey'>('packages');
  const [contactConfig, setContactConfig] = useState<{ wechatQrcodeUrl: string; wechatId: string }>({ wechatQrcodeUrl: '', wechatId: '' });

  const fetchContactConfig = async () => {
    try {
      const response = await api.get("/config/contact");
      setContactConfig(response.data);
    } catch (error) {
      console.error("获取客服配置失败", error);
    }
  };

  const fetchRechargePackages = async () => {
    try {
      const response = await api.get("/config/recharge-packages");
      setRechargePackages(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("获取充值套餐失败", error);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchUserProfile();
    } else {
      setLoading(false);
    }
    fetchRechargePackages();
    fetchContactConfig();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const response = await api.get("/user/profile");
      setUser(response.data);
    } catch (error) {
      console.error("获取用户信息失败", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshBalance = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const response = await api.get("/user/profile");
      setUser(response.data);
    } catch (error) {
      console.error("刷新余额失败", error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  const handleCardKeyRecharge = async () => {
    if (!cardKey.trim()) {
      alert("请输入卡密");
      return;
    }
    setRecharging(true);
    try {
      const response = await api.post("/user/recharge", { cardKey: cardKey.trim() });
      alert(`充值成功！充值 ${response.data.coins || ''} 漫币`);
      setCardKey("");
      // 刷新余额
      await handleRefreshBalance();
    } catch (error: any) {
      const message = error.response?.data?.error || "卡密无效或已使用";
      alert(message);
    } finally {
      setRecharging(false);
    }
  };

  const handleCopyWechat = () => {
    navigator.clipboard.writeText(contactConfig.wechatId || "");
    setCopiedWechat(true);
    setTimeout(() => setCopiedWechat(false), 2000);
  };

  if (pathname === '/' || pathname === '/login' || pathname === '/register') {
    return null;
  }

  return (
    <>
      <nav className="border-b border-white/10 bg-black/80 backdrop-blur-md sticky top-0 z-40">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 text-xl font-bold">
              <Film className="w-6 h-6 text-purple-500" />
              <span className="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                妙笔动画
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : user ? (
              <>
                {/* 漫币显示 + 刷新 + 充值 */}
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                  <Coins className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-zinc-200">
                    {user.credits}
                  </span>
                  <span className="text-xs text-zinc-500">漫币</span>
                  <button
                    onClick={handleRefreshBalance}
                    disabled={refreshing}
                    className="ml-1 p-0.5 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50"
                    title="刷新余额"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* 充值按钮 */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRechargeDialog(true)}
                  className="hidden sm:flex items-center gap-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 border border-purple-500/30 rounded-full px-3 py-1.5 h-auto"
                >
                  <CreditCard className="w-4 h-4" />
                  <span className="text-sm">充值</span>
                </Button>

                {/* 消息通知 */}
                <NotificationBell />

                {/* 用户头像下拉菜单 */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 transition-all shadow-lg shadow-purple-500/20 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-black">
                      <span className="text-sm font-bold text-white">
                        {user.username?.charAt(0).toUpperCase()}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="text-gray-400">
                      {user.username}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer gap-2"
                      onClick={() => setShowWechatDialog(true)}
                    >
                      <MessageCircle className="w-4 h-4 text-green-400" />
                      联系客服
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer gap-2"
                      onClick={() => router.push('/settings')}
                    >
                      <UserPlus className="w-4 h-4 text-blue-400" />
                      账号设置
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 text-red-400 focus:text-red-400"
                      onClick={handleLogout}
                    >
                      <LogOut className="w-4 h-4" />
                      退出登录
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>
        </div>
      </nav>

      {/* 联系客服弹窗 - 微信二维码 */}
      <Dialog open={showWechatDialog} onOpenChange={setShowWechatDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">联系客服</DialogTitle>
            <DialogDescription className="text-center text-gray-400">
              扫描二维码或添加微信联系我们
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {contactConfig.wechatQrcodeUrl && (
              <div className="w-48 h-48 rounded-lg overflow-hidden border border-white/10">
                <img
                  src={contactConfig.wechatQrcodeUrl}
                  alt="客服微信二维码"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            {contactConfig.wechatId && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10">
              <span className="text-gray-400 text-sm">微信号：</span>
              <span className="text-white font-medium">{contactConfig.wechatId}</span>
              <button
                onClick={handleCopyWechat}
                className="ml-2 p-1 rounded hover:bg-white/10 transition-colors"
                title="复制微信号"
              >
                {copiedWechat ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 充值弹窗 */}
      <Dialog open={showRechargeDialog} onOpenChange={(open) => { setShowRechargeDialog(open); if (!open) { setSelectedPackage(null); setRechargeTab('packages'); } }}>
        <DialogContent className="bg-[#0e0e12] border-white/[0.1] text-white max-w-2xl w-[95vw] p-0 overflow-hidden gap-0 rounded-2xl [&>button]:text-zinc-500 [&>button]:hover:text-white [&>button]:z-20">
          <DialogHeader className="sr-only">
            <DialogTitle>漫币充值</DialogTitle>
            <DialogDescription>选择套餐或使用卡密充值</DialogDescription>
          </DialogHeader>

          {/* ====== Hero 头部 ====== */}
          <div className="relative overflow-hidden">
            {/* Mesh 渐变背景 */}
            <div className="absolute inset-0 bg-gradient-to-br from-purple-600/25 via-purple-900/10 to-pink-500/15" />
            <div className="absolute top-0 right-0 w-72 h-72 bg-purple-500/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-56 h-56 bg-pink-500/15 rounded-full blur-[60px] translate-y-1/2 -translate-x-1/4" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-blue-500/8 rounded-full blur-[50px]" />
            {/* 网格纹理 */}
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

            <div className="relative px-8 pt-10 pb-8">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-medium text-purple-300/80 uppercase tracking-widest mb-3">我的账户</p>
                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl font-extrabold tracking-tight text-white">
                      {user?.credits?.toLocaleString() ?? 0}
                    </span>
                    <span className="text-base font-medium text-zinc-400">漫币</span>
                  </div>
                </div>
                <button
                  onClick={handleRefreshBalance}
                  disabled={refreshing}
                  className="mb-2 w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-40 backdrop-blur-sm"
                >
                  <RefreshCw className={`w-4 h-4 text-zinc-400 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* ====== Tab 栏 ====== */}
          <div className="px-8 flex gap-6 border-b border-white/[0.08]">
            <button
              onClick={() => setRechargeTab('packages')}
              className={`pb-3 text-sm font-medium transition-all relative ${
                rechargeTab === 'packages' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              套餐充值
              {rechargeTab === 'packages' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
              )}
            </button>
            <button
              onClick={() => setRechargeTab('cardkey')}
              className={`pb-3 text-sm font-medium transition-all relative ${
                rechargeTab === 'cardkey' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              卡密兑换
              {rechargeTab === 'cardkey' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
              )}
            </button>
          </div>

          {/* ====== 套餐充值 Tab ====== */}
          {rechargeTab === 'packages' && (
            <div className="p-8 space-y-6">
              {/* 3 列套餐网格 */}
              <div className="grid grid-cols-3 gap-3">
                {rechargePackages.map((pkg) => {
                  const isSelected = selectedPackage === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      onClick={() => setSelectedPackage(isSelected ? null : pkg.id)}
                      className={`relative group rounded-2xl p-5 text-left transition-all duration-200 border ${
                        isSelected
                          ? 'bg-purple-500/[0.1] border-purple-500/50 ring-1 ring-purple-500/25 shadow-[0_0_40px_-8px_rgba(168,85,247,0.2)]'
                          : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.15]'
                      }`}
                    >
                      {/* 标签 */}
                      {pkg.tag && (
                        <span className="absolute -top-2.5 right-4 px-2.5 py-0.5 text-[10px] font-semibold rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25">
                          {pkg.tag}
                        </span>
                      )}

                      {/* 套餐名 */}
                      <div className="text-xs text-zinc-400 font-medium">{pkg.label}</div>

                      {/* 漫币数 */}
                      <div className="mt-3 mb-4">
                        <span className={`text-3xl font-extrabold tabular-nums tracking-tight ${
                          isSelected ? 'text-white' : 'text-zinc-100 group-hover:text-white'
                        } transition-colors`}>
                          {pkg.coins.toLocaleString()}
                        </span>
                        <span className="text-xs text-zinc-500 ml-1.5">漫币</span>
                      </div>

                      {/* 价格区 */}
                      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
                        <span className={`text-base font-bold ${
                          isSelected ? 'text-purple-400' : 'text-zinc-200'
                        } transition-colors`}>¥{pkg.price}</span>
                        <span className="text-[10px] text-zinc-500">¥{(pkg.price / pkg.coins).toFixed(3)}/币</span>
                      </div>

                      {/* 选中指示 */}
                      {isSelected && (
                        <div className="absolute top-3 left-3">
                          <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                            <Check className="w-3 h-3 text-white" strokeWidth={3} />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 底部操作栏 */}
              {selectedPackage ? (
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                  {(() => {
                    const pkg = rechargePackages.find(p => p.id === selectedPackage);
                    if (!pkg) return null;
                    return (
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-zinc-300">已选择</span>
                          <div className="flex items-baseline gap-2 mt-0.5">
                            <span className="text-lg font-bold text-white">{pkg.label}</span>
                            <span className="text-sm text-zinc-400">{pkg.coins.toLocaleString()} 漫币</span>
                          </div>
                        </div>
                        <div className="text-right mr-2">
                          <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">¥{pkg.price}</span>
                        </div>
                        <button
                          onClick={() => setShowWechatDialog(true)}
                          className="flex-shrink-0 px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-all active:scale-[0.97] flex items-center gap-2 shadow-lg shadow-purple-500/25"
                        >
                          <MessageCircle className="w-4 h-4" />
                          联系客服购买
                        </button>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-zinc-500">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>点击套餐卡片开始选择</span>
                </div>
              )}
            </div>
          )}

          {/* ====== 卡密兑换 Tab ====== */}
          {rechargeTab === 'cardkey' && (
            <div className="p-8">
              <div className="max-w-sm mx-auto flex flex-col items-center py-6">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center mb-5">
                  <KeyRound className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1">卡密兑换</h3>
                <p className="text-sm text-zinc-400 mb-8">输入充值卡密，漫币即时到账</p>

                <div className="w-full space-y-4">
                  <Input
                    value={cardKey}
                    onChange={(e) => setCardKey(e.target.value)}
                    placeholder="请输入充值卡密"
                    className="bg-white/[0.04] border-white/[0.12] h-12 text-center text-base font-mono tracking-widest placeholder:text-zinc-600 placeholder:tracking-normal placeholder:font-sans focus-visible:ring-purple-500 rounded-xl"
                    onKeyDown={(e) => e.key === 'Enter' && handleCardKeyRecharge()}
                  />
                  <Button
                    onClick={handleCardKeyRecharge}
                    disabled={recharging || !cardKey.trim()}
                    className="w-full h-12 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm shadow-lg shadow-purple-500/25 disabled:shadow-none disabled:opacity-40 rounded-xl transition-all active:scale-[0.97]"
                  >
                    {recharging ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "立即兑换"
                    )}
                  </Button>
                </div>

                <p className="text-xs text-zinc-500 mt-6">
                  卡密购买请添加微信：<span className="text-purple-400/80 font-medium">{contactConfig.wechatId || '客服'}</span>
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
