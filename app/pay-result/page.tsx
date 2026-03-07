"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";

type PageStatus = "checking" | "success" | "pending" | "failed" | "unknown";

interface QueryInfo {
  orderNo: string;
  tradeNo: string;
  tradeStatus: string;
}

function parseQueryInfo(): QueryInfo {
  const params = new URL(window.location.href).searchParams;
  return {
    orderNo: params.get("out_trade_no") || params.get("orderNo") || "",
    tradeNo: params.get("trade_no") || "",
    tradeStatus: params.get("trade_status") || "",
  };
}

function normalizeOrderStatus(raw: unknown): "PAID" | "PENDING" | "FAILED" | "CLOSED" | "UNKNOWN" {
  const value = String(raw || "").toUpperCase();
  if (value === "PAID") return "PAID";
  if (value === "PENDING") return "PENDING";
  if (value === "FAILED") return "FAILED";
  if (value === "CLOSED") return "CLOSED";
  return "UNKNOWN";
}

export default function PayResultPage() {
  const router = useRouter();
  const [queryInfo, setQueryInfo] = useState<QueryInfo>({ orderNo: "", tradeNo: "", tradeStatus: "" });
  const [status, setStatus] = useState<PageStatus>("checking");
  const [message, setMessage] = useState("正在确认支付结果...");
  const [checking, setChecking] = useState(false);
  const [autoRedirectLeft, setAutoRedirectLeft] = useState<number | null>(null);

  const hasOrderNo = Boolean(queryInfo.orderNo);

  const checkOrderStatus = async (orderNo: string) => {
    setChecking(true);
    try {
      const res = await api.get(`/payments/orders/${orderNo}`);
      const orderStatus = normalizeOrderStatus(res.data?.status);
      if (orderStatus === "PAID") {
        setStatus("success");
        setMessage("支付成功，漫币已到账。");
        localStorage.setItem("payment:last-success", JSON.stringify({ orderNo, ts: Date.now() }));
        return "PAID";
      }
      if (orderStatus === "FAILED" || orderStatus === "CLOSED") {
        setStatus("failed");
        setMessage("支付未完成或订单已关闭。");
        return orderStatus;
      }
      setStatus("pending");
      setMessage("订单处理中，请稍后刷新。");
      return "PENDING";
    } catch (error: any) {
      setStatus("unknown");
      const msg = error?.response?.data?.error || "无法查询订单状态，请返回充值页面查看。";
      setMessage(msg);
      return "UNKNOWN";
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    const info = parseQueryInfo();
    setQueryInfo(info);

    if (!info.orderNo) {
      if (String(info.tradeStatus).toUpperCase() === "TRADE_SUCCESS") {
        setStatus("pending");
        setMessage("支付已返回成功，请稍后在站内确认到账。");
      } else {
        setStatus("unknown");
        setMessage("未获取到订单号，请返回充值页面查看支付状态。");
      }
      return;
    }

    let stopped = false;
    const startedAt = Date.now();

    const run = async () => {
      const result = await checkOrderStatus(info.orderNo);
      if (stopped || result === "PAID" || result === "FAILED" || result === "CLOSED") {
        return;
      }

      const timer = setInterval(async () => {
        if (stopped) {
          clearInterval(timer);
          return;
        }
        if (Date.now() - startedAt > 2 * 60 * 1000) {
          clearInterval(timer);
          if (!stopped) {
            setStatus("pending");
            setMessage("支付结果确认超时，请回到站内充值页刷新余额。");
          }
          return;
        }
        const pollResult = await checkOrderStatus(info.orderNo);
        if (pollResult === "PAID" || pollResult === "FAILED" || pollResult === "CLOSED") {
          clearInterval(timer);
        }
      }, 3000);
    };

    run();

    return () => {
      stopped = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "success") {
      setAutoRedirectLeft(null);
      return;
    }

    setAutoRedirectLeft(3);
    const timer = window.setInterval(() => {
      setAutoRedirectLeft((prev) => {
        if (prev == null) return null;
        if (prev <= 1) {
          window.clearInterval(timer);
          router.push("/dashboard");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [status, router]);

  const statusView = useMemo(() => {
    if (status === "success") {
      return {
        icon: <CheckCircle2 className="h-10 w-10 text-emerald-400" />,
        title: "支付成功",
        badgeClass: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
      };
    }
    if (status === "failed") {
      return {
        icon: <XCircle className="h-10 w-10 text-red-400" />,
        title: "支付失败",
        badgeClass: "border-red-400/30 bg-red-500/10 text-red-300",
      };
    }
    if (status === "pending") {
      return {
        icon: <Clock3 className="h-10 w-10 text-amber-400" />,
        title: "支付处理中",
        badgeClass: "border-amber-400/30 bg-amber-500/10 text-amber-300",
      };
    }
    if (status === "checking") {
      return {
        icon: <Loader2 className="h-10 w-10 animate-spin text-purple-300" />,
        title: "状态确认中",
        badgeClass: "border-purple-400/30 bg-purple-500/10 text-purple-200",
      };
    }
    return {
      icon: <XCircle className="h-10 w-10 text-zinc-400" />,
      title: "状态未知",
      badgeClass: "border-zinc-400/20 bg-zinc-500/10 text-zinc-300",
    };
  }, [status]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-12">
        <div className="w-full rounded-2xl border border-white/10 bg-zinc-950/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-8">
          <div className="mb-5 flex items-center justify-center">{statusView.icon}</div>
          <h1 className="text-center text-2xl font-bold">{statusView.title}</h1>
          <p className="mt-3 text-center text-sm text-zinc-300">{message}</p>

          <div className="mt-6 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-500">订单号</span>
              <span className="break-all font-mono text-zinc-200">{queryInfo.orderNo || "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-500">平台订单号</span>
              <span className="break-all font-mono text-zinc-200">{queryInfo.tradeNo || "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-500">回跳状态</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${statusView.badgeClass}`}>
                {queryInfo.tradeStatus || "-"}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Button
              onClick={() => hasOrderNo && checkOrderStatus(queryInfo.orderNo)}
              disabled={!hasOrderNo || checking}
              className="bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
            >
              {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              刷新状态
            </Button>
            <Button
              variant="outline"
              className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
              onClick={() => router.push("/dashboard")}
            >
              {status === "success" && autoRedirectLeft != null
                ? `立即跳转 (${autoRedirectLeft}s)`
                : "返回工作台"}
            </Button>
            <Button
              variant="outline"
              className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
              onClick={() => window.close()}
            >
              关闭页面
            </Button>
          </div>

          {status === "success" && autoRedirectLeft != null ? (
            <p className="mt-3 text-center text-xs text-zinc-500">
              支付成功后将自动返回工作台，也可点击“立即跳转”。
            </p>
          ) : null}

          <p className="mt-4 text-center text-xs text-zinc-500">
            如需自动回跳此页，请在后台支付配置中将同步地址设为:
            <Link href="/pay-result" className="ml-1 text-purple-300 hover:text-purple-200">
              /pay-result
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}