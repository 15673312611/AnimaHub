import { redirect } from "next/navigation";

// 兼容旧路由：/anime-project/[id]/fragment/[fragmentId]/storyboard
// 统一重定向到新路由：/anime-project/[id]/storyboard/[fragmentId]
export default async function StoryboardRedirectPage({
  params,
}: {
  params: Promise<{ id: string; fragmentId: string }>;
}) {
  const resolved = await params;
  redirect(`/anime-project/${resolved.id}/storyboard/${resolved.fragmentId}`);
}
