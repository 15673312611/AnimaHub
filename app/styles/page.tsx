"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Palette, Sparkles } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface StylePreset {
  id: number;
  name: string;
  description: string;
  visualPromptSnippet: string;
  toneTags: string;
  aspectRatio: string;
}

export default function StylesPage() {
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStyles();
  }, []);

  const fetchStyles = async () => {
    try {
      const res = await api.get("/ideas/styles");
      setStyles(res.data);
    } catch (error) {
      console.error("Failed to fetch styles");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-900/20 to-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/dashboard" className="inline-flex items-center text-gray-400 hover:text-white mb-4 text-sm">
              <ArrowLeft className="w-4 h-4 mr-2" /> 返回工作台
            </Link>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
              视觉风格库
            </h1>
            <p className="text-gray-400 mt-2">选择一个风格预设，让AI生成统一视觉风格的动漫视频</p>
          </div>
          <Palette className="w-12 h-12 text-purple-400 opacity-20" />
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {styles.map((style) => (
            <Card key={style.id} className="bg-white/5 border-white/10 hover:border-purple-500/50 transition-all group">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  {style.name}
                </CardTitle>
                <CardDescription className="text-gray-400">{style.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-black/30 p-3 rounded border border-white/5">
                  <p className="text-xs text-gray-500 mb-1 font-semibold">Prompt 片段:</p>
                  <p className="text-xs font-mono text-purple-300">{style.visualPromptSnippet}</p>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">标签: {style.toneTags}</span>
                  <span className="text-gray-600">{style.aspectRatio}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
