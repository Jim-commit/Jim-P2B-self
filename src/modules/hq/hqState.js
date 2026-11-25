import {
  checkStaffCapability,
  getStaffPriceVisibility
} from '../../services/modularAuthService.js';
import {
  getNormalizedOrgAndWarehouses,
  getOperatorOrgPreference,
  filterRecordsByActiveBranch
} from '../soulEngine/multiOrgAndWarehouseEngine.js';

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
  carriers: [{ name: '外借器具', deposit: 15 }],
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

const initAgent = localStorage.getItem('hq_active_agent') || '';
const initAccount = sessionStorage.getItem('hq_sub_account_' + initAgent) || '';
const initOrgPref = getOperatorOrgPreference(initAgent, initAccount || 'owner');

export const hqState = {
  currentAgent: initAgent,
  currentRoleCode: sessionStorage.getItem('hq_sub_role_' + initAgent) || 'owner',
  currentAccountCode: initAccount,
  currentOperatorName: sessionStorage.getItem('hq_sub_name_' + initAgent) || '老板主账号',
  currentSubUserRecord: null,
  globalPolicy: JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY)),
  carrierLabel: '外借器具',
  activeBranchView: initOrgPref.activeBranch || 'ALL',
  activeWarehouse: initOrgPref.lastWarehouse || '',
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

export function getOrgRuntimeContext() {
  const customSettings = hqState.currentTenantData?.custom_settings || {};
  const orgCfg = getNormalizedOrgAndWarehouses(customSettings);
  const matchedStaff =
    hqState.currentSubUserRecord ||
    (hqState.allSubUsers || []).find((u) => u.account_name === hqState.currentAccountCode);

  const operatorBranch = matchedStaff?.branch_name || matchedStaff?.department || '';
  const isOwner = hqState.currentRoleCode === 'owner';

  return {
    orgCfg,
    operatorBranch,
    isOwner,
    effectiveBranch: !isOwner && operatorBranch ? operatorBranch : hqState.activeBranchView || 'ALL'
  };
}

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

/**
 * 三级价格视野判定：'L0' (完全盲价) | 'L1' (仅见基准价) | 'L2' (全量账目视野)
 */
export function getCurrentPriceVisibility() {
  const matched =
    hqState.currentSubUserRecord ||
    (hqState.allSubUsers || []).find((u) => u.account_name === hqState.currentAccountCode);
  return getStaffPriceVisibility({
    currentRoleCode: hqState.currentRoleCode,
    currentSubUserRecord: matched
  });
}

/**
 * L0 完全盲价判定（兼容旧函数名，支持动态视野配置覆盖默认角色）
 */
export function isWarehouseBlindPrice() {
  return getCurrentPriceVisibility() === 'L0';
}

/**
 * 是否允许查看门店累计在账欠款、授信额度与返利核算（仅 L2 全量账目视野可见）
 */
export function canViewReceivablesAndProfits() {
  return getCurrentPriceVisibility() === 'L2';
}

/**
 * 原子能力检查（例如 hasCapability('finance_settle') / hasCapability('stock_in')）
 */
export function hasCapability(capKey) {
  const matched =
    hqState.currentSubUserRecord ||
    (hqState.allSubUsers || []).find((u) => u.account_name === hqState.currentAccountCode);
  return checkStaffCapability(
    {
      currentRoleCode: hqState.currentRoleCode,
      currentSubUserRecord: matched
    },
    capKey
  );
}

export function isAuditorReadOnly() {
  if (hqState.currentRoleCode === 'owner') return false;
  const matched =
    hqState.currentSubUserRecord ||
    (hqState.allSubUsers || []).find((u) => u.account_name === hqState.currentAccountCode);
  if (Array.isArray(matched?.capabilities)) {
    const writeCaps = [
      'stock_in', 'stock_out', 'driver_deliver', 'driver_collect',
      'qc_inspect', 'store_prospect', 'c2b_quote', 'order_confirm',
      'product_pricing', 'store_manage', 'finance_settle'
    ];
    return !writeCaps.some((k) => hasCapability(k));
  }
  return hqState.currentRoleCode === 'auditor';
}

export function getVisibleStoresForCurrentRole() {
  const { orgCfg, operatorBranch, isOwner } = getOrgRuntimeContext();
  let list = hqState.allStores || [];

  // 多分支模式下自动按分支隔离（单主体经营时自动跳过，零干扰）
  if (orgCfg.isMultiBranch) {
    list = filterRecordsByActiveBranch(list, {
      activeBranch: hqState.activeBranchView,
      operatorBranch,
      isOwner,
      getRecordBranch: (s) => s.custom_pricing?.branch_name || ''
    });
  }

  if (hqState.currentRoleCode !== 'sales') return list;
  return list.filter((s) => {
    const ownerAcc = s.custom_pricing?.sales_owner || '';
    return !ownerAcc || ownerAcc === hqState.currentAccountCode || ownerAcc === hqState.currentOperatorName;
  });
}

export function getVisibleOrdersForCurrentRole() {
  const { orgCfg, operatorBranch, isOwner } = getOrgRuntimeContext();
  const list = hqState.allOrders || [];
  if (!orgCfg.isMultiBranch) return list;

  return filterRecordsByActiveBranch(list, {
    activeBranch: hqState.activeBranchView,
    operatorBranch,
    isOwner,
    getRecordBranch: (o) => {
      const m = String(o?.note || o?.settlement_note || '').match(/\[分部:([^\]]+)\]/);
      if (m) return m[1];
      const st = (hqState.allStores || []).find((s) => Number(s.id) === Number(o.store_id));
      return st?.custom_pricing?.branch_name || '';
    }
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
  const { effectiveBranch } = getOrgRuntimeContext();
  let basePrice = parseFloat(prod?.tier_1_price || 0);

  // 如果当前分支设定了独立区域定价，优先采用分支定价
  const branchKey = store?.custom_pricing?.branch_name || (effectiveBranch !== 'ALL' ? effectiveBranch : '');
  if (branchKey && prod?.custom_specs?.branch_prices?.[branchKey] !== undefined) {
    const bp = parseFloat(prod.custom_specs.branch_prices[branchKey]);
    if (!isNaN(bp) && bp > 0) basePrice = bp;
  }

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
