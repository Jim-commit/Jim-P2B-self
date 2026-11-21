export const PLATFORM_KEY_STORAGE = 'baigong_platform_master_key';
export const DEFAULT_PLATFORM_KEY = '888888';

export const FORBIDDEN_AD_WORDS = [
  '国家级', '世界级', '最高级', '第一', '绝对', '包治百病', '根治', '神效',
  '假一赔万', '100%有效', '加微信', '微信号'
];

export const platformState = {
  allTenants: [],
  allCategories: [],
  allSuggestions: [],
  allProductsForAudit: [],
  currentTenantFilter: 'all',
  currentTenantSearch: '',
  currentAuditFilter: 'flagged',
  editingTenantId: null
};

export function getMasterKey() {
  return localStorage.getItem(PLATFORM_KEY_STORAGE) || DEFAULT_PLATFORM_KEY;
}

export function setMasterKey(newKey) {
  localStorage.setItem(PLATFORM_KEY_STORAGE, newKey);
}

export function getBusinessTypeLabel(type, tenantId = '') {
  if (type === 'individual' || String(tenantId).startsWith('GR-')) {
    return '👨‍🌾 个人农户 / 手艺人 / 个体匠人';
  }
  const map = {
    coop: '🌾 村社合作社',
    factory: '🏭 源头工坊/制造',
    service: '🛠️ 工料配套服务',
    dealer: '🏪 区域平准仓'
  };
  return map[type] || '🏛️ 实体经营主体';
}

export function getMembershipBadge(tenant) {
  const status = tenant.membership_status || (tenant.is_active ? 'active' : 'pending_audit');
  if (!tenant.is_active && status === 'pending_audit') {
    return '<span class="bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse">⏳ 新立约待终审</span>';
  }
  if (status === 'restricted') {
    return '<span class="bg-rose-600 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">🛡️ 护盘冻结保护中</span>';
  }
  if (status === 'paused' || !tenant.is_active) {
    return '<span class="bg-stone-200 text-stone-700 px-2 py-0.5 rounded-full text-[10px] font-bold">⏸️ 商道暂歇</span>';
  }
  return '<span class="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full text-[10px] font-bold">✅ 在册正常营业</span>';
}

export function scanProductRiskWords(prod) {
  const text = `${prod.name || ''} ${prod.description || ''} ${prod.custom_specs?.summary || ''}`;
  return FORBIDDEN_AD_WORDS.filter((w) => text.includes(w));
}
