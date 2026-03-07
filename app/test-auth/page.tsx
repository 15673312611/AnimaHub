"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import api, { getApiBaseUrl } from "@/lib/api";

export default function TestAuthPage() {
  const [token, setToken] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const apiBaseUrl = getApiBaseUrl();
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    setToken(storedToken);
  }, []);

  const testLogin = async () => {
    setLoading(true);
    setTestResult("");
    try {
      const res = await api.post("/auth/login", {
        username: "testuser",
        password: "123456"
      });
      
      console.log("Login response:", res.data);
      
      if (res.data.token) {
        localStorage.setItem("token", res.data.token);
        setToken(res.data.token);
        setTestResult("✅ 登录成功！Token 已保存");
      } else {
        setTestResult("❌ 登录响应中没有 token");
      }
    } catch (error: any) {
      console.error("Login error:", error);
      setTestResult(`❌ 登录失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testGetProjects = async () => {
    setLoading(true);
    setTestResult("");
    try {
      const res = await api.get("/projects");
      console.log("Projects response:", res.data);
      setTestResult(`✅ 获取项目成功！共 ${res.data.length} 个项目`);
    } catch (error: any) {
      console.error("Get projects error:", error);
      setTestResult(`❌ 获取项目失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const clearToken = () => {
    localStorage.removeItem("token");
    setToken(null);
    setTestResult("🗑️ Token 已清除");
  };

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="bg-zinc-900 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">认证测试工具</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-400">当前 Token:</h3>
              <div className="p-3 bg-black rounded border border-white/10 text-xs text-white break-all">
                {token || "无"}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={testLogin}
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {loading ? "测试中..." : "测试登录"}
              </Button>
              
              <Button
                onClick={testGetProjects}
                disabled={loading || !token}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? "测试中..." : "测试获取项目"}
              </Button>
              
              <Button
                onClick={clearToken}
                disabled={!token}
                variant="outline"
                className="border-red-500/40 text-red-400 hover:bg-red-500/10"
              >
                清除 Token
              </Button>
            </div>

            {testResult && (
              <div className={`p-3 rounded border ${
                testResult.startsWith("✅") 
                  ? "bg-green-500/10 border-green-500/20 text-green-400"
                  : testResult.startsWith("❌")
                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                  : "bg-blue-500/10 border-blue-500/20 text-blue-400"
              }`}>
                {testResult}
              </div>
            )}

            <div className="pt-4 border-t border-white/10">
              <h3 className="text-sm font-medium text-zinc-400 mb-2">调试信息:</h3>
              <div className="space-y-1 text-xs text-zinc-500">
                <p>• API Base URL: {apiBaseUrl}</p>
                <p>• 前端地址: {currentOrigin}</p>
                <p>• Token 存储位置: localStorage</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
