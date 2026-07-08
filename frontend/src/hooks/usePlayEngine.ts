// ============================================================
// usePlayEngine — 编排层 Hook
// 职责：组合 usePlayStorage + useAIComm，缝合数据流
// 不直接操作 IndexedDB，不直接创建 StreamClient
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { usePlayStorage } from './usePlayStorage';
import { useAIComm } from './useAIComm';
import * as db from '../db';
import type { Conversation, EngineStatus } from '../types';

// -----------------------------------------------------------
// Hook 返回类型
// -----------------------------------------------------------
export interface PlayEngine {
  conversations: Conversation[];
  isGenerating: boolean;
  engineStatus: EngineStatus;
  input: string;
  modelKey: string;
  useByok: boolean;
  useStream: boolean;
  streamingContent: string;
  editingMsgId: string | null;
  editContent: string;
  showPrologue: boolean;
  prologueHtml: string;
  lastTokenCount: number | null;
  highlightKeywords: string[];
  authorNotes: string | null;
  showAuthorNotes: boolean;
  showWorldbook: boolean;
  worldbookEntries: DynamicMemory[];
  editingWbId: string | null;
  editingWbContent: string;
  saveList: api.SaveItem[];
  showSaveSwitcher: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;

  setInput: (v: string) => void;
  setModelKey: (v: string) => void;
  setUseByok: (v: boolean) => void;
  setUseStream: (v: boolean) => void;
  setEditContent: (v: string) => void;
  setShowAuthorNotes: (v: boolean) => void;
  setShowWorldbook: (v: boolean) => void;
  setShowSaveSwitcher: (v: boolean) => void;
  setEditingWbId: (v: string | null) => void;
  setEditingWbContent: (v: string) => void;
  setSaveList: (v: api.SaveItem[]) => void;

  handleStartAdventure: () => void;
  handleSend: () => void;
  handleCancel: () => void;
  handleForkSave: () => Promise<void>;
  handleExportConversation: () => void;
  handleOpenWorldbook: () => Promise<void>;
  handleSaveWbEntry: (entryId: string) => Promise<void>;
  handleDeleteWbEntry: (entryId: string) => Promise<void>;
  handleResetMemory: () => Promise<void>;
  handleOpenSaveSwitcher: () => Promise<void>;
  handleSwitchSave: (saveId: string) => Promise<void>;
  handleDeleteFrom: (msgId: string) => Promise<void>;
  handleReroll: (msgId: string) => Promise<void>;
  handleRegenerate: (msgId: string) => Promise<void>;
  handleStartEdit: (msgId: string) => void;
  handleSubmitEdit: () => Promise<void>;
  handleCancelEdit: () => void;
  handleSwipe: (msgId: string, direction: 'prev' | 'next') => void;
}

// 需要从 types 导入 DynamicMemory 和 api
import type { DynamicMemory } from '../types';
import * as api from '../utils/api';

export function usePlayEngine(): PlayEngine {
  const { isAuthenticated } = useAuthStore();
  const { addNotification } = useUIStore();
  const {
    conversations, currentSave, currentScenario, currentTurn,
    engineStatus, setEngineStatus, setConversations,
    addConversation, updateConversation, setCurrentTurn,
  } = useGameStore();

  // ---- 实例化子 Hook ----
  const storage = usePlayStorage();

  // ---- 稳定回调引用（避免 triggerSend 因 callbacks 对象重建而重新创建） ----
  const onDoneRef = useRef<((content: string, turn: number, userText: string) => Promise<void>) | null>(null);
  const onStreamRef = useRef<((content: string) => void) | null>(null);

  onDoneRef.current = async (content, turn, userText) => {
    // ============================================================
    // onDone 回调 — 编排层的核心缝合点
    // 1. 持久化 AI 回复（存储层）
    // 2. 回合递增（存储层）
    // 3. 触发记忆引擎（MemoryLoaderService）— 期间 engineStatus 设为 running
    // 4. 触发云端同步（存储层）
    // ============================================================

    // Regenerate 模式下跳过 existingIdx 检查
    const skipExisting = storage.isRegenerateRef.current;
    storage.isRegenerateRef.current = false;

    const convs = storage.conversationsRef.current;
    const existingIdx = skipExisting ? -1 : convs.findIndex(
      (c) => c.turn === turn && c.role === 'assistant'
    );

    if (existingIdx >= 0) {
      storage.updateAssistantMessage(convs[existingIdx].id, content, turn);
    } else {
      storage.appendAssistantMessage(content, savIdRef.current, turn);
    }

    // 回合递增
    const nextTurn = storage.incrementTurn();

    // 后台记忆运算 — 点亮引擎状态指示灯
    const savId = savIdRef.current;
    useGameStore.getState().setEngineStatus({ l1: 'running', l2: 'running', l3: 'running' });
    aiComm.memoryLoader.afterResponse(savId, nextTurn)
      .catch((err) => {
        console.warn('[PlayEngine] afterResponse 失败:', err);
      })
      .finally(() => {
        useGameStore.getState().setEngineStatus({ l1: 'idle', l2: 'idle', l3: 'idle' });
      });

    // 云端自动同步
    storage.autoSync().catch((err) => {
      console.warn('[PlayEngine] 自动同步失败:', err);
    });
  };
  onStreamRef.current = (_content) => {
    // 流式内容已由 AIComm 内部管理
  };

  const aiComm = useAIComm({
    onDone: (content, turn, userText) => onDoneRef.current!(content, turn, userText),
    onStream: (content) => onStreamRef.current!(content),
  });

  // ---- 本地状态 ----
  const [input, setInput] = useState('');
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showPrologue, setShowPrologue] = useState(false);
  const [prologueHtml, setPrologueHtml] = useState('');
  const [authorNotes, setAuthorNotes] = useState<string | null>(null);
  const [showAuthorNotes, setShowAuthorNotes] = useState(false);
  const [showWorldbook, setShowWorldbook] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // savId 快照（供 onDone 闭包使用）
  const savIdRef = useRef<string>('local');

  // ---- 副作用 ----

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, aiComm.streamingContent]);

  // Hydrate：挂载时恢复游戏状态
  useEffect(() => {
    let cancelled = false;
    storage.hydrate().catch((err) => {
      console.warn('[PlayEngine] Hydration 失败:', err);
    });
    return () => { cancelled = true; };
  }, [currentSave, isAuthenticated]);

  // Prologue 解析
  useEffect(() => {
    if (!currentScenario || conversations.length > 0) return;
    try {
      const bp = JSON.parse(currentScenario.main_prompt);
      const html = bp.prologue_html;
      if (typeof html === 'string' && html.trim()) {
        setPrologueHtml(html.trim());
        setShowPrologue(true);
      }
      if (typeof bp.authorNotes === 'string' && bp.authorNotes.trim()) {
        setAuthorNotes(bp.authorNotes.trim());
      }
    } catch { /* ignore */ }
  }, [currentScenario, conversations.length]);

  // 每 50 回合自动同步
  useEffect(() => {
    if (!currentSave || !isAuthenticated) return;
    if (currentTurn - storage.lastSyncTurnRef.current >= 50) {
      storage.lastSyncTurnRef.current = currentTurn;
      storage.autoSync().catch((err) =>
        console.warn('[PlayEngine] 自动同步失败:', err)
      );
    }
  }, [currentTurn, currentSave, isAuthenticated]);

  // 卸载时自动同步
  useEffect(() => {
    return () => {
      storage.autoSync().catch((err) =>
        console.warn('[PlayEngine] 卸载同步失败:', err)
      );
    };
  }, []);

  // ---- 内部函数 ----

  function sendGreeting() {
    if (storage.greetingSentRef.current) return;
    if (!currentScenario) return;
    try {
      const bp = JSON.parse(currentScenario.main_prompt);
      const greeting = bp.greeting;
      if (typeof greeting === 'string' && greeting.trim()) {
        const savId = currentSave?.sav_id || 'local';
        const greetingMsg: Conversation = {
          id: `msg-${Date.now()}-greeting`,
          sav_id: savId,
          turn: 0,
          role: 'assistant',
          content: greeting.trim(),
          timestamp: Date.now(),
        };
        addConversation(greetingMsg);
        db.putConversation(greetingMsg).catch((err) =>
          console.warn('[PlayEngine] 持久化 greeting 失败:', err)
        );
        storage.greetingSentRef.current = true;
      }
    } catch { /* ignore */ }
  }

  // ---- 公开动作 ----

  const handleStartAdventure = useCallback(() => {
    setShowPrologue(false);
    sendGreeting();
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || aiComm.isGenerating || !isAuthenticated) return;

    const savId = currentSave?.sav_id || 'local';
    savIdRef.current = savId;
    setInput('');

    // 存储层：创建并持久化用户消息
    storage.appendUserMessage(text, savId);
    const turn = storage.currentTurnRef.current;

    // AI 层：发送到模型
    aiComm.triggerSend(text, savId, turn);
  }, [input, isAuthenticated, currentSave, aiComm, storage]);

  const handleCancel = useCallback(() => {
    aiComm.cancelStream();
  }, [aiComm]);

  const handleForkSave = useCallback(async () => {
    await storage.forkSave();
  }, [storage]);

  const handleExportConversation = useCallback(() => {
    if (conversations.length === 0) {
      addNotification({ type: 'warning', message: '没有对话可导出' });
      return;
    }
    const exportData = {
      version: 1,
      exported_at: Date.now(),
      scenario: currentScenario,
      save: currentSave,
      conversations,
      currentTurn,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `niko-chat-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addNotification({ type: 'success', message: `已导出 ${conversations.length} 条消息` });
  }, [conversations, currentScenario, currentSave, currentTurn, addNotification]);

  const handleOpenWorldbook = useCallback(async () => {
    const entries = await storage.openWorldbook();
    if (entries.length > 0 || true) {
      setShowWorldbook(true);
    }
  }, [storage]);

  const handleSaveWbEntry = useCallback(async (entryId: string) => {
    await storage.saveWbEntry(entryId, storage.editingWbContent);
  }, [storage]);

  const handleDeleteWbEntry = useCallback(async (entryId: string) => {
    await storage.deleteWbEntry(entryId);
  }, [storage]);

  const handleResetMemory = useCallback(async () => {
    await storage.resetMemory();
  }, [storage]);

  const handleOpenSaveSwitcher = useCallback(async () => {
    await storage.openSaveSwitcher();
  }, [storage]);

  const handleSwitchSave = useCallback(async (saveId: string) => {
    await storage.switchSave(saveId);
  }, [storage]);

  const handleDeleteFrom = useCallback(async (msgId: string) => {
    const result = storage.deleteConversationsFrom(msgId);
    if (!result) return;
    if (result.role === 'user') {
      storage.setCurrentTurnDirect(Math.max(0, result.turn - 1));
    } else {
      storage.setCurrentTurnDirect(Math.max(0, result.turn));
    }
  }, [storage]);

  const handleReroll = useCallback(async (msgId: string) => {
    const convs = storage.conversationsRef.current;
    const idx = convs.findIndex((c) => c.id === msgId);
    if (idx < 1) return;
    const savId = currentSave?.sav_id || 'local';
    savIdRef.current = savId;
    const targetMsg = convs[idx];
    const turn = targetMsg.turn;

    // 删除该消息之后的所有对话
    storage.setConversationsDirect(convs.slice(0, idx));
    db.deleteConversationsAfterTurn(savId, turn).catch((err) =>
      console.warn('[PlayEngine] Reroll 删除对话失败:', err)
    );

    // 找到上一条用户消息
    let userIdx = idx - 1;
    while (userIdx >= 0 && convs[userIdx].role !== 'user') {
      userIdx--;
    }
    if (userIdx < 0) return;
    const userMsg = convs[userIdx];
    storage.setCurrentTurnDirect(userMsg.turn);

    // 标记 regenerate 模式
    storage.isRegenerateRef.current = true;

    // 自动重新发送
    setTimeout(() => {
      const text = userMsg.content;
      if (!text || aiComm.isGenerating) return;
      storage.setCurrentTurnDirect(userMsg.turn);
      aiComm.triggerSend(text, savId, userMsg.turn);
    }, 0);
  }, [currentSave, aiComm, storage]);

  const handleRegenerate = useCallback(async (msgId: string) => {
    const convs = storage.conversationsRef.current;
    const idx = convs.findIndex((c) => c.id === msgId);
    if (idx < 1) return;
    const savId = currentSave?.sav_id || 'local';
    savIdRef.current = savId;
    const targetMsg = convs[idx];
    const turn = targetMsg.turn;

    // 删除当前 AI 回复及之后的所有对话
    storage.setConversationsDirect(convs.slice(0, idx));
    db.deleteConversationsAfterTurn(savId, turn).catch((err) =>
      console.warn('[PlayEngine] Regenerate 删除对话失败:', err)
    );

    // 找到上一条用户消息
    let userIdx = idx - 1;
    while (userIdx >= 0 && convs[userIdx].role !== 'user') {
      userIdx--;
    }
    if (userIdx < 0) return;
    const userMsg = convs[userIdx];
    storage.setCurrentTurnDirect(userMsg.turn);

    // 标记 regenerate 模式
    storage.isRegenerateRef.current = true;

    // 自动重新发送
    setTimeout(() => {
      const text = userMsg.content;
      if (!text || aiComm.isGenerating) return;
      storage.setCurrentTurnDirect(userMsg.turn);
      aiComm.triggerSend(text, savId, userMsg.turn);
    }, 0);
  }, [currentSave, aiComm, storage]);

  const handleStartEdit = useCallback((msgId: string) => {
    const msg = conversations.find((c) => c.id === msgId);
    if (!msg) return;
    setEditingMsgId(msgId);
    setEditContent(msg.content);
  }, [conversations]);

  const handleSubmitEdit = useCallback(async () => {
    if (!editingMsgId || !editContent.trim()) return;
    updateConversation(editingMsgId, { content: editContent.trim() });
    const msg = conversations.find((c) => c.id === editingMsgId);
    if (msg) {
      const updated: Conversation = { ...msg, content: editContent.trim() };
      db.putConversation(updated).catch((err) =>
        console.warn('[PlayEngine] 编辑持久化失败:', err)
      );
    }
    setEditingMsgId(null);
    setEditContent('');
  }, [editingMsgId, editContent, conversations, updateConversation]);

  const handleCancelEdit = useCallback(() => {
    setEditingMsgId(null);
    setEditContent('');
  }, []);

  const handleSwipe = useCallback((msgId: string, direction: 'prev' | 'next') => {
    const msg = conversations.find((c) => c.id === msgId);
    if (!msg || !msg.metadata?.swipes || msg.metadata.swipes.length <= 1) return;
    const swipes = msg.metadata.swipes;
    const current = msg.metadata.currentSwipe ?? 0;
    let newIdx: number;
    if (direction === 'prev') {
      newIdx = (current - 1 + swipes.length) % swipes.length;
    } else {
      newIdx = (current + 1) % swipes.length;
    }
    updateConversation(msgId, {
      content: swipes[newIdx],
      metadata: { ...msg.metadata, currentSwipe: newIdx },
    });
    const updated: Conversation = { ...msg, content: swipes[newIdx], metadata: { ...msg.metadata, currentSwipe: newIdx } };
    db.putConversation(updated).catch((err) =>
      console.warn('[PlayEngine] 持久化 swipe 切换失败:', err)
    );
  }, [conversations, updateConversation]);

  return {
    // 来自 gameStore
    conversations, isGenerating: aiComm.isGenerating, engineStatus,
    // 本地状态
    input, modelKey: aiComm.modelKey, useByok: aiComm.useByok, useStream: aiComm.useStream,
    streamingContent: aiComm.streamingContent,
    editingMsgId, editContent,
    showPrologue, prologueHtml, lastTokenCount: aiComm.lastTokenCount,
    highlightKeywords: aiComm.highlightKeywords,
    authorNotes, showAuthorNotes, showWorldbook,
    worldbookEntries: storage.worldbookEntries,
    editingWbId: storage.editingWbId, editingWbContent: storage.editingWbContent,
    saveList: storage.saveList, showSaveSwitcher: storage.showSaveSwitcher,
    messagesEndRef,
    // setter
    setInput, setModelKey: aiComm.setModelKey, setUseByok: aiComm.setUseByok, setUseStream: aiComm.setUseStream,
    setEditContent, setShowAuthorNotes, setShowWorldbook,
    setShowSaveSwitcher: storage.setShowSaveSwitcher,
    setEditingWbId: storage.setEditingWbId,
    setEditingWbContent: storage.setEditingWbContent,
    setSaveList: storage.setSaveList,
    // 动作
    handleStartAdventure, handleSend, handleCancel, handleForkSave,
    handleExportConversation, handleOpenWorldbook, handleSaveWbEntry,
    handleDeleteWbEntry, handleResetMemory, handleOpenSaveSwitcher,
    handleSwitchSave, handleDeleteFrom, handleReroll, handleRegenerate,
    handleStartEdit, handleSubmitEdit, handleCancelEdit, handleSwipe,
  };
}
