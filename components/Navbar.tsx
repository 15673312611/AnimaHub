"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Coins,
  Copy,
  CreditCard,
  KeyRound,
  Loader2,
  LogOut,
  MessageCircle,
  PenTool,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import api from "@/lib/api";
import NotificationBell from "./NotificationBell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface PaymentMethod {
  code: string;
  label: string;
  enabled: boolean;
}

interface PaymentConfig {
  enabled: boolean;
  provider: string;
  defaultMethod: string;
  methods: PaymentMethod[];
}

interface ContactConfig {
  wechatQrcodeUrl: string;
  wechatId: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  alipay: "支付宝",
  wxpay: "微信支付",
  qqpay: "QQ钱包",
};

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

  const [rechargeTab, setRechargeTab] = useState<"packages" | "cardkey">("packages");
  const [rechargePackages, setRechargePackages] = useState<RechargePackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);

  const [contactConfig, setContactConfig] = useState<ContactConfig>({
    wechatQrcodeUrl: "",
    wechatId: "",
  });

  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({
    enabled: false,
    provider: "yizf",
    defaultMethod: "alipay",
    methods: [],
  });
  const [selectedPaymentType, setSelectedPaymentType] = useState("alipay");
  const [paying, setPaying] = useState(false);
  const [pollingOrderNo, setPollingOrderNo] = useState<string | null>(null);

  const fetchUserProfile = useCallback(async () => {
    try {
      const response = await api.get("/user/profile");
      setUser(response.data);
    } catch (error) {
      console.error("Failed to fetch user profile", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchContactConfig = useCallback(async () => {
    try {
      const response = await api.get("/config/contact");
      setContactConfig({
        wechatQrcodeUrl: response.data?.wechatQrcodeUrl || "",
        wechatId: response.data?.wechatId || "",
      });
    } catch (error) {
      console.error("Failed to fetch contact config", error);
    }
  }, []);

  const fetchRechargePackages = useCallback(async () => {
    try {
      const response = await api.get("/config/recharge-packages");
      setRechargePackages(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to fetch recharge packages", error);
      setRechargePackages([]);
    }
  }, []);

  const fetchPaymentConfig = useCallback(async () => {
    try {
      const response = await api.get("/config/payment");
      const data = response.data || {};
      const rawMethods = Array.isArray(data.methods) ? data.methods : [];
      const methods: PaymentMethod[] = rawMethods
        .filter((m: any) => m && m.enabled)
        .map((m: any) => ({
          code: String(m.code || ""),
          label: String(m.label || PAYMENT_LABELS[String(m.code || "")] || String(m.code || "")),
          enabled: Boolean(m.enabled),
        }))
        .filter((m: PaymentMethod) => Boolean(m.code));

      const fallbackMethod = methods[0]?.code || "alipay";
      const requestedDefault = String(data.defaultMethod || "");
      const defaultMethod = methods.some((m) => m.code === requestedDefault) ? requestedDefault : fallbackMethod;

      setPaymentConfig({
        enabled: Boolean(data.enabled),
        provider: String(data.provider || "yizf"),
        defaultMethod,
        methods,
      });
      setSelectedPaymentType(defaultMethod);
    } catch (error) {
      console.error("Failed to fetch payment config", error);
      setPaymentConfig({
        enabled: false,
        provider: "yizf",
        defaultMethod: "alipay",
        methods: [],
      });
      setSelectedPaymentType("alipay");
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    fetchUserProfile();
    fetchRechargePackages();
    fetchContactConfig();
    fetchPaymentConfig();
  }, [fetchUserProfile, fetchRechargePackages, fetchContactConfig, fetchPaymentConfig]);

  const handleRefreshBalance = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const response = await api.get("/user/profile");
      setUser(response.data);
    } catch (error) {
      console.error("Failed to refresh balance", error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    router.push("/login");
  };

  const handleCardKeyRecharge = async () => {
    if (!cardKey.trim()) {
      alert("请输入卡密");
      return;
    }

    setRecharging(true);
    try {
      const response = await api.post("/user/recharge", { cardKey: cardKey.trim() });
      alert(`充值成功，获得 ${response.data?.coins || 0} 漫币`);
      setCardKey("");
      await handleRefreshBalance();
    } catch (error: any) {
      const message = error?.response?.data?.error || "卡密无效或已被使用";
      alert(message);
    } finally {
      setRecharging(false);
    }
  };

  const handleOnlineRecharge = async () => {
    if (!selectedPackage) {
      alert("请先选择套餐");
      return;
    }
    if (!paymentConfig.enabled) {
      alert("在线支付已关闭");
      return;
    }
    if (!selectedPaymentType) {
      alert("请先选择支付方式");
      return;
    }

    setPaying(true);
    try {
      const response = await api.post("/payments/orders", {
        packageId: selectedPackage,
        paymentType: selectedPaymentType,
      });

      const data = response.data || {};
      const orderNo = data.orderNo;
      const payTarget = data.payUrl || data.qrcode || data.urlscheme;

      if (!orderNo) {
        throw new Error("orderNo missing");
      }

      setPollingOrderNo(orderNo);

      if (typeof payTarget === "string" && payTarget.length > 0) {
        if (payTarget.startsWith("http://") || payTarget.startsWith("https://")) {
          window.open(payTarget, "_blank", "noopener,noreferrer");
        } else {
          window.location.href = payTarget;
        }
      } else {
        alert("订单已创建，请在支付平台完成支付。");
      }
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "创建支付订单失败";
      alert(message);
    } finally {
      setPaying(false);
    }
  };

  useEffect(() => {
    if (!pollingOrderNo) return;

    let stopped = false;
    const startedAt = Date.now();

    const timer = setInterval(async () => {
      if (stopped) return;
      try {
        const response = await api.get(`/payments/orders/${pollingOrderNo}`);
        const status = response.data?.status;
        if (status === "PAID") {
          stopped = true;
          clearInterval(timer);
          setPollingOrderNo(null);
          alert("支付成功，漫币已到账。");
          await handleRefreshBalance();
          setShowRechargeDialog(false);
          setSelectedPackage(null);
          return;
        }

        if (Date.now() - startedAt > 3 * 60 * 1000) {
          stopped = true;
          clearInterval(timer);
          setPollingOrderNo(null);
        }
      } catch {
        // ignore transient polling errors
      }
    }, 3000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pollingOrderNo, handleRefreshBalance]);

  const handleCopyWechat = async () => {
    if (!contactConfig.wechatId) return;
    try {
      await navigator.clipboard.writeText(contactConfig.wechatId);
      setCopiedWechat(true);
      setTimeout(() => setCopiedWechat(false), 1500);
    } catch (error) {
      console.error("Failed to copy WeChat id", error);
    }
  };

  const selectedPackageInfo = useMemo(
    () => rechargePackages.find((pkg) => pkg.id === selectedPackage) || null,
    [rechargePackages, selectedPackage]
  );

  const hideNavbar =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/pay-result";
  if (hideNavbar) return null;

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-[#242634] bg-[linear-gradient(180deg,rgba(4,6,12,0.96),rgba(5,8,14,0.78))] backdrop-blur-xl">
        <div className="flex items-center justify-between px-5 py-2.5 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2.5 text-base font-semibold">
            <div className="flex h-6 w-6 items-center justify-center rounded-md border border-purple-400/35 bg-purple-500/12">
              <PenTool className="h-3.5 w-3.5 text-purple-300" />
            </div>
            <span className="bg-gradient-to-r from-[#df7dff] to-[#ff53cb] bg-clip-text text-transparent">妙笔动画</span>
          </Link>

          <div className="flex items-center gap-3">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : user ? (
              <>
                <div className="hidden items-center gap-2 rounded-full border border-[#35364b] bg-[#0f1320]/95 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:flex">
                  <Coins className="h-4 w-4 text-purple-300" />
                  <span className="text-sm font-medium text-zinc-200">{user.credits}</span>
                  <span className="text-xs text-zinc-500">漫币</span>
                  <button
                    onClick={handleRefreshBalance}
                    disabled={refreshing}
                    className="ml-1 rounded-full p-0.5 transition-colors hover:bg-white/10 disabled:opacity-50"
                    title="刷新余额"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-zinc-400 ${refreshing ? "animate-spin" : ""}`} />
                  </button>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowRechargeDialog(true);
                    setRechargeTab("packages");
                    setSelectedPackage(null);
                    setPollingOrderNo(null);
                    const method = paymentConfig.defaultMethod || paymentConfig.methods[0]?.code || "alipay";
                    setSelectedPaymentType(method);
                  }}
                  className="hidden h-auto items-center gap-1.5 rounded-full border border-purple-500/35 bg-purple-500/5 px-3 py-1.5 text-purple-300 hover:bg-purple-500/12 hover:text-purple-200 sm:flex"
                >
                  <CreditCard className="h-4 w-4" />
                  <span className="text-sm">充值</span>
                </Button>

                <NotificationBell />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#cf4bff] to-[#ff4eb2] text-sm font-bold text-white shadow-lg shadow-purple-500/25 transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-black">
                      {user.username?.charAt(0).toUpperCase()}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="text-gray-400">{user.username}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setShowWechatDialog(true)}>
                      <MessageCircle className="h-4 w-4 text-green-400" />
                      联系客服
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => router.push("/settings")}>
                      <UserPlus className="h-4 w-4 text-blue-400" />
                      账号设置
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 text-red-400 focus:text-red-400"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" />
                      退出登录
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>
        </div>
      </nav>

      <Dialog open={showWechatDialog} onOpenChange={setShowWechatDialog}>
        <DialogContent className="max-w-sm border-zinc-700 bg-zinc-900 text-white">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">联系客服</DialogTitle>
            <DialogDescription className="text-center text-gray-400">
              扫描二维码或复制微信号联系客服
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {contactConfig.wechatQrcodeUrl ? (
              <div className="h-48 w-48 overflow-hidden rounded-lg border border-white/10">
                <img
                  src={contactConfig.wechatQrcodeUrl}
                  alt="客服微信二维码"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
            {contactConfig.wechatId ? (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2">
                <span className="text-sm text-gray-400">微信号:</span>
                <span className="font-medium text-white">{contactConfig.wechatId}</span>
                <button
                  onClick={handleCopyWechat}
                  className="ml-1 rounded p-1 transition-colors hover:bg-white/10"
                  title="复制微信号"
                >
                  {copiedWechat ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showRechargeDialog}
        onOpenChange={(open) => {
          setShowRechargeDialog(open);
          if (!open) {
            setSelectedPackage(null);
            setRechargeTab("packages");
            setPollingOrderNo(null);
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-2xl gap-0 overflow-hidden rounded-2xl border-white/10 bg-[#0e0e12] p-0 text-white">
          <DialogHeader className="sr-only">
            <DialogTitle>漫币充值</DialogTitle>
            <DialogDescription>选择充值套餐或使用卡密兑换</DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-4 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-purple-300/80">我的余额</p>
                <p className="mt-2 text-3xl font-bold text-white">{user?.credits?.toLocaleString() || 0} 漫币</p>
              </div>
              <button
                onClick={handleRefreshBalance}
                disabled={refreshing}
                className="rounded-lg border border-white/10 bg-white/5 p-2 transition-colors hover:bg-white/10 disabled:opacity-50"
                title="刷新余额"
              >
                <RefreshCw className={`h-4 w-4 text-zinc-400 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="flex gap-6 border-b border-white/10 px-6">
            <button
              onClick={() => setRechargeTab("packages")}
              className={`relative pb-3 text-sm font-medium ${
                rechargeTab === "packages" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              套餐充值
              {rechargeTab === "packages" ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
              ) : null}
            </button>
            <button
              onClick={() => setRechargeTab("cardkey")}
              className={`relative pb-3 text-sm font-medium ${
                rechargeTab === "cardkey" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              卡密兑换
              {rechargeTab === "cardkey" ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
              ) : null}
            </button>
          </div>

          {rechargeTab === "packages" ? (
            <div className="space-y-5 p-6">
              {rechargePackages.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rechargePackages.map((pkg) => {
                    const isSelected = selectedPackage === pkg.id;
                    return (
                      <button
                        key={pkg.id}
                        onClick={() => setSelectedPackage(isSelected ? null : pkg.id)}
                        className={`relative rounded-xl border p-4 text-left transition-all ${
                          isSelected
                            ? "border-purple-500/50 bg-purple-500/10 ring-1 ring-purple-500/20"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        {pkg.tag ? (
                          <span className="absolute -top-2 right-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {pkg.tag}
                          </span>
                        ) : null}
                        <p className="text-xs text-zinc-400">{pkg.label}</p>
                        <p className="mt-2 text-2xl font-bold text-white">{pkg.coins.toLocaleString()} 漫币</p>
                        <p className="mt-2 text-sm text-purple-300">¥{pkg.price}</p>
                        {isSelected ? (
                          <span className="absolute left-3 top-3 rounded-full bg-purple-500 p-1">
                            <Check className="h-3 w-3 text-white" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-zinc-400">
                  暂无可用充值套餐
                </div>
              )}

              {selectedPackageInfo ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-zinc-400">已选择</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {selectedPackageInfo.label} ({selectedPackageInfo.coins.toLocaleString()} 漫币)
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-purple-300">¥{selectedPackageInfo.price}</p>
                  </div>

                  {paymentConfig.enabled && paymentConfig.methods.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {paymentConfig.methods.map((method) => (
                          <button
                            key={method.code}
                            onClick={() => setSelectedPaymentType(method.code)}
                            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                              selectedPaymentType === method.code
                                ? "border-purple-500/50 bg-purple-500/20 text-purple-200"
                                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                            }`}
                          >
                            {method.label || PAYMENT_LABELS[method.code] || method.code}
                          </button>
                        ))}
                      </div>
                      <Button
                        onClick={handleOnlineRecharge}
                        disabled={paying || Boolean(pollingOrderNo)}
                        className="w-full bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
                      >
                        {paying || pollingOrderNo ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {pollingOrderNo ? "等待支付回调..." : "创建订单中..."}
                          </>
                        ) : (
                          <>
                            <CreditCard className="mr-2 h-4 w-4" />
                            立即支付
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setShowWechatDialog(true)}
                      className="mt-4 w-full bg-purple-600 text-white hover:bg-purple-500"
                    >
                      <MessageCircle className="mr-2 h-4 w-4" />
                      联系客服购买
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-center text-sm text-zinc-500">请选择一个套餐开始充值</p>
              )}
            </div>
          ) : (
            <div className="p-6">
              <div className="mx-auto flex max-w-sm flex-col items-center">
                <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
                  <KeyRound className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">卡密兑换</h3>
                <p className="mb-6 mt-1 text-sm text-zinc-400">输入充值卡密，漫币将自动到账。</p>
                <div className="w-full space-y-3">
                  <Input
                    value={cardKey}
                    onChange={(e) => setCardKey(e.target.value)}
                    placeholder="请输入充值卡密"
                    className="h-11 border-white/10 bg-white/5 text-center font-mono text-base tracking-wider placeholder:font-sans placeholder:tracking-normal"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCardKeyRecharge();
                      }
                    }}
                  />
                  <Button
                    onClick={handleCardKeyRecharge}
                    disabled={recharging || !cardKey.trim()}
                    className="h-11 w-full bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
                  >
                    {recharging ? <Loader2 className="h-4 w-4 animate-spin" /> : "立即兑换"}
                  </Button>
                </div>
                <p className="mt-5 text-xs text-zinc-500">
                  如需购买卡密，请联系客服微信:{" "}
                  <span className="font-medium text-purple-300">{contactConfig.wechatId || "未配置"}</span>
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
