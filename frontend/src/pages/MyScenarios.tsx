// ============================================================
// MyScenarios — 我的作品列表（作者视角的剧本管理页）
// 点击"创作"导航到此页，显示当前用户的所有剧本
// 每张卡片提供：编辑、删除入口
// ============================================================
import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import * as api from '../utils/api';

export const MyScenarios: React.FC = () => {
  const { isAuthenticated, user } = useAuthStore();
  const { addNotification, navigateTo, navigateToEditor } = useUIStore();

  const [scenarios, setScenarios] = useState<api.ScenarioListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }
    loadMyScenarios();
  }, [isAuthenticated, user]);

  async function loadMyScenarios() {
    setLoading(true);
    try {
      const res = await api.listScenarios({
        page: 1,
        page_size: 100,
        author_id: user!.id,
      });
      // 按创建时间倒序
      const list = [...res.scenarios].sort((a, b) => b.created_at - a.created_at);
      setScenarios(list);
    } catch {
      addNotification({ type: 'error', message: '加载作品列表失败' });
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(id: string) {
    navigateToEditor(id);
  }

  function handleCreateNew() {
    navigateTo('creator');
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`确定要删除剧本「${title}」吗？此操作不可撤销。`)) return;
    setDeletingId(id);
    try {
      await api.deleteScenario(id);
      addNotification({ type: 'success', message: `剧本「${title}」已删除` });
      // 从列表中移除
      setScenarios((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除失败';
      addNotification({ type: 'error', message: msg });
    } finally {
      setDeletingId(null);
    }
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="p-6 text-center text-gray-500">
        请先登录以管理你的作品
      </div>
    );
  }

  return (
    <div className="p-6 md:p-6 px-4 pb-24 md:pb-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">我的作品</h1>
          <p className="text-sm text-gray-500 mt-1">
            共 {scenarios.length} 个剧本
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          ✏️ 创作新剧本
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">加载中...</div>
      ) : scenarios.length === 0 ? (
        <div className="text-center text-gray-500 py-12 border-2 border-dashed border-[#2a2b36] rounded-lg">
          <p className="text-lg mb-2">还没有作品</p>
          <p className="text-sm text-gray-600 mb-4">点击上方按钮创建你的第一个剧本</p>
          <button
            onClick={handleCreateNew}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110
              active:scale-95 active:brightness-90 text-white rounded-lg text-sm
              transition-all duration-300 ease-bounce-soft"
          >
            ✏️ 开始创作
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {scenarios.map((s) => (
            <div
              key={s.id}
              className="rounded-[24px] bg-white/[0.02] border border-white/[0.04] p-4
                hover:bg-white/[0.04] hover:-translate-y-1 hover:shadow-neon-purple
                transition-all duration-500 ease-aqua flex items-center gap-4"
            >
              {/* Cover */}
              <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-[#0d0e14] border border-[#2a2b36]">
                {s.cover_url ? (
                  <img src={s.cover_url} alt={s.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                    无图
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-gray-200 font-semibold truncate">{s.title}</h3>
                  {s.edited_by_admin && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-gradient-to-r from-purple-600/40 to-yellow-600/30 text-yellow-300 border border-yellow-500/30 flex-shrink-0">
                      ✨ 官方润色
                    </span>
                  )}
                </div>
                <p className="text-gray-500 text-xs mt-1 line-clamp-1">{s.intro || '暂无简介'}</p>
                <div className="flex items-center gap-3 text-xs text-gray-600 mt-1.5">
                  <span>⬇ {s.downloads}</span>
                  <span>{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center gap-2">
                <button
                  onClick={() => handleEdit(s.id)}
                  className="px-3 py-1.5 text-xs bg-[#252630] border border-[#2a2b36] text-gray-400
                    rounded hover:text-purple-300 hover:border-purple-500/50 transition-colors"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(s.id, s.title)}
                  disabled={deletingId === s.id}
                  className="px-3 py-1.5 text-xs bg-[#252630] border border-[#2a2b36] text-gray-500
                    rounded hover:text-red-400 hover:border-red-500/50 transition-colors disabled:opacity-30"
                >
                  {deletingId === s.id ? '...' : '删除'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
