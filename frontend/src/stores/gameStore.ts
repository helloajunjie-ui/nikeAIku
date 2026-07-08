// ============================================================
// gameStore — 游戏运行时状态管理
// ============================================================
import { create } from 'zustand';
import type { Scenario, Save, Conversation, DynamicMemory, EngineStatus, ChatMessage } from '../types';

interface GameState {
  // 当前剧本
  currentScenario: Scenario | null;
  // 当前存档
  currentSave: Save | null;
  // 对话历史
  conversations: Conversation[];
  // 引擎状态
  engineStatus: EngineStatus;
  // 是否正在生成 AI 回复
  isGenerating: boolean;
  // 当前回合数
  currentTurn: number;
  // 错误信息
  error: string | null;

  // Actions
  setScenario: (scenario: Scenario | null) => void;
  setSave: (save: Save | null) => void;
  setConversations: (convs: Conversation[]) => void;
  addConversation: (msg: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  setEngineStatus: (status: Partial<EngineStatus>) => void;
  setIsGenerating: (v: boolean) => void;
  setCurrentTurn: (turn: number) => void;
  setError: (err: string | null) => void;
  reset: () => void;
}

const initialEngineStatus: EngineStatus = {
  l1: 'idle',
  l2: 'idle',
  l3: 'idle',
};

export const useGameStore = create<GameState>((set) => ({
  currentScenario: null,
  currentSave: null,
  conversations: [],
  engineStatus: { ...initialEngineStatus },
  isGenerating: false,
  currentTurn: 0,
  error: null,

  setScenario: (scenario) => set({ currentScenario: scenario }),
  setSave: (save) => set({ currentSave: save }),
  setConversations: (convs) => set({ conversations: convs }),
  addConversation: (msg) =>
    set((state) => ({ conversations: [...state.conversations, msg] })),
  updateConversation: (id, updates) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
  setEngineStatus: (status) =>
    set((state) => ({
      engineStatus: { ...state.engineStatus, ...status },
    })),
  setIsGenerating: (v) => set({ isGenerating: v }),
  setCurrentTurn: (turn) => set({ currentTurn: turn }),
  setError: (err) => set({ error: err }),
  reset: () =>
    set({
      currentScenario: null,
      currentSave: null,
      conversations: [],
      engineStatus: { ...initialEngineStatus },
      isGenerating: false,
      currentTurn: 0,
      error: null,
    }),
}));
