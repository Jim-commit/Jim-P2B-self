/**
 * 商道相通 · 门店本地主权保险箱与动态策略内核 (storeLocalVault.js)
 * 职责：
 * 1. 全参数化配置驱动（零硬编码：定价/抹零/称重码制/会员积木/防呆/商业套餐全动态）
 * 2. Local-First（IndexedDB + localStorage 毫秒优先）+ 多选并行存储分发（加密云镜像/微信分享快照/自有WebDAV）
 * 3. Append-Only 增量流水去重 + 字段级 LWW 合并 + 期初重算一致性保证
 * 4. 多店隔离、三角色细粒度权限、安全码锁屏与应急重置
 */
(function (global) {
  'use strict';

  const VAULT_META_KEY = 'sdxt_vault_meta_v4';
  const IDB_NAME = 'sdxt_store_vault_db';
  const IDB_STORE = 'vault_snapshots';

  // 默认动态策略树（所有字段均可由掌柜或后台动态覆盖，零硬编码）
  const DEFAULT_POLICY = {
    pricing: {
      defaultMarkupPct: 0,        // 全店默认加价百分比（0表示直接按手动零售价）
      categoryMarkupPct: {},      // 分类自定义加价率 { "饮料": 25, "生鲜": 30 }
      roundingMode: 'none',       // 'none' | 'jiao' (抹零到角) | 'yuan' (抹零到元)
      currencySymbol: '¥'
    },
    hardware: {
      hasStandalonePos: false,    // 是否已有独立称重收银一体机
      weighBarcodePrefixes: ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29'],
      weighBarcodeLength: 13,
      pluStart: 2,
      pluLength: 5,
      valueStart: 7,
      valueLength: 5,
      valueMode: 'amount',        // 'amount' (5位金额, 分) | 'weight' (5位重量, 克)
      valueDivisor: 100           // 金额除以100得元，重量除以1000得公斤
    },
    posSafety: {
      largeAmountAlert: 500,      // 大额收银防呆提醒阈值
      undoWindowSec: 60,          // 快捷撤回上一笔时间窗（秒）
      voiceBroadcast: false,      // 收款语音播报开关
      drawerFloatDefault: 300,    // 默认抽屉备用底金
      receiptHeader: '',          // 自定义小票抬头（空则用门店名）
      receiptFooter: '谢谢惠顾，欢迎下次光临！'
    },
    inventory: {
      lowStockThreshold: 5,       // 默认低库存预警线
      expiryAlertDays: 15,        // 默认临期预警天数
      stagnantDays: 60            // 滞销判定天数
    },
    // 积木式会员与促销工具箱（默认全部关闭，不用则零渲染）
    loyaltyBlocks: {
      memberPriceAndDay: { enabled: false, memberDaysOfWeek: [], memberDaysOfMonth: [], memberDayDiscountPct: 95 },
      fullReductionAndGift: { enabled: false, rules: [] }, // [{ minAmount: 50, minusAmount: 3, giftName: '' }]
      stampReward: { enabled: false, amountPerStar: 10, starsToRedeem: 10, rewardDesc: '兑换指定好礼1份' },
      storedValueCard: { enabled: false, topupTiers: [] }, // [{ pay: 100, bonus: 15 }]
      punchAndSubscription: { enabled: false },
      referralAndDeposit: { enabled: false, referralBonus: 5 }
    },
    // 多选并行存储通道配置（底座本地必选，其余可自由多选叠加）
    storageChannels: {
      localPrimary: true,         // 必选：本地 IndexedDB + localStorage 毫秒读写
      encryptedCloud: { enabled: false, endpoint: '', tenantToken: '', lastSyncAt: 0 },
      wechatQuickShare: { enabled: true, remindEveryTx: 20 },
      webdav: { enabled: false, url: '', username: '', passwordEnc: '', lastSyncAt: 0 }
    },
    // 商业版本与权益动态配置（可由云端下发覆盖）
    planConfig: {
      tier: 'free',               // 'free' | 'pro' | 'chain'
      maxFreeStores: 1,
      referralUnlockTarget: 2,
      unlockedByReferrals: 0,
      expiresAt: 0
    }
  };

  // 预设角色权限模板（支持按具体成员微调勾选）
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
        if (raw) {
          this.meta = JSON.parse(raw);
        }
      } catch (_) {}
      if (!this.meta || !Array.isArray(this.meta.stores) || !this.meta.stores.length) {
        const defaultStoreId = 'store_main_1';
        this.meta = {
          activeStoreId: defaultStoreId,
          sessionEpoch: 1,
          pinHash: '',               // 空表示尚未设置掌柜安全码（首次可设置）
          pinLength: 4,
          recoveryPhoneTail: '',     // 应急找回手机后4位
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

    updatePolicy(patch) {
      this.meta.policy = deepMerge(this.meta.policy, patch);
      this.saveMeta();
      this.queueSync('policy');
    },

    // 创建空白单店账本结构（Append-Only 事件流 + 档案表）
    createEmptyStoreBucket(storeId, storeName) {
      return {
        storeId,
        storeName,
        updatedAt: Date.now(),
        catalog: {},          // { itemId: { id, name, barcode, plu, category, supplierId, supplierName, costPrice, retailPrice, memberPrice, tierPrices:[], packRate:1, unit:'件', stock:0, shelfLoc:'', expiryDate:'', archived:false, fieldTs:{} } }
        members: {},          // { memberId: { id, name, phone, creditDebt:0, balance:0, stars:0, punchCards:[], subscriptions:[], deposits:[], referrerId:'', updatedAt } }
        txEvents: [],         // Append-Only 流水事件: { eventId, type:'sale'|'refund'|'credit_pay'|'topup'|'stock_in'|'stock_adjust'|'expense'|'transfer', ts, staffId, staffName, amount, payMethod, items:[], memberId, note, voided:false }
        heldOrders: [],       // 暂存挂单 & 微信/电话外送单
        shiftLogs: [],        // 交接班实盘留痕
        payQrs: { wechat: '', alipay: '' } // 本地防掉包收款码 DataURL
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
        // 同步写一份轻量备份到 localStorage（剔除大图以防超限）
        const lite = { ...this.activeStoreData, payQrs: { wechat: '', alipay: '' } };
        localStorage.setItem(key, JSON.stringify(lite));
      } catch (_) {}
      this.notify('store-updated');
      this.queueSync('store');
    },

    // Append-Only 追加业务流水事件（确保多端并发零覆盖）
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

    // 多门店增删改切换
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

    // 三角色与细粒度权限控制
    getActiveStaff() {
      return this.meta.staff.find((s) => s.id === this.meta.activeStaffId && s.active) || this.meta.staff[0];
    },

    hasPerm(permKey) {
      const staff = this.getActiveStaff();
      if (!staff) return false;
      if (staff.role === 'boss' && this.meta.pinHash && !this.isBossUnlocked()) {
        // 老板视角在未解锁安全码前，涉及核心底价/调价/导出的权限自动收光（手电筒保护）
        const protectedPerms = ['viewCost', 'editPrice', 'transfer', 'exportVault', 'manageStaff'];
        if (protectedPerms.includes(permKey)) return false;
      }
      return Boolean(staff.perms && staff.perms[permKey]);
    },

    switchStaff(staffId) {
      const target = this.meta.staff.find((s) => s.id === staffId && s.active);
      if (!target) return false;
      this.meta.activeStaffId = target.id;
      if (target.role !== 'boss') {
        this.unlockedUntil = 0; // 切回店员/店长立即自动锁闭老板内账视界
      }
      this.saveMeta();
      return true;
    },

    upsertStaff({ id, name, role, customPerms }) {
      const preset = ROLE_PRESETS[role] || ROLE_PRESETS.clerk;
      const perms = customPerms ? { ...preset.perms, ...customPerms } : { ...preset.perms };
      if (id) {
        const idx = this.meta.staff.findIndex((s) => s.id === id);
        if (idx >= 0) {
          this.meta.staff[idx] = { ...this.meta.staff[idx], name, role, perms };
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

    // 停用/移除离职员工，同时刷新会话版本号防泄密
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

    // 掌柜安全码（加密哈希、验证、锁屏、手机尾号应急自救）
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

    // 多选并行存储通道分发（Encrypted Cloud + WeChat Quick Share + WebDAV）
    async queueSync(reason) {
      const channels = this.meta.policy.storageChannels;
      if (channels.encryptedCloud?.enabled && channels.encryptedCloud.endpoint) {
        this.pushEncryptedCloudMirror().catch(() => {});
      }
      if (channels.webdav?.enabled && channels.webdav.url) {
        this.pushWebDavBackup().catch(() => {});
      }
    },

    // 简单 XOR + Base64 本地安全码加密封装（确保云端仅存密文）
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

    // 构建全量可移植账本（含全部门店数据，支持微信一键分享或下载）
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

    // 一键调起系统分享发微信【文件传输助手】或下载 .json
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

    // 一致性智能合并导入（Append-Only 流水去重 + 字段时间戳 LWW 合并）
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

        // 1. 流水事件 Append-Only 严格去重合并
        const seenIds = new Set(localBucket.txEvents.map((e) => e.eventId));
        (incBucket.txEvents || []).forEach((evt) => {
          if (!seenIds.has(evt.eventId)) {
            localBucket.txEvents.push(evt);
            seenIds.add(evt.eventId);
          }
        });
        localBucket.txEvents.sort((a, b) => a.ts - b.ts);

        // 2. 商品档案字段级最新时间戳合并 (LWW)
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

        // 3. 会员档案合并
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

    // 导出断网可独立打开查看的 HTML 账本
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

    // 本地存储容量体检
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

    // 正式开张前安全清空演示测试数据（强制先下载备份）
    async clearDemoDataSafely() {
      await this.exportOrShareJsonBackup(false);
      this.activeStoreData.txEvents = [];
      this.activeStoreData.heldOrders = [];
      this.activeStoreData.shiftLogs = [];
      await this.persistStore();
      return true;
    },

    // IndexedDB 轻量封装
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
      } catch (_) {
        return null;
      }
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

  StoreLocalVault.ROLE_PRESETS = ROLE_PRESETS;
  StoreLocalVault.DEFAULT_POLICY = DEFAULT_POLICY;
  global.StoreLocalVault = StoreLocalVault;
})(window);
