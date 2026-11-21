/**
 * 百工天街 · 全站安全防线与设备护航核心工具集（全量无损终版）
 */

const DEVICE_FP_KEY = 'bgtj_device_fp_v1';
const LOCKOUT_PREFIX = 'bgtj_login_fail_';
const QUICK_PIN_PREFIX = 'bgtj_palm_pin_';

export const AuthSecurity = {
  // ================= 1. 防爆破、商号防抢注锁定与哈希 =================
  checkLoginLockout(scopeKey) {
    try {
      const raw = localStorage.getItem(LOCKOUT_PREFIX + scopeKey);
      if (!raw) return { locked: false, remainMins: 0 };
      const rec = JSON.parse(raw);
      if (rec.lockedUntil && Date.now() < rec.lockedUntil) {
        const remainMins = Math.max(1, Math.ceil((rec.lockedUntil - Date.now()) / 60000));
        return { locked: true, remainMins };
      }
      return { locked: false, remainMins: 0 };
    } catch {
      return { locked: false, remainMins: 0 };
    }
  },

  recordLoginFailure(scopeKey) {
    try {
      const raw = localStorage.getItem(LOCKOUT_PREFIX + scopeKey);
      const rec = raw ? JSON.parse(raw) : { count: 0, lockedUntil: 0 };
      rec.count = (rec.count || 0) + 1;
      if (rec.count >= 5) {
        rec.lockedUntil = Date.now() + 15 * 60 * 1000;
      }
      localStorage.setItem(LOCKOUT_PREFIX + scopeKey, JSON.stringify(rec));
      return rec;
    } catch {
      return { count: 1 };
    }
  },

  clearLoginFailure(scopeKey) {
    try {
      localStorage.removeItem(LOCKOUT_PREFIX + scopeKey);
    } catch {}
  },

  /**
   * 按入驻主体身份 + 18位信用代码/身份证号自动锁定唯一商号代号（一证一户防抢注）
   */
  generateLockedTenantId(businessType, creditCode, personName = '') {
    const clean = String(creditCode || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (clean.length < 18) return '';
    const prefixMap = {
      coop: 'HZ',
      factory: 'GC',
      dealer: 'SH',
      service: 'FW',
      individual: 'GR'
    };
    const prefix = prefixMap[businessType] || 'HZ';
    if (businessType === 'individual') {
      const seg = `${clean.slice(8, 12)}${clean.slice(14, 18)}`;
      return `${prefix}-${seg}`;
    }
    const orgCode = clean.slice(8, 17);
    return `${prefix}-${orgCode}`;
  },

  async hashPassword(plainPwd, salt = '') {
    const clean = String(plainPwd || '').trim();
    if (!clean) return '';
    if (clean.startsWith('SHA256:')) return clean;
    const data = new TextEncoder().encode(`BGTJ_SALT_${String(salt).toUpperCase()}_${clean}`);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `SHA256:${hex}`;
  },

  async verifyPassword(inputPwd, storedHashOrPlain, salt = '') {
    const input = String(inputPwd || '').trim();
    const stored = String(storedHashOrPlain || '').trim();
    if (!input || !stored) return false;
    if (stored.startsWith('SHA256:')) {
      const hashedInput = await this.hashPassword(input, salt);
      return hashedInput === stored;
    }
    return input === stored;
  },

  /**
   * 一键生成 14 位易读高强度安家主密码（含大小写字母 + 数字 + 特殊符号）
   */
  generateStrongMasterPassword() {
    const prefixes = ['FengShou', 'BaiGong', 'TianJie', 'HeZuoShe', 'JinSui', 'AnJia'];
    const symbols = ['@', '#', '$', '%', '&', '!', '?'];
    const digits = '23456789';
    const buf = new Uint8Array(6);
    crypto.getRandomValues(buf);

    const word = prefixes[buf[0] % prefixes.length];
    const sym1 = symbols[buf[1] % symbols.length];
    const sym2 = symbols[buf[2] % symbols.length];
    const numStr = `${digits[buf[3] % digits.length]}${digits[buf[4] % digits.length]}${digits[buf[5] % digits.length]}`;
    return `${word}${sym1}${numStr}${sym2}Bg`;
  },

  generateMemorablePassword() {
    return this.generateStrongMasterPassword();
  },

  /**
   * 校验大当家主密码强度（12位以上 + 大小写字母 + 数字 + 特殊符号）
   */
  validatePasswordStrength(password, tenantId = '', phone = '') {
    const pwd = String(password || '').trim();
    if (pwd.length < 12) {
      return {
        ok: false,
        valid: false,
        msg: '大当家安家主密码长度不能少于 12 位！',
        message: '大当家安家主密码长度不能少于 12 位！'
      };
    }
    if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd)) {
      return {
        ok: false,
        valid: false,
        msg: '安家主密码必须同时包含大写英文字母和小写英文字母！',
        message: '安家主密码必须同时包含大写英文字母和小写英文字母！'
      };
    }
    if (!/\d/.test(pwd)) {
      return {
        ok: false,
        valid: false,
        msg: '安家主密码必须包含至少 1 位数字！',
        message: '安家主密码必须包含至少 1 位数字！'
      };
    }
    if (!/[^A-Za-z0-9\s]/.test(pwd)) {
      return {
        ok: false,
        valid: false,
        msg: '安家主密码必须包含至少 1 个特殊符号（如 @ # $ % & * ! ? _ -）！',
        message: '安家主密码必须包含至少 1 个特殊符号（如 @ # $ % & * ! ? _ -）！'
      };
    }

    const lower = pwd.toLowerCase();
    const weakList = ['12345678', '87654321', '11111111', '00000000', 'abcd1234', 'qwer1234', 'password'];
    if (weakList.some((w) => lower.includes(w))) {
      return {
        ok: false,
        valid: false,
        msg: '请勿使用过于简单的连续数字或常见弱口令片段！',
        message: '请勿使用过于简单的连续数字或常见弱口令片段！'
      };
    }

    for (const hint of [tenantId, phone]) {
      const cleanHint = String(hint || '').trim().toLowerCase();
      if (cleanHint.length >= 4 && lower.includes(cleanHint)) {
        return {
          ok: false,
          valid: false,
          msg: '安家主密码不能直接包含商号代号或手机号！',
          message: '安家主密码不能直接包含商号代号或手机号！'
        };
      }
    }

    return { ok: true, valid: true, msg: '主密码强度符合 12 位高安全规范', message: '主密码强度符合 12 位高安全规范' };
  },

  // ================= 2. 手机掌中宝本机 4 位快捷短码支持（兼容 3/4 参 + 3 次输错熔断） =================
  getDeviceQuickPinInfo(tenantId) {
    try {
      const raw = localStorage.getItem(QUICK_PIN_PREFIX + String(tenantId || '').toUpperCase());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async saveDeviceQuickPin(tenantId, roleOrPin, pinOrSnapshot, maybeSnapshot) {
    const tid = String(tenantId || '').toUpperCase();
    let roleCode = '';
    let pin4 = '';
    let sessionSnapshot = {};

    if (arguments.length >= 4) {
      roleCode = String(roleOrPin || '');
      pin4 = String(pinOrSnapshot || '').trim();
      sessionSnapshot = maybeSnapshot || {};
    } else {
      pin4 = String(roleOrPin || '').trim();
      sessionSnapshot = pinOrSnapshot || {};
      roleCode = sessionSnapshot.roleCode || '';
    }

    const pinHash = await this.hashPassword(pin4, `PIN_${tid}`);
    const payload = {
      tenantId: tid,
      roleCode,
      pinHash,
      failCount: 0,
      sessionSnapshot,
      updatedAt: Date.now()
    };
    localStorage.setItem(QUICK_PIN_PREFIX + tid, JSON.stringify(payload));
    return payload;
  },

  async setDeviceQuickPin(tenantId, roleOrPin, pinOrSnapshot, maybeSnapshot) {
    return this.saveDeviceQuickPin(tenantId, roleOrPin, pinOrSnapshot, maybeSnapshot);
  },

  async verifyDeviceQuickPin(tenantId, inputPin4) {
    const tid = String(tenantId || '').toUpperCase();
    const info = this.getDeviceQuickPinInfo(tid);
    if (!info || !info.pinHash) return { ok: false, reason: 'NOT_SET' };

    const matched = await this.verifyPassword(String(inputPin4 || '').trim(), info.pinHash, `PIN_${tid}`);
    if (matched) {
      info.failCount = 0;
      localStorage.setItem(QUICK_PIN_PREFIX + tid, JSON.stringify(info));
      return { ok: true, sessionSnapshot: info.sessionSnapshot };
    }

    info.failCount = (info.failCount || 0) + 1;
    if (info.failCount >= 3) {
      this.clearDeviceQuickPin(tid);
      return { ok: false, reason: 'MAX_ATTEMPTS', remain: 0 };
    }
    localStorage.setItem(QUICK_PIN_PREFIX + tid, JSON.stringify(info));
    return { ok: false, reason: 'WRONG_PIN', remain: 3 - info.failCount };
  },

  clearDeviceQuickPin(tenantId) {
    try {
      localStorage.removeItem(QUICK_PIN_PREFIX + String(tenantId || '').toUpperCase());
    } catch {}
  },

  // ================= 3. 设备指纹、脱敏与观察期护盘护栏 =================
  getDeviceFingerprint() {
    let cached = localStorage.getItem(DEVICE_FP_KEY);
    if (!cached) {
      const rnd = new Uint8Array(4);
      crypto.getRandomValues(rnd);
      const hex = Array.from(rnd)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      cached = `DEV-${hex}`;
      localStorage.setItem(DEVICE_FP_KEY, cached);
    }

    const ua = navigator.userAgent || '';
    let os = '桌面设备';
    if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS设备';
    else if (/Android/i.test(ua)) os = '安卓手机';
    else if (/Windows/i.test(ua)) os = 'Windows电脑';
    else if (/Mac OS/i.test(ua)) os = 'Mac电脑';

    let browser = '浏览器';
    if (/MicroMessenger/i.test(ua)) browser = '微信内置';
    else if (/Edg/i.test(ua)) browser = 'Edge';
    else if (/Chrome/i.test(ua)) browser = 'Chrome';
    else if (/Safari/i.test(ua)) browser = 'Safari';

    return {
      deviceId: cached,
      summary: `${os} · ${browser} (${window.screen.width}x${window.screen.height}) · 终端#${cached}`
    };
  },

  maskPhone(phone) {
    const clean = String(phone || '').trim();
    if (clean.length < 7) return clean;
    return `${clean.slice(0, 3)}****${clean.slice(-4)}`;
  },

  isTimelockObservationActive(tenantState) {
    if (!tenantState) return false;
    return tenantState.timelock_status === 'pending' || tenantState.timelock_status === 'ready';
  },

  guardWriteOperation(tenantState, actionCategory = 'high_risk') {
    if (!this.isTimelockObservationActive(tenantState)) {
      return { allowed: true };
    }
    const safeOps = ['order_create', 'order_fulfill', 'driver_collect', 'stock_in_out'];
    if (safeOps.includes(actionCategory)) {
      return { allowed: true, notice: '当前处于安全观察期，本笔一线业务单据将自动标记待复核。' };
    }
    return {
      allowed: false,
      reason: '🛡️ 当前商号正处于「72小时安全找回观察期」，系统已开启账本写保护：一线接单与送货照常运行，但暂禁修改密码、删除档案、调整欠款及修改商品底价。如非本人发起找回，请在顶部横幅核身驳回。'
    };
  },

  // ================= 4. 《商号安家立户凭证卡》Canvas 高清渲染 =================
  renderRegistrationVoucherDataUrl({
    tenantId,
    companyName,
    legalName,
    phone,
    backupPhone,
    accessKeyHint = '（入驻时设定的12位以上高强度安家主密码）',
    recoveryCodes = []
  }) {
    const canvas = document.createElement('canvas');
    const hasCodes = Array.isArray(recoveryCodes) && recoveryCodes.length > 0;
    canvas.width = 900;
    canvas.height = hasCodes ? 1180 : 860;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fbf9f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#8b261d';
    ctx.lineWidth = 8;
    ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
    ctx.strokeStyle = '#c59b48';
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, canvas.width - 84, canvas.height - 84);

    ctx.fillStyle = '#8b261d';
    ctx.font = 'bold 42px "PingFang SC", "Microsoft YaHei", serif';
    ctx.textAlign = 'center';
    ctx.fillText('百工天街 · 商号安家立户凭证卡', canvas.width / 2, 120);

    ctx.fillStyle = '#6b5e51';
    ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('核心资产钥匙 · 请长按保存至手机相册或打印妥善保管', canvas.width / 2, 168);

    ctx.beginPath();
    ctx.moveTo(80, 200);
    ctx.lineTo(canvas.width - 80, 200);
    ctx.strokeStyle = '#d8cbb8';
    ctx.lineWidth = 2;
    ctx.stroke();

    const rows = [
      ['商号全称', companyName || '—'],
      ['商号唯一代号', tenantId || '—'],
      ['法定负责人', legalName || '—'],
      ['登记主手机号', phone || '—'],
      ['紧急备用手机号', backupPhone || '未预留（建议尽快补充）'],
      ['安家主密码提示', accessKeyHint]
    ];

    ctx.textAlign = 'left';
    let y = 265;
    rows.forEach(([label, val]) => {
      ctx.fillStyle = '#7a6c5d';
      ctx.font = '26px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(`${label}：`, 90, y);

      ctx.fillStyle = label === '商号唯一代号' ? '#8b261d' : '#1f1a17';
      ctx.font = label === '商号唯一代号' ? 'bold 34px monospace' : 'bold 28px "PingFang SC", sans-serif';
      ctx.fillText(String(val), 310, y);
      y += 68;
    });

    if (hasCodes) {
      ctx.fillStyle = '#fff5f2';
      ctx.fillRect(80, y + 10, canvas.width - 160, 310);
      ctx.strokeStyle = '#d98a7c';
      ctx.lineWidth = 2;
      ctx.strokeRect(80, y + 10, canvas.width - 160, 310);

      ctx.fillStyle = '#8b261d';
      ctx.font = 'bold 26px "PingFang SC", sans-serif';
      ctx.fillText('🔑 6组保命应急恢复码（每组仅限使用一次，阅后即焚）', 108, y + 58);

      ctx.fillStyle = '#5c4d42';
      ctx.font = '21px "PingFang SC", sans-serif';
      ctx.fillText('手机丢失或验证器损坏时，可凭任意一组恢复码核验大额操作或解绑设备：', 108, y + 96);

      ctx.fillStyle = '#111827';
      ctx.font = 'bold 30px monospace';
      recoveryCodes.slice(0, 6).forEach((code, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const cx = 120 + col * 370;
        const cy = y + 155 + row * 56;
        ctx.fillText(`${idx + 1}. ${code}`, cx, cy);
      });
      y += 340;
    }

    ctx.fillStyle = '#7a6c5d';
    ctx.font = '22px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('※ 严禁将主密码与恢复码交予离职人员或无关第三方；大额操作请开启 TOTP 动态验证器。', canvas.width / 2, canvas.height - 75);

    return canvas.toDataURL('image/png');
  },

  showVoucherPreviewModal(options) {
    const dataUrl = this.renderRegistrationVoucherDataUrl(options);
    const existing = document.getElementById('bgtj-voucher-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'bgtj-voucher-modal';
    modal.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.78);display:flex;align-items:center;justify-content:center;padding:16px;';

    const plainSummary = [
      `【百工天街 · 商号安家立户凭证】`,
      `商号全称：${options.companyName || ''}`,
      `商号代号：${options.tenantId || ''}`,
      `登记主手机：${options.phone || ''}`,
      options.backupPhone ? `紧急备用手机：${options.backupPhone}` : '',
      options.recoveryCodes?.length ? `6组一次性恢复码：\n${options.recoveryCodes.join('\n')}` : ''
    ]
      .filter(Boolean)
      .join('\n');

    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:480px;width:100%;max-height:92vh;overflow-y:auto;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,0.35);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <strong style="font-size:16px;color:#8b261d;">📜 请保存您的《安家立户凭证卡》</strong>
          <button type="button" id="bgtj-voucher-close" style="border:none;background:#f1f5f9;border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:bold;">关闭</button>
        </div>
        <p style="font-size:13px;color:#475569;margin:0 0 12px;line-height:1.5;">
          手机端请<strong>长按下方图片保存到相册</strong>（微信内同样支持），电脑端可点击下方按钮下载或复制文字存档：
        </p>
        <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fbf9f5;margin-bottom:14px;">
          <img src="${dataUrl}" alt="商号安家立户凭证卡" style="width:100%;display:block;" />
        </div>
        <div style="display:flex;gap:10px;">
          <a href="${dataUrl}" download="百工天街凭证卡_${options.tenantId || 'HQ'}.png" style="flex:1;text-align:center;background:#8b261d;color:#fff;text-decoration:none;padding:10px;border-radius:8px;font-size:14px;font-weight:bold;">💾 下载凭证图片</a>
          <button type="button" id="bgtj-voucher-copy" style="flex:1;background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;padding:10px;border-radius:8px;font-size:14px;font-weight:bold;cursor:pointer;">📋 复制文字备份</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#bgtj-voucher-close').onclick = () => modal.remove();
    modal.querySelector('#bgtj-voucher-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(plainSummary);
        alert('凭证文字已复制到剪贴板，请粘贴至微信收藏或备忘录妥善保存！');
      } catch {
        alert('请直接长按上方图片保存至手机相册。');
      }
    };
  }
};

export default AuthSecurity;
