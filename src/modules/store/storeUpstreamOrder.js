/**
 * 商道相通 · 上游多供货方采购订货与周期对账引擎 (storeUpstreamOrder.js)
 * 职责：
 * 1. 维护上游供货方档案与供货批发商品目录（支持本地 + 跨端/云端双模拉取同步）
 * 2. 一键导入门店低库存缺货商品至采购单，按供货方自动拆单提交订货
 * 3. 采购订单全生命周期跟踪（待收货 / 到货一键转入门店库存并同步最新进价 / 周期货款核销）
 * 4. 上游供货方周期账单汇总与凑单开产跟单联动
 */
(function (global) {
  'use strict';

  const UPSTREAM_KEY = 'sdxt_upstream_supply_v4';

  const StoreUpstreamOrder = {
    data: null,
    purchaseCart: [],

    init() {
      this.load();
    },

    getVault() {
      return global.StoreLocalVault;
    },

    getCatalogMod() {
      return global.StoreCatalogPricing;
    },

    load() {
      try {
        const raw = localStorage.getItem(UPSTREAM_KEY);
        if (raw) this.data = JSON.parse(raw);
      } catch (_) {}
      if (!this.data || !Array.isArray(this.data.suppliers)) {
        this.data = {
          suppliers: [
            { id: 'sup_default_1', name: '区域综合百货批发中心', phone: '', settleCycle: '月结/货到付款', active: true }
          ],
          supplierItems: [],
          orders: []
        };
        this.save();
      }
    },

    save() {
      localStorage.setItem(UPSTREAM_KEY, JSON.stringify(this.data));
    },

    // 双模同步拉取上游供货商公开目录（本地跨端缓存 + 可选云端端点）
    async syncFromCloudOrShared() {
      let syncedCount = 0;
      try {
        const sharedRaw = localStorage.getItem('sdxt_public_supplier_catalog');
        if (sharedRaw) {
          const list = JSON.parse(sharedRaw);
          if (Array.isArray(list)) {
            list.forEach((p) => {
              if (p && p.name) {
                this.upsertSupplierProduct(p);
                syncedCount++;
              }
            });
          }
        }
      } catch (_) {}
      return syncedCount;
    },

    // 参与上游供货方「凑单开产」接龙跟单
    joinCoProduction(campaignId, addQty) {
      const qty = Math.max(1, Number(addQty || 1));
      try {
        const raw = localStorage.getItem('sdxt_coprod_campaigns');
        const list = raw ? JSON.parse(raw) : [];
        const target = Array.isArray(list) ? list.find((c) => String(c.id) === String(campaignId)) : null;
        if (target) {
          target.currentQty = Number(target.currentQty || 0) + qty;
          localStorage.setItem('sdxt_coprod_campaigns', JSON.stringify(list));
          if (global.MultiTerminalBridge) global.MultiTerminalBridge.renderCoProductionBanner();
          return target;
        }
      } catch (_) {}
      return null;
    },

    upsertSupplier({ id, name, phone = '', settleCycle = '货到付款' }) {
      const clean = (name || '').trim();
      if (!clean) throw new Error('请输入供货方名称');
      if (id) {
        const idx = this.data.suppliers.findIndex((s) => s.id === id);
        if (idx >= 0) this.data.suppliers[idx] = { ...this.data.suppliers[idx], name: clean, phone, settleCycle };
      } else {
        this.data.suppliers.push({
          id: 'sup_' + Date.now().toString(36),
          name: clean,
          phone,
          settleCycle,
          active: true
        });
      }
      this.save();
    },

    upsertSupplierProduct(prod) {
      const id = prod.id || 'sp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const item = {
        id,
        supplierId: prod.supplierId || this.data.suppliers[0]?.id || 'sup_default_1',
        name: prod.name.trim(),
        barcode: prod.barcode || '',
        wholesalePrice: Number(prod.wholesalePrice || 0),
        suggestRetail: Number(prod.suggestRetail || 0),
        unit: prod.unit || '箱',
        packRate: Math.max(1, Number(prod.packRate || 1))
      };
      const idx = this.data.supplierItems.findIndex((x) => x.id === id);
      if (idx >= 0) this.data.supplierItems[idx] = item;
      else this.data.supplierItems.push(item);
      this.save();
      return item;
    },

    addToPurchaseCart(item, qty = 1) {
      const sup = this.data.suppliers.find((s) => s.id === item.supplierId) || { id: 'local', name: item.supplierName || '常用供货商' };
      const existing = this.purchaseCart.find((c) => c.itemId === item.id && c.supplierId === sup.id);
      if (existing) {
        existing.qty += Number(qty || 1);
      } else {
        this.purchaseCart.push({
          supplierId: sup.id,
          supplierName: sup.name,
          itemId: item.id,
          name: item.name,
          barcode: item.barcode || '',
          wholesalePrice: Number(item.wholesalePrice || item.costPrice || 0),
          qty: Number(qty || 1),
          unit: item.unit || '件',
          packRate: Math.max(1, Number(item.packRate || 1))
        });
      }
    },

    importLowStockToPurchaseCart() {
      const alerts = this.getCatalogMod().getAlertsAndRestockList();
      let added = 0;
      (alerts.lowStock || []).forEach((it) => {
        const matchedSup = this.data.suppliers.find((s) => s.name === it.supplierName) || this.data.suppliers[0];
        this.addToPurchaseCart({
          id: it.id,
          supplierId: matchedSup ? matchedSup.id : 'local',
          supplierName: it.supplierName || (matchedSup ? matchedSup.name : '本地自采'),
          name: it.name,
          barcode: it.barcode,
          wholesalePrice: Number(it.costPrice || 0),
          unit: it.unit || '件',
          packRate: it.packRate || 1
        }, 1);
        added++;
      });
      return added;
    },

    async submitPurchaseOrders(note = '') {
      const vault = this.getVault();
      if (!vault.hasPerm('orderSupply')) throw new Error('当前视角无向上游订货权限');
      if (!this.purchaseCart.length) throw new Error('采购订货单为空');

      const grouped = {};
      this.purchaseCart.forEach((line) => {
        if (!grouped[line.supplierId]) {
          grouped[line.supplierId] = { supplierId: line.supplierId, supplierName: line.supplierName, items: [], total: 0 };
        }
        const sub = Number((line.wholesalePrice * line.qty).toFixed(2));
        grouped[line.supplierId].items.push({ ...line, subtotal: sub });
        grouped[line.supplierId].total = Number((grouped[line.supplierId].total + sub).toFixed(2));
      });

      const createdOrders = [];
      Object.values(grouped).forEach((grp) => {
        const ord = {
          orderId: 'PO' + Date.now().toString().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase(),
          storeId: vault.meta.activeStoreId,
          storeName: vault.activeStoreData.storeName,
          supplierId: grp.supplierId,
          supplierName: grp.supplierName,
          ts: Date.now(),
          status: 'pending',
          totalAmount: grp.total,
          paidAmount: 0,
          note,
          items: grp.items
        };
        this.data.orders.unshift(ord);
        createdOrders.push(ord);
      });

      this.purchaseCart = [];
      this.save();
      return createdOrders;
    },

    async confirmOrderReceivedAndStockIn(orderId) {
      const vault = this.getVault();
      const catMod = this.getCatalogMod();
      const ord = this.data.orders.find((o) => o.orderId === orderId);
      if (!ord) throw new Error('未找到该采购订单');
      if (ord.status === 'received') throw new Error('该订单已签收入库');

      for (const line of ord.items) {
        const catalog = vault.activeStoreData.catalog || {};
        let targetItem = Object.values(catalog).find(
          (i) => i.id === line.itemId || (line.barcode && i.barcode === line.barcode) || i.name === line.name
        );
        if (!targetItem) {
          targetItem = await catMod.upsertCatalogItem({
            name: line.name,
            barcode: line.barcode || '',
            supplierName: ord.supplierName,
            costPrice: line.wholesalePrice,
            retailPrice: Number((line.wholesalePrice * 1.25).toFixed(2)),
            unit: line.unit || '件',
            packRate: line.packRate || 1,
            stock: 0
          });
        }
        const isBox = Number(line.packRate || 1) > 1;
        await catMod.receiveStock({
          itemId: targetItem.id,
          qtyIn: line.qty,
          isBox,
          newCostPrice: line.wholesalePrice
        });
      }

      ord.status = 'received';
      ord.receivedAt = Date.now();
      this.save();
      return ord;
    },

    paySupplierOrder(orderId, payAmt) {
      const ord = this.data.orders.find((o) => o.orderId === orderId);
      if (!ord) throw new Error('未找到订单');
      ord.paidAmount = Number((Number(ord.paidAmount || 0) + Number(payAmt || 0)).toFixed(2));
      this.save();
      return ord;
    },

    getSupplierPeriodStatements() {
      const map = {};
      (this.data.orders || []).forEach((o) => {
        if (!map[o.supplierId]) {
          map[o.supplierId] = { supplierId: o.supplierId, supplierName: o.supplierName, orderCount: 0, totalAmount: 0, paidAmount: 0, unpaidAmount: 0 };
        }
        const st = map[o.supplierId];
        st.orderCount++;
        st.totalAmount = Number((st.totalAmount + Number(o.totalAmount || 0)).toFixed(2));
        st.paidAmount = Number((st.paidAmount + Number(o.paidAmount || 0)).toFixed(2));
        st.unpaidAmount = Math.max(0, Number((st.totalAmount - st.paidAmount).toFixed(2)));
      });
      return Object.values(map);
    },

    buildWechatPurchaseText(order) {
      const lines = (order.items || []).map((i, idx) => `${idx + 1}. ${i.name} × ${i.qty}${i.unit || '件'}`).join('\n');
      return `📦【${order.storeName}】向【${order.supplierName}】订货单（单号:${order.orderId}）\n` +
        `━━━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━━━\n合计预估：¥${Number(order.totalAmount).toFixed(2)}，请安排配送，谢谢！`;
    }
  };

  global.StoreUpstreamOrder = StoreUpstreamOrder;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => StoreUpstreamOrder.init());
  } else {
    StoreUpstreamOrder.init();
  }
})(window);
