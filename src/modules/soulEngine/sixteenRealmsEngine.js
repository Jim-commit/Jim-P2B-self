/**
 * 百工百业 · 实用经营工具箱与全景协作引擎 (零改表、插件化叠加、白纸手电筒原则)
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
 * 感官无障碍状态读取与语音播报（大字高对比 + 顺耳语音确认）
 */
function getAccessibilityPrefs() {
  try {
    return JSON.parse(localStorage.getItem('baigong_a11y_prefs') || '{"largeText":false,"voiceSpeak":true}');
  } catch {
    return { largeText: false, voiceSpeak: true };
  }
}

function saveAccessibilityPrefs(patch) {
  const next = { ...getAccessibilityPrefs(), ...patch };
  localStorage.setItem('baigong_a11y_prefs', JSON.stringify(next));
  applyGlobalLargeTextStyle(next.largeText);
  return next;
}

function applyGlobalLargeTextStyle(enabled) {
  let styleEl = document.getElementById('baigong-global-large-text-style');
  if (!enabled) {
    styleEl?.remove();
    return;
  }
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'baigong-global-large-text-style';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    body { font-size: 16px !important; color: #000 !important; }
    .font-mono { font-size: 1.15em !important; font-weight: 800 !important; }
    input, select, textarea { font-size: 16px !important; color: #000 !important; border-color: #57534e !important; }
    button { font-size: 14px !important; }
  `;
}

function speakAccountingFeedback(text) {
  const prefs = getAccessibilityPrefs();
  if (!prefs.voiceSpeak || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  } catch {
    // 忽略部分浏览器静默策略限制
  }
}

/**
 * 底部 8 秒后悔撤回浮动条（刚记完账点错可一秒撤回）
 */
function showQuickUndoToast(labelText, onUndoFn) {
  document.getElementById('quick-undo-floating-bar')?.remove();
  const toast = document.createElement('div');
  toast.id = 'quick-undo-floating-bar';
  toast.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs border border-stone-700';
  toast.innerHTML = `
    <span>${labelText}</span>
    <button type="button" id="btn-trigger-quick-undo" class="bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold px-2.5 py-1 rounded-xl shrink-0">
      ↩️ 撤回刚才这笔
    </button>
  `;
  document.body.appendChild(toast);

  const timer = setTimeout(() => toast.remove(), 8500);
  document.getElementById('btn-trigger-quick-undo')?.addEventListener('click', async () => {
    clearTimeout(timer);
    toast.remove();
    await onUndoFn();
  });
}

/**
 * 查找某客户购买某商品的上次成交单价
 */
function findLastDealPriceForPartner(storeName, itemName) {
  if (!storeName || !itemName) return null;
  const orders = (hqState.allOrders || [])
    .filter((o) => o.order_status !== 'cancelled' && String(o.store_name || '').trim() === storeName.trim())
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  for (const o of orders) {
    const hit = (o.items || []).find((it) => String(it.name || '').trim() === itemName.trim() && parseFloat(it.price) > 0);
    if (hit) return parseFloat(hit.price);
  }
  return null;
}

/**
 * 多品项微信要货消息解析器
 */
function parseWeChatMultiItemMessage(rawMsg, stores = [], products = []) {
  const text = String(rawMsg || '').trim();
  const matchedStore =
    stores.find((s) => s.name && text.includes(s.name)) ||
    stores.find((s) => s.contact && s.contact !== '掌柜' && text.includes(s.contact)) ||
    null;

  const storeName = matchedStore
    ? matchedStore.name
    : (text.match(/^([^\d,，。：:\n要送发来订]+?)(?:明早|明天|今天|要|送|发|订|：|:|\d)/)?.[1]?.trim() || '微信要货客户');

  const settlementType = text.includes('现结') || text.includes('现金') || text.includes('已转') ? 'cash' : 'credit';
  const items = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(箱|件|斤|套|桶|袋|瓶|个|台|批|份)\s*([^\d,，。；;\n和与及再带送发要订挂现]+)/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const qty = parseFloat(match[1]);
    const unit = match[2];
    const rawProdName = match[3].trim();
    if (!rawProdName || qty <= 0) continue;

    const matchedProd =
      products.find((p) => p.status !== 'inactive' && p.name && (rawProdName.includes(p.name) || p.name.includes(rawProdName))) ||
      null;
    const finalName = matchedProd ? matchedProd.name : rawProdName;
    const lastPrice = findLastDealPriceForPartner(storeName, finalName);
    const price = lastPrice || (matchedProd ? parseFloat(matchedProd.tier_1_price || 0) : 0);

    items.push({
      id: matchedProd?.id || 0,
      name: finalName,
      spec: matchedProd?.spec || unit,
      measure_unit: matchedProd?.measure_unit || unit,
      price,
      qty
    });
  }

  return { store: matchedStore, storeName, items, settlementType };
}

/**
 * 1. 一句话/语音全能自然语言记账解析器
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

  const customProdName = matchedProd
    ? matchedProd.name
    : (text.match(/\d+\s*(?:箱|件|斤|套|桶|袋|瓶|个|台|批|份)\s*([^\d,，。老挂现元块]+)/)?.[1]?.trim() || '临时直供货品');
  const rawStoreName = matchedStore
    ? matchedStore.name
    : (text.match(/(?:给|送|发|卖给)\s*([^\d,，。要来发配订]+?)(?:送|发|要|来|\d)/)?.[1]?.trim() || '临时散客');

  const lastDealPrice = findLastDealPriceForPartner(rawStoreName, customProdName);
  const unitPrice =
    moneyVal > 0 && qty > 0
      ? Number((moneyVal / qty).toFixed(2))
      : lastDealPrice || (matchedProd ? parseFloat(matchedProd.tier_1_price || 0) : 0);

  return {
    intent: 'outbound',
    store: matchedStore,
    rawStoreName,
    product: matchedProd,
    prodName: customProdName,
    qty,
    unitPrice,
    usedLastDealPrice: !moneyVal && !!lastDealPrice,
    settlementType: text.includes('现结') || text.includes('现金') ? 'cash' : 'credit',
    naturalTerm: text.match(/(?:麦收后结|卖完结|月底结|验收后结|下趟结)/)?.[0] || '',
    rawText: text
  };
}

/**
 * 2. 扫描老客户静默流失预警
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
 * 3. 生成可彻底断网离线查询的纯本地单文件 HTML 账本
 */
export function downloadOfflineStandaloneLedgerHtml(labelSuffix = '离线独立账本') {
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
<title>${tenantName} · ${labelSuffix} (${exportTime})</title>
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
  <h1>📒 ${tenantName} · ${labelSuffix}</h1>
  <div class="meta">导出时间：${exportTime} · 本文件无需网络、无需登录服务器，建议发至微信【文件传输助手】永久留存</div>
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
  a.download = `${tenantName}_${labelSuffix}_${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

let partnerLiveTickerStarted = false;
let lastKnownCollectionLogId = 0;

/**
 * 夫妻店 / 合伙人异地同账实时动态播报监听
 */
function startPartnerLiveActivityTicker() {
  if (partnerLiveTickerStarted) return;
  partnerLiveTickerStarted = true;

  setInterval(async () => {
    if (!hqState.currentAgent || document.hidden) return;
    const { data } = await supabase
      .from('driver_collection_log')
      .select('id, store_name, driver_name, amount, pay_method')
      .eq('tenant_id', hqState.currentAgent)
      .order('id', { ascending: false })
      .limit(1);

    const latest = data?.[0];
    if (!latest) return;
    if (lastKnownCollectionLogId === 0) {
      lastKnownCollectionLogId = latest.id;
      return;
    }
    if (latest.id > lastKnownCollectionLogId) {
      lastKnownCollectionLogId = latest.id;
      const ticker = document.getElementById('partner-live-activity-ticker');
      if (ticker) {
        ticker.innerHTML = `🔔 <b>刚收到协同动态：</b>${latest.driver_name || '执事'} 在【${latest.store_name}】登记 ¥${parseFloat(latest.amount || 0).toFixed(2)}（${latest.pay_method || '已记'}）`;
        ticker.classList.remove('hidden');
        speakAccountingFeedback(`刚收到协同动态，${latest.store_name}，${latest.amount}元`);
      }
    }
  }, 12000);
}

/**
 * 4. 挂载首页“掌柜一句话/语音万能记账栏” + “静默流失温柔提醒” + “淡季休眠条” + “夫妻店实时播报”
 */
export function mountSixteenRealmsQuickBar() {
  const prefs = getAccessibilityPrefs();
  applyGlobalLargeTextStyle(prefs.largeText);

  const rawSettings = hqState.currentTenantData?.custom_settings || {};
  const urlParams = new URLSearchParams(window.location.search);
  const urlKey = urlParams.get('k') || '';
  const serverToken = rawSettings.collab_passcode_token || '';
  if (urlParams.get('readonly') === '1' && serverToken && urlKey !== serverToken) {
    alert('🔐 当前查账链接已随掌柜换锁失效，请联系商号掌柜获取最新只读链接！');
    return;
  }

  const host = document.getElementById('ai-advisor-cards');
  if (!host) return;
  document.getElementById('sixteen-realms-quick-bar')?.remove();

  const isSeasonalDormant = !!rawSettings.seasonalPause?.isPaused;
  const visibleStores = getVisibleStoresForCurrentRole();
  const visibleOrders = getVisibleOrdersForCurrentRole();
  const churnList = isSeasonalDormant ? [] : detectSilentChurnPartners(visibleStores, visibleOrders);

  const dormantHtml = isSeasonalDormant
    ? `<div class="bg-stone-900 text-amber-300 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 text-[11px]">
         <span>🍵 <b>当前处于淡季休眠状态：</b>日常补货预警已静默收起，不打扰休息。</span>
         <button type="button" onclick="window.toggleRealmSeasonalDormant(false)" class="bg-amber-400 text-stone-950 font-bold px-2.5 py-0.5 rounded-lg shrink-0">🌱 旺季唤醒</button>
       </div>`
    : '';

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
    <div id="partner-live-activity-ticker" class="hidden bg-emerald-900 text-amber-300 rounded-xl px-3 py-1.5 text-[11px] font-bold"></div>
    ${dormantHtml}
    <div class="flex flex-wrap items-center justify-between gap-1.5">
      <div class="flex items-center gap-1.5">
        <span class="text-sm">🗣️</span>
        <b class="text-emerald-950">一句话 / 语音万能记账（说人话直接记）：</b>
        <span class="text-[10px] text-stone-400 hidden sm:inline">支持直接开单、散客随手记、进货入库、收款平账</span>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button type="button" onclick="window.openWeChatPasteOrderModal()" class="bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold px-2.5 py-1 rounded-xl text-[11px]">
          📋 粘贴微信要货消息
        </button>
        <button type="button" onclick="window.openZeroBarrierWalkInOrderModal()" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-300 font-bold px-2.5 py-1 rounded-xl text-[11px]">
          ⚡ 记一笔散客账
        </button>
        <button type="button" onclick="window.openSixteenRealmsHubModal()" class="bg-stone-900 hover:bg-stone-800 text-amber-300 font-bold px-2.5 py-1 rounded-xl text-[11px]">
          🧰 实用工具箱
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
        记下来
      </button>
    </div>
    ${churnHtml}
  `;
  host.insertAdjacentElement('afterbegin', bar);
  startPartnerLiveActivityTicker();
}

/**
 * 5. 绑定全部实用工具箱交互逻辑
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

  window.openWeChatPasteOrderModal = async function () {
    document.getElementById('modal-wechat-paste-order')?.remove();
    let clipText = '';
    try {
      if (navigator.clipboard?.readText) {
        clipText = await navigator.clipboard.readText();
      }
    } catch {
      // 浏览器未授予剪贴板权限时由用户手动粘贴
    }

    const modal = document.createElement('div');
    modal.id = 'modal-wechat-paste-order';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-md w-full p-5 space-y-3 shadow-2xl text-xs">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2">
          <div>
            <b class="text-sm text-stone-900">📋 粘贴微信要货消息 · 一键转配货单</b>
            <p class="text-[10px] text-stone-500">自动识别客户名、多行商品数量及上次成交价</p>
          </div>
          <button type="button" onclick="document.getElementById('modal-wechat-paste-order')?.remove()" class="text-stone-400 font-bold text-base">✕</button>
        </div>
        <textarea id="wc-paste-textarea" rows="4" oninput="window.previewWeChatPasteOrder()" placeholder="把微信里客户发的要货消息粘进来，例如：
厚德便利店明早送5箱菜籽油、3袋大米，老规矩挂账" class="w-full bg-stone-50 border border-stone-200 rounded-2xl p-3 outline-none focus:border-emerald-700">${clipText}</textarea>
        <div id="wc-paste-preview-box" class="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 space-y-1 text-[11px] text-emerald-950">
          等待粘贴微信要货文本...
        </div>
        <button type="button" onclick="window.confirmWeChatPasteOrder()" class="w-full py-2.5 rounded-2xl bg-[#1b4332] hover:bg-[#143628] text-white font-bold shadow">
          ✅ 确认生成配货单并扣减库存
        </button>
      </div>
    `;
    document.body.appendChild(modal);

    window.previewWeChatPasteOrder = function () {
      const raw = document.getElementById('wc-paste-textarea')?.value || '';
      const box = document.getElementById('wc-paste-preview-box');
      if (!box) return;
      const res = parseWeChatMultiItemMessage(raw, getVisibleStoresForCurrentRole(), hqState.allProducts || []);
      if (res.items.length === 0) {
        box.innerHTML = '<span class="text-stone-500">请包含“数量+单位+品名”，如：<b>5箱菜籽油、3袋大米</b></span>';
        return;
      }
      const total = res.items.reduce((s, it) => s + it.qty * it.price, 0);
      box.innerHTML = `
        <div><b>识别客户：</b>${res.storeName} ${res.store ? '✅(已建档)' : '(临时散客)'} · <b>${res.settlementType === 'cash' ? '现结' : '挂账'}</b></div>
        <div class="pt-1 space-y-0.5">${res.items
          .map((it) => `<div>• ${it.name} × <b>${it.qty}${it.measure_unit}</b>（单价 ¥${it.price}）</div>`)
          .join('')}</div>
        <div class="pt-1 border-t border-emerald-200 font-bold">预估合计：¥${total.toFixed(2)}</div>
      `;
    };
    if (clipText) window.previewWeChatPasteOrder();

    window.confirmWeChatPasteOrder = async function () {
      if (isAuditorReadOnly()) return alert('只读账号不可开单。');
      const raw = document.getElementById('wc-paste-textarea')?.value.trim() || '';
      const res = parseWeChatMultiItemMessage(raw, getVisibleStoresForCurrentRole(), hqState.allProducts || []);
      if (res.items.length === 0) return alert('未能识别出有效商品明细，请检查文本格式（如：5箱菜籽油）。');

      const totalAmt = Number(res.items.reduce((s, it) => s + it.qty * it.price, 0).toFixed(2));
      const ckNo = generateUnifiedVoucherNo('CK');
      const orderRow = {
        order_no: ckNo,
        tenant_id: hqState.currentAgent,
        store_id: res.store?.id || 0,
        store_name: res.storeName,
        driver_name: res.store?.driver_name || hqState.currentOperatorName,
        order_source: 'vendor_push',
        settlement_type: res.settlementType,
        settlement_note: `[微信粘贴转单] ${raw.slice(0, 60)}`,
        items: res.items,
        items_return: [],
        items_exchange: [],
        total_amount: totalAmt,
        return_amount: 0,
        net_settle_amount: totalAmt,
        order_status: 'confirmed',
        delivery_status: 'ordered',
        note: `[微信粘贴转单] ${raw.slice(0, 60)}`,
        driver_action_instruction: '【微信要货单】现场签收核验'
      };

      const { data: insertedRows, error } = await supabase.from('store_order').insert([orderRow]).select('id');
      if (error) return alert('转单失败：' + error.message);

      const stockedItems = res.items.filter((it) => it.id > 0);
      if (stockedItems.length > 0) {
        await HQService.deductStockForItems(
          hqState.currentAgent,
          hqState.allProducts || [],
          stockedItems,
          ckNo,
          hqState.currentOperatorName
        );
      }

      document.getElementById('modal-wechat-paste-order')?.remove();
      speakAccountingFeedback(`已转配货单，${res.storeName}，合计${totalAmt}元`);
      if (typeof window.loadHQData === 'function') await window.loadHQData();

      showQuickUndoToast(`✅ 微信消息已转为配货单【${ckNo}】(¥${totalAmt.toFixed(2)})`, async () => {
        if (insertedRows?.[0]?.id) {
          await supabase.from('store_order').update({
            order_status: 'cancelled',
            note: `${orderRow.note} [8秒快捷撤回作废]`
          }).eq('id', insertedRows[0].id);
        }
        alert(`↩️ 已撤回单据【${ckNo}】。`);
        if (typeof window.loadHQData === 'function') await window.loadHQData();
      });
    };
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

      const prevDebt = parseFloat(parsed.store.current_debt || 0);
      const nextDebt = Math.max(0, Number((prevDebt - parsed.amount).toFixed(2)));
      await supabase.from('store').update({ current_debt: nextDebt }).eq('id', parsed.store.id);
      const { data: logRows } = await supabase.from('driver_collection_log').insert([{
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
      }]).select('id');

      inp.value = '';
      speakAccountingFeedback(`已记，${parsed.store.name}收款${parsed.amount}元`);
      if (typeof window.loadHQData === 'function') await window.loadHQData();

      showQuickUndoToast(`✅ 已记【${parsed.store.name}】收款 ¥${parsed.amount.toFixed(2)}`, async () => {
        await supabase.from('store').update({ current_debt: prevDebt }).eq('id', parsed.store.id);
        if (logRows?.[0]?.id) await supabase.from('driver_collection_log').delete().eq('id', logRows[0].id);
        alert('↩️ 已撤回刚才这笔收款记录，客户欠款已恢复。');
        if (typeof window.loadHQData === 'function') await window.loadHQData();
      });
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
      speakAccountingFeedback(`已入库，${parsed.prodName}${parsed.qty}件`);
      alert(`✅ 入库单【${rkNo}】已入账！${parsed.prodName} +${parsed.qty}`);
      if (typeof window.loadHQData === 'function') await window.loadHQData();
      return;
    }

    const totalAmt = Number((parsed.qty * parsed.unitPrice).toFixed(2));
    const termTag = parsed.naturalTerm ? ` · 约定:${parsed.naturalTerm}` : '';
    const priceHint = parsed.usedLastDealPrice ? ' [自动带出上次成交价]' : '';
    if (!confirm(`确认极速生成出库配货单？\n• 客户：${parsed.rawStoreName}${parsed.store ? '' : ' (临时散客)'}\n• 明细：${parsed.prodName} × ${parsed.qty} (单价 ¥${parsed.unitPrice}${priceHint})\n• 合计：¥${totalAmt.toFixed(2)}${termTag}`)) return;

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

    const { data: insertedOrders, error } = await supabase.from('store_order').insert([orderRow]).select('id');
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
    speakAccountingFeedback(`已开单，${parsed.rawStoreName}，合计${totalAmt}元`);
    if (typeof window.loadHQData === 'function') await window.loadHQData();

    showQuickUndoToast(`✅ 单据【${ckNo}】已记账 (¥${totalAmt.toFixed(2)})`, async () => {
      if (insertedOrders?.[0]?.id) {
        await supabase.from('store_order').update({
          order_status: 'cancelled',
          note: `${orderRow.note} [8秒快捷撤回作废]`
        }).eq('id', insertedOrders[0].id);
      }
      if (parsed.product) {
        const curProd = (hqState.allProducts || []).find((p) => Number(p.id) === Number(parsed.product.id));
        if (curProd) {
          await supabase.from('product').update({ stock: parseInt(curProd.stock ?? 0, 10) + parsed.qty }).eq('id', curProd.id);
        }
      }
      alert(`↩️ 已撤回单据【${ckNo}】，对应库存已恢复。`);
      if (typeof window.loadHQData === 'function') await window.loadHQData();
    });
  };

  /**
   * 记一笔散客账弹窗
   */
  window.openZeroBarrierWalkInOrderModal = function () {
    document.getElementById('modal-zero-barrier-order')?.remove();
    const stores = getVisibleStoresForCurrentRole();
    const products = (hqState.allProducts || []).filter((p) => p.status !== 'inactive');

    const storeDataList = stores.map((s) => `<option value="${s.name}">`).join('');
    const prodDataList = products.map((p) => `<option value="${p.name}">`).join('');
    const quickProdChips = products
      .slice(0, 8)
      .map(
        (p) =>
          `<button type="button" onclick="window.pickZeroBarrierQuickProd('${String(p.name).replace(/'/g, '')}', ${parseFloat(p.tier_1_price || 0)})" class="bg-stone-100 hover:bg-emerald-100 text-stone-800 border border-stone-200 px-2.5 py-1 rounded-xl font-bold text-[11px]">${p.name}</button>`
      )
      .join('');

    const modal = document.createElement('div');
    modal.id = 'modal-zero-barrier-order';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-md w-full p-5 space-y-3 shadow-2xl text-xs my-auto">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2">
          <div>
            <b class="text-sm text-stone-900">⚡ 记一笔散客账（边开单边自动建档）</b>
            <p class="text-[10px] text-stone-500">支持铺货试卖、搭赠样品、顺带记空筐、过磅毛重去皮</p>
          </div>
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="document.getElementById('zb-abacus-keypad')?.classList.toggle('hidden')" class="bg-amber-100 text-amber-950 border border-amber-300 font-bold px-2 py-1 rounded-xl text-[10px]">
              🧮 计算器按键
            </button>
            <button type="button" onclick="document.getElementById('modal-zero-barrier-order')?.remove()" class="text-stone-400 font-bold text-base">✕</button>
          </div>
        </div>

        <datalist id="zb-store-datalist">${storeDataList}</datalist>
        <datalist id="zb-prod-datalist">${prodDataList}</datalist>

        ${quickProdChips ? `<div class="flex flex-wrap gap-1">${quickProdChips}</div>` : ''}

        <div class="space-y-2.5">
          <div>
            <label class="block font-bold text-stone-700 mb-1">买方称呼（可选老客户，也可直接填新客户名）*：</label>
            <input type="text" id="zb-store-name" list="zb-store-datalist" oninput="window.recalcZeroBarrierHelper(true)" placeholder="如：路过散客 / 城南张工地 / 旺顺饭店" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold outline-none">
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div class="col-span-2">
              <label class="block font-bold text-stone-700 mb-1">货品或服务名称 *：</label>
              <input type="text" id="zb-item-name" list="zb-prod-datalist" oninput="window.recalcZeroBarrierHelper(true)" placeholder="直接手填品名或工项" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 outline-none">
            </div>
            <div>
              <div class="flex justify-between items-center mb-1">
                <label class="font-bold text-stone-700">净数量 *：</label>
                <button type="button" onclick="document.getElementById('zb-tare-box')?.classList.toggle('hidden')" class="text-[10px] text-amber-800 font-bold underline">⚖️ 去皮</button>
              </div>
              <input type="number" step="0.01" id="zb-item-qty" value="1" onfocus="window._zbActiveField='zb-item-qty'" oninput="window.recalcZeroBarrierHelper(false)" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold outline-none">
            </div>
          </div>

          <div id="zb-tare-box" class="hidden bg-stone-100 p-2 rounded-xl flex items-center gap-1.5 text-[11px]">
            <span class="font-bold text-stone-700 shrink-0">过磅去皮：</span>
            <input type="number" step="0.01" id="zb-gross-wt" oninput="window.calcZeroBarrierTareWeight()" placeholder="毛重" class="w-20 bg-white border border-stone-300 rounded-lg px-2 py-1 font-mono">
            <span>−</span>
            <input type="number" step="0.01" id="zb-tare-wt" oninput="window.calcZeroBarrierTareWeight()" placeholder="筐/皮重" class="w-20 bg-white border border-stone-300 rounded-lg px-2 py-1 font-mono">
            <span class="text-emerald-900 font-bold">= 自动算净重</span>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="flex justify-between items-center mb-1">
                <label class="font-bold text-stone-700">成交单价 (元) *：</label>
                <span id="zb-last-price-badge" class="hidden text-[10px] text-emerald-800 font-bold bg-emerald-50 px-1.5 rounded">上次价</span>
              </div>
              <input type="number" step="0.01" id="zb-item-price" onfocus="window._zbActiveField='zb-item-price'" oninput="window.recalcZeroBarrierHelper(false)" placeholder="0.00" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold outline-none">
            </div>
            <div>
              <label class="block font-bold text-stone-700 mb-1">自然结算约定：</label>
              <select id="zb-natural-term" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-2 font-bold outline-none">
                <option value="现结两清">💵 现结两清</option>
                <option value="铺货试卖（按实销结算）">📦 铺货试卖（按实销结算）</option>
                <option value="这批货卖完结">🔄 这批货卖完结</option>
                <option value="麦收/秋收后结">🌾 麦收/秋收后结</option>
                <option value="工程验收后结">🏗️ 工程验收后结</option>
                <option value="月底统一结">📅 月底统一结</option>
                <option value="以物/劳务抵扣">🤝 以物/劳务抵扣</option>
              </select>
            </div>
          </div>

          <div id="zb-abacus-keypad" class="hidden bg-stone-100 p-2 rounded-2xl grid grid-cols-4 gap-1.5 font-mono text-sm font-bold">
            ${['7', '8', '9', '清空', '4', '5', '6', '退格', '1', '2', '3', '切单价', '0', '00', '.', '切数量']
              .map(
                (k) =>
                  `<button type="button" onclick="window.pressAbacusKey('${k}')" class="py-2 rounded-xl ${
                    ['清空', '退格', '切单价', '切数量'].includes(k)
                      ? 'bg-amber-200 text-amber-950 text-xs'
                      : 'bg-white text-stone-900 shadow-2xs active:bg-emerald-100'
                  }">${k}</button>`
              )
              .join('')}
          </div>

          <div class="bg-amber-50/70 border border-amber-200 rounded-2xl px-3 py-2 flex items-center justify-between gap-2">
            <div>
              <span class="text-[10px] text-stone-500 block">本笔实收合计 (元)</span>
              <input type="number" step="0.01" id="zb-final-total" value="0.00" class="bg-transparent font-mono font-bold text-base text-emerald-950 w-24 outline-none">
            </div>
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="window.setZeroBarrierGiftSample()" class="bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold px-2 py-1.5 rounded-xl text-[11px]">
                🎁 搭赠/样品(¥0)
              </button>
              <button type="button" id="btn-zb-round-down" onclick="window.applyZeroBarrierRoundDown()" class="hidden bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold px-2.5 py-1.5 rounded-xl text-[11px] shadow-2xs">
                ✂️ 抹零
              </button>
            </div>
          </div>

          <div class="bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 flex items-center justify-between text-[11px]">
            <span class="font-bold text-stone-700">🧺 顺带周转筐/桶：</span>
            <div class="flex items-center gap-3">
              <label class="inline-flex items-center gap-1">
                <span>带去</span>
                <input type="number" min="0" id="zb-basket-out" value="0" class="w-12 bg-white border border-stone-300 rounded-lg px-1.5 py-0.5 text-center font-mono font-bold">
              </label>
              <label class="inline-flex items-center gap-1">
                <span>拉回</span>
                <input type="number" min="0" id="zb-basket-back" value="0" class="w-12 bg-white border border-stone-300 rounded-lg px-1.5 py-0.5 text-center font-mono font-bold">
              </label>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-600 pt-0.5">
            <label class="inline-flex items-center gap-1.5 cursor-pointer font-bold">
              <input type="checkbox" id="zb-pure-ledger-only" class="rounded text-emerald-800">
              <span>📝 纯记往来账（不扣库存）</span>
            </label>
            <label class="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" id="zb-auto-create-master" checked class="rounded text-emerald-800">
              <span>新客户/新品名自动建档</span>
            </label>
          </div>
        </div>

        <button type="button" onclick="window.submitZeroBarrierOrder()" class="w-full py-2.5 rounded-2xl bg-[#1b4332] hover:bg-[#143628] text-white font-bold shadow">
          ✅ 立即出凭单记账
        </button>
      </div>
    `;
    document.body.appendChild(modal);

    window.setZeroBarrierGiftSample = function () {
      const pInp = document.getElementById('zb-item-price');
      const tInp = document.getElementById('zb-final-total');
      if (pInp) pInp.value = '0';
      if (tInp) tInp.value = '0.00';
      document.getElementById('btn-zb-round-down')?.classList.add('hidden');
    };

    window.calcZeroBarrierTareWeight = function () {
      const g = parseFloat(document.getElementById('zb-gross-wt')?.value || '0');
      const t = parseFloat(document.getElementById('zb-tare-wt')?.value || '0');
      const net = Math.max(0, Number((g - t).toFixed(2)));
      const qInp = document.getElementById('zb-item-qty');
      if (qInp && g > 0) {
        qInp.value = net;
        window.recalcZeroBarrierHelper(false);
      }
    };

    window._zbActiveField = 'zb-item-price';
    window.pickZeroBarrierQuickProd = function (pName, defaultPrice) {
      const iInp = document.getElementById('zb-item-name');
      const pInp = document.getElementById('zb-item-price');
      if (iInp) iInp.value = pName;
      if (pInp && !pInp.value) pInp.value = defaultPrice || '';
      window.recalcZeroBarrierHelper(true);
    };

    window.pressAbacusKey = function (key) {
      if (key === '切单价') {
        window._zbActiveField = 'zb-item-price';
        document.getElementById('zb-item-price')?.focus();
        return;
      }
      if (key === '切数量') {
        window._zbActiveField = 'zb-item-qty';
        document.getElementById('zb-item-qty')?.focus();
        return;
      }
      const target = document.getElementById(window._zbActiveField || 'zb-item-price');
      if (!target) return;
      if (key === '清空') target.value = '';
      else if (key === '退格') target.value = String(target.value || '').slice(0, -1);
      else target.value = String(target.value || '') + key;
      window.recalcZeroBarrierHelper(false);
    };

    window.recalcZeroBarrierHelper = function (tryAutoPrice = false) {
      const sName = document.getElementById('zb-store-name')?.value.trim() || '';
      const iName = document.getElementById('zb-item-name')?.value.trim() || '';
      const priceInp = document.getElementById('zb-item-price');
      const badge = document.getElementById('zb-last-price-badge');

      if (tryAutoPrice && iName && priceInp) {
        const lastP = findLastDealPriceForPartner(sName, iName);
        const prod = (hqState.allProducts || []).find((p) => p.name === iName);
        if (lastP) {
          priceInp.value = lastP;
          if (badge) {
            badge.innerText = `上次价 ¥${lastP}`;
            badge.classList.remove('hidden');
          }
        } else if (prod && prod.tier_1_price) {
          priceInp.value = prod.tier_1_price;
          badge?.classList.add('hidden');
        } else {
          badge?.classList.add('hidden');
        }
      }

      const qty = parseFloat(document.getElementById('zb-item-qty')?.value || '0');
      const price = parseFloat(priceInp?.value || '0');
      const rawTotal = Number((qty * price).toFixed(2));
      const totalInp = document.getElementById('zb-final-total');
      const roundBtn = document.getElementById('btn-zb-round-down');
      if (totalInp) totalInp.value = rawTotal.toFixed(2);

      const floored = Math.floor(rawTotal);
      if (roundBtn) {
        if (rawTotal > floored && floored > 0) {
          roundBtn.innerText = `✂️ 抹零收 ¥${floored}`;
          roundBtn.classList.remove('hidden');
        } else {
          roundBtn.classList.add('hidden');
        }
      }
    };

    window.applyZeroBarrierRoundDown = function () {
      const totalInp = document.getElementById('zb-final-total');
      if (!totalInp) return;
      const cur = parseFloat(totalInp.value || '0');
      const floored = Math.floor(cur);
      if (floored > 0) {
        totalInp.value = floored.toFixed(2);
        document.getElementById('btn-zb-round-down')?.classList.add('hidden');
      }
    };
  };

  window.submitZeroBarrierOrder = async function () {
    const storeName = document.getElementById('zb-store-name')?.value.trim();
    const itemName = document.getElementById('zb-item-name')?.value.trim();
    const qty = parseFloat(document.getElementById('zb-item-qty')?.value || '0');
    const price = parseFloat(document.getElementById('zb-item-price')?.value || '0');
    const finalTotal = parseFloat(document.getElementById('zb-final-total')?.value || '0');
    const term = document.getElementById('zb-natural-term')?.value || '现结两清';
    const basketOut = parseInt(document.getElementById('zb-basket-out')?.value || '0', 10);
    const basketBack = parseInt(document.getElementById('zb-basket-back')?.value || '0', 10);
    const pureLedgerOnly = !!document.getElementById('zb-pure-ledger-only')?.checked;
    const autoCreateMaster = !!document.getElementById('zb-auto-create-master')?.checked;

    if (!storeName || !itemName || qty <= 0) return alert('请填写买方称呼、品名和有效数量！');

    let matchedStore = (hqState.allStores || []).find((s) => s.name === storeName);
    let matchedProd = (hqState.allProducts || []).find((p) => p.name === itemName);

    if (autoCreateMaster && !matchedStore && storeName !== '路过散客' && storeName !== '临时散客') {
      const { data: newStoreRows } = await supabase.from('store').insert([{
        tenant_id: hqState.currentAgent,
        name: storeName,
        contact: '掌柜',
        phone: '',
        address: '随手开单自动建档',
        current_debt: 0,
        status: 'active'
      }]).select('*');
      if (newStoreRows?.[0]) matchedStore = newStoreRows[0];
    }

    if (autoCreateMaster && !pureLedgerOnly && !matchedProd) {
      const { data: newProdRows } = await supabase.from('product').insert([{
        tenant_id: hqState.currentAgent,
        name: itemName,
        category: '默认分类',
        spec: '标准件',
        measure_unit: '件',
        cost_price: price,
        tier_1_price: price,
        stock: 0,
        status: 'active',
        custom_specs: { min_stock: 0, auto_created_on_order: true }
      }]).select('*');
      if (newProdRows?.[0]) matchedProd = newProdRows[0];
    }

    if (matchedStore && (basketOut > 0 || basketBack > 0)) {
      const prevBaskets = parseInt(matchedStore.pending_baskets || 0, 10);
      const nextBaskets = Math.max(0, prevBaskets + basketOut - basketBack);
      await supabase.from('store').update({ pending_baskets: nextBaskets }).eq('id', matchedStore.id);
    }

    const totalAmt = !isNaN(finalTotal) && finalTotal >= 0 ? Number(finalTotal.toFixed(2)) : Number((qty * price).toFixed(2));
    const ckNo = generateUnifiedVoucherNo('CK');
    const isGift = totalAmt === 0;
    const modeTag = isGift ? '搭赠/样品' : (pureLedgerOnly ? '纯记往来账' : '随手单');
    const basketTag = basketOut > 0 || basketBack > 0 ? ` · 带筐+${basketOut}/回筐-${basketBack}` : '';

    const orderPayload = {
      order_no: ckNo,
      tenant_id: hqState.currentAgent,
      store_id: matchedStore?.id || 0,
      store_name: storeName,
      driver_name: matchedStore?.driver_name || hqState.currentOperatorName,
      order_source: 'vendor_push',
      settlement_type: term === '现结两清' || isGift ? 'cash' : 'credit',
      settlement_note: `[${modeTag} · ${term}${basketTag}]`,
      items: [{ id: matchedProd?.id || 0, name: itemName, spec: matchedProd?.spec || modeTag, measure_unit: matchedProd?.measure_unit || '件', price, qty }],
      items_return: [],
      items_exchange: [],
      total_amount: totalAmt,
      return_amount: 0,
      net_settle_amount: totalAmt,
      order_status: 'confirmed',
      delivery_status: pureLedgerOnly || isGift ? 'delivered' : 'ordered',
      note: `[${modeTag} · ${term}${basketTag}]`,
      driver_action_instruction: `【${term}】现场核验交割`
    };

    const { data: insertedRows, error } = await supabase.from('store_order').insert([orderPayload]).select('id');
    if (error) return alert('开单失败：' + error.message);

    if (!pureLedgerOnly && matchedProd) {
      await HQService.deductStockForItems(
        hqState.currentAgent,
        hqState.allProducts || [],
        [{ id: matchedProd.id, name: matchedProd.name, qty }],
        ckNo,
        hqState.currentOperatorName
      );
    }

    document.getElementById('modal-zero-barrier-order')?.remove();
    speakAccountingFeedback(isGift ? `已登记搭赠样品，${storeName}` : `已记，${storeName}，${totalAmt}元`);
    if (typeof window.loadHQData === 'function') await window.loadHQData();

    showQuickUndoToast(`✅ 已记【${storeName}】¥${totalAmt.toFixed(2)} (${ckNo})`, async () => {
      if (insertedRows?.[0]?.id) {
        await supabase.from('store_order').update({
          order_status: 'cancelled',
          note: `${orderPayload.note} [8秒快捷撤回作废]`
        }).eq('id', insertedRows[0].id);
      }
      if (!pureLedgerOnly && matchedProd) {
        const curProd = (hqState.allProducts || []).find((p) => Number(p.id) === Number(matchedProd.id));
        if (curProd) {
          await supabase.from('product').update({ stock: parseInt(curProd.stock ?? 0, 10) + qty }).eq('id', curProd.id);
        }
      }
      alert(`↩️ 已撤回单据【${ckNo}】，对应库存已恢复。`);
      if (typeof window.loadHQData === 'function') await window.loadHQData();
    });
  };

  /**
   * 实用工具箱总弹窗
   */
  window.openSixteenRealmsHubModal = function () {
    document.getElementById('modal-sixteen-realms-hub')?.remove();
    const stores = getVisibleStoresForCurrentRole();
    const products = (hqState.allProducts || []).filter((p) => p.status !== 'inactive');
    const subUsers = hqState.allSubUsers || [];
    const rawSettings = hqState.currentTenantData?.custom_settings || {};
    const charityEnabled = !!rawSettings.charity_micro_light_enabled;
    const isSeasonalDormant = !!rawSettings.seasonalPause?.isPaused;
    const prefs = getAccessibilityPrefs();

    const storeOpts = stores
      .map((s) => `<option value="${s.id}">${s.name} (欠¥${parseFloat(s.current_debt || 0).toFixed(2)})</option>`)
      .join('');
    const storeOptsB = stores
      .map((s, idx) => `<option value="${s.id}" ${idx === 1 ? 'selected' : ''}>${s.name} (欠¥${parseFloat(s.current_debt || 0).toFixed(2)})</option>`)
      .join('');
    const prodOpts = products.map((p) => `<option value="${p.id}">${p.name} (¥${p.tier_1_price})</option>`).join('');

    const staffOpts = subUsers
      .map((u, idx) => {
        const sCode = u.account_code || u.username || u.phone || String(u.id || idx);
        const sName = u.display_name || u.staff_name || u.name || u.username || sCode || '协同执事';
        const sRole = u.role_name || u.role || u.account_code || '岗位执事';
        return `<option value="${sCode}">${sName} (${sRole})</option>`;
      })
      .join('');
    const staffOptsTo = subUsers
      .map((u, idx) => {
        const sCode = u.account_code || u.username || u.phone || String(u.id || idx);
        const sName = u.display_name || u.staff_name || u.name || u.username || sCode || '协同执事';
        const sRole = u.role_name || u.role || u.account_code || '岗位执事';
        return `<option value="${sCode}" ${idx === 1 ? 'selected' : ''}>${sName} (${sRole})</option>`;
      })
      .join('');

    const modal = document.createElement('div');
    modal.id = 'modal-sixteen-realms-hub';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-3xl w-full p-5 space-y-3.5 shadow-2xl text-xs my-auto">
        <div class="flex flex-wrap justify-between items-center gap-2 border-b border-stone-100 pb-2.5">
          <div>
            <b class="text-sm text-stone-900">🧰 实用工具箱 · 改错对账与基层协作快捷舱</b>
            <p class="text-[11px] text-stone-500 mt-0.5">作废重开 · 两家互抵账 · 微信对账 · 收摊日结 · 家人只读链接 · 换锁口令 · 年度封账</p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <button type="button" onclick="window.toggleRealmLargeText()" class="px-2.5 py-1 rounded-xl border ${prefs.largeText ? 'bg-stone-900 text-amber-300 border-stone-900' : 'bg-stone-100 text-stone-700 border-stone-200'} font-bold text-[11px]">
              ${prefs.largeText ? '🔍 大字护眼已开' : '🔍 大字护眼模式'}
            </button>
            <button type="button" onclick="window.toggleRealmVoiceSpeak()" class="px-2.5 py-1 rounded-xl border ${prefs.voiceSpeak ? 'bg-emerald-100 text-emerald-950 border-emerald-300' : 'bg-stone-100 text-stone-600 border-stone-200'} font-bold text-[11px]">
              ${prefs.voiceSpeak ? '🔊 记账播报已开' : '🔇 记账播报已关'}
            </button>
            <button type="button" onclick="window.toggleRealmSeasonalDormant(${!isSeasonalDormant})" class="px-2.5 py-1 rounded-xl border ${isSeasonalDormant ? 'bg-amber-400 text-stone-950 border-amber-500' : 'bg-stone-100 text-stone-700 border-stone-200'} font-bold text-[11px]">
              ${isSeasonalDormant ? '🌱 唤醒旺季' : '🍵 淡季休眠'}
            </button>
            <button type="button" onclick="document.getElementById('modal-sixteen-realms-hub')?.remove()" class="text-stone-400 font-bold text-base ml-1">✕</button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3 bg-rose-50/60 border border-rose-200 rounded-2xl space-y-2">
            <b class="text-rose-950 block">↩️ 填错单据“作废退库”后悔药</b>
            <p class="text-[10px] text-stone-600">输入填错的单据号，系统自动作废该单并退回对应库存，留痕更正不怕点错。</p>
            <div class="flex gap-1.5">
              <input type="text" id="red-offset-order-no" placeholder="输入原单号 (如 CK-261126-1024)" class="flex-1 min-w-0 bg-white border border-rose-200 rounded-xl px-2.5 py-1.5 font-mono uppercase">
              <button type="button" onclick="window.executeRedOffsetCorrection()" class="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-xl shrink-0">作废这张单</button>
            </div>
          </div>

          <div class="p-3 bg-indigo-50/60 border border-indigo-200 rounded-2xl space-y-2">
            <b class="text-indigo-950 block">🔄 两家账互相抵掉（三角债/以物抵账平账）</b>
            <div class="grid grid-cols-2 gap-1.5">
              <select id="tri-store-a" class="min-w-0 bg-white border border-indigo-200 rounded-xl px-2 py-1 font-bold truncate">${storeOpts || '<option value="">客户A</option>'}</select>
              <select id="tri-store-b" class="min-w-0 bg-white border border-indigo-200 rounded-xl px-2 py-1 font-bold truncate">${storeOptsB || '<option value="">客户B</option>'}</select>
            </div>
            <div class="flex gap-1.5">
              <input type="number" step="0.01" id="tri-offset-amt" placeholder="互相抵掉金额(元)" class="flex-1 min-w-0 bg-white border border-indigo-200 rounded-xl px-2.5 py-1 font-mono font-bold">
              <button type="button" onclick="window.executeTriangularDebtOffset()" class="bg-indigo-700 text-white font-bold px-3 py-1 rounded-xl shrink-0">互相抵掉</button>
            </div>
          </div>

          <div class="p-3 bg-sky-50/70 border border-sky-200 rounded-2xl space-y-2">
            <b class="text-sky-950 block">💬 微信发对账单 & 今日收摊小结</b>
            <div class="flex gap-1.5">
              <select id="wechat-statement-store-id" class="flex-1 min-w-0 bg-white border border-sky-200 rounded-xl px-2 py-1 font-bold truncate">${storeOpts || '<option value="">选择客户</option>'}</select>
              <button type="button" onclick="window.copyPoliteWeChatStatement()" class="bg-sky-700 hover:bg-sky-800 text-white font-bold px-2.5 py-1 rounded-xl shrink-0">复制对账话术</button>
            </div>
            <button type="button" onclick="window.copyDailyClosingSummaryForWeChat()" class="w-full py-1.5 rounded-xl bg-white hover:bg-sky-100 text-sky-950 border border-sky-300 font-bold">
              🧾 生成「今日收摊小结」发微信群
            </button>
          </div>

          <div class="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
            <b class="text-emerald-950 block">🌾 凑单开产（先凑需求、满额再生产）</b>
            <div class="grid grid-cols-2 gap-1.5">
              <select id="crowd-prod-id" class="min-w-0 bg-white border border-emerald-200 rounded-xl px-2 py-1 font-bold truncate">${prodOpts || '<option value="">选择品项</option>'}</select>
              <input type="number" min="1" id="crowd-target-qty" placeholder="开产起订总量 (如 500)" class="min-w-0 bg-white border border-emerald-200 rounded-xl px-2.5 py-1 font-mono">
            </div>
            <button type="button" onclick="window.publishCrowdProduceNotice()" class="w-full py-1.5 rounded-xl bg-[#1b4332] text-white font-bold">
              📣 发布“凑单开产牌”到协作圈
            </button>
          </div>

          <div class="p-3 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-2">
            <b class="text-amber-950 block">🏷️ 一户一码补货贴（58mm热敏 / A4 6联）</b>
            <p class="text-[10px] text-stone-600">普通家用打印机或蓝牙热敏小票机直接出纸，贴货架扫码补货。</p>
            <div class="flex gap-1.5">
              <select id="sticker-store-id" class="flex-1 min-w-0 bg-white border border-amber-200 rounded-xl px-2 py-1 font-bold truncate">${storeOpts || '<option value="">选择客户</option>'}</select>
              <button type="button" onclick="window.generatePhysicalQrSticker()" class="bg-amber-500 text-stone-950 font-bold px-3 py-1 rounded-xl shrink-0">打印贴纸</button>
            </div>
          </div>

          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <div class="flex justify-between items-center">
              <b class="text-stone-900">🤝 员工离职交接 & 换锁安全口令</b>
              <button type="button" onclick="window.rotateTenantCollabPasscode()" class="text-[10px] bg-stone-200 hover:bg-stone-300 text-stone-900 font-bold px-2 py-0.5 rounded-lg">
                🔐 刷新协同口令
              </button>
            </div>
            <div class="flex gap-1.5 items-center">
              <select id="handover-from-user" class="flex-1 min-w-0 bg-white border border-stone-200 rounded-xl px-2 py-1 font-bold truncate">${staffOpts || '<option value="">暂无在册员工</option>'}</select>
              <span class="shrink-0 text-stone-400 font-bold">➔</span>
              <select id="handover-to-user" class="flex-1 min-w-0 bg-white border border-stone-200 rounded-xl px-2 py-1 font-bold truncate">${staffOptsTo || '<option value="">暂无接任人</option>'}</select>
              <button type="button" onclick="window.executeStaffHandover()" class="bg-stone-800 hover:bg-stone-900 text-white font-bold px-3 py-1 rounded-xl shrink-0">移交</button>
            </div>
          </div>

          <div class="sm:col-span-2 p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <b class="text-stone-900 block">💾 离线独立HTML账本 / 年度封账归档 & 家人只读查账链接</b>
                <span class="text-[10px] text-stone-500">可发至微信【文件传输助手】永久存档；家人点开只读链接无需背密码即可看收支与库存</span>
              </div>
              <button type="button" onclick="window.toggleCharityMicroLight(${!charityEnabled})" class="px-3 py-1 rounded-xl border ${charityEnabled ? 'bg-amber-100 border-amber-400 text-amber-950' : 'bg-white border-stone-300 text-stone-600'} font-bold text-[11px]">
                ${charityEnabled ? '🕯️ 微光落款已开' : '🕯️ 开启公益落款'}
              </button>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button type="button" onclick="window.downloadOfflineStandaloneLedger('离线独立账本')" class="py-1.5 px-3 rounded-xl bg-emerald-800 text-white font-bold">
                📥 下载断网可查HTML账本
              </button>
              <button type="button" onclick="window.executeAnnualArchiveExport()" class="py-1.5 px-3 rounded-xl bg-stone-800 text-amber-300 font-bold">
                📦 年度结转封账归档
              </button>
              <button type="button" onclick="window.copyFamilyReadOnlyViewLink()" class="py-1.5 px-3 rounded-xl bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-bold">
                👁️ 复制家人只读查账链接
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.toggleRealmLargeText = function () {
    const cur = getAccessibilityPrefs();
    saveAccessibilityPrefs({ largeText: !cur.largeText });
    window.openSixteenRealmsHubModal();
  };

  window.toggleRealmVoiceSpeak = function () {
    const cur = getAccessibilityPrefs();
    const next = saveAccessibilityPrefs({ voiceSpeak: !cur.voiceSpeak });
    if (next.voiceSpeak) speakAccountingFeedback('已开启记账顺耳语音播报');
    window.openSixteenRealmsHubModal();
  };

  window.toggleRealmSeasonalDormant = async function (nextDormant) {
    if (hqState.currentRoleCode !== 'owner') return alert('仅老板主账号可切换淡旺季状态。');
    const prev = hqState.currentTenantData?.custom_settings || {};
    const nextSettings = {
      ...prev,
      seasonalPause: {
        isPaused: nextDormant,
        reason: nextDormant ? '淡季休整盘点中' : ''
      }
    };
    const { error } = await supabase.from('platform_tenant').update({ custom_settings: nextSettings }).eq('tenant_id', hqState.currentAgent);
    if (!error && hqState.currentTenantData) {
      hqState.currentTenantData.custom_settings = nextSettings;
      mountSixteenRealmsQuickBar();
      document.getElementById('modal-sixteen-realms-hub')?.remove();
      alert(nextDormant ? '🍵 已进入淡季休眠模式，补货预警已静默收起。' : '🌱 旺季已唤醒，所有日常提醒恢复正常！');
    }
  };

  window.rotateTenantCollabPasscode = async function () {
    if (hqState.currentRoleCode !== 'owner') return alert('仅老板主账号可执行换锁操作。');
    if (!confirm('确认刷新商号协同口令？刷新后，之前发给临时工或离职人员的旧快捷查账链接将立即失效。')) return;
    const prev = hqState.currentTenantData?.custom_settings || {};
    const newToken = String(Math.floor(100000 + Math.random() * 900000));
    const nextSettings = { ...prev, collab_passcode_token: newToken };
    const { error } = await supabase.from('platform_tenant').update({ custom_settings: nextSettings }).eq('tenant_id', hqState.currentAgent);
    if (!error && hqState.currentTenantData) {
      hqState.currentTenantData.custom_settings = nextSettings;
      alert(`🔐 协同安全口令已刷新为【${newToken}】，旧分享链接已全部失效！`);
    }
  };

  window.executeAnnualArchiveExport = function () {
    const yearStr = new Date().getFullYear();
    downloadOfflineStandaloneLedgerHtml(`${yearStr}年度结转封账总档案`);
    alert(`📦 已为您生成并下载【${yearStr}年度结转封账总档案.html】！\n建议立即转发到您个人的微信【文件传输助手】永久留存，断网或换手机随时双击可查。`);
  };

  window.copyFamilyReadOnlyViewLink = function () {
    const token = hqState.currentTenantData?.custom_settings?.collab_passcode_token || '';
    const baseUrl = window.location.origin + window.location.pathname;
    const roLink = `${baseUrl}?agent=${encodeURIComponent(hqState.currentAgent)}&readonly=1${token ? `&k=${token}` : ''}`;
    navigator.clipboard?.writeText(roLink);
    alert(`👁️ 家人/合伙人只读查账链接已复制！\n发到微信后对方点开即可查看今日收支与库存明细，且无法误改任何账目：\n\n${roLink}`);
  };

  window.copyPoliteWeChatStatement = function () {
    const storeId = parseInt(document.getElementById('wechat-statement-store-id')?.value || '0', 10);
    const store = (hqState.allStores || []).find((s) => Number(s.id) === storeId);
    if (!store) return alert('请先选择一位客户！');

    const recentOrders = (hqState.allOrders || [])
      .filter((o) => Number(o.store_id) === storeId && o.order_status !== 'cancelled')
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 5);

    const detailLines =
      recentOrders.length > 0
        ? recentOrders
            .map((o) => {
              const items = (o.items || []).map((i) => `${i.name}×${i.qty}`).join('、');
              return `· ${String(o.created_at || '').slice(5, 10)} ${items}：¥${parseFloat(o.net_settle_amount || 0).toFixed(2)}`;
            })
            .join('\n')
        : '· 近期往来明细已同步登记';

    const tenantName = hqState.currentTenantData?.company_name || '我们这边';
    const msg = `${store.name}（${store.contact || '掌柜'}）您好，最近生意兴隆！\n给您同步一下咱们近期的往来对账单，方便时核对一下：\n${detailLines}\n当前累计余款：¥${parseFloat(store.current_debt || 0).toFixed(2)}。\n您方便时微信转我就行，下趟车继续给您备新鲜好货！—— ${tenantName}`;

    navigator.clipboard?.writeText(msg);
    alert(`✅ 体面微信对账单已复制到剪贴板，直接去微信粘贴发送即可！\n\n${msg}`);
  };

  window.copyDailyClosingSummaryForWeChat = function () {
    const todayStr = new Date().toISOString().slice(0, 10);
    const tenantName = hqState.currentTenantData?.company_name || hqState.currentAgent || '百工商号';
    const todayOrders = (hqState.allOrders || []).filter(
      (o) => o.order_status !== 'cancelled' && String(o.created_at || '').startsWith(todayStr)
    );
    const totalSales = todayOrders.reduce((s, o) => s + parseFloat(o.net_settle_amount || 0), 0);
    const totalDebt = (hqState.allStores || []).reduce((s, x) => s + parseFloat(x.current_debt || 0), 0);

    const summaryText = `🧾【${tenantName} · 今日收摊小结】(${todayStr})\n• 今日共开单：${todayOrders.length} 笔\n• 今日出货总额：¥${totalSales.toFixed(2)}\n• 当前累计应收余款：¥${totalDebt.toFixed(2)}\n账目清晰、日清日结，辛苦啦！`;
    navigator.clipboard?.writeText(summaryText);
    alert(`✅ 今日收摊小结已复制，可直接发到家人或合伙人微信！\n\n${summaryText}`);
  };

  window.executeRedOffsetCorrection = async function () {
    if (isAuditorReadOnly()) return alert('只读账号不可操作。');
    const rawNo = document.getElementById('red-offset-order-no')?.value.trim().toUpperCase();
    if (!rawNo) return alert('请输入需要作废的单据编号！');
    const orig = (hqState.allOrders || []).find((o) => String(o.order_no || o.id).toUpperCase().includes(rawNo));
    if (!orig) return alert('未找到该单据，请核对单号！');
    if (orig.order_status === 'cancelled') return alert('该单据已经作废，请勿重复操作。');

    if (!confirm(`确认对单据【${orig.order_no || orig.id}】（${orig.store_name}，金额 ¥${orig.net_settle_amount}）执行作废并退回库存？`)) return;

    await supabase.from('store_order').update({
      order_status: 'cancelled',
      note: `${orig.note || ''} [单据已作废退库 · 操作人:${hqState.currentOperatorName}]`
    }).eq('id', orig.id);

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
          remark: `[单号:${generateUnifiedVoucherNo('RK')}] [作废退回入库 · 原单${orig.order_no || orig.id}]`,
          created_at: new Date().toISOString()
        });
      }
    }

    alert(`✅ 单据【${orig.order_no || orig.id}】已作废，对应库存已自动退回！`);
    document.getElementById('modal-sixteen-realms-hub')?.remove();
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  window.executeTriangularDebtOffset = async function () {
    const idA = parseInt(document.getElementById('tri-store-a')?.value || '0', 10);
    const idB = parseInt(document.getElementById('tri-store-b')?.value || '0', 10);
    const amt = parseFloat(document.getElementById('tri-offset-amt')?.value || '0');
    if (!idA || !idB || idA === idB || amt <= 0) return alert('请选择两个不同的往来方并输入有效的互抵金额！');

    const storeA = (hqState.allStores || []).find((s) => Number(s.id) === idA);
    const storeB = (hqState.allStores || []).find((s) => Number(s.id) === idB);
    if (!storeA || !storeB) return;

    if (!confirm(`确认将两家账目互相抵掉？\n• 【${storeA.name}】应收欠款核减 ¥${amt.toFixed(2)}\n• 同步抵扣【${storeB.name}】对应货款/劳务款 ¥${amt.toFixed(2)}`)) return;

    const nextDebtA = Math.max(0, Number((parseFloat(storeA.current_debt || 0) - amt).toFixed(2)));
    await supabase.from('store').update({ current_debt: nextDebtA }).eq('id', storeA.id);
    await supabase.from('driver_collection_log').insert([{
      tenant_id: hqState.currentAgent,
      store_id: storeA.id,
      store_name: `${storeA.name} ⇄ ${storeB.name} (两家账互相抵掉)`,
      driver_name: hqState.currentOperatorName,
      collect_type: 'period_settlement',
      amount: amt,
      discount_amount: 0,
      basket_return: 0,
      basket_deduct_amount: 0,
      pay_method: '两家账互抵平账',
      settled_to_hq: true
    }]);

    speakAccountingFeedback(`两家账目已互相抵掉${amt}元`);
    alert(`✅ 两家账目已互相抵掉 ¥${amt.toFixed(2)}，无需现金流转！`);
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
    const tenantTitle = hqState.currentTenantData?.company_name || '百工源头直供';
    const storeLabel = store ? store.name : '合作门店';
    const baseUrl = window.location.origin + window.location.pathname.replace(/hq\.html.*/, 'index.html');
    const link = `${baseUrl}?agent=${encodeURIComponent(hqState.currentAgent)}&store_id=${encodeURIComponent(storeId)}`;
    const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(link)}`;

    const win = window.open('', '_blank', 'width=440,height=580');
    if (win) {
      const cardHtml = `
        <div class="sticker-card" style="font-family:sans-serif;text-align:center;padding:18px;border:2px dashed #1b4332;border-radius:14px;box-sizing:border-box">
          <h3 style="margin:0 0 4px;color:#1b4332;font-size:15px">${tenantTitle}</h3>
          <p style="margin:0 0 10px;font-weight:bold;color:#92400e;font-size:13px">🏷️ ${storeLabel} · 专属快捷补货贴</p>
          <img src="${qrImg}" style="width:160px;height:160px;margin:0 auto 10px;display:block"/>
          <p style="font-size:11px;color:#444;margin:0">微信扫一扫，点“+”“-”直接报补货单<br/>无需下载 App · 随车直达</p>
        </div>
      `;
      win.document.write(`
        <div style="font-family:sans-serif;padding:12px">
          <div class="no-print" style="display:flex;gap:8px;justify-content:center;margin-bottom:12px">
            <button onclick="setMode('thermal')" style="padding:7px 12px;background:#f59e0b;color:#000;border:none;border-radius:8px;font-weight:bold;cursor:pointer">🧾 58mm热敏小票版</button>
            <button onclick="setMode('a4')" style="padding:7px 12px;background:#e7e5e4;color:#000;border:none;border-radius:8px;font-weight:bold;cursor:pointer">📄 A4纸6联剪裁版</button>
            <button onclick="window.print()" style="padding:7px 14px;background:#1b4332;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer">🖨️ 立即打印</button>
          </div>
          <div id="print-area">${cardHtml}</div>
          <style>@media print{.no-print{display:none!important}}</style>
          <script>
            function setMode(m){
              const area = document.getElementById('print-area');
              if(m==='a4'){
                area.style.display='grid';
                area.style.gridTemplateColumns='repeat(2,1fr)';
                area.style.gap='12px';
                area.innerHTML = Array(6).fill(\`${cardHtml}\`).join('');
              } else {
                area.style.display='block';
                area.style.maxWidth='240px';
                area.style.margin='0 auto';
                area.innerHTML = \`${cardHtml}\`;
              }
            }
          </script>
        </div>
      `);
    }
  };

  window.executeStaffHandover = async function () {
    if (hqState.currentRoleCode !== 'owner') return alert('仅老板主账号可执行岗位客户移交！');
    const fromCode = document.getElementById('handover-from-user')?.value;
    const toCode = document.getElementById('handover-to-user')?.value;
    if (!fromCode || !toCode || fromCode === toCode) return alert('请选择不同的原跟单人与接任人！');

    const toUser = (hqState.allSubUsers || []).find((u) => (u.account_code || u.username || String(u.id)) === toCode);
    const toDisplayName = toUser?.display_name || toUser?.staff_name || toUser?.name || toCode;
    const affected = (hqState.allStores || []).filter((s) => s.sales_owner_code === fromCode || s.driver_name === fromCode);
    if (affected.length === 0) return alert('该员工名下暂无绑定客户。');

    if (!confirm(`确认将 ${affected.length} 位客户平滑移交给【${toDisplayName}】？`)) return;
    for (const s of affected) {
      await supabase.from('store').update({
        sales_owner_code: toCode,
        sales_owner_name: toDisplayName
      }).eq('id', s.id);
    }
    alert(`✅ 已将 ${affected.length} 位客户完整移交给【${toDisplayName}】！`);
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  window.downloadOfflineStandaloneLedger = () => downloadOfflineStandaloneLedgerHtml('离线独立账本');

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
