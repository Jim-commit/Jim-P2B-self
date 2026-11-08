import { supabase } from './lib/supabase.js';
import { StoreService } from './services/storeService.js';
import { ShopTypeManager } from './modules/shopTypeManager.js';
import { MarketingCanvas } from './modules/marketingCanvas.js';

// ==========================================
// 1. 全局运行状态与响应式数据
// ==========================================
let currentAgent = localStorage.getItem('active_agent') || 'BJ_SHUNDA';
let currentStore = null;
let shopType = localStorage.getItem('active_shop_type') || '社区超市';
let allProducts = [];
let currentCategory = '全部';
let currentTagFilter = '全部';

// 购物车状态（支持 LocalStorage 本地断网/刷新持久化）
const CART_STORAGE_KEY = `b2b_cart_${currentAgent}`;
let cart = {};
try {
  cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '{}');
} catch (e) {
  cart = {};
}

let deliveryNote = '';

// 海报自定义配置状态
let currentFlyerProd = null;
let currentFlyerStyle = 'neighborhood';

// ==========================================
// 2. 基础模态窗与全局事件绑定 (挂载至 window)
// ==========================================
window.openModal = function (id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
};

window.closeModal = function (id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
};

// ==========================================
// 3. 店型自适应与动态捎句话便签模块
// ==========================================
window.openShopTypeModal = () => window.openModal('shop-type-modal');

window.selectShopType = function (type) {
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
  if (el) {
    el.innerHTML = `<span>${ShopTypeManager.icons[shopType] || '🏪'} ${shopType}</span> ▾`;
  }
}

function renderDynamicNotes() {
  const box = document.getElementById('dynamic-notes-box');
  if (!box) return;
  const notes = ShopTypeManager.getDynamicNotes(shopType);
  box.innerHTML = notes.map(n => `
    <button onclick="window.appendDeliveryNote('${n}')" class="bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-0.5 rounded-lg whitespace-nowrap active:scale-95 transition">
      ${n}
    </button>
  `).join('');
}

window.appendDeliveryNote = function (txt) {
  deliveryNote = deliveryNote ? `${deliveryNote}；${txt}` : txt;
  alert(`已附加随车小纸条：「${deliveryNote}」`);
};

// ==========================================
// 4. 百宝箱与掌柜实用工具集 (换总代、调换货、连线)
// ==========================================
window.openToolboxModal = () => window.openModal('toolbox-modal');

window.callDriver = function () {
  const driver = currentStore ? (currentStore.driver_name || '老张师傅') : '配送师傅';
  const phone = currentStore && currentStore.driver_phone ? currentStore.driver_phone : '13800138000';
  if (confirm(`是否立即致电随车师傅【${driver}】(${phone})？`)) {
    window.location.href = `tel:${phone}`;
  }
};

window.openReturnModal = function () {
  window.closeModal('toolbox-modal');
  document.getElementById('return-prod-name').value = '';
  document.getElementById('return-qty').value = '1';
  document.getElementById('return-remark').value = '';
  window.openModal('return-modal');
};

window.submitReturnRequest = function () {
  const prodName = document.getElementById('return-prod-name').value.trim();
  const qty = parseInt(document.getElementById('return-qty').value) || 1;
  const reason = document.getElementById('return-reason').value;
  const remark = document.getElementById('return-remark').value.trim();

  if (!prodName) return alert('请填写需要调换的商品名称！');

  const extra = remark ? `(${remark})` : '';
  const returnStr = `【调换货申请】${prodName} x ${qty}件 - 原因:${reason}${extra}`;
  deliveryNote = deliveryNote ? `${deliveryNote}；${returnStr}` : returnStr;

  alert(`已成功登记调换货！\n附言已加入本次随车叮咛，师傅送货时当面核减验退！`);
  window.closeModal('return-modal');
};

// ==========================================
// 5. 社区营销海报全行业通配与自定义引擎
// ==========================================
window.openMarketingCenter = function () {
  if (allProducts.length === 0) return alert('当前没有可做海报的在售货品！');
  window.configureFlyer(allProducts[0].id);
};

window.configureFlyer = function (prodId) {
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

window.setFlyerStyle = function (styleKey) {
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
  container.innerHTML = Object.entries(MarketingCanvas.styles).map(([key, item]) => {
    const isSel = (currentFlyerStyle === key);
    return `
      <button onclick="window.setFlyerStyle('${key}')" class="px-2.5 py-1 rounded-xl text-xs font-bold border transition ${isSel ? 'bg-emerald-800 text-white border-emerald-900 shadow' : 'bg-stone-100 text-stone-600 border-stone-200'}">
        ${item.name}
      </button>
    `;
  }).join('');
}

window.applyQuickNote = function (type) {
  const noteMap = {
    'daily': '💬 掌柜交心话：家里洗洁精、洗衣液、抽纸用得快，这批大厂直供大包装，量大抗用还便宜！',
    'general': '💬 掌柜承诺：老实人做老实买卖，不卖山寨假货！大家伙儿放心买、放心用！',
    'rush': '💬 老板交代：这批整箱货走的是出厂大宗批发价，数量有限，老邻居微信留言先留现货！',
    'food': '💬 掌柜叮咛：正规大厂最新出厂批次，封条完好，自己家也天天吃，品质绝对放心！'
  };
  if (noteMap[type]) {
    document.getElementById('flyer-note-input').value = noteMap[type];
    window.renderLiveFlyerPreview();
  }
};

window.renderLiveFlyerPreview = async function () {
  if (!currentFlyerProd) return;
  const canvas = document.getElementById('hidden-canvas');
  const customTitle = document.getElementById('flyer-title-input').value;
  const customTagline = document.getElementById('flyer-tagline-input').value;
  const customPrice = parseFloat(document.getElementById('flyer-price-input').value);
  const customNote = document.getElementById('flyer-note-input').value;
  const shopName = currentStore ? currentStore.name : '老主顾诚信店';

  const dataUrl = await MarketingCanvas.generate(
    canvas, currentFlyerProd, shopName, currentFlyerStyle,
    customTitle, customTagline, customPrice, customNote
  );
  document.getElementById('flyer-preview-img').src = dataUrl;
};

// ==========================================
// 6. 商品主数据流与分类标签快筛
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

window.filterCategory = function (cat) {
  currentCategory = cat;
  renderCategoryTabs();
  renderProductList();
};

window.filterBySpecialTag = function (tag) {
  currentTagFilter = tag;
  document.querySelectorAll('.tag-filter-chip').forEach(b => {
    b.className = (b.innerText === tag)
      ? 'tag-filter-chip bg-stone-800 text-white px-2.5 py-0.5 rounded-lg whitespace-nowrap font-bold shadow-sm'
      : 'tag-filter-chip bg-stone-100 text-stone-600 px-2.5 py-0.5 rounded-lg whitespace-nowrap';
  });
  renderProductList();
};

function renderProductList() {
  let filtered = (currentCategory === '全部')
    ? allProducts
    : allProducts.filter(p => p.category_main === currentCategory);

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
    const currentStock = (p.stock !== undefined && p.stock !== null) ? p.stock : 999;
    const isOutOfStock = currentStock <= 0;

    return `
      <div class="py-3.5 px-1 space-y-2 ${isOutOfStock ? 'opacity-50' : ''}">
        <div class="flex justify-between items-center gap-3">
          <div class="flex items-center gap-3">
            ${imgHtml}
            <div>
              <div class="font-bold text-xs text-stone-800">${p.name}</div>
              <div class="mt-0.5 space-x-1">${tagHtml}</div>
              <div class="text-[11px] text-stone-400 mt-0.5 font-mono">
                规格: ${p.spec || '整装'} · 库存: ${isOutOfStock ? '<span class="text-rose-600 font-bold">已售罄</span>' : `${currentStock}箱`}
              </div>
              <div class="text-xs font-bold text-emerald-800 mt-0.5 font-mono flex items-center gap-1">
                ¥${price.toFixed(2)} <span class="text-[10px] text-stone-400 font-normal">/${p.pack_unit || '箱'}</span>
                ${isTier2 ? `<span class="text-[9px] bg-rose-50 text-rose-700 border border-rose-200 px-1 rounded font-normal">大客价</span>` : ''}
              </div>
            </div>
          </div>
          
          <!-- 计件按钮 -->
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
// 7. 购物车加减、库存校验与持久化
// ==========================================
window.changeQty = function (id, delta) {
  const prod = allProducts.find(x => x.id === id);
  const currentStock = prod && prod.stock !== undefined ? prod.stock : 999;

  let newQty = (cart[id] || 0) + delta;
  if (newQty < 0) newQty = 0;
  if (newQty > currentStock) {
    alert(`总代库存仅剩 ${currentStock} 箱，无法再加！`);
    newQty = currentStock;
  }

  if (newQty === 0) {
    delete cart[id];
  } else {
    cart[id] = newQty;
  }

  // 持久化到本地，防止不小心切出页面导致丢失加购
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));

  const el = document.getElementById(`qty-${id}`);
  if (el) el.innerText = newQty;

  updateCartSummary();
};

function updateCartSummary() {
  let totalAmount = 0;
  let totalCount = 0;
  for (const [id, qty] of Object.entries(cart)) {
    if (qty > 0) {
      const prod = allProducts.find(x => x.id === parseInt(id));
      if (prod) {
        totalAmount += ShopTypeManager.getEffectivePrice(prod, shopType) * qty;
        totalCount += qty;
      }
    }
  }

  const amtEl = document.getElementById('cart-total-amount');
  const cntEl = document.getElementById('cart-count-badge');
  if (amtEl) amtEl.innerText = totalAmount.toFixed(2);
  if (cntEl) cntEl.innerText = totalCount;
}

// ==========================================
// 8. 报单提交与单据真实落库
// ==========================================
window.submitB2BOrder = async function () {
  const totalAmount = parseFloat(document.getElementById('cart-total-amount').innerText);
  if (totalAmount <= 0) return alert('请先挑选进货件数！');

  const itemsPayload = [];
  for (const [id, qty] of Object.entries(cart)) {
    if (qty > 0) {
      const p = allProducts.find(x => x.id === parseInt(id));
      if (p) {
        itemsPayload.push({
          id: p.id,
          name: p.name,
          spec: p.spec,
          price: ShopTypeManager.getEffectivePrice(p, shopType),
          qty: qty
        });
      }
    }
  }

  const btn = document.getElementById('btn-submit-order');
  btn.disabled = true;
  btn.innerText = '正在提交装车清单...';

  try {
    if (currentStore) {
      // 1. 写入履约订单
      const { error: orderErr } = await supabase.from('store_order').insert([{
        tenant_id: currentAgent,
        store_id: currentStore.id,
        store_name: currentStore.name,
        driver_name: currentStore.driver_name || '配送师傅',
        total_amount: totalAmount,
        pay_type: 'credit',
        pay_status: 'pending',
        delivery_status: 'ordered',
        note: deliveryNote,
        items: itemsPayload
      }]);

      if (orderErr) throw orderErr;

      // 2. 扣减商品现货库存（防超卖）
      for (const item of itemsPayload) {
        const prod = allProducts.find(x => x.id === item.id);
        if (prod && prod.stock !== undefined) {
          const remainStock = Math.max(0, prod.stock - item.qty);
          await supabase.from('product').update({ stock: remainStock }).eq('id', item.id);
        }
      }

      // 3. 累加挂账
      const newDebt = parseFloat(currentStore.current_debt || 0) + totalAmount;
      await supabase.from('store').update({ current_debt: newDebt }).eq('id', currentStore.id);
    }

    const noteInfo = deliveryNote ? `\n随车叮咛：「${deliveryNote}」` : '';
    alert(`🎉 报单成功！合计 ¥${totalAmount.toFixed(2)}。${noteInfo}\n已通知随车师傅安排装车！`);

    // 清空购物车与缓存
    for (const k of Object.keys(cart)) delete cart[k];
    localStorage.removeItem(CART_STORAGE_KEY);
    deliveryNote = '';

    await initTerminal();
  } catch (err) {
    alert(`报单失败: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>🚚 交代师父排单装车</span> <span id="cart-count-badge" class="bg-amber-400 text-stone-900 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">0</span>`;
  }
};

// ==========================================
// 9. 单据明细展开与电子收条查验
// ==========================================
window.openReceiptsModal = async function () {
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
        ${o.sign_image_url ? `<div class="text-[9px] text-emerald-800 font-bold">✍️ 本店已正楷签字验收</div>` : ''}
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
      ${r.basket_return ? `<div class="text-[10px] text-amber-800">退还周转空筐: ${r.basket_return} 个 (折抵货款 ¥${r.basket_deduct_amount})</div>` : ''}
      <div class="text-[10px] text-emerald-800">核销时间: ${new Date(r.created_at).toLocaleString()}</div>
    </div>
  `).join('') || '<div class="text-stone-400 text-center py-2">暂无还款记录</div>';
};

// ==========================================
// 10. 总代绑定 (认领码与手机号双通道)
// ==========================================
window.bindByCode = function () {
  const code = document.getElementById('bind-input-code').value.trim();
  if (code === '888001') currentAgent = 'BJ_SHUNDA';
  else if (code === '888002') currentAgent = 'SH_LEGOU';
  else return alert('认领码无效！');

  localStorage.setItem('active_agent', currentAgent);
  alert('已成功绑定总代！');
  window.closeModal('bind-agent-modal');
  initTerminal();
};

window.bindByPhone = async function () {
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
// 11. 初始化入口
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

  const { data: prods } = await supabase.from('product').select('*').eq('tenant_id', currentAgent).neq('status', 'inactive').order('id', { ascending: false });
  let rawProds = prods || [];
  if (currentStore && currentStore.visible_product_ids && currentStore.visible_product_ids.length > 0) {
    allProducts = rawProds.filter(p => currentStore.visible_product_ids.includes(p.id));
  } else {
    allProducts = rawProds;
  }

  renderCategoryTabs();
  renderProductList();
  updateCartSummary();
}

initTerminal();
