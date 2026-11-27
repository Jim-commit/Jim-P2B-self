/**
 * 商道相通 · 门店邻里协同与向上进货调退引擎 (storeCommunityAndReplenish.js)
 * 职责：
 * 1. 同城余缺互调池（浏览认领同行余货 / 挂出本店余货）
 * 2. 邻里公器共享 & 百工物物置换池
 * 3. 真实用度计划单（提前向产区/供货方报备未来用度）
 * 4. 随车送货签收凭单（补货 + 退验旧品冲抵 + 平价换新 + 拍照存根 + 载具借还）
 */
(function (global) {
  'use strict';

  const COMM_KEY = 'sdxt_store_community_v1';

  const StoreCommunityAndReplenish = {
    state: null,
    replenishCart: {},
    proofImages: [],

    init() {
      try {
        const raw = localStorage.getItem(COMM_KEY);
        if (raw) this.state = JSON.parse(raw);
      } catch (_) {}
      if (!this.state) {
        this.state = {
          creditLimit: 2000,
          borrowedCarriers: 0,
          driverName: '老张师傅',
          driverPhone: '',
          poolOffers: [],
          communityTools: [],
          demandPlans: [],
          replenishSlips: [],
          lastNote: ''
        };
        this.save();
      }
    },

    save() {
      localStorage.setItem(COMM_KEY, JSON.stringify(this.state));
    },

    getVault() {
      return global.StoreLocalVault;
    },

    getUpstream() {
      return global.StoreUpstreamOrder;
    },

    publishPoolOffer({ prodName, spec, qty, price, reason }) {
      const vault = this.getVault();
      if (!prodName || Number(qty) <= 0) throw new Error('请填写完整余货名称与数量');
      this.state.poolOffers.unshift({
        id: 'pool_' + Date.now().toString(36),
        storeName: vault.activeStoreData.storeName,
        prodName: prodName.trim(),
        spec: spec || '整件',
        qty: Number(qty),
        price: Number(price || 0),
        reason: reason || '同城平价余缺调剂',
        status: 'open',
        ts: Date.now()
      });
      this.save();
    },

    claimPoolOffer(offerId) {
      const target = this.state.poolOffers.find((x) => x.id === offerId);
      if (!target || target.status !== 'open') return;
      target.status = 'claimed';
      target.claimedBy = this.getVault().activeStoreData.storeName;
      this.save();
      return target;
    },

    publishCommunityTool({ kind, title, note }) {
      if (!title || !title.trim()) throw new Error('请填写公器或置换物名称');
      this.state.communityTools.unshift({
        id: 'tool_' + Date.now().toString(36),
        storeName: this.getVault().activeStoreData.storeName,
        kind: kind || '[公器共享]',
        title: title.trim(),
        note: note || '',
        ts: Date.now()
      });
      this.save();
    },

    submitDemandPlan({ cycle, expectedDate, rows, note }) {
      const validRows = (rows || []).filter((r) => r.name && Number(r.qty) > 0);
      if (!validRows.length) throw new Error('请至少填写一项用度计划明细');
      const plan = {
        id: 'PLAN' + Date.now().toString().slice(-6),
        storeName: this.getVault().activeStoreData.storeName,
        cycle,
        expectedDate,
        rows: validRows,
        note: note || '',
        status: '已报备产区',
        ts: Date.now()
      };
      this.state.demandPlans.unshift(plan);
      this.save();
      return plan;
    },

    setLineQty(itemId, field, deltaOrVal, isExact = false) {
      if (!this.replenishCart[itemId]) {
        this.replenishCart[itemId] = { qty: 0, returnQty: 0, exchangeQty: 0 };
      }
      const line = this.replenishCart[itemId];
      line[field] = isExact
        ? Math.max(0, Number(deltaOrVal || 0))
        : Math.max(0, Number(line[field] || 0) + Number(deltaOrVal || 0));
      if (line.qty === 0 && line.returnQty === 0 && line.exchangeQty === 0) {
        delete this.replenishCart[itemId];
      }
    },

    clearReplenishCart() {
      this.replenishCart = {};
      this.proofImages = [];
    },

    getReplenishSummary() {
      const upstream = this.getUpstream();
      const catalog = this.getVault().activeStoreData.catalog || {};
      const orderLines = [];
      const returnLines = [];
      const exchangeLines = [];
      let orderTotal = 0;
      let returnTotal = 0;
      let totalCount = 0;

      Object.entries(this.replenishCart).forEach(([id, counts]) => {
        const supItem = (upstream.data.supplierItems || []).find((x) => x.id === id);
        const catItem = catalog[id];
        const info = supItem || catItem;
        if (!info) return;
        const unitPrice = Number(supItem ? supItem.wholesalePrice : (catItem.costPrice || catItem.retailPrice || 0));
        const unit = info.unit || '件';

        if (counts.qty > 0) {
          const sub = Number((counts.qty * unitPrice).toFixed(2));
          orderTotal += sub;
          totalCount += counts.qty;
          orderLines.push({ id, name: info.name, qty: counts.qty, unitPrice, unit, subtotal: sub, raw: info });
        }
        if (counts.returnQty > 0) {
          const sub = Number((counts.returnQty * unitPrice).toFixed(2));
          returnTotal += sub;
          totalCount += counts.returnQty;
          returnLines.push({ id, name: info.name, qty: counts.returnQty, unitPrice, unit, subtotal: sub });
        }
        if (counts.exchangeQty > 0) {
          totalCount += counts.exchangeQty;
          exchangeLines.push({ id, name: info.name, qty: counts.exchangeQty, unit });
        }
      });

      const netPayable = Number((orderTotal - returnTotal).toFixed(2));
      const hasSpecial = returnLines.length > 0 || exchangeLines.length > 0;
      return {
        orderLines,
        returnLines,
        exchangeLines,
        orderTotal: Number(orderTotal.toFixed(2)),
        returnTotal: Number(returnTotal.toFixed(2)),
        netPayable,
        totalCount,
        hasSpecial
      };
    },

    async submitReplenishSlip({ settleMethod = '信用周转记账', note = '', carrierDelta = 0 }) {
      const summary = this.getReplenishSummary();
      if (!summary.totalCount) throw new Error('当前未选择任何补货、退验或换新品项');

      const upstream = this.getUpstream();
      summary.orderLines.forEach((l) => {
        upstream.addToPurchaseCart({
          id: l.id,
          supplierId: l.raw.supplierId || upstream.data.suppliers[0]?.id || 'sup_default_1',
          supplierName: l.raw.supplierName || upstream.data.suppliers[0]?.name || '合作供货方',
          name: l.name,
          barcode: l.raw.barcode || '',
          wholesalePrice: l.unitPrice,
          unit: l.unit,
          packRate: l.raw.packRate || 1
        }, l.qty);
      });

      let createdOrders = [];
      if (summary.orderLines.length > 0) {
        createdOrders = await upstream.submitPurchaseOrders(note);
      }

      const slip = {
        slipId: 'SLP' + Date.now().toString().slice(-6),
        ts: Date.now(),
        storeName: this.getVault().activeStoreData.storeName,
        settleMethod,
        note,
        carrierDelta: Number(carrierDelta || 0),
        proofs: [...this.proofImages],
        ...summary
      };
      this.state.replenishSlips.unshift(slip);
      this.state.borrowedCarriers = Math.max(0, Number(this.state.borrowedCarriers || 0) + Number(carrierDelta || 0));
      this.save();
      this.clearReplenishCart();
      return { slip, createdOrders };
    },

    repeatLastSlip() {
      const last = this.state.replenishSlips[0];
      if (!last || !last.orderLines || !last.orderLines.length) {
        throw new Error('暂无历史补货凭单可复用');
      }
      last.orderLines.forEach((l) => {
        this.setLineQty(l.id, 'qty', l.qty, true);
      });
      return last.orderLines.length;
    }
  };

  global.StoreCommunityAndReplenish = StoreCommunityAndReplenish;
})(window);
