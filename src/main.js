import { StoreService } from './services/storeService.js';
import { ShopTypeManager } from './modules/shopTypeManager.js';
import { MarketingCanvas } from './modules/marketingCanvas.js';

// 全局运行时状态
let currentAgent = localStorage.getItem('active_agent') || 'BJ_SHUNDA';
let currentStore = null;
let shopType = localStorage.getItem('active_shop_type') || '社区超市';
let allProducts = [];
let currentCategory = '全部';
let currentTagFilter = '全部';

// 本地购物车持久化缓存（断网/刷新不丢件）
const CART_KEY = `b2b_cart_${currentAgent}`;
let cart = {};
try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}'); } catch (e) { cart = {}; }

let deliveryNote = '';
let currentFlyerProd = null;
let currentFlyerStyle = 'neighborhood';

// ==========================================
// 1. 顶栏 ☰ 汉堡菜单与 ··· 更多菜单控制器
// ==========================================
window.toggleLeftNavMenu = function (e) {
  e.stopPropagation();
  const leftMenu = document.getElementById('left-nav-menu');
  const rightMenu = document.getElementById('right-nav-menu');
  if (rightMenu) rightMenu.classList.add('hidden');
  if (leftMenu) leftMenu.classList.toggle('hidden');
};

window.toggleRightNavMenu = function (e) {
  e.stopPropagation();
  const leftMenu = document.getElementById('left-nav-menu');
  const rightMenu = document.getElementById('right-nav-menu');
  if (leftMenu) leftMenu.classList.add('hidden');
  if (rightMenu) rightMenu.classList.toggle('hidden');
};

window.closeAllMenus = function () {
  document.getElementById('left-nav-menu')?.classList.add('hidden');
  document.getElementById('right-nav-menu')?.classList.add('hidden');
};

// 点击屏幕任意空白处自动收起下拉菜单
document.addEventListener('click', () => {
  window.closeAllMenus();
});

// 基础弹窗显示/隐藏
window.openModal = id => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = id => document.getElementById(id)?.classList.add('hidden');

// ==========================================
// 2. 店型管理与便签
// ==========================================
window.openShopTypeModal = () => window.openModal('shop-type-modal');

window.selectShopType = (type) => {
  shopType = type;
  localStorage.setItem('active_shop_type', shopType);
  renderShopType();
  renderDynamicNotes();
  renderProductList();
  updateCartSummary();
  window.closeModal('shop-type-modal');
};

function renderShopType() {
  const el = document.getElementById('shop-type-badge');
  if (el) el.innerHTML = `<span>${ShopTypeManager.icons[shopType] || '🏪'} ${shopType}</span> ▾`;
}

function renderDynamicNotes() {
  const box = document.getElementById('dynamic-notes-box');
  if (!box) return;
  box.innerHTML = ShopTypeManager.getDynamicNotes(shopType).map(n => `
    <button onclick="window.appendDeliveryNote('${n}')" class="bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-0.5 rounded-lg whitespace-nowrap active:scale-95 transition">
      ${n}
    </button>
  `).join('');
}

window.appendDeliveryNote = (txt) => {
  deliveryNote = deliveryNote ? `${deliveryNote}；${txt}` : txt;
  alert(`已附加随车小纸条：「${deliveryNote}」`);
};

// 拨打随车师傅电话
window.callDriver = () => {
  const driver = currentStore ? (currentStore.driver_name || '老张师傅') : '配送师傅';
  alert(`正在为您连线随车管家【${driver}】...`);
  window.location.href = 'tel:13800138000';
};

// 调换货申报
window.openReturnModal = () => {
  window.closeModal('toolbox-modal');
  document.getElementById('return-prod-name').value = '';
  document.getElementById('return-qty').value = '1';
  document.getElementById('return-remark').value = '';
  window.openModal('return-modal');
};

window.submitReturnRequest = () => {
  const name = document.getElementById('return-prod-name').value.trim();
  const qty = parseInt(document.getElementById('return-qty').value) || 1;
  const reason = document.getElementById('return-reason').value;
  const remark = document.getElementById('return-remark').value.trim();
  if (!name) return alert('请填写需要调换的商品全名！');

  const extra = remark ? `(${remark})` : '';
  const noteStr = `【调换货】${name} x ${qty}件 - ${reason}${extra}`;
  deliveryNote = deliveryNote ? `${deliveryNote}；${noteStr}` : noteStr;
  alert('已成功登记调换货！送货时师傅当面核减验退。');
  window.closeModal('return-modal');
};

// ==========================================
// 3. 营销海报中心与自定义工作台
// ==========================================
window.openMarketingCenter = () => {
  if (allProducts.length === 0) return alert('当前没有可做海报的在售货品！');
  window.configureFlyer(allProducts[0].id);
};

window.configureFlyer = (prodId) => {
  const prod = allProducts.find(x => x.id === prodId);
  if (!prod) return;
  currentFlyerProd = prod;
  currentFlyerStyle = (shopType === '餐饮饭店') ? 'honest' : 'neighborhood';

  const defaultPrice = (ShopTypeManager.getEffectivePrice(prod, shopType) * 1.15).toFixed(1);
  const shopName = currentStore ? currentStore.name : '老主顾诚信店';

  document.getElementById('flyer-title-input').value = `【${shopName}】正品现货特惠`;
  document.getElementById('flyer-tagline-input').value = MarketingCanvas.styles[currentFlyerStyle].defaultTagline;
  document.getElementById('flyer-price-input').value = defaultPrice;
  document.getElementById('flyer-note-input').value = MarketingCanvas.styles[currentFlyerStyle].defaultNote;
  document.getElementById('flyer-prod-name').innerText = `${prod.name} (${prod.spec || '整装'})`;

  renderStyleChips();
  window.renderLiveFlyerPreview();
  window.openModal('marketing-modal');
};

window.setFlyerStyle = (styleKey) => {
  currentFlyerStyle = styleKey;
  const style = MarketingCanvas.styles[styleKey];
  if (style) {
    document.getElementById('flyer-tagline-input').value = style.defaultTagline;
    document.getElementById('flyer-note-input').value = style.defaultNote;
  }
  renderStyleChips();
  window.renderLiveFlyerPreview();
};

function renderStyleChips() {
  const container = document.getElementById('style-selector-box');
  if (!container) return;
  container.innerHTML = Object.entries(MarketingCanvas.styles).map(([key, item]) => `
    <button onclick="window.setFlyerStyle('${key}')" class="px-2.5 py-1 rounded-xl text-xs font-bold border transition ${currentFlyerStyle === key ? 'bg-emerald-800 text-white border-emerald-900 shadow' : 'bg-stone-100 text-stone-600 border-stone-200'}">
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
    document.getElementById('flyer-note-input').value = noteMap[type];
    window.renderLiveFlyerPreview();
  }
};

window.renderLiveFlyerPreview = async () => {
  if (!currentFlyerProd) return;
  const canvas = document.getElementById('hidden-canvas');
  const title = document.getElementById('flyer-title-input').value;
  const tagline = document.getElementById('flyer-tagline-input').value;
  const price = parseFloat(document.getElementById('flyer-price-input').value);
  const note = document.getElementById('flyer-note-input').value;
  const shopName = currentStore ? currentStore.name : '老主顾诚信店';

  const dataUrl = await MarketingCanvas.generate(canvas, currentFlyerProd, shopName, currentFlyerStyle, title, tagline, price, note);
  document.getElementById('flyer-preview-img').src = dataUrl;
};

// ==========================================
// 4. 货单渲染与分类筛选
// ==========================================
function renderCategoryTabs() {
  const categories = ['全部', ...new Set(allProducts.map(p => p.category_main).filter(Boolean))];
  const bar = document.getElementById('category-bar');
  if (!bar) return;
  bar.innerHTML = categories.map(c => `
    <button onclick="window.filterCategory('${c}')" class="cat-pill ${c === currentCategory ? 'bg-[#064e3b] text-white shadow-sm' : 'bg-stone-100 text-stone-600'} px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition">
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
    container.innerHTML = '<div class="p-12 text-center text-stone-400 text-xs">暂无符合条件的在供货品</div>';
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
            <button onclick="window.changeQty(${p.id}, -1)" class="w-7 h-7 rounded-xl bg-stone-100 active:scale-95 font-bold text-stone-600 flex items-center justify-center text-sm shadow-sm">-</button>
            <span id="qty-${p.id}" class="w-6 text-center font-bold text-xs font-mono">${cart[p.id] || 0}</span>
            <button onclick="window.changeQty(${p.id}, 1)" ${isOutOfStock ? 'disabled' : ''} class="w-7 h-7 rounded-xl ${isOutOfStock ? 'bg-stone-200 text-stone-400' : 'bg-emerald-50 text-emerald-800 active:scale-95'} font-bold flex items-center justify-center text-sm shadow-sm">+</button>
          </div>
        </div>

        <div class="flex justify-end pt-0.5">
          <button onclick="window.configureFlyer(${p.id})" class="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-3 py-1 rounded-xl font-bold flex items-center gap-1 active:scale-95 transition">
            📲 自选风格做海报
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 5. 购物车加减件与结算汇总
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

  localStorage.setItem(CART_KEY, JSON.stringify(cart));
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
  document.getElementById('cart-total-amount').innerText = totalAmount.toFixed(2);
  document.getElementById('cart-count-badge').innerText = totalCount;
}

// 报单提交
window.submitB2BOrder = async () => {
  const totalAmount = parseFloat(document.getElementById('cart-total-amount').innerText);
  if (totalAmount <= 0) return alert('请先挑选进货件数！');

  const items = [];
  for (const [id, qty] of Object.entries(cart)) {
    if (qty > 0) {
      const p = allProducts.find(x => x.id === parseInt(id));
      if (p) items.push({ id: p.id, name: p.name, spec: p.spec, price: ShopTypeManager.getEffectivePrice(p, shopType), qty });
    }
  }

  const btn = document.getElementById('btn-submit-order');
  btn.disabled = true;
  btn.innerText = '正在提交...';

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

    alert(`🎉 报单成功！合计 ¥${totalAmount.toFixed(2)}。已安排师傅装车！`);
    for (const k of Object.keys(cart)) delete cart[k];
    localStorage.removeItem(CART_KEY);
    deliveryNote = '';
    await initTerminal();
  } catch (err) {
    alert(`报单失败: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>🚚 交代师父排单装车</span> <span id="cart-count-badge" class="bg-amber-400 text-stone-900 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">0</span>`;
  }
};

// 单据历史
window.openReceiptsModal = async () => {
  if (!currentStore) return alert('未绑定有效门店！');
  window.openModal('receipts-modal');

  const myOrders = await StoreService.getMyOrders(currentStore.id);
  document.getElementById('my-orders-list').innerHTML = myOrders.map(o => {
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
  }).join('') || '<div class="text-stone-400 text-center py-2">暂无报单</div>';

  const myReceipts = await StoreService.getMyReceipts(currentStore.id);
  document.getElementById('my-receipts-list').innerHTML = myReceipts.map(r => `
    <div class="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
      <div class="flex justify-between font-bold text-emerald-950">
        <span>经办随车人: ${r.driver_name}</span>
        <span>实交: ¥${parseFloat(r.amount).toFixed(2)} (${r.pay_method})</span>
      </div>
      ${r.basket_return ? `<div class="text-[10px] text-amber-800">退还空筐: ${r.basket_return} 个 (折抵货款 ¥${r.basket_deduct_amount})</div>` : ''}
      <div class="text-[10px] text-emerald-800">核销时间: ${new Date(r.created_at).toLocaleString()}</div>
    </div>
  `).join('') || '<div class="text-stone-400 text-center py-2">暂无还款记录</div>';
};

// 认领总代
window.bindByCode = () => {
  const code = document.getElementById('bind-input-code').value.trim();
  if (code === '888001') currentAgent = 'BJ_SHUNDA';
  else if (code === '888002') currentAgent = 'SH_LEGOU';
  else return alert('认领码无效！');

  localStorage.setItem('active_agent', currentAgent);
  alert('已成功绑定总代！');
  window.closeModal('bind-agent-modal');
  initTerminal();
};

window.bindByPhone = async () => {
  const phone = document.getElementById('bind-input-phone').value.trim();
  if (!phone || phone.length < 11) return alert('请输入有效的 11 位手机号！');
  const store = await StoreService.bindByPhone(phone);
  if (store) {
    currentAgent = store.tenant_id || 'BJ_SHUNDA';
    localStorage.setItem('active_agent', currentAgent);
    alert(`🎉 认领成功！欢迎【${store.name}】掌柜！`);
    window.closeModal('bind-agent-modal');
    initTerminal();
  } else {
    alert('未在总代名册中查到该手机号，请联系师傅建档。');
  }
};

// ==========================================
// 6. 页面初始化
// ==========================================
async function initTerminal() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlAgent = urlParams.get('agent') || urlParams.get('tenant');
  if (urlAgent) {
    currentAgent = urlAgent;
    localStorage.setItem('active_agent', currentAgent);
  }
  document.getElementById('tenant-badge').innerText = currentAgent;

  currentStore = await StoreService.getStoreByTenant(currentAgent);
  if (currentStore) {
    document.getElementById('store-title').innerText = currentStore.name || '合作门店';
    document.getElementById('store-boss').innerText = currentStore.contact || '掌柜';
    document.getElementById('store-driver').innerText = `${currentStore.driver_name || '老张师傅'}`;
    document.getElementById('store-basket-count').innerText = `${currentStore.basket_count || 0} 个`;

    const limit = parseFloat(currentStore.credit_limit || 2000);
    const debt = parseFloat(currentStore.current_debt || 0);
    document.getElementById('credit-avail').innerText = `¥${Math.max(0, limit - debt).toFixed(2)}`;
    document.getElementById('credit-debt').innerText = `¥${debt.toFixed(2)}`;

    if (!localStorage.getItem('active_shop_type')) {
      shopType = ShopTypeManager.autoDetect(currentStore.name);
      localStorage.setItem('active_shop_type', shopType);
    }
  }

  renderShopType();
  renderDynamicNotes();

  allProducts = await StoreService.getProducts(currentAgent, currentStore?.visible_product_ids);
  renderCategoryTabs();
  renderProductList();
  updateCartSummary();
}

initTerminal();
