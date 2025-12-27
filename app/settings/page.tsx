"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Lock, Loader2 } from "lucide-react";
import api from "@/lib/api";

interface UserProfile {
  id: number;
  username: string;
  email: string;
  credits: number;
  createdAt: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // 修改密码
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await api.get("/user/profile");
      setProfile(response.data);
    } catch (error) {
      console.error("获取用户信息失败", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      alert("请填写所有密码字段");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("两次输入的新密码不一致");
      return;
    }
    if (newPassword.length < 6) {
      alert("新密码长度至少6位");
      return;
    }

    try {
      setChangingPassword(true);
      await api.post("/user/change-password", {
        oldPassword,
        newPassword,
      });
      alert("密码修改成功");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      const message = error.response?.data?.error || "密码修改失败";
      alert(message);
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900/20 to-black text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-300 to-gray-500 bg-clip-text text-transparent">
            ⚙️ 系统设置
          </h1>
          <p className="text-gray-400 mt-2">查看账户信息与修改密码</p>
        </div>

        <div className="space-y-6">
          {/* 账户信息 */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-purple-400" />
                账户信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  <span className="ml-2 text-gray-400">加载中...</span>
                </div>
              ) : profile ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-gray-400">用户名</Label>
                      <div className="bg-black/30 border border-white/10 rounded-md px-3 py-2">
                        {profile.username}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-400">邮箱</Label>
                      <div className="bg-black/30 border border-white/10 rounded-md px-3 py-2">
                        {profile.email || "未设置"}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-400">积分余额</Label>
                      <div className="bg-black/30 border border-white/10 rounded-md px-3 py-2">
                        {profile.credits}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-400">注册时间</Label>
                      <div className="bg-black/30 border border-white/10 rounded-md px-3 py-2">
                        {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "未知"}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  获取用户信息失败，请刷新页面重试
                </div>
              )}
            </CardContent>
          </Card>

          {/* 修改密码 */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-blue-400" />
                修改密码
              </CardTitle>
              <CardDescription className="text-gray-400">
                定期修改密码可以提高账户安全性
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>旧密码</Label>
                <Input 
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="请输入当前密码"
                  className="bg-black/30 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>新密码</Label>
                <Input 
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="请输入新密码（至少6位）"
                  className="bg-black/30 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>确认新密码</Label>
                <Input 
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入新密码"
                  className="bg-black/30 border-white/10"
                />
              </div>
              <Button 
                className="bg-blue-600 hover:bg-blue-700" 
                onClick={handleChangePassword} 
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    修改中...
                  </>
                ) : "修改密码"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
