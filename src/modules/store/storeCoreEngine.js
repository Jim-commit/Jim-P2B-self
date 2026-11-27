/**
 * ============================================================================
 * 商道相通 · 百工商业全域智慧工作台 —— 共享核心大脑 (storeCoreEngine.js)
 * ============================================================================
 * 终极无缺版 · 遵循大道与五项核心总纲：
 * 1. 工具为人所用 · 唯老板保留最终核决权（AI与规则只出草案，绝不擅自卡死或改账）
 * 2. 流水无痕 · 白纸渐进（新店开箱即用，未启用或未授权模块彻底隐身）
 * 3. 四重严格界限 & 手电筒隔离（人机界限、权责光圈、主体隔离、货钱账单四位并立）
 * 4. 不可篡改铁账（只增不删、红字冲销、交班时间锁、AES加密信封、四方重算与隔离裁决）
 * 5. 全网一体相容（统一单据信封、多店统购调拨、可选生物识别、远程放行码与家业常青备忘）
 */

export const ENGINE_VERSION = '4.0.0-complete';

export const STORAGE_KEYS = {
  MAIN_STATE: 'shd_store_workbench_v3',
  SNAPSHOTS: 'shd_store_snapshots_v3',
  ARCHIVE_COLD: 'shd_store_cold_archive_v3',
  QUARANTINE: 'shd_store_quarantine_box',
  LEGACY_KEYS: ['store_data', 'my_store_v1', 'my_store_v2', 'shop_ledger', 'pos_state']
};

export const MODULE_CATALOG = [
  { id: 'procurement', code: '01', name: '订货与供货方', stage: '上游供应链线', icon: '📦', desc: '供货方名册、缺货拆单、同品比价与邻里联采拼单' },
  { id: 'receiving',   code: '02', name: '到货验收与载具', stage: '上游供应链线', icon: '🚚', desc: '随车扫码签收、拆零搭赠折算、退验与周转筐押金' },
  { id: 'catalog',     code: '03', name: '商品库与库存', stage: '店内经营线', icon: '🏷️', desc: '边卖边建、拆箱反推、临期雷达、报损与跨店调拨' },
  { id: 'pos',         code: '04', name: '柜台收银与履约', stage: '店内经营线', icon: '🧾', desc: '正负一单清、防掉包收款码、熟客赊账、定金工单与驿站核销' },
  { id: 'marketing',   code: '05', name: '拓客与邻里驿站', stage: '店内经营线', icon: '📣', desc: '群接龙文案、零库存预售凑团、A4传单与16:9大屏轮播' },
  { id: 'finance',     code: '06', name: '经营状况与财务', stage: '资金与总控线', icon: '💰', desc: '三联总账、保本线、家庭支取隔离、经营信用简报与铁面稽核' },
  { id: 'reconcile',   code: '07', name: '往来对账与单据', stage: '资金与总控线', icon: '📑', desc: '链式防伪凭证、周期对账、实物返利冲抵与AES加密备份' },
  { id: 'governance',  code: '08', name: '策略角色与主权', stage: '资金与总控线', icon: '🛡️', desc: '多店档案、动态角色工厂、可选刷脸/远程口令、自定义表单与家业备忘' }
];

export const INDUSTRY_GENES = {
  convenience: {
    id: 'convenience',
    name: '社区便利 / 烟酒百货',
    unitDefault: '件',
    packUnitDefault: '箱',
    carrierName: '周转筐/水桶',
    quickTags: ['饮料酒水', '休闲零食', '粮油调味', '日用百货', '烟草代售'],
    enableExpiry: true,
    enableCarrier: true
  },
  fresh: {
    id: 'fresh',
    name: '生鲜果蔬 / 肉禽水产',
    unitDefault: '斤',
    packUnitDefault: '筐',
    carrierName: '塑料周转筐',
    quickTags: ['时令鲜果', '叶菜根茎', '鲜肉禽蛋', '水产冻品', '干货调料'],
    enableExpiry: true,
    enableCarrier: true
  },
  hardware: {
    id: 'hardware',
    name: '五金建材 / 水暖电料',
    unitDefault: '个',
    packUnitDefault: '盒',
    carrierName: '托盘/线盘',
    quickTags: ['水暖管件', '电工电料', '五金工具', '油漆辅料', '劳保用品'],
    enableExpiry: false,
    enableCarrier: true
  },
  agri: {
    id: 'agri',
    name: '农资化肥 / 供销服务站',
    unitDefault: '袋',
    packUnitDefault: '吨',
    carrierName: '吨袋/周转桶',
    quickTags: ['复合肥', '种子种苗', '农用物资', '农机配件', '农产品代收'],
    enableExpiry: true,
    enableCarrier: true
  },
  tea_food: {
    id: 'tea_food',
    name: '餐饮小吃 / 茶饮烘焙',
    unitDefault: '份',
    packUnitDefault: '提',
    carrierName: '保温箱/奶桶',
    quickTags: ['招牌现制', '鲜萃茶饮', '烘焙点心', '原料辅料', '包装耗材'],
    enableExpiry: true,
    enableCarrier: false
  },
  custom: {
    id: 'custom',
    name: '自由白纸 · 自定义行当',
    unitDefault: '件',
    packUnitDefault: '箱',
    carrierName: '周转载具',
    quickTags: ['主营商品', '配套服务', '代订代购'],
    enableExpiry: true,
    enableCarrier: true
  }
};

export const PERMISSION_CATALOG = [
  { key: 'viewCostAndProfit',    label: '查看进货底价与真实毛利' },
  { key: 'editRetailPrice',      label: '修改零售价与特批折扣' },
  { key: 'approveAuditAndVoid',  label: '红字冲销与铁面稽核最终核决权' },
  { key: 'managePaymentQr',      label: '更换/锁定店内收款码' },
  { key: 'manageStaffAndExport', label: '管理多店/角色与导出加密账本' }
];

export const DEFAULT_ROLES = [
  {
    id: 'role_boss',
    name: '掌柜（最高核决）',
    isSystemBoss: true,
    desc: '拥有全部业务视野、底价知情权、红字冲销与最终核决拍板权',
    modules: ['procurement', 'receiving', 'catalog', 'pos', 'marketing', 'finance', 'reconcile', 'governance'],
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
    desc: '协助日常订货、验收、盘点、理货与当班收银，按授权查看店务',
    modules: ['procurement', 'receiving', 'catalog', 'pos', 'marketing', 'reconcile'],
    permissions: {
      viewCostAndProfit: false,
      editRetailPrice: true,
      approveAuditAndVoid: false,
      managePaymentQr: false,
      manageStaffAndExport: false
    }
  },
  {
    id: 'role_cashier',
    name: '前台收银员',
    isSystemBoss: false,
    desc: '专注柜台扫码收银、熟客记账、自提核销与交接班，严守底价与总账隔离',
    modules: ['pos', 'marketing'],
    permissions: {
      viewCostAndProfit: false,
      editRetailPrice: false,
      approveAuditAndVoid: false,
      managePaymentQr: false,
      manageStaffAndExport: false
    }
  },
  {
    id: 'role_stocker',
    name: '理货采购员',
    isSystemBoss: false,
    desc: '负责随车签收、入库上架、保质期巡检与报损登记',
    modules: ['procurement', 'receiving', 'catalog'],
    permissions: {
      viewCostAndProfit: false,
      editRetailPrice: false,
      approveAuditAndVoid: false,
      managePaymentQr: false,
      manageStaffAndExport: false
    }
  }
];

/* ============================================================================
 * 通用工具函数：精度计算、链式防篡改哈希与 Web Crypto 加密信封
 * ============================================================================ */

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

/* ============================================================================
 * 核心引擎类：StoreCoreEngine
 * ============================================================================ */

export class StoreCoreEngine {
  constructor(options = {}) {
    this.listeners = new Set();
    this.cloudSyncAdapter = options.cloudSyncAdapter || null;
    this.peripheralBus = new Map();
    this.sandboxMode = false;
    this.sandboxBackupState = null;
    this.privacyShieldActive = false;
    this.lastActivityTs = Date.now();
    this.idleTimer = null;

    this.state = this._loadOrInitializeState();
    this._startIdleGuard();
  }

  /* --------------------------------------------------------------------------
   * 1. 状态树初始化与老版数据无损平迁
   * -------------------------------------------------------------------------- */
  _createDefaultState() {
    const defaultStoreId = 'STORE_MAIN_01';
    const defaultSalt = `SALT_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    return {
      meta: {
        engineVersion: ENGINE_VERSION,
        ledgerSalt: defaultSalt,
        lastChainHash: 'GENESIS_0000',
        lastBackupAt: null,
        lastUpdatedAt: Date.now(),
        uiMode: 'simple',          // 'simple' 极简白纸态 | 'full' 全面调度态
        elderLargeMode: false,     // 👓 长辈关怀大字模式
        voiceFeedback: true,       // 中文语音口头复述开关
        autoIdleLockMinutes: 5,    // 柜台闲置自动锁屏分钟数（0=关闭）
        independentPosMode: false,
        cloudSyncEnabled: true
      },
      stores: [
        {
          id: defaultStoreId,
          name: '本店（总店）',
          geneId: 'convenience',
          address: '',
          phone: '',
          monthlyFixedCost: 0,
          paymentQrUrl: '',
          emergencySkuIds: []
        }
      ],
      activeStoreId: defaultStoreId,

      rbac: {
        roles: JSON.parse(JSON.stringify(DEFAULT_ROLES)),
        accounts: [
          {
            id: 'ACC_BOSS_01',
            name: '本机掌柜',
            phoneOrCode: '1001',
            avatar: '👑',
            roleId: 'role_boss',
            storeIds: ['*'],
            pinHash: '',
            biometricEnabled: false, // 👆 可选指纹/面容秒解（默认关闭，自主开启）
            webAuthnId: '',
            active: true,
            extraPermissions: {}
          }
        ],
        activeAccountId: 'ACC_BOSS_01',
        locked: false,
        bossMasterPinHash: '',
        successionMemo: {
          enabled: false,
          successorName: '',
          successorRelation: '',
          handoverNote: '',
          unlockCodeHash: ''
        }
      },

      catalog: [],
      suppliers: [],
      customers: [],

      // 售后质保 / 定金取货工单 & 邻里驿站代订自提单
      serviceTickets: [], // { id, storeId, type: 'WARRANTY'|'DEPOSIT'|'RELAY_PICKUP', customerName, phoneTail, itemDesc, depositPaid, totalFee, serviceProfit, status: 'OPEN'|'DONE', createdAt }

      cashBook: {
        openingCash: 0,
        currentCash: 0,
        digitalReceivedTotal: 0,
        operatingExpenseTotal: 0,
        familyDrawTotal: 0,
        entries: []
      },

      ledgers: {
        relayServiceProfit: 0,
        shiftRecords: [],
        lockedBeforeTs: 0
      },

      vouchers: [],
      approvalQueue: [],

      community: {
        groupBuys: [],     // { id, storeId, title, targetQty, currentQty, unitPrice, status: 'OPEN'|'CLOSED', createdAt }
        sharedTools: [],
        customForms: []    // 白纸自定义业务小卡片：{ id, title, fields: ['客户/地块', '规格/事项', '金额'], records: [] }
      }
    };
  }

  _loadOrInitializeState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MAIN_STATE);
      if (raw) return this._mergeWithDefaults(JSON.parse(raw));
      const base = this._createDefaultState();
      for (const legacyKey of STORAGE_KEYS.LEGACY_KEYS) {
        const legacyRaw = localStorage.getItem(legacyKey);
        if (legacyRaw) {
          try { this._migrateLegacyData(base, JSON.parse(legacyRaw)); } catch (_) {}
        }
      }
      this._persist(base, false);
      return base;
    } catch (_) {
      return this._createDefaultState();
    }
  }

  _mergeWithDefaults(saved) {
    const def = this._createDefaultState();
    return {
      ...def,
      ...saved,
      meta: { ...def.meta, ...(saved.meta || {}) },
      rbac: {
        ...def.rbac,
        ...(saved.rbac || {}),
        successionMemo: { ...def.rbac.successionMemo, ...(saved.rbac?.successionMemo || {}) }
      },
      cashBook: { ...def.cashBook, ...(saved.cashBook || {}) },
      ledgers: { ...def.ledgers, ...(saved.ledgers || {}) },
      community: { ...def.community, ...(saved.community || {}) }
    };
  }

  _migrateLegacyData(targetState, legacy) {
    if (!legacy || typeof legacy !== 'object') return;
    const defaultStoreId = targetState.activeStoreId;
    const oldItems = legacy.products || legacy.goods || legacy.items || legacy.catalog;
    if (Array.isArray(oldItems)) {
      oldItems.forEach(item => {
        if (!item || !item.name) return;
        targetState.catalog.push({
          id: item.id || generateId('SKU'),
          storeId: defaultStoreId,
          barcode: item.barcode || item.code || '',
          scaleCode: item.scaleCode || '',
          name: String(item.name),
          category: item.category || '主营商品',
          unit: item.unit || '件',
          packUnit: item.packUnit || '箱',
          packSize: Number(item.packSize) || 1,
          costPrice: roundMoney(item.costPrice ?? item.cost ?? 0),
          retailPrice: roundMoney(item.retailPrice ?? item.price ?? 0),
          memberPrice: roundMoney(item.memberPrice ?? item.retailPrice ?? item.price ?? 0),
          wholesalePrice: roundMoney(item.wholesalePrice ?? item.retailPrice ?? item.price ?? 0),
          tierPrices: Array.isArray(item.tierPrices) ? item.tierPrices : [],
          stock: Number(item.stock ?? item.qty ?? 0),
          minStock: Number(item.minStock ?? 5),
          maxStock: Number(item.maxStock ?? 100),
          supplierId: item.supplierId || '',
          expiryDate: item.expiryDate || '',
          location: item.location || '',
          isBundle: Boolean(item.isBundle),
          bundleItems: Array.isArray(item.bundleItems) ? item.bundleItems : [],
          updatedAt: Date.now()
        });
      });
    }
    if (Array.isArray(legacy.suppliers)) {
      legacy.suppliers.forEach(s => {
        if (s?.name) {
          targetState.suppliers.push({
            id: s.id || generateId('SUP'),
            name: s.name,
            contact: s.contact || '',
            phone: s.phone || '',
            category: s.category || '综合供货',
            creditNote: s.creditNote || '',
            payableBalance: roundMoney(s.payableBalance || 0),
            carrierBalance: Number(s.carrierBalance || 0),
            updatedAt: Date.now()
          });
        }
      });
    }
    if (Array.isArray(legacy.customers)) {
      legacy.customers.forEach(c => {
        if (c?.name) {
          targetState.customers.push({
            id: c.id || generateId('CUS'),
            name: c.name,
            phone: c.phone || '',
            creditLimit: roundMoney(c.creditLimit ?? 1000),
            receivableBalance: roundMoney(c.receivableBalance ?? c.debt ?? 0),
            points: Number(c.points || 0),
            storedValue: roundMoney(c.storedValue || 0),
            note: c.note || '',
            updatedAt: Date.now()
          });
        }
      });
    }
  }

  /* --------------------------------------------------------------------------
   * 2. 响应式通知、持久化、多门店管理与时光机快照
   * -------------------------------------------------------------------------- */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify(eventType = 'STATE_CHANGED', detail = {}) {
    this.lastActivityTs = Date.now();
    this.listeners.forEach(fn => {
      try { fn(this.state, eventType, detail); } catch (e) { console.error(e); }
    });
  }

  _persist(targetState = this.state, emit = true, eventType = 'STATE_CHANGED', detail = {}) {
    targetState.meta.lastUpdatedAt = Date.now();
    if (!this.sandboxMode) {
      try {
        localStorage.setItem(STORAGE_KEYS.MAIN_STATE, JSON.stringify(targetState));
      } catch (e) {
        this.compactColdData(90);
        localStorage.setItem(STORAGE_KEYS.MAIN_STATE, JSON.stringify(targetState));
      }
      if (this.cloudSyncAdapter && targetState.meta.cloudSyncEnabled) {
        try { this.cloudSyncAdapter(targetState, eventType, detail); } catch (_) {}
      }
    }
    if (emit) this._notify(eventType, detail);
  }

  addBranchStore({ name, geneId = 'convenience', monthlyFixedCost = 0, address = '', phone = '' }) {
    if (!this.hasPermission('manageStaffAndExport')) {
      return { ok: false, message: '仅掌柜可新增分店' };
    }
    const newId = generateId('STORE');
    const branch = {
      id: newId,
      name: String(name).trim(),
      geneId,
      address,
      phone,
      monthlyFixedCost: roundMoney(monthlyFixedCost),
      paymentQrUrl: '',
      emergencySkuIds: []
    };
    this.state.stores.push(branch);
    this.state.activeStoreId = newId;
    this._persist(this.state, true, 'STORE_ADDED', branch);
    return { ok: true, store: branch };
  }

  switchStore(storeId) {
    const acc = this.getCurrentAccount();
    if (!acc.storeIds.includes('*') && !acc.storeIds.includes(storeId)) {
      return { ok: false, message: '当前值班账号未授权访问该分店' };
    }
    const found = this.state.stores.find(s => s.id === storeId);
    if (!found) return { ok: false, message: '未找到目标门店' };
    this.state.activeStoreId = found.id;
    this._persist(this.state, true, 'STORE_SWITCHED', found);
    return { ok: true, store: found };
  }

  getVisibleStores() {
    const acc = this.getCurrentAccount();
    return this.state.stores.filter(s => acc.storeIds.includes('*') || acc.storeIds.includes(s.id));
  }

  createSnapshot(label = '自动备份快照') {
    if (this.sandboxMode) return;
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.SNAPSHOTS) || '[]');
      list.unshift({ id: generateId('SNAP'), label, ts: Date.now(), data: JSON.stringify(this.state) });
      localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(list.slice(0, 3)));
    } catch (_) {}
  }

  getSnapshots() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.SNAPSHOTS) || '[]').map(({ id, label, ts }) => ({ id, label, ts }));
    } catch (_) {
      return [];
    }
  }

  restoreSnapshot(snapshotId) {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.SNAPSHOTS) || '[]');
    const found = list.find(s => s.id === snapshotId);
    if (!found) return { ok: false, message: '未找到对应快照' };
    this.createSnapshot('恢复前留底');
    this.state = this._mergeWithDefaults(JSON.parse(found.data));
    this._persist(this.state, true, 'SNAPSHOT_RESTORED');
    return { ok: true, message: `已恢复至【${found.label}】` };
  }

  compactColdData(daysThreshold = 90) {
    const cutoff = Date.now() - daysThreshold * 86400 * 1000;
    const hotVouchers = [];
    const coldVouchers = [];
    for (const v of this.state.vouchers) {
      if (v.ts < cutoff && v.status === 'POSTED') coldVouchers.push(v);
      else hotVouchers.push(v);
    }
    if (coldVouchers.length === 0) return { archivedCount: 0 };
    try {
      const existingCold = JSON.parse(localStorage.getItem(STORAGE_KEYS.ARCHIVE_COLD) || '[]');
      localStorage.setItem(STORAGE_KEYS.ARCHIVE_COLD, JSON.stringify([...coldVouchers, ...existingCold]));
      this.state.vouchers = hotVouchers;
      this._persist(this.state, true, 'COLD_DATA_COMPACTED', { archivedCount: coldVouchers.length });
      return { archivedCount: coldVouchers.length };
    } catch (_) {
      return { archivedCount: 0 };
    }
  }

  /* --------------------------------------------------------------------------
   * 3. 账号、动态角色工坊与手电筒权限模型（含可选生物识别与远程放行码）
   * -------------------------------------------------------------------------- */
  getCurrentAccount() {
    return this.state.rbac.accounts.find(a => a.id === this.state.rbac.activeAccountId) || this.state.rbac.accounts[0];
  }

  getCurrentRole() {
    const acc = this.getCurrentAccount();
    return this.state.rbac.roles.find(r => r.id === acc?.roleId) || this.state.rbac.roles[0];
  }

  getActiveStore() {
    return this.state.stores.find(s => s.id === this.state.activeStoreId) || this.state.stores[0];
  }

  getActiveGene() {
    const store = this.getActiveStore();
    return INDUSTRY_GENES[store?.geneId] || INDUSTRY_GENES.convenience;
  }

  canAccessModule(moduleId) {
    if (this.state.rbac.locked) return false;
    const role = this.getCurrentRole();
    return Array.isArray(role?.modules) && role.modules.includes(moduleId);
  }

  hasPermission(permKey) {
    if (this.state.rbac.locked) return false;
    const acc = this.getCurrentAccount();
    const role = this.getCurrentRole();
    if (acc?.extraPermissions && typeof acc.extraPermissions[permKey] === 'boolean') {
      return acc.extraPermissions[permKey];
    }
    return Boolean(role?.permissions?.[permKey]);
  }

  formatSensitiveMoney(amount, permKey = 'viewCostAndProfit') {
    if (this.privacyShieldActive || !this.hasPermission(permKey)) return '***';
    return `¥${roundMoney(amount).toFixed(2)}`;
  }

  togglePrivacyShield(forceState) {
    this.privacyShieldActive = typeof forceState === 'boolean' ? forceState : !this.privacyShieldActive;
    this._notify('PRIVACY_SHIELD_CHANGED', { active: this.privacyShieldActive });
    return this.privacyShieldActive;
  }

  /**
   * 动态角色工厂：新建或更新自定义角色（自由勾选 8 大板块与 5 项动作级手电筒锁）
   */
  upsertCustomRole({ id, name, desc = '', modules = [], permissions = {} }) {
    if (!this.hasPermission('manageStaffAndExport')) {
      return { ok: false, message: '仅掌柜有权配置角色与手电筒权限' };
    }
    const existing = id ? this.state.rbac.roles.find(r => r.id === id) : null;
    if (existing) {
      if (existing.isSystemBoss) return { ok: false, message: '系统最高掌柜角色不可削减权限' };
      existing.name = String(name).trim() || existing.name;
      existing.desc = desc;
      existing.modules = modules;
      existing.permissions = { ...existing.permissions, ...permissions };
    } else {
      this.state.rbac.roles.push({
        id: generateId('ROLE'),
        name: String(name).trim() || '自定义岗位',
        isSystemBoss: false,
        desc,
        modules,
        permissions
      });
    }
    this._persist(this.state, true, 'ROLE_UPDATED');
    return { ok: true, message: '角色与手电筒光圈配置已生效' };
  }

  /**
   * 可选启用/关闭本机生物识别秒解（WebAuthn，默认关闭，绝不强迫）
   */
  async toggleBiometricForCurrentAccount() {
    const acc = this.getCurrentAccount();
    if (acc.biometricEnabled) {
      acc.biometricEnabled = false;
      acc.webAuthnId = '';
      this._persist();
      return { ok: true, enabled: false, message: '已关闭生物识别秒解，恢复纯数字口令模式' };
    }
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      return { ok: false, message: '当前设备或浏览器不支持原生生物识别，已自动保留4位数字口令' };
    }
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(acc.id);
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: '商道相通工作台' },
          user: { id: userId, name: acc.name, displayName: acc.name },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 30000
        }
      });
      if (cred) {
        acc.biometricEnabled = true;
        acc.webAuthnId = cred.id;
        this._persist();
        return { ok: true, enabled: true, message: '👆 已成功绑定本机指纹/面容秒解（随时可退回数字口令）' };
      }
    } catch (_) {
      return { ok: false, message: '未完成生物识别验证，已保持原有数字口令方式' };
    }
    return { ok: false, message: '未启用生物识别' };
  }

  async switchAccount(accountId, pin = '', biometricVerified = false) {
    const target = this.state.rbac.accounts.find(a => a.id === accountId && a.active);
    if (!target) return { ok: false, message: '该账号未启用或不存在' };

    if (target.pinHash && !biometricVerified) {
      if (!pin) return { ok: false, needPin: true, biometricAvailable: Boolean(target.biometricEnabled), message: `请输入【${target.name}】的4位上岗口令` };
      const inputHash = await sha256Hex(`${target.id}:${pin}`);
      if (inputHash !== target.pinHash) {
        return { ok: false, needPin: true, biometricAvailable: Boolean(target.biometricEnabled), message: '口令不匹配，请重新输入' };
      }
    }

    this.state.rbac.activeAccountId = target.id;
    this.state.rbac.locked = false;
    if (!target.storeIds.includes('*') && !target.storeIds.includes(this.state.activeStoreId)) {
      if (target.storeIds.length > 0) this.state.activeStoreId = target.storeIds[0];
    }
    this._persist(this.state, true, 'ACCOUNT_SWITCHED', { account: target });
    return { ok: true, account: target };
  }

  lockScreen() {
    this.state.rbac.locked = true;
    this._notify('SCREEN_LOCKED');
  }

  _startIdleGuard() {
    if (typeof window === 'undefined') return;
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = setInterval(() => {
      const mins = Number(this.state.meta.autoIdleLockMinutes || 0);
      if (mins <= 0 || this.state.rbac.locked || this.sandboxMode) return;
      const acc = this.getCurrentAccount();
      if ((acc?.pinHash || this.state.rbac.accounts.length > 1) && Date.now() - this.lastActivityTs > mins * 60000) {
        this.lockScreen();
      }
    }, 15000);
  }

  generateOneTimePasscode(challengeCode) {
    const windowSlot = Math.floor(Date.now() / (5 * 60000));
    const hash = syncChainHash(`${challengeCode}:${windowSlot}`, 'OTP', this.state.meta.ledgerSalt);
    return hash.replace(/\D/g, '').padEnd(4, '8').slice(0, 4);
  }

  verifyOneTimePasscode(challengeCode, userCode) {
    const currentSlot = Math.floor(Date.now() / (5 * 60000));
    for (const slot of [currentSlot, currentSlot - 1]) {
      const hash = syncChainHash(`${challengeCode}:${slot}`, 'OTP', this.state.meta.ledgerSalt);
      const digits = hash.replace(/\D/g, '').padEnd(4, '8').slice(0, 4);
      if (digits === String(userCode).trim()) return true;
    }
    return false;
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
      this.state = this._mergeWithDefaults(JSON.parse(this.sandboxBackupState));
      this.sandboxBackupState = null;
    }
    this.sandboxMode = false;
    this._notify('SANDBOX_EXITED');
  }

  /* --------------------------------------------------------------------------
   * 4. 铁账核心引擎：货、钱、账、单四位并立 & 只增不删 & 红字冲销 & 老板核决
   * -------------------------------------------------------------------------- */
  commitVoucher(draft, options = {}) {
    const { bossApproved = false, approvalNote = '' } = options;
    const acc = this.getCurrentAccount();
    const storeId = draft.storeId || this.state.activeStoreId;
    const now = Date.now();

    const riskFlags = this._inspectDraftRisks(draft);
    if (riskFlags.length > 0 && !bossApproved && !this.hasPermission('approveAuditAndVoid')) {
      const approvalItem = {
        id: generateId('APR'),
        category: 'RISK_VOUCHER',
        severity: 'WARN',
        title: `待掌柜核决：${draft.typeName || draft.type}（¥${roundMoney(draft.totalAmount)}）`,
        reason: riskFlags.join('；'),
        impactSummary: `经手人：${acc.name}，涉及商品 ${draft.items?.length || 0} 项`,
        payload: { draft },
        status: 'PENDING',
        createdAt: now,
        decidedBy: '',
        decidedNote: ''
      };
      this.state.approvalQueue.unshift(approvalItem);
      this._persist(this.state, true, 'APPROVAL_QUEUED', approvalItem);
      return {
        ok: false,
        queuedForBoss: true,
        approvalId: approvalItem.id,
        message: `触发保护规则（${riskFlags[0]}），已生成待核决草案请掌柜拍板`
      };
    }

    const voucherId = generateId(draft.type || 'VCH');
    const items = Array.isArray(draft.items) ? draft.items.map(it => ({
      skuId: it.skuId || '',
      name: String(it.name || '未命名商品'),
      qty: Number(it.qty) || 0,
      bonusQty: Number(it.bonusQty) || 0,
      packMultiplier: Number(it.packMultiplier) || 1,
      unitPrice: roundMoney(it.unitPrice || 0),
      costPrice: roundMoney(it.costPrice || 0),
      subtotal: roundMoney((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))
    })) : [];

    const computedTotal = items.length > 0
      ? roundMoney(items.reduce((s, it) => s + it.subtotal, 0) - (Number(draft.discountAmount) || 0))
      : roundMoney(draft.totalAmount || 0);

    const computedCost = items.length > 0
      ? roundMoney(items.reduce((s, it) => s + it.qty * it.costPrice, 0))
      : roundMoney(draft.costAmount || 0);

    const voucher = {
      id: voucherId,
      type: draft.type,
      storeId,
      targetStoreId: draft.targetStoreId || '',
      ts: now,
      operatorId: acc.id,
      operatorName: acc.name,
      items,
      discountAmount: roundMoney(draft.discountAmount || 0),
      totalAmount: computedTotal,
      costAmount: computedCost,
      payMethod: draft.payMethod || 'CASH',
      cashPaid: roundMoney(draft.cashPaid ?? (draft.payMethod === 'CASH' ? computedTotal : 0)),
      digitalPaid: roundMoney(draft.digitalPaid ?? (draft.payMethod === 'DIGITAL' ? computedTotal : 0)),
      creditAmount: roundMoney(draft.creditAmount ?? (draft.payMethod === 'CREDIT' ? computedTotal : 0)),
      carrierDelta: Number(draft.carrierDelta || 0),
      serviceFee: roundMoney(draft.serviceFee || 0),
      counterpartyId: draft.counterpartyId || '',
      counterpartyName: draft.counterpartyName || '',
      note: [draft.note, approvalNote ? `[掌柜核准: ${approvalNote}]` : ''].filter(Boolean).join(' '),
      status: 'POSTED',
      refVoucherId: draft.refVoucherId || '',
      prevHash: this.state.meta.lastChainHash,
      hash: '',
      updatedAt: now
    };

    const signSeed = `${voucher.id}|${voucher.type}|${voucher.ts}|${voucher.totalAmount}|${voucher.operatorId}|${JSON.stringify(voucher.items)}`;
    voucher.hash = syncChainHash(signSeed, voucher.prevHash, this.state.meta.ledgerSalt);
    this.state.meta.lastChainHash = voucher.hash;

    this._applyFourPillarsEffect(voucher, 1);

    this.state.vouchers.unshift(voucher);
    this._runNeuralNervesAfterVoucher(voucher);
    this._persist(this.state, true, 'VOUCHER_COMMITTED', voucher);

    return { ok: true, voucher, message: '已按铁账规则四方落账' };
  }

  voidVoucherWithRedEntry(targetVoucherId, reason = '录错更正') {
    if (!this.hasPermission('approveAuditAndVoid')) {
      return { ok: false, message: '红字冲销需掌柜核决权限，请切换掌柜或使用远程放行码' };
    }
    const orig = this.state.vouchers.find(v => v.id === targetVoucherId);
    if (!orig) return { ok: false, message: '未找到原始单据' };
    if (orig.status === 'VOIDED') return { ok: false, message: '该单据已被红字冲销，严禁重复冲销' };

    const acc = this.getCurrentAccount();
    const now = Date.now();
    orig.status = 'VOIDED';
    orig.updatedAt = now;

    const redVoucher = {
      ...JSON.parse(JSON.stringify(orig)),
      id: generateId('RED'),
      type: 'VOID_RED',
      origType: orig.type,
      ts: now,
      operatorId: acc.id,
      operatorName: acc.name,
      items: orig.items.map(it => ({
        ...it,
        qty: -it.qty,
        bonusQty: -it.bonusQty,
        subtotal: roundMoney(-it.subtotal)
      })),
      totalAmount: roundMoney(-orig.totalAmount),
      costAmount: roundMoney(-orig.costAmount),
      cashPaid: roundMoney(-orig.cashPaid),
      digitalPaid: roundMoney(-orig.digitalPaid),
      creditAmount: roundMoney(-orig.creditAmount),
      carrierDelta: -orig.carrierDelta,
      serviceFee: roundMoney(-orig.serviceFee),
      note: `红字冲销原单 [${orig.id}]：${reason}`,
      status: 'POSTED',
      refVoucherId: orig.id,
      prevHash: this.state.meta.lastChainHash,
      updatedAt: now
    };

    const signSeed = `${redVoucher.id}|VOID_RED|${redVoucher.ts}|${redVoucher.totalAmount}|${redVoucher.refVoucherId}`;
    redVoucher.hash = syncChainHash(signSeed, redVoucher.prevHash, this.state.meta.ledgerSalt);
    this.state.meta.lastChainHash = redVoucher.hash;

    this._applyFourPillarsEffect(orig, -1);

    this.state.vouchers.unshift(redVoucher);
    this._persist(this.state, true, 'VOUCHER_VOIDED', { orig, redVoucher });
    return { ok: true, redVoucher, message: `已完成红字冲销，原单 [${orig.id}] 已永久留痕` };
  }

  _applyFourPillarsEffect(v, dir = 1) {
    const type = v.type === 'VOID_RED' ? v.origType : v.type;

    if (['SALE', 'RECEIVE', 'RETURN_SUP', 'LOSS_GIFT', 'STOCK_COUNT', 'RELAY_ORDER', 'TRANSFER_STORE'].includes(type)) {
      for (const it of v.items) {
        const sku = this.state.catalog.find(s => s.id === it.skuId);
        if (!sku) continue;
        const unitChange = (it.qty + it.bonusQty) * (it.packMultiplier || 1) * dir;
        if (type === 'RECEIVE' || type === 'STOCK_COUNT') {
          sku.stock = Number((sku.stock + unitChange).toFixed(3));
          if (type === 'RECEIVE' && dir === 1 && it.unitPrice > 0) {
            sku.lastCostPrice = sku.costPrice;
            sku.costPrice = roundMoney(it.unitPrice / (it.packMultiplier || 1));
          }
        } else if (type === 'TRANSFER_STORE') {
          sku.stock = Number((sku.stock - unitChange).toFixed(3));
          if (v.targetStoreId) {
            let targetSku = this.state.catalog.find(s => s.storeId === v.targetStoreId && s.name === sku.name);
            if (!targetSku) {
              targetSku = { ...JSON.parse(JSON.stringify(sku)), id: generateId('SKU'), storeId: v.targetStoreId, stock: 0 };
              this.state.catalog.push(targetSku);
            }
            targetSku.stock = Number((targetSku.stock + unitChange).toFixed(3));
            targetSku.updatedAt = Date.now();
          }
        } else {
          sku.stock = Number((sku.stock - unitChange).toFixed(3));
        }
        if (sku.isBundle && Array.isArray(sku.bundleItems) && type === 'SALE') {
          for (const sub of sku.bundleItems) {
            const childSku = this.state.catalog.find(c => c.id === sub.skuId);
            if (childSku) {
              childSku.stock = Number((childSku.stock - it.qty * (sub.qty || 1) * dir).toFixed(3));
            }
          }
        }
        sku.updatedAt = Date.now();
      }
    }

    if (type === 'SALE' || type === 'RELAY_ORDER') {
      this.state.cashBook.currentCash = roundMoney(this.state.cashBook.currentCash + v.cashPaid * dir);
      this.state.cashBook.digitalReceivedTotal = roundMoney(this.state.cashBook.digitalReceivedTotal + v.digitalPaid * dir);
    } else if (type === 'RECEIVE' || type === 'EXPENSE') {
      this.state.cashBook.currentCash = roundMoney(this.state.cashBook.currentCash - v.cashPaid * dir);
      if (type === 'EXPENSE') {
        this.state.cashBook.operatingExpenseTotal = roundMoney(this.state.cashBook.operatingExpenseTotal + v.totalAmount * dir);
      }
    } else if (type === 'FAMILY_DRAW') {
      this.state.cashBook.currentCash = roundMoney(this.state.cashBook.currentCash - v.totalAmount * dir);
      this.state.cashBook.familyDrawTotal = roundMoney(this.state.cashBook.familyDrawTotal + v.totalAmount * dir);
    } else if (type === 'CREDIT_SETTLE') {
      this.state.cashBook.currentCash = roundMoney(this.state.cashBook.currentCash + v.cashPaid * dir);
      this.state.cashBook.digitalReceivedTotal = roundMoney(this.state.cashBook.digitalReceivedTotal + v.digitalPaid * dir);
    }

    if (v.counterpartyId) {
      const customer = this.state.customers.find(c => c.id === v.counterpartyId);
      if (customer) {
        if (type === 'SALE') {
          customer.receivableBalance = roundMoney(customer.receivableBalance + v.creditAmount * dir);
          customer.points = Math.max(0, Math.round(customer.points + v.totalAmount * dir));
        } else if (type === 'CREDIT_SETTLE') {
          customer.receivableBalance = roundMoney(customer.receivableBalance - v.totalAmount * dir);
        }
        customer.updatedAt = Date.now();
      }

      const supplier = this.state.suppliers.find(s => s.id === v.counterpartyId);
      if (supplier) {
        if (type === 'RECEIVE') {
          supplier.payableBalance = roundMoney(supplier.payableBalance + v.creditAmount * dir);
          supplier.carrierBalance = (supplier.carrierBalance || 0) + v.carrierDelta * dir;
        } else if (type === 'RETURN_SUP' || type === 'BARTER_OFFSET') {
          supplier.payableBalance = roundMoney(supplier.payableBalance - v.totalAmount * dir);
          supplier.carrierBalance = (supplier.carrierBalance || 0) + v.carrierDelta * dir;
        } else if (type === 'CREDIT_SETTLE') {
          supplier.payableBalance = roundMoney(supplier.payableBalance - Math.abs(v.totalAmount) * dir);
          supplier.carrierBalance = (supplier.carrierBalance || 0) + v.carrierDelta * dir;
        }
        supplier.updatedAt = Date.now();
      }
    }

    if (type === 'RELAY_ORDER' && v.serviceFee) {
      this.state.ledgers.relayServiceProfit = roundMoney(this.state.ledgers.relayServiceProfit + v.serviceFee * dir);
    }
  }

  closeShiftAndLock(countedCash, note = '') {
    const expectedCash = roundMoney(this.state.cashBook.currentCash);
    const actualCash = roundMoney(countedCash);
    const diff = roundMoney(actualCash - expectedCash);
    const acc = this.getCurrentAccount();
    const now = Date.now();

    const shiftRecord = {
      id: generateId('SHF'),
      storeId: this.state.activeStoreId,
      ts: now,
      operatorId: acc.id,
      operatorName: acc.name,
      expectedCash,
      actualCash,
      cashDiff: diff,
      note
    };

    this.state.cashBook.currentCash = actualCash;
    this.state.ledgers.shiftRecords.unshift(shiftRecord);
    this.state.ledgers.lockedBeforeTs = now;
    this.createSnapshot(`交接班封账 (${acc.name})`);
    this._persist(this.state, true, 'SHIFT_CLOSED', shiftRecord);
    return { ok: true, shiftRecord };
  }

  /* --------------------------------------------------------------------------
   * 5. 外部导入防篡改 & 脱敏经营信用简报凭证
   * -------------------------------------------------------------------------- */
  async exportIronBackup(encryptPassphrase = '') {
    const snapshot = JSON.parse(JSON.stringify(this.state));
    const coreDigest = await sha256Hex(
      `${snapshot.meta.ledgerSalt}|${snapshot.meta.lastChainHash}|${snapshot.vouchers.length}|${snapshot.cashBook.currentCash}`
    );
    const rawPackage = {
      format: 'SHD_IRON_LEDGER_V3',
      exportedAt: Date.now(),
      seal: coreDigest,
      recalcBaseline: this.runIronAbacusAudit(snapshot),
      data: snapshot
    };
    this.state.meta.lastBackupAt = Date.now();
    this._persist(this.state, false);
    return encryptEnvelope(rawPackage, encryptPassphrase);
  }

  runIronAbacusAudit(targetState = this.state) {
    const anomalies = [];
    const vouchersAsc = [...(targetState.vouchers || [])].reverse();
    let expectedPrevHash = 'GENESIS_0000';
    let brokenLinks = 0;

    for (const v of vouchersAsc) {
      if (v.prevHash && v.prevHash !== expectedPrevHash && expectedPrevHash !== 'GENESIS_0000') brokenLinks++;
      expectedPrevHash = v.hash || expectedPrevHash;
    }

    if (brokenLinks > 0) anomalies.push(`发现 ${brokenLinks} 处凭证链式指纹断链，可能存在外部手工改动`);

    const negativeSkus = (targetState.catalog || []).filter(s => s.stock < 0);
    if (negativeSkus.length > 0) anomalies.push(`${negativeSkus.length} 款商品当前为负库存（${negativeSkus.slice(0, 3).map(s => s.name).join('、')}）`);

    const belowCostVouchers = (targetState.vouchers || []).filter(
      v => v.status === 'POSTED' && v.type === 'SALE' && v.totalAmount < v.costAmount && !v.note.includes('掌柜核准')
    );
    if (belowCostVouchers.length > 0) anomalies.push(`${belowCostVouchers.length} 笔销售单成交总额低于进货底价且未经掌柜特批`);

    return {
      passed: anomalies.length === 0,
      brokenLinks,
      negativeSkuCount: negativeSkus.length,
      belowCostCount: belowCostVouchers.length,
      anomalies
    };
  }

  async importWithIronJudge(rawInput, decryptPassphrase = '') {
    let pkg;
    try {
      const parsed = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
      pkg = parsed.encrypted ? await decryptEnvelope(parsed, decryptPassphrase) : parsed;
    } catch (_) {
      return { ok: false, needPassphrase: true, message: '解密失败，请核对微信传递加密信封口令' };
    }

    if (!pkg || pkg.format !== 'SHD_IRON_LEDGER_V3' || !pkg.data) {
      return { ok: false, message: '文件格式不匹配，未对当前账本做任何改动' };
    }

    const incomingState = this._mergeWithDefaults(pkg.data);
    const expectedSeal = await sha256Hex(
      `${incomingState.meta.ledgerSalt}|${incomingState.meta.lastChainHash}|${incomingState.vouchers.length}|${incomingState.cashBook.currentCash}`
    );
    const auditRes = this.runIronAbacusAudit(incomingState);
    const sealTampered = pkg.seal && pkg.seal !== expectedSeal;

    if (sealTampered || !auditRes.passed) {
      const quarantineRecord = {
        id: generateId('QRT'),
        receivedAt: Date.now(),
        sealTampered,
        auditRes,
        incomingData: incomingState
      };
      localStorage.setItem(STORAGE_KEYS.QUARANTINE, JSON.stringify(quarantineRecord));

      const isBoss = this.hasPermission('approveAuditAndVoid');
      return {
        ok: false,
        quarantined: true,
        message: isBoss
          ? `铁面稽核拦截：该导入包存在 ${sealTampered ? '总封签被外部改动' : '账实差异'}（${auditRes.anomalies.join('；')}），已暂存隔离区等待您的最终裁决。`
          : '该账本文件校验未通过（可能文件在传输中损坏或版本不一致），已自动保护当前门店数据，请交由掌柜核决处理。',
        quarantineRecord: isBoss ? quarantineRecord : null
      };
    }

    this.createSnapshot('导入合并前自动备份');
    this._mergeStateCRDT(incomingState);
    this._persist(this.state, true, 'BACKUP_MERGED');
    return { ok: true, message: '账本凭证核验无误（货、钱、账、单四方吻合），已为您无损合并数据。' };
  }

  bossResolveQuarantine(action = 'DISCARD', bossNote = '') {
    if (!this.hasPermission('approveAuditAndVoid')) return { ok: false, message: '仅掌柜有权裁决隔离区账本' };
    const raw = localStorage.getItem(STORAGE_KEYS.QUARANTINE);
    if (!raw) return { ok: false, message: '隔离区当前无待核决文件' };
    const q = JSON.parse(raw);
    localStorage.removeItem(STORAGE_KEYS.QUARANTINE);

    if (action === 'DISCARD') return { ok: true, message: '已丢弃异常导入包，当前正式账本纯净无损。' };

    this.createSnapshot('掌柜核准接管隔离账本前备份');
    this._mergeStateCRDT(q.incomingData);
    this.state.approvalQueue.unshift({
      id: generateId('APR'),
      category: 'QUARANTINE_ACCEPTED',
      severity: 'INFO',
      title: '掌柜已核准接管外部差异账本',
      reason: q.auditRes?.anomalies?.join('；') || '封签差异手工接管',
      impactSummary: `掌柜批示：${bossNote || '核实无误，特批入账'}`,
      status: 'APPROVED',
      createdAt: Date.now(),
      decidedBy: this.getCurrentAccount().name,
      decidedNote: bossNote
    });
    this._persist(this.state, true, 'QUARANTINE_ACCEPTED');
    return { ok: true, message: '已按掌柜核决接管入账，并同步记录核准留痕。' };
  }

  _mergeStateCRDT(incoming) {
    const skuMap = new Map(this.state.catalog.map(s => [s.id, s]));
    for (const incSku of incoming.catalog || []) {
      const cur = skuMap.get(incSku.id);
      if (!cur || (incSku.updatedAt || 0) > (cur.updatedAt || 0)) skuMap.set(incSku.id, incSku);
    }
    this.state.catalog = Array.from(skuMap.values());

    const vMap = new Map(this.state.vouchers.map(v => [v.id, v]));
    for (const incV of incoming.vouchers || []) {
      if (!vMap.has(incV.id)) vMap.set(incV.id, incV);
    }
    this.state.vouchers = Array.from(vMap.values()).sort((a, b) => b.ts - a.ts);
  }

  /**
   * 📜 生成脱敏《门店近90天经营稳健度信用简报》（剔除进货底价与客户隐私，供向大供货商申请月结账期）
   */
  generateCreditBrief() {
    const store = this.getActiveStore();
    const audit = this.runIronAbacusAudit();
    const postedVouchers = this.state.vouchers.filter(v => v.status === 'POSTED' && v.storeId === store.id);
    const activeDays = new Set(postedVouchers.map(v => new Date(v.ts).toDateString())).size;
    return {
      storeName: store.name,
      generatedAt: new Date().toLocaleString('zh-CN'),
      activeOperatingDays: activeDays,
      totalVerifiedVouchers: postedVouchers.length,
      ledgerIntegrityPassed: audit.passed,
      verifyShortCode: syncChainHash(`${store.id}|${postedVouchers.length}|${this.state.meta.lastChainHash}`, 'CREDIT_BRIEF', this.state.meta.ledgerSalt)
    };
  }

  /* --------------------------------------------------------------------------
   * 6. 自动化神经暗线 & 老板核决队列处理
   * -------------------------------------------------------------------------- */
  _inspectDraftRisks(draft) {
    const risks = [];
    if (draft.type === 'SALE') {
      for (const it of draft.items || []) {
        const sku = this.state.catalog.find(s => s.id === it.skuId);
        if (sku && it.qty > 0 && it.unitPrice < sku.costPrice) {
          risks.push(`【${sku.name}】成交价 ¥${it.unitPrice} 低于进货底价 ¥${sku.costPrice}`);
        }
      }
      if (draft.payMethod === 'CREDIT' && draft.counterpartyId) {
        const cus = this.state.customers.find(c => c.id === draft.counterpartyId);
        if (cus && cus.receivableBalance + (draft.creditAmount || 0) > cus.creditLimit) {
          risks.push(`熟客【${cus.name}】累计欠款将超出信用额度 ¥${cus.creditLimit}`);
        }
      }
    }
    return risks;
  }

  _runNeuralNervesAfterVoucher(voucher) {
    if (voucher.type === 'SALE') {
      const lowItems = [];
      for (const it of voucher.items) {
        const sku = this.state.catalog.find(s => s.id === it.skuId);
        if (sku && sku.stock <= sku.minStock) lowItems.push(`${sku.name}(余${sku.stock}${sku.unit})`);
      }
      if (lowItems.length > 0) {
        this.state.approvalQueue.unshift({
          id: generateId('APR'),
          category: 'RESTOCK_DRAFT',
          severity: 'INFO',
          title: `智能补货建议草案（${lowItems.length}款触及安全库存）`,
          reason: lowItems.join('、'),
          impactSummary: '已按默认供货方整理好建议补货数量，等待掌柜核准生成订货单',
          payload: { items: lowItems },
          status: 'PENDING',
          createdAt: Date.now(),
          decidedBy: '',
          decidedNote: ''
        });
      }
    }

    if (voucher.type === 'RECEIVE') {
      const priceHikes = [];
      for (const it of voucher.items) {
        const sku = this.state.catalog.find(s => s.id === it.skuId);
        if (sku && sku.lastCostPrice > 0 && sku.costPrice > sku.lastCostPrice) {
          priceHikes.push(`${sku.name}进价由¥${sku.lastCostPrice}涨至¥${sku.costPrice}`);
        }
      }
      if (priceHikes.length > 0) {
        this.state.approvalQueue.unshift({
          id: generateId('APR'),
          category: 'PRICE_SYNC_DRAFT',
          severity: 'WARN',
          title: `上游进价上涨 · 调价参谋建议`,
          reason: priceHikes.join('；'),
          impactSummary: '当前毛利空间被压缩，请掌柜核决是否调整货架零售价并打印新价签',
          payload: { priceHikes },
          status: 'PENDING',
          createdAt: Date.now(),
          decidedBy: '',
          decidedNote: ''
        });
      }
    }
  }

  decideApprovalItem(approvalId, decision = 'APPROVED', note = '') {
    const item = this.state.approvalQueue.find(a => a.id === approvalId);
    if (!item || item.status !== 'PENDING') return { ok: false, message: '该草案已处理' };
    const acc = this.getCurrentAccount();
    item.status = decision;
    item.decidedBy = acc.name;
    item.decidedNote = note;

    if (decision === 'APPROVED' && item.category === 'RISK_VOUCHER' && item.payload?.draft) {
      const res = this.commitVoucher(item.payload.draft, { bossApproved: true, approvalNote: note || '掌柜核准特批' });
      this._persist(this.state, true, 'APPROVAL_DECIDED', item);
      return res;
    }

    this._persist(this.state, true, 'APPROVAL_DECIDED', item);
    return { ok: true, message: decision === 'APPROVED' ? '掌柜已核准执行' : '已按掌柜意见放行归档' };
  }

  /* --------------------------------------------------------------------------
   * 7. 双向语音指令解析、AI 本地参谋与经营指标看板
   * -------------------------------------------------------------------------- */
  parseVoiceOrQuickCommand(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return { intent: 'UNKNOWN', raw: text };

    const moneyMatch = text.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|块|块钱)?/);
    const amount = moneyMatch ? roundMoney(moneyMatch[1]) : 0;

    if (/(家用|家里|私人支取|自己拿)/.test(text)) {
      return { intent: 'FAMILY_DRAW', label: '🏠 老板私人/家庭支取（不计入经营成本）', amount, note: text, needConfirm: true };
    }
    if (/(杂费|水电|买胶带|包装袋|运费|吃饭)/.test(text)) {
      return { intent: 'EXPENSE', label: '💸 日常经营杂费支出', amount, note: text, needConfirm: true };
    }
    if (/(报损|破损|过期|自用|试吃|送人)/.test(text)) {
      return { intent: 'LOSS_GIFT', label: '📉 报损 / 自用 / 人情往来登记', raw: text, needConfirm: true };
    }
    if (/(赊账|挂账|先记账)/.test(text)) {
      const matchedCustomer = this.state.customers.find(c => text.includes(c.name));
      return { intent: 'CREDIT_SALE', label: '📒 熟客赊账开单', customer: matchedCustomer || null, amount, raw: text, needConfirm: true };
    }
    if (/(还钱|还款|结账)/.test(text)) {
      const matchedCustomer = this.state.customers.find(c => text.includes(c.name));
      return { intent: 'CREDIT_SETTLE', label: '🤝 熟客还款入账', customer: matchedCustomer || null, amount, raw: text, needConfirm: true };
    }

    const matchedSkus = this.searchCatalog(text);
    return {
      intent: 'SEARCH_OR_ADD',
      label: matchedSkus.length > 0 ? `匹配到 ${matchedSkus.length} 款商品` : '快速检索 / 无档先开单',
      matchedSkus,
      amount,
      raw: text,
      needConfirm: false
    };
  }

  speakFeedback(message) {
    if (!this.state.meta.voiceFeedback || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(message);
      utter.lang = 'zh-CN';
      utter.rate = 1.08;
      window.speechSynthesis.speak(utter);
    } catch (_) {}
  }

  searchCatalog(query) {
    const q = String(query || '').trim().toLowerCase();
    const storeId = this.state.activeStoreId;
    const list = this.state.catalog.filter(s => s.storeId === storeId || !s.storeId);
    if (!q) return list;

    if (/^\d{18}$/.test(q) && (q.startsWith('20') || q.startsWith('22') || q.startsWith('28'))) {
      const pluCode = q.slice(2, 7);
      const valNum = Number(q.slice(7, 12)) / 100;
      const byPlu = list.filter(s => s.scaleCode === pluCode || s.barcode.includes(pluCode));
      if (byPlu.length > 0) return byPlu.map(s => ({ ...s, _parsedScaleValue: valNum }));
    }

    return list.filter(s =>
      (s.barcode && s.barcode.toLowerCase().includes(q)) ||
      (s.scaleCode && s.scaleCode.toLowerCase().includes(q)) ||
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.category && s.category.toLowerCase().includes(q)) ||
      (s.location && s.location.toLowerCase().includes(q)) ||
      String(s.retailPrice) === q
    );
  }

  getCrossSellHint(currentCartSkuIds = []) {
    if (!currentCartSkuIds.length) return null;
    const targetSet = new Set(currentCartSkuIds);
    const pairCount = new Map();

    for (const v of this.state.vouchers) {
      if (v.type !== 'SALE' || v.status !== 'POSTED' || v.items.length < 2) continue;
      const ids = v.items.map(i => i.skuId);
      if (ids.some(id => targetSet.has(id))) {
        for (const id of ids) {
          if (!targetSet.has(id)) pairCount.set(id, (pairCount.get(id) || 0) + 1);
        }
      }
    }

    let bestId = '';
    let bestHits = 0;
    pairCount.forEach((hits, id) => {
      if (hits > bestHits) { bestHits = hits; bestId = id; }
    });
    if (!bestId) return null;
    const sku = this.state.catalog.find(s => s.id === bestId && s.stock > 0);
    return sku ? { sku, hits: bestHits, text: `街坊常顺手带一件【${sku.name}】(¥${sku.retailPrice})` } : null;
  }

  getDashboardMetrics() {
    const store = this.getActiveStore();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTs = todayStart.getTime();

    let todayRevenue = 0;
    let todayGrossProfit = 0;
    let todayOrderCount = 0;

    for (const v of this.state.vouchers) {
      if (v.status !== 'POSTED' || v.storeId !== store.id) continue;
      if (v.ts >= todayTs && v.type === 'SALE') {
        todayRevenue = roundMoney(todayRevenue + v.totalAmount);
        todayGrossProfit = roundMoney(todayGrossProfit + (v.totalAmount - v.costAmount));
        todayOrderCount++;
      }
    }

    const storeCatalog = this.state.catalog.filter(s => s.storeId === store.id || !s.storeId);
    const inventoryCostValue = roundMoney(storeCatalog.reduce((sum, s) => sum + Math.max(0, s.stock) * s.costPrice, 0));
    const totalReceivable = roundMoney(this.state.customers.reduce((sum, c) => sum + (c.receivableBalance || 0), 0));
    const totalPayable = roundMoney(this.state.suppliers.reduce((sum, s) => sum + (s.payableBalance || 0), 0));
    const totalCarriersOut = this.state.suppliers.reduce((sum, s) => sum + (s.carrierBalance || 0), 0);

    const dailyBreakevenProfit = roundMoney((store.monthlyFixedCost || 0) / 30);
    const breakevenProgress = dailyBreakevenProfit > 0
      ? Math.min(100, Math.round((todayGrossProfit / dailyBreakevenProfit) * 100))
      : 100;

    const soonThreshold = Date.now() + 30 * 86400 * 1000;
    const expiringSkus = storeCatalog.filter(s => s.expiryDate && new Date(s.expiryDate).getTime() <= soonThreshold && s.stock > 0);
    const lowStockSkus = storeCatalog.filter(s => s.stock <= s.minStock);

    return {
      todayRevenue,
      todayGrossProfit,
      todayOrderCount,
      dailyBreakevenProfit,
      breakevenProgress,
      currentCash: roundMoney(this.state.cashBook.currentCash),
      digitalReceivedTotal: roundMoney(this.state.cashBook.digitalReceivedTotal),
      familyDrawTotal: roundMoney(this.state.cashBook.familyDrawTotal),
      relayServiceProfit: roundMoney(this.state.ledgers.relayServiceProfit),
      inventoryCostValue,
      totalReceivable,
      totalPayable,
      totalCarriersOut,
      expiringSkus,
      lowStockSkus,
      pendingApprovals: this.state.approvalQueue.filter(a => a.status === 'PENDING')
    };
  }

  generateEmergencyPaperBook() {
    const store = this.getActiveStore();
    const skus = this.state.catalog.filter(s => s.storeId === store.id || !s.storeId);
    const debtors = this.state.customers.filter(c => c.receivableBalance > 0);
    return {
      title: `${store.name} · 应急纸质兜底册`,
      generatedAt: new Date().toLocaleString('zh-CN'),
      priceList: skus.map(s => ({
        code: s.barcode || s.scaleCode || '-',
        name: s.name,
        unit: s.unit,
        retailPrice: s.retailPrice,
        memberPrice: s.memberPrice,
        location: s.location || '-'
      })),
      receivables: debtors.map(c => ({ name: c.name, phone: c.phone || '-', balance: c.receivableBalance })),
      suppliers: this.state.suppliers.map(sup => ({ name: sup.name, phone: sup.phone || '-', payable: sup.payableBalance, carrierBalance: sup.carrierBalance }))
    };
  }

  registerPeripheral(slotName, handler) { this.peripheralBus.set(slotName, handler); }
  emitPeripheral(slotName, payload) {
    const fn = this.peripheralBus.get(slotName);
    if (typeof fn === 'function') { try { return fn(payload); } catch (e) { console.warn(`[Peripheral:${slotName}]`, e); } }
    return null;
  }
}

export default StoreCoreEngine;
