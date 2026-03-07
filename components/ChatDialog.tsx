"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Image, X, Loader2, Bot, User } from "lucide-react";
import api from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  image?: string;
}

interface ChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChatDialog({ open, onOpenChange }: ChatDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      alert("图片大小不能超过5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if (!input.trim() && !image) return;
    
    const userMessage: Message = {
      role: "user",
      content: input.trim() || "请分析这张图片",
      image: image || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setImage(null);
    setLoading(true);

    try {
      const apiMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      apiMessages.push({ role: "user", content: userMessage.content });

      const response = await api.post("/chat", {
        messages: apiMessages,
        image: userMessage.image,
      });

      const assistantMessage: Message = {
        role: "assistant",
        content: response.data.reply,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || "对话失败，请重试";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ ${errorMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setImage(null);
    setInput("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col p-0 gap-0 bg-gray-900 border-white/10">
        <DialogHeader className="px-4 py-3 border-b border-white/10">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Bot className="w-5 h-5 text-purple-400" />
            AI 助手
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearChat}
                className="ml-auto text-xs text-gray-400 hover:text-white"
              >
                清空对话
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* 消息列表 */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <Bot className="w-12 h-12 mb-3 text-purple-400/50" />
              <p className="text-sm">你好！我是动漫创作助手</p>
              <p className="text-xs mt-1">可以上传图片进行分析</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-purple-400" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      msg.role === "user"
                        ? "bg-purple-600 text-white"
                        : "bg-white/10 text-gray-200"
                    }`}
                  >
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="上传的图片"
                        className="max-w-full max-h-48 rounded mb-2"
                      />
                    )}
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-blue-400" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="bg-white/10 rounded-lg px-3 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* 输入区 */}
        <div className="border-t border-white/10 p-4 space-y-3">
          {image && (
            <div className="relative">
              <img
                src={image}
                alt="待发送图片"
                className="max-h-40 w-full rounded-lg object-contain bg-black/30"
              />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="text-gray-400 hover:text-white"
              title="上传图片"
            >
              <Image className="w-4 h-4" />
            </Button>

            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              className="min-h-[44px] max-h-32 bg-white/5 border-white/10 text-gray-200 resize-none"
              disabled={loading}
            />

            <Button
              type="button"
              onClick={handleSend}
              disabled={loading || (!input.trim() && !image)}
              className="bg-purple-600 hover:bg-purple-700"
              title="发送"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
