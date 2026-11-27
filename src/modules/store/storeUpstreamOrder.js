/**
 * 商道相通 · 上游供货方对接、采购订货与周期对账模块 (storeUpstreamOrder.js)
 * 职责：
 * 1. 上游供货方管理（新增、编辑、解绑删除、结算周期）
 * 2. 上游商品批发目录（箱规拆零、批发价、最低起订量）与跨端实时同步
 * 3. 智能缺货导入生成采购订货单（按供货方自动拆单，一键复制发微信）
 * 4. 采购订单到货一键签收入库（自动更新本店库存与最新进货底价）
 * 5. 上游周期对账单生成、货款分批核销与待结欠款统计
 * 6. 响应上游「凑单开产」跟单报数与实时同步
 */
(function (global) {
  'use strict';

  const UPSTREAM_STORAGE_KEY = 'sdxt_store_upstream_v1';

  const StoreUpstreamOrder = {
    data: null,
    purchaseCart: [],

    init() {
      try {
        const raw = localStorage.getItem(UPSTREAM_STORAGE_KEY);
        if (raw) {
          this.data = JSON.parse(raw);
        }
      } catch (_) {}

      if (!this.data) {
        this.data = {
          suppliers: [
            {
              id: 'sup_default_1',
              name: '合作社/源头直供仓',
              phone: '',
              settleCycle: '货到付款',
              note: '支持跨端直发订货单'
            }
          ],
          supplierItems: [],
          orders: [],
          payments: [],
          coProductionOrders: []
        };
        this.save();
      }
      return this;
    },

    save() {
      localStorage.setItem(UPSTREAM_STORAGE_KEY, JSON.stringify(this.data));
    },

    getVault() {
      return global.StoreLocalVault;
    },

    // 1. 新增或编辑上游供货方
    upsertSupplier({ id, name, phone = '', settleCycle = '货到付款', note = '' }) {
      const cleanName = String(name || '').trim();
      if (!cleanName) throw new Error('请填写供货方名称');
      const existing = id ? this.data.suppliers.find((s) => s.id === id) : null;
      if (existing) {
        existing.name = cleanName;
        existing.phone = String(phone || '').trim();
        existing.settleCycle = settleCycle;
        existing.note = note;
        this.save();
        return existing;
      }
      const sup = {
        id: 'sup_' + Date.now().toString(36),
        name: cleanName,
        phone: String(phone || '').trim(),
        settleCycle,
        note
      };
      this.data.suppliers.push(sup);
      this.save();
      return sup;
    },

    // 解绑 / 删除上游供货方
    removeSupplier(supplierId) {
      if (!supplierId || supplierId === 'sup_default_1') {
        throw new Error('默认合作供货方不可删除，可点击编辑修改名称');
      }
      this.data.suppliers = (this.data.suppliers || []).filter((s) => s.id !== supplierId);
      this.data.supplierItems = (this.data.supplierItems || []).filter((p) => p.supplierId !== supplierId);
      this.save();
    },

    // 2. 录入或同步上游供货商品目录
    upsertSupplierProduct({ id, supplierId, name, barcode = '', wholesalePrice, unit = '箱', packRate = 1, minOrderQty = 1 }) {
      const cleanName = String(name || '').trim();
      if (!cleanName) throw new Error('请填写供货商品名称');
      const sup = this.data.suppliers.find((s) => s.id === supplierId) || this.data.suppliers[0];
      const existing = id ? this.data.supplierItems.find((p) => p.id === id) : null;
      const payload = {
        id: existing ? existing.id : 'sp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        supplierId: sup.id,
        supplierName: sup.name,
        name: cleanName,
        barcode: String(barcode || '').trim(),
        wholesalePrice: Number(Number(wholesalePrice || 0).toFixed(2)),
        unit: unit || '箱',
        packRate: Math.max(1, parseInt(packRate, 10) || 1),
        minOrderQty: Math.max(1, parseInt(minOrderQty, 10) || 1),
        updatedAt: Date.now()
      };
      if (existing) {
        Object.assign(existing, payload);
      } else {
        this.data.supplierItems.push(payload);
      }
      this.save();
      return payload;
    },

    async syncFromCloudOrShared() {
      let syncedCount = 0;
      try {
        const sharedRaw = localStorage.getItem('sdxt_shared_upstream_catalog');
        if (sharedRaw) {
          const list = JSON.parse(sharedRaw);
          if (Array.isArray(list)) {
            list.forEach((remote) => {
              const sup = this.data.suppliers.find((s) => s.name === remote.supplierName) ||
                this.upsertSupplier({ name: remote.supplierName || '上游供货商' });
              const match = this.data.supplierItems.find((x) => x.name === remote.name && x.supplierId === sup.id);
              this.upsertSupplierProduct({
                id: match?.id,
                supplierId: sup.id,
                name: remote.name,
                barcode: remote.barcode || '',
                wholesalePrice: remote.wholesalePrice || remote.price || 0,
                unit: remote.unit || '箱',
                packRate: remote.packRate || 1
              });
              syncedCount += 1;
            });
          }
        }
      } catch (_) {}
      return syncedCount;
    },

    // 3. 采购车与一键导入缺货
    addToPurchaseCart(item, qty = 1) {
      const addQty = Math.max(1, Number(qty || 1));
      const existing = this.purchaseCart.find((c) => c.supplierItemId === item.id);
      if (existing) {
        existing.qty += addQty;
      } else {
        this.purchaseCart.push({
          supplierItemId: item.id,
          supplierId: item.supplierId || this.data.suppliers[0]?.id || 'sup_default_1',
          supplierName: item.supplierName || this.data.suppliers[0]?.name || '合作供货方',
          name: item.name,
          barcode: item.barcode || '',
          wholesalePrice: Number(item.wholesalePrice || 0),
          unit: item.unit || '箱',
          packRate: Number(item.packRate || 1),
          qty: addQty
        });
      }
    },

    importLowStockToPurchaseCart() {
      const alerts = global.StoreCatalogPricing?.getAlertsAndRestockList?.();
      if (!alerts || !alerts.lowStock.length) return 0;
      let added = 0;
      alerts.lowStock.forEach((it) => {
        const matchedSupProd = this.data.supplierItems.find(
          (sp) => (it.barcode && sp.barcode === it.barcode) || sp.name === it.name
        );
        const pack = Number(matchedSupProd?.packRate || it.packRate || 1);
        const needPacks = Math.max(1, Math.ceil(Number(it.suggestRestock || 5) / pack));
        this.addToPurchaseCart(
          matchedSupProd || {
            id: 'local_' + it.id,
            supplierId: this.data.suppliers[0]?.id || 'sup_default_1',
            supplierName: this.data.suppliers[0]?.name || '合作供货方',
            name: it.name,
            barcode: it.barcode || '',
            wholesalePrice: Number(it.costPrice || 0),
            unit: pack > 1 ? '箱' : it.unit,
            packRate: pack
          },
          needPacks
        );
        added += 1;
      });
      return added;
    },

    // 4. 提交生成正式采购订货单（按供货方自动拆单）
    async submitPurchaseOrders(note = '') {
      if (!this.purchaseCart.length) throw new Error('采购单为空，请先选择要订购的货品');
      const vault = this.getVault();
      const grouped = {};
      this.purchaseCart.forEach((line) => {
        if (!grouped[line.supplierId]) grouped[line.supplierId] = [];
        grouped[line.supplierId].push(line);
      });

      const createdOrders = [];
      Object.entries(grouped).forEach(([supplierId, lines]) => {
        const totalAmount = Number(lines.reduce((s, l) => s + l.wholesalePrice * l.qty, 0).toFixed(2));
        const order = {
          orderId: 'PO' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 90 + 10),
          storeId: vault.activeStoreData.storeId,
          storeName: vault.activeStoreData.storeName,
          supplierId,
          supplierName: lines[0].supplierName,
          lines,
          totalAmount,
          paidAmount: 0,
          status: 'ordered',
          note,
          createdAt: Date.now()
        };
        this.data.orders.unshift(order);
        createdOrders.push(order);
      });

      this.purchaseCart = [];
      this.save();
      return createdOrders;
    },

    buildWechatPurchaseText(order) {
      const header = `【采购订货单 · ${order.storeName}】\n单号：${order.orderId}\n供货方：${order.supplierName}\n时间：${new Date(order.createdAt).toLocaleString()}\n--------------------\n`;
      const body = order.lines.map((l, idx) => `${idx + 1}. ${l.name} × ${l.qty}${l.unit} (¥${Number(l.wholesalePrice).toFixed(2)})`).join('\n');
      const footer = `\n--------------------\n预估货款合计：¥${Number(order.totalAmount).toFixed(2)}${order.note ? `\n备注：${order.note}` : ''}\n麻烦安排配货，谢谢！`;
      return header + body + footer;
    },

    // 5. 采购订单到货一键签收入库（自动拆零入本店总库并更新最新进货价）
    async confirmOrderReceivedAndStockIn(orderId) {
      const order = this.data.orders.find((o) => o.orderId === orderId);
      if (!order) throw new Error('未找到该采购单');
      if (order.status === 'received') throw new Error('该采购单已签收入库');

      const vault = this.getVault();
      const cat = global.StoreCatalogPricing;
      const catalogItems = Object.values(vault.activeStoreData.catalog || {});

      for (const line of order.lines) {
        const matched = catalogItems.find(
          (i) => (line.barcode && i.barcode === line.barcode) || i.name === line.name
        );
        const unitCost = Number((Number(line.wholesalePrice) / Math.max(1, Number(line.packRate || 1))).toFixed(2));
        if (matched) {
          await cat.receiveStock({
            itemId: matched.id,
            qtyIn: Number(line.qty),
            isBox: Number(line.packRate || 1) > 1,
            newCostPrice: unitCost > 0 ? unitCost : null
          });
        } else {
          const policy = vault.getPolicy();
          const markup = Number(policy.pricing.defaultMarkupPct || 25) / 100;
          await cat.upsertCatalogItem({
            name: line.name,
            barcode: line.barcode || '',
            costPrice: unitCost,
            retailPrice: Number((unitCost * (1 + markup)).toFixed(2)),
            stock: Number(line.qty) * Math.max(1, Number(line.packRate || 1)),
            unit: Number(line.packRate || 1) > 1 ? vault.getLexicon().unitDefault : line.unit,
            packRate: Math.max(1, Number(line.packRate || 1))
          });
        }
      }

      order.status = 'received';
      order.receivedAt = Date.now();
      this.save();
      return order;
    },

    // 6. 上游周期对账单与货款核销
    getSupplierPeriodStatements(supplierId = 'ALL') {
      const map = {};
      (this.data.orders || []).forEach((o) => {
        if (supplierId !== 'ALL' && o.supplierId !== supplierId) return;
        if (!map[o.supplierId]) {
          map[o.supplierId] = {
            supplierId: o.supplierId,
            supplierName: o.supplierName,
            orderCount: 0,
            totalAmount: 0,
            paidAmount: 0,
            unpaidAmount: 0,
            orders: []
          };
        }
        const entry = map[o.supplierId];
        entry.orderCount += 1;
        entry.totalAmount = Number((entry.totalAmount + Number(o.totalAmount || 0)).toFixed(2));
        entry.paidAmount = Number((entry.paidAmount + Number(o.paidAmount || 0)).toFixed(2));
        entry.unpaidAmount = Number((entry.totalAmount - entry.paidAmount).toFixed(2));
        entry.orders.push(o);
      });
      return Object.values(map);
    },

    paySupplierOrder(orderId, payAmount, payMethod = 'wechat') {
      const order = this.data.orders.find((o) => o.orderId === orderId);
      if (!order) throw new Error('采购单不存在');
      const amt = Math.max(0, Number(payAmount || 0));
      order.paidAmount = Number((Number(order.paidAmount || 0) + amt).toFixed(2));
      this.data.payments.unshift({
        payId: 'SPAY' + Date.now().toString().slice(-6),
        orderId: order.orderId,
        supplierId: order.supplierId,
        supplierName: order.supplierName,
        amount: amt,
        payMethod,
        ts: Date.now()
      });
      this.save();
      return order;
    },

    // 7. 响应上游「凑单开产」跟单报数
    joinCoProduction(campaignId, qty) {
      const n = Math.max(1, Number(qty || 1));
      const vault = this.getVault();
      const rec = {
        campaignId,
        storeId: vault.activeStoreData.storeId,
        storeName: vault.activeStoreData.storeName,
        qty: n,
        ts: Date.now()
      };
      this.data.coProductionOrders.unshift(rec);
      this.save();

      try {
        const raw = localStorage.getItem('sdxt_active_coproduction');
        if (raw) {
          const camp = JSON.parse(raw);
          if (camp && camp.id === campaignId) {
            camp.currentQty = Number(camp.currentQty || 0) + n;
            localStorage.setItem('sdxt_active_coproduction', JSON.stringify(camp));
          }
        }
      } catch (_) {}
      return rec;
    }
  };

  global.StoreUpstreamOrder = StoreUpstreamOrder;
})(window);
