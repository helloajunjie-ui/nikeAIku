// ============================================================
// Admin — 管理控制台（工业仪表盘风格）
// 仅 admin 角色可见。所有配置集中在此，与用户设置完全隔离。
// ============================================================
import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import * as api from '../utils/api';

type AdminTab = 'hub' | 'dashboard' | 'models' | 'providers' | 'users' | 'moderation';

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
  const [editingUser, setEditingUser] = useState<api.AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ username: '', role: '', password: '', points: 0 });
  const [editSaving, setEditSaving] = useState(false);

  // ---- 模型管理 ----
  const [models, setModels] = useState<api.AdminPlatformModel[]>([]);
 
  // ---- 渠道管理 ----
  const [providers, setProviders] = useState<api.AdminProvider[]>([]);
  const [showNewProvider, setShowNewProvider] = useState(false);
  const [newProvider, setNewProvider] = useState({
  	name: '',
  	base_url: '',
  	api_key: '',
  });
  const [testingProvider, setTestingProvider] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; models?: string[] } | null>(null);

  // ---- 已有渠道测试 & 导入 ----
  const [testingExistingProvider, setTestingExistingProvider] = useState<string | null>(null);
  const [existingTestResult, setExistingTestResult] = useState<{ providerId: string; success: boolean; message: string; models?: string[]; imported_count?: number } | null>(null);
  const [importingModels, setImportingModels] = useState(false);

  // ---- 编辑渠道 ----
  const [editingProvider, setEditingProvider] = useState<api.AdminProvider | null>(null);
  const [editProviderForm, setEditProviderForm] = useState({ base_url: '', api_key: '' });
  const [editProviderSaving, setEditProviderSaving] = useState(false);

  // ---- 渠道连通性 & 展开模型列表 ----
  const [providerConnectivity, setProviderConnectivity] = useState<Record<string, { online: boolean; message: string; modelCount: number; lastTested: number }>>({});
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [healthCheckLoading, setHealthCheckLoading] = useState(false);

  // ---- 内容巡查 ----
  const [flaggedScenarios, setFlaggedScenarios] = useState<api.FlaggedScenario[]>([]);

  // ---- 初始化加载 ----
  useEffect(() => {
  	if (user?.role === 'admin') {
  		loadMasterPrompt();
  		loadRegBonus();
  		loadDashboard();
  		loadUsers();
  		loadModels();
  		loadProviders();
  	}
  }, [user]);

  // ---- 按当前 tab 按需刷新（切换 tab 时自动刷新该 tab 数据） ----
  useEffect(() => {
    if (user?.role !== 'admin') return;
    switch (activeTab) {
      case 'hub':
        loadMasterPrompt();
        loadRegBonus();
        break;
      case 'dashboard':
        loadDashboard();
        break;
      case 'models':
        loadModels();
        break;
      case 'providers':
        loadProviders();
        loadProviderConnectivity();
        break;
      case 'users':
        loadUsers();
        break;
      case 'moderation':
        loadFlaggedScenarios();
        break;
    }
  }, [activeTab, user]);
 
  async function loadMasterPrompt() {
  	setMasterLoading(true);
  	try {
  		const res = await api.getMasterPrompt();
  		setMasterPrompt(res.master_prompt);
  	} catch { /* ignore */ } finally {
  		setMasterLoading(false);
  	}
  }
 
  async function loadRegBonus() {
  	try {
  		const res = await api.getGlobalConfig('register_bonus_points');
  		setRegBonus(Number(res.value) || 100);
  	} catch { /* ignore */ }
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
  		await api.updateGlobalConfig('register_bonus_points', String(regBonus));
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
 
  // ---- 渠道管理 ----
  async function loadProviders() {
  	try {
  		const list = await api.adminListProviders();
  		setProviders(list);
  	} catch { /* ignore */ }
  }

  // ---- 渠道连通性批量检测（自动同步模型到货架） ----
  async function loadProviderConnectivity() {
    try {
      const results = await api.adminBatchTestProviders();
      const now = Date.now();
      let hasNewModels = false;
      const map: Record<string, { online: boolean; message: string; modelCount: number; lastTested: number }> = {};
      for (const r of results) {
        map[r.id] = { online: r.online, message: r.message, modelCount: r.model_count, lastTested: now };
        if (r.new_models > 0) hasNewModels = true;
      }
      setProviderConnectivity(map);
      // 如果有新模型导入，刷新模型货架列表
      if (hasNewModels) {
        loadModels();
        addNotification({ type: 'success', message: '渠道连通性检测完成，新模型已自动同步到模型货架' });
      }
    } catch { /* ignore */ }
  }

  // 长间隔自动检测（60 秒轮询，仅在渠道 tab 活跃时）
  useEffect(() => {
    if (activeTab !== 'providers') return;
    const interval = setInterval(() => {
      loadProviderConnectivity();
    }, 60000);
    return () => clearInterval(interval);
  }, [activeTab]);
 
  async function handleCreateProvider(e: React.FormEvent) {
  	e.preventDefault();
  	try {
  		const result = await api.adminCreateProvider(newProvider);
  		setProviders((prev) => [...prev, result.provider]);
  		setShowNewProvider(false);
  		setNewProvider({ name: '', base_url: '', api_key: '' });
  		let msg = '渠道创建成功';
  		if (result.imported_count > 0) {
  			msg += `，已自动导入 ${result.imported_count} 个模型到模型货架`;
  			loadModels();
  		}
  		addNotification({ type: 'success', message: msg });
  	} catch {
  		addNotification({ type: 'error', message: '创建失败' });
  	}
  }
 
  async function handleToggleProvider(id: string) {
  	try {
  		const updated = await api.adminToggleProvider(id);
  		setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: updated.is_active } : p)));
  		addNotification({ type: 'success', message: `渠道已${updated.is_active ? '启用' : '禁用'}` });
  	} catch {
  		addNotification({ type: 'error', message: '操作失败' });
  	}
  }

  async function handleTestProvider() {
  	 if (!newProvider.base_url || !newProvider.api_key) {
  	   addNotification({ type: 'error', message: '请先填写 Base URL 和 API Key' });
  	   return;
  	 }
  	 setTestingProvider(true);
  	 setTestResult(null);
  	 try {
  	   const result = await api.adminTestProviderConnection({
  	     base_url: newProvider.base_url,
  	     api_key: newProvider.api_key,
  	   });
  	   setTestResult(result);
  	   if (result.success) {
  	     addNotification({ type: 'success', message: `连接成功！可用模型: ${(result.models || []).join(', ') || '未知'}` });
  	   } else {
  	     addNotification({ type: 'error', message: result.message });
  	   }
  	 } catch {
  	   setTestResult({ success: false, message: '请求失败' });
  	   addNotification({ type: 'error', message: '测试请求失败' });
  	 } finally {
  	   setTestingProvider(false);
  	 }
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

  async function handleImportModels(providerId: string, models: string[]) {
  	 setImportingModels(true);
  	 try {
  	   // 如果是新建渠道（尚未创建），先创建渠道
  	   let targetId = providerId;
  	   if (providerId === '__new__') {
  	     const result = await api.adminCreateProvider(newProvider);
  	     setProviders((prev) => [...prev, result.provider]);
  	     targetId = result.provider.id;
  	     setShowNewProvider(false);
  	     setNewProvider({ name: '', base_url: '', api_key: '' });
  	   }
  	   const result = await api.adminImportProviderModels(targetId, models);
  	   addNotification({ type: 'success', message: result.message });
  	   loadModels();
  	   loadProviders();
  	 } catch {
  	   addNotification({ type: 'error', message: '导入失败' });
  	 } finally {
  	   setImportingModels(false);
  	 }
  }

  async function handleTestExistingProvider(providerId: string) {
  	 const provider = providers.find(p => p.id === providerId);
  	 if (!provider) return;
  	 setTestingExistingProvider(providerId);
  	 setExistingTestResult(null);
  	 try {
  	   // 传入 provider_id，后端使用数据库中存储的 APIKey 测试并自动导入模型
  	   const result = await api.adminTestProviderConnection({
  	     base_url: provider.base_url,
  	     api_key: '',
  	     provider_id: providerId,
  	   });
  	   setExistingTestResult({ providerId, ...result });
  	   if (result.success) {
  	     let msg = `连接成功！可用模型: ${(result.models || []).join(', ') || '未知'}`;
  	     if (result.imported_count && result.imported_count > 0) {
  	       msg += `（已自动导入 ${result.imported_count} 个新模型到模型货架）`;
  	     }
  	     // 无论是否有新模型，都刷新模型列表和 providers（确保前端显示最新数据）
  	     loadModels();
  	     loadProviders();
  	     addNotification({ type: 'success', message: msg });
  	   } else {
  	     addNotification({ type: 'error', message: result.message });
  	   }
  	 } catch {
  	   setExistingTestResult({ providerId, success: false, message: '请求失败' });
  	   addNotification({ type: 'error', message: '测试请求失败' });
  	 } finally {
  	   setTestingExistingProvider(null);
  	 }
  }

  async function handleEditProvider(p: api.AdminProvider) {
    setEditingProvider(p);
    setEditProviderForm({ base_url: p.base_url, api_key: '' });
  }

  async function handleSaveProvider(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProvider) return;
    setEditProviderSaving(true);
    try {
      const payload: { base_url?: string; api_key?: string } = {};
      if (editProviderForm.base_url && editProviderForm.base_url !== editingProvider.base_url) payload.base_url = editProviderForm.base_url;
      if (editProviderForm.api_key) payload.api_key = editProviderForm.api_key;

      if (Object.keys(payload).length === 0) {
        addNotification({ type: 'info', message: '没有需要更新的字段' });
        setEditingProvider(null);
        return;
      }

      const result = await api.adminUpdateProvider(editingProvider.id, payload);
      // 更新 providers 列表中的该渠道
      setProviders((prev) => prev.map((p) => (p.id === editingProvider.id ? result.provider : p)));
      let msg = '渠道已更新';
      if (result.test_ok) {
        msg += '，连接测试通过';
        if (result.imported_count > 0) {
          msg += `，已自动导入 ${result.imported_count} 个新模型`;
        }
        // 刷新模型货架
        loadModels();
      } else {
        msg += '，但连接测试失败（请检查 BaseURL/APIKey）';
      }
      addNotification({ type: 'success', message: msg });
      setEditingProvider(null);
    } catch {
      addNotification({ type: 'error', message: '更新失败' });
    } finally {
      setEditProviderSaving(false);
    }
  }

  async function handleEditUser(u: api.AdminUser) {
  	 setEditingUser(u);
  	 setEditForm({ username: u.username, role: u.role, password: '', points: u.points });
  }

  async function handleSaveUser(e: React.FormEvent) {
  	 e.preventDefault();
  	 if (!editingUser) return;
  	 setEditSaving(true);
  	 try {
  	   const payload: { username?: string; role?: string; password?: string; points?: number } = {};
  	   if (editForm.username !== editingUser.username) payload.username = editForm.username;
  	   if (editForm.role !== editingUser.role) payload.role = editForm.role;
  	   if (editForm.password) payload.password = editForm.password;
  	   if (editForm.points !== editingUser.points) payload.points = editForm.points;

  	   if (Object.keys(payload).length === 0) {
  	     addNotification({ type: 'info', message: '没有需要更新的字段' });
  	     setEditingUser(null);
  	     return;
  	   }

  	   await api.adminUpdateUser(editingUser.id, payload);
  	   addNotification({ type: 'success', message: '用户已更新' });
  	   setEditingUser(null);
  	   loadUsers();
  	 } catch {
  	   addNotification({ type: 'error', message: '更新失败' });
  	 } finally {
  	   setEditSaving(false);
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
  	{ key: 'providers', label: '渠道管理', icon: '🔌' },
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
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] text-gray-600">模型通过渠道管理中的「测试并导入」自动添加，格式: [渠道名] [模型名]</p>
          </div>

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
       
       {/* ==================== 渠道管理 ==================== */}
       {activeTab === 'providers' && (
        <div>
        	<div className="mb-4">
        		<button
        			onClick={() => setShowNewProvider(!showNewProvider)}
        			className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-yellow-200 rounded text-xs font-medium transition-colors"
        		>
        			{showNewProvider ? '取消' : '+ 添加渠道'}
        		</button>
        	</div>
      
        	{showNewProvider && (
        		<form onSubmit={handleCreateProvider} className="mb-4 p-4 bg-[#1c1d26] rounded-lg border border-[#2a2b36] space-y-3">
        			<div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        				<input placeholder="渠道名称" value={newProvider.name}
        					onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
        					className="px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs" required />
        				<input placeholder="API Base URL" value={newProvider.base_url}
        					onChange={(e) => setNewProvider({ ...newProvider, base_url: e.target.value })}
        					className="px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs" required />
        				<input placeholder="API Key" value={newProvider.api_key}
        					onChange={(e) => setNewProvider({ ...newProvider, api_key: e.target.value })}
        					className="px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs" required />
        			</div>
        			<div className="flex items-center gap-2">
        				<button type="submit" className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-green-200 rounded text-xs font-medium">
        					创建
        				</button>
        				<button type="button" onClick={handleTestProvider} disabled={testingProvider}
        					className="px-4 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 text-blue-200 rounded text-xs font-medium transition-colors">
        					{testingProvider ? '测试中...' : '测试连接'}
        				</button>
        			</div>
        			{testResult && (
        				<div className={`p-2 rounded text-xs ${testResult.success ? 'bg-green-900/20 text-green-400 border border-green-800/30' : 'bg-red-900/20 text-red-400 border border-red-800/30'}`}>
        					<p className="mb-1">{testResult.message}</p>
        					{testResult.models && testResult.models.length > 0 && (
        						<>
        							<p className="mt-1 text-gray-400">可用模型: {testResult.models.join(', ')}</p>
        							<button
        								type="button"
        								onClick={() => handleImportModels('__new__', testResult.models!)}
        								disabled={importingModels}
        								className="mt-2 px-3 py-1 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 text-purple-200 rounded text-[10px] font-medium transition-colors"
        							>
        								{importingModels ? '导入中...' : '一键导入模型货架'}
        							</button>
        						</>
        					)}
        				</div>
        			)}
        		</form>
        	)}
      
        	<div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] overflow-hidden">
        		<table className="w-full text-xs">
        			<thead>
        				<tr className="border-b border-[#2a2b36] text-gray-500">
        					<th className="text-left px-3 py-2">名称</th>
        					<th className="text-left px-3 py-2">Base URL</th>
        					<th className="text-center px-3 py-2">连通性</th>
        					<th className="text-center px-3 py-2">状态</th>
        					<th className="text-center px-3 py-2">操作</th>
        				</tr>
        			</thead>
        			<tbody>
        				{providers.map((p) => {
        					const conn = providerConnectivity[p.id];
        					const providerModels = models.filter(m => m.provider_id === p.id);
        					const isExpanded = expandedProvider === p.id;
        					return (
        						<React.Fragment key={p.id}>
        							<tr className="border-b border-[#2a2b36] text-gray-400 hover:bg-[#252630]">
        								<td className="px-3 py-2">
        									<div className="flex items-center gap-2">
        										{providerModels.length > 0 && (
        											<button
        												onClick={() => setExpandedProvider(isExpanded ? null : p.id)}
        												className="text-gray-600 hover:text-gray-300 transition-colors text-xs"
        											>
        												{isExpanded ? '▼' : '▶'}
        											</button>
        										)}
        										<span className="text-gray-300">{p.name}</span>
        									</div>
        								</td>
        								<td className="px-3 py-2 font-mono text-gray-500">{p.base_url}</td>
        								<td className="px-3 py-2 text-center">
        									{conn ? (
        										<span className={`inline-flex items-center gap-1 text-[10px] ${conn.online ? 'text-green-400' : 'text-red-400'}`}>
        											<span className={`w-1.5 h-1.5 rounded-full inline-block ${conn.online ? 'bg-green-400' : 'bg-red-400'}`}></span>
        											{conn.online ? `通畅(${conn.modelCount})` : '离线'}
        										</span>
        									) : (
        										<span className="text-[10px] text-gray-600">-</span>
        									)}
        								</td>
        								<td className="px-3 py-2 text-center">
        									<span className={`px-1.5 py-0.5 rounded text-[10px] ${p.is_active ? 'bg-green-800/30 text-green-400' : 'bg-red-800/30 text-red-400'}`}>
        										{p.is_active ? '启用' : '禁用'}
        									</span>
        								</td>
        								<td className="px-3 py-2 text-center">
        									<button
        										onClick={() => handleToggleProvider(p.id)}
        										className={`text-[10px] px-1.5 py-0.5 rounded transition-colors mr-1
        											${p.is_active ? 'bg-red-800/30 text-red-400 hover:bg-red-700/50' : 'bg-green-800/30 text-green-400 hover:bg-green-700/50'}`}
        									>
        										{p.is_active ? '禁用' : '启用'}
        									</button>
        									<button
        										onClick={() => { setExistingTestResult(null); setTestingExistingProvider(p.id); }}
        										className="text-[10px] px-1.5 py-0.5 rounded bg-blue-800/30 text-blue-400 hover:bg-blue-700/50 transition-colors"
        									>
        										测试并导入
        									</button>
        									<button
        										onClick={() => handleEditProvider(p)}
        										className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-800/30 text-yellow-400 hover:bg-yellow-700/50 transition-colors"
        									>
        										编辑
        									</button>
        								</td>
        							</tr>
        							{/* 展开行：显示该渠道下的模型列表 */}
        							{isExpanded && providerModels.length > 0 && (
        								<tr className="bg-[#13141c]">
        									<td colSpan={5} className="px-6 py-2">
        										<div className="flex flex-wrap gap-1.5">
        											{providerModels.map((m) => (
        												<span key={m.id}
        													className={`px-2 py-0.5 rounded text-[10px] font-mono border
        														${m.is_active
        															? 'bg-green-900/10 border-green-800/20 text-green-400'
        															: 'bg-gray-800/30 border-gray-700/30 text-gray-500'}`}
        												>
        													{m.model_id}
        												</span>
        											))}
        										</div>
        									</td>
        								</tr>
        							)}
        						</React.Fragment>
        					);
        				})}
        			</tbody>
        		</table>
        	</div>

        	{/* 已有渠道测试弹窗 */}
        	{testingExistingProvider && (
        		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setTestingExistingProvider(null)}>
        			<div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-5 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        				<h3 className="text-sm font-bold text-gray-200 mb-4">
        					测试渠道: {providers.find(p => p.id === testingExistingProvider)?.name}
        				</h3>
        				<div className="space-y-3">
        					<p className="text-[11px] text-gray-500">点击下方按钮测试连接，可用模型将自动导入模型货架。</p>
        					<div className="flex items-center gap-2">
        						<button
        							onClick={() => handleTestExistingProvider(testingExistingProvider)}
        							disabled={testingExistingProvider === testingExistingProvider}
        							className="px-4 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 text-blue-200 rounded text-xs font-medium transition-colors"
        						>
        							{testingExistingProvider ? '测试中...' : '测试连接并导入模型'}
        						</button>
        						<button
        							onClick={() => setTestingExistingProvider(null)}
        							className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors"
        						>
        							取消
        						</button>
        					</div>
        					{existingTestResult && existingTestResult.providerId === testingExistingProvider && (
        						<div className={`p-2 rounded text-xs ${existingTestResult.success ? 'bg-green-900/20 text-green-400 border border-green-800/30' : 'bg-red-900/20 text-red-400 border border-red-800/30'}`}>
        							<p className="mb-1">{existingTestResult.message}</p>
        							{existingTestResult.models && existingTestResult.models.length > 0 && (
        								<p className="mt-1 text-gray-400">
        									可用模型: {existingTestResult.models.join(', ')}
        									{existingTestResult.imported_count ? `（已导入 ${existingTestResult.imported_count} 个新模型）` : ''}
        								</p>
        							)}
        						</div>
        					)}
        				</div>
        			</div>
        		</div>
        	)}

        	{/* 编辑渠道弹窗 */}
        	{editingProvider && (
        		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditingProvider(null)}>
        			<div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-5 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        				<h3 className="text-sm font-bold text-gray-200 mb-4">
        					编辑渠道: {editingProvider.name}
        				</h3>
        				<form onSubmit={handleSaveProvider} className="space-y-3">
        					<div>
        						<label className="text-[10px] text-gray-500 block mb-1">Base URL（留空不修改）</label>
        						<input
        							value={editProviderForm.base_url}
        							onChange={(e) => setEditProviderForm({ ...editProviderForm, base_url: e.target.value })}
        							placeholder={editingProvider.base_url}
        							className="w-full px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs"
        						/>
        					</div>
        					<div>
        						<label className="text-[10px] text-gray-500 block mb-1">API Key（留空不修改）</label>
        						<input
        							value={editProviderForm.api_key}
        							onChange={(e) => setEditProviderForm({ ...editProviderForm, api_key: e.target.value })}
        							placeholder="输入新 API Key"
        							className="w-full px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs"
        						/>
        					</div>
        					<p className="text-[10px] text-gray-600">保存后将自动测试连接并刷新模型货架。</p>
        					<div className="flex items-center gap-2">
        						<button type="submit" disabled={editProviderSaving}
        							className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-green-200 rounded text-xs font-medium transition-colors">
        							{editProviderSaving ? '保存中...' : '保存并测试'}
        						</button>
        						<button type="button" onClick={() => setEditingProvider(null)}
        							className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors">
        							取消
        						</button>
        					</div>
        				</form>
        			</div>
        		</div>
        	)}
        </div>
       )}
      
       {/* ==================== 用户资产 ==================== */}
      {activeTab === 'users' && (
        <div>
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
                  <th className="text-center px-3 py-2">操作</th>
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
                      <span className="text-[10px] text-green-400">正常</span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleEditUser(u)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-800/30 text-blue-400 hover:bg-blue-700/50 transition-colors"
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 用户编辑弹窗 */}
          {editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditingUser(null)}>
              <div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-5 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-sm font-bold text-gray-200 mb-4">编辑用户: {editingUser.username}</h3>
                <form onSubmit={handleSaveUser} className="space-y-3">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">用户名</label>
                    <input value={editForm.username}
                      onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                      className="w-full px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">角色</label>
                    <select value={editForm.role}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                      className="w-full px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs">
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">新密码（留空不修改）</label>
                    <input type="password" value={editForm.password} placeholder="留空则不修改"
                      onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                      className="w-full px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">积分（直接设定）</label>
                    <input type="number" value={editForm.points}
                      onChange={(e) => setEditForm({ ...editForm, points: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-xs" />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button type="submit" disabled={editSaving}
                      className="px-4 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-700 text-yellow-200 rounded text-xs font-medium transition-colors">
                      {editSaving ? '保存中...' : '保存'}
                    </button>
                    <button type="button" onClick={() => setEditingUser(null)}
                      className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors">
                      取消
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
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
