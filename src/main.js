import { supabase } from './lib/supabase.js';
import { StoreService } from './services/storeService.js';
import { ShopTypeManager } from './modules/shopTypeManager.js';
import { MarketingCanvas } from './modules/marketingCanvas.js';
import { SETTLEMENT_CONFIG, RETURN_REASONS, EXCHANGE_REASONS } from './constants/settlement.js';

// ==========================================
// 0. 双向兼容 ShopTypeManager 辅助适配器
// ==========================================
function getShopIcon(type) {
  if (ShopTypeManager.icons && ShopTypeManager.icons[type]) return ShopTypeManager.icons[type];
  if (typeof ShopTypeManager.getPreset === 'function') return ShopTypeManager.getPreset(type).icon || '🏷️';
  return '🏷️';
}

function getShopDynamicNotes(type) {
  if (typeof ShopTypeManager.getDynamicNotes === 'function') return ShopTypeManager.getDynamicNotes(type);
  if (typeof ShopTypeManager.getPreset === 'function') return ShopTypeManager.getPreset(type).voice_prompts || [];
  return ['按本周真实用度清单配货，请核对好数量与规格'];
}

function detectShopType(storeName = '') {
  if (typeof ShopTypeManager.autoDetect === 'function') return ShopTypeManager.autoDetect(storeName);
  const keys = typeof ShopTypeManager.getAllPresetKeys === 'function' ? ShopTypeManager.getAllPresetKeys() : [];
  const found = keys.find((k) => storeName.includes(k.slice(0, 2)));
  return found || '社区便利';
}

function calcBasePrice(prod, type) {
  if (typeof ShopTypeManager.getEffectivePrice === 'function') {
    return ShopTypeManager.getEffectivePrice(prod, type);
  }
  const bigShopTypes = ['餐饮饭庄', '精品商超', '五金机电', '农资农具'];
  if (bigShopTypes.includes(type) && prod.tier_2_price) {
    return parseFloat(prod.tier_2_price);
  }
  return parseFloat(prod.tier_1_price || 0);
}

// ==========================================
// 1. 多供货方名册管理与三态隔离购物车 (订/退/换)
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
// 运营工具 1：群机器人自动报单通知推送器
// ==========================================
async function notifyVendorWebhook(tenantId, messageText) {
  try {
    const { data: tenant } = await supabase
      .from('platform_tenant')
      .select('webhook_url')
      .eq('tenant_id', tenantId)
      .single();

    const url = (tenant?.webhook_url || '').trim();
    if (!url || !url.startsWith('http')) return;

    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content: messageText },
        content: { text: messageText }
      })
    });
  } catch (e) {
    console.warn('群机器人推送跳过:', e);
  }
}

// ==========================================
// 运营工具 2：本店云端扩充货架码（百工天街邻里服务润利）
// ==========================================
window.openCloudShelfModal = function () {
  window.closeAllMenus();
  const storeName = currentStore?.name || (document.getElementById('store-title')?.innerText || '').trim() || '厚德便民门店';
  const storeIdParam = currentStore?.id ? `?ref=${encodeURIComponent(currentStore.id)}` : '';
  const cloudShelfUrl = `${window.location.origin}/mall.html${storeIdParam}`;

  safeSetText('cloud-shelf-store-title', `${storeName} · 云端扩充货架`);
  safeSetText('cloud-shelf-link-text', cloudShelfUrl);
  const qrImg = document.getElementById('cloud-shelf-qr-img');
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(cloudShelfUrl)}`;
  }
  window.openModal('cloud-shelf-modal');
};

window.copyCloudShelfLink = function () {
  const storeName = currentStore?.name || (document.getElementById('store-title')?.innerText || '').trim() || '厚德便民门店';
  const link = document.getElementById('cloud-shelf-link-text')?.innerText || `${window.location.origin}/mall.html`;
  const shareText = `【${storeName} · 云端扩充货架】店里摆不下的源头整箱良品、产区特产与按需定制品，扫码直达源头合作社与工坊选货，支持送到本店自提验货：${link}`;
  navigator.clipboard.writeText(shareText).then(() => {
    alert('✅ 本店云端扩充货架分享文案与链接已复制！街坊扫码预订，服务润利全额归属本店。');
  });
};

// ==========================================
// 运营工具 3：推荐同行互助裂变弹窗
// ==========================================
window.openReferralModal = function () {
  window.closeAllMenus();
  const storeName = currentStore?.name || (document.getElementById('store-title')?.innerText || '').trim() || '厚德便民门店';
  const curAgentObj = myAgents.find(a => a.id === currentAgent);
  const agentName = curAgentObj?.name || currentAgent;
  const refUrl = `${window.location.origin}/suppliers.html?t=${encodeURIComponent(currentAgent)}&ref=${encodeURIComponent(storeName)}`;

  safeSetText('ref-store-title', `${storeName} · 诚意推荐`);
  safeSetText('ref-agent-subtitle', `携手【${agentName}】源头平准直供 · 送货到店`);
  const qrImg = document.getElementById('ref-qr-img');
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(refUrl)}`;
  }
  window.openModal('referral-modal');
};

window.copyReferralShareText = function () {
  const storeName = currentStore?.name || (document.getElementById('store-title')?.innerText || '').trim() || '厚德便民门店';
  const curAgentObj = myAgents.find(a => a.id === currentAgent);
  const agentName = curAgentObj?.name || currentAgent;
  const refUrl = `${window.location.origin}/suppliers.html?t=${encodeURIComponent(currentAgent)}&ref=${encodeURIComponent(storeName)}`;
  const shareText = `【同行推荐】我们门店一直在用【${agentName}】的货，源头合作社与工坊直供、工价实在、送货准时！通过我的专属链接预约送货师傅免费上门送样：${refUrl}`;
  navigator.clipboard.writeText(shareText).then(() => {
    alert('✅ 专属同行推荐话术与链接已复制，可直接转发微信好友或同业群！');
  });
};

// ==========================================
// 统一一店一约 & 协议折扣算价引擎
// ==========================================
function getStorePriceInfo(prod) {
  const basePrice = calcBasePrice(prod, shopType);
  const pricing = (currentStore && currentStore.custom_pricing && typeof currentStore.custom_pricing === 'object')
    ? currentStore.custom_pricing
    : {};

  if (pricing.item_prices && pricing.item_prices[String(prod.id)] !== undefined) {
    const special = parseFloat(pricing.item_prices[String(prod.id)]);
    if (!isNaN(special) && special > 0) {
      return { price: special, badge: '专属协议工价' };
    }
  }

  let tierPrice = basePrice;
  let badge = (basePrice < parseFloat(prod.tier_1_price || basePrice)) ? '集采惠价' : '';
  if (pricing.price_tier === 'tier_2' && prod.tier_2_price) {
    tierPrice = parseFloat(prod.tier_2_price);
    badge = '集采惠价';
  }

  const rate = parseFloat(pricing.discount_rate || 1);
  if (!isNaN(rate) && rate > 0 && rate !== 1) {
    const discounted = Number((tierPrice * rate).toFixed(2));
    return { price: discounted, badge: `协议${(rate * 10).toFixed(1)}折` };
  }

  return { price: tierPrice, badge };
}

async function uploadProofBlobToStorage(base64Data) {
  if (!base64Data || !base64Data.startsWith('data:image')) return base64Data;
  try {
    const res = await fetch(base64Data);
    const blob = await res.blob();
    const fileName = `store_proofs/${currentAgent}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage.from('supply-images').upload(fileName, blob, { contentType: 'image/jpeg' });
    if (error) return base64Data;
    const { data } = supabase.storage.from('supply-images').getPublicUrl(fileName);
    return data?.publicUrl || base64Data;
  } catch (e) {
    return base64Data;
  }
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
// 3. 供货合作方导航：适配社区门店与大型食堂卖场
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

  if (myAgents.length > 4) {
    btnAll?.classList.remove('hidden');
  } else {
    btnAll?.classList.add('hidden');
  }

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

window.openAllAgentsModal = function () {
  window.renderAllAgentsList(myAgents);
  window.openModal('all-agents-modal');
};

window.renderAllAgentsList = function (list) {
  const container = document.getElementById('all-agents-container');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<div class="py-6 text-center text-stone-400 text-xs">未找到符合条件的合作供货方</div>';
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
            : `<button type="button" onclick="window.switchActiveAgent('${ag.id}'); window.closeModal('all-agents-modal');" class="text-xs text-stone-600 hover:text-stone-900 font-bold bg-stone-100 hover:bg-stone-200 px-2.5 py-1 rounded-lg transition">进入选购 ➔</button>`
          }
          <button type="button" onclick="window.confirmUnbindAgent('${ag.id}')" class="text-[10px] text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded-lg transition font-medium" title="解除合作">
            解绑
          </button>
        </div>
      </div>
    `;
  }).join('');
};

window.filterAgentList = function (keyword) {
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

window.filterAgentByCategory = function (cat) {
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
// 4. 接入与解绑供货合作方
// ==========================================
window.bindByCode = async function () {
  const inputEl = document.getElementById('bind-input-code');
  const rawCode = (inputEl ? inputEl.value : '').trim().toUpperCase();

  if (!rawCode) {
    return alert('请输入供货方提供的商号代号！');
  }

  let targetAgentId = '';
  let targetAgentName = '';

  if (rawCode === 'BJ_SHUNDA') {
    targetAgentId = 'BJ_SHUNDA';
    targetAgentName = '北京顺达 (粮油副食)';
  } else if (rawCode === 'SH_LEGOU') {
    targetAgentId = 'SH_LEGOU';
    targetAgentName = '上海乐购 (酒水副食)';
  } else {
    const { data, error } = await supabase
      .from('platform_tenant')
      .select('*')
      .eq('tenant_id', rawCode)
      .limit(1);

    if (error) {
      return alert('查询供货方失败：' + error.message);
    }

    if (data && data.length > 0) {
      const supplier = data[0];
      if (!supplier.is_active || supplier.membership_status === 'paused') {
        return alert(`供货方【${supplier.company_name}】当前处于「商道暂歇」状态，暂不可接入。`);
      }
      targetAgentId = supplier.tenant_id;
      targetAgentName = supplier.company_name;
    } else {
      return alert(`未查到商号代号为【${rawCode}】的在册供货合作方！\n请向供货方确认商号代号是否拼写正确。`);
    }
  }

  if (!myAgents.some(a => a.id === targetAgentId)) {
    myAgents.push({ id: targetAgentId, name: targetAgentName });
    localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(myAgents));
  }

  if (inputEl) inputEl.value = '';
  alert(`🎉 成功接入新供货合作方【${targetAgentName}】(${targetAgentId})！`);
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
      myAgents.push({ id: targetAgentId, name: `${store.name}供货方` });
      localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(myAgents));
    }
    alert(`🎉 绑定成功！欢迎【${store.name}】掌柜！`);
    window.closeModal('bind-agent-modal');
    await window.switchActiveAgent(targetAgentId);
  } else {
    alert('未在名册中查到该手机号，请联系送货师傅或合作社/工坊建档。');
  }
};

window.confirmUnbindAgent = async function (targetAgentId) {
  if (myAgents.length <= 1) {
    return alert('⚠️ 至少需要保留一家供货合作方，无法解绑全部商号！');
  }

  const targetAgent = myAgents.find(a => a.id === targetAgentId);
  const targetName = targetAgent ? (targetAgent.name || targetAgent.id) : targetAgentId;

  const storeRecord = await StoreService.getStoreByTenant(targetAgentId);
  const debt = parseFloat(storeRecord?.current_debt || 0);
  const baskets = parseInt(storeRecord?.basket_count || 0);

  if (debt > 0 || baskets > 0) {
    let reason = [];
    if (debt > 0) reason.push(`尚有挂账货资 ¥${debt.toFixed(2)} 未结清`);
    if (baskets > 0) reason.push(`借存周转筐/载具 ${baskets} 件未归还`);

    return alert(
      `🤝 君子之交 · 善始善终：\n\n` +
      `本店在【${targetName}】处：\n• ${reason.join('\n• ')}\n\n` +
      `商道贵在诚信相照，请联系送货师傅核销清账、交还周转载具后，方可解除合作。`
    );
  }

  const myOrders = await StoreService.getMyOrders(storeRecord?.id, targetAgentId);
  const hasPending = myOrders.some(o => o.delivery_status !== 'delivered' && o.order_status !== 'cancelled');
  if (hasPending) {
    return alert(`⚠️ 本店在【${targetName}】尚有正在配发中的随车单据，请待货物送达点验平账后再行解绑！`);
  }

  if (confirm(`【解绑确认】\n\n确认与供货方【${targetName}】解除合作？\n• 该供货方当前账款已结清 (¥0.00)\n• 解绑后将从掌中宝名册中移出该供货方货单`)) {
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

window.confirmUnbindCurrentAgent = function () {
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
// 5. 货品卡片三态集成操作 (补 / 退 / 换)
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
  const unit = prod?.measure_unit || prod?.pack_unit || '箱';
  let newQty = cart[id].order + delta;

  if (newQty < 0) newQty = 0;
  if (newQty > stock) {
    alert(`在库现货仅剩 ${stock} ${unit}！`);
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

  if (!currentStore) return alert('当前供货方未绑定有效门店档案，无法追溯订购！');

  const quota = await StoreService.getProductReturnableQuota(currentStore.id, currentAgent, id);
  if (quota.maxReturnable <= 0) {
    return alert(`⚠️ 商道信义提示：\n本店在【${currentAgent}】处暂无【${prod.name}】的历史有效余量！\n系统严格追溯进货存根，不进不退。`);
  }

  const unit = prod.measure_unit || prod.pack_unit || '箱';
  const origPrice = quota.lastPrice || getStorePriceInfo(prod).price;
  cart[id].returnPrice = origPrice;

  const currentReturnQty = cart[id].return || 1;
  const input = prompt(
    `🔄 登记退货验还：【${prod.name}】\n` +
    `• 追溯原单: ${quota.lastOrderNo || '线上记录'}\n` +
    `• 历史原进价: ¥${origPrice.toFixed(2)} /${unit}\n` +
    `• 累计进: ${quota.totalOrdered}${unit} | 已退换: ${quota.totalReturned}${unit}\n` +
    `• 【当前最大可退上限】: ${quota.maxReturnable} ${unit}\n\n` +
    `请输入本次退货件数 (设为0取消):`,
    Math.min(currentReturnQty, quota.maxReturnable)
  );

  if (input === null) return;
  const parsedQty = parseInt(input);
  if (isNaN(parsedQty) || parsedQty < 0) return alert('请输入有效的件数！');

  if (parsedQty > quota.maxReturnable) {
    return alert(`⚠️ 超额拦截：本次退货 ${parsedQty} ${unit}，超出历史进货余量 (${quota.maxReturnable} ${unit})！依规严禁超额抵扣。`);
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

  if (!currentStore) return alert('当前供货方未绑定有效门店档案！');

  const quota = await StoreService.getProductReturnableQuota(currentStore.id, currentAgent, id);
  if (quota.maxReturnable <= 0) {
    return alert(`⚠️ 本店无【${prod.name}】历史进货余量，无法发起对调平换！`);
  }

  const unit = prod.measure_unit || prod.pack_unit || '箱';
  const currentExchangeQty = cart[id].exchange || 1;
  const input = prompt(
    `🔀 登记等价平换：【${prod.name}】\n` +
    `• 规则: 一新换一旧 (差额 ¥0.00)\n` +
    `• 关联历史进货余量上限: ${quota.maxReturnable} ${unit}\n\n` +
    `请输入调换件数 (设为0取消):`,
    Math.min(currentExchangeQty, quota.maxReturnable)
  );

  if (input === null) return;
  const parsedQty = parseInt(input);
  if (isNaN(parsedQty) || parsedQty < 0) return alert('请输入有效的件数！');

  if (parsedQty > quota.maxReturnable) {
    return alert(`⚠️ 调换件数不能超过历史进货余量 (${quota.maxReturnable} ${unit})！`);
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
    const { price } = getStorePriceInfo(prod);

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
    labelEl.innerText = hasSpecial ? '预结净资 (补-退):' : '本次应结金额:';
  }

  const btnTextEl = document.getElementById('btn-submit-order-text');
  if (btnTextEl) {
    btnTextEl.innerText = hasSpecial ? '生成调退履约契单' : '生成送货凭单';
  }

  const detailEl = document.getElementById('cart-detail-subtext');
  if (detailEl) {
    detailEl.innerText = hasSpecial
      ? `补 ${orderCount} | 退 ${returnCount} (-¥${returnTotal.toFixed(1)}) | 换 ${exchangeCount}`
      : `补货 ${orderCount} 件`;
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
    const { price } = getStorePriceInfo(p);
    const unit = p.measure_unit || p.pack_unit || '箱';

    if (data.order > 0) {
      orderItems.push({ id: p.id, name: p.name, spec: p.spec, measure_unit: unit, price, qty: data.order });
    }
    if (data.return > 0) {
      returnItems.push({
        id: p.id,
        name: p.name,
        spec: p.spec,
        measure_unit: unit,
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
        measure_unit: unit,
        qty: data.exchange,
        reason: data.exchangeReason
      });
    }
  }

  if (orderItems.length === 0 && returnItems.length === 0 && exchangeItems.length === 0) {
    return alert('当前待配篮空空如也，请先挑选良品！');
  }

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
    if (netLabel) netLabel.innerText = '本次应结金额：';
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
    const unit = it.measure_unit || '箱';
    if (type === 'order') {
      return `
        <div class="flex justify-between items-center py-1.5 border-b border-stone-50">
          <div>
            <b class="text-stone-800 text-xs">${it.name}</b>
            <span class="text-[10px] text-stone-400 block">${it.spec || '整装'} · ¥${it.price.toFixed(2)} x ${it.qty}${unit}</span>
          </div>
          <b class="text-stone-900 font-mono text-xs">¥${(it.price * it.qty).toFixed(2)}</b>
        </div>
      `;
    } else if (type === 'return') {
      return `
        <div class="flex justify-between items-center py-1.5 border-b border-rose-100/40 text-rose-700">
          <div>
            <b class="text-xs">${it.name}</b>
            <span class="text-[10px] text-rose-500 block">原价 ¥${it.price.toFixed(2)} x ${it.qty}${unit} · [${it.reason}]</span>
          </div>
          <b class="font-mono text-xs">-¥${(it.price * it.qty).toFixed(2)}</b>
        </div>
      `;
    } else {
      return `
        <div class="flex justify-between items-center py-1.5 border-b border-amber-100/40 text-amber-900">
          <div>
            <b class="text-xs">${it.name}</b>
            <span class="text-[10px] text-amber-700 block">平价对换 x ${it.qty}${unit} · [${it.reason}]</span>
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
    const file = files[i];
    const reader = new FileReader();
    reader.onload = function (ev) {
      const img = new Image();
      img.onload = async function () {
        const canvasEl = document.createElement('canvas');
        const maxDim = 640;
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h *= maxDim / w; w = maxDim; }
        else if (h > maxDim) { w *= maxDim / h; h = maxDim; }
        canvasEl.width = w; canvasEl.height = h;
        canvasEl.getContext('2d').drawImage(img, 0, 0, w, h);

        const base64 = canvasEl.toDataURL('image/jpeg', 0.72);
        const idx = uploadedProofImages.length;
        uploadedProofImages.push(base64);
        renderProofImagesStrip();

        const cdnUrl = await uploadProofBlobToStorage(base64);
        if (uploadedProofImages[idx]) {
          uploadedProofImages[idx] = cdnUrl;
          renderProofImagesStrip();
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }
  alert('📷 异常凭据拍照已附存！');
};

function renderProofImagesStrip() {
  const preview = document.getElementById('proof-preview-container');
  if (preview) {
    preview.innerHTML = uploadedProofImages.map(src => `
      <img src="${src}" class="w-12 h-12 rounded-lg object-cover border border-stone-300">
    `).join('');
  }
}

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
    const { price } = getStorePriceInfo(p);
    const unit = p.measure_unit || p.pack_unit || '箱';

    if (data.order > 0) orderItems.push({ id: p.id, name: p.name, spec: p.spec, measure_unit: unit, price, qty: data.order });
    if (data.return > 0) returnItems.push({ id: p.id, name: p.name, spec: p.spec, measure_unit: unit, price: data.returnPrice || price, qty: data.return, reason: data.returnReason });
    if (data.exchange > 0) exchangeItems.push({ id: p.id, name: p.name, spec: p.spec, measure_unit: unit, qty: data.exchange, reason: data.exchangeReason });
  }

  const orderTotal = orderItems.reduce((a, b) => a + (b.price * b.qty), 0);
  const returnTotal = returnItems.reduce((a, b) => a + (b.price * b.qty), 0);
  const netTotal = Math.max(0, orderTotal - returnTotal);

  const btn = document.getElementById('btn-slip-confirm');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '正在传达供货方...';
  }

  try {
    const storeName = currentStore ? currentStore.name : '厚德便民门店';
    await StoreService.submitComprehensiveOrder({
      tenantId: currentAgent,
      storeId: currentStore ? currentStore.id : 1,
      storeName: storeName,
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

    const itemsSummary = orderItems.map(i => `${i.name}x${i.qty}${i.measure_unit || '件'}`).join('、');
    const webhookMsg =
      `📦【门店补货单提醒】\n` +
      `需求门店：${storeName}\n` +
      `交割方式：${settlementType} | 应结净额：¥${netTotal.toFixed(2)}\n` +
      `货品明细：${itemsSummary || '退换货单'}\n` +
      (deliveryNote ? `随车口信：${deliveryNote}\n` : '') +
      `请登录平准调度台审核接单并生成装车总拣货单。`;
    await notifyVendorWebhook(currentAgent, webhookMsg);

    alert(`🎉 凭单已顺利传达供货合作方！\n应结净额: ¥${netTotal.toFixed(2)}\n对方确认后由送货师傅随车送抵！`);

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
      btn.innerText = '✅ 确认凭单 · 传至供货方';
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

window.renderDynamicNotes = function () {
  const box = document.getElementById('dynamic-notes-box');
  if (!box) return;

  const systemNotes = getShopDynamicNotes(shopType);
  const combined = Array.from(new Set([...myCustomNotes, ...systemNotes]));

  box.innerHTML = combined.map(n => `
    <button type="button" onclick="window.appendDeliveryNote('${n}')" class="bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-0.5 rounded-lg whitespace-nowrap active:scale-95 transition">
      ${n}
    </button>
  `).join('');
};

window.promptCustomDeliveryNote = function () {
  const current = deliveryNote || '';
  const input = prompt('💬 随车捎话 / 存放口信（如：放库房二号货架、送前提前10分钟来电等）：', current);
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
  if (!currentStore) return alert('当前供货方未绑定有效门店档案！');

  const myOrders = await StoreService.getMyOrders(currentStore.id, currentAgent);
  if (!myOrders || myOrders.length === 0) {
    return alert('暂无往来补货存根！');
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
  alert(`✅ 已一键填回上单的 ${addedCount} 样常备良品！`);
};

window.clearCurrentCart = function () {
  if (Object.keys(cart).length === 0) return alert('待配篮已经是空的');
  const curName = myAgents.find(a => a.id === currentAgent)?.name || currentAgent;
  if (confirm(`确认清空【${curName}】的待配品物？`)) {
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
  const basket = document.getElementById('store-basket-count')?.innerText || '0 件';

  alert(
    `📊 【${curName}】往来账本概览：\n\n` +
    `• 本供货方待平账期存量：${debt}\n` +
    `• 互信授信可用余量：${avail}\n` +
    `• 周转筐 / 载具结存：${basket}\n\n` +
    `可于右上角「···」菜单查验历次交接契单。`
  );
};

window.focusProductSearch = function () {
  const keyword = prompt('请输入想要查寻的货品全名或关键字：');
  if (!keyword || !keyword.trim()) return;

  const target = keyword.trim().toLowerCase();
  const matched = allProducts.filter(p =>
    p.name.toLowerCase().includes(target) ||
    JSON.stringify(p.custom_specs || {}).toLowerCase().includes(target)
  );

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
// 9. 邻里便民画报中心
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
    currentFlyerStyle = (shopType === '餐饮饭庄' || shopType === '餐饮饭店') ? 'honest' : 'neighborhood';
  }

  const defaultPrice = (getStorePriceInfo(prod).price * 1.15).toFixed(1);
  const shopName = currentStore ? currentStore.name : '厚德便民门店';

  const titleEl = document.getElementById('flyer-title-input');
  const tagEl = document.getElementById('flyer-tagline-input');
  const priceEl = document.getElementById('flyer-price-input');
  const noteEl = document.getElementById('flyer-note-input');
  const prodNameEl = document.getElementById('flyer-prod-name');

  if (titleEl) titleEl.value = `【${shopName}】源头直供现货`;
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
    'daily': '💬 掌柜交心话：日用洗护用得快，源头工坊原装大包装，量大经用，格外划算！',
    'general': '💬 掌柜承诺：厚道人做厚道买卖，源头合作社与正规工坊直供，街坊请宽心用！',
    'food': '💬 掌柜叮咛：合作社与正规大厂全新批次，原装封签完整，自家人天天也在吃，品质踏实！'
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
  const shopName = currentStore ? currentStore.name : '厚德便民门店';

  const dataUrl = await MarketingCanvas.generate(canvas, currentFlyerProd, shopName, currentFlyerStyle, title, tagline, price, note);
  const previewImg = document.getElementById('flyer-preview-img');
  if (previewImg) previewImg.src = dataUrl;
};

// ==========================================
// 10. 业态选择（支持百工百业预设 + 掌柜自定义行当）
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

window.promptCustomShopType = () => {
  document.getElementById('shop-type-dropdown')?.classList.add('hidden');
  const input = prompt('请输入本店实际经营行当（如：烘焙原料坊、茶庄烟行、母婴生活馆、建材五金店）：', shopType);
  if (!input || !input.trim()) return;
  window.selectShopType(input.trim().slice(0, 10));
};

function renderShopType() {
  const el = document.getElementById('shop-type-badge');
  if (el) el.innerHTML = `<span>${getShopIcon(shopType)} ${shopType}</span> ▾`;
}

window.callDriver = () => {
  const driver = currentStore ? (currentStore.driver_name || '老张师傅') : '送货师傅';
  alert(`正为您连线送货师傅【${driver}】...`);
  window.location.href = 'tel:13800138000';
};

// ==========================================
// 11. 货品列表渲染（兼容百业通用商道标签 + 历史标签）
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

const TAG_ALIAS_MAP = {
  '🔥 门店常备': ['🔥 门店常备', '🔥 街坊常备', '🔥 畅销常备', '🔥 街坊抢手'],
  '🌾 合作社直供': ['🌾 合作社直供', '🏪 掌柜严选', '📦 整件特惠'],
  '💎 阳光工价·诚意价': ['💎 阳光工价·诚意价', '💎 高毛利', '💎 丰厚毛利'],
  '🔄 余缺平价调剂': ['🔄 余缺平价调剂', '⏳ 临期捡漏', '🛡️ 质保/效期优', '❄️ 需冷藏', '❄️ 需冷藏保鲜']
};

window.filterBySpecialTag = (tag) => {
  currentTagFilter = tag;
  document.querySelectorAll('.tag-filter-chip').forEach(b => {
    const isMatched = (tag === '全部' && b.innerText === '全选品类') || b.innerText.startsWith(tag.slice(0, 4));
    b.className = isMatched
      ? 'tag-filter-chip bg-stone-900 text-white px-2.5 py-0.5 rounded-lg whitespace-nowrap font-bold shadow-sm'
      : 'tag-filter-chip bg-stone-100 text-stone-600 px-2.5 py-0.5 rounded-lg whitespace-nowrap';
  });
  renderProductList();
};

function renderProductList() {
  let filtered = (currentCategory === '全部') ? allProducts : allProducts.filter(p => p.category_main === currentCategory);
  if (currentTagFilter !== '全部') {
    const acceptTags = TAG_ALIAS_MAP[currentTagFilter] || [currentTagFilter];
    filtered = filtered.filter(p => Array.isArray(p.tags) && p.tags.some(t => acceptTags.includes(t)));
  }

  const container = document.getElementById('product-container');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="p-12 text-center text-stone-400 text-xs">当前暂无符合条件的在供良品</div>';
    return;
  }

  container.innerHTML = filtered.map(p => {
    const imgHtml = p.image_url
      ? `<img src="${p.image_url}" class="w-16 h-16 rounded-2xl object-cover border border-stone-200 shadow-sm shrink-0" onerror="this.src='';this.parentElement.innerHTML='<div class=\\'w-16 h-16 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-[10px] text-stone-400 shrink-0\\'>实物包</div>';">`
      : `<div class="w-16 h-16 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-[10px] text-stone-400 shrink-0">实物包</div>`;

    const tags = Array.isArray(p.tags) ? p.tags : [];
    const tagHtml = tags.map(t => `<span class="bg-amber-50 text-amber-900 border border-amber-200 text-[9px] px-1.5 py-0.2 rounded font-medium">${t}</span>`).join(' ');

    const customAttrs = (p.custom_specs && typeof p.custom_specs === 'object' && p.custom_specs.attrs) ? p.custom_specs.attrs : {};
    const attrsHtml = Object.entries(customAttrs).map(([k, v]) =>
      `<span class="bg-stone-100 text-stone-600 border border-stone-200 text-[9px] px-1.5 py-0.2 rounded">${k}:${v}</span>`
    ).join(' ');

    const { price, badge } = getStorePriceInfo(p);
    const unit = p.measure_unit || p.pack_unit || '箱';
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
              ${(tagHtml || attrsHtml) ? `<div class="mt-0.5 flex flex-wrap gap-1">${tagHtml} ${attrsHtml}</div>` : ''}
              <div class="text-[11px] text-stone-400 mt-0.5 font-mono">
                规格: ${p.spec || '整装'} · 存量: ${isOutOfStock ? '<span class="text-rose-600 font-bold">已调空</span>' : `${stock}${unit}`}
              </div>
              <div class="text-xs font-bold text-stone-900 mt-0.5 font-mono flex items-center gap-1">
                ¥${price.toFixed(2)} <span class="text-[10px] text-stone-400 font-normal">/${unit}</span>
                ${badge ? `<span class="text-[9px] bg-amber-50 text-amber-900 border border-amber-300 px-1 rounded font-bold">${badge}</span>` : ''}
              </div>
            </div>
          </div>
          
          <div class="flex items-center gap-1.5 pt-1 shrink-0">
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
              🔄 退货 ${hasReturn ? `(${curState.return}${unit})` : ''}
            </button>
            <button type="button" onclick="window.openExchangeDrawer(${p.id})" class="px-2 py-0.5 rounded-lg font-bold border transition ${
              hasExchange ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100'
            }">
              🔀 换货 ${hasExchange ? `(${curState.exchange}${unit})` : ''}
            </button>
          </div>

          <button type="button" onclick="window.configureFlyer(${p.id})" class="text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 px-2.5 py-0.5 rounded-xl font-bold flex items-center gap-1 active:scale-95 transition">
            📲 做画报
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 12. 单据存根、邻里到店自提待核销单与收据查验
// ==========================================
window.openReceiptsModal = async () => {
  if (!currentStore) return alert('当前供货方未绑定有效门店档案！');
  window.openModal('receipts-modal');

  const [myOrders, myReceipts, pickupOrders] = await Promise.all([
    StoreService.getMyOrders(currentStore.id, currentAgent),
    StoreService.getMyReceipts(currentStore.id, currentAgent),
    StoreService.getStoreMallPickupOrders(currentStore.id)
  ]);

  const pickupBox = document.getElementById('mall-pickup-orders-box');
  const pickupListEl = document.getElementById('mall-pickup-orders-list');
  if (pickupBox && pickupListEl) {
    if (pickupOrders.length > 0) {
      pickupBox.classList.remove('hidden');
      pickupListEl.innerHTML = pickupOrders.map(po => {
        const items = Array.isArray(po.items) ? po.items : [];
        const itemsStr = items.map(it => `${it.name} x${it.qty}${it.measure_unit || '件'}`).join('、');
        const isDelivered = po.delivery_status === 'delivered';
        return `
          <div class="p-2.5 bg-amber-50/80 border border-amber-300 rounded-xl space-y-1 text-xs">
            <div class="flex justify-between items-center font-bold">
              <span class="font-mono text-stone-900">#${po.order_no || po.id}</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded ${isDelivered ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200 text-amber-950'}">
                ${isDelivered ? '✅ 随车已到店/已自提' : '🚚 待送货师傅捎带到店'}
              </span>
            </div>
            <div class="text-[11px] text-stone-800 font-bold">货品：${itemsStr}</div>
            <div class="text-[10px] text-stone-600">${po.note || ''}</div>
            <div class="text-[10px] text-emerald-900 font-bold">🤝 邻里服务润利归属本店 · 实付 ¥${parseFloat(po.total_amount || 0).toFixed(2)}</div>
          </div>
        `;
      }).join('');
    } else {
      pickupBox.classList.add('hidden');
    }
  }

  const ordersListEl = document.getElementById('my-orders-list');
  if (ordersListEl) {
    ordersListEl.innerHTML = myOrders.map(o => {
      const orderItems = Array.isArray(o.items) ? o.items : [];
      const returnItems = Array.isArray(o.items_return) ? o.items_return : [];
      const exchangeItems = Array.isArray(o.items_exchange) ? o.items_exchange : [];

      const orderStr = orderItems.map(it => `${it.name} x ${it.qty}${it.measure_unit || '件'}`).join('、');
      const returnStr = returnItems.map(it => `退:${it.name}x${it.qty}`).join('、');
      const exchangeStr = exchangeItems.map(it => `换:${it.name}x${it.qty}`).join('、');

      let statusBadge = '<span class="text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded font-bold">🚚 排单备发</span>';
      if (o.order_status === 'counter_proposal') {
        statusBadge = '<span class="text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-bold animate-pulse">💬 供货方有修润建议</span>';
      } else if (o.order_status === 'confirmed') {
        statusBadge = '<span class="text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded font-bold">✅ 供货方已确认接单</span>';
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
                <span>📢 供货方商榷建议：</span>
              </div>
              <div class="text-[11px] leading-snug">${o.vendor_feedback || '供货方对单据有微调建议，请查阅。'}</div>
              <div class="pt-1 flex gap-2 justify-end">
                <button type="button" onclick="window.cancelProposalOrder(${o.id})" class="px-2 py-1 rounded-lg bg-stone-200 text-stone-600 text-[10px] font-bold">撤单作罢</button>
                <button type="button" onclick="window.acceptProposalAndReload(${o.id})" class="px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold shadow">按建议微调重发</button>
              </div>
            </div>
          ` : ''}

          <div class="text-[10px] text-stone-600">📦 补货: ${orderStr || '无'}</div>
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

  const receiptsListEl = document.getElementById('my-receipts-list');
  if (receiptsListEl) {
    receiptsListEl.innerHTML = myReceipts.map(r => `
      <div class="p-2.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1 text-xs">
        <div class="flex justify-between font-bold text-stone-900">
          <span>送货师傅: ${r.driver_name}</span>
          <span>实交款: ¥${parseFloat(r.amount).toFixed(2)} (${r.pay_method})</span>
        </div>
        ${r.basket_return ? `<div class="text-[10px] text-amber-800">退还周转筐/载具: ${r.basket_return} 件 (折抵 ¥${r.basket_deduct_amount})</div>` : ''}
        <div class="text-[10px] text-stone-400">核销时间: ${new Date(r.created_at).toLocaleString()}</div>
      </div>
    `).join('') || '<div class="text-stone-400 text-center py-2">暂无交割记录</div>';
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
  alert('已将原单品物重新载入待配篮，请根据供货方建议微调后提交！');
  window.openSettlementModal();
};

// ==========================================
// 13. 系统初始化入口
// ==========================================
async function initTerminal() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlAgent = urlParams.get('agent') || urlParams.get('tenant');
  if (urlAgent) {
    currentAgent = urlAgent.trim().toUpperCase();
    localStorage.setItem('active_agent', currentAgent);
  }

  loadAgentCart();
  renderAgentSelector();

  currentStore = await StoreService.getStoreByTenant(currentAgent);
  if (currentStore) {
    safeSetText('store-title', currentStore.name || '厚德便民门店');
    safeSetText('store-boss', currentStore.contact || '主人家');
    safeSetText('store-driver', currentStore.driver_name || '老张师傅');
    safeSetText('store-basket-count', `${currentStore.basket_count || 0} 件`);

    const limit = parseFloat(currentStore.credit_limit || 2000);
    const debt = parseFloat(currentStore.current_debt || 0);
    safeSetText('credit-avail', `¥${Math.max(0, limit - debt).toFixed(2)}`);
    safeSetText('credit-debt', `¥${debt.toFixed(2)}`);

    if (currentStore.default_settlement) {
      currentSettlementType = currentStore.default_settlement;
    }

    if (!localStorage.getItem('active_shop_type')) {
      shopType = detectShopType(currentStore.name);
      localStorage.setItem('active_shop_type', shopType);
    }
  } else {
    safeSetText('store-driver', '待指派送货师傅');
    safeSetText('store-basket-count', '0 件');
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

// ==========================================
// 14. 同城余缺互调池 (local_inventory_pool)
// ==========================================
window.openLocalPoolModal = async function () {
  window.openModal('local-pool-modal');
  window.switchLocalPoolTab('browse');

  // 填充挂出余货下拉选择框
  const selectEl = document.getElementById('pool-prod-select');
  if (selectEl) {
    selectEl.innerHTML =
      '<option value="">-- 自由手填品名，或点选在架良品 --</option>' +
      allProducts
        .map((p) => {
          const { price } = getStorePriceInfo(p);
          return `<option value="${p.id}" data-name="${p.name}" data-spec="${p.spec || '整装'}" data-price="${price}">${p.name} (${p.spec || '整装'} · ¥${price.toFixed(2)})</option>`;
        })
        .join('');
  }

  await loadLocalPoolList();
};

window.switchLocalPoolTab = function (tab) {
  const browsePane = document.getElementById('pool-pane-browse');
  const publishPane = document.getElementById('pool-pane-publish');
  const btnBrowse = document.getElementById('pool-tab-browse');
  const btnPublish = document.getElementById('pool-tab-publish');

  if (tab === 'browse') {
    browsePane?.classList.remove('hidden');
    publishPane?.classList.add('hidden');
    if (btnBrowse) btnBrowse.className = 'flex-1 py-2 rounded-xl bg-[#1b4332] text-white shadow transition';
    if (btnPublish) btnPublish.className = 'flex-1 py-2 rounded-xl text-stone-600 hover:text-stone-900 transition';
    loadLocalPoolList();
  } else {
    browsePane?.classList.add('hidden');
    publishPane?.classList.remove('hidden');
    if (btnPublish) btnPublish.className = 'flex-1 py-2 rounded-xl bg-[#1b4332] text-white shadow transition';
    if (btnBrowse) btnBrowse.className = 'flex-1 py-2 rounded-xl text-stone-600 hover:text-stone-900 transition';
  }
};

window.onSelectPoolProduct = function (prodId) {
  const selectEl = document.getElementById('pool-prod-select');
  if (!selectEl || !prodId) return;
  const opt = selectEl.options[selectEl.selectedIndex];
  if (!opt) return;
  document.getElementById('pool-prod-name').value = opt.dataset.name || '';
  document.getElementById('pool-prod-spec').value = opt.dataset.spec || '';
  document.getElementById('pool-prod-price').value = opt.dataset.price || '';
};

async function loadLocalPoolList() {
  const listEl = document.getElementById('local-pool-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="py-8 text-center text-stone-400">正在查探同城同行互调余货...</div>';

  const { data, error } = await supabase
    .from('local_inventory_pool')
    .select('*')
    .eq('tenant_id', currentAgent)
    .in('status', ['open', 'claimed'])
    .order('id', { ascending: false })
    .limit(30);

  if (error) {
    listEl.innerHTML = `<div class="py-6 text-center text-rose-500">读取互调池异常：${error.message}</div>`;
    return;
  }

  const rows = data || [];
  if (rows.length === 0) {
    listEl.innerHTML = '<div class="py-8 text-center text-stone-400">当前同城互调池暂无挂出余货，若有临期/富余货品可点上方「挂出本店余货」调剂。</div>';
    return;
  }

  const myStoreId = currentStore?.id || 0;
  listEl.innerHTML = rows
    .map((item) => {
      const isMine = Number(item.from_store_id) === Number(myStoreId);
      const isOpen = item.status === 'open';
      return `
        <div class="p-3 bg-stone-50 border ${isOpen ? 'border-emerald-200' : 'border-stone-200 opacity-75'} rounded-2xl space-y-1.5">
          <div class="flex justify-between items-start gap-2">
            <div>
              <b class="text-xs text-stone-900">${item.product_name}</b>
              <span class="text-[10px] text-stone-500 block font-mono">规格: ${item.spec || '整装'} · 余量: <b class="text-emerald-900">${item.qty} ${item.measure_unit || '件'}</b></span>
            </div>
            <div class="text-right shrink-0">
              <b class="text-sm font-mono font-bold text-rose-700">¥${parseFloat(item.transfer_price || 0).toFixed(2)}</b>
              <span class="text-[9px] text-stone-400 block">/${item.measure_unit || '件'}</span>
            </div>
          </div>

          <div class="text-[10px] text-stone-600 bg-white px-2.5 py-1 rounded-xl border border-stone-100">
            🏪 挂出门店：<b>${item.from_store_name}</b> ${item.reason ? `· ${item.reason}` : ''}
          </div>

          <div class="flex justify-between items-center pt-1">
            <span class="text-[10px] font-bold ${isOpen ? 'text-emerald-800' : 'text-amber-800'}">
              ${isOpen ? '🟢 待认领调剂' : `🚚 已由【${item.to_store_name || '同行门店'}】认领待捎带`}
            </span>
            ${
              isOpen && !isMine
                ? `<button type="button" onclick="window.claimLocalPoolItem(${item.id})" class="px-3 py-1 rounded-xl bg-[#1b4332] hover:bg-[#143628] text-white text-[10px] font-bold shadow active:scale-95 transition">🤝 认领调入本店</button>`
                : isOpen && isMine
                ? `<button type="button" onclick="window.cancelLocalPoolItem(${item.id})" class="px-2.5 py-1 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-700 text-[10px] font-bold">撤回挂单</button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');
}

window.submitLocalPoolOffer = async function (e) {
  e.preventDefault();
  if (!currentStore) return alert('当前供货方尚未绑定有效门店档案，无法发起同城余货调剂！');

  const prodIdVal = document.getElementById('pool-prod-select')?.value;
  const prodName = document.getElementById('pool-prod-name').value.trim();
  const spec = document.getElementById('pool-prod-spec').value.trim() || '整装';
  const qty = parseInt(document.getElementById('pool-prod-qty').value) || 1;
  const transferPrice = parseFloat(document.getElementById('pool-prod-price').value) || 0;
  const reason = document.getElementById('pool-prod-reason').value.trim();

  if (!prodName || qty <= 0) return alert('请完整填写余货品名与调剂数量！');

  const { error } = await supabase.from('local_inventory_pool').insert([
    {
      tenant_id: currentAgent,
      from_store_id: currentStore.id,
      from_store_name: currentStore.name || '厚德便民门店',
      product_id: prodIdVal ? parseInt(prodIdVal) : null,
      product_name: prodName,
      spec,
      measure_unit: '件',
      qty,
      transfer_price: transferPrice,
      reason,
      driver_name: currentStore.driver_name || '老张师傅',
      status: 'open'
    }
  ]);

  if (error) return alert('挂入互调池失败：' + error.message);

  await notifyVendorWebhook(
    currentAgent,
    `🔄【同城余缺互调挂单】\n挂出门店：${currentStore.name}\n调剂良品：${prodName} (${spec}) x ${qty}件\n调剂让利价：¥${transferPrice.toFixed(2)}/件\n请调度中枢留意顺路捎带调剂！`
  );

  alert('✅ 已成功挂入同城余缺互调池！同行门店认领后将由送货师傅顺路捎带交割。');
  document.getElementById('pool-pane-publish')?.reset();
  window.switchLocalPoolTab('browse');
};

window.claimLocalPoolItem = async function (poolId) {
  if (!currentStore) return alert('当前供货方尚未绑定有效门店档案，无法认领余货！');
  const { data: item } = await supabase.from('local_inventory_pool').select('*').eq('id', poolId).single();
  if (!item || item.status !== 'open') return alert('该笔余货已被其他同行认领或撤回！');

  const totalVal = (parseFloat(item.transfer_price || 0) * parseInt(item.qty || 1)).toFixed(2);
  if (
    !confirm(
      `确认认领同城余货调剂？\n\n` +
        `• 调出门店：${item.from_store_name}\n` +
        `• 调剂货品：${item.product_name} (${item.spec || '整装'}) x ${item.qty}${item.measure_unit || '件'}\n` +
        `• 调剂总值：¥${totalVal}\n\n` +
        `确认后将通知送货师傅顺路从【${item.from_store_name}】取货送达本店！`
    )
  ) {
    return;
  }

  const { error } = await supabase
    .from('local_inventory_pool')
    .update({
      to_store_id: currentStore.id,
      to_store_name: currentStore.name || '厚德便民门店',
      status: 'claimed',
      claimed_at: new Date().toISOString()
    })
    .eq('id', poolId)
    .eq('status', 'open');

  if (error) return alert('认领失败：' + error.message);

  // 同步生成一条随车顺路调剂指令单，方便调度台与师傅端直接可见
  await supabase.from('store_order').insert([
    {
      order_no: `SWAP-${Date.now().toString().slice(-6)}`,
      tenant_id: currentAgent,
      store_id: currentStore.id,
      store_name: currentStore.name || '厚德便民门店',
      driver_name: currentStore.driver_name || item.driver_name || '老张师傅',
      settlement_type: 'credit',
      settlement_note: `同城余缺互调平账（调出方：${item.from_store_name}）`,
      items: [
        {
          id: item.product_id || 0,
          name: `[同城调剂] ${item.product_name}`,
          spec: item.spec || '整装',
          measure_unit: item.measure_unit || '件',
          price: parseFloat(item.transfer_price || 0),
          qty: parseInt(item.qty || 1)
        }
      ],
      items_return: [],
      items_exchange: [],
      total_amount: parseFloat(totalVal),
      return_amount: 0,
      net_settle_amount: parseFloat(totalVal),
      order_status: 'confirmed',
      delivery_status: 'pending',
      note: `【同城余缺互调】从【${item.from_store_name}】顺路取货送至【${currentStore.name}】`,
      driver_action_instruction: `顺路先去【${item.from_store_name}】取调剂货 ${item.product_name}x${item.qty}，再送至【${currentStore.name}】`
    }
  ]);

  await notifyVendorWebhook(
    currentAgent,
    `🤝【同城余缺互调已成单】\n调出门店：${item.from_store_name}\n调入门店：${currentStore.name}\n货品：${item.product_name} x ${item.qty}件（¥${totalVal}）\n已生成随车顺路捎带单，请安排送货师傅取送！`
  );

  alert('🎉 认领成功！已生成随车顺路调剂单并通知供货中枢与送货师傅。');
  await loadLocalPoolList();
};

window.cancelLocalPoolItem = async function (poolId) {
  if (!confirm('确认撤回该笔余货挂单？')) return;
  await supabase.from('local_inventory_pool').update({ status: 'cancelled' }).eq('id', poolId);
  await loadLocalPoolList();
};

// ==========================================
// 15. 真实用度计划单 (demand_forecast_plan)
// ==========================================
window.openDemandPlanModal = async function () {
  window.openModal('demand-plan-modal');

  const dateInput = document.getElementById('plan-expected-date');
  if (dateInput && !dateInput.value) {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    dateInput.value = tomorrow;
  }

  const rowsContainer = document.getElementById('demand-plan-rows');
  if (rowsContainer && rowsContainer.children.length === 0) {
    window.addDemandPlanRow();
    window.addDemandPlanRow();
  }

  await loadMyDemandPlans();
};

window.addDemandPlanRow = function () {
  const rowsContainer = document.getElementById('demand-plan-rows');
  if (!rowsContainer) return;

  const datalistId = 'plan-prod-datalist';
  if (!document.getElementById(datalistId)) {
    const dl = document.createElement('datalist');
    dl.id = datalistId;
    dl.innerHTML = allProducts.map((p) => `<option value="${p.name}">`).join('');
    document.body.appendChild(dl);
  }

  const row = document.createElement('div');
  row.className = 'flex items-center gap-1.5 demand-plan-item-row';
  row.innerHTML = `
    <input type="text" list="${datalistId}" placeholder="品名（选或填）" class="plan-item-name flex-1 bg-white border border-amber-200 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-stone-800 outline-none">
    <input type="number" min="1" value="10" placeholder="数量" class="plan-item-qty w-16 bg-white border border-amber-200 rounded-xl px-2 py-1.5 text-[11px] font-mono font-bold text-center outline-none">
    <input type="text" value="件" placeholder="单位" class="plan-item-unit w-12 bg-white border border-amber-200 rounded-xl px-1.5 py-1.5 text-[11px] text-center outline-none">
    <button type="button" onclick="this.parentElement.remove()" class="text-stone-400 hover:text-rose-600 px-1 text-xs">✕</button>
  `;
  rowsContainer.appendChild(row);
};

window.submitDemandPlan = async function (e) {
  e.preventDefault();
  if (!currentStore) return alert('当前供货方尚未绑定有效门店档案，无法提报真实用度计划！');

  const planCycle = document.getElementById('plan-cycle-select')?.value || '未来3日用度';
  const expectedDate = document.getElementById('plan-expected-date')?.value;
  const note = document.getElementById('plan-note-input')?.value.trim() || '';

  const rowEls = document.querySelectorAll('.demand-plan-item-row');
  const items = [];
  rowEls.forEach((row) => {
    const name = row.querySelector('.plan-item-name')?.value.trim();
    const qty = parseInt(row.querySelector('.plan-item-qty')?.value) || 0;
    const unit = row.querySelector('.plan-item-unit')?.value.trim() || '件';
    if (name && qty > 0) {
      items.push({ name, qty, unit });
    }
  });

  if (items.length === 0) {
    return alert('请至少填写一项有效的计划用度货品与预估数量！');
  }

  const { error } = await supabase.from('demand_forecast_plan').insert([
    {
      tenant_id: currentAgent,
      store_id: currentStore.id,
      store_name: currentStore.name || '厚德便民门店',
      plan_cycle: planCycle,
      expected_date: expectedDate || null,
      items,
      note,
      status: 'submitted'
    }
  ]);

  if (error) return alert('提报用度计划失败：' + error.message);

  const summaryStr = items.map((i) => `${i.name} x${i.qty}${i.unit}`).join('、');
  await notifyVendorWebhook(
    currentAgent,
    `📅【门店真实用度计划单】\n提报门店：${currentStore.name}\n用度周期：${planCycle}（期望到店：${expectedDate || '近期'}）\n用度明细：${summaryStr}\n${note ? `叮咛：${note}\n` : ''}请合作社/工坊纳入按需采收排产备货！`
  );

  alert('🎉 真实用度计划单已提报！已直达村社合作社与源头工坊调度台按需排产。');
  document.getElementById('plan-note-input').value = '';
  const rowsContainer = document.getElementById('demand-plan-rows');
  if (rowsContainer) {
    rowsContainer.innerHTML = '';
    window.addDemandPlanRow();
  }
  await loadMyDemandPlans();
};

async function loadMyDemandPlans() {
  const listEl = document.getElementById('my-demand-plans-list');
  if (!listEl || !currentStore) return;

  const { data } = await supabase
    .from('demand_forecast_plan')
    .select('*')
    .eq('tenant_id', currentAgent)
    .eq('store_id', currentStore.id)
    .order('id', { ascending: false })
    .limit(10);

  const rows = data || [];
  if (rows.length === 0) {
    listEl.innerHTML = '<div class="text-center py-3 text-stone-400">暂无历史用度计划记录</div>';
    return;
  }

  listEl.innerHTML = rows
    .map((p) => {
      const items = Array.isArray(p.items) ? p.items : [];
      const itemStr = items.map((i) => `${i.name}x${i.qty}${i.unit || '件'}`).join('、');
      const statusMap = {
        submitted: '<span class="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-bold">⏳ 已提报待排产</span>',
        scheduled: '<span class="bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">✅ 产区已纳入排产</span>',
        fulfilled: '<span class="bg-stone-200 text-stone-700 px-1.5 py-0.2 rounded">📦 已履约配发</span>'
      };
      return `
        <div class="p-2.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1 text-[11px]">
          <div class="flex justify-between items-center">
            <b class="text-stone-800">${p.plan_cycle} · 期望 ${p.expected_date || '近期'}</b>
            ${statusMap[p.status] || statusMap.submitted}
          </div>
          <div class="text-stone-600">用度：${itemStr}</div>
          ${p.note ? `<div class="text-[10px] text-stone-400">备注：${p.note}</div>` : ''}
        </div>
      `;
    })
    .join('');
}

initTerminal();
