import type { MemoryLoader, AssembledPrompt, PromptConfig, ChatMessage } from '../types';
import { TokenBudgetManager } from './TokenBudgetManager';

/**
 * PromptAssembler — Prompt 组装管线
 * 从 IndexedDB 拉取数据 → 按注意力权重拼接 → Token 预算检查 → 输出最终 Prompt
 *
 * 装配序列（按注意力权重降序，遵循 Lost in the Middle 原则）：
 *   system_prompt: L-Master → L0 → L3 → L2 → L1
 *   messages:      历史对话 → userInput
 *
 * 权重原理：
 *   1. 【最高 - 头】L0 核心世界观 — AI 角色锚点
 *   2. 【极高 - 颈】L3 剧情轴 — 紧贴 L0，锚定当前时空
 *   3. 【中等 - 胸】L2 世界书 — 专有名词解释
 *   4. 【中等 - 腹】L1 历史快照 — 长线记忆
 *   5. 【高 - 尾】近期对话历史 — 短期上下文
 *   6. 【最高 - 脚】用户最新输入 — 即时响应
 */
export class PromptAssembler {
  constructor(
    private memoryLoader: MemoryLoader,
    private tokenBudget: TokenBudgetManager
  ) {}

  /** 完整组装管线 */
  async assemble(
    savId: string,
    userInput: string,
    config: PromptConfig
  ): Promise<AssembledPrompt> {
    // 1. 先加载 history（其他数据并行加载）
    const history = await this.memoryLoader.loadHistory(savId, 15);
    const recentContext = history.map(m => m.content).join('\n').slice(-500);

    // 2. 并行加载剩余记忆数据（loadL2 需要 recentContext）
    const [l0, l3, l2, l1, masterPrompt, l0Player] = await Promise.all([
      this.memoryLoader.loadL0(savId),
      this.memoryLoader.loadL3(savId),
      this.memoryLoader.loadL2(savId, userInput, recentContext),
      this.memoryLoader.loadL1(savId),
      this.memoryLoader.loadMasterPrompt(),
      this.memoryLoader.loadL0Player(savId),
    ]);

    // ============================================================
    // 3. 按注意力权重拼接 system_prompt
    // 顺序：L-Master → L0 → L0_Player → L3 → L2 → L1
    // 所有记忆层统一放入 system_prompt，利用 Attention 两头强中间弱
    // ============================================================
    const systemParts: string[] = [];

    // 【权重 0 - 绝对置顶】L-Master 站长全局规则
    if (masterPrompt) {
      systemParts.push(`[L-Master: 站长全局规则]\n${masterPrompt}`);
    }

    // 【权重 1 - 最高】L0 核心世界观
    systemParts.push(`[System Role]\n# 核心世界观 (L0)\n${l0}`);

    // 【权重 1.5】L0_Player 玩家实体
    if (l0Player) {
      systemParts.push(`# 玩家实体 (L0_Player)\n${l0Player}`);
    }

    // 【权重 2 - 极高】L3 剧情轴 — 紧贴 L0，锚定当前时空
    if (l3) {
      systemParts.push(`# 当前剧情轴 (L3)\n${l3}`);
    }

    // 【权重 3 - 中等】L2 命中的世界书词条
    if (l2.descriptions.length > 0) {
      systemParts.push(`[Dynamic Context]\n# 被唤醒的世界规则 (L2)\n${l2.descriptions.map(w => `- ${w}`).join('\n')}`);
    }

    // 【权重 4 - 中等】L1 历史快照 — 从 messages 移到 system_prompt 尾部
    if (l1) {
      systemParts.push(`# 前情提要 (L1)\n${l1}`);
    }

    const systemPrompt = systemParts.join('\n\n');

    // ============================================================
    // 4. 构建 messages[] — 仅含历史对话 + userInput
    // L1 已移入 system_prompt，不再作为独立 system message
    // ============================================================
    const messages: ChatMessage[] = [...history];

    // 5. Token 预算检查（只做裁剪，不重新拼接 system_prompt）
    const { assembled, truncatedUserInput } = this.tokenBudget.budgetCheck(
      systemPrompt,
      l3 || '',
      l2.descriptions,
      l1 || '',
      messages,
      userInput
    );

    // 用截断后的 userInput 追加到消息列表
    assembled.messages.push({ role: 'user', content: truncatedUserInput });

    // 重新计算总 token（含 userInput）
    const finalTokens = assembled.messages.reduce(
      (sum, msg) => sum + this.tokenBudget.estimate(msg.content), 0
    ) + this.tokenBudget.estimate(assembled.system_prompt);

    return {
      system_prompt: assembled.system_prompt,
      messages: assembled.messages,
      token_count: finalTokens,
      m_value: assembled.m_value,
    };
  }

  /** 仅 L2 召回（用于 UI 预览高亮） */
  async recallL2(savId: string, userInput: string): Promise<import('../types').L2MatchResult> {
    return this.memoryLoader.loadL2(savId, userInput, '');
  }
}
