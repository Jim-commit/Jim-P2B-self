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
let pickupStores = [];
let currentMarketMode = 'b2c';
let currentCategoryFilter = 'all';
let currentBrandFilter = 'all';
let currentKeywordFilter = '';
let cart = [];

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

window.switchMarketMode = async function (mode) {
  currentMarketMode = mode;
  const isB2C = mode === 'b2c';

  document.getElementById('pane-b2c-market')?.classList.toggle('hidden', !isB2C);
  document.getElementById('pane-c2b-market')?.classList.toggle('hidden', isB2C);
  document.getElementById('b2c-cart-footer')?.classList.toggle('hidden', !isB2C);
  document.getElementById('c2b-publish-footer')?.classList.toggle('hidden', isB2C);

  const btnB2C = document.getElementById('mode-tab-b2c');
  const btnC2B = document.getElementById('mode-tab-c2b');
  if (btnB2C && btnC2B) {
    btnB2C.className = isB2C
      ? 'flex-1 py-2 rounded-xl bg-[#1b4332] text-white font-bold shadow transition flex items-center justify-center gap-1'
      : 'flex-1 py-2 rounded-xl text-stone-600 hover:text-stone-900 font-bold transition flex items-center justify-center gap-1';
    btnC2B.className = !isB2C
      ? 'flex-1 py-2 rounded-xl bg-amber-500 text-stone-950 font-bold shadow transition flex items-center justify-center gap-1'
      : 'flex-1 py-2 rounded-xl text-stone-600 hover:text-stone-900 font-bold transition flex items-center justify-center gap-1';
  }

  if (!isB2C) {
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

  if (qty >= 20 && p3 > 0 && p3 < p1) return '🔥 满20件大宗团购价';
  if (qty >= 5 && p2 > 0 && p2 < p1) return '✨ 满5件阶梯优惠价';
  return '零售正价';
}

function setupTianJieMode() {
  document.getElementById('mall-header-title').innerText = '百工天街 · B2C/C2B 集市';
  document.getElementById('mall-mode-badge').innerText = '生态公域';
  document.getElementById('mall-header-sub').innerText = '现货直发 · 需求发榜 · 以量定产';
  document.getElementById('btn-back-street')?.classList.add('hidden');
  document.getElementById('btn-find-brand')?.classList.remove('hidden');
  document.getElementById('brand-hero-section')?.classList.add('hidden');
  document.getElementById('tianjie-brand-showcase')?.classList.remove('hidden');
  document.getElementById('tianjie-brand-bar')?.classList.remove('hidden');
}

function setupBrandStoreMode(tenantId) {
  const tenant = allTenants.find((t) => (t.tenant_id || '').toUpperCase() === (tenantId || '').toUpperCase());
  const name = tenant ? tenant.company_name : tenantId;
  document.getElementById('mall-header-title').innerText = `${name} · 数字专柜`;
  document.getElementById('mall-mode-badge').innerText = '私域专柜';
  document.getElementById('mall-header-sub').innerText = '工坊直营 · 现货包邮 · 接单定制';
  document.getElementById('btn-back-street')?.classList.remove('hidden');
  document.getElementById('btn-find-brand')?.classList.add('hidden');
  document.getElementById('tianjie-brand-showcase')?.classList.add('hidden');
  document.getElementById('tianjie-brand-bar')?.classList.add('hidden');

  document.getElementById('hero-brand-name').innerText = name;
  document.getElementById('hero-brand-desc').innerText = tenant?.brand_origin_desc || '源头工坊 · 匠心正品 · 支持大宗与定制接单';
  document.getElementById('hero-tenant-id').innerText = tenant ? tenant.tenant_id : tenantId;
  document.getElementById('brand-hero-section')?.classList.remove('hidden');
}

function renderBrandShowcaseAndFilter() {
  const showcase = document.getElementById('brand-showcase-cards');
  if (showcase) {
    showcase.innerHTML = allTenants
      .map(
        (t) => `
        <div onclick="window.goToBrandStore('${t.tenant_id}')" class="shrink-0 w-44 bg-white border border-stone-200 hover:border-emerald-700 p-3 rounded-2xl shadow-2xs cursor-pointer transition space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded font-mono font-bold">
              ${t.business_type === 'factory' ? '🏭 源头工厂' : '🏢 区域总代'}
            </span>
            <span class="text-[10px] text-amber-700 font-bold">进专柜 ➔</span>
          </div>
          <b class="text-xs text-stone-900 block truncate">${t.company_name}</b>
          <span class="text-[10px] text-stone-400 font-mono block truncate">代号: ${t.tenant_id}</span>
        </div>
      `
      )
      .join('');
  }

  const bar = document.getElementById('dynamic-brand-chips');
  if (bar) {
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
    container.innerHTML = `
      <div class="col-span-full py-12 text-center space-y-2.5 bg-white rounded-3xl border border-stone-200 p-6">
        <div class="text-stone-400 text-xs">当前筛选条件下暂无已上架现货良品。</div>
        <button onclick="window.switchMarketMode('c2b'); window.openC2BDemandModal();" class="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs px-4 py-2 rounded-xl shadow active:scale-95 transition">
          📢 没找到想要的？立即发 C2B 求购榜让工厂报价
        </button>
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

  const tierBox = document.getElementById('detail-tier-prices');
  const p2 = parseFloat(p.tier_2_price || 0);
  const p3 = parseFloat(p.tier_3_price || 0);
  if (p2 > 0 || p3 > 0) {
    tierBox.innerHTML = `
      <b class="text-amber-900 block mb-1">📊 阶梯团购优惠标准：</b>
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

async function loadAndRenderC2BDemands() {
  const listEl = document.getElementById('c2b-demands-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="py-10 text-center text-stone-400 text-xs">正调阅百工天街 C2B 实时求购需求榜...</div>';

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
    delivery: '快递或门店自提',
    coBuyers: 1
  };
}

function renderC2BDemandsList() {
  const listEl = document.getElementById('c2b-demands-list');
  if (!listEl) return;

  if (allDemands.length === 0) {
    listEl.innerHTML = `
      <div class="py-12 text-center bg-white rounded-3xl border border-stone-200 p-6 space-y-2">
        <div class="text-stone-400 text-xs">当前暂无公开求购需求帖。</div>
        <button onclick="window.openC2BDemandModal()" class="bg-amber-500 text-stone-950 font-bold text-xs px-4 py-2 rounded-xl shadow">
          + 发布首条 C2B 求购 / 定制需求
        </button>
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
      const targetTag = (d.category || '').includes('专柜:') ? d.category : '全网公域发榜';

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
              hasFactoryReply ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-50 text-amber-800 border border-amber-200'
            }">
              ${hasFactoryReply ? '✅ 工坊已接单报价' : '⏳ 聚量招标中'}
            </span>
          </div>

          <div class="grid grid-cols-3 gap-1.5 bg-stone-50 p-2 rounded-2xl border border-stone-100 text-[11px] font-mono">
            <div><span class="text-stone-400 block text-[9px]">求购规模</span><b class="text-stone-800">${info.qty}</b></div>
            <div><span class="text-stone-400 block text-[9px]">期望预算</span><b class="text-emerald-900">${info.budget}</b></div>
            <div><span class="text-stone-400 block text-[9px]">交付方式</span><b class="text-stone-700 font-sans">${info.delivery}</b></div>
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
  document.getElementById('c2b-note-input').value = '';

  const targetSelect = document.getElementById('c2b-target-tenant');
  if (targetSelect) {
    const defaultTarget = presetTenantId || currentTenantParam || 'all';
    targetSelect.innerHTML =
      `<option value="all">🌐 发布至百工天街公域（全网工坊竞价接单）</option>` +
      allTenants
        .map(
          (t) =>
            `<option value="${t.tenant_id}" ${defaultTarget === t.tenant_id ? 'selected' : ''}>🏭 定向发往【${t.company_name}】数字专柜</option>`
        )
        .join('');
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

window.submitC2BDemand = async function () {
  const title = document.getElementById('c2b-title-input').value.trim();
  const qty = document.getElementById('c2b-qty-input').value.trim();
  const budget = document.getElementById('c2b-budget-input').value.trim() || '按阶梯批价面议';
  const delivery = document.getElementById('c2b-delivery-input').value;
  const targetTenant = document.getElementById('c2b-target-tenant').value;
  const note = document.getElementById('c2b-note-input').value.trim();
  const name = document.getElementById('c2b-name-input').value.trim();
  const phone = document.getElementById('c2b-phone-input').value.trim();

  if (!title || !qty || !phone || phone.length < 11) {
    return alert('请完整填写求购/定制品名、需求数量以及 11 位联系手机号！');
  }

  const structuredContent = JSON.stringify({
    title,
    qty,
    budget,
    delivery,
    note,
    coBuyers: 1
  });

  const categoryTag = targetTenant === 'all' ? 'C2B全网公域发榜' : `C2B定向专柜:${targetTenant}`;

  const { error } = await MallService.publishC2BDemand({
    proposer_type: 'c2b_demand',
    proposer_name: `${name || '天街买家'} (${phone})`,
    category: categoryTag,
    content: structuredContent
  });

  if (error) {
    alert('发布失败: ' + error.message);
  } else {
    alert('🎉 C2B 求购/定制需求已成功发榜！\n其他买家可点击跟单凑量，对应行当工坊将尽快报价接单。');
    window.closeModal('modal-c2b-demand');
    await loadAndRenderC2BDemands();
  }
};

window.coBuyC2BDemand = async function (demandId) {
  const demand = allDemands.find((x) => x.id === demandId);
  if (!demand) return;

  const info = parseDemandPayload(demand.content);
  info.coBuyers = (parseInt(info.coBuyers) || 1) + 1;

  await MallService.joinC2BDemand(demandId, JSON.stringify(info));

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
      return `
        <div class="py-2 flex justify-between items-center text-xs">
          <div>
            <b class="text-stone-900 block">${item.prod.name}</b>
            <span class="font-mono text-[10px] text-stone-500">
              单价: <b class="text-emerald-800">¥${unitPrice}</b> (${tierLabel}) · 小计: ¥${(unitPrice * item.qty).toFixed(2)}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="window.changeCartQty(${item.prod.id}, -1)" class="w-6 h-6 bg-stone-100 rounded-lg font-bold font-mono">-</button>
            <span class="font-bold font-mono">${item.qty}</span>
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

window.clearCart = function () {
  cart = [];
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
};

window.openCheckoutModal = async function () {
  if (cart.length === 0) return alert('购物篮尚无好物，请先挑选良品！');
  const { totalAmt, savedAmt } = calcCartSummary();

  const el = document.getElementById('checkout-amount-display');
  if (el) el.innerText = `¥${totalAmt.toFixed(2)}`;

  const savedTip = document.getElementById('checkout-saved-tip');
  if (savedTip) {
    if (savedAmt > 0) {
      savedTip.innerText = `已享阶梯批价立省 ¥${savedAmt.toFixed(2)}`;
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
  const storeSelect = document.getElementById('order-pickup-store');
  if (storeSelect) {
    storeSelect.innerHTML =
      pickupStores.length > 0
        ? pickupStores
            .map(
              (s) =>
                `<option value="${s.id}" ${refStoreParam && String(s.id) === String(refStoreParam) ? 'selected' : ''}>${s.name} (${s.address || '临街门店'})</option>`
            )
            .join('')
        : '<option value="">暂无附近合作自提点，请选择快递代发</option>';
  }

  window.openModal('modal-checkout');
};

window.submitConsumerOrder = async function () {
  const name = document.getElementById('order-cust-name').value.trim();
  const phone = document.getElementById('order-cust-phone').value.trim();
  const deliveryMode = document.getElementById('order-delivery-mode')?.value || 'express';
  const addr = document.getElementById('order-cust-addr').value.trim();
  const pickupStoreId = document.getElementById('order-pickup-store')?.value || '';
  const note = document.getElementById('order-cust-note').value.trim();

  if (!name || !phone || phone.length < 11) {
    return alert('请填全收件人姓名与 11 位手机号！');
  }
  if (deliveryMode === 'express' && !addr) {
    return alert('请填写快递配送详细地址！');
  }
  if (deliveryMode === 'pickup' && !pickupStoreId) {
    return alert('请选择就近自提的实体合作门店！');
  }
  if (cart.length === 0) {
    return alert('购物篮尚无好物！');
  }

  const pickupStoreObj = pickupStores.find((s) => String(s.id) === String(pickupStoreId));
  const finalAddressText =
    deliveryMode === 'pickup'
      ? `【门店自提】${pickupStoreObj ? `${pickupStoreObj.name} (${pickupStoreObj.address || ''})` : `门店ID:${pickupStoreId}`}`
      : addr;

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

    const effectiveRefStoreId = deliveryMode === 'pickup' ? pickupStoreId : refStoreParam;

    orderPayloads.push({
      order_no: orderNo,
      tenant_id: tenantId,
      store_id: deliveryMode === 'pickup' && pickupStoreId ? parseInt(pickupStoreId) : null,
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
      note: `[线上代发] 收件人: ${name} (${phone}) 地址: ${finalAddressText} ${note ? `叮咛: ${note}` : ''} ${effectiveRefStoreId ? `[推客门店ID: ${effectiveRefStoreId}]` : ''}`,
      driver_action_instruction:
        deliveryMode === 'pickup'
          ? `【网销门店自提单】随车捎带至 ${pickupStoreObj?.name || '指定门店'}，客户 ${name} (${phone}) 到店自提`
          : `【网销一件代发】由库管打单发快递。收件人: ${name} ${phone}`
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
        `• 实付总额: ¥${grandTotal.toFixed(2)}\n` +
        `• 履约方式: ${deliveryMode === 'pickup' ? `送至 ${pickupStoreObj?.name} 自提` : '厂家直发快递包邮'}`
    );
    window.clearCart();
    window.closeModal('modal-checkout');
  }
};

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

  listEl.innerHTML = '<div class="py-8 text-center text-stone-400">正在检索您的 B2C 订单与 C2B 需求...</div>';
  const { orders, demands } = await MallService.queryOrdersByPhone(phone);

  if (orders.length === 0 && demands.length === 0) {
    listEl.innerHTML = '<div class="py-8 text-center text-stone-400">未查询到该手机号关联的订单或求购需求。</div>';
    return;
  }

  let html = '';

  if (demands.length > 0) {
    html += `<div class="text-[11px] font-bold text-amber-900 pt-1">📢 我发布的 C2B 求购/定制需求 (${demands.length})：</div>`;
    html += demands
      .map((d) => {
        const info = parseDemandPayload(d.content);
        return `
          <div class="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1">
            <div class="flex justify-between items-center">
              <b class="text-stone-900">${info.title} (${info.qty})</b>
              <span class="text-[10px] bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full font-bold">🔥 ${info.coBuyers || 1} 人凑单</span>
            </div>
            ${
              d.official_reply
                ? `<div class="text-[11px] text-emerald-900 bg-white p-2 rounded-xl border border-emerald-200"><b>🏭 厂方报价回复：</b>${d.official_reply}</div>`
                : `<div class="text-[10px] text-stone-500">⏳ 正在等待对应行当工坊接单报价...</div>`
            }
          </div>
        `;
      })
      .join('');
  }

  if (orders.length > 0) {
    html += `<div class="text-[11px] font-bold text-emerald-950 pt-2">📦 我的 B2C 现货订单 (${orders.length})：</div>`;
    html += orders
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
            <div class="text-[10px] text-stone-500">${o.note || ''}</div>
            <div class="flex justify-between text-[10px] text-stone-400 font-mono pt-1 border-t border-stone-200/60">
              <span>${new Date(o.created_at).toLocaleString()}</span>
              <b class="text-emerald-900">实付 ¥${parseFloat(o.total_amount || 0).toFixed(2)}</b>
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
  navigator.clipboard.writeText(link).then(() => alert('专属分润推客链接已复制到剪贴簿！'));
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
  renderCategoryChips();
  renderBrandShowcaseAndFilter();

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
