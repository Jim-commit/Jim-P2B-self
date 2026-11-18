import { MallService } from '../services/mallService.js';

const urlParams = new URLSearchParams(window.location.search);
const rawTenantParam = urlParams.get('t') || urlParams.get('tenant');
let currentTenantParam = rawTenantParam ? rawTenantParam.trim().toUpperCase() : null;
const refStoreParam = urlParams.get('ref');

const CART_STORAGE_KEY = 'baigong_mall_cart_v1';
const LAST_CUST_KEY = 'baigong_mall_last_cust_v1';
const JOINED_DEMANDS_KEY = 'baigong_c2b_joined_ids_v1';

let allProducts = [];
let allTenants = [];
let allCategories = [];
let allDemands = [];
let allReviews = [];
let pickupStores = [];
let currentMarketMode = 'b2c';
let currentCategoryFilter = 'all';
let currentKeywordFilter = '';
let counterSearchKeyword = '';
let counterTypeFilter = 'all';
let selectedPickupStoreId = '';
let referrerStoreObj = null;
let cart = [];

window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

window.exitToTianJie = function () {
  window.location.href = 'mall.html';
};

window.promptEnterBrandStore = function () {
  const code = prompt('请输入工坊名称关键词或商号代号（如 顺达 或 NY-FUNIU）：');
  if (!code || !code.trim()) return;
  const clean = code.trim().toUpperCase();
  const found = allTenants.find(
    (t) =>
      (t.tenant_id || '').toUpperCase() === clean ||
      (t.company_name || '').toUpperCase().includes(clean)
  );
  if (!found) {
    return alert(`未找到匹配【${code.trim()}】的在册专柜！`);
  }
  window.location.href = `mall.html?t=${found.tenant_id}${refStoreParam ? `&ref=${refStoreParam}` : ''}`;
};

window.goToBrandStore = function (tenantId) {
  window.location.href = `mall.html?t=${tenantId}${refStoreParam ? `&ref=${refStoreParam}` : ''}`;
};

window.openCartModal = function () {
  renderCartDrawer();
  window.openModal('modal-cart');
};

window.switchMarketMode = async function (mode) {
  currentMarketMode = mode;
  const isB2C = mode === 'b2c';
  const isCounters = mode === 'counters';
  const isC2B = mode === 'c2b';

  document.getElementById('pane-b2c-market')?.classList.toggle('hidden', !isB2C);
  document.getElementById('pane-counters-market')?.classList.toggle('hidden', !isCounters);
  document.getElementById('pane-c2b-market')?.classList.toggle('hidden', !isC2B);

  document.getElementById('b2c-cart-footer')?.classList.toggle('hidden', isC2B);
  document.getElementById('c2b-publish-footer')?.classList.toggle('hidden', !isC2B);

  const tabs = [
    { id: 'mode-tab-b2c', active: isB2C, activeCls: 'bg-[#1b4332] text-white' },
    { id: 'mode-tab-counters', active: isCounters, activeCls: 'bg-emerald-700 text-white' },
    { id: 'mode-tab-c2b', active: isC2B, activeCls: 'bg-amber-500 text-stone-950' }
  ];

  tabs.forEach((t) => {
    const el = document.getElementById(t.id);
    if (!el) return;
    el.className = t.active
      ? `flex-1 py-2 rounded-xl ${t.activeCls} font-bold shadow transition flex items-center justify-center gap-1`
      : 'flex-1 py-2 rounded-xl text-stone-200 hover:text-white font-bold transition flex items-center justify-center gap-1';
  });

  if (isCounters) {
    renderDigitalCountersGrid();
  } else if (isC2B) {
    await loadAndRenderC2BDemands();
  }
};

function getEffectiveUnitPrice(prod, qty) {
  const p1 = parseFloat(prod.tier_1_price || 0);
  const p2 = parseFloat(prod.tier_2_price || 0);
  const p3 = parseFloat(prod.tier_3_price || 0);

  if (qty >= 20 && p3 > 0 && p3 < p1) return p3;
  if (qty >= 5 && p2 > 0 && p2 < p1) return p2;
  return p1;
}

function getTierLabel(prod, qty) {
  const p1 = parseFloat(prod.tier_1_price || 0);
  const p2 = parseFloat(prod.tier_2_price || 0);
  const p3 = parseFloat(prod.tier_3_price || 0);

  if (qty >= 20 && p3 > 0 && p3 < p1) return '🔥 满20件集采团购价';
  if (qty >= 5 && p2 > 0 && p2 < p1) return '✨ 满5件阶梯优惠价';
  return '统一零售正价';
}

function getNextTierHint(prod, qty) {
  const p1 = parseFloat(prod.tier_1_price || 0);
  const p2 = parseFloat(prod.tier_2_price || 0);
  const p3 = parseFloat(prod.tier_3_price || 0);

  if (qty < 5 && p2 > 0 && p2 < p1) {
    return `再加 ${5 - qty} 件享 ¥${p2}/件`;
  }
  if (qty >= 5 && qty < 20 && p3 > 0 && p3 < (p2 || p1)) {
    return `再加 ${20 - qty} 件享 ¥${p3}/件`;
  }
  return '';
}

function setupTianJieMode() {
  document.getElementById('mall-header-title').innerText = '百工天街 · 云端直供集市';
  document.getElementById('mall-mode-badge').innerText = '天街公域';
  document.getElementById('mall-header-sub').innerText = '物勒工名 · 润利护店 · 源头直发';
  document.getElementById('btn-back-street')?.classList.add('hidden');
  document.getElementById('btn-find-brand')?.classList.remove('hidden');
  document.getElementById('brand-hero-section')?.classList.add('hidden');
  document.getElementById('mode-tab-counters')?.classList.remove('hidden');
  document.getElementById('tianjie-quick-counter-pill')?.classList.remove('hidden');
}

function setupBrandStoreMode(tenantId) {
  const tenant = allTenants.find((t) => (t.tenant_id || '').toUpperCase() === (tenantId || '').toUpperCase());
  const name = tenant ? tenant.company_name : tenantId;
  document.getElementById('mall-header-title').innerText = `${name} · 数字专柜`;
  document.getElementById('mall-mode-badge').innerText = '工坊专柜';
  document.getElementById('mall-header-sub').innerText = '源头直营 · 严守正价 · 支持定制';
  document.getElementById('btn-back-street')?.classList.remove('hidden');
  document.getElementById('btn-find-brand')?.classList.add('hidden');
  document.getElementById('mode-tab-counters')?.classList.add('hidden');
  document.getElementById('tianjie-quick-counter-pill')?.classList.add('hidden');

  document.getElementById('hero-brand-name').innerText = name;
  document.getElementById('hero-brand-desc').innerText = tenant?.brand_origin_desc || '源头工坊 · 匠心正品 · 支持大宗与定制接单';
  document.getElementById('hero-tenant-id').innerText = tenant ? tenant.tenant_id : tenantId;

  // 填充可折叠「产区与匠心工艺档案」
  document.getElementById('craft-type-text').innerText =
    tenant?.business_type === 'factory' ? '源头生产制造工坊' : '区域授权总代专柜';
  document.getElementById('craft-contact-text').innerText = tenant?.contact_person || '工坊当值执事';
  document.getElementById('craft-story-text').innerText =
    tenant?.brand_origin_desc ||
    '恪守“物勒工名、以考其诚”古训，全系直供货品实行全网统一零售正价，优先通过结缘实体门店惠及邻里。';

  document.getElementById('brand-hero-section')?.classList.remove('hidden');
}

window.toggleCraftArchive = function () {
  const panel = document.getElementById('brand-craft-archive-panel');
  const arrow = document.getElementById('craft-toggle-arrow');
  if (!panel) return;
  const isHidden = panel.classList.toggle('hidden');
  if (arrow) arrow.innerText = isHidden ? '▼' : '▲';
};

// =========================================================================
// 数字专柜大厅
// =========================================================================
window.onSearchCounterKeyword = function (val) {
  counterSearchKeyword = (val || '').trim().toLowerCase();
  renderDigitalCountersGrid();
};

window.filterCounterType = function (type) {
  counterTypeFilter = type;
  document.querySelectorAll('.counter-type-chip').forEach((btn) => {
    const active = btn.dataset.ctype === type;
    btn.className = active
      ? 'counter-type-chip bg-[#1b4332] text-white px-3 py-1 rounded-xl font-bold transition'
      : 'counter-type-chip bg-white border border-stone-200 text-stone-700 hover:border-emerald-700 px-3 py-1 rounded-xl font-bold transition';
  });
  renderDigitalCountersGrid();
};

function renderDigitalCountersGrid() {
  const grid = document.getElementById('digital-counters-grid');
  if (!grid) return;

  let list = allTenants;
  if (counterTypeFilter === 'factory') {
    list = list.filter((t) => t.business_type === 'factory');
  } else if (counterTypeFilter === 'agent') {
    list = list.filter((t) => t.business_type !== 'factory');
  }

  if (counterSearchKeyword) {
    list = list.filter(
      (t) =>
        (t.company_name || '').toLowerCase().includes(counterSearchKeyword) ||
        (t.tenant_id || '').toLowerCase().includes(counterSearchKeyword) ||
        (t.brand_origin_desc || '').toLowerCase().includes(counterSearchKeyword)
    );
  }

  if (list.length === 0) {
    grid.innerHTML = '<div class="col-span-full py-12 text-center text-stone-400 text-xs">未找到匹配的数字专柜工坊。</div>';
    return;
  }

  grid.innerHTML = list
    .map((t) => {
      const tenantProds = allProducts.filter((p) => p.tenant_id === t.tenant_id);
      const sampleProds = tenantProds.slice(0, 3);
      return `
        <div class="bg-white border border-stone-200 hover:border-emerald-700 rounded-3xl p-4 shadow-xs transition flex flex-col justify-between space-y-3">
          <div class="space-y-2">
            <div class="flex justify-between items-start gap-2">
              <div>
                <span class="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-mono font-bold">
                  ${t.business_type === 'factory' ? '🏭 源头工坊专柜' : '🏢 区域总代专柜'}
                </span>
                <h3 class="text-sm font-bold text-stone-900 mt-1.5">${t.company_name}</h3>
                <span class="text-[10px] text-stone-400 font-mono block">专柜编号: ${t.tenant_id}</span>
              </div>
              <span class="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-lg font-mono shrink-0">
                云端货架 ${tenantProds.length} 款
              </span>
            </div>

            <p class="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">
              ${t.brand_origin_desc || '物勒工名 · 源头直供 · 支持小店自提与批量定制接单'}
            </p>

            ${
              sampleProds.length > 0
                ? `<div class="grid grid-cols-3 gap-1.5 pt-1">
                    ${sampleProds
                      .map(
                        (sp) => `
                        <div class="bg-stone-50 border border-stone-100 rounded-xl p-1.5 text-center">
                          <div class="w-full h-12 rounded-lg bg-stone-200/60 overflow-hidden flex items-center justify-center mb-1">
                            ${sp.image_url ? `<img src="${sp.image_url}" class="w-full h-full object-cover">` : '<span class="text-[9px] text-stone-400">正品</span>'}
                          </div>
                          <span class="text-[9px] text-stone-700 block truncate">${sp.name}</span>
                          <b class="text-[10px] font-mono text-emerald-900">¥${sp.tier_1_price}</b>
                        </div>
                      `
                      )
                      .join('')}
                  </div>`
                : `<div class="bg-stone-50 rounded-xl p-2 text-[10px] text-stone-400 text-center">该专柜支持来样/按需定制接单</div>`
            }
          </div>

          <div class="pt-2 border-t border-stone-100 flex gap-2 text-xs">
            <button onclick="window.openC2BDemandModal('', '${t.tenant_id}')" class="bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold px-3 py-2 rounded-xl transition">
              🎯 定制询价
            </button>
            <button onclick="window.goToBrandStore('${t.tenant_id}')" class="flex-1 bg-[#1b4332] hover:bg-[#143628] text-white font-bold py-2 rounded-xl shadow active:scale-95 transition">
              进入数字专柜 ➔
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderCategoryChips() {
  const bar = document.getElementById('category-filter-bar');
  const container = document.getElementById('dynamic-cat-chips');
  if (!bar || !container) return;

  let catNames = allCategories.filter((c) => c.level === 1).map((c) => c.name);
  if (catNames.length === 0 && allProducts.length > 0) {
    catNames = [...new Set(allProducts.map((p) => p.category_main).filter(Boolean))];
  }

  if (catNames.length === 0) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  container.innerHTML = catNames
    .map(
      (name) => `
      <button onclick="window.filterMallCategory('${name}')" class="mall-cat-chip bg-white border border-stone-200 text-stone-700 hover:border-emerald-700 px-3 py-1 rounded-xl font-bold transition">
        ${name}
      </button>
    `
    )
    .join('');
}

window.filterMallCategory = function (catName) {
  currentCategoryFilter = catName;
  document.querySelectorAll('.mall-cat-chip').forEach((b) => {
    const isMatch = (catName === 'all' && b.innerText.includes('全部精选')) || b.innerText.trim() === catName;
    b.className = isMatch
      ? 'mall-cat-chip bg-amber-400 text-stone-950 px-3 py-1 rounded-xl font-bold transition'
      : 'mall-cat-chip bg-white border border-stone-200 text-stone-700 hover:border-emerald-700 px-3 py-1 rounded-xl font-bold transition';
  });
  renderGoodsGrid();
};

window.onSearchMallKeyword = function (val) {
  currentKeywordFilter = (val || '').trim().toLowerCase();
  updateMatchedTenantShortcut();
  renderGoodsGrid();
};

function updateMatchedTenantShortcut() {
  const box = document.getElementById('matched-tenant-shortcut');
  if (!box) return;

  if (currentTenantParam || !currentKeywordFilter) {
    box.classList.add('hidden');
    return;
  }

  const matched = allTenants.filter(
    (t) =>
      (t.company_name || '').toLowerCase().includes(currentKeywordFilter) ||
      (t.tenant_id || '').toLowerCase().includes(currentKeywordFilter)
  );

  if (matched.length === 0) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  box.innerHTML = matched
    .slice(0, 3)
    .map(
      (t) => `
      <div onclick="window.goToBrandStore('${t.tenant_id}')" class="bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-2xl flex justify-between items-center cursor-pointer hover:bg-emerald-100/70 transition">
        <div class="text-xs">
          <span class="text-emerald-800 font-bold">🏛️ 直达数字专柜：${t.company_name}</span>
          <span class="text-[10px] text-emerald-700/80 font-mono ml-1.5">(${t.tenant_id})</span>
        </div>
        <span class="text-[11px] font-bold text-emerald-900">进专柜 ➔</span>
      </div>
    `
    )
    .join('');
}

function renderGoodsGrid() {
  const container = document.getElementById('mall-goods-grid');
  if (!container) return;

  let filtered = allProducts;

  if (currentCategoryFilter !== 'all') {
    filtered = filtered.filter((p) => p.category_main === currentCategoryFilter);
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
    container.innerHTML = `
      <div class="col-span-full py-12 text-center space-y-3 bg-white rounded-3xl border border-stone-200 p-6">
        <div class="text-stone-600 font-bold text-xs">当前货架暂无天街直供礼盒/大件良品</div>
        <p class="text-[11px] text-stone-400 max-w-xs mx-auto leading-relaxed">
          日常民生常备品均留存附近实体小店，您可逛工坊专柜或直接发求购需求由工坊接单。
        </p>
        <div class="flex flex-wrap justify-center gap-2 pt-1">
          ${
            !currentTenantParam
              ? `<button onclick="window.switchMarketMode('counters')" class="bg-[#1b4332] hover:bg-[#143628] text-white font-bold text-xs px-4 py-2 rounded-xl shadow active:scale-95 transition">
                  🏛️ 逛逛在册数字专柜 (${allTenants.length})
                </button>`
              : ''
          }
          <button onclick="window.switchMarketMode('c2b'); window.openC2BDemandModal(document.getElementById('mall-search-input')?.value || '');" class="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs px-4 py-2 rounded-xl shadow active:scale-95 transition">
            📢 发求购榜让工坊报价
          </button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map((p) => {
      const tenant = allTenants.find((t) => t.tenant_id === p.tenant_id);
      const tenantName = tenant ? tenant.company_name : p.tenant_id;
      const tags = Array.isArray(p.tags) ? p.tags : [];
      const isSingleShop = !!currentTenantParam;
      const hasTierPrice = parseFloat(p.tier_2_price || 0) > 0 && parseFloat(p.tier_2_price) < parseFloat(p.tier_1_price || 0);
      const isStoreRecommended =
        !!referrerStoreObj ||
        tags.some((t) => String(t).includes('推荐') || String(t).includes('严选') || String(t).includes('爆款'));

      return `
        <div class="bg-white rounded-3xl p-3 border border-stone-200/80 shadow-sm flex flex-col justify-between space-y-2 hover:shadow-md transition">
          <div class="space-y-1.5">
            <div onclick="window.openProductDetail(${p.id})" class="relative w-full h-32 rounded-2xl bg-stone-100 overflow-hidden flex items-center justify-center cursor-pointer">
              ${p.image_url ? `<img src="${p.image_url}" class="w-full h-full object-cover">` : `<span class="text-stone-300 text-xs">正品封装</span>`}
              <span class="absolute top-1.5 left-1.5 bg-[#1b4332]/80 backdrop-blur-sm text-white text-[9px] px-2 py-0.5 rounded-full font-mono">
                ${p.measure_unit || '件'}装
              </span>
              ${
                hasTierPrice
                  ? `<span class="absolute top-1.5 right-1.5 bg-amber-500 text-stone-950 text-[8px] px-1.5 py-0.5 rounded-full font-bold shadow-xs">
                      满5件批价¥${p.tier_2_price}
                    </span>`
                  : ''
              }
              ${
                isStoreRecommended
                  ? `<span class="absolute bottom-1.5 left-1.5 bg-amber-100/95 text-amber-950 border border-amber-300 text-[8px] font-bold px-1.5 py-0.5 rounded-md">
                      🏪 掌柜严选
                    </span>`
                  : ''
              }
              <button type="button" onclick="event.stopPropagation(); window.viewProductTrace(${p.id})" class="absolute bottom-1.5 right-1.5 bg-white/90 backdrop-blur-sm text-emerald-900 border border-emerald-200 text-[9px] font-bold px-2 py-0.5 rounded-lg active:scale-95 shadow-xs">
                📜 验真
              </button>
            </div>

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

          <div class="pt-2 border-t border-stone-100 flex justify-between items-center">
            <div>
              <span class="text-[9px] text-stone-400 block font-mono">统一正价</span>
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

  const tierBox = document.getElementById('detail-tier-prices');
  const p2 = parseFloat(p.tier_2_price || 0);
  const p3 = parseFloat(p.tier_3_price || 0);
  if (p2 > 0 || p3 > 0) {
    tierBox.innerHTML = `
      <b class="text-amber-900 block mb-1">📊 集采阶梯优惠标准：</b>
      <div class="grid grid-cols-3 gap-1.5 text-center font-mono">
        <div class="bg-white p-1.5 rounded-lg border border-amber-200"><span class="text-[9px] text-stone-400 block">1~4件</span><b>¥${p.tier_1_price}</b></div>
        <div class="bg-white p-1.5 rounded-lg border border-amber-200"><span class="text-[9px] text-stone-400 block">满5件</span><b class="text-amber-800">¥${p2 || p.tier_1_price}</b></div>
        <div class="bg-white p-1.5 rounded-lg border border-amber-200"><span class="text-[9px] text-stone-400 block">满20件</span><b class="text-emerald-800">¥${p3 || p2 || p.tier_1_price}</b></div>
      </div>
    `;
    tierBox.classList.remove('hidden');
  } else {
    tierBox.classList.add('hidden');
  }

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

  document.getElementById('btn-detail-c2b-custom').onclick = () => {
    window.closeModal('modal-product-detail');
    window.openC2BDemandModal(p.name, p.tenant_id);
  };

  window.openModal('modal-product-detail');
};

// =========================================================================
// 街坊验真口碑晒单墙（公平公开透明的真实收货口碑）
// =========================================================================
function renderVerifiedReviewsWall() {
  const section = document.getElementById('verified-reviews-section');
  const listEl = document.getElementById('verified-reviews-list');
  if (!section || !listEl) return;

  if (allReviews.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  listEl.innerHTML = allReviews
    .slice(0, 8)
    .map((r) => {
      let info = { orderNo: '', itemsSummary: '', comment: r.content };
      try {
        const parsed = JSON.parse(r.content);
        if (parsed && parsed.comment) info = parsed;
      } catch (e) {}

      return `
        <div class="shrink-0 w-60 bg-white border border-stone-200 rounded-2xl p-3 shadow-2xs space-y-1.5 text-xs">
          <div class="flex justify-between items-center text-[10px]">
            <span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">📜 验真已购口碑</span>
            <span class="text-stone-400 font-mono">${new Date(r.created_at).toLocaleDateString()}</span>
          </div>
          <p class="text-stone-800 text-[11px] line-clamp-2 leading-relaxed">“${info.comment}”</p>
          <div class="text-[10px] text-stone-400 truncate border-t border-stone-100 pt-1">
            ${info.itemsSummary ? `已购：${info.itemsSummary}` : r.proposer_name || '街坊买家'}
          </div>
        </div>
      `;
    })
    .join('');
}

window.openReviewModal = function (orderNo, tenantId, itemsSummary) {
  document.getElementById('review-order-no').value = orderNo;
  document.getElementById('review-tenant-id').value = tenantId || '';
  document.getElementById('review-items-summary').value = itemsSummary || '';
  document.getElementById('review-order-badge').innerText = `单据 #${orderNo} · ${itemsSummary || '天街良品'}`;
  document.getElementById('review-comment-input').value = '';
  window.openModal('modal-write-review');
};

window.submitOrderReview = async function () {
  const orderNo = document.getElementById('review-order-no').value;
  const tenantId = document.getElementById('review-tenant-id').value;
  const itemsSummary = document.getElementById('review-items-summary').value;
  const comment = document.getElementById('review-comment-input').value.trim();

  if (!comment) return alert('请写下一句您的真实收货或自提体验！');

  const payload = {
    proposer_type: 'mall_review',
    proposer_name: '天街验真街坊',
    category: `口碑晒单:${tenantId || 'PLATFORM'}`,
    content: JSON.stringify({
      orderNo,
      itemsSummary,
      comment
    })
  };

  const { error } = await MallService.submitVerifiedReview(payload);
  if (error) {
    alert('提交失败: ' + error.message);
  } else {
    alert('🙏 感谢您的真实口碑！已同步展示于天街与对应工坊专柜验真墙。');
    window.closeModal('modal-write-review');
    allReviews = await MallService.fetchVerifiedReviews(currentTenantParam);
    renderVerifiedReviewsWall();
  }
};

// =========================================================================
// C2B 需求发榜、跟单凑量、认可报价与撤销闭环
// =========================================================================
async function loadAndRenderC2BDemands() {
  const listEl = document.getElementById('c2b-demands-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="py-10 text-center text-stone-400 text-xs">正调阅百工天街实时求购需求榜...</div>';

  allDemands = await MallService.fetchC2BDemands(currentTenantParam);
  renderC2BDemandsList();
}

function parseDemandPayload(rawContent) {
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && parsed.title) return parsed;
  } catch (e) {}
  return {
    title: rawContent,
    qty: '若干',
    budget: '面议',
    delivery: '灵活协商',
    coBuyers: 1,
    acceptedByBuyer: false
  };
}

function renderC2BDemandsList() {
  const listEl = document.getElementById('c2b-demands-list');
  if (!listEl) return;

  // 消除重复按钮：空状态只做纯净文字引导，发榜动作统一由底部悬浮主按钮触发
  if (allDemands.length === 0) {
    listEl.innerHTML = `
      <div class="py-12 text-center bg-white rounded-3xl border border-stone-200 p-6 space-y-1.5">
        <div class="text-stone-600 font-bold text-xs">当前暂无公开求购需求帖</div>
        <div class="text-stone-400 text-[11px]">点击下方按钮即可发布您的采购或定制需求，由对应工坊公开报价</div>
      </div>
    `;
    return;
  }

  let joinedIds = [];
  try {
    joinedIds = JSON.parse(localStorage.getItem(JOINED_DEMANDS_KEY) || '[]');
  } catch (e) {}

  listEl.innerHTML = allDemands
    .map((d) => {
      const info = parseDemandPayload(d.content);
      const isJoined = joinedIds.includes(d.id);
      const hasFactoryReply = !!d.official_reply;
      const targetTag = d.category || '全网公域发榜';

      return `
        <div class="bg-white border border-stone-200 rounded-3xl p-4 shadow-2xs space-y-2.5 text-xs">
          <div class="flex justify-between items-start gap-2">
            <div>
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="bg-amber-100 text-amber-950 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  🔥 ${info.coBuyers || 1} 人已凑单
                </span>
                <span class="bg-stone-100 text-stone-600 text-[10px] px-2 py-0.5 rounded-full font-mono">
                  ${targetTag}
                </span>
              </div>
              <b class="text-sm text-stone-900 block mt-1.5">${info.title}</b>
            </div>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
              info.acceptedByBuyer
                ? 'bg-emerald-600 text-white'
                : hasFactoryReply
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }">
              ${info.acceptedByBuyer ? '🤝 双方已达成意向' : hasFactoryReply ? '✅ 工坊已接单报价' : '⏳ 聚量招标中'}
            </span>
          </div>

          <div class="grid grid-cols-3 gap-1.5 bg-stone-50 p-2 rounded-2xl border border-stone-100 text-[11px] font-mono">
            <div><span class="text-stone-400 block text-[9px]">求购规模</span><b class="text-stone-800">${info.qty}</b></div>
            <div><span class="text-stone-400 block text-[9px]">期望预算</span><b class="text-emerald-900">${info.budget}</b></div>
            <div><span class="text-stone-400 block text-[9px]">交付要求</span><b class="text-stone-700 font-sans">${info.delivery}</b></div>
          </div>

          ${info.note ? `<p class="text-[11px] text-stone-500">💬 规格/定制说明：${info.note}</p>` : ''}

          ${
            hasFactoryReply
              ? `<div class="bg-emerald-50 border border-emerald-200 p-2.5 rounded-2xl text-[11px] text-emerald-950">
                  <b>🏭 厂方/平台报价回执：</b> ${d.official_reply}
                </div>`
              : ''
          }

          <div class="pt-2 border-t border-stone-100 flex justify-between items-center text-[10px] text-stone-400">
            <span>发布时间: ${new Date(d.created_at).toLocaleDateString()}</span>
            <button onclick="window.coBuyC2BDemand(${d.id})" ${isJoined ? 'disabled' : ''} class="${
        isJoined
          ? 'bg-stone-100 text-stone-400 px-3 py-1.5 rounded-xl font-bold'
          : 'bg-[#1b4332] hover:bg-[#143628] text-white px-3.5 py-1.5 rounded-xl font-bold shadow active:scale-95 transition'
      }">
              ${isJoined ? '✓ 已参与跟单凑量' : '🤝 我也要 · +1 跟单凑量'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

window.openC2BDemandModal = function (presetTitle = '', presetTenantId = '') {
  document.getElementById('c2b-title-input').value = presetTitle || '';
  document.getElementById('c2b-qty-input').value = '';
  document.getElementById('c2b-budget-input').value = '';
  document.getElementById('c2b-delivery-input').value = '';
  document.getElementById('c2b-note-input').value = '';

  const activeTid = presetTenantId || currentTenantParam || '';
  const matchedTenant = activeTid
    ? allTenants.find((t) => (t.tenant_id || '').toUpperCase() === activeTid.toUpperCase())
    : null;

  const targetInput = document.getElementById('c2b-target-input');
  const scopeHint = document.getElementById('c2b-scope-hint');
  if (targetInput) {
    targetInput.value = matchedTenant ? matchedTenant.company_name : '';
    targetInput.dataset.lockedTenantId = matchedTenant ? matchedTenant.tenant_id : '';
  }
  if (scopeHint) {
    scopeHint.innerText = matchedTenant
      ? `当前已关联【${matchedTenant.company_name}】，清空即可发往全网工坊公开竞价`
      : '留空则面向全网对应行当工坊公开招标，也可自由输入指定工坊或产区';
  }

  try {
    const saved = JSON.parse(localStorage.getItem(LAST_CUST_KEY) || 'null');
    if (saved) {
      if (!document.getElementById('c2b-name-input').value) document.getElementById('c2b-name-input').value = saved.name || '';
      if (!document.getElementById('c2b-phone-input').value) document.getElementById('c2b-phone-input').value = saved.phone || '';
    }
  } catch (e) {}

  window.openModal('modal-c2b-demand');
};

window.appendC2BDeliveryChip = function (chipText) {
  const input = document.getElementById('c2b-delivery-input');
  if (!input) return;
  const cur = input.value.trim();
  if (!cur) {
    input.value = chipText;
  } else if (!cur.includes(chipText)) {
    input.value = `${cur} / ${chipText}`;
  }
};

window.submitC2BDemand = async function () {
  const title = document.getElementById('c2b-title-input').value.trim();
  const qty = document.getElementById('c2b-qty-input').value.trim();
  const budget = document.getElementById('c2b-budget-input').value.trim() || '按阶梯批价面议';
  const delivery = document.getElementById('c2b-delivery-input').value.trim() || '灵活协商（门店自提/工坊直发）';
  const targetText = document.getElementById('c2b-target-input').value.trim();
  const note = document.getElementById('c2b-note-input').value.trim();
  const name = document.getElementById('c2b-name-input').value.trim();
  const phone = document.getElementById('c2b-phone-input').value.trim();

  if (!title || !qty || !phone || phone.length < 11) {
    return alert('请完整填写求购/定制品名、需求数量以及 11 位联系手机号！');
  }

  const matchedTenant = targetText
    ? allTenants.find(
        (t) =>
          (t.company_name || '').includes(targetText) ||
          targetText.includes(t.company_name || '') ||
          (t.tenant_id || '').toUpperCase() === targetText.toUpperCase()
      )
    : null;

  const categoryTag = matchedTenant
    ? `C2B专柜:${matchedTenant.tenant_id}(${matchedTenant.company_name})`
    : targetText
    ? `C2B意向:${targetText}`
    : 'C2B全网公域发榜';

  const structuredContent = JSON.stringify({
    title,
    qty,
    budget,
    delivery,
    note,
    coBuyers: 1,
    acceptedByBuyer: false
  });

  const { error } = await MallService.publishC2BDemand({
    proposer_type: 'c2b_demand',
    proposer_name: `${name || '天街买家'} (${phone})`,
    category: categoryTag,
    content: structuredContent
  });

  if (error) {
    alert('发布失败: ' + error.message);
  } else {
    alert('🎉 求购/定制需求已成功发榜！\n其他买家可点击跟单凑量，对应行当工坊将尽快报价接单。');
    window.closeModal('modal-c2b-demand');
    await loadAndRenderC2BDemands();
  }
};

window.coBuyC2BDemand = async function (demandId) {
  const demand = allDemands.find((x) => x.id === demandId);
  if (!demand) return;

  const info = parseDemandPayload(demand.content);
  info.coBuyers = (parseInt(info.coBuyers) || 1) + 1;

  await MallService.updateC2BDemandContent(demandId, JSON.stringify(info));

  try {
    const joinedIds = JSON.parse(localStorage.getItem(JOINED_DEMANDS_KEY) || '[]');
    if (!joinedIds.includes(demandId)) {
      joinedIds.push(demandId);
      localStorage.setItem(JOINED_DEMANDS_KEY, JSON.stringify(joinedIds));
    }
  } catch (e) {}

  alert(`🤝 跟单凑量成功！当前已有 ${info.coBuyers} 位买家共同聚量，量越大工坊出厂价越优！`);
  await loadAndRenderC2BDemands();
};

window.acceptC2BQuote = async function (demandId, rawContent) {
  if (!confirm('确认认可厂方报价并锁定合作意向？确认后平台与对应工坊将立即联系您安排排产交付。')) return;
  const info = parseDemandPayload(rawContent);
  info.acceptedByBuyer = true;
  await MallService.updateC2BDemandContent(demandId, JSON.stringify(info));
  alert('🤝 已锁定合作意向！厂方执事将尽快致电与您对接排产与交付细节。');
  await window.searchConsumerOrders();
};

window.cancelMyC2BDemand = async function (demandId) {
  if (!confirm('确认撤销此条求购需求？撤销后将从天街需求榜下架。')) return;
  await MallService.cancelC2BDemand(demandId);
  alert('已撤销该求购需求。');
  await window.searchConsumerOrders();
};

// =========================================================================
// 购物车与一键按原单复购
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

window.addToCart = function (prodId, qtyToAdd = 1) {
  const p = allProducts.find((x) => x.id === prodId);
  if (!p) return false;

  const item = cart.find((x) => x.prod.id === prodId);
  if (item) item.qty += qtyToAdd;
  else cart.push({ prod: p, qty: qtyToAdd });

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
    if (window.addToCart(it.id, parseInt(it.qty || 1))) {
      addedCount++;
    }
  });

  window.closeModal('modal-my-orders');
  if (addedCount > 0) {
    window.openCartModal();
  } else {
    alert('该历史单据中的部分商品已调整规格或暂未上架，请前往专柜挑选新品。');
  }
};

function calcCartSummary() {
  let totalQty = 0;
  let totalAmt = 0;
  let savedAmt = 0;

  cart.forEach((item) => {
    const unitPrice = getEffectiveUnitPrice(item.prod, item.qty);
    const basePrice = parseFloat(item.prod.tier_1_price || 0);
    totalQty += item.qty;
    totalAmt += unitPrice * item.qty;
    if (basePrice > unitPrice) {
      savedAmt += (basePrice - unitPrice) * item.qty;
    }
  });

  return { totalQty, totalAmt, savedAmt };
}

function updateCartBadge() {
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

function renderCartDrawer() {
  const list = document.getElementById('cart-items-list');
  if (!list) return;
  if (cart.length === 0) {
    list.innerHTML = '<div class="py-8 text-center text-stone-400 text-xs">购物篮尚无品项。</div>';
    return;
  }

  list.innerHTML = cart
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

window.setCartQty = function (prodId, rawVal) {
  const val = parseInt(rawVal);
  if (isNaN(val) || val <= 0) {
    cart = cart.filter((x) => x.prod.id !== prodId);
  } else {
    const item = cart.find((x) => x.prod.id === prodId);
    if (item) item.qty = val;
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

// =========================================================================
// 结账中心：护店润利归属透明公示 + 邻里拼单随车直达进度
// =========================================================================
async function updateCheckoutProfitAndGroupNotice() {
  const noticeEl = document.getElementById('checkout-profit-notice');
  const groupBar = document.getElementById('checkout-group-buy-bar');
  if (!noticeEl) return;

  const mode = document.getElementById('order-delivery-mode')?.value || 'pickup';
  const pickupName = document.getElementById('order-pickup-input')?.value.trim();
  const activeStoreId = selectedPickupStoreId || (referrerStoreObj ? String(referrerStoreObj.id) : '');

  if (mode === 'pickup' && pickupName) {
    noticeEl.innerText = `🤝 结缘护店契约：本单零售润利全额归属【${pickupName}】，工坊直供品质担保`;
  } else if (referrerStoreObj) {
    noticeEl.innerText = `🤝 结缘护店契约：本单零售润利全额归属【${referrerStoreObj.name}】，工坊直供品质担保`;
  } else {
    noticeEl.innerText = '📜 商道公示：全网统一零售正价，不破价、不挤兑周边实体小店';
  }

  // 邻里拼单满发随车直达进度条
  if (groupBar && mode === 'pickup' && activeStoreId) {
    const existingQty = await MallService.fetchStoreGroupBuyCount(activeStoreId);
    const { totalQty } = calcCartSummary();
    const combinedQty = existingQty + totalQty;
    const targetQty = 10;
    const pct = Math.min(100, Math.round((combinedQty / targetQty) * 100));

    groupBar.innerHTML = `
      <div class="flex justify-between text-[10px] font-bold text-amber-950 mb-1">
        <span>🚚 本店邻里拼单随车直达进度（含本单共 ${combinedQty}/${targetQty} 件）</span>
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
    ? pickupStores.filter(
        (s) =>
          (s.name || '').toLowerCase().includes(q) ||
          (s.address || '').toLowerCase().includes(q)
      )
    : pickupStores.slice(0, 6);

  if (matched.length === 0) {
    listEl.innerHTML = '<span class="text-[10px] text-stone-400">未匹配到在册门店，直接填写您常去的邻里小店名称即可</span>';
    selectedPickupStoreId = '';
    return;
  }

  listEl.innerHTML = matched
    .slice(0, 6)
    .map(
      (s) => `
      <button type="button" onclick="window.selectPickupStore(${s.id}, '${s.name.replace(/'/g, "\\'")}', '${(s.address || '').replace(/'/g, "\\'")}')" class="text-left w-full px-2.5 py-1.5 rounded-xl border text-[11px] transition ${
        String(selectedPickupStoreId) === String(s.id)
          ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-bold'
          : 'bg-white border-stone-200 text-stone-700 hover:border-emerald-600'
      }">
        🏪 ${s.name} <span class="text-[10px] text-stone-400">(${s.address || '邻里门店'})</span>
      </button>
    `
    )
    .join('');
};

window.selectPickupStore = function (id, name, address) {
  selectedPickupStoreId = String(id);
  const input = document.getElementById('order-pickup-input');
  if (input) input.value = `${name}${address ? ` (${address})` : ''}`;
  window.onSearchPickupStore('');
};

window.openCheckoutModal = async function () {
  if (cart.length === 0) return alert('购物篮尚无好物，请先挑选良品！');
  const { totalAmt, savedAmt } = calcCartSummary();

  const el = document.getElementById('checkout-amount-display');
  if (el) el.innerText = `¥${totalAmt.toFixed(2)}`;

  const savedTip = document.getElementById('checkout-saved-tip');
  if (savedTip) {
    if (savedAmt > 0) {
      savedTip.innerText = `已享阶梯团购立省 ¥${savedAmt.toFixed(2)}`;
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

  if (pickupStores.length === 0) {
    pickupStores = await MallService.fetchPickupStores(currentTenantParam);
  }
  if (refStoreParam) {
    const refObj = pickupStores.find((s) => String(s.id) === String(refStoreParam)) || referrerStoreObj;
    if (refObj) {
      selectedPickupStoreId = String(refObj.id);
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

  if (!name || !phone || phone.length < 11) {
    return alert('请填全收件人姓名与 11 位手机号！');
  }
  if (deliveryMode === 'express' && !addr) {
    return alert('请填写快递配送详细地址！');
  }
  if (deliveryMode === 'pickup' && !pickupCustomText) {
    return alert('请选择或填写自提实体门店名称！');
  }
  if (cart.length === 0) {
    return alert('购物篮尚无好物！');
  }

  const finalAddressText = deliveryMode === 'pickup' ? `【门店自提】${pickupCustomText}` : addr;

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

    const effectiveRefStoreId = deliveryMode === 'pickup' && selectedPickupStoreId ? selectedPickupStoreId : refStoreParam;

    orderPayloads.push({
      order_no: orderNo,
      tenant_id: tenantId,
      store_id: deliveryMode === 'pickup' && selectedPickupStoreId ? parseInt(selectedPickupStoreId) : null,
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
      note: `[天街订单] 收件人: ${name} (${phone}) 地址: ${finalAddressText} ${note ? `叮咛: ${note}` : ''} ${effectiveRefStoreId ? `[结缘门店ID: ${effectiveRefStoreId}]` : ''}`,
      driver_action_instruction:
        deliveryMode === 'pickup'
          ? `【天街门店自提单】随车捎带至 ${pickupCustomText}，客户 ${name} (${phone}) 到店自提（润利归属该门店）`
          : `【天街工坊直发单】由库管打单发快递。收件人: ${name} ${phone}`
    });
  });

  const { error } = await MallService.submitOnlineOrder(orderPayloads, cart);

  if (error) {
    alert('下单失败: ' + error.message);
  } else {
    localStorage.setItem(LAST_CUST_KEY, JSON.stringify({ name, phone, addr }));
    alert(
      `🎉 订购提交成功！\n\n` +
        `• 单据标识: ${createdOrderNos.join('、')}\n` +
        `• 实付总额: ¥${grandTotal.toFixed(2)}\n` +
        `• 履约方式: ${deliveryMode === 'pickup' ? `送至 ${pickupCustomText} 自提` : '工坊直发快递包邮'}`
    );
    window.clearCart();
    window.closeModal('modal-checkout');
  }
};

// =========================================================================
// 统一查询中心：支持「一键再来一单」与「验真晒单」
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
    return alert('请输入下单或发榜时预留的手机号！');
  }

  listEl.innerHTML = '<div class="py-8 text-center text-stone-400">正在检索您的天街订单与求购需求...</div>';
  const { orders, demands } = await MallService.queryOrdersByPhone(phone);

  if (orders.length === 0 && demands.length === 0) {
    listEl.innerHTML = '<div class="py-8 text-center text-stone-400">未查询到该手机号关联的订单或求购需求。</div>';
    return;
  }

  let html = '';

  if (demands.length > 0) {
    html += `<div class="text-[11px] font-bold text-amber-900 pt-1">📢 我发布的求购/定制需求 (${demands.length})：</div>`;
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
                    <div><b>🏭 厂方报价回复：</b>${d.official_reply}</div>
                    ${
                      info.acceptedByBuyer
                        ? `<div class="text-[10px] font-bold text-emerald-700">✓ 您已认可报价，工坊执事正在对接履约</div>`
                        : `<button onclick="window.acceptC2BQuote(${d.id}, decodeURIComponent('${safeRaw}'))" class="bg-[#1b4332] text-white text-[10px] font-bold px-2.5 py-1 rounded-lg active:scale-95">
                            🤝 认可此报价 · 锁定合作意向
                          </button>`
                    }
                  </div>`
                : `<div class="flex justify-between items-center text-[10px] text-stone-500">
                    <span>⏳ 正在等待对应行当工坊接单报价...</span>
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
        const encodedItems = encodeURIComponent(JSON.stringify(items));
        const safeItemsSummary = itemsText.replace(/'/g, '');
        return `
          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
            <div class="flex justify-between items-center">
              <b class="font-mono text-stone-900">#${o.order_no || o.id}</b>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isDelivered ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
              }">
                ${isDelivered ? '✅ 已送达/自提完成' : '📦 工坊备货出库中'}
              </span>
            </div>
            <div class="text-stone-700">${itemsText || '标准商品组合'}</div>
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
  navigator.clipboard.writeText(link).then(() => alert('专属结缘推客链接已复制到剪贴簿！'));
};

export async function initMallController() {
  restoreCart();
  updateCartBadge();

  const [tenants, cats] = await Promise.all([
    MallService.fetchActiveTenants(),
    MallService.fetchActiveCategories()
  ]);
  allTenants = tenants;
  allCategories = cats;

  const countBadge = document.getElementById('counter-count-badge');
  const quickCountEl = document.getElementById('quick-counter-count');
  if (countBadge) countBadge.innerText = allTenants.length;
  if (quickCountEl) quickCountEl.innerText = `${allTenants.length} 家在册工坊专柜`;

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
      referrerStoreObj = refStore;
      document.getElementById('ref-store-name').innerText = refStore.name;
      document.getElementById('referrer-banner')?.classList.remove('hidden');
    }
  }

  const [products, reviews] = await Promise.all([
    MallService.fetchMallProducts(currentTenantParam),
    MallService.fetchVerifiedReviews(currentTenantParam)
  ]);
  allProducts = products;
  allReviews = reviews;

  renderCategoryChips();
  renderGoodsGrid();
  renderDigitalCountersGrid();
  renderVerifiedReviewsWall();
}
