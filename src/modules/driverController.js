import { supabase } from '../lib/supabase.js';
import { compressImageFile } from '../utils/storage.js';
import { DriverService } from '../services/driverService.js';

const urlParams = new URLSearchParams(window.location.search);
const urlTenant = urlParams.get('t') || urlParams.get('tenant');
if (urlTenant && urlTenant.trim()) {
  localStorage.setItem('active_agent', urlTenant.trim().toUpperCase());
}

let currentAgent = (localStorage.getItem('active_agent') || 'BJ_SHUNDA').trim().toUpperCase();
let currentDriver = localStorage.getItem('active_driver') || '老张师傅';
let routeStores = [];
let allPendingOrders = [];
let onlyShowWithOrders = false;
let proofImagesList = [];
let isSigned = false;
let isCurrentOrderOnlinePickup = false;
let currentModalOrderIds = [];
let canvas, ctx, drawing = false;
let signPadBound = false;

window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

// =========================================================================
// 0. 一键唤起地图导航到店
// =========================================================================
window.openStoreMapNav = function (storeName, address) {
  const query = encodeURIComponent(`${address || ''} ${storeName || ''}`.trim());
  const url = `https://uri.amap.com/search?keyword=${query}`;
  window.open(url, '_blank');
};

// =========================================================================
// 1. 离线缓存队列同步
// =========================================================================
function refreshOfflineBanner() {
  const queue = DriverService.getOfflineQueue();
  const banner = document.getElementById('offline-sync-banner');
  const countEl = document.getElementById('offline-queue-count');
  if (queue.length > 0) {
    banner?.classList.remove('hidden');
    if (countEl) countEl.innerText = queue.length;
  } else {
    banner?.classList.add('hidden');
  }
}

window.syncOfflineQueue = async function () {
  const queue = DriverService.getOfflineQueue();
  if (queue.length === 0) return;

  const btn = document.getElementById('btn-sync-offline');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '同步中...';
  }

  const failed = [];
  for (const item of queue) {
    try {
      await DriverService.executeSettlement(item);
    } catch (err) {
      console.error('离线单据同步失败:', err);
      failed.push(item);
    }
  }

  DriverService.saveOfflineQueue(failed);
  refreshOfflineBanner();
  if (btn) {
    btn.disabled = false;
    btn.innerText = '立即同步回库';
  }

  if (failed.length === 0) {
    alert('🎉 所有离线暂存签收单已全部同步回云端账本！');
    await window.loadDriverTasks();
    await calculateTodayStats();
  } else {
    alert(`已同步部分单据，仍有 ${failed.length} 笔因信号不稳留在队列，请稍后再试。`);
  }
};

// =========================================================================
// 2. 路线筛选、凭证拍照与工作模式切换
// =========================================================================
window.toggleOnlyOrdersFilter = function () {
  onlyShowWithOrders = !onlyShowWithOrders;
  const btn = document.getElementById('btn-toggle-only-orders');
  if (btn) {
    btn.innerText = onlyShowWithOrders ? '只看今日有单' : '全部门店';
    btn.className = onlyShowWithOrders
      ? 'text-[10px] bg-[#1b4332] text-white px-2 py-0.5 rounded-lg font-bold transition'
      : 'text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-lg font-bold transition';
  }
  renderRouteStores();
};

window.handleProofImageUpload = async function (event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const base64 = await compressImageFile(file, 640, 0.72);
    proofImagesList.push(base64);
    renderProofPreview();
  } catch (e) {
    console.error('凭证图压缩失败:', e);
  }
  event.target.value = '';
};

window.removeProofImage = function (idx) {
  proofImagesList.splice(idx, 1);
  renderProofPreview();
};

function renderProofPreview() {
  const strip = document.getElementById('proof-preview-strip');
  if (!strip) return;
  if (proofImagesList.length === 0) {
    strip.innerHTML = '<span class="text-[10px] text-stone-400">未附凭证图（如收微信/支付宝转账建议拍照留底）</span>';
    return;
  }
  strip.innerHTML = proofImagesList
    .map(
      (src, idx) => `
      <div class="relative shrink-0">
        <img src="${src}" class="w-12 h-12 rounded-lg object-cover border border-stone-300">
        <button type="button" onclick="window.removeProofImage(${idx})" class="absolute -top-1.5 -right-1.5 bg-rose-600 text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold">✕</button>
      </div>
    `
    )
    .join('');
}

window.switchWorkTab = function (mode) {
  document.getElementById('pane-deliver')?.classList.toggle('hidden', mode !== 'deliver');
  document.getElementById('pane-explore')?.classList.toggle('hidden', mode !== 'explore');
  document.getElementById('tab-btn-deliver').className =
    mode === 'deliver'
      ? 'flex-1 py-2 rounded-xl bg-[#1b4332] text-white shadow transition flex items-center justify-center gap-1'
      : 'flex-1 py-2 rounded-xl text-stone-600 hover:text-stone-900 transition flex items-center justify-center gap-1';
  document.getElementById('tab-btn-explore').className =
    mode === 'explore'
      ? 'flex-1 py-2 rounded-xl bg-[#1b4332] text-white shadow transition flex items-center justify-center gap-1'
      : 'flex-1 py-2 rounded-xl text-stone-600 hover:text-stone-900 transition flex items-center justify-center gap-1';
};

window.switchTenantPrompt = async function () {
  const input = prompt('输入所属供货合作方的商号代号（如 NY-FUNIU 或 BJ_SHUNDA）：', currentAgent);
  if (!input || !input.trim()) return;
  const cleanTenant = input.trim().toUpperCase();

  const tenant = await DriverService.verifyTenant(cleanTenant);
  if (!tenant) {
    return alert(`未查到商号代号为【${cleanTenant}】的在册供货方！`);
  }
  if (!tenant.is_active) {
    return alert(`商号【${tenant.company_name}】当前处于暂歇状态，无法切换。`);
  }

  currentAgent = cleanTenant;
  localStorage.setItem('active_agent', currentAgent);
  alert(`✅ 已切换至商号【${tenant.company_name}】(${currentAgent})`);
  initDriverController();
};

window.switchDriverPrompt = function () {
  const name = prompt('输入送货师傅姓名：', currentDriver);
  if (name && name.trim()) {
    currentDriver = name.trim();
    localStorage.setItem('active_driver', currentDriver);
    initDriverController();
  }
};

// =========================================================================
// 3. 手写签名板（防重复绑定事件）
// =========================================================================
function initSignPad() {
  canvas = document.getElementById('sign-pad');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#1b4332';
  ctx.lineCap = 'round';

  if (signPadBound) return;
  signPadBound = true;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function start(e) {
    drawing = true;
    isSigned = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    e.preventDefault();
  }
  function move(e) {
    if (!drawing) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    e.preventDefault();
  }
  function stop() {
    drawing = false;
  }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', stop);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', stop);
}

window.clearSignature = function () {
  if (ctx && canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    isSigned = false;
  }
};

// =========================================================================
// 4. 配送路线载入与渲染（含天街自提单 & 同城余缺顺路调剂单 & 一键导航）
// =========================================================================
window.loadDriverTasks = async function () {
  const container = document.getElementById('route-container');
  container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">路线合作门店调阅中...</div>';

  const { stores, pendingOrders } = await DriverService.fetchRouteData(currentAgent);
  routeStores = stores;
  allPendingOrders = pendingOrders;
  renderRouteStores();
};

function renderRouteStores() {
  const container = document.getElementById('route-container');
  if (routeStores.length === 0) {
    container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">暂无待送合作门店。</div>';
    return;
  }

  const sortedStores = [...routeStores].sort((a, b) => {
    const aHas = allPendingOrders.some((o) => o.store_id === a.id) ? 1 : 0;
    const bHas = allPendingOrders.some((o) => o.store_id === b.id) ? 1 : 0;
    return bHas - aHas;
  });

  const displayList = onlyShowWithOrders ? sortedStores.filter((s) => allPendingOrders.some((o) => o.store_id === s.id)) : sortedStores;

  if (displayList.length === 0) {
    container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">今日暂无已排单待送货门店（点击上方「只看今日有单」可查看全部门店）。</div>';
    return;
  }

  container.innerHTML = displayList
    .map((s, idx) => {
      const debt = parseFloat(s.current_debt || 0);
      const storeOrders = allPendingOrders.filter((o) => o.store_id === s.id);
      const hasOrders = storeOrders.length > 0;

      const orderSummary = storeOrders
        .map((o) => {
          const itemsOrder = Array.isArray(o.items) ? o.items : [];
          const itemsReturn = Array.isArray(o.items_return) ? o.items_return : [];
          const itemsExchange = Array.isArray(o.items_exchange) ? o.items_exchange : [];

          const orderStr = itemsOrder.map((it) => `${it.name} x ${it.qty}${it.measure_unit || '件'}`).join('、');
          const returnStr = itemsReturn.map((it) => `${it.name} x ${it.qty}${it.measure_unit || '件'} (-¥${it.price || 0})`).join('、');
          const exchangeStr = itemsExchange.map((it) => `${it.name} x ${it.qty}${it.measure_unit || '件'}`).join('、');

          const isOverCreditPending = o.order_status === 'over_credit_pending';
          const isOverCreditApproved = o.order_status === 'over_credit_approved';
          const isMallPickup = o.order_source === 'online_mall' || o.settlement_type === 'online_paid';
          const isSwapOrder = String(o.order_no || '').startsWith('SWAP-') || String(o.note || '').includes('同城余缺互调');
          const netAmount = parseFloat(o.net_settle_amount || o.total_amount || 0);

          return `
            <div class="bg-stone-50 border ${
              isSwapOrder
                ? 'border-cyan-400 bg-cyan-50/40'
                : isMallPickup
                ? 'border-emerald-400 bg-emerald-50/40'
                : isOverCreditPending
                ? 'border-rose-400 bg-rose-50/40'
                : 'border-stone-200'
            } rounded-xl p-2.5 text-[11px] text-stone-800 mt-1 space-y-1">
              <div class="flex justify-between items-center font-bold">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span>契单 #${o.order_no || o.id}</span>
                  ${isSwapOrder ? '<span class="text-[9px] bg-cyan-800 text-white px-1.5 py-0.2 rounded font-bold">🔄 同城余缺顺路捎带</span>' : ''}
                  ${isMallPickup ? '<span class="text-[9px] bg-emerald-700 text-white px-1.5 py-0.2 rounded font-bold">🛍️ 天街自提捎带单（已付清）</span>' : ''}
                  ${isOverCreditPending ? '<span class="text-[9px] bg-rose-500 text-white px-1.5 py-0.2 rounded font-bold animate-pulse">待特信放行</span>' : ''}
                  ${isOverCreditApproved ? '<span class="text-[9px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-bold">调度台已特批</span>' : ''}
                </div>
                <span class="${isMallPickup ? 'text-emerald-800' : 'text-rose-700'} font-mono font-bold">
                  ${isMallPickup ? '已付 ¥0到付' : `应结净额: ¥${netAmount.toFixed(2)}`}
                </span>
              </div>

              ${
                o.driver_action_instruction
                  ? `<div class="bg-emerald-50 text-emerald-950 p-1.5 rounded-lg font-bold text-[10px] border border-emerald-200">${o.driver_action_instruction}</div>`
                  : ''
              }

              <div class="text-[10px] space-y-0.5 text-stone-600">
                <div>📦 送抵良品: ${orderStr || '无'}</div>
                ${itemsReturn.length ? `<div class="text-rose-700 font-bold">🔄 验退旧品: ${returnStr}</div>` : ''}
                ${itemsExchange.length ? `<div class="text-amber-800 font-bold">🔀 对调品物: ${exchangeStr}</div>` : ''}
              </div>

              ${o.note ? `<div class="text-[10px] text-amber-900 font-medium">💬 随车叮咛: ${o.note}</div>` : ''}
            </div>
          `;
        })
        .join('');

      const firstOrder = storeOrders.length > 0 ? storeOrders[0] : null;
      const totalNetOrderAmount = storeOrders.reduce((sum, o) => {
        if (o.order_source === 'online_mall' || o.settlement_type === 'online_paid') return sum;
        return sum + parseFloat(o.net_settle_amount || o.total_amount || 0);
      }, 0);

      const safeName = (s.name || '').replace(/'/g, "\\'");
      const safeAddr = (s.address || '').replace(/'/g, "\\'");

      return `
        <div class="p-3.5 ${hasOrders ? 'bg-amber-50/30 border-amber-300 shadow-xs' : 'bg-stone-50/60 border-stone-200/80'} border rounded-2xl space-y-2 hover:bg-white transition">
          <div class="flex justify-between items-start">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-mono text-[10px] bg-stone-200 text-stone-700 px-1.5 py-0.2 rounded font-bold">#${idx + 1}</span>
                <b class="text-xs text-stone-800">${s.name}</b>
                <span class="text-[9px] bg-stone-200/80 text-stone-600 px-1.5 py-0.2 rounded">${s.shop_category || '百工门店'}</span>
                ${hasOrders ? `<span class="bg-amber-600 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">待交割 (${storeOrders.length})</span>` : ''}
              </div>
              <div class="text-[11px] text-stone-400 mt-0.5">
                掌柜: ${s.contact || '掌柜'} · 电话: <a href="tel:${s.phone}" class="text-emerald-800 font-bold underline font-mono">${s.phone}</a>
              </div>
              <div class="text-[10px] text-stone-500 mt-0.5">地址: ${s.address || '临街门面'}</div>
            </div>

            <div class="text-right">
              <span class="text-[10px] text-stone-400 block">待平账期</span>
              <b class="font-mono text-sm ${debt > 0 ? 'text-rose-700' : 'text-emerald-800'} font-bold">
                ¥${debt.toFixed(2)}
              </b>
            </div>
          </div>

          ${orderSummary}

          <div class="pt-2 border-t border-stone-200/60 flex justify-between items-center gap-1.5">
            <a href="tel:${s.phone}" class="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1 active:scale-95 shrink-0">
              📞 致电
            </a>
            <button type="button" onclick="window.openStoreMapNav('${safeName}', '${safeAddr}')" class="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1 active:scale-95 shrink-0">
              🧭 导航
            </button>
            <button onclick="window.openCollectModal(${s.id}, '${safeName}', ${debt}, '${firstOrder ? firstOrder.id : ''}', ${totalNetOrderAmount}, ${
        s.carrier_hold_count || s.basket_count || 0
      }, ${s.credit_limit || 2000})" class="flex-1 text-[11px] bg-[#1b4332] hover:bg-[#143628] text-white font-bold py-1.5 px-2 rounded-xl shadow active:scale-95 transition">
              🤝 现场点验核销${storeOrders.length > 1 ? ` (合${storeOrders.length}单)` : ''}
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

// =========================================================================
// 5. 现场核销弹窗与动态算账引擎（支持同店多单合并汇总 + 天街自提单免收现签收）
// =========================================================================
window.openCollectModal = async function (storeId, storeName, debt, orderId, orderAmount, basketCount, creditLimit) {
  document.getElementById('modal-shop-title').innerText = storeName;
  document.getElementById('modal-store-id').value = storeId;
  document.getElementById('modal-order-id').value = orderId || '';
  document.getElementById('modal-current-debt').value = debt;
  document.getElementById('modal-credit-limit').value = creditLimit || 2000;
  document.getElementById('modal-basket-count').value = basketCount;

  proofImagesList = [];
  isCurrentOrderOnlinePickup = false;
  renderProofPreview();

  const storeOrders = allPendingOrders.filter((o) => Number(o.store_id) === Number(storeId));
  currentModalOrderIds = storeOrders.map((o) => o.id);

  let itemsOrder = [];
  let itemsReturn = [];
  let itemsExchange = [];
  let totalOrderAmount = 0;
  let returnDeductAmount = 0;
  let netAmount = 0;
  let settlementType = 'credit';
  const instructions = [];

  if (storeOrders.length > 0) {
    const allOnlinePickup = storeOrders.every((o) => o.order_source === 'online_mall' || o.settlement_type === 'online_paid');
    isCurrentOrderOnlinePickup = allOnlinePickup;

    storeOrders.forEach((o) => {
      const oItems = Array.isArray(o.items) ? o.items : [];
      const rItems = Array.isArray(o.items_return) ? o.items_return : [];
      const eItems = Array.isArray(o.items_exchange) ? o.items_exchange : [];
      itemsOrder = itemsOrder.concat(oItems);
      itemsReturn = itemsReturn.concat(rItems);
      itemsExchange = itemsExchange.concat(eItems);

      const isPickup = o.order_source === 'online_mall' || o.settlement_type === 'online_paid';
      if (isPickup) {
        instructions.push(`🛍️【天街自提单 #${o.order_no || o.id}】街坊线上已付清，切勿向掌柜重复收款`);
      } else {
        totalOrderAmount += parseFloat(o.total_amount || 0);
        returnDeductAmount += parseFloat(o.return_amount || 0);
        netAmount += parseFloat(o.net_settle_amount || parseFloat(o.total_amount || 0) - parseFloat(o.return_amount || 0));
        if (o.settlement_type) settlementType = o.settlement_type;
      }

      if (o.driver_action_instruction) {
        instructions.push(o.driver_action_instruction);
      }
    });

    if (storeOrders.length > 1) {
      instructions.unshift(`📦 本店今日共 ${storeOrders.length} 笔待交割单据已自动合并汇总，一次签收全部核销！`);
    }
  } else if (orderId) {
    currentModalOrderIds = [parseInt(orderId)];
    const o = await DriverService.fetchOrderDetail(orderId);
    if (o) {
      itemsOrder = Array.isArray(o.items) ? o.items : [];
      itemsReturn = Array.isArray(o.items_return) ? o.items_return : [];
      itemsExchange = Array.isArray(o.items_exchange) ? o.items_exchange : [];
      settlementType = o.settlement_type || 'credit';
      if (o.driver_action_instruction) instructions.push(o.driver_action_instruction);

      isCurrentOrderOnlinePickup = o.order_source === 'online_mall' || settlementType === 'online_paid';
      if (!isCurrentOrderOnlinePickup) {
        totalOrderAmount = parseFloat(o.total_amount || 0);
        returnDeductAmount = parseFloat(o.return_amount || 0);
        netAmount = parseFloat(o.net_settle_amount || totalOrderAmount - returnDeductAmount);
      }
    }
  } else {
    totalOrderAmount = orderAmount;
    netAmount = orderAmount;
  }

  document.getElementById('modal-settlement-type').value = settlementType;
  document.getElementById('modal-order-amount-text').innerText = isCurrentOrderOnlinePickup ? '¥0.00 (天街已付)' : `¥${totalOrderAmount.toFixed(2)}`;
  document.getElementById('modal-return-amount-text').innerText = `-¥${returnDeductAmount.toFixed(2)}`;
  document.getElementById('modal-net-amount-text').innerText = `¥${netAmount.toFixed(2)}`;
  document.getElementById('modal-debt-text').innerText = `¥${debt.toFixed(2)}`;
  document.getElementById('modal-limit-text').innerText = `¥${creditLimit || 2000}`;
  document.getElementById('modal-basket-text').innerText = `${basketCount} 件`;

  document.getElementById('modal-items-order-list').innerHTML = itemsOrder.length
    ? itemsOrder.map((i) => `<div>• ${i.name} (${i.spec || '整装'}) x <b>${i.qty}${i.measure_unit || '件'}</b> <span class="text-[9px] text-emerald-800 font-mono">[物勒工名正品]</span></div>`).join('')
    : '无新到品物';

  document.getElementById('modal-items-return-list').innerHTML = itemsReturn.length
    ? itemsReturn.map((i) => `<div>• ${i.name} x <b>${i.qty}${i.measure_unit || '件'}</b> (抵-¥${i.price}) [原由: ${i.reason || '破损/退货'}]</div>`).join('')
    : '无须带回旧品';

  document.getElementById('modal-items-exchange-list').innerHTML = itemsExchange.length
    ? itemsExchange.map((i) => `<div>• ${i.name} x <b>${i.qty}${i.measure_unit || '件'}</b> [对调: ${i.reason || '同款换新'}]</div>`).join('')
    : '无对调品物';

  const instBox = document.getElementById('modal-instruction-box');
  if (instructions.length > 0) {
    instBox.innerText = instructions.join(' | ');
    instBox.classList.remove('hidden');
  } else {
    instBox.classList.add('hidden');
  }

  const methodSelect = document.getElementById('collect-method');
  if (isCurrentOrderOnlinePickup || settlementType === 'receipt_only') {
    methodSelect.value = '仅签收回单';
  } else if (settlementType === 'cash') {
    methodSelect.value = '现金';
  } else {
    methodSelect.value = '挂账签收';
  }

  document.getElementById('collect-discount').value = '0';
  document.getElementById('collect-basket-return').value = '0';

  window.clearSignature();
  window.openModal('collect-modal');
  window.onCollectMethodChange();
};

window.calcBasketDeduct = function () {
  const returnCount = parseInt(document.getElementById('collect-basket-return').value) || 0;
  const deductVal = returnCount * 15;
  const netAmount = parseFloat(document.getElementById('modal-net-amount-text').innerText.replace('¥', '')) || 0;
  const method = document.getElementById('collect-method').value;

  if (method !== '挂账签收' && method !== '仅签收回单' && netAmount > 0) {
    document.getElementById('collect-amount').value = Math.max(0, netAmount - deductVal).toFixed(2);
  }
};

window.onCollectMethodChange = function () {
  const method = document.getElementById('collect-method').value;
  const amountInput = document.getElementById('collect-amount');
  const netAmount = parseFloat(document.getElementById('modal-net-amount-text').innerText.replace('¥', '')) || 0;
  const basketReturn = parseInt(document.getElementById('collect-basket-return').value) || 0;
  const basketDeduct = basketReturn * 15;

  if (method === '挂账签收' || method === '仅签收回单') {
    amountInput.value = '0';
    amountInput.disabled = true;
    amountInput.classList.add('bg-stone-200/60', 'text-stone-400');
  } else {
    amountInput.disabled = false;
    amountInput.classList.remove('bg-stone-200/60', 'text-stone-400');
    if (parseFloat(amountInput.value || '0') === 0 && netAmount > 0) {
      amountInput.value = Math.max(0, netAmount - basketDeduct).toFixed(2);
    }
  }
  window.updateDeliverBtnText();
};

window.updateDeliverBtnText = function () {
  const amountInput = document.getElementById('collect-amount');
  const amountVal = parseFloat(amountInput?.value);
  const amount = isNaN(amountVal) ? 0 : amountVal;

  const discountVal = parseFloat(document.getElementById('collect-discount')?.value);
  const discount = isNaN(discountVal) ? 0 : discountVal;

  const basketReturn = parseInt(document.getElementById('collect-basket-return')?.value) || 0;
  const basketDeduct = basketReturn * 15;

  const netAmount = parseFloat(document.getElementById('modal-net-amount-text')?.innerText.replace('¥', '')) || 0;
  const curDebt = parseFloat(document.getElementById('modal-current-debt')?.value) || 0;
  const creditLimit = parseFloat(document.getElementById('modal-credit-limit')?.value) || 2000;
  const method = document.getElementById('collect-method')?.value || '挂账签收';

  const btn = document.getElementById('btn-submit-collection');
  const warnBanner = document.getElementById('over-credit-warning-banner');
  const warnDesc = document.getElementById('over-credit-warning-desc');
  if (!btn) return;

  btn.disabled = false;
  btn.className = 'flex-1 text-white font-bold py-2.5 rounded-2xl text-xs shadow active:scale-95 transition ';

  if (isCurrentOrderOnlinePickup) {
    warnBanner?.classList.add('hidden');
    btn.classList.add('bg-[#1b4332]', 'hover:bg-[#143628]');
    btn.innerText = '🛍️ 天街自提包裹到店 · 掌柜签收存信';
    return;
  }

  if (netAmount < 0) {
    const refund = Math.abs(netAmount) + basketDeduct;
    warnBanner?.classList.add('hidden');
    btn.classList.add('bg-indigo-800', 'hover:bg-indigo-900');
    if (amount > 0) {
      btn.innerText = `💸 师傅退现 ¥${amount.toFixed(2)} · 收货人收讫`;
    } else if (curDebt > 0) {
      btn.innerText = `📉 差额 ¥${refund.toFixed(2)} 冲减旧款 · 签字相照`;
    } else {
      btn.innerText = `💳 差额 ¥${refund.toFixed(2)} 留存抵后款 · 签字确认`;
    }
    return;
  }

  const expectedNewDebt = Math.max(0, curDebt + netAmount - amount - discount - basketDeduct);
  const isOverCredit = expectedNewDebt > creditLimit;

  if (isOverCredit && amount < netAmount && method !== '仅签收回单') {
    const overAmount = expectedNewDebt - creditLimit;
    warnBanner?.classList.remove('hidden');
    if (warnDesc) {
      warnDesc.innerText = `门店授信额度 ¥${creditLimit}，履约后挂账将达 ¥${expectedNewDebt.toFixed(2)}，超出 ¥${overAmount.toFixed(2)}！依商道规矩暂锁，请收货人补交现款，或请调度台特批放行。`;
    }
    btn.classList.add('bg-rose-600', 'hover:bg-rose-700');
    btn.innerText = `🚨 超出授信 ¥${overAmount.toFixed(2)} · 请调度台特批放行`;
    return;
  } else {
    warnBanner?.classList.add('hidden');
  }

  if (amount > 0 && amount + discount + basketDeduct >= netAmount && netAmount > 0) {
    btn.classList.add('bg-[#1b4332]', 'hover:bg-[#143628]');
    if (amount > netAmount) {
      const payOld = amount - netAmount;
      btn.innerText = `💰 结清本单并多交还旧欠 ¥${payOld.toFixed(1)} · 确认收讫`;
    } else {
      btn.innerText = `✅ 确认收讫 ¥${amount.toFixed(2)} · 钱货两清`;
    }
    return;
  }

  if (amount > 0 && amount + discount + basketDeduct < netAmount) {
    const remain = Math.max(0, netAmount - amount - discount - basketDeduct);
    btn.classList.add('bg-amber-700', 'hover:bg-amber-800');
    btn.innerText = `✅ 实收 ¥${amount.toFixed(2)} · 余款 ¥${remain.toFixed(2)} 记入账期`;
    return;
  }

  if (amount === 0) {
    btn.classList.add('bg-[#1b4332]', 'hover:bg-[#143628]');
    if (method === '仅签收回单') {
      btn.innerText = `📜 仅验货签回单 · 期末统对入账`;
    } else if (netAmount === 0) {
      btn.innerText = `🔀 平价换新 / 冲抵平账 · 签字交接`;
    } else {
      btn.innerText = `📝 收货人签收核验 · 货资计入账本`;
    }
    return;
  }

  btn.classList.add('bg-[#1b4332]', 'hover:bg-[#143628]');
  btn.innerText = '✅ 点验交割 · 签名存信';
};

window.submitCollection = async function () {
  const storeId = parseInt(document.getElementById('modal-store-id').value);
  const orderId = document.getElementById('modal-order-id').value;
  const store = routeStores.find((s) => s.id === storeId);
  const curDebt = parseFloat(document.getElementById('modal-current-debt').value) || 0;
  const creditLimit = parseFloat(document.getElementById('modal-credit-limit').value) || 2000;
  const curBaskets = parseInt(document.getElementById('modal-basket-count').value) || 0;
  const amount = parseFloat(document.getElementById('collect-amount').value) || 0;
  const discount = parseFloat(document.getElementById('collect-discount').value) || 0;
  const basketReturn = parseInt(document.getElementById('collect-basket-return').value) || 0;
  const basketDeduct = basketReturn * 15;
  const method = document.getElementById('collect-method').value;
  const netAmount = isCurrentOrderOnlinePickup ? 0 : parseFloat(document.getElementById('modal-net-amount-text').innerText.replace('¥', '')) || 0;

  if (!isSigned) return alert('请请收货人手写正楷签名，以存商道信义！');

  const expectedNewDebt = isCurrentOrderOnlinePickup
    ? Math.max(0, curDebt - amount - discount - basketDeduct)
    : Math.max(0, curDebt + netAmount - amount - discount - basketDeduct);
  const isOverCredit = !isCurrentOrderOnlinePickup && expectedNewDebt > creditLimit;

  if (isOverCredit && amount < netAmount && method !== '仅签收回单') {
    const overAmount = expectedNewDebt - creditLimit;
    if (!confirm(`【商道通融】当前合作门店挂账超出授信额度 ¥${overAmount.toFixed(2)}。\n是否立即传信至调度台 (hq.html) 请求特信通融？`)) return;

    await DriverService.requestOverCreditApproval(orderId, overAmount);
    alert(`🚨 特信通融请示已传达供货方！\n调度台放行后本页面自动解锁，稍候即可交接。`);
    window.closeModal('collect-modal');
    await window.loadDriverTasks();
    return;
  }

  const signBase64 = canvas.toDataURL('image/png');

  let collectType = 'order_delivery';
  if (netAmount < 0) {
    collectType = 'refund_payout';
  } else if (isCurrentOrderOnlinePickup || method === '挂账签收' || method === '仅签收回单' || amount === 0) {
    collectType = 'credit_sign';
  }

  const newBaskets = Math.max(0, curBaskets - basketReturn);
  const recordToSave = {
    storeId,
    orderId,
    orderIds: [...currentModalOrderIds],
    amount,
    method,
    expectedNewDebt,
    newBaskets,
    signBase64,
    isOnlinePickup: isCurrentOrderOnlinePickup,
    proofImages: [...proofImagesList],
    logPayload: {
      tenant_id: currentAgent,
      store_id: storeId,
      store_name: store ? store.name : '合作门店',
      driver_name: currentDriver,
      collect_type: collectType,
      amount: amount,
      discount_amount: discount,
      basket_return: basketReturn,
      basket_deduct_amount: basketDeduct,
      pay_method: method,
      sign_image_url: signBase64
    }
  };

  try {
    await DriverService.executeSettlement(recordToSave);

    // 若本次签收包含「同城余缺顺路捎带单 (SWAP-)」，自动将互调池对应记录标记为已交割平账
    const matchedOrders = allPendingOrders.filter((o) => currentModalOrderIds.includes(o.id) || String(o.id) === String(orderId));
    const hasSwapOrder = matchedOrders.some(
      (o) => String(o.order_no || '').startsWith('SWAP-') || String(o.note || '').includes('同城余缺互调')
    );
    if (hasSwapOrder) {
      await supabase
        .from('local_inventory_pool')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('tenant_id', currentAgent)
        .eq('to_store_id', storeId)
        .eq('status', 'claimed');
    }

    if (isCurrentOrderOnlinePickup) {
      alert(`✅ 天街自提包裹已送达并签收存信！\n掌柜可通知街坊到店自提，本单服务润利全额归属该合作门店。`);
    } else {
      const mergedTip = currentModalOrderIds.length > 1 ? `（已合并核销 ${currentModalOrderIds.length} 笔单据）` : '';
      alert(`✅ 交割完好！${mergedTip}\n实收款项: ¥${amount.toFixed(2)} (${method})\n迎回周转载具: ${basketReturn} 件 (抵¥${basketDeduct})\n门店剩余在账: ¥${expectedNewDebt.toFixed(2)}。和合共生！`);
    }
  } catch (err) {
    console.warn('网络信号较弱，已自动存入离线防丢单队列:', err);
    DriverService.enqueueOfflineRecord(recordToSave);
    refreshOfflineBanner();
    alert(`📡 当前地下室/街巷信号较弱，本笔签收单已安全锁存至本地离线队列！\n行车至信号良好处点击顶部「立即同步回库」即可。`);
  }

  window.closeModal('collect-modal');
  await window.loadDriverTasks();
  await calculateTodayStats();
};

// =========================================================================
// 6. 顺路新店合作登记、商道建言与回库平账清算
// =========================================================================
window.submitLeadByDriver = async function () {
  const name = document.getElementById('lead-name-input').value.trim();
  const cat = document.getElementById('lead-cat-input').value;
  const boss = document.getElementById('lead-boss-input').value.trim();
  const phone = document.getElementById('lead-phone-input').value.trim();
  const addr = document.getElementById('lead-addr-input').value.trim();
  const note = document.getElementById('lead-note-input').value.trim();

  if (!name || !phone || phone.length < 11) {
    return alert('请写全招牌全名与 11 位联系手机号！');
  }

  await DriverService.submitStoreLead({
    tenant_id: currentAgent,
    shop_name: name,
    boss_name: boss || '当家掌柜',
    phone: phone,
    address: addr || '顺路拜访',
    intent_level: '送货师傅顺路引荐',
    note: `[行业: ${cat}] 师傅${currentDriver}引荐: ${note}`
  });

  alert(`🎉 合作意向已登记！已存入【${name}】合作意向池，立户合作将记师傅引荐功劳！`);
  document.getElementById('lead-name-input').value = '';
  document.getElementById('lead-phone-input').value = '';
  document.getElementById('lead-note-input').value = '';
  window.switchWorkTab('deliver');
};

window.openSuggestionModal = function () {
  document.getElementById('driver-suggestion-text').value = '';
  window.openModal('modal-suggestion');
};

window.submitDriverSuggestion = async function () {
  const content = document.getElementById('driver-suggestion-text').value.trim();
  if (!content) return alert('请写下您的宝贵建言！');

  await DriverService.submitSuggestion({
    proposer_type: 'driver',
    proposer_name: `${currentDriver}(${currentAgent})`,
    category: '送货师傅一线体验',
    content: content
  });

  alert('建言已呈达平台总控，感谢师傅为百工协作生态添砖加瓦！');
  window.closeModal('modal-suggestion');
};

async function calculateTodayStats() {
  const list = await DriverService.fetchUnsettledLogs(currentAgent, currentDriver);
  let totalCash = 0,
    totalWechat = 0,
    totalBaskets = 0,
    totalDiscount = 0;

  list.forEach((l) => {
    const pm = l.pay_method || '';
    if (pm === '现金' || pm === '現金') {
      totalCash += parseFloat(l.amount || 0);
    } else if (pm === '电子扫码/转账' || pm === '電子掃碼/轉賬' || pm === '微信转账' || pm === '微信轉賬' || pm === '公司码' || pm === '公司碼') {
      totalWechat += parseFloat(l.amount || 0);
    } else if (pm !== '挂账签收' && pm !== '掛賬簽收' && pm !== '仅签收回单' && pm !== '僅簽收回單') {
      totalCash += parseFloat(l.amount || 0);
    }

    totalBaskets += parseInt(l.basket_return || 0);
    totalDiscount += parseFloat(l.discount_amount || 0);
  });

  const grandTotal = totalCash + totalWechat;
  document.getElementById('today-cash-collected').innerText = `¥${grandTotal.toFixed(2)}`;
  document.getElementById('stat-cash').innerText = `¥${totalCash.toFixed(1)}`;
  document.getElementById('stat-wechat').innerText = `¥${totalWechat.toFixed(1)}`;
  document.getElementById('stat-done-count').innerText = list.length;

  document.getElementById('chk-driver').innerText = currentDriver;
  document.getElementById('chk-cash').innerText = `¥${totalCash.toFixed(2)}`;
  document.getElementById('chk-wechat').innerText = `¥${totalWechat.toFixed(2)}`;
  document.getElementById('chk-baskets').innerText = `${totalBaskets} 件`;
  document.getElementById('chk-discount').innerText = `¥${totalDiscount.toFixed(2)}`;
  document.getElementById('chk-total').innerText = `¥${grandTotal.toFixed(2)}`;
}

window.openCheckoutSummaryModal = function () {
  window.openModal('checkout-modal');
};

window.finalizeSettlement = async function () {
  if (!confirm('出纳已清点现钞、转账与周转载具？确认后随车台账归零，平账收工。')) return;

  await DriverService.finalizeDriverCheckout(currentAgent, currentDriver);

  alert('🎉 归库平账圆满！辛苦师傅，随车台账清爽入库。');
  window.closeModal('checkout-modal');
  await calculateTodayStats();
};

export async function initDriverController() {
  document.getElementById('driver-name-display').innerText = currentDriver;
  document.getElementById('tenant-display').innerText = currentAgent;
  refreshOfflineBanner();
  initSignPad();
  await window.loadDriverTasks();
  await calculateTodayStats();
}
