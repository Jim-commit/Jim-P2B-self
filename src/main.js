import { supabase } from './lib/supabase.js';
import { StoreService } from './services/storeService.js';
import { ShopTypeManager } from './modules/shopTypeManager.js';
import { MarketingCanvas } from './modules/marketingCanvas.js';

// ==========================================
// 1. 多总代名册管理与独立隔离购物车
// ==========================================
const MY_AGENTS_KEY = 'b2b_my_agents_list';
const DEFAULT_AGENTS = [
  { id: 'BJ_SHUNDA', name: '北京顺达 (粮油日化)' },
  { id: 'SH_LEGOU', name: '上海乐购 (酒水副食)' }
];

let myAgents = [];
try {
  myAgents = JSON.parse(localStorage.getItem(MY_AGENTS_KEY)) || DEFAULT_AGENTS;
} catch (e) {
  myAgents = DEFAULT_AGENTS;
}

let currentAgent = localStorage.getItem('active_agent') || myAgents[0].id;
let currentStore = null;
let shopType = localStorage.getItem('active_shop_type') || '社区超市';
let allProducts = [];
let currentCategory = '全部';
let currentTagFilter = '全部';

// 购物车按每个总代独立隔离
let cart = {};

function loadAgentCart() {
  const CART_KEY = `b2b_cart_${currentAgent}`;
  try {
    cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
  } catch (e) {
    cart = {};
  }
}

function saveAgentCart() {
  const CART_KEY = `b2b_cart_${currentAgent}`;
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

let deliveryNote = '';
let currentFlyerProd = null;
let currentFlyerStyle = 'neighborhood';

// 安全更新 DOM 辅助函数
function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

// ==========================================
// 2. 顶栏 ☰ / ··· 及店型下拉菜单控制器
// ==========================================
window.toggleLeftNavMenu = function (e) {
  e.stopPropagation();
  document.getElementById('right-nav-menu')?.classList.add('hidden');
  document.getElementById('shop-type-dropdown')?.classList.add('hidden');
  document.getElementById('left-nav-menu')?.classList.toggle('hidden');
};

window.toggleRightNavMenu = function (e) {
  e.stopPropagation();
  document.getElementById('left-nav-menu')?.classList.add('hidden');
  document.getElementById('shop-type-dropdown')?.classList.add('hidden');
  
  // 动态更新右侧菜单头部的当前供货商名称
  const curObj = myAgents.find(a => a.id === currentAgent);
  safeSetText('menu-current-agent-tag', curObj ? (curObj.name || curObj.id) : currentAgent);
  
  document.getElementById('right-nav-menu')?.classList.toggle('hidden');
};

window.toggleShopTypeDropdown = function (e) {
  e.stopPropagation();
  document.getElementById('left-nav-menu')?.classList.add('hidden');
  document.getElementById('right-nav-menu')?.classList.add('hidden');
  document.getElementById('shop-type-dropdown')?.classList.toggle('hidden');
};

window.closeAllMenus = function () {
  document.getElementById('left-nav-menu')?.classList.add('hidden');
  document.getElementById('right-nav-menu')?.classList.add('hidden');
  document.getElementById('shop-type-dropdown')?.classList.add('hidden');
};

document.addEventListener('click', () => {
  window.closeAllMenus();
});

window.openModal = id => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = id => document.getElementById(id)?.classList.add('hidden');

// ==========================================
// 3. 多总代平滑切换与动态标签渲染
// ==========================================
window.switchActiveAgent = async function (agentId) {
  currentAgent = agentId;
  localStorage.setItem('active_agent', currentAgent);
  loadAgentCart();
  window.closeAllMenus();
  await initTerminal();
};

function renderAgentSelector() {
  const box = document.getElementById('agents-nav-chips');
  if (!box) return;
  box.innerHTML = myAgents.map(ag => {
    const isCur = ag.id === currentAgent;
    return `
      <button type="button" onclick="window.switchActiveAgent('${ag.id}')" class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap transition active:scale-95 ${
        isCur 
          ? 'bg-amber-400 text-stone-900 border-amber-300 shadow-sm' 
          : 'bg-emerald-950/70 text-emerald-200 border-emerald-700/50 hover:bg-emerald-900'
      }">
        ${ag.name || ag.id} ${isCur ? '●' : ''}
      </button>
    `;
  }).join('') + `
    <button type="button" onclick="window.openModal('bind-agent-modal')" class="px-2 py-0.5 rounded-full text-[10px] text-emerald-300 border border-dashed border-emerald-500/50 hover:bg-emerald-900 whitespace-nowrap active:scale-95">
      + 绑新总代
    </button>
  `;
}

// ==========================================
// 4. 总代接入与二次确认解绑（防误操作）
// ==========================================
window.bindByCode = async function () {
  const code = document.getElementById('bind-input-code')?.value.trim();
  let targetAgentId = '';
  let targetAgentName = '';

  if (code === '888001') {
    targetAgentId = 'BJ_SHUNDA'; targetAgentName = '北京顺达 (粮油日化)';
  } else if (code === '888002') {
    targetAgentId = 'SH_LEGOU'; targetAgentName = '上海乐购 (酒水副食)';
  } else {
    const { data } = await supabase.from('platform_tenant').select('*').eq('invite_code', code).limit(1);
    if (data && data.length > 0) {
      targetAgentId = data[0].tenant_id;
      targetAgentName = data[0].company_name;
    } else {
      return alert('未查询到该认领码对应的供货总代！');
    }
  }

  if (!myAgents.some(a => a.id === targetAgentId)) {
    myAgents.push({ id: targetAgentId, name: targetAgentName });
    localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(myAgents));
  }

  alert(`🎉 成功接入新供货商【${targetAgentName}】！`);
  window.closeModal('bind-agent-modal');
  await window.switchActiveAgent(targetAgentId);
};

window.bindByPhone = async () => {
  const phone = document.getElementById('bind-input-phone')?.value.trim();
  if (!phone || phone.length < 11) return alert('请输入有效的 11 位手机号！');
  const store = await StoreService.bindByPhone(phone);
  if (store) {
    const targetAgentId = store.tenant_id || 'BJ_SHUNDA';
    if (!myAgents.some(a => a.id === targetAgentId)) {
      myAgents.push({ id: targetAgentId, name: `${store.name}供货总代` });
      localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(myAgents));
    }
    alert(`🎉 认领成功！欢迎【${store.name}】掌柜！`);
    window.closeModal('bind-agent-modal');
    await window.switchActiveAgent(targetAgentId);
  } else {
    alert('未在总代名册中查到该手机号，请联系师傅建档。');
  }
};

// 解绑当前供货商（二次安全确认）
window.confirmUnbindCurrentAgent = function () {
  if (myAgents.length <= 1) {
    return alert('⚠️ 至少需要保留一个供货商，无法解绑全部供货商！');
  }

  const curObj = myAgents.find(a => a.id === currentAgent);
  const curName = curObj ? curObj.name : currentAgent;

  const tip = `【安全确认】您确定要解绑供货商「${curName}」吗？\n\n` +
              `• 解绑后将从顶栏移除其快捷进货通道\n` +
              `• 当前供货商的待订购物车将被清理\n` +
              `• 后续如需恢复，需重新输入认领码接入`;

  if (confirm(tip)) {
    // 1. 清理本地购物车缓存
    localStorage.removeItem(`b2b_cart_${currentAgent}`);
    
    // 2. 从名册中移除
    myAgents = myAgents.filter(a => a.id !== currentAgent);
    localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(myAgents));

    // 3. 自动切换到名册中的首个供货商
    const nextAgent = myAgents[0].id;
    alert(`✅ 已成功解绑「${curName}」，已为您切换到下一家供货商！`);
    window.switchActiveAgent(nextAgent);
  }
};

// ==========================================
// 5. 右上角高频实用功能：一键重填常订品 & 清空购物车
// ==========================================
window.repeatLastOrder = async function () {
  if (!currentStore) return alert('当前供货商未绑定有效门店！');

  const myOrders = await StoreService.getMyOrders(currentStore.id, currentAgent);
  if (!myOrders || myOrders.length === 0) {
    return alert('当前供货商暂无历史报单记录，请先自选商品订购一次！');
  }

  const lastOrder = myOrders[0];
  const items = Array.isArray(lastOrder.items) ? lastOrder.items : [];
  if (items.length === 0) return alert('上一单无明细商品');

  let addedCount = 0;
  for (const it of items) {
    if (it.id && it.qty) {
      const prod = allProducts.find(p => p.id === it.id);
      const stock = prod?.stock ?? 999;
      cart[it.id] = Math.min(it.qty, stock);
      addedCount++;
    }
  }

  saveAgentCart();
  renderProductList();
  updateCartSummary();
  alert(`✅ 已为您一键重填【${myAgents.find(a => a.id === currentAgent)?.name || currentAgent}】上单的 ${addedCount} 样常订货品！`);
};

window.clearCurrentCart = function () {
  if (Object.keys(cart).length === 0) return alert('当前供货商的购物车已经是空的');
  const curName = myAgents.find(a => a.id === currentAgent)?.name || currentAgent;
  if (confirm(`确认清空【${curName}】的待订购物车？`)) {
    for (const k of Object.keys(cart)) delete cart[k];
    saveAgentCart();
    renderProductList();
    updateCartSummary();
  }
};

// ==========================================
// 6. 左侧 ☰ 纯营销快捷海报功能
// ==========================================
window.quickMakeNeighborhoodFlyer = () => {
  if (allProducts.length === 0) return alert('当前供货商暂无在售货品！');
  currentFlyerStyle = 'neighborhood';
  window.configureFlyer(allProducts[0].id);
};

window.quickMakeHonestFlyer = () => {
  if (allProducts.length === 0) return alert('当前供货商暂无在售货品！');
  currentFlyerStyle = 'honest';
  window.configureFlyer(allProducts[0].id);
};

window.openMarketingCenter = () => {
  if (allProducts.length === 0) return alert('当前供货商没有可做海报的在售货品！');
  window.configureFlyer(allProducts[0].id);
};

window.configureFlyer = (prodId) => {
  const prod = allProducts.find(x => x.id === prodId);
  if (!prod) return;
  currentFlyerProd = prod;
  if (!currentFlyerStyle) {
    currentFlyerStyle = (shopType === '餐饮饭店') ? 'honest' : 'neighborhood';
  }

  const defaultPrice = (ShopTypeManager.getEffectivePrice(prod, shopType) * 1.15).toFixed(1);
  const shopName = currentStore ? currentStore.name : '老主顾诚信店';

  const titleEl = document.getElementById('flyer-title-input');
  const tagEl = document.getElementById('flyer-tagline-input');
  const priceEl = document.getElementById('flyer-price-input');
  const noteEl = document.getElementById('flyer-note-input');
  const prodNameEl = document.getElementById('flyer-prod-name');

  if (titleEl) titleEl.value = `【${shopName}】正品现货特惠`;
  if (tagEl) tagEl.value = MarketingCanvas.styles[currentFlyerStyle].defaultTagline;
  if (priceEl) priceEl.value = defaultPrice;
  if (noteEl) noteEl.value = MarketingCanvas.styles[currentFlyerStyle].defaultNote;
  if (prodNameEl) prodNameEl.innerText = `${prod.name} (${prod.spec || '整装'})`;

  renderStyleChips();
  window.renderLiveFlyerPreview();
  window.openModal('marketing-modal');
};

window.setFlyerStyle = (styleKey) => {
  currentFlyerStyle = styleKey;
  const style = MarketingCanvas.styles[styleKey];
  if (style) {
    const tagEl = document.getElementById('flyer-tagline-input');
    const noteEl = document.getElementById('flyer-note-input');
    if (tagEl) tagEl.value = style.defaultTagline;
    if (noteEl) noteEl.value = style.defaultNote;
  }
  renderStyleChips();
  window.renderLiveFlyerPreview();
};

function renderStyleChips() {
  const container = document.getElementById('style-selector-box');
  if (!container) return;
  container.innerHTML = Object.entries(MarketingCanvas.styles).map(([key, item]) => `
    <button type="button" onclick="window.setFlyerStyle('${key}')" class="px-2.5 py-1 rounded-xl text-xs font-bold border transition ${currentFlyerStyle === key ? 'bg-emerald-800 text-white border-emerald-900 shadow' : 'bg-stone-100 text-stone-600 border-stone-200'}">
      ${item.name}
    </button>
  `).join('');
}

window.applyQuickNote = (type) => {
  const noteMap = {
    'daily': '💬 掌柜交心话：家里洗洁精、洗衣液、抽纸用得快，这批大厂直供大包装，量大抗用还便宜！',
    'general': '💬 掌柜承诺：老实人做老实买卖，不卖山寨假货！大家伙儿放心买、放心用！',
    'food': '💬 掌柜叮咛：正规大厂最新出厂批次，封条完好，自己家也天天用，品质绝对放心！'
  };
  if (noteMap[type]) {
    const el = document.getElementById('flyer-note-input');
    if (el) el.value = noteMap[type];
    window.renderLiveFlyerPreview();
  }
};

window.renderLiveFlyerPreview = async () => {
  if (!currentFlyerProd) return;
  const canvas = document.getElementById('hidden-canvas');
  if (!canvas) return;

  const title = document.getElementById('flyer-title-input')?.value || '';
  const tagline = document.getElementById('flyer-tagline-input')?.value || '';
  const price = parseFloat(document.getElementById('flyer-price-input')?.value || '0');
  const note = document.getElementById('flyer-note-input')?.value || '';
  const shopName = currentStore ? currentStore.name : '老主顾诚信店';

  const dataUrl = await MarketingCanvas.generate(canvas, currentFlyerProd, shopName, currentFlyerStyle, title, tagline, price, note);
  const previewImg = document.getElementById('flyer-preview-img');
  if (previewImg) previewImg.src = dataUrl;
};

// ==========================================
// 7. 店型管理与便签
// ==========================================
window.selectShopType = (type) => {
  shopType = type;
  localStorage.setItem('active_shop_type', shopType);
  renderShopType();
  renderDynamicNotes();
  renderProductList();
  updateCartSummary();
  document.getElementById('shop-type-dropdown')?.classList.add('hidden');
};

function renderShopType() {
  const el = document.getElementById('shop-type-badge');
  if (el) el.innerHTML = `<span>${ShopTypeManager.icons[shopType] || '🏪'} ${shopType}</span> ▾`;
}

function renderDynamicNotes() {
  const box = document.getElementById('dynamic-notes-box');
  if (!box) return;
  box.innerHTML = ShopTypeManager.getDynamicNotes(shopType).map(n => `
    <button type="button" onclick="window.appendDeliveryNote('${n}')" class="bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-0.5 rounded-lg whitespace-nowrap active:scale-95 transition">
      ${n}
    </button>
  `).join('');
}

window.appendDeliveryNote = (txt) => {
  deliveryNote = deliveryNote ? `${deliveryNote}；${txt}` : txt;
  alert(`已附加随车小纸条：「${deliveryNote}」`);
};

window.callDriver = () => {
  const driver = currentStore ? (currentStore.driver_name || '老张师傅') : '配送师傅';
  alert(`正在连线本单配送师傅【${driver}】...`);
  window.location.href = 'tel:13800138000';
};

window.openReturnModal = () => {
  window.closeModal('toolbox-modal');
  const nameEl = document.getElementById('return-prod-name');
  const qtyEl = document.getElementById('return-qty');
  const remarkEl = document.getElementById('return-remark');
  if (nameEl) nameEl.value = '';
  if (qtyEl) qtyEl.value = '1';
  if (remarkEl) remarkEl.value = '';
  window.openModal('return-modal');
};

window.submitReturnRequest = () => {
  const name = document.getElementById('return-prod-name')?.value.trim();
  const qty = parseInt(document.getElementById('return-qty')?.value) || 1;
  const reason = document.getElementById('return-reason')?.value || '外箱破损/漏液';
  const remark = document.getElementById('return-remark')?.value.trim();
  if (!name) return alert('请填写需要调换的商品全名！');

  const extra = remark ? `(${remark})` : '';
  const noteStr = `【调换货】${name} x ${qty}件 - ${reason}${extra}`;
  deliveryNote = deliveryNote ? `${deliveryNote}；${noteStr}` : noteStr;
  alert('已成功登记调换货！送货时师傅当面核减验退。');
  window.closeModal('return-modal');
};

// ==========================================
// 8. 商品货单展示与分类筛选
// ==========================================
function renderCategoryTabs() {
  const categories = ['全部', ...new Set(allProducts.map(p => p.category_main).filter(Boolean))];
  const bar = document.getElementById('category-bar');
  if (!bar) return;
  bar.innerHTML = categories.map(c => `
    <button type="button" onclick="window.filterCategory('${c}')" class="cat-pill ${c === currentCategory ? 'bg-[#064e3b] text-white shadow-sm' : 'bg-stone-100 text-stone-600'} px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition">
      ${c === '全部' ? '全部现货' : c}
    </button>
  `).join('');
}

window.filterCategory = (cat) => {
  currentCategory = cat;
  renderCategoryTabs();
  renderProductList();
};

window.filterBySpecialTag = (tag) => {
  currentTagFilter = tag;
  document.querySelectorAll('.tag-filter-chip').forEach(b => {
    b.className = (b.innerText === tag)
      ? 'tag-filter-chip bg-stone-800 text-white px-2.5 py-0.5 rounded-lg whitespace-nowrap font-bold shadow-sm'
      : 'tag-filter-chip bg-stone-100 text-stone-600 px-2.5 py-0.5 rounded-lg whitespace-nowrap';
  });
  renderProductList();
};

function renderProductList() {
  let filtered = (currentCategory === '全部') ? allProducts : allProducts.filter(p => p.category_main === currentCategory);
  if (currentTagFilter !== '全部') {
    filtered = filtered.filter(p => Array.isArray(p.tags) && p.tags.includes(currentTagFilter));
  }

  const container = document.getElementById('product-container');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="p-12 text-center text-stone-400 text-xs">当前供货商暂无符合条件的在供货品</div>';
    return;
  }

  container.innerHTML = filtered.map(p => {
    const imgHtml = p.image_url
      ? `<img src="${p.image_url}" class="w-16 h-16 rounded-2xl object-cover border border-stone-200 shadow-sm" onerror="this.src='';this.parentElement.innerHTML='<div class=\\'w-16 h-16 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-[10px] text-stone-400\\'>实物包</div>';">`
      : `<div class="w-16 h-16 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-[10px] text-stone-400">实物包</div>`;

    const tags = Array.isArray(p.tags) ? p.tags : [];
    const tagHtml = tags.map(t => `<span class="bg-amber-50 text-amber-900 border border-amber-200 text-[9px] px-1.5 py-0.2 rounded font-medium">${t}</span>`).join(' ');

    const price = ShopTypeManager.getEffectivePrice(p, shopType);
    const isTier2 = (price < p.tier_1_price);
    const stock = p.stock ?? 999;
    const isOutOfStock = stock <= 0;

    return `
      <div class="py-3.5 px-1 space-y-2 ${isOutOfStock ? 'opacity-50' : ''}">
        <div class="flex justify-between items-center gap-3">
          <div class="flex items-center gap-3">
            ${imgHtml}
            <div>
              <div class="font-bold text-xs text-stone-800">${p.name}</div>
              <div class="mt-0.5 space-x-1">${tagHtml}</div>
              <div class="text-[11px] text-stone-400 mt-0.5 font-mono">
                规格: ${p.spec || '整装'} · 库存: ${isOutOfStock ? '<span class="text-rose-600 font-bold">已售罄</span>' : `${stock}箱`}
              </div>
              <div class="text-xs font-bold text-emerald-800 mt-0.5 font-mono flex items-center gap-1">
                ¥${price.toFixed(2)} <span class="text-[10px] text-stone-400 font-normal">/${p.pack_unit || '箱'}</span>
                ${isTier2 ? `<span class="text-[9px] bg-rose-50 text-rose-700 border border-rose-200 px-1 rounded font-normal">大客价</span>` : ''}
              </div>
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <button type="button" onclick="window.changeQty(${p.id}, -1)" class="w-7 h-7 rounded-xl bg-stone-100 active:scale-95 font-bold text-stone-600 flex items-center justify-center text-sm shadow-sm">-</button>
            <span id="qty-${p.id}" class="w-6 text-center font-bold text-xs font-mono">${cart[p.id] || 0}</span>
            <button type="button" onclick="window.changeQty(${p.id}, 1)" ${isOutOfStock ? 'disabled' : ''} class="w-7 h-7 rounded-xl ${isOutOfStock ? 'bg-stone-200 text-stone-400' : 'bg-emerald-50 text-emerald-800 active:scale-95'} font-bold flex items-center justify-center text-sm shadow-sm">+</button>
          </div>
        </div>

        <div class="flex justify-end pt-0.5">
          <button type="button" onclick="window.configureFlyer(${p.id})" class="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-3 py-1 rounded-xl font-bold flex items-center gap-1 active:scale-95 transition">
            📲 自选风格做海报
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 9. 购物车加减与订货报单
// ==========================================
window.changeQty = (id, delta) => {
  const prod = allProducts.find(x => x.id === id);
  const stock = prod?.stock ?? 999;
  let newQty = (cart[id] || 0) + delta;

  if (newQty < 0) newQty = 0;
  if (newQty > stock) {
    alert(`在售库存仅剩 ${stock} 箱！`);
    newQty = stock;
  }

  if (newQty === 0) delete cart[id];
  else cart[id] = newQty;

  saveAgentCart();
  const el = document.getElementById(`qty-${id}`);
  if (el) el.innerText = newQty;
  updateCartSummary();
};

function updateCartSummary() {
  let totalAmount = 0, totalCount = 0;
  for (const [id, qty] of Object.entries(cart)) {
    if (qty > 0) {
      const prod = allProducts.find(x => x.id === parseInt(id));
      if (prod) {
        totalAmount += ShopTypeManager.getEffectivePrice(prod, shopType) * qty;
        totalCount += qty;
      }
    }
  }
  safeSetText('cart-total-amount', totalAmount.toFixed(2));
  safeSetText('cart-count-badge', totalCount);
}

window.submitB2BOrder = async () => {
  const amtEl = document.getElementById('cart-total-amount');
  const totalAmount = parseFloat(amtEl ? amtEl.innerText : '0');
  if (totalAmount <= 0) return alert('请先挑选进货件数！');

  const items = [];
  for (const [id, qty] of Object.entries(cart)) {
    if (qty > 0) {
      const p = allProducts.find(x => x.id === parseInt(id));
      if (p) items.push({ id: p.id, name: p.name, spec: p.spec, price: ShopTypeManager.getEffectivePrice(p, shopType), qty });
    }
  }

  const btn = document.getElementById('btn-submit-order');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '正在提交...';
  }

  try {
    if (currentStore) {
      await StoreService.submitOrder({
        tenantId: currentAgent,
        storeId: currentStore.id,
        storeName: currentStore.name,
        driverName: currentStore.driver_name,
        totalAmount,
        items,
        note: deliveryNote,
        currentDebt: currentStore.current_debt
      });
    }

    const curAgentObj = myAgents.find(a => a.id === currentAgent);
    alert(`🎉 【${curAgentObj?.name || currentAgent}】报单成功！合计 ¥${totalAmount.toFixed(2)}。已安排师傅装车！`);

    for (const k of Object.keys(cart)) delete cart[k];
    saveAgentCart();
    deliveryNote = '';
    await initTerminal();
  } catch (err) {
    alert(`报单失败: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>订货</span> <span id="cart-count-badge" class="bg-amber-400 text-stone-900 text-xs px-2 py-0.5 rounded-full font-mono font-bold">0</span>`;
    }
  }
};

// ==========================================
// 10. 当前总代单据与收条查验
// ==========================================
window.openReceiptsModal = async () => {
  if (!currentStore) return alert('当前供货商未绑定有效门店！');
  window.openModal('receipts-modal');

  const myOrders = await StoreService.getMyOrders(currentStore.id, currentAgent);
  const ordersListEl = document.getElementById('my-orders-list');
  if (ordersListEl) {
    ordersListEl.innerHTML = myOrders.map(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      const itemsText = items.map(it => `${it.name} x ${it.qty}箱`).join('、');
      return `
        <div class="p-2.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
          <div class="flex justify-between font-bold">
            <span>单号 #${o.id} · ¥${parseFloat(o.total_amount).toFixed(2)}</span>
            <span class="${o.delivery_status === 'delivered' ? 'text-emerald-700' : 'text-amber-700'}">
              ${o.delivery_status === 'delivered' ? '✅ 已送达平账' : '🚚 排单待送'}
            </span>
          </div>
          <div class="text-[10px] text-stone-600">📦 配货明细: ${itemsText || '整批进货'}</div>
          ${o.note ? `<div class="text-[10px] text-amber-800">💬 随车附言: ${o.note}</div>` : ''}
          <div class="text-[10px] text-stone-400">报单时间: ${new Date(o.created_at).toLocaleString()}</div>
        </div>
      `;
    }).join('') || '<div class="text-stone-400 text-center py-2">暂无该总代报单</div>';
  }

  const myReceipts = await StoreService.getMyReceipts(currentStore.id, currentAgent);
  const receiptsListEl = document.getElementById('my-receipts-list');
  if (receiptsListEl) {
    receiptsListEl.innerHTML = myReceipts.map(r => `
      <div class="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
        <div class="flex justify-between font-bold text-emerald-950">
          <span>经办随车人: ${r.driver_name}</span>
          <span>实交: ¥${parseFloat(r.amount).toFixed(2)} (${r.pay_method})</span>
        </div>
        ${r.basket_return ? `<div class="text-[10px] text-amber-800">退还空筐: ${r.basket_return} 个 (折抵货款 ¥${r.basket_deduct_amount})</div>` : ''}
        <div class="text-[10px] text-emerald-800">核销时间: ${new Date(r.created_at).toLocaleString()}</div>
      </div>
    `).join('') || '<div class="text-stone-400 text-center py-2">暂无该总代还款记录</div>';
  }
};

// ==========================================
// 11. 初始化入口
// ==========================================
async function initTerminal() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlAgent = urlParams.get('agent') || urlParams.get('tenant');
  if (urlAgent) {
    currentAgent = urlAgent;
    localStorage.setItem('active_agent', currentAgent);
  }

  loadAgentCart();
  renderAgentSelector();

  currentStore = await StoreService.getStoreByTenant(currentAgent);
  if (currentStore) {
    safeSetText('store-title', currentStore.name || '合作便民老店');
    safeSetText('store-boss', currentStore.contact || '掌柜');
    safeSetText('store-driver', currentStore.driver_name || '老张师傅');
    safeSetText('store-basket-count', `${currentStore.basket_count || 0} 个`);

    const limit = parseFloat(currentStore.credit_limit || 2000);
    const debt = parseFloat(currentStore.current_debt || 0);
    safeSetText('credit-avail', `¥${Math.max(0, limit - debt).toFixed(2)}`);
    safeSetText('credit-debt', `¥${debt.toFixed(2)}`);

    if (!localStorage.getItem('active_shop_type')) {
      shopType = ShopTypeManager.autoDetect(currentStore.name);
      localStorage.setItem('active_shop_type', shopType);
    }
  } else {
    safeSetText('store-driver', '待指派配送员');
    safeSetText('store-basket-count', '0 个');
    safeSetText('credit-avail', '¥2000.00');
    safeSetText('credit-debt', '¥0.00');
  }

  renderShopType();
  renderDynamicNotes();

  allProducts = await StoreService.getProducts(currentAgent, currentStore?.visible_product_ids);
  renderCategoryTabs();
  renderProductList();
  updateCartSummary();
}

initTerminal();
