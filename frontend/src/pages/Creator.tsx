// ============================================================
// Creator — 剧本创作/编辑页面（四 Tab 分步设计）
// Tab 1: 基础设定 — 封面图、名称、简介、标签
// Tab 2: AI 大脑 — 主提示词 (L0)、开场白
// Tab 3: 页面美化 — 车卡页 HTML 编辑器
// Tab 4: 世界书 (Worldbook) — 卡片式表单，激活词 + 内容
// P2#19: 支持编辑已有剧本、图片上传、Blueprint 预览
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import * as api from '../utils/api';

type TabId = 'basic' | 'brain' | 'styling' | 'worldbook';

interface WorldbookEntry {
  id: string;
  keywords: string[];
  content: string;
}

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'basic', label: '基础设定', icon: '📋' },
  { id: 'brain', label: 'AI 大脑', icon: '🧠' },
  { id: 'styling', label: '页面美化', icon: '🎨' },
  { id: 'worldbook', label: '世界书', icon: '📖' },
];

const POPULAR_TAGS = ['奇幻', '武侠', '恋爱', '科幻', '大世界', '高自由度', '纯爱', '多女主'];

export const Creator: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const { addNotification, editScenarioId } = useUIStore();

  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // P2#19: 编辑模式 — 从 uiStore 读取 editScenarioId
  const editId = editScenarioId;
  const [loadingScenario, setLoadingScenario] = useState(!!editId);

  // Tab 1: 基础设定
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  // Cut 2: tags 从 string 改为 string[]
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Tab 2: AI 大脑
  const [mainPrompt, setMainPrompt] = useState('');
  const [greeting, setGreeting] = useState('');
  // F-27: 作者神谕 — 作者对玩家的提示/指引
  const [authorNotes, setAuthorNotes] = useState('');

  // Tab 3: 页面美化
  const [prologueHtml, setPrologueHtml] = useState('');

  // Tab 4: 世界书
  const [worldbook, setWorldbook] = useState<WorldbookEntry[]>([]);

  // Cut 3: NIKO 专有 JSON 导入 — 移除 PNG/TavernAI，仅接受 .json
  const cardInputRef = useRef<HTMLInputElement>(null);
  const [importingCard, setImportingCard] = useState(false);

  // Cut 2: 标签输入 — Enter 键添加
  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = tagInput.trim();
    if (!val) return;
    // 去重添加
    setTags((prev) => (prev.includes(val) ? prev : [...prev, val]));
    setTagInput('');
  }

  // Cut 2: 标签池点击添加
  function handleTagPoolClick(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
  }

  // Cut 2: 移除标签
  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  // Cut 3: NIKO 专有 JSON 导入 — 移除 parseCharacterCard，纯 JSON 解析
  async function handleImportCard(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingCard(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // NIKO 专有 JSON 格式解析
      if (data.title) setTitle(data.title);
      if (data.intro) setIntro(data.intro);
      if (data.cover_url) setCoverUrl(data.cover_url);
      if (data.tags && Array.isArray(data.tags)) setTags(data.tags);
      if (data.main_prompt) setMainPrompt(data.main_prompt);
      if (data.greeting) setGreeting(data.greeting);
      if (data.prologue_html) setPrologueHtml(data.prologue_html);
      if (data.authorNotes) setAuthorNotes(data.authorNotes);
      if (data.init_worldbooks && Array.isArray(data.init_worldbooks)) {
        setWorldbook(
          data.init_worldbooks.map((wb: { keywords: string[]; description: string }, i: number) => ({
            id: `wb-import-${i}-${Date.now()}`,
            keywords: wb.keywords || [],
            content: wb.description || '',
          }))
        );
      }

      addNotification({ type: 'success', message: `已导入剧本: ${data.title || '未知'}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导入失败';
      addNotification({ type: 'error', message: `JSON 解析失败: ${msg}` });
    } finally {
      setImportingCard(false);
      e.target.value = '';
    }
  }

  // P2#19: 编辑模式 — 加载已有剧本
  useEffect(() => {
    if (!editId) return;
    (async () => {
      setLoadingScenario(true);
      try {
        const detail = await api.getScenario(editId);
        setTitle(detail.title);
        setIntro(detail.intro);
        setCoverUrl(detail.cover_url || '');
        // 解析 blueprint_data
        try {
          const bp = JSON.parse(detail.blueprint_data);
          if (bp.main_prompt) setMainPrompt(bp.main_prompt);
          if (bp.greeting) setGreeting(bp.greeting);
          if (bp.prologue_html) setPrologueHtml(bp.prologue_html);
          if (bp.authorNotes) setAuthorNotes(bp.authorNotes);
          if (bp.tags && Array.isArray(bp.tags)) setTags(bp.tags);
          if (bp.init_worldbooks && Array.isArray(bp.init_worldbooks)) {
            setWorldbook(
              bp.init_worldbooks.map((wb: { keywords: string[]; description: string }, i: number) => ({
                id: `wb-${i}-${Date.now()}`,
                keywords: wb.keywords || [],
                content: wb.description || '',
              }))
            );
          }
        } catch {
          // blueprint_data 解析失败，保持空表单
        }
      } catch {
        addNotification({ type: 'error', message: '加载剧本失败' });
      } finally {
        setLoadingScenario(false);
      }
    })();
  }, [editId]);

  function addWorldbookEntry() {
    const entry: WorldbookEntry = {
      id: `wb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      keywords: [],
      content: '',
    };
    setWorldbook((prev) => [...prev, entry]);
  }

  function removeWorldbookEntry(id: string) {
    setWorldbook((prev) => prev.filter((e) => e.id !== id));
  }

  function updateWorldbookEntry(id: string, field: 'keywords' | 'content', value: string | string[]) {
    setWorldbook((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  }

  function handleKeywordInput(entryId: string, raw: string) {
    const keywords = raw.split(/[,，、\s]+/).filter(Boolean);
    updateWorldbookEntry(entryId, 'keywords', keywords);
  }

  function buildBlueprintData(): string {
    const blueprint: Record<string, unknown> = {};
    if (mainPrompt.trim()) blueprint.main_prompt = mainPrompt.trim();
    if (greeting.trim()) blueprint.greeting = greeting.trim();
    if (prologueHtml.trim()) blueprint.prologue_html = prologueHtml.trim();
    // F-27: 作者神谕
    if (authorNotes.trim()) blueprint.authorNotes = authorNotes.trim();
    // Cut 4: tags 写入 blueprint
    if (tags.length > 0) blueprint.tags = tags;
    if (worldbook.length > 0) {
      blueprint.init_worldbooks = worldbook.map((e) => ({
        keywords: e.keywords,
        description: e.content,
      }));
    }
    return JSON.stringify(blueprint, null, 2);
  }

  // P2#19: 图片上传
  async function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.uploadImage(file);
      setCoverUrl(result.url);
      addNotification({ type: 'success', message: '图片上传成功' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败';
      addNotification({ type: 'error', message: msg });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      addNotification({ type: 'warning', message: '请输入剧本标题' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        intro: intro.trim(),
        blueprint_data: buildBlueprintData(),
        cover_url: coverUrl || undefined,
      };

      if (editId) {
        await api.updateScenario(editId, payload);
        addNotification({ type: 'success', message: '剧本更新成功' });
      } else {
        await api.createScenario(payload);
        addNotification({ type: 'success', message: '剧本创建成功' });
        // 重置表单
        setTitle('');
        setIntro('');
        setCoverUrl('');
        setTags([]);
        setTagInput('');
        setMainPrompt('');
        setGreeting('');
        setPrologueHtml('');
        setAuthorNotes('');
        setWorldbook([]);
        setActiveTab('basic');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败';
      addNotification({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="p-6 text-center text-gray-500">
        请先登录以创建剧本
      </div>
    );
  }

  if (loadingScenario) {
    return (
      <div className="p-6 text-center text-gray-500 py-12">加载剧本中...</div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">
          {editId ? '编辑剧本' : '创作新剧本'}
        </h1>
        {/* P2#19: Blueprint 预览按钮 */}
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="px-3 py-1.5 text-xs bg-[#1c1d26] border border-[#2a2b36] text-gray-400
            rounded hover:text-gray-200 hover:border-purple-500/50 transition-colors"
        >
          {showPreview ? '关闭预览' : '预览 Blueprint'}
        </button>
      </div>

      {/* P2#19: Blueprint JSON 预览 */}
      {showPreview && (
        <div className="mb-6 bg-[#0d0e14] border border-[#2a2b36] rounded-lg p-4 max-h-80 overflow-auto">
          <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap">{buildBlueprintData()}</pre>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-[#2a2b36] mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === tab.id
                ? 'text-purple-300 border-purple-500'
                : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Tab 1: 基础设定 */}
        {activeTab === 'basic' && (
          <div className="space-y-4">
            {/* Cut 1: 封面图 — 点击上传，所见即所得 */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">封面图</label>
              <div className="flex gap-4 items-start">
                {/* 预览框：点击触发上传 */}
                <label
                  className={`flex-shrink-0 w-32 h-32 rounded-xl border border-dashed overflow-hidden cursor-pointer
                    transition-colors relative group
                    ${uploading
                      ? 'border-gray-600 cursor-not-allowed opacity-60'
                      : coverUrl
                        ? 'border-purple-500/50 hover:border-purple-400'
                        : 'border-gray-700 hover:border-purple-500/50'
                    }`}
                >
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt="封面预览"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-1">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                      <span className="text-[10px]">点击上传</span>
                    </div>
                  )}
                  {/* 悬浮时显示更换提示 */}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                    <span className="text-xs text-gray-200">{uploading ? '上传中...' : coverUrl ? '更换图片' : '上传图片'}</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadImage}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                {/* 右侧信息 */}
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-gray-400">点击左侧方框上传封面图</p>
                  <p className="text-xs text-gray-600">建议 400×400 webp 格式，≤5MB。支持 jpg/png/webp</p>
                  {coverUrl && (
                    <button
                      type="button"
                      onClick={() => setCoverUrl('')}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      移除封面
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Cut 3: NIKO 专有 JSON 导入 — 移除 PNG/TavernAI */}
            <div className="border-t border-[#2a2b36] pt-4">
              <label className="block text-sm text-gray-400 mb-2">导入剧本 (NIKO JSON)</label>
              <p className="text-xs text-gray-600 mb-2">
                导入 NIKO 专有 JSON 格式的剧本文件。导入后将自动填充所有 Tab 字段。
              </p>
              <input
                ref={cardInputRef}
                type="file"
                accept=".json"
                onChange={handleImportCard}
                disabled={importingCard}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => cardInputRef.current?.click()}
                disabled={importingCard}
                className={`px-4 py-2 rounded text-sm transition-colors flex items-center gap-2
                  ${importingCard
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-[#1c1d26] border border-[#2a2b36] text-gray-400 hover:text-gray-200 hover:border-purple-500/50'
                  }`}
              >
                {importingCard ? '⏳ 导入中...' : '📂 选择 JSON 文件'}
              </button>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">剧本名称 *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
                  focus:outline-none focus:border-purple-500"
                placeholder="给你的剧本取个名字"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">简介</label>
              <textarea
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
                  focus:outline-none focus:border-purple-500 resize-none"
                rows={3}
                placeholder="剧本简介，会在大厅卡片中展示..."
              />
            </div>

            {/* Cut 2: 高级标签选择器 */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">分类标签</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-600/20 text-purple-300
                      text-xs rounded-full border border-purple-600/30"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-400 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
                  focus:outline-none focus:border-purple-500"
                placeholder="输入标签后按 Enter 添加"
              />
              <p className="text-xs text-gray-600 mt-1">按 Enter 添加标签，点击标签上的 × 移除</p>
              {/* 标签池 */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {POPULAR_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleTagPoolClick(tag)}
                    disabled={tags.includes(tag)}
                    className={`px-2 py-0.5 text-xs rounded-full border transition-colors
                      ${tags.includes(tag)
                        ? 'bg-gray-700/30 text-gray-600 border-gray-700/30 cursor-not-allowed'
                        : 'bg-[#1c1d26] text-gray-500 border-[#2a2b36] hover:text-purple-400 hover:border-purple-500/50'
                      }`}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: AI 大脑 */}
        {activeTab === 'brain' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                主提示词 (L0) <span className="text-gray-600">— 角色的核心世界观设定</span>
              </label>
              <p className="text-xs text-gray-600 mb-2">
                这是 AI 角色扮演的根基，定义角色的身份、性格、世界规则。此内容在 Prompt 组装中拥有最高优先级（仅次于 L-Master 全局规则）。
              </p>
              <textarea
                value={mainPrompt}
                onChange={(e) => setMainPrompt(e.target.value)}
                className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm font-mono
                  focus:outline-none focus:border-purple-500 resize-none"
                rows={12}
                placeholder={`# 角色设定\n你是...\n\n# 世界观\n这是一个...\n\n# 规则\n1. ...\n2. ...`}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                开场白 <span className="text-gray-600">— AI 对玩家说的第一句话</span>
              </label>
              <textarea
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
                  focus:outline-none focus:border-purple-500 resize-none"
                rows={4}
                placeholder="欢迎来到... 你睁开眼睛，发现自己..."
              />
            </div>

            {/* F-27: 作者神谕 */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                📜 作者神谕 <span className="text-gray-600">— 作者对玩家的提示/指引</span>
              </label>
              <p className="text-xs text-gray-600 mb-2">
                这段文本将在游玩界面以可折叠面板展示给玩家，用于提供游戏指引、隐藏线索或世界观补充说明。不会注入到 AI 的 Prompt 中。
              </p>
              <textarea
                value={authorNotes}
                onChange={(e) => setAuthorNotes(e.target.value)}
                className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
                  focus:outline-none focus:border-yellow-500 resize-none"
                rows={4}
                placeholder="欢迎来到这个故事世界！\n\n提示：\n- 尝试与每个 NPC 对话\n- 注意环境描述中的细节\n- 你的选择会影响故事走向..."
              />
            </div>
          </div>
        )}

        {/* Tab 3: 页面美化 */}
        {activeTab === 'styling' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                车卡页 HTML <span className="text-gray-600">— 玩家进入游戏前的角色创建页面</span>
              </label>
              <p className="text-xs text-gray-600 mb-2">
                编写 HTML/CSS 自定义角色创建页面。将在沙箱 iframe 中安全渲染。
              </p>
              <textarea
                value={prologueHtml}
                onChange={(e) => setPrologueHtml(e.target.value)}
                className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm font-mono
                  focus:outline-none focus:border-purple-500 resize-none"
                rows={12}
                placeholder={`<div style="text-align:center;padding:2rem;">\n  <h1>创建你的角色</h1>\n  <input placeholder="输入你的名字..." />\n</div>`}
              />
            </div>
          </div>
        )}

        {/* Tab 4: 世界书 (Worldbook) */}
        {activeTab === 'worldbook' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-600">
              世界书词条是 AI 在对话中自动触发的设定内容。当玩家或 AI 的发言中包含"激活词"时，对应的词条内容会被注入到 Prompt 中。
            </p>

            {worldbook.length === 0 && (
              <div className="text-center text-gray-500 py-8 border-2 border-dashed border-[#2a2b36] rounded-lg">
                <p className="mb-2">暂无世界书词条</p>
                <p className="text-xs">点击下方按钮添加</p>
              </div>
            )}

            {worldbook.map((entry) => (
              <div
                key={entry.id}
                className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-gray-500 font-mono">{entry.id.slice(0, 12)}</span>
                  <button
                    type="button"
                    onClick={() => removeWorldbookEntry(entry.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    删除
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">激活词</label>
                    <input
                      type="text"
                      value={entry.keywords.join(', ')}
                      onChange={(e) => handleKeywordInput(entry.id, e.target.value)}
                      className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
                        focus:outline-none focus:border-purple-500"
                      placeholder="真金白银, 极寒, 龙 (逗号分隔)"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      多个激活词用逗号分隔。对话中命中任意一个即触发此词条。
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">内容</label>
                    <textarea
                      value={entry.content}
                      onChange={(e) => updateWorldbookEntry(entry.id, 'content', e.target.value)}
                      className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
                        focus:outline-none focus:border-purple-500 resize-none"
                      rows={4}
                      placeholder="设定内容：当激活词被触发时，这段内容会注入到 Prompt 中..."
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addWorldbookEntry}
              className="w-full py-3 border-2 border-dashed border-[#2a2b36] rounded-lg
                text-sm text-gray-500 hover:text-purple-400 hover:border-purple-500/50
                transition-colors"
            >
              + 添加词条
            </button>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="mt-8 pt-6 border-t border-[#2a2b36] flex items-center justify-between">
          <div className="flex gap-2">
            {tabs.map((tab, idx) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                disabled={idx === 0 && activeTab === 'basic'}
                className={`px-3 py-1.5 text-xs rounded transition-colors
                  ${activeTab === tab.id
                    ? 'bg-purple-600/30 text-purple-300'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-[#252630]'
                  }`}
              >
                {idx + 1}. {tab.label}
              </button>
            ))}
          </div>

          {/* Cut 4: 编辑模式按钮文字 */}
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110
              active:scale-95 active:brightness-90 disabled:opacity-50 disabled:scale-100
              text-white rounded-lg text-sm transition-all duration-300 ease-bounce-soft"
          >
            {submitting ? '保存中...' : editId ? '💾 保存修改' : '发布剧本'}
          </button>
        </div>
      </form>
    </div>
  );
};
