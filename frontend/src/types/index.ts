// ============================================================
// 核心类型定义
// ============================================================

/** L2 匹配结果：匹配到的关键词列表和对应的词条描述 */
export interface L2MatchResult {
  keywords: string[];
  descriptions: string[];
}

/** MemoryLoader 接口 — 从 IndexedDB 加载记忆数据 */
export interface MemoryLoader {
  loadL0(savId: string): Promise<string>;
  loadL3(savId: string): Promise<string | null>;
  loadL2(savId: string, userInput: string, recentContext: string): Promise<L2MatchResult>;
  loadL1(savId: string): Promise<string | null>;
  loadHistory(savId: string, m: number): Promise<ChatMessage[]>;
  loadMasterPrompt(): Promise<string>;
  loadL0Player(savId: string): Promise<string | null>;
}

/** 单条对话消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 组装完成的 Prompt 载荷 */
export interface AssembledPrompt {
  system_prompt: string;
  messages: ChatMessage[];
  token_count: number;
  m_value: number;
}

/** Prompt 组装配置 */
export interface PromptConfig {
  max_total_tokens: number;
  max_response_tokens: number;
  model: string;
}

/** StreamClient 构造函数参数 */
export interface StreamClientOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** true=平台代理模式（发 model_id），false=BYOK 直连模式（发 model） */
  isProxy?: boolean;
}

/** SSE 数据块解析结果 */
export interface StreamChunk {
  content: string;
  finish_reason: 'stop' | 'length' | null;
  index: number;
}

/** 流式回调集合 */
export interface StreamCallbacks {
  onToken: (content: string) => void;
  onDone: (fullContent: string) => void;
  onError: (error: Error) => void;
}

/** Token 估算结果 */
export interface TokenEstimate {
  total: number;
  breakdown: {
    system: number;
    l3_plot: number;
    l2_worldbooks: number;
    l1_summary: number;
    history: number;
  };
}

/** Token 预算管家配置 */
export interface TokenBudgetConfig {
  model: string;
  max_total_tokens: number;
  max_response_tokens: number;
  min_history_turns: number;
}

/** 剧本模板 (SCN) */
export interface Scenario {
  scn_id: string;
  author_id: string;
  name: string;
  intro: string;
  main_prompt: string;
  init_worldbooks: WorldBookEntry[];
  init_plot: string;
  version: number;
  tags: string[];
  cover_url?: string;
  created_at: number;
}

/** 世界书词条 */
/** L2 世界书词条（四要素） */
export interface WorldBookEntry {
  /** 词条标准名（如：赵渊、狼骨头） */
  name: string;
  /** 实体类型（如：人物、地点、物品、设定） */
  type: string;
  /** 激活词数组，用于在后续对话中命中该词条 */
  keyword: string[];
  /** 详细的词条内容（AI 演化出的完整履历） */
  description: string;
}

/** 玩家存档 (SAV) */
export interface Save {
  sav_id: string;
  scn_id: string;
  usr_id: string;
  name: string;
  current_turn: number;
  parent_sav_id?: string; // F-26: 父存档 ID，用于多分支存档树
  created_at: number;
  updated_at: number;
}

/** 动态记忆 */
export interface DynamicMemory {
  id: string;
  sav_id: string;
  type: 'L1_Summary' | 'L2_Worldbook' | 'L3_Plot';
  turn: number;
  content: any;
  origin: 'scenario' | 'engine';
  created_at: number;
}

/** 对话记录 */
export interface Conversation {
  id: string;
  sav_id: string;
  turn: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    swipes?: string[];
    currentSwipe?: number;
  };
}

/** 记忆引擎状态 */
export interface EngineStatus {
  l1: 'idle' | 'running';
  l2: 'idle' | 'running';
  l3: 'idle' | 'running';
}

/** 用户信息 */
export interface UserInfo {
  id: string;
  username: string;
  points: number;
  role: 'user' | 'admin';
}

/** 后端 API 响应类型 */
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

/** 登录响应 */
export interface LoginResponse {
  token: string;
  user: UserInfo;
}

/** 后端 Scenario 模型 */
export interface ApiScenario {
  id: string;
  author_id: string;
  title: string;
  intro: string;
  blueprint_data: string;
  cover_url: string;
  downloads: number;
  status: number;
  flag_reason: string;
  edited_by_admin: boolean;
  created_at: number;
  updated_at: number;
}

/** 后端 Save 模型 */
export interface ApiSave {
  id: string;
  user_id: string;
  scenario_id: string;
  save_data: string;
  created_at: number;
  updated_at: number;
}

/** 后端 PlatformModel */
export interface ApiPlatformModel {
  id: string;
  model_id: string;
  display_name: string;
  provider_family: string;
  tags: string;
  is_active: boolean;
  cost_per_turn: number;
  price_coeff: number;
  sort_order: number;
  provider_url: string;
  created_at: number;
}
