# PRD: 多级记忆流 AI 酒馆 (Multi-Level Memory Stream AI Tavern)

> **版本: v2.2** (历史需求文档)
> 状态: **已归档** — 本文档为早期产品需求定义，部分功能（如脏标记机制、乐观更新、Split Pane 预览、react-hook-form 等）**尚未实现**。实际代码状态请以 [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) 为准。
> 核心定位: 极度轻量、纯前端、以"多级记忆流"为核心的现代化 AI 剧本沙盒引擎

---

## 1. 产品概述

### 1.1 一句话定义
一个**基于回合制触发的本地异步状态机**，在有限的 Token 窗口内，以最小算力成本维持 AI 跨越千百回合的"长期伪意识"。

### 1.2 核心价值
- **零后端依赖**：纯前端架构，IndexedDB 落盘，用户 API Key 直连大模型
- **记忆持久化**：通过 L0/L1/L2/L3 四级记忆引擎，突破单次对话的上下文窗口限制
- **前台无阻塞**：记忆压缩/抽取全部在后台 Worker 执行，UI 永不卡顿
- **模型无关**：设计兼容 OpenAI API 协议的任何模型（含本地 7B 模型）
- **时空回溯**：支持 Undo/Reroll/Edit 操作后的状态级联回滚，杜绝记忆错乱
- **剧本沙盒**：SCN（只读蓝图）与 SAV（读写实例）严格隔离，Fork & Copy 机制防串本
- **云端保险箱**：Go + SQLite + JWT + Docker，单文件二进制 < 20MB，支撑百万级存档
- **零信任安全**：API Key 端侧 AES-GCM 加密后上云，服务器永不触碰明文密钥
- **沉浸式 UI**：左侧悬浮 Sidebar + 右侧弹性 Main View，毛玻璃质感，Cyber/AI 视觉风格
- **图片防爆**：封面图前端强制压缩至 400x400 webp ≤30KB，独立文件上传接口，SQLite 仅存路径字符串

### 1.3 目标用户
- 重度 AI 角色扮演用户（需要超长对话记忆）
- 自部署 AI 前端用户（追求隐私与数据主权）
- 本地模型玩家（需降级兼容弱模型）
- 剧本创作者与分发者（需要云端橱窗 + 本地沙盒模式）

---

## 2. 系统架构总览

### 2.1 五层分层架构

```
┌─────────────────────────────────────────────────┐
│  表现层 (UI/UX Layer)          [主线程]          │
│  - 沉浸式对话渲染                                │
│  - 极简配置入口                                  │
│  - 记忆引擎状态指示器 (L1/L2/L3 活动状态)        │
│  - 剧本商店/大厅 (云端橱窗)                      │
├─────────────────────────────────────────────────┤
│  调度层 (Event Bus / Orchestrator) [主线程]      │
│  - 回合计数器 (Turn Counter)                     │
│  - 任务分发 (L1/L2/L3 触发器)                    │
│  - 时空回溯调度 (Undo/Reroll 状态回滚)            │
│  - Fork & Copy 调度 (SCN → SAV 深拷贝)           │
├─────────────────────────────────────────────────┤
│  记忆引擎层 (Quad-Core Engine) [Web Worker]      │
│  ├─ L0: 角色设定引擎 (Character System Prompt)   │
│  ├─ L1: 上下文压缩机 (Context Compressor)        │
│  ├─ L2: 世界书捕获网 (World Book Capture)        │
│  └─ L3: 剧情推进器 (Plot Advancer)              │
├─────────────────────────────────────────────────┤
│  Token 预算管家 (Tokenizer Guard) [主线程]        │
│  - 纯前端 Token 估算器                           │
│  - 动态挤出机制 (动态计算 M 值)                   │
├─────────────────────────────────────────────────┤
│  持久化与通信层 (I/O Layer)     [主线程]          │
│  ├─ IndexedDB (SSOT - 唯一单点数据源)            │
│  │   ├─ ROM 区: Scenarios (只读剧本模板)         │
│  │   └─ RAM 区: Saves + Dynamic Memories (读写)  │
│  ├─ HTTP 请求封装 + 轻量反向代理 (CORS 解决)      │
│  └─ 云端同步层 (低频存档上传/下载)                │
│      ├─ AES-GCM 加密 (用户密码派生密钥)           │
│      ├─ gzip 压缩 (CompressionStream API)        │
│      └─ 零信任架构: 服务器仅存密文, 永不解密      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  后端 (Go + SQLite + JWT + Docker)              │
│  ├─ Gin 框架 - 高性能 HTTP 路由                  │
│  ├─ GORM + SQLite (WAL 模式, 高并发读写)         │
│  ├─ JWT 无状态认证 (Bcrypt 密码哈希)             │
│  ├─ gzip 中间件 (全链路压缩)                     │
│  └─ Docker 多阶段构建 (最终镜像 < 20MB)          │
│                                                  │
│  API 分组:                                       │
│  ├─ Auth:   POST /api/register, /api/login       │
│  ├─ Scenarios: GET/POST /api/scenarios           │
│  └─ Saves:   GET/POST /api/saves                 │
└─────────────────────────────────────────────────┘
```

### 2.2 核心原则
1. **前后台解耦**：UI 渲染与记忆计算严格分离，Worker 内禁止任何 DOM 操作
2. **记忆动态折叠**：原始对话 → L1 总结 → L3 主线，逐层抽象降维
3. **乐观更新**：后台写入未完成时，前台用"脏标记"机制兜底，绝不阻塞用户操作
4. **优雅降级**：弱模型输出非结构化数据时，直接丢弃本轮结果，等待下一触发周期
5. **时空回溯**：所有记忆快照绑定 `turn`，Undo/Reroll 触发级联回滚
6. **会话隔离**：所有动态数据表强制绑定 `sav_id`，多角色/多存档互不干扰
7. **SCN/SAV 隔离**：剧本模板（只读）与玩家存档（读写）在数据层彻底剪断，Fork & Copy 机制保证物理级防串本
8. **服务器即保险箱**：后端不解析存档内容，仅做加密 BLOB 存储，计算压力全在浏览器端
9. **无状态认证**：JWT 无 Session 存储，水平扩展零成本
10. **零信任安全**：API Key 端侧 AES-GCM 加密，服务器永不触碰明文密钥

---

## 3. 功能需求

### 3.1 对话功能 (P0)

| ID | 需求 | 说明 |
|----|------|------|
| F-01 | 多轮对话 | 用户发送消息 → AI 回复，形成回合 (Turn) |
| F-02 | 回合计数器 | 全局递增计数器 `N`，作为所有触发器的基准 |
| F-03 | 对话历史渲染 | 流式渲染 AI 回复，支持 Markdown |
| F-04 | 对话持久化 | 每回合对话自动写入 IndexedDB，绑定 `sav_id` |
| F-12 | 撤销/重做 (Undo/Reroll) | 回退到历史回合，触发状态级联回滚 |
| F-13 | 编辑消息 (Edit) | 修改已发送的消息，触发后续记忆级联重算 |
| F-14 | 滑动切换回复 (Swipe) | 多候选回复切换，不产生新回合 |

### 3.2 全局规则 - L-Master (P0)

| ID | 需求 | 说明 |
|----|------|------|
| F-40 | L-Master 全局提示词 | 站长设定的全局 System Prompt，Prompt 组装中绝对置顶 |
| F-41 | 冷启动拉取 | 前端 App Init 时 GET /api/config/master-prompt，存入 Zustand |
| F-42 | 站长专属修改 | PUT /api/admin/config/master-prompt，JWT Admin Role 鉴权 |
| F-43 | 热更新全站 | 修改后所有剧本下一回合自动生效，无需重启 |
| F-44 | 防越狱 (Jailbreak) | L-Master 包含平台安全底线，玩家无法覆盖 |
| F-45 | 统一输出格式 | L-Master 强制要求 [1][2][3] 选项结构 + Markdown 排版 |
| F-46 | Token 额度控制 | L-Master 可限制回复长度，从根源防止 API 账单爆炸 |

### 3.3 角色设定 - L0 (P0)

| ID | 需求 | 说明 |
|----|------|------|
| F-15 | 角色卡管理 | 创建/编辑/删除角色设定 |
| F-16 | 角色卡导入 | 兼容 PNG / V2 JSON 角色卡格式 |
| F-17 | L0 绝对优先级 | Prompt 组装中 L0 永远处于最高优先级（仅次于 L-Master） |

### 3.3 剧本系统 (P0)

| ID | 需求 | 说明 |
|----|------|------|
| F-22 | 剧本模板 (SCN) | 只读蓝图，包含 L0 主提示词 + 初始世界书 + 初始剧情树 |
| F-23 | 剧本发布/迭代 | 创作者可更新剧本版本 |
| F-24 | 剧本下载 | 从云端拉取 SCN JSON 到本地 IndexedDB |
| F-25 | Fork & Copy | 玩家开始游玩时，深拷贝 SCN 初始数据到 SAV 沙盒 |
| F-26 | 多分支存档 | 同一剧本同一玩家可创建多个分支存档 (Timeline Tree) |
| F-27 | 剧本作者神谕 (Author's Notes) | 折叠 UI，展示作者补充说明 |

### 3.4 记忆引擎 (P0)

#### 3.4.1 L1 - 上下文压缩 (触发: N % 5 == 0)
- **输入**: 旧的 L1 总结 + 最近 5 回合原始对话
- **动作**: 后台 Worker 发起 API 请求，将 5 回合内容"揉进"旧总结
- **输出**: 新的 L1 总结，覆盖 IndexedDB 记录（绑定当前 `sav_id` + `turn`）
- **约束**: 强制压缩至 ≤300 词，超出则触发遗忘机制丢弃低价值细节

#### 3.4.2 L2 - 世界书捕获 (触发: N % 3 == 0)
- **输入**: 最近 3 回合原始对话
- **动作**: 后台 Worker 发起 API 请求，执行实体抽取
- **输出**: 结构化 JSON 实体数据，写入/更新 IndexedDB 世界书表（绑定 `sav_id` + `turn`）
- **约束**: 严格 JSON Schema 校验，解析失败则丢弃本轮结果
- **初始状态**: 从 SCN 的 `init_worldbooks` 深拷贝而来

#### 3.4.3 L3 - 剧情推进 (触发: N % 10 == 0)
- **输入**: 当前 L3 主线 + 最新的 L1 总结（非原始对话）
- **动作**: 判断剧情是否发生阶段性改变
- **输出**: 更新 L3 剧情状态（绑定 `sav_id` + `turn`）

### 3.5 Prompt 组装 — God-Mode Assembly (P0)

#### 3.5.1 双轨制架构 (Dual-Track)

```
前台轨 (角色扮演, 极速响应):
  用户输入 → PromptAssembler 拼接 → StreamClient 流式请求 → AI 纯角色输出
  (AI 只演戏, 不干脏活)

后台轨 (记忆运算, 静默异步):
  AI 回复完成 → 回合 N 递增 → Web Worker 发起独立 API 请求
  ├─ N%3==0 → L2 实体抽取 (静默, 不阻塞 UI)
  ├─ N%5==0 → L1 上下文压缩 (静默, 不阻塞 UI)
  └─ N%10==0 → L3 剧情推进 (静默, 不阻塞 UI)
```

**核心原则**: 绝对不让大模型在"陪玩家演戏"的同时去干"写摘要、抓设定"的脏活。前后台物理隔离。

#### 3.5.2 God-Mode Assembly 最终拼接公式（含 L-Master）

这是引擎在发送请求前最后一毫秒，真正拼接发给大模型的超级结构。**越靠前的内容，大模型的注意力权重越高**：

```text
[L-Master: 站长全局规则] (绝对置顶，无人可篡改)
{包含：AI的底层身份(你是文字冒险游戏引擎)、平台安全底线、
 强制输出格式(如Markdown+选项结构)、Token额度控制等}
{来源: 后端 SQLite global_configs, 前端冷启动时拉取}

[System Role]
# 核心世界观 (L0)
{作者填写的主提示词，绝不更改}

# 玩家实体 (L0_Player)
{第 0 回合车卡时，玩家输入的身份快照。例："玩家叫里昂，是个剑客。"}

# 当前剧情轴 (L3)
{由后台异步算出的当前剧情阶段。例："当前处于阶段2：逃离汴京"}

[Dynamic Context (动态上下文注入)]
# 被唤醒的世界规则 (L2 - 仅命中注入)
{前端扫描玩家和AI最近3句话，只注入触发了激活词的世界书词条。绝对不全量注入，省Token防干扰}
- 触发词 [真金白银]: 设定内容...
- 触发词 [极寒]: 设定内容...

# 历史纪要 (L1)
{后台Worker每5回合压缩一次的摘要池，300字以内}

[Chat History (滑动窗口)]
{最近 10~15 轮绝对干净的纯对话记录，保持语气连贯}

[User Input]
{玩家刚刚发送的文字}
```

#### 3.5.3 优先级矩阵（最终版）

| 优先级 | 层级 | 内容 | 来源 | 裁剪策略 |
|--------|------|------|------|----------|
| 0 (绝对置顶) | **L-Master** | 站长全局规则 | 后端 SQLite global_configs | **永不裁剪** |
| 1 (绝对最高) | L0 | 核心世界观 | SCN main_prompt | 永不裁剪 |
| 1 (绝对最高) | L0_Player | 玩家实体快照 | Turn 0 车卡输入 | 永不裁剪 |
| 2 (最高) | L3 | 当前剧情轴 | Dynamic Memories (sav_id, type=L3_Plot) | 永不裁剪 |
| 3 (次高) | L2 | 被唤醒的世界规则（仅命中注入） | Dynamic Memories (sav_id, type=L2_Worldbook) | 裁剪低匹配度词条 |
| 4 (中) | L1 | 历史纪要 | Dynamic Memories (sav_id, type=L1_Summary) | 硬截断至 150 词 |
| 5 (低) | — | 最近 M 回合原始对话（滑动窗口） | Conversations (sav_id) | 从最旧丢弃 |

### 3.6 Token 预算管家 (P1)

| ID | 需求 | 说明 |
|----|------|------|
| F-18 | Token 估算 | 纯前端轻量 Token 估算器（字符比例换算或 tiktoken-lite） |
| F-19 | 动态挤出 | 总预算 → 扣除 L0/L3/L2/L1 固定开销 → 余额决定 M 值 |

### 3.7 用户系统 (P1)

| ID | 需求 | 说明 |
|----|------|------|
| F-33 | 注册/登录 | 账号密码注册登录，Bcrypt 密码哈希 |
| F-34 | JWT 认证 | 7 天过期 Token，LocalStorage 存储，含 role 声明 |
| F-35 | 无感刷新 | 401 时退回登录页，不清空本地 IndexedDB 存档 |
| F-47 | 积分资产 | 用户表含 points 字段，注册赠送初始积分 |
| F-48 | 用户角色 | 区分 'admin' 和 'user'，Admin 可访问 /admin 路由 |
| F-49 | 积分流水 | 每笔消费/充值记录 point_logs，防扯皮 |

### 3.8 双轨制通信 (P0)

| ID | 需求 | 说明 |
|----|------|------|
| F-50 | BYOK 模式 (轨 1) | 用户自带 API Key，前端直连大模型，不过服务器，零成本 |
| F-51 | 平台代理模式 (轨 2) | 前端 POST /api/chat/proxy，Go 后端鉴权扣费后透传流 |
| F-52 | 模型货架 | 后端 platform_models 表，站长可上架/下架/定价模型 |
| F-53 | 流式透传 | Go 后端将 SSE 流原封不动透传给前端，打字机效果不中断 |
| F-54 | 预扣费机制 | 请求前先扣积分，防止并发刷接口 |
| F-55 | 积分不足拒绝 | 余额不足时返回 HTTP 402，前端降级提示 |
| F-56 | 模型归属标签 | platform_models 新增 provider_family 字段，前端按 Gemini/DeepSeek/Claude 分组展示 |
| F-57 | 模型标签系统 | platform_models 新增 tags JSON 字段，前端展示"性价比高/审查弱/智力高"等标签 |
| F-58 | 价格系数 | platform_models 新增 price_coeff 浮点字段，前端显示精确价格系数 |
| F-59 | 被动健康监测 | Go 后端内存 Ring Buffer 记录最近 100 次请求成功率/延迟，零额外成本计算模型状态 |
| F-60 | 乐观积分更新 | 前端 Zustand 本地预扣积分 + 数字跳动动画，后端异步真实扣费不阻塞 UI |
| F-61 | 剧本状态字段 | scenarios 表新增 status (1=正常, 0=下架) 和 flag_reason (封禁理由)，软删除不物理删除 |
| F-62 | 无损下架 | 下架剧本后，已 Fork & Copy 到本地的玩家存档不受影响，可继续单机游玩 |
| F-63 | 风控审查台 | /admin 新增 🛡️ 内容巡查模块，手风琴透视 L0/L2/HTML 源码，敏感词高亮 |
| F-64 | 一键封禁 API | POST /api/admin/scenarios/:id/ban，站长填写理由后瞬间下架，大厅不可见 |
| F-65 | 站长剧本编辑器 | Admin 可复用前端 `<ScenarioEditor />` 组件编辑任意剧本，权限劫持: author_id==user.id \|\| role=='admin' |
| F-66 | 时间线隔离确认 | 站长修改剧本后，仅新 Fork & Copy 的玩家获得新版本；已在游玩的旧存档不受影响，防止上下文错乱 |
| F-67 | 官方润色徽章 | scenarios 表新增 edited_by_admin 字段，修改后大厅卡片显示紫金色 `[✨ 官方润色]` 徽章 |

### 3.9 剧本全文搜索 (P1)

| ID | 需求 | 说明 |
|----|------|------|
| F-68 | FTS5 全文搜索 | 使用 SQLite FTS5 + trigram 分词器实现中文毫秒级剧本搜索，替代 `LIKE '%关键词%'` |
| F-69 | 数据库触发器自动同步 | 通过 SQLite AFTER INSERT/DELETE/UPDATE 触发器自动维护 FTS 虚拟表，Go 代码零感知 |
| F-70 | 搜索结果高亮 | 前端 `HighlightText` 组件将匹配关键词用 `<mark>` 标签高亮显示 |
| F-71 | 按相关度排序 | FTS5 内置 bm25 算法排序，rank 值越小匹配度越高 |
| F-72 | 空查询回退热门 | 搜索框为空时自动返回热门剧本列表（按 quality_score 降序） |
| F-73 | 防 SQL 注入 | 用户输入经双引号转义后传入 MATCH 语法，杜绝注入风险 |

### 3.10 零信任安全 (P0)

| ID | 需求 | 说明 |
|----|------|------|
| F-36 | API Key 端侧加密 | 用户密码派生 AES-GCM 密钥，加密 API Key 后上传 |
| F-37 | 跨设备解密 | 新设备登录时，用密码解密云端密文 Key 至本地内存 |
| F-38 | 零信任存储 | 服务器仅存储加密 BLOB，无解密能力 |

### 3.11 云端同步 (P1)

| ID | 需求 | 说明 |
|----|------|------|
| F-29 | 存档上传 | 前端 AES 加密 + gzip 压缩后上传至服务器 |
| F-30 | 存档下载 | 从服务器拉取加密存档，前端解密后恢复至 IndexedDB |
| F-31 | 自动同步 | 退出游戏或每 50 回合触发一次自动同步 |
| F-32 | 数据脱敏 | API Key 和私密聊天记录在前端加密，服务器无解密能力 |

### 3.12 配置管理 (P1)

| ID | 需求 | 说明 |
|----|------|------|
| F-05 | API Key 管理 | 本地存储，支持自定义端点 |
| F-06 | 模型选择 | 支持切换模型（含本地模型） |
| F-07 | 参数调节 | Temperature, Max Tokens 等 |
| F-08 | 记忆参数 | L1/L2/L3 触发间隔、压缩阈值等 |

### 3.13 数据管理 (P1)

| ID | 需求 | 说明 |
|----|------|------|
| F-09 | 对话导入/导出 | JSON 格式全量导出 |
| F-10 | 世界书管理 | 手动编辑/删除 L2 词条 |
| F-11 | 记忆重置 | 清空 L1/L2/L3 数据，保留对话历史 |
| F-20 | 会话管理 | 多存档创建/切换/删除 |

### 3.12 UX 状态指示器 (P1)

| ID | 需求 | 说明 |
|----|------|------|
| F-21 | 记忆引擎状态指示器 | 界面角落显示 L1/L2/L3 活动状态（蓝光呼吸/紫光闪烁等） |
| F-28 | 世界书标签染色 | `[原生设定]`(SCN 继承) vs `[游玩解锁]`(L2 引擎抽取) |

---

## 4. 数据流设计

### 4.1 Fork & Copy 流 (SCN → SAV 深拷贝)

```
玩家选择剧本 SCN_999 并点击"开始游玩"
       │
       ▼
   调度层创建新存档 SAV_xyz
       │
       ▼
   深拷贝 (Deep Clone):
   ├─ 复制 SCN_999.main_prompt → SAV_xyz.L0
   ├─ 复制 SCN_999.init_worldbooks → SAV_xyz.Dynamic_Memories (type: L2_Worldbook)
   └─ 标记所有词条为 `[原生设定]`
       │
       ▼
   此后所有 L1/L2/L3/对话 全部绑定 SAV_xyz
   引擎查询条件: WHERE sav_id = 'SAV_xyz'
```

### 4.2 记忆写入流 (Write - 后台异步)

```
用户发送消息 → AI 回复完成 → 回合 N 递增
                                │
                    ┌───────────┼───────────┐
                    │           │           │
               N%3==0?     N%5==0?     N%10==0?
                    │           │           │
                    ▼           ▼           ▼
               L2 实体抽取  L1 上下文压缩  L3 剧情推进
                    │           │           │
                    └───────┬───┴───┬───────┘
                            │       │
                            ▼       ▼
                       IndexedDB 写入
                       (绑定 sav_id + turn)
```

### 4.3 记忆读取流 (Read - 前台同步)

```
用户输入下一句话
       │
       ▼
   Token 预算管家: 计算总预算 → 扣除 L0/L3/L2/L1 → 决定 M
       │
       ▼
   L2 关键词匹配 (扫描输入 + 最近 2 回合, 限定 sav_id)
       │
       ▼
   Prompt 组装:
   [L0 角色设定] + [L3 主线] + [命中的 L2 词条] + [L1 总结] + [最近 M 回合原始对话]
       │
       ▼
   发送至大模型 API
```

### 4.4 脏标记机制 (Race Condition 防护)

```
用户快速连发时:
  回合 N  → 触发 L1 压缩 (后台进行中...)
  回合 N+1 → 用户发送新消息
              ├─ L1 脏标记 = true → Prompt 中动态追加"未被总结的回合"
              └─ L1 脏标记 = false → 正常使用 L1 总结
  L1 写入完成 → 脏标记清除 → 下次组装切回纯 L1
```

### 4.5 时空回溯流 (Undo/Reroll 状态回滚)

```
用户触发 Undo/Reroll → 回退到历史回合 N'
       │
       ▼
   调度层发出 ROLLBACK 事件 (目标 turn = N', sav_id)
       │
       ▼
   级联回滚 (限定 sav_id):
   ├─ conversations: 删除 turn > N' 的所有消息
   ├─ l1_summaries:  删除 turn > N' 的所有快照
   ├─ l2_worldbooks: 回滚到 turn ≤ N' 的最新版本
   ├─ l3_plots:      删除 turn > N' 的所有快照
   └─ turn counter:  重置为 N'
       │
       ▼
   状态机回到历史锚点 N'
```

### 4.6 云端同步流 (存档上传/下载)

```
存档上传:
  触发条件: 退出游戏 / 每 50 回合
       │
       ▼
   前端打包 IndexedDB (sav_id 范围) → 大 JSON
       │
       ▼
   AES-GCM 加密 (用户密码派生密钥, 零信任)
       │
       ▼
   gzip 压缩 (CompressionStream API)
       │
       ▼
   POST /api/saves (JWT Auth) → Go 后端 → SQLite

存档下载:
  用户选择"恢复云端存档"
       │
       ▼
   GET /api/saves/:sav_id (JWT Auth) → SQLite → 加密 BLOB
       │
       ▼
   浏览器解压 (DecompressionStream) → AES-GCM 解密 (用户密码)
       │
       ▼
   恢复至 IndexedDB
```

---

## 5. 数据模型

### 5.1 命名规范

| 前缀 | 含义 | 性质 |
|------|------|------|
| `USR_xxx` | 用户/玩家/创作者 | 身份标识 |
| `SCN_xxx` | 剧本模板 (Scenario Blueprint) | 只读 ROM |
| `SAV_xxx` | 玩家存档 (Save Instance) | 读写 RAM |

### 5.2 前端 IndexedDB Schema

#### 5.2.1 剧本模板表 (scenarios) - ROM 区

| 字段 | 类型 | 说明 |
|------|------|------|
| scn_id | string | 剧本唯一 ID (例: SCN_abc123) |
| author_id | string | 创作者 ID (USR_UID) |
| name | string | 剧本名称 |
| intro | string | 简介 |
| main_prompt | string | 主提示词 (L0) |
| init_worldbooks | Array<{keyword, description}> | 初始世界书 |
| init_plot | string | 初始剧情主线 |
| version | number | 版本号 |
| tags | string[] | 标签 |
| created_at | number | 创建时间 |

#### 5.2.2 玩家存档表 (saves) - RAM 区

| 字段 | 类型 | 说明 |
|------|------|------|
| sav_id | string | 存档唯一 ID (例: SAV_xyz789) |
| scn_id | string | 关联的剧本源 |
| usr_id | string | 游玩此存档的玩家 |
| name | string | 存档名称 |
| current_turn | number | 当前回合数 |
| created_at | number | 创建时间 |
| updated_at | number | 最后活动时间 |

#### 5.2.3 对话表 (conversations)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | UUID |
| sav_id | string | 所属存档 ID (复合主键) |
| turn | number | 回合序号 |
| role | string | 'user' \| 'assistant' \| 'system' |
| content | string | 消息内容 |
| timestamp | number | 时间戳 |
| metadata | object | 扩展元数据 (含 swipe 候选列表) |

#### 5.2.4 动态记忆表 (dynamic_memories) - 引擎主战场

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | UUID |
| sav_id | string | 所属存档 ID (复合主键，所有查询强制带此条件) |
| type | string | 'L1_Summary' \| 'L2_Worldbook' \| 'L3_Plot' |
| turn | number | 对应的回合号 |
| content | any | JSON payload |
| origin | string | 'scenario' \| 'engine' (SCN 继承 vs 引擎抽取) |
| created_at | number | 创建时间 |

#### 5.2.5 配置表 (config)

| 字段 | 类型 | 说明 |
|------|------|------|
| key | string | 配置键 |
| value | any | 配置值 |

### 5.3 后端 SQLite Schema (Go + GORM)

```go
type User struct {
    ID           string `gorm:"primaryKey;type:varchar(36)" json:"id"`
    Username     string `gorm:"uniqueIndex;type:varchar(50);not null" json:"username"`
    PasswordHash string `gorm:"not null" json:"-"`
    Points       int    `gorm:"default:0" json:"points"`          // 积分资产
    Role         string `gorm:"default:'user'" json:"role"`      // 'admin' | 'user'
}

type Scenario struct {
    ID            string `gorm:"primaryKey;type:varchar(36)" json:"id"`
    AuthorID      string `gorm:"index" json:"author_id"`
    Title         string `json:"title"`
    BlueprintData string `gorm:"type:text" json:"blueprint_data"`
    Downloads     int    `gorm:"default:0" json:"downloads"`
    Status        int    `gorm:"default:1" json:"status"`             // 1=正常公开, 0=站长下架封禁
    FlagReason    string `gorm:"default:''" json:"flag_reason"`       // 封禁理由 (仅站长可见)
    EditedByAdmin bool   `gorm:"default:false" json:"edited_by_admin"` // 站长是否润色过
    CreatedAt     int64  `gorm:"autoCreateTime:milli" json:"created_at"`
}

type Save struct {
    ID         string `gorm:"primaryKey;type:varchar(36)" json:"id"`
    UserID     string `gorm:"index" json:"user_id"`
    ScenarioID string `gorm:"index" json:"scenario_id"`
    SaveData   string `gorm:"type:text" json:"save_data"`
    UpdatedAt  int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

type GlobalConfig struct {
    Key       string `gorm:"primaryKey;type:varchar(100)" json:"key"`
    Value     string `gorm:"type:text;not null" json:"value"`
    UpdatedAt int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

// 平台大模型货架 — 站长在后台管理
type PlatformModel struct {
    ID             string  `gorm:"primaryKey;type:varchar(36)" json:"id"`
    ModelID        string  `gorm:"not null" json:"model_id"`                 // 真实模型名 (gpt-4o-mini, deepseek-chat)
    DisplayName    string  `gorm:"not null" json:"display_name"`             // 前端显示名
    ProviderFamily string  `gorm:"default:''" json:"provider_family"`        // 归属: Gemini / DeepSeek / Claude
    Tags           string  `gorm:"type:text;default:'[]'" json:"tags"`       // JSON 标签: ["性价比高","审查弱","智力高"]
    IsActive       bool    `gorm:"default:true" json:"is_active"`            // 是否开放
    CostPerTurn    int     `gorm:"default:0" json:"cost_per_turn"`           // 每回合扣积分 (0=免费)
    PriceCoeff     float64 `gorm:"default:0" json:"price_coeff"`             // 价格系数 (0.068)
    SortOrder      int     `gorm:"default:0" json:"sort_order"`              // 排序权重，站长主推模型排前面
    ProviderURL    string  `gorm:"not null" json:"provider_url"`             // API 中转站地址
    APIKey         string  `gorm:"not null" json:"-"`                        // 【绝密】站长的 Key，仅存数据库/环境变量
}

// 积分流水账本 — 防扯皮
type PointLog struct {
    ID        string `gorm:"primaryKey;type:varchar(36)" json:"id"`
    UserID    string `gorm:"index;not null" json:"user_id"`
    Amount    int    `gorm:"not null" json:"amount"`             // 正数充值，负数消费
    Reason    string `gorm:"type:text;not null" json:"reason"`   // "游玩扣除: gpt-4o-mini" / "站长赠送"
    CreatedAt int64  `gorm:"autoCreateTime:milli" json:"created_at"`
}

// ============================================================
// FTS5 全文搜索虚拟表 (非 GORM 模型，通过原生 SQL 创建)
// ============================================================

-- 创建 FTS5 虚拟表，trigram 分词器支持中文毫秒级搜索
-- 注意：此表不由 GORM AutoMigrate 管理，需在数据库初始化时手动执行
CREATE VIRTUAL TABLE IF NOT EXISTS scenarios_fts USING fts5(
    scn_id UNINDEXED,       -- 剧本 ID，不参与搜索
    title,                  -- 剧本名称
    intro,                  -- 简介
    author_name,            -- 作者名
    tags,                   -- 标签
    tokenize='trigram'      -- 【核心】三元组分词器，中文无需空格分词
);

-- 数据一致性触发器：插入剧本时自动写入 FTS 表
CREATE TRIGGER IF NOT EXISTS scenarios_ai AFTER INSERT ON scenarios BEGIN
    INSERT INTO scenarios_fts(scn_id, title, intro, author_name, tags)
    VALUES (new.id, new.title, new.intro, new.author_name, new.tags);
END;

-- 数据一致性触发器：删除剧本时自动清理 FTS 表
CREATE TRIGGER IF NOT EXISTS scenarios_ad AFTER DELETE ON scenarios BEGIN
    DELETE FROM scenarios_fts WHERE scn_id = old.id;
END;

-- 数据一致性触发器：更新剧本时自动同步 FTS 表
CREATE TRIGGER IF NOT EXISTS scenarios_au AFTER UPDATE ON scenarios BEGIN
    UPDATE scenarios_fts
    SET title = new.title, intro = new.intro, author_name = new.author_name, tags = new.tags
    WHERE scn_id = old.id;
END;
```

#### 5.3.2 后端 API 分组（完整版）

| 分组 | 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|------|
| Auth | POST | /api/register | 注册（赠送初始积分） | 无 |
| Auth | POST | /api/login | 登录（返回 JWT，含 role 声明） | 无 |
| Scenarios | GET | /api/scenarios | 剧本列表 (WHERE status=1) | JWT |
| Scenarios | GET | /api/scenarios/search?q=关键词 | FTS5 全文搜索 (trigram 分词, bm25 排序) | JWT |
| Scenarios | POST | /api/scenarios | 创建剧本 | JWT |
| Scenarios | PUT | /api/scenarios/:id | 修改剧本 (作者本人 或 Admin 可改) | JWT |
| Saves | GET | /api/saves | 存档列表 | JWT |
| Saves | POST | /api/saves | 上传存档 | JWT |
| Config | GET | /api/config/master-prompt | 获取 L-Master 全局提示词 | 无 |
| Chat | POST | /api/chat/proxy | 平台代理模式：鉴权→扣费→透传流 | JWT |
| Notify | GET | /api/user/notifications/count | 红点未读通知数（短轮询，5 分钟间隔） | JWT |
| Images | POST | /api/upload_image | 上传封面图 | JWT |
| Admin | PUT | /api/admin/config/master-prompt | 更新 L-Master | JWT + Admin |
| Admin | GET/POST | /api/admin/platform-models | 管理模型货架 | JWT + Admin |
| Admin | GET | /api/admin/users | 用户列表（含积分） | JWT + Admin |
| Admin | POST | /api/admin/users/:id/points | 充值/扣除积分 | JWT + Admin |
| Admin | GET | /api/admin/dashboard | 监控大盘数据 | JWT + Admin |
| Admin | POST | /api/admin/scenarios/:id/ban | 一键封禁剧本 (软删除, status=0) | JWT + Admin |
| Admin | GET | /api/admin/scenarios/flagged | 已封禁剧本列表 (含 flag_reason) | JWT + Admin |

---

## 6. 非功能需求

### 6.1 性能
- **UI 响应**: 用户操作 16ms 内反馈（60fps）
- **后台压缩**: L1/L2/L3 请求不阻塞主线程
- **Prompt 组装**: ≤10ms 完成（纯本地运算）
- **IndexedDB 读写**: 单次 ≤5ms
- **Token 估算**: ≤1ms

### 6.2 兼容性
- **浏览器**: Chrome 90+, Firefox 90+, Edge 90+
- **模型**: 兼容 OpenAI API 协议的任何模型
- **网络**: 离线时保留对话功能，记忆压缩降级跳过

### 6.3 安全性
- API Key 仅存本地，永不外传
- 存档上传前 AES 加密，服务器无解密能力
- 密码 Bcrypt 哈希，Cost=10
- JWT 7 天过期，无 Session 存储
- 所有数据用户完全可控

### 6.4 可维护性
- 模块化设计，四核引擎可独立替换
- 事件驱动架构，新增触发器无需修改核心逻辑
- 完整 TypeScript 类型定义
- Go 后端单文件二进制，Docker 多阶段构建 < 20MB

---

## 7. 前端 UI/UX 架构

### 7.1 整体空间布局

```
┌─────────────────────────────────────────────────────────┐
│  Sidebar (20%)              │  Main View (80%)          │
│  ┌──────────────────┐       │  ┌────────────────────┐   │
│  │ 大厅 (Lobby)      │       │  │ 剧本卡片网格       │   │
│  │ 我的存档 (Saves)  │       │  │ (CSS Grid)         │   │
│  │ 我的创作 (Create) │       │  │                    │   │
│  │ [+ 创建剧本]      │       │  │ 或 聊天界面 (Play) │   │
│  ├──────────────────┤       │  └────────────────────┘   │
│  │ 用户头像          │       │                           │
│  │ 全局设置          │       │                           │
│  └──────────────────┘       │                           │
└─────────────────────────────────────────────────────────┘
```

- **Sidebar**: 深色/毛玻璃材质，霓虹高光边缘，可折叠实现 100% 沉浸
- **Main View**: 弹性切换，Lobby 态为 CSS Grid 卡片流，Play 态为无干扰聊天界面

### 7.2 页面流转

| 路由 | 视图 | 说明 |
|------|------|------|
| `/lobby` | 剧本列表 | CSS Grid 卡片网格，hover 放大 + 标签浮现 |
| `/saves` | 存档列表 | 按最后游玩时间排序，hover 显示当前回合数 |
| `/creator` | 剧本编辑器 | 三 Tab 分步：基础设定 → AI 大脑 → 世界书 |
| `/play/:sav_id` | 游玩界面 | 剧场式开场 + 对话流 + 吸底控制台，Sidebar 可折叠 |
| `/settings` | 全局设置 | API Key 管理，本地存储清理 |

### 7.3 剧本编辑器 (Creator Canvas) — 创作者控制台

#### 7.3.1 布局骨架：双边距实时响应 (Split Pane)

```
┌─────────────────────────────────────────────────────────┐
│  Tab 导航: [基础设定] [AI 大脑] [页面美化] [世界书]       │
├────────────────────────┬────────────────────────────────┤
│                        │                                │
│  左侧编辑区 (表单/代码)  │  右侧实时预览区               │
│                        │  ┌────────────────────────┐   │
│  ┌──────────────────┐  │  │  <iframe> 沙箱隔离舱    │   │
│  │ 表单字段 /        │  │  │                        │   │
│  │ 代码编辑器        │  │  │  srcDoc={htmlCode}     │   │
│  │                  │  │  │  sandbox="allow-scripts"│   │
│  └──────────────────┘  │  │                        │   │
│                        │  └────────────────────────┘   │
│  ↕ 可拖拽分割线 (resize)│                                │
└────────────────────────┴────────────────────────────────┘
```

- **左右分栏**: 左侧编辑区 / 右侧实时预览区，中间可拖拽分割线
- **技术选型**: `react-split-pane` 或原生 Flexbox `resize-x`，禁止手写鼠标拖拽事件
- **P0 安全隔离**: 右侧预览区必须使用 `<iframe>` 的 `srcDoc` 属性 + `sandbox` 属性
  - `srcDoc={userHtmlCode}` — 创作者写的 HTML/CSS 在隔离舱内渲染
  - `sandbox="allow-scripts"` — 防止创作者代码污染主站样式和 DOM
  - **绝对禁止**直接将用户 HTML `dangerouslySetInnerHTML` 到主 React DOM 中

#### 7.3.2 四 Tab 分步设计

**Tab 1: 基础设定**
- 封面图（强制压缩至 400x400 webp ≤30KB）
- 剧本名称、简介、分类标签
- 右侧预览: 卡片在大厅中的展示效果

**Tab 2: AI 大脑**
- 主提示词（超大 Markdown 语法高亮输入框）
- 开场白（AI 第一句话）
- 右侧预览: 组装后的 System Prompt 实时预览（God-Mode Assembly 仿真）

**Tab 3: 页面美化 (Page Styling)**
- 车卡页 HTML 编辑器（语法高亮，创作者编写 prologue_html）
- 右侧预览: iframe 沙箱实时渲染车卡页效果
- 所见即所得：左侧写 HTML，右侧即时刷新

**Tab 4: 世界书 (Worldbook)**
- 卡片式表单，每条词条为可折叠卡片
- 激活词使用 Tag Input（标签输入，对应 string[] 数组）
- 内容区带拖拽调整大小 + 字数提示
- `[+] 添加词条` 按钮（虚线边框，hover 高亮）
- 底层使用 `useFieldArray` 保证 100+ 词条不卡顿
- 右侧预览: 世界书词条在对话中的高亮效果模拟

### 7.4 视觉规范

| 令牌 | 值 | Tailwind 映射 |
|------|-----|---------------|
| 底色 (Background) | `#13141c` | `bg-[#13141c]` |
| 卡片底色 (Surface) | `#1c1d26` | `bg-[#1c1d26]` |
| 点缀色 (Accent) | fuchsia-600 → purple-600 渐变 | `from-fuchsia-600 to-purple-600` |
| 标题字体 | 加粗浅色 | `font-bold text-gray-100` |
| 正文字体 | 灰色 | `text-gray-400` |

### 7.5 图片防爆策略 (P0)

```
用户上传封面图 → browser-image-compression
→ 强制压缩至 400x400 分辨率 → webp 格式 ≤30KB
→ POST /api/upload_image (独立文件上传接口)
→ Go 后端保存至 ./data/images/xxx.webp
→ 返回路径字符串 "/images/xxx.webp"
→ 存入 SCN JSON 的 cover_url 字段
→ 前端 <img> 直接加载 URL，浏览器异步并行
```

**铁律**: 封面图绝对不存 Base64 到 SQLite。500 个剧本的大厅列表请求，返回纯文本数据仅几百 KB。

### 7.6 游玩界面 (Play Stage) 设计

#### 7.6.1 全屏毛玻璃沉浸布局 (Glassmorphism)

```
┌──────────────────────────────────────────────────────────┐
│ 全屏背景: bg-[url('cover.jpg')] bg-cover bg-center        │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 顶部导航栏 (固定, bg-black/40 backdrop-blur-sm)       │ │
│ │  ├─ 返回按钮 | 剧本标题                               │ │
│ │  └─ [平行时空] [历史对话]                             │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ 核心舞台 (max-w-3xl mx-auto flex-1 overflow-y-auto)   │ │
│ │  bg-white/10 backdrop-blur-md border-x border-white/10│ │
│ │  ├─ [turn==0]: 剧场式开场                             │ │
│ │  │   ├─ 大字体剧本标题 + 引言                         │ │
│ │  │   ├─ 设定文本块 (L2 关键词高亮)                    │ │
│ │  │   └─ 设定卡片组 (CSS Grid)                         │ │
│ │  ├─ [turn>0]: 对话流                                  │ │
│ │  │   ├─ 开场引言折叠为极简信息头                      │ │
│ │  │   └─ AI 回复气泡 (bg-white/5 backdrop-blur-sm)     │ │
│ │  │       ├─ Markdown AST 动态渲染 (react-markdown)    │ │
│ │  │       │   ├─ [1] 选项 → 命运抉择按钮              │ │
│ │  │       │   ├─ <details> → 折叠透视卡片              │ │
│ │  │       │   └─ 普通文本 → p 标签                    │ │
│ │  │       └─ 快捷操作栏 (左下角)                      │ │
│ │  │           [复制] [编辑] [删除] [重新生成]          │ │
│ │  └─ 底部留白 pb-20                                    │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ 底部输入控制台 (固定吸底 shrink-0, bg-black/60        │ │
│ │                      backdrop-blur-lg)                │ │
│ │  ├─ 功能按钮条: [设定] [🧠 记忆呼吸灯] [创意库]       │ │
│ │  └─ 输入框 (圆角, Enter发送, Shift+Enter换行)         │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Tailwind 实现秘籍**:
- 全屏背景图: `h-screen w-full bg-[url('cover.jpg')] bg-cover bg-center`
- 毛玻璃舞台: `bg-white/10 backdrop-blur-md border-x border-white/10`
- 聊天气泡: `bg-white/5 backdrop-blur-sm rounded-2xl shadow-lg border border-white/10`
- **性能关键**: 只在聊天气泡底层加 `backdrop-blur`，不在全页面加滤镜

#### 7.6.2 状态转换

| 条件 | 视图 | 说明 |
|------|------|------|
| `turn == 0` | 剧场式开场 | 显示完整引言 + 设定卡片组 |
| `turn > 0` | 对话流 | 开场引言平滑折叠为极简信息头，对话气泡不断 Append |

#### 7.6.3 Markdown AST 动态渲染引擎

AI 回复不是纯文本，而是通过 `react-markdown` + 自定义 `components` 将结构化文本转化为交互式 UI。

**渲染管线**:

```
AI 流式回复完成 → 完整文本
  │
  ▼
react-markdown (rehypeRaw 插件)
  │
  ├─ p 标签劫持: 正则匹配 /^\[(\d+)\][:：]\s*(.*)/
  │     ├─ 匹配 → 渲染为「命运抉择」按钮
  │     │   <button class="...bg-blue-900/30 border-blue-500/50...">
  │     │     <span class="bg-blue-600">{序号}</span>
  │     │     <span>{选项内容}</span>
  │     │   </button>
  │     │   点击 → handleSendOption(content) 直接发送该选项
  │     └─ 不匹配 → 渲染为普通 <p> 文本
  │
  ├─ details/summary 劫持: 渲染为「透视卡片」折叠面板
  │     <details class="bg-white/5 border-white/10 rounded-lg">
  │       <summary class="text-yellow-400">▶ {标题}</summary>
  │       {内容}
  │     </details>
  │
  ├─ code/strong/em 等: 标准 Markdown 渲染
  │
  └─ 柔性兜底 (Graceful Degradation):
        ├─ 宽松正则: 同时匹配 [1]、1.、- 选项1: 等格式
        └─ 全部不匹配 → 降级为普通文本，绝不白屏
```

**核心代码模式**:

```tsx
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

const components = {
  p: ({ children }) => {
    const text = String(children);
    const optionMatch = text.match(/^\[?(\d+)\]?[:：]\s*(.*)/);
    if (optionMatch) {
      const [, number, content] = optionMatch;
      return (
        <button onClick={() => handleSendOption(content)}
          className="block w-full text-left mt-2 p-3 bg-blue-900/30 border border-blue-500/50 rounded hover:bg-blue-800/50">
          <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs mr-2">{number}</span>
          <span className="text-gray-200">{content}</span>
        </button>
      );
    }
    return <p className="mb-4 text-gray-200 leading-relaxed">{children}</p>;
  },
  details: ({ children }) => (
    <details className="mt-4 bg-white/5 border border-white/10 rounded-lg p-2 cursor-pointer">{children}</details>
  ),
  summary: ({ children }) => (
    <summary className="text-yellow-400 font-bold outline-none">▶ {children}</summary>
  ),
};

function AIMessageBubble({ content }) {
  return (
    <div className="bg-white/5 rounded-2xl p-6 backdrop-blur-sm border border-white/10">
      <ReactMarkdown components={components} rehypePlugins={[rehypeRaw]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

#### 7.6.4 关键词高亮 (L2 可视化)

- 引言和聊天记录中的 L2 世界书触发词自动高亮
- 使用轻量 AST 解析器将匹配词转化为 `<KeywordSpan>` 组件
- 颜色映射：红色 = 关键实体，金色 = 核心物品/货币
- 历史消息渲染后 DOM 设为 `memo`，不随输入重新渲染

#### 7.6.5 快捷操作栏 (Time Machine)

每个 AI 回复气泡左下角显示快捷操作栏：

| 图标 | 操作 | 底层逻辑 |
|------|------|----------|
| 📋 复制 | 复制该条回复内容到剪贴板 | `navigator.clipboard.writeText()` |
| ✏️ 编辑 | 进入编辑模式，修改该条回复 | 修改后触发级联重算 |
| 🗑️ 删除 | 删除该条回复 | 从 IndexedDB 删除，回合 N 不变 |
| 🔄 重新生成 | 删除该条回复并重新请求 AI | 删消息 → N=N-1 → 重新发起流式请求 |

**重新生成流程 (时空回溯联动)**:
```
用户点击 [重新生成]
  │
  ├─ 1. 从 IndexedDB conversations 删除最后一条 AI 回复
  ├─ 2. 回合计数器回滚: N = N - 1
  ├─ 3. 检查脏标记:
  │     ├─ L1/L2/L3 最新快照的 turn > N → 丢弃快照
  │     └─ 退回上一个存档点
  ├─ 4. 重新调用 PromptAssembler.assemble()
  └─ 5. 发起新的流式请求
```

#### 7.6.6 记忆呼吸灯

- 界面底部功能按钮条中的 `🧠 记忆` 按钮旁带呼吸灯
- L1 压缩中 = 蓝光 `animate-pulse`
- L2 提取中 = 紫光闪烁
- L3 推进中 = 金光呼吸

#### 7.6.7 完整发送流程

```
用户点击发送
  │
  ├─ 1. L2 召回: 拦截输入, 正则匹配 IndexedDB 世界书
  ├─ 2. Token 估算: 拼接 L0+L2+L1+历史, 判断是否超阈值
  ├─ 3. 流式请求: 发起 OpenAI 兼容 API, 呈现打字机效果
  │     └─ AI 回复完成 → Markdown AST 动态渲染
  │          ├─ [1] 选项 → 命运抉择按钮
  │          ├─ <details> → 折叠透视卡片
  │          └─ 普通文本 → 标准渲染
  └─ 4. 后台挂载: 若满足回合条件 (N%3==0等), Worker 异步计算新记忆
```

### 7.7 微交互设计

- **卡片 hover**: 封面图 scale(1.05)，底部平滑升起标签 + 作者名
- **世界书标签染色**: `[原生设定]`(蓝) vs `[游玩解锁]`(紫)
- **记忆引擎状态指示器**: L1 压缩中 = 蓝光呼吸，L2 提取中 = 紫光闪烁
- **存档时间线树**: 多分支存档可视化

---

## 8. 技术栈

| 层 | 技术选型 | 理由 |
|----|----------|------|
| 前端框架 | React + Vite | 生态成熟，SSR/SSG 支持 |
| 样式 | Tailwind CSS | 卡片布局和响应式降维打击 |
| 全局状态 | Zustand | 比 Redux 轻 100 倍 |
| 表单管理 | react-hook-form + useFieldArray | 动态增删表单零卡顿 |
| Markdown 渲染 | react-markdown + rehypeRaw | 自定义组件劫持，AST 动态渲染 |
| 本地存储 | IndexedDB (idb库封装) | 浏览器原生异步存储 |
| 图片压缩 | browser-image-compression | 前端强制压缩至 30KB webp |
| 图片存储 | 独立文件上传 + 路径字符串 | 不存 Base64 到 SQLite |
| Worker | Web Worker (Comlink) | 主线程/Worker 零摩擦通信 |
| 构建 | Vite | 极速构建，HMR，Tree-shaking |
| Token 估算 | tiktoken-lite | 纯前端轻量实现 |
| 加密 | Web Crypto API (AES-GCM + PBKDF2) | 浏览器原生加密，无外部依赖 |
| 压缩 | CompressionStream API | 浏览器原生 gzip |
| 后端框架 | Go + Gin | 高性能，单文件二进制 < 20MB |
| 后端 DB | GORM + SQLite (WAL 模式) | 零进程嵌入式，高并发读写 |
| 认证 | JWT + Bcrypt | 无状态认证，水平扩展零成本 |
| 部署 | Docker 多阶段构建 | 最终镜像 < 20MB |

---

## 9. 里程碑规划

| 阶段 | 内容 | 交付物 |
|------|------|--------|
| M1 | 核心对话 + IndexedDB 持久化 + 会话管理 | 可聊天的基本界面，多存档支持 |
| M2 | L0 角色卡系统 + 角色卡导入 | 角色设定管理 |
| M3 | SCN/SAV 隔离 + Fork & Copy | 剧本沙盒引擎 |
| M4 | L1 上下文压缩引擎 | 记忆总结功能 |
| M5 | L2 世界书捕获引擎 | 实体抽取与召回 |
| M6 | L3 剧情推进器 + Prompt 组装 + Token 预算管家 | 完整记忆流 |
| M7 | Undo/Reroll/Edit 时空回溯 | 状态级联回滚 |
| M8 | Go 后端 (Auth + Scenarios + Saves API) | 用户系统 + 云端保险箱 |
| M9 | 前端加密压缩同步 | 存档上云/下云 |
| M10 | Docker 部署 + 配置管理 + UX 状态指示器 | 生产可用 |

---

## 10. 已知风险与缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 竞争条件 (Race Condition) | 记忆时间差错位 | 脏标记 + 乐观更新机制 |
| L1/L3 Token 熵增 | Context Window 膨胀 | 硬性长度衰减 + 遗忘阈值 (≤300词) |
| L2 JSON 解析失败 | 世界书数据污染 | 严格 Schema 校验 + 丢弃失败结果 |
| 弱模型服从性差 | 记忆质量下降 | 降级策略：跳过本轮，等待下一周期 |
| IndexedDB 容量限制 | 数据丢失 | 定期清理 + 导出备份机制 |
| Undo/Reroll 后记忆残留 | 记忆错乱与幻觉 | 时空回溯：级联删除 > 目标 turn 的所有快照 |
| 多会话数据串线 | 角色/存档记忆混淆 | 所有动态表强制绑定 sav_id 复合主键 |
| Token 溢出导致请求失败 | 上下文截断丢失 System 设定 | Token 预算管家动态挤出机制 |
| SCN 初始数据被污染 | 串本导致下个玩家看到上个玩家剧情 | Fork & Copy 深拷贝 + 物理级 SCN/SAV 隔离 |
| 封面图 Base64 存 SQLite | 数据库爆炸，列表加载卡死 | 独立文件上传接口，SQLite 仅存路径字符串 |
| 存档 JSON 体积膨胀 | 上传带宽消耗大 | gzip 压缩 (CompressionStream) 节省 80% |
| 服务器数据泄露 | 用户隐私暴露 | AES 前端加密，服务器无解密能力 |
| SQLite 高并发写入锁死 | 请求失败 | WAL 模式 + busy_timeout=5000ms |

---

## 11. 附录

### 10.1 术语表

| 术语 | 说明 |
|------|------|
| Turn | 一次完整的用户发送 + AI 回复的回合 |
| L0 | Level 0 角色设定 (System Prompt) |
| L1 | Level 1 上下文压缩总结 |
| L2 | Level 2 世界书实体抽取 |
| L3 | Level 3 剧情主线推进 |
| SCN | Scenario Blueprint，只读剧本模板 |
| SAV | Save Instance，玩家读写存档 |
| USR | User，玩家/创作者身份标识 |
| SSOT | Single Source of Truth，唯一数据源 |
| Dirty Flag | 脏标记，标识数据正在更新中 |
| Graceful Degradation | 优雅降级，弱模型下的兜底策略 |
| Snapshot | 快照，绑定 turn 的记忆数据版本 |
| Cascade Rollback | 级联回滚，Undo/Reroll 时清理所有 > 目标 turn 的数据 |
| Fork & Copy | 深拷贝机制，SCN 初始数据复制到 SAV 沙盒 |

---

## 11. 大模型流式通信与 Token 组装库

> 本章定义 AI Tavern 最核心的运行时引擎：**StreamClient**（流式通信）+ **TokenBudgetManager**（Token 预算管家）+ **PromptAssembler**（Prompt 组装管线）。三者构成从"用户输入"到"AI 流式回复"的完整闭环。

### 11.1 架构总览

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ PromptAssembler (Prompt 组装管线)                            │
│  1. 从 IndexedDB 拉取 L0/L3/L2/L1 + 最近 M 回合对话          │
│  2. 按优先级拼接完整 Prompt                                   │
│  3. 返回 { system_prompt, messages[] }                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ TokenBudgetManager (Token 预算管家)                          │
│  1. 估算 system_prompt + messages 的 Token 数                │
│  2. 若超阈值 → 缩减 M (滑动窗口) → 重新估算                   │
│  3. 返回最终 { prompt, token_count, m_value }                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ StreamClient (流式通信客户端)                                 │
│  1. POST /v1/chat/completions (stream: true)                │
│  2. SSE 逐 chunk 解析 → 回调 onToken(content)               │
│  3. 流结束 → 回调 onDone(fullContent)                       │
│  4. 错误 → 回调 onError(error)                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
                   UI 打字机效果
```

### 11.2 核心类型定义

```typescript
// ============================================================
// 11.2.1 消息与 Prompt 类型
// ============================================================

/** 单条对话消息 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 组装完成的 Prompt 载荷 */
interface AssembledPrompt {
  system_prompt: string;       // L0 角色设定
  messages: ChatMessage[];     // 历史消息序列 (不含 system)
  token_count: number;         // 估算总 Token 数
  m_value: number;             // 实际使用的滑动窗口大小
}

/** Prompt 组装配置 */
interface PromptConfig {
  max_total_tokens: number;    // 模型最大 Token 数 (例: 4096, 8192)
  max_response_tokens: number; // 预留回复 Token 数 (例: 1024)
  model: string;               // 模型名 (用于 Token 估算器)
}

// ============================================================
// 11.2.2 流式通信类型
// ============================================================

/** StreamClient 构造函数参数 */
interface StreamClientOptions {
  baseUrl: string;             // API 端点 (例: https://api.openai.com/v1)
  apiKey: string;              // API Key
  model: string;               // 模型名
  temperature?: number;        // 温度 (默认 0.8)
  maxTokens?: number;          // 最大回复 Token (默认 1024)
}

/** SSE 数据块解析结果 */
interface StreamChunk {
  content: string;             // 本次增量文本 (delta.content)
  finish_reason: 'stop' | 'length' | null;
  index: number;               // choice index
}

/** 流式回调集合 */
interface StreamCallbacks {
  onToken: (content: string) => void;       // 每收到一个 chunk
  onDone: (fullContent: string) => void;    // 流结束
  onError: (error: Error) => void;          // 出错
}

// ============================================================
// 11.2.3 Token 预算类型
// ============================================================

/** Token 估算结果 */
interface TokenEstimate {
  total: number;               // 总 Token 数
  breakdown: {
    system: number;            // L0 System Prompt
    l3_plot: number;           // L3 剧情主线
    l2_worldbooks: number;     // 命中的 L2 词条
    l1_summary: number;        // L1 上下文总结
    history: number;           // 历史对话窗口
  };
}

/** Token 预算管家配置 */
interface TokenBudgetConfig {
  model: string;               // 模型名
  max_total_tokens: number;    // 模型上下文上限
  max_response_tokens: number; // 预留回复 Token
  min_history_turns: number;   // 最小保留回合数 (兜底)
}
```

### 11.3 StreamClient — 流式通信客户端

#### 11.3.1 职责

- 封装 `fetch` + `ReadableStream` 实现 SSE (Server-Sent Events) 解析
- 支持 AbortController 取消请求（用户点击停止生成）
- 自动重连策略：网络闪断时自动重试 1 次
- 零外部依赖：纯原生 `fetch` API 实现

#### 11.3.2 接口

```typescript
class StreamClient {
  constructor(options: StreamClientOptions);

  /** 发起流式对话请求 */
  send(messages: ChatMessage[], callbacks: StreamCallbacks): AbortController;

  /** 取消当前请求 */
  cancel(): void;

  /** 更新配置 (切换模型/API Key 时调用) */
  updateOptions(options: Partial<StreamClientOptions>): void;
}
```

#### 11.3.3 SSE 解析算法

```
收到 Response body ReadableStream
  │
  ▼
逐行读取 (TextDecoder + line break split)
  │
  ▼
跳过空行和 "data: [DONE]"
  │
  ▼
JSON.parse("data: {...}") → StreamChunk
  │
  ▼
提取 delta.content → 回调 onToken
  │
  ▼
finish_reason === 'stop' → 回调 onDone(fullContent)
```

#### 11.3.4 错误处理

| 场景 | 行为 |
|------|------|
| HTTP 4xx/5xx | 解析 error.message，回调 onError |
| 网络中断 | 自动重试 1 次，间隔 1s |
| 用户取消 (AbortController) | 静默终止，不回调 onError |
| JSON 解析失败 | 丢弃该 chunk，继续读取下一行 |
| 超时 (30s 无数据) | 触发 onError(TimeoutError) |

### 11.4 TokenBudgetManager — Token 预算管家

#### 11.4.1 职责

- 纯前端 Token 估算（tiktoken-lite 或字符比例换算）
- 动态计算 M 值（滑动窗口大小）
- 预算溢出时逐级裁剪：先裁历史对话 → 再裁 L2 词条 → 最后裁 L1 总结
- L0 和 L3 永不裁剪（最高优先级）

#### 11.4.2 接口

```typescript
class TokenBudgetManager {
  constructor(config: TokenBudgetConfig);

  /** 估算单段文本的 Token 数 */
  estimate(text: string): number;

  /** 计算可用 M 值 (滑动窗口大小) */
  calculateM(
    l0Tokens: number,
    l3Tokens: number,
    l2Tokens: number,
    l1Tokens: number,
    totalHistoryTokens: number
  ): { m: number; trimmed: boolean };

  /** 完整预算检查 + 裁剪 */
  budgetCheck(
    l0: string,
    l3: string,
    l2: string[],
    l1: string,
    history: ChatMessage[]
  ): {
    passed: boolean;
    assembled: AssembledPrompt;
    cuts: string[];  // 裁剪日志
  };

  /** 更新配置 */
  updateConfig(config: Partial<TokenBudgetConfig>): void;
}
```

#### 11.4.3 动态 M 值计算

```
总预算 T = max_total_tokens - max_response_tokens
固定开销 F = L0 + L3 + L2 + L1
可用预算 H = T - F
M = floor(H / (单回合平均 Token 数))

兜底: M >= min_history_turns
```

#### 11.4.4 裁剪优先级

| 优先级 | 裁剪顺序 | 裁剪策略 |
|--------|----------|----------|
| 1 (先裁) | 历史对话 | 从最旧的消息开始丢弃，保留最近 M 回合 |
| 2 | L2 词条 | 丢弃匹配度最低的词条描述 |
| 3 | L1 总结 | 截断至 150 词（硬截断） |
| 永不裁剪 | L0, L3 | 绝对保留 |

### 11.5 PromptAssembler — Prompt 组装管线

#### 11.5.1 职责

- 从 IndexedDB 拉取 L0/L3/L2/L1 数据（限定 sav_id）
- 按优先级拼接完整 Prompt
- 调用 TokenBudgetManager 进行预算检查
- 输出最终 `AssembledPrompt` 供 StreamClient 使用

#### 11.5.2 接口

```typescript
interface MemoryLoader {
  /** 从 IndexedDB 加载 L0 角色设定 */
  loadL0(savId: string): Promise<string>;

  /** 从 IndexedDB 加载最新 L3 剧情主线 */
  loadL3(savId: string): Promise<string | null>;

  /** 从 IndexedDB 加载命中的 L2 词条 (关键词匹配) */
  loadL2(savId: string, userInput: string, recentContext: string): Promise<string[]>;

  /** 从 IndexedDB 加载最新 L1 上下文总结 */
  loadL1(savId: string): Promise<string | null>;

  /** 从 IndexedDB 加载最近 N 回合对话 */
  loadHistory(savId: string, m: number): Promise<ChatMessage[]>;
}

class PromptAssembler {
  constructor(
    private memoryLoader: MemoryLoader,
    private tokenBudget: TokenBudgetManager
  );

  /** 完整组装管线 */
  async assemble(
    savId: string,
    userInput: string,
    config: PromptConfig
  ): Promise<AssembledPrompt>;

  /** 仅组装 L2 召回 (用于 UI 预览高亮) */
  async recallL2(savId: string, userInput: string): Promise<string[]>;
}
```

#### 11.5.3 组装管线流程

```
assemble(savId, userInput, config)
  │
  ├─ 1. 并行加载: L0, L3, L2(关键词匹配), L1, 历史对话
  │     (Promise.all, 减少串行等待)
  │
  ├─ 2. 拼接 system_prompt:
  │     [L0] + "\n\n[当前剧情]\n" + [L3] + "\n\n[世界书激活]\n" + [L2词条]
  │
  ├─ 3. 构建 messages[]:
  │     [L1 总结作为 system 消息] + [最近 M 回合对话] + [userInput]
  │
  ├─ 4. TokenBudgetManager.budgetCheck()
  │     ├─ 通过 → 返回 AssembledPrompt
  │     └─ 失败 → 裁剪 → 重新组装 → 再次检查
  │
  └─ 5. 返回最终 AssembledPrompt
```

#### 11.5.4 L2 关键词匹配算法

```
用户输入 + 最近 2 回合 AI 回复
  │
  ▼
从 IndexedDB 加载 sav_id 下所有 L2_Worldbook 词条
  │
  ▼
对每条词条的 keyword[] 执行正则匹配 (忽略大小写)
  │
  ▼
命中 → 加入激活列表
  │
  ▼
按匹配优先级排序: 精确匹配 > 部分匹配 > 无匹配
  │
  ▼
返回 top-K 词条的 description (K ≤ 5)
```

### 11.6 完整发送流程 (整合)

```
用户点击发送 (或 Enter)
  │
  ▼
[UI 层] 获取输入文本, 显示本地消息气泡
  │
  ▼
[PromptAssembler.assemble()]
  ├─ 并行加载 L0/L3/L2/L1/历史
  ├─ TokenBudgetManager 预算检查
  └─ 返回 AssembledPrompt
  │
  ▼
[StreamClient.send()]
  ├─ POST /v1/chat/completions (stream: true)
  ├─ SSE 逐 chunk → onToken → UI 打字机效果
  └─ onDone → 保存完整回复到 IndexedDB
  │
  ▼
[回合递增] N += 1
  │
  ▼
[后台 Worker 触发检查]
  ├─ N%3==0 → L2 实体抽取
  ├─ N%5==0 → L1 上下文压缩
  └─ N%10==0 → L3 剧情推进
```

### 11.7 已知妥协与技术债

| 妥协项 | 说明 | 原因 |
|--------|------|------|
| Token 估算非精确 | 使用字符比例换算而非完整 tiktoken BPE | 避免引入 2MB+ 的 tiktoken WASM 依赖 |
| 无流式重排 | SSE chunk 按到达顺序直接拼接 | 绝大多数模型已按序输出 |
| L2 匹配无语义 | 仅正则关键词匹配，无向量语义检索 | 纯前端无法承载 embedding 模型 |
| 单次重试 | 网络闪断仅重试 1 次 | 避免无限重试导致重复生成 |
| 无请求队列 | 用户连续发送时直接取消前一个请求 | 简化状态管理，符合对话直觉 |

---
