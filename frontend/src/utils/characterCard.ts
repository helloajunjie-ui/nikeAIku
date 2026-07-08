// ============================================================
// 角色卡导入工具 (Character Card Importer)
// F-15: 角色卡管理 — 解析 PNG/V2 JSON 角色卡格式
// F-16: 角色卡导入 — 兼容 RisuAI / TavernAI 格式
// ============================================================

/**
 * 解析后的角色卡数据结构
 */
export interface CharacterCard {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  system_prompt: string;
  tags: string[];
  avatar?: string; // Base64 data URL
  creator_notes: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  character_book?: CharacterBook;
}

interface CharacterBook {
  entries: CharacterBookEntry[];
}

interface CharacterBookEntry {
  keys: string[];
  content: string;
  insertion_order: number;
  enabled: boolean;
}

/**
 * 从 File 对象解析角色卡
 * 支持格式:
 * 1. .png — RisuAI/TavernAI PNG 角色卡 (角色数据嵌入在 PNG chunk 中)
 * 2. .json — V2 JSON 角色卡
 */
export async function parseCharacterCard(file: File): Promise<CharacterCard> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.png')) {
    return parsePngCard(file);
  } else if (fileName.endsWith('.json')) {
    return parseJsonCard(file);
  } else {
    throw new Error('不支持的文件格式，请使用 .png 或 .json 角色卡');
  }
}

/**
 * 解析 PNG 角色卡
 * TavernAI/RisuAI 将角色数据以 JSON 形式嵌入 PNG 文件的 tEXt/zTXt chunk 中
 * key 为 "chara" 或 "character.json"
 */
async function parsePngCard(file: File): Promise<CharacterCard> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // PNG signature check
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== pngSignature[i]) {
      throw new Error('无效的 PNG 文件');
    }
  }

  // 提取嵌入的文本数据
  let offset = 8; // Skip PNG signature
  let charaData: string | null = null;
  let avatarData: string | null = null;

  while (offset < bytes.length - 4) {
    const length = readUint32(bytes, offset);
    const chunkType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

    if (chunkType === 'tEXt') {
      // tEXt chunk: keyword + null separator + text
      const dataStart = offset + 8;
      let nullPos = dataStart;
      while (nullPos < dataStart + length && bytes[nullPos] !== 0) nullPos++;
      const keyword = new TextDecoder().decode(bytes.slice(dataStart, nullPos));
      const text = new TextDecoder().decode(bytes.slice(nullPos + 1, dataStart + length));

      if (keyword === 'chara' || keyword === 'character.json') {
        charaData = text;
      }
    } else if (chunkType === 'zTXt') {
      // zTXt chunk: keyword + null + compression method + compressed text
      const dataStart = offset + 8;
      let nullPos = dataStart;
      while (nullPos < dataStart + length && bytes[nullPos] !== 0) nullPos++;
      const keyword = new TextDecoder().decode(bytes.slice(dataStart, nullPos));
      const compressionMethod = bytes[nullPos + 1];

      if (compressionMethod === 0 && (keyword === 'chara' || keyword === 'character.json')) {
        // Deflate compressed
        const compressedData = bytes.slice(nullPos + 2, dataStart + length);
        try {
          const decompressed = await decompressDeflate(compressedData);
          charaData = new TextDecoder().decode(decompressed);
        } catch {
          // 解压失败，跳过
        }
      }
    } else if (chunkType === 'IEND') {
      break;
    }

    offset += 12 + length; // length(4) + type(4) + data(length) + crc(4)
  }

  if (!charaData) {
    throw new Error('未找到角色卡数据，请确认该 PNG 是有效的 TavernAI/RisuAI 角色卡');
  }

  // 解析 JSON 数据
  let rawData: any;
  try {
    rawData = JSON.parse(charaData);
  } catch {
    throw new Error('角色卡数据解析失败：JSON 格式错误');
  }

  // 提取头像 (PNG 本身就是头像)
  avatarData = `data:image/png;base64,${arrayBufferToBase64(arrayBuffer)}`;

  return normalizeCardData(rawData, avatarData);
}

/**
 * 解析 JSON 角色卡 (V2 格式)
 */
async function parseJsonCard(file: File): Promise<CharacterCard> {
  const text = await file.text();
  let rawData: any;

  try {
    rawData = JSON.parse(text);
  } catch {
    throw new Error('JSON 解析失败');
  }

  return normalizeCardData(rawData, undefined);
}

/**
 * 统一规范化不同格式的角色卡数据
 */
function normalizeCardData(raw: any, avatarBase64?: string): CharacterCard {
  // TavernAI v2 格式
  if (raw.data) {
    const data = raw.data;
    return {
      name: data.name || '',
      description: data.description || '',
      personality: data.personality || '',
      scenario: data.scenario || '',
      first_mes: data.first_mes || '',
      mes_example: data.mes_example || '',
      system_prompt: data.system_prompt || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      avatar: avatarBase64 || (data.avatar ? `data:image/png;base64,${data.avatar}` : undefined),
      creator_notes: data.creator_notes || '',
      post_history_instructions: data.post_history_instructions || '',
      alternate_greetings: Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [],
      character_book: data.character_book ? normalizeCharacterBook(data.character_book) : undefined,
    };
  }

  // RisuAI 格式
  if (raw.name || raw.system_prompt) {
    return {
      name: raw.name || '',
      description: raw.description || '',
      personality: raw.personality || '',
      scenario: raw.scenario || '',
      first_mes: raw.first_mes || '',
      mes_example: raw.mes_example || '',
      system_prompt: raw.system_prompt || '',
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      avatar: avatarBase64,
      creator_notes: raw.creator_notes || '',
      post_history_instructions: raw.post_history_instructions || '',
      alternate_greetings: Array.isArray(raw.alternate_greetings) ? raw.alternate_greetings : [],
      character_book: raw.character_book ? normalizeCharacterBook(raw.character_book) : undefined,
    };
  }

  throw new Error('无法识别的角色卡格式');
}

function normalizeCharacterBook(book: any): CharacterBook {
  return {
    entries: Array.isArray(book.entries)
      ? book.entries.map((e: any) => ({
          keys: Array.isArray(e.keys) ? e.keys : [],
          content: e.content || '',
          insertion_order: e.insertion_order || 0,
          enabled: e.enabled !== false,
        }))
      : [],
  };
}

// ==================== 工具函数 ====================

function readUint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decompressDeflate(compressed: Uint8Array): Promise<Uint8Array> {
  const cs = new DecompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(compressed.buffer as ArrayBuffer);
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * 将角色卡数据转换为 SCN Blueprint JSON 字符串
 * 用于填充 Creator 编辑器
 */
export function characterCardToBlueprint(card: CharacterCard): string {
  const blueprint: any = {
    main_prompt: buildSystemPrompt(card),
    greeting: card.first_mes || '',
    init_worldbooks: card.character_book?.entries
      ? card.character_book.entries
          .filter((e) => e.enabled)
          .map((e) => ({
            keywords: e.keys,
            description: e.content,
          }))
      : [],
    init_plot: card.scenario || '',
    prologue_html: buildPrologueHtml(card),
  };

  return JSON.stringify(blueprint, null, 2);
}

function buildSystemPrompt(card: CharacterCard): string {
  const parts: string[] = [];

  if (card.system_prompt) {
    parts.push(card.system_prompt);
  }

  parts.push(`\n# 角色设定\n${card.description}`);

  if (card.personality) {
    parts.push(`\n# 性格\n${card.personality}`);
  }

  if (card.scenario) {
    parts.push(`\n# 场景\n${card.scenario}`);
  }

  if (card.mes_example) {
    parts.push(`\n# 对话示例\n${card.mes_example}`);
  }

  if (card.post_history_instructions) {
    parts.push(`\n# 历史后指令\n${card.post_history_instructions}`);
  }

  return parts.join('\n\n');
}

export function buildPrologueHtml(card: CharacterCard): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: 'Noto Sans SC', sans-serif;
    background: linear-gradient(135deg, #13141c 0%, #1c1d26 100%);
    color: #e5e7eb;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    margin: 0;
    padding: 20px;
  }
  .card {
    background: rgba(28, 29, 38, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 32px;
    max-width: 500px;
    width: 100%;
    backdrop-filter: blur(10px);
    text-align: center;
  }
  .avatar {
    width: 120px;
    height: 120px;
    border-radius: 60px;
    object-fit: cover;
    border: 3px solid rgba(168, 85, 247, 0.5);
    margin-bottom: 16px;
  }
  h1 {
    font-size: 24px;
    font-weight: bold;
    margin: 0 0 8px 0;
    background: linear-gradient(135deg, #a855f7, #d946ef);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .desc {
    color: #9ca3af;
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 24px;
  }
  .btn {
    background: linear-gradient(135deg, #7c3aed, #9333ea);
    color: white;
    border: none;
    padding: 12px 32px;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    transition: transform 0.2s;
  }
  .btn:hover {
    transform: scale(1.05);
  }
</style>
</head>
<body>
  <div class="card">
    ${card.avatar ? `<img class="avatar" src="${card.avatar}" alt="${card.name}" />` : ''}
    <h1>${escapeHtml(card.name)}</h1>
    <p class="desc">${escapeHtml(card.description || '开始你的冒险...')}</p>
    <button class="btn" onclick="window.parent.postMessage('start_adventure', '*')">开始冒险</button>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}
