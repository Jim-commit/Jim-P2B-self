/**
 * 商道相通 · 门店本地主权保险箱与百业动态策略内核 (storeLocalVault.js)
 * 职责：
 * 1. 百工百业动态词典 (lexicon) 与全参数化配置驱动（零硬编码）
 * 2. Local-First 毫秒优先 + 多选并行存储（本地主库 + 加密云镜像 + 微信一键快照 + 私有WebDAV）
 * 3. Append-Only 增量事件去重 + 字段级 LWW 合并 + 云端快照拉取还原
 * 4. 多店隔离、细粒度逐项权限微调、安全码锁屏与手机尾号自救
 */
(function (global) {
  'use strict';

  const VAULT_META_KEY = 'sdxt_vault_meta_v4';
  const IDB_NAME = 'sdxt_store_vault_db';
  const IDB_STORE = 'vault_snapshots';

  // 百工百业预设词典模板（用户可一键切换，亦可逐字自由修改任何标签）
  const INDUSTRY_LEXICONS = {
    general: { label: '综合百货 / 便利店', itemLabel: '商品', unitDefault: '件', weighUnit: '斤', packUnit: '箱', locLabel: '货架位', customerLabel: '熟客', defaultCategory: '常规品类' },
    fresh: { label: '生鲜果蔬 / 肉禽水产', itemLabel: '菜品/果品', unitDefault: '斤', weighUnit: '斤', packUnit: '筐', locLabel: '冷柜/摊位', customerLabel: '街坊', defaultCategory: '时令生鲜' },
    hardware: { label: '五金机电 / 建材水暖', itemLabel: '物料/配件', unitDefault: '个', weighUnit: '公斤', packUnit: '盒', locLabel: '仓位/货格', customerLabel: '师傅/工队', defaultCategory: '五金配件' },
    agri: { label: '农资农具 / 化肥种子', itemLabel: '农资品', unitDefault: '袋', weighUnit: '公斤', packUnit: '件', locLabel: '库区', customerLabel: '农户', defaultCategory: '农资耗材' },
    bakery: { label: '餐饮烘焙 / 茶饮零食', itemLabel: '餐品/原料', unitDefault: '份', weighUnit: '克', packUnit: '箱', locLabel: '档口', customerLabel: '食客', defaultCategory: '现制招牌' },
    station: { label: '社区驿站 / 水站综合', itemLabel: '服务/商品', unitDefault: '桶', weighUnit: '斤', packUnit: '提', locLabel: '存放区', customerLabel: '住户', defaultCategory: '便民商品' }
  };

  const DEFAULT_POLICY = {
    lexicon: { ...INDUSTRY_LEXICONS.general },
    pricing: {
      defaultMarkupPct: 0,
      categoryMarkupPct: {},
      roundingMode: 'none',       // 'none' | 'jiao' | 'yuan'
      currencySymbol: '¥'
    },
    hardware: {
      hasStandalonePos: false,
      weighBarcodePrefixes: ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29'],
      weighBarcodeLength: 13,
      pluStart: 2,
      pluLength: 5,
      valueStart: 7,
      valueLength: 5,
      valueMode: 'amount',
      valueDivisor: 100
    },
    posSafety: {
      largeAmountAlert: 500,
      undoWindowSec: 60,
      voiceBroadcast: false,
      drawerFloatDefault: 300,
      receiptHeader: '',
      receiptFooter: '谢谢惠顾，欢迎下次光临！'
    },
    inventory: {
      lowStockThreshold: 5,
      expiryAlertDays: 15,
      stagnantDays: 60
    },
    loyaltyBlocks: {
      memberPriceAndDay: { enabled: false, memberDaysOfWeek: [], memberDaysOfMonth: [], memberDayDiscountPct: 95 },
      fullReductionAndGift: { enabled: false, rules: [] }, // [{ minAmount: 50, minusAmount: 3, giftName: '' }]
      stampReward: { enabled: false, amountPerStar: 10, starsToRedeem: 10, rewardDesc: '兑换指定好礼1份' },
      storedValueCard: { enabled: false, topupTiers: [] },
      punchAndSubscription: { enabled: false },
      referralAndDeposit: { enabled: false, referralBonus: 5 }
    },
    storageChannels: {
      localPrimary: true,
      encryptedCloud: { enabled: false, endpoint: '', tenantToken: '', lastSyncAt: 0 },
      wechatQuickShare: { enabled: true, remindEveryTx: 20 },
      webdav: { enabled: false, url: '', username: '', passwordEnc: '', lastSyncAt: 0 }
    },
    planConfig: {
      tier: 'free',
      maxFreeStores: 1,
      referralUnlockTarget: 2,
      unlockedByReferrals: 0,
      expiresAt: 0
    }
  };

  const ROLE_PRESETS = {
    clerk: {
      label: '店员',
      perms: { pos: true, creditBook: true, viewPrice: true, poster: true, stockAlert: true, orderSupply: false, refund: false, expense: false, viewCost: false, editPrice: false, transfer: false, exportVault: false, manageStaff: false }
    },
    manager: {
      label: '店长',
      perms: { pos: true, creditBook: true, viewPrice: true, poster: true, stockAlert: true, orderSupply: true, refund: true, expense: true, viewCost: false, editPrice: false, transfer: false, exportVault: false, manageStaff: false }
    },
    boss: {
      label: '老板',
      perms: { pos: true, creditBook: true, viewPrice: true, poster: true, stockAlert: true, orderSupply: true, refund: true, expense: true, viewCost: true, editPrice: true, transfer: true, exportVault: true, manageStaff: true }
    }
  };

  const PERM_LABELS = {
    pos: '前台收银',
    creditBook: '熟客挂账/核销',
    poster: '拓客海报/传单',
    orderSupply: '向上游订货',
    refund: '顾客退货退款',
    expense: '记门店杂费',
    viewCost: '看进货底价与毛利',
    editPrice: '新增/改价/盘点',
    transfer: '分店间库存调拨',
    exportVault: '导出备份与改策略',
    manageStaff: '管理成员与权限'
  };

  const deepMerge = (base, override) => {
    if (!override || typeof override !== 'object') return JSON.parse(JSON.stringify(base));
    const out = Array.isArray(base) ? [...base] : { ...base };
    Object.keys(override).forEach((k) => {
      if (override[k] && typeof override[k] === 'object' && !Array.isArray(override[k]) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = deepMerge(base[k], override[k]);
      } else {
        out[k] = override[k];
      }
    });
    return out;
  };

  const StoreLocalVault = {
    deviceId: '',
    meta: null,
    activeStoreData: null,
    unlockedUntil: 0,
    listeners: new Set(),

    async init() {
      this.deviceId = this.ensureDeviceId();
      this.requestPersistentStorage();
      this.loadMeta();
      await this.loadStore(this.meta.activeStoreId);
      this.bindSessionGuard();
      return this;
    },

    ensureDeviceId() {
      let id = localStorage.getItem('sdxt_device_id');
      if (!id) {
        id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
        localStorage.setItem('sdxt_device_id', id);
      }
      return id;
    },

    async requestPersistentStorage() {
      try {
        if (navigator.storage && navigator.storage.persist) {
          await navigator.storage.persist();
        }
      } catch (_) {}
    },

    loadMeta() {
      try {
        const raw = localStorage.getItem(VAULT_META_KEY);
        if (raw) this.meta = JSON.parse(raw);
      } catch (_) {}
      if (!this.meta || !Array.isArray(this.meta.stores) || !this.meta.stores.length) {
        const defaultStoreId = 'store_main_1';
        this.meta = {
          activeStoreId: defaultStoreId,
          sessionEpoch: 1,
          pinHash: '',
          pinLength: 4,
          recoveryPhoneTail: '',
          activeStaffId: 'staff_boss',
          stores: [{ id: defaultStoreId, name: '我的门店', createdAt: Date.now() }],
          staff: [
            { id: 'staff_boss', name: '掌柜(本人)', role: 'boss', perms: { ...ROLE_PRESETS.boss.perms }, active: true }
          ],
          policy: deepMerge(DEFAULT_POLICY, {})
        };
        this.saveMeta();
      } else {
        this.meta.policy = deepMerge(DEFAULT_POLICY, this.meta.policy);
      }
    },

    saveMeta() {
      localStorage.setItem(VAULT_META_KEY, JSON.stringify(this.meta));
      this.notify('meta');
    },

    getPolicy() {
      return this.meta.policy;
    },

    getLexicon() {
      return this.meta.policy.lexicon || INDUSTRY_LEXICONS.general;
    },

    applyIndustryLexicon(industryKey) {
      const preset = INDUSTRY_LEXICONS[industryKey];
      if (!preset) return;
      this.updatePolicy({ lexicon: { ...preset } });
    },

    updatePolicy(patch) {
      this.meta.policy = deepMerge(this.meta.policy, patch);
      this.saveMeta();
      this.queueSync('policy');
    },

    createEmptyStoreBucket(storeId, storeName) {
      return {
        storeId,
        storeName,
        updatedAt: Date.now(),
        catalog: {},
        members: {},
        txEvents: [],
        heldOrders: [],
        shiftLogs: [],
        payQrs: { wechat: '', alipay: '' }
      };
    },

    async loadStore(storeId) {
      const target = this.meta.stores.find((s) => s.id === storeId) || this.meta.stores[0];
      this.meta.activeStoreId = target.id;
      const key = `sdxt_store_data_${target.id}`;
      let data = await this.idbGet(key);
      if (!data) {
        try {
          const ls = localStorage.getItem(key);
          if (ls) data = JSON.parse(ls);
        } catch (_) {}
      }
      if (!data) {
        data = this.createEmptyStoreBucket(target.id, target.name);
      }
      this.activeStoreData = data;
      await this.persistStore();
      this.saveMeta();
      this.notify('store-switched');
      return data;
    },

    async persistStore() {
      if (!this.activeStoreData) return;
      this.activeStoreData.updatedAt = Date.now();
      const key = `sdxt_store_data_${this.activeStoreData.storeId}`;
      await this.idbSet(key, this.activeStoreData);
      try {
        const lite = { ...this.activeStoreData, payQrs: { wechat: '', alipay: '' } };
        localStorage.setItem(key, JSON.stringify(lite));
      } catch (_) {}
      this.notify('store-updated');
      this.queueSync('store');
    },

    async appendEvent(evt) {
      const staff = this.getActiveStaff();
      const event = {
        eventId: `${this.deviceId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ts: Date.now(),
        staffId: staff.id,
        staffName: staff.name,
        voided: false,
        ...evt
      };
      this.activeStoreData.txEvents.push(event);
      await this.persistStore();
      this.checkQuickShareReminder();
      return event;
    },

    async addStore(name) {
      const clean = (name || '').trim();
      if (!clean) throw new Error('请输入门店名称');
      const id = 'store_' + Date.now().toString(36);
      this.meta.stores.push({ id, name: clean, createdAt: Date.now() });
      this.saveMeta();
      await this.loadStore(id);
      return id;
    },

    async renameStore(storeId, newName) {
      const s = this.meta.stores.find((item) => item.id === storeId);
      if (!s || !newName.trim()) return;
      s.name = newName.trim();
      if (this.activeStoreData && this.activeStoreData.storeId === storeId) {
        this.activeStoreData.storeName = s.name;
        await this.persistStore();
      }
      this.saveMeta();
    },

    getActiveStaff() {
      return this.meta.staff.find((s) => s.id === this.meta.activeStaffId && s.active) || this.meta.staff[0];
    },

    hasPerm(permKey) {
      const staff = this.getActiveStaff();
      if (!staff) return false;
      if (staff.role === 'boss' && this.meta.pinHash && !this.isBossUnlocked()) {
        const protectedPerms = ['viewCost', 'editPrice', 'transfer', 'exportVault', 'manageStaff'];
        if (protectedPerms.includes(permKey)) return false;
      }
      return Boolean(staff.perms && staff.perms[permKey]);
    },

    switchStaff(staffId) {
      const target = this.meta.staff.find((s) => s.id === staffId && s.active);
      if (!target) return false;
      this.meta.activeStaffId = target.id;
      if (target.role !== 'boss') this.unlockedUntil = 0;
      this.saveMeta();
      return true;
    },

    upsertStaff({ id, name, role, customPerms }) {
      const preset = ROLE_PRESETS[role] || ROLE_PRESETS.clerk;
      const perms = customPerms ? { ...preset.perms, ...customPerms } : { ...preset.perms };
      if (id) {
        const idx = this.meta.staff.findIndex((s) => s.id === id);
        if (idx >= 0) {
          this.meta.staff[idx] = { ...this.meta.staff[idx], name: name || this.meta.staff[idx].name, role: role || this.meta.staff[idx].role, perms };
        }
      } else {
        this.meta.staff.push({
          id: 'staff_' + Date.now().toString(36),
          name: name.trim(),
          role,
          perms,
          active: true
        });
      }
      this.saveMeta();
    },

    removeStaff(staffId) {
      if (staffId === 'staff_boss') return false;
      const target = this.meta.staff.find((s) => s.id === staffId);
      if (!target) return false;
      target.active = false;
      this.meta.sessionEpoch = (this.meta.sessionEpoch || 1) + 1;
      localStorage.setItem('sdxt_local_epoch', String(this.meta.sessionEpoch));
      if (this.meta.activeStaffId === staffId) {
        this.meta.activeStaffId = 'staff_boss';
        this.unlockedUntil = 0;
      }
      this.saveMeta();
      return true;
    },

    bindSessionGuard() {
      const localEpoch = Number(localStorage.getItem('sdxt_local_epoch') || 0);
      if (localEpoch && localEpoch < (this.meta.sessionEpoch || 1)) {
        this.unlockedUntil = 0;
        this.meta.activeStaffId = this.meta.staff.find((s) => s.role === 'clerk' && s.active)?.id || 'staff_boss';
      }
      localStorage.setItem('sdxt_local_epoch', String(this.meta.sessionEpoch || 1));
    },

    hashPin(pin) {
      let h = 2166136261;
      const str = 'sdxt_salt_' + String(pin);
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0).toString(16);
    },

    setupPin(pin, recoveryPhoneTail) {
      if (!pin || String(pin).length < 4) throw new Error('安全码至少4位数字');
      this.meta.pinHash = this.hashPin(pin);
      this.meta.pinLength = String(pin).length;
      if (recoveryPhoneTail) this.meta.recoveryPhoneTail = String(recoveryPhoneTail).slice(-4);
      this.unlockedUntil = Date.now() + 30 * 60 * 1000;
      this.saveMeta();
    },

    verifyPin(pin) {
      if (!this.meta.pinHash) {
        this.unlockedUntil = Date.now() + 30 * 60 * 1000;
        return true;
      }
      if (this.hashPin(pin) === this.meta.pinHash) {
        this.unlockedUntil = Date.now() + 30 * 60 * 1000;
        this.notify('auth-changed');
        return true;
      }
      return false;
    },

    resetPinByPhoneTail(phoneTail, newPin) {
      if (!this.meta.recoveryPhoneTail) throw new Error('未设置应急手机尾号');
      if (String(phoneTail).slice(-4) !== this.meta.recoveryPhoneTail) {
        throw new Error('应急手机尾号不匹配');
      }
      this.setupPin(newPin, this.meta.recoveryPhoneTail);
      return true;
    },

    lockBoss() {
      this.unlockedUntil = 0;
      this.notify('auth-changed');
    },

    isBossUnlocked() {
      if (!this.meta.pinHash) return true;
      return Date.now() < this.unlockedUntil;
    },

    // 多选并行存储通道分发
    async queueSync(reason) {
      const channels = this.meta.policy.storageChannels;
      if (channels.encryptedCloud?.enabled && channels.encryptedCloud.endpoint) {
        this.pushEncryptedCloudMirror().catch(() => {});
      }
      if (channels.webdav?.enabled && channels.webdav.url) {
        this.pushWebDavBackup().catch(() => {});
      }
    },

    encryptPayload(plainObj, secretKey) {
      const raw = unescape(encodeURIComponent(JSON.stringify(plainObj)));
      const key = String(secretKey || this.meta.pinHash || this.deviceId);
      let out = '';
      for (let i = 0; i < raw.length; i++) {
        out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return btoa(out);
    },

    decryptPayload(cipherB64, secretKey) {
      const raw = atob(cipherB64);
      const key = String(secretKey || this.meta.pinHash || this.deviceId);
      let out = '';
      for (let i = 0; i < raw.length; i++) {
        out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return JSON.parse(decodeURIComponent(escape(out)));
    },

    async pushEncryptedCloudMirror() {
      const cfg = this.meta.policy.storageChannels.encryptedCloud;
      const bundle = await this.buildFullBackupBundle();
      const cipher = this.encryptPayload(bundle);
      await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.tenantToken || ''}` },
        body: JSON.stringify({ deviceId: this.deviceId, cipher, updatedAt: Date.now() })
      });
      cfg.lastSyncAt = Date.now();
      this.saveMeta();
    },

    async pullEncryptedCloudMirror(secretPin) {
      const cfg = this.meta.policy.storageChannels.encryptedCloud;
      if (!cfg?.endpoint) throw new Error('未配置云端镜像地址');
      const res = await fetch(cfg.endpoint, {
        headers: { Authorization: `Bearer ${cfg.tenantToken || ''}` }
      });
      const json = await res.json();
      if (!json || !json.cipher) throw new Error('云端暂无加密快照');
      const bundle = this.decryptPayload(json.cipher, secretPin ? this.hashPin(secretPin) : undefined);
      await this.importAndMergeBackup(bundle);
      return true;
    },

    async pushWebDavBackup() {
      const cfg = this.meta.policy.storageChannels.webdav;
      const bundle = await this.buildFullBackupBundle();
      const targetUrl = cfg.url.replace(/\/$/, '') + `/sdxt_vault_${this.meta.activeStoreId}.json`;
      const headers = { 'Content-Type': 'application/json' };
      if (cfg.username) {
        headers.Authorization = 'Basic ' + btoa(`${cfg.username}:${cfg.passwordEnc || ''}`);
      }
      await fetch(targetUrl, { method: 'PUT', headers, body: JSON.stringify(bundle) });
      cfg.lastSyncAt = Date.now();
      this.saveMeta();
    },

    checkQuickShareReminder() {
      const cfg = this.meta.policy.storageChannels.wechatQuickShare;
      if (!cfg || !cfg.enabled) return;
      const count = this.activeStoreData.txEvents.length;
      if (count > 0 && count % (cfg.remindEveryTx || 20) === 0) {
        window.dispatchEvent(new CustomEvent('sdxt:suggest-backup', { detail: { txCount: count } }));
      }
    },

    async buildFullBackupBundle() {
      const storesData = {};
      for (const s of this.meta.stores) {
        const key = `sdxt_store_data_${s.id}`;
        storesData[s.id] = (await this.idbGet(key)) || this.createEmptyStoreBucket(s.id, s.name);
      }
      return {
        app: '商道相通门店本地保险箱',
        schemaVersion: 4,
        exportedAt: new Date().toISOString(),
        meta: this.meta,
        storesData
      };
    },

    async exportOrShareJsonBackup(preferShare = true) {
      const bundle = await this.buildFullBackupBundle();
      const jsonStr = JSON.stringify(bundle, null, 2);
      const fileName = `商道相通账本_${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File([jsonStr], fileName, { type: 'application/json' });

      if (preferShare && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: '门店账本备份', text: '发至微信文件传输助手永久防丢' });
          return { mode: 'shared', fileName };
        } catch (_) {}
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { mode: 'downloaded', fileName };
    },

    async importAndMergeBackup(jsonText) {
      const incoming = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
      if (!incoming || !incoming.storesData) throw new Error('无效的账本备份文件');

      if (incoming.meta && Array.isArray(incoming.meta.stores)) {
        incoming.meta.stores.forEach((st) => {
          if (!this.meta.stores.find((localSt) => localSt.id === st.id)) {
            this.meta.stores.push(st);
          }
        });
        if (incoming.meta.policy) {
          this.meta.policy = deepMerge(this.meta.policy, incoming.meta.policy);
        }
      }

      for (const [storeId, incBucket] of Object.entries(incoming.storesData)) {
        const key = `sdxt_store_data_${storeId}`;
        const localBucket = (await this.idbGet(key)) || this.createEmptyStoreBucket(storeId, incBucket.storeName || '导入分店');

        const seenIds = new Set(localBucket.txEvents.map((e) => e.eventId));
        (incBucket.txEvents || []).forEach((evt) => {
          if (!seenIds.has(evt.eventId)) {
            localBucket.txEvents.push(evt);
            seenIds.add(evt.eventId);
          }
        });
        localBucket.txEvents.sort((a, b) => a.ts - b.ts);

        Object.entries(incBucket.catalog || {}).forEach(([itemId, incItem]) => {
          const locItem = localBucket.catalog[itemId];
          if (!locItem) {
            localBucket.catalog[itemId] = incItem;
          } else {
            const merged = { ...locItem };
            const locTs = locItem.fieldTs || {};
            const incTs = incItem.fieldTs || {};
            Object.keys(incItem).forEach((field) => {
              if (field === 'fieldTs') return;
              if ((incTs[field] || incItem.updatedAt || 0) >= (locTs[field] || locItem.updatedAt || 0)) {
                merged[field] = incItem[field];
                locTs[field] = incTs[field] || incItem.updatedAt || Date.now();
              }
            });
            merged.fieldTs = locTs;
            localBucket.catalog[itemId] = merged;
          }
        });

        Object.entries(incBucket.members || {}).forEach(([mId, incM]) => {
          const locM = localBucket.members[mId];
          if (!locM || (incM.updatedAt || 0) >= (locM.updatedAt || 0)) {
            localBucket.members[mId] = incM;
          }
        });

        if (incBucket.payQrs?.wechat && !localBucket.payQrs.wechat) localBucket.payQrs.wechat = incBucket.payQrs.wechat;
        if (incBucket.payQrs?.alipay && !localBucket.payQrs.alipay) localBucket.payQrs.alipay = incBucket.payQrs.alipay;

        await this.idbSet(key, localBucket);
      }

      this.saveMeta();
      await this.loadStore(this.meta.activeStoreId);
      return true;
    },

    exportOfflineHtmlLedger() {
      const d = this.activeStoreData;
      const rows = d.txEvents.slice(-200).reverse().map((e) => `
        <tr>
          <td>${new Date(e.ts).toLocaleString()}</td>
          <td>${e.type}</td>
          <td>¥${Number(e.amount || 0).toFixed(2)}</td>
          <td>${e.payMethod || '-'}</td>
          <td>${e.staffName || '-'}</td>
          <td>${e.note || ''}</td>
        </tr>`).join('');
      const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${d.storeName}-离线账本</title>
        <style>body{font-family:system-ui;padding:16px;color:#1e293b}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#f1f5f9}</style>
        </head><body><h2>📒 ${d.storeName} · 离线可读账本（导出时间：${new Date().toLocaleString()}）</h2>
        <table><thead><tr><th>时间</th><th>类型</th><th>金额</th><th>方式</th><th>经办人</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${d.storeName}_离线账本_${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },

    async getStorageHealth() {
      let usedBytes = 0;
      let quotaBytes = 5 * 1024 * 1024;
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        usedBytes = est.usage || 0;
        quotaBytes = est.quota || quotaBytes;
      }
      const txCount = this.activeStoreData ? this.activeStoreData.txEvents.length : 0;
      const pct = Math.min(100, Math.round((usedBytes / Math.max(1, quotaBytes)) * 100));
      return { usedBytes, quotaBytes, pct, txCount, status: pct > 80 ? '建议归档旧流水' : '健康' };
    },

    async clearDemoDataSafely() {
      await this.exportOrShareJsonBackup(false);
      this.activeStoreData.txEvents = [];
      this.activeStoreData.heldOrders = [];
      this.activeStoreData.shiftLogs = [];
      await this.persistStore();
      return true;
    },

    openIdb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async idbGet(key) {
      try {
        const db = await this.openIdb();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, 'readonly');
          const req = tx.objectStore(IDB_STORE).get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      } catch (_) { return null; }
    },
    async idbSet(key, val) {
      try {
        const db = await this.openIdb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          const req = tx.objectStore(IDB_STORE).put(val, key);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      } catch (_) {}
    },

    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },
    notify(topic) {
      this.listeners.forEach((fn) => {
        try { fn(topic, this); } catch (_) {}
      });
    }
  };

  StoreLocalVault.INDUSTRY_LEXICONS = INDUSTRY_LEXICONS;
  StoreLocalVault.ROLE_PRESETS = ROLE_PRESETS;
  StoreLocalVault.PERM_LABELS = PERM_LABELS;
  StoreLocalVault.DEFAULT_POLICY = DEFAULT_POLICY;
  global.StoreLocalVault = StoreLocalVault;
})(window);
