"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  User,
  Lock,
  Loader2,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Mail,
  Wallet,
  CalendarDays,
} from "lucide-react";
import api from "@/lib/api";

const SYSTEM_DEFAULT_VALUE = "__SYSTEM_DEFAULT__";

interface UserProfile {
  id: number;
  username: string;
  email: string;
  credits: number;
  createdAt: string;
}

interface InferenceModelOption {
  id: number;
  modelCode: string;
  modelName: string;
  pricePerThousandTokens?: number;
  isDefault?: boolean;
}

interface InferenceModelConfigResponse {
  models: InferenceModelOption[];
  savedModel?: string | null;
  selectedModel: string;
  systemDefaultModel: string;
}

type Notice = {
  type: "success" | "error";
  text: string;
};

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [modelConfig, setModelConfig] = useState<InferenceModelConfigResponse | null>(null);
  const [selectedModelValue, setSelectedModelValue] = useState<string>(SYSTEM_DEFAULT_VALUE);
  const [loadingModels, setLoadingModels] = useState(true);
  const [savingModel, setSavingModel] = useState(false);
  const [modelNotice, setModelNotice] = useState<Notice | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice | null>(null);

  const effectiveModel = useMemo(() => {
    if (!modelConfig) return null;
    return modelConfig.models.find((item) => item.modelCode === modelConfig.selectedModel) ?? null;
  }, [modelConfig]);

  const modelNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    (modelConfig?.models || []).forEach((item) => {
      map.set(item.modelCode, item.modelName);
    });
    return map;
  }, [modelConfig]);

  const systemDefaultModelName = useMemo(() => {
    if (!modelConfig?.systemDefaultModel) return "未配置";
    return modelNameByCode.get(modelConfig.systemDefaultModel) || "未知模型";
  }, [modelConfig, modelNameByCode]);

  const selectedModelName = useMemo(() => {
    if (!modelConfig?.selectedModel) return "未配置";
    return modelNameByCode.get(modelConfig.selectedModel) || "未知模型";
  }, [modelConfig, modelNameByCode]);

  useEffect(() => {
    void Promise.all([fetchProfile(), fetchInferenceModelConfig()]);
  }, []);

  const fetchProfile = async () => {
    try {
      setLoadingProfile(true);
      const response = await api.get("/user/profile");
      setProfile(response.data);
    } catch (error: any) {
      console.error("failed to fetch profile", error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const fetchInferenceModelConfig = async () => {
    try {
      setLoadingModels(true);
      const response = await api.get<InferenceModelConfigResponse>("/user/inference-model-config");
      const data = response.data;
      setModelConfig(data);
      setSelectedModelValue(data.savedModel || SYSTEM_DEFAULT_VALUE);
    } catch (error: any) {
      console.error("failed to fetch inference model config", error);
      const backendMessage = error?.response?.data?.error || error?.message;
      setModelNotice({
        type: "error",
        text: backendMessage ? `获取推理模型配置失败：${backendMessage}` : "获取推理模型配置失败，请刷新后重试。",
      });
    } finally {
      setLoadingModels(false);
    }
  };

  const handleInferenceModelChange = async (value: string) => {
    setSelectedModelValue(value);
    setSavingModel(true);
    setModelNotice(null);

    try {
      await api.put("/user/inference-model-config", {
        modelCode: value === SYSTEM_DEFAULT_VALUE ? "" : value,
      });
      await fetchInferenceModelConfig();
      setModelNotice({
        type: "success",
        text: value === SYSTEM_DEFAULT_VALUE ? "已切换为跟随系统默认模型。" : "推理模型已保存。",
      });
    } catch (error: any) {
      const message = error?.response?.data?.error || "保存推理模型失败，请稍后再试。";
      setModelNotice({ type: "error", text: message });
    } finally {
      setSavingModel(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordNotice(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordNotice({ type: "error", text: "请完整填写旧密码、新密码和确认密码。" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ type: "error", text: "两次输入的新密码不一致。" });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordNotice({ type: "error", text: "新密码长度至少为 6 位。" });
      return;
    }

    try {
      setChangingPassword(true);
      await api.post("/user/change-password", {
        oldPassword,
        newPassword,
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice({ type: "success", text: "密码修改成功。" });
    } catch (error: any) {
      const message = error?.response?.data?.error || "密码修改失败，请稍后再试。";
      setPasswordNotice({ type: "error", text: message });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-20 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-20 right-0 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
            <Sparkles className="h-3.5 w-3.5" />
            账户与推理配置
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">设置中心</h1>
          <p className="text-sm text-zinc-400 sm:text-base">管理账号信息、推理模型偏好与安全设置。</p>
        </div>

        <div className="grid gap-6">
          <Card className="border-zinc-800/80 bg-zinc-900/70 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-zinc-100">
                <User className="h-5 w-5 text-cyan-300" />
                账号信息
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingProfile ? (
                <div className="flex items-center justify-center py-8 text-zinc-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  正在加载账号信息...
                </div>
              ) : profile ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoItem icon={<User className="h-4 w-4 text-cyan-300" />} label="用户名" value={profile.username} />
                  <InfoItem icon={<Mail className="h-4 w-4 text-cyan-300" />} label="邮箱" value={profile.email || "未设置"} />
                  <InfoItem icon={<Wallet className="h-4 w-4 text-cyan-300" />} label="积分余额" value={String(profile.credits)} />
                  <InfoItem
                    icon={<CalendarDays className="h-4 w-4 text-cyan-300" />}
                    label="注册时间"
                    value={profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "未知"}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  获取账号信息失败，请刷新页面重试。
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800/80 bg-zinc-900/70 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-zinc-100">
                <Cpu className="h-5 w-5 text-emerald-300" />
                推理模型配置
              </CardTitle>
              <CardDescription className="text-zinc-400">
                该设置会影响大模型推理调用，保存后立即生效。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingModels ? (
                <div className="flex items-center justify-center py-8 text-zinc-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  正在加载推理模型...
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-zinc-300">推理模型</Label>
                    <Select value={selectedModelValue} onValueChange={handleInferenceModelChange} disabled={savingModel}>
                      <SelectTrigger className="border-zinc-700 bg-zinc-950/70 text-zinc-100">
                        <SelectValue placeholder="请选择推理模型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SYSTEM_DEFAULT_VALUE}>
                          跟随系统默认（{systemDefaultModelName}）
                        </SelectItem>
                        {(modelConfig?.models || []).map((model) => (
                          <SelectItem key={model.id} value={model.modelCode}>
                            {model.modelName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {savingModel && (
                      <div className="flex items-center text-xs text-zinc-400">
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        正在保存配置...
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">当前生效模型</p>
                    <p className="mt-1 text-sm font-medium text-zinc-100">
                      {effectiveModel ? effectiveModel.modelName : selectedModelName}
                    </p>
                    {effectiveModel?.pricePerThousandTokens != null && (
                      <p className="mt-1 text-xs text-zinc-400">
                        价格：{effectiveModel.pricePerThousandTokens} 漫币 / 1K tokens
                      </p>
                    )}
                    <p className="mt-1 text-xs text-zinc-500">
                      扣费规则：每次调用按整数漫币结算，费用会向上取整，不会出现小数漫币。
                    </p>
                    {!!modelConfig?.savedModel && modelConfig.savedModel !== modelConfig.selectedModel && (
                      <p className="mt-2 text-xs text-amber-200">
                        已保存模型不可用，当前已自动回退到可用模型：{selectedModelName}
                      </p>
                    )}
                  </div>

                  {modelNotice && (
                    <NoticeBanner type={modelNotice.type} text={modelNotice.text} />
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800/80 bg-zinc-900/70 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-zinc-100">
                <Lock className="h-5 w-5 text-sky-300" />
                修改密码
              </CardTitle>
              <CardDescription className="text-zinc-400">建议定期更新密码，保障账户安全。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-zinc-300">旧密码</Label>
                  <Input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="请输入当前密码"
                    className="border-zinc-700 bg-zinc-950/70 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">新密码</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="至少 6 位"
                    className="border-zinc-700 bg-zinc-950/70 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">确认新密码</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入新密码"
                    className="border-zinc-700 bg-zinc-950/70 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  className="bg-sky-600 text-white hover:bg-sky-500"
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      正在修改...
                    </>
                  ) : (
                    "保存新密码"
                  )}
                </Button>
                {passwordNotice && <NoticeBanner type={passwordNotice.type} text={passwordNotice.text} />}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500">
        {icon}
        {label}
      </p>
      <p className="text-sm font-medium text-zinc-100">{value}</p>
    </div>
  );
}

function NoticeBanner({ type, text }: Notice) {
  const isSuccess = type === "success";
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
        isSuccess
          ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
          : "border border-rose-400/30 bg-rose-400/10 text-rose-100"
      }`}
    >
      {isSuccess ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      <span>{text}</span>
    </div>
  );
}
