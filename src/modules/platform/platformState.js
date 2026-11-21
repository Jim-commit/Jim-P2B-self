export const PLATFORM_MASTER_KEY_STORAGE = 'baigong_platform_master_key';
export const DEFAULT_MASTER_KEY = '888888';

export const FORBIDDEN_AD_WORDS = [
  '国家级', '世界级', '最高级', '第一', '绝对', '包治百病', '根治', '神效',
  '假一赔万', '100%有效', '加微信', '微信号', '全网最低', '稳赚不赔'
];

export const DEFAULT_CATEGORY_SEED = [
  {
    name: '粮油米面与农副特产',
    subs: ['大米杂粮', '食用植物油', '面粉挂面', '干货山珍', '蜂蜜蜂产品', '茶叶茶饮']
  },
  {
    name: '生鲜果蔬与禽蛋肉乳',
    subs: ['时令鲜果', '生态鲜蔬', '散养禽蛋', '冷鲜肉禽', '低温乳品', '豆制品']
  },
  {
    name: '五金机电与工料建材',
    subs: ['紧固件标准件', '水暖管件阀门', '电工电料', '手工电动工具', '劳保防护', '装饰辅料']
  },
  {
    name: '农资农具与田间服务',
    subs: ['有机肥/复合肥', '良种秧苗', '农膜地膜', '节水灌溉器材', '小型农机具', '农技植保服务']
  },
  {
    name: '酒水饮料与休闲副食',
    subs: ['纯粮酿造酒水', '天然果蔬饮品', '包装饮用水', '传统糕点', '坚果炒货', '调味酱料']
  },
  {
    name: '日用百货与循环载具',
    subs: ['纸品洗护', '厨卫清洁', '一次性环保包材', '周转筐/托盘', '便民小百货']
  }
];

export const platformState = {
  allTenants: [],
  allCategories: [],
  allSuggestions: [],
  allProductsForAudit: [],
  allOrdersSummary: [],
  currentTenantFilter: 'all',
  currentBusinessTypeFilter: 'all',
  currentTenantSearch: '',
  currentAuditFilter: 'flagged',
  currentSuggestionFilter: 'all',
  editingTenantId: null
};

export function getPlatformMasterKey() {
  return localStorage.getItem(PLATFORM_MASTER_KEY_STORAGE) || DEFAULT_MASTER_KEY;
}

export function setPlatformMasterKey(newKey) {
  localStorage.setItem(PLATFORM_MASTER_KEY_STORAGE, newKey);
}

export function getEntityTypeBadge(type, tenantId = '') {
  if (type === 'individual' || String(tenantId).startsWith('GR-')) {
    return { label: '👨‍🌾 个人农户/手艺人/个体匠人', cls: 'bg-amber-50 text-amber-900 border-amber-200' };
  }
  const map = {
    coop: { label: '🌾 村社合作社', cls: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
    factory: { label: '🏭 源头工坊/制造', cls: 'bg-blue-50 text-blue-900 border-blue-200' },
    service: { label: '🛠️ 工料配套服务', cls: 'bg-purple-50 text-purple-900 border-purple-200' },
    dealer: { label: '🏪 区域平准仓', cls: 'bg-stone-100 text-stone-800 border-stone-200' }
  };
  return map[type] || { label: '🏛️ 实体经营主体', cls: 'bg-stone-100 text-stone-800 border-stone-200' };
}

export function getTenantStatusInfo(t) {
  const status = t.membership_status || (t.is_active ? 'active' : 'pending_audit');
  if (!t.is_active && status === 'pending_audit') {
    return { text: '⏳ 新立约待终审', cls: 'bg-amber-200 text-amber-950 animate-pulse', isPending: true };
  }
  if (status === 'restricted') {
    return { text: '🛡️ 护盘冻结保护中', cls: 'bg-rose-600 text-white', isPending: false };
  }
  if (status === 'paused' || !t.is_active) {
    return { text: '⏸️ 商道暂歇/停用', cls: 'bg-stone-200 text-stone-700', isPending: false };
  }
  return { text: '✅ 在册正常营业', cls: 'bg-emerald-100 text-emerald-900', isPending: false };
}

export function scanProductCompliance(prod) {
  const combined = `${prod.name || ''} ${prod.description || ''} ${prod.custom_specs?.summary || ''} ${prod.remark || ''}`;
  return FORBIDDEN_AD_WORDS.filter((w) => combined.includes(w));
}
