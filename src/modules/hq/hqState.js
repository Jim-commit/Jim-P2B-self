export const DEFAULT_GLOBAL_POLICY = {
  storeTierEnabled: true,
  storeTiers: [
    { name: 'LV1 核心战略店', creditLimit: 5000, discountRate: 0.95, returnQuota: 1000 },
    { name: 'LV2 长期伙计店', creditLimit: 3000, discountRate: 0.98, returnQuota: 600 },
    { name: 'LV3 临街便民店', creditLimit: 2000, discountRate: 1.0, returnQuota: 500 }
  ],
  storeCustomFields: ['开票税号 / 营业执照号', '收货仓库 / 卸货点备注'],
  harvestAidOn: false,
  rationLimitQty: 0,
  onlinePriceEnabled: false,
  onlineTiers: [
    { minQty: 1, rate: 1.0, label: '单件零售正价' },
    { minQty: 5, rate: 0.95, label: '满5件享9.5折' },
    { minQty: 20, rate: 0.88, label: '满20件抱团8.8折' }
  ],
  rebateEnabled: true,
  rebateTiers: [
    { threshold: 10000, rate: 3.0 },
    { threshold: 30000, rate: 5.0 }
  ],
  promoterEnabled: true,
  promoterRate: 8.0,
  referralBonus: 100,
  campaignActive: false,
  promos: [{ title: '产区直供季', rule: '单笔满 20 件赠同款 1 件' }],
  carriers: [{ name: '周转筐', deposit: 15 }],
  tier1Name: '批发平准基准价',
  tier2Name: '网上平准零售基准价',
  twoFaCashOn: true,
  twoFaThreshold: 3000,
  twoFaPriceOn: true,
  twoFaPricePct: 15,
  twoFaCreditOn: true,
  twoFaDeleteOn: true,
  twoFaLimitOn: true,
  twoFaStockAuditOn: false,
  twoFaPolicyOn: false,
  twoFaExportOn: false,
  defaultMinStock: 10,
  expiryWarnDays: 30,
  allowStoreReturn: true,
  slipHeaderSub: '源头平准直供 · 诚信相照 · 货畅其流',
  slipFooterNote: '请当面点清数量与效期，签字后即作为往来对账依据。',
  slipStampText: '调度专用章',
  seasonalPause: { isPaused: false, reason: '', resumeDate: '' }
};

export const FORBIDDEN_WORDS = [
  '国家级', '世界级', '最高级', '第一', '绝对', '包治百病', '根治', '神效',
  '假一赔万', '100%有效', '加微信', '微信号'
];

const initAgent = localStorage.getItem('hq_active_agent') || 'BJ_SHUNDA';

export const hqState = {
  currentAgent: initAgent,
  currentRoleCode: sessionStorage.getItem('hq_sub_role_' + initAgent) || 'owner',
  currentAccountCode: sessionStorage.getItem('hq_sub_account_' + initAgent) || '',
  currentOperatorName: sessionStorage.getItem('hq_sub_name_' + initAgent) || '大当家主账号',
  globalPolicy: JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY)),
  carrierLabel: '周转筐',
  currentStoreForVis: null,
  currentTenantData: null,
  allProducts: [],
  allStores: [],
  allOrders: [],
  allC2BDemands: [],
  allDemandPlans: [],
  allLocalPoolItems: [],
  allSubUsers: [],
  allPlatformCats: [],
  allInventoryLogs: [],
  pendingCashLogsCache: [],
  parsedBulkProducts: [],
  uploadedImageBase64: '',
  isUploadingImage: false,
  selectedTags: [],
  activeProdFilter: '全部',
  activeProdSearch: '',
  onlyLowStockFilter: false,
  onlyDraftFilter: false,
  activeOrderFilter: 'pending_confirm',
  activeStoreFilter: '全部',
  sortStoresDebtDesc: false,
  invVoucherSearch: '',
  currentStockOpsMode: 'in_purchase',
  currentVoucherNo: '',
  pending2FACallback: null,
  currentTraceCardText: '',
  hqQrPollTimer: null
};

export function isDirectoryLead(o) {
  return (
    o?.order_source === 'b2b_directory_lead' ||
    String(o?.order_no || '').startsWith('LEAD-') ||
    String(o?.note || '').includes('[新店招商线索]') ||
    String(o?.note || '').includes('[新店招商線索]') ||
    String(o?.note || '').includes('[新店合作意向]')
  );
}

export function isEcommerceAllowed(p) {
  if (!p) return false;
  if (p.channel_ecommerce !== undefined) return !!p.channel_ecommerce;
  return ['电子商务', '实体与电商双轨'].includes(p.sales_channel_type);
}

export function isBrickMortarAllowed(p) {
  if (!p) return true;
  if (p.channel_brick_and_mortar !== undefined) return !!p.channel_brick_and_mortar;
  return ['实体店', '实体与电商双轨'].includes(p.sales_channel_type) || !p.sales_channel_type;
}

export function isWarehouseBlindPrice() {
  return hqState.currentRoleCode === 'warehouse' || hqState.currentRoleCode === 'producer';
}

export function isAuditorReadOnly() {
  return hqState.currentRoleCode === 'auditor';
}

export function getVisibleStoresForCurrentRole() {
  if (hqState.currentRoleCode !== 'sales') return hqState.allStores;
  return hqState.allStores.filter((s) => {
    const ownerAcc = s.custom_pricing?.sales_owner || '';
    return !ownerAcc || ownerAcc === hqState.currentAccountCode || ownerAcc === hqState.currentOperatorName;
  });
}

export function generateUnifiedVoucherNo(prefix) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const rand4 = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}${h}-${rand4}`;
}

export function calcStoreEffectivePrice(store, prod) {
  const basePrice = parseFloat(prod?.tier_1_price || 0);
  if (!store) return { price: basePrice, badge: '批发基准', note: '' };

  const pricing = store.custom_pricing && typeof store.custom_pricing === 'object' ? store.custom_pricing : {};
  const itemNotes = pricing.item_notes && typeof pricing.item_notes === 'object' ? pricing.item_notes : {};
  const note = itemNotes[String(prod.id)] || '';

  if (pricing.item_prices && pricing.item_prices[String(prod.id)] !== undefined) {
    const special = parseFloat(pricing.item_prices[String(prod.id)]);
    if (!isNaN(special) && special > 0) {
      return { price: special, badge: '单品特约价', note };
    }
  }

  let effectiveBase = basePrice;
  if (pricing.price_tier === 'tier_2' && prod.tier_2_price) {
    effectiveBase = parseFloat(prod.tier_2_price);
  }

  if (hqState.globalPolicy.storeTierEnabled !== false) {
    const rate = parseFloat(pricing.discount_rate || 1);
    if (!isNaN(rate) && rate > 0 && rate !== 1) {
      return {
        price: Number((effectiveBase * rate).toFixed(2)),
        badge: `${(rate * 10).toFixed(1)}折策略价`,
        note
      };
    }
  }

  return { price: effectiveBase, badge: '批发基准', note };
}
