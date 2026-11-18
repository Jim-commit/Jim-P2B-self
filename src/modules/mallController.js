import { MallService } from '../services/mallService.js';

const urlParams = new URLSearchParams(window.location.search);
const rawTenantParam = urlParams.get('t') || urlParams.get('tenant');
let currentTenantParam = rawTenantParam ? rawTenantParam.trim().toUpperCase() : null;
const refStoreParam = urlParams.get('ref');

const CART_STORAGE_KEY = 'baigong_mall_cart_v1';
const LAST_CUST_KEY = 'baigong_mall_last_cust_v1';

let allProducts = [];
let allTenants = [];
let allCategories = [];
let currentCategoryFilter = 'all';
let currentBrandFilter = 'all';
let currentKeywordFilter = '';
let cart = [];

// =========================================================================
// 基础弹窗与页面导航
// =========================================================================
window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

window.exitToTianJie = function () {
  window.location.href = 'mall.html';
};

window.promptEnterBrandStore = function () {
  const code = prompt('请输入厂商的商号代号（如 NY-FUNIU）：');
  if (!code || !code.trim()) return;
  const clean = code.trim().toUpperCase();
  const found = allTenants.find((t) => (t.tenant_id || '').toUpperCase() === clean);
  if (!found) {
    return alert(`未找到商号代号为【${clean}】的在册专柜！`);
  }
  window.location.href = `mall.html?t=${found.tenant_id}`;
};

window.goToBrandStore = function (tenantId) {
  window.location.href = `mall.html?t=${tenantId}`;
};

window.openCartModal = function () {
  renderCartDrawer();
  window.openModal('modal-cart');
};

window.openCheckoutModal = function () {
  if (cart.length === 0) return alert('购物篮尚无好物，请先挑选良品！');
  const total = cart.reduce((sum, item) => sum + parseFloat(item.prod.tier_1_price || 0) * item.qty, 0);
  const el = document.getElementById('checkout-amount-display');
  if (el) el.innerText = `¥${total.toFixed(2)}`;

  // 自动回填上次收件信息
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_CUST_KEY) || 'null');
    if (saved) {
      if (!document.getElementById('order-cust-name').value) document.getElementById('order-cust-name').value = saved.name || '';
      if (!document.getElementById('order-cust-phone').value) document.getElementById('order-cust-phone').value = saved.phone || '';
      if (!document.getElementById('order-cust-addr').value) document.getElementById('order-cust-addr').value = saved.addr || '';
    }
  } catch (e) {}

  window.openModal('modal-checkout');
};

// =========================================================================
// 1. 双形态门面初始化（生态公域天街 vs 厂商私域专柜）
// =========================================================================
function setupTianJieMode() {
  document.getElementById('mall-header-title').innerText = '百工天街 · 正品大集市';
  document.getElementById('mall-mode-badge').innerText = '生态公域';
  document.getElementById('mall-header-sub').innerText = '物勒工名 · 源头直发 · 诚信共生';
  document.getElementById('btn-back-street')?.classList.add('hidden');
  document.getElementById('btn-find-brand')?.classList.remove('hidden');
  document.getElementById('brand-hero-section')?.classList.add('hidden');
  document.getElementById('tianjie-brand-bar')?.classList.remove('hidden');
}

function setupBrandStoreMode(tenantId) {
  const tenant = allTenants.find((t) => (t.tenant_id || '').toUpperCase() === (tenantId || '').toUpperCase());
  const name = tenant ? tenant.company_name : tenantId;
  document.getElementById('mall-header-title').innerText = `${name} · 品牌数字专柜`;
  document.getElementById('mall-mode-badge').innerText = '私域专卖';
  document.getElementById('mall-header-sub').innerText = '匠心直供 · 一件代发包邮';
  document.getElementById('btn-back-street')?.classList.remove('hidden');
  document.getElementById('btn-find-brand')?.classList.add('hidden');
  document.getElementById('tianjie-brand-bar')?.classList.add('hidden');

  document.getElementById('hero-brand-name').innerText = name;
  document.getElementById('hero-brand-desc').innerText = tenant?.brand_origin_desc || '源头工坊 · 匠心正品';
  document.getElementById('hero-tenant-id').innerText = tenant ? tenant.tenant_id : tenantId;
  document.getElementById('brand-hero-section')?.classList.remove('hidden');
}

function renderBrandSelectorBar() {
  const bar = document.getElementById('dynamic-brand-chips');
  if (!bar) return;
  bar.innerHTML = allTenants
    .map(
      (t) => `
      <button onclick="window.filterMallBrand('${t.tenant_id}')" class="mall-brand-chip bg-white border border-stone-200 text-stone-700 hover:border-emerald-700 px-3 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition">
        🏭 ${t.company_name}
      </button>
    `
    )
    .join('');
}

window.filterMallBrand = function (tenantId) {
  currentBrandFilter = tenantId;
  document.querySelectorAll('.mall-brand-chip').forEach((b) => {
    const isAll = tenantId === 'all' && b.dataset.brand === 'all';
    const isMatch = isAll || b.getAttribute('onclick')?.includes(`'${tenantId}'`);
    b.className = isMatch
      ? 'mall-brand-chip bg-[#1b4332] text-white border border-[#1b4332] px-3 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition'
      : 'mall-brand-chip bg-white border border-stone-200 text-stone-700 hover:border-emerald-700 px-3 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition';
  });
  renderGoodsGrid();
};

function renderCategoryChips() {
  const l1Cats = allCategories.filter((c) => c.level === 1);
  const container = document.getElementById('dynamic-cat-chips');
  if (!container) return;
  container.innerHTML = l1Cats
    .map(
      (c) => `
      <button onclick="window.filterMallCategory('${c.name}')" class="mall-cat-chip bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-xl transition">
        ${c.name}
      </button>
    `
    )
    .join('');
}

window.filterMallCategory = function (catName) {
  currentCategoryFilter = catName;
  document.querySelectorAll('.mall-cat-chip').forEach((b) => {
    const isMatch = (catName === 'all' && b.innerText.includes('全部精选')) || b.innerText.includes(catName);
    b.className = isMatch
      ? 'mall-cat-chip bg-amber-400 text-stone-950 px-3 py-1 rounded-xl font-bold transition'
      : 'mall-cat-chip bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-xl transition';
  });
  renderGoodsGrid();
};

window.onSearchMallKeyword = function (val) {
  currentKeywordFilter = (val || '').trim().toLowerCase();
  renderGoodsGrid();
};

// =========================================================================
// 2. 商品货架渲染与商品详情预览
// =========================================================================
function renderGoodsGrid() {
  const container = document.getElementById('mall-goods-grid');
  if (!container) return;

  let filtered = allProducts;

  if (currentCategoryFilter !== 'all') {
    filtered = filtered.filter((p) => p.category_main === currentCategoryFilter);
  }
  if (!currentTenantParam && currentBrandFilter !== 'all') {
    filtered = filtered.filter((p) => p.tenant_id === currentBrandFilter);
  }
  if (currentKeywordFilter) {
    filtered = filtered.filter((p) => {
      const tenant = allTenants.find((t) => t.tenant_id === p.tenant_id);
      const tName = tenant ? tenant.company_name : p.tenant_id;
      return (
        (p.name || '').toLowerCase().includes(currentKeywordFilter) ||
        (p.spec || '').toLowerCase().includes(currentKeywordFilter) ||
        (p.origin_place || '').toLowerCase().includes(currentKeywordFilter) ||
        (tName || '').toLowerCase().includes(currentKeywordFilter)
      );
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="col-span-full py-16 text-center text-stone-400 text-xs">当前行当尚无上架良品。</div>';
    return;
  }

  container.innerHTML = filtered
    .map((p) => {
      const tenant = allTenants.find((t) => t.tenant_id === p.tenant_id);
      const tenantName = tenant ? tenant.company_name : p.tenant_id;
      const tags = Array.isArray(p.tags) ? p.tags : [];
      const isSingleShop = !!currentTenantParam;

      return `
        <div class="bg-white rounded-3xl p-3 border border-stone-200/80 shadow-sm flex flex-col justify-between space-y-2 hover:shadow-md transition">
          <div class="space-y-1.5">
            <!-- 商品图片（点击可看完整详情） -->
            <div onclick="window.openProductDetail(${p.id})" class="relative w-full h-32 rounded-2xl bg-stone-100 overflow-hidden flex items-center justify-center cursor-pointer">
              ${p.image_url ? `<img src="${p.image_url}" class="w-full h-full object-cover">` : `<span class="text-stone-300 text-xs">正品封装</span>`}
              <span class="absolute top-1.5 left-1.5 bg-[#1b4332]/80 backdrop-blur-sm text-white text-[9px] px-2 py-0.5 rounded-full font-mono">
                ${p.measure_unit || '件'}装
              </span>
              <button type="button" onclick="event.stopPropagation(); window.viewProductTrace(${p.id})" class="absolute bottom-1.5 right-1.5 bg-white/90 backdrop-blur-sm text-emerald-900 border border-emerald-200 text-[9px] font-bold px-2 py-0.5 rounded-lg active:scale-95 shadow-xs">
                📜 验真
              </button>
            </div>

            <!-- 标题、出品工坊与标签 -->
            <div onclick="window.openProductDetail(${p.id})" class="cursor-pointer">
              <b class="text-xs text-stone-900 font-bold block line-clamp-1">${p.name}</b>
              <span class="text-[10px] text-stone-400 font-mono block">${p.spec || '标配'} · ${p.category_main || '常规'}</span>
              ${!isSingleShop ? `<span class="text-[9px] text-emerald-800/80 block truncate mt-0.5">🏭 ${tenantName}</span>` : ''}
              ${
                tags.length
                  ? `<div class="flex flex-wrap gap-1 mt-1">
                      ${tags.slice(0, 2).map((t) => `<span class="bg-amber-50 text-amber-900 border border-amber-200 text-[9px] px-1.5 rounded">${t}</span>`).join('')}
                    </div>`
                  : ''
              }
            </div>
          </div>

          <!-- 底栏价格与加购 -->
          <div class="pt-2 border-t border-stone-100 flex justify-between items-center">
            <div>
              <span class="text-[9px] text-stone-400 block font-mono">零售正价</span>
              <b class="font-mono text-sm text-emerald-900 font-bold">¥${p.tier_1_price}</b>
            </div>

            <div class="flex items-center gap-1">
              ${
                !isSingleShop
                  ? `<button onclick="window.goToBrandStore('${p.tenant_id}')" class="text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold px-2 py-1.5 rounded-xl transition" title="进该厂专柜">
                      专柜
                    </button>`
                  : ''
              }
              <button onclick="window.addToCart(${p.id})" class="bg-[#1b4332] hover:bg-[#143628] text-white font-bold text-xs w-7 h-7 rounded-xl flex items-center justify-center active:scale-95 shadow transition">
                +
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

window.openProductDetail = function (prodId) {
  const p = allProducts.find((x) => x.id === prodId);
  if (!p) return;

  const tenant = allTenants.find((t) => t.tenant_id === p.tenant_id);
  const tenantName = tenant ? tenant.company_name : p.tenant_id;

  document.getElementById('detail-prod-img').innerHTML = p.image_url
    ? `<img src="${p.image_url}" class="w-full h-full object-cover">`
    : '<span class="text-stone-400 text-xs">源头正品封装</span>';
  document.getElementById('detail-prod-name').innerText = p.name;
  document.getElementById('detail-prod-price').innerText = `¥${p.tier_1_price}`;
  document.getElementById('detail-prod-spec').innerText = `${p.spec || '整装'} · ${p.measure_unit || '件'}装`;
  document.getElementById('detail-prod-tenant').innerText = tenantName;
  document.getElementById('detail-prod-origin').innerText = p.origin_place || '源头工坊原产';
  document.getElementById('detail-prod-desc').innerText = p.description || p.handover_note || '工坊直发，严选正品，支持溯源验真。';

  // 渲染百业自定义扩展属性
  const attrsBox = document.getElementById('detail-custom-attrs');
  const customAttrs = p.custom_attributes && typeof p.custom_attributes === 'object' ? p.custom_attributes : {};
  const entries = Object.entries(customAttrs);
  if (entries.length > 0) {
    attrsBox.innerHTML = entries
      .map(
        ([k, v]) => `
        <div class="flex justify-between py-1 border-b border-stone-100 last:border-0">
          <span class="text-stone-400">${k}：</span>
          <b class="text-stone-800">${v}</b>
        </div>
      `
      )
      .join('');
    attrsBox.classList.remove('hidden');
  } else {
    attrsBox.classList.add('hidden');
  }

  document.getElementById('btn-detail-add-cart').onclick = () => {
    window.addToCart(p.id);
    window.closeModal('modal-product-detail');
  };

  window.openModal('modal-product-detail');
};

// =========================================================================
// 3. 购物车与一件代发订购逻辑
// =========================================================================
function persistCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (e) {}
}

function restoreCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) cart = saved;
  } catch (e) {
    cart = [];
  }
}

window.addToCart = function (prodId) {
  const p = allProducts.find((x) => x.id === prodId);
  if (!p) return;

  const item = cart.find((x) => x.prod.id === prodId);
  if (item) item.qty += 1;
  else cart.push({ prod: p, qty: 1 });

  persistCart();
  updateCartBadge();
};

function updateCartBadge() {
  const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
  const totalAmt = cart.reduce((sum, item) => sum + parseFloat(item.prod.tier_1_price || 0) * item.qty, 0);

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

function renderCartDrawer() {
  const list = document.getElementById('cart-items-list');
  if (!list) return;
  if (cart.length === 0) {
    list.innerHTML = '<div class="py-8 text-center text-stone-400 text-xs">购物篮尚无品项。</div>';
    return;
  }

  list.innerHTML = cart
    .map(
      (item) => `
      <div class="py-2 flex justify-between items-center text-xs">
        <div>
          <b class="text-stone-900 block">${item.prod.name}</b>
          <span class="font-mono text-[10px] text-stone-400">单价: ¥${item.prod.tier_1_price} · 小计: ¥${(parseFloat(item.prod.tier_1_price || 0) * item.qty).toFixed(2)}</span>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="window.changeCartQty(${item.prod.id}, -1)" class="w-6 h-6 bg-stone-100 rounded-lg font-bold font-mono">-</button>
          <span class="font-bold font-mono">${item.qty}</span>
          <button onclick="window.changeCartQty(${item.prod.id}, 1)" class="w-6 h-6 bg-stone-100 rounded-lg font-bold font-mono">+</button>
        </div>
      </div>
    `
    )
    .join('');
}

window.changeCartQty = function (prodId, delta) {
  const item = cart.find((x) => x.prod.id === prodId);
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter((x) => x.prod.id !== prodId);
  }
  persistCart();
  updateCartBadge();
  renderCartDrawer();
};

window.clearCart = function () {
  cart = [];
  persistCart();
  updateCartBadge();
  renderCartDrawer();
};

window.submitConsumerOrder = async function () {
  const name = document.getElementById('order-cust-name').value.trim();
  const phone = document.getElementById('order-cust-phone').value.trim();
  const addr = document.getElementById('order-cust-addr').value.trim();
  const note = document.getElementById('order-cust-note').value.trim();

  if (!name || !phone || phone.length < 11 || !addr) {
    return alert('请填全收件人姓名、11位手机号与配送详细地址！');
  }

  if (cart.length === 0) {
    return alert('购物篮尚无好物！');
  }

  const groupedByTenant = {};
  cart.forEach((item) => {
    const tid = currentTenantParam || item.prod.tenant_id || 'PLATFORM';
    if (!groupedByTenant[tid]) groupedByTenant[tid] = [];
    groupedByTenant[tid].push(item);
  });

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const orderPayloads = [];
  const createdOrderNos = [];
  let grandTotal = 0;

  Object.entries(groupedByTenant).forEach(([tenantId, tenantItems]) => {
    const subTotal = tenantItems.reduce((sum, item) => sum + parseFloat(item.prod.tier_1_price || 0) * item.qty, 0);
    grandTotal += subTotal;

    const orderNo = `ON-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
    createdOrderNos.push(orderNo);

    const itemsPayload = tenantItems.map((item) => ({
      id: item.prod.id,
      name: item.prod.name,
      price: item.prod.tier_1_price,
      qty: item.qty,
      measure_unit: item.prod.measure_unit || '件'
    }));

    orderPayloads.push({
      order_no: orderNo,
      tenant_id: tenantId,
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
      note: `[线上代发] 收件人: ${name} (${phone}) 地址: ${addr} ${note ? `叮咛: ${note}` : ''} ${refStoreParam ? `[推客门店ID: ${refStoreParam}]` : ''}`,
      driver_action_instruction: `【网销一件代发】由库管打单发快递。收件人: ${name} ${phone}`
    });
  });

  const { error } = await MallService.submitOnlineOrder(orderPayloads, cart);

  if (error) {
    alert('下单失败: ' + error.message);
  } else {
    localStorage.setItem(LAST_CUST_KEY, JSON.stringify({ name, phone, addr }));
    alert(
      `🎉 订单提交成功！\n\n` +
        `• 单据标识: ${createdOrderNos.join('、')}\n` +
        `• 总额: ¥${grandTotal.toFixed(2)}\n` +
        `• 配送: 厂家库管已接单打包，将由顺丰/京东快递发出！`
    );
    window.clearCart();
    window.closeModal('modal-checkout');
  }
};

// =========================================================================
// 4. 消费者订单与快递进度查询（找回缺失查询入口）
// =========================================================================
window.openMyOrdersModal = function () {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_CUST_KEY) || 'null');
    if (saved && saved.phone) {
      document.getElementById('query-order-phone').value = saved.phone;
    }
  } catch (e) {}
  window.openModal('modal-my-orders');
  if (document.getElementById('query-order-phone').value.trim().length >= 11) {
    window.searchConsumerOrders();
  }
};

window.searchConsumerOrders = async function () {
  const phone = document.getElementById('query-order-phone').value.trim();
  const listEl = document.getElementById('my-orders-result-list');
  if (!phone || phone.length < 7) {
    return alert('请输入下单时预留的收件人手机号！');
  }

  listEl.innerHTML = '<div class="py-8 text-center text-stone-400">正在查询云端单据...</div>';
  const orders = await MallService.queryOrdersByPhone(phone);

  if (orders.length === 0) {
    listEl.innerHTML = '<div class="py-8 text-center text-stone-400">未查询到该手机号关联的网销订单。</div>';
    return;
  }

  listEl.innerHTML = orders
    .map((o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      const itemsText = items.map((it) => `${it.name} x${it.qty}${it.measure_unit || '件'}`).join('、');
      const isDelivered = o.delivery_status === 'delivered';
      return `
        <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
          <div class="flex justify-between items-center">
            <b class="font-mono text-stone-900">#${o.order_no || o.id}</b>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isDelivered ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
            }">
              ${isDelivered ? '✅ 已发货/签收' : '📦 厂家打包出库中'}
            </span>
          </div>
          <div class="text-stone-700">${itemsText || '标准商品组合'}</div>
          <div class="flex justify-between text-[10px] text-stone-400 font-mono pt-1 border-t border-stone-200/60">
            <span>${new Date(o.created_at).toLocaleString()}</span>
            <b class="text-emerald-900">实付 ¥${parseFloat(o.total_amount || 0).toFixed(2)}</b>
          </div>
        </div>
      `;
    })
    .join('');
};

// =========================================================================
// 5. 物勒工名 · 正品溯源验真弹窗
// =========================================================================
window.viewProductTrace = function (prodId) {
  const p = allProducts.find((x) => x.id === prodId);
  if (!p) return;

  const tenant = allTenants.find((t) => t.tenant_id === p.tenant_id);
  document.getElementById('trace-prod-name').innerText = p.name;
  document.getElementById('trace-code').innerText = `${p.trace_code_prefix || 'SHUNDA-QC-'}${p.id}`;
  document.getElementById('trace-tenant-name').innerText = tenant ? tenant.company_name : p.tenant_id;
  document.getElementById('trace-origin').innerText = p.origin_place || '源头工坊原产';
  document.getElementById('trace-category').innerText = `${p.category_main} ➔ ${p.category_sub || '常规'}`;
  document.getElementById('trace-spec').innerText = `${p.spec || '整装'} / ${p.measure_unit || '件'}`;

  window.openModal('modal-trace');
};

// =========================================================================
// 6. 社交分润与推客二维码
// =========================================================================
window.openShareModal = function () {
  const currentUrl = new URL(window.location.href);
  if (currentTenantParam) currentUrl.searchParams.set('t', currentTenantParam);
  if (refStoreParam) currentUrl.searchParams.set('ref', refStoreParam);

  const shareLink = currentUrl.toString();
  document.getElementById('share-link-text').innerText = shareLink;
  document.getElementById('share-qr-code').src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareLink)}`;
  window.openModal('modal-share');
};

window.copyShareLink = function () {
  const link = document.getElementById('share-link-text').innerText;
  navigator.clipboard.writeText(link).then(() => alert('专属分润推客链接已复制到剪贴簿！'));
};

// =========================================================================
// 启动入口
// =========================================================================
export async function initMallController() {
  restoreCart();
  updateCartBadge();

  const [tenants, cats] = await Promise.all([
    MallService.fetchActiveTenants(),
    MallService.fetchActiveCategories()
  ]);
  allTenants = tenants;
  allCategories = cats;
  renderCategoryChips();
  renderBrandSelectorBar();

  if (currentTenantParam) {
    const matchedTenant = allTenants.find((t) => (t.tenant_id || '').toUpperCase() === currentTenantParam);
    if (matchedTenant) {
      currentTenantParam = matchedTenant.tenant_id;
    }
    setupBrandStoreMode(currentTenantParam);
  } else {
    setupTianJieMode();
  }

  if (refStoreParam) {
    const refStore = await MallService.fetchReferrerStore(refStoreParam);
    if (refStore) {
      document.getElementById('ref-store-name').innerText = refStore.name;
      document.getElementById('referrer-banner')?.classList.remove('hidden');
    }
  }

  allProducts = await MallService.fetchMallProducts(currentTenantParam);
  renderGoodsGrid();
}
