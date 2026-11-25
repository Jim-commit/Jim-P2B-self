/**
 * 百工百业 · 第1步核心引擎：自由行话词典 + 静默自学习记忆 + 算账顺手辅助
 * 特点：零破坏性，全部数据收敛于 tenant.custom_settings 与 localStorage，自动兼容所有老数据
 */

// 1. 默认大白话词典（不设硬编码行业限制，商号可随时自由改写）
export const DEFAULT_LEXICON = {
  partnerLabel: '客户/门店',     // 可改叫：客户、门店、工地、会员、合作方
  itemLabel: '货品/项目',        // 可改叫：商品、货品、项目、服务、物料
  orderLabel: '业务单',          // 可改叫：送货单、结算单、项目单、服务单
  warehouseLabel: '存放点',      // 可改叫：仓库、总仓、分仓、工程车
  carrierLabel: '外借器具',      // 可改叫：周转箱、空桶、钢瓶、模具、样机
  defaultUnits: ['箱', '件', '斤', '套', '户/月', '小时', '趟', '批']
};

/**
 * 获取当前商号的自由词典（优先读取 custom_settings.lexicon）
 */
export function getTenantLexicon(tenantSettings = {}) {
  const custom = tenantSettings?.lexicon || {};
  return {
    ...DEFAULT_LEXICON,
    ...custom,
    defaultUnits: Array.from(
      new Set([...(custom.defaultUnits || []), ...DEFAULT_LEXICON.defaultUnits])
    )
  };
}

/**
 * 词典文案替换辅助函数：自动把界面里的通用词替换成老板习惯的行话
 */
export function tLabel(key, tenantSettings = {}) {
  const lex = getTenantLexicon(tenantSettings);
  return lex[key] || DEFAULT_LEXICON[key] || key;
}

// ============================================================================
// 2. 静默自学习记忆引擎（不弹窗打扰，越用越懂老板习惯）
// ============================================================================

const MEMORY_STORAGE_KEY = 'bg_silent_memory_v1';

function loadLocalMemory(tenantId = 'default') {
  try {
    const raw = localStorage.getItem(`${MEMORY_STORAGE_KEY}_${tenantId}`);
    return raw ? JSON.parse(raw) : {
      lastPrices: {},       // { "storeId_productId": { price: 120, unit: "箱", updatedAt: "..." } }
      partnerTopItems: {},  // { "storeId": { "productId": count } }
      unitFrequency: {},    // { "箱": 15, "套": 4 }
      paramTweaks: {},      // { "paramKey": { lastVal: X, streak: 2 } } 参数连续修改3次自进化
      menuClicks: {}        // { "menuKey": { count: 10, lastClick: 1732500000000 } }
    };
  } catch {
    return { lastPrices: {}, partnerTopItems: {}, unitFrequency: {}, paramTweaks: {}, menuClicks: {} };
  }
}

function saveLocalMemory(tenantId = 'default', memory) {
  try {
    localStorage.setItem(`${MEMORY_STORAGE_KEY}_${tenantId}`, JSON.stringify(memory));
  } catch (e) {
    console.warn('Silent memory local save skipped:', e);
  }
}

/**
 * 开单成交后静默学习：记住客户上次拿价、常拿货频次、常用单位
 */
export function recordOrderHabit(tenantId, { partnerId, items = [] }) {
  if (!partnerId || !Array.isArray(items) || items.length === 0) return;
  const mem = loadLocalMemory(tenantId);

  if (!mem.partnerTopItems[partnerId]) {
    mem.partnerTopItems[partnerId] = {};
  }

  items.forEach(item => {
    const pid = String(item.productId || item.id);
    if (!pid) return;

    // 1. 记住该客户对这件商品/项目的最新成交价
    if (Number(item.price) > 0) {
      mem.lastPrices[`${partnerId}_${pid}`] = {
        price: Number(item.price),
        unit: item.unit || '',
        updatedAt: new Date().toISOString()
      };
    }

    // 2. 累加该客户拿此货的次数（用于生成“常拿的货 Top6”）
    mem.partnerTopItems[partnerId][pid] = (mem.partnerTopItems[partnerId][pid] || 0) + 1;

    // 3. 累加单位使用频率
    if (item.unit) {
      mem.unitFrequency[item.unit] = (mem.unitFrequency[item.unit] || 0) + 1;
    }
  });

  saveLocalMemory(tenantId, mem);
  return mem;
}

/**
 * 查询某客户对某项目的“📌 他上次拿价”（先查本地记忆，没有则从历史订单自动回溯一条）
 */
export function getLastDealPrice(tenantId, partnerId, productId, historicalOrders = []) {
  if (!partnerId || !productId) return null;
  const mem = loadLocalMemory(tenantId);
  const cached = mem.lastPrices[`${partnerId}_${productId}`];
  if (cached && cached.price > 0) {
    return cached;
  }

  // 自动回溯历史已成交出库单
  for (let i = historicalOrders.length - 1; i >= 0; i--) {
    const ord = historicalOrders[i];
    if (String(ord.store_id || ord.partnerId) === String(partnerId) && Array.isArray(ord.items)) {
      const hit = ord.items.find(it => String(it.product_id || it.productId || it.id) === String(productId));
      if (hit && Number(hit.price) > 0) {
        return { price: Number(hit.price), unit: hit.unit || '', updatedAt: ord.created_at || '' };
      }
    }
  }
  return null;
}

/**
 * 获取某客户“🔥 他常拿的货 Top6”胶囊列表
 */
export function getPartnerTop6Items(tenantId, partnerId, allProducts = [], historicalOrders = []) {
  if (!partnerId) return [];
  const mem = loadLocalMemory(tenantId);
  const freqMap = { ...(mem.partnerTopItems[partnerId] || {}) };

  // 若本地记忆尚浅，融合历史订单统计
  if (Object.keys(freqMap).length < 6 && Array.isArray(historicalOrders)) {
    historicalOrders.forEach(ord => {
      if (String(ord.store_id || ord.partnerId) === String(partnerId) && Array.isArray(ord.items)) {
        ord.items.forEach(it => {
          const pid = String(it.product_id || it.productId || it.id);
          if (pid) freqMap[pid] = (freqMap[pid] || 0) + 1;
        });
      }
    });
  }

  return Object.entries(freqMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([pid, count]) => {
      const prod = allProducts.find(p => String(p.id) === String(pid));
      return prod ? { ...prod, _orderCount: count } : null;
    })
    .filter(Boolean);
}

/**
 * 参数微调自进化：同一默认参数连续 3 次手动改成相同新值，自动返回 true 提示升级默认值
 */
export function trackParamAutoEvolve(tenantId, paramKey, newValue, currentDefault) {
  if (newValue === currentDefault || newValue === undefined || newValue === '') return false;
  const mem = loadLocalMemory(tenantId);
  const prev = mem.paramTweaks[paramKey];

  if (prev && String(prev.lastVal) === String(newValue)) {
    prev.streak += 1;
  } else {
    mem.paramTweaks[paramKey] = { lastVal: newValue, streak: 1 };
  }

  const evolved = mem.paramTweaks[paramKey].streak >= 3;
  if (evolved) {
    mem.paramTweaks[paramKey].streak = 0; // 重置计数，已静默升级
  }
  saveLocalMemory(tenantId, mem);
  return evolved;
}

// ============================================================================
// 3. 一线算账顺手神器：抹零头 / 一口价凑整 + 亏本红字检测
// ============================================================================

/**
 * 计算抹零与一口价凑整（差额归入单据级“老板让利”，不污染单品单价与成本）
 * @param {number} rawTotal 原始合计金额
 * @param {'fen'|'jiao'|'yuan'|'custom'} mode 抹零模式：抹分、抹角、抹个位、一口价
 * @param {number} customFinal 一口价目标实收金额
 */
export function calcRoundOffDiscount(rawTotal, mode = 'jiao', customFinal = null) {
  const total = Math.max(0, Number(rawTotal) || 0);
  let finalAmount = total;

  if (mode === 'fen') {
    finalAmount = Math.floor(total * 10) / 10;       // 抹掉分位，保留到角
  } else if (mode === 'jiao') {
    finalAmount = Math.floor(total);                 // 抹掉角分，保留到元
  } else if (mode === 'yuan') {
    finalAmount = Math.floor(total / 10) * 10;       // 抹掉个位，凑十元整
  } else if (mode === 'custom' && customFinal !== null && Number(customFinal) >= 0) {
    finalAmount = Number(customFinal);
  }

  const discountAmount = Number((total - finalAmount).toFixed(2));
  return {
    rawTotal: Number(total.toFixed(2)),
    finalAmount: Number(finalAmount.toFixed(2)),
    bossDiscount: discountAmount // 正数表示老板让利抹零，负数表示加价补齐
  };
}

/**
 * 亏本卖货红字检测：单价低于最近进货成本价时返回预警对象
 */
export function checkBelowCostAlert(sellingPrice, product = {}) {
  const price = Number(sellingPrice);
  const costPrice = Number(product.cost_price ?? product.costPrice ?? 0);
  if (costPrice > 0 && price > 0 && price < costPrice) {
    const lossPerUnit = Number((costPrice - price).toFixed(2));
    return {
      isLoss: true,
      costPrice,
      lossPerUnit,
      message: `⚠️ 低于进货成本价 (¥${costPrice})，每单位亏 ¥${lossPerUnit}`
    };
  }
  return { isLoss: false, costPrice, lossPerUnit: 0, message: '' };
}
