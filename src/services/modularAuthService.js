import { supabase } from '../lib/supabase.js';

export const ATOMIC_CAPABILITIES = [
  { key: 'stock_in', label: '📥 制单入库（采收/完工）', group: '仓储产区' },
  { key: 'stock_out', label: '📤 开单出库（拣货/配发）', group: '仓储产区' },
  { key: 'driver_deliver', label: '🚚 随车送货与电子签收', group: '外勤履约' },
  { key: 'driver_collect', label: '💵 外勤随车/拜访收款', group: '外勤履约' },
  { key: 'qc_inspect', label: '🔧 实地定损与品质鉴证', group: '外勤履约' },
  { key: 'store_prospect', label: '🤝 新店开拓与意向立户', group: '市场拓客' },
  { key: 'c2b_quote', label: '📢 天街求购报价接单', group: '市场拓客' },
  { key: 'order_confirm', label: '📋 门店补货单审核排单', group: '调度内勤' },
  { key: 'product_pricing', label: '🏷️ 商品定价与合规上架', group: '商品运营' },
  { key: 'store_manage', label: '🏪 门店档案与授信调整', group: '账房内勤' },
  { key: 'finance_settle', label: '💰 财务点款销账与冲账', group: '账房内勤' },
  { key: 'data_export', label: '📊 报表导出与对账核算', group: '账房内勤' }
];

export const ROLE_PRESET_TEMPLATES = {
  warehouse: {
    label: '📦 仓储调度模板',
    priceVisibility: 'L0',
    capabilities: ['stock_in', 'stock_out', 'order_confirm']
  },
  producer: {
    label: '🌾 产区采收/班组长模板',
    priceVisibility: 'L0',
    capabilities: ['stock_in']
  },
  driver: {
    label: '🚚 送货师傅模板',
    priceVisibility: 'L1',
    capabilities: ['driver_deliver', 'driver_collect']
  },
  sales: {
    label: '🤝 业务员/客户经理模板',
    priceVisibility: 'L1',
    capabilities: ['driver_collect', 'store_prospect', 'c2b_quote', 'order_confirm']
  },
  qc_service: {
    label: '🔧 售后定损/质检模板',
    priceVisibility: 'L1',
    capabilities: ['qc_inspect', 'driver_deliver']
  },
  finance: {
    label: '💰 账房财务模板',
    priceVisibility: 'L2',
    capabilities: ['finance_settle', 'store_manage', 'data_export', 'order_confirm']
  },
  auditor: {
    label: '⚖️ 独立稽核监督模板',
    priceVisibility: 'L2',
    capabilities: ['data_export']
  }
};

export const PRICE_VISIBILITY_LEVELS = {
  L0: {
    code: 'L0',
    label: 'L0 · 完全盲价（仅见实物数量）',
    desc: '隐藏一切商品单价、货值、客户欠款与利润，适合仓管与产区班组长'
  },
  L1: {
    code: 'L1',
    label: 'L1 · 仅见基准价（屏蔽账款利润）',
    desc: '可见商品出厂价/批发基准价，屏蔽门店累计在账欠款、授信余额与总利润'
  },
  L2: {
    code: 'L2',
    label: 'L2 · 全量账目视野（账房/稽核）',
    desc: '可见完整商品定价、门店应收欠款、授信额度与返利核算流水'
  }
};

/**
 * 解析当前子账号的有效权限集合（兼容老账号 role_code，自动合并未过期的临时代班权限）
 */
export function resolveEffectiveStaffAuth(roleCode, subUserRow = null) {
  if (roleCode === 'owner') {
    return {
      isOwner: true,
      priceVisibility: 'L2',
      capabilities: ATOMIC_CAPABILITIES.map((c) => c.key),
      activeDelegation: null
    };
  }

  const fallbackTpl = ROLE_PRESET_TEMPLATES[roleCode] || {
    priceVisibility: 'L0',
    capabilities: []
  };

  const baseCaps = Array.isArray(subUserRow?.capabilities)
    ? subUserRow.capabilities
    : fallbackTpl.capabilities;

  const baseVisibility = ['L0', 'L1', 'L2'].includes(subUserRow?.price_visibility)
    ? subUserRow.price_visibility
    : fallbackTpl.priceVisibility;

  const mergedSet = new Set(baseCaps);
  let activeDelegation = null;

  if (subUserRow?.delegate_until && Array.isArray(subUserRow?.delegate_capabilities)) {
    const expMs = new Date(subUserRow.delegate_until).getTime();
    if (!isNaN(expMs) && Date.now() < expMs && subUserRow.delegate_capabilities.length > 0) {
      subUserRow.delegate_capabilities.forEach((k) => mergedSet.add(k));
      activeDelegation = {
        until: subUserRow.delegate_until,
        capabilities: subUserRow.delegate_capabilities
      };
    }
  }

  return {
    isOwner: false,
    priceVisibility: baseVisibility,
    capabilities: Array.from(mergedSet),
    activeDelegation
  };
}

/**
 * 检查当前登录人是否具备某项原子能力
 */
export function checkStaffCapability(hqStateObj, capKey) {
  if (hqStateObj.currentRoleCode === 'owner') return true;
  const auth = resolveEffectiveStaffAuth(hqStateObj.currentRoleCode, hqStateObj.currentSubUserRecord);
  return auth.capabilities.includes(capKey);
}

/**
 * 获取当前登录人的三级价格视野等级 ('L0' | 'L1' | 'L2')
 */
export function getStaffPriceVisibility(hqStateObj) {
  if (hqStateObj.currentRoleCode === 'owner') return 'L2';
  const auth = resolveEffectiveStaffAuth(hqStateObj.currentRoleCode, hqStateObj.currentSubUserRecord);
  return auth.priceVisibility;
}

/**
 * 大额操作双人复核（Maker-Checker）发起提交
 * 当商号开启双人复核且单笔金额超过阈值时，先入待签队列，由另一位授权人或大当家终审生效
 */
export async function submitDualApprovalTask({
  tenantId,
  actionType,
  actionTitle,
  amount,
  payload,
  initiatorName
}) {
  const { data, error } = await supabase
    .from('tenant_dual_approval_queue')
    .insert([
      {
        tenant_id: tenantId,
        action_type: actionType,
        action_title: actionTitle,
        amount: Number(amount || 0),
        payload: payload || {},
        initiator_name: initiatorName,
        status: 'pending'
      }
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}
