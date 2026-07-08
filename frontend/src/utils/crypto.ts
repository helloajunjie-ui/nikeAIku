// ============================================================
// 零信任安全 — AES-GCM 端侧加密工具
// F-36: API Key 端侧加密 — 用户密码派生 AES-GCM 密钥
// F-37: 跨设备解密 — 新设备登录时用密码解密
// F-38: 零信任存储 — 服务器仅存密文 BLOB
// 使用 Web Crypto API，无外部依赖
// ============================================================

const PBKDF2_ITERATIONS = 600000;
const SALT_LENGTH = 32;   // bytes
const IV_LENGTH = 12;     // bytes (AES-GCM 推荐 96-bit)
const KEY_LENGTH = 256;   // bits

/**
 * 从用户密码派生 AES-GCM 密钥
 * 使用 PBKDF2 + 随机 salt，每次派生结果不同
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Uint8Array.buffer 在严格 TS 模式下类型不兼容，使用 slice().buffer 绕过
  const saltBuf = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuf,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 加密明文
 * 返回 base64 编码的密文，格式: salt(32B) + iv(12B) + ciphertext
 * salt 随机生成，每次加密结果不同
 */
export async function encrypt(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  // 拼接: salt + iv + ciphertext
  const ct = new Uint8Array(ciphertext);
  const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ct.length);
  combined.set(salt, 0);
  combined.set(iv, SALT_LENGTH);
  combined.set(ct, SALT_LENGTH + IV_LENGTH);

  return uint8ArrayToBase64(combined);
}

/**
 * 解密密文
 * 输入为 base64 编码的密文 (salt + iv + ciphertext)
 * 密码错误时抛出错误
 */
export async function decrypt(encryptedBase64: string, password: string): Promise<string> {
  const combined = base64ToUint8Array(encryptedBase64);

  if (combined.length < SALT_LENGTH + IV_LENGTH + 1) {
    throw new Error('密文数据不完整');
  }

  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveKey(password, salt);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('解密失败：密码错误或数据已损坏');
  }
}

/**
 * 生成随机密码（用于初始设置提示）
 */
export function generateRandomPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => chars[b % chars.length])
    .join('');
}

// ==================== Base64 工具 ====================

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
