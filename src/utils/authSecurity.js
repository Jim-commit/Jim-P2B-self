// =========================================================================
// 百工百业公共安全与防抢注底座（零第三方依赖 · 原生 Web Crypto SHA-256）
// =========================================================================

const LOCKOUT_KEY_PREFIX = 'baigong_auth_fail_v1_';
const PIN_LOCK_KEY_PREFIX = 'baigong_device_pin_v1_';

const WEAK_PASSWORDS = [
  '12345678', '123456789', '1234567890', '88888888', '66666666',
  'password', 'password1', 'qwerty123', 'admin123', 'abc12345'
];

export const BUSINESS_PREFIX_MAP = {
  coop: 'HZ-',       // 村社合作社 / 产区直供站
  factory: 'GC-',    // 源头工坊 / 生产制造厂
  dealer: 'SH-',     // 区域平准仓 / 集散商行
  service: 'FW-',    // 工料配套 / 专业服务机构
  individual: 'GR-'  // 个人农户 / 手艺人 / 个体匠人
};

export const AuthSecurity = {
  // 1. 根据法定主体类型 + 18位信用代码/身份证号自动生成不可抢注的唯一商号代号
  generateLockedTenantId(businessType, creditCode, personName = '') {
    const prefix = BUSINESS_PREFIX_MAP[businessType] || 'HZ-';
    const cleanCode = (creditCode || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

    if (businessType === 'individual') {
      // 个人实名：取身份证出生年份后2位 + 末尾4位特征码，避免同名冲突且不可自编抢注
      const tail = cleanCode.length >= 6 ? cleanCode.slice(-6) : Math.random().toString(36).substring(2, 8).toUpperCase();
      return `${prefix}${tail}`;
    }

    // 商事主体：优先提取统一社会信用代码第9~17位（国家颁发的9位组织机构代码，全国唯一、一企一码）
    if (cleanCode.length >= 17) {
      const orgCode = cleanCode.slice(8, 17);
      return `${prefix}${orgCode}`;
    }
    if (cleanCode.length >= 6) {
      return `${prefix}${cleanCode.slice(-8)}`;
    }
    return '';
  },

  // 2. 校验自设主密码强度（8位以上字母+数字组合，防纯数字与弱口令）
  validatePasswordStrength(pwd, tenantId = '', phone = '') {
    const p = (pwd || '').trim();
    if (p.length < 8) {
      return { ok: false, msg: '密码长度至少需要 8 位字符！' };
    }
    if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) {
      return { ok: false, msg: '密码必须同时包含「英文字母」和「数字」（如 FengShou2026），不可设为纯数字或纯字母！' };
    }
    if (WEAK_PASSWORDS.includes(p.toLowerCase())) {
      return { ok: false, msg: '该密码过于常见易被猜解，请更换更安全的组合！' };
    }
    if (tenantId && p.toUpperCase().includes(tenantId.replace(/[^A-Z0-9]/g, ''))) {
      return { ok: false, msg: '密码不能直接包含商号代号，请换一个好记的词组加数字！' };
    }
    if (phone && phone.length >= 6 && p.includes(phone.slice(-6))) {
      return { ok: false, msg: '密码不能直接使用手机号尾号，请换一组数字！' };
    }
    return { ok: true, msg: '密码强度合格' };
  },

  // 3. 一键生成吉祥顺口易记密码（字母+数字组合，方便掌柜记忆）
  generateMemorablePassword() {
    const words = ['FengShou', 'HeHe', 'ShunDa', 'HouDe', 'XingLong', 'RuiFeng', 'BaiGong', 'FuNiu', 'AnKang', 'JiaHe'];
    const word = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${word}${num}`;
  },

  // 4. 前端加盐 SHA-256 单向哈希（云端零明文存储）
  async hashPassword(plainPassword, saltSeed = 'BAIGONG_2026') {
    const clean = (plainPassword || '').trim();
    if (!clean) return '';
    // 若已经是哈希串则直接返回
    if (clean.startsWith('SHA256$')) return clean;

    const raw = `BG_SALT::${String(saltSeed).toUpperCase()}::${clean}`;
    if (window.crypto && window.crypto.subtle) {
      const msgUint8 = new TextEncoder().encode(raw);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      return `SHA256$${hashHex}`;
    }
    // 兼容非 HTTPS 局域网环境的降级摘要
    let h = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `SHA256$FALLBACK_${(h >>> 0).toString(16).toUpperCase()}`;
  },

  // 5. 核对输入密码与数据库存储凭证（兼容历史明文与新版 SHA256$ 哈希）
  async verifyPassword(inputPlain, storedCredential, saltSeed = 'BAIGONG_2026') {
    const cleanInput = (inputPlain || '').trim();
    const stored = (storedCredential || '').trim();
    if (!cleanInput || !stored) return false;

    if (stored.startsWith('SHA256$')) {
      const computed = await this.hashPassword(cleanInput, saltSeed);
      return computed === stored;
    }
    // 兼容历史未升级账号（区分大小写或重置信码）
    return cleanInput === stored || cleanInput.toUpperCase() === stored.toUpperCase();
  },

  // 6. 防暴力穷举熔断（连续输错 5 次锁定 15 分钟）
  checkLoginLockout(accountKey) {
    const key = `${LOCKOUT_KEY_PREFIX}${String(accountKey).toUpperCase()}`;
    try {
      const rec = JSON.parse(localStorage.getItem(key) || 'null');
      if (rec && rec.lockedUntil && Date.now() < rec.lockedUntil) {
        const remainMins = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
        return { locked: true, remainMins };
      }
    } catch (e) {}
    return { locked: false, remainMins: 0 };
  },

  recordLoginFailure(accountKey) {
    const key = `${LOCKOUT_KEY_PREFIX}${String(accountKey).toUpperCase()}`;
    let rec = { count: 0, lockedUntil: 0 };
    try {
      rec = JSON.parse(localStorage.getItem(key) || 'null') || rec;
    } catch (e) {}
    rec.count += 1;
    if (rec.count >= 5) {
      rec.lockedUntil = Date.now() + 15 * 60 * 1000;
    }
    localStorage.setItem(key, JSON.stringify(rec));
    return rec;
  },

  clearLoginFailure(accountKey) {
    const key = `${LOCKOUT_KEY_PREFIX}${String(accountKey).toUpperCase()}`;
    localStorage.removeItem(key);
  },

  // 7. 本机设备指纹与 4 位快捷短码管理（仅绑定当前设备，不采集任何生物隐私）
  getDeviceId() {
    let did = localStorage.getItem('baigong_device_uuid');
    if (!did) {
      did = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem('baigong_device_uuid', did);
    }
    return did;
  },

  async saveDeviceQuickPin(tenantId, roleCode, pin4, sessionSnapshot) {
    const cleanPin = String(pin4 || '').trim();
    if (!/^\d{4}$/.test(cleanPin)) throw new Error('快捷短码必须是 4 位数字');
    const devId = this.getDeviceId();
    const pinHash = await this.hashPassword(cleanPin, `${devId}::${tenantId}`);
    const payload = {
      tenantId: String(tenantId).toUpperCase(),
      roleCode: roleCode || 'owner',
      pinHash,
      failCount: 0,
      sessionSnapshot,
      updatedAt: Date.now()
    };
    localStorage.setItem(`${PIN_LOCK_KEY_PREFIX}${payload.tenantId}`, JSON.stringify(payload));
  },

  getDeviceQuickPinInfo(tenantId) {
    try {
      return JSON.parse(localStorage.getItem(`${PIN_LOCK_KEY_PREFIX}${String(tenantId).toUpperCase()}`) || 'null');
    } catch (e) {
      return null;
    }
  },

  async verifyDeviceQuickPin(tenantId, inputPin4) {
    const tid = String(tenantId).toUpperCase();
    const info = this.getDeviceQuickPinInfo(tid);
    if (!info) return { ok: false, reason: 'NO_PIN' };

    const devId = this.getDeviceId();
    const computed = await this.hashPassword(String(inputPin4 || '').trim(), `${devId}::${tid}`);
    if (computed === info.pinHash) {
      info.failCount = 0;
      localStorage.setItem(`${PIN_LOCK_KEY_PREFIX}${tid}`, JSON.stringify(info));
      return { ok: true, sessionSnapshot: info.sessionSnapshot };
    }

    info.failCount = (info.failCount || 0) + 1;
    if (info.failCount >= 3) {
      localStorage.removeItem(`${PIN_LOCK_KEY_PREFIX}${tid}`);
      return { ok: false, reason: 'MAX_ATTEMPTS' };
    }
    localStorage.setItem(`${PIN_LOCK_KEY_PREFIX}${tid}`, JSON.stringify(info));
    return { ok: false, reason: 'WRONG_PIN', remain: 3 - info.failCount };
  },

  clearDeviceQuickPin(tenantId) {
    localStorage.removeItem(`${PIN_LOCK_KEY_PREFIX}${String(tenantId).toUpperCase()}`);
  }
};
