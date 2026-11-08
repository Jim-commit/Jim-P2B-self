import { supabase } from './lib/supabase.js';
import { StoreService } from './services/storeService.js';
import { ShopTypeManager } from './modules/shopTypeManager.js';
import { MarketingCanvas } from './modules/marketingCanvas.js';
import { SETTLEMENT_CONFIG, RETURN_REASONS, EXCHANGE_REASONS } from './constants/settlement.js';

// ==========================================
// 1. 多总代名册管理与三态隔离购物车 (订/退/换)
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

let cart = {};

function loadAgentCart() {
  const CART_KEY = `b2b_cart_v3_${currentAgent}`;
  try {
    cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
  } catch (e) {
    cart = {};
  }
}

function saveAgentCart() {
  const CART_KEY = `b2b_cart_v3_${currentAgent}`;
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

let deliveryNote = '';
let currentFlyerProd = null;
let currentFlyerStyle = 'neighborhood';
let currentSettlementType = 'credit';
let uploadedProofImages = [];

function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

// ==========================================
// 2. 顶栏菜单与下拉控制器 (毛玻璃轻灵版)
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
// 3. 多总代平滑切换与红点监控
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

async function checkVendorProposalBadge() {
  if (!currentStore) return;
  const { data: proposals } = await supabase
    .from('store_order')
    .select('id')
    .eq('store_id', currentStore.id)
    .eq('tenant_id', currentAgent)
    .eq('order_status', 'counter_proposal');

  const count = proposals ? proposals.length : 0;
  const badgePing = document.getElementById('badge-vendor-feedback');
  const dot = document.getElementById('dot-vendor-feedback');
  const menuCount = document.getElementById('menu-proposal-count');

  if (count > 0) {
    badgePing?.classList.remove('hidden');
    dot?.classList.remove('hidden');
    if (menuCount) {
      menuCount.innerText = `${count}条建议`;
      menuCount.classList.remove('hidden');
    }
  } else {
    badgePing?.classList.add('hidden');
    dot?.classList.add('hidden');
    menuCount?.classList.add('hidden');
  }
}

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

window.confirmUnbindCurrentAgent = function () {
  if (myAgents.length <= 1) {
    return alert('⚠️ 至少需要保留一个供货商，无法解绑全部供货商！');
  }

  const curObj = myAgents.find(a => a.id === currentAgent);
  const curName = curObj ? curObj.name : currentAgent;

  if (confirm(`【安全确认】您确定要解绑供货商「${curName}」吗？\n\n• 解绑后将清除本总代待订购物车与快捷入口\n• 如需恢复需重新输入认领码接入`)) {
    localStorage.removeItem(`b2b_cart_v3_${currentAgent}`);
    myAgents = myAgents.filter(a => a.id !== currentAgent);
    localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(myAgents));
    const nextAgent = myAgents[0].id;
    alert(`✅ 已成功解绑「${curName}」！`);
    window.switchActiveAgent(nextAgent);
  }
};

// ==========================================
// 4. 货品卡片三态集成操作 (订 / 退 / 换)
// ==========================================
window.initProdItemState = (id) => {
  if (!cart[id]) {
    cart[id] = { order: 0, return: 0, exchange: 0, returnReason: RETURN_REASONS[0], exchangeReason: EXCHANGE_REASONS[0], returnPrice: null };
  }
};

window.changeOrderQty = (id, delta) => {
  window.initProdItemState(id);
  const prod = allProducts.find(x => x.id === id);
  const stock = prod?.stock ?? 999;
  let newQty = cart[id].order + delta;

  if (newQty < 0) newQty = 0;
  if (newQty > stock) {
    alert(`在售现货仅剩 ${stock} 箱！`);
    newQty = stock;
  }

  cart[id].order = newQty;
  saveAgentCart();
  safeSetText(`qty-order-${id}`, newQty);
  updateCartSummary();
};

// 打开退货抽屉（执行“无单不退、超量必拒、锁定原价”风控铁律）
window.openReturnDrawer = async (id) => {
  window.initProdItemState(id);
  const prod = allProducts.find(x => x.id === id);
  if (!prod) return;

  if (!currentStore) return alert('当前供货商未绑定有效门店，无法验证历史订购！');

  // 1. 刚性追溯历史订购与可退余量
  const quota = await StoreService.getProductReturnableQuota(currentStore.id, currentAgent, id);
  if (quota.maxReturnable <= 0) {
    return alert(`⚠️ 诚信规则拦截：\n本店在【${currentAgent}】处暂无【${prod.name}】的有效订购余量！\n系统严禁退换未经进货的货品。`);
  }

  // 2. 自动锁定原单送货价
  const origPrice = quota.lastPrice || ShopTypeManager.getEffectivePrice(prod, shopType);
  cart[id].returnPrice = origPrice;

  const currentReturnQty = cart[id].return || 1;
  const input = prompt(
    `🔄 登记退货：【${prod.name}】\n` +
    `• 追溯历史订单: ${quota.lastOrderNo || '线上订单'}\n` +
    `• 历史原单进价: ¥${origPrice.toFixed(2)} /箱\n` +
    `• 历史总进: ${quota.totalOrdered}箱 | 历史已退: ${quota.totalReturned}箱\n` +
    `• 【当前最大可退上限】: ${quota.maxReturnable} 箱\n\n` +
    `请输入本次退货件数 (设为0取消):`,
    Math.min(currentReturnQty, quota.maxReturnable)
  );

  if (input === null) return;
  const parsedQty = parseInt(input);
  if (isNaN(parsedQty) || parsedQty < 0) return alert('请输入有效的数字！');

  // 3. 刚性超量拦截
  if (parsedQty > quota.maxReturnable) {
    return alert(`⚠️ 诚信红线拦截：本次申请退货 ${parsedQty} 箱，已超出历史最大可退上限 (${quota.maxReturnable} 箱)！\n商贸规则严禁超额退货！`);
  }

  cart[id].return = parsedQty;
  if (parsedQty > 0) {
    const reasonIndex = prompt(
      `请选择合规退货理由：\n1. ${RETURN_REASONS[0]}\n2. ${RETURN_REASONS[1]}\n3. ${RETURN_REASONS[2]}\n4. ${RETURN_REASONS[3]}\n请输入序号(1-4):`,
      '1'
    );
    const idx = parseInt(reasonIndex) - 1;
    cart[id].returnReason = RETURN_REASONS[idx] || RETURN_REASONS[0];
  }

  saveAgentCart();
  renderProductList();
  updateCartSummary();
};

// 打开换货抽屉（同样进行进货记录与可调换件数校验）
window.openExchangeDrawer = async (id) => {
  window.initProdItemState(id);
  const prod = allProducts.find(x => x.id === id);
  if (!prod) return;

  if (!currentStore) return alert('当前供货商未绑定有效门店！');

  const quota = await StoreService.getProductReturnableQuota(currentStore.id, currentAgent, id);
  if (quota.maxReturnable <= 0) {
    return alert(`⚠️ 诚信规则拦截：本店无【${prod.name}】历史订购余量，无法发起调换！`);
  }

  const currentExchangeQty = cart[id].exchange || 1;
  const input = prompt(
    `🔀 登记等价平换：【${prod.name}】\n` +
    `• 规则: 一新换一旧 (差额 ¥0.00)\n` +
    `• 关联历史订购余量上限: ${quota.maxReturnable} 箱\n\n` +
    `请输入调换件数 (设为0取消):`,
    Math.min(currentExchangeQty, quota.maxReturnable)
  );

  if (input === null) return;
  const parsedQty = parseInt(input);
  if (isNaN(parsedQty) || parsedQty < 0) return alert('请输入有效的数字！');

  if (parsedQty > quota.maxReturnable) {
    return alert(`⚠️ 调换数量不能超出历史订购余量 (${quota.maxReturnable} 箱)！`);
  }

  cart[id].exchange = parsedQty;
  if (parsedQty > 0) {
    const reasonIndex = prompt(
      `请选择换货理由：\n1. ${EXCHANGE_REASONS[0]}\n2. ${EXCHANGE_REASONS[1]}\n3. ${EXCHANGE_REASONS[2]}\n请输入序号(1-3):`,
      '1'
    );
    const idx = parseInt(reasonIndex) - 1;
    cart[id].exchangeReason = EXCHANGE_REASONS[idx] || EXCHANGE_REASONS[0];
  }

  saveAgentCart();
  renderProductList();
  updateCartSummary();
};

function updateCartSummary() {
  let orderTotal = 0, returnTotal = 0, orderCount = 0, returnCount = 0, exchangeCount = 0;

  for (const [id, data] of Object.entries(cart)) {
    const prod = allProducts.find(x => x.id === parseInt(id));
    if (!prod) continue;
    const price = ShopTypeManager.getEffectivePrice(prod, shopType);

    if (data.order > 0) {
      orderTotal += price * data.order;
      orderCount += data.order;
    }
    if (data.return > 0) {
      const retPrice = data.returnPrice || price;
      returnTotal += retPrice * data.return;
      returnCount += data.return;
    }
    if (data.exchange > 0) {
      exchangeCount += data.exchange;
    }
  }

  const netTotal = Math.max(0, orderTotal - returnTotal);
  safeSetText('cart-total-amount', netTotal.toFixed(2));
  safeSetText('cart-count-badge', orderCount + returnCount + exchangeCount);

  const detailEl = document.getElementById('cart-detail-subtext');
  if (detailEl) {
    detailEl.innerText = `订 ${orderCount} | 退 ${returnCount} (-¥${returnTotal.toFixed(1)}) | 换 ${exchangeCount}`;
  }
}

// ==========================================
// 5. 三合一送货结算凭单生成与确认弹窗
// ==========================================
window.openSettlementModal = () => {
  const orderItems = [];
  const returnItems = [];
  const exchangeItems = [];

  for (const [id, data] of Object.entries(cart)) {
    const p = allProducts.find(x => x.id === parseInt(id));
    if (!p) continue;
    const price = ShopTypeManager.getEffectivePrice(p, shopType);

    if (data.order > 0) {
      orderItems.push({ id: p.id, name: p.name, spec: p.spec, price, qty: data.order });
    }
    if (data.return > 0) {
      returnItems.push({
        id: p.id,
        name: p.name,
        spec: p.spec,
        price: data.returnPrice || price,
        qty: data.return,
        reason: data.returnReason
      });
    }
    if (data.exchange > 0) {
      exchangeItems.push({
        id: p.id,
        name: p.name,
        spec: p.spec,
        qty: data.exchange,
        reason: data.exchangeReason
      });
    }
  }

  if (orderItems.length === 0 && returnItems.length === 0 && exchangeItems.length === 0) {
    return alert('当前没有挑选任何订货、退货或换货品项！');
  }

  const allowed = (currentStore && Array.isArray(currentStore.allowed_settlements))
    ? currentStore.allowed_settlements
    : ['cash', 'credit'];

  const curSettlementSelect = document.getElementById('slip-settlement-select');
  if (curSettlementSelect) {
    curSettlementSelect.innerHTML = Object.entries(SETTLEMENT_CONFIG).map(([key, val]) => {
      const isAllowed = allowed.includes(key);
      return `<option value="${key}" ${!isAllowed ? 'disabled' : ''} ${key === currentSettlementType ? 'selected' : ''}>
        ${val.label} ${!isAllowed ? '(供货商未授权)' : ''}
      </option>`;
    }).join('');
  }

  renderSlipItemList('slip-order-items-list', orderItems, 'order');
  renderSlipItemList('slip-return-items-list', returnItems, 'return');
  renderSlipItemList('slip-exchange-items-list', exchangeItems, 'exchange');

  const orderTotal = orderItems.reduce((a, b) => a + (b.price * b.qty), 0);
  const returnTotal = returnItems.reduce((a, b) => a + (b.price * b.qty), 0);
  const netTotal = Math.max(0, orderTotal - returnTotal);

  safeSetText('slip-order-total', `¥${orderTotal.toFixed(2)}`);
  safeSetText('slip-return-total', `-¥${returnTotal.toFixed(2)}`);
  safeSetText('slip-net-total', `¥${netTotal.toFixed(2)}`);

  // 凭据上传提示（存在退/换残次货品时智能显现）
  const proofBox = document.getElementById('slip-proof-upload-box');
  if (proofBox) {
    if (returnItems.length > 0 || exchangeItems.length > 0) {
      proofBox.classList.remove('hidden');
    } else {
      proofBox.classList.add('hidden');
    }
  }

  window.openModal('settlement-slip-modal');
};

function renderSlipItemList(containerId, items, type) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = '<div class="text-stone-300 text-[10px] py-1 text-center">无该项变动</div>';
    return;
  }

  container.innerHTML = items.map(it => {
    if (type === 'order') {
      return `
        <div class="flex justify-between items-center py-1 border-b border-stone-50">
          <div>
            <b class="text-stone-800">${it.name}</b>
            <span class="text-[9px] text-stone-400 block">${it.spec || '整装'} · ¥${it.price.toFixed(2)} x ${it.qty}箱</span>
          </div>
          <b class="text-stone-900 font-mono">¥${(it.price * it.qty).toFixed(2)}</b>
        </div>
      `;
    } else if (type === 'return') {
      return `
        <div class="flex justify-between items-center py-1 border-b border-stone-50 text-rose-700">
          <div>
            <b>${it.name}</b>
            <span class="text-[9px] text-rose-500 block">原价 ¥${it.price.toFixed(2)} x ${it.qty}箱 · [${it.reason}]</span>
          </div>
          <b class="font-mono">-¥${(it.price * it.qty).toFixed(2)}</b>
        </div>
      `;
    } else {
      return `
        <div class="flex justify-between items-center py-1 border-b border-stone-50 text-amber-800">
          <div>
            <b>${it.name}</b>
            <span class="text-[9px] text-amber-600 block">平价替换 x ${it.qty}箱 · [${it.reason}]</span>
          </div>
          <span class="font-mono text-[10px] bg-amber-50 px-1.5 py-0.2 rounded font-bold">差额 ¥0.00</span>
        </div>
      `;
    }
  }).join('');
}

window.handleProofUpload = (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  for (let i = 0; i < files.length; i++) {
    uploadedProofImages.push(URL.createObjectURL(files[i]));
  }
  const preview = document.getElementById('proof-preview-container');
  if (preview) {
    preview.innerHTML = uploadedProofImages.map(src => `
      <img src="${src}" class="w-12 h-12 rounded-lg object-cover border border-stone-300">
    `).join('');
  }
  alert('📷 异常纸质底单 / 破损凭据已暂存！');
};

window.confirmAndSubmitOrder = async () => {
  const settlementSelect = document.getElementById('slip-settlement-select');
  const settlementType = settlementSelect ? settlementSelect.value : 'credit';
  const customNote = document.getElementById('slip-custom-note')?.value.trim() || '';

  const orderItems = [];
  const returnItems = [];
  const exchangeItems = [];

  for (const [id, data] of Object.entries(cart)) {
    const p = allProducts.find(x => x.id === parseInt(id));
    if (!p) continue;
    const price = ShopTypeManager.getEffectivePrice(p, shopType);

    if (data.order > 0) orderItems.push({ id: p.id, name: p.name, spec: p.spec, price, qty: data.order });
    if (data.return > 0) returnItems.push({ id: p.id, name: p.name, spec: p.spec, price: data.returnPrice || price, qty: data.return, reason: data.returnReason });
    if (data.exchange > 0) exchangeItems.push({ id: p.id, name: p.name, spec: p.spec, qty: data.exchange, reason: data.exchangeReason });
  }

  const orderTotal = orderItems.reduce((a, b) => a + (b.price * b.qty), 0);
  const returnTotal = returnItems.reduce((a, b) => a + (b.price * b.qty), 0);
  const netTotal = Math.max(0, orderTotal - returnTotal);

  const btn = document.getElementById('btn-slip-confirm');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '正在发送供货商...';
  }

  try {
    await StoreService.submitComprehensiveOrder({
      tenantId: currentAgent,
      storeId: currentStore ? currentStore.id : 1,
      storeName: currentStore ? currentStore.name : '合作便民老店',
      driverName: currentStore ? currentStore.driver_name : '老张师傅',
      orderSource: 'store_order',
      settlementType,
      settlementNote: customNote,
      itemsOrder: orderItems,
      itemsReturn: returnItems,
      itemsExchange: exchangeItems,
      orderTotal,
      returnTotal,
      netTotal,
      note: deliveryNote,
      proofImages: uploadedProofImages,
      currentDebt: currentStore?.current_debt || 0
    });

    alert(`🎉 送货结算凭单已成功推送给供货商！\n实结净额: ¥${netTotal.toFixed(2)}\n供货商确认后随车师傅将装车点交！`);

    for (const k of Object.keys(cart)) delete cart[k];
    saveAgentCart();
    uploadedProofImages = [];
    deliveryNote = '';
    window.closeModal('settlement-slip-modal');
    await initTerminal();
  } catch (err) {
    alert(`单据生成失败: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = '✅ 确认单据 · 提交供货商';
    }
  }
};

// ==========================================
// 6. 快捷工具与经营助手
// ==========================================
window.repeatLastOrder = async function () {
  if (!currentStore) return alert('当前供货商未绑定有效门店！');

  const myOrders = await StoreService.getMyOrders(currentStore.id, currentAgent);
  if (!myOrders || myOrders.length === 0) {
    return alert('当前供货商暂无历史报单记录！');
  }

  const lastOrder = myOrders[0];
  const items = Array.isArray(lastOrder.items) ? lastOrder.items : [];
  if (items.length === 0) return alert('上一单无明细商品');

  let addedCount = 0;
  for (const it of items) {
    if (it.id && it.qty) {
      window.initProdItemState(it.id);
      const prod = allProducts.find(p => p.id === it.id);
      const stock = prod?.stock ?? 999;
      cart[it.id].order = Math.min(it.qty, stock);
      addedCount++;
    }
  }

  saveAgentCart();
  renderProductList();
  updateCartSummary();
  alert(`✅ 已一键重填【${myAgents.find(a => a.id === currentAgent)?.name || currentAgent}】上单的 ${addedCount} 样常订货品！`);
};

window.clearCurrentCart = function () {
  if (Object.keys(cart).length === 0) return alert('当前购物车已经是空的');
  const curName = myAgents.find(a => a.id === currentAgent)?.name || currentAgent;
  if (confirm(`确认清空【${curName}】的待订购物车？`)) {
    for (const k of Object.keys(cart)) delete cart[k];
    saveAgentCart();
    renderProductList();
    updateCartSummary();
  }
};

window.openStoreOverview = function () {
  const curName = myAgents.find(a => a.id === currentAgent)?.name || currentAgent;
  const debt = document.getElementById('credit-debt')?.innerText || '¥0.00';
  const avail = document.getElementById('credit-avail')?.innerText || '¥2000.00';
  const basket = document.getElementById('store-basket-count')?.innerText || '0 个';

  alert(
    `📊 【${curName}】经营账目概览：\n\n` +
    `• 本总代未结挂账：${debt}\n` +
    `• 免息授信可用额度：${avail}\n` +
    `• 借用周转空筐：${basket}\n\n` +
    `可在右上角「···」菜单查验历次明细。`
  );
};

window.focusProductSearch = function () {
  const keyword = prompt('请输入想要查找的商品名称或关键字：');
  if (!keyword || !keyword.trim()) return;

  const target = keyword.trim().toLowerCase();
  const matched = allProducts.filter(p => p.name.toLowerCase().includes(target));

  if (matched.length === 0) {
    return alert(`未在当前供货商货单中找到含「${keyword}」的货品。`);
  }

  currentCategory = '全部';
  renderCategoryTabs();
  const oldAll = allProducts;
  allProducts = matched;
  renderProductList();
  allProducts = oldAll;
  alert(`🔍 找到 ${matched.length} 件相关货品已置顶展示。`);
};

// ==========================================
// 7. 营销海报中心
// ==========================================
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
// 8. 店型选择与随车便签
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

// ==========================================
// 9. 货品货单列表渲染 (集成订/退/换三态徽章)
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

    const curState = cart[p.id] || { order: 0, return: 0, exchange: 0 };
    const hasReturn = curState.return > 0;
    const hasExchange = curState.exchange > 0;

    return `
      <div class="py-3.5 px-1 space-y-2 border-b border-stone-100 ${isOutOfStock ? 'opacity-60' : ''}">
        <div class="flex justify-between items-start gap-3">
          <div class="flex items-start gap-3">
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
          
          <!-- 订货数量加减控制 -->
          <div class="flex items-center gap-1.5 pt-1">
            <button type="button" onclick="window.changeOrderQty(${p.id}, -1)" class="w-7 h-7 rounded-xl bg-stone-100 active:scale-95 font-bold text-stone-600 flex items-center justify-center text-sm shadow-sm">-</button>
            <span id="qty-order-${p.id}" class="w-6 text-center font-bold text-xs font-mono">${curState.order || 0}</span>
            <button type="button" onclick="window.changeOrderQty(${p.id}, 1)" ${isOutOfStock ? 'disabled' : ''} class="w-7 h-7 rounded-xl ${isOutOfStock ? 'bg-stone-200 text-stone-400' : 'bg-emerald-50 text-emerald-800 active:scale-95'} font-bold flex items-center justify-center text-sm shadow-sm">+</button>
          </div>
        </div>

        <!-- 订/退/换轻量标记与海报操作条 -->
        <div class="flex justify-between items-center pt-0.5 text-[10px]">
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="window.openReturnDrawer(${p.id})" class="px-2 py-0.5 rounded-lg font-bold border transition ${
              hasReturn ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100'
            }">
              🔄 退货 ${hasReturn ? `(${curState.return}件)` : ''}
            </button>
            <button type="button" onclick="window.openExchangeDrawer(${p.id})" class="px-2 py-0.5 rounded-lg font-bold border transition ${
              hasExchange ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100'
            }">
              🔀 换货 ${hasExchange ? `(${curState.exchange}件)` : ''}
            </button>
          </div>

          <button type="button" onclick="window.configureFlyer(${p.id})" class="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-0.5 rounded-xl font-bold flex items-center gap-1 active:scale-95 transition">
            📲 做海报
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 10. 单据历史与收条查验 (展示批复与一键采纳)
// ==========================================
window.openReceiptsModal = async () => {
  if (!currentStore) return alert('当前供货商未绑定有效门店！');
  window.openModal('receipts-modal');

  const myOrders = await StoreService.getMyOrders(currentStore.id, currentAgent);
  const ordersListEl = document.getElementById('my-orders-list');
  if (ordersListEl) {
    ordersListEl.innerHTML = myOrders.map(o => {
      const orderItems = Array.isArray(o.items) ? o.items : [];
      const returnItems = Array.isArray(o.items_return) ? o.items_return : [];
      const exchangeItems = Array.isArray(o.items_exchange) ? o.items_exchange : [];

      const orderStr = orderItems.map(it => `${it.name} x ${it.qty}箱`).join('、');
      const returnStr = returnItems.map(it => `退:${it.name}x${it.qty}`).join('、');
      const exchangeStr = exchangeItems.map(it => `换:${it.name}x${it.qty}`).join('、');

      let statusBadge = '<span class="text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded">🚚 排单待配</span>';
      if (o.order_status === 'counter_proposal') {
        statusBadge = '<span class="text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-bold animate-pulse">💬 供货商有调整建议</span>';
      } else if (o.order_status === 'confirmed') {
        statusBadge = '<span class="text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded font-bold">✅ 供货商已同意接单</span>';
      } else if (o.delivery_status === 'delivered') {
        statusBadge = '<span class="text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded">📦 已送达平账</span>';
      }

      return `
        <div class="p-3 bg-stone-50 border ${o.order_status === 'counter_proposal' ? 'border-amber-400 bg-amber-50/30' : 'border-stone-200'} rounded-2xl space-y-1.5 text-xs">
          <div class="flex justify-between items-center font-bold">
            <span class="text-stone-800">流水 #${o.order_no || o.id}</span>
            ${statusBadge}
          </div>

          <!-- 供货商调整建议批注卡片 -->
          ${o.order_status === 'counter_proposal' ? `
            <div class="p-2 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 space-y-1">
              <div class="font-bold flex items-center gap-1 text-[11px]">
                <span>📢 供货商批复建议：</span>
              </div>
              <div class="text-[11px] leading-snug">${o.vendor_feedback || '供货商对本单有调整建议，请核实。'}</div>
              <div class="pt-1 flex gap-2 justify-end">
                <button type="button" onclick="window.cancelProposalOrder(${o.id})" class="px-2 py-1 rounded-lg bg-stone-200 text-stone-600 text-[10px] font-bold">撤单作废</button>
                <button type="button" onclick="window.acceptProposalAndReload(${o.id})" class="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold shadow">按建议调整重发</button>
              </div>
            </div>
          ` : ''}

          <div class="text-[10px] text-stone-600">📦 新订: ${orderStr || '无'}</div>
          ${returnStr ? `<div class="text-[10px] text-rose-600 font-medium">🔄 验退: ${returnStr}</div>` : ''}
          ${exchangeStr ? `<div class="text-[10px] text-amber-800 font-medium">🔀 调换: ${exchangeStr}</div>` : ''}

          <div class="flex justify-between items-center text-[10px] text-stone-400 pt-1 border-t border-stone-100">
            <span>实结: <b class="text-stone-800 font-mono">¥${parseFloat(o.net_settle_amount || o.total_amount).toFixed(2)}</b> (${o.settlement_type})</span>
            <span>${new Date(o.created_at).toLocaleTimeString()}</span>
          </div>
        </div>
      `;
    }).join('') || '<div class="text-stone-400 text-center py-4">暂无单据记录</div>';
  }

  const myReceipts = await StoreService.getMyReceipts(currentStore.id, currentAgent);
  const receiptsListEl = document.getElementById('my-receipts-list');
  if (receiptsListEl) {
    receiptsListEl.innerHTML = myReceipts.map(r => `
      <div class="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1 text-xs">
        <div class="flex justify-between font-bold text-emerald-950">
          <span>随车人: ${r.driver_name}</span>
          <span>实交: ¥${parseFloat(r.amount).toFixed(2)} (${r.pay_method})</span>
        </div>
        ${r.basket_return ? `<div class="text-[10px] text-amber-800">退还空筐: ${r.basket_return} 个 (折抵 ¥${r.basket_deduct_amount})</div>` : ''}
        <div class="text-[10px] text-emerald-800">核销时间: ${new Date(r.created_at).toLocaleString()}</div>
      </div>
    `).join('') || '<div class="text-stone-400 text-center py-2">暂无该总代还款记录</div>';
  }
};

window.cancelProposalOrder = async (orderId) => {
  if (!confirm('确认作废撤销该笔单据？')) return;
  await supabase.from('store_order').update({ order_status: 'cancelled' }).eq('id', orderId);
  window.openReceiptsModal();
  checkVendorProposalBadge();
};

window.acceptProposalAndReload = async (orderId) => {
  const { data: o } = await supabase.from('store_order').select('*').eq('id', orderId).single();
  if (!o) return;

  for (const k of Object.keys(cart)) delete cart[k];
  
  (o.items || []).forEach(it => {
    window.initProdItemState(it.id);
    cart[it.id].order = it.qty;
  });
  (o.items_return || []).forEach(it => {
    window.initProdItemState(it.id);
    cart[it.id].return = it.qty;
    cart[it.id].returnReason = it.reason;
    cart[it.id].returnPrice = it.price;
  });
  (o.items_exchange || []).forEach(it => {
    window.initProdItemState(it.id);
    cart[it.id].exchange = it.qty;
    cart[it.id].exchangeReason = it.reason;
  });

  saveAgentCart();
  renderProductList();
  updateCartSummary();

  window.closeModal('receipts-modal');
  alert('已将本单品项重新载入货单与购物车，请根据供货商建议调整后重新提交！');
  window.openSettlementModal();
};

// ==========================================
// 11. 系统初始化入口
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

    if (currentStore.default_settlement) {
      currentSettlementType = currentStore.default_settlement;
    }

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

  await checkVendorProposalBadge();
}

initTerminal();
