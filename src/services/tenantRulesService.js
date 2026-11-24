import { supabase } from '../lib/supabase.js';

export const INDUSTRY_RULE_PRESETS = {
  fresh_agri: {
    label: '🌾 村社生鲜果蔬行规',
    groupBuyTargetQty: 15,
    carrierWarnThreshold: 12,
    carrierDefaultDeposit: 15,
    expiryWarnDays: 7,
    creditWarnRatio: 0.8,
    qcAutoApproveLimit: 30,
    overCreditTolerancePct: 5,
    aiRiskSensitivity: 'balanced',
    settlementMethods: [
      { code: 'credit', label: '周期赊销记账' },
      { code: 'cash', label: '随车现结/扫码' },
      { code: 'barter_or_labor', label: '以物换物/农资抵扣' },
      { code: 'receipt_only', label: '先签回单·月底统对' }
    ],
    returnReasons: ['田间采收品相瑕疵', '运输途中压损', '临期保鲜调换', '规格不符退回']
  },
  grain_oil: {
    label: '🛢️ 粮油干货经销行规',
    groupBuyTargetQty: 10,
    carrierWarnThreshold: 20,
    carrierDefaultDeposit: 20,
    expiryWarnDays: 45,
    creditWarnRatio: 0.85,
    qcAutoApproveLimit: 50,
    overCreditTolerancePct: 10,
    aiRiskSensitivity: 'balanced',
    settlementMethods: [
      { code: 'credit', label: '月结挂账' },
      { code: 'cash', label: '货到付款' },
      { code: 'barter_or_labor', label: '原粮置换抵扣' }
    ],
    returnReasons: ['包装破袋漏洒', '受潮结块调换', '临期预警调剂', '多配退回']
  },
  craft_workshop: {
    label: '🏺 手工食品工坊行规',
    groupBuyTargetQty: 8,
    carrierWarnThreshold: 10,
    carrierDefaultDeposit: 25,
    expiryWarnDays: 15,
    creditWarnRatio: 0.8,
    qcAutoApproveLimit: 40,
    overCreditTolerancePct: 5,
    aiRiskSensitivity: 'strict',
    settlementMethods: [
      { code: 'cash', label: '现款现货' },
      { code: 'credit', label: '熟客授信挂账' },
      { code: 'barter_or_labor', label: '原料抵扣加工费' }
    ],
    returnReasons: ['手工批次口感差异', '礼盒外包装压痕', '节日备货调剂']
  },
  hardware_supply: {
    label: '🔧 五金建材配套行规',
    groupBuyTargetQty: 5,
    carrierWarnThreshold: 8,
    carrierDefaultDeposit: 50,
    expiryWarnDays: 180,
    creditWarnRatio: 0.9,
    qcAutoApproveLimit: 100,
    overCreditTolerancePct: 15,
    aiRiskSensitivity: 'relaxed',
    settlementMethods: [
      { code: 'credit', label: '工程进度月结' },
      { code: 'cash', label: '现结开票' },
      { code: 'receipt_only', label: '工地签收单对账' }
    ],
    returnReasons: ['型号规格拿错调换', '工程余料退库', '配件瑕疵包换']
  }
};

export function getNormalizedTenantRules(rawSettings = {}) {
  const s = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const base = INDUSTRY_RULE_PRESETS.fresh_agri;
  return {
    presetKey: s.presetKey || 'fresh_agri',
    groupBuyTargetQty: Math.max(1, Number(s.groupBuyTargetQty ?? base.groupBuyTargetQty)),
    carrierWarnThreshold: Math.max(1, Number(s.carrierWarnThreshold ?? base.carrierWarnThreshold)),
    carrierDefaultDeposit: Math.max(0, Number(s.carrierDefaultDeposit ?? base.carrierDefaultDeposit)),
    expiryWarnDays: Math.max(1, Number(s.expiryWarnDays ?? base.expiryWarnDays)),
    creditWarnRatio: Math.min(1, Math.max(0.1, Number(s.creditWarnRatio ?? base.creditWarnRatio))),
    qcAutoApproveLimit: Math.max(0, Number(s.qcAutoApproveLimit ?? base.qcAutoApproveLimit)),
    overCreditTolerancePct: Math.max(0, Number(s.overCreditTolerancePct ?? base.overCreditTolerancePct)),
    aiRiskSensitivity: ['strict', 'balanced', 'relaxed'].includes(s.aiRiskSensitivity) ? s.aiRiskSensitivity : 'balanced',
    settlementMethods: Array.isArray(s.settlementMethods) && s.settlementMethods.length > 0 ? s.settlementMethods : base.settlementMethods,
    returnReasons: Array.isArray(s.returnReasons) && s.returnReasons.length > 0 ? s.returnReasons : base.returnReasons,
    aiWhitelistKeys: Array.isArray(s.aiWhitelistKeys) ? s.aiWhitelistKeys : []
  };
}

/**
 * 本地毫秒级 AI 风险雷达评估引擎（V1）
 * 规则透明、可解释、支持白名单自学习免打扰，无外部调用延迟
 */
export function evaluateTenantRiskRadar({ stores = [], products = [], orders = [], logs = [], rules }) {
  const cfg = getNormalizedTenantRules(rules);
  const whitelist = new Set(cfg.aiWhitelistKeys);
  const alerts = [];

  const sensFactor = cfg.aiRiskSensitivity === 'strict' ? 0.85 : cfg.aiRiskSensitivity === 'relaxed' ? 1.2 : 1.0;

  // 1. 财务与坏账剪刀差雷达
  stores.forEach((st) => {
    const debt = parseFloat(st.current_debt || 0);
    const limit = parseFloat(st.credit_limit || 2000);
    const ratio = limit > 0 ? debt / limit : 0;
    const alertKey = `debt_risk_${st.id}`;

    if (!whitelist.has(alertKey) && debt > 0 && ratio >= cfg.creditWarnRatio * sensFactor) {
      const score = Math.min(98, Math.round(ratio * 85));
      alerts.push({
        key: alertKey,
        category: '财务坏账预警',
        level: score >= 80 ? 'high' : 'medium',
        score,
        title: `【${st.name}】在账欠款逼近/超出授信红线`,
        reason: `当前在账 ¥${debt.toFixed(2)}，占授信上限 ¥${limit.toFixed(0)} 的 ${(ratio * 100).toFixed(0)}%（警戒线 ${(cfg.creditWarnRatio * 100).toFixed(0)}%）。`,
        suggestion: '建议下笔订单切换为「随车现结」或安排业务员上门核对回款。',
        actionType: 'switch_store_cash',
        targetId: st.id
      });
    }

    // 2. 载具流失滞留风险雷达
    const baskets = parseInt(st.carrier_hold_count || st.basket_count || 0, 10);
    const basketKey = `carrier_risk_${st.id}`;
    if (!whitelist.has(basketKey) && baskets >= Math.round(cfg.carrierWarnThreshold * sensFactor)) {
      const score = Math.min(92, 60 + Math.round((baskets - cfg.carrierWarnThreshold) * 2));
      alerts.push({
        key: basketKey,
        category: '载具滞留预警',
        level: score >= 80 ? 'high' : 'medium',
        score,
        title: `【${st.name}】滞留周转载具 ${baskets} 件`,
        reason: `已达到本商号设定的载具未还警戒线（${cfg.carrierWarnThreshold} 件），存在资产流失风险。`,
        suggestion: '已自动标记为随车重点清点回收门店，建议下次送货优先收回。',
        actionType: 'ack_only',
        targetId: st.id
      });
    }
  });

  // 3. 供应链临期滞销风险雷达
  const now = Date.now();
  const warnMs = cfg.expiryWarnDays * sensFactor * 24 * 3600 * 1000;
  products.forEach((p) => {
    if (p.status !== 'active' || parseInt(p.stock || 0, 10) <= 0 || !p.expiry_date) return;
    const expTs = new Date(`${p.expiry_date}T23:59:59`).getTime();
    const diffMs = expTs - now;
    const expKey = `expiry_risk_${p.id}`;

    if (!whitelist.has(expKey) && diffMs <= warnMs) {
      const daysLeft = Math.ceil(diffMs / (24 * 3600 * 1000));
      const score = daysLeft <= 2 ? 95 : 74;
      alerts.push({
        key: expKey,
        category: '临期损耗预警',
        level: score >= 80 ? 'high' : 'medium',
        score,
        title: `【${p.name}】${daysLeft <= 0 ? '已到保质期' : `仅剩 ${daysLeft} 天到期`}（余 ${p.stock} ${p.measure_unit || '件'}）`,
        reason: `保质期截止 ${p.expiry_date}，已进入本商号设定的 ${cfg.expiryWarnDays} 天临期预警窗口。`,
        suggestion: '建议立即调低天街拼单零售价加快周转，或推送给高销量合作门店消化。',
        actionType: 'ack_only',
        targetId: p.id
      });
    }
  });

  // 4. 异常低价/高频刷单交易检测
  const recentOrders = orders.slice(0, 60);
  const suspiciousLowOrders = recentOrders.filter(
    (o) => o.order_source === 'online_mall' && parseFloat(o.total_amount || 0) > 0 && parseFloat(o.total_amount || 0) <= 0.1
  );
  if (suspiciousLowOrders.length >= 3 && !whitelist.has('low_price_spike')) {
    alerts.push({
      key: 'low_price_spike',
      category: '异常低价套利雷达',
      level: 'high',
      score: 86,
      title: `近期出现 ${suspiciousLowOrders.length} 笔极低价（≤ ¥0.10）天街订单`,
      reason: '短时间内连续出现超低金额线上订单，存在刷单套利或误设引流价风险。',
      suggestion: '请核查商品标价；如属恶意刷单，可在顶部开启「本店紧急止损拉闸」暂停线上接单。',
      actionType: 'ack_only',
      targetId: 0
    });
  }

  return alerts.sort((a, b) => b.score - a.score);
}

/**
 * 将误报条目加入本商号 AI 白名单（自学习免打扰）
 */
export async function whitelistAiAlertKey(tenantId, currentSettings, alertKey) {
  const nextSettings = { ...(currentSettings && typeof currentSettings === 'object' ? currentSettings : {}) };
  const list = Array.isArray(nextSettings.aiWhitelistKeys) ? [...nextSettings.aiWhitelistKeys] : [];
  if (!list.includes(alertKey)) list.push(alertKey);
  nextSettings.aiWhitelistKeys = list;

  const { error } = await supabase
    .from('platform_tenant')
    .update({ custom_settings: nextSettings })
    .eq('tenant_id', tenantId);

  if (error) throw error;
  return nextSettings;
}
