"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Film, LogOut, User, Palette, Sparkles, Image as ImageIcon, Loader2, Play, BookOpen } from "lucide-react";
import { useState, useEffect } from "react";
import api from "@/lib/api";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [ideaInput, setIdeaInput] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [quickTaskId, setQuickTaskId] = useState<string | null>(null);
  const [quickStatus, setQuickStatus] = useState<string | null>(null);
  const [quickVideoUrl, setQuickVideoUrl] = useState<string | null>(null);
  const [dialogModel, setDialogModel] = useState<string | null>(null);

  useEffect(() => {
    // Check if logged in
    const token = localStorage.getItem('token');
    if (token) {
      // Optionally decode token or fetch user info
      setUser({ username: "用户" });
    }
    try {
      const raw = localStorage.getItem('sora_settings');
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored.selectedDialogModel) {
          setDialogModel(stored.selectedDialogModel);
        }
      }
    } catch (error) {
      console.warn('Failed to load dialog model from settings', error);
    }
  }, []);

  useEffect(() => {
    if (!quickTaskId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await api.get(`/videos/task/${quickTaskId}`);
        if (cancelled) return;
        const data: any = res.data;
        setQuickStatus(data?.status || null);

        if (data?.status === 'SUCCESS') {
          const url =
            (data.data && (data.data.output || data.data.url)) ||
            data.output ||
            data.url ||
            null;
          if (url) {
            setQuickVideoUrl(url);
          }
          setGeneratingVideo(false);
          setQuickTaskId(null);
        } else if (data?.status === 'FAILED') {
          setGeneratingVideo(false);
          setQuickTaskId(null);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to poll quick video status', error);
        setGeneratingVideo(false);
        setQuickTaskId(null);
      }
    };

    poll();
    const id = window.setInterval(poll, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [quickTaskId]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  const handleGenerateTemplatePrompt = async () => {
    if (!ideaInput.trim() || generatingPrompt) return;
    try {
      setGeneratingPrompt(true);
      const res = await api.post('/ideas/short-prompt', {
        description: ideaInput.trim(),
        model: dialogModel || undefined,
      });
      const prompt = (res.data && res.data.prompt) || "";
      if (prompt) {
        setGeneratedPrompt(prompt);
      }
    } catch (error) {
      console.error('Failed to generate short video prompt', error);
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const handleStartQuickVideo = async () => {
    if (!generatedPrompt.trim() || generatingVideo) return;
    try {
      setGeneratingVideo(true);
      setQuickStatus(null);
      setQuickVideoUrl(null);
      const res = await api.post('/videos/generate', { prompt: generatedPrompt });
      if (res.data?.taskId) {
        setQuickTaskId(res.data.taskId);
      } else {
        setGeneratingVideo(false);
      }
    } catch (error) {
      console.error('Failed to start quick video generation', error);
      setGeneratingVideo(false);
    }
  };

  const handlePromptDialogOpenChange = (open: boolean) => {
    setPromptDialogOpen(open);
    if (!open) {
      setIdeaInput("");
      setGeneratedPrompt("");
      setGeneratingPrompt(false);
      setGeneratingVideo(false);
      setQuickTaskId(null);
      setQuickStatus(null);
      setQuickVideoUrl(null);
    }
  };

  if (pathname === '/' || pathname === '/login' || pathname === '/register') {
    return null;
  }

  return (
    <nav className="border-b border-white/10 bg-black/80 backdrop-blur-md sticky top-0 z-40">
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2 text-xl font-bold">
            <Film className="w-6 h-6 text-purple-500" />
            <span className="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
              AnimaHub
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-300">{user.username}</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleLogout}
                className="text-gray-400 hover:text-white"
              >
                <LogOut className="w-4 h-4 mr-2" />
                退出
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
