# NIKO 酒馆 — Multi-Level Memory Stream AI Tavern

> **版本: v2.2** | 基于多层记忆流的 AI 角色扮演酒馆
> 实际代码状态请以 [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) 为准。

## 项目定位

NIKO 酒馆是一个**多层记忆流 (Multi-Level Memory Stream)** AI 角色扮演平台。玩家创建/选择剧本，AI 根据四层记忆体系（L0 初始信息 → L1 短期摘要 → L2 世界书条目 → L3 剧情主线）维持长期一致的叙事体验。

## 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 前端框架 | React 18 + TypeScript | Vite 构建，`tsc --noEmit` 零错误 |
| 状态管理 | Zustand | `authStore` / `gameStore` / `uiStore` 三个独立 Store |
| 持久化 | IndexedDB (idb) | 本地存储剧本/存档/对话/记忆/配置 |
| 样式 | Tailwind CSS | 暗色主题，ColorOS 水生质感 |
| 后端 | Go + Gin | RESTful API，SQLite 持久化 |
| 部署 | Docker Compose | 单容器全栈部署 |

## 快速开始

### Docker 部署（推荐）

```bash
docker compose up -d
```

访问 `http://localhost:8080`。

### 开发模式

```bash
# 启动前端（端口 5173）
cd frontend && npm install && npx vite --host 0.0.0.0 --port 5173

# 启动后端（端口 8080）
cd backend && go build -o server.exe . && server.exe
```

前端通过 Vite proxy (`/api` → `localhost:8080`) 转发 API 请求。

## 核心架构

### 四层记忆体系 (L0-L3)

| 层级 | 名称 | 触发时机 | 存储位置 |
|------|------|----------|----------|
| L0 | 初始信息 | 游戏开始时加载 | IndexedDB `scenarios` |
| L1 | 短期摘要 | 每 5 回合 | IndexedDB `dynamic_memories` |
| L2 | 世界书条目 | 每 3 回合 | IndexedDB `dynamic_memories` |
| L3 | 剧情主线 | 每 10 回合 | IndexedDB `dynamic_memories` |

### Hook Composition 架构

```
usePlayEngine (编排层)
├── usePlayStorage (存储层) — hydrate/autoSync/CRUD
└── useAIComm (通信层) — StreamClient/模型选择/记忆模型调用
```

### 文件结构

```
frontend/src/
├── hooks/          # React Hooks (usePlayEngine, usePlayStorage, useAIComm)
├── components/     # UI 组件 (Sidebar, TopBar, InputConsole, ChatStage, MemoryInspector)
├── pages/          # 页面 (Play, Lobby, Saves, Creator, Settings, Admin)
├── stores/         # Zustand 状态管理 (authStore, gameStore, uiStore)
├── services/       # 服务层 (MemoryLoaderService)
├── engine/         # 引擎核心 (StreamClient, PromptAssembler, TokenBudgetManager)
├── db/             # IndexedDB 封装
├── worker/         # Web Worker (memoryEngine)
├── types/          # TypeScript 类型定义
└── utils/          # 工具函数 (api, crypto, characterCard, playEngineHelpers)

backend/
├── cmd/server/     # 入口 (main.go)
├── handlers/       # HTTP 处理器 (auth, scenario, save, chat, admin, config, image)
├── services/       # 服务层 (database, health)
├── models/         # 数据模型
├── middleware/     # 中间件 (auth)
└── config/         # 配置
```

## 关键特性

- **多层记忆引擎**: Web Worker 中运行，不阻塞 UI 线程
- **云端同步**: 存档自动同步到服务器，支持多设备恢复
- **BYOK (Bring Your Own Key)**: 玩家可使用自有 API Key
- **世界书 (Worldbook)**: 动态记忆条目，四要素框架 (Who/What/Where/When)
- **潜意识中枢**: MemoryInspector 面板实时查看 L0/L1/L2/L3 状态
- **模型管理**: 管理员可启用/禁用 AI 模型，前端动态展示

## 详细文档

- [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 完整架构文档（含所有文件行数、技术债记录、版本差异表）
- [`PRD.md`](PRD.md) — 历史产品需求文档（v2.2，部分功能未实现，仅供参考）

## 技术债记录

> 详见 [`ARCHITECTURE.md §6`](docs/ARCHITECTURE.md#6-技术债记录)

当前已知技术债：
1. **`globalApp` 全局变量** — `App.tsx` 中 `let globalApp: React.FC`，用于 Sidebar 导航，待 React Router 引入后移除
2. **`sync.Once` 单例** — `backend/services/database.go` 中 `var initDBOnce sync.Once`，数据库初始化单例
3. **Zustand Store 耦合** — `gameStore` 同时持有 `currentScenario`/`conversations`/`engineStatus`，未按 DDD 拆分
4. **`any` 类型滥用** — `MemoryLoaderService.ts` 中 `Record<string, unknown>` 和 `any[]` 类型逃逸
5. **`usePlayEngine` 仍偏大** — 476 行，`handleSend`/`handleReroll`/`handleRegenerate` 可进一步提取
