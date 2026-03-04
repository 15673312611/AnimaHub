"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";

type RegisterSettings = {
  emailRegisterEnabled: boolean;
};

type CaptchaResponse = {
  captchaId: string;
  imageBase64: string;
  expireSeconds: number;
};

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaImage, setCaptchaImage] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [initLoading, setInitLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sendingEmailCode, setSendingEmailCode] = useState(false);
  const [emailCountDown, setEmailCountDown] = useState(0);
  const [settings, setSettings] = useState<RegisterSettings>({ emailRegisterEnabled: false });

  const loadSettings = useCallback(async () => {
    const res = await api.get<RegisterSettings>("/auth/register-settings");
    setSettings({ emailRegisterEnabled: !!res.data?.emailRegisterEnabled });
  }, []);

  const loadCaptcha = useCallback(async () => {
    const res = await api.get<CaptchaResponse>("/auth/captcha");
    setCaptchaId(res.data?.captchaId || "");
    setCaptchaImage(res.data?.imageBase64 || "");
    setCaptchaCode("");
  }, []);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      setInitLoading(true);
      setError("");
      try {
        await Promise.all([loadSettings(), loadCaptcha()]);
      } catch (err: any) {
        if (mounted) {
          setError(err.response?.data?.error || "注册页初始化失败，请刷新后重试");
        }
      } finally {
        if (mounted) {
          setInitLoading(false);
        }
      }
    };

    bootstrap();
    return () => {
      mounted = false;
    };
  }, [loadSettings, loadCaptcha]);

  useEffect(() => {
    if (emailCountDown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setEmailCountDown(emailCountDown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [emailCountDown]);

  const handleSendEmailCode = async () => {
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("请先填写邮箱");
      return;
    }
    if (!captchaId || !captchaCode.trim()) {
      setError("请先填写图形验证码");
      return;
    }

    setSendingEmailCode(true);
    try {
      const res = await api.post("/auth/email-code", {
        email: email.trim(),
        captchaId,
        captchaCode: captchaCode.trim(),
      });
      setMessage(res.data?.message || "邮箱验证码已发送，请注意查收");
      setEmailCountDown(60);
    } catch (err: any) {
      setError(err.response?.data?.error || "发送邮箱验证码失败");
      await loadCaptcha();
    } finally {
      setSendingEmailCode(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (!captchaId || !captchaCode.trim()) {
      setError("请填写图形验证码");
      setLoading(false);
      return;
    }
    if (settings.emailRegisterEnabled && !email.trim()) {
      setError("当前已开启邮箱注册，请填写邮箱");
      setLoading(false);
      return;
    }
    if (settings.emailRegisterEnabled && !emailCode.trim()) {
      setError("请填写邮箱验证码");
      setLoading(false);
      return;
    }

    try {
      const payload: Record<string, string> = {
        username,
        password,
        captchaId,
        captchaCode: captchaCode.trim(),
      };
      if (email.trim()) {
        payload.email = email.trim();
      }
      if (emailCode.trim()) {
        payload.emailCode = emailCode.trim();
      }

      const res = await api.post("/auth/register", payload);
      localStorage.setItem("token", res.data.token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "注册失败，请稍后重试");
      await loadCaptcha();
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
            <h2 className="text-3xl font-bold text-white">账号注册</h2>
            <p className="mt-2 text-sm text-slate-300">填写以下信息完成注册</p>
          </div>

          {initLoading ? (
            <div className="py-8 text-center text-sm text-slate-400">正在加载注册配置...</div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
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
                <p className="text-xs text-slate-400">建议使用 6 位以上且包含字母和数字的密码</p>
              </div>

              {settings.emailRegisterEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-200">
                      邮箱
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="请输入邮箱地址"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 border-purple-400/25 bg-[#15122c] text-slate-100 placeholder:text-slate-400 focus-visible:ring-purple-400"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emailCode" className="text-slate-200">
                      邮箱验证码
                    </Label>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Input
                        id="emailCode"
                        type="text"
                        placeholder="请输入邮箱验证码"
                        value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value)}
                        className="h-11 border-purple-400/25 bg-[#15122c] text-slate-100 placeholder:text-slate-400 focus-visible:ring-purple-400"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSendEmailCode}
                        disabled={sendingEmailCode || emailCountDown > 0}
                        className="h-11 border-purple-300/30 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20"
                      >
                        {sendingEmailCode ? "发送中" : emailCountDown > 0 ? `${emailCountDown}秒后重发` : "发送验证码"}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="captchaCode" className="text-slate-200">
                  图形验证码
                </Label>
                <div className="grid grid-cols-[1fr_118px] gap-2">
                  <Input
                    id="captchaCode"
                    type="text"
                    placeholder="请输入图形验证码"
                    required
                    value={captchaCode}
                    onChange={(e) => setCaptchaCode(e.target.value)}
                    className="h-11 border-purple-400/25 bg-[#15122c] text-slate-100 placeholder:text-slate-400 focus-visible:ring-purple-400"
                  />
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    className="h-11 overflow-hidden rounded-md border border-purple-300/30 bg-purple-500/10 text-xs text-purple-200"
                    title="点击刷新验证码"
                  >
                    {captchaImage ? (
                      <img src={captchaImage} alt="图形验证码" className="h-full w-full object-cover" />
                    ) : (
                      "换一张"
                    )}
                  </button>
                </div>
              </div>

              {message && (
                <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-300">
                  {message}
                </p>
              )}
              {error && (
                <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-300">{error}</p>
              )}

              <Button
                type="submit"
                className="h-11 w-full bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white hover:from-purple-500 hover:to-fuchsia-400"
                disabled={loading || initLoading}
              >
                {loading ? "注册中..." : "注册并进入工作台"}
              </Button>
            </form>
          )}

          <div className="mt-6 border-t border-white/10 pt-4 text-center text-sm text-slate-300">
            已有账号？{" "}
            <Link href="/login" className="font-medium text-purple-300 hover:text-purple-200">
              去登录
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
