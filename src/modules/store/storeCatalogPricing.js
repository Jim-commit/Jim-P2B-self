/**
 * 商道相通 · 商品总库、动态定价与多店经营管理引擎 (storeCatalogPricing.js)
 * 职责：
 * 1. 百工百业商品/物料建档（标品条码、PLU称重货号、箱规拆零换算、阶梯批发价、展架位、保质期、停售归档）
 * 2. 全参数化动态调价（全店默认加价率、自定义分类加价率、零售价/会员价双锁定）
 * 3. 库房实盘盘点差额校准（报损/盘盈盘亏自动记入流水留痕防篡改）
 * 4. 智能预警、多店统购缺货汇总单、一体机CSV导入与日结合并、分店调拨、多店合并内账大盘与交接班清点
 */
(function (global) {
  'use strict';

  const StoreCatalogPricing = {
    getVault() {
      return global.StoreLocalVault;
    },

    // 新增或编辑商品/物料（支持箱规拆零、阶梯批发价与字段级时间戳 LWW）
    async upsertCatalogItem(payload) {
      const vault = this.getVault();
      const lex = vault.getLexicon();
      if (!vault.hasPerm('editPrice') && payload.id) {
        throw new Error(`当前视角无修改${lex.itemLabel}价格与档案权限`);
      }
      const catalog = vault.activeStoreData.catalog;
      const id = payload.id || 'itm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
      const now = Date.now();
      const existing = catalog[id] || {
        id,
        name: '',
        barcode: '',
        plu: '',
        category: lex.defaultCategory || '常规品类',
        supplierId: 'local',
        supplierName: '本地自采',
        costPrice: 0,
        retailPrice: 0,
        memberPrice: 0,
        tierPrices: [],
        packRate: 1,
        unit: lex.unitDefault || '件',
        stock: 0,
        shelfLoc: '',
        expiryDate: '',
        archived: false,
        fieldTs: {}
      };

      const packRate = Math.max(1, Number(payload.packRate || existing.packRate || 1));
      let unitCost = payload.costPrice !== undefined ? Number(payload.costPrice) : Number(existing.costPrice || 0);
      if (payload.boxCostPrice !== undefined && Number(payload.boxCostPrice) > 0) {
        unitCost = Number((Number(payload.boxCostPrice) / packRate).toFixed(2));
      }

      let retailPrice = payload.retailPrice !== undefined ? Number(payload.retailPrice) : Number(existing.retailPrice || 0);
      if ((!retailPrice || payload.autoCalcRetail) && unitCost > 0) {
        const policy = vault.getPolicy().pricing;
        const cat = payload.category || existing.category;
        const pct = policy.categoryMarkupPct && policy.categoryMarkupPct[cat] !== undefined
          ? Number(policy.categoryMarkupPct[cat])
          : Number(policy.defaultMarkupPct || 0);
        if (pct > 0) {
          retailPrice = Number((unitCost * (1 + pct / 100)).toFixed(2));
        }
      }

      const next = {
        ...existing,
        ...payload,
        id,
        packRate,
        costPrice: unitCost,
        retailPrice,
        updatedAt: now
      };
      delete next.boxCostPrice;
      delete next.autoCalcRetail;

      next.fieldTs = { ...(existing.fieldTs || {}) };
      Object.keys(payload).forEach((k) => {
        next.fieldTs[k] = now;
      });

      catalog[id] = next;
      await vault.persistStore();
      return next;
    },

    // 库房实盘盘点差额校准（自动生成盘盈/盘亏留痕流水）
    async adjustActualStock(itemId, actualQty, reason = '日常实盘校准') {
      const vault = this.getVault();
      if (!vault.hasPerm('editPrice')) throw new Error('当前视角无库存实盘校准权限');
      const item = vault.activeStoreData.catalog[itemId];
      if (!item) throw new Error('未找到对应商品');
      const oldQty = Number(item.stock || 0);
      const nextQty = Number(actualQty);
      if (isNaN(nextQty) || nextQty < 0) throw new Error('请输入有效实盘数量');
      const diff = Number((nextQty - oldQty).toFixed(3));
      if (diff === 0) return item;

      item.stock = nextQty;
      item.updatedAt = Date.now();
      await vault.appendEvent({
        type: 'stock_adjust',
        amount: Number((diff * Number(item.costPrice || 0)).toFixed(2)),
        items: [{ itemId: item.id, name: item.name, qty: diff }],
        note: `实盘校准[${item.name}] ${oldQty}->${nextQty}（差异 ${diff > 0 ? '+' : ''}${diff} · ${reason}）`
      });
      return item;
    },

    // 按分类或全店批量百分比调价
    async batchAdjustPrice({ category = 'ALL', pct = 0, roundTo = 'jiao' }) {
      const vault = this.getVault();
      if (!vault.hasPerm('editPrice')) throw new Error('当前视角无批量调价权限');
      const factor = 1 + Number(pct || 0) / 100;
      if (factor <= 0) throw new Error('调价幅度不合法');

      const now = Date.now();
      let count = 0;
      Object.values(vault.activeStoreData.catalog).forEach((item) => {
        if (item.archived) return;
        if (category !== 'ALL' && item.category !== category) return;
        let nextPrice = Number(item.retailPrice || 0) * factor;
        if (roundTo === 'yuan') nextPrice = Math.round(nextPrice);
        else if (roundTo === 'jiao') nextPrice = Math.round(nextPrice * 10) / 10;
        else nextPrice = Number(nextPrice.toFixed(2));

        item.retailPrice = nextPrice;
        item.updatedAt = now;
        item.fieldTs = { ...(item.fieldTs || {}), retailPrice: now };
        count++;
      });

      await vault.persistStore();
      return count;
    },

    // 到货一键入库（支持按整箱自动乘以箱规换算率 + 同步最新进货成本）
    async receiveStock({ itemId, qtyIn = 0, isBox = false, newCostPrice = null }) {
      const vault = this.getVault();
      const lex = vault.getLexicon();
      const item = vault.activeStoreData.catalog[itemId];
      if (!item) throw new Error(`未找到对应${lex.itemLabel}`);
      const rate = isBox ? Math.max(1, Number(item.packRate || 1)) : 1;
      const addedUnits = Number((Number(qtyIn) * rate).toFixed(3));
      item.stock = Number((Number(item.stock || 0) + addedUnits).toFixed(3));
      if (newCostPrice !== null && Number(newCostPrice) > 0) {
        item.costPrice = isBox
          ? Number((Number(newCostPrice) / rate).toFixed(2))
          : Number(newCostPrice);
      }
      await vault.appendEvent({
        type: 'stock_in',
        amount: Number((addedUnits * Number(item.costPrice || 0)).toFixed(2)),
        items: [{ itemId: item.id, name: item.name, qty: addedUnits }],
        note: `到货入库 +${addedUnits}${item.unit || lex.unitDefault}`
      });
      return item;
    },

    // 单店智能库存预警（低库存 + 临期）
    getAlertsAndRestockList() {
      const vault = this.getVault();
      const policy = vault.getPolicy().inventory;
      const lowLimit = Number(policy.lowStockThreshold || 5);
      const expDays = Number(policy.expiryAlertDays || 15);
      const now = Date.now();

      const lowStock = [];
      const nearExpiry = [];
      const bySupplier = {};

      Object.values(vault.activeStoreData.catalog || {}).forEach((item) => {
        if (item.archived) return;
        const isLow = Number(item.stock || 0) <= lowLimit;
        if (isLow) {
          lowStock.push(item);
          const supKey = item.supplierName || '本地自采';
          if (!bySupplier[supKey]) bySupplier[supKey] = [];
          bySupplier[supKey].push(item);
        }
        if (item.expiryDate) {
          const expTs = new Date(item.expiryDate).getTime();
          const diffDays = Math.ceil((expTs - now) / (24 * 3600 * 1000));
          if (!isNaN(diffDays) && diffDays <= expDays) {
            nearExpiry.push({ ...item, diffDays });
          }
        }
      });

      return { lowStock, nearExpiry, bySupplier };
    },

    // 多店统购缺货汇总单（合并全部分店的低库存缺货商品，统一下单拿更低批发价）
    async getMultiStoreRestockSummary() {
      const vault = this.getVault();
      const lowLimit = Number(vault.getPolicy().inventory.lowStockThreshold || 5);
      const mergedMap = {};

      for (const st of vault.meta.stores) {
        const bucket = st.id === vault.activeStoreData.storeId
          ? vault.activeStoreData
          : await vault.idbGet(`sdxt_store_data_${st.id}`);
        if (!bucket) continue;

        Object.values(bucket.catalog || {}).forEach((it) => {
          if (it.archived || Number(it.stock || 0) > lowLimit) return;
          const key = it.barcode ? `bc_${it.barcode}` : `nm_${it.name}`;
          if (!mergedMap[key]) {
            mergedMap[key] = {
              key,
              itemId: it.id,
              name: it.name,
              barcode: it.barcode || '',
              supplierName: it.supplierName || '本地自采',
              costPrice: Number(it.costPrice || 0),
              unit: it.unit || '件',
              packRate: it.packRate || 1,
              totalNeedQty: 0,
              storeDetails: []
            };
          }
          const suggestQty = Math.max(1, Math.ceil(lowLimit - Number(it.stock || 0) + 1));
          mergedMap[key].totalNeedQty += suggestQty;
          mergedMap[key].storeDetails.push(`${st.name}(余${it.stock})`);
        });
      }

      return Object.values(mergedMap);
    },

    // 近30天热销Top与滞销分析
    getSalesAnalytics(days = 30) {
      const vault = this.getVault();
      const cutoff = Date.now() - days * 24 * 3600 * 1000;
      const soldMap = {};
      (vault.activeStoreData.txEvents || []).forEach((evt) => {
        if (evt.voided || evt.type !== 'sale' || evt.ts < cutoff) return;
        (evt.items || []).forEach((line) => {
          if (!soldMap[line.itemId]) soldMap[line.itemId] = { qty: 0, revenue: 0, name: line.name };
          soldMap[line.itemId].qty += Number(line.isWeigh ? line.weight : line.qty) || 0;
          soldMap[line.itemId].revenue += Number(line.subtotal || 0);
        });
      });

      const topSelling = Object.entries(soldMap)
        .map(([itemId, stat]) => ({ itemId, ...stat }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const stagnant = Object.values(vault.activeStoreData.catalog || {})
        .filter((i) => !i.archived && Number(i.stock || 0) > 0 && !soldMap[i.id])
        .slice(0, 15);

      return { topSelling, stagnant };
    },

    async importPosCsv(csvText) {
      const lex = this.getVault().getLexicon();
      const lines = String(csvText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('CSV 内容为空或缺少数据行');
      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 3) continue;
        const [plu, name, retailStr, costStr, barcode, unit] = cols;
        if (!name) continue;
        await this.upsertCatalogItem({
          plu: plu || '',
          name,
          retailPrice: parseFloat(retailStr) || 0,
          costPrice: parseFloat(costStr) || 0,
          barcode: barcode || '',
          unit: unit || lex.weighUnit || '斤',
          supplierName: '一体机同步'
        });
        imported++;
      }
      return imported;
    },

    async recordStandalonePosSummary({ totalAmount, cashAmount = 0, digitalAmount = 0, note = '' }) {
      const vault = this.getVault();
      const total = Number(totalAmount || 0);
      if (total <= 0) throw new Error('请输入一体机日结有效营业额');
      return await vault.appendEvent({
        type: 'sale',
        amount: total,
        payMethod: 'pos_sync',
        items: [],
        note: note || `一体机日结合并（现金¥${Number(cashAmount).toFixed(2)} / 扫码¥${Number(digitalAmount).toFixed(2)}）`
      });
    },

    buildWeighLabelBarcode(plu, amountYuan) {
      const hw = this.getVault().getPolicy().hardware;
      const prefix = (hw.weighBarcodePrefixes && hw.weighBarcodePrefixes[0]) || '22';
      const pluPad = String(plu || '1').replace(/\D/g, '').padStart(hw.pluLength || 5, '0').slice(-(hw.pluLength || 5));
      const valInt = Math.round(Number(amountYuan || 0) * (hw.valueDivisor || 100));
      const valPad = String(valInt).padStart(hw.valueLength || 5, '0').slice(-(hw.valueLength || 5));
      const body12 = `${prefix}${pluPad}${valPad}`;
      let sum = 0;
      for (let i = 0; i < body12.length; i++) {
        sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
      }
      const checkDigit = (10 - (sum % 10)) % 10;
      return `${body12}${checkDigit}`;
    },

    printPriceTags(items, isWeighTag = false) {
      const vault = this.getVault();
      const lex = vault.getLexicon();
      const storeName = vault.activeStoreData.storeName;
      const cards = items.map((item) => {
        const weighCode = isWeighTag ? this.buildWeighLabelBarcode(item.plu || '101', item.tagTotal || item.retailPrice) : '';
        return `
          <div style="border:1.5px solid #0f172a;border-radius:6px;padding:8px 10px;width:46mm;display:inline-block;margin:4px;vertical-align:top;font-family:sans-serif;">
            <div style="font-size:10px;color:#475569;display:flex;justify-content:space-between;"><span>${storeName}</span><span>${item.shelfLoc || ''}</span></div>
            <div style="font-weight:bold;font-size:14px;margin:4px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</div>
            ${isWeighTag ? `<div style="font-size:11px;">单价:¥${Number(item.retailPrice).toFixed(2)}/${lex.weighUnit} · 净重:${item.tagWeight || 1}${lex.weighUnit}</div>` : ''}
            <div style="font-size:20px;font-weight:900;color:#dc2626;margin-top:2px;">¥${Number(isWeighTag ? (item.tagTotal || item.retailPrice) : item.retailPrice).toFixed(2)}<span style="font-size:11px;color:#334155;font-weight:normal;">/${isWeighTag ? '份' : (item.unit || lex.unitDefault)}</span></div>
            ${weighCode ? `<div style="font-family:monospace;font-size:10px;letter-spacing:1px;margin-top:4px;border-top:1px dashed #94a3b8;padding-top:2px;">*${weighCode}*</div>` : ''}
          </div>`;
      }).join('');

      const win = window.open('', '_blank', 'width=480,height=640');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>价签打印</title></head>
        <body style="padding:10px;">${cards}<script>window.onload=function(){window.print();}</script></body></html>`);
      win.document.close();
    },

    async transferStockBetweenStores({ targetStoreId, itemId, qty }) {
      const vault = this.getVault();
      if (!vault.hasPerm('transfer')) throw new Error('当前视角无分店调拨权限');
      const srcStore = vault.activeStoreData;
      if (srcStore.storeId === targetStoreId) throw new Error('不能调拨给当前同一家门店');
      const srcItem = srcStore.catalog[itemId];
      if (!srcItem) throw new Error('本店无此项目');
      const moveQty = Number(qty || 0);
      if (moveQty <= 0) throw new Error('请输入有效调拨数量');

      const targetKey = `sdxt_store_data_${targetStoreId}`;
      const targetStore = await vault.idbGet(targetKey);
      if (!targetStore) throw new Error('目标分店账本未初始化，请先切换激活一次该分店');

      srcItem.stock = Number((Number(srcItem.stock || 0) - moveQty).toFixed(3));
      const matchedTarget = Object.values(targetStore.catalog || {}).find(
        (i) => (srcItem.barcode && i.barcode === srcItem.barcode) || i.name === srcItem.name
      );
      if (matchedTarget) {
        matchedTarget.stock = Number((Number(matchedTarget.stock || 0) + moveQty).toFixed(3));
      } else {
        const cloneId = 'itm_' + Date.now().toString(36);
        targetStore.catalog[cloneId] = { ...JSON.parse(JSON.stringify(srcItem)), id: cloneId, stock: moveQty };
      }

      await vault.idbSet(targetKey, targetStore);
      await vault.appendEvent({
        type: 'transfer',
        amount: Number((moveQty * Number(srcItem.costPrice || 0)).toFixed(2)),
        items: [{ itemId: srcItem.id, name: srcItem.name, qty: moveQty }],
        note: `调出至【${targetStore.storeName}】${moveQty}${srcItem.unit || '件'}`
      });
      return true;
    },

    async getMultiStoreDashboard(range = 'today') {
      const vault = this.getVault();
      if (!vault.hasPerm('viewCost')) throw new Error('请先解锁掌柜安全码查看经营大盘');

      const now = new Date();
      let startTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      if (range === 'month') startTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      else if (range === 'all') startTs = 0;

      let totalRevenue = 0;
      let totalCost = 0;
      let totalExpense = 0;
      const storeBreakdown = [];

      for (const st of vault.meta.stores) {
        const bucket = st.id === vault.activeStoreData.storeId
          ? vault.activeStoreData
          : await vault.idbGet(`sdxt_store_data_${st.id}`);
        if (!bucket) continue;

        let rev = 0;
        let cost = 0;
        let exp = 0;
        const catalog = bucket.catalog || {};

        (bucket.txEvents || []).forEach((e) => {
          if (e.voided || e.ts < startTs) return;
          if (e.type === 'sale' || e.type === 'refund') {
            rev += Number(e.amount || 0);
            (e.items || []).forEach((line) => {
              const itm = catalog[line.itemId];
              if (itm) {
                const unitCount = line.isWeigh ? Number(line.weight || 0) : Number(line.qty || 0);
                cost += unitCount * Number(itm.costPrice || 0);
              }
            });
          } else if (e.type === 'expense') {
            exp += Math.abs(Number(e.amount || 0));
          }
        });

        const netProfit = Number((rev - cost - exp).toFixed(2));
        totalRevenue += rev;
        totalCost += cost;
        totalExpense += exp;
        storeBreakdown.push({
          storeId: st.id,
          storeName: st.name,
          revenue: Number(rev.toFixed(2)),
          cost: Number(cost.toFixed(2)),
          expense: Number(exp.toFixed(2)),
          netProfit
        });
      }

      return {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalCost: Number(totalCost.toFixed(2)),
        totalExpense: Number(totalExpense.toFixed(2)),
        totalNetProfit: Number((totalRevenue - totalCost - totalExpense).toFixed(2)),
        storeBreakdown
      };
    },

    async recordExpense({ title, amount, payMethod = 'cash' }) {
      const vault = this.getVault();
      if (!vault.hasPerm('expense')) throw new Error('当前视角无记杂费权限');
      const val = Math.abs(Number(amount || 0));
      if (val <= 0) throw new Error('请输入有效支出金额');
      return await vault.appendEvent({
        type: 'expense',
        amount: -val,
        payMethod,
        note: title || '门店日常杂费'
      });
    },

    async closeShiftHandover({ floatCash = 0, countedCash = 0, note = '' }) {
      const vault = this.getVault();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const startTs = todayStart.getTime();

      let cashIn = 0;
      let digitalIn = 0;
      let cashOut = 0;

      (vault.activeStoreData.txEvents || []).forEach((e) => {
        if (e.voided || e.ts < startTs) return;
        const amt = Number(e.amount || 0);
        if (e.type === 'sale' || e.type === 'credit_pay' || e.type === 'topup' || e.type === 'deposit_in') {
          if (e.payMethod === 'cash') cashIn += amt;
          else digitalIn += amt;
        } else if (e.type === 'refund' || e.type === 'expense' || e.type === 'deposit_out') {
          if (e.payMethod === 'cash') cashOut += Math.abs(amt);
        }
      });

      const expectedDrawerCash = Number((Number(floatCash) + cashIn - cashOut).toFixed(2));
      const diffCash = Number((Number(countedCash) - expectedDrawerCash).toFixed(2));
      const staff = vault.getActiveStaff();

      const record = {
        shiftId: 'shf_' + Date.now().toString(36),
        ts: Date.now(),
        staffName: staff.name,
        floatCash: Number(floatCash),
        cashIn: Number(cashIn.toFixed(2)),
        digitalIn: Number(digitalIn.toFixed(2)),
        cashOut: Number(cashOut.toFixed(2)),
        expectedDrawerCash,
        countedCash: Number(countedCash),
        diffCash,
        note
      };

      vault.activeStoreData.shiftLogs.push(record);
      await vault.persistStore();
      return record;
    }
  };

  global.StoreCatalogPricing = StoreCatalogPricing;
})(window);
