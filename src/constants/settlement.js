/**
 * 东方商道度量引擎：义利兼顾，量入为出，度量衡正
 */
export const SETTLEMENT_CONFIG = {
  credit: { label: '相照授信 (账期)', desc: '君子之交，凭信立市；按商约周期挂账结算' },
  cash: { label: '当面现结 (现款/即付)', desc: '钱货当面相照，一手点物一手交款' },
  monthly: { label: '月度期结 (按期对账)', desc: '按月规整单据，依约清账' },
  rolling: { label: '压批流转 (压一付一)', desc: '新货压存为底，收回上批货资' },
  consignment: { label: '铺市代销 (实销实结)', desc: '助友试销，卖出方结，滞销完好还库' },
  custom: { label: '商契专约 (量身定规)', desc: '因时因地制宜，双方情分专案约定' }
};

export const RETURN_REASONS = [
  '包装受挤破损 · 难呈顾客',
  '时令流转滞销 · 避损调换',
  '错订规格偏差 · 原样退换',
  '物料异议商榷 · 诚信退验'
];

export const EXCHANGE_REASONS = [
  '破损同款对换 · 完好上架',
  '封签污渍平换 · 新盒相抵',
  '同等价位调剂 · 活络货架'
];

/**
 * 经营体察与风控体检 (行胜于言的量化考量)
 * 摒弃生硬的惩罚逻辑，旨在守护供采双方的资产安全与持久互信
 */
export function analyzeOrderRiskAI({
  orderItems = [],
  returnItems = [],
  exchangeItems = [],
  storeQuota = 500,
  usedQuota = 0,
  currentDebt = 0,
  creditLimit = 2000,
  basketCount = 0
}) {
  const orderTotal = orderItems.reduce((acc, it) => acc + ((parseFloat(it.price) || 0) * (parseInt(it.qty) || 0)), 0);
  const returnTotal = returnItems.reduce((acc, it) => acc + ((parseFloat(it.price) || 0) * (parseInt(it.qty) || 0)), 0);
  const remainQuota = Math.max(0, storeQuota - usedQuota);

  const tips = [];
  let score = 90; // 信义基准分 (0 - 100，越高代表越平顺)

  // 1. 体察退换规模比例
  const totalFlow = orderTotal + returnTotal;
  const returnRatio = totalFlow > 0 ? (returnTotal / totalFlow) : 0;
  if (returnTotal > 0) {
    if (returnRatio > 0.45) {
      score -= 35;
      tips.push(`⚠️ 【损益关注】退货抵扣占本期采销 ${(returnRatio * 100).toFixed(0)}%，比例偏高，建议亲切关照掌柜临期或仓储状况。`);
    } else if (returnRatio > 0.25) {
      score -= 15;
      tips.push(`💡 【换流平稳】退货占本期 ${(returnRatio * 100).toFixed(0)}%，在寻常调配浮动之内。`);
    }
  }

  // 2. 体察月度调退额度
  if (returnTotal > remainQuota) {
    score -= 30;
    const diff = returnTotal - remainQuota;
    tips.push(`🚨 【度量超额】退款超出当期免批宽限 ¥${diff.toFixed(2)} (结余 ¥${remainQuota.toFixed(2)})，宜请随车人亲查残损原由。`);
  }

  // 3. 体察借用物资（周转筐）流转情况
  if (basketCount >= 18) {
    score -= 10;
    tips.push(`🧺 【物料融通】小店借存周转筐 ${basketCount} 个，宜顺道迎回闲置空筐，免占店面空间。`);
  }

  // 4. 衡量信用负荷
  const debtRatio = creditLimit > 0 ? (currentDebt / creditLimit) : 0;
  if (debtRatio >= 0.85) {
    score -= 20;
    tips.push(`💳 【诚信通融】挂账已承载授信的 ${(debtRatio * 100).toFixed(0)}% (欠 ¥${currentDebt} / 额 ¥${creditLimit})，本期宜共商收回部分货资。`);
  }

  let healthLevel = 'green'; // green: 稳健安和 | amber: 宜复核商量 | red: 须特信通融
  if (score < 50) healthLevel = 'red';
  else if (score < 75) healthLevel = 'amber';

  if (tips.length === 0) {
    tips.push('🌸 【履约淳厚】往来账目明澈，调退循矩，宜即刻排单装车，共赢商机。');
  }

  return {
    healthScore: Math.max(10, score),
    healthLevel,
    tips,
    orderTotal,
    returnTotal,
    netTotal: Math.max(0, orderTotal - returnTotal)
  };
}
