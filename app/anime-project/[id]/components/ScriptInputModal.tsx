"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Sparkles, FileText, Info, ChevronRight, X, Plus, Pencil, Trash2, Check, AlertCircle } from "lucide-react";
import api, { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

interface ScriptInputModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  fragmentId: number;
  onSuccess: () => void;
}

// 系统模板
interface Template {
  code: string;
  name: string;
  description: string;
}

// 用户自定义模板
interface UserTemplate {
  id: number;
  templateName: string;
  description?: string;
  systemPrompt: string;
  category?: string;
}

// ✅ 分镜生成：后端解析 AI 输出时，强依赖 JSON 结构
// 用户反馈的实际格式：顶层为 {"shots": [...]}
// 为了避免“格式改坏导致分镜解析失败”，这里采用：
// - JSON 结构：用户直接编辑 JSON（更直观）
// - 保存时做严格校验（必须是合法 JSON，且满足 {shots:[...]} + 必需字段）

// 系统自动追加的 JSON 示例段落标识（用于从已保存模板中提取/回填）
const APPENDED_JSON_BLOCK_MARKER = "【系统追加：输出 JSON 示例（请勿删除本行）】";

// shots 内每段（10s）必需字段（按你提供的协议）
const REQUIRED_SHOT_FIELDS = [
  "description",
  "dialogue",
  "duration",
  "firstFramePrompt",
  "cameraMovement",
  "videoPrompt",
  "endState",
] as const;

type RequiredShotField = (typeof REQUIRED_SHOT_FIELDS)[number];

interface JsonValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// 默认 JSON 示例（可编辑）——严格 JSON，顶层仅包含 {"shots": [...]}
const DEFAULT_STORYBOARD_JSON_EXAMPLE_TEXT = `{
  "shots": [
    {
      "description": "教室黄昏A被叫住回头",
      "dialogue": "B：那个...请等一下！\\nA：嗯？",
      "duration": 10,
      "firstFramePrompt": "16:9横屏，黄昏的日式教室，金橙色夕阳从左侧窗户射入，课桌椅排列整齐；机位在教室走道平视，中景构图。A=黑发马尾JK校服，背对镜头正要走出教室门，身体正直；B=短发害羞男生，站在画面深处走廊口；主光来自左侧强夕阳，逆光氛围，A的发丝有金色轮缘光。",
      "cameraMovement": "背影跟拍→声音停止→慢动作回头→特写表情",
      "videoPrompt": "动漫风格，高画质，精细五官，有音效，无音乐，无字幕，运镜丝滑，人物动作流畅。\\n[0s-0.3s]|参考人物，持续0.3秒\\n(0.3s-4.0s)|强制切画面 Transition:定切|黄昏教室，夕阳左射，课桌整齐；空间布局：窗户在左，A在前景背对，B在后景深处；机位平视中景，A背着书包正常行走，刚要迈出门口，B在远处张嘴喊话，身体前倾；光线：左侧强暖逆光|运镜:跟随A前行|台词:B：那个...请等一下！\\n(4.0s-7.5s)|强制切画面 Transition:甩镜|同黄昏教室，机位切换到A的侧面近景（侧颜杀），A停下脚步，头发因惯性微微飘动，慢慢转头转向后方，眼神从疑惑转为惊讶，眼睛大而明亮；背景虚化；光线：侧逆光勾勒轮廓|运镜:慢速平移绕半圈|台词:A：嗯？\\n(7.5s-10.0s)|强制切画面 Transition:主观视角|B的主观视角看A，A完全转过身来，正面中景，表情定格在惊讶，微微张嘴，脸颊微红，双手抓着书包带子停在胸前半拍；背景是教室走廊|运镜:轻微呼吸感推拉|台词:[无]",
      "endState": "黄昏教室走廊口，A=黑发马尾JK校服正面站立，中景构图，表情惊讶微微张嘴，脸颊微红，双手抓着书包带子停在胸前；背景是逆光的教室内部，尘埃飞舞；主光从A背后打来，边缘发光"
    }
  ]
}`;

// 默认的用户可编辑提示词部分（使用你给的“顶级动漫分镜导演 + JSON Strict Mode”规范作为示例）
const DEFAULT_USER_PROMPT = `你是一位顶级动漫分镜导演，擅长制作画风精美、人物美型、运镜流畅的连贯动漫短片（由多个10秒片段拼接）。
你将接收一段【剧情文本/脚本】，你的任务是将其改编为严格的 JSON 格式分镜脚本。

核心原则：动漫审美与时间规划（CRITICAL）
1. 审美强制：绝对美型原则
- 禁止写实丑化：动漫人物即使在受伤、绝望、熬夜时，也必须保持视觉美感。
- 严禁词汇：禁止出现“黑眼圈 (dark circles)”、“眼袋 (eye bags)”、“面容疲惫 (exhausted face)”、“皮肤粗糙”、“浮肿”、“衰老”等会导致人物变丑的写实描述。
- 正确表达方式：
  - 表现疲惫/压力 → 使用“面部打上阴影 (shadow over face)”、“眼神失去高光 (dull eyes)”、“轻微汗珠 (sweat drop)”。
  - 表现恐惧/绝望 → 使用“瞳孔收缩/震动 (trembling pupils)”、“脸色苍白 (pale face)”。
- 表情词库：使用标准的动漫表情描述，如：坚毅 (determined)、惊讶 (shocked)、温柔 (gentle smile)、愤怒 (furrowed brows)、害羞 (blush)、坏笑 (smirk)。

2. 拒绝抽象：必须是物理画面
- 禁止：“他感到很后悔”、“气氛很紧张”、“两人关系破裂”。
- 必须：“他紧握拳头直到指节发白”、“镜头急推面部特写”、“两人背对背站立距离拉远”。
所有描述必须是画师能直接画出来的物理状态。

3. 时间与节奏规划
- 切镜不宜过碎：10秒内通常只安排 3-4 个镜头（含0-0.3s参考段）。
- 给足表演时间：
  - 一个完整的动作（如拔剑、转身、喝水）至少给 2.0s - 3.0s。
  - 一句正常语速的台词，必须给足 3.0s - 5.0s 的镜头时长，否则口型对不上。
- 禁止在 1 秒内塞入复杂动作（物理不可能）。

输出协议（JSON Strict Mode）
- 格式限制：必须输出严格合法的 JSON 对象，顶层仅包含 {"shots": [...]}。
- 字符串规则：禁止使用真实换行符，必须使用 \\n。禁止 Markdown 代码块标记。
- 兜底逻辑：若剧情无法解析，输出 {"shots":[]}。

分镜段结构（Shots Structure）
每个 shot 代表一个10秒的视频生成段，必须包含以下字段：
- description: 本段剧情一句话摘要（中文，20字内）。
- dialogue: 本段内的所有对白，用 \\n 分行。不能为空。
- duration: 固定为 10（整数）。
- firstFramePrompt: 0.0s 静态起始帧。必须包含：16:9横屏 + 场景锚点 + 空间布局 + 人物动作起始态 + 光影。禁止对白/字幕。
- cameraMovement: 简述本段运镜逻辑（如：推镜头→定格→特写）。
- videoPrompt: 核心脚本。内部必须用 \\n 换行，结构严格如下：
  - 第一行（固定风格设定）：动漫风格，高画质，精细五官，有音效，无音乐，无字幕，运镜丝滑，人物动作流畅。
  - 第二行（固定参考段）：[0s-0.3s]|参考人物，持续0.3秒
  - 后续行（覆盖 0.3s -> 10.0s）：(起始s-结束s)|强制切画面 Transition:转场方式|画面描述...|运镜:...|台词:...
- endState: 10.0s 结束帧状态。用于下一段无缝衔接，必须写清动作停在哪个半拍。

核心字段编写规则
1) firstFramePrompt & endState（衔接生命线）
- 连贯性：Shot N 的 firstFramePrompt 必须严格复刻 Shot N-1 的 endState（场景、站位、光线、道具位置必须一致），仅允许极微小的构图微调。
- 半拍原则：endState 必须描述动作进行到一半的状态（例如：“手停在半空”、“脚刚迈出一步”），以便下一段接续动势。

2) videoPrompt（时间轴脚本）
- 画面描述 (Content) 必须包含：
  - 场景锚点：地点+时间+关键物品（防止背景闪烁）。
  - 空间布局：谁在左，谁在右，前后关系。
  - 人物美型状态：具体的五官表情+肢体动作（不要写黑眼圈/疲态）。
  - 光线：主光方向 + 冷暖色调。
- 时间规划示例：
  - 0.3s-3.5s：建立镜头（展示环境与人物站位）。
  - 3.5s-7.5s：表演镜头（说话/主要动作，给足时间）。
  - 7.5s-10.0s：反应镜头或动作收尾（为下一段做铺垫）。

角色与场景一致性策略
- 外貌标识：为主角提取简短固定外貌词（如：A=银发蓝眼骑士装），全片复用。
- 场景锚点：同一场景内，无论镜头怎么切，背景关键特征（如：窗户在左，书柜在后）不能变。

开始执行
请读取用户的剧情，严格按上述“动漫审美”与“时间规划”规则，输出 JSON。

剧情文本/脚本：
{scriptContent}`;

function validateStoryboardJsonExampleText(jsonText: string): JsonValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!jsonText.trim()) {
    return { valid: false, errors: ["请输入 JSON 示例"], warnings };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e: any) {
    return {
      valid: false,
      errors: [
        `JSON 解析失败：${e?.message || "未知错误"}`,
        "提示：必须是严格 JSON（不能有注释、不能有尾逗号、字符串内不能出现未转义换行）。",
      ],
      warnings,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push("顶层必须是 JSON 对象，例如：{\"shots\":[...]}。");
    return { valid: false, errors, warnings };
  }

  const keys = Object.keys(parsed);
  if (!(keys.length === 1 && keys[0] === "shots")) {
    errors.push("顶层仅允许包含一个字段：shots。请保持格式为 {\"shots\":[...]}。");
  }

  const shots = (parsed as any).shots;
  if (!Array.isArray(shots)) {
    errors.push("shots 必须是数组，例如：{\"shots\":[{...}]}。");
    return { valid: false, errors, warnings };
  }

  if (shots.length === 0) {
    warnings.push("当前示例 shots 为空数组（允许作为兜底，但实际生成会没有分镜）。");
  }

  shots.forEach((s: any, idx: number) => {
    if (!s || typeof s !== "object" || Array.isArray(s)) {
      errors.push(`shots[${idx}] 必须是对象。`);
      return;
    }

    for (const f of REQUIRED_SHOT_FIELDS) {
      if (!(f in s)) {
        errors.push(`shots[${idx}] 缺少必需字段：${f}`);
      }
    }

    // 类型校验
    const mustBeString: RequiredShotField[] = [
      "description",
      "dialogue",
      "firstFramePrompt",
      "cameraMovement",
      "videoPrompt",
      "endState",
    ];
    for (const f of mustBeString) {
      if (f in s && typeof s[f] !== "string") {
        errors.push(`shots[${idx}].${f} 必须是字符串。`);
      }
    }

    if ("duration" in s && typeof s.duration !== "number") {
      errors.push(`shots[${idx}].duration 必须是数字。`);
    } else if (typeof s.duration === "number" && s.duration !== 10) {
      warnings.push(`shots[${idx}].duration 建议固定为 10（当前为 ${s.duration}）。`);
    }

    if (typeof s.dialogue === "string" && !s.dialogue.trim()) {
      errors.push(`shots[${idx}].dialogue 不能为空（用 \\n 分行）。`);
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

function buildFullPrompt(userPrompt: string, jsonExampleText: string): string {
  return `${userPrompt}\n\n${APPENDED_JSON_BLOCK_MARKER}\n${jsonExampleText.trim()}`;
}

// 校验用户提示词（只校验用户可编辑部分）
function validateUserPrompt(prompt: string): { valid: boolean; error?: string } {
  if (!prompt.includes('{scriptContent}')) {
    return { valid: false, error: '必须包含 {scriptContent} 变量，AI 将在此处插入剧本内容' };
  }
  return { valid: true };
}

// 从完整提示词中提取用户部分（去掉系统追加的 JSON 示例段）
function extractUserPrompt(fullPrompt: string): string {
  const markerIndex = fullPrompt.indexOf(APPENDED_JSON_BLOCK_MARKER);
  if (markerIndex >= 0) {
    return fullPrompt.slice(0, markerIndex).trim();
  }

  // 兼容旧版本：曾经用 "## 输出要求" 作为自动追加段的开始
  const legacyIndex = fullPrompt.indexOf('## 输出要求');
  if (legacyIndex > 0) {
    return fullPrompt.substring(0, legacyIndex).trim();
  }

  return fullPrompt;
}

// 从完整提示词中提取 JSON 示例文本（用于编辑时回填）
function extractStoryboardJsonExampleText(fullPrompt: string): string | null {
  const markerIndex = fullPrompt.indexOf(APPENDED_JSON_BLOCK_MARKER);
  if (markerIndex >= 0) {
    return fullPrompt.slice(markerIndex + APPENDED_JSON_BLOCK_MARKER.length).trim();
  }

  // 兼容：如果模板里直接包含 {"shots": ...}
  const objStart = fullPrompt.indexOf('{"shots"');
  if (objStart >= 0) {
    return fullPrompt.slice(objStart).trim();
  }

  // 兼容更旧版本：从 "JSON 结构示例" 之后尝试解析 JSON 数组/对象
  const legacyMarkerIndex = fullPrompt.indexOf('JSON 结构示例');
  if (legacyMarkerIndex >= 0) {
    const braceIdx = fullPrompt.indexOf('{', legacyMarkerIndex);
    const bracketIdx = fullPrompt.indexOf('[', legacyMarkerIndex);
    const jsonStart = (() => {
      if (braceIdx < 0) return bracketIdx;
      if (bracketIdx < 0) return braceIdx;
      return Math.min(braceIdx, bracketIdx);
    })();

    if (jsonStart >= 0) {
      const explainIndex = (() => {
        const lf = fullPrompt.indexOf('\n说明：', jsonStart);
        if (lf >= 0) return lf;
        return fullPrompt.indexOf('\r\n说明：', jsonStart);
      })();

      const jsonText = (explainIndex >= 0
        ? fullPrompt.slice(jsonStart, explainIndex)
        : fullPrompt.slice(jsonStart)
      ).trim();

      try {
        const parsed = JSON.parse(jsonText);
        if (Array.isArray(parsed)) {
          return JSON.stringify({ shots: parsed }, null, 2);
        }
        if (parsed && typeof parsed === 'object') {
          return JSON.stringify(parsed, null, 2);
        }
      } catch {
        // ignore
      }
    }
  }

  return null;
}

export default function ScriptInputModal({ 
  open, 
  onOpenChange, 
  projectId,
  fragmentId,
  onSuccess 
}: ScriptInputModalProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [scriptContent, setScriptContent] = useState("");
  
  // Tab: system | user
  const [activeTab, setActiveTab] = useState<'system' | 'user'>('system');
  
  // 系统模板状态
  const [systemTemplates, setSystemTemplates] = useState<Template[]>([]);
  const [loadingSystem, setLoadingSystem] = useState(false);
  
  // 用户模板状态
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [loadingUser, setLoadingUser] = useState(false);
  
  // 选中状态
  const [selectedType, setSelectedType] = useState<'system' | 'user'>('system');
  const [selectedId, setSelectedId] = useState<string>("");
  
  // 生成状态
  const [generating, setGenerating] = useState(false);
  
  // 新建/编辑弹窗
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<UserTemplate | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [jsonExampleText, setJsonExampleText] = useState<string>(DEFAULT_STORYBOARD_JSON_EXAMPLE_TEXT);
  const [saving, setSaving] = useState(false);

  // 加载系统模板
  useEffect(() => {
    if (open) {
      loadSystemTemplates();
    }
  }, [open]);

  const loadSystemTemplates = async () => {
    setLoadingSystem(true);
    try {
      const res = await api.get<Template[]>("/storyboard-templates");
      console.log("✅ 加载到的分镜模板:", res.data);
      setSystemTemplates(res.data);
      // 默认选中第一个模板
      if (res.data.length > 0 && !selectedId) {
        setSelectedType('system');
        setSelectedId(res.data[0].code);
      }
    } catch (error: any) {
      // 兜底：后端未配置模板时，使用本地默认模板
      console.error("❌ 模板API获取失败,使用内置默认模板:", error);
      const fallbackTemplates: Template[] = [
        { code: "storyboard_shots_default", name: "标准分镜模板(内置)", description: "生成基础分镜(仅镜头)，适合通用剧情" },
      ];
      setSystemTemplates(fallbackTemplates);
      if (!selectedId) {
        setSelectedType('system');
        setSelectedId(fallbackTemplates[0].code);
      }
    } finally {
      setLoadingSystem(false);
    }
  };
  
  // 加载用户模板
  const loadUserTemplates = async () => {
    setLoadingUser(true);
    try {
      const res = await api.get<UserTemplate[]>('/ai-agent/user-inference-templates?category=STORYBOARD');
      setUserTemplates(res.data || []);
    } catch (e) {
      console.error('加载分镜用户模板失败', e);
    } finally {
      setLoadingUser(false);
    }
  };
  
  // 切换到用户模板 tab 时加载
  useEffect(() => {
    if (activeTab === 'user' && userTemplates.length === 0 && !loadingUser) {
      loadUserTemplates();
    }
  }, [activeTab]);
  
  // 选择模板
  const handleSelectTemplate = (type: 'system' | 'user', id: string) => {
    setSelectedType(type);
    setSelectedId(id);
  };
  
  // 打开新建弹窗
  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormDesc('');
    setFormPrompt(DEFAULT_USER_PROMPT);
    setJsonExampleText(DEFAULT_STORYBOARD_JSON_EXAMPLE_TEXT);
    setEditModalOpen(true);
  };
  
  // 打开编辑弹窗
  const handleOpenEdit = (template: UserTemplate) => {
    setEditingTemplate(template);
    setFormName(template.templateName);
    setFormDesc(template.description || '');

    // 从完整提示词中提取用户可编辑部分
    setFormPrompt(extractUserPrompt(template.systemPrompt));

    // 从完整提示词中提取 JSON 示例（回填到 JSON 编辑器）
    const extractedJsonText = extractStoryboardJsonExampleText(template.systemPrompt);
    setJsonExampleText(extractedJsonText || DEFAULT_STORYBOARD_JSON_EXAMPLE_TEXT);

    setEditModalOpen(true);
  };
  
  // 保存模板
  const handleSaveTemplate = async () => {
    if (!formName.trim()) {
      toast('请输入模板名称', 'error');
      return;
    }
    if (!formPrompt.trim()) {
      toast('请输入提示词内容', 'error');
      return;
    }
    
    // 校验用户提示词
    const validation = validateUserPrompt(formPrompt);
    if (!validation.valid) {
      toast(validation.error!, 'error');
      return;
    }
    
    // 校验 JSON 示例（必须是合法 JSON + {shots:[...]}）
    const jsonValidation = validateStoryboardJsonExampleText(jsonExampleText);
    if (!jsonValidation.valid) {
      toast(jsonValidation.errors[0], 'error');
      return;
    }

    // 组合完整提示词（用户部分 + JSON 示例）
    const fullPrompt = buildFullPrompt(formPrompt.trim(), jsonExampleText);
    
    setSaving(true);
    try {
      if (editingTemplate) {
        // 更新
        await api.put(`/ai-agent/user-inference-templates/${editingTemplate.id}`, {
          templateName: formName.trim(),
          description: formDesc.trim() || null,
          systemPrompt: fullPrompt,
          category: 'STORYBOARD'
        });
        toast('模板已更新', 'success');
      } else {
        // 新建
        await api.post('/ai-agent/user-inference-templates', {
          templateName: formName.trim(),
          description: formDesc.trim() || null,
          systemPrompt: fullPrompt,
          category: 'STORYBOARD'
        });
        toast('模板已创建', 'success');
      }
      setEditModalOpen(false);
      loadUserTemplates();
    } catch (e: any) {
      toast(e.response?.data?.error || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };
  
  // 删除模板
  const handleDeleteTemplate = async (template: UserTemplate) => {
    const confirmed = await confirm({
      title: '删除模板',
      description: `确定要删除「${template.templateName}」吗？`,
      confirmText: '删除',
      variant: 'danger'
    });
    if (!confirmed) return;
    
    try {
      await api.delete(`/ai-agent/user-inference-templates/${template.id}`);
      toast('已删除', 'success');
      loadUserTemplates();
      // 如果删除的是当前选中的，切换到系统模板
      if (selectedType === 'user' && selectedId === String(template.id)) {
        if (systemTemplates.length > 0) {
          handleSelectTemplate('system', systemTemplates[0].code);
        }
      }
    } catch (e: any) {
      toast(e.response?.data?.error || '删除失败', 'error');
    }
  };
  const handleGenerate = async () => {
    if (!scriptContent.trim()) {
      toast("请输入剧本或小说内容", "error");
      return;
    }
    if (!selectedId) {
      toast("请选择一个模板", "error");
      return;
    }

    setGenerating(true);
    try {
      // 1. 获取或创建 workflow
      const getRes = await api.get(`/ai-agent/workflows/by-fragment`, {
        params: { projectId, fragmentId }
      });

      const workflow = getRes.data || (await api.post(`/ai-agent/workflows`, {
        projectId,
        fragmentId,
        title: "AI 分镜工作流"
      })).data;
      
      // 2. 更新剧本内容（只传必要参数）
      await api.put(`/ai-agent/workflows/${workflow.id}/step1`, {
        scriptContent,
        maxShots: 30
      });
      
      // 3. 使用流式接口生成分镜（避免超时）
      // 与 axios 配置保持一致，避免本地端口写死导致请求打不到 Java 后端
      
      // 根据选中的模板类型构造请求参数
      const requestBody = selectedType === 'system' 
        ? { templateCode: selectedId }
        : { userTemplateId: selectedId };
      
      const response = await apiFetch(`/ai-agent/workflows/${workflow.id}/analyze-shots-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error('请求失败');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let done = false;
      let buffer = '';
      let receivedComplete = false;
      
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // 保留最后一行（可能不完整）
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = line.slice(5).trim();
              if (!data) continue;
              try {
                const event = JSON.parse(data);
                console.log('SSE event:', event);
                
                if (event.status === 'ANALYZING') {
                  toast("正在分析剧本...", "info");
                } else if (event.status === 'COMPLETED') {
                  receivedComplete = true;
                  toast("分镜生成完成！", "success");
                  onOpenChange(false);
                  onSuccess();
                  return;
                } else if (event.message && !event.status) {
                  // 进度消息
                  console.log('Progress:', event.message);
                } else if (event.error) {
                  throw new Error(event.error);
                }
              } catch (parseError) {
                // 忽略解析错误，可能是不完整的JSON
                console.log('Parse error for line:', line);
              }
            }
          }
        }
      }
      
      // 如果流正常结束但没有收到COMPLETED事件，也认为成功
      if (!receivedComplete) {
        toast("分镜生成完成！", "success");
        onOpenChange(false);
        onSuccess();
      }
      
    } catch (error: any) {
      toast(error.response?.data?.error || error.message || "生成失败", "error");
    } finally {
      setGenerating(false);
    }
  };

  // 获取当前选中的系统模板
  const selectedSystemTemplate = systemTemplates.find(t => t.code === selectedId);
  // 获取当前选中的用户模板
  const selectedUserTemplate = userTemplates.find(t => String(t.id) === selectedId);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950/95 backdrop-blur-2xl border-white/10 text-white rounded-3xl shadow-2xl max-w-5xl p-0 overflow-hidden ring-1 ring-white/5">
        
        {/* 顶部背景装饰 */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-purple-900/20 to-transparent pointer-events-none" />
        
        <div className="p-6 md:p-8 pr-12 space-y-6 relative">
          <DialogHeader className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center shadow-lg shadow-purple-900/20">
                <FileText className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                  输入剧本生成分镜
                </DialogTitle>
                <DialogDescription className="text-zinc-400 text-sm mt-1.5 flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  AI 将自动分析剧情、提取镜头，并生成专业的分镜脚本
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid md:grid-cols-12 gap-8">
            {/* 左侧：输入区域 */}
            <div className="md:col-span-7 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <div className="w-1 h-4 bg-purple-500 rounded-full" />
                    剧本内容
                  </Label>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full border transition-colors",
                    scriptContent.length > 0 
                      ? "bg-purple-500/10 text-purple-400 border-purple-500/20" 
                      : "bg-zinc-800/50 text-zinc-500 border-transparent"
                  )}>
                    {scriptContent.length} 字
                  </span>
                </div>
                <div className="relative group">
                  <Textarea
                    value={scriptContent}
                    onChange={(e) => setScriptContent(e.target.value)}
                    placeholder={`在此处粘贴您的小说片段、剧本大纲或分镜脚本...

💡 提示：
• 支持直接粘贴小说原文，AI会自动拆分镜头
• 如果有特定画面要求，可以在文中用括号标注
• 描写越生动，生成的画面越精细`}
                    className="h-[50vh] min-h-[360px] max-h-[560px] bg-zinc-900/50 border-white/5 focus:border-purple-500/50 focus:bg-zinc-900 focus:ring-1 focus:ring-purple-500/50 transition-all resize-none text-sm leading-relaxed p-4 rounded-xl placeholder:text-zinc-600"
                  />
                  {/* 快捷清空按钮 */}
                  {scriptContent.length > 0 && (
                    <button
                      onClick={() => setScriptContent("")}
                      className="absolute top-3 right-3 p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="清空内容"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 右侧：配置与操作 */}
            <div className="md:col-span-5 flex flex-col gap-4">
              {/* 模板选择 */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                  生成模板
                </Label>
                
                {/* Tab 切换 */}
                <div className="flex p-1 rounded-lg bg-zinc-900 border border-zinc-800">
                  <button
                    onClick={() => setActiveTab('system')}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all",
                      activeTab === 'system'
                        ? "bg-zinc-800 text-zinc-100 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                    )}
                  >
                    系统模板
                  </button>
                  <button
                    onClick={() => setActiveTab('user')}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all",
                      activeTab === 'user'
                        ? "bg-zinc-800 text-zinc-100 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                    )}
                  >
                    我的模板
                  </button>
                </div>
                
                {/* 模板列表 */}
                <div className="min-h-[180px] max-h-[240px] overflow-y-auto">
                  {activeTab === 'system' ? (
                    // 系统模板列表
                    <div className="space-y-2">
                      {loadingSystem ? (
                        <div className="flex items-center justify-center py-8 text-zinc-500">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          <span className="text-xs">加载中...</span>
                        </div>
                      ) : systemTemplates.length === 0 ? (
                        <div className="p-4 text-center text-xs text-zinc-500">暂无系统模板</div>
                      ) : (
                        systemTemplates.map((template) => {
                          const isSelected = selectedType === 'system' && selectedId === template.code;
                          return (
                            <button
                              key={template.code}
                              onClick={() => handleSelectTemplate('system', template.code)}
                              className={cn(
                                "w-full p-3 rounded-xl text-left transition-all border group relative overflow-hidden",
                                isSelected
                                  ? "bg-zinc-800/80 border-indigo-500/30 ring-1 ring-indigo-500/20"
                                  : "bg-transparent border-transparent hover:bg-zinc-900 border-zinc-900"
                              )}
                            >
                              {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />}
                              <div className="flex items-center gap-2 pl-1">
                                <span className={cn(
                                  "text-sm font-medium transition-colors flex-1",
                                  isSelected ? "text-indigo-400" : "text-zinc-300 group-hover:text-zinc-200"
                                )}>
                                  {template.name}
                                </span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-500" />}
                              </div>
                              {template.description && (
                                <p className="text-xs text-zinc-500 mt-1 pl-1 line-clamp-2">
                                  {template.description}
                                </p>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    // 用户模板列表
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1 mb-2">
                        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">自定义</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                          onClick={handleOpenCreate}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          新建
                        </Button>
                      </div>
                      
                      {loadingUser ? (
                        <div className="flex items-center justify-center py-8 text-zinc-500">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          <span className="text-xs">加载中...</span>
                        </div>
                      ) : userTemplates.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30">
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center mb-2">
                            <Sparkles className="w-4 h-4 text-zinc-600" />
                          </div>
                          <p className="text-xs text-zinc-500 mb-3">还没有自定义模板</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                            onClick={handleOpenCreate}
                          >
                            创建第一个模板
                          </Button>
                        </div>
                      ) : (
                        userTemplates.map((template) => {
                          const isSelected = selectedType === 'user' && selectedId === String(template.id);
                          return (
                            <div
                              key={template.id}
                              className={cn(
                                "w-full p-3 rounded-xl text-left transition-all border group relative overflow-hidden",
                                isSelected
                                  ? "bg-zinc-800/80 border-violet-500/30 ring-1 ring-violet-500/20"
                                  : "bg-transparent border-transparent hover:bg-zinc-900 border-zinc-900"
                              )}
                            >
                              {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500" />}
                              <div className="flex items-start gap-2 pl-1">
                                <button
                                  className="flex-1 min-w-0 text-left"
                                  onClick={() => handleSelectTemplate('user', String(template.id))}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      "text-sm font-medium transition-colors",
                                      isSelected ? "text-violet-400" : "text-zinc-300 group-hover:text-zinc-200"
                                    )}>
                                      {template.templateName}
                                    </span>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-violet-500 ml-auto" />}
                                  </div>
                                  {template.description && (
                                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                                      {template.description}
                                    </p>
                                  )}
                                </button>
                                
                                {/* 操作区 */}
                                <div className="flex gap-1 pl-2 border-l border-zinc-800 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleOpenEdit(template); }}
                                    className="p-1 rounded-md hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                                    title="编辑"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(template); }}
                                    className="p-1 rounded-md hover:bg-red-500/20 text-zinc-500 hover:text-red-400"
                                    title="删除"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                
                {/* 选中的模板详情卡片 */}
                {(selectedType === 'system' && selectedSystemTemplate) && (
                  <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 border border-white/5 rounded-xl p-3 space-y-1">
                    <div className="flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-medium text-indigo-200">模板说明</p>
                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                          {selectedSystemTemplate.description}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {(selectedType === 'user' && selectedUserTemplate) && (
                  <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 border border-white/5 rounded-xl p-3 space-y-1">
                    <div className="flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-medium text-violet-200">自定义模板</p>
                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                          {selectedUserTemplate.description || '无描述'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 底部操作区 */}
              <div className="mt-auto pt-4 border-t border-white/5 space-y-4">
                <Button
                  onClick={handleGenerate}
                  disabled={generating || !scriptContent.trim() || !selectedId}
                  className={cn(
                    "w-full h-12 text-base font-medium rounded-xl transition-all duration-300 relative overflow-hidden group",
                    generating 
                      ? "bg-zinc-800 text-zinc-400 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 hover:-translate-y-0.5"
                  )}
                >
                  {generating ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>AI正在分析中...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      <span>开始生成分镜</span>
                      <ChevronRight className="w-4 h-4 opacity-50 group-hover:translate-x-1 transition-transform" />
                    </div>
                  )}
                </Button>
                
                <p className="text-[10px] text-zinc-500 text-center px-4">
                  生成过程约需 10-30 秒，期间请勿关闭窗口
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    
    {/* 新建/编辑模板弹窗 - 使用独立的 Radix Dialog */}
    <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 gap-0 overflow-hidden flex flex-col bg-zinc-950 border-zinc-800">
        <TemplateEditModal
          editingTemplate={editingTemplate}
          formName={formName}
          setFormName={setFormName}
          formDesc={formDesc}
          setFormDesc={setFormDesc}
          formPrompt={formPrompt}
          setFormPrompt={setFormPrompt}
          jsonExampleText={jsonExampleText}
          setJsonExampleText={setJsonExampleText}
          saving={saving}
          onSave={handleSaveTemplate}
          onClose={() => setEditModalOpen(false)}
        />
      </DialogContent>
    </Dialog>
    </>
  );
}

// 模板编辑弹窗内容组件
interface TemplateEditModalProps {
  editingTemplate: UserTemplate | null;
  formName: string;
  setFormName: (v: string) => void;
  formDesc: string;
  setFormDesc: (v: string) => void;
  formPrompt: string;
  setFormPrompt: (v: string) => void;
  jsonExampleText: string;
  setJsonExampleText: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}

function TemplateEditModal({
  editingTemplate,
  formName,
  setFormName,
  formDesc,
  setFormDesc,
  formPrompt,
  setFormPrompt,
  jsonExampleText,
  setJsonExampleText,
  saving,
  onSave,
  onClose
}: TemplateEditModalProps) {
  const promptValidation = useMemo(() => validateUserPrompt(formPrompt), [formPrompt]);
  const hasScriptContent = formPrompt.includes('{scriptContent}');

  const jsonValidation = useMemo(
    () => validateStoryboardJsonExampleText(jsonExampleText),
    [jsonExampleText]
  );

  const canSave = promptValidation.valid && jsonValidation.valid && !saving;

  return (
    <>
      {/* 弹窗头部 */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
            <FileText className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold text-zinc-100">
              {editingTemplate ? '编辑分镜模板' : '新建分镜模板'}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">自定义 AI 生成分镜的提示词模板</DialogDescription>
          </div>
        </div>
      </div>

      {/* 弹窗内容 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* 基本信息 */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-violet-500"></span>
              基本信息
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">模板名称 <span className="text-red-400">*</span></label>
                <Input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="例如：动漫短片10秒分镜、对话驱动模板"
                  className="bg-zinc-900/50 border-zinc-700 focus:ring-violet-500/30 focus:border-violet-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">模板描述</label>
                <Input
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="简要描述这个模板的用途"
                  className="bg-zinc-900/50 border-zinc-700 focus:ring-violet-500/30 focus:border-violet-500/50"
                />
              </div>
            </div>
          </div>

          {/* 提示词内容 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                提示词内容
                <span className="text-xs font-normal text-zinc-500">(可编辑)</span>
              </h4>
              <div className="flex items-center gap-2">
                <code className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[11px] font-mono">
                  {'{scriptContent}'}
                </code>
                {hasScriptContent ? (
                  <span className="flex items-center gap-1 text-emerald-400 text-xs">
                    <Check className="w-3.5 h-3.5" /> 已包含
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-400 text-xs">
                    <AlertCircle className="w-3.5 h-3.5" /> 缺少必需参数
                  </span>
                )}
              </div>
            </div>

            <Textarea
              value={formPrompt}
              onChange={e => setFormPrompt(e.target.value)}
              placeholder="写你的规则/风格/时间轴要求...（必须包含 {scriptContent}）"
              className="bg-zinc-900/50 border-zinc-700 min-h-[220px] resize-none focus:ring-emerald-500/30 focus:border-emerald-500/50 font-mono text-xs leading-relaxed"
            />

            {!promptValidation.valid && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-red-300">{promptValidation.error}</span>
              </div>
            )}
          </div>

          {/* JSON 示例（直接编辑） */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                输出 JSON 示例
                <span className="text-xs font-normal text-zinc-500">(直接编辑，保存时会自动追加到提示词末尾)</span>
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setJsonExampleText(DEFAULT_STORYBOARD_JSON_EXAMPLE_TEXT)}
                disabled={saving}
                className="text-zinc-400 hover:text-zinc-200"
              >
                恢复默认示例
              </Button>
            </div>

            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-200/80 leading-relaxed">
                必须是严格 JSON。顶层仅允许
                <code className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[11px]">{'{"shots":[...]}'}</code>
                ，shots 内每个对象必须包含：
                <code className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[11px]">description</code>,
                <code className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[11px]">dialogue</code>,
                <code className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[11px]">duration</code>,
                <code className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[11px]">firstFramePrompt</code>,
                <code className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[11px]">cameraMovement</code>,
                <code className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[11px]">videoPrompt</code>,
                <code className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[11px]">endState</code>。
                dialogue 建议用 <code className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[11px]">\\n</code> 分行。
              </p>
            </div>

            <Textarea
              value={jsonExampleText}
              onChange={e => setJsonExampleText(e.target.value)}
              placeholder='{"shots":[{"description":"...","dialogue":"...\\n...","duration":10,...}]}'
              className="bg-zinc-900/50 border-zinc-700 min-h-[320px] resize-none focus:ring-amber-500/30 focus:border-amber-500/50 font-mono text-xs leading-relaxed"
            />

            {jsonValidation.errors.map((err, i) => (
              <div key={`json-err-${i}`} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-red-300">{err}</span>
              </div>
            ))}

            {jsonValidation.warnings.map((warn, i) => (
              <div key={`json-warn-${i}`} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-amber-200">{warn}</span>
              </div>
            ))}

            {jsonValidation.valid && jsonValidation.warnings.length === 0 && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-emerald-200">JSON 格式校验通过</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 弹窗底部 */}
      <div className="px-6 py-4 bg-zinc-900/50 border-t border-zinc-800 flex items-center justify-between flex-shrink-0">
        <div className="text-xs text-zinc-500">
          保存后将自动追加 JSON 示例到提示词末尾（用于约束 AI 输出结构）
        </div>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="text-zinc-400 hover:text-zinc-200"
          >
            取消
          </Button>
          <Button
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white px-6"
            onClick={onSave}
            disabled={!canSave}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editingTemplate ? '保存更改' : '创建模板'}
          </Button>
        </div>
      </div>
    </>
  );
}
