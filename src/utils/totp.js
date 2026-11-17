// =========================================================================
// RFC 6238 TOTP 身份验证器核心算法与标准二维码协议生成模块
// =========================================================================
export const TOTP = {
  base32chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',

  base32ToBytes(base32) {
    const clean = (base32 || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    const length = clean.length;
    let bits = 0, value = 0, index = 0;
    const bytes = new Uint8Array((length * 5 / 8) | 0);
    for (let i = 0; i < length; i++) {
      const val = this.base32chars.indexOf(clean.charAt(i));
      if (val === -1) continue;
      value = (value << 5) | val;
      bits += 5;
      if (bits >= 8) {
        bytes[index++] = (value >>> (bits - 8)) & 255;
        bits -= 8;
      }
    }
    return bytes;
  },

  bytesToBase32(bytes) {
    let bits = 0, value = 0, output = '';
    for (let i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) {
        output += this.base32chars[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) output += this.base32chars[(value << (5 - bits)) & 31];
    return output;
  },

  async generateHOTP(secretBytes, counter) {
    const counterBuffer = new ArrayBuffer(8);
    const counterView = new DataView(counterBuffer);
    counterView.setUint32(0, Math.floor(counter / 0x100000000));
    counterView.setUint32(4, counter & 0xffffffff);
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, counterBuffer);
    const hmac = new Uint8Array(signature);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return (binary % 1000000).toString().padStart(6, '0');
  },

  async verifyTOTP(secretBase32, token, windowSteps = 2) {
    if (!secretBase32 || !token) return false;
    try {
      const secretBytes = this.base32ToBytes(secretBase32);
      const currentCounter = Math.floor(Date.now() / 1000 / 30);
      const cleanToken = String(token).trim();
      for (let step = -windowSteps; step <= windowSteps; step++) {
        const expectedOtp = await this.generateHOTP(secretBytes, currentCounter + step);
        if (expectedOtp === cleanToken) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  generateRandomSecret(byteLength = 16) {
    const randomBytes = new Uint8Array(byteLength);
    crypto.getRandomValues(randomBytes);
    return this.bytesToBase32(randomBytes);
  },

  buildQrImageUrl(issuerName, accountName, secret) {
    const issuer = encodeURIComponent(issuerName);
    const account = encodeURIComponent(accountName);
    const otpauthUrl = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(otpauthUrl)}`;
  }
};
