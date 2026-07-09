# 架构文档: NIKO 酒馆 — 实际代码状态

> 版本: v2.8 (实际代码快照)
> 对应 PRD: v2.2 (已归档)
> **本文档 100% 反映当前磁盘上 `.go` / `.ts` / `.tsx` 文件的真实状态。不包含未落地的虚构设计。**

---

## 1. 系统架构总览

### 1.1 实际分层

```
┌─────────────────────────────────────────────────┐
│  表现层 (UI/UX Layer)          [主线程]          │
│  React 18 + Tailwind CSS + Zustand              │
├─────────────────────────────────────────────────┤
│  调度层 (Zustand Store)        [主线程]          │
│  authStore / gameStore / uiStore                │
├─────────────────────────────────────────────────┤
│  编排层 (Hook Composition)     [主线程]          │
│  usePlayEngine (纯编排)                          │
│  ├─ usePlayStorage (存储层 Hook)                │
│  └─ useAIComm (通信层 Hook)                     │
├─────────────────────────────────────────────────┤
│  记忆引擎层 (Web Worker)       [Worker 线程]     │
│  Comlink 暴露 L2 fallback 计算 API              │
├─────────────────────────────────────────────────┤
│  Token 预算管家                [主线程]          │
│  TokenBudgetManager + PromptAssembler           │
├─────────────────────────────────────────────────┤
│  持久化与通信层                [主线程]          │
│  IndexedDB (idb) + fetch API 封装               │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  后端 (Go + Gin + SQLite + JWT)                 │
│  ├─ Gin 路由 + CORS 中间件                      │
│  ├─ GORM + SQLite (WAL 模式 + busy_timeout)     │
│  ├─ JWT 无状态认证 (golang-jwt/v5)              │
│  ├─ FTS5 全文搜索 (trigram 分词器)              │
│  └─ 被动健康监测 (Ring Buffer, 100 条/模型)     │
└─────────────────────────────────────────────────┘
```

### 1.2 核心原则落地状态

| 原则 | 实际状态 | 对应代码 |
|------|----------|----------|
| 前后台解耦 | ✅ 已实现 | 前台轨（角色扮演流式响应）与后台轨（记忆运算静默异步）物理隔离，见 [`afterResponse()`](frontend/src/services/MemoryLoaderService.ts:134) |
| 记忆动态折叠 | ✅ 已实现 | L1/L2/L3 全部通过 AI 模型顺序执行，见 [`afterResponse()`](frontend/src/services/MemoryLoaderService.ts:134) |
| 乐观更新 + 脏标记 | ❌ 未实现 | 依赖未来 PR |
| 优雅降级 | ✅ 已实现 | JSON 解析失败丢弃 chunk |
| 时空回溯 | ✅ 已实现 | [`deleteConversationsAfterTurn`](frontend/src/db/index.ts:255) + [`deleteMemoriesAfterTurn`](frontend/src/db/index.ts:290) |
| 会话隔离 (sav_id) | ✅ 已实现 | 所有 IndexedDB 查询绑定 sav_id |
| SCN/SAV 隔离 | ✅ 已实现 | 后端独立 scenarios/saves 表 + 前端 [`forkSave()`](frontend/src/db/index.ts:96) / [`createSaveFromScenario()`](frontend/src/db/index.ts:174) / [`createSaveFromApiScenario()`](frontend/src/db/index.ts:320) |
| 零信任安全 | ✅ 已实现 | AES-GCM 端侧加密 ([`crypto.ts`](frontend/src/utils/crypto.ts)) + 后端密文存储 ([`encrypted_key.go`](backend/handlers/encrypted_key.go)) |
| 无状态认证 (JWT) | ✅ 已实现 | [`middleware/auth.go`](backend/middleware/auth.go) |
| 图片独立存储 | ✅ 已实现 | [`handlers/image.go`](backend/handlers/image.go) |
| BYOK/平台代理双轨制 | ✅ 已实现 | Track 1 (BYOK 前端直连) + Track 2 (后端代理) 均在 [`Play.tsx`](frontend/src/pages/Play.tsx:188) 中实现 |
| 预扣积分机制 | ✅ 已实现 | [`handlers/chat.go`](backend/handlers/chat.go) 原子 UPDATE + 前端 [`optimisticDeductPoints()`](frontend/src/stores/authStore.ts:108) |
| 管理员控制台 | ✅ 已实现 | [`handlers/admin.go`](backend/handlers/admin.go) + [`pages/Admin.tsx`](frontend/src/pages/Admin.tsx) |
| 多分支存档树 | ✅ 已实现 | 后端 `parent_sav_id` + 前端 [`Saves.tsx`](frontend/src/pages/Saves.tsx:164) 递归树渲染 |
| 角色卡导入 | ✅ 已实现 | [`characterCard.ts`](frontend/src/utils/characterCard.ts) 支持 PNG/V2 JSON 格式 |
| 数据导入/导出 | ✅ 已实现 | [`Settings.tsx`](frontend/src/pages/Settings.tsx:66) JSON 全量备份/恢复 |
| 模型健康监测 | ✅ 已实现 | 后端 [`health.go`](backend/services/health.go) + 前端 [`Admin.tsx`](frontend/src/pages/Admin.tsx:163) |
| **自动同步 (autoSync)** | ✅ **已修复 v1.2** | 见 [`usePlayStorage.ts`](frontend/src/hooks/usePlayStorage.ts:100) — 原为空函数，现已实现为真实 PUT/POST 同步 |
| **L1_Summary 全生命周期** | ✅ **已修复 v1.2** | 删除/分支/重置操作均正确处理 L1_Summary，见 [`Saves.tsx`](frontend/src/pages/Saves.tsx:52) / [`db/index.ts`](frontend/src/db/index.ts:96) / [`usePlayStorage.ts`](frontend/src/hooks/usePlayStorage.ts:100) |
| **云端反向拉取 (v1.3)** | ✅ **已实现** | Hydration 时 IndexedDB 缺失自动 GET /api/saves/:id 降级拉取，见 [`usePlayStorage.ts`](frontend/src/hooks/usePlayStorage.ts:140) |
| **Regenerate 重试 (v1.3)** | ✅ **已实现** | 删除 AI 回复后自动重新触发 triggerSend，见 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts:310) |
| **Zustand lobbyState 持久化 (v1.5)** | ✅ **已实现** | 大厅搜索词/页码通过 Zustand `uiStore.lobbyState` 持久化，导航离开再回来保持状态，见 [`Lobby.tsx`](frontend/src/pages/Lobby.tsx) / [`uiStore.ts`](frontend/src/stores/uiStore.ts) |
| **500ms debounce useEffect (v1.5)** | ✅ **已实现** | `localKeyword` useState → 500ms debounce useEffect → 同步到 `lobbyState.keyword` → 触发 API 请求，见 [`Lobby.tsx`](frontend/src/pages/Lobby.tsx) |
| **树拍平渲染 (v1.4)** | ✅ **已实现** | 存档树拍平为一维 `FlatNode[]` 数组，`padding-left` 模拟缩进，消除递归 DOM，见 [`Saves.tsx`](frontend/src/pages/Saves.tsx) |
| **flattenSaveTree 外部纯函数 (v1.6)** | ✅ **已重构** | 降维算法提取为组件外纯函数 `flattenSaveTree()`，DFS 递归注入 `depth`，`useMemo` 缓存拍平结果，见 [`Saves.tsx`](frontend/src/pages/Saves.tsx) |
| **CSS L 型折线 (v1.6)** | ✅ **已实现** | 用 `border-l-2 border-b-2 rounded-bl-lg` CSS 伪元素绘制树枝连线，替代文本符号 `├─` `└─`，见 [`Saves.tsx`](frontend/src/pages/Saves.tsx) |
| **ColorOS 水生质感卡片 (v1.6)** | ✅ **已实现** | 存档卡片使用 `bg-[#1c1d26]/80 backdrop-blur-md border-white/5 rounded-2xl` 悬浮玻璃质感，操作按钮 `opacity-0 group-hover:opacity-100` 悬浮显示，见 [`Saves.tsx`](frontend/src/pages/Saves.tsx) |
| **灵魂转移 (v1.4)** | ✅ **已实现** | autoSync 序列化携带 `dynamic_memories`（L1/L2/L3），hydrate 反向注水恢复记忆，实现跨设备灵魂转移，见 [`usePlayStorage.ts`](frontend/src/hooks/usePlayStorage.ts:100) |
| **回合递增修复 (v1.7)** | ✅ **已修复** | `onDone` 中执行 `nextTurn = turn + 1; setCurrentTurn(nextTurn); currentTurnRef.current = nextTurn;`，`afterResponse` 传入递增后的 `nextTurn`，末尾调用 `autoSync()`。见 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts:200) |
| **L1/L2/L3 turn>0 保护 (v1.7)** | ✅ **已修复** | `MemoryLoaderService.ts` 中 L1/L2/L3 触发条件增加 `turn > 0`，防止第 0 回合浪费 AI 调用。见 [`MemoryLoaderService.ts`](frontend/src/services/MemoryLoaderService.ts:171) |
| **hydrate currentTurnRef 同步 (v1.7)** | ✅ **已修复** | 云端恢复和 IndexedDB 恢复两处 `setCurrentTurn(maxTurn)` 后立即同步 `currentTurnRef.current = maxTurn`，确保闭包内 ref 持有正确值。见 [`usePlayStorage.ts`](frontend/src/hooks/usePlayStorage.ts:140) |
| **Hook Composition 三层重构 (v2.0)** | ✅ **已重构** | `usePlayEngine.ts` 从 972 行 God Object 拆分为三层 Hook Composition：`usePlayStorage`（存储层）、`useAIComm`（通信层）、`usePlayEngine`（纯编排层）。见 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts) / [`usePlayStorage.ts`](frontend/src/hooks/usePlayStorage.ts) / [`useAIComm.ts`](frontend/src/hooks/useAIComm.ts) |
| **引擎状态指示灯 (v2.1)** | ✅ **已修复** | `engineStatus` 在 `afterResponse` 期间更新为 `running`，见 [`gameStore.ts`](frontend/src/stores/gameStore.ts) / [`MemoryLoaderService.ts`](frontend/src/services/MemoryLoaderService.ts) |
| **顶部标题改为剧本名 (v2.1)** | ✅ **已修复** | `TopBar.tsx` 使用 `currentScenario?.name` 显示当前剧本名，见 [`TopBar.tsx`](frontend/src/components/TopBar.tsx) |
| **模型显示不完整 (v2.1)** | ✅ **已修复** | 删除前端硬编码兜底模型列表，完全信任后端 `GET /api/scenarios` 返回的 `platform_models`，见 [`InputConsole.tsx`](frontend/src/components/play/InputConsole.tsx) |
| **AI 渠道/模型偏好持久化 (v2.1)** | ✅ **已修复** | `useAIComm` 初始化从 `localStorage` 读取 `niko_model_pref`，见 [`useAIComm.ts`](frontend/src/hooks/useAIComm.ts) |
| **硬编码值清理 (v2.1)** | ✅ **已修复** | 移除 `'gpt-3.5-turbo'` fallback、`'http://localhost:8080'` 硬编码，全部替换为相对路径 `/api/chat/proxy`，见 [`useAIComm.ts`](frontend/src/hooks/useAIComm.ts) / [`playEngineHelpers.ts`](frontend/src/utils/playEngineHelpers.ts) / [`StreamClient.ts`](frontend/src/engine/StreamClient.ts) |
| **过期注释清理 (v2.1)** | ✅ **已清理** | 移除 `v1.8`/`v2.1`/`v3`/`v4` 版本标记注释，清理 `MemoryInspector.tsx` 非正式用语，见 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts) / [`MemoryLoaderService.ts`](frontend/src/services/MemoryLoaderService.ts) / [`Saves.tsx`](frontend/src/pages/Saves.tsx) / [`Lobby.tsx`](frontend/src/pages/Lobby.tsx) / [`MemoryInspector.tsx`](frontend/src/components/play/MemoryInspector.tsx) |
| **max_tokens: 8192 默认值 (v2.2)** | ✅ **已修复** | StreamClient 平台代理和 BYOK 直连 payload 均添加 `max_tokens: 8192`，记忆引擎 BYOK/平台代理 payload 同样添加，见 [`StreamClient.ts`](frontend/src/engine/StreamClient.ts) / [`playEngineHelpers.ts`](frontend/src/utils/playEngineHelpers.ts) |
| **流式/非流式开关 (v2.2)** | ✅ **已新增** | 模型选择栏右侧新增 🌊 流式/📦 非流 切换开关，持久化到 `niko_use_stream` localStorage。非流模式走独立 fetch 路径（`stream: false`），一次性返回完整响应。见 [`InputConsole.tsx`](frontend/src/components/play/InputConsole.tsx) / [`useAIComm.ts`](frontend/src/hooks/useAIComm.ts) / [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts) / [`Play.tsx`](frontend/src/pages/Play.tsx) |
| **Bug #18: PointLog ID 毫秒级碰撞 (v2.7 修复)** | ✅ **已修复** | `chat.go:106` — 同一秒内同一用户创建多个 PointLog 时 ID 格式 `LOG_${now.Format("150405")}${userID}` 会碰撞。已修复：格式改为 `LOG_${now.Format("150405.000")}_${userID[:8]}`，毫秒精度 + 下划线分隔。见 [`handlers/chat.go`](backend/handlers/chat.go:106) |
| **Bug #19: L1 截断注释/代码不一致 (v2.7 修复)** | ✅ **已修复** | `TokenBudgetManager.ts:91` — 注释写 "150 词" 但实际 `slice(0, 150)` 按字符截断。已修复：注释改为 "150 字符"。见 [`TokenBudgetManager.ts`](frontend/src/engine/TokenBudgetManager.ts:91) |
| **Bug #20: 未使用的 cancelled 变量 (v2.7 修复)** | ✅ **已修复** | `usePlayEngine.ts:169` — hydrate useEffect 中声明 `let cancelled = false;` 但从未使用。已修复：移除该变量及 cleanup 函数。见 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts:169) |
| **Bug #21: 非流式 latency 记录时机错误 (v2.7 修复)** | ✅ **已修复** | `chat.go:95` — 非流模式下 latency 在 `http.Post` 返回后立即记录，此时 `resp.Body` 尚未读取完毕，latency 不包含完整响应时间。已修复：流模式在 response header 到达时记录，非流模式在 `io.ReadAll(resp.Body)` 完成后重新计算。见 [`handlers/chat.go`](backend/handlers/chat.go:95) |
| **Bug #22: MemoryLoaderService 无超时保护 (v2.7 修复)** | ✅ **已修复** | `MemoryLoaderService.ts:179` — L1/L2/L3 的 `this.modelCaller()` 调用无超时，一个 AI 调用挂起会阻塞整个 Promise chain 队列。已修复：新增 `withTimeout<T>(promise, ms)` 工具函数（30s 超时），包裹所有 3 处 modelCaller 调用。见 [`MemoryLoaderService.ts`](frontend/src/services/MemoryLoaderService.ts:15) |

---

## 2. 数据流

### 2.1 实际数据流

```
用户输入 → PromptAssembler.assemble()
  → 并行加载 L0/L3/L2/L1/History/Master/L0_Player
  → 按优先级拼接 system_prompt
  → Token 预算检查 (calculateM + 历史裁剪)
  → StreamClient.send() → fetch POST /api/chat/proxy
  → 后端 JWT 验证 → 查询 PlatformModel → 预扣积分
  → OpenAI 兼容 SSE 流式透传 → 前端 ReadableStream 解析
  → onToken 回调 → 实时渲染
  → onDone → memoryLoader.afterResponse() 异步触发 L1/L2/L3 更新
```

### 2.2 记忆写入流 (主线程 — AI 顺序执行)

```
AI 回复完成 → 回合 N 递增 → afterResponse()
  ├─ N%3==0 → L2: AI 语义匹配世界书词条 → IndexedDB (去重追加)
  ├─ N%5==0 → L1: AI 上下文压缩 (≤300 字) → IndexedDB (追加)
  └─ N%10==0 → L3: AI 剧情轴更新 (输入: 当前 L3 + 最新 L1 总结) → IndexedDB (覆盖)
```

> L1/L2/L3 **顺序执行**，利用 AI 空闲时间进行后台记忆运算。
> Worker 线程仅作为 AI 调用失败的 L2 fallback（本地关键词匹配）。

#### 落库策略

| 层级 | 策略 | ID 规则 | 说明 |
|------|------|---------|------|
| L3 | **绝对覆盖 (Overwrite)** | `l3-${savId}` (固定 ID) | 库里永远只有 1 条活跃的 L3 剧情轴 |
| L1 | **追加 (Append)** | `mem-${savId}-L1-${turn}-${Date.now()}` | 编年史模式，每次生成新记录 |
| L2 | **去重追加 (Upsert)** | `mem-${savId}-L2-${turn}-${Date.now()}` | 检查 `existingKeywords` Set，已有 keyword 的条目跳过 |

#### L1_Summary 全生命周期 (v1.2 修复)

| 操作 | 行为 | 代码 |
|------|------|------|
| 创建存档 (forkSave) | ✅ 深拷贝 L1_Summary 到新 sav_id | [`forkSave()`](frontend/src/db/index.ts:96) |
| 删除存档 | ✅ 级联删除 L1_Summary | [`handleDeleteSave()`](frontend/src/pages/Saves.tsx:52) |
| 重置记忆 (resetMemory) | ✅ 级联删除 L1_Summary | [`handleResetMemory()`](frontend/src/hooks/usePlayEngine.ts:605) |
| 时空回溯 (Undo/Reroll) | ✅ `deleteMemoriesAfterTurn()` 按 turn 删除所有记忆类型 | [`deleteMemoriesAfterTurn()`](frontend/src/db/index.ts:290) |

> v1.1 及之前：forkSave/deleteSave/resetMemory 均遗漏 L1_Summary，导致分支存档丢失历史总结、删除存档残留数据、重置记忆不彻底。v1.2 已全部修复。

### 2.3 时空回溯流

```
Undo/Reroll → 目标 turn N'
→ deleteConversationsAfterTurn(savId, N') 级联删除
→ deleteMemoriesAfterTurn(savId, N') 级联删除
→ 重置 turn counter = N'
```

### 2.4 Fork & Copy 流 (SCN → SAV)

```
大厅点击"开始游玩"
→ 后端 GET /api/scenarios/:id 拉取完整剧本 (含 blueprint_data)
→ createSaveFromApiScenario() 解析 blueprint JSON
  → 写入 IndexedDB scenarios 表
  → forkSave() 创建 SAV 记录 (含 parent_sav_id)
    → 深拷贝 conversations
    → 深拷贝 L1_Summary / L2_Worldbook / L3_Plot 记忆
  → 写入初始 memories (L0/L3)
→ 设置 gameStore → 导航到 Play 页面
```

### 2.5 自动同步流 (autoSync — v1.2 修复)

```
每次渲染 → useEffect 更新 refs (currentSaveRef/currentScenarioRef/conversationsRef/currentTurnRef)
  → autoSyncRef.current 被调用时:
    → 序列化 { scenario, conversations, currentTurn } 为 JSON
    → PUT /api/saves/:id (updateSave)
      → 404? → POST /api/saves (uploadSave) 回退创建
```

> v1.1 及之前：`autoSyncRef.current` 初始化为 `async () => {}`（空函数），从未被赋值，导致自动同步完全失效。v1.2 修复为使用 ref 捕获最新状态的真实同步函数。详见 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts:168)。

---

## 3. 数据模型

### 3.1 前端 IndexedDB (实际)

| 表 | 类型 | 关键字段 | 代码 |
|----|------|----------|------|
| scenarios | ROM | scn_id, author_id, name, main_prompt, init_worldbooks, init_plot, version, tags, cover_url, intro, created_at | [`db/index.ts`](frontend/src/db/index.ts:52) |
| saves | RAM | sav_id, scn_id, usr_id, name, current_turn, parent_sav_id, created_at, updated_at | [`db/index.ts`](frontend/src/db/index.ts:69) |
| conversations | RAM | id, sav_id, turn, role, content, timestamp, metadata (swipes, currentSwipeIndex) | [`db/index.ts`](frontend/src/db/index.ts:243) |
| dynamic_memories | RAM | id, sav_id, type(L1/L2/L3), turn, content | [`db/index.ts`](frontend/src/db/index.ts:268) |
| config | RAM | key, value | [`db/index.ts`](frontend/src/db/index.ts:305) |

### 3.2 后端 SQLite (实际)

| 表 | 说明 | 代码 |
|----|------|------|
| users | id, username, password_hash (Bcrypt), points, role, status, created_at | [`models/models.go`](backend/models/models.go) |
| scenarios | id, author_id, title, intro, cover_url, blueprint_data, tags, author_name, downloads, status, flag_reason, edited_by_admin, created_at, updated_at | [`models/models.go`](backend/models/models.go) |
| scenarios_fts | FTS5 虚拟表 (trigram)，3 触发器自动同步 (**注意**: 触发器中使用空字符串 '' 而非实际值填充 author_name 和 tags 字段) | [`services/database.go`](backend/services/database.go) |
| saves | id, user_id, scenario_id, **name**, **scenario_title**, save_data, parent_sav_id, created_at, updated_at | [`models/models.go`](backend/models/models.go) |
| images | id, path, original_name, created_at | [`models/models.go`](backend/models/models.go) |
| global_configs | key (PK), value, updated_at | [`models/models.go`](backend/models/models.go) |
| ai_providers | id, name, base_url, api_key (json:"-"), is_active, created_at, updated_at | [`models/models.go`](backend/models/models.go) |
| platform_models | id, model_id, display_name, provider_id (FK → ai_providers.id), provider_family, is_active, cost_per_turn, price_coeff, sort_order, tags, created_at | [`models/models.go`](backend/models/models.go) |
| point_logs | id, user_id, amount, reason, created_at | [`models/models.go`](backend/models/models.go) |
| user_encrypted_keys | user_id (PK), encrypted_blob, updated_at | [`models/models.go`](backend/models/models.go) |

> **v1.2 新增**: `saves` 表新增 `name` 和 `scenario_title` 字段，用于存档显示名称和关联剧本标题。`UploadSaveRequest` 也包含这两个字段。

---

## 4. 前端 UI 架构 (实际)

### 4.1 布局

```
Sidebar (w-56, bg-[#1c1d26])          TopBar (h-14)              Main View (flex-1)
├─ 大厅 (Lobby)                        ├─ 汉堡菜单按钮            ├─ 剧本卡片网格 / 聊天界面
├─ 存档 (Saves)                        ├─ 页面标题                └─ 由 currentView 切换
├─ 创作 (Creator)                      └─ 用户状态 (积分/退出)
├─ 设置 (Settings)
└─ 用户信息 / 登录按钮 (底部)
    └─ ⚠ 管理控制台 (仅 admin 可见，黄色警告按钮，与普通导航完全隔离)
```

> **RBAC 视觉隔离**：Admin 入口从 navItems 中移除，放到底部用户信息区下方，以黄色警告按钮样式呈现。普通用户完全看不到该入口。参见 [`Sidebar.tsx`](frontend/src/components/Sidebar.tsx)。

### 4.2 页面路由 (实际)

| 视图 | 组件 | 文件 | 说明 |
|------|------|------|------|
| lobby | [`Lobby`](frontend/src/pages/Lobby.tsx) | 剧本浏览 (分页/排序/搜索) + Fork & Copy 开始游玩 + AuthModal |
| saves | [`Saves`](frontend/src/pages/Saves.tsx) | 多分支存档树 (递归树渲染 + 删除 + 加载) |
| creator | [`Creator`](frontend/src/pages/Creator.tsx) | 四 Tab 分步创作 (基础设定/AI 大脑/页面美化/世界书) + 角色卡导入 + 编辑模式 |
| settings | [`Settings`](frontend/src/pages/Settings.tsx) | **仅个人配置**：三垂直 tab（账号与资产 / 算力通道 / 数据管理）。不含任何管理功能。 |
| admin | [`Admin`](frontend/src/pages/Admin.tsx) | **仅 admin 可见**：五工业风 tab（全局中枢 / 仪表盘 / 模型货架 / 用户资产 / 内容巡查）。高密度、无玻璃拟态。 |
| play | [`Play`](frontend/src/pages/Play.tsx) | 对话界面 (Prologue/Greeting/Swipe/Undo/Reroll/Edit/Fork/Worldbook/Memory/Export/SaveSwitcher/AuthorNotes/L2高亮/Token显示/引擎状态灯) |

### 4.3 Settings 页面结构 (v2 — 净化后)

[`Settings.tsx`](frontend/src/pages/Settings.tsx) 使用垂直标签页组织，仅包含个人配置：

| 标签页 | 内容 |
|--------|------|
| 账号与资产 | 用户名、角色、积分余额 + 关于信息 |
| 算力通道 | BYOK 端点 + API Key (`type="password"`) + **[⚡ 测试连接并获取模型]** 按钮 → 真实 `fetch(endpoint/v1/models)` → 动态模型 `<select>` → **[💾 保存 BYOK 配置]** |
| 数据管理 | JSON 全量导出/导入备份 |

> **BYOK 真实 API 握手**：用户填写 endpoint + API Key 后，点击「测试连接并获取模型」发起真实 `GET {endpoint}/v1/models` 请求（Authorization: Bearer），解析 OpenAI 标准格式返回，将模型列表灌入下拉菜单供用户选择。配置统一存储在 `localStorage` key `niko_byok_config`（含 endpoint / apiKey / model 三个字段）。

### 4.4 Admin 页面结构 (v2.8 — 按 tab 按需自动刷新)

[`Admin.tsx`](frontend/src/pages/Admin.tsx) 使用工业仪表盘风格（高密度、纯色深灰背景、无玻璃拟态），6 个标签页。**切换 tab 时自动刷新该 tab 对应的数据**（通过 `useEffect` 监听 `activeTab` 实现），无需手动刷新：

| 标签页 | 内容 | 自动刷新数据 |
|--------|------|-------------|
| 全局中枢 | L-Master 全局规则编辑器 + 注册奖励积分设置（已实现持久化，通过 `GET/PUT /api/admin/config/register_bonus_points`） | `loadMasterPrompt()` + `loadRegBonus()` |
| 仪表盘 | 6 统计卡片（总用户/今日新增/剧本数/存档数/消耗积分/活跃模型）+ 模型健康监测 | `loadDashboard()` |
| 模型货架 | **只读表格**（ID/显示名称/提供商/消耗/系数/状态/操作），显示名自动格式化为 `[渠道名] [模型名]`。**移除手动创建表单**，模型仅通过渠道管理中的「测试并导入」自动添加。 | `loadModels()` |
| 渠道管理 | AI 提供商表格（名称/Base URL/**连通性状态指示器**/状态/操作）+ 添加渠道表单（名称/API URL/API Key + **测试连接按钮**，调用 `POST /api/admin/providers/test` 验证连通性并返回可用模型列表 + **一键导入模型货架**按钮，调用 `POST /api/admin/providers/:id/import-models` 批量创建 PlatformModel 记录）。已有渠道行新增 **测试并导入** 按钮 → 弹窗输入 API Key → 测试连接 → 一键导入模型。**展开/折叠**按钮显示该渠道下的模型列表（从模型货架按 `provider_id` 过滤）。**长间隔自动连通性检测**（60 秒轮询 `POST /api/admin/providers/health-check`），每行显示绿色/红色状态点 + 模型数量。 | `loadProviders()` + `loadProviderConnectivity()` |
| 用户资产 | 用户表格（ID/用户名/积分/角色/状态/注册时间）+ **编辑按钮** → 弹窗修改用户名/角色/密码/积分（调用 `PUT /api/admin/users/:id`） | `loadUsers()` |
| 内容巡查 | 已封禁剧本列表（含封禁理由/时间） | `loadFlaggedScenarios()` |

> **L-Master 迁移**：L-Master 全局规则编辑器从 Settings 迁移至 Admin「全局中枢」tab，普通用户不再可见。

### 4.3 状态管理 (实际)

| Store | 职责 | 文件 |
|-------|------|------|
| authStore | 登录/注册/登出/JWT 管理 + 积分乐观预扣 + 积分刷新 | [`stores/authStore.ts`](frontend/src/stores/authStore.ts) |
| gameStore | 当前剧本/存档/对话/引擎状态 (l1/l2/l3 idle/running) | [`stores/gameStore.ts`](frontend/src/stores/gameStore.ts) |
| uiStore | 侧边栏/导航/通知 (含自动消失) + lobbyState | [`stores/uiStore.ts`](frontend/src/stores/uiStore.ts) |

### 4.4 Hook Composition 三层架构 (v2.0)

```
┌──────────────────────────────────────────────────────────┐
│                    usePlayEngine                          │
│                  (编排层 — 纯事件路由)                      │
│                                                          │
│  职责: 组合子 Hook、缝合数据流、暴露统一接口                 │
│  不直接操作 IndexedDB，不直接创建 StreamClient              │
├──────────────────────────┬───────────────────────────────┤
│                          │                               │
│    usePlayStorage        │       useAIComm               │
│    (存储层 Hook)          │       (通信层 Hook)            │
│                          │                               │
│  状态:                    │   状态:                        │
│  conversations           │   isGenerating                │
│  currentSave             │   streamingContent            │
│  currentScenario         │   lastTokenCount              │
│  currentTurn             │   highlightKeywords           │
│  saveList                │   modelKey / useByok          │
│  worldbookEntries        │                               │
│                          │   方法:                        │
│  方法:                    │   triggerSend()               │
│  hydrate()               │   cancelStream()              │
│  autoSync()              │   resolveModel()              │
│  appendUserMessage()     │                               │
│  appendAssistantMessage()│   回调注入:                    │
│  deleteConversationsFrom()│  onDone(content, turn, text) │
│  forkSave()              │  onStream(content)            │
│  switchSave()            │                               │
│  resetMemory()           │   模块级单例:                   │
│  incrementTurn()         │   memoryLoader                │
│                          │   assembler                   │
│  ref 快照:                │   tokenBudget                 │
│  currentSaveRef          │                               │
│  conversationsRef        │                               │
│  currentTurnRef          │                               │
└──────────────────────────┴───────────────────────────────┘
```

> **核心原则**：`usePlayStorage` 只跟数据打交道（IndexedDB + 云端），`useAIComm` 只跟大模型 API 打交道，`usePlayEngine` 只做编排缝合。`onDone` 回调是三层之间的唯一缝合点。

#### onDone 回调的缝合逻辑 (v2.0 解耦后)

```typescript
onDone: async (content, turn, userText) => {
  // 1. 持久化 AI 回复（存储层）
  storage.appendAssistantMessage(content, savId, turn);
  
  // 2. 回合递增（存储层）
  const nextTurn = storage.incrementTurn();
  
  // 3. 触发记忆引擎（MemoryLoaderService — 模块级单例）
  aiComm.memoryLoader.afterResponse(savId, nextTurn);
  
  // 4. 触发云端同步（存储层）
  storage.autoSync();
}
```

> v1.x 时代：`onDone` 中直接操作 `db.putConversation()`、`setCurrentTurn()`、`memoryLoader.afterResponse()`、`autoSyncRef.current()` — 四个关注点耦合在一个 80 行的闭包中。
> v2.0：`onDone` 缩减为 4 行调用，每个关注点委托给对应的子 Hook。

---

## 5. 技术栈 (实际)

| 层 | 选型 | 版本 | 文件 |
|----|------|------|------|
| 前端框架 | React + Vite | 18 + 5 | [`package.json`](frontend/package.json) |
| 样式 | Tailwind CSS | 3 | [`tailwind.config.js`](frontend/tailwind.config.js) |
| 全局状态 | Zustand | 4 | [`stores/`](frontend/src/stores/) |
| 本地存储 | IndexedDB (idb) | 8 | [`db/index.ts`](frontend/src/db/index.ts) |
| Worker | Web Worker (Comlink) | 4 | [`worker/memoryEngine.ts`](frontend/src/worker/memoryEngine.ts) |
| 流式通信 | 原生 fetch + ReadableStream | — | [`engine/StreamClient.ts`](frontend/src/engine/StreamClient.ts) |
| 后端 | Go + Gin | 1.22 | [`backend/`](backend/) |
| 后端 DB | SQLite (WAL) + GORM | — | [`services/database.go`](backend/services/database.go) |
| 认证 | JWT (golang-jwt/v5) + Bcrypt | — | [`middleware/auth.go`](backend/middleware/auth.go) |
| 全文搜索 | FTS5 trigram | — | [`services/database.go`](backend/services/database.go) |
| 部署 | Docker 多阶段构建 | — | [`Dockerfile`](Dockerfile) |

---

## 6. 已知妥协与技术债

以下为当前代码中明确保留的妥协项，不做隐瞒：

| 妥协项 | 说明 | 原因 |
|--------|------|------|
| L1 输出 ≤300 字约束 | L1 prompt 要求 AI 输出 ≤300 字，无硬性截断 | 硬截断可能丢失关键剧情，依赖 AI 遵循指令 |
| IndexedDB 无自动清理 | 存档体积持续增长 | 依赖用户手动导出/清理 |
| FTS5 触发器使用空字符串 | scenarios_fts 触发器中 author_name 和 tags 字段填充为 '' 而非实际值 | 原始设计未包含这两个字段，后续添加但未更新触发器 |
| 无脏标记 Race Condition 防护 | 乐观更新未实现 | 依赖未来 PR |
| 无云端同步 | 存档仅本地 IndexedDB + 后端存储 | 加密层已实现但同步未做 |
| 无 react-hook-form | Creator 页面使用原生表单 | 未引入 useFieldArray |
| 无 browser-image-compression | 图片上传无前端压缩 | 依赖未来 PR |
| L2 JSON 解析无防弹处理 | AI 返回的 JSON 可能被 Markdown 代码块包裹（```json ... ```），直接 `JSON.parse()` 会抛出 `SyntaxError` | 已修复：`safeParseL2JSON()` 使用 `match(/\[.*\]/s)` 正则提取 |
| L3 落库策略为追加而非覆盖 | L3 使用唯一 ID 导致多条记录，`getLatestMemory()` 只能取到最新一条 | 已修复：使用固定 ID `l3-${savId}` 实现覆盖 |
| L2 落库无去重 | AI 可能重复匹配相同 keyword 的世界书词条 | 已修复：`existingKeywords` Set 检查后插入 |
| PromptAssembler 装配序列错误 | L1 放在 `messages[]` 中，L3 未紧贴 L0，违反 Lost in the Middle 注意力权重原则 | 已修复：L0→L3→L2→L1 全部放入 `system_prompt`，`messages[]` 仅含历史对话 |
| TokenBudgetManager.budgetCheck() L1 重复注入 | L1 已由 PromptAssembler 嵌入 `systemPrompt`，但 `budgetCheck()` 在 `messages[]` 中又加了一次 | 已修复：移除 `messages[]` 中的 L1 system message |
| Play.tsx 模块级单例 | tokenBudget / memoryLoader / assembler 为模块级全局变量，未通过 DI 或 Context 注入 | Play 是唯一消费者，暂无需多实例；测试时需重构 |
| **useAIComm 中 memoryLoader 仍为模块级单例** | `MemoryLoaderService` 在 `useAIComm.ts` 中仍为模块级 `const` 实例，未通过 DI 注入 | 与 `usePlayEngine` 时代的单例一致，Play 是唯一消费者 |
| **usePlayStorage 中 autoSync 未使用 useCallback 优化** | `autoSync` 依赖 `currentSaveRef`/`currentScenarioRef` 等 ref，每次渲染引用稳定 | ref 模式天然稳定，无需额外优化 |
| Creator 无 Split Pane 预览 | Creator 页面无右侧 iframe 实时预览 | 依赖未来 PR |
| 无 Markdown AST 渲染 | 对话消息以纯文本 whitespace-pre-wrap 渲染 | 依赖未来 PR |
| 无 SSE 重连机制 | StreamClient 仅 1 次重试 (1s 延迟)，无指数退避 | 简单场景足够 |
| **BYOK CORS 限制** | 前端 `fetch(endpoint/models)` 受浏览器同源策略限制，若 endpoint 不支持 CORS 则无法拉取模型列表 | 浏览器安全策略，非前端代码问题。解决方案：后端新增 `/api/user/models/byok` 代理路由 |
| **Settings 导出函数已修复** | 之前 `handleExportData` 中 conversations 收集逻辑被空函数替代，现已修复为真实遍历 saves 收集 | 已修复 |
| **autoSyncRef 已修复** | 之前 `autoSyncRef.current` 初始化为空函数 `async () => {}`，从未被赋值 | 已修复 v1.2：使用 ref 捕获最新状态的真实同步函数 |
| **L1_Summary 生命周期已修复** | 之前 forkSave/deleteSave/resetMemory 均遗漏 L1_Summary | 已修复 v1.2：三个操作均已补充 L1_Summary 处理 |
| **localSave.name 硬编码已修复** | 之前 `handleSwitchSave`/`handleLoadSave` 中存档名硬编码为 `存档 ${id.slice(0, 8)}` | 已修复 v1.2：改为使用后端返回的 `detail.name`，无值时 fallback |

---

## 7. 后端 API 路由 (实际)

| 方法 | 路径 | 认证 | 处理函数 | 文件 |
|------|------|------|----------|------|
| POST | /api/register | 无 | Register | [`handlers/auth.go`](backend/handlers/auth.go) |
| POST | /api/login | 无 | Login | [`handlers/auth.go`](backend/handlers/auth.go) |
| GET | /api/config/master-prompt | 无 | GetMasterPrompt | [`handlers/config.go`](backend/handlers/config.go) |
| PUT | /api/config/master-prompt | Admin | UpdateMasterPrompt | [`handlers/config.go`](backend/handlers/config.go) |
| GET | /api/scenarios | 无 | ListScenarios (分页/排序) | [`handlers/scenario.go`](backend/handlers/scenario.go) |
| GET | /api/scenarios/search | 无 | SearchScenarios (FTS5 + LIKE fallback) | [`handlers/scenario.go`](backend/handlers/scenario.go) |
| GET | /api/scenarios/:id | 无 | GetScenario | [`handlers/scenario.go`](backend/handlers/scenario.go) |
| POST | /api/scenarios | JWT | CreateScenario | [`handlers/scenario.go`](backend/handlers/scenario.go) |
| PUT | /api/scenarios/:id | JWT/Admin | UpdateScenario (admin 编辑设 edited_by_admin=true) | [`handlers/scenario.go`](backend/handlers/scenario.go) |
| PUT | /api/scenarios/:id/ban | Admin | BanScenario | [`handlers/scenario.go`](backend/handlers/scenario.go) |
| GET | /api/scenarios/flagged | Admin | ListFlaggedScenarios | [`handlers/scenario.go`](backend/handlers/scenario.go) |
| GET | /api/saves | JWT | ListSaves | [`handlers/save.go`](backend/handlers/save.go) |
| POST | /api/saves | JWT | UploadSave | [`handlers/save.go`](backend/handlers/save.go) |
| GET | /api/saves/:id | JWT | GetSave | [`handlers/save.go`](backend/handlers/save.go) |
| **PUT** | **/api/saves/:id** | **JWT** | **UpdateSave** (v1.2 新增) | [`handlers/save.go`](backend/handlers/save.go) |
| DELETE | /api/saves/:id | JWT | DeleteSave | [`handlers/save.go`](backend/handlers/save.go) |
| POST | /api/chat/proxy | JWT | ChatProxy (SSE 流式代理) | [`handlers/chat.go`](backend/handlers/chat.go) |
| POST | /api/upload_image | JWT | UploadImage (≤30KB, jpg/png/webp) | [`handlers/image.go`](backend/handlers/image.go) |
| GET | /api/user/points | JWT | GetUserPoints | [`handlers/user_points.go`](backend/handlers/user_points.go) |
| GET | /api/user/models/health | 无 | GetModelHealth | [`handlers/user_points.go`](backend/handlers/user_points.go) |
| POST | /api/user/encrypted-key | JWT | SaveEncryptedKey (零信任密文存储) | [`handlers/encrypted_key.go`](backend/handlers/encrypted_key.go) |
| GET | /api/user/encrypted-key | JWT | GetEncryptedKey | [`handlers/encrypted_key.go`](backend/handlers/encrypted_key.go) |
| GET | /api/admin/dashboard | Admin | GetDashboard (含模型健康) | [`handlers/admin.go`](backend/handlers/admin.go) |
| GET | /api/admin/users | Admin | ListUsers | [`handlers/admin.go`](backend/handlers/admin.go) |
| **PUT** | **/api/admin/users/:id** | **Admin** | **UpdateUser (编辑用户名/角色/密码/积分)** | [`handlers/admin.go`](backend/handlers/admin.go) |
| POST | /api/admin/users/:id/points | Admin | UpdateUserPoints (含 PointLog) | [`handlers/admin.go`](backend/handlers/admin.go) |
| GET | /api/admin/platform-models | Admin | ListPlatformModels | [`handlers/admin.go`](backend/handlers/admin.go) |
| POST | /api/admin/platform-models | Admin | CreatePlatformModel | [`handlers/admin.go`](backend/handlers/admin.go) |
| PUT | /api/admin/platform-models/:id/toggle | Admin | TogglePlatformModel | [`handlers/admin.go`](backend/handlers/admin.go) |
| GET | /api/admin/providers | Admin | ListProviders | [`handlers/admin.go`](backend/handlers/admin.go) |
| POST | /api/admin/providers | Admin | CreateProvider | [`handlers/admin.go`](backend/handlers/admin.go) |
| POST | /api/admin/providers/:id/toggle | Admin | ToggleProvider | [`handlers/admin.go`](backend/handlers/admin.go) |
| **POST** | **/api/admin/providers/:id/import-models** | **Admin** | **ImportProviderModels (一键导入渠道模型到模型货架，自动格式化显示名为 `[渠道名] [模型名]`，跳过已存在)** | [`handlers/admin.go`](backend/handlers/admin.go) |
| **POST** | **/api/admin/providers/test** | **Admin** | **TestProviderConnection (测试渠道连通性 + 返回模型列表)** | [`handlers/admin.go`](backend/handlers/admin.go) |
| **POST** | **/api/admin/providers/health-check** | **Admin** | **BatchTestProviders (批量测试所有活跃渠道连通性，返回 `{id, name, online, message, model_count}[]`)** | [`handlers/admin.go`](backend/handlers/admin.go) |
| GET | /api/admin/notifications/count | Admin | GetNotificationCount | [`handlers/admin.go`](backend/handlers/admin.go) |
| GET | /api/admin/config/:key | Admin | GetGlobalConfig | [`handlers/config.go`](backend/handlers/config.go) |
| PUT | /api/admin/config/:key | Admin | UpdateGlobalConfig | [`handlers/config.go`](backend/handlers/config.go) |

> **粗体** = v1.2 新增路由。

---

## 8. 编译状态

| 模块 | 编译结果 | 说明 |
|------|----------|------|
| Go 后端 | ✅ 零错误 | `go build ./cmd/server/` 通过 |
| TypeScript 前端 | ✅ 零错误 | `tsc --noEmit` 通过 |
| 前端依赖 | ✅ 已安装 | 233 packages |

> **v2.8 编译验证**：Bug #18-#22 修复后，Go 后端 `go build ./cmd/server/` 零错误，TypeScript 前端 `npx tsc --noEmit` 零错误。

---

## 9. 文件清单

### 后端 (15 个 .go 文件)

| 文件 | 行数 | 职责 |
|------|------|------|
| [`backend/cmd/server/main.go`](backend/cmd/server/main.go) | 150 | Gin 路由注册 + CORS |
| [`backend/config/config.go`](backend/config/config.go) | 61 | 环境变量配置 |
| [`backend/models/models.go`](backend/models/models.go) | 221 | GORM 模型 + DTO (含 AIProvider, PlatformModel, UserEncryptedKey, Image, PointLog, GlobalConfig, UpdateUserRequest) |
| [`backend/middleware/auth.go`](backend/middleware/auth.go) | 90 | JWT 生成/验证/中间件 |
| [`backend/services/database.go`](backend/services/database.go) | 204 | SQLite 初始化 + FTS5 + 默认 L-Master + 默认 AI 提供商 + 默认模型 |
| [`backend/services/health.go`](backend/services/health.go) | 133 | Ring Buffer 健康监测 (100 条/模型, RWMutex) |
| [`backend/handlers/auth.go`](backend/handlers/auth.go) | 106 | 注册 (含 bonus 积分) + 登录 |
| [`backend/handlers/scenario.go`](backend/handlers/scenario.go) | 270 | 剧本 CRUD + FTS5 搜索 + 封禁 |
| [`backend/handlers/save.go`](backend/handlers/save.go) | 127 | 存档 CRUD (含 UpdateSave v1.2 新增) |
| [`backend/handlers/config.go`](backend/handlers/config.go) | 64 | L-Master 配置 + 全局配置 CRUD |
| [`backend/handlers/chat.go`](backend/handlers/chat.go) | 144 | Chat Proxy + 预扣积分 + 健康记录 |
| [`backend/handlers/admin.go`](backend/handlers/admin.go) | 476 | 管理控制台 (仪表盘/用户/模型/通知/AI Provider CRUD + 用户编辑 + 渠道测试 + 批量连通性检测) |
| [`backend/handlers/image.go`](backend/handlers/image.go) | 87 | 图片上传 (≤30KB, UUID 命名) |
| [`backend/handlers/encrypted_key.go`](backend/handlers/encrypted_key.go) | 66 | 零信任加密密钥存储 (upsert + 查询) |
| [`backend/handlers/user_points.go`](backend/handlers/user_points.go) | 57 | 用户积分查询 + 模型健康状态 (公开) |

### 前端 (30 个 .ts/.tsx 文件)

| 文件 | 行数 | 职责 |
|------|------|------|
| [`frontend/src/main.tsx`](frontend/src/main.tsx) | 13 | 应用入口 |
| [`frontend/src/App.tsx`](frontend/src/App.tsx) | 66 | 根组件 (Sidebar + TopBar + 页面切换 + Notification) |
| [`frontend/src/index.css`](frontend/src/index.css) | 44 | Tailwind 基础 + 自定义滚动条 + 毛玻璃类 |
| [`frontend/src/types/index.ts`](frontend/src/types/index.ts) | 219 | 所有 TypeScript 类型定义 |
| [`frontend/src/engine/StreamClient.ts`](frontend/src/engine/StreamClient.ts) | 186 | SSE 流式客户端 (AbortController + 1 次重试，max_tokens:8192 默认值) |
| [`frontend/src/engine/TokenBudgetManager.ts`](frontend/src/engine/TokenBudgetManager.ts) | 149 | Token 估算 + 预算裁剪 (calculateM + budgetCheck) |
| [`frontend/src/engine/PromptAssembler.ts`](frontend/src/engine/PromptAssembler.ts) | 119 | Prompt 组装管线 (并行加载 + 注意力权重拼接) |
| [`frontend/src/db/index.ts`](frontend/src/db/index.ts) | 370 | IndexedDB CRUD (5 表 + forkSave + createSaveFromScenario + createSaveFromApiScenario) |
| [`frontend/src/worker/memoryEngine.ts`](frontend/src/worker/memoryEngine.ts) | 135 | Web Worker L2 fallback 计算 (Comlink 暴露) |
| [`frontend/src/services/MemoryLoaderService.ts`](frontend/src/services/MemoryLoaderService.ts) | 369 | 记忆加载器 (IndexedDB 读取 + AI 模型调用 + afterResponse 触发 L1/L2/L3 顺序执行 + Promise chain queue 防竞态) |
| [`frontend/src/utils/api.ts`](frontend/src/utils/api.ts) | 420 | HTTP 请求封装 (JWT 注入 + 类型化 API 函数，含 AI Provider CRUD + updateSave + getGlobalConfig/updateGlobalConfig + adminUpdateUser + adminTestProviderConnection + adminBatchTestProviders) |
| [`frontend/src/utils/crypto.ts`](frontend/src/utils/crypto.ts) | 130 | 零信任 AES-GCM 端侧加密 (PBKDF2 600K 迭代) |
| [`frontend/src/utils/characterCard.ts`](frontend/src/utils/characterCard.ts) | 384 | 角色卡导入 (PNG chunk 解析 + V2 JSON + Prologue HTML 生成) |
| [`frontend/src/utils/playEngineHelpers.ts`](frontend/src/utils/playEngineHelpers.ts) | 102 | 游玩引擎纯函数 (loadByokConfig + createMemoryModelCaller) |
| [`frontend/src/stores/authStore.ts`](frontend/src/stores/authStore.ts) | 128 | 认证状态 + 积分乐观预扣 + 刷新 |
| [`frontend/src/stores/gameStore.ts`](frontend/src/stores/gameStore.ts) | 79 | 游戏运行时状态 (引擎状态灯) |
| [`frontend/src/stores/uiStore.ts`](frontend/src/stores/uiStore.ts) | 76 | UI 状态 (侧边栏/导航/通知 + lobbyState) |
| [`frontend/src/components/Sidebar.tsx`](frontend/src/components/Sidebar.tsx) | 173 | 侧边栏导航 (translateX 动画 + 用户信息 + admin 底部黄色警告入口) |
| [`frontend/src/components/TopBar.tsx`](frontend/src/components/TopBar.tsx) | 81 | 顶部导航栏 (汉堡菜单 + 页面标题 + 用户状态) |
| [`frontend/src/components/Notification.tsx`](frontend/src/components/Notification.tsx) | 39 | 通知浮层 (success/error/info/warning) |
| [`frontend/src/components/AuthModal.tsx`](frontend/src/components/AuthModal.tsx) | 115 | 登录/注册弹窗 |
| [`frontend/src/components/play/MemoryInspector.tsx`](frontend/src/components/play/MemoryInspector.tsx) | 202 | 潜意识中枢 — 实时从 IndexedDB 拉取 L1/L2/L3 动态记忆 |
| [`frontend/src/pages/Lobby.tsx`](frontend/src/pages/Lobby.tsx) | 282 | 大厅 (分页/排序/搜索/Fork & Copy + Zustand lobbyState 持久化) |
| [`frontend/src/pages/Saves.tsx`](frontend/src/pages/Saves.tsx) | 549 | 存档管理 (按剧本分组 + 多分支树 + flattenSaveTree 外部纯函数 + CSS L 型折线 + ColorOS 卡片) |
| [`frontend/src/pages/Creator.tsx`](frontend/src/pages/Creator.tsx) | 677 | 创作 (四 Tab/角色卡导入/编辑模式/Blueprint 预览) |
| [`frontend/src/pages/Settings.tsx`](frontend/src/pages/Settings.tsx) | 535 | **个人设置**：三垂直 tab（账号与资产 / 算力通道(BYOK 真实 API 握手) / 数据管理）。不含管理功能。 |
| [`frontend/src/pages/Admin.tsx`](frontend/src/pages/Admin.tsx) | 1008 | **管理控制台**：六工业风 tab（全局中枢 / 仪表盘 / 模型货架 / 渠道管理 / 用户资产 / 内容巡查）。高密度、无玻璃拟态。含用户编辑弹窗 + 渠道测试连接 + 一键导入模型 + 已有渠道测试并导入弹窗 + 渠道展开模型列表 + 60s 自动连通性检测 + 按 tab 按需自动刷新。模型货架只读，模型仅通过渠道导入。 |
| [`frontend/src/pages/Play.tsx`](frontend/src/pages/Play.tsx) | 156 | 游玩界面 (Prologue/Greeting/Swipe/Undo/Reroll/Edit/Fork/Worldbook/Memory/Export/SaveSwitcher/AuthorNotes/L2高亮/Token显示/引擎状态灯 + 流式开关 + MemoryInspector 侧边栏) |
| [`frontend/src/hooks/usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts) | 476 | **编排层 Hook** — 组合 usePlayStorage + useAIComm，纯事件路由。v2.0 从 972 行 God Object 瘦身至此。 |
| [`frontend/src/hooks/usePlayStorage.ts`](frontend/src/hooks/usePlayStorage.ts) | 581 | **存储层 Hook** — hydrate/autoSync/CRUD/ref 管理。v2.0 从 usePlayEngine 提取。 |
| [`frontend/src/hooks/useAIComm.ts`](frontend/src/hooks/useAIComm.ts) | 220 | **通信层 Hook** — StreamClient/模型选择/记忆模型调用器注入 + 流式/非流式开关。v2.0 从 usePlayEngine 提取。 |

---

## 10. 文档与实际代码差异记录

| # | 差异项 | 文档旧状态 | 实际代码状态 |
|---|--------|-----------|-------------|
| 1 | 后端 .go 文件数 | 13 个 | 15 个 (新增 encrypted_key.go, user_points.go) |
| 2 | 前端 .ts/.tsx 文件数 | 16 个 | 23 个 (新增 MemoryLoaderService.ts, TopBar.tsx, AuthModal.tsx, crypto.ts, characterCard.ts, index.css, playEngineHelpers.ts) |
| 3 | 零信任安全 | ❌ 未实现 | ✅ 已实现 (crypto.ts + encrypted_key.go) |
| 4 | BYOK/平台代理双轨制 | ⚠️ 部分实现 | ✅ 已实现 (Play.tsx resolveModel + getUserModelPref) |
| 5 | SCN/SAV 隔离 | ⚠️ 部分实现 | ✅ 已实现 (forkSave + createSaveFromApiScenario) |
| 6 | 后端路由缺失 | 无 DELETE /saves/:id | 已实现 DeleteSave |
| 7 | 后端路由缺失 | 无 GET /user/points | 已实现 GetUserPoints |
| 8 | 后端路由缺失 | 无 POST/GET /user/encrypted-key | 已实现 SaveEncryptedKey/GetEncryptedKey |
| 9 | 后端路由缺失 | 无 GET /user/models/health | 已实现 GetModelHealth (公开) |
| 10 | Scenario 模型字段 | 缺少 cover_url, intro | 实际存在 |
| 11 | Save 模型字段 | 缺少 parent_sav_id | 实际存在 (多分支) |
| 12 | FTS5 触发器缺陷 | 未记录 | 触发器使用 '' 而非实际值填充 author_name/tags |
| 13 | 技术债列表过时 | 多条标记为"未实现"的条目实际已实现 | 已更新 |
| 14 | 文件行数不准确 | 多文件行数估算偏低 | 已更新为实际行数 |
| 15 | 核心原则表多处错误 | 零信任/BYOK/SCN隔离标记错误 | 已修正 |
| 16 | L2 JSON 解析无防弹处理 | 直接 `JSON.parse()` 会因 Markdown 代码块崩溃 | 已修复：`safeParseL2JSON()` 正则提取 |
| 17 | L3 落库策略为追加 | L3 使用唯一 ID 导致多条记录 | 已修复：固定 ID `l3-${savId}` 实现覆盖 |
| 18 | L2 落库无去重 | AI 可能重复匹配相同 keyword | 已修复：`existingKeywords` Set 检查 |
| 19 | PromptAssembler 装配序列错误 | L1 在 `messages[]`，L3 未紧贴 L0 | 已修复：L0→L3→L2→L1 全部在 `system_prompt` |
| 20 | TokenBudgetManager L1 重复注入 | L1 已嵌入 systemPrompt 但 budgetCheck 又加了一次 | 已修复：移除 `messages[]` 中的 L1 |
| 21 | 前端 .ts/.tsx 文件数 | 22 个 | 23 个 (新增 playEngineHelpers.ts) |
| 22 | **autoSyncRef 空操作 (v1.2 修复)** | `autoSyncRef.current` 初始化为空函数，从未被赋值 | 已修复：使用 ref 捕获最新状态的真实同步函数，PUT /api/saves/:id 回退 POST |
| 23 | **L1_Summary 生命周期不完整 (v1.2 修复)** | forkSave/deleteSave/resetMemory 均遗漏 L1_Summary | 已修复：三个操作均已补充 L1_Summary 深拷贝/级联删除 |
| 24 | **localSave.name 硬编码 (v1.2 修复)** | 存档名硬编码为 `存档 ${id.slice(0, 8)}` | 已修复：使用后端返回的 `detail.name`，无值时 fallback |
| 25 | **后端路由缺失 (v1.2 新增)** | 无 PUT /api/saves/:id | 已实现 UpdateSave (更新 save_data/name/scenario_title) |
| 26 | **Save 模型字段 (v1.2 新增)** | saves 表无 name/scenario_title | 实际存在 (UploadSaveRequest 也包含) |
| 27 | **文件行数更新 (v1.2)** | save.go:81, main.go:124, db/index.ts:354, api.ts:362, Saves.tsx:350, usePlayEngine.ts:未收录 | save.go:104, main.go:104, db/index.ts:319, api.ts:309, Saves.tsx:358, usePlayEngine.ts:746 |
| 28 | **云端反向拉取 (v1.3 修复)** | Hydration 时 IndexedDB 缺失直接走新开局 | 已修复：IndexedDB 无数据时自动 GET /api/saves/:id 拉取云端数据写入本地并恢复现场 |
| 29 | **Regenerate 方法 (v1.3 新增)** | 无 regenerate 功能 | 已实现：handleRegenerate 删除 AI 回复后自动重新触发 triggerSend |
| 30 | **文件行数更新 (v1.3)** | usePlayEngine.ts:746 | usePlayEngine.ts:900 |
| 31 | **URL as State (v1.4 修复)** | 大厅搜索词/页码/排序仅存 Zustand，刷新丢失 | 已修复：编码到 `?q=&page=&sort=` URL search params，刷新/导航返回均保持 |
| 32 | **useDebounce 防抖 (v1.4 新增)** | 每次敲击键盘都触发 API 请求 | 已修复：`useDebounce(searchQuery, 400)` 防抖，停止输入 400ms 后自动搜索 |
| 33 | **树拍平渲染 (v1.4 重构)** | `renderTree` 返回递归 ReactNode 数组，50+ 分支卡白屏 | 已重构：树拍平为 `FlatNode[]` 一维数组，`padding-left` 模拟缩进，消除递归 DOM |
| 34 | **文件行数更新 (v1.4)** | Lobby.tsx:268, Saves.tsx:358, 新增 useDebounce.ts | Lobby.tsx:~330, Saves.tsx:~340, useDebounce.ts:18 |
| 35 | **Zustand lobbyState 替代 URL as State (v1.5 重构)** | Lobby 使用 `window.history.replaceState` 编码搜索状态到 URL | 已重构：使用 Zustand `uiStore.lobbyState`（`keyword` + `page`）持久化，`localKeyword` useState → 500ms debounce useEffect → 同步到 lobbyState → 触发 API 请求。`lobbyState.keyword` 为空时显示分页，非空时隐藏分页。见 [`Lobby.tsx`](frontend/src/pages/Lobby.tsx) / [`uiStore.ts`](frontend/src/stores/uiStore.ts) |
| 36 | **uiStore.lobbyState 字段精简 (v1.5)** | `searchQuery` + `page` + `sortBy` | 已精简为 `keyword` + `page`（移除 `sortBy`），见 [`uiStore.ts`](frontend/src/stores/uiStore.ts) |
| 37 | **Lobby 导出方式变更 (v1.5)** | `export const Lobby: React.FC` | 已改为 `export default function Lobby()`，`App.tsx` 相应改为 default import，见 [`Lobby.tsx`](frontend/src/pages/Lobby.tsx) / [`App.tsx`](frontend/src/App.tsx) |
| 38 | **文件行数更新 (v1.5)** | Lobby.tsx:~330 | Lobby.tsx:~280（移除 URL 工具函数 + useDebounce 依赖，代码更精简） |
| 39 | **flattenSaveTree 外部纯函数 (v1.6 重构)** | 树拍平算法内联在 `useMemo` 中，使用迭代栈 + `connector`/`childPrefix` 字符串符号 | 已重构：`flattenSaveTree()` 外部纯函数，DFS 递归注入 `depth`，`useMemo` 缓存拍平结果。见 [`Saves.tsx`](frontend/src/pages/Saves.tsx) |
| 40 | **CSS L 型折线替代文本符号 (v1.6)** | 使用 `├─` `└─` `│` 文本字符绘制分支连线 | 已替换：使用 `border-l-2 border-b-2 rounded-bl-lg` CSS 伪元素绘制 L 型折线，`paddingLeft: depth * 28` 缩进。见 [`Saves.tsx`](frontend/src/pages/Saves.tsx) |
| 41 | **ColorOS 水生质感卡片 (v1.6)** | 紧凑行样式，`bg-white/[0.02]` 极简风格 | 已替换：`bg-[#1c1d26]/80 backdrop-blur-md border-white/5 rounded-2xl` 悬浮玻璃质感，hover 时 `shadow-neon-purple`。操作按钮 `opacity-0 group-hover:opacity-100` 悬浮显示。见 [`Saves.tsx`](frontend/src/pages/Saves.tsx) |
| 42 | **Saves 导出方式变更 (v1.6)** | `export const Saves: React.FC` | 已改为 `export default function Saves()`，`App.tsx` 相应改为 default import。见 [`Saves.tsx`](frontend/src/pages/Saves.tsx) / [`App.tsx`](frontend/src/App.tsx) |
| 43 | **页面标题变更 (v1.6)** | "我的存档" | 已改为 "平行宇宙时间线"。见 [`Saves.tsx`](frontend/src/pages/Saves.tsx) |
| 44 | **文件行数更新 (v1.6)** | Saves.tsx:~340 | Saves.tsx:~280（移除 `SaveNode`/`FlatNode` 接口、`sortChildren`/`computeDescendantCount` 辅助函数、`treeGroups` 分组逻辑，代码更精简） |
| 45 | **回合递增缺失 (v1.7 修复)** | `onDone` 中无回合递增，`afterResponse` 传入旧 turn，L1/L2/L3 永不触发；无 `autoSyncRef.current()` 调用 | 已修复：`nextTurn = turn + 1` → `setCurrentTurn` + `currentTurnRef.current` → `afterResponse(savId, nextTurn)` → `autoSyncRef.current()`。见 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts:495) |
| 46 | **L1/L2/L3 取余逻辑无 turn>0 保护 (v1.7 修复)** | `turn % 3 === 0` / `turn % 5 === 0` / `turn % 10 === 0` 在第 0 回合触发，浪费 AI 调用 | 已修复：加 `turn > 0` 保护。见 [`MemoryLoaderService.ts`](frontend/src/services/MemoryLoaderService.ts:171) |
| 47 | **hydrate 中 currentTurnRef 未同步 (v1.7 修复)** | 云端恢复和 IndexedDB 恢复两处 `setCurrentTurn(maxTurn)` 后未同步 `currentTurnRef.current`，闭包内 ref 持有旧值 | 已修复：两处均添加 `currentTurnRef.current = maxTurn`。见 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts:311) |
| 48 | **文件行数更新 (v1.7)** | usePlayEngine.ts:~945 | usePlayEngine.ts:~955（新增回合递增 + autoSync 调用） |
| 49 | **Saves 按剧本分组 (v1.8 重构)** | 进入 Saves 直接展示所有存档的扁平树，玩家有多本书时混在一起 | 已重构：先按 `scenario_id` 分组展示剧本卡片列表（封面/标题/存档数/最后游玩时间），点击剧本后展开该剧本下的存档树（保留 flattenSaveTree + CSS L 型折线 + ColorOS 卡片）。新增 `groupByScenario()` 外部纯函数 + `selectedScenarioId` 状态控制展开/收起。见 [`Saves.tsx`](frontend/src/pages/Saves.tsx) |
| 50 | **页面标题恢复 (v1.8)** | "平行宇宙时间线" | 已改为 "我的存档"（第一层剧本列表），进入具体剧本后显示剧本标题。见 [`Saves.tsx`](frontend/src/pages/Saves.tsx) |
| 51 | **封面加载 (v1.8 新增)** | 剧本卡片无封面，仅显示渐变色圆形 + 首字母 | 已新增：`coverMap` 状态 + `coverLoadedRef` 防重复，`loadSaves()` 完成后通过 `Promise.all` 批量调用 `api.getScenario(id)` 获取封面 URL。有封面显示 `<img>`，无封面保持渐变色 fallback。见 [`Saves.tsx`](frontend/src/pages/Saves.tsx) |
| 52 | **文件行数更新 (v1.8)** | Saves.tsx:~280 | Saves.tsx:~555（新增 `groupByScenario()` + `stringToColor()` + `formatRelativeTime()` + 封面加载逻辑，两层渲染逻辑） |
| 53 | **Regenerate 气泡消失 (v1.8 修复)** | `handleRegenerate` 调用 `triggerSend` 后，`onDone` 中 `conversations.findIndex` 闭包捕获旧值，找到已删除的 AI 消息，走 `updateConversation` 分支导致气泡消失 | 已修复：新增 `isRegenerateRef` 标记，`handleRegenerate` 调用 `triggerSend` 前设置 `isRegenerateRef.current = true`，`onDone` 检测到标记时跳过 `existingIdx` 检查，强制走 `addConversation` 新建分支。见 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts:200) |
| 54 | **Hook Composition 三层重构 (v2.0)** | `usePlayEngine.ts` 972 行 God Object，存储/AI/路由三者耦合。`onDone` 回调同时操作持久化、回合递增、记忆引擎、云端同步 | 已重构：拆分为三个职责单一的 Hook——[`usePlayStorage.ts`](frontend/src/hooks/usePlayStorage.ts)（存储层：hydrate/autoSync/CRUD/ref）、[`useAIComm.ts`](frontend/src/hooks/useAIComm.ts)（通信层：StreamClient/模型选择/记忆模型调用器注入）、[`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts)（编排层：纯事件路由，组合两个子 Hook）。`onDone` 回调现在只做编排：调用 `storage.appendAssistantMessage()` → `storage.incrementTurn()` → `aiComm.memoryLoader.afterResponse()` → `storage.autoSync()`。TypeScript 零错误。 |
| 55 | **混沌闭包修复 (v2.0)** | `onDone`/`onStream` 回调在 `useCallback` 中捕获过时闭包，导致 `currentTurnRef`/`conversations` 为旧值 | 已修复：新增 `onDoneRef`/`onStreamRef` 中转层，`usePlayEngine` 在每次渲染时更新 ref，`StreamClient` 回调始终通过 ref 调用最新函数。见 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts) |
| 56 | **MemoryInspector 潜意识中枢 (v2.0)** | 无 L1/L2/L3 可视化面板，调试依赖浏览器 DevTools | 已新增：[`MemoryInspector.tsx`](frontend/src/components/play/MemoryInspector.tsx) 组件，`Play.tsx` 右侧 `flex-row` 布局 + `hidden xl:flex` 响应式。实时显示 L0 初始信息、L1 摘要、L2 世界书条目（四要素卡片）、L3 剧情线。见 [`Play.tsx`](frontend/src/pages/Play.tsx) |
| 57 | **L2 四要素框架 (v2.0)** | `WorldBookEntry` 只有 `keywords`/`content`，Prompt 中 L2 仅拼接关键词列表 | 已升级：`WorldBookEntry` 接口新增 `who`/`what`/`where`/`when` 四要素字段。`MemoryLoaderService.loadL2()` Prompt 改为四要素结构化输出。`safeParseL2JSON` 兼容层自动从 `content` 提取四要素。`MemoryInspector` 卡片显示四要素标签。见 [`types/index.ts`](frontend/src/types/index.ts) / [`MemoryLoaderService.ts`](frontend/src/services/MemoryLoaderService.ts) / [`MemoryInspector.tsx`](frontend/src/components/play/MemoryInspector.tsx) |
| 58 | **动态类型色板 (v2.0)** | L2 关键词标签全为黄色，视觉疲劳 | 已新增：`getTypeBadgeStyle(type)` 函数，按 `type` 字符串哈希映射 12 种颜色（靛蓝/翡翠/琥珀/玫瑰/青/紫/橙/粉/石灰/蓝/金/红）。见 [`MemoryInspector.tsx`](frontend/src/components/play/MemoryInspector.tsx) |
| 59 | **L2 可视化裁剪 (v2.0)** | L2 条目全部展示，长列表时面板溢出 | 已裁剪：`slice(0, 8)` 限制最多 8 条，超出部分折叠在 `<details>` 中。L1 同理 `slice(0, 5)`。见 [`MemoryInspector.tsx`](frontend/src/components/play/MemoryInspector.tsx) |
| 60 | **引擎状态指示灯 (v2.1)** | `engineStatus` 在 `afterResponse` 期间未更新，玩家无法感知 AI 正在思考 | 已修复：`usePlayEngine.handleSend` 中 `setEngineStatus('running')`，`onDone` 回调中 `setEngineStatus('idle')`。`InputConsole` 发送按钮根据 `engineStatus` 显示加载动画。见 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts) / [`InputConsole.tsx`](frontend/src/components/play/InputConsole.tsx) |
| 61 | **顶部标题改为剧本名 (v2.1)** | TopBar 固定显示 "NIKO 酒馆" | 已修复：`TopBar` 通过 `useGameStore` 读取 `currentScenario?.name`，有剧本时显示剧本名，无剧本时显示 "NIKO 酒馆"。见 [`TopBar.tsx`](frontend/src/components/TopBar.tsx) |
| 62 | **模型显示不完整 (v2.1)** | 前端硬编码模型兜底列表，只显示部分模型（如 DeepSeek 只显示 Flash 不显示 Pro） | 已修复：删除 `InputConsole.tsx` 中 8 个硬编码模型兜底列表，完全信任后端 `/api/platform-models` 返回。后端返回什么前端就显示什么。见 [`InputConsole.tsx`](frontend/src/components/play/InputConsole.tsx) |
| 63 | **AI 渠道/模型偏好持久化 (v2.1)** | 每次刷新页面模型选择重置为默认值 | 已修复：`useAIComm` 初始化时从 `localStorage` 读取 `ai_model_pref`，`InputConsole` 切换模型时写入 `localStorage`。见 [`useAIComm.ts`](frontend/src/hooks/useAIComm.ts) / [`InputConsole.tsx`](frontend/src/components/play/InputConsole.tsx) |
| 64 | **硬编码值清理 (v2.1)** | `useAIComm.ts` 中 `'gpt-3.5-turbo'` 回退模型名、`'http://localhost:8080'` 硬编码地址 | 已清理：`'gpt-3.5-turbo'` → `''` 空字符串；`'http://localhost:8080/api/chat/proxy'` → `'/api/chat/proxy'`（Vite 代理转发）。涉及 [`useAIComm.ts`](frontend/src/hooks/useAIComm.ts)、[`playEngineHelpers.ts`](frontend/src/utils/playEngineHelpers.ts)、[`StreamClient.ts`](frontend/src/engine/StreamClient.ts) 共 4 处。 |
| 65 | **过期注释清理 (v2.1)** | 文件中残留 `// v1.8:`、`// v2.1:`、`// v3:`、`// v4:` 版本标记注释 | 已清理：移除 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts) 中 `// v1.8:` 前缀、[`MemoryLoaderService.ts`](frontend/src/services/MemoryLoaderService.ts) 中 `// v2.1:` 整行、[`Lobby.tsx`](frontend/src/pages/Lobby.tsx) 中 `// v3:` 整行、[`Saves.tsx`](frontend/src/pages/Saves.tsx) 中 `// v4:` 前缀、[`MemoryInspector.tsx`](frontend/src/components/play/MemoryInspector.tsx) 中 "上帝控制台" 用语。共 5 处。 |
| 66 | **仪表盘字段补齐 (v2.2 修复)** | `DashboardResponse` 缺少 `total_users`/`total_scenarios`/`total_saves`/`total_points_used`/`active_models` 5 个字段，前端 6 统计卡片只有 1 个有数据 | 已修复：`DashboardResponse` 结构体新增 5 字段，`GetDashboard` 重写查询所有指标。见 [`models/models.go`](backend/models/models.go) / [`handlers/admin.go`](backend/handlers/admin.go) |
| 67 | **模型健康 API 路径错误 (v2.2 修复)** | 前端调用 `GET /api/models/health`，后端路由为 `GET /api/admin/models/health`（需 Admin 认证），导致 401 | 已修复：前端路径改为 `/admin/models/health`。见 [`api.ts`](frontend/src/utils/api.ts) |
| 68 | **User 模型无 status 字段 (v2.2 修复)** | 前端 Admin 用户表格读取 `u.status === 1`，User 模型无 `status` 字段，所有用户显示为"封禁" | 已修复：移除 `u.status` 条件判断，硬编码显示"正常"。见 [`Admin.tsx`](frontend/src/pages/Admin.tsx) |
| 69 | **注册奖励积分无后端 API (v2.2 修复)** | Admin「全局中枢」注册奖励积分设置仅前端 mock，`handleSaveRegBonus` 为 TODO 空函数 | 已修复：新增 `GetGlobalConfig`/`UpdateGlobalConfig` handler + 路由，前端改用真实 API 调用。见 [`handlers/config.go`](backend/handlers/config.go) / [`api.ts`](frontend/src/utils/api.ts) / [`Admin.tsx`](frontend/src/pages/Admin.tsx) |
| 70 | **仪表盘字段名不匹配 (v2.2 修复)** | 后端返回 `points_consumed_today`，前端读取 `total_points_used` | 已修复：后端 JSON 标签改为 `total_points_used`。见 [`models/models.go`](backend/models/models.go) |
| 71 | **AI 多渠道架构 (v2.3 新增)** | `PlatformModel` 直接存储 `ProviderURL`/`APIKey`，每个模型独立配置，无法统一管理渠道 | 已重构：新增 `AIProvider` 表（id/name/base_url/api_key/is_active），`PlatformModel` 移除 `ProviderURL`/`APIKey`，新增 `ProviderID` 外键。`ChatProxy` 改为查询 `PlatformModel` → 解析 `ProviderID` → 查询 `AIProvider` → 使用 provider 的 BaseURL/APIKey。Admin 新增"渠道管理" tab（ListProviders/CreateProvider/ToggleProvider）。种子数据自动创建默认 DeepSeek 提供商。见 [`models/models.go`](backend/models/models.go) / [`handlers/admin.go`](backend/handlers/admin.go) / [`handlers/chat.go`](backend/handlers/chat.go) / [`services/database.go`](backend/services/database.go) / [`Admin.tsx`](frontend/src/pages/Admin.tsx) / [`api.ts`](frontend/src/utils/api.ts) |
| 72 | **用户编辑功能 (v2.3 新增)** | Admin 用户管理仅支持积分充值，无法修改用户名/角色/密码 | 已新增：`UpdateUserRequest` DTO（username/role/password/points），`UpdateUser` handler（PUT /api/admin/users/:id，支持 bcrypt 密码哈希 + 角色校验 + 可选字段更新），前端用户表格每行"编辑"按钮 → 弹窗表单（用户名/角色下拉/密码留空不修改/积分直接设定）→ 调用 `adminUpdateUser()`。见 [`models/models.go`](backend/models/models.go) / [`handlers/admin.go`](backend/handlers/admin.go) / [`api.ts`](frontend/src/utils/api.ts) / [`Admin.tsx`](frontend/src/pages/Admin.tsx) |
| 73 | **渠道连接测试 (v2.3 新增)** | 渠道创建表单无验证手段，管理员无法确认 BaseURL/APIKey 是否有效 | 已新增：`TestProviderConnection` handler（POST /api/admin/providers/test，调用 `GET {base_url}/v1/models` 验证连通性，返回 success/message/models 列表），前端创建表单"测试连接"按钮 → 显示成功/失败状态 + 可用模型列表。见 [`handlers/admin.go`](backend/handlers/admin.go) / [`api.ts`](frontend/src/utils/api.ts) / [`Admin.tsx`](frontend/src/pages/Admin.tsx) |
| 74 | **模型货架跟随渠道 (v2.4 重构)** | 模型货架 tab 有手动创建表单，管理员需手动填写 model_id/display_name/provider_id 等字段，与渠道管理重复 | 已重构：模型货架 tab **移除手动创建表单**，改为只读表格。新增 `ImportProviderModels` handler（POST /api/admin/providers/:id/import-models，接收模型名列表，自动格式化显示名为 `[渠道名] [模型名]`，跳过已存在记录）。渠道管理 tab 新增：测试连接成功后显示 **一键导入模型货架** 按钮（新建渠道先创建再导入）；已有渠道行新增 **测试并导入** 按钮 → 弹窗输入 API Key → 测试连接 → 一键导入。见 [`handlers/admin.go`](backend/handlers/admin.go) / [`api.ts`](frontend/src/utils/api.ts) / [`Admin.tsx`](frontend/src/pages/Admin.tsx) |
| 75 | **渠道展开模型列表 + 自动连通性检测 + 模型自动同步 (v2.5 新增)** | 渠道管理 tab 仅显示渠道名称/URL/状态，无法查看该渠道下有哪些模型；无自动连通性检测；`BatchTestProviders` 仅返回 model_count 数字，未实际导入模型到货架 | 已新增：渠道表格新增 **展开/折叠** 按钮（▶/▼），展开后显示该渠道下所有模型标签（从模型货架按 `provider_id` 过滤）。`BatchTestProviders` handler（POST /api/admin/providers/health-check）批量测试所有活跃渠道的 `/v1/models` 端点，**自动同步新模型到 `platform_models` 表**（按 `provider_id + model_id` 去重，显示名格式 `[渠道名] [模型名]`），返回 `{id, name, online, message, model_count, new_models}[]`。前端新增 `providerConnectivity` 状态 map + 60 秒 `setInterval` 轮询自动检测，每行显示绿色/红色状态点 + 模型数量，`new_models > 0` 时自动刷新模型列表并弹出通知。见 [`handlers/admin.go`](backend/handlers/admin.go) / [`api.ts`](frontend/src/utils/api.ts) / [`Admin.tsx`](frontend/src/pages/Admin.tsx) |
| 76 | **数据库 schema 迁移：移除 platform_models 废弃列 (v2.5 修复)** | `PlatformModel` Go 结构体已移除 `ProviderURL`/`APIKey` 字段，但 SQLite 数据库仍保留 `provider_url`(NOT NULL)/`api_key`(NOT NULL) 列，导致 `BatchTestProviders` 和 `ImportProviderModels` 创建新记录时触发 `NOT NULL constraint failed` | 已修复：执行 `ALTER TABLE platform_models DROP COLUMN provider_url` 和 `ALTER TABLE platform_models DROP COLUMN api_key`（SQLite 3.35.0+ 支持）。迁移后 `platform_models` 表 schema 与 Go 结构体完全一致。见 [`models/models.go`](backend/models/models.go) |
| 77 | **ChatProxy 查询字段修复：id → model_id (v2.5 数据链修复)** | `ChatProxy` 按 `WHERE id = ?` 查询 `PlatformModel`，但 `BatchTestProviders` 自动同步的模型 ID 格式为 `PM_{providerID}_{modelID}`（如 `PM_PROV_DEEPSEEK_deepseek-chat`），而前端 `InputConsole` 将 `model_id`（如 `deepseek-chat`）作为 `modelKey` 发送给后端，导致查询不到记录，返回 400 "该模型暂未开放或已下架" | 已修复：`ChatProxy` 改为 `WHERE model_id = ? AND is_active = ?` 查询，与前端传递的 `model_id` 字段对齐。见 [`handlers/chat.go`](backend/handlers/chat.go) |
| 78 | **管理页面按 tab 按需自动刷新 (v2.6 新增)** | 管理页面仅在初始化时加载一次数据，切换 tab 或执行写操作后需手动刷新才能看到最新数据 | 已新增：`useEffect` 监听 `activeTab` 变化，切换 tab 时自动刷新该 tab 对应的数据（hub→master+regbonus, dashboard→仪表盘, models→模型货架, providers→渠道+连通性, users→用户列表, moderation→内容巡查）。移除 tab 切换按钮中的手动 `loadFlaggedScenarios()`/`loadDashboard()` 调用。保留渠道连通性 60 秒独立轮询。见 [`Admin.tsx`](frontend/src/pages/Admin.tsx) |
| 79 | **Bug #13: GetModelHealth 查询列 id→model_id (v2.6 数据链修复)** | `GetModelHealth` 使用 `Where("id = ?", modelID)` 查询 `PlatformModel`，但 `GetAllHealthStats()` 返回的 map key 是 `model_id`（如 `deepseek-chat`），不是主键 `id`（如 `PM_PROV_DEEPSEEK_deepseek-chat`），导致 `displayName` 始终回退为 `modelID` 原始值 | 已修复：`Where("id = ?", modelID)` → `Where("model_id = ?", modelID)`。与 Bug #3 相同的问题，在 `user_points.go` 中。见 [`backend/handlers/user_points.go`](backend/handlers/user_points.go:40) |
| 80 | **Bug #17: Settings BYOK 获取模型缺少 /v1 前缀 (v2.6 低级手误)** | `handleFetchModels` 请求 `${cleanEndpoint}/models`，但 OpenAI 兼容 API 的正确路径是 `/v1/models`（如 `https://api.deepseek.com/v1/models`），缺少 `/v1` 前缀导致 404 | 已修复：`${cleanEndpoint}/models` → `${cleanEndpoint}/v1/models`。见 [`frontend/src/pages/Settings.tsx`](frontend/src/pages/Settings.tsx:178) |
| 81 | **Bug #18: PointLog ID 毫秒级碰撞 (v2.7 修复)** | `chat.go:106` — 同一秒内同一用户创建多个 PointLog 时 ID 格式 `LOG_${now.Format("150405")}${userID}` 会碰撞 | 已修复：格式改为 `LOG_${now.Format("150405.000")}_${userID[:8]}`，毫秒精度 + 下划线分隔。见 [`handlers/chat.go`](backend/handlers/chat.go:106) |
| 82 | **Bug #19: L1 截断注释/代码不一致 (v2.7 修复)** | `TokenBudgetManager.ts:91` — 注释写 "150 词" 但实际 `slice(0, 150)` 按字符截断 | 已修复：注释改为 "150 字符"。见 [`TokenBudgetManager.ts`](frontend/src/engine/TokenBudgetManager.ts:91) |
| 83 | **Bug #20: 未使用的 cancelled 变量 (v2.7 修复)** | `usePlayEngine.ts:169` — hydrate useEffect 中声明 `let cancelled = false;` 但从未使用 | 已修复：移除该变量及 cleanup 函数。见 [`usePlayEngine.ts`](frontend/src/hooks/usePlayEngine.ts:169) |
| 84 | **Bug #21: 非流式 latency 记录时机错误 (v2.7 修复)** | `chat.go:95` — 非流模式下 latency 在 `http.Post` 返回后立即记录，此时 `resp.Body` 尚未读取完毕 | 已修复：流模式在 response header 到达时记录，非流模式在 `io.ReadAll(resp.Body)` 完成后重新计算。见 [`handlers/chat.go`](backend/handlers/chat.go:95) |
| 85 | **Bug #22: MemoryLoaderService 无超时保护 (v2.7 修复)** | `MemoryLoaderService.ts:179` — L1/L2/L3 的 `this.modelCaller()` 调用无超时，一个 AI 调用挂起会阻塞整个 Promise chain 队列 | 已修复：新增 `withTimeout<T>(promise, ms)` 工具函数（30s 超时），包裹所有 3 处 modelCaller 调用。见 [`MemoryLoaderService.ts`](frontend/src/services/MemoryLoaderService.ts:15) |
