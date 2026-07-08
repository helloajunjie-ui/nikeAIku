// ============================================================
// InputConsole — 输入控制台（模型选择 + 记忆引擎状态 +
// 世界书/神谕/存档面板 + 输入框）
// ============================================================
import React, { useState, useEffect } from 'react';
import type { DynamicMemory, EngineStatus } from '../../types';
import type { SaveItem, AdminPlatformModel } from '../../utils/api';
import { listActiveModels } from '../../utils/api';

type InputConsoleVariant = 'header' | 'input' | 'full';

interface InputConsoleProps {
  variant?: InputConsoleVariant;
  // 剧本/存档信息
  scenarioName?: string;
  saveName?: string;
  // 模型
  modelKey: string;
  onModelKeyChange: (v: string) => void;
  // BYOK 开关
  useByok: boolean;
  onSetUseByok: (v: boolean) => void;
  // 引擎状态
  engineStatus: EngineStatus;
  // 输入
  input: string;
  isGenerating: boolean;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
  // 面板开关
  showAuthorNotes: boolean;
  authorNotes: string | null;
  showWorldbook: boolean;
  worldbookEntries: DynamicMemory[];
  editingWbId: string | null;
  editingWbContent: string;
  showSaveSwitcher: boolean;
  saveList: SaveItem[];
  lastTokenCount: number | null;
  // 面板动作
  onSetShowAuthorNotes: (v: boolean) => void;
  onSetShowWorldbook: (v: boolean) => void;
  onSetShowSaveSwitcher: (v: boolean) => void;
  onSetEditingWbId: (v: string | null) => void;
  onSetEditingWbContent: (v: string) => void;
  onOpenWorldbook: () => void;
  onSaveWbEntry: (entryId: string) => void;
  onDeleteWbEntry: (entryId: string) => void;
  onResetMemory: () => void;
  onOpenSaveSwitcher: () => void;
  onSwitchSave: (saveId: string) => void;
  onExportConversation: () => void;
  onForkSave: () => void;
}

function getUserModelPref(): { modelId: string; apiKey: string; temperature: number; maxTokens: number } | null {
  try {
    const raw = localStorage.getItem('niko_model_pref');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

export const InputConsole: React.FC<InputConsoleProps> = ({
  variant = 'full',
  scenarioName, saveName,
  modelKey, onModelKeyChange,
  useByok, onSetUseByok,
  engineStatus,
  input, isGenerating, onInputChange, onSend, onCancel,
  showAuthorNotes, authorNotes, showWorldbook, worldbookEntries,
  editingWbId, editingWbContent, showSaveSwitcher, saveList, lastTokenCount,
  onSetShowAuthorNotes, onSetShowWorldbook, onSetShowSaveSwitcher,
  onSetEditingWbId, onSetEditingWbContent,
  onOpenWorldbook, onSaveWbEntry, onDeleteWbEntry, onResetMemory,
  onOpenSaveSwitcher, onSwitchSave, onExportConversation, onForkSave,
}) => {
  const showHeader = variant === 'full' || variant === 'header';
  const showInput = variant === 'full' || variant === 'input';
  const byokCfg = (() => {
    try {
      const raw = localStorage.getItem('niko_byok_config');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
  })();

  // 平台活跃模型列表（useByok=false 时使用）
  const [platformModels, setPlatformModels] = useState<AdminPlatformModel[]>([]);
  useEffect(() => {
    if (!showHeader) return;
    listActiveModels()
      .then(setPlatformModels)
      .catch(() => {
        // 静默失败，保留空列表
      });
  }, [showHeader]);

  // 根据 useByok 决定模型选项
  const modelOptions = (() => {
    if (useByok) {
      // BYOK 模式：只显示用户配置的模型
      if (byokCfg?.model) {
        return [{ value: byokCfg.model, label: byokCfg.model }];
      }
      return [{ value: '', label: '未配置 BYOK 模型' }];
    }
    // 平台模式：显示后端活跃模型列表（后端返回多少就显示多少）
    return platformModels.map((m) => ({
      value: m.model_id,
      label: m.display_name || m.model_id,
    }));
  })();

  return (
    <div className="relative">
      {showHeader && (<>
      {/* 模型选择栏 */}
      <div className="px-4 py-1.5 bg-[#1a1b24] border-b border-[#2a2b36] relative z-50">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            {/* 剧本名（仅 header 变体显示） */}
            {scenarioName && (
              <span className="text-[11px] text-purple-300 font-medium truncate max-w-[160px]" title={scenarioName}>
                📖 {scenarioName}
                {saveName && <span className="text-gray-500 font-normal"> · {saveName}</span>}
              </span>
            )}
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">模型</span>
            <select
              value={modelKey}
              onChange={(e) => {
                if (useByok) {
                  // BYOK 模式：保存到 byok config
                  if (byokCfg) {
                    byokCfg.model = e.target.value;
                    localStorage.setItem('niko_byok_config', JSON.stringify(byokCfg));
                  }
                } else {
                  // 平台模式：保存到 model_pref
                  const pref = getUserModelPref() || { modelId: '', apiKey: '', temperature: 0.8, maxTokens: 2048 };
                  pref.modelId = e.target.value;
                  localStorage.setItem('niko_model_pref', JSON.stringify(pref));
                }
                onModelKeyChange(e.target.value);
              }}
              className="text-[11px] bg-[#252630] text-gray-300 border border-[#2a2b36] rounded px-2 py-0.5
                focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              {modelOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            {/* BYOK 互斥开关 */}
            <label className="flex items-center gap-1.5 cursor-pointer" title={useByok ? '使用自有 API' : '使用平台代理'}>
              <span className={`text-[10px] ${useByok ? 'text-green-400' : 'text-gray-600'}`}>
                {useByok ? '🔑 BYOK' : '🏢 平台'}
              </span>
              <button
                role="switch"
                aria-checked={useByok}
                onClick={() => {
                  if (!useByok && !byokCfg) {
                    // 没有 BYOK 配置时提示去设置
                    return;
                  }
                  onSetUseByok(!useByok);
                }}
                className={`relative w-7 h-4 rounded-full transition-colors ${
                  useByok ? 'bg-green-600' : 'bg-gray-600'
                }`}
                title={!byokCfg && !useByok ? '未配置 BYOK，请前往设置页配置' : ''}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                    useByok ? 'translate-x-3' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
      </div>

      {/* 记忆引擎状态指示灯 */}
      <div className="px-4 py-1 bg-[#1a1b24] border-t border-[#2a2b36]">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">记忆引擎</span>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${engineStatus.l1 === 'running' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-[10px] text-gray-500">L1</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${engineStatus.l2 === 'running' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-[10px] text-gray-500">L2</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${engineStatus.l3 === 'running' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-[10px] text-gray-500">L3</span>
          </div>
          <div className="flex-1" />
          <button onClick={onOpenWorldbook} className="text-[10px] text-gray-500 hover:text-purple-400 transition-colors" title="世界书">📖 世界书</button>
          <button onClick={onResetMemory} className="text-[10px] text-gray-500 hover:text-yellow-400 transition-colors" title="重置记忆">🔄 重置记忆</button>
          <button onClick={onOpenSaveSwitcher} className="text-[10px] text-gray-500 hover:text-purple-400 transition-colors" title="切换存档">💾 存档</button>
          <button onClick={onExportConversation} className="text-[10px] text-gray-500 hover:text-purple-400 transition-colors" title="导出对话">📥 导出</button>
          {authorNotes && (
            <button
              onClick={() => onSetShowAuthorNotes(!showAuthorNotes)}
              className={`text-[10px] transition-colors ${showAuthorNotes ? 'text-purple-400' : 'text-gray-500 hover:text-purple-400'}`}
              title="作者神谕"
            >
              📜 神谕
            </button>
          )}
          {lastTokenCount !== null && (
            <span className="text-[10px] text-gray-600">{lastTokenCount} tokens</span>
          )}
        </div>
      </div>

      {/* ===== 面板渲染函数（PC：absolute 弹出 / 移动端：Bottom Sheet） ===== */}

      {/* 作者神谕面板 */}
      {showAuthorNotes && authorNotes && (
        <>
          {/* PC 端：absolute 弹出 */}
          <div className="hidden md:block absolute bottom-full left-0 right-0 z-30 mx-4 mb-2">
            <div className="bg-[#1c1d26] border border-purple-500/30 rounded-lg p-3 max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-purple-400 uppercase tracking-wider">📜 作者神谕</span>
                <button onClick={() => onSetShowAuthorNotes(false)} className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">✕</button>
              </div>
              <p className="text-xs text-gray-400 whitespace-pre-wrap">{authorNotes}</p>
            </div>
          </div>
          {/* 移动端：Bottom Sheet */}
          <div className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-[#1c1d26] rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] p-4 max-h-[50vh] overflow-y-auto animate-slide-up">
            <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-purple-400 uppercase tracking-wider">📜 作者神谕</span>
              <button onClick={() => onSetShowAuthorNotes(false)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">✕</button>
            </div>
            <p className="text-sm text-gray-400 whitespace-pre-wrap">{authorNotes}</p>
          </div>
        </>
      )}

      {/* 世界书面板 */}
      {showWorldbook && (
        <>
          {/* PC 端：absolute 弹出 */}
          <div className="hidden md:block absolute bottom-full left-0 right-0 z-30 mx-4 mb-2">
            <div className="bg-[#1c1d26] border border-[#2a2b36] rounded-lg p-3 max-w-4xl mx-auto max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">📖 世界书</span>
                <button onClick={() => onSetShowWorldbook(false)} className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">✕</button>
              </div>
              {worldbookEntries.length === 0 ? (
                <p className="text-xs text-gray-600">暂无世界书词条</p>
              ) : (
                <div className="space-y-2">
                  {worldbookEntries.map((entry) => (
                    <div key={entry.id} className="bg-[#13141c] rounded p-2">
                      {editingWbId === entry.id ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={editingWbContent}
                            onChange={(e) => onSetEditingWbContent(e.target.value)}
                            className="w-full bg-[#1c1d26] border border-[#2a2b36] rounded p-1.5 text-xs text-gray-200
                              focus:outline-none focus:border-purple-500 resize-none"
                            rows={2}
                          />
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => onSaveWbEntry(entry.id)} className="px-2 py-0.5 text-[10px] bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors">保存</button>
                            <button onClick={() => { onSetEditingWbId(null); onSetEditingWbContent(''); }} className="px-2 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors">取消</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-[10px] text-gray-500 mb-0.5">
                              {(() => {
                                try {
                                  const parsed = typeof entry.content === 'string' ? JSON.parse(entry.content) : entry.content;
                                  return Array.isArray(parsed?.keywords) ? parsed.keywords.join(', ') : '无关键词';
                                } catch {
                                  return '无关键词';
                                }
                              })()}
                            </p>
                            <p className="text-xs text-gray-300">{typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content)}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => { onSetEditingWbId(entry.id); onSetEditingWbContent(typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content)); }} className="text-[10px] text-gray-500 hover:text-purple-400 transition-colors">✏️</button>
                            <button onClick={() => onDeleteWbEntry(entry.id)} className="text-[10px] text-gray-500 hover:text-red-400 transition-colors">🗑️</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* 移动端：Bottom Sheet */}
          <div className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-[#1c1d26] rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] p-4 max-h-[60vh] overflow-y-auto animate-slide-up">
            <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400 uppercase tracking-wider">📖 世界书</span>
              <button onClick={() => onSetShowWorldbook(false)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">✕</button>
            </div>
            {worldbookEntries.length === 0 ? (
              <p className="text-xs text-gray-600">暂无世界书词条</p>
            ) : (
              <div className="space-y-2">
                {worldbookEntries.map((entry) => (
                  <div key={entry.id} className="bg-[#13141c] rounded p-2">
                    {editingWbId === entry.id ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={editingWbContent}
                          onChange={(e) => onSetEditingWbContent(e.target.value)}
                          className="w-full bg-[#1c1d26] border border-[#2a2b36] rounded p-1.5 text-xs text-gray-200
                            focus:outline-none focus:border-purple-500 resize-none"
                          rows={2}
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => onSaveWbEntry(entry.id)} className="px-2 py-0.5 text-[10px] bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors">保存</button>
                          <button onClick={() => { onSetEditingWbId(null); onSetEditingWbContent(''); }} className="px-2 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors">取消</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-[10px] text-gray-500 mb-0.5">
                            {(() => {
                              try {
                                const parsed = typeof entry.content === 'string' ? JSON.parse(entry.content) : entry.content;
                                return Array.isArray(parsed?.keywords) ? parsed.keywords.join(', ') : '无关键词';
                              } catch {
                                return '无关键词';
                              }
                            })()}
                          </p>
                          <p className="text-xs text-gray-300">{typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content)}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => { onSetEditingWbId(entry.id); onSetEditingWbContent(typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content)); }} className="text-[10px] text-gray-500 hover:text-purple-400 transition-colors">✏️</button>
                          <button onClick={() => onDeleteWbEntry(entry.id)} className="text-[10px] text-gray-500 hover:text-red-400 transition-colors">🗑️</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 存档切换面板 */}
      {showSaveSwitcher && (
        <>
          {/* PC 端：absolute 弹出 */}
          <div className="hidden md:block absolute bottom-full left-0 right-0 z-30 mx-4 mb-2">
            <div className="bg-[#1c1d26] border border-[#2a2b36] rounded-lg p-3 max-w-4xl mx-auto max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">💾 切换存档</span>
                <button onClick={() => onSetShowSaveSwitcher(false)} className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">✕</button>
              </div>
              {saveList.length === 0 ? (
                <p className="text-xs text-gray-600">暂无云端存档</p>
              ) : (
                <div className="space-y-1">
                  {saveList.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => onSwitchSave(s.id)}
                      className="w-full text-left px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-[#252630] rounded transition-colors"
                    >
                      {s.id.slice(0, 8)}... — {new Date(s.updated_at).toLocaleDateString()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* 移动端：Bottom Sheet */}
          <div className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-[#1c1d26] rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] p-4 max-h-[60vh] overflow-y-auto animate-slide-up">
            <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400 uppercase tracking-wider">💾 切换存档</span>
              <button onClick={() => onSetShowSaveSwitcher(false)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">✕</button>
            </div>
            {saveList.length === 0 ? (
              <p className="text-xs text-gray-600">暂无云端存档</p>
            ) : (
              <div className="space-y-1">
                {saveList.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSwitchSave(s.id)}
                    className="w-full text-left px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-[#252630] rounded transition-colors"
                  >
                    {s.id.slice(0, 8)}... — {new Date(s.updated_at).toLocaleDateString()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      </>)}

      {showInput && (<>
      {/* 快速操作按钮 + 输入框 */}
      <div className="px-4 py-3 bg-[#1a1b24] border-t border-[#2a2b36]">
        <div className="flex items-center gap-2 max-w-4xl mx-auto mb-2">
          <button
            onClick={onForkSave}
            className="text-[10px] px-2 py-1 bg-[#252630] border border-[#2a2b36] rounded
              text-gray-400 hover:text-purple-400 hover:border-purple-500/30 transition-colors"
            title="创建分支存档"
          >
            🌿 分支
          </button>
        </div>
        <div className="flex gap-2 max-w-4xl mx-auto">
          <input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="输入消息..."
            disabled={isGenerating}
            className="flex-1 bg-[#252630] border border-[#2a2b36] rounded-lg px-4 py-2.5 text-sm text-gray-200
              placeholder-gray-600 focus:outline-none focus:border-purple-500 disabled:opacity-50 transition-colors"
          />
          {isGenerating ? (
            <button
              onClick={onCancel}
              className="px-4 py-2.5 bg-red-600/80 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
            >
              停止
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!input.trim()}
              className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110
                active:scale-95 active:brightness-90 text-white text-sm rounded-lg
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-300 ease-bounce-soft"
            >
              发送
            </button>
          )}
        </div>
      </div>
      </>)}
    </div>
  );
};
