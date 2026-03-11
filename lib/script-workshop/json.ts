import type {
  ScriptWorkshopOutlineResult,
  ScriptWorkshopEpisodeScriptResult,
  ScriptWorkshopEpisodeOutline,
} from "./types";

export function extractFirstJsonObject(text: string): string | null {
  if (!text) return null;

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return text.slice(firstBrace, lastBrace + 1);
}

/**
 * 尝试修复常见的 AI 输出 JSON 问题
 */
function tryRepairJson(text: string): string {
  let repaired = text;

  // 0. 统一换行符为 \n
  repaired = repaired.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 1. 移除可能的 markdown 代码块标记
  repaired = repaired.replace(/^```json\s*/i, "").replace(/```\s*$/, "");

  // 2. 修复数组元素之间缺少逗号的问题 (常见于 AI 输出)
  // 匹配: } 后面跟着换行和空格，然后是 { 但中间没有逗号
  repaired = repaired.replace(/}(\s*\n\s*){/g, "},$1{");

  // 3. 修复 ] 后面缺少逗号的问题
  // 匹配: ] 后面跟着换行，然后是 "key": 但中间没有逗号
  repaired = repaired.replace(/](\s*\n\s*)"([^"]+)"\s*:/g, '],$1"$2":');

  // 4. 修复字符串值后缺少逗号的问题
  // 匹配: "value" 后面跟着换行，然后是 "key": 但中间没有逗号
  repaired = repaired.replace(/"(\s*\n\s*)"([^"]+)"\s*:/g, '",$1"$2":');

  // 5. 移除尾随逗号 (在 ] 或 } 之前)
  repaired = repaired.replace(/,\s*([\]}])/g, "$1");

  // 6. 修复数字后缺少逗号的问题
  repaired = repaired.replace(/(\d)(\s*\n\s*)"([^"]+)"\s*:/g, '$1,$2"$3":');

  // 7. 修复 } 后面直接跟 "key": 缺少逗号
  repaired = repaired.replace(/}(\s*\n\s*)"([^"]+)"\s*:/g, '},$1"$2":');

  // 8. 修复字符串中未转义的换行符（在引号内的实际换行转为 \n）
  // 这个比较复杂，用状态机处理
  repaired = repairUnescapedNewlinesInStrings(repaired);

  return repaired;
}

/**
 * 修复字符串内未转义的换行符
 */
function repairUnescapedNewlinesInStrings(text: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      result.push(char);
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result.push(char);
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result.push(char);
      continue;
    }

    if (inString && char === "\n") {
      // 字符串内的换行符转为 \n
      result.push("\\n");
      continue;
    }

    result.push(char);
  }

  return result.join("");
}

export function safeJsonParse<T>(text: string): { ok: true; value: T } | { ok: false; error: string } {
  // 第一次尝试：直接解析
  try {
    const value = JSON.parse(text) as T;
    return { ok: true, value };
  } catch (firstError: any) {
    // 第二次尝试：修复后解析
    try {
      const repaired = tryRepairJson(text);
      const value = JSON.parse(repaired) as T;
      console.log("[safeJsonParse] JSON 修复成功");
      return { ok: true, value };
    } catch (secondError: any) {
      // 两次都失败，返回原始错误
      return { ok: false, error: firstError?.message || "JSON parse failed" };
    }
  }
}

/**
 * Validate outline result structure and return detailed error if invalid
 */
export function validateOutlineResult(
  data: any
): { ok: true; value: ScriptWorkshopOutlineResult } | { ok: false; error: string } {
  if (typeof data !== "object" || data === null) {
    return { ok: false, error: "返回数据不是对象" };
  }

  if (data.type !== "outline") {
    return { ok: false, error: `type 字段必须为 "outline"，实际: ${data.type}` };
  }

  if (!Array.isArray(data.episodes)) {
    return { ok: false, error: "episodes 字段必须是数组" };
  }

  for (let i = 0; i < data.episodes.length; i++) {
    const ep = data.episodes[i];
    if (!ep.index || typeof ep.index !== "number") {
      return { ok: false, error: `episodes[${i}] 缺少有效的 index 字段` };
    }
    if (!ep.title || typeof ep.title !== "string") {
      return { ok: false, error: `episodes[${i}] 缺少有效的 title 字段` };
    }
    if (typeof ep.hook !== "string") {
      return { ok: false, error: `episodes[${i}] 缺少有效的 hook 字段` };
    }
    if (typeof ep.summary !== "string") {
      return { ok: false, error: `episodes[${i}] 缺少有效的 summary 字段` };
    }
    if (typeof ep.cliffhanger !== "string") {
      return { ok: false, error: `episodes[${i}] 缺少有效的 cliffhanger 字段` };
    }
  }

  return { ok: true, value: data as ScriptWorkshopOutlineResult };
}

/**
 * 分集脚本：直接取 AI 原始输出文本，不做 JSON 解析
 */
export function validateEpisodeScriptResult(
  raw: string,
  index: number
): { ok: true; value: ScriptWorkshopEpisodeScriptResult } | { ok: false; error: string } {
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) {
    return { ok: false, error: "AI 返回内容为空" };
  }
  return { ok: true, value: { index, content } };
}
