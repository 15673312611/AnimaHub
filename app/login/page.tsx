"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await api.post("/auth/login", { username, password });
      localStorage.setItem("token", res.data.token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "登录失败，请检查您的邮箱和密码");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white p-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-200px] left-[-200px] w-[500px] h-[500px] bg-purple-900/30 blur-[100px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-200px] right-[-200px] w-[500px] h-[500px] bg-blue-900/20 blur-[100px] rounded-full pointer-events-none"></div>

      <Card className="w-full max-w-md bg-white/5 border-white/10 text-white relative z-10 backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">欢迎回来</CardTitle>
          <CardDescription className="text-gray-400">输入您的邮箱和密码登录 Anime Sora</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-300">账号</Label>
              <Input
                id="username"
                type="text"
                placeholder="请输入账号"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-black/30 border-white/10 focus-visible:ring-purple-500"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-gray-300">密码</Label>
                <Link href="#" className="text-xs text-purple-400 hover:text-purple-300">忘记密码?</Link>
              </div>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-black/30 border-white/10 focus-visible:ring-purple-500"
              />
            </div>
            {error && <p className="text-sm text-red-400 bg-red-900/20 p-2 rounded text-center">{error}</p>}
            <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold" disabled={loading}>
              {loading ? "正在登录..." : "立即登录"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-white/10 pt-6">
          <p className="text-sm text-gray-400">
            还没有账号?{" "}
            <Link href="/register" className="text-purple-400 hover:text-purple-300 font-medium hover:underline">
              免费注册
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
