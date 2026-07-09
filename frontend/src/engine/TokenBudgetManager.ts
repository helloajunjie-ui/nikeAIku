import type { TokenBudgetConfig, TokenEstimate, AssembledPrompt, ChatMessage } from '../types';

/**
 * TokenBudgetManager — Token 预算管家
 * 纯前端 Token 估算 + 动态 M 值计算 + 预算裁剪
 */
export class TokenBudgetManager {
  private config: TokenBudgetConfig;

  constructor(config: TokenBudgetConfig) {
    this.config = config;
  }

  /** 估算单段文本的 Token 数（字符比例换算） */
  estimate(text: string): number {
    if (!text) return 0;
    // 粗略估算：中文约 1.5 字符/token，英文约 4 字符/token
    let tokens = 0;
    for (const char of text) {
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
        tokens += 1.5;
      } else if (/\s/.test(char)) {
        tokens += 0.25;
      } else {
        tokens += 0.25;
      }
    }
    return Math.ceil(tokens);
  }

  /** 计算可用 M 值（滑动窗口大小） */
  calculateM(
    l0Tokens: number,
    l3Tokens: number,
    l2Tokens: number,
    l1Tokens: number,
    totalHistoryTokens: number
  ): { m: number; trimmed: boolean } {
    const totalBudget = this.config.max_total_tokens - this.config.max_response_tokens;
    const fixedOverhead = l0Tokens + l3Tokens + l2Tokens + l1Tokens;
    const availableForHistory = totalBudget - fixedOverhead;

    if (availableForHistory <= 0) {
      return { m: this.config.min_history_turns, trimmed: true };
    }

    // 假设每回合平均 100 tokens
    const avgTokensPerTurn = 100;
    let m = Math.floor(availableForHistory / avgTokensPerTurn);

    // 兜底
    if (m < this.config.min_history_turns) {
      m = this.config.min_history_turns;
      return { m, trimmed: true };
    }

    return { m, trimmed: false };
  }

  /** 完整预算检查 + 裁剪（含 userInput 硬截断兜底） */
  budgetCheck(
    systemPrompt: string,
    l3: string,
    l2: string[],
    l1: string,
    history: ChatMessage[],
    userInput: string
  ): {
    passed: boolean;
    assembled: AssembledPrompt;
    cuts: string[];
    truncatedUserInput: string;
  } {
    const cuts: string[] = [];
    let currentL1 = l1;
    let currentL2 = [...l2];
    let currentHistory = [...history];
    let currentUserInput = userInput;

    const systemTokens = this.estimate(systemPrompt);
    const l3Tokens = this.estimate(l3);
    let l2Tokens = currentL2.reduce((sum, wb) => sum + this.estimate(wb), 0);
    let l1Tokens = this.estimate(currentL1);
    let historyTokens = currentHistory.reduce((sum, msg) => sum + this.estimate(msg.content), 0);
    let userInputTokens = this.estimate(currentUserInput);

    const totalBudget = this.config.max_total_tokens - this.config.max_response_tokens;
    let totalTokens = systemTokens + l2Tokens + l1Tokens + historyTokens + userInputTokens;

    // 裁剪 L1（硬截断至 150 字符）
    if (totalTokens > totalBudget && l1Tokens > 150) {
    	currentL1 = currentL1.slice(0, 150);
    	l1Tokens = this.estimate(currentL1);
    	totalTokens = systemTokens + l2Tokens + l1Tokens + historyTokens + userInputTokens;
    	cuts.push('L1 总结已截断至 150 字符');
    }

    // 裁剪 L2（丢弃匹配度最低的词条）
    if (totalTokens > totalBudget && currentL2.length > 0) {
      const removed = currentL2.pop();
      if (removed) {
        l2Tokens = currentL2.reduce((sum, wb) => sum + this.estimate(wb), 0);
        totalTokens = systemTokens + l2Tokens + l1Tokens + historyTokens + userInputTokens;
        cuts.push(`L2 词条已丢弃: ${removed.slice(0, 20)}...`);
      }
    }

    // 裁剪历史对话
    if (totalTokens > totalBudget && currentHistory.length > this.config.min_history_turns) {
      const excess = currentHistory.length - this.config.min_history_turns;
      currentHistory = currentHistory.slice(excess);
      historyTokens = currentHistory.reduce((sum, msg) => sum + this.estimate(msg.content), 0);
      totalTokens = systemTokens + l2Tokens + l1Tokens + historyTokens + userInputTokens;
      cuts.push(`历史对话已裁剪至 ${currentHistory.length} 回合`);
    }

    // === 最后兜底：硬截断 userInput ===
    if (totalTokens > totalBudget && userInputTokens > 50) {
      while (totalTokens > totalBudget && currentUserInput.length > 20) {
        currentUserInput = currentUserInput.slice(0, Math.floor(currentUserInput.length * 0.7));
        userInputTokens = this.estimate(currentUserInput);
        totalTokens = systemTokens + l2Tokens + l1Tokens + historyTokens + userInputTokens;
      }
      cuts.push(`用户输入已截断至 ${currentUserInput.length} 字符（约 ${userInputTokens} token）`);
    }

    // 直接使用传入的 systemPrompt（不再重新拼接）
    // L1 已由 PromptAssembler 嵌入 systemPrompt，此处不再重复注入
    const messages: ChatMessage[] = [...currentHistory];

    return {
      passed: totalTokens <= totalBudget,
      assembled: {
        system_prompt: systemPrompt,
        messages,
        token_count: totalTokens,
        m_value: currentHistory.length,
      },
      cuts,
      truncatedUserInput: currentUserInput,
    };
  }

  /** 更新配置 */
  updateConfig(config: Partial<TokenBudgetConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
