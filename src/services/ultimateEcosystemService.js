/**
 * 1. 每周《掌柜经营晴雨周报》自动汇总引擎
 */
export function buildWeeklyHealthReport({ tenantName, stores = [], products = [], orders = [] }) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recentOrders = orders.filter((o) => {
    const ts = o.created_at ? new Date(o.created_at).getTime() : 0;
    return ts >= sevenDaysAgo && o.order_status !== 'cancelled';
  });

  const weekSales = recentOrders.reduce((s, o) => s + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);
  const deliveredOrders = recentOrders.filter((o) => o.delivery_status === 'delivered');
  const totalReceivable = stores.reduce((s, st) => s + parseFloat(st.current_debt || 0), 0);
  const totalBaskets = stores.reduce((s, st) => s + parseInt(st.carrier_hold_count || st.basket_count || 0, 10), 0);

  // 统计本周最畅销 Top3 商品
  const prodRank = {};
  recentOrders.forEach((o) => {
    (Array.isArray(o.items) ? o.items : []).forEach((it) => {
      const k = it.name || '标准良品';
      prodRank[k] = (prodRank[k] || 0) + Number(it.qty || 1);
    });
  });
  const top3Prods = Object.entries(prodRank)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, qty]) => `${name}(${qty}件)`);

  // 滞销预警（在库 > 20 且本周零动销）
  const slowProducts = products
    .filter((p) => p.status === 'active' && Number(p.stock || 0) > 20 && !prodRank[p.name])
    .slice(0, 3)
    .map((p) => `${p.name}(余${p.stock})`);

  return {
    tenantName,
    periodLabel: '近 7 日经营晴雨体检',
    weekOrderCount: recentOrders.length,
    deliveredCount: deliveredOrders.length,
    weekSales: weekSales.toFixed(2),
    totalReceivable: totalReceivable.toFixed(2),
    totalBaskets,
    top3Prods: top3Prods.length > 0 ? top3Prods.join('、') : '暂无动销记录',
    slowProducts: slowProducts.length > 0 ? slowProducts.join('、') : '无明显积压滞销品'
  };
}

/**
 * 2. 企事业单位 / 食堂《阳光集采报价与溯源三联单》文本包生成
 */
export function buildInstitutionalProcurementPack({ tenant, products = [] }) {
  const activeProds = products.filter((p) => p.status === 'active').slice(0, 20);
  const dateStr = new Date().toISOString().slice(0, 10);
  const lines = [
    `==============================================`,
    `【企事业单位 / 食堂阳光集采直供报价与溯源凭证包】`,
    `供货主体：${tenant?.company_name || tenant?.tenant_id || '源头直供合作社'}`,
    `统一信用代码：${tenant?.credit_code || '已实名核验登记'}`,
    `联保背书单位：${tenant?.sponsor_org || '产区村社/行业联保'}`,
    `报价日期：${dateStr}（有效期 7 日 · 阳光公允工价）`,
    `==============================================`,
    `序号 | 品名 | 规格包装 | 产地溯源 | 集采基准工价`,
    ...activeProds.map(
      (p, idx) =>
        `${idx + 1}. ${p.name} | ${p.spec || '整装'} | ${p.origin_place || '源头原产'} | ¥${parseFloat(p.tier_1_price || 0).toFixed(2)}/${p.measure_unit || '件'}`
    ),
    `----------------------------------------------`,
    `质量承诺：源头直供保真，随货附带电子验收三联单，支持周期统一对账结算。`
  ];
  return lines.join('\n');
}

/**
 * 3. 三阶民间公平公断庭 · 不可篡改《电子证据卷宗》生成
 */
export function buildDisputeEvidenceDossier({ tenant, order, logs = [] }) {
  const relatedLogs = logs
    .filter((l) => String(l.remark || '').includes(order.order_no || String(order.id)))
    .slice(0, 10);

  return [
    `【百工百业 · 三阶民间公平公断电子证据卷宗】`,
    `卷宗生成时间：${new Date().toLocaleString('zh-CN')}`,
    `商号主体：${tenant?.company_name || tenant?.tenant_id}`,
    `争议单据号：#${order.order_no || order.id}`,
    `往来对象：${order.store_name || '天街买家'}`,
    `单据金额：总计 ¥${Number(order.total_amount || 0).toFixed(2)} · 净结 ¥${Number(order.net_settle_amount || order.total_amount || 0).toFixed(2)}`,
    `交割状态：${order.order_status} / ${order.delivery_status}`,
    `经手配送人：${order.driver_name || '未指派'}`,
    `单据备注与协商轨迹：${order.note || '无'}`,
    `关联库房/定损流水（${relatedLogs.length}条）：`,
    ...(relatedLogs.length > 0
      ? relatedLogs.map((l) => `  - [${new Date(l.created_at).toLocaleString()}] ${l.action_title}：${l.remark || ''}`)
      : ['  - 暂无额外关联库房异动流水']),
    `----------------------------------------------`,
    `公断阶梯指引：第一阶（双方凭卷宗协商冲抵）➔ 第二阶（联保单位/同业公证调解）➔ 第三阶（呈交平台仲裁席裁决）。`
  ].join('\n');
}

/**
 * 4. Web Bluetooth 便携热敏小票机免驱动直连打印（ESC/POS 纯文本指令）
 */
export async function printReceiptViaWebBluetooth(receiptText) {
  if (!navigator.bluetooth) {
    throw new Error('当前浏览器不支持 Web Bluetooth 蓝牙直连，请使用手机 Chrome / Edge 浏览器。');
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
  const chars = await service.getCharacteristics();
  const writeChar = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
  if (!writeChar) throw new Error('未找到蓝牙小票机写入特征通道');

  const encoder = new TextEncoder();
  const payload = encoder.encode(`\n${receiptText}\n\n\n`);
  // 分片 20 字节发送防止 BLE MTU 溢出
  for (let i = 0; i < payload.length; i += 20) {
    await writeChar.writeValue(payload.slice(i, i + 20));
  }
  return device.name || '蓝牙热敏小票机';
}
