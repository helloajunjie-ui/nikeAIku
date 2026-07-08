// ============================================================
// Lobby — 大厅页面（剧本浏览 + Fork & Copy 启动）
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { useUIStore } from '../stores/uiStore';
import { AuthModal } from '../components/AuthModal';
import * as api from '../utils/api';
import { createSaveFromApiScenario } from '../db';

export default function Lobby() {
  const { isAuthenticated, user } = useAuthStore();
  const { setSave, setScenario, reset } = useGameStore();
  const { lobbyState, setLobbyState, addNotification, navigateTo } = useUIStore();

  // 本地输入状态：从 Zustand 持久状态初始化
  const [localKeyword, setLocalKeyword] = useState(lobbyState.keyword);
  const [scenarios, setScenarios] = useState<api.ScenarioListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingIds, setStartingIds] = useState<Set<string>>(new Set());
  const [showAuth, setShowAuth] = useState(false);
  const [total, setTotal] = useState(0);
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 500ms 防抖：localKeyword 变化后等待 500ms 再同步到 Zustand
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setLobbyState({ keyword: localKeyword, page: 1 });
    }, 500);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [localKeyword]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------
  // 数据加载：依赖 lobbyState.keyword / lobbyState.page
  // -----------------------------------------------------------
  const loadScenarios = useCallback(async (keyword: string, page: number) => {
    setLoading(true);
    try {
      if (keyword.trim()) {
        const results = await api.searchScenarios(keyword);
        setScenarios(results);
        setTotal(results.length);
      } else {
        const res = await api.listScenarios({ page, page_size: pageSize });
        setScenarios(res.scenarios);
        setTotal(res.total);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // lobbyState 变化时触发 API 请求
  useEffect(() => {
    loadScenarios(lobbyState.keyword, lobbyState.page);
  }, [lobbyState.keyword, lobbyState.page]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------
  // 手动搜索（回车）
  // -----------------------------------------------------------
  const handleSearch = useCallback(() => {
    // 立即同步到 Zustand（跳过防抖）
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setLobbyState({ keyword: localKeyword, page: 1 });
  }, [localKeyword, setLobbyState]);

  const goToPage = useCallback((p: number) => {
    if (p < 1 || p > totalPages) return;
    setLobbyState({ page: p });
  }, [totalPages, setLobbyState]);

  // -----------------------------------------------------------
  // Fork & Copy: 点击"开始游玩"
  // -----------------------------------------------------------
  const handleStartPlay = useCallback(async (scenarioId: string, title: string) => {
    if (!isAuthenticated || !user) {
      setShowAuth(true);
      return;
    }

    setStartingIds((prev) => new Set(prev).add(scenarioId));

    try {
      const detail = await api.getScenario(scenarioId);
      const save = await createSaveFromApiScenario(
        {
          id: detail.id,
          title: detail.title,
          intro: detail.intro,
          blueprint_data: detail.blueprint_data,
          cover_url: detail.cover_url,
        },
        user.id,
        `${title} - 新存档`
      );

      const scenario = {
        scn_id: detail.id,
        author_id: detail.author_id || '',
        name: detail.title,
        intro: detail.intro,
        main_prompt: detail.blueprint_data,
        init_worldbooks: [],
        init_plot: '',
        version: 1,
        tags: [],
        cover_url: detail.cover_url,
        created_at: detail.created_at,
      };

      reset();
      setSave(save);
      setScenario(scenario);
      localStorage.setItem('niko_lastSaveId', save.sav_id);
      navigateTo('play');
      addNotification({ type: 'success', message: `已载入剧本: ${title}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      addNotification({ type: 'error', message: `启动失败: ${msg}` });
    } finally {
      setStartingIds((prev) => {
        const next = new Set(prev);
        next.delete(scenarioId);
        return next;
      });
    }
  }, [isAuthenticated, user, reset, setSave, setScenario, navigateTo, addNotification]);

  // -----------------------------------------------------------
  // Render
  // -----------------------------------------------------------
  return (
    <div className="p-6 md:p-6 px-4 pb-24 md:pb-6 max-w-5xl mx-auto">
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">剧本大厅</h1>
      </div>

      {/* Search — 500ms 防抖自动搜索 + 回车手动搜索 */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="搜索剧本...（停止输入 500ms 后自动搜索）"
          value={localKeyword}
          onChange={(e) => setLocalKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 px-4 py-2 bg-[#1c1d26] border border-[#2a2b36] rounded-lg text-gray-200 text-sm
            focus:outline-none focus:border-purple-500"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm transition-colors"
        >
          搜索
        </button>
      </div>

      {/* Scenario Grid */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">加载中...</div>
      ) : scenarios.length === 0 ? (
        <div className="text-center text-gray-500 py-12">暂无剧本</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {scenarios.map((s) => {
              const isStarting = startingIds.has(s.id);
              return (
                <div
                  key={s.id}
                  className="rounded-[24px] bg-white/[0.02] border border-white/[0.04] overflow-hidden
                    hover:bg-white/[0.04] hover:-translate-y-1 hover:shadow-neon-purple
                    transition-all duration-500 ease-aqua flex flex-col"
                >
                  {/* 扑克牌比例封面 */}
                  <div className="relative aspect-[5/7] bg-[#0d0e14] overflow-hidden">
                    {s.cover_url ? (
                      <img
                        src={s.cover_url}
                        alt={s.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-700">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      </div>
                    )}
                    {s.edited_by_admin && (
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] bg-gradient-to-r from-purple-600/60 to-yellow-600/40 text-yellow-300 border border-yellow-500/40 backdrop-blur-sm">
                        ✨ 官方
                      </span>
                    )}
                  </div>
                  {/* 底部信息 */}
                  <div className="p-3 flex flex-col flex-1">
                    <h3 className="text-gray-200 text-sm font-semibold truncate mb-1">
                      {s.title}
                    </h3>
                    <p className="text-gray-500 text-[11px] line-clamp-2 mb-2 flex-1">{s.intro || '暂无简介'}</p>
                    <div className="flex items-center justify-between text-[10px] text-gray-600 mb-2">
                      <span>⬇ {s.downloads}</span>
                      <span>{new Date(s.created_at).toLocaleDateString()}</span>
                    </div>
                    <button
                      onClick={() => handleStartPlay(s.id, s.title)}
                      disabled={isStarting}
                      className={`w-full py-1.5 rounded text-xs font-medium transition-all duration-300 ease-bounce-soft ${
                        isStarting
                          ? 'bg-purple-600/50 text-purple-300 cursor-not-allowed'
                          : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110 active:scale-95 active:brightness-90 text-white'
                      }`}
                    >
                      {isStarting ? '载入中...' : '开始游玩'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 分页控件 — 非搜索模式才显示 */}
          {!lobbyState.keyword.trim() && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => goToPage(lobbyState.page - 1)}
                disabled={lobbyState.page <= 1}
                className="px-3 py-1.5 rounded text-sm bg-[#1c1d26] border border-[#2a2b36] text-gray-400
                  hover:border-purple-500/50 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - lobbyState.page) <= 2)
                .map((p, idx, arr) => (
                  <React.Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="text-gray-600 px-1">...</span>
                    )}
                    <button
                      onClick={() => goToPage(p)}
                      className={`px-3 py-1.5 rounded text-sm transition-colors ${
                        p === lobbyState.page
                          ? 'bg-purple-600 text-white'
                          : 'bg-[#1c1d26] border border-[#2a2b36] text-gray-400 hover:border-purple-500/50 hover:text-gray-200'
                      }`}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                ))}
              <button
                onClick={() => goToPage(lobbyState.page + 1)}
                disabled={lobbyState.page >= totalPages}
                className="px-3 py-1.5 rounded text-sm bg-[#1c1d26] border border-[#2a2b36] text-gray-400
                  hover:border-purple-500/50 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                下一页
              </button>
              <span className="text-xs text-gray-600 ml-2">
                共 {total} 个剧本
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
