// Base32 字符集
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// 随机生成 16 位 Base32 格式 Secret 密钥
export function generateBase32Secret(length = 16) {
  let secret = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    secret += BASE32_CHARS[randomValues[i] % 32];
  }
  return secret;
}

// 解码 Base32 字符串为 Uint8Array
function base32ToUint8Array(base32) {
  const cleanBase32 = base32.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (let i = 0; i < cleanBase32.length; i++) {
    const val = BASE32_CHARS.indexOf(cleanBase32[i]);
    if (val === -1) throw new Error('Invalid Base32 character');
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
  }
  return bytes;
}

// 计算特定时间戳计步下的 6 位动态验证码
async function generateHOTP(secret, counter) {
  const keyBytes = base32ToUint8Array(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: { name: 'SHA-1' } },
    false,
    ['sign']
  );

  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  // Big-endian 64 位整数
  counterView.setUint32(0, Math.floor(counter / 0x100000000), false);
  counterView.setUint32(4, counter & 0xffffffff, false);

  const hmacResult = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hmacBytes = new Uint8Array(hmacResult);

  // 截断算法 Dynamic Truncation
  const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
  const binary =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

// 校验 6 位 TOTP 口令 (支持前后 1 个时间窗口容差，共 ±30 秒容错)
export async function verifyTOTP(secret, inputToken, timeStep = 30) {
  if (!secret || !inputToken) return false;
  const cleanToken = inputToken.toString().trim();
  if (cleanToken.length !== 6) return false;

  const currentCounter = Math.floor(Date.now() / 1000 / timeStep);

  for (let i = -1; i <= 1; i++) {
    const expectedOtp = await generateHOTP(secret, currentCounter + i);
    if (expectedOtp === cleanToken) {
      return true;
    }
  }
  return false;
}

// 生成供 Google / 腾讯身份验证器扫码录入的标准 URI
export function getTOTPKeyURI(accountName, issuer, secret) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
