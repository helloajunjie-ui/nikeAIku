// ============================================================
// useAIComm — AI 通信层 Hook
// 职责：只跟大模型 API 打交道
// 不知道什么是 IndexedDB，不知道什么是存档
// ============================================================
import { useCallback, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { StreamClient } from '../engine/StreamClient';
import { PromptAssembler } from '../engine/PromptAssembler';
import { TokenBudgetManager } from '../engine/TokenBudgetManager';
import { MemoryLoaderService } from '../services/MemoryLoaderService';
import { loadByokConfig, createMemoryModelCaller } from '../utils/playEngineHelpers';
import * as api from '../utils/api';
import type { Conversation, PromptConfig, L2MatchResult } from '../types';

// -----------------------------------------------------------
// 模块级单例（技术债：非 DI，但 Play 是唯一消费者）
// -----------------------------------------------------------
const tokenBudget = new TokenBudgetManager({
  model: 'default',
  max_total_tokens: 4096,
  max_response_tokens: 1024,
  min_history_turns: 3,
});

const memoryLoader = new MemoryLoaderService();
const assembler = new PromptAssembler(memoryLoader, tokenBudget);

const defaultPromptConfig: PromptConfig = {
  max_total_tokens: 4096,
  max_response_tokens: 1024,
  model: 'default',
};

// -----------------------------------------------------------
// 回调接口 — 由编排层注入
// -----------------------------------------------------------
export interface AICommCallbacks {
  /** AI 回复完成后的回调（含完整内容、回合、用户原文） */
  onDone: (content: string, turn: number, userText: string) => Promise<void>;
  /** 流式逐字回调 */
  onStream: (content: string) => void;
}

// -----------------------------------------------------------
// 返回类型
// -----------------------------------------------------------
export interface AIComm {
  isGenerating: boolean;
  streamingContent: string;
  lastTokenCount: number | null;
  highlightKeywords: string[];
  modelKey: string;
  useByok: boolean;
  useStream: boolean;
  setModelKey: (v: string) => void;
  setUseByok: (v: boolean) => void;
  setUseStream: (v: boolean) => void;
  triggerSend: (text: string, savId: string, turn: number) => Promise<void>;
  cancelStream: () => void;
  resolveModel: () => string;
  memoryLoader: MemoryLoaderService;
}

export function useAIComm(callbacks: AICommCallbacks): AIComm {
  const { isAuthenticated, optimisticDeductPoints, refreshPoints } = useAuthStore();
  const { addNotification } = useUIStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [lastTokenCount, setLastTokenCount] = useState<number | null>(null);
  const [highlightKeywords, setHighlightKeywords] = useState<string[]>([]);
  const streamClientRef = useRef<StreamClient | null>(null);

  // ---- BYOK 状态（从 localStorage 恢复） ----
  const [useByok, setUseByok] = useState(() => {
    return localStorage.getItem('niko_use_byok') === 'true';
  });

  // ---- 流式/非流式开关（默认流式） ----
  const [useStream, setUseStream] = useState(() => {
    const saved = localStorage.getItem('niko_use_stream');
    return saved !== null ? saved === 'true' : true;
  });
  const [modelKey, setModelKey] = useState(() => {
    // 优先从 BYOK config 读取
    const cfg = loadByokConfig();
    if (cfg?.model) return cfg.model;
    // 其次从平台模型偏好读取
    const pref = (() => {
      try {
        const raw = localStorage.getItem('niko_model_pref');
        if (raw) return JSON.parse(raw);
      } catch { /* ignore */ }
      return null;
    })();
    return pref?.modelId || '';
  });

  // ============================================================
  // resolveModel — 解析当前使用的模型名称
  // ============================================================
  const resolveModel = useCallback((): string => {
    if (useByok) {
      const cfg = loadByokConfig();
      if (cfg?.model) return cfg.model;
    }
    // 从 scenario blueprint 读取默认模型（由编排层在调用前设置）
    return modelKey;
  }, [useByok, modelKey]);

  // ============================================================
  // triggerSend — 发送消息到 AI
  // ============================================================
  const triggerSend = useCallback(async (text: string, savId: string, turn: number) => {
    try {
      const assembled = await assembler.assemble(savId, text, defaultPromptConfig);
      setLastTokenCount(assembled.token_count);
      const model = resolveModel();

      // 注入 modelCaller 到 memoryLoader（用于 L1/L2/L3 AI 记忆处理）
      memoryLoader.setModelCaller(createMemoryModelCaller(useByok, model));

      // ---- 非流模式：直接发非流式请求 ----
      if (!useStream) {
        setIsGenerating(true);
        try {
          const { baseUrl, apiKey, isProxy } = useByok
            ? (() => {
                const cfg = loadByokConfig();
                if (!cfg) throw new Error('BYOK 配置未设置');
                return { baseUrl: cfg.endpoint.replace(/\/+$/, ''), apiKey: cfg.apiKey, isProxy: false };
              })()
            : { baseUrl: '/api/chat/proxy', apiKey: api.getToken() || '', isProxy: true };

          if (!useByok) optimisticDeductPoints(1);

          const chatUrl = (() => {
            const trimmed = baseUrl.replace(/\/+$/, '');
            if (trimmed.endsWith('/chat/completions') || trimmed.endsWith('/proxy')) return trimmed;
            if (trimmed.endsWith('/v1')) return trimmed + '/chat/completions';
            return trimmed + '/v1/chat/completions';
          })();

          const bodyPayload = isProxy
            ? { model_id: model, messages: [{ role: 'system', content: assembled.system_prompt }, ...assembled.messages], stream: false, max_tokens: 8192 }
            : { model, messages: [{ role: 'system', content: assembled.system_prompt }, ...assembled.messages], stream: false, temperature: 0.8, max_tokens: 8192 };

          const resp = await fetch(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(bodyPayload),
          });
          if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status}: ${errText || resp.statusText}`);
          }
          const data = await resp.json();
          const finalContent = data.choices?.[0]?.message?.content || '';

          setStreamingContent('');
          setIsGenerating(false);

          await callbacks.onDone(finalContent, turn, text);

          memoryLoader.loadL2(savId, text, finalContent).then((result: L2MatchResult) => {
            setHighlightKeywords(result.keywords);
          }).catch((err) => {
            console.warn('[AIComm] L2 关键词加载失败:', err);
          });

          if (!useByok) {
            refreshPoints().catch((err) => console.warn('[AIComm] 刷新积分失败:', err));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : '未知错误';
          addNotification({ type: 'error', message: `对话失败: ${msg}` });
          setStreamingContent('');
          setIsGenerating(false);
        }
        return;
      }

      // ---- 流式模式（原有逻辑） ----
      let client: StreamClient;
      if (useByok) {
        const cfg = loadByokConfig();
        if (!cfg) {
          addNotification({ type: 'error', message: 'BYOK 配置未设置，请前往设置页配置' });
          setIsGenerating(false);
          return;
        }
        const cleanEndpoint = cfg.endpoint.replace(/\/+$/, '');
        client = new StreamClient({
          baseUrl: cleanEndpoint,
          apiKey: cfg.apiKey,
          model: cfg.model,
          temperature: 0.8,
          isProxy: false,
        });
      } else {
        client = new StreamClient({
          baseUrl: '/api/chat/proxy',
          apiKey: api.getToken() || '',
          model,
          isProxy: true,
        });
        optimisticDeductPoints(1);
      }
      streamClientRef.current = client;

      let fullResponse = '';

      client.send(assembled.system_prompt, assembled.messages, {
        onToken: (content) => {
          fullResponse += content;
          setStreamingContent(fullResponse);
          callbacks.onStream(fullResponse);
        },
        onDone: async (content) => {
          const finalContent = content || fullResponse;
          setStreamingContent('');
          setIsGenerating(false);
          streamClientRef.current = null;

          await callbacks.onDone(finalContent, turn, text);

          memoryLoader.loadL2(savId, text, finalContent).then((result: L2MatchResult) => {
            setHighlightKeywords(result.keywords);
          }).catch((err) => {
            console.warn('[AIComm] L2 关键词加载失败:', err);
          });

          if (!useByok) {
            refreshPoints().catch((err) =>
              console.warn('[AIComm] 刷新积分失败:', err)
            );
          }
        },
        onError: (err) => {
          addNotification({ type: 'error', message: `对话失败: ${err.message}` });
          setStreamingContent('');
          setIsGenerating(false);
          streamClientRef.current = null;
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      addNotification({ type: 'error', message: `组装失败: ${msg}` });
      setIsGenerating(false);
    }
  }, [useByok, useStream, resolveModel, callbacks, addNotification, optimisticDeductPoints, refreshPoints]);

  // ============================================================
  // cancelStream — 取消当前流式请求
  // ============================================================
  const cancelStream = useCallback(() => {
    streamClientRef.current?.cancel();
    setIsGenerating(false);
    setStreamingContent('');
  }, []);

  return {
    isGenerating,
    streamingContent,
    lastTokenCount,
    highlightKeywords,
    modelKey,
    useByok,
    useStream,
    setModelKey,
    setUseByok,
    setUseStream,
    triggerSend,
    cancelStream,
    resolveModel,
    memoryLoader,
  };
}
