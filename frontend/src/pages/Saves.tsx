// ============================================================
// Saves — 存档管理页面（按剧本分组 → 先展示剧本列表，含封面，点击后展开存档树）
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { useUIStore } from '../stores/uiStore';
import * as api from '../utils/api';
import * as db from '../db';
import type { Scenario, Save, Conversation } from '../types';

// -----------------------------------------------------------
// 降维算法：将散落的存档节点变成带 depth 的 1D 数组
// -----------------------------------------------------------
interface FlatSaveNode {
  id: string;
  parent_id: string | null;
  name: string;
  scenario_title: string;
  scenario_id: string;
  turn?: number;
  summary?: string;
  created_at: number;
  updated_at: number;
  depth: number;
}

function flattenSaveTree(nodes: api.SaveItem[]): FlatSaveNode[] {
  const nodeMap = new Map<string, api.SaveItem[]>();
  const roots: api.SaveItem[] = [];

  for (const node of nodes) {
    if (!node.parent_sav_id) {
      roots.push(node);
    } else {
      if (!nodeMap.has(node.parent_sav_id)) nodeMap.set(node.parent_sav_id, []);
      nodeMap.get(node.parent_sav_id)!.push(node);
    }
  }

  const flatList: FlatSaveNode[] = [];

  function dfs(item: api.SaveItem, depth: number) {
    let turn: number | undefined;
    try {
      const parsed = JSON.parse(item.save_data);
      turn = parsed.currentTurn;
    } catch { /* ignore */ }

    flatList.push({
      id: item.id,
      parent_id: item.parent_sav_id || null,
      name: item.name || `存档 ${item.id.slice(0, 8)}`,
      scenario_title: item.scenario_title,
      scenario_id: item.scenario_id,
      turn,
      summary: item.name || `第 ${turn || '?'} 回合`,
      created_at: item.created_at,
      updated_at: item.updated_at,
      depth,
    });

    const children = nodeMap.get(item.id) || [];
    children.sort((a, b) => b.created_at - a.created_at);
    for (const child of children) {
      dfs(child, depth + 1);
    }
  }

  roots.sort((a, b) => b.created_at - a.created_at);
  for (const root of roots) {
    dfs(root, 0);
  }

  return flatList;
}

// -----------------------------------------------------------
// 按 scenario_id 分组的剧本摘要
// -----------------------------------------------------------
interface ScenarioGroup {
  scenario_id: string;
  scenario_title: string;
  saves: api.SaveItem[];
  last_played: number;
  total_saves: number;
}

function groupByScenario(saves: api.SaveItem[]): ScenarioGroup[] {
  const map = new Map<string, api.SaveItem[]>();
  for (const s of saves) {
    const key = s.scenario_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }

  const groups: ScenarioGroup[] = [];
  for (const [scenario_id, items] of map) {
    let maxTime = 0;
    for (const item of items) {
      if (item.updated_at > maxTime) maxTime = item.updated_at;
    }
    groups.push({
      scenario_id,
      scenario_title: items[0].scenario_title || `剧本 ${scenario_id.slice(0, 8)}`,
      saves: items,
      last_played: maxTime,
      total_saves: items.length,
    });
  }

  groups.sort((a, b) => b.last_played - a.last_played);
  return groups;
}

// -----------------------------------------------------------
// 组件
// -----------------------------------------------------------
export default function Saves() {
  const { isAuthenticated } = useAuthStore();
  const { setSave, setScenario, setConversations, setCurrentTurn, reset } = useGameStore();
  const { addNotification, navigateTo } = useUIStore();
  const [saves, setSaves] = useState<api.SaveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [coverMap, setCoverMap] = useState<Map<string, string>>(new Map());
  const coverLoadedRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadSaves();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  async function loadSaves() {
    setLoading(true);
    try {
      const data = await api.listSaves();
      setSaves(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------------------------------------
  // 加载封面：收集所有唯一 scenario_id，批量获取封面 URL
  // -----------------------------------------------------------
  useEffect(() => {
    if (saves.length === 0 || coverLoadedRef.current) return;
    coverLoadedRef.current = true;

    const ids = new Set<string>();
    for (const s of saves) ids.add(s.scenario_id);

    (async () => {
      const map = new Map<string, string>();
      const promises = Array.from(ids).map(async (id) => {
        try {
          const detail = await api.getScenario(id);
          if (detail.cover_url) map.set(id, detail.cover_url);
        } catch {
          // silently fail — 使用渐变色 fallback
        }
      });
      await Promise.all(promises);
      setCoverMap(map);
    })();
  }, [saves]);

  // -----------------------------------------------------------
  // 按剧本分组
  // -----------------------------------------------------------
  const scenarioGroups = useMemo(() => groupByScenario(saves), [saves]);

  // -----------------------------------------------------------
  // 当前选中剧本的存档树
  // -----------------------------------------------------------
  const selectedSaves = useMemo(() => {
    if (!selectedScenarioId) return [];
    return saves.filter((s) => s.scenario_id === selectedScenarioId);
  }, [saves, selectedScenarioId]);

  const flatSaves = useMemo(() => flattenSaveTree(selectedSaves), [selectedSaves]);

  // -----------------------------------------------------------
  // 删除存档
  // -----------------------------------------------------------
  const handleDeleteSave = useCallback(async (e: React.MouseEvent, saveId: string) => {
    e.stopPropagation();
    if (deletingId) return;

    const confirmed = window.confirm('确定要删除此存档吗？此操作不可撤销。');
    if (!confirmed) return;

    setDeletingId(saveId);
    try {
      await api.deleteSave(saveId);
      await db.deleteSave(saveId);
      const idb = await db.getDB();
      const convs = await db.getConversations(saveId);
      for (const msg of convs) {
        await idb.delete('conversations', msg.id);
      }
      const l1Mems = await db.getMemoriesByType(saveId, 'L1_Summary');
      for (const mem of l1Mems) {
        await idb.delete('dynamic_memories', mem.id);
      }
      const l2Mems = await db.getMemoriesByType(saveId, 'L2_Worldbook');
      for (const mem of l2Mems) {
        await idb.delete('dynamic_memories', mem.id);
      }
      const l3 = await db.getLatestMemory(saveId, 'L3_Plot');
      if (l3) await idb.delete('dynamic_memories', l3.id);

      setSaves((prev) => prev.filter((s) => s.id !== saveId));
      addNotification({ type: 'success', message: '存档已删除' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      addNotification({ type: 'error', message: `删除存档失败: ${msg}` });
    } finally {
      setDeletingId(null);
    }
  }, [deletingId, addNotification]);

  // -----------------------------------------------------------
  // 加载存档
  // -----------------------------------------------------------
  const handleLoadSave = useCallback(async (saveId: string) => {
    if (!isAuthenticated || loadingId) return;

    setLoadingId(saveId);

    try {
      const detail = await api.getSave(saveId);

      let saveData: {
        scenario?: Scenario;
        conversations?: Conversation[];
        currentTurn?: number;
      } = {};
      try {
        saveData = JSON.parse(detail.save_data);
      } catch { /* empty */ }

      let scenario: Scenario | null = saveData.scenario || null;
      if (!scenario) {
        try {
          const apiScn = await api.getScenario(detail.scenario_id);
          scenario = {
            scn_id: apiScn.id,
            author_id: apiScn.author_id || '',
            name: apiScn.title,
            intro: apiScn.intro,
            main_prompt: apiScn.blueprint_data,
            init_worldbooks: [],
            init_plot: '',
            version: 1,
            tags: [],
            cover_url: apiScn.cover_url,
            created_at: apiScn.created_at,
          };
        } catch {
          scenario = {
            scn_id: detail.scenario_id,
            author_id: '',
            name: `剧本 ${detail.scenario_id.slice(0, 8)}`,
            intro: '',
            main_prompt: '{}',
            init_worldbooks: [],
            init_plot: '',
            version: 1,
            tags: [],
            cover_url: '',
            created_at: Date.now(),
          };
        }
      }

      const localSave: Save = {
        sav_id: detail.id,
        scn_id: detail.scenario_id,
        usr_id: detail.user_id,
        name: detail.name || `存档 ${detail.id.slice(0, 8)}`,
        current_turn: saveData.currentTurn || 0,
        parent_sav_id: detail.parent_sav_id,
        created_at: detail.created_at,
        updated_at: detail.updated_at,
      };

      await db.putSave(localSave);
      if (scenario) {
        await db.putScenario(scenario);
      }
      const conversations = saveData.conversations || [];
      for (const msg of conversations) {
        await db.putConversation(msg);
      }

      reset();
      setSave(localSave);
      setScenario(scenario);
      setConversations(conversations);
      setCurrentTurn(saveData.currentTurn || 0);

      localStorage.setItem('niko_lastSaveId', localSave.sav_id);
      navigateTo('play');
      addNotification({ type: 'success', message: '已加载存档' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      addNotification({ type: 'error', message: `加载存档失败: ${msg}` });
    } finally {
      setLoadingId(null);
    }
  }, [isAuthenticated, loadingId, reset, setSave, setScenario, setConversations, setCurrentTurn, navigateTo, addNotification]);

  // -----------------------------------------------------------
  // Render: 未登录
  // -----------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="p-6 text-center text-gray-500">
        请先登录以查看存档
      </div>
    );
  }

  // -----------------------------------------------------------
  // Render: 加载中
  // -----------------------------------------------------------
  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 min-w-0 bg-[#0e0f14]">
        <div className="text-center text-gray-500 py-12">加载中...</div>
      </div>
    );
  }

  // -----------------------------------------------------------
  // Render: 无存档
  // -----------------------------------------------------------
  if (saves.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6 min-w-0 bg-[#0e0f14]">
        <h2 className="text-2xl font-bold text-gray-200 mb-8">我的存档</h2>
        <div className="text-center text-gray-500 py-12">暂无存档</div>
      </div>
    );
  }

  // -----------------------------------------------------------
  // Render: 已选中某个剧本 → 展示存档树
  // -----------------------------------------------------------
  if (selectedScenarioId) {
    const currentGroup = scenarioGroups.find((g) => g.scenario_id === selectedScenarioId);
    return (
      <div className="flex-1 overflow-y-auto p-6 min-w-0 bg-[#0e0f14]">
        {/* 返回按钮 */}
        <button
          onClick={() => setSelectedScenarioId(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors mb-6"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回剧本列表
        </button>

        {/* 剧本标题 */}
        <h2 className="text-2xl font-bold text-gray-200 mb-1">
          {currentGroup?.scenario_title || '未知剧本'}
        </h2>
        <p className="text-sm text-gray-500 mb-8">
          {currentGroup?.total_saves || 0} 个存档分支
        </p>

        {/* 存档树 */}
        {flatSaves.length === 0 ? (
          <div className="text-center text-gray-500 py-12">该剧本暂无存档</div>
        ) : (
          <div className="flex flex-col relative">
            {flatSaves.map((save) => {
              const isLoading = loadingId === save.id;
              const isDeleting = deletingId === save.id;
              const isRoot = save.depth === 0;
              const hasChildren = flatSaves.some((s) => s.parent_id === save.id);

              return (
                <div
                  key={save.id}
                  className="relative flex items-center group mb-2"
                  style={{ paddingLeft: `${save.depth * 28}px` }}
                >
                  {/* 绘制树枝连线 (L 型折线) */}
                  {save.depth > 0 && (
                    <div
                      className="absolute w-4 h-6 border-l-2 border-b-2 border-gray-600 rounded-bl-lg"
                      style={{
                        left: `${(save.depth - 1) * 28 + 12}px`,
                        top: '-10px',
                      }}
                    />
                  )}

                  {/* 存档卡片本体 (ColorOS 悬浮水生质感) */}
                  <div
                    onClick={() => !isLoading && !isDeleting && handleLoadSave(save.id)}
                    className={`
                      flex-1 flex items-center justify-between p-4 ml-4
                      bg-[#1c1d26]/80 backdrop-blur-md border border-white/5 rounded-2xl
                      hover:bg-[#252630] hover:shadow-neon-purple transition-all duration-300
                      ${isLoading || isDeleting ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
                    `}
                  >
                    <div className="flex flex-col">
                      <span className="text-gray-200 font-bold text-sm">
                        {isLoading ? '加载中...' : (
                          <>
                            第 {save.turn || '?'} 回合
                            {!isRoot && (
                              <span className="ml-2 px-2 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 rounded-full">
                                变束点
                              </span>
                            )}
                          </>
                        )}
                      </span>
                      <span className="text-gray-500 text-xs mt-1 truncate max-w-md">
                        {save.summary || '（命运的齿轮在此转动...）'}
                      </span>
                    </div>

                    {/* 操作区：悬浮显示 */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadSave(save.id);
                        }}
                        disabled={isLoading}
                        className="text-sm text-purple-400 hover:text-purple-300 disabled:opacity-30"
                      >
                        载入
                      </button>
                      <button
                        onClick={(e) => handleDeleteSave(e, save.id)}
                        disabled={isDeleting}
                        className="text-sm text-red-500/70 hover:text-red-400 disabled:opacity-30"
                      >
                        抹除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // -----------------------------------------------------------
  // Render: 剧本列表（默认视图）
  // -----------------------------------------------------------
  return (
    <div className="flex-1 overflow-y-auto p-6 min-w-0 bg-[#0e0f14]">
      <h2 className="text-2xl font-bold text-gray-200 mb-8">我的存档</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {scenarioGroups.map((group) => (
          <div
            key={group.scenario_id}
            onClick={() => setSelectedScenarioId(group.scenario_id)}
            className="rounded-[24px] bg-white/[0.02] border border-white/[0.04] overflow-hidden
              hover:bg-white/[0.04] hover:-translate-y-1 hover:shadow-neon-purple
              transition-all duration-500 ease-aqua flex flex-col cursor-pointer"
          >
            {/* 封面：有图显示图片，无图显示渐变色 fallback */}
            <div className="relative aspect-[5/7] bg-[#0d0e14] overflow-hidden">
              {coverMap.get(group.scenario_id) ? (
                <img
                  src={coverMap.get(group.scenario_id)}
                  alt={group.scenario_title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${stringToColor(group.scenario_id, 0)}, ${stringToColor(group.scenario_id, 1)})`,
                    }}
                  >
                    <span className="text-2xl font-bold text-white/80">
                      {group.scenario_title.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 底部信息 */}
            <div className="p-3 flex flex-col flex-1">
              <h3 className="text-gray-200 text-sm font-semibold truncate mb-1">
                {group.scenario_title}
              </h3>
              <div className="flex items-center justify-between text-[11px] text-gray-500 mt-auto">
                <span>{group.total_saves} 个存档</span>
                <span>{formatRelativeTime(group.last_played)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// 工具函数
// -----------------------------------------------------------

/** 根据字符串生成稳定颜色 */
function stringToColor(str: string, offset: number): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash + offset * 60) % 360 + 360) % 360;
  return `hsl(${hue}, 60%, 35%)`;
}

/** 格式化相对时间 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(timestamp).toLocaleDateString();
}
