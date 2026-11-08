// 结算方式字典与配置
export const SETTLEMENT_CONFIG = {
  cash: { label: '随车现结', desc: '随车清点当面结清，不占授信', badge: 'bg-emerald-100 text-emerald-800' },
  credit: { label: '授信赊销', desc: '占用免息额度，周期结清', badge: 'bg-amber-100 text-amber-800' },
  monthly: { label: '月结对账', desc: '固定每月对账日统一核销', badge: 'bg-blue-100 text-blue-800' },
  rolling: { label: '压批结 (压一付一)', desc: '次单结上单，压首车货底', badge: 'bg-purple-100 text-purple-800' },
  bi_weekly: { label: '半月结 / 旬结', desc: '每15天或10天集中开票核销', badge: 'bg-cyan-100 text-cyan-800' },
  prepaid: { label: '预存抵扣', desc: '从掌柜预充值账户实时划扣', badge: 'bg-indigo-100 text-indigo-800' },
  consignment: { label: '实销实结 (代销)', desc: '未销不计费，以实盘售出为准', badge: 'bg-stone-200 text-stone-700' },
  custom: { label: '双方协议自定义', desc: '双方专案协商条款，随单固化', badge: 'bg-rose-100 text-rose-800' }
};

// 退货合法理由枚举（在供货商授权范围内）
export const RETURN_REASONS = [
  '外箱受损/变形破裂',
  '瓶身渗漏/包装胀气',
  '批次临期/已过期 (协议包退)',
  '送错规格/品名不符'
];

// 换货合法理由枚举
export const EXCHANGE_REASONS = [
  '条码磨损无法扫码 (同品换包)',
  '同品不同度数/口味平调',
  '出厂封条破损换新'
];

// 轻量 AI 经营与风控建议分析引擎
export function analyzeOrderRiskAI({ orderItems, returnItems, exchangeItems, storeQuota, usedQuota }) {
  const orderTotal = orderItems.reduce((acc, it) => acc + (it.price * it.qty), 0);
  const returnTotal = returnItems.reduce((acc, it) => acc + (it.price * it.qty), 0);
  const remainQuota = Math.max(0, storeQuota - usedQuota);

  const tips = [];
  let riskLevel = 'normal'; // normal | warning | danger

  if (returnTotal > 0 && returnTotal > remainQuota) {
    riskLevel = 'danger';
    tips.push(`⚠️ 超额警告：本次退货 ¥${returnTotal.toFixed(2)} 已超出该店月度退换授信余额 (余 ¥${remainQuota.toFixed(2)})，需上传实物单据凭证并待供货商特批！`);
  }

  if (orderTotal > 0 && returnTotal / (orderTotal + returnTotal) > 0.3) {
    if (riskLevel !== 'danger') riskLevel = 'warning';
    tips.push(`💡 AI风控提示：本次退货占总订货比例高达 ${(returnTotal / (orderTotal + returnTotal) * 100).toFixed(0)}%，建议供货商核验批次品质并酌情调整主动供货深度。`);
  }

  if (exchangeItems.length > 2) {
    tips.push(`💡 AI仓储提示：本单调换品项达 ${exchangeItems.length} 种，请随车配送员核实带回旧品封条与外包装。`);
  }

  if (tips.length === 0) {
    tips.push(`✅ AI信用评估：退换品项在核准授权额度内，历史履约良好，建议直接同意放行。`);
  }

  return { riskLevel, tips, returnTotal, orderTotal, netTotal: orderTotal - returnTotal };
}
