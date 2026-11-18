import { MallService } from '../services/mallService.js';

const urlParams = new URLSearchParams(window.location.search);
const rawTenantParam = urlParams.get('t');
let currentTenantParam = rawTenantParam ? rawTenantParam.trim().toUpperCase() : null;
const refStoreParam = urlParams.get('ref');

const CART_STORAGE_KEY = 'baigong_mall_cart_v1';

let allProducts = [];
let allTenants = [];
let allCategories = [];
let currentCategoryFilter = 'all';
let currentKeywordFilter = '';
let cart = []; // [{ prod, qty }]

// =========================================================================
// 基礎彈窗與頁面導航綁定
// =========================================================================
window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

window.exitToTianJie = function () {
  window.location.href = 'mall.html';
};

window.promptEnterBrandStore = function () {
  const code = prompt('請輸入廠商的商號代號（如 NY-FUNIU）：');
  if (!code || !code.trim()) return;
  const clean = code.trim().toUpperCase();
  const found = allTenants.find((t) => (t.tenant_id || '').toUpperCase() === clean);
  if (!found) {
    return alert(`未找到商號代號為【${clean}】的在冊專櫃！`);
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
  if (cart.length === 0) return alert('購物籃尚無好物，請先挑選良品！');
  const total = cart.reduce((sum, item) => sum + parseFloat(item.prod.tier_1_price || 0) * item.qty, 0);
  const el = document.getElementById('checkout-amount-display');
  if (el) el.innerText = `¥${total.toFixed(2)}`;
  window.openModal('modal-checkout');
};

// =========================================================================
// 雙形態門面渲染（態型 A：廠商私域專賣店 / 態型 B：百工天街大集市）
// =========================================================================
function setupTianJieMode() {
  document.getElementById('mall-header-title').innerText = '百工天街 · 正品大集市';
  document.getElementById('mall-mode-badge').innerText = '生態公域';
  document.getElementById('mall-header-sub').innerText = '物勒工名 · 源頭直發 · 誠信共生';
  document.getElementById('btn-back-street')?.classList.add('hidden');
  document.getElementById('btn-find-brand')?.classList.remove('hidden');
  document.getElementById('brand-hero-section')?.classList.add('hidden');
}

function setupBrandStoreMode(tenantId) {
  const tenant = allTenants.find((t) => (t.tenant_id || '').toUpperCase() === (tenantId || '').toUpperCase());
  const name = tenant ? tenant.company_name : tenantId;
  document.getElementById('mall-header-title').innerText = `${name} · 品牌數字專櫃`;
  document.getElementById('mall-mode-badge').innerText = '私域專賣';
  document.getElementById('mall-header-sub').innerText = '匠心直供 · 一件代發包郵';
  document.getElementById('btn-back-street')?.classList.remove('hidden');
  document.getElementById('btn-find-brand')?.classList.add('hidden');

  document.getElementById('hero-brand-name').innerText = name;
  document.getElementById('hero-brand-desc').innerText = tenant?.brand_origin_desc || '源頭工坊 · 匠心正品';
  document.getElementById('hero-tenant-id').innerText = tenant ? tenant.tenant_id : tenantId;
  document.getElementById('brand-hero-section')?.classList.remove('hidden');
}

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
    const isMatch = (catName === 'all' && b.innerText.includes('全部精選')) || b.innerText.includes(catName);
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

function renderGoodsGrid() {
  const container = document.getElementById('mall-goods-grid');
  if (!container) return;

  let filtered =
    currentCategoryFilter === 'all'
      ? allProducts
      : allProducts.filter((p) => p.category_main === currentCategoryFilter);

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
    container.innerHTML = '<div class="col-span-full py-16 text-center text-stone-400 text-xs">當前行當尚無上架良品。</div>';
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
            <!-- 商品圖片 -->
            <div class="relative w-full h-32 rounded-2xl bg-stone-100 overflow-hidden flex items-center justify-center">
              ${p.image_url ? `<img src="${p.image_url}" class="w-full h-full object-cover">` : `<span class="text-stone-300 text-xs">正品封裝</span>`}
              <span class="absolute top-1.5 left-1.5 bg-[#1b4332]/80 backdrop-blur-sm text-white text-[9px] px-2 py-0.5 rounded-full font-mono">
                ${p.measure_unit || '件'}裝
              </span>
              <button onclick="window.viewProductTrace(${p.id})" class="absolute bottom-1.5 right-1.5 bg-white/90 backdrop-blur-sm text-emerald-900 border border-emerald-200 text-[9px] font-bold px-2 py-0.5 rounded-lg active:scale-95 shadow-xs">
                📜 驗真
              </button>
            </div>

            <!-- 標題、出品工坊與標籤 -->
            <div>
              <b class="text-xs text-stone-900 font-bold block line-clamp-1">${p.name}</b>
              <span class="text-[10px] text-stone-400 font-mono block">${p.spec || '標配'} · ${p.category_main || '常規'}</span>
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

          <!-- 底欄價格與加購 -->
          <div class="pt-2 border-t border-stone-100 flex justify-between items-center">
            <div>
              <span class="text-[9px] text-stone-400 block font-mono">零售正價</span>
              <b class="font-mono text-sm text-emerald-900 font-bold">¥${p.tier_1_price}</b>
            </div>

            <div class="flex items-center gap-1">
              ${
                !isSingleShop
                  ? `<button onclick="window.goToBrandStore('${p.tenant_id}')" class="text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold px-2 py-1.5 rounded-xl transition" title="進該廠專櫃">
                      專櫃
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

// =========================================================================
// 購物車與一件代發訂購邏輯（支持跨專櫃本地持久與自動拆單）
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
    list.innerHTML = '<div class="py-8 text-center text-stone-400 text-xs">購物籃尚無品項。</div>';
    return;
  }

  list.innerHTML = cart
    .map(
      (item) => `
      <div class="py-2 flex justify-between items-center text-xs">
        <div>
          <b class="text-stone-900 block">${item.prod.name}</b>
          <span class="font-mono text-[10px] text-stone-400">單價: ¥${item.prod.tier_1_price} · 小計: ¥${(parseFloat(item.prod.tier_1_price || 0) * item.qty).toFixed(2)}</span>
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
    return alert('請填全收件人姓名、11位手機號與配送詳細地址！');
  }

  if (cart.length === 0) {
    return alert('購物籃尚無好物！');
  }

  // 按所屬商號分組拆單（單店專櫃下只有 1 組；天街公域多廠混合下單自動按廠家拆分，確保各廠獨立接單發貨）
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
      note: `[線上代發] 收件人: ${name} (${phone}) 地址: ${addr} ${note ? `叮嚀: ${note}` : ''} ${refStoreParam ? `[推客門店ID: ${refStoreParam}]` : ''}`,
      driver_action_instruction: `【網銷一件代發】由庫管打單發快遞。收件人: ${name} ${phone}`
    });
  });

  const { error } = await MallService.submitOnlineOrder(orderPayloads);

  if (error) {
    alert('下單失敗: ' + error.message);
  } else {
    alert(
      `🎉 訂單提交成功！\n\n` +
        `• 單據標識: ${createdOrderNos.join('、')}\n` +
        `• 總額: ¥${grandTotal.toFixed(2)}\n` +
        `• 配送: 廠家庫管已接單打包，將由順豐/京東快遞發出！`
    );
    window.clearCart();
    window.closeModal('modal-checkout');
  }
};

// =========================================================================
// 物勒工名 · 正品溯源驗真彈窗
// =========================================================================
window.viewProductTrace = function (prodId) {
  const p = allProducts.find((x) => x.id === prodId);
  if (!p) return;

  const tenant = allTenants.find((t) => t.tenant_id === p.tenant_id);
  document.getElementById('trace-prod-name').innerText = p.name;
  document.getElementById('trace-code').innerText = `${p.trace_code_prefix || 'SHUNDA-QC-'}${p.id}`;
  document.getElementById('trace-tenant-name').innerText = tenant ? tenant.company_name : p.tenant_id;
  document.getElementById('trace-origin').innerText = p.origin_place || '源頭工坊原產';
  document.getElementById('trace-category').innerText = `${p.category_main} ➔ ${p.category_sub || '常規'}`;
  document.getElementById('trace-spec').innerText = `${p.spec || '整裝'} / ${p.measure_unit || '件'}`;

  window.openModal('modal-trace');
};

// =========================================================================
// 社交分潤與推客二維碼
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
  navigator.clipboard.writeText(link).then(() => alert('專屬分潤推客連結已複製到剪貼簿！'));
};

// =========================================================================
// 啟動入口
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
