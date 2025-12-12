import Link from "next/link";
import { ArrowRight, Sparkles, Film, Zap, PlayCircle } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center relative overflow-hidden bg-black text-white">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none"></div>

      {/* Navbar */}
      <div className="fixed top-0 w-full z-50 flex justify-between items-center px-8 py-6 backdrop-blur-sm border-b border-white/10">
         <div className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
            Anime Sora
         </div>
         <div className="flex gap-4">
            <Link href="/login" className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">
              登录
            </Link>
            <Link href="/register" className="px-4 py-2 text-sm bg-white text-black rounded-full font-medium hover:bg-gray-200 transition-colors">
              免费注册
            </Link>
         </div>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 py-32 text-center px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium mb-4 animate-fade-in">
          <Sparkles className="w-3 h-3" /> Sora 2 引擎驱动
        </div>
        
        <h1 className="text-6xl md:text-8xl font-bold tracking-tight bg-gradient-to-b from-white via-white to-gray-500 bg-clip-text text-transparent pb-2">
          让想象 <br />
          <span className="text-white">一键成片</span>
        </h1>
        
        <p className="mt-6 text-xl text-gray-400 max-w-2xl mx-auto">
          无需专业技能，输入一句话灵感，AI 自动编剧、分镜、生成高质量动漫与商业视频。
          <br className="hidden md:block" />
          重新定义内容创作工作流。
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-full bg-purple-600 px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-purple-700 hover:scale-105 transition-all duration-300 flex items-center gap-2"
          >
            <PlayCircle className="w-5 h-5" /> 开始创作
          </Link>
          <Link href="#" className="px-8 py-4 text-lg font-semibold text-gray-300 hover:text-white flex items-center gap-2 group">
            观看演示 <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-6 max-w-7xl w-full mb-20">
        {[
          {
            title: "AI 智能编剧",
            desc: "输入简单灵感，自动生成包含分镜、提示词的完整专业剧本。",
            icon: Sparkles,
            color: "text-yellow-400"
          },
          {
            title: "角色一致性",
            desc: "通过 Reference ID 技术，确保主角在不同镜头中保持面部特征一致。",
            icon: Zap,
            color: "text-blue-400"
          },
          {
            title: "Sora 2 渲染",
            desc: "调用最先进的视频生成模型，输出电影级画质，光影真实。",
            icon: Film,
            color: "text-pink-400"
          },
        ].map((feature, i) => (
          <div key={i} className="group relative rounded-2xl border border-white/10 bg-white/5 p-8 hover:bg-white/10 transition-all hover:-translate-y-1">
            <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ${feature.color}`}>
              <feature.icon className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
            <p className="text-gray-400 leading-relaxed">
              {feature.desc}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
