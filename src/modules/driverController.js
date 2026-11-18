import { compressImageFile } from '../utils/storage.js';
import { DriverService } from '../services/driverService.js';

const urlParams = new URLSearchParams(window.location.search);
const urlTenant = urlParams.get('t') || urlParams.get('tenant');
if (urlTenant && urlTenant.trim()) {
  localStorage.setItem('active_agent', urlTenant.trim().toUpperCase());
}

let currentAgent = (localStorage.getItem('active_agent') || 'BJ_SHUNDA').trim().toUpperCase();
let currentDriver = localStorage.getItem('active_driver') || '老張師傅';
let routeStores = [];
let allPendingOrders = [];
let onlyShowWithOrders = false;
let proofImagesList = [];
let isSigned = false;
let isCurrentOrderOnlinePickup = false;
let canvas, ctx, drawing = false;
let signPadBound = false;

window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

// =========================================================================
// 1. 離線緩存隊列同步
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
      console.error('離線單據同步失敗:', err);
      failed.push(item);
    }
  }

  DriverService.saveOfflineQueue(failed);
  refreshOfflineBanner();
  if (btn) {
    btn.disabled = false;
    btn.innerText = '立即同步回庫';
  }

  if (failed.length === 0) {
    alert('🎉 所有離線暫存簽收單已全部同步回雲端賬本！');
    await window.loadDriverTasks();
    await calculateTodayStats();
  } else {
    alert(`已同步部分單據，仍有 ${failed.length} 筆因信號不穩留在隊列，請稍後再試。`);
  }
};

// =========================================================================
// 2. 路線篩選、憑證拍照與工作模式切換
// =========================================================================
window.toggleOnlyOrdersFilter = function () {
  onlyShowWithOrders = !onlyShowWithOrders;
  const btn = document.getElementById('btn-toggle-only-orders');
  if (btn) {
    btn.innerText = onlyShowWithOrders ? '只看今日有單' : '全部門店';
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
    console.error('憑證圖壓縮失敗:', e);
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
    strip.innerHTML = '<span class="text-[10px] text-stone-400">未附憑證圖（如收微信轉賬建議拍照留底）</span>';
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
  const input = prompt('輸入所屬供貨廠商的商號代號（如 NY-FUNIU 或 BJ_SHUNDA）：', currentAgent);
  if (!input || !input.trim()) return;
  const cleanTenant = input.trim().toUpperCase();

  const tenant = await DriverService.verifyTenant(cleanTenant);
  if (!tenant) {
    return alert(`未查到商號代號為【${cleanTenant}】的在冊廠商！`);
  }
  if (!tenant.is_active) {
    return alert(`商號【${tenant.company_name}】當前處於暫歇狀態，無法切換。`);
  }

  currentAgent = cleanTenant;
  localStorage.setItem('active_agent', currentAgent);
  alert(`✅ 已切換至商號【${tenant.company_name}】(${currentAgent})`);
  initDriverController();
};

window.switchDriverPrompt = function () {
  const name = prompt('輸入送貨員姓名：', currentDriver);
  if (name && name.trim()) {
    currentDriver = name.trim();
    localStorage.setItem('active_driver', currentDriver);
    initDriverController();
  }
};

// =========================================================================
// 3. 手寫簽名板（防重複綁定事件）
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
// 4. 配送路線載入與渲染（含百工天街門店自提捎帶單識別）
// =========================================================================
window.loadDriverTasks = async function () {
  const container = document.getElementById('route-container');
  container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">路線門店調閱中...</div>';

  const { stores, pendingOrders } = await DriverService.fetchRouteData(currentAgent);
  routeStores = stores;
  allPendingOrders = pendingOrders;
  renderRouteStores();
};

function renderRouteStores() {
  const container = document.getElementById('route-container');
  if (routeStores.length === 0) {
    container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">暫無待送實體門店。</div>';
    return;
  }

  const sortedStores = [...routeStores].sort((a, b) => {
    const aHas = allPendingOrders.some((o) => o.store_id === a.id) ? 1 : 0;
    const bHas = allPendingOrders.some((o) => o.store_id === b.id) ? 1 : 0;
    return bHas - aHas;
  });

  const displayList = onlyShowWithOrders ? sortedStores.filter((s) => allPendingOrders.some((o) => o.store_id === s.id)) : sortedStores;

  if (displayList.length === 0) {
    container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">今日暫無已排單待送貨門店（點擊上方「只看今日有單」可查看全部門店）。</div>';
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
          const netAmount = parseFloat(o.net_settle_amount || o.total_amount || 0);

          return `
            <div class="bg-stone-50 border ${
              isMallPickup ? 'border-emerald-400 bg-emerald-50/40' : isOverCreditPending ? 'border-rose-400 bg-rose-50/40' : 'border-stone-200'
            } rounded-xl p-2.5 text-[11px] text-stone-800 mt-1 space-y-1">
              <div class="flex justify-between items-center font-bold">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span>契約 #${o.order_no || o.id}</span>
                  ${isMallPickup ? '<span class="text-[9px] bg-emerald-700 text-white px-1.5 py-0.2 rounded font-bold">🛍️ 天街自提捎帶單（已付清）</span>' : ''}
                  ${isOverCreditPending ? '<span class="text-[9px] bg-rose-500 text-white px-1.5 py-0.2 rounded font-bold animate-pulse">待特信放行</span>' : ''}
                  ${isOverCreditApproved ? '<span class="text-[9px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-bold">總代已特批</span>' : ''}
                </div>
                <span class="${isMallPickup ? 'text-emerald-800' : 'text-rose-700'} font-mono font-bold">
                  ${isMallPickup ? '已付 ¥0到付' : `淨付: ¥${netAmount.toFixed(2)}`}
                </span>
              </div>

              ${
                o.driver_action_instruction
                  ? `<div class="bg-emerald-50 text-emerald-950 p-1.5 rounded-lg font-bold text-[10px] border border-emerald-200">${o.driver_action_instruction}</div>`
                  : ''
              }

              <div class="text-[10px] space-y-0.5 text-stone-600">
                <div>📦 送抵正品: ${orderStr || '無'}</div>
                ${itemsReturn.length ? `<div class="text-rose-700 font-bold">🔄 驗退舊品: ${returnStr}</div>` : ''}
                ${itemsExchange.length ? `<div class="text-amber-800 font-bold">🔀 對調品物: ${exchangeStr}</div>` : ''}
              </div>

              ${o.note ? `<div class="text-[10px] text-amber-900 font-medium">💬 附言叮嚀: ${o.note}</div>` : ''}
            </div>
          `;
        })
        .join('');

      const firstOrder = storeOrders.length > 0 ? storeOrders[0] : null;
      const totalNetOrderAmount = storeOrders.reduce((sum, o) => {
        if (o.order_source === 'online_mall' || o.settlement_type === 'online_paid') return sum;
        return sum + parseFloat(o.net_settle_amount || o.total_amount || 0);
      }, 0);

      return `
        <div class="p-3.5 ${hasOrders ? 'bg-amber-50/30 border-amber-300 shadow-xs' : 'bg-stone-50/60 border-stone-200/80'} border rounded-2xl space-y-2 hover:bg-white transition">
          <div class="flex justify-between items-start">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-mono text-[10px] bg-stone-200 text-stone-700 px-1.5 py-0.2 rounded font-bold">#${idx + 1}</span>
                <b class="text-xs text-stone-800">${s.name}</b>
                <span class="text-[9px] bg-stone-200/80 text-stone-600 px-1.5 py-0.2 rounded">${s.shop_category || '實體百工'}</span>
                ${hasOrders ? `<span class="bg-amber-600 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">待交割 (${storeOrders.length})</span>` : ''}
              </div>
              <div class="text-[11px] text-stone-400 mt-0.5">
                掌櫃: ${s.contact || '掌櫃'} · 電話: <a href="tel:${s.phone}" class="text-emerald-800 font-bold underline font-mono">${s.phone}</a>
              </div>
              <div class="text-[10px] text-stone-500 mt-0.5">地址: ${s.address || '臨街門面'}</div>
            </div>

            <div class="text-right">
              <span class="text-[10px] text-stone-400 block">待清賬期</span>
              <b class="font-mono text-sm ${debt > 0 ? 'text-rose-700' : 'text-emerald-800'} font-bold">
                ¥${debt.toFixed(2)}
              </b>
            </div>
          </div>

          ${orderSummary}

          <div class="pt-2 border-t border-stone-200/60 flex justify-between items-center gap-2">
            <a href="tel:${s.phone}" class="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 active:scale-95">
              📞 致電
            </a>
            <button onclick="window.openCollectModal(${s.id}, '${s.name.replace(/'/g, "\\'")}', ${debt}, '${firstOrder ? firstOrder.id : ''}', ${totalNetOrderAmount}, ${
        s.carrier_hold_count || s.basket_count || 0
      }, ${s.credit_limit || 2000})" class="flex-1 text-[11px] bg-[#1b4332] hover:bg-[#143628] text-white font-bold py-1.5 rounded-xl shadow active:scale-95 transition">
              🤝 現場點驗核銷 (收退/歸具/平賬)
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

// =========================================================================
// 5. 現場核銷彈窗與動態算賬引擎（支持天街門店自提單免收現簽收）
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

  let itemsOrder = [];
  let itemsReturn = [];
  let itemsExchange = [];
  let totalOrderAmount = orderAmount;
  let returnDeductAmount = 0;
  let netAmount = orderAmount;
  let settlementType = 'credit';
  let instructionText = '';

  if (orderId) {
    const o = await DriverService.fetchOrderDetail(orderId);
    if (o) {
      itemsOrder = Array.isArray(o.items) ? o.items : [];
      itemsReturn = Array.isArray(o.items_return) ? o.items_return : [];
      itemsExchange = Array.isArray(o.items_exchange) ? o.items_exchange : [];
      settlementType = o.settlement_type || 'credit';
      instructionText = o.driver_action_instruction || '';

      isCurrentOrderOnlinePickup = o.order_source === 'online_mall' || settlementType === 'online_paid';
      if (isCurrentOrderOnlinePickup) {
        totalOrderAmount = 0;
        returnDeductAmount = 0;
        netAmount = 0;
        instructionText = `🛍️【天街門店自提捎帶單】街坊線上已付清（潤利歸屬該店），請門店掌櫃點收包裹簽字即可，切勿向掌櫃重複收款！`;
      } else {
        totalOrderAmount = parseFloat(o.total_amount || 0);
        returnDeductAmount = parseFloat(o.return_amount || 0);
        netAmount = parseFloat(o.net_settle_amount || totalOrderAmount - returnDeductAmount);
      }
    }
  }

  document.getElementById('modal-settlement-type').value = settlementType;
  document.getElementById('modal-order-amount-text').innerText = isCurrentOrderOnlinePickup ? '¥0.00 (天街已付)' : `¥${totalOrderAmount.toFixed(2)}`;
  document.getElementById('modal-return-amount-text').innerText = `-¥${returnDeductAmount.toFixed(2)}`;
  document.getElementById('modal-net-amount-text').innerText = `¥${netAmount.toFixed(2)}`;
  document.getElementById('modal-debt-text').innerText = `¥${debt.toFixed(2)}`;
  document.getElementById('modal-limit-text').innerText = `¥${creditLimit || 2000}`;
  document.getElementById('modal-basket-text').innerText = `${basketCount} 件`;

  document.getElementById('modal-items-order-list').innerHTML = itemsOrder.length
    ? itemsOrder.map((i) => `<div>• ${i.name} (${i.spec || '整裝'}) x <b>${i.qty}${i.measure_unit || '件'}</b> <span class="text-[9px] text-emerald-800 font-mono">[物勒工名正品]</span></div>`).join('')
    : '無新到品物';

  document.getElementById('modal-items-return-list').innerHTML = itemsReturn.length
    ? itemsReturn.map((i) => `<div>• ${i.name} x <b>${i.qty}${i.measure_unit || '件'}</b> (抵-¥${i.price}) [原由: ${i.reason || '破損/退貨'}]</div>`).join('')
    : '無須帶回舊品';

  document.getElementById('modal-items-exchange-list').innerHTML = itemsExchange.length
    ? itemsExchange.map((i) => `<div>• ${i.name} x <b>${i.qty}${i.measure_unit || '件'}</b> [對調: ${i.reason || '同款換新'}]</div>`).join('')
    : '無對調品物';

  const instBox = document.getElementById('modal-instruction-box');
  if (instructionText) {
    instBox.innerText = instructionText;
    instBox.classList.remove('hidden');
  } else {
    instBox.classList.add('hidden');
  }

  const methodSelect = document.getElementById('collect-method');
  if (isCurrentOrderOnlinePickup || settlementType === 'receipt_only') {
    methodSelect.value = '僅簽收回單';
  } else if (settlementType === 'cash') {
    methodSelect.value = '現金';
  } else {
    methodSelect.value = '掛賬簽收';
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

  if (method !== '掛賬簽收' && method !== '僅簽收回單' && netAmount > 0) {
    document.getElementById('collect-amount').value = Math.max(0, netAmount - deductVal).toFixed(2);
  }
};

window.onCollectMethodChange = function () {
  const method = document.getElementById('collect-method').value;
  const amountInput = document.getElementById('collect-amount');
  const netAmount = parseFloat(document.getElementById('modal-net-amount-text').innerText.replace('¥', '')) || 0;
  const basketReturn = parseInt(document.getElementById('collect-basket-return').value) || 0;
  const basketDeduct = basketReturn * 15;

  if (method === '掛賬簽收' || method === '僅簽收回單') {
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
  const method = document.getElementById('collect-method')?.value || '掛賬簽收';

  const btn = document.getElementById('btn-submit-collection');
  const warnBanner = document.getElementById('over-credit-warning-banner');
  const warnDesc = document.getElementById('over-credit-warning-desc');
  if (!btn) return;

  btn.disabled = false;
  btn.className = 'flex-1 text-white font-bold py-2.5 rounded-2xl text-xs shadow active:scale-95 transition ';

  if (isCurrentOrderOnlinePickup) {
    warnBanner?.classList.add('hidden');
    btn.classList.add('bg-[#1b4332]', 'hover:bg-[#143628]');
    btn.innerText = '🛍️ 天街自提包裹到店 · 掌櫃簽收存信';
    return;
  }

  if (netAmount < 0) {
    const refund = Math.abs(netAmount) + basketDeduct;
    warnBanner?.classList.add('hidden');
    btn.classList.add('bg-indigo-800', 'hover:bg-indigo-900');
    if (amount > 0) {
      btn.innerText = `💸 師傅退現 ¥${amount.toFixed(2)} · 收貨人收訖`;
    } else if (curDebt > 0) {
      btn.innerText = `📉 差額 ¥${refund.toFixed(2)} 沖減舊款 · 簽字相照`;
    } else {
      btn.innerText = `💳 差額 ¥${refund.toFixed(2)} 留存抵後款 · 簽字確認`;
    }
    return;
  }

  const expectedNewDebt = Math.max(0, curDebt + netAmount - amount - discount - basketDeduct);
  const isOverCredit = expectedNewDebt > creditLimit;

  if (isOverCredit && amount < netAmount && method !== '僅簽收回單') {
    const overAmount = expectedNewDebt - creditLimit;
    warnBanner?.classList.remove('hidden');
    if (warnDesc) {
      warnDesc.innerText = `門店授信寬限 ¥${creditLimit}，履約後掛賬將達 ¥${expectedNewDebt.toFixed(2)}，超出 ¥${overAmount.toFixed(2)}！依商道規矩暫鎖，請收貨人補交現款，或請廠商特批放行。`;
    }
    btn.classList.add('bg-rose-600', 'hover:bg-rose-700');
    btn.innerText = `🚨 超出授信 ¥${overAmount.toFixed(2)} · 請廠商特批放行`;
    return;
  } else {
    warnBanner?.classList.add('hidden');
  }

  if (amount > 0 && amount + discount + basketDeduct >= netAmount && netAmount > 0) {
    btn.classList.add('bg-[#1b4332]', 'hover:bg-[#143628]');
    if (amount > netAmount) {
      const payOld = amount - netAmount;
      btn.innerText = `💰 結清本單並多交還舊欠 ¥${payOld.toFixed(1)} · 確認收訖`;
    } else {
      btn.innerText = `✅ 確認收訖 ¥${amount.toFixed(2)} · 錢貨結清`;
    }
    return;
  }

  if (amount > 0 && amount + discount + basketDeduct < netAmount) {
    const remain = Math.max(0, netAmount - amount - discount - basketDeduct);
    btn.classList.add('bg-amber-700', 'hover:bg-amber-800');
    btn.innerText = `✅ 實收 ¥${amount.toFixed(2)} · 餘款 ¥${remain.toFixed(2)} 記入賬期`;
    return;
  }

  if (amount === 0) {
    btn.classList.add('bg-[#1b4332]', 'hover:bg-[#143628]');
    if (method === '僅簽收回單') {
      btn.innerText = `📜 僅驗貨簽回單 · 期末統對入賬`;
    } else if (netAmount === 0) {
      btn.innerText = `🔀 平價換新 / 沖抵平賬 · 簽字交接`;
    } else {
      btn.innerText = `📝 收貨人簽收核驗 · 貨資計入賬本`;
    }
    return;
  }

  btn.classList.add('bg-[#1b4332]', 'hover:bg-[#143628]');
  btn.innerText = '✅ 點驗交割 · 簽名存信';
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

  if (!isSigned) return alert('請請收貨人手寫正楷簽名，以存商道信義！');

  const expectedNewDebt = isCurrentOrderOnlinePickup
    ? Math.max(0, curDebt - amount - discount - basketDeduct)
    : Math.max(0, curDebt + netAmount - amount - discount - basketDeduct);
  const isOverCredit = !isCurrentOrderOnlinePickup && expectedNewDebt > creditLimit;

  if (isOverCredit && amount < netAmount && method !== '僅簽收回單') {
    const overAmount = expectedNewDebt - creditLimit;
    if (!confirm(`【商道通融】當前實體門店掛賬超出寬限 ¥${overAmount.toFixed(2)}。\n是否立即傳信至廠家總調度中心 (hq.html) 請求特信通融？`)) return;

    await DriverService.requestOverCreditApproval(orderId, overAmount);
    alert(`🚨 特信通融請示已傳達廠商！\n廠商點允後本頁面自動解鎖，稍候即可交接。`);
    window.closeModal('collect-modal');
    await window.loadDriverTasks();
    return;
  }

  const signBase64 = canvas.toDataURL('image/png');

  let collectType = 'order_delivery';
  if (netAmount < 0) {
    collectType = 'refund_payout';
  } else if (isCurrentOrderOnlinePickup || method === '掛賬簽收' || method === '僅簽收回單' || amount === 0) {
    collectType = 'credit_sign';
  }

  const newBaskets = Math.max(0, curBaskets - basketReturn);
  const recordToSave = {
    storeId,
    orderId,
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
      store_name: store ? store.name : '合作實體門店',
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
    if (isCurrentOrderOnlinePickup) {
      alert(`✅ 天街自提包裹已送達並簽收存信！\n掌櫃可通知街坊到店自提，本單零售潤利全額歸屬該實體門店。`);
    } else {
      alert(`✅ 交割完好！\n實收金銀: ¥${amount.toFixed(2)} (${method})\n迎回周轉載具: ${basketReturn} 件 (抵¥${basketDeduct})\n門店剩餘在賬: ¥${expectedNewDebt.toFixed(2)}。仁信共生！`);
    }
  } catch (err) {
    console.warn('網絡信號較弱，已自動存入離線防丟單隊列:', err);
    DriverService.enqueueOfflineRecord(recordToSave);
    refreshOfflineBanner();
    alert(`📡 當前地下室/街巷信號較弱，本筆簽收單已安全鎖存至本地離線隊列！\n行車至信號良好處點擊頂部「立即同步回庫」即可。`);
  }

  window.closeModal('collect-modal');
  await window.loadDriverTasks();
  await calculateTodayStats();
};

// =========================================================================
// 6. 巡街拓客、商道建言與回庫平賬清算
// =========================================================================
window.submitLeadByDriver = async function () {
  const name = document.getElementById('lead-name-input').value.trim();
  const cat = document.getElementById('lead-cat-input').value;
  const boss = document.getElementById('lead-boss-input').value.trim();
  const phone = document.getElementById('lead-phone-input').value.trim();
  const addr = document.getElementById('lead-addr-input').value.trim();
  const note = document.getElementById('lead-note-input').value.trim();

  if (!name || !phone || phone.length < 11) {
    return alert('請寫全招牌全名與 11 位聯繫手機號！');
  }

  await DriverService.submitStoreLead({
    tenant_id: currentAgent,
    shop_name: name,
    boss_name: boss || '當家掌櫃',
    phone: phone,
    address: addr || '巡街拜訪',
    intent_level: '供貨師傅沿街引薦',
    note: `[行業: ${cat}] 師傅${currentDriver}引薦: ${note}`
  });

  alert(`🎉 結緣成功！已存入【${name}】拓客池，大當家成單將記師傅引薦功勞！`);
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
  if (!content) return alert('請寫下您的寶貴建言！');

  await DriverService.submitSuggestion({
    proposer_type: 'driver',
    proposer_name: `${currentDriver}(${currentAgent})`,
    category: '供貨師傅一線體驗',
    content: content
  });

  alert('建言已呈達平台總控，感謝師傅為百工生態添磚加瓦！');
  window.closeModal('modal-suggestion');
};

async function calculateTodayStats() {
  const list = await DriverService.fetchUnsettledLogs(currentAgent, currentDriver);
  let totalCash = 0,
    totalWechat = 0,
    totalBaskets = 0,
    totalDiscount = 0;

  list.forEach((l) => {
    if (l.pay_method === '現金') {
      totalCash += parseFloat(l.amount || 0);
    } else if (l.pay_method === '電子掃碼/轉賬' || l.pay_method === '微信轉賬' || l.pay_method === '公司碼') {
      totalWechat += parseFloat(l.amount || 0);
    } else if (l.pay_method !== '掛賬簽收' && l.pay_method !== '僅簽收回單') {
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
  if (!confirm('出納已清點真金現鈔、轉賬與周轉載具？確認後隨車錢箱歸零，平賬收工。')) return;

  await DriverService.finalizeDriverCheckout(currentAgent, currentDriver);

  alert('🎉 歸庫平賬圓滿！辛苦師傅，錢箱清爽入庫。');
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
