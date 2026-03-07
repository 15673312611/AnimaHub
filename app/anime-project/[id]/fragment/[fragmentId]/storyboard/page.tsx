import { redirect } from "next/navigation";

// 兼容旧路由：/anime-project/[id]/fragment/[fragmentId]/storyboard
// 统一重定向到新路由：/anime-project/[id]/storyboard/[fragmentId]
export default function StoryboardRedirectPage({
  params,
}: {
  params: { id: string; fragmentId: string };
}) {
  redirect(`/anime-project/${params.id}/storyboard/${params.fragmentId}`);
}
