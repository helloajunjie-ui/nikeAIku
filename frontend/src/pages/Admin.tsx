// ============================================================
// Admin — 管理控制台（工业仪表盘风格）
// 仅 admin 角色可见。所有配置集中在此，与用户设置完全隔离。
// ============================================================
import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import * as api from '../utils/api';

type AdminTab = 'hub' | 'dashboard' | 'models' | 'users' | 'moderation';

export const Admin: React.FC = () => {
  const { user } = useAuthStore();
  const { addNotification } = useUIStore();

  const [activeTab, setActiveTab] = useState<AdminTab>('hub');

  // ---- 全局中枢 ----
  const [masterPrompt, setMasterPrompt] = useState('');
  const [masterLoading, setMasterLoading] = useState(true);
  const [masterSaving, setMasterSaving] = useState(false);
  const [regBonus, setRegBonus] = useState(100);
  const [regBonusSaving, setRegBonusSaving] = useState(false);

  // ---- 仪表盘 ----
  const [dashboard, setDashboard] = useState<api.DashboardData | null>(null);
  const [modelHealth, setModelHealth] = useState<api.ModelHealthItem[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);

  // ---- 用户管理 ----
  const [users, setUsers] = useState<api.AdminUser[]>([]);

  // ---- 模型管理 ----
  const [models, setModels] = useState<api.AdminPlatformModel[]>([]);
  const [showNewModel, setShowNewModel] = useState(false);
  const [newModel, setNewModel] = useState({
    model_id: '',
    display_name: '',
    provider_family: '',
    provider_url: '',
    cost_per_turn: 1,
    price_coeff: 1.0,
    tags: '',
  });

  // ---- 内容巡查 ----
  const [flaggedScenarios, setFlaggedScenarios] = useState<api.FlaggedScenario[]>([]);

  // ---- 初始化加载 ----
  useEffect(() => {
    if (user?.role === 'admin') {
      loadMasterPrompt();
      loadDashboard();
      loadUsers();
      loadModels();
    }
  }, [user]);

  async function loadMasterPrompt() {
    setMasterLoading(true);
    try {
      const res = await api.getMasterPrompt();
      setMasterPrompt(res.master_prompt);
    } catch { /* ignore */ } finally {
      setMasterLoading(false);
    }
  }

  async function handleSaveMaster() {
    setMasterSaving(true);
    try {
      await api.updateMasterPrompt({ master_prompt: masterPrompt });
      addNotification({ type: 'success', message: 'L-Master 已更新' });
    } catch {
      addNotification({ type: 'error', message: '保存失败' });
    } finally {
      setMasterSaving(false);
    }
  }

  async function handleSaveRegBonus() {
    setRegBonusSaving(true);
    try {
      // TODO: 后端尚无注册奖励 API，此处为预留
      addNotification({ type: 'success', message: `注册奖励已设为 ${regBonus} 积分` });
    } catch {
      addNotification({ type: 'error', message: '保存失败' });
    } finally {
      setRegBonusSaving(false);
    }
  }

  async function loadDashboard() {
    try {
      const [dash, health] = await Promise.all([
        api.adminGetDashboard(),
        api.getModelHealth(),
      ]);
      setDashboard(dash);
      setModelHealth(health);
    } catch { /* ignore */ }
  }

  async function loadUsers() {
    try {
      const list = await api.adminListUsers();
      setUsers(list);
    } catch { /* ignore */ }
  }

  async function loadModels() {
    try {
      const list = await api.adminListModels();
      setModels(list);
    } catch { /* ignore */ }
  }

  async function loadFlaggedScenarios() {
    try {
      const list = await api.adminListFlaggedScenarios();
      setFlaggedScenarios(list);
    } catch {
      addNotification({ type: 'error', message: '加载封禁列表失败' });
    }
  }

  async function handleBanScenario(id: string, reason: string) {
    try {
      await api.adminBanScenario(id, reason);
      addNotification({ type: 'success', message: '剧本已封禁' });
      loadFlaggedScenarios();
    } catch {
      addNotification({ type: 'error', message: '封禁操作失败' });
    }
  }

  async function handleToggleModel(id: string) {
    try {
      const updated = await api.adminToggleModel(id);
      setModels((prev) => prev.map((m) => (m.id === id ? updated : m)));
      addNotification({ type: 'success', message: `模型已${updated.is_active ? '启用' : '禁用'}` });
    } catch {
      addNotification({ type: 'error', message: '操作失败' });
    }
  }

  async function handleCreateModel(e: React.FormEvent) {
    e.preventDefault();
    try {
      const created = await api.adminCreateModel(newModel);
      setModels((prev) => [...prev, created]);
      setShowNewModel(false);
      setNewModel({ model_id: '', display_name: '', provider_family: '', provider_url: '', cost_per_turn: 1, price_coeff: 1.0, tags: '' });
      addNotification({ type: 'success', message: '模型创建成功' });
    } catch {
      addNotification({ type: 'error', message: '创建失败' });
    }
  }

  if (user?.role !== 'admin') {
    return (
      <div className="p-6 text-center text-gray-500">无管理员权限</div>
    );
  }

  const tabs: { key: AdminTab; label: string; icon: string }[] = [
    { key: 'hub', label: '全局中枢', icon: '🧠' },
    { key: 'dashboard', label: '仪表盘', icon: '📊' },
    { key: 'models', label: '模型货架', icon: '📦' },
    { key: 'users', label: '用户资产', icon: '👥' },
    { key: 'moderation', label: '内容巡查', icon: '🛡️' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-100 mb-6">管理控制台</h1>

      {/* 工业风标签导航 — 高密度、无玻璃拟态 */}
      <div className="flex gap-1 mb-6 bg-[#16171f] rounded-lg p-1 border border-[#2a2b36] w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === 'moderation') loadFlaggedScenarios();
              if (tab.key === 'dashboard') loadDashboard();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
              ${activeTab === tab.key
                ? 'bg-yellow-600/30 text-yellow-300'
                : 'text-gray-500 hover:text-gray-300 hover:bg-[#252630]'
              }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ==================== 全局中枢 ==================== */}
      {activeTab === 'hub' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* L-Master 全局规则 */}
          <div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-4">
            <h2 className="text-sm font-bold text-gray-200 mb-1 tracking-wide">L-Master 全局规则</h2>
            <p className="text-xs text-gray-600 mb-3">
              此规则将注入到所有剧本的 System Prompt 最顶部
            </p>
            {masterLoading ? (
              <div className="text-gray-500 text-xs">加载中...</div>
            ) : (
              <>
                <textarea
                  value={masterPrompt}
                  onChange={(e) => setMasterPrompt(e.target.value)}
                  className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs
                    focus:outline-none focus:border-yellow-600 resize-none font-mono"
                  rows={8}
                  placeholder="全局规则..."
                />
                <button
                  onClick={handleSaveMaster}
                  disabled={masterSaving}
                  className="mt-2 px-4 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-700
                    text-yellow-200 rounded text-xs font-medium transition-colors"
                >
                  {masterSaving ? '保存中...' : '保存'}
                </button>
              </>
            )}
          </div>

          {/* 注册奖励 */}
          <div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-4">
            <h2 className="text-sm font-bold text-gray-200 mb-1 tracking-wide">注册奖励</h2>
            <p className="text-xs text-gray-600 mb-3">
              新用户注册时自动赠送的积分数量
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={10000}
                value={regBonus}
                onChange={(e) => setRegBonus(Number(e.target.value))}
                className="w-32 px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
                  focus:outline-none focus:border-yellow-600"
              />
              <span className="text-xs text-gray-500">积分</span>
              <button
                onClick={handleSaveRegBonus}
                disabled={regBonusSaving}
                className="px-4 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-700
                  text-yellow-200 rounded text-xs font-medium transition-colors"
              >
                {regBonusSaving ? '保存中...' : '保存'}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              ⚠ 当前为前端预留字段，后端 API 尚未实现持久化
            </p>
          </div>
        </div>
      )}

      {/* ==================== 仪表盘 ==================== */}
      {activeTab === 'dashboard' && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="总用户" value={dashboard.total_users} />
            <StatCard label="今日新增" value={dashboard.new_users_today} />
            <StatCard label="剧本数" value={dashboard.total_scenarios} />
            <StatCard label="存档数" value={dashboard.total_saves} />
            <StatCard label="消耗积分" value={dashboard.total_points_used} />
            <StatCard label="活跃模型" value={dashboard.active_models} />
          </div>

          {/* 模型健康监测 */}
          <div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-4">
            <h3 className="text-xs font-bold text-gray-400 mb-3 tracking-wide">🔍 模型健康监测</h3>
            {healthLoading ? (
              <p className="text-xs text-gray-500">加载健康状态...</p>
            ) : modelHealth.length > 0 ? (
              <div className="space-y-1.5">
                {modelHealth.map((h) => {
                  const statusColor = h.status === '通畅' ? 'text-green-400' :
                    h.status === '拥挤' ? 'text-yellow-400' : 'text-red-400';
                  const statusBg = h.status === '通畅' ? 'bg-green-900/20 border-green-800/30' :
                    h.status === '拥挤' ? 'bg-yellow-900/20 border-yellow-800/30' : 'bg-red-900/20 border-red-800/30';
                  return (
                    <div key={h.model_id} className={`flex items-center justify-between px-3 py-1.5 rounded text-xs ${statusBg} border`}>
                      <span className="text-gray-400">{h.display_name}</span>
                      <span className={`${statusColor} font-medium`}>
                        {h.status} ({h.success_rate > 0 ? (h.success_rate * 100).toFixed(0) : '-'}% / {h.avg_latency_ms > 0 ? `${h.avg_latency_ms}ms` : '-'})
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-600">暂无健康数据（需有请求记录后生成）</p>
            )}
          </div>
        </div>
      )}

      {/* ==================== 模型货架 ==================== */}
      {activeTab === 'models' && (
        <div>
          <div className="mb-4">
            <button
              onClick={() => setShowNewModel(!showNewModel)}
              className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-yellow-200 rounded text-xs font-medium transition-colors"
            >
              {showNewModel ? '取消' : '+ 添加模型'}
            </button>
          </div>

          {showNewModel && (
            <form onSubmit={handleCreateModel} className="mb-4 p-4 bg-[#1c1d26] rounded-lg border border-[#2a2b36] space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <input placeholder="模型 ID" value={newModel.model_id}
                  onChange={(e) => setNewModel({ ...newModel, model_id: e.target.value })}
                  className="px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs" required />
                <input placeholder="显示名称" value={newModel.display_name}
                  onChange={(e) => setNewModel({ ...newModel, display_name: e.target.value })}
                  className="px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs" required />
                <input placeholder="提供商" value={newModel.provider_family}
                  onChange={(e) => setNewModel({ ...newModel, provider_family: e.target.value })}
                  className="px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs" required />
                <input placeholder="API URL" value={newModel.provider_url}
                  onChange={(e) => setNewModel({ ...newModel, provider_url: e.target.value })}
                  className="px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs" required />
                <input type="number" placeholder="每次消耗积分" value={newModel.cost_per_turn}
                  onChange={(e) => setNewModel({ ...newModel, cost_per_turn: Number(e.target.value) })}
                  className="px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs" required />
                <input type="number" step="0.1" placeholder="价格系数" value={newModel.price_coeff}
                  onChange={(e) => setNewModel({ ...newModel, price_coeff: Number(e.target.value) })}
                  className="px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs" />
                <input placeholder="标签 (逗号分隔)" value={newModel.tags}
                  onChange={(e) => setNewModel({ ...newModel, tags: e.target.value })}
                  className="px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs col-span-2 lg:col-span-3" />
              </div>
              <button type="submit" className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-green-200 rounded text-xs font-medium">
                创建
              </button>
            </form>
          )}

          <div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2b36] text-gray-500">
                  <th className="text-left px-3 py-2">模型 ID</th>
                  <th className="text-left px-3 py-2">显示名称</th>
                  <th className="text-left px-3 py-2">提供商</th>
                  <th className="text-right px-3 py-2">消耗</th>
                  <th className="text-right px-3 py-2">系数</th>
                  <th className="text-center px-3 py-2">状态</th>
                  <th className="text-center px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id} className="border-b border-[#2a2b36] text-gray-400 hover:bg-[#252630]">
                    <td className="px-3 py-2 font-mono">{m.model_id}</td>
                    <td className="px-3 py-2 text-gray-300">{m.display_name}</td>
                    <td className="px-3 py-2 text-gray-500">{m.provider_family}</td>
                    <td className="px-3 py-2 text-right">{m.cost_per_turn}</td>
                    <td className="px-3 py-2 text-right">{m.price_coeff.toFixed(1)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${m.is_active ? 'bg-green-800/30 text-green-400' : 'bg-red-800/30 text-red-400'}`}>
                        {m.is_active ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleToggleModel(m.id)}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors
                          ${m.is_active ? 'bg-red-800/30 text-red-400 hover:bg-red-700/50' : 'bg-green-800/30 text-green-400 hover:bg-green-700/50'}`}
                      >
                        {m.is_active ? '禁用' : '启用'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== 用户资产 ==================== */}
      {activeTab === 'users' && (
        <div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a2b36] text-gray-500">
                <th className="text-left px-3 py-2">ID</th>
                <th className="text-left px-3 py-2">用户名</th>
                <th className="text-right px-3 py-2">积分</th>
                <th className="text-center px-3 py-2">角色</th>
                <th className="text-center px-3 py-2">状态</th>
                <th className="text-right px-3 py-2">注册时间</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[#2a2b36] text-gray-400 hover:bg-[#252630]">
                  <td className="px-3 py-2 font-mono">{u.id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-gray-300">{u.username}</td>
                  <td className="px-3 py-2 text-right">{u.points}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${u.role === 'admin' ? 'bg-yellow-800/30 text-yellow-400' : 'bg-gray-700/30 text-gray-400'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] ${u.status === 1 ? 'text-green-400' : 'text-red-400'}`}>
                      {u.status === 1 ? '正常' : '封禁'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================== 内容巡查 ==================== */}
      {activeTab === 'moderation' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-300 tracking-wide">🛡️ 已封禁剧本</h2>
            <button
              onClick={loadFlaggedScenarios}
              className="px-3 py-1.5 bg-[#2a2b36] hover:bg-[#3a3b46] text-gray-400 rounded text-xs transition-colors"
            >
              刷新
            </button>
          </div>

          {flaggedScenarios.length === 0 ? (
            <div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-8 text-center text-gray-600 text-sm">
              暂无封禁剧本
            </div>
          ) : (
            <div className="space-y-2">
              {flaggedScenarios.map((s) => (
                <div key={s.id} className="bg-[#1c1d26] rounded-lg border border-red-900/30 p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-gray-300 text-sm font-medium">{s.title}</h3>
                      <p className="text-[10px] text-gray-600 mt-0.5">ID: {s.id} · 作者: {s.author_id}</p>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-800/30 text-red-400">已封禁</span>
                  </div>
                  {s.flag_reason && (
                    <div className="mt-2 p-2 bg-red-900/10 rounded border border-red-900/20">
                      <p className="text-[10px] text-red-400 mb-0.5">封禁理由:</p>
                      <p className="text-xs text-gray-400">{s.flag_reason}</p>
                    </div>
                  )}
                  <div className="mt-2 text-[10px] text-gray-600">
                    封禁时间: {new Date(s.updated_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#1c1d26] rounded border border-[#2a2b36] px-3 py-2.5">
      <p className="text-[10px] text-gray-500 mb-0.5 tracking-wide">{label}</p>
      <p className="text-lg font-bold text-gray-100">{value.toLocaleString()}</p>
    </div>
  );
}
