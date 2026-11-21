import { supabase } from '../../lib/supabase.js';
import { ShopTypeManager } from '../shopTypeManager.js';

export const MY_AGENTS_KEY = 'b2b_my_agents_list';
export const STORE_CUSTOM_NOTES_KEY = 'b2b_store_custom_notes';

let initAgents = [];
try {
  const raw = JSON.parse(localStorage.getItem(MY_AGENTS_KEY) || '[]');
  if (Array.isArray(raw)) initAgents = raw;
} catch (e) {
  initAgents = [];
}

let initCustomNotes = [];
try {
  initCustomNotes = JSON.parse(localStorage.getItem(STORE_CUSTOM_NOTES_KEY)) || [];
} catch (e) {
  initCustomNotes = [];
}

export const storeState = {
  myAgents: initAgents,
  currentAgent: localStorage.getItem('active_agent') || (initAgents[0]?.id || ''),
  currentStore: null,
  currentTenantSettings: {},
  currentTenantSponsorOrg: '',
  shopType: localStorage.getItem('active_shop_type') || '社区便利',
  allProducts: [],
  currentCategory: '全部',
  currentTagFilter: '全部',
  currentAgentFilterCategory: '全部',
  allowStoreSelfReturn: true,
  pendingAuditCollections: [],
  cart: {},
  deliveryNote: '',
  currentFlyerProd: null,
  currentFlyerStyle: 'neighborhood',
  currentSettlementType: 'credit',
  uploadedProofImages: [],
  cachedSelfStatementOrders: [],
  myCustomNotes: initCustomNotes
};

/**
 * 纯云端同步在册供货方名册（彻底无硬编码测试厂商）：
 * 1. 若本地尚无绑定名册，自动从 Supabase platform_tenant 拉取已激活且未暂歇的在册供货方作为初始浏览名册；
 * 2. 若本地已有绑定的商号，自动与云端最新公司全称对齐。
 */
export async function syncAgentsFromCloud() {
  const { data: activeTenants, error } = await supabase
    .from('platform_tenant')
    .select('tenant_id, company_name, is_active, membership_status')
    .eq('is_active', true)
    .order('id', { ascending: true });

  if (error || !Array.isArray(activeTenants)) return;

  const validTenants = activeTenants.filter((t) => t.membership_status !== 'paused');
  const tenantMap = new Map(validTenants.map((t) => [t.tenant_id, t.company_name || t.tenant_id]));

  if (storeState.myAgents.length === 0) {
    storeState.myAgents = validTenants.slice(0, 6).map((t) => ({
      id: t.tenant_id,
      name: t.company_name || t.tenant_id
    }));
  } else {
    storeState.myAgents = storeState.myAgents.map((ag) => ({
      id: ag.id,
      name: tenantMap.get(ag.id) || ag.name || ag.id
    }));
  }

  localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(storeState.myAgents));

  if (!storeState.currentAgent || !storeState.myAgents.some((a) => a.id === storeState.currentAgent)) {
    storeState.currentAgent = storeState.myAgents[0]?.id || '';
    if (storeState.currentAgent) {
      localStorage.setItem('active_agent', storeState.currentAgent);
    }
  }
}

export function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

export function computePickupPin(order) {
  const seed = String(order?.order_no || order?.id || '1000');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 9000;
  }
  return String(1000 + Math.abs(hash));
}

export function getShopIcon(type) {
  if (ShopTypeManager.icons && ShopTypeManager.icons[type]) return ShopTypeManager.icons[type];
  if (typeof ShopTypeManager.getPreset === 'function') return ShopTypeManager.getPreset(type).icon || '🏷️';
  return '🏷️';
}

export function getShopDynamicNotes(type) {
  if (typeof ShopTypeManager.getDynamicNotes === 'function') return ShopTypeManager.getDynamicNotes(type);
  if (typeof ShopTypeManager.getPreset === 'function') return ShopTypeManager.getPreset(type).voice_prompts || [];
  return ['按本周真实用度清单配货，请核对好数量与规格'];
}

export function detectShopType(storeName = '') {
  if (typeof ShopTypeManager.autoDetect === 'function') return ShopTypeManager.autoDetect(storeName);
  const keys = typeof ShopTypeManager.getAllPresetKeys === 'function' ? ShopTypeManager.getAllPresetKeys() : [];
  const found = keys.find((k) => storeName.includes(k.slice(0, 2)));
  return found || '社区便利';
}

export function calcBasePrice(prod, type) {
  if (typeof ShopTypeManager.getEffectivePrice === 'function') {
    return ShopTypeManager.getEffectivePrice(prod, type);
  }
  return parseFloat(prod.tier_1_price || 0);
}

export function getStorePriceInfo(prod) {
  const basePrice = calcBasePrice(prod, storeState.shopType);
  const pricing =
    storeState.currentStore && storeState.currentStore.custom_pricing && typeof storeState.currentStore.custom_pricing === 'object'
      ? storeState.currentStore.custom_pricing
      : {};
  const itemNotes = pricing.item_notes && typeof pricing.item_notes === 'object' ? pricing.item_notes : {};
  const itemNote = itemNotes[String(prod.id)] || '';

  if (pricing.item_prices && pricing.item_prices[String(prod.id)] !== undefined) {
    const special = parseFloat(pricing.item_prices[String(prod.id)]);
    if (!isNaN(special) && special > 0) {
      return { price: special, badge: '专属协议工价', itemNote };
    }
  }

  let tierPrice = basePrice;
  let badge = '';
  if (pricing.price_tier === 'tier_2' && prod.tier_2_price) {
    tierPrice = parseFloat(prod.tier_2_price);
  }

  if (storeState.currentTenantSettings?.storeTierEnabled !== false) {
    const rate = parseFloat(pricing.discount_rate || 1);
    if (!isNaN(rate) && rate > 0 && rate !== 1) {
      const discounted = Number((tierPrice * rate).toFixed(2));
      return { price: discounted, badge: `专享${(rate * 10).toFixed(1)}折`, itemNote };
    }
  }

  return { price: tierPrice, badge, itemNote };
}

export function loadAgentCart() {
  if (!storeState.currentAgent) {
    storeState.cart = {};
    return;
  }
  const CART_KEY = `b2b_cart_v3_${storeState.currentAgent}`;
  try {
    storeState.cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
  } catch (e) {
    storeState.cart = {};
  }
}

export function saveAgentCart() {
  if (!storeState.currentAgent) return;
  const CART_KEY = `b2b_cart_v3_${storeState.currentAgent}`;
  localStorage.setItem(CART_KEY, JSON.stringify(storeState.cart));
}

export async function notifyVendorWebhook(tenantId, messageText) {
  if (!tenantId) return;
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
