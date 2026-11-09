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
  { id: 'BJ_SHUNDA', name: '北京顺达 (粮油副食)' },
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
let shopType = localStorage.getItem('active_shop_type') || '社区便利';
let allProducts = [];
let currentCategory = '全部';
let currentTagFilter = '全部';
let currentAgentFilterCategory = '全部';

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
// 2. 顶栏菜单与下拉控制器
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
// 3. 供货商导航：适配小店与海量厂商大商超
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
  const btnAll = document.getElementById('btn-all-agents');
  const countEl = document.getElementById('total-agents-count');
  if (!box) return;

  if (countEl) countEl.innerText = myAgents.length;

  // 厂商超过 4 家时自动开启大超矩阵入口
  if (myAgents.length > 4) {
    btnAll?.classList.remove('hidden');
  } else {
    btnAll?.classList.add('hidden');
  }

  // 顶栏胶囊最多展示当前厂商及前 3 家，防止横向失控
  const displayAgents = myAgents.slice(0, 4);
  if (!displayAgents.some(a => a.id === currentAgent)) {
    const curObj = myAgents.find(a => a.id === currentAgent);
    if (curObj) displayAgents[0] = curObj;
  }

  box.innerHTML = displayAgents.map(ag => {
    const isCur = ag.id === currentAgent;
    return `
      <button type="button" onclick="window.switchActiveAgent('${ag.id}')" class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap transition active:scale-95 ${
        isCur 
          ? 'bg-amber-400 text-stone-900 border-amber-300 shadow-sm' 
          : 'bg-[#143628] text-emerald-100 border-emerald-700/60 hover:bg-[#1b4332]'
      }">
        ${ag.name || ag.id} ${isCur ? '●' : ''}
      </button>
    `;
  }).join('');
}

window.openAllAgentsModal = function() {
  window.renderAllAgentsList(myAgents);
  window.openModal('all-agents-modal');
};

window.renderAllAgentsList = function(list) {
  const container = document.getElementById('all-agents-container');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<div class="py-6 text-center text-stone-400 text-xs">未找到符合条件的供货厂商</div>';
    return;
  }

  container.innerHTML = list.map(ag => {
    const isCur = ag.id === currentAgent;
    return `
      <div class="py-2.5 px-2 flex justify-between items-center hover:bg-stone-50 rounded-xl transition ${isCur ? 'bg-amber-50/60' : ''}">
        <div onclick="window.switchActiveAgent('${ag.id}'); window.closeModal('all-agents-modal');" class="flex-1 cursor-pointer">
          <b class="text-xs text-stone-900 block">${ag.name || ag.id}</b>
          <span class="text-[10px] text-stone-400 font-mono">商号代号: ${ag.id}</span>
        </div>
        <div class="flex items-center gap-2">
          ${isCur 
            ? '<span class="text-[10px] bg-amber-400 text-stone-900 px-2 py-0.5 rounded-full font-bold">正供货中</span>' 
            : `<button type="button" onclick="window.switchActiveAgent('${ag.id}'); window.closeModal('all-agents-modal');" class="text-xs text-stone-600 hover:text-stone-900 font-bold bg-stone-100 hover:bg-stone-200 px-2.5 py-1 rounded-lg transition">进庄 ➔</button>`
          }
          <button type="button" onclick="window.confirmUnbindAgent('${ag.id}')" class="text-[10px] text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded-lg transition font-medium" title="解除合作">
            解绑
          </button>
        </div>
      </div>
    `;
  }).join('');
};

window.filterAgentList = function(keyword) {
  const kw = (keyword || '').trim().toLowerCase();
  let filtered = myAgents;
  if (currentAgentFilterCategory !== '全部') {
    filtered = filtered.filter(a => (a.name || '').includes(currentAgentFilterCategory));
  }
  if (kw) {
    filtered = filtered.filter(a => (a.name || '').toLowerCase().includes(kw) || a.id.toLowerCase().includes(kw));
  }
  window.renderAllAgentsList(filtered);
};

window.filterAgentByCategory = function(cat) {
  currentAgentFilterCategory = cat;
  document.querySelectorAll('.agent-cat-pill').forEach(btn => {
    btn.className = (btn.innerText === cat)
      ? 'agent-cat-pill bg-stone-900 text-white px-2 py-0.5 rounded-lg font-bold'
      : 'agent-cat-pill bg-stone-100 text-stone-600 px-2 py-0.5 rounded-lg';
  });
  const kw = document.getElementById('agent-search-input')?.value || '';
  window.filterAgentList(kw);
};

// ==========================================
// 4. 结识与解绑供货商 (信义拦截机制)
// ==========================================
window.bindByCode = async function () {
  const code = document.getElementById('bind-input-code')?.value.trim();
  let targetAgentId = '';
  let targetAgentName = '';

  if (code === '888001') {
    targetAgentId = 'BJ_SHUNDA'; targetAgentName = '北京顺达 (粮油副食)';
  } else if (code === '888002') {
    targetAgentId = 'SH_LEGOU'; targetAgentName = '上海乐购 (酒水副食)';
  } else {
    const { data } = await supabase.from('platform_tenant').select('*').eq('invite_code', code).limit(1);
    if (data && data.length > 0) {
      targetAgentId = data[0].tenant_id;
      targetAgentName = data[0].company_name;
    } else {
      return alert('未查到该认领码对应的供货厂商！');
    }
  }

  if (!myAgents.some(a => a.id === targetAgentId)) {
    myAgents.push({ id: targetAgentId, name: targetAgentName });
    localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(myAgents));
  }

  alert(`🎉 成功结识新供货商【${targetAgentName}】！`);
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
      myAgents.push({ id: targetAgentId, name: `${store.name}供货商` });
      localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(myAgents));
    }
    alert(`🎉 认领成功！欢迎【${store.name}】掌柜！`);
    window.closeModal('bind-agent-modal');
    await window.switchActiveAgent(targetAgentId);
  } else {
    alert('未在名册中查到该手机号，请联系师傅建档。');
  }
};

window.confirmUnbindAgent = async function(targetAgentId) {
  if (myAgents.length <= 1) {
    return alert('⚠️ 至少需要保留一家供货厂商，无法解绑全部商号！');
  }

  const targetAgent = myAgents.find(a => a.id === targetAgentId);
  const targetName = targetAgent ? (targetAgent.name || targetAgent.id) : targetAgentId;

  // 刚性商道风控：账清筐还方可解绑
  const storeRecord = await StoreService.getStoreByTenant(targetAgentId);
  const debt = parseFloat(storeRecord?.current_debt || 0);
  const baskets = parseInt(storeRecord?.basket_count || 0);

  if (debt > 0 || baskets > 0) {
    let reason = [];
    if (debt > 0) reason.push(`尚有挂账货资 ¥${debt.toFixed(2)} 未结清`);
    if (baskets > 0) reason.push(`借存周转空筐 ${baskets} 个未归还`);
    
    return alert(
      `🤝 君子之交 · 善始善终：\n\n` +
      `本店在【${targetName}】处：\n• ${reason.join('\n• ')}\n\n` +
      `商道贵在诚信相照，请联系随车师傅核销清账、交还周转筐后，方可解除合作。`
    );
  }

  const myOrders = await StoreService.getMyOrders(storeRecord?.id, targetAgentId);
  const hasPending = myOrders.some(o => o.delivery_status !== 'delivered' && o.order_status !== 'cancelled');
  if (hasPending) {
    return alert(`⚠️ 本店在【${targetName}】尚有正在配发中的随车单据，请待货物送达点验平账后再行解绑！`);
  }

  if (confirm(`【解绑确认】\n\n确认与供货商【${targetName}】解除合作？\n• 该厂商当前账款已结清 (¥0.00)\n• 解绑后将从掌中宝名册中移出该厂商货单`)) {
    localStorage.removeItem(`b2b_cart_v3_${targetAgentId}`);
    myAgents = myAgents.filter(a => a.id !== targetAgentId);
    localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(myAgents));

    alert(`✅ 已与【${targetName}】解除合作关联。聚散皆是缘，祝两家生意兴隆！`);

    if (currentAgent === targetAgentId) {
      currentAgent = myAgents[0].id;
      localStorage.setItem('active_agent', currentAgent);
    }

    window.closeModal('all-agents-modal');
    window.closeAllMenus();
    await initTerminal();
  }
};

window.confirmUnbindCurrentAgent = function() {
  window.confirmUnbindAgent(currentAgent);
};

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
      menuCount.innerText = `${count}条修润建议`;
      menuCount.classList.remove('hidden');
    }
  } else {
    badgePing?.classList.add('hidden');
    dot?.classList.add('hidden');
    menuCount?.classList.add('hidden');
  }
}

// ==========================================
// 5. 货品卡片三态集成操作 (订 / 退 / 换)
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
    alert(`在库现货仅剩 ${stock} 箱！`);
    newQty = stock;
  }

  cart[id].order = newQty;
  saveAgentCart();
  safeSetText(`qty-order-${id}`, newQty);
  updateCartSummary();
};

window.openReturnDrawer = async (id) => {
  window.initProdItemState(id);
  const prod = allProducts.find(x => x.id === id);
  if (!prod) return;

  if (!currentStore) return alert('当前供货商未绑定有效小店档案，无法追溯订购！');

  const quota = await StoreService.getProductReturnableQuota(currentStore.id, currentAgent, id);
  if (quota.maxReturnable <= 0) {
    return alert(`⚠️ 商道信义提示：\n本店在【${currentAgent}】处暂无【${prod.name}】的历史有效余量！\n系统严格追溯订购存根，不进不退。`);
  }

  const origPrice = quota.lastPrice || ShopTypeManager.getEffectivePrice(prod, shopType);
  cart[id].returnPrice = origPrice;

  const currentReturnQty = cart[id].return || 1;
  const input = prompt(
    `🔄 登记退货验还：【${prod.name}】\n` +
    `• 追溯原单: ${quota.lastOrderNo || '线上记录'}\n` +
    `• 历史原进价: ¥${origPrice.toFixed(2)} /箱\n` +
    `• 累计进: ${quota.totalOrdered}箱 | 已退换: ${quota.totalReturned}箱\n` +
    `• 【当前最大可退上限】: ${quota.maxReturnable} 箱\n\n` +
    `请输入本次退货件数 (设为0取消):`,
    Math.min(currentReturnQty, quota.maxReturnable)
  );

  if (input === null) return;
  const parsedQty = parseInt(input);
  if (isNaN(parsedQty) || parsedQty < 0) return alert('请输入有效的件数！');

  if (parsedQty > quota.maxReturnable) {
    return alert(`⚠️ 超额拦截：本次退货 ${parsedQty} 箱，超出历史进货余量 (${quota.maxReturnable} 箱)！依规严禁超额抵扣。`);
  }

  cart[id].return = parsedQty;
  if (parsedQty > 0) {
    const reasonIndex = prompt(
      `请选择合规验退原由：\n1. ${RETURN_REASONS[0]}\n2. ${RETURN_REASONS[1]}\n3. ${RETURN_REASONS[2]}\n4. ${RETURN_REASONS[3]}\n请输入序号(1-4):`,
      '1'
    );
    const idx = parseInt(reasonIndex) - 1;
    cart[id].returnReason = RETURN_REASONS[idx] || RETURN_REASONS[0];
  }

  saveAgentCart();
  renderProductList();
  updateCartSummary();
};

window.openExchangeDrawer = async (id) => {
  window.initProdItemState(id);
  const prod = allProducts.find(x => x.id === id);
  if (!prod) return;

  if (!currentStore) return alert('当前供货商未绑定有效小店档案！');

  const quota = await StoreService.getProductReturnableQuota(currentStore.id, currentAgent, id);
  if (quota.maxReturnable <= 0) {
    return alert(`⚠️ 本店无【${prod.name}】历史订购余量，无法发起对调平换！`);
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
  if (isNaN(parsedQty) || parsedQty < 0) return alert('请输入有效的件数！');

  if (parsedQty > quota.maxReturnable) {
    return alert(`⚠️ 调换件数不能超过历史订购余量 (${quota.maxReturnable} 箱)！`);
  }

  cart[id].exchange = parsedQty;
  if (parsedQty > 0) {
    const reasonIndex = prompt(
      `请选择调换原由：\n1. ${EXCHANGE_REASONS[0]}\n2. ${EXCHANGE_REASONS[1]}\n3. ${EXCHANGE_REASONS[2]}\n请输入序号(1-3):`,
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

  const hasSpecial = returnCount > 0 || exchangeCount > 0;
  const netTotal = Math.max(0, orderTotal - returnTotal);
  safeSetText('cart-total-amount', netTotal.toFixed(2));
  safeSetText('cart-count-badge', orderCount + returnCount + exchangeCount);

  const labelEl = document.getElementById('cart-total-label');
  if (labelEl) {
    labelEl.innerText = hasSpecial ? '预结净资 (进-退):' : '本次应付金额:';
  }

  const btnTextEl = document.getElementById('btn-submit-order-text');
  if (btnTextEl) {
    btnTextEl.innerText = hasSpecial ? '生成调退履约契单' : '生成送货凭单';
  }

  const detailEl = document.getElementById('cart-detail-subtext');
  if (detailEl) {
    detailEl.innerText = hasSpecial 
      ? `进 ${orderCount} | 退 ${returnCount} (-¥${returnTotal.toFixed(1)}) | 换 ${exchangeCount}`
      : `进 ${orderCount} 箱`;
  }
}

// ==========================================
// 6. 结算凭单弹窗：自适应普通单与特殊单，未授权项不展示
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
    return alert('当前购物车空空如也，请先挑选品物！');
  }

  // 严格过滤：未授权项直接不生成 option
  const allowed = (currentStore && Array.isArray(currentStore.allowed_settlements))
    ? currentStore.allowed_settlements
    : ['cash', 'credit'];

  const curSettlementSelect = document.getElementById('slip-settlement-select');
  if (curSettlementSelect) {
    const validEntries = Object.entries(SETTLEMENT_CONFIG).filter(([key]) => allowed.includes(key));
    curSettlementSelect.innerHTML = validEntries.map(([key, val]) => {
      return `<option value="${key}" ${key === currentSettlementType ? 'selected' : ''}>
        ${val.label}
      </option>`;
    }).join('');
  }

  // 常规单 vs 特殊单 动静分流展示
  const isSpecialOrder = (returnItems.length > 0 || exchangeItems.length > 0);
  
  const headerTitle = document.getElementById('slip-modal-header-title');
  const badgeSpecial = document.getElementById('badge-special-order');
  const boxReturn = document.getElementById('box-return-items');
  const boxExchange = document.getElementById('box-exchange-items');
  const summaryRows = document.getElementById('slip-summary-rows');
  const netLabel = document.getElementById('slip-net-label');
  const proofBox = document.getElementById('slip-proof-upload-box');

  if (isSpecialOrder) {
    if (headerTitle) headerTitle.innerText = '随车送货履约契单';
    badgeSpecial?.classList.remove('hidden');
    boxReturn?.classList.toggle('hidden', returnItems.length === 0);
    boxExchange?.classList.toggle('hidden', exchangeItems.length === 0);
    summaryRows?.classList.remove('hidden');
    if (netLabel) netLabel.innerText = '实结净资额度：';
    proofBox?.classList.remove('hidden');
  } else {
    if (headerTitle) headerTitle.innerText = '随车送货签收凭单';
    badgeSpecial?.classList.add('hidden');
    boxReturn?.classList.add('hidden');
    boxExchange?.classList.add('hidden');
    summaryRows?.classList.add('hidden');
    if (netLabel) netLabel.innerText = '本次应付金额：';
    proofBox?.classList.add('hidden');
  }

  renderSlipItemList('slip-order-items-list', orderItems, 'order');
  if (returnItems.length > 0) renderSlipItemList('slip-return-items-list', returnItems, 'return');
  if (exchangeItems.length > 0) renderSlipItemList('slip-exchange-items-list', exchangeItems, 'exchange');

  const orderTotal = orderItems.reduce((a, b) => a + (b.price * b.qty), 0);
  const returnTotal = returnItems.reduce((a, b) => a + (b.price * b.qty), 0);
  const netTotal = Math.max(0, orderTotal - returnTotal);

  safeSetText('slip-order-total', `¥${orderTotal.toFixed(2)}`);
  safeSetText('slip-return-total', `-¥${returnTotal.toFixed(2)}`);
  safeSetText('slip-net-total', `¥${netTotal.toFixed(2)}`);

  window.openModal('settlement-slip-modal');
};

function renderSlipItemList(containerId, items, type) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = items.map(it => {
    if (type === 'order') {
      return `
        <div class="flex justify-between items-center py-1.5 border-b border-stone-50">
          <div>
            <b class="text-stone-800 text-xs">${it.name}</b>
            <span class="text-[10px] text-stone-400 block">${it.spec || '整装'} · ¥${it.price.toFixed(2)} x ${it.qty}箱</span>
          </div>
          <b class="text-stone-900 font-mono text-xs">¥${(it.price * it.qty).toFixed(2)}</b>
        </div>
      `;
    } else if (type === 'return') {
      return `
        <div class="flex justify-between items-center py-1.5 border-b border-rose-100/40 text-rose-700">
          <div>
            <b class="text-xs">${it.name}</b>
            <span class="text-[10px] text-rose-500 block">原价 ¥${it.price.toFixed(2)} x ${it.qty}箱 · [${it.reason}]</span>
          </div>
          <b class="font-mono text-xs">-¥${(it.price * it.qty).toFixed(2)}</b>
        </div>
      `;
    } else {
      return `
        <div class="flex justify-between items-center py-1.5 border-b border-amber-100/40 text-amber-900">
          <div>
            <b class="text-xs">${it.name}</b>
            <span class="text-[10px] text-amber-700 block">平价对换 x ${it.qty}箱 · [${it.reason}]</span>
          </div>
          <span class="font-mono text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">差额 ¥0.00</span>
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
  alert('📷 异常凭据拍照已附存！');
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
    btn.innerText = '正在传达供货庄...';
  }

  try {
    await StoreService.submitComprehensiveOrder({
      tenantId: currentAgent,
      storeId: currentStore ? currentStore.id : 1,
      storeName: currentStore ? currentStore.name : '厚德便民老店',
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

    alert(`🎉 凭单已顺利传达供货厂商！\n应付净额: ¥${netTotal.toFixed(2)}\n厂家应允后师傅随车送抵！`);

    for (const k of Object.keys(cart)) delete cart[k];
    saveAgentCart();
    uploadedProofImages = [];
    deliveryNote = '';
    window.closeModal('settlement-slip-modal');
    await initTerminal();
  } catch (err) {
    alert(`传达失败: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = '✅ 确认凭单 · 传至供货庄';
    }
  }
};

// ==========================================
// 7. 捎话机制：自由随心输入 + 常用气泡 + 记忆
// ==========================================
const STORE_CUSTOM_NOTES_KEY = 'b2b_store_custom_notes';
let myCustomNotes = [];
try {
  myCustomNotes = JSON.parse(localStorage.getItem(STORE_CUSTOM_NOTES_KEY)) || [];
} catch (e) {
  myCustomNotes = [];
}

window.renderDynamicNotes = function() {
  const box = document.getElementById('dynamic-notes-box');
  if (!box) return;

  const systemNotes = ShopTypeManager.getDynamicNotes(shopType);
  const combined = Array.from(new Set([...myCustomNotes, ...systemNotes]));

  box.innerHTML = combined.map(n => `
    <button type="button" onclick="window.appendDeliveryNote('${n}')" class="bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-0.5 rounded-lg whitespace-nowrap active:scale-95 transition">
      ${n}
    </button>
  `).join('');
};

window.promptCustomDeliveryNote = function() {
  const current = deliveryNote || '';
  const input = prompt('💬 随车捎话 / 存放口信（如：放后厨二号货架、送前提前10分钟来电等）：', current);
  if (input === null) return;
  const clean = input.trim();
  if (!clean) return;

  deliveryNote = clean;

  if (!myCustomNotes.includes(clean)) {
    if (confirm(`是否将「${clean}」保存为本店常用口信标签，方便下次一键点选？`)) {
      myCustomNotes.unshift(clean);
      if (myCustomNotes.length > 6) myCustomNotes.pop();
      localStorage.setItem(STORE_CUSTOM_NOTES_KEY, JSON.stringify(myCustomNotes));
      window.renderDynamicNotes();
    }
  }

  alert(`✅ 随车口信已记下：「${deliveryNote}」`);
};

window.appendDeliveryNote = (txt) => {
  deliveryNote = deliveryNote ? `${deliveryNote}；${txt}` : txt;
  alert(`已附加随车口信：「${deliveryNote}」`);
};

// ==========================================
// 8. 快捷工具与锦囊
// ==========================================
window.repeatLastOrder = async function () {
  if (!currentStore) return alert('当前供货厂家未绑定有效小店档案！');

  const myOrders = await StoreService.getMyOrders(currentStore.id, currentAgent);
  if (!myOrders || myOrders.length === 0) {
    return alert('暂无往来报单存根！');
  }

  const lastOrder = myOrders[0];
  const items = Array.isArray(lastOrder.items) ? lastOrder.items : [];
  if (items.length === 0) return alert('上张契单无明细商品');

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
  alert(`✅ 已一键填回上单的 ${addedCount} 样常进货品！`);
};

window.clearCurrentCart = function () {
  if (Object.keys(cart).length === 0) return alert('待订篮已经是空的');
  const curName = myAgents.find(a => a.id === currentAgent)?.name || currentAgent;
  if (confirm(`确认清空【${curName}】的待订品物？`)) {
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
    `📊 【${curName}】往来账本概览：\n\n` +
    `• 本厂家待平账期存量：${debt}\n` +
    `• 互信授信可用余量：${avail}\n` +
    `• 借用周转筐：${basket}\n\n` +
    `可于右上角「···」菜单查验历次交接契单。`
  );
};

window.focusProductSearch = function () {
  const keyword = prompt('请输入想要查寻的货品全名或关键字：');
  if (!keyword || !keyword.trim()) return;

  const target = keyword.trim().toLowerCase();
  const matched = allProducts.filter(p => p.name.toLowerCase().includes(target));

  if (matched.length === 0) {
    return alert(`未在货单中找到含「${keyword}」的好物。`);
  }

  currentCategory = '全部';
  renderCategoryTabs();
  const oldAll = allProducts;
  allProducts = matched;
  renderProductList();
  allProducts = oldAll;
  alert(`🔍 已置顶呈现 ${matched.length} 件相关品物。`);
};

// ==========================================
// 9. 宣发画报中心
// ==========================================
window.openMarketingCenter = () => {
  if (allProducts.length === 0) return alert('当前没有可做画报的货品！');
  window.configureFlyer(allProducts[0].id);
};

window.configureFlyer = (prodId) => {
  const prod = allProducts.find(x => x.id === prodId);
  if (!prod) return;
  currentFlyerProd = prod;
  if (!currentFlyerStyle) {
    currentFlyerStyle = (shopType === '餐饮饭庄') ? 'honest' : 'neighborhood';
  }

  const defaultPrice = (ShopTypeManager.getEffectivePrice(prod, shopType) * 1.15).toFixed(1);
  const shopName = currentStore ? currentStore.name : '厚德老店';

  const titleEl = document.getElementById('flyer-title-input');
  const tagEl = document.getElementById('flyer-tagline-input');
  const priceEl = document.getElementById('flyer-price-input');
  const noteEl = document.getElementById('flyer-note-input');
  const prodNameEl = document.getElementById('flyer-prod-name');

  if (titleEl) titleEl.value = `【${shopName}】正品现货`;
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
    <button type="button" onclick="window.setFlyerStyle('${key}')" class="px-2.5 py-1 rounded-xl text-xs font-bold border transition ${currentFlyerStyle === key ? 'bg-stone-900 text-white border-stone-900 shadow' : 'bg-stone-100 text-stone-600 border-stone-200'}">
      ${item.name}
    </button>
  `).join('');
}

window.applyQuickNote = (type) => {
  const noteMap = {
    'daily': '💬 掌柜交心话：日用洗护用得快，大厂原装大宗包装，量大经用，格外划算！',
    'general': '💬 掌柜承诺：厚道人做厚道买卖，不售杂劣山寨货，街坊请宽心买！',
    'food': '💬 掌柜叮咛：正规大厂全新批次，原装封签完整，自家人天天也在用，品质踏实！'
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
  const shopName = currentStore ? currentStore.name : '厚德老店';

  const dataUrl = await MarketingCanvas.generate(canvas, currentFlyerProd, shopName, currentFlyerStyle, title, tagline, price, note);
  const previewImg = document.getElementById('flyer-preview-img');
  if (previewImg) previewImg.src = dataUrl;
};

// ==========================================
// 10. 业态选择
// ==========================================
window.selectShopType = (type) => {
  shopType = type;
  localStorage.setItem('active_shop_type', shopType);
  renderShopType();
  window.renderDynamicNotes();
  renderProductList();
  updateCartSummary();
  document.getElementById('shop-type-dropdown')?.classList.add('hidden');
};

function renderShopType() {
  const el = document.getElementById('shop-type-badge');
  if (el) el.innerHTML = `<span>${ShopTypeManager.icons[shopType] || '🏪'} ${shopType}</span> ▾`;
}

window.callDriver = () => {
  const driver = currentStore ? (currentStore.driver_name || '老张师傅') : '配送长兄';
  alert(`正连线送货长兄【${driver}】...`);
  window.location.href = 'tel:13800138000';
};

// ==========================================
// 11. 货品列表渲染
// ==========================================
function renderCategoryTabs() {
  const categories = ['全部', ...new Set(allProducts.map(p => p.category_main).filter(Boolean))];
  const bar = document.getElementById('category-bar');
  if (!bar) return;
  bar.innerHTML = categories.map(c => `
    <button type="button" onclick="window.filterCategory('${c}')" class="cat-pill ${c === currentCategory ? 'bg-stone-900 text-white shadow-sm' : 'bg-stone-100 text-stone-600'} px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition">
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
      ? 'tag-filter-chip bg-stone-900 text-white px-2.5 py-0.5 rounded-lg whitespace-nowrap font-bold shadow-sm'
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
    container.innerHTML = '<div class="p-12 text-center text-stone-400 text-xs">当前暂无符合条件的在供货品</div>';
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
                规格: ${p.spec || '整装'} · 存量: ${isOutOfStock ? '<span class="text-rose-600 font-bold">已售罄</span>' : `${stock}箱`}
              </div>
              <div class="text-xs font-bold text-stone-900 mt-0.5 font-mono flex items-center gap-1">
                ¥${price.toFixed(2)} <span class="text-[10px] text-stone-400 font-normal">/${p.pack_unit || '箱'}</span>
                ${isTier2 ? `<span class="text-[9px] bg-amber-50 text-amber-900 border border-amber-200 px-1 rounded font-normal">大客价</span>` : ''}
              </div>
            </div>
          </div>
          
          <div class="flex items-center gap-1.5 pt-1">
            <button type="button" onclick="window.changeOrderQty(${p.id}, -1)" class="w-7 h-7 rounded-xl bg-stone-100 active:scale-95 font-bold text-stone-600 flex items-center justify-center text-sm shadow-sm">-</button>
            <span id="qty-order-${p.id}" class="w-6 text-center font-bold text-xs font-mono">${curState.order || 0}</span>
            <button type="button" onclick="window.changeOrderQty(${p.id}, 1)" ${isOutOfStock ? 'disabled' : ''} class="w-7 h-7 rounded-xl ${isOutOfStock ? 'bg-stone-200 text-stone-400' : 'bg-stone-900 text-white active:scale-95'} font-bold flex items-center justify-center text-sm shadow-sm">+</button>
          </div>
        </div>

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

          <button type="button" onclick="window.configureFlyer(${p.id})" class="text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 px-2.5 py-0.5 rounded-xl font-bold flex items-center gap-1 active:scale-95 transition">
            📲 做海报
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 12. 单据存根与收据查验
// ==========================================
window.openReceiptsModal = async () => {
  if (!currentStore) return alert('当前供货商未绑定有效小店档案！');
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

      let statusBadge = '<span class="text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded font-bold">🚚 排单备发</span>';
      if (o.order_status === 'counter_proposal') {
        statusBadge = '<span class="text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-bold animate-pulse">💬 厂商有修润建议</span>';
      } else if (o.order_status === 'confirmed') {
        statusBadge = '<span class="text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded font-bold">✅ 厂商已应允接单</span>';
      } else if (o.delivery_status === 'delivered') {
        statusBadge = '<span class="text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded">📦 已经交割平账</span>';
      }

      return `
        <div class="p-3 bg-stone-50 border ${o.order_status === 'counter_proposal' ? 'border-amber-400 bg-amber-50/30' : 'border-stone-200'} rounded-2xl space-y-1.5 text-xs">
          <div class="flex justify-between items-center font-bold">
            <span class="text-stone-800">流水 #${o.order_no || o.id}</span>
            ${statusBadge}
          </div>

          ${o.order_status === 'counter_proposal' ? `
            <div class="p-2 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 space-y-1">
              <div class="font-bold flex items-center gap-1 text-[11px]">
                <span>📢 厂家商榷建议：</span>
              </div>
              <div class="text-[11px] leading-snug">${o.vendor_feedback || '厂家对单据有微调建议，请查阅。'}</div>
              <div class="pt-1 flex gap-2 justify-end">
                <button type="button" onclick="window.cancelProposalOrder(${o.id})" class="px-2 py-1 rounded-lg bg-stone-200 text-stone-600 text-[10px] font-bold">撤单作罢</button>
                <button type="button" onclick="window.acceptProposalAndReload(${o.id})" class="px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold shadow">按建议微调重发</button>
              </div>
            </div>
          ` : ''}

          <div class="text-[10px] text-stone-600">📦 新订: ${orderStr || '无'}</div>
          ${returnStr ? `<div class="text-[10px] text-rose-600 font-medium">🔄 验退: ${returnStr}</div>` : ''}
          ${exchangeStr ? `<div class="text-[10px] text-amber-800 font-medium">🔀 对调: ${exchangeStr}</div>` : ''}

          <div class="flex justify-between items-center text-[10px] text-stone-400 pt-1 border-t border-stone-100">
            <span>实结: <b class="text-stone-800 font-mono">¥${parseFloat(o.net_settle_amount || o.total_amount).toFixed(2)}</b> (${o.settlement_type})</span>
            <span>${new Date(o.created_at).toLocaleTimeString()}</span>
          </div>
        </div>
      `;
    }).join('') || '<div class="text-stone-400 text-center py-4">暂无单据存根</div>';
  }

  const myReceipts = await StoreService.getMyReceipts(currentStore.id, currentAgent);
  const receiptsListEl = document.getElementById('my-receipts-list');
  if (receiptsListEl) {
    receiptsListEl.innerHTML = myReceipts.map(r => `
      <div class="p-2.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1 text-xs">
        <div class="flex justify-between font-bold text-stone-900">
          <span>送货长兄: ${r.driver_name}</span>
          <span>实交款: ¥${parseFloat(r.amount).toFixed(2)} (${r.pay_method})</span>
        </div>
        ${r.basket_return ? `<div class="text-[10px] text-amber-800">退还周转筐: ${r.basket_return} 个 (折抵 ¥${r.basket_deduct_amount})</div>` : ''}
        <div class="text-[10px] text-stone-400">核销时间: ${new Date(r.created_at).toLocaleString()}</div>
      </div>
    `).join('') || '<div class="text-stone-400 text-center py-2">暂无还款记录</div>';
  }
};

window.cancelProposalOrder = async (orderId) => {
  if (!confirm('确认作废撤回该单？')) return;
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
  alert('已将原单品物重新载入货篮，请根据厂家建议微调后提交！');
  window.openSettlementModal();
};

// ==========================================
// 13. 系统初始化入口
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
    safeSetText('store-title', currentStore.name || '厚德便民老店');
    safeSetText('store-boss', currentStore.contact || '主人家');
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
    safeSetText('store-driver', '待派送货长兄');
    safeSetText('store-basket-count', '0 个');
    safeSetText('credit-avail', '¥2000.00');
    safeSetText('credit-debt', '¥0.00');
  }

  renderShopType();
  window.renderDynamicNotes();

  allProducts = await StoreService.getProducts(currentAgent, currentStore?.visible_product_ids);
  renderCategoryTabs();
  renderProductList();
  updateCartSummary();

  await checkVendorProposalBadge();
}

initTerminal();
