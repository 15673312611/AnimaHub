"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [returnUrl, setReturnUrl] = useState<string>("/dashboard");

  useEffect(() => {
    const url = new URL(window.location.href).searchParams.get("returnUrl");
    if (url) {
      setReturnUrl(url);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await api.post("/auth/login", { username, password });
      localStorage.setItem("token", res.data.token);
      router.push(returnUrl);
    } catch (err: any) {
      setError(err.response?.data?.error || "登录失败，请检查账号和密码");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(147,51,234,0.26),transparent_42%),radial-gradient(circle_at_80%_82%,rgba(236,72,153,0.2),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(76,29,149,0.28),transparent_40%),linear-gradient(300deg,rgba(192,38,211,0.12),transparent_50%)]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
        <section className="w-full rounded-2xl border border-purple-300/20 bg-[#0f0d1f]/92 p-7 shadow-[0_20px_80px_rgba(120,40,200,0.25)] sm:p-8">
          <div className="mb-8 text-center">
            <p className="mx-auto mb-3 inline-flex rounded-full border border-purple-300/30 bg-purple-400/10 px-3 py-1 text-xs text-purple-200">
              妙笔动画
            </p>
            <h2 className="text-3xl font-bold text-white">账号登录</h2>
            <p className="mt-2 text-sm text-slate-300">请输入账号和密码登录系统</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-200">
                账号
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="请输入账号"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11 border-purple-400/25 bg-[#15122c] text-slate-100 placeholder:text-slate-400 focus-visible:ring-purple-400"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-200">
                密码
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入密码"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 border-purple-400/25 bg-[#15122c] text-slate-100 placeholder:text-slate-400 focus-visible:ring-purple-400"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-300">{error}</p>
            )}

            <Button
              type="submit"
              className="h-11 w-full bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white hover:from-purple-500 hover:to-fuchsia-400"
              disabled={loading}
            >
              {loading ? "登录中..." : "登录"}
            </Button>
          </form>

          <div className="mt-6 border-t border-white/10 pt-4 text-center text-sm text-slate-300">
            还没有账号？{" "}
            <Link href="/register" className="font-medium text-purple-300 hover:text-purple-200">
              立即注册
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
