/**
 * ============================================================================
 * 商道相通 · 百工商业全域智慧工作台 —— 共享核心大脑 (storeCoreEngine.js)
 * ============================================================================
 * 顶层使命：人尽其才 · 物尽其用 · 地尽其利 · 货畅其流
 * 1. 100% 无损兼容 index.html 原版结构、src/main.js 与 supabase 云端联动。
 * 2. 铁账四位并立（货、钱、账、单）、链式防篡改哈希、只增不删、红字冲销。
 * 3. 工具为人所用 · 唯老板保留最终核决权（AI与审计规则只出草案，绝不擅自卡死或改账）。
 * 4. 齿轮设置中心支持模块自由显隐（POS收银、邻里互调池、公器共享等均可按需开关）。
 */

export const ENGINE_VERSION = '6.2.0-bridge-harmonized';

export const STORAGE_KEYS = {
  MAIN_STATE: 'shd_store_workbench_v3',
  SNAPSHOTS: 'shd_store_snapshots_v3',
  ARCHIVE_COLD: 'shd_store_cold_archive_v3',
  QUARANTINE: 'shd_store_quarantine_box',
  SHARED_SUPPLIER_OFFERS: ['shd_supplier_offers', 'supplier_catalog', 'mall_supplier_goods', 'suppliers_data'],
  LEGACY_KEYS: ['store_data', 'my_store_v1', 'my_store_v2', 'shop_ledger', 'pos_state']
};

/**
 * 门店可选配功能模块目录（在 ⚙️ 设置中心可自由勾选显隐，关闭即彻底隐身）
 */
export const OPTIONAL_UI_MODULES = [
  { id: 'counter_pos',     name: '柜台随手收银与亮码', pillar: '地尽其利', desc: '已有独立收银机或纯批发模式可关闭此入口' },
  { id: 'local_pool',      name: '同城余缺互调池',     pillar: '物尽其用', desc: '余货挂池调剂 · 同行互助减损' },
  { id: 'community_hub',   name: '邻里公器共享 & 置换', pillar: '物尽其用', desc: '闲置工具借用 · 实物劳务互换' },
  { id: 'demand_plan',     name: '真实用度计划单',     pillar: '货畅其流', desc: '提前报备用量 · 产区按需排产' },
  { id: 'cloud_shelf',     name: '本店云端扩充货架码', pillar: '地尽其利', desc: '零库存代订 · 服务润利归本店' },
  { id: 'marketing_flyer', name: '邻里便民画报定制',   pillar: '地尽其利', desc: '源头好货海报 · 街坊群拼单' }
];

export const PERMISSION_CATALOG = [
  { key: 'viewCostAndProfit',    label: '查看进货底价与真实毛利' },
  { key: 'editRetailPrice',      label: '修改零售价与特批折扣' },
  { key: 'approveAuditAndVoid',  label: '红字冲销与铁面稽核最终核决权' },
  { key: 'managePaymentQr',      label: '更换/锁定店内收款码' },
  { key: 'manageStaffAndExport', label: '管理设置中心、分店与导出加密账本' }
];

export const DEFAULT_ROLES = [
  {
    id: 'role_boss',
    name: '掌柜（最高核决）',
    isSystemBoss: true,
    desc: '拥有全部视野、底价知情权、红字冲销与最终核决拍板权',
    permissions: {
      viewCostAndProfit: true,
      editRetailPrice: true,
      approveAuditAndVoid: true,
      managePaymentQr: true,
      manageStaffAndExport: true
    }
  },
  {
    id: 'role_manager',
    name: '副掌柜 / 店长',
    isSystemBoss: false,
    desc: '协助日常订货、验收、同城互调与店务管理',
    permissions: {
      viewCostAndProfit: false,
      editRetailPrice: true,
      approveAuditAndVoid: false,
      managePaymentQr: false,
      manageStaffAndExport: false
    }
  },
  {
    id: 'role_staff',
    name: '当班店员 / 驿站专员',
    isSystemBoss: false,
    desc: '负责前台收银亮码、街坊自提核销与日常理货，严守底价与总账隔离',
    permissions: {
      viewCostAndProfit: false,
      editRetailPrice: false,
      approveAuditAndVoid: false,
      managePaymentQr: false,
      manageStaffAndExport: false
    }
  }
];

export function roundMoney(num) {
  const n = Number(num) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function generateId(prefix = 'VCH') {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const hms = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ymd}-${hms}-${rnd}`;
}

export function syncChainHash(payloadStr, prevHash = 'GENESIS_0000', salt = 'SHD_IRON_LEDGER') {
  const raw = `${prevHash}|${salt}|${payloadStr}`;
  let h1 = 0xdeadbeef ^ raw.length;
  let h2 = 0x41c6ce57 ^ raw.length;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).toUpperCase().padStart(14, '0');
  return `IRON-${hex}`;
}

export async function sha256Hex(text) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return syncChainHash(text, 'FALLBACK', 'SHA256');
}

export async function encryptEnvelope(plainObj, passphrase) {
  const jsonStr = JSON.stringify(plainObj);
  if (!passphrase || typeof crypto === 'undefined' || !crypto.subtle) {
    return { encrypted: false, payload: plainObj };
  }
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 60000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(jsonStr));
  const toB64 = (u8) => btoa(String.fromCharCode(...u8));
  return {
    encrypted: true,
    alg: 'AES-GCM-256',
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(new Uint8Array(cipherBuf))
  };
}

export async function decryptEnvelope(envelope, passphrase) {
  if (!envelope || !envelope.encrypted) return envelope?.payload || envelope;
  const fromB64 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(envelope.salt), iterations: 60000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(envelope.iv) },
    aesKey,
    fromB64(envelope.ciphertext)
  );
  return JSON.parse(dec.decode(plainBuf));
}

export class StoreCoreEngine {
  constructor(options = {}) {
    this.listeners = new Set();
    this.cloudSyncAdapter = options.cloudSyncAdapter || null;
    this.sandboxMode = false;
    this.sandboxBackupState = null;
    this.privacyShieldActive = false;
    this.state = this._loadOrInitializeState();
  }

  _createDefaultState() {
    const defaultSalt = `SALT_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    return {
      meta: {
        engineVersion: ENGINE_VERSION,
        ledgerSalt: defaultSalt,
        lastChainHash: 'GENESIS_0000',
        lastBackupAt: null,
        lastUpdatedAt: Date.now(),
        elderLargeMode: false,
        enabledUiModules: {
          counter_pos: true,
          local_pool: true,
          community_hub: true,
          demand_plan: true,
          cloud_shelf: true,
          marketing_flyer: true
        }
      },
      rbac: {
        roles: JSON.parse(JSON.stringify(DEFAULT_ROLES)),
        accounts: [
          {
            id: 'ACC_BOSS_01',
            name: '本机掌柜',
            avatar: '👑',
            roleId: 'role_boss',
            pinHash: '',
            active: true
          }
        ],
        activeAccountId: 'ACC_BOSS_01',
        locked: false,
        successionMemo: {
          enabled: false,
          successorName: '',
          handoverNote: ''
        }
      },
      cashBook: {
        currentCash: 0,
        digitalReceivedTotal: 0,
        operatingExpenseTotal: 0,
        familyDrawTotal: 0
      },
      vouchers: [],
      approvalQueue: [],
      customForms: []
    };
  }

  _loadOrInitializeState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MAIN_STATE);
      if (raw) {
        const parsed = JSON.parse(raw);
        const def = this._createDefaultState();
        return {
          ...def,
          ...parsed,
          meta: {
            ...def.meta,
            ...(parsed.meta || {}),
            enabledUiModules: { ...def.meta.enabledUiModules, ...(parsed.meta?.enabledUiModules || {}) }
          },
          rbac: {
            ...def.rbac,
            ...(parsed.rbac || {}),
            successionMemo: { ...def.rbac.successionMemo, ...(parsed.rbac?.successionMemo || {}) }
          },
          cashBook: { ...def.cashBook, ...(parsed.cashBook || {}) }
        };
      }
    } catch (_) {}
    const init = this._createDefaultState();
    this._persist(init, false);
    return init;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify(eventType = 'STATE_CHANGED', detail = {}) {
    this.listeners.forEach(fn => {
      try { fn(this.state, eventType, detail); } catch (e) { console.error(e); }
    });
  }

  _persist(targetState = this.state, emit = true, eventType = 'STATE_CHANGED', detail = {}) {
    targetState.meta.lastUpdatedAt = Date.now();
    if (!this.sandboxMode) {
      localStorage.setItem(STORAGE_KEYS.MAIN_STATE, JSON.stringify(targetState));
      if (this.cloudSyncAdapter) {
        try { this.cloudSyncAdapter(targetState, eventType, detail); } catch (_) {}
      }
    }
    if (emit) this._notify(eventType, detail);
  }

  getCurrentAccount() {
    return this.state.rbac.accounts.find(a => a.id === this.state.rbac.activeAccountId) || this.state.rbac.accounts[0];
  }

  getCurrentRole() {
    const acc = this.getCurrentAccount();
    return this.state.rbac.roles.find(r => r.id === acc?.roleId) || this.state.rbac.roles[0];
  }

  hasPermission(permKey) {
    if (this.state.rbac.locked) return false;
    return Boolean(this.getCurrentRole()?.permissions?.[permKey]);
  }

  isUiModuleEnabled(modId) {
    return this.state.meta.enabledUiModules?.[modId] !== false;
  }

  setUiModuleEnabled(modId, enabled) {
    this.state.meta.enabledUiModules[modId] = Boolean(enabled);
    this._persist(this.state, true, 'UI_MODULE_TOGGLED', { modId, enabled });
  }

  togglePrivacyShield() {
    this.privacyShieldActive = !this.privacyShieldActive;
    this._notify('PRIVACY_CHANGED', { active: this.privacyShieldActive });
    return this.privacyShieldActive;
  }

  async switchAccount(accountId, pin = '') {
    const target = this.state.rbac.accounts.find(a => a.id === accountId && a.active);
    if (!target) return { ok: false, message: '账号不存在' };
    if (target.pinHash) {
      if (!pin) return { ok: false, needPin: true, message: `请输入【${target.name}】的4位口令` };
      const h = await sha256Hex(`${target.id}:${pin}`);
      if (h !== target.pinHash) return { ok: false, needPin: true, message: '口令不匹配' };
    }
    this.state.rbac.activeAccountId = target.id;
    this.state.rbac.locked = false;
    this._persist(this.state, true, 'ACCOUNT_SWITCHED', target);
    return { ok: true, account: target };
  }

  enterSandbox() {
    if (this.sandboxMode) return;
    this.sandboxBackupState = JSON.stringify(this.state);
    this.sandboxMode = true;
    this._notify('SANDBOX_ENTERED');
  }

  exitSandbox() {
    if (!this.sandboxMode) return;
    if (this.sandboxBackupState) {
      this.state = JSON.parse(this.sandboxBackupState);
      this.sandboxBackupState = null;
    }
    this.sandboxMode = false;
    this._notify('SANDBOX_EXITED');
  }

  generateOneTimePasscode(challengeCode) {
    const windowSlot = Math.floor(Date.now() / (5 * 60000));
    const hash = syncChainHash(`${challengeCode}:${windowSlot}`, 'OTP', this.state.meta.ledgerSalt);
    return hash.replace(/\D/g, '').padEnd(4, '8').slice(0, 4);
  }

  /**
   * 铁账四位并立记账（货、钱、账、单严格隔离，家庭支取不混入经营利润）
   */
  commitVoucher(draft) {
    const acc = this.getCurrentAccount();
    const now = Date.now();
    const id = generateId(draft.type || 'VCH');
    const amount = roundMoney(draft.totalAmount || 0);

    const voucher = {
      id,
      type: draft.type,
      ts: now,
      operatorId: acc.id,
      operatorName: acc.name,
      totalAmount: amount,
      payMethod: draft.payMethod || 'DIGITAL',
      note: draft.note || '',
      status: 'POSTED',
      refVoucherId: '',
      prevHash: this.state.meta.lastChainHash,
      hash: ''
    };
    voucher.hash = syncChainHash(`${voucher.id}|${voucher.type}|${voucher.ts}|${voucher.totalAmount}|${voucher.operatorId}`, voucher.prevHash, this.state.meta.ledgerSalt);
    this.state.meta.lastChainHash = voucher.hash;

    if (draft.type === 'SALE') {
      if (draft.payMethod === 'CASH') this.state.cashBook.currentCash = roundMoney(this.state.cashBook.currentCash + amount);
      else if (draft.payMethod === 'DIGITAL') this.state.cashBook.digitalReceivedTotal = roundMoney(this.state.cashBook.digitalReceivedTotal + amount);
    } else if (draft.type === 'FAMILY_DRAW') {
      this.state.cashBook.currentCash = roundMoney(this.state.cashBook.currentCash - amount);
      this.state.cashBook.familyDrawTotal = roundMoney(this.state.cashBook.familyDrawTotal + amount);
    } else if (draft.type === 'EXPENSE') {
      this.state.cashBook.currentCash = roundMoney(this.state.cashBook.currentCash - amount);
      this.state.cashBook.operatingExpenseTotal = roundMoney(this.state.cashBook.operatingExpenseTotal + amount);
    }

    this.state.vouchers.unshift(voucher);
    this._persist(this.state, true, 'VOUCHER_COMMITTED', voucher);
    return { ok: true, voucher };
  }

  voidVoucherWithRedEntry(targetId, reason = '录错更正') {
    if (!this.hasPermission('approveAuditAndVoid')) {
      return { ok: false, message: '红字冲销需掌柜最终核决权限' };
    }
    const orig = this.state.vouchers.find(v => v.id === targetId);
    if (!orig || orig.status === 'VOIDED') return { ok: false, message: '该单据不可重复冲销' };
    orig.status = 'VOIDED';
    const red = {
      ...orig,
      id: generateId('RED'),
      type: 'VOID_RED',
      ts: Date.now(),
      totalAmount: roundMoney(-orig.totalAmount),
      note: `红字冲销原单 [${orig.id}]：${reason}`,
      status: 'POSTED',
      refVoucherId: orig.id,
      prevHash: this.state.meta.lastChainHash
    };
    red.hash = syncChainHash(`${red.id}|VOID_RED|${red.ts}|${red.totalAmount}|${red.refVoucherId}`, red.prevHash, this.state.meta.ledgerSalt);
    this.state.meta.lastChainHash = red.hash;

    if (orig.type === 'SALE') {
      if (orig.payMethod === 'CASH') this.state.cashBook.currentCash = roundMoney(this.state.cashBook.currentCash - orig.totalAmount);
      else if (orig.payMethod === 'DIGITAL') this.state.cashBook.digitalReceivedTotal = roundMoney(this.state.cashBook.digitalReceivedTotal - orig.totalAmount);
    } else if (orig.type === 'FAMILY_DRAW') {
      this.state.cashBook.currentCash = roundMoney(this.state.cashBook.currentCash + orig.totalAmount);
      this.state.cashBook.familyDrawTotal = roundMoney(this.state.cashBook.familyDrawTotal - orig.totalAmount);
    }

    this.state.vouchers.unshift(red);
    this._persist(this.state, true, 'VOUCHER_VOIDED', red);
    return { ok: true, message: `已完成红字冲销，原单 [${orig.id}] 已永久留痕` };
  }

  runIronAbacusAudit() {
    const vouchersAsc = [...this.state.vouchers].reverse();
    let prev = 'GENESIS_0000';
    let broken = 0;
    for (const v of vouchersAsc) {
      if (v.prevHash && v.prevHash !== prev && prev !== 'GENESIS_0000') broken++;
      prev = v.hash || prev;
    }
    return {
      passed: broken === 0,
      brokenLinks: broken,
      totalVouchers: this.state.vouchers.length,
      anomalies: broken > 0 ? [`检测到 ${broken} 处凭证哈希断链`] : []
    };
  }

  async exportIronBackup(passphrase = '') {
    const snapshot = JSON.parse(JSON.stringify(this.state));
    const seal = await sha256Hex(`${snapshot.meta.ledgerSalt}|${snapshot.meta.lastChainHash}|${snapshot.vouchers.length}`);
    const pkg = { format: 'SHD_IRON_LEDGER_V3', exportedAt: Date.now(), seal, data: snapshot };
    this.state.meta.lastBackupAt = Date.now();
    this._persist(this.state, false);
    return encryptEnvelope(pkg, passphrase);
  }
}

export default StoreCoreEngine;
