import { supabase } from './lib/supabase.js';
import { StoreService } from './services/storeService.js';
import { ShopTypeManager } from './modules/shopTypeManager.js';
import { SETTLEMENT_CONFIG } from './constants/settlement.js';
import {
  storeState,
  MY_AGENTS_KEY,
  STORE_CUSTOM_NOTES_KEY,
  syncAgentsFromCloud,
  safeSetText,
  getShopIcon,
  getShopDynamicNotes,
  detectShopType,
  getStorePriceInfo,
  loadAgentCart
} from './modules/store/storeState.js';
import {
  updateCartSummary,
  checkVendorProposalBadge,
  initCartSlipBindings
} from './modules/store/storeCartSlipModule.js';
import {
  renderPendingCollectionBanner,
  initPoolPlanBindings
} from './modules/store/storePoolPlanModule.js';

window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

window.closeAllMenus = () => {
  document.getElementById('agent-switcher-menu')?.classList.add('hidden');
  document.getElementById('more-actions-menu')?.classList.add('hidden');
};

window.toggleAgentMenu = (e) => {
  e.stopPropagation();
  document.getElementById('more-actions-menu')?.classList.add('hidden');
  document.getElementById('agent-switcher-menu')?.classList.toggle('hidden');
};

window.toggleMoreActionsMenu = (e) => {
  e.stopPropagation();
  document.getElementById('agent-switcher-menu')?.classList.add('hidden');
  document.getElementById('more-actions-menu')?.classList.toggle('hidden');
};

function renderAgentNavTabs() {
  const nav = document.getElementById('agent-nav-tabs');
  if (!nav) return;

  if (storeState.myAgents.length === 0) {
    nav.innerHTML = `
      <a href="suppliers.html" class="shrink-0 px-3 py-1 rounded-full text-[11px] bg-amber-300 text-stone-950 font-bold shadow">
        + 前往百业供需名录接入供货合作社/工坊
      </a>
    `;
    return;
  }

  nav.innerHTML = storeState.myAgents
    .map((ag) => {
      const isCur = ag.id === storeState.currentAgent;
      const shortName = ag.name.split('(')[0].trim();
      return `
        <button type="button" onclick="window.switchAgent('${ag.id}')" class="shrink-0 px-3 py-1 rounded-full text-[11px] transition flex items-center gap-1 ${
        isCur
          ? 'bg-amber-300 text-stone-950 font-bold shadow'
          : 'bg-white/10 text-emerald-100 hover:bg-white/20 border border-white/10'
      }">
          <span>${isCur ? '●' : '○'}</span>
          <span>${shortName}</span>
        </button>
      `;
    })
    .join('');
}

function renderAgentSwitcherMenu() {
  const listEl = document.getElementById('agent-menu-list');
  if (!listEl) return;

  if (storeState.myAgents.length === 0) {
    listEl.innerHTML = '<div class="py-3 text-center text-stone-400 text-[11px]">名册暂无供货方，请在下方输入商号代号接入或逛供需名录。</div>';
    return;
  }

  listEl.innerHTML = storeState.myAgents
    .map((ag) => {
      const isCur = ag.id === storeState.currentAgent;
      return `
        <div class="flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition ${
          isCur ? 'bg-emerald-50 text-emerald-950 font-bold border border-emerald-200' : 'hover:bg-stone-50 text-stone-700'
        }">
          <button type="button" onclick="window.switchAgent('${ag.id}'); window.closeAllMenus();" class="flex-1 text-left flex items-center gap-1.5">
            <span>${isCur ? '✅' : '🏛️'}</span>
            <span>${ag.name}</span>
          </button>
          ${
            storeState.myAgents.length > 1
              ? `<button type="button" onclick="window.removeAgentFromList('${ag.id}', event)" class="text-[10px] text-stone-400 hover:text-rose-600 px-1.5" title="解绑该供货方">解绑</button>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

function renderShopTypeList() {
  const container = document.getElementById('shop-type-list');
  if (!container) return;
  const presetKeys = typeof ShopTypeManager.getAllPresetKeys === 'function' ? ShopTypeManager.getAllPresetKeys() : [];
  const allTypes = Array.from(new Set([...presetKeys, '社区便利', '餐饮酒店', '工料五金', '农资农具', '医药康养', '烘焙茶饮']));

  container.innerHTML = allTypes
    .map((t) => {
      const isCur = t === storeState.shopType;
      return `
        <button type="button" onclick="window.selectShopType('${t}')" class="p-3 rounded-2xl border text-left transition flex items-center gap-2 ${
        isCur ? 'bg-[#1b4332] text-white border-[#1b4332] font-bold shadow' : 'bg-stone-50 hover:bg-emerald-50/60 text-stone-800 border-stone-200'
      }">
          <span class="text-lg">${getShopIcon(t)}</span>
          <span class="text-xs font-bold">${t}</span>
        </button>
      `;
    })
    .join('');
}

function renderProducts() {
  const container = document.getElementById('product-list');
  if (!container) return;

  let filtered = storeState.allProducts;
  if (storeState.currentCategory !== '全部') {
    filtered = filtered.filter((p) => (p.category_main || '常规良品') === storeState.currentCategory);
  }
  if (storeState.currentTagFilter !== '全部') {
    filtered = filtered.filter((p) => Array.isArray(p.tags) && p.tags.includes(storeState.currentTagFilter));
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="py-12 text-center text-stone-400 text-xs">当前筛选项下暂无在供货品，可切换顶部供货方或清空筛选。</div>';
    return;
  }

  container.innerHTML = filtered
    .map((p) => {
      window.initProdItemState(p.id);
      const itemCart = storeState.cart[p.id];
      const { price, badge, itemNote } = getStorePriceInfo(p);
      const unit = p.measure_unit || p.pack_unit || '箱';
      const stock = p.stock ?? 0;
      const tags = Array.isArray(p.tags) ? p.tags : [];

      return `
        <div class="bg-white rounded-3xl p-3.5 border border-stone-200/80 shadow-2xs space-y-2.5">
          <div class="flex gap-3">
            <div class="w-16 h-16 rounded-2xl bg-stone-100 border border-stone-200/70 overflow-hidden shrink-0 flex items-center justify-center">
              ${p.image_url ? `<img src="${p.image_url}" class="w-full h-full object-cover">` : `<span class="text-[10px] text-stone-400">良品封装</span>`}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex justify-between items-start gap-1">
                <b class="text-sm text-stone-900 font-bold truncate">${p.name}</b>
                <span class="text-[10px] font-mono px-1.5 py-0.2 rounded shrink-0 ${stock <= 10 ? 'bg-rose-50 text-rose-700 font-bold' : 'bg-stone-100 text-stone-500'}">
                  余 ${stock}${unit}
                </span>
              </div>
              <div class="text-[11px] text-stone-400 font-mono mt-0.5">
                ${p.spec || '整装'} · ${p.origin_place || '源头直供'}
              </div>
              ${
                tags.length > 0 || badge || itemNote
                  ? `<div class="flex flex-wrap gap-1 mt-1">
                      ${badge ? `<span class="bg-indigo-50 text-indigo-800 border border-indigo-200 text-[9px] font-bold px-1.5 rounded">${badge}</span>` : ''}
                      ${itemNote ? `<span class="bg-amber-100 text-amber-950 border border-amber-300 text-[9px] font-bold px-1.5 rounded">📝 ${itemNote}</span>` : ''}
                      ${tags.slice(0, 2).map((t) => `<span class="bg-emerald-50 text-emerald-900 border border-emerald-200 text-[9px] px-1.5 rounded">${t}</span>`).join('')}
                    </div>`
                  : ''
              }
            </div>
          </div>

          <div class="pt-2 border-t border-stone-100 flex justify-between items-center gap-2">
            <div>
              <span class="text-[10px] text-stone-400 block">门店专属工价</span>
              <b class="text-base font-mono font-bold text-emerald-950">¥${price.toFixed(2)}<span class="text-[10px] font-normal text-stone-400">/${unit}</span></b>
            </div>

            <div class="flex items-center gap-1.5">
              <button type="button" onclick="window.openFlyerModal(${p.id})" class="px-2 py-1 rounded-xl text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100" title="生成街坊微信群推荐海报">
                📣 街坊海报
              </button>
              ${
                storeState.allowStoreSelfReturn
                  ? `
                <button type="button" onclick="window.openReturnDrawer(${p.id})" class="px-2 py-1 rounded-xl text-[10px] font-bold border transition ${
                      itemCart.return > 0 ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50/70 text-rose-700 border-rose-200 hover:bg-rose-100'
                    }">
                  ${itemCart.return > 0 ? `退 ${itemCart.return}` : '验退'}
                </button>
                <button type="button" onclick="window.openExchangeDrawer(${p.id})" class="px-2 py-1 rounded-xl text-[10px] font-bold border transition ${
                      itemCart.exchange > 0 ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50/70 text-amber-800 border-amber-200 hover:bg-amber-100'
                    }">
                  ${itemCart.exchange > 0 ? `换 ${itemCart.exchange}` : '对调'}
                </button>
              `
                  : ''
              }
              <div class="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200">
                <button type="button" onclick="window.changeOrderQty(${p.id}, -1)" class="w-6 h-6 rounded-lg bg-white text-stone-800 font-bold shadow-2xs active:scale-90">-</button>
                <span id="qty-order-${p.id}" class="w-6 text-center font-mono font-bold text-xs text-stone-900">${itemCart.order || 0}</span>
                <button type="button" onclick="window.changeOrderQty(${p.id}, 1)" class="w-6 h-6 rounded-lg bg-[#1b4332] text-white font-bold shadow-2xs active:scale-90">+</button>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderCategoriesAndTags() {
  const catBar = document.getElementById('category-tabs');
  if (catBar) {
    const cats = ['全部', ...Array.from(new Set(storeState.allProducts.map((p) => p.category_main || '常规良品')))];
    catBar.innerHTML = cats
      .map(
        (c) => `
        <button type="button" onclick="window.selectCategory('${c}')" class="shrink-0 px-3 py-1 rounded-xl text-[11px] font-bold transition ${
          storeState.currentCategory === c ? 'bg-[#1b4332] text-white shadow-2xs' : 'bg-white text-stone-600 border border-stone-200'
        }">${c}</button>
      `
      )
      .join('');
  }

  const tagBar = document.getElementById('tag-filter-bar');
  if (tagBar) {
    const tagSet = new Set(['全部']);
    storeState.allProducts.forEach((p) => (Array.isArray(p.tags) ? p.tags : []).forEach((t) => tagSet.add(t)));
    if (tagSet.size > 1) {
      tagBar.classList.remove('hidden');
      tagBar.innerHTML = Array.from(tagSet)
        .map(
          (t) => `
          <button type="button" onclick="window.selectTagFilter('${t}')" class="shrink-0 px-2.5 py-0.5 rounded-lg text-[10px] transition ${
            storeState.currentTagFilter === t ? 'bg-amber-400 text-stone-950 font-bold' : 'bg-stone-100 text-stone-600'
          }">${t}</button>
        `
        )
        .join('');
    } else {
      tagBar.classList.add('hidden');
    }
  }
}

function renderSettlementSelector() {
  const box = document.getElementById('settlement-selector-bar');
  if (!box) return;
  const allowed =
    storeState.currentStore && Array.isArray(storeState.currentStore.allowed_settlements)
      ? storeState.currentStore.allowed_settlements
      : ['cash', 'credit'];

  if (!allowed.includes(storeState.currentSettlementType)) {
    storeState.currentSettlementType = allowed[0] || 'cash';
  }

  box.innerHTML = Object.entries(SETTLEMENT_CONFIG)
    .filter(([key]) => allowed.includes(key))
    .map(([key, val]) => {
      const isCur = key === storeState.currentSettlementType;
      return `
        <button type="button" onclick="window.selectSettlementType('${key}')" class="flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold border transition ${
        isCur ? 'bg-[#1b4332] text-white border-[#1b4332] shadow-2xs' : 'bg-white text-stone-700 border-stone-200'
      }">
          ${val.label}
        </button>
      `;
    })
    .join('');
}

function renderDynamicNotes() {
  const listEl = document.getElementById('dynamic-notes-list');
  if (!listEl) return;
  const presets = getShopDynamicNotes(storeState.shopType);
  const allNotes = Array.from(new Set([...storeState.myCustomNotes, ...presets]));

  listEl.innerHTML = allNotes
    .map((txt) => {
      const isCustom = storeState.myCustomNotes.includes(txt);
      const safeTxt = txt.replace(/'/g, "\\'");
      return `
        <div onclick="window.appendVoiceNote('${safeTxt}')" class="cursor-pointer w-full text-left p-2.5 rounded-xl bg-stone-50 hover:bg-emerald-50 border border-stone-200 text-xs text-stone-800 transition flex justify-between items-center gap-2">
          <span>💬 ${txt}</span>
          <div class="flex items-center gap-2 shrink-0">
            ${
              isCustom
                ? `<button type="button" onclick="window.removeCustomQuickNote('${safeTxt}', event)" class="text-[10px] text-rose-500 hover:underline">删</button>`
                : ''
            }
            <span class="text-[10px] text-emerald-800 font-bold">+ 填入</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderFlyerPreview() {
  const prod = storeState.currentFlyerProd;
  if (!prod) return;
  const storeName = storeState.currentStore?.name || '厚德便民门店';
  const curAgObj = storeState.myAgents.find((a) => a.id === storeState.currentAgent);
  const agentName = curAgObj?.name || storeState.currentAgent;
  const { price } = getStorePriceInfo(prod);
  const retailRef = prod.tier_2_price ? parseFloat(prod.tier_2_price).toFixed(2) : (price * 1.15).toFixed(2);
  const unit = prod.measure_unit || prod.pack_unit || '件';

  const styleBadges = {
    neighborhood: '🏡 邻里街坊诚意推荐 · 源头直供好物',
    fresh: '🌾 产区新鲜直达 · 实名保真溯源',
    group: '🤝 邻里凑单拼团 · 到店自提更划算'
  };

  safeSetText('flyer-style-badge', styleBadges[storeState.currentFlyerStyle] || styleBadges.neighborhood);
  safeSetText('flyer-store-name', storeName);
  safeSetText('flyer-prod-name', prod.name);
  safeSetText('flyer-prod-spec', `${prod.spec || '整装'} · ${prod.origin_place || agentName}`);
  safeSetText('flyer-prod-price', `¥${retailRef}/${unit}`);

  const imgBox = document.getElementById('flyer-prod-img');
  if (imgBox) {
    imgBox.innerHTML = prod.image_url
      ? `<img src="${prod.image_url}" class="w-full h-full object-cover">`
      : '<span class="text-xs text-stone-400">源头良品实拍</span>';
  }

  const refParam = storeState.currentStore?.id ? `&ref=${encodeURIComponent(storeState.currentStore.id)}` : '';
  const mallUrl = `${window.location.origin}/mall.html?t=${encodeURIComponent(storeState.currentAgent)}${refParam}`;
  const qrImg = document.getElementById('flyer-qr-img');
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(mallUrl)}`;
  }
}

async function loadTerminalData() {
  renderAgentNavTabs();
  renderAgentSwitcherMenu();

  if (!storeState.currentAgent) {
    safeSetText('store-title', '尚未接入供货合作方');
    safeSetText('current-agent-name', '点击前往名录或输入代号接入');
    safeSetText('debt-val', '0.00');
    safeSetText('basket-val', '0');
    storeState.allProducts = [];
    renderProducts();
    updateCartSummary();
    return;
  }

  const curAgObj = storeState.myAgents.find((a) => a.id === storeState.currentAgent);
  safeSetText('current-agent-name', curAgObj ? curAgObj.name : storeState.currentAgent);

  const [tenantRes, storeData, productsData] = await Promise.all([
    supabase
      .from('platform_tenant')
      .select('tenant_id, company_name, custom_settings, sponsor_org, is_active, membership_status')
      .eq('tenant_id', storeState.currentAgent)
      .maybeSingle(),
    StoreService.getActiveStore(storeState.currentAgent),
    StoreService.getProductsByAgent(storeState.currentAgent)
  ]);

  const tenant = tenantRes.data || {};
  storeState.currentTenantSettings = tenant.custom_settings && typeof tenant.custom_settings === 'object' ? tenant.custom_settings : {};
  storeState.currentTenantSponsorOrg = (tenant.sponsor_org || '').trim();
  storeState.allowStoreSelfReturn = storeState.currentTenantSettings.allowStoreReturn !== false;

  const pauseBar = document.getElementById('store-seasonal-pause-banner');
  const sp = storeState.currentTenantSettings.seasonalPause;
  if (pauseBar) {
    if (sp && sp.isPaused) {
      pauseBar.classList.remove('hidden');
      pauseBar.innerText = `🍵 当前供货方处于【农忙/盘点暂歇】状态：${sp.reason || '集中采收加工中'}${sp.resumeDate ? `（预计 ${sp.resumeDate} 恢复接单）` : ''}`;
    } else if (storeState.currentTenantSponsorOrg) {
      pauseBar.classList.remove('hidden');
      pauseBar.innerText = `🛡️ 品质联保背书：本供货主体由【${storeState.currentTenantSponsorOrg}】联合担保直供`;
    } else {
      pauseBar.classList.add('hidden');
    }
  }

  storeState.currentStore = storeData;
  if (storeData) {
    safeSetText('store-title', storeData.name || '厚德便民门店');
    safeSetText('debt-val', parseFloat(storeData.current_debt || 0).toFixed(2));
    safeSetText('basket-val', storeData.carrier_hold_count || storeData.basket_count || 0);
    if (storeData.default_settlement) {
      storeState.currentSettlementType = storeData.default_settlement;
    }
    if (!localStorage.getItem('active_shop_type') && storeData.name) {
      storeState.shopType = detectShopType(storeData.name);
    }

    const { data: pendingLogs } = await supabase
      .from('driver_collection_log')
      .select('*')
      .eq('store_id', storeData.id)
      .eq('tenant_id', storeState.currentAgent)
      .eq('settled_to_hq', false);
    storeState.pendingAuditCollections = pendingLogs || [];
    renderPendingCollectionBanner();
  } else {
    safeSetText('store-title', '厚德便民门店 (未建档)');
    safeSetText('debt-val', '0.00');
    safeSetText('basket-val', '0');
  }

  safeSetText('shop-type-label', storeState.shopType);
  safeSetText('shop-type-icon', getShopIcon(storeState.shopType));

  const visibleIds = Array.isArray(storeData?.visible_product_ids) ? storeData.visible_product_ids : null;
  storeState.allProducts = visibleIds
    ? (productsData || []).filter((p) => visibleIds.includes(p.id))
    : productsData || [];

  loadAgentCart();
  renderCategoriesAndTags();
  renderSettlementSelector();
  renderProducts();
  updateCartSummary();
  await checkVendorProposalBadge();
}

// 全局窗口交互函数绑定
window.switchAgent = async function (agentId) {
  storeState.currentAgent = agentId;
  storeState.currentCategory = '全部';
  storeState.currentTagFilter = '全部';
  localStorage.setItem('active_agent', agentId);
  await loadTerminalData();
};

window.removeAgentFromList = async function (agentId, e) {
  e?.stopPropagation();
  if (!confirm('确认从当前名册解绑该供货方？')) return;
  storeState.myAgents = storeState.myAgents.filter((a) => a.id !== agentId);
  localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(storeState.myAgents));
  if (storeState.currentAgent === agentId) {
    storeState.currentAgent = storeState.myAgents[0]?.id || '';
    localStorage.setItem('active_agent', storeState.currentAgent);
  }
  await loadTerminalData();
};

window.bindByCode = async function () {
  const input = document.getElementById('input-agent-code');
  const rawCode = (input?.value || '').trim().toUpperCase();
  if (!rawCode) return alert('请输入供货合作社或工坊的商号代号！');

  if (storeState.myAgents.some((a) => a.id.toUpperCase() === rawCode)) {
    window.closeAllMenus();
    return window.switchAgent(rawCode);
  }

  const { data: tenant, error } = await supabase
    .from('platform_tenant')
    .select('tenant_id, company_name, is_active, membership_status')
    .eq('tenant_id', rawCode)
    .maybeSingle();

  if (error || !tenant) {
    return alert(`⚠️ 未在云端名录查找到商号代号【${rawCode}】，请核对代号或前往「百业供需名录」挑选！`);
  }
  if (!tenant.is_active || tenant.membership_status === 'paused') {
    return alert(`🚫 该商号【${tenant.company_name}】当前处于暂歇状态，暂不可接入。`);
  }

  storeState.myAgents.push({ id: tenant.tenant_id, name: tenant.company_name || tenant.tenant_id });
  localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(storeState.myAgents));
  if (input) input.value = '';
  window.closeAllMenus();
  alert(`✅ 已成功接入直供合作方：【${tenant.company_name}】！`);
  await window.switchAgent(tenant.tenant_id);
};

window.selectCategory = function (cat) {
  storeState.currentCategory = cat;
  renderCategoriesAndTags();
  renderProducts();
};

window.selectTagFilter = function (tag) {
  storeState.currentTagFilter = tag;
  renderCategoriesAndTags();
  renderProducts();
};

window.selectSettlementType = function (type) {
  storeState.currentSettlementType = type;
  renderSettlementSelector();
};

window.openShopTypeModal = function () {
  renderShopTypeList();
  window.openModal('shop-type-modal');
};

window.selectShopType = function (type) {
  storeState.shopType = type;
  localStorage.setItem('active_shop_type', type);
  safeSetText('shop-type-label', type);
  safeSetText('shop-type-icon', getShopIcon(type));
  window.closeModal('shop-type-modal');
  renderProducts();
  updateCartSummary();
};

window.openVoiceModal = function () {
  const input = document.getElementById('voice-note-input');
  if (input) input.value = storeState.deliveryNote || '';
  renderDynamicNotes();
  window.openModal('voice-modal');
};

window.appendVoiceNote = function (txt) {
  const input = document.getElementById('voice-note-input');
  if (!input) return;
  const cur = input.value.trim();
  input.value = cur ? `${cur}；${txt}` : txt;
};

window.saveCustomQuickNote = function () {
  const input = document.getElementById('voice-note-input');
  const val = (input?.value || '').trim();
  if (!val) return alert('请先在上方输入框写下常用口信！');
  if (!storeState.myCustomNotes.includes(val)) {
    storeState.myCustomNotes.unshift(val);
    localStorage.setItem(STORE_CUSTOM_NOTES_KEY, JSON.stringify(storeState.myCustomNotes.slice(0, 15)));
    renderDynamicNotes();
  }
  alert('⭐ 已存为本店常用口信，下次可直接一键点选！');
};

window.removeCustomQuickNote = function (txt, e) {
  e?.stopPropagation();
  storeState.myCustomNotes = storeState.myCustomNotes.filter((n) => n !== txt);
  localStorage.setItem(STORE_CUSTOM_NOTES_KEY, JSON.stringify(storeState.myCustomNotes));
  renderDynamicNotes();
};

window.saveVoiceNote = function () {
  const val = (document.getElementById('voice-note-input')?.value || '').trim();
  storeState.deliveryNote = val;
  const preview = document.getElementById('voice-preview-bar');
  if (preview) {
    if (val) {
      preview.classList.remove('hidden');
      safeSetText('voice-text', val);
    } else {
      preview.classList.add('hidden');
    }
  }
  window.closeModal('voice-modal');
};

window.openFlyerModal = function (prodId) {
  const prod = storeState.allProducts.find((p) => Number(p.id) === Number(prodId));
  if (!prod) return;
  storeState.currentFlyerProd = prod;
  storeState.currentFlyerStyle = 'neighborhood';
  renderFlyerPreview();
  window.openModal('flyer-modal');
};

window.switchFlyerStyle = function (style) {
  storeState.currentFlyerStyle = style;
  ['neighborhood', 'fresh', 'group'].forEach((s) => {
    const btn = document.getElementById(`flyer-style-${s}`);
    if (btn) {
      btn.className =
        s === style
          ? 'flex-1 py-1.5 rounded-xl bg-[#1b4332] text-white font-bold text-xs transition'
          : 'flex-1 py-1.5 rounded-xl bg-stone-100 text-stone-600 font-bold text-xs transition';
    }
  });
  renderFlyerPreview();
};

window.copyFlyerText = function () {
  const prod = storeState.currentFlyerProd;
  if (!prod) return;
  const storeName = storeState.currentStore?.name || '厚德便民门店';
  const { price } = getStorePriceInfo(prod);
  const retailRef = prod.tier_2_price ? parseFloat(prod.tier_2_price).toFixed(2) : (price * 1.15).toFixed(2);
  const unit = prod.measure_unit || prod.pack_unit || '件';
  const refParam = storeState.currentStore?.id ? `&ref=${encodeURIComponent(storeState.currentStore.id)}` : '';
  const mallUrl = `${window.location.origin}/mall.html?t=${encodeURIComponent(storeState.currentAgent)}${refParam}`;

  const text =
    `【${storeName} · 街坊好物推荐】\n` +
    `推荐良品：${prod.name}（${prod.spec || '整装'}）\n` +
    `阳光平准价：¥${retailRef}/${unit}\n` +
    `源头合作社/工坊直供，扫码预订送到本店自提验货：${mallUrl}`;

  navigator.clipboard.writeText(text).then(() => {
    alert('✅ 街坊推广文案与专属链接已复制，可直接转发微信邻里群！');
  });
};

async function initTerminal() {
  document.addEventListener('click', window.closeAllMenus);

  initCartSlipBindings({
    onRenderProducts: renderProducts,
    onReloadTerminal: loadTerminalData
  });
  initPoolPlanBindings();

  await syncAgentsFromCloud();
  await loadTerminalData();
}

initTerminal();
