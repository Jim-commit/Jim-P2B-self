import { MallService } from '../../services/mallService.js';
import {
  mallState,
  CART_STORAGE_KEY,
  LAST_CUST_KEY,
  computePickupPin,
  calcMallOnlinePrice,
  getEffectiveUnitPrice,
  getTierLabel,
  getNextTierHint
} from './mallState.js';
import { parseDemandPayload } from './mallC2BModule.js';

export function persistCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(mallState.cart));
  } catch (e) {}
}

export function restoreCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) mallState.cart = saved;
  } catch (e) {
    mallState.cart = [];
  }
}

export function calcCartSummary() {
  let totalQty = 0;
  let totalAmt = 0;
  let savedAmt = 0;

  mallState.cart.forEach((item) => {
    const { unitPrice, basePrice } = calcMallOnlinePrice(item.prod, item.qty);
    totalQty += item.qty;
    totalAmt += unitPrice * item.qty;
    if (basePrice > unitPrice) {
      savedAmt += (basePrice - unitPrice) * item.qty;
    }
  });

  return { totalQty, totalAmt, savedAmt };
}

export function updateCartBadge() {
  const { totalQty, totalAmt } = calcCartSummary();

  const badge = document.getElementById('cart-badge-count');
  if (badge) {
    if (totalQty > 0) {
      badge.innerText = totalQty;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  const totalEl = document.getElementById('cart-total-price');
  const drawerTotalEl = document.getElementById('cart-drawer-total');
  if (totalEl) totalEl.innerText = `¥${totalAmt.toFixed(2)}`;
  if (drawerTotalEl) drawerTotalEl.innerText = `¥${totalAmt.toFixed(2)}`;
}

export function renderCartDrawer() {
  const list = document.getElementById('cart-items-list');
  if (!list) return;
  if (mallState.cart.length === 0) {
    list.innerHTML = '<div class="py-8 text-center text-stone-400 text-xs">购物篮尚无品项。</div>';
    return;
  }

  list.innerHTML = mallState.cart
    .map((item) => {
      const unitPrice = getEffectiveUnitPrice(item.prod, item.qty);
      const tierLabel = getTierLabel(item.prod, item.qty);
      const nextHint = getNextTierHint(item.prod, item.qty);
      return `
        <div class="py-2.5 flex justify-between items-center gap-2 text-xs">
          <div class="min-w-0 flex-1">
            <b class="text-stone-900 block truncate">${item.prod.name}</b>
            <span class="font-mono text-[10px] text-stone-500 block">
              单价: <b class="text-emerald-800">¥${unitPrice}</b> (${tierLabel}) · 小计: ¥${(unitPrice * item.qty).toFixed(2)}
            </span>
            ${nextHint ? `<span class="text-[10px] text-amber-700 font-bold">💡 ${nextHint}</span>` : ''}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="window.changeCartQty(${item.prod.id}, -1)" class="w-6 h-6 bg-stone-100 rounded-lg font-bold font-mono">-</button>
            <input type="number" min="1" value="${item.qty}" onchange="window.setCartQty(${item.prod.id}, this.value)" class="w-11 text-center bg-stone-50 border border-stone-200 rounded-lg py-0.5 font-bold font-mono outline-none">
            <button onclick="window.changeCartQty(${item.prod.id}, 1)" class="w-6 h-6 bg-stone-100 rounded-lg font-bold font-mono">+</button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function updateCheckoutProfitAndGroupNotice() {
  const noticeEl = document.getElementById('checkout-profit-notice');
  const groupBar = document.getElementById('checkout-group-buy-bar');
  if (!noticeEl) return;

  const mode = document.getElementById('order-delivery-mode')?.value || 'pickup';
  const pickupName = document.getElementById('order-pickup-input')?.value.trim();
  const activeStoreId = mallState.selectedPickupStoreId || (mallState.referrerStoreObj ? String(mallState.referrerStoreObj.id) : '');

  if (mode === 'pickup' && pickupName) {
    noticeEl.innerText = `🤝 服务归店契约：本单服务润利全额归属【${pickupName}】，源头直供品质担保`;
  } else if (mallState.referrerStoreObj) {
    noticeEl.innerText = `🤝 服务归店契约：本单服务润利全额归属【${mallState.referrerStoreObj.name}】，源头直供品质担保`;
  } else {
    noticeEl.innerText = '📜 商道公示：全网统一阳光正价，不破价、不挤兑周边合作门店';
  }

  if (groupBar && mode === 'pickup' && activeStoreId) {
    const existingQty = await MallService.fetchStoreGroupBuyCount(activeStoreId);
    const { totalQty } = calcCartSummary();
    const combinedQty = existingQty + totalQty;
    const targetQty = 10;
    const pct = Math.min(100, Math.round((combinedQty / targetQty) * 100));

    groupBar.innerHTML = `
      <div class="flex justify-between text-[10px] font-bold text-amber-950 mb-1">
        <span>🚚 本门店邻里拼单随车直达进度（含本单共 ${combinedQty}/${targetQty} 件）</span>
        <span>${combinedQty >= targetQty ? '🎉 已满随车直发线' : `再拼 ${targetQty - combinedQty} 件整车捎带`}</span>
      </div>
      <div class="w-full h-1.5 bg-amber-200/70 rounded-full overflow-hidden">
        <div class="h-full bg-amber-600 rounded-full transition-all" style="width: ${pct}%"></div>
      </div>
    `;
    groupBar.classList.remove('hidden');
  } else if (groupBar) {
    groupBar.classList.add('hidden');
  }
}

export function initCartOrderBindings() {
  window.openCartModal = function () {
    renderCartDrawer();
    window.openModal('modal-cart');
  };

  window.addToCart = function (prodId, qtyToAdd = 1) {
    const p = mallState.allProducts.find((x) => x.id === prodId);
    if (!p) return false;

    const tenant = mallState.allTenants.find((t) => t.tenant_id === p.tenant_id) || {};
    const settings = tenant.custom_settings && typeof tenant.custom_settings === 'object' ? tenant.custom_settings : {};
    const rationLimit = parseInt(settings.rationLimitQty || 0);

    const item = mallState.cart.find((x) => x.prod.id === prodId);
    const nextQty = (item ? item.qty : 0) + qtyToAdd;

    if (rationLimit > 0 && nextQty > rationLimit) {
      alert(`🛡️ 常平仓紧缺定额配给提示：\n当前货品处于定额配给期，单笔最多限购 ${rationLimit} ${p.measure_unit || '件'}，防止中间商囤积居奇。`);
      return false;
    }

    if (item) item.qty = nextQty;
    else mallState.cart.push({ prod: p, qty: qtyToAdd });

    persistCart();
    updateCartBadge();
    return true;
  };

  window.reorderPastOrder = function (encodedItems) {
    let items = [];
    try {
      items = JSON.parse(decodeURIComponent(encodedItems));
    } catch (e) {}
    if (!Array.isArray(items) || items.length === 0) return;

    let addedCount = 0;
    items.forEach((it) => {
      if (window.addToCart(it.id, parseInt(it.qty || 1))) addedCount++;
    });

    window.closeModal('modal-my-orders');
    if (addedCount > 0) window.openCartModal();
    else alert('该历史单据中的部分商品已调整规格或暂未上架，请前往专柜挑选新品。');
  };

  window.changeCartQty = function (prodId, delta) {
    const item = mallState.cart.find((x) => x.prod.id === prodId);
    if (!item) return;

    const tenant = mallState.allTenants.find((t) => t.tenant_id === item.prod.tenant_id) || {};
    const settings = tenant.custom_settings && typeof tenant.custom_settings === 'object' ? tenant.custom_settings : {};
    const rationLimit = parseInt(settings.rationLimitQty || 0);

    const nextQty = item.qty + delta;
    if (rationLimit > 0 && nextQty > rationLimit) {
      return alert(`🛡️ 当前货品处于定额配给期，单笔最多限购 ${rationLimit} ${item.prod.measure_unit || '件'}。`);
    }

    item.qty = nextQty;
    if (item.qty <= 0) mallState.cart = mallState.cart.filter((x) => x.prod.id !== prodId);
    persistCart();
    updateCartBadge();
    renderCartDrawer();
  };

  window.setCartQty = function (prodId, rawVal) {
    const val = parseInt(rawVal);
    if (isNaN(val) || val <= 0) {
      mallState.cart = mallState.cart.filter((x) => x.prod.id !== prodId);
    } else {
      const item = mallState.cart.find((x) => x.prod.id === prodId);
      if (item) {
        const tenant = mallState.allTenants.find((t) => t.tenant_id === item.prod.tenant_id) || {};
        const settings = tenant.custom_settings && typeof tenant.custom_settings === 'object' ? tenant.custom_settings : {};
        const rationLimit = parseInt(settings.rationLimitQty || 0);
        if (rationLimit > 0 && val > rationLimit) {
          alert(`🛡️ 当前货品处于定额配给期，单笔最多限购 ${rationLimit} ${item.prod.measure_unit || '件'}。`);
          item.qty = rationLimit;
        } else {
          item.qty = val;
        }
      }
    }
    persistCart();
    updateCartBadge();
    renderCartDrawer();
  };

  window.clearCart = function () {
    mallState.cart = [];
    persistCart();
    updateCartBadge();
    renderCartDrawer();
  };

  window.onDeliveryModeChange = function (mode) {
    const expressBox = document.getElementById('checkout-express-box');
    const pickupBox = document.getElementById('checkout-pickup-box');
    if (mode === 'pickup') {
      expressBox?.classList.add('hidden');
      pickupBox?.classList.remove('hidden');
    } else {
      expressBox?.classList.remove('hidden');
      pickupBox?.classList.add('hidden');
    }
    updateCheckoutProfitAndGroupNotice();
  };

  window.onSearchPickupStore = function (keyword) {
    const q = (keyword || '').trim().toLowerCase();
    const listEl = document.getElementById('pickup-store-candidates');
    updateCheckoutProfitAndGroupNotice();
    if (!listEl) return;

    const matched = q
      ? mallState.pickupStores.filter((s) => (s.name || '').toLowerCase().includes(q) || (s.address || '').toLowerCase().includes(q))
      : mallState.pickupStores.slice(0, 6);

    if (matched.length === 0) {
      listEl.innerHTML = '<span class="text-[10px] text-stone-400">未匹配到在册门店，直接填写您常去的合作门店名称即可</span>';
      mallState.selectedPickupStoreId = '';
      return;
    }

    listEl.innerHTML = matched
      .slice(0, 6)
      .map(
        (s) => `
        <button type="button" onclick="window.selectPickupStore(${s.id}, '${s.name.replace(/'/g, "\\'")}', '${(s.address || '').replace(/'/g, "\\'")}')" class="text-left w-full px-2.5 py-1.5 rounded-xl border text-[11px] transition ${
          String(mallState.selectedPickupStoreId) === String(s.id)
            ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-bold'
            : 'bg-white border-stone-200 text-stone-700 hover:border-emerald-600'
        }">
          🏪 ${s.name} <span class="text-[10px] text-stone-400">(${s.address || '合作门店'})</span>
        </button>
      `
      )
      .join('');
  };

  window.selectPickupStore = function (id, name, address) {
    mallState.selectedPickupStoreId = String(id);
    const input = document.getElementById('order-pickup-input');
    if (input) input.value = `${name}${address ? ` (${address})` : ''}`;
    window.onSearchPickupStore('');
  };

  window.openCheckoutModal = async function () {
    if (mallState.cart.length === 0) return alert('购物篮尚无好物，请先挑选良品！');
    const { totalAmt, savedAmt } = calcCartSummary();

    const el = document.getElementById('checkout-amount-display');
    if (el) el.innerText = `¥${totalAmt.toFixed(2)}`;

    const savedTip = document.getElementById('checkout-saved-tip');
    if (savedTip) {
      if (savedAmt > 0) {
        savedTip.innerText = `已享网上策略/抱团集采立省 ¥${savedAmt.toFixed(2)}`;
        savedTip.classList.remove('hidden');
      } else {
        savedTip.classList.add('hidden');
      }
    }

    try {
      const saved = JSON.parse(localStorage.getItem(LAST_CUST_KEY) || 'null');
      if (saved) {
        if (!document.getElementById('order-cust-name').value) document.getElementById('order-cust-name').value = saved.name || '';
        if (!document.getElementById('order-cust-phone').value) document.getElementById('order-cust-phone').value = saved.phone || '';
        if (!document.getElementById('order-cust-addr').value) document.getElementById('order-cust-addr').value = saved.addr || '';
      }
    } catch (e) {}

    if (mallState.pickupStores.length === 0) {
      mallState.pickupStores = await MallService.fetchPickupStores(mallState.currentTenantParam);
    }
    if (mallState.refStoreParam) {
      const refObj = mallState.pickupStores.find((s) => String(s.id) === String(mallState.refStoreParam)) || mallState.referrerStoreObj;
      if (refObj) {
        mallState.selectedPickupStoreId = String(refObj.id);
        const input = document.getElementById('order-pickup-input');
        if (input) input.value = `${refObj.name}${refObj.address ? ` (${refObj.address})` : ''}`;
      }
    }

    const curMode = document.getElementById('order-delivery-mode')?.value || 'pickup';
    window.onDeliveryModeChange(curMode);
    window.onSearchPickupStore('');
    window.openModal('modal-checkout');
  };

  window.submitConsumerOrder = async function () {
    const name = document.getElementById('order-cust-name').value.trim();
    const phone = document.getElementById('order-cust-phone').value.trim();
    const deliveryMode = document.getElementById('order-delivery-mode')?.value || 'pickup';
    const addr = document.getElementById('order-cust-addr').value.trim();
    const pickupCustomText = document.getElementById('order-pickup-input')?.value.trim() || '';
    const note = document.getElementById('order-cust-note').value.trim();

    if (!name || !phone || phone.length < 11) return alert('请填全收件人姓名与 11 位手机号！');
    if (deliveryMode === 'express' && !addr) return alert('请填写快递配送详细地址！');
    if (deliveryMode === 'pickup' && !pickupCustomText) return alert('请选择或填写自提合作门店名称！');
    if (mallState.cart.length === 0) return alert('购物篮尚无好物！');

    const finalAddressText = deliveryMode === 'pickup' ? `【门店自提】${pickupCustomText}` : addr;
    const groupedByTenant = {};
    mallState.cart.forEach((item) => {
      const tid = mallState.currentTenantParam || item.prod.tenant_id || 'PLATFORM';
      if (!groupedByTenant[tid]) groupedByTenant[tid] = [];
      groupedByTenant[tid].push(item);
    });

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderPayloads = [];
    const createdOrderNos = [];
    let grandTotal = 0;

    Object.entries(groupedByTenant).forEach(([tenantId, tenantItems]) => {
      const subTotal = tenantItems.reduce((sum, item) => sum + getEffectiveUnitPrice(item.prod, item.qty) * item.qty, 0);
      grandTotal += subTotal;

      const orderNo = `ON-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      createdOrderNos.push(orderNo);

      const itemsPayload = tenantItems.map((item) => ({
        id: item.prod.id,
        name: item.prod.name,
        price: getEffectiveUnitPrice(item.prod, item.qty),
        qty: item.qty,
        measure_unit: item.prod.measure_unit || '件'
      }));

      const effectiveRefStoreId = deliveryMode === 'pickup' && mallState.selectedPickupStoreId ? mallState.selectedPickupStoreId : mallState.refStoreParam;

      orderPayloads.push({
        order_no: orderNo,
        tenant_id: tenantId,
        store_id: deliveryMode === 'pickup' && mallState.selectedPickupStoreId ? parseInt(mallState.selectedPickupStoreId) : null,
        order_source: 'online_mall',
        settlement_type: 'online_paid',
        items: itemsPayload,
        items_return: [],
        items_exchange: [],
        total_amount: subTotal,
        return_amount: 0,
        net_settle_amount: subTotal,
        order_status: 'confirmed',
        delivery_status: 'ordered',
        note: `[天街订单] 收件人: ${name} (${phone}) 地址: ${finalAddressText} ${note ? `叮咛: ${note}` : ''} ${effectiveRefStoreId ? `[专属门店ID: ${effectiveRefStoreId}]` : ''}`,
        driver_action_instruction:
          deliveryMode === 'pickup'
            ? `【天街门店自提单】随车捎带至 ${pickupCustomText}，客户 ${name} (${phone}) 到店自提（服务润利归属该门店）`
            : `【天街产区直发单】由仓管打单发快递。收件人: ${name} ${phone}`
      });
    });

    const { error } = await MallService.submitOnlineOrder(orderPayloads, mallState.cart);

    if (error) {
      alert('下单失败: ' + error.message);
    } else {
      localStorage.setItem(LAST_CUST_KEY, JSON.stringify({ name, phone, addr }));
      alert(
        `🎉 订购提交成功！\n\n` +
          `• 单据编号: ${createdOrderNos.join('、')}\n` +
          `• 实付总额: ¥${grandTotal.toFixed(2)}\n` +
          `• 履约方式: ${deliveryMode === 'pickup' ? `送至 ${pickupCustomText} 自提` : '产区直发快递包邮'}`
      );
      window.clearCart();
      window.closeModal('modal-checkout');
    }
  };

  window.openMyOrdersModal = function () {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_CUST_KEY) || 'null');
      if (saved && saved.phone) document.getElementById('query-order-phone').value = saved.phone;
    } catch (e) {}
    window.openModal('modal-my-orders');
    if (document.getElementById('query-order-phone').value.trim().length >= 11) {
      window.searchConsumerOrders();
    }
  };

  window.searchConsumerOrders = async function () {
    const phone = document.getElementById('query-order-phone').value.trim();
    const listEl = document.getElementById('my-orders-result-list');
    if (!phone || phone.length < 7) return alert('请输入下单或发榜时预留的手机号！');

    listEl.innerHTML = '<div class="py-8 text-center text-stone-400">正在检索您的天街订单与求购需求...</div>';

    if (mallState.pickupStores.length === 0) {
      try {
        mallState.pickupStores = await MallService.fetchPickupStores(mallState.currentTenantParam);
      } catch (e) {}
    }

    const { orders, demands } = await MallService.queryOrdersByPhone(phone);

    if (orders.length === 0 && demands.length === 0) {
      listEl.innerHTML = '<div class="py-8 text-center text-stone-400">未查询到该手机号关联的订单或求购需求。</div>';
      return;
    }

    let html = '';
    if (demands.length > 0) {
      html += `<div class="text-[11px] font-bold text-amber-900 pt-1">📢 我发布的求购/集采需求 (${demands.length})：</div>`;
      html += demands
        .map((d) => {
          const info = parseDemandPayload(d.content);
          const safeRaw = encodeURIComponent(d.content);
          return `
            <div class="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
              <div class="flex justify-between items-center gap-2">
                <b class="text-stone-900">${info.title} (${info.qty})</b>
                <span class="text-[10px] bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full font-bold shrink-0">🔥 ${info.coBuyers || 1} 人凑单</span>
              </div>
              ${
                d.official_reply
                  ? `<div class="text-[11px] text-emerald-900 bg-white p-2 rounded-xl border border-emerald-200 space-y-1.5">
                      <div><b>🌾 源头报价回复：</b>${d.official_reply}</div>
                      ${
                        info.acceptedByBuyer
                          ? `<div class="text-[10px] font-bold text-emerald-700">✓ 您已认可报价，专柜执事正在对接履约</div>`
                          : `<button onclick="window.acceptC2BQuote(${d.id}, decodeURIComponent('${safeRaw}'))" class="bg-[#1b4332] text-white text-[10px] font-bold px-2.5 py-1 rounded-lg active:scale-95">
                              🤝 认可此报价 · 锁定合作意向
                            </button>`
                      }
                    </div>`
                  : `<div class="flex justify-between items-center text-[10px] text-stone-500">
                      <span>⏳ 正在等待对应行当合作社与工坊阳光报价...</span>
                      <button onclick="window.cancelMyC2BDemand(${d.id})" class="text-rose-600 hover:underline font-bold">撤销需求</button>
                    </div>`
              }
            </div>
          `;
        })
        .join('');
    }

    if (orders.length > 0) {
      html += `<div class="text-[11px] font-bold text-emerald-950 pt-2">📦 我的天街订购单据 (${orders.length})：</div>`;
      html += orders
        .map((o) => {
          const items = Array.isArray(o.items) ? o.items : [];
          const itemsText = items.map((it) => `${it.name} x${it.qty}${it.measure_unit || '件'}`).join('、');
          const isDelivered = o.delivery_status === 'delivered';
          const isPickedUp = String(o.note || '').includes('[街坊已凭码自提核销]');
          const isStorePickup = !!o.store_id || String(o.note || '').includes('【门店自提】');
          const pinCode = computePickupPin(o);
          const encodedItems = encodeURIComponent(JSON.stringify(items));
          const safeItemsSummary = itemsText.replace(/'/g, '');

          // 关联自提门店详细指引（店名、地址与一键拨号）
          const storeObj = o.store_id
            ? mallState.pickupStores.find((s) => String(s.id) === String(o.store_id))
            : null;
          const storePhone = storeObj?.phone || storeObj?.contact_phone || '';
          const storeGuideBanner = isStorePickup
            ? `<div class="bg-emerald-50/90 border border-emerald-200 px-2.5 py-1.5 rounded-xl text-[10px] text-emerald-950 flex justify-between items-center gap-2">
                 <div class="min-w-0">
                   <b class="block truncate">🏪 自提驿站：${storeObj?.name || '合作自提门店'}</b>
                   ${storeObj?.address ? `<span class="text-stone-500 block truncate">📍 ${storeObj.address}</span>` : ''}
                 </div>
                 ${
                   storePhone
                     ? `<a href="tel:${storePhone}" class="shrink-0 bg-emerald-800 text-white font-bold px-2 py-1 rounded-lg">📞 联系门店</a>`
                     : ''
                 }
               </div>`
            : '';

          const pickupPinBanner = isStorePickup
            ? isPickedUp
              ? `<div class="text-[10px] bg-stone-200 text-stone-700 px-2.5 py-1 rounded-xl font-bold text-center">✅ 已凭核销码到店自提取货</div>`
              : `<div class="bg-amber-50 border border-amber-300 px-2.5 py-1.5 rounded-xl flex justify-between items-center">
                   <span class="text-[10px] text-amber-950 font-bold">🔑 到店自提核销码（报给门店掌柜）：</span>
                   <b class="font-mono text-base font-bold text-[#1b4332] tracking-widest">${pinCode}</b>
                 </div>`
            : '';

          return `
            <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
              <div class="flex justify-between items-center">
                <b class="font-mono text-stone-900">#${o.order_no || o.id}</b>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isPickedUp
                    ? 'bg-stone-200 text-stone-700'
                    : isDelivered
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900'
                }">
                  ${isPickedUp ? '✅ 已自提核销' : isDelivered ? '✅ 已送达门店待自提' : '📦 产区备货出库中'}
                </span>
              </div>
              <div class="text-stone-700">${itemsText || '标准良品组合'}</div>
              ${storeGuideBanner}
              ${pickupPinBanner}
              <div class="text-[10px] text-stone-500">${o.note || ''}</div>
              <div class="flex justify-between items-center text-[10px] text-stone-400 font-mono pt-1.5 border-t border-stone-200/60">
                <span>实付 <b class="text-emerald-900">¥${parseFloat(o.total_amount || 0).toFixed(2)}</b></span>
                <div class="flex items-center gap-1.5 font-sans">
                  <button onclick="window.openReviewModal('${o.order_no || o.id}', '${o.tenant_id || ''}', '${safeItemsSummary}')" class="bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold px-2 py-1 rounded-lg">
                    ✍️ 验真晒单
                  </button>
                  <button onclick="window.reorderPastOrder('${encodedItems}')" class="bg-[#1b4332] text-white font-bold px-2.5 py-1 rounded-lg">
                    🔁 再来一单
                  </button>
                </div>
              </div>
            </div>
          `;
        })
        .join('');
    }

    listEl.innerHTML = html;
  };
}
