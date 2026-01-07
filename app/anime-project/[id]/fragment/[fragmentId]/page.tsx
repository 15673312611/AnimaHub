/**
 * ⚠️ 【已弃用 - DEPRECATED】
 * 此页面已被新的 AI Agent 工作流页面替代
 * 新页面路径: /anime-project/[id]/fragment/[fragmentId]/ai-agent
 * 
 * 弃用原因:
 * - 扩展性不足
 * - 交互体验不够专业
 * - 功能布局不够清晰
 * 
 * 请勿修改此文件，所有新功能请在新页面实现
 */

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import FragmentEditor from "../../components/FragmentEditor";
import { useToast } from "@/components/ui/toast-provider";
import { handleApiError } from "@/lib/error-handler";

interface Project {
  id: number;
  title: string;
  description: string;
  assetCharacters: any[];
  assetScenes: any[];
  assetProps: any[];
  assetEffects: any[];
  compositeImages: any[];
  generatedVideos: any[];
}

export default function FragmentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialRefImage, setInitialRefImage] = useState<string | null>(null);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);

  const projectId = params.id;
  const fragmentId = params.fragmentId;

  const fetchProject = async () => {
    try {
      const res = await api.get(`/projects/${projectId}`);
      setProject(res.data);
    } catch (error) {
      handleApiError(error, toast, "加载项目失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  // 检查是否有 useForVideo 参数
  useEffect(() => {
    const useForVideo = searchParams.get('useForVideo');
    if (useForVideo === '1') {
      const stored = sessionStorage.getItem('useForVideo');
      if (stored) {
        try {
          const { imageUrl, prompt } = JSON.parse(stored);
          setInitialRefImage(imageUrl);
          setInitialPrompt(prompt);
          sessionStorage.removeItem('useForVideo');
        } catch (e) {
          console.error('Failed to parse useForVideo data', e);
        }
      }
    }
  }, [searchParams]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-700 border-t-purple-500" />
          <p className="text-zinc-500 animate-pulse">加载资源中...</p>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const activeFragment = project.generatedVideos?.find(v => v.id === Number(fragmentId));

  return (
    <>
      <style jsx global>{`
        /* 全局滚动条美化 */
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        
        /* 针对 Textarea 的特定美化 */
        textarea::-webkit-scrollbar {
          width: 4px;
        }
      `}</style>
      <FragmentEditor
        projectId={project.id}
        fragmentId={Number(fragmentId)}
        projectTitle={project.title}
        characters={project.assetCharacters || []}
        scenes={project.assetScenes || []}
        props={project.assetProps || []}
        generatedVideos={activeFragment?.children || []}
        generatedImages={activeFragment?.generatedImages || []}
        onUpdate={fetchProject}
        onBack={() => router.push(`/anime-project/${project.id}`)}
        initialRefImage={initialRefImage}
        initialPrompt={initialPrompt}
      />
    </>
  );
}
