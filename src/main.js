import { supabase } from './lib/supabase.js';
import { StoreService } from './services/storeService.js';
import { ShopTypeManager } from './modules/shopTypeManager.js';
import { MarketingCanvas } from './modules/marketingCanvas.js';

let currentAgent = localStorage.getItem('active_agent') || 'BJ_SHUNDA';
let currentStore = null;
let shopType = localStorage.getItem('active_shop_type') || '社区超市';
let allProducts = [];
let currentCategory = '全部';
let currentTagFilter = '全部';
const cart = {};
let deliveryNote = '';

// 通用模态窗控制器
window.openModal = (id) => document.getElementById(id).classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

// 店型点选切换
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
  document.getElementById('shop-type-badge').innerHTML = `<span>${ShopTypeManager.icons[shopType] || '🏪'} ${shopType}</span> ▾`;
}

function renderDynamicNotes() {
  const box = document.getElementById('dynamic-notes-box');
  const notes = ShopTypeManager.getDynamicNotes(shopType);
  box.innerHTML = notes.map(n => `
    <button onclick="window.appendDeliveryNote('${n}')" class="bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-0.5 rounded-lg whitespace-nowrap active:scale-95 transition">
      ${n}
    </button>
  `).join('');
}

window.appendDeliveryNote = (txt) => {
  deliveryNote = deliveryNote ? `${deliveryNote}；${txt}` : txt;
  alert(`已附加随车小纸条：「${deliveryNote}」`);
};

// 百宝箱与营销海报中心
window.openToolboxModal = () => window.openModal('toolbox-modal');
window.openMarketingCenter = () => window.openModal('marketing-modal');
window.callDriver = () => {
  const driver = document.getElementById('store-driver').innerText;
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
  const prodName = document.getElementById('return-prod-name').value.trim();
  const qty = parseInt(document.getElementById('return-qty').value) || 1;
  const reason = document.getElementById('return-reason').value;
  if (!prodName) return alert('请填写需要调换的商品名称！');

  deliveryNote = deliveryNote ? `${deliveryNote}；【调换货申请】${prodName} x ${qty}箱(${reason})` : `【调换货申请】${prodName} x ${qty}箱(${reason})`;
  alert(`已成功登记调换货！随车叮咛：「${prodName} x ${qty}箱」，送货时师傅当面核退！`);
  window.closeModal('return-modal');
};

// 初始化终端口
async function initTerminal() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlAgent = urlParams.get('agent') || urlParams.get('tenant');
  if (urlAgent) {
    currentAgent = urlAgent;
    localStorage.setItem('active_agent', currentAgent);
  }
  document.getElementById('tenant-badge').innerText = currentAgent;

  // 获取门店档案
  currentStore = await StoreService.getStoreByTenant(currentAgent);
  if (currentStore) {
    document.getElementById('store-title').innerText = currentStore.name || '合作门店';
    document.getElementById('store-boss').innerText = currentStore.contact || '掌柜';
    document.getElementById('store-driver').innerText = `${currentStore.driver_name || '老张师傅'} (每日随车)`;
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

  // 获取商品
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

function renderCategoryTabs() {
  const categories = ['全部', ...new Set(allProducts.map(p => p.category_main).filter(Boolean))];
  document.getElementById('category-bar').innerHTML = categories.map(c => `
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
  if (filtered.length === 0) {
    container.innerHTML = '<div class="p-12 text-center text-stone-400 text-xs">暂无符合条件的在供货品</div>';
    return;
  }

  container.innerHTML = filtered.map(p => {
    const imgHtml = p.image_url 
      ? `<img src="${p.image_url}" class="w-16 h-16 rounded-2xl object-cover border border-stone-200 shadow-sm">`
      : `<div class="w-16 h-16 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-[10px] text-stone-400">实物包</div>`;
    const tags = Array.isArray(p.tags) ? p.tags : [];
    const tagHtml = tags.map(t => `<span class="bg-amber-50 text-amber-900 border border-amber-200 text-[9px] px-1.5 py-0.2 rounded font-medium">${t}</span>`).join(' ');

    const price = ShopTypeManager.getEffectivePrice(p, shopType);
    const isTier2 = (price < p.tier_1_price);
    const flyerBtnText = (shopType === '餐饮饭店') ? '📜 做张明厨良心食材单' : '📲 做张老邻居拼单单';

    return `
      <div class="py-3.5 px-1 space-y-2">
        <div class="flex justify-between items-center gap-3">
          <div class="flex items-center gap-3">
            ${imgHtml}
            <div>
              <div class="font-bold text-xs text-stone-800">${p.name}</div>
              <div class="mt-0.5 space-x-1">${tagHtml}</div>
              <div class="text-[11px] text-stone-400 mt-0.5 font-mono">装箱: ${p.spec || '整箱装'}</div>
              <div class="text-xs font-bold text-emerald-800 mt-0.5 font-mono flex items-center gap-1">
                ¥${price.toFixed(2)} <span class="text-[10px] text-stone-400 font-normal">/${p.pack_unit || '箱'}</span>
                ${isTier2 ? `<span class="text-[9px] bg-rose-50 text-rose-700 border border-rose-200 px-1 rounded font-normal">大客价</span>` : ''}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="window.changeQty(${p.id}, -1)" class="w-7 h-7 rounded-xl bg-stone-100 active:scale-95 font-bold text-stone-600 flex items-center justify-center text-sm shadow-sm">-</button>
            <span id="qty-${p.id}" class="w-6 text-center font-bold text-xs font-mono">${cart[p.id] || 0}</span>
            <button onclick="window.changeQty(${p.id}, 1)" class="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-800 active:scale-95 font-bold flex items-center justify-center text-sm shadow-sm">+</button>
          </div>
        </div>
        <div class="flex justify-end pt-0.5">
          <button onclick="window.generateFlyer(${p.id})" class="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-3 py-1 rounded-xl font-bold flex items-center gap-1 active:scale-95 transition">
            ${flyerBtnText}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.changeQty = (id, delta) => {
  cart[id] = (cart[id] || 0) + delta;
  if (cart[id] < 0) cart[id] = 0;
  const el = document.getElementById(`qty-${id}`);
  if (el) el.innerText = cart[id];
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

// 调用模块化 Canvas 海报引擎
window.generateFlyer = async (prodId) => {
  const prod = allProducts.find(x => x.id === prodId);
  if (!prod) return;
  const shopName = currentStore ? currentStore.name : '老主顾诚信店';
  const canvas = document.getElementById('hidden-canvas');
  const price = ShopTypeManager.getEffectivePrice(prod, shopType);

  const dataUrl = await MarketingCanvas.generate(canvas, prod, shopName, shopType, price);
  document.getElementById('flyer-preview-img').src = dataUrl;
  window.openModal('flyer-modal');
};

// 报单提交
window.submitB2BOrder = async () => {
  const totalAmount = parseFloat(document.getElementById('cart-total-amount').innerText);
  if (totalAmount <= 0) return alert('请先挑选进货品种和箱数！');

  const itemsPayload = [];
  for (const [id, qty] of Object.entries(cart)) {
    if (qty > 0) {
      const p = allProducts.find(x => x.id === parseInt(id));
      if (p) itemsPayload.push({ id: p.id, name: p.name, spec: p.spec, price: ShopTypeManager.getEffectivePrice(p, shopType), qty });
    }
  }

  const btn = document.getElementById('btn-submit-order');
  btn.disabled = true;
  btn.innerText = '正在交代跟车师傅...';

  try {
    if (currentStore) {
      await supabase.from('store_order').insert([{
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

      const newDebt = parseFloat(currentStore.current_debt || 0) + totalAmount;
      await supabase.from('store').update({ current_debt: newDebt }).eq('id', currentStore.id);
    }

    alert(`🎉 报单成功！合计 ¥${totalAmount.toFixed(2)}。已交代跟车师傅排单装车！`);
    for (const k of Object.keys(cart)) cart[k] = 0;
    deliveryNote = '';
    renderProductList();
    updateCartSummary();
    initTerminal();
  } catch (err) {
    alert(`报单失败: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>🚚 交代师父排单装车</span> <span id="cart-count-badge" class="bg-amber-400 text-stone-900 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">0</span>`;
  }
};

// 单据历史与收条
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
          <span>单号 #${o.id} · ¥${o.total_amount}</span>
          <span class="${o.delivery_status === 'delivered' ? 'text-emerald-700' : 'text-amber-700'}">
            ${o.delivery_status === 'delivered' ? '✅ 已送达结清' : '🚚 排单待送'}
          </span>
        </div>
        <div class="text-[10px] text-stone-600">📦 配货明细: ${itemsText || '整批进货'}</div>
        ${o.note ? `<div class="text-[10px] text-amber-800">💬 随车附言: ${o.note}</div>` : ''}
        <div class="text-[10px] text-stone-400">报单时间: ${new Date(o.created_at).toLocaleString()}</div>
      </div>
    `;
  }).join('') || '<div class="text-stone-400 text-center py-2">暂无历史报单</div>';

  const myReceipts = await StoreService.getMyReceipts(currentStore.id);
  document.getElementById('my-receipts-list').innerHTML = myReceipts.map(r => `
    <div class="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
      <div class="flex justify-between font-bold text-emerald-950">
        <span>经办跟车人: ${r.driver_name}</span>
        <span>实交: ¥${r.amount} (${r.pay_method})</span>
      </div>
      ${r.basket_return ? `<div class="text-[10px] text-amber-800">退还空筐: ${r.basket_return} 个 (折抵货款 ¥${r.basket_deduct_amount})</div>` : ''}
      <div class="text-[10px] text-emerald-800">核销时间: ${new Date(r.created_at).toLocaleString()}</div>
    </div>
  `).join('') || '<div class="text-stone-400 text-center py-2">暂无还款记录</div>';
};

// 绑定供货商
window.bindByCode = () => {
  const code = document.getElementById('bind-input-code').value.trim();
  if (code === '888001') currentAgent = 'BJ_SHUNDA';
  else if (code === '888002') currentAgent = 'SH_LEGOU';
  else return alert('认领码无效！');
  localStorage.setItem('active_agent', currentAgent);
  alert('已成功绑定专属于您的供货商！');
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
    alert('未在总代名册中查到该手机号，请联系随车师傅建档。');
  }
};

initTerminal();
