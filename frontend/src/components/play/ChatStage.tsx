// ============================================================
// ChatStage — 聊天消息列表（含 streaming、空状态、编辑、swipe）
// 沉浸式阅读排版：max-w-4xl mx-auto 视线收拢 + 小说级 prose
// ============================================================
import React, { useCallback } from 'react';
// @ts-ignore
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';
// @ts-ignore
import rehypeRaw from 'rehype-raw'; // 破壁：允许渲染 AI 输出的原生 HTML（如 <details> 折叠面板）
import type { Conversation } from '../../types';

interface ChatStageProps {
  conversations: Conversation[];
  streamingContent: string;
  editingMsgId: string | null;
  editContent: string;
  highlightKeywords: string[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  isGenerating: boolean;
  onStartEdit: (msgId: string) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
  onDeleteFrom: (msgId: string) => void;
  onReroll: (msgId: string) => void;
  onSwipe: (msgId: string, direction: 'prev' | 'next') => void;
  onSetEditContent: (v: string) => void;
}

/** 在文本中用 **关键词** 包裹匹配到的 L2 关键词 */
function highlightText(text: string, keywords: string[]): string {
  if (!keywords.length) return text;
  let result = text;
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), (match) => `**${match}**`);
  }
  return result;
}

export const ChatStage: React.FC<ChatStageProps> = ({
  conversations, streamingContent, editingMsgId, editContent,
  highlightKeywords, messagesEndRef, isGenerating,
  onStartEdit, onSubmitEdit, onCancelEdit, onDeleteFrom,
  onReroll, onSwipe, onSetEditContent,
}) => {
  const renderMessage = useCallback((msg: Conversation) => {
    const isEditing = editingMsgId === msg.id;
    const hasSwipes = msg.role === 'assistant' && msg.metadata?.swipes && msg.metadata.swipes.length > 1;
    const isDisabled = isGenerating;

    return (
      <div
        key={msg.id}
        className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
      >
        <div
          className={`
            group relative px-6 py-6 transition-all duration-300 flex flex-col min-w-0
            ${msg.role === 'user'
              ? 'max-w-[80%] bg-gradient-to-br from-purple-600/90 to-indigo-600/90 backdrop-blur-md text-white rounded-[28px] rounded-tr-[8px] shadow-[0_8px_32px_rgba(168,85,247,0.2)]'
              : 'w-full bg-[#181922]/80 backdrop-blur-2xl border border-white/[0.05] text-gray-200 rounded-[32px] rounded-tl-[8px] shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
            }
          `}
        >
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editContent}
                onChange={(e) => onSetEditContent(e.target.value)}
                className="w-full bg-[#13141c] border border-[#2a2b36] rounded p-2 text-sm text-gray-200
                  focus:outline-none focus:border-purple-500 resize-none"
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={onSubmitEdit}
                  className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
                >
                  保存
                </button>
                <button
                  onClick={onCancelEdit}
                  className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 【核心：小说级排版引擎 (Prose 束身衣)】 */}
              <div className="
                prose prose-invert max-w-none min-w-0 break-words
                prose-p:text-[16px] md:prose-p:text-[17px] prose-p:leading-[1.8] prose-p:text-gray-100 prose-p:tracking-wide
                prose-li:text-[14px] prose-li:text-gray-400 prose-li:marker:text-purple-600/50 prose-li:my-1
                prose-blockquote:not-italic prose-blockquote:bg-white/[0.03] prose-blockquote:border-l-[4px] prose-blockquote:border-purple-500/70 prose-blockquote:px-5 prose-blockquote:py-3 prose-blockquote:rounded-r-2xl prose-blockquote:text-gray-300 prose-blockquote:my-6
                prose-hr:border-white/10 prose-hr:my-6
                prose-strong:text-purple-300 prose-strong:font-bold
                /* 🚀 折叠面板：暗色玻璃质感 */
                prose-details:bg-[#13141c]/50 prose-details:border prose-details:border-white/5
                prose-details:rounded-2xl prose-details:px-5 prose-details:py-3 prose-details:my-4
                prose-details:shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)]
                /* 🚀 折叠标题：紫色高亮可点击 */
                prose-summary:cursor-pointer prose-summary:text-purple-400 prose-summary:font-bold
                prose-summary:outline-none prose-summary:list-none
                hover:prose-summary:text-purple-300
              ">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {highlightKeywords.length > 0 ? highlightText(msg.content, highlightKeywords) : msg.content}
                </ReactMarkdown>
              </div>

              {/* 底部元信息：时间戳 + swipe 导航 */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-gray-600">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
                {hasSwipes && (
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => onSwipe(msg.id, 'prev')}
                      className="text-[10px] text-gray-500 hover:text-purple-400 transition-colors"
                      title="上一个"
                    >
                      ◀
                    </button>
                    <span className="text-[10px] text-gray-500">
                      {(msg.metadata!.currentSwipe ?? 0) + 1}/{msg.metadata!.swipes!.length}
                    </span>
                    <button
                      onClick={() => onSwipe(msg.id, 'next')}
                      className="text-[10px] text-gray-500 hover:text-purple-400 transition-colors"
                      title="下一个"
                    >
                      ▶
                    </button>
                  </div>
                )}
              </div>

              {/* ============================================================
                  Pain Point 2: Hover-reveal 操作按钮组
                  在气泡内部底部定位，默认 opacity-0，group-hover 时淡入
                  流式生成期间 (isGenerating) 禁用所有操作按钮
                  ============================================================ */}
              {!isEditing && (
                <div className={`
                  absolute -bottom-6 flex gap-1.5
                  opacity-0 transition-all duration-300 ease-out
                  group-hover:opacity-100
                  ${msg.role === 'user' ? 'right-0' : 'left-0'}
                `}>
                  {/* 编辑按钮（所有角色可见） */}
                  <button
                    onClick={() => onStartEdit(msg.id)}
                    disabled={isDisabled}
                    className="px-2 py-1 text-[11px] text-gray-400 hover:text-purple-400
                      bg-[#1c1d26]/80 border border-[#2a2b36] rounded-lg
                      transition-all duration-200
                      hover:border-purple-500/30 hover:bg-[#2a2b36]/80
                      disabled:opacity-30 disabled:cursor-not-allowed"
                    title="编辑此消息"
                  >
                    ✏️ 编辑
                  </button>

                  {/* 重新生成按钮（仅 AI 消息可见） */}
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => onReroll(msg.id)}
                      disabled={isDisabled}
                      className="px-2 py-1 text-[11px] text-gray-400 hover:text-purple-400
                        bg-[#1c1d26]/80 border border-[#2a2b36] rounded-lg
                        transition-all duration-200
                        hover:border-purple-500/30 hover:bg-[#2a2b36]/80
                        disabled:opacity-30 disabled:cursor-not-allowed"
                      title="重新生成此回复"
                    >
                      🔄 重来
                    </button>
                  )}

                  {/* 删除按钮（从此处截断） */}
                  <button
                    onClick={() => onDeleteFrom(msg.id)}
                    disabled={isDisabled}
                    className="px-2 py-1 text-[11px] text-gray-400 hover:text-red-400
                      bg-[#1c1d26]/80 border border-[#2a2b36] rounded-lg
                      transition-all duration-200
                      hover:border-red-500/30 hover:bg-[#2a2b36]/80
                      disabled:opacity-30 disabled:cursor-not-allowed"
                    title="从此处删除后续对话"
                  >
                    🗑️ 删除
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }, [editingMsgId, editContent, highlightKeywords, isGenerating, onSwipe, onDeleteFrom, onReroll, onStartEdit, onSubmitEdit, onCancelEdit, onSetEditContent]);

  return (
    // 【视线收拢】max-w-4xl (≈896px) 限制阅读宽度，mx-auto 居中
    <div className="flex-1 overflow-y-auto">
      <div className="w-full max-w-4xl mx-auto flex flex-col space-y-8 pt-8 pb-24 px-4 md:px-0">
        {conversations.length === 0 && !streamingContent ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm min-h-[300px]">
            开始一段新的冒险吧...
          </div>
        ) : (
          <>
            {conversations.map((msg) => renderMessage(msg))}

            {/* 流式打字机占位气泡 */}
            {streamingContent && (
              <div className="flex w-full justify-start">
                <div className="w-full bg-[#181922]/80 backdrop-blur-2xl border border-white/[0.05] rounded-[32px] rounded-tl-[8px] px-6 py-6 shadow-glass">
                  <div className="
                    prose prose-invert max-w-none min-w-0 break-words
                    prose-p:text-[16px] md:prose-p:text-[17px] prose-p:leading-[1.8] prose-p:text-gray-100 prose-p:tracking-wide
                    prose-li:text-[14px] prose-li:text-gray-400 prose-li:marker:text-purple-600/50 prose-li:my-1
                    prose-blockquote:not-italic prose-blockquote:bg-white/[0.03] prose-blockquote:border-l-[4px] prose-blockquote:border-purple-500/70 prose-blockquote:px-5 prose-blockquote:py-3 prose-blockquote:rounded-r-2xl prose-blockquote:text-gray-300 prose-blockquote:my-6
                    prose-hr:border-white/10 prose-hr:my-6
                    prose-strong:text-purple-300 prose-strong:font-bold
                    prose-details:bg-[#13141c]/50 prose-details:border prose-details:border-white/5
                    prose-details:rounded-2xl prose-details:px-5 prose-details:py-3 prose-details:my-4
                    prose-details:shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)]
                    prose-summary:cursor-pointer prose-summary:text-purple-400 prose-summary:font-bold
                    prose-summary:outline-none prose-summary:list-none
                    hover:prose-summary:text-purple-300
                  ">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                      {streamingContent}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef as React.RefObject<HTMLDivElement>} />
          </>
        )}
      </div>
    </div>
  );
};
