"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Clapperboard, ChevronDown, ArrowUpRight, Film, Layers, Users, BookOpen, ImageIcon, Sparkles } from "lucide-react";

const ease = [0.22, 1, 0.36, 1] as const;

// ─── 背景 ─────────────────────────────────────────────────────────
// 替换背景图：将下方 <div className="bg-placeholder" /> 替换为
// <img src="/bg.jpg" className="absolute inset-0 h-full w-full object-cover" />
function SceneBg() {
  return (
    <div className="absolute inset-0">
      {/* 背景占位 */}
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 120% 80% at 65% 30%, #1e0a3c 0%, #0d0618 45%, #07040f 100%)"
      }} />

      {/* 紫色主光 */}
      <motion.div
        className="absolute left-[50%] top-[-5%] h-[110vh] w-[110vh] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(120,60,220,0.22) 0%, rgba(80,20,160,0.1) 40%, transparent 70%)" }}
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* 粉色副光 */}
      <motion.div
        className="absolute right-[-5%] top-[20%] h-[60vh] w-[60vh] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(200,60,180,0.12) 0%, transparent 65%)" }}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 4 }}
      />
      {/* 蓝色底光 */}
      <motion.div
        className="absolute bottom-[-10%] left-[20%] h-[50vh] w-[80vh] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(40,80,200,0.1) 0%, transparent 65%)" }}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 8 }}
      />

      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#07040f] via-[#07040f]/10 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#07040f]/60 to-transparent" />
    </div>
  );
}

// ─── 星空 ──────────────────────────────────────────────────────────
function Starfield() {
  const stars = Array.from({ length: 80 }, (_, i) => ({
    x: (i * 137.5) % 100,
    y: (i * 97.3) % 100,
    s: i % 5 === 0 ? 2 : i % 3 === 0 ? 1.5 : 1,
    d: (i * 0.37) % 7,
  }));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((s, i) => (
        <motion.div key={i}
          className="absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s }}
          animate={{ opacity: [0.08, 0.45, 0.08] }}
          transition={{ duration: 4 + s.d, repeat: Infinity, ease: "easeInOut", delay: s.d }}
        />
      ))}
    </div>
  );
}

// ─── 数据 ──────────────────────────────────────────────────────────
const stats = [
  { value: "6+", label: "AI 模型" },
  { value: "全流程", label: "创作链路" },
  { value: "实时", label: "渲染队列" },
];

const features = [
  { icon: Users,     title: "角色一致性", desc: "Sora 角色注册，跨镜头保持人物外貌统一，彻底解决角色漂移。", color: "#a78bfa" },
  { icon: BookOpen,  title: "AI 脚本工坊", desc: "从零创作或导入小说，AI 自动拆解为分集剧本，支持多集管理。", color: "#f472b6" },
  { icon: Layers,    title: "可视化分镜", desc: "拖拽式分镜编辑，每个镜头独立配置角色、场景与运镜方式。", color: "#38bdf8" },
  { icon: Film,      title: "AI 视频生成", desc: "图像与视频模型协同，从静帧到动态一步到位，支持批量渲染。", color: "#34d399" },
];

export default function Home() {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const bgY    = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const fadeOut = useTransform(scrollYProgress, [0, 0.65], [1, 0]);
  const slideUp = useTransform(scrollYProgress, [0, 0.65], ["0%", "-6%"]);

  return (
    <div className="bg-[#07040f] text-white">

      {/* ══ 导航 ══════════════════════════════════════════════════ */}
      <header className="fixed inset-x-0 top-0 z-50 mix-blend-normal">
        {/* 顶部彩虹细线 */}
        <div className="h-[1px] w-full" style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.6) 30%, rgba(236,72,153,0.6) 60%, transparent 100%)"
        }} />

        <div className="flex h-[60px] items-center bg-[#07040f]/30 backdrop-blur-2xl">
          <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-6 sm:px-10">

            {/* Logo */}
            <Link href="/" className="group flex items-center gap-3">
              <div className="relative h-8 w-8 overflow-hidden rounded-lg"
                style={{ background: "linear-gradient(135deg, #7c3aed, #db2777)" }}>
                <Clapperboard className="absolute inset-0 m-auto h-4 w-4 text-white" />
                <div className="absolute inset-0 bg-white/0 transition-colors group-hover:bg-white/10" />
              </div>
              <span className="text-[13px] font-semibold tracking-[0.12em] text-white/80 transition-colors group-hover:text-white">
                妙笔动画
              </span>
            </Link>

            {/* 中间导航 */}
            <nav className="hidden items-center xl:flex">
              {[
                { label: "工作台", href: "/dashboard" },
                { label: "资产库", href: "/assets" },
                { label: "脚本工坊", href: "/script-workshop" },
                { label: "角色", href: "/characters" },
              ].map((item) => (
                <Link key={item.label} href={item.href}
                  className="px-5 py-2 text-[12px] tracking-[0.08em] text-white/35 transition-colors hover:text-white/75">
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* 右侧 */}
            <div className="flex items-center gap-5">
              <Link href="/login"
                className="hidden text-[12px] tracking-[0.08em] text-white/35 transition-colors hover:text-white/70 sm:inline">
                登录
              </Link>
              <Link href="/register"
                className="group relative flex items-center gap-2 overflow-hidden rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-[12px] tracking-[0.08em] text-white/70 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white">
                进入平台
                <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ══ HERO ══════════════════════════════════════════════════ */}
      <section ref={heroRef} className="relative flex h-screen min-h-[680px] flex-col items-center justify-center overflow-hidden">
        <motion.div className="absolute inset-0" style={{ y: bgY }}>
          <SceneBg />
          <Starfield />
        </motion.div>

        {/* 中央内容 */}
        <motion.div
          className="relative z-10 flex flex-col items-center px-6 text-center"
          style={{ opacity: fadeOut, y: slideUp }}
        >
          {/* 平台标签 */}
          <motion.div
            className="mb-10 flex items-center gap-3"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease }}
          >
            <div className="h-px w-10 bg-gradient-to-r from-transparent to-violet-400/50" />
            <span className="text-[10px] tracking-[0.45em] text-violet-300/60 uppercase">AI Animation Studio</span>
            <div className="h-px w-10 bg-gradient-to-l from-transparent to-violet-400/50" />
          </motion.div>

          {/* 主标题 */}
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.1, ease }}
          >
            <h1 className="text-[clamp(3.5rem,8vw,8rem)] font-bold leading-[0.95] tracking-[-0.04em]">
              <span className="block text-white/90">妙笔动画</span>
              <span className="block" style={{
                background: "linear-gradient(135deg, #c084fc 0%, #e879f9 35%, #f472b6 65%, #fb7185 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 60px rgba(192,132,252,0.4))",
              }}>
                MiaoBI
              </span>
            </h1>
          </motion.div>

          {/* 副标题 */}
          <motion.p
            className="mt-8 max-w-[420px] text-[13px] leading-[2] tracking-[0.05em] text-white/30"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.25, ease }}
          >
            从脚本到成片，AI 驱动的完整动画创作系统
          </motion.p>

          {/* 数字统计 */}
          <motion.div
            className="mt-12 flex items-center gap-10"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.35, ease }}
          >
            {stats.map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-[22px] font-bold tracking-tight text-white/85">{s.value}</span>
                <span className="text-[10px] tracking-[0.25em] text-white/25 uppercase">{s.label}</span>
              </div>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            className="mt-12 flex items-center gap-4"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.45, ease }}
          >
            <Link href="/register"
              className="group relative overflow-hidden rounded-full px-9 py-3.5 text-[13px] font-medium tracking-[0.1em] text-white"
              style={{ background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #db2777 100%)" }}
            >
              <span className="relative z-10">开始创作</span>
              <motion.div
                className="absolute inset-0 bg-white/0"
                whileHover={{ background: "rgba(255,255,255,0.08)" }}
                transition={{ duration: 0.2 }}
              />
              {/* 光晕 */}
              <div className="absolute inset-0 rounded-full opacity-0 shadow-[0_0_40px_rgba(168,85,247,0.8)] transition-opacity group-hover:opacity-100" />
            </Link>

            <Link href="/login"
              className="rounded-full border border-white/10 px-9 py-3.5 text-[13px] tracking-[0.1em] text-white/40 backdrop-blur-sm transition-all hover:border-white/20 hover:text-white/70">
              了解更多
            </Link>
          </motion.div>
        </motion.div>

        {/* 滚动提示 */}
        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 6, 0], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="h-5 w-5 text-white/30" />
        </motion.div>
      </section>

      {/* ══ 功能区 ════════════════════════════════════════════════ */}
      <section className="relative py-32">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-px w-[600px] -translate-x-1/2"
            style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.4), transparent)" }} />
        </div>

        <div className="mx-auto max-w-[1280px] px-6 sm:px-10">
          {/* 标题 */}
          <motion.div className="mb-20 text-center"
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.85, ease }}
          >
            <p className="mb-4 text-[10px] tracking-[0.45em] text-violet-400/50 uppercase">Core Features</p>
            <h2 className="text-[clamp(1.8rem,3.5vw,3rem)] font-semibold tracking-[-0.02em] text-white/80">
              专为动画创作设计
            </h2>
          </motion.div>

          {/* 卡片 */}
          <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4"
            style={{ background: "rgba(255,255,255,0.04)", borderRadius: 24, overflow: "hidden" }}>
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div key={f.title}
                  className="group relative flex flex-col gap-5 bg-[#07040f] p-8 transition-colors duration-300 hover:bg-[#0e0820]"
                  initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.7, delay: i * 0.1, ease }}
                >
                  {/* 顶部光线 */}
                  <div className="absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: `linear-gradient(90deg, transparent, ${f.color}60, transparent)` }} />

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ background: `${f.color}15`, border: `1px solid ${f.color}25` }}>
                    <Icon className="h-4.5 w-4.5" style={{ color: f.color }} />
                  </div>

                  <div>
                    <h3 className="mb-2.5 text-[15px] font-semibold text-white/80">{f.title}</h3>
                    <p className="text-[12px] leading-[1.85] text-white/30">{f.desc}</p>
                  </div>

                  <div className="mt-auto flex items-center gap-1.5 text-[11px] tracking-[0.1em] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ color: f.color }}>
                    了解更多
                    <ArrowUpRight className="h-3 w-3" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══ 流程区 ════════════════════════════════════════════════ */}
      <section className="relative py-24">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-px w-[600px] -translate-x-1/2"
            style={{ background: "linear-gradient(90deg, transparent, rgba(236,72,153,0.3), transparent)" }} />
        </div>

        <div className="mx-auto max-w-[1280px] px-6 sm:px-10">
          <motion.div className="mb-20 text-center"
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.85, ease }}
          >
            <p className="mb-4 text-[10px] tracking-[0.45em] text-pink-400/50 uppercase">Workflow</p>
            <h2 className="text-[clamp(1.8rem,3.5vw,3rem)] font-semibold tracking-[-0.02em] text-white/80">
              四步完成一部动画
            </h2>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", t: "创建项目", d: "设定动画风格与目标" },
              { n: "02", t: "搭建资产", d: "注册角色、场景、道具" },
              { n: "03", t: "编写脚本", d: "AI 辅助，支持小说改编" },
              { n: "04", t: "生成视频", d: "分镜编辑，AI 渲染成片" },
            ].map((s, i) => (
              <motion.div key={s.n}
                className="relative rounded-2xl border border-white/[0.05] bg-white/[0.02] p-7"
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.7, delay: i * 0.1, ease }}
              >
                <div className="mb-6 text-[3rem] font-black leading-none tracking-tighter text-white/[0.04]">{s.n}</div>
                <h3 className="mb-2 text-[15px] font-semibold text-white/75">{s.t}</h3>
                <p className="text-[12px] leading-relaxed text-white/25">{s.d}</p>
                {i < 3 && (
                  <div className="absolute -right-3 top-1/2 hidden -translate-y-1/2 lg:block">
                    <div className="h-px w-6 bg-white/10" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ 底部 CTA ══════════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-36 text-center">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "radial-gradient(ellipse, rgba(120,60,220,0.12) 0%, transparent 70%)" }} />
          <div className="absolute inset-x-0 top-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.3), transparent)" }} />
        </div>

        <motion.div className="relative z-10 px-6"
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.9, ease }}
        >
          <p className="mb-5 text-[10px] tracking-[0.45em] text-violet-400/50 uppercase">Begin Your Journey</p>
          <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-semibold tracking-[-0.03em] text-white/80">
            开始你的创作之旅
          </h2>
          <p className="mt-5 text-[13px] tracking-[0.05em] text-white/25">
            注册即可体验完整的 AI 动画创作流程
          </p>
          <div className="mt-12 flex items-center justify-center gap-4">
            <Link href="/register"
              className="group relative overflow-hidden rounded-full px-10 py-4 text-[13px] font-medium tracking-[0.12em] text-white"
              style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7, #db2777)" }}
            >
              <span className="relative z-10">立即体验</span>
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </Link>
            <Link href="/login"
              className="rounded-full border border-white/8 px-10 py-4 text-[13px] tracking-[0.12em] text-white/35 transition-all hover:border-white/15 hover:text-white/60">
              登录账号
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ══ Footer ════════════════════════════════════════════════ */}
      <footer className="border-t border-white/[0.04] py-10">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 sm:px-10">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-md"
              style={{ background: "linear-gradient(135deg, #7c3aed, #db2777)" }} />
            <span className="text-[11px] tracking-[0.15em] text-white/25">妙笔动画</span>
          </div>
          <p className="text-[11px] tracking-[0.05em] text-white/15">© 2026 MiaoBI Animation. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
