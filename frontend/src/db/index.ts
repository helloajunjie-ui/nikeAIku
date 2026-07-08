import { openDB, type IDBPDatabase } from 'idb';
import type { Scenario, Save, Conversation, DynamicMemory, WorldBookEntry } from '../types';

const DB_NAME = 'niko-tavern';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 剧本模板表 (ROM)
        if (!db.objectStoreNames.contains('scenarios')) {
          const store = db.createObjectStore('scenarios', { keyPath: 'scn_id' });
          store.createIndex('author_id', 'author_id');
        }

        // 玩家存档表 (RAM)
        if (!db.objectStoreNames.contains('saves')) {
          const store = db.createObjectStore('saves', { keyPath: 'sav_id' });
          store.createIndex('usr_id', 'usr_id');
          store.createIndex('scn_id', 'scn_id');
        }

        // 对话表
        if (!db.objectStoreNames.contains('conversations')) {
          const store = db.createObjectStore('conversations', { keyPath: 'id' });
          store.createIndex('sav_id_turn', ['sav_id', 'turn']);
          store.createIndex('sav_id', 'sav_id');
        }

        // 动态记忆表
        if (!db.objectStoreNames.contains('dynamic_memories')) {
          const store = db.createObjectStore('dynamic_memories', { keyPath: 'id' });
          store.createIndex('sav_id_type', ['sav_id', 'type']);
          store.createIndex('sav_id', 'sav_id');
        }

        // 配置表
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// ==================== Scenarios ====================

export async function getAllScenarios(): Promise<Scenario[]> {
  const db = await getDB();
  return db.getAll('scenarios');
}

export async function getScenario(scnId: string): Promise<Scenario | undefined> {
  const db = await getDB();
  return db.get('scenarios', scnId);
}

export async function putScenario(scenario: Scenario): Promise<void> {
  const db = await getDB();
  await db.put('scenarios', scenario);
}

// ==================== Saves ====================

export async function getAllSaves(): Promise<Save[]> {
  const db = await getDB();
  return db.getAll('saves');
}

export async function getSave(savId: string): Promise<Save | undefined> {
  const db = await getDB();
  return db.get('saves', savId);
}

export async function putSave(save: Save): Promise<void> {
  const db = await getDB();
  await db.put('saves', save);
}

export async function deleteSave(savId: string): Promise<void> {
  const db = await getDB();
  await db.delete('saves', savId);
}

/**
 * F-26: 多分支存档 — 从已有存档深拷贝创建分支
 * 1. 读取源存档的 scenario + conversations + memories
 * 2. 生成新 sav_id，设置 parent_sav_id = 源存档
 * 3. 深拷贝 conversations 和 memories 到新 sav_id
 * 4. 写入 IndexedDB 并上传到后端
 */
export async function forkSave(
  sourceSavId: string,
  userId: string,
  newName?: string
): Promise<Save> {
  // 1. 读取源存档
  const sourceSave = await getSave(sourceSavId);
  if (!sourceSave) {
    throw new Error(`源存档不存在: ${sourceSavId}`);
  }

  // 2. 读取源存档的 conversations
  const sourceConversations = await getConversations(sourceSavId);

  // 3. 读取源存档的 memories（L1 + L2 + L3）
  const sourceL1 = await getMemoriesByType(sourceSavId, 'L1_Summary');
  const sourceL2 = await getMemoriesByType(sourceSavId, 'L2_Worldbook');
  const sourceL3 = await getLatestMemory(sourceSavId, 'L3_Plot');

  // 4. 生成新存档 ID
  const newSavId = 'SAV_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = Date.now();

  // 5. 创建新存档记录（带 parent_sav_id）
  const newSave: Save = {
    sav_id: newSavId,
    scn_id: sourceSave.scn_id,
    usr_id: userId,
    name: newName || `${sourceSave.name} (分支)`,
    current_turn: sourceSave.current_turn,
    parent_sav_id: sourceSavId,
    created_at: now,
    updated_at: now,
  };

  // 6. 深拷贝 conversations
  for (const msg of sourceConversations) {
    const newMsg: Conversation = {
      ...msg,
      id: `msg-${newSavId}-${msg.turn}-${now}`,
      sav_id: newSavId,
      timestamp: now,
    };
    await putConversation(newMsg);
  }

  // 7. 深拷贝 L1 memories
  for (const mem of sourceL1) {
    const newMem: DynamicMemory = {
      ...mem,
      id: `mem-${newSavId}-L1-${now}`,
      sav_id: newSavId,
      created_at: now,
    };
    await putMemory(newMem);
  }

  // 8. 深拷贝 L2 memories
  for (const mem of sourceL2) {
    const newMem: DynamicMemory = {
      ...mem,
      id: `mem-${newSavId}-L2-${now}`,
      sav_id: newSavId,
      created_at: now,
    };
    await putMemory(newMem);
  }

  // 9. 深拷贝 L3 memory
  if (sourceL3) {
    const newL3: DynamicMemory = {
      ...sourceL3,
      id: `mem-${newSavId}-L3-${now}`,
      sav_id: newSavId,
      created_at: now,
    };
    await putMemory(newL3);
  }

  // 10. 写入新存档
  await putSave(newSave);

  return newSave;
}

/**
 * Fork & Copy: 从剧本模板 (SCN) 深拷贝创建新存档 (SAV)
 * 将 SCN 的 main_prompt 作为 L0, init_plot 作为 L3 初始记忆写入
 * 保证多个玩家玩同一剧本时记忆完全隔离
 */
export async function createSaveFromScenario(
  scenario: Scenario,
  userId: string,
  saveName?: string
): Promise<Save> {
  const savId = 'SAV_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = Date.now();

  // 1. 创建存档记录
  const save: Save = {
    sav_id: savId,
    scn_id: scenario.scn_id,
    usr_id: userId,
    name: saveName || scenario.name,
    current_turn: 0,
    created_at: now,
    updated_at: now,
  };

  // 2. 深拷贝 L0 (核心世界观) 作为初始 L3 剧情轴
  const l0Memory: DynamicMemory = {
    id: `mem-${savId}-L0-${now}`,
    sav_id: savId,
    type: 'L3_Plot',
    turn: 0,
    content: scenario.main_prompt,
    origin: 'scenario',
    created_at: now,
  };

  // 3. 深拷贝 init_plot 作为初始 L3 剧情轴
  if (scenario.init_plot) {
    const l3Memory: DynamicMemory = {
      id: `mem-${savId}-L3-${now}`,
      sav_id: savId,
      type: 'L3_Plot',
      turn: 0,
      content: scenario.init_plot,
      origin: 'scenario',
      created_at: now,
    };
    await putMemory(l3Memory);
  }

  // 4. 深拷贝世界书词条作为 L2 初始数据
  if (scenario.init_worldbooks && scenario.init_worldbooks.length > 0) {
    for (let i = 0; i < scenario.init_worldbooks.length; i++) {
      const wb = scenario.init_worldbooks[i];
      const wbMemory: DynamicMemory = {
        id: `mem-${savId}-L2-${i}-${now}`,
        sav_id: savId,
        type: 'L2_Worldbook',
        turn: 0,
        content: wb,
        origin: 'scenario',
        created_at: now,
      };
      await putMemory(wbMemory);
    }
  }

  // 5. 写入存档
  await putSave(save);

  return save;
}

// ==================== Conversations ====================

export async function getConversations(savId: string): Promise<Conversation[]> {
  const db = await getDB();
  const index = db.transaction('conversations').store.index('sav_id_turn');
  const range = IDBKeyRange.bound([savId, 0], [savId, Infinity]);
  return index.getAll(range);
}

export async function putConversation(msg: Conversation): Promise<void> {
  const db = await getDB();
  await db.put('conversations', msg);
}

export async function deleteConversationsAfterTurn(savId: string, turn: number): Promise<void> {
  const db = await getDB();
  const index = db.transaction('conversations', 'readwrite').store.index('sav_id_turn');
  const range = IDBKeyRange.lowerBound([savId, turn + 1]);
  let cursor = await index.openCursor(range);
  while (cursor) {
    cursor.delete();
    cursor = await cursor.continue();
  }
}

// ==================== Dynamic Memories ====================

export async function getLatestMemory(savId: string, type: string): Promise<DynamicMemory | undefined> {
  const db = await getDB();
  const index = db.transaction('dynamic_memories').store.index('sav_id_type');
  const range = IDBKeyRange.bound([savId, type], [savId, type]);
  const all = await index.getAll(range);
  // 按 turn 降序取最新
  all.sort((a, b) => b.turn - a.turn);
  return all[0];
}

export async function getMemoriesByType(savId: string, type: string): Promise<DynamicMemory[]> {
  const db = await getDB();
  const index = db.transaction('dynamic_memories').store.index('sav_id_type');
  const range = IDBKeyRange.bound([savId, type], [savId, type]);
  return index.getAll(range);
}

export async function putMemory(memory: DynamicMemory): Promise<void> {
  const db = await getDB();
  await db.put('dynamic_memories', memory);
}

export async function deleteMemoriesAfterTurn(savId: string, turn: number): Promise<void> {
  const db = await getDB();
  const index = db.transaction('dynamic_memories', 'readwrite').store.index('sav_id_type');
  const all = await index.getAll();
  const tx = db.transaction('dynamic_memories', 'readwrite');
  for (const mem of all) {
    if (mem.sav_id === savId && mem.turn > turn) {
      await tx.store.delete(mem.id);
    }
  }
  await tx.done;
}

// ==================== Config ====================

export async function getConfig(key: string): Promise<string | undefined> {
  const db = await getDB();
  const record = await db.get('config', key);
  return record?.value;
}

export async function setConfig(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put('config', { key, value });
}

/**
 * Fork & Copy 适配器: 从后端 API 返回的 ScenarioDetail 创建本地存档
 * 解析 blueprint_data JSON → 转为本地 Scenario 格式 → 调用 createSaveFromScenario
 */
export async function createSaveFromApiScenario(
  apiScenario: { id: string; title: string; intro: string; blueprint_data: string; cover_url?: string },
  userId: string,
  saveName?: string
): Promise<Save> {
  // 1. 解析 blueprint JSON
  let blueprint: Record<string, unknown> = {};
  try {
    blueprint = JSON.parse(apiScenario.blueprint_data);
  } catch {
    blueprint = {};
  }

  // 2. 提取各字段
  const mainPrompt = typeof blueprint.main_prompt === 'string' ? blueprint.main_prompt : '';
  const initWorldbooks = Array.isArray(blueprint.init_worldbooks) ? blueprint.init_worldbooks as WorldBookEntry[] : [];
  const initPlot = typeof blueprint.init_plot === 'string' ? blueprint.init_plot : '';

  // 3. 构造本地 Scenario 对象，main_prompt 存储完整 blueprint JSON（含 prologue_html 等）
  const localScenario: Scenario = {
    scn_id: apiScenario.id,
    author_id: userId,
    name: apiScenario.title,
    intro: apiScenario.intro,
    main_prompt: apiScenario.blueprint_data,
    init_worldbooks: initWorldbooks,
    init_plot: initPlot,
    version: 1,
    tags: [],
    cover_url: apiScenario.cover_url,
    created_at: Date.now(),
  };

  // 3. 写入本地 scenarios 表（缓存）
  await putScenario(localScenario);

  // 4. 调用 Fork & Copy 深拷贝
  return createSaveFromScenario(localScenario, userId, saveName);
}
