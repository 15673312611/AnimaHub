"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Loader2 } from "lucide-react";

interface UserProfile {
  id: number;
  username: string;
  role?: string;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api.get<UserProfile>("/user/profile");
        // 检查是否是管理员
        if (res.data.role === "ADMIN") {
          setAuthorized(true);
        } else {
          router.push("/dashboard");
        }
      } catch (error) {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}
