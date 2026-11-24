import { supabase } from '../../lib/supabase.js';
import { compressImageFile, uploadBlobToStorage } from '../../utils/storage.js';
import { AuthSecurity } from '../../utils/authSecurity.js';
import { DriverService } from '../../services/driverService.js';
import {
  driverState,
  getOfflineQueue,
  saveOfflineQueue,
  createSignatureController
} from './driverState.js';

const deliverySignPad = createSignatureController('sign-pad');
let isSubmittingCollection = false;

function buildClientTxUuid(tenantId, orderId, storeId) {
  const rnd = new Uint8Array(4);
  crypto.getRandomValues(rnd);
  const hex = Array.from(rnd)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `TX-${String(tenantId || 'HQ').toUpperCase()}-${orderId || storeId || 0}-${Date.now()}-${hex}`;
}

function renderProofStrip() {
  const box = document.getElementById('proof-preview-strip');
  if (!box) return;
  box.innerHTML = driverState.proofImagesList
    .map(
      (src, idx) => `
      <div class="relative w-12 h-12 rounded-xl overflow-hidden border border-stone-300 shrink-0">
        <img src="${src}" class="w-full h-full object-cover">
        <button type="button" onclick="window.removeProofImg(${idx})" class="absolute top-0 right-0 bg-black/70 text-white text-[9px] px-1">✕</button>
      </div>
    `
    )
    .join('');
}

function renderMultiCarrierRows() {
  const box = document.getElementById('multi-carrier-rows');
  if (!box) return;
  box.innerHTML = driverState.globalCarriersList
    .map(
      (c, idx) => `
      <div class="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-amber-200/80 text-[11px]">
        <span class="font-bold text-stone-800">${c.name} <span class="text-stone-400 font-mono font-normal">(¥${c.deposit}/件)</span></span>
        <div class="flex items-center gap-1 font-mono">
          <input type="number" min="0" value="0" data-carrier-idx="${idx}" data-deposit="${c.deposit}" oninput="window.updateDeliverBtnText()" class="multi-carrier-qty-input w-14 bg-stone-50 border border-stone-200 rounded px-1.5 py-0.5 text-center font-bold outline-none">
          <span class="text-stone-500">件</span>
        </div>
      </div>
    `
    )
    .join('');
}

export function renderRoute() {
  const container = document.getElementById('route-container');
  if (!container) return;

  const offlineQueue = getOfflineQueue();
  const offlineOrderIds = new Set(offlineQueue.map((q) => Number(q.payload?.orderId)).filter(Boolean));

  const standaloneOnlineOrders = driverState.activeOrders.filter((o) => !o.store_id);
  let displayStores = driverState.allStores;
  if (driverState.onlyShowOrders) {
    displayStores = driverState.allStores.filter((s) => driverState.activeOrders.some((o) => Number(o.store_id) === Number(s.id)));
  }

  if (displayStores.length === 0 && standaloneOnlineOrders.length === 0) {
    container.innerHTML = `<div class="p-10 text-center text-stone-400 text-xs">${
      driverState.onlyShowOrders ? '当前暂无待送货单据，点击左上角切换查看全部门店。' : '当前名册下暂无合作门店。'
    }</div>`;
    return;
  }

  const standaloneHtml = standaloneOnlineOrders
    .map((ord) => {
      const isOfflineDone = offlineOrderIds.has(Number(ord.id));
      const orderStr = (ord.items || []).map((i) => `${i.name}x${i.qty}`).join('、');
      return `
        <div class="p-3.5 rounded-3xl border bg-blue-50/50 border-blue-300 shadow-xs space-y-2 transition">
          <div class="flex justify-between items-start">
            <div>
              <span class="bg-blue-700 text-white text-[9px] font-bold px-2 py-0.5 rounded-lg mr-1">🌐 天街直供单</span>
              <span class="font-bold text-sm text-stone-900">#${ord.order_no || ord.id}</span>
              <span class="text-[11px] text-stone-600 block mt-1">${ord.note || '天街买家直供配送'}</span>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">已在线支付</span>
          </div>
          <div class="bg-white p-2 rounded-2xl border border-blue-200 text-[11px] space-y-1">
            <div class="text-emerald-950 font-bold">📦 货品：${orderStr || '标准货品组合'}</div>
            <div class="text-[10px] text-stone-500 font-mono">实付金额：¥${parseFloat(ord.total_amount || 0).toFixed(2)}</div>
          </div>
          ${
            isOfflineDone
              ? '<div class="text-center text-[11px] font-bold text-amber-800 bg-amber-100 py-2 rounded-xl">📡 已离线签收，待联网同步</div>'
              : `<button onclick="window.openStandaloneOrderCollect(${ord.id})" class="w-full py-2.5 rounded-2xl font-bold text-xs shadow-sm active:scale-95 transition bg-[#1b4332] hover:bg-[#143628] text-white">
                  ✍️ 核对交付 · 收货人电子签名
                </button>`
          }
        </div>
      `;
    })
    .join('');

  const storesHtml = displayStores
    .map((s) => {
      const pendingOrder = driverState.activeOrders.find((o) => Number(o.store_id) === Number(s.id));
      const hasOrder = !!pendingOrder;
      const isOfflineDone = pendingOrder && offlineOrderIds.has(Number(pendingOrder.id));

      let itemsPreviewHtml = '';
      if (hasOrder) {
        const orderStr = (pendingOrder.items || []).map((i) => `${i.name}x${i.qty}`).join('、');
        const returnStr = (pendingOrder.items_return || []).map((i) => `${i.name}x${i.qty}`).join('、');
        const exchangeStr = (pendingOrder.items_exchange || []).map((i) => `${i.name}x${i.qty}`).join('、');
        const isMallPickup = pendingOrder.order_source === 'online_mall';

        itemsPreviewHtml = `
          <div class="bg-stone-50 p-2 rounded-2xl border border-stone-100 text-[11px] space-y-0.5">
            ${isMallPickup ? '<div class="text-[10px] font-bold text-blue-800">🛍️ 含天街邻里到店自提包裹（顺路捎带交店）</div>' : ''}
            ${orderStr ? `<div class="text-emerald-900 font-bold">📦 应送: ${orderStr}</div>` : ''}
            ${returnStr ? `<div class="text-rose-700 font-bold">🔄 退回: ${returnStr}</div>` : ''}
            ${exchangeStr ? `<div class="text-amber-800 font-bold">🔀 换新: ${exchangeStr}</div>` : ''}
            ${pendingOrder.driver_action_instruction ? `<div class="text-stone-500 text-[10px] pt-0.5 font-mono">👉 ${pendingOrder.driver_action_instruction}</div>` : ''}
          </div>
        `;
      }

      const cleanAddr = (s.address || '临街门面').replace(/\[GPS:[^\]]+\]/g, '').trim();

      return `
        <div class="p-3.5 rounded-3xl border ${hasOrder ? 'bg-white border-emerald-300 shadow-sm' : 'bg-stone-50/60 border-stone-200'} space-y-2 transition">
          <div class="flex justify-between items-start gap-2">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-sm text-stone-900">${s.name}</span>
                ${
                  isOfflineDone
                    ? '<span class="bg-amber-500 text-white text-[9px] font-bold px-2 py-0.2 rounded-full">待同步</span>'
                    : hasOrder
                    ? '<span class="bg-[#1b4332] text-amber-300 text-[9px] font-bold px-2 py-0.2 rounded-full animate-pulse">有单待交</span>'
                    : ''
                }
              </div>
              <span class="text-[11px] text-stone-400 block mt-0.5">📍 ${cleanAddr} · ${s.contact || '掌柜'}</span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button type="button" onclick="window.navigateToStoreGps(${s.id})" class="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-xl font-bold">
                🧭 导航
              </button>
              <a href="tel:${s.phone || ''}" class="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2.5 py-1 rounded-xl font-bold">
                📞 致电
              </a>
            </div>
          </div>

          ${itemsPreviewHtml}

          <div class="flex justify-between items-center text-[11px] text-stone-500 pt-1">
            <span>在账: <b class="font-mono text-stone-800">¥${s.current_debt || 0}</b></span>
            <span>${driverState.currentCarrierLabel}: <b class="font-mono text-amber-800 font-bold">${s.carrier_hold_count || s.basket_count || 0} 件</b></span>
          </div>

          ${
            isOfflineDone
              ? '<div class="text-center text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 py-2 rounded-xl">📡 已本地签收，恢复网络后点顶部「立即同步回库」</div>'
              : `<button onclick="window.openCollectModal(${s.id}, ${hasOrder ? pendingOrder.id : 0})" class="w-full py-2.5 rounded-2xl font-bold text-xs shadow-sm active:scale-95 transition ${
                  hasOrder ? 'bg-[#1b4332] hover:bg-[#143628] text-white' : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
                }">
                  ${hasOrder ? '✍️ 点交货品 · 现场核销签收' : `💵 零星收欠 / 清点回收${driverState.currentCarrierLabel}`}
                </button>`
          }
        </div>
      `;
    })
    .join('');

  container.innerHTML = standaloneHtml + storesHtml;
}

export function initDeliveryBindings() {
  window.toggleOnlyOrdersFilter = function () {
    driverState.onlyShowOrders = !driverState.onlyShowOrders;
    const btn = document.getElementById('btn-toggle-only-orders');
    if (btn) {
      btn.innerText = driverState.onlyShowOrders ? '🔥 仅看有单门店' : '全部门店';
      btn.className = driverState.onlyShowOrders
        ? 'text-[10px] bg-[#1b4332] text-white px-2 py-0.5 rounded-lg font-bold transition'
        : 'text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-lg font-bold transition';
    }
    renderRoute();
  };

  window.clearSignature = () => deliverySignPad.clear();

  window.handleProofImageUpload = async function (e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedBase64 = await compressImageFile(file, 640, 0.72);
      const idx = driverState.proofImagesList.length;
      driverState.proofImagesList.push(compressedBase64);
      renderProofStrip();

      const cdnUrl = await uploadBlobToStorage(compressedBase64, driverState.currentAgent, 'driver_proofs');
      if (driverState.proofImagesList[idx]) {
        driverState.proofImagesList[idx] = cdnUrl;
        renderProofStrip();
      }
    } catch (err) {
      alert('图片压缩或上传失败: ' + err.message);
    }
  };

  window.removeProofImg = function (idx) {
    driverState.proofImagesList.splice(idx, 1);
    renderProofStrip();
  };

  window.openStandaloneOrderCollect = function (orderId) {
    const order = driverState.activeOrders.find((o) => Number(o.id) === Number(orderId));
    if (!order) return;

    driverState.proofImagesList = [];
    renderProofStrip();

    document.getElementById('modal-store-id').value = 0;
    document.getElementById('modal-order-id').value = order.id;
    document.getElementById('modal-shop-title').innerText = `🌐 天街直供单 #${order.order_no || order.id}`;
    document.getElementById('modal-current-debt').value = 0;
    document.getElementById('modal-credit-limit').value = 999999;
    document.getElementById('modal-basket-count').value = 0;
    document.getElementById('modal-settlement-type').value = order.settlement_type || 'online_paid';

    document.getElementById('modal-debt-text').innerText = '¥0.00';
    document.getElementById('modal-limit-text').innerText = '在线已付';
    document.getElementById('modal-basket-text').innerText = '0 件';
    document.getElementById('over-credit-warning-banner').classList.add('hidden');

    const instBox = document.getElementById('modal-instruction-box');
    instBox.innerText = order.driver_action_instruction || order.note || '请核对货品交付并请收货人电子签名';
    instBox.classList.remove('hidden');

    const netAmt = parseFloat(order.net_settle_amount || order.total_amount || 0);
    document.getElementById('modal-order-amount-text').innerText = `¥${netAmt.toFixed(2)}`;
    document.getElementById('modal-return-amount-text').innerText = '-¥0.00';
    document.getElementById('modal-net-amount-text').innerText = `¥${netAmt.toFixed(2)}`;

    document.getElementById('modal-items-order-list').innerHTML =
      (order.items || []).map((i) => `<div>• ${i.name} (${i.spec || '整装'}) × <b class="font-mono">${i.qty}${i.measure_unit || '件'}</b></div>`).join('') || '无';
    document.getElementById('modal-items-return-list').innerHTML = '无须带回旧品';
    document.getElementById('modal-items-exchange-list').innerHTML = '无对调品物';

    renderMultiCarrierRows();
    document.getElementById('collect-amount').value = '0';
    document.getElementById('collect-discount').value = '0';
    document.getElementById('collect-method').value = '仅签收回单';

    window.updateDeliverBtnText();
    deliverySignPad.init();
    window.openModal('collect-modal');
  };

  window.openCollectModal = function (storeId, orderId) {
    const s = driverState.allStores.find((x) => Number(x.id) === Number(storeId));
    if (!s) return;

    driverState.proofImagesList = [];
    renderProofStrip();

    const order = driverState.activeOrders.find((o) => Number(o.id) === Number(orderId));
    const debt = parseFloat(s.current_debt || 0);
    const limit = parseFloat(s.credit_limit || 2000);
    const baskets = parseInt(s.carrier_hold_count || s.basket_count || 0);

    document.getElementById('modal-store-id').value = s.id;
    document.getElementById('modal-order-id').value = orderId || 0;
    document.getElementById('modal-shop-title').innerText = s.name;
    document.getElementById('modal-current-debt').value = debt;
    document.getElementById('modal-credit-limit').value = limit;
    document.getElementById('modal-basket-count').value = baskets;

    document.getElementById('modal-debt-text').innerText = `¥${debt.toFixed(2)}`;
    document.getElementById('modal-limit-text').innerText = `¥${limit.toFixed(0)}`;
    document.getElementById('modal-basket-text').innerText = `${baskets} 件`;

    const overWarningBanner = document.getElementById('over-credit-warning-banner');
    const overWarningDesc = document.getElementById('over-credit-warning-desc');
    if (order && (order.order_status === 'over_credit_pending' || order.order_status === 'over_credit_rejected')) {
      overWarningBanner.classList.remove('hidden');
      overWarningDesc.innerText =
        order.order_status === 'over_credit_rejected'
          ? `主管已驳回赊销：${order.driver_action_instruction || '请当场收取全额现款'}`
          : `超出信用额度 ¥${order.over_credit_amount || 0}，尚待主管特批；若未获批请当场收取现款！`;
    } else {
      overWarningBanner.classList.add('hidden');
    }

    const instBox = document.getElementById('modal-instruction-box');
    if (order && order.driver_action_instruction) {
      instBox.innerText = order.driver_action_instruction;
      instBox.classList.remove('hidden');
    } else {
      instBox.classList.add('hidden');
    }

    let netAmt = 0;
    let settlementType = s.default_settlement || 'credit';
    let workflow = s.settle_workflow || 'cash_on_delivery';

    if (order) {
      const oAmt = parseFloat(order.total_amount || 0);
      const rAmt = parseFloat(order.return_amount || 0);
      netAmt = parseFloat(order.net_settle_amount || (oAmt - rAmt));
      settlementType = order.settlement_type || 'credit';

      document.getElementById('modal-order-amount-text').innerText = `¥${oAmt.toFixed(2)}`;
      document.getElementById('modal-return-amount-text').innerText = `-¥${rAmt.toFixed(2)}`;
      document.getElementById('modal-net-amount-text').innerText = `¥${netAmt.toFixed(2)}`;

      document.getElementById('modal-items-order-list').innerHTML =
        (order.items || []).map((i) => `<div>• ${i.name} (${i.spec || '整装'}) × <b class="font-mono">${i.qty}${i.measure_unit || '件'}</b></div>`).join('') || '无新到品物';
      document.getElementById('modal-items-return-list').innerHTML =
        (order.items_return || []).map((i) => `<div>• 退: ${i.name} × ${i.qty} [${i.reason}] (-¥${(i.price * i.qty).toFixed(1)})</div>`).join('') || '无须带回旧品';
      document.getElementById('modal-items-exchange-list').innerHTML =
        (order.items_exchange || []).map((i) => `<div>• 换: ${i.name} × ${i.qty} [${i.reason}]</div>`).join('') || '无对调品物';
    } else {
      document.getElementById('modal-order-amount-text').innerText = '¥0.00';
      document.getElementById('modal-return-amount-text').innerText = '-¥0.00';
      document.getElementById('modal-net-amount-text').innerText = '¥0.00';
      document.getElementById('modal-items-order-list').innerHTML = '无新订货单 (零星收欠 / 清点载具)';
      document.getElementById('modal-items-return-list').innerHTML = '无';
      document.getElementById('modal-items-exchange-list').innerHTML = '无';
    }

    document.getElementById('modal-settlement-type').value = settlementType;
    renderMultiCarrierRows();
    document.getElementById('collect-discount').value = '0';

    if (workflow === 'receipt_only') {
      document.getElementById('collect-amount').value = '0';
      document.getElementById('collect-method').value = '仅签收回单';
    } else if (order && order.order_source === 'online_mall') {
      document.getElementById('collect-amount').value = '0';
      document.getElementById('collect-method').value = '仅签收回单';
    } else if (settlementType === 'barter_or_labor') {
      document.getElementById('collect-amount').value = '0';
      document.getElementById('collect-method').value = '以物换物/劳务抵扣';
    } else if (settlementType === 'cash' && order) {
      document.getElementById('collect-amount').value = netAmt.toFixed(2);
      document.getElementById('collect-method').value = '电子扫码/转账';
    } else if (!order && debt > 0) {
      document.getElementById('collect-amount').value = debt.toFixed(2);
      document.getElementById('collect-method').value = '电子扫码/转账';
    } else {
      document.getElementById('collect-amount').value = '0';
      document.getElementById('collect-method').value = '挂账签收';
    }

    window.updateDeliverBtnText();
    deliverySignPad.init();
    window.openModal('collect-modal');
  };

  window.onCollectMethodChange = () => {
    const method = document.getElementById('collect-method').value;
    if (method === '挂账签收' || method === '仅签收回单' || method === '以物换物/劳务抵扣') {
      document.getElementById('collect-amount').value = '0';
    }
    window.updateDeliverBtnText();
  };

  window.updateDeliverBtnText = () => {
    const payAmt = parseFloat(document.getElementById('collect-amount').value) || 0;
    let totalCarrierQty = 0;
    let totalCarrierDeduct = 0;
    document.querySelectorAll('.multi-carrier-qty-input').forEach((inp) => {
      const q = parseInt(inp.value) || 0;
      const dep = parseFloat(inp.dataset.deposit || 15);
      totalCarrierQty += q;
      totalCarrierDeduct += q * dep;
    });

    const deductLabel = document.getElementById('multi-carrier-deduct-total');
    if (deductLabel) {
      deductLabel.innerText = `共收 ${totalCarrierQty} 件 · 抵 ¥${totalCarrierDeduct.toFixed(2)}`;
    }

    const method = document.getElementById('collect-method').value;
    const btn = document.getElementById('btn-submit-collection');
    if (!btn) return;

    if (payAmt > 0) btn.innerText = `✅ 确认收款 ¥${payAmt.toFixed(2)} · 签收平账`;
    else if (method === '以物换物/劳务抵扣') btn.innerText = `🌾 确认物物/劳务抵扣 · 立信签收`;
    else if (method === '仅签收回单') btn.innerText = `📜 确认验货签回单 (待财务统对)`;
    else btn.innerText = `📝 确认记账交割 · 立信签收`;
  };

  window.submitCollection = async function () {
    if (isSubmittingCollection) return;

    const storeId = parseInt(document.getElementById('modal-store-id').value);
    const orderId = parseInt(document.getElementById('modal-order-id').value);
    const storeName = document.getElementById('modal-shop-title').innerText;

    const oldDebt = parseFloat(document.getElementById('modal-current-debt').value) || 0;
    const creditLimit = parseFloat(document.getElementById('modal-credit-limit').value) || 2000;
    const oldBaskets = parseInt(document.getElementById('modal-basket-count').value) || 0;

    const payAmt = parseFloat(document.getElementById('collect-amount').value) || 0;
    const discountAmt = parseFloat(document.getElementById('collect-discount').value) || 0;
    const method = document.getElementById('collect-method').value;

    let basketReturn = 0;
    let basketDeductAmt = 0;
    document.querySelectorAll('.multi-carrier-qty-input').forEach((inp) => {
      const q = parseInt(inp.value) || 0;
      const dep = parseFloat(inp.dataset.deposit || 15);
      basketReturn += q;
      basketDeductAmt += q * dep;
    });

    const order = driverState.activeOrders.find((o) => Number(o.id) === Number(orderId));
    const isBarterSettlement = method === '以物换物/劳务抵扣' || order?.settlement_type === 'barter_or_labor';
    const netOrderAmt =
      order && order.order_source !== 'online_mall' && !isBarterSettlement
        ? parseFloat(order.net_settle_amount || order.total_amount || 0)
        : 0;

    if (!deliverySignPad.hasSigned()) {
      return alert('🤝 立信为本：请请收货掌柜在签字框内手写签字确认！');
    }

    // 动作级精准熔断检查：司机外勤端回单 (driver_write) + 随车收款登记 (driver_collect)
    if (window.checkBusinessCircuit && navigator.onLine) {
      const writeAllowed = await window.checkBusinessCircuit('driver_write', driverState.currentAgent);
      if (!writeAllowed) return;
      if (payAmt > 0) {
        const collectAllowed = await window.checkBusinessCircuit('driver_collect', driverState.currentAgent, { amount: payAmt });
        if (!collectAllowed) return;
      }
    }

    const newDebt = Math.max(0, oldDebt + netOrderAmt - payAmt - discountAmt - basketDeductAmt);
    const newBaskets = Math.max(0, oldBaskets - basketReturn);

    if (storeId > 0 && newDebt > creditLimit && (!order || order.order_status !== 'over_credit_approved')) {
      const overDiff = (newDebt - creditLimit).toFixed(2);
      if (
        !confirm(
          `🚨 信用额度超额提示：\n` +
            `本单记账后累计在账 ¥${newDebt.toFixed(2)}，已超出该店免息信用额度 ¥${creditLimit.toFixed(2)}（超额 ¥${overDiff}）！\n\n` +
            `• 若门店当场付现，请点「取消」并在实收金额框填入现款；\n` +
            `• 若需上报主管 2FA 特批放行，请点「确定」提交审批。`
        )
      ) {
        return;
      }

      if (order) {
        await supabase
          .from('store_order')
          .update({
            order_status: 'over_credit_pending',
            over_credit_amount: parseFloat(overDiff),
            driver_action_instruction: `【待主管2FA特批】超授信 ¥${overDiff}`
          })
          .eq('id', order.id);
      }

      alert('⏳ 已上报源头调度台等待主管 2FA 特批放行！');
      window.closeModal('collect-modal');
      await window.loadDriverTasks();
      return;
    }

    const clientTxUuid = buildClientTxUuid(driverState.currentAgent, orderId, storeId);
    const deviceFp = AuthSecurity.getDeviceFingerprint();

    const signDataUrl = deliverySignPad.toDataURL();
    const deliveryPayload = {
      tenantId: driverState.currentAgent,
      storeId,
      storeName,
      driverName: driverState.currentOperatorName,
      orderId,
      netOrderAmt,
      payAmt,
      discountAmt,
      basketReturn,
      basketDeductAmt,
      method,
      newDebt,
      newBaskets,
      signDataUrl,
      proofImages: driverState.proofImagesList,
      clientTxUuid,
      deviceSummary: deviceFp.summary
    };

    const submitBtn = document.getElementById('btn-submit-collection');
    isSubmittingCollection = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = '⏳ 正在安全核销入账...';
    }

    try {
      await DriverService.completeDelivery(deliveryPayload);

      alert(
        `✅ 交割核销圆满完成！\n` +
          `• 电子凭单流水: ${clientTxUuid.slice(-12)}\n` +
          `• 本次实收款: ¥${payAmt.toFixed(2)} (${method})\n` +
          `• 收回周转载具: ${basketReturn} 件 (折抵 ¥${basketDeductAmt.toFixed(2)})\n` +
          `• 门店最新在账: ¥${newDebt.toFixed(2)}`
      );

      window.closeModal('collect-modal');
      await window.loadDriverTasks();
    } catch (err) {
      const offlineQueue = getOfflineQueue();
      const alreadyQueued = offlineQueue.some((q) => q.payload?.clientTxUuid === clientTxUuid || (orderId > 0 && Number(q.payload?.orderId) === orderId));
      if (!alreadyQueued) {
        offlineQueue.push({
          id: Date.now(),
          createdAt: new Date().toISOString(),
          payload: deliveryPayload
        });
        saveOfflineQueue(offlineQueue);
      }

      alert(
        `📡 当前信号较弱（如地下室或偏远村社），本笔签收凭单已按唯一流水号加密锁存至本地防丢队列！\n` +
          `出库恢复信号后，点击顶栏「立即同步回库」即可上传总账（绝不重复扣款）。`
      );
      window.closeModal('collect-modal');
      renderRoute();
    } finally {
      isSubmittingCollection = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        window.updateDeliverBtnText();
      }
    }
  };

  window.openReceiptHistoryModal = function () {
    const listEl = document.getElementById('driver-receipt-history-list');
    if (!listEl) return;

    if (driverState.deliveredOrdersCache.length === 0) {
      listEl.innerHTML = '<div class="py-8 text-center text-stone-400">今日尚无已完成的交割电子收条存根。</div>';
      window.openModal('receipt-history-modal');
      return;
    }

    listEl.innerHTML = driverState.deliveredOrdersCache
      .map((o) => {
        const itemsStr = (Array.isArray(o.items) ? o.items : []).map((i) => `${i.name}x${i.qty}`).join('、') || '调退/收欠单';
        const net = parseFloat(o.net_settle_amount || o.total_amount || 0).toFixed(2);
        return `
          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
            <div class="flex justify-between items-center font-bold">
              <span class="text-stone-900">${o.store_name || '天街直供单'}</span>
              <span class="font-mono text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">已签收</span>
            </div>
            <div class="text-[10px] text-stone-500 font-mono">单号: #${o.order_no || o.id} · 净额: ¥${net}</div>
            <div class="text-[11px] text-stone-700">货品: ${itemsStr}</div>
            ${o.sign_image_url ? `<div class="bg-white border border-stone-200 rounded-xl p-1 inline-block"><img src="${o.sign_image_url}" class="h-10 object-contain"></div>` : ''}
            <div class="pt-1 flex justify-end">
              <button type="button" onclick="window.copyDriverReceiptText(${o.id})" class="bg-[#1b4332] text-white font-bold px-3 py-1 rounded-xl text-[10px] shadow-2xs active:scale-95">
                📋 复制电子收条发掌柜
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    window.openModal('receipt-history-modal');
  };

  window.copyDriverReceiptText = function (orderId) {
    const o = driverState.deliveredOrdersCache.find((x) => Number(x.id) === Number(orderId));
    if (!o) return;
    const itemsStr = (Array.isArray(o.items) ? o.items : []).map((i) => `${i.name}x${i.qty}`).join('、') || '调退/收欠单';
    const net = parseFloat(o.net_settle_amount || o.total_amount || 0).toFixed(2);
    const text =
      `【随车交割电子收信条】\n` +
      `收货门店：${o.store_name || '客户'}\n` +
      `单据编号：#${o.order_no || o.id}\n` +
      `交割明细：${itemsStr}\n` +
      `本单净额：¥${net}（${o.settlement_type || '已核销'}）\n` +
      `配送经手：${driverState.currentOperatorName}\n` +
      `交割时间：${o.created_at ? new Date(o.created_at).toLocaleString() : new Date().toLocaleString()}\n` +
      `诚信相照，货款两清！`;

    navigator.clipboard.writeText(text).then(() => {
      alert(`✅ 【${o.store_name || '客户'}】电子收条已复制，可直接粘贴微信发给掌柜留底！`);
    });
  };

  window.submitLeadByDriver = async function () {
    const name = document.getElementById('lead-name-input').value.trim();
    const category = document.getElementById('lead-cat-input')?.value || '社区便利';
    const boss = document.getElementById('lead-boss-input').value.trim();
    const phone = document.getElementById('lead-phone-input').value.trim();
    const addr = document.getElementById('lead-addr-input').value.trim();
    const note = document.getElementById('lead-note-input').value.trim();

    if (!name || !phone || phone.length < 11) return alert('请填全合作门店招牌全名与 11 位手机号码！');

    await DriverService.submitNewStoreLead({
      tenantId: driverState.currentAgent,
      driverName: driverState.currentOperatorName,
      shopName: name,
      category,
      bossName: boss,
      phone,
      address: addr,
      note
    });

    alert('🎉 意向合作门店信息已登记！已直传源头调度台，并自动计入您的客户开拓实绩。');
    ['lead-name-input', 'lead-boss-input', 'lead-phone-input', 'lead-addr-input', 'lead-note-input'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  };

  window.openCheckoutSummaryModal = async function () {
    const logs = await DriverService.fetchTodayCollections(driverState.currentAgent);

    let cash = 0, wechat = 0, baskets = 0, discount = 0;
    logs.forEach((l) => {
      const amt = parseFloat(l.amount || 0);
      if (l.pay_method === '现金') cash += amt;
      else wechat += amt;
      baskets += parseInt(l.basket_return || 0);
      discount += parseFloat(l.discount_amount || 0);
    });

    document.getElementById('chk-driver').innerText = driverState.currentOperatorName;
    document.getElementById('chk-cash').innerText = `¥${cash.toFixed(2)}`;
    document.getElementById('chk-wechat').innerText = `¥${wechat.toFixed(2)}`;
    document.getElementById('chk-baskets').innerText = `${baskets} 件`;
    document.getElementById('chk-discount').innerText = `¥${discount.toFixed(2)}`;
    document.getElementById('chk-total').innerText = `¥${(cash + wechat).toFixed(2)}`;

    window.openModal('checkout-modal');
  };

  window.finalizeSettlement = () => {
    alert('📋 请将随车实收现钞及收回周转载具清点交予库房与账房财务，待财务在调度台点清确认后今日账目即圆满闭环！');
    window.closeModal('checkout-modal');
  };

  window.openSuggestionModal = () => window.openModal('modal-suggestion');

  window.submitDriverSuggestion = async function () {
    // 动作级精准熔断检查：外勤建言发布 (public_post)
    if (window.checkBusinessCircuit && !(await window.checkBusinessCircuit('public_post', driverState.currentAgent))) {
      return;
    }

    const content = document.getElementById('driver-suggestion-text').value.trim();
    if (!content) return alert('请写下您的建言内容！');

    const { error } = await DriverService.submitSuggestion(driverState.currentAgent, driverState.currentOperatorName, content);
    if (error) alert('提交失败: ' + error.message);
    else {
      alert('🙏 感谢执事建言，已呈达平台建言堂！');
      document.getElementById('driver-suggestion-text').value = '';
      window.closeModal('modal-suggestion');
    }
  };
}
