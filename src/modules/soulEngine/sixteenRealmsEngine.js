/**
 * 百工百业 · 十六重境界全景协作引擎 (零改表、插件化叠加、白纸手电筒原则)
 */
import { supabase } from '../../lib/supabase.js';
import {
  hqState,
  generateUnifiedVoucherNo,
  isAuditorReadOnly,
  getVisibleStoresForCurrentRole,
  getVisibleOrdersForCurrentRole
} from '../hq/hqState.js';
import { HQService } from '../../services/hqService.js';
import { getTenantLexicon } from './silentMemoryAndLexicon.js';

/**
 * 1. 一句话/语音全能自然语言记账解析器（支持：开单出库、采购入库、收款平账）
 */
export function parseNaturalBusinessCommand(rawText, stores = [], products = []) {
  const text = String(rawText || '').trim();
  if (!text) return { intent: 'unknown', summary: '请输入一句话描述业务' };

  const amountMatch = text.match(/(?:收|转|还|付|共|计|金额|每[箱件斤套袋瓶个台]?)?\s*(\d+(?:\.\d+)?)\s*(?:元|块|¥)/);
  const numMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:箱|件|斤|套|桶|袋|瓶|个|台|次|批|份)/);
  const qty = numMatch ? parseFloat(numMatch[1]) : 1;
  const moneyVal = amountMatch ? parseFloat(amountMatch[1]) : 0;

  const matchedStore =
    stores.find((s) => s.name && text.includes(s.name)) ||
    stores.find((s) => s.contact && s.contact !== '掌柜' && text.includes(s.contact)) ||
    null;

  const matchedProd =
    products.find((p) => p.status !== 'inactive' && p.name && text.includes(p.name)) ||
    products.find((p) => {
      if (p.status === 'inactive' || !p.name) return false;
      const shortName = p.name.replace(/\s+/g, '').slice(0, 3);
      return shortName.length >= 2 && text.includes(shortName);
    }) ||
    null;

  // 意图判定：收款/还账
  if (/(?:转了|还账|还款|收款|收到|微信转|支付宝转|结清|付了)/.test(text) && !/(?:进货|入库|采购)/.test(text)) {
    return {
      intent: 'collect',
      store: matchedStore,
      rawStoreName: matchedStore ? matchedStore.name : (text.match(/^([^\d,，。要给转还收]+?)(?:刚才|今天|微信|转|还|付)/)?.[1] || '散客/客户'),
      amount: moneyVal || parseFloat(text.match(/(\d+(?:\.\d+)?)/)?.[1] || '0'),
      method: text.includes('现金') ? '现金' : '电子扫码/转账',
      rawText: text
    };
  }

  // 意图判定：采购/生产入库
  if (/(?:进货|入库|采购|拉回|采收|入仓|到货)/.test(text)) {
    const unitPrice = moneyVal > 0 ? moneyVal : parseFloat(matchedProd?.cost_price || matchedProd?.tier_1_price || 0);
    const customProdName = matchedProd
      ? matchedProd.name
      : (text.match(/(?:进货|入库|采购|拉回|采收)\s*\d*\s*[箱件斤套桶袋瓶个台]?\s*([^\d,，。每元块]+)/)?.[1]?.trim() || '临时入库货品');
    return {
      intent: 'inbound',
      product: matchedProd,
      prodName: customProdName,
      qty,
      unitPrice,
      rawText: text
    };
  }

  // 默认意图：销售/送货开单
  const unitPrice = matchedProd ? parseFloat(matchedProd.tier_1_price || 0) : (qty > 0 && moneyVal > 0 ? Number((moneyVal / qty).toFixed(2)) : moneyVal);
  const customProdName = matchedProd
    ? matchedProd.name
    : (text.match(/\d+\s*(?:箱|件|斤|套|桶|袋|瓶|个|台|批|份)\s*([^\d,，。老挂现元块]+)/)?.[1]?.trim() || '临时直供货品');
  const rawStoreName = matchedStore
    ? matchedStore.name
    : (text.match(/(?:给|送|发|卖给)\s*([^\d,，。要来发配订]+?)(?:送|发|要|来|\d)/)?.[1]?.trim() || '临时散客');

  return {
    intent: 'outbound',
    store: matchedStore,
    rawStoreName,
    product: matchedProd,
    prodName: customProdName,
    qty,
    unitPrice,
    settlementType: text.includes('现结') || text.includes('现金') ? 'cash' : 'credit',
    naturalTerm: text.match(/(?:麦收后结|卖完结|月底结|验收后结|下趟结)/)?.[0] || '',
    rawText: text
  };
}

/**
 * 2. 扫描老客户静默流失预警（超过平时平均下单间隔 2 倍未下单）
 */
export function detectSilentChurnPartners(stores = [], orders = []) {
  const now = Date.now();
  const warnings = [];
  for (const s of stores) {
    const sOrders = orders
      .filter((o) => Number(o.store_id) === Number(s.id) && o.order_status !== 'cancelled')
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (sOrders.length < 2) continue;

    const latestTs = new Date(sOrders[0].created_at).getTime();
    const oldestTs = new Date(sOrders[sOrders.length - 1].created_at).getTime();
    if (!latestTs || !oldestTs || latestTs <= oldestTs) continue;

    const avgIntervalDays = Math.max(3, Math.round((latestTs - oldestTs) / (1000 * 86400 * (sOrders.length - 1))));
    const daysSinceLast = Math.floor((now - latestTs) / (1000 * 86400));

    if (daysSinceLast >= avgIntervalDays * 2 && daysSinceLast >= 7) {
      warnings.push({
        storeId: s.id,
        storeName: s.name,
        phone: s.phone || '',
        avgIntervalDays,
        daysSinceLast
      });
    }
  }
  return warnings.slice(0, 5);
}

/**
 * 3. 生成可彻底断网离线查询的纯本地单文件 HTML 账本（第十二重：极致本地主权）
 */
export function downloadOfflineStandaloneLedgerHtml() {
  const tenantName = hqState.currentTenantData?.company_name || hqState.currentAgent || '百工商号';
  const lex = getTenantLexicon(hqState.currentTenantData?.custom_settings || {});
  const stores = hqState.allStores || [];
  const products = hqState.allProducts || [];
  const orders = hqState.allOrders || [];
  const exportTime = new Date().toLocaleString('zh-CN');

  const safeJson = JSON.stringify({ tenantName, lex, stores, products, orders, exportTime }).replace(/</g, '\\u003c');

  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${tenantName} · 离线独立账本档案 (${exportTime})</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#f7f5f0;color:#1c1917;margin:0;padding:16px}
  .wrap{max-width:960px;margin:0 auto;background:#fff;border-radius:16px;padding:20px;box-shadow:0 4px 20px rgba(0,0,0,.06)}
  h1{font-size:18px;margin:0 0 6px;color:#1b4332}
  .meta{font-size:12px;color:#78716c;margin-bottom:16px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
  .card{background:#f5f5f4;padding:12px;border-radius:12px}
  .card b{display:block;font-size:16px;color:#1b4332;margin-top:4px}
  input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d6d3d1;border-radius:10px;margin-bottom:14px;font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border-bottom:1px solid #e7e5e4;padding:8px;text-align:left}
  th{background:#fafaf9;color:#57534e}
</style>
</head>
<body>
<div class="wrap">
  <h1>📒 ${tenantName} · 离线永久独立账本</h1>
  <div class="meta">导出时间：${exportTime} · 本文件无需网络、无需登录服务器，双击即可永久检索核账</div>
  <div class="grid" id="summary"></div>
  <input type="text" id="q" placeholder="🔍 输入客户名、单号、货品名实时检索历史账目..." oninput="render()">
  <table><thead><tr><th>单号/日期</th><th>往来方</th><th>明细</th><th>金额</th><th>状态</th></tr></thead><tbody id="tb"></tbody></table>
</div>
<script>
const DB = ${safeJson};
const totalDebt = DB.stores.reduce((s,x)=>s+parseFloat(x.current_debt||0),0);
const totalStockVal = DB.products.reduce((s,x)=>s+(parseFloat(x.stock||0)*parseFloat(x.cost_price||x.tier_1_price||0)),0);
document.getElementById('summary').innerHTML =
  '<div class="card"><span>往来客户数</span><b>'+DB.stores.length+' 户</b></div>'+
  '<div class="card"><span>在库货值估算</span><b>¥'+totalStockVal.toFixed(2)+'</b></div>'+
  '<div class="card"><span>累计应收欠款</span><b>¥'+totalDebt.toFixed(2)+'</b></div>';
function render(){
  const kw = document.getElementById('q').value.trim().toLowerCase();
  const rows = DB.orders.filter(o=>!kw || JSON.stringify(o).toLowerCase().includes(kw));
  document.getElementById('tb').innerHTML = rows.map(o=>{
    const items = (o.items||[]).map(i=>i.name+'×'+i.qty).join('，');
    return '<tr><td><b>'+(o.order_no||o.id)+'</b><br><small>'+String(o.created_at||'').slice(0,16)+'</small></td><td>'+o.store_name+'</td><td>'+items+'</td><td><b>¥'+parseFloat(o.net_settle_amount||o.total_amount||0).toFixed(2)+'</b></td><td>'+(o.delivery_status==='delivered'?'已交割':'进行中')+'</td></tr>';
  }).join('');
}
render();
</script>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tenantName}_离线独立账本_${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 4. 挂载首页“掌柜一句话/语音万能记账栏” + “静默流失温柔提醒”
 */
export function mountSixteenRealmsQuickBar() {
  const host = document.getElementById('ai-advisor-cards');
  if (!host) return;
  document.getElementById('sixteen-realms-quick-bar')?.remove();

  const visibleStores = getVisibleStoresForCurrentRole();
  const visibleOrders = getVisibleOrdersForCurrentRole();
  const churnList = detectSilentChurnPartners(visibleStores, visibleOrders);

  const churnHtml =
    churnList.length > 0
      ? `<div class="bg-amber-50/90 border border-amber-200 rounded-xl px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-950">
           <span>💡 <b>老客户节律提醒：</b>${churnList
             .map((c) => `<b>${c.storeName}</b>（平时约${c.avgIntervalDays}天拿一次，已${c.daysSinceLast}天未动静）`)
             .join('；')}，顺路可打个招呼。</span>
         </div>`
      : '';

  const bar = document.createElement('div');
  bar.id = 'sixteen-realms-quick-bar';
  bar.className = 'col-span-full bg-white border border-emerald-200 p-3 rounded-2xl space-y-2 text-xs shadow-2xs';
  bar.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-1.5">
      <div class="flex items-center gap-1.5">
        <span class="text-sm">🗣️</span>
        <b class="text-emerald-950">一句话 / 语音万能记账（说人话直接记）：</b>
        <span class="text-[10px] text-stone-400 hidden sm:inline">支持直接开单、临时散客极速记、进货入库、收款平账</span>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button type="button" onclick="window.openZeroBarrierWalkInOrderModal()" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-300 font-bold px-2.5 py-1 rounded-xl text-[11px]">
          ⚡ 临时散客极速开单
        </button>
        <button type="button" onclick="window.openSixteenRealmsHubModal()" class="bg-stone-900 hover:bg-stone-800 text-amber-300 font-bold px-2.5 py-1 rounded-xl text-[11px]">
          🧭 十六重协作扩展舱
        </button>
      </div>
    </div>
    <div class="flex gap-1.5">
      <input type="text" id="natural-biz-command-input" onkeydown="if(event.key==='Enter') window.executeNaturalBusinessCommand()"
        placeholder="像发微信一样输入：给李老板送10箱油，麦收后结 / 进货50箱牛奶每箱45元 / 老张微信转了2000元还账"
        class="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-700">
      <button type="button" onclick="window.startNaturalVoiceCommand()" class="bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 font-bold px-3 rounded-xl shrink-0" title="语音说话记账">
        🎤 说话
      </button>
      <button type="button" onclick="window.executeNaturalBusinessCommand()" class="bg-[#1b4332] hover:bg-[#143628] text-white font-bold px-4 rounded-xl shrink-0">
        ⚡ 执行记账
      </button>
    </div>
    ${churnHtml}
  `;
  host.insertAdjacentElement('afterbegin', bar);
}

/**
 * 5. 绑定全部十六重境界交互逻辑
 */
export function initSixteenRealmsBindings() {
  window.startNaturalVoiceCommand = function () {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return alert('当前浏览器暂不支持语音转文字，请直接用手机键盘自带语音输入法说话。');
    const rec = new SpeechRec();
    rec.lang = 'zh-CN';
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || '';
      const inp = document.getElementById('natural-biz-command-input');
      if (inp && transcript) {
        inp.value = transcript;
        window.executeNaturalBusinessCommand();
      }
    };
    rec.start();
  };

  window.executeNaturalBusinessCommand = async function () {
    if (isAuditorReadOnly()) return alert('只读账号不可记账。');
    const inp = document.getElementById('natural-biz-command-input');
    const raw = inp?.value.trim() || '';
    if (!raw) return alert('请先输入或说出要记的业务！');

    const parsed = parseNaturalBusinessCommand(
      raw,
      getVisibleStoresForCurrentRole(),
      hqState.allProducts || []
    );

    if (parsed.intent === 'collect') {
      if (!parsed.store) {
        return alert(`未在名录中找到客户【${parsed.rawStoreName}】，请确认客户名称或先在名录建档。`);
      }
      if (parsed.amount <= 0) return alert('未能识别出收款金额，请写明金额（如：2000元）。');
      if (!confirm(`确认记录收款平账？\n• 客户：${parsed.store.name}\n• 实收金额：¥${parsed.amount.toFixed(2)} (${parsed.method})`)) return;

      const nextDebt = Math.max(0, Number((parseFloat(parsed.store.current_debt || 0) - parsed.amount).toFixed(2)));
      await supabase.from('store').update({ current_debt: nextDebt }).eq('id', parsed.store.id);
      await supabase.from('driver_collection_log').insert([{
        tenant_id: hqState.currentAgent,
        store_id: parsed.store.id,
        store_name: `${parsed.store.name} (一句话快捷平账)`,
        driver_name: hqState.currentOperatorName,
        collect_type: 'period_settlement',
        amount: parsed.amount,
        discount_amount: 0,
        basket_return: 0,
        basket_deduct_amount: 0,
        pay_method: parsed.method,
        settled_to_hq: true
      }]);
      inp.value = '';
      alert(`✅ 已记账！【${parsed.store.name}】实收 ¥${parsed.amount.toFixed(2)}，当前余欠 ¥${nextDebt.toFixed(2)}。`);
      if (typeof window.loadHQData === 'function') await window.loadHQData();
      return;
    }

    if (parsed.intent === 'inbound') {
      if (!confirm(`确认生成入库单 (RK)？\n• 货品：${parsed.prodName}\n• 入库数量：${parsed.qty}\n• 参考单价：¥${parsed.unitPrice}`)) return;
      const rkNo = generateUnifiedVoucherNo('RK');
      if (parsed.product) {
        const beforeStock = parseInt(parsed.product.stock ?? 0, 10);
        const afterStock = beforeStock + parsed.qty;
        await supabase.from('product').update({ stock: afterStock, cost_price: parsed.unitPrice || parsed.product.cost_price }).eq('id', parsed.product.id);
        await HQService.recordInventoryChange(hqState.currentAgent, {
          tenant_id: hqState.currentAgent,
          product_id: parsed.product.id,
          product_name: parsed.product.name,
          action_type: 'in_purchase',
          delta_qty: parsed.qty,
          before_stock: beforeStock,
          after_stock: afterStock,
          operator_name: hqState.currentOperatorName,
          remark: `[单号:${rkNo}] [一句话极速入库] ${parsed.rawText}`,
          created_at: new Date().toISOString()
        });
      } else {
        await supabase.from('product').insert([{
          tenant_id: hqState.currentAgent,
          name: parsed.prodName,
          category: '默认分类',
          spec: '标准件',
          measure_unit: '件',
          cost_price: parsed.unitPrice,
          tier_1_price: Number((parsed.unitPrice * 1.2).toFixed(2)) || parsed.unitPrice,
          stock: parsed.qty,
          status: 'active',
          custom_specs: { min_stock: 5, auto_created_from_voice: true }
        }]);
      }
      inp.value = '';
      alert(`✅ 入库单【${rkNo}】已入账！${parsed.prodName} +${parsed.qty}`);
      if (typeof window.loadHQData === 'function') await window.loadHQData();
      return;
    }

    // 默认：极速出库开单（支持未建档散客与未上架临时货品）
    const totalAmt = Number((parsed.qty * parsed.unitPrice).toFixed(2));
    const termTag = parsed.naturalTerm ? ` · 约定:${parsed.naturalTerm}` : '';
    if (!confirm(`确认极速生成出库配货单？\n• 客户：${parsed.rawStoreName}${parsed.store ? '' : ' (临时散客免建档)'}\n• 明细：${parsed.prodName} × ${parsed.qty} (单价 ¥${parsed.unitPrice})\n• 合计：¥${totalAmt.toFixed(2)}${termTag}`)) return;

    const ckNo = generateUnifiedVoucherNo('CK');
    const orderRow = {
      order_no: ckNo,
      tenant_id: hqState.currentAgent,
      store_id: parsed.store?.id || 0,
      store_name: parsed.rawStoreName,
      driver_name: parsed.store?.driver_name || hqState.currentOperatorName,
      order_source: 'vendor_push',
      settlement_type: parsed.settlementType,
      settlement_note: `[一句话极速单${termTag}] ${parsed.rawText}`,
      items: [{
        id: parsed.product?.id || 0,
        name: parsed.prodName,
        spec: parsed.product?.spec || '随手记',
        measure_unit: parsed.product?.measure_unit || '件',
        price: parsed.unitPrice,
        qty: parsed.qty
      }],
      items_return: [],
      items_exchange: [],
      total_amount: totalAmt,
      return_amount: 0,
      net_settle_amount: totalAmt,
      order_status: 'confirmed',
      delivery_status: 'ordered',
      note: `[一句话极速单${termTag}]`,
      driver_action_instruction: '【极速直配单】现场签收核验'
    };

    const { error } = await supabase.from('store_order').insert([orderRow]);
    if (error) return alert('生成单据失败：' + error.message);

    if (parsed.product) {
      await HQService.deductStockForItems(
        hqState.currentAgent,
        hqState.allProducts || [],
        orderRow.items,
        ckNo,
        hqState.currentOperatorName
      );
    }
    inp.value = '';
    alert(`✅ 单据【${ckNo}】已极速生成并同步库存！`);
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  /**
   * 零门槛散客 / 临时品名极速开单弹窗（先成交、后留痕）
   */
  window.openZeroBarrierWalkInOrderModal = function () {
    document.getElementById('modal-zero-barrier-order')?.remove();
    const modal = document.createElement('div');
    modal.id = 'modal-zero-barrier-order';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-md w-full p-5 space-y-3 shadow-2xl text-xs">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2">
          <div>
            <b class="text-sm text-stone-900">⚡ 零门槛散客 / 临时品名极速开单</b>
            <p class="text-[10px] text-stone-500">无需先建客户档案、无需先上架商品，像写白纸一样直接出单</p>
          </div>
          <button type="button" onclick="document.getElementById('modal-zero-barrier-order')?.remove()" class="text-stone-400 font-bold text-base">✕</button>
        </div>

        <div class="space-y-2.5">
          <div>
            <label class="block font-bold text-stone-700 mb-1">买方称呼（可填临时散客或老客户名）*：</label>
            <input type="text" id="zb-store-name" placeholder="如：路过散客 / 城南张工地 / 旺顺饭店" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold outline-none">
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div class="col-span-2">
              <label class="block font-bold text-stone-700 mb-1">货品或服务名称 *：</label>
              <input type="text" id="zb-item-name" placeholder="直接手填品名或工项" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 outline-none">
            </div>
            <div>
              <label class="block font-bold text-stone-700 mb-1">数量 *：</label>
              <input type="number" step="0.01" id="zb-item-qty" value="1" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold outline-none">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-bold text-stone-700 mb-1">成交单价 (元) *：</label>
              <input type="number" step="0.01" id="zb-item-price" placeholder="0.00" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold outline-none">
            </div>
            <div>
              <label class="block font-bold text-stone-700 mb-1">自然结算约定：</label>
              <select id="zb-natural-term" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-2 font-bold outline-none">
                <option value="现结两清">💵 现结两清</option>
                <option value="这批货卖完结">🔄 这批货卖完结</option>
                <option value="麦收/秋收后结">🌾 麦收/秋收后结</option>
                <option value="工程验收后结">🏗️ 工程验收后结</option>
                <option value="月底统一结">📅 月底统一结</option>
                <option value="以物/劳务抵扣">🤝 以物/劳务抵扣</option>
              </select>
            </div>
          </div>
        </div>

        <button type="button" onclick="window.submitZeroBarrierOrder()" class="w-full py-2.5 rounded-2xl bg-[#1b4332] hover:bg-[#143628] text-white font-bold shadow">
          ✅ 立即出凭单记账
        </button>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.submitZeroBarrierOrder = async function () {
    const storeName = document.getElementById('zb-store-name')?.value.trim();
    const itemName = document.getElementById('zb-item-name')?.value.trim();
    const qty = parseFloat(document.getElementById('zb-item-qty')?.value || '0');
    const price = parseFloat(document.getElementById('zb-item-price')?.value || '0');
    const term = document.getElementById('zb-natural-term')?.value || '现结两清';

    if (!storeName || !itemName || qty <= 0) return alert('请填写买方称呼、品名和有效数量！');

    const matchedStore = (hqState.allStores || []).find((s) => s.name === storeName);
    const matchedProd = (hqState.allProducts || []).find((p) => p.name === itemName);
    const totalAmt = Number((qty * price).toFixed(2));
    const ckNo = generateUnifiedVoucherNo('CK');

    const { error } = await supabase.from('store_order').insert([{
      order_no: ckNo,
      tenant_id: hqState.currentAgent,
      store_id: matchedStore?.id || 0,
      store_name: storeName,
      driver_name: matchedStore?.driver_name || hqState.currentOperatorName,
      order_source: 'vendor_push',
      settlement_type: term === '现结两清' ? 'cash' : 'credit',
      settlement_note: `[零门槛随手单 · ${term}]`,
      items: [{ id: matchedProd?.id || 0, name: itemName, spec: matchedProd?.spec || '随手记', measure_unit: matchedProd?.measure_unit || '件', price, qty }],
      items_return: [],
      items_exchange: [],
      total_amount: totalAmt,
      return_amount: 0,
      net_settle_amount: totalAmt,
      order_status: 'confirmed',
      delivery_status: 'ordered',
      note: `[零门槛随手单 · ${term}]`,
      driver_action_instruction: `【${term}】现场核验交割`
    }]);

    if (error) return alert('开单失败：' + error.message);

    if (matchedProd) {
      await HQService.deductStockForItems(
        hqState.currentAgent,
        hqState.allProducts || [],
        [{ id: matchedProd.id, name: matchedProd.name, qty }],
        ckNo,
        hqState.currentOperatorName
      );
    }

    document.getElementById('modal-zero-barrier-order')?.remove();
    alert(`✅ 已生成凭单【${ckNo}】（合计 ¥${totalAmt.toFixed(2)} · ${term}）！`);
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  /**
   * 十六重协作扩展舱总弹窗（冲红后悔药、三角债对冲、拼单开产、一户一码贴纸、岗位交接、离线HTML账本、公益角）
   */
  window.openSixteenRealmsHubModal = function () {
    document.getElementById('modal-sixteen-realms-hub')?.remove();
    const stores = getVisibleStoresForCurrentRole();
    const products = (hqState.allProducts || []).filter((p) => p.status !== 'inactive');
    const subUsers = hqState.allSubUsers || [];
    const rawSettings = hqState.currentTenantData?.custom_settings || {};
    const charityEnabled = !!rawSettings.charity_micro_light_enabled;

    const storeOpts = stores.map((s) => `<option value="${s.id}">${s.name} (欠¥${parseFloat(s.current_debt || 0).toFixed(2)})</option>`).join('');
    const prodOpts = products.map((p) => `<option value="${p.id}">${p.name} (¥${p.tier_1_price})</option>`).join('');
    const staffOpts = subUsers.map((u) => `<option value="${u.account_code}">${u.display_name} (${u.account_code})</option>`).join('');

    const modal = document.createElement('div');
    modal.id = 'modal-sixteen-realms-hub';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-3xl w-full p-5 space-y-4 shadow-2xl text-xs my-auto">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2.5">
          <div>
            <b class="text-sm text-stone-900">🧭 十六重境界 · 价值交换与基层协作扩展舱</b>
            <p class="text-[11px] text-stone-500 mt-0.5">冲红后悔药 · 三角债对冲 · 凑单开产 · 一户一码贴纸 · 一键交接 · 离线独立HTML账本</p>
          </div>
          <button type="button" onclick="document.getElementById('modal-sixteen-realms-hub')?.remove()" class="text-stone-400 font-bold text-base">✕</button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <!-- 1. 全链路冲红更正后悔药 -->
          <div class="p-3 bg-rose-50/60 border border-rose-200 rounded-2xl space-y-2">
            <b class="text-rose-950 block">↩️ 填错单据“冲红更正”后悔药</b>
            <p class="text-[10px] text-stone-600">输入填错的单据号，系统自动生成红字冲销单并回补库存，审计留痕不怕点错。</p>
            <div class="flex gap-1.5">
              <input type="text" id="red-offset-order-no" placeholder="输入原单号 (如 CK-261126-1024)" class="flex-1 bg-white border border-rose-200 rounded-xl px-2.5 py-1.5 font-mono uppercase">
              <button type="button" onclick="window.executeRedOffsetCorrection()" class="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-xl shrink-0">红字冲销</button>
            </div>
          </div>

          <!-- 2. 三角债 / 双向价值对冲平账 -->
          <div class="p-3 bg-indigo-50/60 border border-indigo-200 rounded-2xl space-y-2">
            <b class="text-indigo-950 block">🔄 双向供需 / 三角债对称平账</b>
            <div class="grid grid-cols-2 gap-1.5">
              <select id="tri-store-a" class="bg-white border border-indigo-200 rounded-xl px-2 py-1 font-bold">${storeOpts || '<option value="">客户A</option>'}</select>
              <select id="tri-store-b" class="bg-white border border-indigo-200 rounded-xl px-2 py-1 font-bold">${storeOpts || '<option value="">客户B</option>'}</select>
            </div>
            <div class="flex gap-1.5">
              <input type="number" step="0.01" id="tri-offset-amt" placeholder="互相冲抵金额(元)" class="flex-1 bg-white border border-indigo-200 rounded-xl px-2.5 py-1 font-mono font-bold">
              <button type="button" onclick="window.executeTriangularDebtOffset()" class="bg-indigo-700 text-white font-bold px-3 py-1 rounded-xl shrink-0">一键对冲</button>
            </div>
          </div>

          <!-- 3. 凑够才生产预售拼单 -->
          <div class="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
            <b class="text-emerald-950 block">🌾 凑单开产（先凑需求、满额再生产）</b>
            <div class="grid grid-cols-2 gap-1.5">
              <select id="crowd-prod-id" class="bg-white border border-emerald-200 rounded-xl px-2 py-1 font-bold">${prodOpts || '<option value="">选择品项</option>'}</select>
              <input type="number" min="1" id="crowd-target-qty" placeholder="开产起订总量 (如 500)" class="bg-white border border-emerald-200 rounded-xl px-2.5 py-1 font-mono">
            </div>
            <button type="button" onclick="window.publishCrowdProduceNotice()" class="w-full py-1.5 rounded-xl bg-[#1b4332] text-white font-bold">
              📣 发布“凑单开产牌”到协作圈
            </button>
          </div>

          <!-- 4. 一户一码 / 货架实体贴纸 -->
          <div class="p-3 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-2">
            <b class="text-amber-950 block">🏷️ 一户一码 / 货架补货实体贴纸</b>
            <p class="text-[10px] text-stone-600">生成专属贴纸打印贴在门店前台或货架，微信扫码直达极速补货。</p>
            <div class="flex gap-1.5">
              <select id="sticker-store-id" class="flex-1 bg-white border border-amber-200 rounded-xl px-2 py-1 font-bold">${storeOpts || '<option value="">选择客户</option>'}</select>
              <button type="button" onclick="window.generatePhysicalQrSticker()" class="bg-amber-500 text-stone-950 font-bold px-3 py-1 rounded-xl shrink-0">生成贴纸</button>
            </div>
          </div>

          <!-- 5. 一键岗位客户交接包 -->
          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <b class="text-stone-900 block">🤝 员工离职/调岗 · 一键客户交接</b>
            <div class="flex gap-1.5 items-center">
              <select id="handover-from-user" class="flex-1 bg-white border border-stone-200 rounded-xl px-2 py-1">${staffOpts || '<option value="">原跟单人</option>'}</select>
              <span>➔</span>
              <select id="handover-to-user" class="flex-1 bg-white border border-stone-200 rounded-xl px-2 py-1">${staffOpts || '<option value="">接任人</option>'}</select>
              <button type="button" onclick="window.executeStaffHandover()" class="bg-stone-800 text-white font-bold px-2.5 py-1 rounded-xl shrink-0">移交</button>
            </div>
          </div>

          <!-- 6. 离线可查独立HTML账本 & 一单微光公益落款 -->
          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <b class="text-stone-900 block">💾 离线独立HTML账本 & 邻里微光公益</b>
            <div class="flex flex-wrap gap-1.5">
              <button type="button" onclick="window.downloadOfflineStandaloneLedger()" class="flex-1 py-1.5 rounded-xl bg-emerald-800 text-white font-bold">
                📥 下载断网可查HTML账本
              </button>
              <button type="button" onclick="window.toggleCharityMicroLight(${!charityEnabled})" class="px-3 py-1.5 rounded-xl border ${charityEnabled ? 'bg-amber-100 border-amber-400 text-amber-950' : 'bg-white border-stone-300 text-stone-600'} font-bold">
                ${charityEnabled ? '🕯️ 微光落款已开' : '🕯️ 开启公益落款'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.executeRedOffsetCorrection = async function () {
    if (isAuditorReadOnly()) return alert('只读账号不可操作。');
    const rawNo = document.getElementById('red-offset-order-no')?.value.trim().toUpperCase();
    if (!rawNo) return alert('请输入需要红字冲销的单据编号！');
    const orig = (hqState.allOrders || []).find((o) => String(o.order_no || o.id).toUpperCase().includes(rawNo));
    if (!orig) return alert('未找到该单据，请核对单号！');
    if (orig.order_status === 'cancelled') return alert('该单据已经冲红作废，请勿重复操作。');

    if (!confirm(`确认对单据【${orig.order_no || orig.id}】（${orig.store_name}，金额 ¥${orig.net_settle_amount}）执行红字全额冲销并回补库存？`)) return;

    await supabase.from('store_order').update({
      order_status: 'cancelled',
      note: `${orig.note || ''} [红字冲销已作废 · 操作人:${hqState.currentOperatorName}]`
    }).eq('id', orig.id);

    // 回补对应货品库存
    for (const it of (orig.items || [])) {
      const prod = (hqState.allProducts || []).find((p) => Number(p.id) === Number(it.id) || p.name === it.name);
      if (prod) {
        const before = parseInt(prod.stock ?? 0, 10);
        const after = before + parseInt(it.qty || 0, 10);
        await supabase.from('product').update({ stock: after }).eq('id', prod.id);
        await HQService.recordInventoryChange(hqState.currentAgent, {
          tenant_id: hqState.currentAgent,
          product_id: prod.id,
          product_name: prod.name,
          action_type: 'in_return',
          delta_qty: parseInt(it.qty || 0, 10),
          before_stock: before,
          after_stock: after,
          operator_name: hqState.currentOperatorName,
          remark: `[单号:${generateUnifiedVoucherNo('RK')}] [红字冲销回库 · 原单${orig.order_no || orig.id}]`,
          created_at: new Date().toISOString()
        });
      }
    }

    alert(`✅ 单据【${orig.order_no || orig.id}】已完成红字冲销，对应库存已自动回补！`);
    document.getElementById('modal-sixteen-realms-hub')?.remove();
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  window.executeTriangularDebtOffset = async function () {
    const idA = parseInt(document.getElementById('tri-store-a')?.value || '0', 10);
    const idB = parseInt(document.getElementById('tri-store-b')?.value || '0', 10);
    const amt = parseFloat(document.getElementById('tri-offset-amt')?.value || '0');
    if (!idA || !idB || idA === idB || amt <= 0) return alert('请选择两个不同的往来方并输入有效的对冲金额！');

    const storeA = (hqState.allStores || []).find((s) => Number(s.id) === idA);
    const storeB = (hqState.allStores || []).find((s) => Number(s.id) === idB);
    if (!storeA || !storeB) return;

    if (!confirm(`确认生成对称平账凭单？\n• 【${storeA.name}】应收欠款核减 ¥${amt.toFixed(2)}\n• 同步抵扣【${storeB.name}】对应货款/劳务款 ¥${amt.toFixed(2)}`)) return;

    const nextDebtA = Math.max(0, Number((parseFloat(storeA.current_debt || 0) - amt).toFixed(2)));
    await supabase.from('store').update({ current_debt: nextDebtA }).eq('id', storeA.id);
    await supabase.from('driver_collection_log').insert([{
      tenant_id: hqState.currentAgent,
      store_id: storeA.id,
      store_name: `${storeA.name} ⇄ ${storeB.name} (双向/三角债对冲平账)`,
      driver_name: hqState.currentOperatorName,
      collect_type: 'period_settlement',
      amount: amt,
      discount_amount: 0,
      basket_return: 0,
      basket_deduct_amount: 0,
      pay_method: '双向价值/三角债对冲',
      settled_to_hq: true
    }]);

    alert(`✅ 双向对冲平账完成！无需现金流转，双方账目已对称核销 ¥${amt.toFixed(2)}。`);
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  window.publishCrowdProduceNotice = async function () {
    const prodId = parseInt(document.getElementById('crowd-prod-id')?.value || '0', 10);
    const targetQty = parseInt(document.getElementById('crowd-target-qty')?.value || '0', 10);
    const prod = (hqState.allProducts || []).find((p) => Number(p.id) === prodId);
    if (!prod || targetQty <= 0) return alert('请选择品项并输入起订总量！');

    const { error } = await supabase.from('platform_suggestion_board').insert([{
      proposer_type: 'c2b_demand',
      proposer_name: `${hqState.currentTenantData?.company_name || hqState.currentAgent} (凑单开产)`,
      category: `[凑单开产 · ${hqState.currentAgent}]`,
      content: `🌾【凑单开产牌】${prod.name}（${prod.spec || '源头直供'}），凑够 ${targetQty}${prod.measure_unit || '件'} 立即开炉生产！认领享源头直供价 ¥${prod.tier_1_price}。`
    }]);
    if (error) return alert('发布失败：' + error.message);
    alert(`📣 已将【${prod.name}】凑单开产牌发布至协作圈！`);
  };

  window.generatePhysicalQrSticker = function () {
    const storeId = document.getElementById('sticker-store-id')?.value || '';
    const store = (hqState.allStores || []).find((s) => String(s.id) === String(storeId));
    const baseUrl = window.location.origin + window.location.pathname.replace(/hq\.html.*/, 'index.html');
    const link = `${baseUrl}?agent=${encodeURIComponent(hqState.currentAgent)}&store_id=${encodeURIComponent(storeId)}`;
    const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(link)}`;

    const win = window.open('', '_blank', 'width=380,height=520');
    if (win) {
      win.document.write(`
        <div style="font-family:sans-serif;text-align:center;padding:24px;border:3px dashed #1b4332;border-radius:16px;margin:16px">
          <h2 style="margin:0 0 6px;color:#1b4332">${hqState.currentTenantData?.company_name || '百工源头直供'}</h2>
          <p style="margin:0 0 12px;font-weight:bold;color:#92400e">🏷️ ${store ? store.name : '合作门店'} · 专属快捷补货贴</p>
          <img src="${qrImg}" style="width:200px;height:200px;margin:0 auto 12px;display:block"/>
          <p style="font-size:12px;color:#444">微信扫一扫，点“+”“-”直接报补货单<br/>无需下载 App · 随车直达</p>
          <button onclick="window.print()" style="margin-top:12px;padding:8px 18px;background:#1b4332;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer">🖨️ 打印贴纸</button>
        </div>
      `);
    }
  };

  window.executeStaffHandover = async function () {
    if (hqState.currentRoleCode !== 'owner') return alert('仅老板主账号可执行岗位客户移交！');
    const fromCode = document.getElementById('handover-from-user')?.value;
    const toCode = document.getElementById('handover-to-user')?.value;
    if (!fromCode || !toCode || fromCode === toCode) return alert('请选择不同的原跟单人与接任人！');

    const toUser = (hqState.allSubUsers || []).find((u) => u.account_code === toCode);
    const affected = (hqState.allStores || []).filter((s) => s.sales_owner_code === fromCode || s.driver_name === fromCode);
    if (affected.length === 0) return alert('该员工名下暂无绑定客户。');

    if (!confirm(`确认将 ${affected.length} 位客户平滑移交给【${toUser?.display_name || toCode}】？`)) return;
    for (const s of affected) {
      await supabase.from('store').update({
        sales_owner_code: toCode,
        sales_owner_name: toUser?.display_name || toCode
      }).eq('id', s.id);
    }
    alert(`✅ 已将 ${affected.length} 位客户完整移交给【${toUser?.display_name || toCode}】！`);
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  window.downloadOfflineStandaloneLedger = downloadOfflineStandaloneLedgerHtml;

  window.toggleCharityMicroLight = async function (nextState) {
    if (hqState.currentRoleCode !== 'owner') return alert('仅老板主账号可设置。');
    const prev = hqState.currentTenantData?.custom_settings || {};
    const nextSettings = { ...prev, charity_micro_light_enabled: nextState };
    const { error } = await supabase.from('platform_tenant').update({ custom_settings: nextSettings }).eq('tenant_id', hqState.currentAgent);
    if (!error && hqState.currentTenantData) {
      hqState.currentTenantData.custom_settings = nextSettings;
      alert(nextState ? '🕯️ 已开启“一单微光”公益落款：电子交割单底部将印制邻里善意寄语。' : '已关闭交割单公益落款。');
      window.openSixteenRealmsHubModal();
    }
  };
}
