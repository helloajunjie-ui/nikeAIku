// ============================================================
// MemoryInspector — 潜意识中枢
// 实时从 IndexedDB 拉取 L1/L2/L3 动态记忆，以 currentTurn 为心跳
// ============================================================
import { useEffect, useState } from 'react';
import * as db from '../../db';
import type { DynamicMemory } from '../../types';

interface MemoryInspectorProps {
  savId: string | undefined;
  currentTurn: number;
}

interface MemorySnapshot {
  l1: DynamicMemory[];
  l2: DynamicMemory[];
  l3: DynamicMemory[];
}

/**
 * 动态类型调色盘 — 用颜色降低认知负荷
 * 人物=幽蓝 🔵  地点=翠绿 🟢  物品=琥珀 🟠  设定=紫红 🟣
 */
const getTypeBadgeStyle = (type: string): string => {
  const t = type.toLowerCase();
  if (t.includes('人') || t.includes('角色') || t.includes('npc')) {
    return 'bg-blue-900/30 text-blue-400 border-blue-500/30';
  }
  if (t.includes('地') || t.includes('场景') || t.includes('区域')) {
    return 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30';
  }
  if (t.includes('物') || t.includes('道具') || t.includes('装备')) {
    return 'bg-amber-900/30 text-amber-400 border-amber-500/30';
  }
  if (t.includes('设') || t.includes('系统') || t.includes('机制') || t.includes('阵营')) {
    return 'bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30';
  }
  return 'bg-gray-800/50 text-gray-400 border-gray-500/30';
};

export default function MemoryInspector({ savId, currentTurn }: MemoryInspectorProps) {
  const [memories, setMemories] = useState<MemorySnapshot>({ l1: [], l2: [], l3: [] });
  const [loading, setLoading] = useState(false);

  // 监听回合数变化，实时从 IndexedDB 拉取最新潜意识
  useEffect(() => {
    async function fetchMemories() {
      if (!savId) return;
      setLoading(true);
      try {
        const [l1, l2, l3] = await Promise.all([
          db.getMemoriesByType(savId, 'L1_Summary'),
          db.getMemoriesByType(savId, 'L2_Worldbook'),
          db.getMemoriesByType(savId, 'L3_Plot'),
        ]);

        setMemories({
          l1: l1.sort((a, b) => (b.created_at || b.turn) - (a.created_at || a.turn)),
          l2: l2.sort((a, b) => (b.created_at || b.turn) - (a.created_at || a.turn)),
          l3: l3.sort((a, b) => (b.created_at || b.turn) - (a.created_at || a.turn)),
        });
      } catch (e) {
        console.error('[MemoryInspector] 拉取记忆失败:', e);
      } finally {
        setLoading(false);
      }
    }

    // 延迟 1.5s，给后台 MemoryLoaderService 写入留出时间
    const timer = setTimeout(fetchMemories, 1500);
    return () => clearTimeout(timer);
  }, [savId, currentTurn]);

  // 提取 L3 描述文本
  const latestL3 = memories.l3[0];
  const l3Description: string =
    latestL3?.content?.description ||
    latestL3?.content ||
    '暂无状态锚点，AI 正处于自由演算模式...';

  return (
    <div className="flex flex-col h-full overflow-hidden text-gray-300">
      {/* 标题栏 */}
      <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
        <h3 className="text-sm font-bold tracking-widest text-purple-400 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${loading ? 'bg-purple-500 animate-pulse' : 'bg-purple-500/50'} shadow-[0_0_6px_rgba(168,85,247,0.5)]`} />
          潜意识中枢
        </h3>
        <span className="text-[10px] text-gray-500 font-mono">TURN {currentTurn}</span>
      </div>

      {/* 监控区（可滚动） */}
      <div className="flex-1 overflow-y-auto p-5 space-y-8 scroll-smooth scrollbar-thin">

        {/* 🎬 L3 全局剧情状态机 */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400">L3</span>
            <h4 className="text-xs font-bold text-gray-400">全局剧情状态机</h4>
          </div>
          <div className="p-3 rounded-xl bg-blue-900/10 border border-blue-500/20 text-xs leading-relaxed text-blue-200/80 shadow-[inset_0_0_12px_rgba(59,130,246,0.05)]">
            {l3Description}
          </div>
        </section>

        {/* 📖 L2 动态实体（世界书）— 四要素卡片 */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">L2</span>
            <h4 className="text-xs font-bold text-gray-400">实体演化雷达 ({memories.l2.length})</h4>
          </div>
          <div className="flex flex-col gap-2">
            {memories.l2.length === 0 && (
              <p className="text-xs text-gray-600 italic">尚未提取到高优实体...</p>
            )}
            {memories.l2.slice(0, 8).map((m, i) => {
              // 兼容新旧数据结构（keyword / keywords 两种字段名）
              const contentObj: Record<string, unknown> = (m.content as Record<string, unknown>) || {};
              const name = (contentObj.name as string) || (Array.isArray(contentObj.keywords) ? (contentObj.keywords as string[])[0] : Array.isArray(contentObj.keyword) ? (contentObj.keyword as string[])[0] : '') || '未知实体';
              const type = (contentObj.type as string) || '设定';
              const desc = (contentObj.description as string) || (contentObj.content as string) || '暂无详细记录';
              // 防御性提取：优先 keywords（新），其次 keyword（旧），兜底用 name
              const keywords: string[] = Array.isArray(contentObj.keywords)
                ? contentObj.keywords as string[]
                : Array.isArray(contentObj.keyword)
                  ? contentObj.keyword as string[]
                  : [name];

              const badgeStyle = getTypeBadgeStyle(type);

              return (
                <details key={m.id || i} className="group rounded-lg bg-white/[0.02] border border-white/5 cursor-pointer overflow-hidden transition-all">
                  {/* 常态/标题栏 */}
                  <summary className="p-2 text-xs font-bold text-gray-200 outline-none list-none flex items-center justify-between hover:bg-white/[0.02]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-1.5 py-0.5 text-[10px] rounded border shrink-0 ${badgeStyle}`}>
                        {type}
                      </span>
                      <span className="truncate tracking-wide">{name}</span>
                    </div>
                    <span className="text-gray-600 group-open:rotate-180 transition-transform duration-300 shrink-0 ml-1">▼</span>
                  </summary>

                  {/* 展开内容区 */}
                  <div className="px-3 pb-3 pt-1 border-t border-white/5 bg-black/20">
                    {/* 激活词 Badge */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      <span className="text-[9px] text-gray-500 mt-0.5">激活词:</span>
                      {keywords.map((kw, idx) => (
                        <span key={idx} className="px-1 py-0.5 text-[9px] bg-white/5 text-gray-400 rounded">
                          #{kw}
                        </span>
                      ))}
                    </div>
                    {/* 实体内容 */}
                    <p className="text-[11px] leading-relaxed text-gray-300">
                      {desc}
                    </p>
                  </div>
                </details>
              );
            })}

            {/* 隐藏提示：如果总数超过 8 条，优雅地提示潜意识还在深处 */}
            {memories.l2.length > 8 && (
              <div className="text-center mt-2 pt-2 border-t border-white/5">
                <span className="text-[10px] text-gray-600 italic tracking-widest">
                  ... 深层潜意识中还有 {memories.l2.length - 8} 个实体
                </span>
              </div>
            )}
          </div>
        </section>

        {/* 🧠 L1 历史快照（日志）— 命运丝线 */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">L1</span>
            <h4 className="text-xs font-bold text-gray-400">快照压缩日志 ({memories.l1.length})</h4>
          </div>
          <div className="relative border-l-2 border-emerald-500/20 ml-2.5 pl-4 space-y-5 py-1">
            {memories.l1.length === 0 && (
              <p className="text-xs text-gray-600 italic">记忆库尚未满，等待第一次压缩...</p>
            )}
            {memories.l1.slice(0, 5).map((m, i) => {
              const desc: string = m.content?.description || m.content || '';
              return (
                <div key={m.id || i} className="relative group">
                  <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#0e0f14] border-2 border-emerald-500/50 group-hover:border-emerald-400 group-hover:bg-emerald-500/20 transition-colors z-10" />
                  <p className="text-[11px] leading-relaxed text-gray-500 group-hover:text-gray-300 line-clamp-3 hover:line-clamp-none transition-all duration-300 cursor-default">
                    {desc}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
}
