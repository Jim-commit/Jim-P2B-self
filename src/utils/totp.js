/**
 * 百工天街 · 纯浏览器端 RFC-6238 TOTP 动态口令与一次性应急恢复码工具
 * - 支持县域/乡镇手机时钟偏差容错（window = ±4，即前后 2 分钟内动态码均有效）
 * - 支持生成 6 组 8 位一次性应急恢复码及其 SHA-256 单向哈希摘要
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32ToBytes(base32) {
  const clean = String(base32 || '')
    .toUpperCase()
    .replace(/=+$/, '')
    .replace(/[^A-Z2-7]/g, '');

  let bits = 0;
  let value = 0;
  const output = [];

  for (let i = 0; i < clean.length; i++) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(clean[i]);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export function generateBase32Secret(length = 20) {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += BASE32_ALPHABET[randomBytes[i] % 32];
  }
  return secret;
}

export function buildOtpAuthUri({ secret, accountName, issuer = '百工天街平准网' }) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const iss = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${iss}&algorithm=SHA1&digits=6&period=30`;
}

async function computeHotp(secretBase32, counter) {
  const keyBytes = base32ToBytes(secretBase32);
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer));
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);

  return String(binary % 1000000).padStart(6, '0');
}

/**
 * 校验 6 位 TOTP 动态口令
 * @param {string} secretBase32
 * @param {string} token
 * @param {number} windowSteps 默认 ±4 步长（前后 2 分钟容错，防手机未开启自动对时）
 */
export async function verifyTotpCode(secretBase32, token, windowSteps = 4) {
  const cleanToken = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanToken) || !secretBase32) return false;

  const currentStep = Math.floor(Date.now() / 1000 / 30);
  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    const expected = await computeHotp(secretBase32, currentStep + delta);
    if (expected === cleanToken) return true;
  }
  return false;
}

/**
 * 计算字符串的 SHA-256 十六进制哈希（用于一次性应急恢复码存储）
 */
export async function sha256Hex(rawText) {
  const normalized = String(rawText || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 生成 6 组 8 位一次性应急恢复码及对应的 SHA-256 哈希数组
 */
export async function generateRecoveryCodeBundle(count = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 剔除易混淆的 I/O/0/1
  const plainCodes = [];
  const hashedCodes = [];

  for (let i = 0; i < count; i++) {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    let raw = '';
    for (let j = 0; j < 8; j++) {
      raw += chars[buf[j] % chars.length];
    }
    const formatted = `BG-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plainCodes.push(formatted);
    hashedCodes.push(await sha256Hex(formatted));
  }

  return { plainCodes, hashedCodes };
}
