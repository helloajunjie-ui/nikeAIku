// ============================================================
// Settings — 个人设置页面（仅普通用户配置）
// 不包含任何管理端功能。L-Master、模型定价等已迁移至 Admin。
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import * as api from '../utils/api';
import * as db from '../db';
import { encrypt, decrypt } from '../utils/crypto';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';

// BYOK 配置的 localStorage key
const BYOK_CONFIG_KEY = 'niko_byok_config';

interface ByokConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

function loadByokConfig(): ByokConfig {
  try {
    const raw = localStorage.getItem(BYOK_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { endpoint: 'https://api.openai.com/v1', apiKey: '', model: '' };
}

function saveByokConfig(cfg: ByokConfig) {
  localStorage.setItem(BYOK_CONFIG_KEY, JSON.stringify(cfg));
}

type SettingsTab = 'account' | 'byok' | 'data';

export const Settings: React.FC = () => {
  const { addNotification } = useUIStore();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  // ---- BYOK 真实 API 握手状态 ----
  const [byokConfig, setByokConfig] = useState<ByokConfig>(loadByokConfig);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [fetchSuccess, setFetchSuccess] = useState(false);

  // F-36/F-38: 零信任加密
  const [cryptoPassword, setCryptoPassword] = useState('');
  const [syncingKey, setSyncingKey] = useState(false);
  const [cloudKeyExists, setCloudKeyExists] = useState(false);

  // F-09: 数据导入/导出
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  /** 导出全部数据为 JSON 文件 */
  async function handleExportData() {
    setExporting(true);
    try {
      const [scenarios, saves] = await Promise.all([
        db.getAllScenarios(),
        db.getAllSaves(),
      ]);

      const allConversations: any[] = [];
      const allMemories: any[] = [];
      for (const save of saves) {
        const [convs, mems] = await Promise.all([
          db.getConversations(save.sav_id),
          db.getMemoriesByType(save.sav_id, 'L2_Worldbook'),
        ]);
        allConversations.push(...convs);
        allMemories.push(...mems);
        const l3 = await db.getLatestMemory(save.sav_id, 'L3_Plot');
        if (l3) allMemories.push(l3);
      }

      const exportData = {
        version: 1,
        exported_at: Date.now(),
        scenarios,
        saves,
        conversations: allConversations,
        memories: allMemories,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `niko-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addNotification({ type: 'success', message: `已导出 ${saves.length} 个存档` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导出失败';
      addNotification({ type: 'error', message: msg });
    } finally {
      setExporting(false);
    }
  }

  /** 从 JSON 文件导入数据 */
  async function handleImportData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.version || !data.scenarios) {
        throw new Error('无效的备份文件格式');
      }

      let imported = 0;
      if (Array.isArray(data.scenarios)) {
        for (const scn of data.scenarios) {
          await db.putScenario(scn);
          imported++;
        }
      }
      if (Array.isArray(data.saves)) {
        for (const save of data.saves) {
          await db.putSave(save);
          imported++;
        }
      }
      if (Array.isArray(data.conversations)) {
        for (const msg of data.conversations) {
          await db.putConversation(msg);
          imported++;
        }
      }
      if (Array.isArray(data.memories)) {
        for (const mem of data.memories) {
          await db.putMemory(mem);
          imported++;
        }
      }

      addNotification({ type: 'success', message: `已导入 ${imported} 条数据` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导入失败';
      addNotification({ type: 'error', message: `导入失败: ${msg}` });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  // 加载时检查云端是否有加密密钥
  useEffect(() => {
    (async () => {
      try {
        await api.getEncryptedKey();
        setCloudKeyExists(true);
      } catch {
        setCloudKeyExists(false);
      }
    })();
  }, []);

  // ---- BYOK 核心：测试连接并动态拉取模型列表 ----
  async function handleFetchModels() {
    if (!byokConfig.apiKey.trim()) {
      setFetchError('必须填写 API Key');
      return;
    }
    setIsFetching(true);
    setFetchError('');
    setFetchSuccess(false);
    setFetchedModels([]);

    try {
      const cleanEndpoint = byokConfig.endpoint.replace(/\/+$/, '');
      const res = await fetch(`${cleanEndpoint}/models`, {
        headers: { 'Authorization': `Bearer ${byokConfig.apiKey}` },
      });

      if (!res.ok) {
        throw new Error(`连接失败 (HTTP ${res.status})`);
      }

      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
        const modelIds = json.data.map((m: any) => m.id);
        setFetchedModels(modelIds);
        if (modelIds.length > 0) {
          // 如果当前已选模型在列表中则保留，否则默认选第一个
          if (!modelIds.includes(byokConfig.model)) {
            setByokConfig((prev) => ({ ...prev, model: modelIds[0] }));
          }
        }
        setFetchSuccess(true);
      } else {
        throw new Error('API 返回格式异常：缺少 data 数组');
      }
    } catch (err: any) {
      const msg = err.message || '网络或凭证错误';
      setFetchError(msg);
    } finally {
      setIsFetching(false);
    }
  }

  // ---- BYOK 保存配置 ----
  function handleSaveByokConfig() {
    saveByokConfig(byokConfig);
    addNotification({ type: 'success', message: 'BYOK 配置已保存' });
  }

  // F-36/F-38: 加密 API Key 并上传到服务器
  async function handleSyncToCloud() {
    if (!cryptoPassword.trim()) {
      addNotification({ type: 'warning', message: '请先设置加密密码' });
      return;
    }
    if (!byokConfig.apiKey.trim()) {
      addNotification({ type: 'warning', message: '没有 API Key 需要加密同步' });
      return;
    }
    setSyncingKey(true);
    try {
      const encrypted = await encrypt(byokConfig.apiKey, cryptoPassword);
      await api.saveEncryptedKey(encrypted);
      setCloudKeyExists(true);
      addNotification({ type: 'success', message: 'API Key 已加密同步到云端' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '同步失败';
      addNotification({ type: 'error', message: msg });
    } finally {
      setSyncingKey(false);
    }
  }

  // F-37: 从云端下载并解密 API Key
  async function handleDecryptFromCloud() {
    if (!cryptoPassword.trim()) {
      addNotification({ type: 'warning', message: '请输入加密密码' });
      return;
    }
    setSyncingKey(true);
    try {
      const { encrypted_blob } = await api.getEncryptedKey();
      const decrypted = await decrypt(encrypted_blob, cryptoPassword);
      setByokConfig((prev) => ({ ...prev, apiKey: decrypted }));
      addNotification({ type: 'success', message: 'API Key 已从云端解密并加载' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '解密失败';
      addNotification({ type: 'error', message: msg });
    } finally {
      setSyncingKey(false);
    }
  }

  const tabs: { key: SettingsTab; label: string; icon: string }[] = [
    { key: 'account', label: '账号与资产', icon: '👤' },
    { key: 'byok', label: '算力通道', icon: '🔌' },
    { key: 'data', label: '数据管理', icon: '💾' },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-100 mb-6">设置</h1>

      {/* 垂直标签页导航 */}
      <div className="flex gap-6">
        <div className="w-40 shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-left transition-colors
                ${activeTab === tab.key
                  ? 'bg-purple-600/20 text-purple-300 border-l-2 border-purple-500'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#252630] border-l-2 border-transparent'
                }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="flex-1 min-w-0">
          {/* ========== 账号与资产 ========== */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              <div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-4">
                <h2 className="text-lg font-semibold text-gray-200 mb-3">账号信息</h2>
                {user ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1.5 border-b border-[#2a2b36]">
                      <span className="text-gray-400">用户名</span>
                      <span className="text-gray-200">{user.username}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-[#2a2b36]">
                      <span className="text-gray-400">角色</span>
                      <span className="text-gray-200">{user.role === 'admin' ? '管理员' : '用户'}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-gray-400">积分余额</span>
                      <span className="text-purple-300 font-semibold">{user.points}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">未登录</p>
                )}
              </div>

              {/* 关于 */}
              <div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-4">
                <h2 className="text-lg font-semibold text-gray-200 mb-2">关于</h2>
                <p className="text-sm text-gray-400">
                  NIKO酒馆 v0.1.0 — 多级记忆流 AI 角色扮演引擎
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  基于 L0/L1/L2/L3 四层记忆架构，支持 SCN/SAV 隔离、FTS5 全文搜索、流式对话
                </p>
              </div>
            </div>
          )}

          {/* ========== 算力通道 (BYOK) — 真实 API 握手 ========== */}
          {activeTab === 'byok' && (
            <div className="space-y-4">
              <div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-4">
                <h2 className="text-lg font-semibold text-gray-200 mb-2">🔌 BYOK 直连配置</h2>
                <p className="text-xs text-gray-500 mb-4">
                  填写你的 API 端点和 Key，系统将真实连接大模型服务器并拉取可用模型列表。
                  配置保存后，对话请求将直连大模型，不经过本服务器。
                </p>

                <div className="space-y-4">
                  {/* 1. API 端点 */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">API 端点</label>
                    <input
                      type="text"
                      value={byokConfig.endpoint}
                      onChange={(e) => {
                        setByokConfig((prev) => ({ ...prev, endpoint: e.target.value }));
                        setFetchSuccess(false);
                        setFetchedModels([]);
                      }}
                      className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
                        focus:outline-none focus:border-purple-500"
                      placeholder="https://api.openai.com/v1"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      OpenAI 兼容 API 端点，支持自定义中转地址
                    </p>
                  </div>

                  {/* 2. API Key (password 掩码) */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">API Key</label>
                    <input
                      type="password"
                      value={byokConfig.apiKey}
                      onChange={(e) => {
                        setByokConfig((prev) => ({ ...prev, apiKey: e.target.value }));
                        setFetchSuccess(false);
                        setFetchedModels([]);
                      }}
                      className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
                        focus:outline-none focus:border-purple-500"
                      placeholder="sk-..."
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      你的私密 Key，仅存于本地浏览器，不会发送到本服务器
                    </p>
                  </div>

                  {/* 3. 测试连接并获取模型 */}
                  <div>
                    <button
                      type="button"
                      onClick={handleFetchModels}
                      disabled={isFetching || !byokConfig.apiKey.trim()}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600
                        text-white rounded text-sm transition-colors"
                    >
                      {isFetching ? '⏳ 连接中...' : '⚡ 测试连接并获取模型'}
                    </button>
                  </div>

                  {/* 状态反馈：错误 */}
                  {fetchError && (
                    <div className="px-3 py-2 bg-red-900/30 border border-red-700/40 rounded text-sm text-red-300">
                      ❌ {fetchError}
                    </div>
                  )}

                  {/* 状态反馈：成功 */}
                  {fetchSuccess && (
                    <div className="px-3 py-2 bg-green-900/30 border border-green-700/40 rounded text-sm text-green-300">
                      ✅ 连接成功！已获取 {fetchedModels.length} 个模型
                    </div>
                  )}

                  {/* 4. 动态模型选择器（仅拉取成功后显示） */}
                  {fetchedModels.length > 0 && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">选择模型</label>
                      <select
                        value={byokConfig.model}
                        onChange={(e) => setByokConfig((prev) => ({ ...prev, model: e.target.value }))}
                        className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
                          focus:outline-none focus:border-purple-500"
                      >
                        {fetchedModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-600 mt-1">
                        共 {fetchedModels.length} 个模型，选择后保存配置
                      </p>
                    </div>
                  )}

                  {/* 5. 保存 BYOK 配置 */}
                  <div className="pt-2 border-t border-[#2a2b36]">
                    <button
                      type="button"
                      onClick={handleSaveByokConfig}
                      className="px-4 py-2 bg-green-700 hover:bg-green-600 text-green-200 rounded text-sm transition-colors"
                    >
                      💾 保存 BYOK 配置
                    </button>
                    {byokConfig.model && (
                      <span className="ml-3 text-xs text-gray-500">
                        当前配置：{byokConfig.endpoint} → {byokConfig.model}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 零信任加密 */}
              <div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-4">
                <h2 className="text-lg font-semibold text-gray-200 mb-2">
                  🔐 零信任加密
                  {cloudKeyExists && <span className="ml-2 text-xs text-green-400">(云端有加密密钥)</span>}
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                  API Key 使用 AES-GCM 端侧加密后上传到服务器。服务器仅存储密文 BLOB，永不解密。
                  加密密码仅存于你的记忆中，丢失无法找回。
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">加密密码</label>
                    <input
                      type="password"
                      value={cryptoPassword}
                      onChange={(e) => setCryptoPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
                        focus:outline-none focus:border-purple-500"
                      placeholder="输入密码用于加密/解密 API Key"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      使用 PBKDF2 (600,000 次迭代) + AES-256-GCM 加密
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSyncToCloud}
                      disabled={syncingKey || !cryptoPassword.trim()}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600
                        text-white rounded text-sm transition-colors"
                    >
                      {syncingKey ? '处理中...' : '⬆ 加密同步到云端'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDecryptFromCloud}
                      disabled={syncingKey || !cryptoPassword.trim() || !cloudKeyExists}
                      className="px-4 py-2 bg-[#1c1d26] border border-[#2a2b36] text-gray-400
                        hover:text-gray-200 hover:border-purple-500/50 disabled:opacity-40
                        rounded text-sm transition-colors"
                    >
                      ⬇ 从云端解密加载
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========== 数据管理 ========== */}
          {activeTab === 'data' && (
            <div className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-4">
              <h2 className="text-lg font-semibold text-gray-200 mb-2">💾 数据管理</h2>
              <p className="text-xs text-gray-500 mb-4">
                导出全部数据为 JSON 备份文件，或从备份文件恢复。数据包含剧本、存档、对话历史和记忆数据。
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={exporting}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600
                    text-white rounded text-sm transition-colors"
                >
                  {exporting ? '⏳ 导出中...' : '⬇ 导出全部数据'}
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportData}
                  disabled={importing}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  disabled={importing}
                  className="px-4 py-2 bg-[#1c1d26] border border-[#2a2b36] text-gray-400
                    hover:text-gray-200 hover:border-purple-500/50 disabled:opacity-40
                    rounded text-sm transition-colors"
                >
                  {importing ? '⏳ 导入中...' : '📂 从备份恢复'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
