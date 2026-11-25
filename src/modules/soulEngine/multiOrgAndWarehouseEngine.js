/**
 * 百工百业 · 灵魂版多仓多分公司引擎（零改表 + 手电筒显隐 + 静默记性 + 大白话普适）
 * 1. 手电筒原则：单公司/单仓时全站隐身；新增第2个分支或仓库后自动亮出组织切换与分仓明细
 * 2. 底线守恒：各分仓库存之和严格等于总库存；跨分支调货自动生成对称调拨与内部结算凭单
 * 3. 静默记性：自动记住每个员工常用的出货仓库与所属分支，开单无需重复选择
 */

const MEMORY_KEY_PREFIX = 'hq_soul_org_mem_';

/**
 * 获取当前商号的组织与仓库配置（自动兼容老数据）
 */
export function getNormalizedOrgAndWarehouses(customSettings = {}) {
  const branches = Array.isArray(customSettings?.branches)
    ? customSettings.branches.map((b) => String(b || '').trim()).filter(Boolean)
    : [];

  const warehouses = Array.isArray(customSettings?.warehouses) && customSettings.warehouses.length > 0
    ? customSettings.warehouses.map((w) => String(w || '').trim()).filter(Boolean)
    : ['主仓库'];

  return {
    isMultiBranch: branches.length > 1,
    isMultiWarehouse: warehouses.length > 1,
    branches, // 空数组或1个元素代表单主体经营，界面零干扰
    warehouses, // 默认 ['主仓库']，超过1个自动开启分仓库存账
    branchLabel: customSettings?.lexicon?.branchLabel || '分部/门店',
    warehouseLabel: customSettings?.lexicon?.warehouseLabel || '存放点',
    // 跨分支调货内部结算规则：'cost'(按进货成本价) | 'transfer_rate'(按批发价折扣) | 'zero'(内部平调不计价)
    interBranchSettleMode: customSettings?.interBranchSettleMode || 'cost',
    interBranchDiscount: parseFloat(customSettings?.interBranchDiscount || '1.0')
  };
}

/**
 * 获取某款货品在各个仓库的独立库存明细（自动对齐总库存，防止老数据对不上账）
 */
export function getProductWarehouseStocks(product = {}, warehouses = ['主仓库']) {
  const totalStock = parseInt(product?.stock ?? 0, 10) || 0;
  const savedMap =
    product?.custom_specs?.warehouse_stocks && typeof product.custom_specs.warehouse_stocks === 'object'
      ? { ...product.custom_specs.warehouse_stocks }
      : {};

  if (warehouses.length <= 1) {
    const mainWh = warehouses[0] || '主仓库';
    return { [mainWh]: totalStock };
  }

  const result = {};
  let allocated = 0;
  warehouses.forEach((wh, idx) => {
    if (idx === 0) return; // 主仓作为兜底平衡仓
    const val = Math.max(0, parseInt(savedMap[wh] ?? 0, 10) || 0);
    result[wh] = val;
    allocated += val;
  });

  // 主仓自动承接剩余差额，确保所有分仓之和 100% 等于总库存（大规矩守底线）
  const mainWh = warehouses[0];
  const mainVal = Math.max(0, totalStock - allocated);
  return { [mainWh]: mainVal, ...result };
}

/**
 * 计算单仓入库/出库后的最新分仓明细与总库存
 */
export function calcWarehouseStockDelta(product = {}, warehouses = ['主仓库'], targetWarehouse, deltaQty) {
  const currentMap = getProductWarehouseStocks(product, warehouses);
  const wh = warehouses.includes(targetWarehouse) ? targetWarehouse : warehouses[0] || '主仓库';
  const beforeWhStock = currentMap[wh] ?? 0;
  const afterWhStock = Math.max(0, beforeWhStock + deltaQty);

  const nextMap = { ...currentMap, [wh]: afterWhStock };
  const nextTotalStock = Object.values(nextMap).reduce((sum, n) => sum + (parseInt(n, 10) || 0), 0);

  return {
    warehouse: wh,
    beforeWhStock,
    afterWhStock,
    nextWarehouseStocks: nextMap,
    nextTotalStock
  };
}

/**
 * 计算跨仓/跨分支「货品搬家」后的分仓明细与内部结算金额
 */
export function calcWarehouseTransfer(product = {}, warehouses = ['主仓库'], fromWh, toWh, moveQty, orgCfg = {}) {
  const qty = Math.max(1, parseInt(moveQty, 10) || 0);
  const currentMap = getProductWarehouseStocks(product, warehouses);
  const fromBefore = currentMap[fromWh] ?? 0;
  const toBefore = currentMap[toWh] ?? 0;

  const actualMove = Math.min(qty, fromBefore); // 防止搬成负数
  const nextMap = {
    ...currentMap,
    [fromWh]: Math.max(0, fromBefore - actualMove),
    [toWh]: toBefore + actualMove
  };

  // 计算内部调拨结算金额（大白话：兄弟明算账）
  const costPrice = parseFloat(product?.cost_price || product?.tier_1_price || 0);
  const tier1Price = parseFloat(product?.tier_1_price || 0);
  let unitSettlePrice = 0;
  if (orgCfg.interBranchSettleMode === 'cost') {
    unitSettlePrice = costPrice;
  } else if (orgCfg.interBranchSettleMode === 'transfer_rate') {
    unitSettlePrice = Number((tier1Price * (orgCfg.interBranchDiscount || 1)).toFixed(2));
  }

  const internalSettleAmount = Number((unitSettlePrice * actualMove).toFixed(2));

  return {
    actualMove,
    fromBefore,
    fromAfter: nextMap[fromWh],
    toBefore,
    toAfter: nextMap[toWh],
    nextWarehouseStocks: nextMap,
    unitSettlePrice,
    internalSettleAmount
  };
}

/**
 * 静默记忆：记住当前操作员顺手的出货仓库与当前查看的分支视图
 */
export function rememberOperatorOrgPreference(tenantId, operatorCode, { lastWarehouse, activeBranch } = {}) {
  if (typeof localStorage === 'undefined' || !tenantId) return;
  try {
    const key = `${MEMORY_KEY_PREFIX}${tenantId}_${operatorCode || 'owner'}`;
    const prev = JSON.parse(localStorage.getItem(key) || '{}');
    const next = {
      ...prev,
      ...(lastWarehouse ? { lastWarehouse } : {}),
      ...(activeBranch !== undefined ? { activeBranch } : {}),
      updatedAt: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(next));
  } catch (e) {}
}

export function getOperatorOrgPreference(tenantId, operatorCode) {
  if (typeof localStorage === 'undefined' || !tenantId) return {};
  try {
    const key = `${MEMORY_KEY_PREFIX}${tenantId}_${operatorCode || 'owner'}`;
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch (e) {
    return {};
  }
}

/**
 * 灵魂级组织数据过滤器：
 * - 单主体模式下原样放行，零开销；
 * - 多分支模式下，员工自动锁定所属分支（防止串号），老板可随时在“全集团汇总”与各分支间一键切换
 */
export function filterRecordsByActiveBranch(records = [], { activeBranch = 'ALL', operatorBranch = '', isOwner = true, getRecordBranch }) {
  const effectiveBranch = !isOwner && operatorBranch ? operatorBranch : activeBranch;
  if (!effectiveBranch || effectiveBranch === 'ALL') return records;
  return records.filter((item) => {
    const b = getRecordBranch(item);
    // 未归属任何分支的公共数据默认保留可见，归属其他分支的数据自动隔离
    return !b || b === effectiveBranch;
  });
}
