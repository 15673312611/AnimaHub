"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, User, Database, Bell } from "lucide-react";

const defaultDialogModels = ["gpt-4.1", "gpt-4o-mini", "deepseek-chat", "qwen-max"];
const SETTINGS_KEY = "sora_settings";

export default function SettingsPage() {
  const [username, setUsername] = useState("创作者");
  const [email, setEmail] = useState("");
  const [availableDialogModels, setAvailableDialogModels] = useState(defaultDialogModels);
  const [selectedDialogModel, setSelectedDialogModel] = useState(defaultDialogModels[0]);
  const [customDialogModel, setCustomDialogModel] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingModels, setSavingModels] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (stored.username) setUsername(stored.username);
      if (stored.email) setEmail(stored.email);
      if (stored.availableDialogModels?.length) {
        setAvailableDialogModels(stored.availableDialogModels);
      }
      if (stored.selectedDialogModel) {
        setSelectedDialogModel(stored.selectedDialogModel);
      }
    } catch (error) {
      console.warn("Failed to load settings", error);
    }
  }, []);

  const currentSettings = () => ({
    username,
    email,
    availableDialogModels,
    selectedDialogModel,
  });

  const persistSettings = async () => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(currentSettings()));
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    await persistSettings();
    setSavingProfile(false);
    alert("账户信息已保存");
  };

  const handleSaveModels = async () => {
    setSavingModels(true);
    await persistSettings();
    setSavingModels(false);
    alert("对话模型配置已保存");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900/20 to-black text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-300 to-gray-500 bg-clip-text text-transparent">
            ⚙️ 系统设置
          </h1>
          <p className="text-gray-400 mt-2">配置账户信息与对话模型</p>
        </div>

        <div className="space-y-6">
          {/* 账户设置 */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-purple-400" />
                账户信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>用户名</Label>
                <Input 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-black/30 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>邮箱</Label>
                <Input 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="bg-black/30 border-white/10"
                />
              </div>
              <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleSaveProfile} disabled={savingProfile}>
                {savingProfile ? "保存中..." : "保存更改"}
              </Button>
            </CardContent>
          </Card>

          {/* 对话模型管理 */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-400" />
                对话模型配置
              </CardTitle>
              <CardDescription className="text-gray-400">
                选择用于 AI 对话、分镜生成、提示词优化的默认模型，可自定义第三方模型名称
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label>预设模型</Label>
                <div className="grid grid-cols-2 gap-3">
                  {availableDialogModels.map((model) => (
                    <button
                      key={model}
                      type="button"
                      onClick={() => setSelectedDialogModel(model)}
                      className={`border rounded-lg px-3 py-2 text-sm text-left transition-all ${
                        selectedDialogModel === model
                          ? "border-purple-400 bg-purple-500/10 text-white"
                          : "border-white/10 text-gray-300 hover:border-white/30"
                      }`}
                    >
                      <span className="font-semibold">{model}</span>
                      {selectedDialogModel === model && (
                        <p className="text-xs text-purple-300 mt-1">当前默认</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>添加自定义模型</Label>
                <div className="flex gap-2">
                  <Input
                    value={customDialogModel}
                    onChange={(e) => setCustomDialogModel(e.target.value)}
                    placeholder="例如：my-proxy-model"
                    className="bg-black/30 border-white/10"
                  />
                  <Button
                    type="button"
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={!customDialogModel.trim()}
                    onClick={() => {
                      if (!customDialogModel.trim()) return;
                      const newModel = customDialogModel.trim();
                      setAvailableDialogModels((prev) => {
                        if (prev.includes(newModel)) {
                          return prev;
                        }
                        return [...prev, newModel];
                      });
                      setSelectedDialogModel(newModel);
                      setCustomDialogModel("");
                    }}
                  >
                    添加
                  </Button>
                </div>
                <p className="text-xs text-gray-500">可用于接入自定义代理/第三方模型。</p>
              </div>

              <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleSaveModels} disabled={savingModels}>
                {savingModels ? "保存中..." : "保存对话模型配置"}
              </Button>
            </CardContent>
          </Card>

          {/* 通知设置 */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-yellow-400" />
                通知设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4" defaultChecked />
                <span>视频生成完成时通知我</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4" />
                <span>项目协作邀请通知</span>
              </label>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
