// ============================================================
// MemoryLoaderService — 真实 MemoryLoader 实现
// 接入 IndexedDB + AI 记忆处理（L1/L2/L3 全部使用 AI 模型）
// L1/L2/L3 顺序执行，利用 AI 空闲时间进行后台记忆运算
// ============================================================
import { wrap, type Remote } from 'comlink';
import type { MemoryLoader, ChatMessage, DynamicMemory, WorldBookEntry } from '../types';
import * as db from '../db';
import type { MemoryEngine } from '../worker/memoryEngine';

/** AI 模型调用函数签名：输入 prompt，返回 AI 文本回复 */
export type ModelCaller = (systemPrompt: string, userContent: string) => Promise<string>;

/** 给 modelCaller 加超时包装，防止单次 AI 调用卡住整个 afterResponse queue */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`AI 调用超时 (${ms}ms)`)), ms)
    ),
  ]);
}

// ============================================================
// 防弹 JSON 提取器 — 用于 L2 AI 返回结果解析
// 大模型经常在 JSON 外包一层 Markdown 代码块或废话，
// 直接 JSON.parse() 会抛出 SyntaxError 导致整个管线崩溃。
// ============================================================
/**
 * 防御性 keyword 提取：兼容新旧两种字段名（keyword / keywords）
 * 旧数据：{ keyword: string[] }
 * 新数据：{ keywords: string[] }（AI 输出习惯）
 * 兜底：返回空数组，绝不崩溃
 */
function extractKeywords(wb: Record<string, unknown>): string[] {
  // 尝试 keywords（新数据，AI 输出习惯）
  const kws = (wb as any).keywords;
  if (Array.isArray(kws) && kws.length > 0) return kws;
  // 尝试 keyword（旧数据，接口定义）
  const kw = (wb as any).keyword;
  if (Array.isArray(kw) && kw.length > 0) return kw;
  // 兜底：用 name 作为唯一激活词
  const name = (wb as any).name;
  if (typeof name === 'string' && name) return [name];
  return [];
}

function safeParseL2JSON(rawText: string): any[] {
  try {
    // Step 1: 剥离 Markdown 代码块标记（```json ... ``` 或 ``` ... ```）
    let cleaned = rawText.replace(/```[\s\S]*?\n/, '').replace(/\n```/g, '').trim();
    // Step 2: 如果剥离后仍不是以 [ 开头，尝试提取第一个 [ 到最后一个 ]
    if (!cleaned.startsWith('[')) {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) return [];
      cleaned = match[0];
    }
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn('[L2] 模型返回非标准 JSON，已安全降级为空数组:', rawText.slice(0, 200));
    return []; // 宁可漏掉，绝不报错崩溃
  }
}

/**
 * 真实 MemoryLoader — 从 IndexedDB 读取数据
 * L1/L2/L3 全部通过 AI 模型生成语义级记忆，顺序执行
 * Worker 仅作为 AI 调用失败的 fallback
 */
export class MemoryLoaderService implements MemoryLoader {
  private worker: Remote<MemoryEngine> | null = null;
  private workerInitPromise: Promise<void> | null = null;
  /** AI 模型调用器（由 usePlayEngine 注入） */
  private modelCaller: ModelCaller | null = null;
  /** Promise chain queue：保证 afterResponse 顺序执行，防止竞态条件 */
  private updateQueue: Promise<void> = Promise.resolve();

  /**
   * 注入 AI 模型调用函数
   * 由 usePlayEngine 在获取到模型配置后调用
   */
  setModelCaller(caller: ModelCaller): void {
    this.modelCaller = caller;
  }

  private async getWorker(): Promise<Remote<MemoryEngine>> {
    if (!this.worker) {
      if (!this.workerInitPromise) {
        this.workerInitPromise = this.initWorker();
      }
      await this.workerInitPromise;
    }
    return this.worker!;
  }

  private async initWorker(): Promise<void> {
    const WorkerFactory = await import('../worker/memoryEngine?worker');
    const instance = new WorkerFactory.default();
    this.worker = wrap<MemoryEngine>(instance);
  }

  async loadL0(savId: string): Promise<string> {
    const save = await db.getSave(savId);
    if (!save) return '';
    const scenario = await db.getScenario(save.scn_id);
    return scenario?.main_prompt || '';
  }

  async loadL0Player(savId: string): Promise<string | null> {
    const playerDesc = await db.getConfig(`l0_player_${savId}`);
    return playerDesc || null;
  }

  async loadL3(savId: string): Promise<string | null> {
    const mem = await db.getLatestMemory(savId, 'L3_Plot');
    return mem?.content as string | null;
  }

  async loadL2(savId: string, userInput: string, recentContext: string): Promise<{ keywords: string[]; descriptions: string[] }> {
    const memories = await db.getMemoriesByType(savId, 'L2_Worldbook');
    const worldbooks: WorldBookEntry[] = memories.map((m) => m.content as WorldBookEntry);
    if (worldbooks.length === 0) return { keywords: [], descriptions: [] };

    // 优先使用 AI 语义匹配
    if (this.modelCaller) {
      try {
        const wbText = worldbooks
          .map((wb, i) => `[词条${i + 1}] 关键词: ${extractKeywords(wb as unknown as Record<string, unknown>).join(', ')} | 描述: ${wb.description}`)
          .join('\n');
        const result = await this.modelCaller(
          '你是一个世界书匹配引擎。根据用户输入和上下文，从以下世界书词条中找出语义相关的词条。\n' +
          '如果某个已有词条在上下文中展现了新的经历、性格变化或隐藏秘密，请在 description 中追加 [经历更新] 标记。\n' +
          '只返回 JSON 数组，格式: [{"keywords":["关键词1"],"description":"描述文本"}]\n' +
          '如果没有匹配的词条，返回空数组 []。不要输出任何其他内容。',
          `用户输入: ${userInput}\n上下文: ${recentContext}\n\n世界书词条:\n${wbText}`
        );
        const parsed = safeParseL2JSON(result);
        if (parsed.length > 0) {
          const keywords: string[] = [];
          const descriptions: string[] = [];
          for (const item of parsed) {
            if (item.keywords && item.description) {
              keywords.push(...(Array.isArray(item.keywords) ? item.keywords : [item.keywords]));
              descriptions.push(item.description);
            }
          }
          return { keywords, descriptions };
        }
      } catch (err) {
        console.warn('[MemoryEngine] L2 AI 匹配失败，回退到本地算法:', err);
      }
    }

    // fallback: Worker 本地关键词匹配
    const worker = await this.getWorker();
    return worker.computeL2(userInput, worldbooks, recentContext);
  }

  async loadL1(savId: string): Promise<string | null> {
    const mem = await db.getLatestMemory(savId, 'L1_Summary');
    return mem?.content as string | null;
  }

  async loadHistory(savId: string, m: number): Promise<ChatMessage[]> {
    const conversations = await db.getConversations(savId);
    const turnMap = new Map<number, ChatMessage>();
    for (const c of conversations) {
      turnMap.set(c.turn, { role: c.role as 'user' | 'assistant' | 'system', content: c.content });
    }
    const turns = Array.from(turnMap.entries()).sort((a, b) => b[0] - a[0]);
    const recent = turns.slice(0, m).reverse();
    return recent.map(([, msg]) => msg);
  }

  async loadMasterPrompt(): Promise<string> {
    const prompt = await db.getConfig('master_prompt');
    return prompt || '';
  }

  /**
   * AI 回复完成后，异步触发记忆引擎计算
   * L1/L2/L3 顺序执行，利用 AI 空闲时间进行后台记忆运算
   * 顺序：L2 → L1 → L3（按回合触发条件判断）
   * Worker 仅作为 AI 调用失败的 fallback
   *
   * 使用 Promise chain queue 保证多个快速连续调用不会产生竞态条件
   */
  async afterResponse(savId: string, turn: number): Promise<void> {
    this.updateQueue = this.updateQueue.then(async () => {
      const history = await this.loadHistory(savId, 15);
      const currentPlot = await this.loadL3(savId);

      const memories = await db.getMemoriesByType(savId, 'L2_Worldbook');
      const worldbooks: WorldBookEntry[] = memories.map((m) => m.content as WorldBookEntry);

      // ============================================================
      // L2: 每 3 回合 — 动态实体演化（Dynamic Entity Evolution）
      // 核心哲学：AI 全量重写 + 无脑全量覆盖
      // 1. 筛选最近对话中已出场的旧词条作为"已有词条档案"喂给 AI
      // 2. AI 作为"世界设定主编"，融合新旧信息，全量重写每个实体的描述
      // 3. 落库：不管新词条旧词条，直接 putMemory 全量覆盖
      //    把排版和归纳的任务 100% 交给 AI，代码不做任何字符串拼接
      //
      // 注意：worldbooks.length > 0 不是触发条件！
      // 如果 worldbooks 为空（首次触发），AI 会从对话中提取全新实体。
      // 如果加了 worldbooks.length > 0，L2 永远无法自举（先有鸡还是先有蛋）。
      //
      // 每个词条包含: name(标准名), type(类型), keywords(激活词数组), content(详细履历)
      // ============================================================
      if (turn > 0 && turn % 3 === 0 && this.modelCaller) {
        try {
          const dialogueText = history
            .map((m) => `${m.role === 'user' ? '玩家' : 'AI'}: ${m.content}`)
            .join('\n');

          // 筛选最近对话中已出场的旧词条（关键词出现在对话文本中的词条）
          const dialogueLower = dialogueText.toLowerCase();
          const activeOldL2 = worldbooks.filter((wb) => {
            const kws = extractKeywords(wb as unknown as Record<string, unknown>);
            return kws.some((kw) => dialogueLower.includes(kw.toLowerCase().trim()));
          });

          // 构建 AI Prompt：只传"已有词条档案"（活跃词条）+ 最近对话
          const activeWbText = activeOldL2
            .map((wb, i) => {
              const kws = extractKeywords(wb as unknown as Record<string, unknown>);
              return `[词条${i + 1}] 名称: ${wb.name} | 类型: ${wb.type} | ` +
                `激活词: ${kws.join(', ')} | 当前描述: ${wb.description}`;
            })
            .join('\n');

          const result = await withTimeout(this.modelCaller(
            '你是一个拥有上帝视角的「世界设定主编」。请分析最近的对话，提取或更新高价值的剧情实体。\n' +
            '【提取标准】：重点关注人物、地点、重要道具、特殊设定。\n' +
            '【输出格式】：必须返回一个严格的 JSON 数组。每个对象必须包含以下 4 个字段：\n' +
            '1. "name": 词条标准名（如：赵渊、狼骨头）\n' +
            '2. "type": 实体类型（如：人物、地点、物品、设定）\n' +
            '3. "keywords": 激活词数组，用于在后续对话中命中该词条（如：["阿沅", "小女孩", "丫头"]）\n' +
            '4. "content": 详细的词条内容。如果是已有词条，请融合新旧信息全面重写，交代清楚其背景、状态和经历。字数控制在 500 字以内。\n' +
            '只返回 JSON 数组，不要任何 Markdown 标记！\n' +
            '示例：[{"name":"阿沅","type":"人物","keywords":["阿沅","小女孩","丫头"],"content":"在坞堡外被赵渊救下的流民女孩..."}]',
            `【已有词条档案】\n${activeWbText || '（无活跃词条）'}\n\n【最近对话】\n${dialogueText}`
          ), 30000);
          const parsed = safeParseL2JSON(result);
          if (parsed.length > 0) {
            // 构建已有词条的快速查找 Map（keyword → 对应的 DynamicMemory）
            const existingMemMap = new Map<string, typeof memories[0]>();
            for (const mem of memories) {
              const content = mem.content as WorldBookEntry;
              const kws = extractKeywords(content as unknown as Record<string, unknown>);
              for (const kw of kws) {
                existingMemMap.set(kw.toLowerCase().trim(), mem);
              }
            }

            for (const item of parsed) {
              // 兼容大模型的各种取名习惯
              const name = item.name || item.keyword || item.title;
              const type = item.type || '未知';
              const content = item.content || item.description || item.desc;
              if (!name || !content) continue;

              // 强制转换为激活词数组
              let kws: string[] = [];
              if (Array.isArray(item.keywords)) {
                kws = item.keywords;
              } else if (typeof item.keywords === 'string') {
                kws = item.keywords.split(/[,，、]/).map((k: string) => k.trim()).filter(Boolean);
              } else {
                kws = [name]; // 兜底：如果没有激活词，就用名字本身
              }
              if (kws.length === 0) kws = [name];

              // 检查第一个 keyword 是否已存在
              const kwKey = kws[0].toLowerCase().trim();
              const existingMem = existingMemMap.get(kwKey);

              // 构建四要素 WorldBookEntry
              const wbContent: WorldBookEntry = {
                name,
                type,
                keyword: kws,
                description: content.trim(),
              };

              if (existingMem) {
                // 已有实体 → AI 全量重写 → 全量覆盖
                await db.putMemory({
                  ...existingMem,
                  content: wbContent,
                  created_at: Date.now(),
                });
              } else {
                // 新实体 → 直接插入
                await db.putMemory({
                  id: `mem-${savId}-L2-${turn}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  sav_id: savId,
                  type: 'L2_Worldbook',
                  turn,
                  content: wbContent,
                  origin: 'engine',
                  created_at: Date.now(),
                });
              }
            }
          }
        } catch (err) {
          console.warn('[MemoryEngine] L2 AI 匹配失败，跳过:', err);
        }
      }

      // ============================================================
      // L1: 每 5 回合 — AI 上下文压缩（≤300 词）
      // ============================================================
      if (turn > 0 && turn % 5 === 0 && this.modelCaller) {
        try {
          const dialogueText = history
            .map((m) => `${m.role === 'user' ? '玩家' : 'AI'}: ${m.content}`)
            .join('\n');
          const l1 = await withTimeout(this.modelCaller(
            '你是一个对话摘要助手。请用一段简洁的中文总结以下对话中发生的关键事件、玩家决策和剧情进展。输出限制在 300 字以内。只输出总结内容，不要额外解释。',
            dialogueText
          ), 30000);
          if (l1 && l1.trim()) {
            await db.putMemory({
              id: `mem-${savId}-L1-${turn}-${Date.now()}`,
              sav_id: savId,
              type: 'L1_Summary',
              turn,
              content: l1.trim(),
              origin: 'engine',
              created_at: Date.now(),
            });
          }
        } catch (err) {
          console.warn('[MemoryEngine] L1 AI 调用失败，跳过:', err);
        }
      }

      // ============================================================
      // L3: 每 10 回合 — AI 剧情轴更新
      // 输入：当前 L3 主线 + 最新的 L1 总结（非原始对话）
      // ============================================================
      if (turn > 0 && turn % 10 === 0 && this.modelCaller) {
        try {
          // 取最新的 L1 总结作为 L3 的上下文输入
          const latestL1 = await this.loadL1(savId);
          const l3 = await withTimeout(this.modelCaller(
            `你是一个剧情追踪助手。当前剧情轴：${currentPlot || '（无）'}\n` +
            `最新的对话摘要：${latestL1 || '（无）'}\n` +
            '请根据以上信息，用一段简洁的中文更新剧情进展。保留之前的重要信息，只追加新进展。' +
            '只输出更新后的剧情轴内容，不要额外解释。',
            '根据当前剧情轴和最新的对话摘要，更新剧情进展。'
          ), 30000);
          if (l3 && l3.trim()) {
            // L3 落库：绝对覆盖（Overwrite）
            // 使用固定 ID `l3-${savId}`，每次 putMemory 覆盖同一条记录
            // 库里永远只有 1 条活跃的 L3
            await db.putMemory({
              id: `l3-${savId}`,
              sav_id: savId,
              type: 'L3_Plot',
              turn,
              content: l3.trim(),
              origin: 'engine',
              created_at: Date.now(),
            });
          }
        } catch (err) {
          console.warn('[MemoryEngine] L3 AI 调用失败，跳过:', err);
        }
      }
    }).catch((err) => {
      console.error('[MemoryLock] 记忆处理失败:', err);
    });
    return this.updateQueue;
  }
}
