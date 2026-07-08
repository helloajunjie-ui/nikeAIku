// ============================================================
// playEngineHelpers — usePlayEngine 中与 React 无关的纯函数
// 提取目的：降低 usePlayEngine.ts 体积，分离关注点
// ============================================================
import type { ModelCaller } from '../services/MemoryLoaderService';
import * as api from './api';

/** BYOK 配置的 localStorage key（与 Settings 页一致） */
const BYOK_CONFIG_KEY = 'niko_byok_config';

export interface ByokConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

/** 从 localStorage 读取 BYOK 配置 */
export function loadByokConfig(): ByokConfig | null {
  try {
    const raw = localStorage.getItem(BYOK_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.endpoint && parsed.apiKey && parsed.model) return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * 创建 memoryModelCaller — 用于 L1/L2/L3 AI 记忆处理的非流式调用器
 * 使用与主对话相同的模型配置，以非流式方式调用
 */
export function createMemoryModelCaller(
  useByok: boolean,
  model: string,
): ModelCaller {
  return async (systemPrompt: string, userContent: string) => {
    let memoryBaseUrl: string;
    let memoryApiKey: string;
    let memoryModel: string;
    if (useByok) {
      const cfg = loadByokConfig();
      if (!cfg) throw new Error('BYOK 配置未设置');
      memoryBaseUrl = cfg.endpoint.replace(/\/+$/, '');
      memoryApiKey = cfg.apiKey;
      memoryModel = cfg.model;
    } else {
      memoryBaseUrl = '/api/chat/proxy';
      memoryApiKey = api.getToken() || '';
      memoryModel = model;
    }
    // 非流式 POST
    let chatUrl: string;
    let bodyPayload: Record<string, unknown>;
    if (useByok) {
      const base = memoryBaseUrl.replace(/\/+$/, '');
      if (base.endsWith('/v1/chat/completions')) {
        chatUrl = base;
      } else if (base.endsWith('/v1')) {
        chatUrl = base + '/chat/completions';
      } else {
        chatUrl = base + '/v1/chat/completions';
      }
      // BYOK 直连：OpenAI 兼容格式
      bodyPayload = {
        model: memoryModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
        stream: false,
        max_tokens: 8192,
      };
    } else {
      chatUrl = memoryBaseUrl; // 平台代理直接 POST 到 /api/chat/proxy
      // 平台代理：后端 ChatProxyRequest 格式
      bodyPayload = {
        model_id: memoryModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        stream: false,
        max_tokens: 8192,
      };
    }
    const resp = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${memoryApiKey}`,
      },
      body: JSON.stringify(bodyPayload),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown error');
      throw new Error(`Memory AI 调用失败: ${resp.status} ${errText}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  };
}
