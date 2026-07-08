import type { StreamClientOptions, ChatMessage, StreamCallbacks, StreamChunk } from '../types';

/**
 * StreamClient — 流式通信客户端
 * 封装 fetch + ReadableStream 实现 SSE 解析
 * 零外部依赖，纯原生 fetch API
 */
export class StreamClient {
  private options: StreamClientOptions;
  private abortController: AbortController | null = null;

  constructor(options: StreamClientOptions) {
    this.options = {
      temperature: 0.8,
      maxTokens: 1024,
      ...options,
    };
  }

  /**
   * 发起流式对话请求
   * @returns AbortController 用于取消请求
   */
  /**
   * 发起流式对话请求
   * 注意：baseUrl 应为后端 proxy 完整路径（如 /api/chat/proxy），
   * 请求体格式与后端 ChatProxyRequest 对齐：{ model_id, messages, stream }
   */
  /**
   * 智能拼接 OpenAI 兼容的 chat/completions URL
   * "https://api.deepseek.com"              → "https://api.deepseek.com/v1/chat/completions"
   * "https://api.deepseek.com/v1"           → "https://api.deepseek.com/v1/chat/completions"
   * "https://api.deepseek.com/v1/"          → "https://api.deepseek.com/v1/chat/completions"
   * "https://api.deepseek.com/v1/chat/completions" → 原样返回
   * "/api/chat/proxy"                       → 原样返回（后端代理模式）
   */
  private buildChatURL(base: string): string {
    const trimmed = base.replace(/\/+$/, '');
    if (trimmed.endsWith('/chat/completions') || trimmed.endsWith('/proxy')) {
      return trimmed;
    }
    if (trimmed.endsWith('/v1')) {
      return trimmed + '/chat/completions';
    }
    return trimmed + '/v1/chat/completions';
  }

  send(systemPrompt: string, messages: ChatMessage[], callbacks: StreamCallbacks): AbortController {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const url = this.buildChatURL(this.options.baseUrl);

    // 将 systemPrompt 作为首条 system 消息注入 messages
    // 这是 L0/L1/L2/L3/L-Master 拼接内容被 AI 接收的唯一通道
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // 平台代理模式：发 model_id（后端 ChatProxyRequest 格式）
    // BYOK 直连模式：发 model（OpenAI 兼容 API 格式）
    const bodyPayload = this.options.isProxy
      ? {
          model_id: this.options.model,
          messages: fullMessages,
          stream: true,
        }
      : {
          model: this.options.model,
          messages: fullMessages,
          stream: true,
          temperature: this.options.temperature ?? 0.8,
          max_tokens: this.options.maxTokens ?? 1024,
        };

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify(bodyPayload),
      signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          throw new Error(`HTTP ${response.status}: ${errorBody || response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body is not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let retryCount = 0;
        const maxRetries = 1;

        const processChunk = (): Promise<void> => {
          return reader.read().then(({ done, value }) => {
            if (done) {
              callbacks.onDone(fullContent);
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;

              if (trimmed.startsWith('data: ')) {
                try {
                  const json = JSON.parse(trimmed.slice(6)) as {
                    choices?: Array<{
                      delta: { content?: string };
                      finish_reason: string | null;
                      index: number;
                    }>;
                  };

                  const choice = json.choices?.[0];
                  if (choice) {
                    const chunk: StreamChunk = {
                      content: choice.delta?.content || '',
                      finish_reason: (choice.finish_reason as 'stop' | 'length' | null) || null,
                      index: choice.index || 0,
                    };

                    if (chunk.content) {
                      fullContent += chunk.content;
                      callbacks.onToken(chunk.content);
                    }

                    if (chunk.finish_reason === 'stop') {
                      callbacks.onDone(fullContent);
                      return;
                    }
                  }
                } catch {
                  // JSON 解析失败，丢弃该 chunk
                }
              }
            }

            return processChunk();
          });
        };

        return processChunk().catch((err) => {
          if (err.name === 'AbortError') return;
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(() => processChunk(), 1000);
            return;
          }
          throw err;
        });
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      });

    return this.abortController;
  }

  /** 取消当前请求 */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /** 更新配置 */
  updateOptions(options: Partial<StreamClientOptions>): void {
    this.options = { ...this.options, ...options };
  }
}
