import { supabase } from '../../lib/supabase.js';
import { StoreService } from '../../services/storeService.js';
import { SETTLEMENT_CONFIG, RETURN_REASONS, EXCHANGE_REASONS } from '../../constants/settlement.js';
import {
  storeState,
  safeSetText,
  computePickupPin,
  getStorePriceInfo,
  saveAgentCart,
  notifyVendorWebhook
} from './storeState.js';

async function uploadProofBlobToStorage(base64Data) {
  if (!base64Data || !base64Data.startsWith('data:image')) return base64Data;
  try {
    const res = await fetch(base64Data);
    const blob = await res.blob();
    const fileName = `store_proofs/${storeState.currentAgent}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage.from('supply-images').upload(fileName, blob, { contentType: 'image/jpeg' });
    if (error) return base64Data;
    const { data } = supabase.storage.from('supply-images').getPublicUrl(fileName);
    return data?.publicUrl || base64Data;
  } catch (e) {
    return base64Data;
  }
}

function renderProofImagesStrip() {
  const preview = document.getElementById('proof-preview-container');
  if (preview) {
    preview.innerHTML = storeState.uploadedProofImages
      .map((src) => `<img src="${src}" class="w-12 h-12 rounded-lg object-cover border border-stone-300">`)
      .join('');
  }
}

function renderSlipItemList(containerId, items, type) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = items
    .map((it) => {
      const unit = it.measure_unit || '箱';
      if (type === 'order') {
        return `
        <div class="flex justify-between items-center py-1.5 border-b border-stone-50">
          <div>
            <b class="text-stone-800 text-xs">${it.name}</b>
            <span class="text-[10px] text-stone-400 block">${it.spec || '整装'} · ¥${it.price.toFixed(2)} x ${it.qty}${unit}</span>
          </div>
          <b class="text-stone-900 font-mono text-xs">¥${(it.price * it.qty).toFixed(2)}</b>
        </div>
      `;
      } else if (type === 'return') {
        return `
        <div class="flex justify-between items-center py-1.5 border-b border-rose-100/40 text-rose-700">
          <div>
            <b class="text-xs">${it.name}</b>
            <span class="text-[10px] text-rose-500 block">原价 ¥${it.price.toFixed(2)} x ${it.qty}${unit} · [${it.reason}]</span>
          </div>
          <b class="font-mono text-xs">-¥${(it.price * it.qty).toFixed(2)}</b>
        </div>
      `;
      } else {
        return `
        <div class="flex justify-between items-center py-1.5 border-b border-amber-100/40 text-amber-900">
          <div>
            <b class="text-xs">${it.name}</b>
            <span class="text-[10px] text-amber-700 block">平价对换 x ${it.qty}${unit} · [${it.reason}]</span>
          </div>
          <span class="font-mono text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">差额 ¥0.00</span>
        </div>
      `;
      }
    })
    .join('');
}

export function updateCartSummary() {
  let orderTotal = 0,
    returnTotal = 0,
    orderCount = 0,
    returnCount = 0,
    exchangeCount = 0;

  for (const [id, data] of Object.entries(storeState.cart)) {
    const prod = storeState.allProducts.find((x) => x.id === parseInt(id));
    if (!prod) continue;
    const { price } = getStorePriceInfo(prod);

    if (data.order > 0) {
      orderTotal += price * data.order;
      orderCount += data.order;
    }
    if (data.return > 0) {
      const retPrice = data.returnPrice || price;
      returnTotal += retPrice * data.return;
      returnCount += data.return;
    }
    if (data.exchange > 0) {
      exchangeCount += data.exchange;
    }
  }

  const hasSpecial = returnCount > 0 || exchangeCount > 0;
  const netTotal = Math.max(0, orderTotal - returnTotal);
  safeSetText('cart-total-amount', netTotal.toFixed(2));
  safeSetText('cart-count-badge', orderCount + returnCount + exchangeCount);

  const labelEl = document.getElementById('cart-total-label');
  if (labelEl) {
    labelEl.innerText = hasSpecial ? '预结净资 (补-退):' : '本次应结金额:';
  }

  const btnTextEl = document.getElementById('btn-submit-order-text');
  if (btnTextEl) {
    btnTextEl.innerText = hasSpecial ? '生成调退履约契单' : '生成送货凭单';
  }

  const detailEl = document.getElementById('cart-detail-subtext');
  if (detailEl) {
    detailEl.innerText = hasSpecial
      ? `补 ${orderCount} | 退 ${returnCount} (-¥${returnTotal.toFixed(1)}) | 换 ${exchangeCount}`
      : `补货 ${orderCount} 件`;
  }
}

export async function checkVendorProposalBadge() {
  if (!storeState.currentStore) return;
  const { data: proposals } = await supabase
    .from('store_order')
    .select('id')
    .eq('store_id', storeState.currentStore.id)
    .eq('tenant_id', storeState.currentAgent)
    .eq('order_status', 'counter_proposal');

  const count = proposals ? proposals.length : 0;
  const badgePing = document.getElementById('badge-vendor-feedback');
  const dot = document.getElementById('dot-vendor-feedback');
  const menuCount = document.getElementById('menu-proposal-count');

  if (count > 0) {
    badgePing?.classList.remove('hidden');
    dot?.classList.remove('hidden');
    if (menuCount) {
      menuCount.innerText = `${count}条修润建议`;
      menuCount.classList.remove('hidden');
    }
  } else {
    badgePing?.classList.add('hidden');
    dot?.classList.add('hidden');
    menuCount?.classList.add('hidden');
  }
}

export function initCartSlipBindings(callbacks) {
  window.initProdItemState = (id) => {
    if (!storeState.cart[id]) {
      storeState.cart[id] = {
        order: 0,
        return: 0,
        exchange: 0,
        returnReason: RETURN_REASONS[0],
        exchangeReason: EXCHANGE_REASONS[0],
        returnPrice: null
      };
    }
  };

  window.changeOrderQty = (id, delta) => {
    window.initProdItemState(id);
    const prod = storeState.allProducts.find((x) => x.id === id);
    const stock = prod?.stock ?? 999;
    const unit = prod?.measure_unit || prod?.pack_unit || '箱';
    const rationLimit = parseInt(storeState.currentTenantSettings?.rationLimitQty || 0);
    let newQty = storeState.cart[id].order + delta;

    if (newQty < 0) newQty = 0;
    if (rationLimit > 0 && newQty > rationLimit) {
      alert(`🛡️ 常平仓紧缺定额配给提示：\n当前货品处于按需定额配给期，单笔最多限订 ${rationLimit} ${unit}（保障千家万户均分不断供）。`);
      newQty = rationLimit;
    }
    if (newQty > stock) {
      alert(`在库现货仅剩 ${stock} ${unit}！`);
      newQty = stock;
    }

    storeState.cart[id].order = newQty;
    saveAgentCart();
    safeSetText(`qty-order-${id}`, newQty);
    updateCartSummary();
  };

  window.openReturnDrawer = async (id) => {
    if (!storeState.allowStoreSelfReturn) {
      return alert('当前供货方未开启门店自主退货通道，如需退货请联系供货调度台处理。');
    }
    window.initProdItemState(id);
    const prod = storeState.allProducts.find((x) => x.id === id);
    if (!prod) return;
    if (!storeState.currentStore) return alert('当前供货方未绑定有效门店档案，无法追溯订购！');

    const quota = await StoreService.getProductReturnableQuota(storeState.currentStore.id, storeState.currentAgent, id);
    if (quota.maxReturnable <= 0) {
      return alert(`⚠️ 商道信义提示：\n本店在【${storeState.currentAgent}】处暂无【${prod.name}】的历史有效余量！\n系统严格追溯进货存根，不进不退。`);
    }

    const unit = prod.measure_unit || prod.pack_unit || '箱';
    const origPrice = quota.lastPrice || getStorePriceInfo(prod).price;
    storeState.cart[id].returnPrice = origPrice;

    const currentReturnQty = storeState.cart[id].return || 1;
    const input = prompt(
      `🔄 登记退货验还：【${prod.name}】\n` +
        `• 追溯原单: ${quota.lastOrderNo || '线上记录'}\n` +
        `• 历史原进价: ¥${origPrice.toFixed(2)} /${unit}\n` +
        `• 累计进: ${quota.totalOrdered}${unit} | 已退换: ${quota.totalReturned}${unit}\n` +
        `• 【当前最大可退上限】: ${quota.maxReturnable} ${unit}\n\n` +
        `请输入本次退货件数 (设为0取消):`,
      Math.min(currentReturnQty, quota.maxReturnable)
    );

    if (input === null) return;
    const parsedQty = parseInt(input);
    if (isNaN(parsedQty) || parsedQty < 0) return alert('请输入有效的件数！');
    if (parsedQty > quota.maxReturnable) {
      return alert(`⚠️ 超额拦截：本次退货 ${parsedQty} ${unit}，超出历史进货余量 (${quota.maxReturnable} ${unit})！依规严禁超额抵扣。`);
    }

    storeState.cart[id].return = parsedQty;
    if (parsedQty > 0) {
      const reasonIndex = prompt(
        `请选择合规验退原由：\n1. ${RETURN_REASONS[0]}\n2. ${RETURN_REASONS[1]}\n3. ${RETURN_REASONS[2]}\n4. ${RETURN_REASONS[3]}\n请输入序号(1-4):`,
        '1'
      );
      const idx = parseInt(reasonIndex) - 1;
      storeState.cart[id].returnReason = RETURN_REASONS[idx] || RETURN_REASONS[0];
    }

    saveAgentCart();
    callbacks?.onRenderProducts?.();
    updateCartSummary();
  };

  window.openExchangeDrawer = async (id) => {
    if (!storeState.allowStoreSelfReturn) {
      return alert('当前供货方未开启门店自主换货通道，如需调换请联系供货调度台处理。');
    }
    window.initProdItemState(id);
    const prod = storeState.allProducts.find((x) => x.id === id);
    if (!prod) return;
    if (!storeState.currentStore) return alert('当前供货方未绑定有效门店档案！');

    const quota = await StoreService.getProductReturnableQuota(storeState.currentStore.id, storeState.currentAgent, id);
    if (quota.maxReturnable <= 0) {
      return alert(`⚠️ 本店无【${prod.name}】历史进货余量，无法发起对调平换！`);
    }

    const unit = prod.measure_unit || prod.pack_unit || '箱';
    const currentExchangeQty = storeState.cart[id].exchange || 1;
    const input = prompt(
      `🔀 登记等价平换：【${prod.name}】\n` +
        `• 规则: 一新换一旧 (差额 ¥0.00)\n` +
        `• 关联历史进货余量上限: ${quota.maxReturnable} ${unit}\n\n` +
        `请输入调换件数 (设为0取消):`,
      Math.min(currentExchangeQty, quota.maxReturnable)
    );

    if (input === null) return;
    const parsedQty = parseInt(input);
    if (isNaN(parsedQty) || parsedQty < 0) return alert('请输入有效的件数！');
    if (parsedQty > quota.maxReturnable) {
      return alert(`⚠️ 调换件数不能超过历史进货余量 (${quota.maxReturnable} ${unit})！`);
    }

    storeState.cart[id].exchange = parsedQty;
    if (parsedQty > 0) {
      const reasonIndex = prompt(
        `请选择调换原由：\n1. ${EXCHANGE_REASONS[0]}\n2. ${EXCHANGE_REASONS[1]}\n3. ${EXCHANGE_REASONS[2]}\n请输入序号(1-3):`,
        '1'
      );
      const idx = parseInt(reasonIndex) - 1;
      storeState.cart[id].exchangeReason = EXCHANGE_REASONS[idx] || EXCHANGE_REASONS[0];
    }

    saveAgentCart();
    callbacks?.onRenderProducts?.();
    updateCartSummary();
  };

  window.openSettlementModal = () => {
    const orderItems = [];
    const returnItems = [];
    const exchangeItems = [];

    for (const [id, data] of Object.entries(storeState.cart)) {
      const p = storeState.allProducts.find((x) => x.id === parseInt(id));
      if (!p) continue;
      const { price } = getStorePriceInfo(p);
      const unit = p.measure_unit || p.pack_unit || '箱';

      if (data.order > 0) {
        orderItems.push({ id: p.id, name: p.name, spec: p.spec, measure_unit: unit, price, qty: data.order });
      }
      if (data.return > 0) {
        returnItems.push({
          id: p.id,
          name: p.name,
          spec: p.spec,
          measure_unit: unit,
          price: data.returnPrice || price,
          qty: data.return,
          reason: data.returnReason
        });
      }
      if (data.exchange > 0) {
        exchangeItems.push({
          id: p.id,
          name: p.name,
          spec: p.spec,
          measure_unit: unit,
          qty: data.exchange,
          reason: data.exchangeReason
        });
      }
    }

    if (orderItems.length === 0 && returnItems.length === 0 && exchangeItems.length === 0) {
      return alert('当前待配篮空空如也，请先挑选良品！');
    }

    const allowed =
      storeState.currentStore && Array.isArray(storeState.currentStore.allowed_settlements)
        ? storeState.currentStore.allowed_settlements
        : ['cash', 'credit'];

    const curSettlementSelect = document.getElementById('slip-settlement-select');
    if (curSettlementSelect) {
      const validEntries = Object.entries(SETTLEMENT_CONFIG).filter(([key]) => allowed.includes(key));
      curSettlementSelect.innerHTML = validEntries
        .map(([key, val]) => `<option value="${key}" ${key === storeState.currentSettlementType ? 'selected' : ''}>${val.label}</option>`)
        .join('');
    }

    const isSpecialOrder = returnItems.length > 0 || exchangeItems.length > 0;
    const headerTitle = document.getElementById('slip-modal-header-title');
    const badgeSpecial = document.getElementById('badge-special-order');
    const boxReturn = document.getElementById('box-return-items');
    const boxExchange = document.getElementById('box-exchange-items');
    const summaryRows = document.getElementById('slip-summary-rows');
    const netLabel = document.getElementById('slip-net-label');
    const proofBox = document.getElementById('slip-proof-upload-box');

    if (isSpecialOrder) {
      if (headerTitle) headerTitle.innerText = '随车送货履约契单';
      badgeSpecial?.classList.remove('hidden');
      boxReturn?.classList.toggle('hidden', returnItems.length === 0);
      boxExchange?.classList.toggle('hidden', exchangeItems.length === 0);
      summaryRows?.classList.remove('hidden');
      if (netLabel) netLabel.innerText = '实结净资额度：';
      proofBox?.classList.remove('hidden');
    } else {
      if (headerTitle) headerTitle.innerText = '随车送货签收凭单';
      badgeSpecial?.classList.add('hidden');
      boxReturn?.classList.add('hidden');
      boxExchange?.classList.add('hidden');
      summaryRows?.classList.add('hidden');
      if (netLabel) netLabel.innerText = '本次应结金额：';
      proofBox?.classList.add('hidden');
    }

    renderSlipItemList('slip-order-items-list', orderItems, 'order');
    if (returnItems.length > 0) renderSlipItemList('slip-return-items-list', returnItems, 'return');
    if (exchangeItems.length > 0) renderSlipItemList('slip-exchange-items-list', exchangeItems, 'exchange');

    const orderTotal = orderItems.reduce((a, b) => a + b.price * b.qty, 0);
    const returnTotal = returnItems.reduce((a, b) => a + b.price * b.qty, 0);
    const netTotal = Math.max(0, orderTotal - returnTotal);

    safeSetText('slip-order-total', `¥${orderTotal.toFixed(2)}`);
    safeSetText('slip-return-total', `-¥${returnTotal.toFixed(2)}`);
    safeSetText('slip-net-total', `¥${netTotal.toFixed(2)}`);

    window.openModal('settlement-slip-modal');
  };

  window.handleProofUpload = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = function (ev) {
        const img = new Image();
        img.onload = async function () {
          const canvasEl = document.createElement('canvas');
          const maxDim = 640;
          let w = img.width,
            h = img.height;
          if (w > h && w > maxDim) {
            h *= maxDim / w;
            w = maxDim;
          } else if (h > maxDim) {
            w *= maxDim / h;
            h = maxDim;
          }
          canvasEl.width = w;
          canvasEl.height = h;
          canvasEl.getContext('2d').drawImage(img, 0, 0, w, h);

          const base64 = canvasEl.toDataURL('image/jpeg', 0.72);
          const idx = storeState.uploadedProofImages.length;
          storeState.uploadedProofImages.push(base64);
          renderProofImagesStrip();

          const cdnUrl = await uploadProofBlobToStorage(base64);
          if (storeState.uploadedProofImages[idx]) {
            storeState.uploadedProofImages[idx] = cdnUrl;
            renderProofImagesStrip();
          }
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
    alert('📷 异常凭据拍照已附存！');
  };

  window.confirmAndSubmitOrder = async () => {
    const settlementSelect = document.getElementById('slip-settlement-select');
    const settlementType = settlementSelect ? settlementSelect.value : 'credit';
    let customNote = document.getElementById('slip-custom-note')?.value.trim() || '';

    if (
      storeState.currentTenantSettings?.campaignActive &&
      Array.isArray(storeState.currentTenantSettings?.promos) &&
      storeState.currentTenantSettings.promos.length > 0
    ) {
      const promoText = storeState.currentTenantSettings.promos.map((pr) => `${pr.title}:${pr.rule}`).join('；');
      customNote = `${customNote} [生效活动:${promoText}]`.trim();
    }

    const orderItems = [];
    const returnItems = [];
    const exchangeItems = [];

    for (const [id, data] of Object.entries(storeState.cart)) {
      const p = storeState.allProducts.find((x) => x.id === parseInt(id));
      if (!p) continue;
      const { price } = getStorePriceInfo(p);
      const unit = p.measure_unit || p.pack_unit || '箱';

      if (data.order > 0) orderItems.push({ id: p.id, name: p.name, spec: p.spec, measure_unit: unit, price, qty: data.order });
      if (data.return > 0)
        returnItems.push({
          id: p.id,
          name: p.name,
          spec: p.spec,
          measure_unit: unit,
          price: data.returnPrice || price,
          qty: data.return,
          reason: data.returnReason
        });
      if (data.exchange > 0) exchangeItems.push({ id: p.id, name: p.name, spec: p.spec, measure_unit: unit, qty: data.exchange, reason: data.exchangeReason });
    }

    const orderTotal = orderItems.reduce((a, b) => a + b.price * b.qty, 0);
    const returnTotal = returnItems.reduce((a, b) => a + b.price * b.qty, 0);
    const netTotal = Math.max(0, orderTotal - returnTotal);

    // 动作级精准熔断检查：合作门店端下单 (store_write) + 大额限流保护
    if (
      window.checkBusinessCircuit &&
      !(await window.checkBusinessCircuit('store_write', storeState.currentAgent, { amount: netTotal }))
    ) {
      return;
    }

    const btn = document.getElementById('btn-slip-confirm');
    if (btn) {
      btn.disabled = true;
      btn.innerText = '正在传达供货方...';
    }

    try {
      const storeName = storeState.currentStore ? storeState.currentStore.name : '厚德便民门店';
      await StoreService.submitComprehensiveOrder({
        tenantId: storeState.currentAgent,
        storeId: storeState.currentStore ? storeState.currentStore.id : 1,
        storeName,
        driverName: storeState.currentStore ? storeState.currentStore.driver_name : '老张师傅',
        orderSource: 'store_order',
        settlementType,
        settlementNote: customNote,
        itemsOrder: orderItems,
        itemsReturn: returnItems,
        itemsExchange: exchangeItems,
        orderTotal,
        returnTotal,
        netTotal,
        note: storeState.deliveryNote,
        proofImages: storeState.uploadedProofImages,
        currentDebt: storeState.currentStore?.current_debt || 0
      });

      const itemsSummary = orderItems.map((i) => `${i.name}x${i.qty}${i.measure_unit || '件'}`).join('、');
      const webhookMsg =
        `📦【门店补货单提醒】\n` +
        `需求门店：${storeName}\n` +
        `交割方式：${settlementType} | 应结净额：¥${netTotal.toFixed(2)}\n` +
        `货品明细：${itemsSummary || '退换货单'}\n` +
        (storeState.deliveryNote ? `随车口信：${storeState.deliveryNote}\n` : '') +
        `请登录平准调度台审核接单并生成装车总拣货单。`;
      await notifyVendorWebhook(storeState.currentAgent, webhookMsg);

      alert(`🎉 凭单已顺利传达供货合作方！\n应结净额: ¥${netTotal.toFixed(2)}\n对方确认后由送货师傅随车送抵！`);

      for (const k of Object.keys(storeState.cart)) delete storeState.cart[k];
      saveAgentCart();
      storeState.uploadedProofImages = [];
      storeState.deliveryNote = '';
      window.closeModal('settlement-slip-modal');
      await callbacks?.onReloadTerminal?.();
    } catch (err) {
      alert(`传达失败: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = '✅ 确认凭单 · 传至供货方';
      }
    }
  };

  window.repeatLastOrder = async function () {
    if (!storeState.currentStore) return alert('当前供货方未绑定有效门店档案！');
    const myOrders = await StoreService.getMyOrders(storeState.currentStore.id, storeState.currentAgent);
    if (!myOrders || myOrders.length === 0) return alert('暂无往来补货存根！');

    const lastOrder = myOrders[0];
    const items = Array.isArray(lastOrder.items) ? lastOrder.items : [];
    if (items.length === 0) return alert('上张契单无明细商品');

    let addedCount = 0;
    for (const it of items) {
      if (it.id && it.qty) {
        window.initProdItemState(it.id);
        const prod = storeState.allProducts.find((p) => p.id === it.id);
        const stock = prod?.stock ?? 999;
        storeState.cart[it.id].order = Math.min(it.qty, stock);
        addedCount++;
      }
    }

    saveAgentCart();
    callbacks?.onRenderProducts?.();
    updateCartSummary();
    alert(`✅ 已一键填回上单的 ${addedCount} 样常备良品！`);
  };

  window.clearCurrentCart = function () {
    if (Object.keys(storeState.cart).length === 0) return alert('待配篮已经是空的');
    const curName = storeState.myAgents.find((a) => a.id === storeState.currentAgent)?.name || storeState.currentAgent;
    if (confirm(`确认清空【${curName}】的待配品物？`)) {
      for (const k of Object.keys(storeState.cart)) delete storeState.cart[k];
      saveAgentCart();
      callbacks?.onRenderProducts?.();
      updateCartSummary();
    }
  };

  window.verifyMallPickupPin = async function (orderId, orderNoSeed) {
    // 动作级精准熔断检查：门店核销自提 (store_write)
    if (window.checkBusinessCircuit && !(await window.checkBusinessCircuit('store_write', storeState.currentAgent))) {
      return;
    }

    const expectedPin = computePickupPin({ id: orderId, order_no: orderNoSeed });
    const inputPin = prompt('请输入街坊出示的 4 位数字提货核销码：');
    if (inputPin === null) return;
    if (inputPin.trim() !== expectedPin) {
      return alert('⚠️ 提货核销码不匹配！请请街坊打开百工天街「我的预订」核对 4 位数字。');
    }

    const { data: ord } = await supabase.from('store_order').select('note').eq('id', orderId).single();
    const nextNote = `${ord?.note || ''} [街坊已凭码自提核销]`.trim();
    const { error } = await supabase
      .from('store_order')
      .update({ note: nextNote, delivery_status: 'delivered', order_status: 'delivered' })
      .eq('id', orderId);

    if (error) return alert('核销写入失败：' + error.message);

    alert('🎉 提货码核验通过！包裹已交付街坊，本单邻里服务润利已正式记入本店台账。');
    window.openReceiptsModal();
  };

  window.openReceiptsModal = async () => {
    if (!storeState.currentStore) return alert('当前供货方未绑定有效门店档案！');
    window.openModal('receipts-modal');

    const [myOrders, myReceipts, pickupOrders] = await Promise.all([
      StoreService.getMyOrders(storeState.currentStore.id, storeState.currentAgent),
      StoreService.getMyReceipts(storeState.currentStore.id, storeState.currentAgent),
      StoreService.getStoreMallPickupOrders(storeState.currentStore.id)
    ]);

    const pickupBox = document.getElementById('mall-pickup-orders-box');
    const pickupListEl = document.getElementById('mall-pickup-orders-list');
    if (pickupBox && pickupListEl) {
      if (pickupOrders.length > 0) {
        pickupBox.classList.remove('hidden');
        pickupListEl.innerHTML = pickupOrders
          .map((po) => {
            const items = Array.isArray(po.items) ? po.items : [];
            const itemsStr = items.map((it) => `${it.name} x${it.qty}${it.measure_unit || '件'}`).join('、');
            const isDelivered = po.delivery_status === 'delivered';
            const isPickedUp = String(po.note || '').includes('[街坊已凭码自提核销]');
            return `
            <div class="p-2.5 bg-amber-50/80 border border-amber-300 rounded-xl space-y-1.5 text-xs">
              <div class="flex justify-between items-center font-bold">
                <span class="font-mono text-stone-900">#${po.order_no || po.id}</span>
                <span class="text-[10px] px-1.5 py-0.2 rounded ${
                  isPickedUp ? 'bg-stone-200 text-stone-700' : isDelivered ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200 text-amber-950'
                }">
                  ${isPickedUp ? '✅ 街坊已凭码提走' : isDelivered ? '📦 已到店待街坊自提' : '🚚 待送货师傅捎带到店'}
                </span>
              </div>
              <div class="text-[11px] text-stone-800 font-bold">货品：${itemsStr}</div>
              <div class="text-[10px] text-stone-600">${po.note || ''}</div>
              <div class="flex justify-between items-center pt-1 border-t border-amber-200/60">
                <span class="text-[10px] text-emerald-900 font-bold">🤝 邻里润利归本店 · 实付 ¥${parseFloat(po.total_amount || 0).toFixed(2)}</span>
                ${
                  !isPickedUp
                    ? `<button type="button" onclick="window.verifyMallPickupPin(${po.id}, '${po.order_no || po.id}')" class="bg-[#1b4332] hover:bg-[#143628] text-white font-bold px-2.5 py-1 rounded-lg text-[10px] shadow-xs active:scale-95">🔑 输4位码核销自提</button>`
                    : ''
                }
              </div>
            </div>
          `;
          })
          .join('');
      } else {
        pickupBox.classList.add('hidden');
      }
    }

    const ordersListEl = document.getElementById('my-orders-list');
    if (ordersListEl) {
      ordersListEl.innerHTML =
        myOrders
          .map((o) => {
            const orderItems = Array.isArray(o.items) ? o.items : [];
            const returnItems = Array.isArray(o.items_return) ? o.items_return : [];
            const exchangeItems = Array.isArray(o.items_exchange) ? o.items_exchange : [];

            const orderStr = orderItems.map((it) => `${it.name} x ${it.qty}${it.measure_unit || '件'}`).join('、');
            const returnStr = returnItems.map((it) => `退:${it.name}x${it.qty}`).join('、');
            const exchangeStr = exchangeItems.map((it) => `换:${it.name}x${it.qty}`).join('、');

            let statusBadge = '<span class="text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded font-bold">🚚 排单备发</span>';
            if (o.order_status === 'counter_proposal') {
              statusBadge = '<span class="text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-bold animate-pulse">💬 供货方有修润建议</span>';
            } else if (o.order_status === 'confirmed') {
              statusBadge = '<span class="text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded font-bold">✅ 供货方已确认接单</span>';
            } else if (o.delivery_status === 'delivered') {
              statusBadge = '<span class="text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded">📦 已经交割平账</span>';
            }

            return `
          <div class="p-3 bg-stone-50 border ${o.order_status === 'counter_proposal' ? 'border-amber-400 bg-amber-50/30' : 'border-stone-200'} rounded-2xl space-y-1.5 text-xs">
            <div class="flex justify-between items-center font-bold">
              <span class="text-stone-800">流水 #${o.order_no || o.id}</span>
              ${statusBadge}
            </div>

            ${
              o.order_status === 'counter_proposal'
                ? `
              <div class="p-2 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 space-y-1">
                <div class="font-bold flex items-center gap-1 text-[11px]"><span>📢 供货方商榷建议：</span></div>
                <div class="text-[11px] leading-snug">${o.vendor_feedback || '供货方对单据有微调建议，请查阅。'}</div>
                <div class="pt-1 flex gap-2 justify-end">
                  <button type="button" onclick="window.cancelProposalOrder(${o.id})" class="px-2 py-1 rounded-lg bg-stone-200 text-stone-600 text-[10px] font-bold">撤单作罢</button>
                  <button type="button" onclick="window.acceptProposalAndReload(${o.id})" class="px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold shadow">按建议微调重发</button>
                </div>
              </div>
            `
                : ''
            }

            <div class="text-[10px] text-stone-600">📦 补货: ${orderStr || '无'}</div>
            ${returnStr ? `<div class="text-[10px] text-rose-600 font-medium">🔄 验退: ${returnStr}</div>` : ''}
            ${exchangeStr ? `<div class="text-[10px] text-amber-800 font-medium">🔀 对调: ${exchangeStr}</div>` : ''}

            <div class="flex justify-between items-center text-[10px] text-stone-400 pt-1 border-t border-stone-100">
              <span>实结: <b class="text-stone-800 font-mono">¥${parseFloat(o.net_settle_amount || o.total_amount).toFixed(2)}</b> (${o.settlement_type})</span>
              <span>${new Date(o.created_at).toLocaleTimeString()}</span>
            </div>
          </div>
        `;
          })
          .join('') || '<div class="text-stone-400 text-center py-4">暂无单据存根</div>';
    }

    const receiptsListEl = document.getElementById('my-receipts-list');
    if (receiptsListEl) {
      receiptsListEl.innerHTML =
        myReceipts
          .map(
            (r) => `
        <div class="p-2.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1 text-xs">
          <div class="flex justify-between font-bold text-stone-900">
            <span>送货师傅: ${r.driver_name}</span>
            <span>实交款: ¥${parseFloat(r.amount).toFixed(2)} (${r.pay_method})</span>
          </div>
          ${r.basket_return ? `<div class="text-[10px] text-amber-800">退还周转筐/载具: ${r.basket_return} 件 (折抵 ¥${r.basket_deduct_amount})</div>` : ''}
          <div class="text-[10px] text-stone-400">核销时间: ${new Date(r.created_at).toLocaleString()}</div>
        </div>
      `
          )
          .join('') || '<div class="text-stone-400 text-center py-2">暂无交割记录</div>';
    }
  };

  window.cancelProposalOrder = async (orderId) => {
    if (!confirm('确认作废撤回该单？')) return;
    await supabase.from('store_order').update({ order_status: 'cancelled' }).eq('id', orderId);
    window.openReceiptsModal();
    checkVendorProposalBadge();
  };

  window.acceptProposalAndReload = async (orderId) => {
    const { data: o } = await supabase.from('store_order').select('*').eq('id', orderId).single();
    if (!o) return;

    for (const k of Object.keys(storeState.cart)) delete storeState.cart[k];

    (o.items || []).forEach((it) => {
      window.initProdItemState(it.id);
      storeState.cart[it.id].order = it.qty;
    });
    (o.items_return || []).forEach((it) => {
      window.initProdItemState(it.id);
      storeState.cart[it.id].return = it.qty;
      storeState.cart[it.id].returnReason = it.reason;
      storeState.cart[it.id].returnPrice = it.price;
    });
    (o.items_exchange || []).forEach((it) => {
      window.initProdItemState(it.id);
      storeState.cart[it.id].exchange = it.qty;
      storeState.cart[it.id].exchangeReason = it.reason;
    });

    saveAgentCart();
    callbacks?.onRenderProducts?.();
    updateCartSummary();

    window.closeModal('receipts-modal');
    alert('已将原单品物重新载入待配篮，请根据供货方建议微调后提交！');
    window.openSettlementModal();
  };
}
