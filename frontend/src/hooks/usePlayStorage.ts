// ============================================================
// usePlayStorage — 存储层 Hook
// 职责：只跟数据打交道（IndexedDB + 云端同步）
// 不关心大模型，不关心打字输入
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import * as api from '../utils/api';
import * as db from '../db';
import type { Conversation, DynamicMemory, Save, Scenario } from '../types';

// -----------------------------------------------------------
// 返回类型
// -----------------------------------------------------------
export interface PlayStorage {
  // 状态（来自 gameStore + 本地）
  conversations: Conversation[];
  currentSave: Save | null;
  currentScenario: Scenario | null;
  currentTurn: number;
  engineStatus: { l1: string; l2: string; l3: string };
  isGenerating: boolean;

  // ref 快照（供外部闭包安全读取最新值）
  currentSaveRef: React.MutableRefObject<Save | null>;
  currentScenarioRef: React.MutableRefObject<Scenario | null>;
  conversationsRef: React.MutableRefObject<Conversation[]>;
  currentTurnRef: React.MutableRefObject<number>;

  // 本地状态
  saveList: api.SaveItem[];
  showSaveSwitcher: boolean;
  worldbookEntries: DynamicMemory[];
  editingWbId: string | null;
  editingWbContent: string;
  greetingSentRef: React.MutableRefObject<boolean>;
  lastSyncTurnRef: React.MutableRefObject<number>;
  isRegenerateRef: React.MutableRefObject<boolean>;

  // setter
  setSaveList: (v: api.SaveItem[]) => void;
  setShowSaveSwitcher: (v: boolean) => void;
  setWorldbookEntries: (v: DynamicMemory[]) => void;
  setEditingWbId: (v: string | null) => void;
  setEditingWbContent: (v: string) => void;

  // 存储操作
  hydrate: () => Promise<void>;
  autoSync: () => Promise<void>;
  appendUserMessage: (text: string, savId: string) => Conversation;
  appendAssistantMessage: (content: string, savId: string, turn: number) => Conversation;
  updateAssistantMessage: (existingId: string, content: string, turn: number) => void;
  deleteConversationsFrom: (msgId: string) => { savId: string; turn: number; role: string } | null;
  forkSave: () => Promise<void>;
  switchSave: (saveId: string) => Promise<void>;
  resetMemory: () => Promise<void>;
  openWorldbook: () => Promise<DynamicMemory[]>;
  saveWbEntry: (entryId: string, content: string) => Promise<void>;
  deleteWbEntry: (entryId: string) => Promise<void>;
  openSaveSwitcher: () => Promise<void>;
  incrementTurn: () => number;
  setCurrentTurnDirect: (turn: number) => void;
  setConversationsDirect: (convs: Conversation[]) => void;
  resetAll: () => void;
}

export function usePlayStorage(): PlayStorage {
  const { isAuthenticated } = useAuthStore();
  const { addNotification } = useUIStore();
  const {
    currentSave, currentScenario, conversations, isGenerating,
    currentTurn, engineStatus,
    setSave, setScenario, setConversations, addConversation,
    updateConversation, setCurrentTurn, setEngineStatus,
    setIsGenerating, reset,
  } = useGameStore();

  // ---- ref 快照（闭包安全） ----
  const currentSaveRef = useRef(currentSave);
  const currentScenarioRef = useRef(currentScenario);
  const conversationsRef = useRef(conversations);
  const currentTurnRef = useRef(currentTurn);
  currentSaveRef.current = currentSave;
  currentScenarioRef.current = currentScenario;
  conversationsRef.current = conversations;
  currentTurnRef.current = currentTurn;

  // ---- 本地状态 ----
  const [saveList, setSaveList] = useState<api.SaveItem[]>([]);
  const [showSaveSwitcher, setShowSaveSwitcher] = useState(false);
  const [worldbookEntries, setWorldbookEntries] = useState<DynamicMemory[]>([]);
  const [editingWbId, setEditingWbId] = useState<string | null>(null);
  const [editingWbContent, setEditingWbContent] = useState('');
  const greetingSentRef = useRef(false);
  const lastSyncTurnRef = useRef(0);
  const isRegenerateRef = useRef(false);

  // ============================================================
  // autoSync — 将当前状态同步到后端
  // ============================================================
  const autoSync = useCallback(async () => {
    const save = currentSaveRef.current;
    const scenario = currentScenarioRef.current;
    const convs = conversationsRef.current;
    const turn = currentTurnRef.current;
    if (!save || !scenario) return;

    // 打包 AI 潜意识（L1/L2/L3 动态记忆），实现跨设备灵魂转移
    let dynamic_memories: { l1: DynamicMemory[]; l2: DynamicMemory[]; l3: DynamicMemory[] } | undefined;
    try {
      const [l1, l2, l3] = await Promise.all([
        db.getMemoriesByType(save.sav_id, 'L1_Summary'),
        db.getMemoriesByType(save.sav_id, 'L2_Worldbook'),
        db.getMemoriesByType(save.sav_id, 'L3_Plot'),
      ]);
      dynamic_memories = { l1, l2, l3 };
    } catch {
      // 记忆读取失败不影响主同步流程
    }

    const saveData = JSON.stringify({
      scenario,
      conversations: convs,
      currentTurn: turn,
      ...(dynamic_memories ? { dynamic_memories } : {}),
    });

    try {
      await api.updateSave(save.sav_id, {
        scenario_id: save.scn_id,
        name: save.name,
        scenario_title: scenario.name,
        save_data: saveData,
      });
    } catch {
      // PUT 失败（可能后端存档已被删除），尝试创建
      try {
        await api.uploadSave({
          scenario_id: save.scn_id,
          name: save.name,
          scenario_title: scenario.name,
          save_data: saveData,
        });
      } catch (err) {
        console.warn('[PlayStorage] 自动同步失败:', err);
      }
    }
  }, []);

  // ============================================================
  // hydrate — 从 IndexedDB / 云端恢复完整游戏状态
  // ============================================================
  const hydrate = useCallback(async () => {
    let savId: string | null = currentSaveRef.current?.sav_id || null;

    // 场景 2: 页面刷新后 gameStore 丢失，从 localStorage 恢复
    if (!savId) {
      const stored = localStorage.getItem('niko_lastSaveId');
      if (stored) {
        const localSave = await db.getSave(stored);
        if (localSave) {
          savId = localSave.sav_id;
          setSave(localSave);
          const localScenario = await db.getScenario(localSave.scn_id);
          if (localScenario) {
            setScenario(localScenario);
          }
        } else {
          // 场景 3: 尝试从云端反向拉取
          if (isAuthenticated) {
            try {
              const cloudSave = await api.getSave(stored);
              const localSaveRecord: Save = {
                sav_id: cloudSave.id,
                scn_id: cloudSave.scenario_id,
                usr_id: cloudSave.user_id,
                name: cloudSave.name || `存档 ${cloudSave.id.slice(0, 8)}`,
                current_turn: 0,
                parent_sav_id: cloudSave.parent_sav_id,
                created_at: cloudSave.created_at,
                updated_at: cloudSave.updated_at,
              };
              await db.putSave(localSaveRecord);
              setSave(localSaveRecord);

              if (cloudSave.save_data) {
                try {
                  const parsed = JSON.parse(cloudSave.save_data);
                  if (parsed.conversations && Array.isArray(parsed.conversations)) {
                    const convs = parsed.conversations as Conversation[];
                    for (const c of convs) {
                      await db.putConversation(c);
                    }
                    convs.sort((a, b) => a.turn - b.turn);
                    setConversations(convs);
                    const maxTurn = convs.reduce((max, c) => Math.max(max, c.turn), 0);
                    setCurrentTurn(maxTurn);
                    currentTurnRef.current = maxTurn;
                    greetingSentRef.current = true;
                  }
                  if (parsed.scenario) {
                    await db.putScenario(parsed.scenario);
                    setScenario(parsed.scenario);
                  }
                  // 恢复 AI 灵魂（L1/L2/L3 动态记忆）
                  if (parsed.dynamic_memories) {
                    const { l1 = [], l2 = [], l3 = [] } = parsed.dynamic_memories as {
                      l1: DynamicMemory[]; l2: DynamicMemory[]; l3: DynamicMemory[];
                    };
                    const allMemories = [...l1, ...l2, ...l3];
                    if (allMemories.length > 0) {
                      const idb = await db.getDB();
                      for (const type of ['L1_Summary', 'L2_Worldbook', 'L3_Plot'] as const) {
                        const existing = await db.getMemoriesByType(stored, type);
                        for (const mem of existing) {
                          await idb.delete('dynamic_memories', mem.id);
                        }
                      }
                      for (const mem of allMemories) {
                        await db.putMemory(mem);
                      }
                    }
                  }
                } catch { /* parse error */ }
              }
              savId = cloudSave.id;
            } catch {
              localStorage.removeItem('niko_lastSaveId');
            }
          } else {
            localStorage.removeItem('niko_lastSaveId');
          }
        }
      }
    }

    if (!savId) return;
    if (conversationsRef.current.length > 0) return;
    if (greetingSentRef.current) return;

    // 从 IndexedDB 恢复对话
    const existing = await db.getConversations(savId);
    if (existing && existing.length > 0) {
      existing.sort((a, b) => a.turn - b.turn);
      setConversations(existing);
      const maxTurn = existing.reduce((max, c) => Math.max(max, c.turn), 0);
      setCurrentTurn(maxTurn);
      currentTurnRef.current = maxTurn;
      greetingSentRef.current = true;
    }
  }, [isAuthenticated, setSave, setScenario, setConversations, setCurrentTurn]);

  // ============================================================
  // appendUserMessage — 创建并持久化用户消息
  // ============================================================
  const appendUserMessage = useCallback((text: string, savId: string): Conversation => {
    const turn = currentTurnRef.current + 1;
    setCurrentTurn(turn);
    currentTurnRef.current = turn;

    const msg: Conversation = {
      id: `msg-${Date.now()}-user`,
      sav_id: savId,
      turn,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    addConversation(msg);
    db.putConversation(msg).catch((err) =>
      console.warn('[PlayStorage] 持久化用户消息失败:', err)
    );
    return msg;
  }, [addConversation, setCurrentTurn]);

  // ============================================================
  // appendAssistantMessage — 创建并持久化 AI 回复
  // ============================================================
  const appendAssistantMessage = useCallback((content: string, savId: string, turn: number): Conversation => {
    const msg: Conversation = {
      id: `msg-${Date.now()}-assistant`,
      sav_id: savId,
      turn,
      role: 'assistant',
      content,
      timestamp: Date.now(),
      metadata: { swipes: [content], currentSwipe: 0 },
    };
    addConversation(msg);
    db.putConversation(msg).catch((err) =>
      console.warn('[PlayStorage] 持久化 AI 回复失败:', err)
    );
    return msg;
  }, [addConversation]);

  // ============================================================
  // updateAssistantMessage — 更新已有 AI 回复（swipe 追加）
  // ============================================================
  const updateAssistantMessage = useCallback((existingId: string, content: string, turn: number) => {
    const convs = conversationsRef.current;
    const existing = convs.find((c) => c.id === existingId);
    if (!existing) return;
    const swipes = existing.metadata?.swipes || [existing.content];
    swipes.push(content);
    updateConversation(existingId, {
      content,
      metadata: { ...existing.metadata, swipes, currentSwipe: swipes.length - 1 },
    });
    const updated: Conversation = {
      ...existing,
      content,
      metadata: { ...existing.metadata, swipes, currentSwipe: swipes.length - 1 },
    };
    db.putConversation(updated).catch((err) =>
      console.warn('[PlayStorage] 持久化 swipe 失败:', err)
    );
  }, [updateConversation]);

  // ============================================================
  // deleteConversationsFrom — 从指定消息删除之后的所有对话
  // ============================================================
  const deleteConversationsFrom = useCallback((msgId: string): { savId: string; turn: number; role: string } | null => {
    const convs = conversationsRef.current;
    const idx = convs.findIndex((c) => c.id === msgId);
    if (idx === -1) return null;
    const savId = currentSaveRef.current?.sav_id || 'local';
    const targetMsg = convs[idx];
    const turn = targetMsg.turn;
    const remaining = convs.slice(0, idx);
    setConversations(remaining);
    conversationsRef.current = remaining;
    db.deleteConversationsAfterTurn(savId, turn).catch((err) =>
      console.warn('[PlayStorage] 删除对话失败:', err)
    );
    return { savId, turn, role: targetMsg.role };
  }, [setConversations]);

  // ============================================================
  // forkSave — 创建分支存档
  // ============================================================
  const forkSave = useCallback(async () => {
    const save = currentSaveRef.current;
    const scenario = currentScenarioRef.current;
    const convs = conversationsRef.current;
    const turn = currentTurnRef.current;
    if (!save || !isAuthenticated) return;

    const name = window.prompt('为分支存档命名（可选）:', `${save.name} (分支)`);
    if (name === null) return;

    try {
      const newSave = await db.forkSave(save.sav_id, save.usr_id, name || undefined);
      try {
        await api.uploadSave({
          scenario_id: newSave.scn_id,
          name: newSave.name,
          scenario_title: scenario?.name || '',
          save_data: JSON.stringify({ scenario, conversations: convs, currentTurn: turn }),
        });
      } catch {
        console.warn('[PlayStorage] 分支存档上传后端失败，仅保留本地');
      }
      setSave(newSave);
      localStorage.setItem('niko_lastSaveId', newSave.sav_id);
      addNotification({ type: 'success', message: `已切换到分支: ${newSave.name}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      addNotification({ type: 'error', message: `创建分支失败: ${msg}` });
    }
  }, [isAuthenticated, setSave, addNotification]);

  // ============================================================
  // switchSave — 切换存档
  // ============================================================
  const switchSave = useCallback(async (saveId: string) => {
    try {
      const detail = await api.getSave(saveId);
      let saveData: { scenario?: any; conversations?: Conversation[]; currentTurn?: number } = {};
      try { saveData = JSON.parse(detail.save_data); } catch { /* ignore */ }

      const localSave: Save = {
        sav_id: detail.id,
        scn_id: detail.scenario_id,
        usr_id: detail.user_id,
        name: detail.name || `存档 ${detail.id.slice(0, 8)}`,
        current_turn: saveData.currentTurn || 0,
        parent_sav_id: detail.parent_sav_id,
        created_at: detail.created_at,
        updated_at: detail.updated_at,
      };

      let scenario: Scenario | null = saveData.scenario || null;
      if (!scenario) {
        try {
          const apiScn = await api.getScenario(detail.scenario_id);
          scenario = {
            scn_id: apiScn.id,
            author_id: apiScn.author_id || '',
            name: apiScn.title,
            intro: apiScn.intro,
            main_prompt: apiScn.blueprint_data,
            init_worldbooks: [],
            init_plot: '',
            version: 1,
            tags: [],
            cover_url: apiScn.cover_url,
            created_at: apiScn.created_at,
          };
        } catch { /* ignore */ }
      }

      const convs = saveData.conversations || [];

      await db.putSave(localSave);
      if (scenario) await db.putScenario(scenario);
      for (const msg of convs) {
        await db.putConversation(msg);
      }

      reset();
      setSave(localSave);
      setScenario(scenario);
      setConversations(convs);
      setCurrentTurn(saveData.currentTurn || 0);
      currentTurnRef.current = saveData.currentTurn || 0;
      greetingSentRef.current = convs.length > 0;
      localStorage.setItem('niko_lastSaveId', localSave.sav_id);
      addNotification({ type: 'success', message: '已切换存档' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '切换失败';
      addNotification({ type: 'error', message: `切换存档失败: ${msg}` });
    }
  }, [reset, setSave, setScenario, setConversations, setCurrentTurn, addNotification]);

  // ============================================================
  // resetMemory — 重置记忆引擎
  // ============================================================
  const resetMemory = useCallback(async () => {
    const save = currentSaveRef.current;
    if (!save) return;
    if (!window.confirm('确定重置记忆引擎？这将清空 L1/L2/L3 数据，但保留对话历史。')) return;
    try {
      const savId = save.sav_id;
      const l1Entries = await db.getMemoriesByType(savId, 'L1_Summary');
      const l2Entries = await db.getMemoriesByType(savId, 'L2_Worldbook');
      const l3Entry = await db.getLatestMemory(savId, 'L3_Plot');
      const idb = await db.getDB();
      for (const mem of l1Entries) await idb.delete('dynamic_memories', mem.id);
      for (const mem of l2Entries) await idb.delete('dynamic_memories', mem.id);
      if (l3Entry) await idb.delete('dynamic_memories', l3Entry.id);
      setEngineStatus({ l1: 'idle', l2: 'idle', l3: 'idle' });
      addNotification({ type: 'success', message: '记忆引擎已重置' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '重置失败';
      addNotification({ type: 'error', message: msg });
    }
  }, [setEngineStatus, addNotification]);

  // ============================================================
  // openWorldbook — 加载世界书
  // ============================================================
  const openWorldbook = useCallback(async (): Promise<DynamicMemory[]> => {
    const save = currentSaveRef.current;
    if (!save) return [];
    try {
      const entries = await db.getMemoriesByType(save.sav_id, 'L2_Worldbook');
      setWorldbookEntries(entries);
      return entries;
    } catch (err) {
      console.warn('[PlayStorage] 加载世界书失败:', err);
      return [];
    }
  }, []);

  // ============================================================
  // saveWbEntry — 保存世界书词条
  // ============================================================
  const saveWbEntry = useCallback(async (entryId: string, content: string) => {
    if (!content.trim()) return;
    try {
      const entry = worldbookEntries.find((e) => e.id === entryId);
      if (!entry) return;
      const updated: DynamicMemory = { ...entry, content: content.trim() };
      await db.putMemory(updated);
      setWorldbookEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
      setEditingWbId(null);
      setEditingWbContent('');
      addNotification({ type: 'success', message: '世界书词条已更新' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败';
      addNotification({ type: 'error', message: msg });
    }
  }, [worldbookEntries, addNotification]);

  // ============================================================
  // deleteWbEntry — 删除世界书词条
  // ============================================================
  const deleteWbEntry = useCallback(async (entryId: string) => {
    if (!window.confirm('确定删除此世界书词条？')) return;
    try {
      const idb = await db.getDB();
      await idb.delete('dynamic_memories', entryId);
      setWorldbookEntries((prev) => prev.filter((e) => e.id !== entryId));
      addNotification({ type: 'success', message: '世界书词条已删除' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除失败';
      addNotification({ type: 'error', message: msg });
    }
  }, [addNotification]);

  // ============================================================
  // openSaveSwitcher — 打开存档切换面板
  // ============================================================
  const openSaveSwitcher = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const list = await api.listSaves();
      setSaveList(list);
      setShowSaveSwitcher(true);
    } catch (err) {
      console.warn('[PlayStorage] 加载存档列表失败:', err);
    }
  }, [isAuthenticated]);

  // ============================================================
  // incrementTurn — 递增回合数，返回新值
  // ============================================================
  const incrementTurn = useCallback((): number => {
    const next = currentTurnRef.current + 1;
    setCurrentTurn(next);
    currentTurnRef.current = next;
    return next;
  }, [setCurrentTurn]);

  // ============================================================
  // setCurrentTurnDirect — 直接设置回合数
  // ============================================================
  const setCurrentTurnDirect = useCallback((turn: number) => {
    setCurrentTurn(turn);
    currentTurnRef.current = turn;
  }, [setCurrentTurn]);

  // ============================================================
  // setConversationsDirect — 直接设置对话列表
  // ============================================================
  const setConversationsDirect = useCallback((convs: Conversation[]) => {
    setConversations(convs);
    conversationsRef.current = convs;
  }, [setConversations]);

  // ============================================================
  // resetAll — 重置所有状态
  // ============================================================
  const resetAll = useCallback(() => {
    reset();
    greetingSentRef.current = false;
    lastSyncTurnRef.current = 0;
    isRegenerateRef.current = false;
  }, [reset]);

  return {
    // 状态
    conversations, currentSave, currentScenario, currentTurn, engineStatus, isGenerating,
    // ref 快照
    currentSaveRef, currentScenarioRef, conversationsRef, currentTurnRef,
    // 本地状态
    saveList, showSaveSwitcher, worldbookEntries,
    editingWbId, editingWbContent, greetingSentRef, lastSyncTurnRef, isRegenerateRef,
    // setter
    setSaveList, setShowSaveSwitcher, setWorldbookEntries,
    setEditingWbId, setEditingWbContent,
    // 存储操作
    hydrate, autoSync,
    appendUserMessage, appendAssistantMessage, updateAssistantMessage,
    deleteConversationsFrom, forkSave, switchSave,
    resetMemory, openWorldbook, saveWbEntry, deleteWbEntry, openSaveSwitcher,
    incrementTurn, setCurrentTurnDirect, setConversationsDirect, resetAll,
  };
}
