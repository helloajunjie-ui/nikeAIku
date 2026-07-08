// ============================================================
// MemoryEngine — Web Worker 记忆引擎
// 在独立线程中运行 L2 关键词匹配
// L1/L3 由主线程 AI 模型调用处理，Worker 仅保留 L2 fallback
// 通过 Comlink 暴露给主线程
// ============================================================

import { expose } from 'comlink';
import type { ChatMessage } from '../types';

/**
 * L1 总结生成（fallback）— 当 AI 调用失败时使用
 * 将历史对话压缩为一段摘要
 */
function generateL1Summary(history: ChatMessage[], maxLength: number = 500): string {
  if (history.length === 0) return '';

  const recent = history.slice(-10);
  const parts: string[] = [];

  for (const msg of recent) {
    const content = msg.content.trim();
    if (!content) continue;
    const truncated = content.length > 200 ? content.slice(0, 200) + '...' : content;
    const prefix = msg.role === 'user' ? '玩家' : 'AI';
    parts.push(`${prefix}: ${truncated}`);
  }

  let summary = parts.join('\n');
  if (summary.length > maxLength) {
    summary = summary.slice(0, maxLength) + '...';
  }
  return summary;
}

/**
 * L2 世界书词条匹配 — 基于关键词触发
 * 返回匹配到的关键词列表和词条描述列表
 */
/**
 * 防御性 keyword 提取（Worker 版 — 无外部依赖）
 * 兼容新旧两种字段名（keyword / keywords）
 */
function extractKeywordsWorker(wb: Record<string, unknown>): string[] {
  const kws = wb.keywords;
  if (Array.isArray(kws) && kws.length > 0) return kws as string[];
  const kw = wb.keyword;
  if (Array.isArray(kw) && kw.length > 0) return kw as string[];
  const name = wb.name;
  if (typeof name === 'string' && name) return [name];
  return [];
}

function matchL2Worldbooks(
  userInput: string,
  worldbooks: Array<{ keyword: string[]; description: string }>,
  recentContext: string
): { keywords: string[]; descriptions: string[] } {
  const combined = `${userInput} ${recentContext}`.toLowerCase();
  const matchedKeywords: string[] = [];
  const matchedDescriptions: string[] = [];

  for (const wb of worldbooks) {
    const kws = extractKeywordsWorker(wb as unknown as Record<string, unknown>);
    for (const kw of kws) {
      if (combined.includes(kw.toLowerCase())) {
        matchedKeywords.push(kw);
        matchedDescriptions.push(wb.description);
        break;
      }
    }
  }

  return { keywords: matchedKeywords, descriptions: matchedDescriptions };
}

/**
 * L3 剧情轴更新（fallback）— 当 AI 调用失败时使用
 */
function updateL3Plot(
  currentPlot: string | null,
  recentHistory: ChatMessage[]
): string {
  if (recentHistory.length === 0) return currentPlot || '';

  const lastTurns = recentHistory.slice(-4);
  const dialogue = lastTurns
    .map((m) => `${m.role === 'user' ? '玩家' : 'AI'}: ${m.content.slice(0, 100)}`)
    .join('\n');

  const newPlot = currentPlot
    ? `${currentPlot}\n[进展] ${dialogue}`
    : `[初始] ${dialogue}`;

  if (newPlot.length > 1000) {
    return '...' + newPlot.slice(-997);
  }
  return newPlot;
}

// ==================== Comlink 暴露的 API ====================

const memoryEngine = {
  /**
   * 计算 L1 总结（fallback）
   */
  computeL1(history: ChatMessage[], maxLength?: number): string {
    return generateL1Summary(history, maxLength);
  },

  /**
   * 匹配 L2 世界书词条（主路径）
   */
  computeL2(
    userInput: string,
    worldbooks: Array<{ keyword: string[]; description: string }>,
    recentContext: string
  ): { keywords: string[]; descriptions: string[] } {
    return matchL2Worldbooks(userInput, worldbooks, recentContext);
  },

  /**
   * 更新 L3 剧情轴（fallback）
   */
  computeL3(
    currentPlot: string | null,
    recentHistory: ChatMessage[]
  ): string {
    return updateL3Plot(currentPlot, recentHistory);
  },
};

export type MemoryEngine = typeof memoryEngine;

expose(memoryEngine);
