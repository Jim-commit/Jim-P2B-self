import { supabase } from '../lib/supabase.js';
import { TOTP } from '../utils/totp.js';
import { compressImageFile, uploadBlobToStorage, downloadCSV } from '../utils/storage.js';
import { HQService } from '../services/hqService.js';

function isDirectoryLead(o) {
  return (
    o?.order_source === 'b2b_directory_lead' ||
    String(o?.order_no || '').startsWith('LEAD-') ||
    String(o?.note || '').includes('[新店招商线索]') ||
    String(o?.note || '').includes('[新店招商線索]')
  );
}

let currentAgent = localStorage.getItem('hq_active_agent') || 'BJ_SHUNDA';
let currentRoleCode = sessionStorage.getItem('hq_sub_role_' + currentAgent) || 'owner';
let currentOperatorName = sessionStorage.getItem('hq_sub_name_' + currentAgent) || '大當家主賬號';
let carrierLabel = localStorage.getItem('hq_carrier_label_' + currentAgent) || '周轉載具';
let currentStoreForVis = null;
let currentTenantData = null;
let allProducts = [];
let allStores = [];
let allOrders = [];
let allSubUsers = [];
let allPlatformCats = [];
let allInventoryLogs = [];
let uploadedImageBase64 = '';
let isUploadingImage = false;
let selectedTags = [];
let activeProdFilter = '全部';
let activeOrderFilter = 'pending_confirm';
let activeStoreFilter = '全部';
let currentStockOpsMode = 'in_purchase';
let pending2FACallback = null;

window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

// =========================================================================
// 1. 群機器人 Webhook 自動報單提醒配置
// =========================================================================
window.openWebhookModal = function () {
  document.getElementById('webhook-url-input').value = currentTenantData?.webhook_url || '';
  window.openModal('modal-webhook-setup');
};

window.saveWebhookUrl = async function () {
  const url = document.getElementById('webhook-url-input').value.trim();
  try {
    await HQService.updateTenantWithVerify(currentAgent, { webhook_url: url });
    if (currentTenantData) currentTenantData.webhook_url = url;
    updateWebhookStatusBadge(url);
    alert(url ? '✅ 報單群機器人已真正寫入雲端並啟用！' : '已關閉報單群機器人通知。');
    window.closeModal('modal-webhook-setup');
  } catch (err) {
    alert('⚠️ 儲存失敗（請檢查 Supabase 數據庫是否已執行 RLS 放行策略與 webhook_url 字段）：' + err.message);
  }
};

window.testWebhookPing = async function () {
  const url = document.getElementById('webhook-url-input').value.trim();
  if (!url) return alert('請先粘貼群機器人 Webhook 地址！');
  const msg = `🔔【${currentTenantData?.company_name || currentAgent}】報單提醒測試成功！後續合作門店下新單或新店預約送樣，本群將第一時間收到通知。`;
  try {
    await HQService.sendWebhookMessage(url, msg);
    alert('📡 測試消息已發出！請打開您的企業微信 / 釘釘 / 飛書群查看是否收到提醒。');
  } catch (err) {
    alert('發送失敗，請檢查網址格式是否正確：' + err.message);
  }
};

function updateWebhookStatusBadge(url) {
  const btn = document.getElementById('btn-webhook-status');
  if (!btn) return;
  if (url && url.startsWith('http')) {
    btn.innerHTML = '<span>🔔</span> 群通知已開';
    btn.className = 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs px-3 py-2 rounded-xl font-bold border border-emerald-400/50 active:scale-95 transition flex items-center gap-1';
  } else {
    btn.innerHTML = '<span>🔔</span> 報單群通知';
    btn.className = 'bg-[#143628] hover:bg-[#0e271d] text-emerald-200 text-xs px-3 py-2 rounded-xl font-bold border border-emerald-500/40 active:scale-95 transition flex items-center gap-1';
  }
}

function updateTotpStatusBadge(isEnabled) {
  const totpBtn = document.getElementById('btn-top-totp');
  if (!totpBtn) return;
  if (isEnabled) {
    totpBtn.innerHTML = '✅ 驗證器已綁';
    totpBtn.className = 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs px-2.5 py-2 rounded-xl font-bold border border-emerald-400/50 active:scale-95 transition';
  } else {
    totpBtn.innerHTML = '🛡️ 驗證器';
    totpBtn.className = 'bg-[#143628] hover:bg-[#0e271d] text-emerald-300 text-xs px-2.5 py-2 rounded-xl font-bold border border-emerald-600/50 active:scale-95 transition';
  }
}

function applyRoleViewExperience(roleCode, operatorName) {
  const displayEl = document.getElementById('hq-operator-role-display');
  const roleLabels = {
    owner: '大當家主賬號 (全盤權限)',
    warehouse: `倉儲調度 · ${operatorName}`,
    finance: `賬房財務 · ${operatorName}`,
    driver: `供貨師傅 · ${operatorName}`,
    auditor: `獨立稽核 · ${operatorName}`
  };
  if (displayEl) displayEl.innerText = roleLabels[roleCode] || operatorName;

  if (roleCode !== 'owner') {
    document.getElementById('btn-top-chg-pwd')?.classList.add('hidden');
    document.getElementById('btn-top-totp')?.classList.add('hidden');
    document.getElementById('rbac-card-box')?.classList.add('hidden');
    if (roleCode === 'warehouse') window.switchTab('products');
    else if (roleCode === 'finance') window.switchTab('settle');
  }
}

window.customizeCarrierName = function () {
  const val = prompt('自定義本商號周轉載具稱呼（如：周轉筐 / 托盤 / 氣瓶 / 料箱）：', carrierLabel);
  if (val && val.trim()) {
    carrierLabel = val.trim();
    localStorage.setItem('hq_carrier_label_' + currentAgent, carrierLabel);
    document.getElementById('carrier-label-btn').innerText = `${carrierLabel} ✎`;
    renderStoreTable();
  }
};

// =========================================================================
// 2. 倉庫出入庫與實地盤點校準引擎
// =========================================================================
window.openStockOpsModal = function (prodId) {
  const p = allProducts.find((x) => x.id === prodId);
  if (!p) return;
  const curStock = parseInt(p.stock ?? 0);
  const unit = p.measure_unit || '件';

  document.getElementById('stock-ops-prod-id').value = p.id;
  document.getElementById('stock-ops-cur-stock').value = curStock;
  document.getElementById('stock-ops-title').innerText = `📦 ${p.name}`;
  document.getElementById('stock-ops-subtitle').innerText = `當前賬面庫存：${curStock} ${unit}`;
  document.getElementById('stock-ops-qty-input').value = '';
  document.getElementById('stock-ops-operator').value = currentOperatorName;
  document.getElementById('stock-ops-remark').value = '';
  window.setStockOpsMode('in_purchase');
  window.openModal('modal-stock-ops');
};

window.setStockOpsMode = function (mode) {
  currentStockOpsMode = mode;
  const btns = {
    in_purchase: document.getElementById('btn-mode-in'),
    out_loss: document.getElementById('btn-mode-out'),
    audit_adjust: document.getElementById('btn-mode-audit')
  };
  Object.entries(btns).forEach(([k, el]) => {
    if (!el) return;
    el.className = k === mode ? 'py-1.5 rounded-lg bg-[#1b4332] text-white transition' : 'py-1.5 rounded-lg text-stone-600 transition';
  });

  const label = document.getElementById('stock-ops-qty-label');
  if (mode === 'in_purchase') label.innerText = '本次採購 / 生產完工入庫數量 (+) *：';
  else if (mode === 'out_loss') label.innerText = '本次報損 / 領用 / 樣品出庫數量 (-) *：';
  else label.innerText = '倉庫實地清點後的實際庫存總數 (=) *：';
};

window.submitStockOperation = async function () {
  const prodId = parseInt(document.getElementById('stock-ops-prod-id').value);
  const curStock = parseInt(document.getElementById('stock-ops-cur-stock').value) || 0;
  const inputVal = parseInt(document.getElementById('stock-ops-qty-input').value);
  const operator = document.getElementById('stock-ops-operator').value.trim() || currentOperatorName;
  const remark = document.getElementById('stock-ops-remark').value.trim();

  if (isNaN(inputVal) || inputVal < 0) return alert('請輸入有效的正整數數量！');

  const p = allProducts.find((x) => x.id === prodId);
  if (!p) return;

  let afterStock = curStock;
  let deltaQty = 0;

  if (currentStockOpsMode === 'in_purchase') {
    if (inputVal === 0) return alert('入庫數量需大於 0！');
    deltaQty = inputVal;
    afterStock = curStock + inputVal;
  } else if (currentStockOpsMode === 'out_loss') {
    if (inputVal === 0) return alert('出庫數量需大於 0！');
    deltaQty = -inputVal;
    afterStock = Math.max(0, curStock - inputVal);
  } else {
    afterStock = inputVal;
    deltaQty = afterStock - curStock;
  }

  const { error: uErr } = await supabase.from('product').update({ stock: afterStock }).eq('id', prodId);
  if (uErr) return alert('更新庫存失敗：' + uErr.message);

  await HQService.recordInventoryChange(currentAgent, {
    tenant_id: currentAgent,
    product_id: prodId,
    product_name: p.name,
    action_type: currentStockOpsMode,
    delta_qty: deltaQty,
    before_stock: curStock,
    after_stock: afterStock,
    operator_name: operator,
    remark: remark || (currentStockOpsMode === 'audit_adjust' ? `實盤校準(${deltaQty >= 0 ? '盤盈+' + deltaQty : '盤虧' + deltaQty})` : ''),
    created_at: new Date().toISOString()
  });

  alert(`✅ 庫存更新成功！【${p.name}】由 ${curStock} 變更為 ${afterStock} ${p.measure_unit || '件'}。`);
  window.closeModal('modal-stock-ops');
  window.loadHQData();
};

window.exportInventorySheetCSV = function () {
  if (allProducts.length === 0) return alert('暫無貨品可導出盤點表！');
  const headers = ['貨品ID', '貨品全稱', '規格', '計量單位', '基礎底價(元)', '當前賬面庫存', '實地清點數(手填)', '盤盈/盤虧差異', '備註'];
  const rows = allProducts.map((p) => [
    p.id,
    p.name,
    p.spec || '整裝',
    p.measure_unit || '件',
    parseFloat(p.tier_1_price || 0).toFixed(2),
    p.stock ?? 0,
    '',
    '',
    p.remark || ''
  ]);
  downloadCSV(`${currentAgent}_倉庫實地盤點表_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
};

// =========================================================================
// 3. 百業自定義屬性 & 一客一價規則行
// =========================================================================
window.addCustomAttrRow = function (keyVal = '', valStr = '') {
  const box = document.getElementById('custom-attrs-container');
  const row = document.createElement('div');
  row.className = 'flex items-center gap-1.5 custom-attr-row';
  row.innerHTML = `
    <input type="text" placeholder="屬性名(如:材質/保質期)" value="${keyVal}" class="attr-key w-1/3 bg-white border border-amber-300 rounded-xl px-2.5 py-1 text-xs outline-none font-bold">
    <input type="text" placeholder="屬性值(如:304鋼/12個月)" value="${valStr}" class="attr-val flex-1 bg-white border border-amber-300 rounded-xl px-2.5 py-1 text-xs outline-none">
    <button type="button" onclick="this.parentElement.remove()" class="text-rose-600 font-bold px-1.5 hover:bg-rose-50 rounded">✕</button>
  `;
  box.appendChild(row);
};

function collectCustomAttrs() {
  const attrs = {};
  document.querySelectorAll('#custom-attrs-container .custom-attr-row').forEach((row) => {
    const k = row.querySelector('.attr-key').value.trim();
    const v = row.querySelector('.attr-val').value.trim();
    if (k && v) attrs[k] = v;
  });
  return attrs;
}

window.addCustomPriceRuleRow = function (prodId = '', specialPrice = '') {
  const box = document.getElementById('custom-price-rules-box');
  const row = document.createElement('div');
  row.className = 'flex items-center gap-1.5 custom-price-row';
  const optionsHtml = allProducts
    .map((p) => `<option value="${p.id}" ${String(p.id) === String(prodId) ? 'selected' : ''}>${p.name} (底¥${p.tier_1_price})</option>`)
    .join('');
  row.innerHTML = `
    <select class="rule-prod-id flex-1 bg-white border border-emerald-300 rounded-lg px-2 py-1 text-[11px] outline-none">${optionsHtml}</select>
    <input type="number" step="0.01" placeholder="協議特價" value="${specialPrice}" class="rule-price w-24 bg-white border border-emerald-300 rounded-lg px-2 py-1 font-mono font-bold text-[11px] outline-none">
    <button type="button" onclick="this.parentElement.remove()" class="text-rose-600 font-bold px-1">✕</button>
  `;
  box.appendChild(row);
};

// =========================================================================
// 4. 三流晴雨表 & AI 經營參謀渲染
// =========================================================================
function renderThreeFlowsAndAIAdvisor() {
  const goodsValue = allProducts.reduce((sum, p) => sum + parseFloat(p.tier_1_price || 0) * parseInt(p.stock ?? 0), 0);
  const toShipOrders = allOrders.filter(
    (o) => (o.order_status === 'confirmed' || o.order_status === 'over_credit_approved') && o.delivery_status !== 'delivered' && !isDirectoryLead(o)
  );
  const lowStockProds = allProducts.filter((p) => parseInt(p.stock ?? 0) <= parseInt(p.custom_specs?.min_stock ?? 10));

  document.getElementById('flow-goods-value').innerText = `¥${goodsValue.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
  document.getElementById('flow-goods-toship').innerText = `${toShipOrders.length} 單`;
  document.getElementById('flow-goods-lowstock').innerText = `${lowStockProds.length} 款`;

  const receivable = allStores.reduce((sum, s) => sum + parseFloat(s.current_debt || 0), 0);
  const settledTotal = allOrders
    .filter((o) => o.delivery_status === 'delivered' && !isDirectoryLead(o))
    .reduce((sum, o) => sum + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);
  document.getElementById('flow-money-receivable').innerText = `¥${receivable.toFixed(2)}`;
  document.getElementById('flow-money-settled').innerText = `¥${settledTotal.toFixed(2)}`;

  const pendingOrders = allOrders.filter((o) => o.order_status === 'pending_confirm' && !isDirectoryLead(o));
  const leadsList = allOrders.filter((o) => isDirectoryLead(o) && o.order_status === 'pending_confirm');
  document.getElementById('flow-info-orders').innerText = `${pendingOrders.length} 筆`;
  document.getElementById('flow-info-leads').innerText = `${leadsList.length} 條`;

  const aiTips = [];
  lowStockProds.forEach((p) => {
    aiTips.push({
      level: 'rose',
      icon: '📦',
      title: `庫存緊缺預警：【${p.name}】僅剩 ${p.stock ?? 0}${p.measure_unit || '件'}`,
      desc: `已低於安全預警線，建議立即安排採購進貨或車間生產入庫，避免客戶下單無貨可發。`,
      btnText: '+ 立即入庫補貨',
      action: `window.openStockOpsModal(${p.id})`
    });
  });

  allStores.forEach((s) => {
    const debt = parseFloat(s.current_debt || 0);
    const limit = parseFloat(s.credit_limit || 2000);
    const baskets = parseInt(s.carrier_hold_count || s.basket_count || 0);
    if (debt > limit * 0.85 && debt > 0) {
      aiTips.push({
        level: 'amber',
        icon: '💰',
        title: `賬款風控提醒：【${s.name}】在賬 ¥${debt.toFixed(2)}（接近授信上限 ¥${limit}）`,
        desc: `建議下次供貨師傅上門時順帶對賬收款，或調整該客戶的結算方式為當面現結。`,
        btnText: '⚙️ 調整客戶策略',
        action: `window.switchTab('stores'); window.openStorePolicyModal(${s.id});`
      });
    }
    if (baskets >= 15) {
      aiTips.push({
        level: 'amber',
        icon: '🔄',
        title: `${carrierLabel}積壓提醒：【${s.name}】借欠 ${baskets} 件未歸還`,
        desc: `在外周轉資產較多，建議提醒送貨師傅本趟回程時重點清點迎回。`,
        btnText: '🏪 查看客戶檔案',
        action: `window.switchTab('stores');`
      });
    }
  });

  if (leadsList.length > 0) {
    aiTips.push({
      level: 'emerald',
      icon: '🤝',
      title: `拓客商機：有 ${leadsList.length} 家意向新客戶申請上門送樣洽談`,
      desc: `潛在客戶已通過供貨商名錄提交聯繫方式，及時聯繫送樣並一鍵建檔可快速擴充銷路。`,
      btnText: '立即承接建檔 ➔',
      action: `window.switchTab('settle'); window.filterOrderStatus('directory_leads');`
    });
  }

  if (aiTips.length === 0) {
    aiTips.push({
      level: 'emerald',
      icon: '🌿',
      title: '三流運轉健康：庫存充足、賬款平穩、無積壓異常',
      desc: '當前所有在售貨品庫存均在安全線以上，合作客戶授信健康。可點擊右上角「📲 招商二維碼」持續拓展新客源。',
      btnText: '📲 分享招商名片',
      action: `window.openPromoQrModal()`
    });
  }

  document.getElementById('flow-info-ai').innerText = `${aiTips.length} 條`;

  document.getElementById('ai-advisor-cards').innerHTML = aiTips
    .map((t) => {
      const colorCls =
        t.level === 'rose'
          ? 'bg-rose-50/70 border-rose-200 text-rose-950'
          : t.level === 'amber'
          ? 'bg-amber-50/70 border-amber-200 text-amber-950'
          : 'bg-emerald-50/70 border-emerald-200 text-emerald-950';
      return `
        <div class="p-3.5 rounded-2xl border ${colorCls} flex flex-col justify-between gap-2.5">
          <div>
            <div class="font-bold text-xs flex items-center gap-1.5"><span>${t.icon}</span><span>${t.title}</span></div>
            <p class="text-[11px] opacity-85 mt-1 leading-relaxed">${t.desc}</p>
          </div>
          <div class="text-right">
            <button onclick="${t.action}" class="bg-white hover:bg-stone-50 text-stone-900 border border-stone-200 px-3 py-1 rounded-xl font-bold text-[11px] shadow-xs active:scale-95 transition">${t.btnText}</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderInventoryLogs() {
  const box = document.getElementById('inventory-log-list');
  if (!box) return;
  if (allInventoryLogs.length === 0) {
    box.innerHTML = '<div class="py-6 text-center text-stone-400">暫無倉庫出入庫流水（在「貨品發布 & 倉庫盤點」點擊庫存數字或接單發運時將自動記錄）。</div>';
    return;
  }
  box.innerHTML = allInventoryLogs
    .map((l) => {
      const isPlus = parseInt(l.delta_qty) >= 0;
      const typeMap = {
        in_purchase: '採購/生產入庫',
        out_loss: '報損/領用出庫',
        audit_adjust: '實地盤點校準',
        order_ship: '配貨發運出庫'
      };
      const typeLabel = typeMap[l.action_type] || '庫存變動';
      return `
        <div class="py-2.5 flex justify-between items-center gap-2">
          <div>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold mr-1.5 ${isPlus ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}">${typeLabel}</span>
            <b class="text-stone-800">${l.product_name}</b>
            <span class="text-stone-400 ml-1.5 text-[11px]">${l.remark || ''}</span>
          </div>
          <div class="text-right font-mono shrink-0">
            <b class="${isPlus ? 'text-emerald-700' : 'text-rose-700'} font-bold">${isPlus ? '+' + l.delta_qty : l.delta_qty}</b>
            <span class="text-stone-400 text-[10px] ml-1">(${l.before_stock} ➔ ${l.after_stock})</span>
            <span class="text-[10px] text-stone-400 block">${l.operator_name || '倉管'} · ${new Date(l.created_at).toLocaleString()}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

// =========================================================================
// 5. 裝車總揀貨單、對賬單導出 & 招商二維碼
// =========================================================================
window.openBatchPickListModal = function () {
  const toShipOrders = allOrders.filter(
    (o) => (o.order_status === 'confirmed' || o.order_status === 'over_credit_approved') && o.delivery_status !== 'delivered' && !isDirectoryLead(o)
  );
  document.getElementById('picklist-tenant-name').innerText = `${currentTenantData?.company_name || currentAgent} · 裝車總揀貨單`;
  document.getElementById('picklist-time-label').innerText = `生成時間：${new Date().toLocaleString()}`;
  document.getElementById('picklist-order-count').innerText = `${toShipOrders.length} 單待發`;

  const container = document.getElementById('picklist-items-container');
  if (toShipOrders.length === 0) {
    container.innerHTML = '<div class="py-8 text-center text-stone-400">當前暫無「已排單發運」的待送訂單。</div>';
    window.openModal('modal-batch-picklist');
    return;
  }

  const itemSummaryMap = {};
  toShipOrders.forEach((o) => {
    (Array.isArray(o.items) ? o.items : []).forEach((it) => {
      const key = `${it.name}|${it.spec || '整裝'}|${it.measure_unit || '件'}`;
      if (!itemSummaryMap[key]) itemSummaryMap[key] = { name: it.name, spec: it.spec || '整裝', unit: it.measure_unit || '件', totalQty: 0, stores: [] };
      itemSummaryMap[key].totalQty += parseInt(it.qty || 0);
      itemSummaryMap[key].stores.push(`${o.store_name}(${it.qty})`);
    });
  });

  container.innerHTML = Object.values(itemSummaryMap)
    .map(
      (row, idx) => `
      <div class="py-2.5 flex justify-between items-start gap-2">
        <div>
          <div class="font-bold text-stone-900 text-xs">${idx + 1}. ${row.name} <span class="text-stone-400 font-normal">(${row.spec})</span></div>
          <div class="text-[10px] text-stone-500 mt-0.5">分店明細：${row.stores.join('、')}</div>
        </div>
        <span class="bg-amber-100 text-amber-950 border border-amber-300 px-2.5 py-0.5 rounded-lg font-mono font-bold text-sm shrink-0">${row.totalQty} ${row.unit}</span>
      </div>
    `
    )
    .join('');

  window.openModal('modal-batch-picklist');
};

window.copyPickListText = function () {
  const toShipOrders = allOrders.filter(
    (o) => (o.order_status === 'confirmed' || o.order_status === 'over_credit_approved') && o.delivery_status !== 'delivered' && !isDirectoryLead(o)
  );
  if (toShipOrders.length === 0) return alert('暫無待發貨單據！');
  const map = {};
  toShipOrders.forEach((o) =>
    (Array.isArray(o.items) ? o.items : []).forEach((it) => {
      const k = `${it.name} (${it.spec || '整裝'})`;
      map[k] = (map[k] || 0) + parseInt(it.qty || 0);
    })
  );
  const lines = [
    `【${currentTenantData?.company_name || currentAgent} 裝車總揀貨單】`,
    `時間：${new Date().toLocaleString()} | 共 ${toShipOrders.length} 家客戶`,
    `------------------------`,
    ...Object.entries(map).map(([k, q], i) => `${i + 1}. ${k} × ${q}`),
    `------------------------`,
    `配送客戶：${toShipOrders.map((o) => o.store_name).join('、')}`
  ];
  navigator.clipboard.writeText(lines.join('\n')).then(() => alert('✅ 裝車總揀貨單已複製！'));
};

window.exportOrdersToCSV = function () {
  const validOrders = allOrders.filter((o) => !isDirectoryLead(o));
  if (validOrders.length === 0) return alert('當前暫無可導出的業務往來單據！');
  const headers = ['單據編號', '下單時間', '合作客戶', '結算方式', '新貨金額(元)', '退貨抵扣(元)', '應結淨額(元)', '單據狀態', '履約交割狀態', '貨品明細', '備註'];
  const rows = validOrders.map((o) => [
    o.order_no || o.id,
    o.created_at ? new Date(o.created_at).toLocaleString() : '',
    o.store_name || '',
    o.settlement_type || '',
    parseFloat(o.total_amount || 0).toFixed(2),
    parseFloat(o.return_amount || 0).toFixed(2),
    parseFloat(o.net_settle_amount || o.total_amount || 0).toFixed(2),
    o.order_status || '',
    o.delivery_status === 'delivered' ? '已交割簽收' : '待配送/處理中',
    (Array.isArray(o.items) ? o.items : []).map((i) => `${i.name}x${i.qty}`).join('; '),
    (o.note || '').replace(/[\r\n,]+/g, ' ')
  ]);
  downloadCSV(`${currentAgent}_往來對賬單_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
};

window.openPromoQrModal = function () {
  const promoUrl = `${window.location.origin}/suppliers.html?t=${encodeURIComponent(currentAgent)}`;
  document.getElementById('promo-qr-company').innerText = currentTenantData?.company_name || currentAgent;
  document.getElementById('promo-qr-code-text').innerText = `唯一商號代號：${currentAgent}`;
  document.getElementById('promo-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(promoUrl)}`;
  window.openModal('modal-promo-qr');
};

window.copyPromoLink = function () {
  const promoUrl = `${window.location.origin}/suppliers.html?t=${encodeURIComponent(currentAgent)}`;
  const shareText = `【${currentTenantData?.company_name || currentAgent}】源頭正規供貨商直供，營業執照已核驗，支持預約業務員上門送樣、先驗貨後合作！點擊預約：${promoUrl}`;
  navigator.clipboard.writeText(shareText).then(() => alert('✅ 專屬招商文案與鏈接已複製！'));
};

// =========================================================================
// 6. TOTP 2FA 綁定、自助改密與雙模登入門禁
// =========================================================================
window.openTotpSetupModal = async function () {
  const { data: tenant, error } = await HQService.fetchTenant(currentAgent);
  if (error) return alert('讀取商號信息失敗：' + error.message);

  let secret = (tenant?.totp_secret || '').trim();
  if (!secret) {
    secret = TOTP.generateRandomSecret();
    try {
      await HQService.updateTenantWithVerify(currentAgent, { totp_secret: secret, totp_enabled: true });
    } catch (upErr) {
      return alert('⚠️ 雲端數據庫寫入秘鑰被攔截，請先在 Supabase SQL Editor 執行 RLS 更新放行策略：' + upErr.message);
    }
  }

  document.getElementById('totp-secret-display').innerText = secret;
  document.getElementById('totp-test-code').value = '';
  document.getElementById('totp-setup-qr').src = TOTP.buildQrImageUrl('SupplyChainHQ', currentAgent, secret);
  window.openModal('modal-totp-setup');
};

window.copyTotpSecret = function () {
  navigator.clipboard.writeText(document.getElementById('totp-secret-display').innerText).then(() => alert('TOTP 金鑰已複製！'));
};

window.verifyAndSaveTotp = async function () {
  const code = document.getElementById('totp-test-code').value.trim();
  const secret = document.getElementById('totp-secret-display').innerText.trim();
  if (!code || code.length !== 6) return alert('請輸入驗證器中顯示的 6 位動態口令！');

  const isValid = await TOTP.verifyTOTP(secret, code, 2);
  if (!isValid) {
    return alert('⚠️ 動態口令驗證未通過！\n1. 請確認手機「自動設置時間」已開啟；\n2. 若掃碼異常，請點擊「複製密鑰」，在手機驗證器選擇「手動輸入密鑰」添加（時間基準）。');
  }

  try {
    await HQService.updateTenantWithVerify(currentAgent, { totp_secret: secret, totp_enabled: true });
    if (currentTenantData) {
      currentTenantData.totp_secret = secret;
      currentTenantData.totp_enabled = true;
    }
    updateTotpStatusBadge(true);
    alert('🎉 身份驗證器已真正寫入雲端並綁定成功！');
    window.closeModal('modal-totp-setup');
  } catch (err) {
    alert('⚠️ 數據庫寫入被攔截（請檢查 Supabase RLS 更新權限）：' + err.message);
  }
};

window.openChangePasswordModal = function () {
  ['chg-old-key', 'chg-new-key', 'chg-confirm-key', 'chg-totp-code'].forEach((id) => (document.getElementById(id).value = ''));
  window.openModal('modal-change-password');
};

window.submitChangePassword = async function () {
  const oldKey = document.getElementById('chg-old-key').value.trim();
  const newKey = document.getElementById('chg-new-key').value.trim();
  const confirmKey = document.getElementById('chg-confirm-key').value.trim();
  const totpCode = document.getElementById('chg-totp-code').value.trim();
  if (!oldKey || !newKey) return alert('請填全原密碼與新密碼！');
  if (newKey !== confirmKey) return alert('兩次輸入的新密碼不一致！');
  if (!totpCode || totpCode.length !== 6) return alert('請輸入手機驗證器 6 位動態碼！');

  const { data: tenant } = await HQService.fetchTenant(currentAgent);
  if (!tenant) return;
  const isOldKeyMatch = oldKey === tenant.access_key || oldKey.toUpperCase() === (tenant.access_key || '').toUpperCase();
  const isTokenMatch = tenant.reset_claim_token && oldKey.toUpperCase() === tenant.reset_claim_token.toUpperCase();
  if (!isOldKeyMatch && !isTokenMatch) return alert('⚠️ 原訪問密鑰不正確！');

  const isTotpValid = await TOTP.verifyTOTP(tenant.totp_secret || 'JBSWY3DPEHPK3PXP', totpCode, 2);
  if (!isTotpValid) return alert('⚠️ 驗證器 6 位動態碼錯誤！');

  try {
    await HQService.updateTenantWithVerify(currentAgent, { access_key: newKey, reset_claim_token: null });
    sessionStorage.setItem('hq_tenant_session_' + currentAgent, newKey);
    document.getElementById('hq-default-pwd-banner')?.classList.add('hidden');
    alert('🎉 新密鑰已真正寫入雲端並生效存盤！');
    window.closeModal('modal-change-password');
  } catch (err) {
    alert('⚠️ 修改密碼寫入雲端被攔截（請檢查 Supabase RLS 更新權限）：' + err.message);
  }
};

window.trigger2FAAction = function (actionDesc, onVerifiedCallback) {
  document.getElementById('modal-2fa-desc').innerText = actionDesc;
  document.getElementById('input-2fa-code').value = '';
  pending2FACallback = onVerifiedCallback;
  window.openModal('modal-2fa-verify');
  setTimeout(() => document.getElementById('input-2fa-code').focus(), 150);
};

window.close2FAModal = function () {
  pending2FACallback = null;
  window.closeModal('modal-2fa-verify');
};

window.submit2FAVerification = async function () {
  const code = document.getElementById('input-2fa-code').value.trim();
  if (!code || code.length !== 6) return alert('⚠️ 請輸入 6 位動態碼！');
  const { data: tenant } = await HQService.fetchTenant(currentAgent);
  const isValid = await TOTP.verifyTOTP(tenant?.totp_secret || 'JBSWY3DPEHPK3PXP', code, 2);
  if (!isValid) return alert('⚠️ 動態口令驗證失敗！');
  window.close2FAModal();
  if (typeof pending2FACallback === 'function') pending2FACallback();
};

window.verifyHQAuthPwd = async function (e) {
  e.preventDefault();
  const tenantId = document.getElementById('hq-login-tenant').value.trim().toUpperCase();
  const rawKey = document.getElementById('hq-login-key').value.trim();
  const errBox = document.getElementById('hq-auth-error');
  const btn = document.getElementById('btn-hq-pwd');

  btn.disabled = true;
  btn.innerText = '核對中...';
  errBox.classList.add('hidden');

  if (rawKey.includes(':') || rawKey.includes('：')) {
    const [subAcc, subPwd] = rawKey.split(/[:：]/).map((s) => s.trim());
    const { data: tenantList } = await supabase.from('platform_tenant').select('*').eq('tenant_id', tenantId).eq('is_active', true).limit(1);
    if (!tenantList || tenantList.length === 0) {
      btn.disabled = false;
      btn.innerText = '核驗密鑰 · 登入調度台';
      errBox.innerText = '⚠️ 商號代號不存在或已暫歇！';
      errBox.classList.remove('hidden');
      return;
    }
    const { data: subList } = await supabase
      .from('tenant_sub_user')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('account_name', subAcc)
      .eq('password_hash', subPwd)
      .eq('is_active', true)
      .limit(1);

    if (!subList || subList.length === 0) {
      btn.disabled = false;
      btn.innerText = '核驗密鑰 · 登入調度台';
      errBox.innerText = '⚠️ 屬員子賬號或密碼不正確！';
      errBox.classList.remove('hidden');
      return;
    }

    currentAgent = tenantId;
    currentRoleCode = subList[0].role_code;
    currentOperatorName = subList[0].real_name;
    sessionStorage.setItem('hq_tenant_session_' + tenantId, tenantList[0].access_key);
    sessionStorage.setItem('hq_active_authed_tenant', tenantId);
    sessionStorage.setItem('hq_sub_role_' + tenantId, currentRoleCode);
    sessionStorage.setItem('hq_sub_name_' + tenantId, currentOperatorName);

    document.getElementById('hq-auth-gate').classList.add('hidden');
    applyRoleViewExperience(currentRoleCode, currentOperatorName);
    window.loadHQData();
    return;
  }

  const { data, error } = await supabase
    .from('platform_tenant')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`access_key.eq.${rawKey},access_key.eq.${rawKey.toUpperCase()}`)
    .limit(1);

  if (error || !data || data.length === 0) {
    btn.disabled = false;
    btn.innerText = '核驗密鑰 · 登入調度台';
    errBox.innerText = '⚠️ 商號代號不存在或安家訪問密鑰不符！';
    errBox.classList.remove('hidden');
    return;
  }
  if (!data[0].is_active) {
    btn.disabled = false;
    btn.innerText = '核驗密鑰 · 登入調度台';
    errBox.innerText = '🚫 該商號已被平台設案暫歇！';
    errBox.classList.remove('hidden');
    return;
  }

  sessionStorage.setItem('hq_tenant_session_' + tenantId, data[0].access_key);
  sessionStorage.setItem('hq_active_authed_tenant', tenantId);
  sessionStorage.removeItem('hq_sub_role_' + tenantId);
  sessionStorage.removeItem('hq_sub_name_' + tenantId);
  currentAgent = tenantId;
  currentRoleCode = 'owner';
  currentOperatorName = '大當家主賬號';
  carrierLabel = localStorage.getItem('hq_carrier_label_' + currentAgent) || '周轉載具';
  document.getElementById('hq-auth-gate').classList.add('hidden');
  applyRoleViewExperience('owner', '大當家主賬號');
  window.loadHQData();
};

async function checkHQAuthStatus() {
  const authedTenant = sessionStorage.getItem('hq_active_authed_tenant');
  if (!authedTenant) {
    document.getElementById('hq-auth-gate').classList.remove('hidden');
    return false;
  }
  const savedKey = sessionStorage.getItem('hq_tenant_session_' + authedTenant);
  if (!savedKey) {
    document.getElementById('hq-auth-gate').classList.remove('hidden');
    document.getElementById('hq-login-tenant').value = authedTenant;
    return false;
  }

  const { data } = await supabase
    .from('platform_tenant')
    .select('*')
    .eq('tenant_id', authedTenant)
    .eq('access_key', savedKey)
    .eq('is_active', true)
    .limit(1);
  if (data && data.length > 0) {
    currentAgent = authedTenant;
    currentRoleCode = sessionStorage.getItem('hq_sub_role_' + currentAgent) || 'owner';
    currentOperatorName = sessionStorage.getItem('hq_sub_name_' + currentAgent) || '大當家主賬號';
    carrierLabel = localStorage.getItem('hq_carrier_label_' + currentAgent) || '周轉載具';
    document.getElementById('hq-auth-gate').classList.add('hidden');
    applyRoleViewExperience(currentRoleCode, currentOperatorName);
    return true;
  } else {
    sessionStorage.removeItem('hq_tenant_session_' + authedTenant);
    sessionStorage.removeItem('hq_active_authed_tenant');
    document.getElementById('hq-auth-gate').classList.remove('hidden');
    return false;
  }
}

window.logoutHQ = function () {
  sessionStorage.removeItem('hq_tenant_session_' + currentAgent);
  sessionStorage.removeItem('hq_active_authed_tenant');
  document.getElementById('hq-auth-gate').classList.remove('hidden');
};

window.switchEntityType = function (type) {
  localStorage.setItem('hq_entity_type', type);
  const titles = {
    factory: '品牌製造工坊 · 生產出入庫與直供調度中樞',
    service: '工料配件商行 · 倉儲配發與工程對賬中樞',
    dealer: '源頭直供與總銷調度中樞'
  };
  document.getElementById('hq-title').innerText = titles[type] || titles.dealer;
};

window.switchTab = function (tabName) {
  localStorage.setItem('hq_active_tab', tabName);
  ['advisor', 'products', 'stores', 'settle'].forEach((t) => {
    document.getElementById(`tab-${t}`).classList.add('hidden');
    document.getElementById(`tab-btn-${t}`).className =
      'py-2.5 px-2 text-center rounded-xl text-stone-600 hover:text-emerald-950 hover:bg-stone-50 transition flex items-center justify-center gap-1';
  });
  document.getElementById(`tab-${tabName}`).classList.remove('hidden');
  document.getElementById(`tab-btn-${tabName}`).className =
    'py-2.5 px-2 text-center rounded-xl bg-[#1b4332] text-white transition flex items-center justify-center gap-1 shadow-xs';
};

// =========================================================================
// 7. 全盤數據加載與工作台渲染
// =========================================================================
window.loadHQData = async function () {
  const { data: curTenant, error: tErr } = await HQService.fetchTenant(currentAgent);
  if (tErr || !curTenant || !curTenant.is_active) {
    window.logoutHQ();
    return;
  }

  currentTenantData = curTenant;
  document.getElementById('hq-company-badge').innerText = `${curTenant.company_name} (${curTenant.tenant_id})`;
  document.getElementById('hq-tenant-id').innerText = curTenant.tenant_id;
  document.getElementById('carrier-label-btn').innerText = `${carrierLabel} ✎`;
  updateWebhookStatusBadge(curTenant.webhook_url || '');
  updateTotpStatusBadge(!!(curTenant.totp_enabled && curTenant.totp_secret));

  const defaultBanner = document.getElementById('hq-default-pwd-banner');
  if (currentRoleCode === 'owner' && curTenant.credit_code && curTenant.credit_code.length >= 6) {
    const last6 = curTenant.credit_code.slice(-6).toUpperCase();
    if ((curTenant.access_key || '').toUpperCase() === last6) defaultBanner?.classList.remove('hidden');
    else defaultBanner?.classList.add('hidden');
  }

  const dashData = await HQService.fetchFullDashboardData(currentAgent);
  allPlatformCats = dashData.categories;
  allProducts = dashData.products;
  allStores = dashData.stores;
  allOrders = dashData.orders;
  allInventoryLogs = dashData.inventoryLogs;
  allSubUsers = dashData.subUsers;
  const logs = dashData.pendingCashLogs;

  populateCategoryDropdowns();
  renderProductFilterBar();
  renderProductTable();

  document.getElementById('stat-active-stores').innerText = `${allStores.length} 家`;
  const totalBaskets = allStores.reduce((sum, s) => sum + parseInt(s.carrier_hold_count || s.basket_count || 0), 0);
  document.getElementById('stat-baskets').innerText = `${totalBaskets} 件`;
  renderStoreFilterBar();
  renderStoreTable();

  const totalPendingCash = logs.reduce((sum, l) => sum + parseFloat(l.amount || 0), 0);
  document.getElementById('flow-money-pending').innerText = `¥${totalPendingCash.toFixed(2)}`;
  renderDriverSettleList(logs);

  const leadsList = allOrders.filter((o) => isDirectoryLead(o) && o.order_status === 'pending_confirm');
  const normalPendingList = allOrders.filter((o) => o.order_status === 'pending_confirm' && !isDirectoryLead(o));
  const overCreditList = allOrders.filter((o) => o.order_status === 'over_credit_pending');

  document.getElementById('count-pending-confirm').innerText = normalPendingList.length;
  document.getElementById('count-directory-leads').innerText = leadsList.length;
  document.getElementById('stores-tab-lead-count').innerText = leadsList.length;
  document.getElementById('count-over-credit').innerText = overCreditList.length;

  const totalTodos = logs.length + normalPendingList.length + leadsList.length + overCreditList.length;
  const badge = document.getElementById('unsettled-badge');
  if (totalTodos > 0) {
    badge.classList.remove('hidden');
    badge.innerText = `${totalTodos}待辦`;
  } else {
    badge.classList.add('hidden');
  }

  renderOrderFulfillmentList();
  renderInventoryLogs();
  renderSubUsersTable();
  renderThreeFlowsAndAIAdvisor();
};

function populateCategoryDropdowns() {
  const l1List = allPlatformCats.filter((c) => c.level === 1);
  const l1Select = document.getElementById('prod-cat-main');
  if (!l1Select) return;
  l1Select.innerHTML = l1List.map((c) => `<option value="${c.name}" data-id="${c.id}">${c.name}</option>`).join('');
  if (l1List.length > 0) window.onMainCategoryChange(l1List[0].name);
}

window.onMainCategoryChange = function (mainCatName) {
  const l1Obj = allPlatformCats.find((c) => c.level === 1 && c.name === mainCatName);
  const subSelect = document.getElementById('prod-cat-sub');
  if (!l1Obj || !subSelect) return;
  const subs = allPlatformCats.filter((c) => c.level === 2 && c.parent_id === l1Obj.id);
  subSelect.innerHTML = subs.map((s) => `<option value="${s.name}">${s.name}</option>`).join('');
};

function renderProductFilterBar() {
  const bar = document.getElementById('product-tags-filter');
  if (!bar) return;
  const dynamicTags = new Set(['🔥 街坊搶手', '⏳ 臨期撿漏', '💎 高毛利']);
  allProducts.forEach((p) => (Array.isArray(p.tags) ? p.tags : []).forEach((t) => dynamicTags.add(t)));
  const allTagList = ['全部', ...Array.from(dynamicTags)];
  bar.innerHTML =
    `<span class="text-stone-400 text-[11px] self-center mr-1">標籤快篩:</span>` +
    allTagList
      .map(
        (t) => `
      <button onclick="window.filterProductByTag('${t}')" class="px-2.5 py-0.5 rounded-lg text-[10px] transition ${
          activeProdFilter === t ? 'bg-[#1b4332] text-white font-bold' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
        }">${t}</button>
    `
      )
      .join('');
}

function renderProductTable() {
  let filtered = activeProdFilter === '全部' ? allProducts : allProducts.filter((p) => Array.isArray(p.tags) && p.tags.includes(activeProdFilter));

  document.getElementById('product-table-body').innerHTML = filtered
    .map((p) => {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      const tagBadges = tags.map((t) => `<span class="bg-emerald-50 text-emerald-900 border border-emerald-200 px-1.5 py-0.2 rounded text-[10px] mr-1">${t}</span>`).join('');
      const isBM = p.channel_brick_and_mortar !== undefined ? p.channel_brick_and_mortar : p.sales_channel_type !== 'online';
      const isEC = p.channel_ecommerce !== undefined ? p.channel_ecommerce : p.sales_channel_type !== 'offline';
      let channelBadges = '';
      if (isBM) channelBadges += '<span class="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] px-1.5 py-0.5 rounded font-bold mr-1">🏬 實體批發</span>';
      if (isEC) channelBadges += '<span class="bg-blue-100 text-blue-900 border border-blue-300 text-[10px] px-1.5 py-0.5 rounded font-bold">🌐 線上零售</span>';

      const customAttrs = p.custom_specs && typeof p.custom_specs === 'object' && p.custom_specs.attrs ? p.custom_specs.attrs : {};
      const attrBadges = Object.entries(customAttrs)
        .map(([k, v]) => `<span class="inline-block bg-stone-100 text-stone-700 border border-stone-200 px-1.5 py-0.2 rounded text-[10px] mr-1 mt-0.5">${k}: <b>${v}</b></span>`)
        .join('');

      const curStock = parseInt(p.stock ?? 0);
      const minLine = parseInt(p.custom_specs?.min_stock ?? 10);
      const isLow = curStock <= minLine;

      return `
        <tr class="hover:bg-stone-50 transition">
          <td class="p-2.5">${p.image_url ? `<img src="${p.image_url}" class="w-10 h-10 rounded-xl object-cover border border-stone-200">` : `<div class="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[9px] text-stone-400">無圖</div>`}</td>
          <td class="p-2.5 font-bold">${channelBadges || '<span class="text-stone-300 text-[10px]">未投放</span>'}</td>
          <td class="p-2.5 text-stone-600 font-sans whitespace-normal max-w-[200px]">
            <div class="text-[11px]">${p.category_main || '常規'} ➔ ${p.category_sub || '通用'} ${p.category_tertiary ? `<b class="text-amber-800">(${p.category_tertiary})</b>` : ''}</div>
            <div>${attrBadges}</div>
          </td>
          <td class="p-2.5 font-sans">
            <b class="text-stone-900 block">${p.name}</b>
            <span class="font-mono text-[10px] text-emerald-800">${p.trace_code_prefix || 'QC-'}${p.id} ${p.barcode ? '· 碼:' + p.barcode : ''}</span>
          </td>
          <td class="p-2.5">${tagBadges || '-'}</td>
          <td class="p-2.5 font-mono">${p.spec || '整裝'} / ${p.measure_unit || '件'}</td>
          <td class="p-2.5 font-mono font-bold text-emerald-800">
            <span class="cursor-pointer hover:bg-emerald-50 px-1.5 py-0.5 rounded border border-transparent hover:border-emerald-200" onclick="window.quickEditPrice(${p.id}, ${p.tier_1_price})">¥${p.tier_1_price} ✏️</span>
          </td>
          <td class="p-2.5 font-mono text-stone-600">¥${p.tier_2_price || p.tier_1_price}</td>
          <td class="p-2.5 font-mono">
            <button onclick="window.openStockOpsModal(${p.id})" class="px-2.5 py-1 rounded-xl font-bold border transition active:scale-95 ${
        isLow ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse' : 'bg-emerald-50 text-emerald-950 border-emerald-200 hover:bg-emerald-100'
      }" title="點擊進行採購入庫、報損出庫或實地盤點">${curStock} ${p.measure_unit || '件'} ⚙️</button>
          </td>
          <td class="p-2.5 text-right space-x-1.5">
            <button onclick="window.openEditProductModal(${p.id})" class="text-[11px] text-emerald-800 font-bold hover:underline">編輯</button>
            <button onclick="window.deleteProduct(${p.id}, '${p.name}')" class="text-[11px] text-rose-600 font-bold hover:underline">刪除</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderStoreFilterBar() {
  const bar = document.getElementById('store-tags-filter');
  if (!bar) return;
  const dynamicTags = new Set(['#飯店大客', '#社區便利', '#工程客戶', '#VIP現結']);
  allStores.forEach((s) => (Array.isArray(s.tags) ? s.tags : []).forEach((t) => dynamicTags.add(t)));
  const list = ['全部', ...Array.from(dynamicTags)];
  bar.innerHTML =
    `<span class="text-stone-400 text-[11px] self-center mr-1">客戶分類標籤:</span>` +
    list
      .map(
        (t) => `
      <button onclick="window.filterStoreByTag('${t}')" class="px-2.5 py-0.5 rounded-lg text-[10px] transition ${
          activeStoreFilter === t ? 'bg-[#1b4332] text-white font-bold' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
        }">${t}</button>
    `
      )
      .join('');
}

function renderStoreTable() {
  let filtered = activeStoreFilter === '全部' ? allStores : allStores.filter((s) => Array.isArray(s.tags) && s.tags.includes(activeStoreFilter));

  document.getElementById('store-list').innerHTML =
    filtered.length === 0
      ? '<div class="py-8 text-center text-stone-400">暫無該分類下的客戶，點擊右上角「+ 快速建檔開戶」或給現有客戶貼上對應標籤即可。</div>'
      : filtered
          .map((s) => {
            const tags = Array.isArray(s.tags) ? s.tags : [];
            const tagBadges = tags.map((t) => `<span class="bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded text-[10px] mr-1 font-bold">${t}</span>`).join('');
            const pricing = s.custom_pricing && typeof s.custom_pricing === 'object' ? s.custom_pricing : {};
            const discountRate = parseFloat(pricing.discount_rate || 1);
            const customRuleCount = pricing.item_prices ? Object.keys(pricing.item_prices).length : 0;

            return `
            <div class="py-3.5 flex flex-wrap justify-between items-center gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-bold text-stone-900 text-xs">${s.name}</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded font-mono bg-stone-100 text-stone-600 border border-stone-200">📱 ${s.phone}</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded font-medium ${
                    s.current_debt > s.credit_limit * 0.8 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }">在賬: ¥${s.current_debt || 0} / 授信: ¥${s.credit_limit || 2000}</span>
                  <span class="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded font-mono font-bold">${carrierLabel}借欠: ${
              s.carrier_hold_count || s.basket_count || 0
            } 件</span>
                  ${discountRate !== 1 ? `<span class="text-[10px] bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.2 rounded font-bold">協議 ${(discountRate * 10).toFixed(1)} 折</span>` : ''}
                  ${customRuleCount > 0 ? `<span class="text-[10px] bg-purple-50 text-purple-800 border border-purple-200 px-1.5 py-0.2 rounded font-bold">${customRuleCount}款單品協議價</span>` : ''}
                </div>
                <div class="text-[11px] text-stone-400 mt-1 flex flex-wrap gap-3 font-mono">
                  <span>分類標籤: ${tagBadges || '<span class="text-stone-300">未分類</span>'}</span>
                  <span>供貨師傅: <b class="text-emerald-900">${s.driver_name || '張師傅'}</b></span>
                  <span>專供品道: <b class="text-amber-800">${s.visible_product_ids ? `${s.visible_product_ids.length} 種專享` : '全品類開放'}</b></span>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                <button onclick="window.editStoreTagsPrompt(${s.id}, '${JSON.stringify(s.tags || []).replace(/"/g, '"')}')" class="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2.5 py-1 rounded-xl font-bold">🏷️ 貼分類標籤</button>
                <button onclick="window.openStorePolicyModal(${s.id})" class="text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 px-2.5 py-1 rounded-xl font-bold">💎 專屬價格 & 授信</button>
                <button onclick="window.openVisibilityModal(${s.id}, '${s.name}', '${JSON.stringify(s.visible_product_ids || []).replace(/"/g, '"')}')" class="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-xl font-bold">🎯 專供品道</button>
                <button onclick="window.reassignDriverPrompt(${s.id}, '${s.driver_name || '供貨師傅'}')" class="text-[11px] bg-stone-50 text-stone-700 border border-stone-200 px-2.5 py-1 rounded-xl font-bold">🚚 指派師傅</button>
              </div>
            </div>
          `;
          })
          .join('');
}

window.editStoreTagsPrompt = async function (storeId, currentTagsJson) {
  const tags = JSON.parse(currentTagsJson || '[]');
  const newTagStr = prompt('為該客戶設定分類/脾性標籤（逗號隔開，如：#餐飲大客, #VIP現結, #五金工程）：', tags.join(', '));
  if (newTagStr !== null) {
    const cleanTags = newTagStr
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : '#' + t));
    await supabase.from('store').update({ tags: cleanTags }).eq('id', storeId);
    window.loadHQData();
  }
};

window.openStorePolicyModal = function (storeId) {
  const s = allStores.find((x) => x.id === storeId);
  if (!s) return;

  document.getElementById('policy-store-id').value = s.id;
  document.getElementById('policy-store-name').innerText = `${s.name} (聯繫人: ${s.contact || '掌櫃'})`;
  document.getElementById('policy-credit-limit').value = s.credit_limit || 2000;
  document.getElementById('policy-return-quota').value = s.monthly_return_quota || 500;
  document.getElementById('policy-default-settlement').value = s.default_settlement || 'credit';
  document.getElementById('policy-workflow-select').value = s.settle_workflow || 'cash_on_delivery';
  document.getElementById('policy-custom-terms').value = s.custom_settlement_terms || '';

  const pricing = s.custom_pricing && typeof s.custom_pricing === 'object' ? s.custom_pricing : {};
  document.getElementById('policy-price-tier').value = pricing.price_tier || 'tier_1';
  document.getElementById('policy-discount-rate').value = pricing.discount_rate || '1.00';

  const rulesBox = document.getElementById('custom-price-rules-box');
  rulesBox.innerHTML = '';
  if (pricing.item_prices && typeof pricing.item_prices === 'object') {
    Object.entries(pricing.item_prices).forEach(([pid, sp]) => window.addCustomPriceRuleRow(pid, sp));
  }

  const allowed = Array.isArray(s.allowed_settlements) ? s.allowed_settlements : ['cash', 'credit'];
  document.querySelectorAll('.policy-cb').forEach((cb) => {
    cb.checked = allowed.includes(cb.value);
  });

  window.openModal('store-policy-modal');
};

window.saveStorePolicySettings = async function () {
  const storeId = parseInt(document.getElementById('policy-store-id').value);
  const credit_limit = parseFloat(document.getElementById('policy-credit-limit').value) || 2000;
  const monthly_return_quota = parseFloat(document.getElementById('policy-return-quota').value) || 500;
  const default_settlement = document.getElementById('policy-default-settlement').value;
  const settle_workflow = document.getElementById('policy-workflow-select').value;
  const custom_settlement_terms = document.getElementById('policy-custom-terms').value.trim();

  const price_tier = document.getElementById('policy-price-tier').value;
  const discount_rate = parseFloat(document.getElementById('policy-discount-rate').value) || 1.0;
  const item_prices = {};
  document.querySelectorAll('#custom-price-rules-box .custom-price-row').forEach((row) => {
    const pid = row.querySelector('.rule-prod-id')?.value;
    const sp = parseFloat(row.querySelector('.rule-price')?.value);
    if (pid && !isNaN(sp) && sp > 0) item_prices[pid] = sp;
  });

  const allowed_settlements = Array.from(document.querySelectorAll('.policy-cb:checked')).map((el) => el.value);
  if (allowed_settlements.length === 0) allowed_settlements.push('cash');

  const updatePayload = {
    credit_limit,
    monthly_return_quota,
    default_settlement,
    allowed_settlements,
    settle_workflow,
    custom_settlement_terms,
    custom_pricing: { price_tier, discount_rate, item_prices }
  };

  let { error } = await supabase.from('store').update(updatePayload).eq('id', storeId);
  if (error && (error.message || '').includes('custom_pricing')) {
    delete updatePayload.custom_pricing;
    await supabase.from('store').update(updatePayload).eq('id', storeId);
  }

  alert('✅ 客戶專屬價格與商約策略已儲存！');
  window.closeModal('store-policy-modal');
  window.loadHQData();
};

function applyChannelPermissions(tenant, prod = null) {
  const bmChk = document.getElementById('chk-channel-bm');
  const ecChk = document.getElementById('chk-channel-ec');
  const bmLock = document.getElementById('lock-channel-bm');
  const ecLock = document.getElementById('lock-channel-ec');

  const permitBM = tenant?.permit_brick_and_mortar !== false && tenant?.service_mode !== 'online';
  const permitEC = tenant?.permit_ecommerce !== false && tenant?.service_mode !== 'offline';

  bmChk.disabled = !permitBM;
  bmLock.classList.toggle('hidden', permitBM);
  bmChk.checked = permitBM
    ? prod
      ? prod.channel_brick_and_mortar !== undefined
        ? !!prod.channel_brick_and_mortar
        : prod.sales_channel_type !== 'online'
      : true
    : false;

  ecChk.disabled = !permitEC;
  ecLock.classList.toggle('hidden', permitEC);
  ecChk.checked = permitEC
    ? prod
      ? prod.channel_ecommerce !== undefined
        ? !!prod.channel_ecommerce
        : prod.sales_channel_type !== 'offline'
      : true
    : false;
}

window.openAddProductModal = function () {
  document.getElementById('prod-modal-title').innerText = '📦 物勒工名 · 發布新貨品';
  document.getElementById('editing-prod-id').value = '';
  uploadedImageBase64 = '';
  selectedTags = [];
  document.getElementById('image-preview-box').innerHTML = '無圖';
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-barcode').value = '';
  document.getElementById('prod-price').value = '';
  document.getElementById('prod-price-tier2').value = '';
  document.getElementById('prod-stock').value = '100';
  document.getElementById('prod-min-stock').value = '10';
  document.getElementById('prod-cat-tertiary').value = '';
  document.getElementById('prod-spec').value = '整裝';
  document.getElementById('prod-measure-unit').value = '箱';
  document.getElementById('prod-trace-prefix').value = `${currentAgent}-QC-`;
  document.getElementById('prod-origin-place').value = '源頭工坊原產';
  document.getElementById('prod-remark').value = '';
  document.getElementById('custom-attrs-container').innerHTML = '';
  renderTagChips();
  applyChannelPermissions(currentTenantData, null);
  window.openModal('product-modal');
};

window.openEditProductModal = function (id) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return;
  document.getElementById('prod-modal-title').innerText = '✏️ 潤飾貨品細節與自定義屬性';
  document.getElementById('editing-prod-id').value = p.id;
  applyChannelPermissions(currentTenantData, p);

  document.getElementById('prod-cat-main').value = p.category_main || '';
  window.onMainCategoryChange(p.category_main || '');
  document.getElementById('prod-cat-sub').value = p.category_sub || '';
  document.getElementById('prod-cat-tertiary').value = p.category_tertiary || '';

  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-barcode').value = p.barcode || '';
  document.getElementById('prod-price').value = p.tier_1_price;
  document.getElementById('prod-price-tier2').value = p.tier_2_price || p.tier_1_price;
  document.getElementById('prod-stock').value = p.stock ?? 100;
  document.getElementById('prod-min-stock').value = p.custom_specs?.min_stock ?? 10;
  document.getElementById('prod-spec').value = p.spec || '整裝';
  document.getElementById('prod-measure-unit').value = p.measure_unit || '箱';
  document.getElementById('prod-trace-prefix').value = p.trace_code_prefix || 'QC-';
  document.getElementById('prod-origin-place').value = p.origin_place || '源頭工坊原產';
  document.getElementById('prod-remark').value = p.remark || '';

  const attrBox = document.getElementById('custom-attrs-container');
  attrBox.innerHTML = '';
  const attrs = p.custom_specs && p.custom_specs.attrs ? p.custom_specs.attrs : {};
  Object.entries(attrs).forEach(([k, v]) => window.addCustomAttrRow(k, v));

  uploadedImageBase64 = p.image_url || '';
  document.getElementById('image-preview-box').innerHTML = uploadedImageBase64 ? `<img src="${uploadedImageBase64}" class="w-full h-full object-cover">` : '無圖';
  selectedTags = Array.isArray(p.tags) ? [...p.tags] : [];
  renderTagChips();
  window.openModal('product-modal');
};

window.closeAddProductModal = () => window.closeModal('product-modal');

window.submitProductForm = async function () {
  if (isUploadingImage) return alert('⏳ 實拍照正在上傳圖床，請稍候 1 秒！');
  const editId = document.getElementById('editing-prod-id').value;
  const isBM = document.getElementById('chk-channel-bm').checked;
  const isEC = document.getElementById('chk-channel-ec').checked;
  if (!isBM && !isEC) return alert('⚠️ 請至少勾選一個貨品投放渠道！');

  const name = document.getElementById('prod-name').value.trim();
  const price = parseFloat(document.getElementById('prod-price').value);
  if (!name) return alert('請寫明貨品全稱！');
  if (isNaN(price) || price <= 0) return alert('請輸入有效的基礎批發底價！');

  const customAttrs = collectCustomAttrs();
  const minStock = parseInt(document.getElementById('prod-min-stock').value) || 10;

  const payload = {
    tenant_id: currentAgent,
    channel_brick_and_mortar: isBM,
    channel_ecommerce: isEC,
    sales_channel_type: isBM && !isEC ? 'offline' : !isBM && isEC ? 'online' : 'both',
    category_main: document.getElementById('prod-cat-main').value,
    category_sub: document.getElementById('prod-cat-sub').value,
    category_tertiary: document.getElementById('prod-cat-tertiary').value.trim(),
    name,
    barcode: document.getElementById('prod-barcode').value.trim(),
    spec: document.getElementById('prod-spec').value.trim() || '整裝',
    measure_unit: document.getElementById('prod-measure-unit').value.trim() || '箱',
    stock: parseInt(document.getElementById('prod-stock').value) || 0,
    tier_1_price: price,
    tier_2_price: parseFloat(document.getElementById('prod-price-tier2').value) || price,
    trace_code_prefix: document.getElementById('prod-trace-prefix').value.trim() || 'QC-',
    origin_place: document.getElementById('prod-origin-place').value.trim() || '源頭工坊原產',
    image_url: uploadedImageBase64,
    remark: document.getElementById('prod-remark').value.trim(),
    tags: selectedTags,
    custom_specs: { attrs: customAttrs, min_stock: minStock },
    status: 'active'
  };

  let res = editId ? await supabase.from('product').update(payload).eq('id', parseInt(editId)) : await supabase.from('product').insert([payload]);

  if (res.error && (res.error.message || '').includes('custom_specs')) {
    delete payload.custom_specs;
    res = editId ? await supabase.from('product').update(payload).eq('id', parseInt(editId)) : await supabase.from('product').insert([payload]);
  }

  if (res.error) alert('儲存失敗: ' + res.error.message);
  else {
    alert(`🎉 貨品【${name}】已發布生效！`);
    window.closeAddProductModal();
    window.loadHQData();
  }
};

window.handleImageUpload = async function (event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const compressedBase64 = await compressImageFile(file, 600, 0.75);
    document.getElementById('image-preview-box').innerHTML = `<img src="${compressedBase64}" class="w-full h-full object-cover opacity-60">`;

    isUploadingImage = true;
    const submitBtn = document.getElementById('btn-submit-product');
    if (submitBtn) submitBtn.innerText = '⏳ 上傳圖床中...';

    uploadedImageBase64 = await uploadBlobToStorage(compressedBase64, currentAgent, 'products');

    isUploadingImage = false;
    if (submitBtn) submitBtn.innerText = '儲存並發布貨品';
    document.getElementById('image-preview-box').innerHTML = `<img src="${uploadedImageBase64}" class="w-full h-full object-cover">`;
  } catch (e) {
    isUploadingImage = false;
  }
};

window.clearProductImage = () => {
  uploadedImageBase64 = '';
  document.getElementById('image-preview-box').innerHTML = '無圖';
};

window.toggleTag = function (tagStr) {
  selectedTags = selectedTags.includes(tagStr) ? selectedTags.filter((t) => t !== tagStr) : [...selectedTags, tagStr];
  renderTagChips();
};

window.promptAddTag = function () {
  const customTag = prompt('輸入特色營銷標籤（如：#滿十贈一、#新品試銷、#工地專供）：');
  if (customTag && customTag.trim()) {
    const clean = customTag.trim();
    if (!selectedTags.includes(clean)) selectedTags.push(clean);
    renderTagChips();
  }
};

function renderTagChips() {
  const box = document.getElementById('quick-tags-box');
  const defaultChips = ['🔥 街坊搶手', '⏳ 臨期撿漏', '💎 高毛利', '❄️ 需冷藏', '🎁 買十送一'];
  const allUnique = Array.from(new Set([...defaultChips, ...selectedTags]));
  box.innerHTML = allUnique
    .map((t) => {
      const isSel = selectedTags.includes(t);
      return `<button type="button" onclick="window.toggleTag('${t}')" class="${
        isSel ? 'bg-[#1b4332] text-white font-bold border-[#1b4332]' : 'bg-white text-stone-700 border-stone-200'
      } border px-2 py-0.5 rounded-lg text-[10px] transition">${t} ${isSel ? '✓' : ''}</button>`;
    })
    .join('');
}

window.quickEditPrice = function (id, oldPrice) {
  const newPrice = prompt(`【潤色批發底價】原價 ¥${oldPrice}，輸入新底價：`, oldPrice);
  if (newPrice !== null && !isNaN(newPrice) && parseFloat(newPrice) > 0) {
    const p = parseFloat(newPrice);
    if (p < oldPrice * 0.85) {
      window.trigger2FAAction(`底價降幅超 15% (從 ¥${oldPrice} 調至 ¥${p})，請輸入驗證器 6 位動態碼授權：`, async () => {
        await supabase.from('product').update({ tier_1_price: p }).eq('id', id);
        window.loadHQData();
      });
    } else {
      supabase
        .from('product')
        .update({ tier_1_price: p })
        .eq('id', id)
        .then(() => window.loadHQData());
    }
  }
};

window.deleteProduct = function (id, name) {
  window.trigger2FAAction(`確認永久刪除貨品【${name}】？請輸入手機驗證器 6 位動態碼：`, async () => {
    await supabase.from('product').delete().eq('id', id);
    window.loadHQData();
  });
};

// =========================================================================
// 8. 訂單履約、接單自動扣庫與財務點款
// =========================================================================
function renderOrderFulfillmentList() {
  let filtered = allOrders;
  if (activeOrderFilter === 'pending_confirm') filtered = allOrders.filter((o) => (o.order_status === 'pending_confirm' || o.order_status === 'counter_proposal') && !isDirectoryLead(o));
  else if (activeOrderFilter === 'directory_leads') filtered = allOrders.filter((o) => isDirectoryLead(o));
  else if (activeOrderFilter === 'over_credit_pending') filtered = allOrders.filter((o) => o.order_status === 'over_credit_pending');
  else if (activeOrderFilter === 'confirmed') filtered = allOrders.filter((o) => o.order_status === 'confirmed' && o.delivery_status !== 'delivered');
  else if (activeOrderFilter === 'delivered') filtered = allOrders.filter((o) => o.delivery_status === 'delivered');

  const container = document.getElementById('order-fulfillment-list');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">當前分類下暫無單據。</div>';
    return;
  }

  container.innerHTML = filtered
    .map((o) => {
      if (isDirectoryLead(o)) {
        const isConverted = o.order_status === 'lead_converted';
        return `
          <div class="p-4 bg-amber-50/60 border border-amber-300 rounded-3xl space-y-2.5">
            <div class="flex justify-between items-start">
              <div>
                <span class="bg-amber-500 text-stone-950 text-[10px] font-bold px-2 py-0.5 rounded-lg mr-1.5">🤝 供貨商名錄招商線索</span>
                <b class="text-sm text-stone-900">${o.store_name}</b>
                <span class="text-[10px] font-mono bg-stone-200 text-stone-700 px-1.5 rounded ml-1">#${o.order_no || o.id}</span>
              </div>
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${isConverted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200 text-amber-950 animate-pulse'}">
                ${isConverted ? '✓ 已建檔開戶' : '待聯繫送樣'}
              </span>
            </div>
            <div class="bg-white p-3 rounded-2xl border border-amber-200/80 text-xs text-stone-700 leading-relaxed">${o.note || '潛在客戶申請上門送樣洽談'}</div>
            <div class="flex justify-between items-center pt-1 text-xs">
              <span class="text-[10px] text-stone-400 font-mono">提交時間: ${o.created_at ? new Date(o.created_at).toLocaleString() : '剛剛'}</span>
              ${
                isConverted
                  ? '<span class="text-emerald-800 font-bold text-xs">已錄入合作客戶名冊</span>'
                  : `<button onclick="window.convertLeadToStore(${o.id})" class="bg-[#1b4332] hover:bg-[#143628] text-white px-4 py-1.5 rounded-xl font-bold shadow active:scale-95 transition">🏪 一鍵建檔轉為合作客戶</button>`
              }
            </div>
          </div>
        `;
      }

      const isDelivered = o.delivery_status === 'delivered';
      const isPending = o.order_status === 'pending_confirm';
      const isOverCredit = o.order_status === 'over_credit_pending';
      const orderItems = Array.isArray(o.items) ? o.items : [];
      const returnItems = Array.isArray(o.items_return) ? o.items_return : [];
      const exchangeItems = Array.isArray(o.items_exchange) ? o.items_exchange : [];
      const proofs = Array.isArray(o.proof_images) ? o.proof_images : [];
      const netTotal = parseFloat(o.net_settle_amount || o.total_amount || 0);

      return `
        <div class="p-4 bg-stone-50 border ${isOverCredit ? 'border-rose-400 bg-rose-50/30' : isPending ? 'border-amber-300' : 'border-stone-200'} rounded-3xl space-y-2.5">
          <div class="flex justify-between items-start">
            <div>
              <b class="text-sm text-stone-900">${o.store_name}</b>
              <span class="text-[10px] font-mono bg-stone-200 text-stone-700 px-1.5 rounded ml-1">#${o.order_no || o.id}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ml-1 ${
                isDelivered ? 'bg-emerald-100 text-emerald-800' : isOverCredit ? 'bg-rose-600 text-white' : isPending ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'
              }">
                ${isDelivered ? '已核銷交割' : isOverCredit ? '🚨 授信超額待特批' : isPending ? '待確認接單' : '已排單發運'}
              </span>
            </div>
            <span class="font-bold text-xs bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-lg">${o.settlement_type}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2 bg-white p-2.5 rounded-2xl border border-stone-100 text-[11px]">
            <div>新配: ${orderItems.map((i) => `${i.name}x${i.qty}`).join('、') || '無'}</div>
            <div class="text-rose-700">退驗: ${returnItems.map((i) => `${i.name}x${i.qty}`).join('、') || '無'}</div>
            <div class="text-amber-800">對調: ${exchangeItems.map((i) => `${i.name}x${i.qty}`).join('、') || '無'}</div>
          </div>
          ${
            o.note || proofs.length > 0 || o.sign_image_url
              ? `
            <div class="flex items-center justify-between text-[10px] pt-0.5">
              <span class="text-amber-800">${o.note ? `💬 附言: ${o.note}` : ''}</span>
              <div class="flex gap-1 items-center">
                ${proofs.map((src) => `<img src="${src}" class="h-6 w-6 rounded border object-cover cursor-pointer" onclick="window.previewFullImage('${src}')">`).join('')}
                ${o.sign_image_url ? `<img src="${o.sign_image_url}" class="h-6 border bg-white rounded px-1 cursor-pointer" onclick="window.previewFullImage('${o.sign_image_url}')">` : ''}
              </div>
            </div>
          `
              : ''
          }
          <div class="flex justify-between items-center pt-2 border-t border-stone-200/60 text-xs">
            <span class="font-mono text-stone-800 font-bold">淨結: ¥${netTotal.toFixed(2)}</span>
            ${
              isOverCredit
                ? `
              <div class="flex gap-2">
                <button onclick="window.hqRejectOverCredit(${o.id})" class="bg-rose-50 text-rose-700 px-3 py-1.5 rounded-xl border border-rose-200 font-bold">拒絕賒銷</button>
                <button onclick="window.hqApproveOverCredit(${o.id}, ${o.store_id}, ${o.over_credit_amount || 0})" class="bg-emerald-800 text-white px-4 py-1.5 rounded-xl font-bold shadow">🛡️ 2FA特信放行</button>
              </div>
            `
                : isPending
                ? `
              <div class="flex gap-2">
                <button onclick="window.hqRejectWithProposal(${o.id})" class="bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-xl font-bold">建議微調</button>
                <button onclick="window.hqApproveOrder(${o.id})" class="bg-[#1b4332] text-white px-4 py-1.5 rounded-xl font-bold shadow">✅ 應允接單並扣庫</button>
              </div>
            `
                : `<span class="text-stone-400 font-mono">${o.driver_action_instruction || '正常辦理'}</span>`
            }
          </div>
        </div>
      `;
    })
    .join('');
}

window.convertLeadToStore = async function (orderId) {
  const leadOrder = allOrders.find((o) => o.id === orderId);
  if (!leadOrder) return;
  const parts = (leadOrder.settlement_note || '').split('|');
  const contactName = parts[0] || '掌櫃';
  const phone = parts[1] || '';
  const address = parts[2] || '';
  const storeName = leadOrder.store_name || '新簽約客戶';
  if (!confirm(`確認將意向客戶【${storeName}】（${contactName} ${phone}）建檔開戶？`)) return;

  const { error: storeErr } = await supabase.from('store').insert([
    {
      tenant_id: currentAgent,
      name: storeName,
      contact: contactName,
      phone,
      address,
      tags: ['#新簽約'],
      credit_limit: 2000,
      monthly_return_quota: 500,
      current_debt: 0,
      driver_name: '張師傅'
    }
  ]);
  if (storeErr) return alert('建檔開戶失敗：' + storeErr.message);

  await supabase.from('store_order').update({ order_status: 'lead_converted', delivery_status: 'delivered', driver_action_instruction: '【已轉為正式合作客戶】' }).eq('id', orderId);
  alert(`🎉 客戶【${storeName}】已建檔開戶！`);
  window.loadHQData();
  window.switchTab('stores');
};

window.hqApproveOverCredit = function (orderId, storeId, overAmount) {
  window.trigger2FAAction(`特批放行【超額賒銷 ¥${overAmount}】訂單，請輸入驗證器 6 位動態口令：`, async () => {
    await supabase.from('store_order').update({ order_status: 'over_credit_approved', driver_action_instruction: '【主管 2FA 已特批】允許掛賬交割' }).eq('id', orderId);
    window.loadHQData();
  });
};

window.hqRejectOverCredit = async function (orderId) {
  const reason = prompt('輸入拒絕掛賬指令：', '超額授信，請當場收現！');
  if (!reason) return;
  await supabase.from('store_order').update({ order_status: 'over_credit_rejected', driver_action_instruction: `【拒絕掛賬】${reason}` }).eq('id', orderId);
  window.loadHQData();
};

window.hqApproveOrder = async function (orderId) {
  const order = allOrders.find((o) => o.id === orderId);
  let driverCmd = `【發運指令】配發貨品 ${order?.items?.length || 0}項；`;
  if (order?.settlement_type === 'cash') driverCmd += `當面點收現款；`;
  else driverCmd += `按${order?.settlement_type}簽收！`;

  await supabase.from('store_order').update({ order_status: 'confirmed', driver_action_instruction: driverCmd }).eq('id', orderId);
  if (order?.items) {
    await HQService.deductStockForItems(currentAgent, allProducts, order.items, order.order_no || order.id, currentOperatorName);
  }
  alert('✅ 已確認接單並自動扣減對應庫存，已匯入「本車裝車總揀貨單」！');
  window.loadHQData();
};

window.hqRejectWithProposal = async function (orderId) {
  const feedback = prompt('輸入給客戶的修潤建議：');
  if (!feedback || !feedback.trim()) return;
  await supabase.from('store_order').update({ order_status: 'counter_proposal', vendor_feedback: feedback.trim() }).eq('id', orderId);
  window.loadHQData();
};

function renderDriverSettleList(logs) {
  document.getElementById('driver-settle-list').innerHTML =
    logs.length === 0
      ? '<div class="p-6 text-center text-stone-400 text-xs">隨車師傅所收款項已清點入庫，無待交錢款。</div>'
      : logs
          .map(
            (l) => `
          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex justify-between items-center">
            <div>
              <div class="flex items-center gap-1.5 font-bold text-stone-800">
                <span>師傅: ${l.driver_name}</span>
                <span class="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-mono">${l.pay_method}</span>
                <span class="text-xs text-stone-600">從【${l.store_name}】收回</span>
              </div>
              <div class="text-[10px] text-stone-400 mt-0.5 font-mono">交賬時間: ${new Date(l.created_at).toLocaleString()}</div>
            </div>
            <div class="text-right">
              <b class="text-base font-mono text-emerald-900 font-bold block">¥${l.amount}</b>
              <button onclick="window.confirmLogSettled(${l.id}, ${l.amount})" class="text-[10px] bg-[#1b4332] text-white font-bold px-2.5 py-1 rounded-lg active:scale-95 shadow">財務點清入庫</button>
            </div>
          </div>
        `
          )
          .join('');
}

window.confirmLogSettled = function (logId, amount) {
  const amt = parseFloat(amount || 0);
  if (amt >= 3000) {
    window.trigger2FAAction(`大額現金平賬 ¥${amt.toFixed(2)}，請輸入驗證器 6 位動態碼授權：`, async () => {
      await supabase.from('driver_collection_log').update({ settled_to_hq: true }).eq('id', logId);
      window.loadHQData();
    });
  } else {
    if (!confirm('確認已點清該筆隨車錢款入庫？')) return;
    supabase
      .from('driver_collection_log')
      .update({ settled_to_hq: true })
      .eq('id', logId)
      .then(() => window.loadHQData());
  }
};

// =========================================================================
// 9. 屬員四權分立、專供通道與主動配貨
// =========================================================================
function renderSubUsersTable() {
  document.getElementById('subuser-table-body').innerHTML = allSubUsers
    .map((u) => {
      const roles = {
        finance: '賬房財務 (管賬審單 · 不過手現金)',
        warehouse: '倉儲調度 (出入庫盤點發貨 · 不碰錢賬)',
        driver: '供貨師傅 (隨車收款簽收 · 不管總賬)',
        auditor: '獨立稽核 (只讀查看流水)'
      };
      return `
        <tr class="hover:bg-stone-50 transition">
          <td class="p-2.5 font-bold font-mono">${u.account_name}</td>
          <td class="p-2.5 font-bold">${u.real_name}</td>
          <td class="p-2.5 font-medium text-emerald-950">${roles[u.role_code] || u.role_code}</td>
          <td class="p-2.5 font-mono text-stone-500">${u.phone || '-'}</td>
          <td class="p-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${u.is_active ? '在冊當值' : '停用'}</span></td>
          <td class="p-2.5 text-right"><button onclick="window.toggleSubUserActive(${u.id}, ${u.is_active})" class="text-[11px] font-bold text-stone-600 hover:underline">${u.is_active ? '停職' : '復職'}</button></td>
        </tr>
      `;
    })
    .join('');
}

window.openAddSubUserModal = () => {
  document.getElementById('sub-account-input').value = '';
  document.getElementById('sub-name-input').value = '';
  document.getElementById('sub-phone-input').value = '';
  window.openModal('modal-add-subuser');
};

window.saveSubUser = async function () {
  const account_name = document.getElementById('sub-account-input').value.trim();
  const real_name = document.getElementById('sub-name-input').value.trim();
  const role_code = document.getElementById('sub-role-select').value;
  const pwd = document.getElementById('sub-pwd-input').value.trim();
  const phone = document.getElementById('sub-phone-input').value.trim();
  if (!account_name || !real_name || !pwd) return alert('請填全賬號、姓名與密碼！');
  const { error } = await supabase.from('tenant_sub_user').insert([{ tenant_id: currentAgent, account_name, real_name, role_code, password_hash: pwd, phone, is_active: true }]);
  if (error) alert('授任失敗: ' + error.message);
  else {
    window.closeModal('modal-add-subuser');
    window.loadHQData();
  }
};

window.toggleSubUserActive = async function (id, curState) {
  await supabase.from('tenant_sub_user').update({ is_active: !curState }).eq('id', id);
  window.loadHQData();
};

window.openVisibilityModal = function (storeId, storeName, currentJson) {
  currentStoreForVis = storeId;
  document.getElementById('vis-store-title').innerText = `${storeName} (專享通道)`;
  const selected = JSON.parse(currentJson || '[]');
  document.getElementById('vis-checkbox-group').innerHTML = allProducts
    .filter((p) => p.status !== 'inactive')
    .map(
      (p) => `
      <label class="flex justify-between items-center py-2 px-1 cursor-pointer hover:bg-stone-50">
        <div class="flex items-center gap-2"><input type="checkbox" value="${p.id}" ${selected.length === 0 || selected.includes(p.id) ? 'checked' : ''} class="vis-prod-checkbox rounded text-emerald-800"><span class="font-medium text-stone-700">${p.name}</span></div>
        <span class="font-mono text-stone-400">¥${p.tier_1_price}</span>
      </label>
    `
    )
    .join('');
  window.openModal('visibility-modal');
};

window.selectAllVisibility = (status) => document.querySelectorAll('.vis-prod-checkbox').forEach((cb) => (cb.checked = status));

window.saveVisibilitySettings = async function () {
  const checkedBoxes = Array.from(document.querySelectorAll('.vis-prod-checkbox:checked')).map((el) => parseInt(el.value));
  await supabase
    .from('store')
    .update({ visible_product_ids: checkedBoxes.length === allProducts.length ? null : checkedBoxes })
    .eq('id', currentStoreForVis);
  window.closeModal('visibility-modal');
  window.loadHQData();
};

window.reassignDriverPrompt = async function (storeId, currentDriver) {
  const newDriver = prompt(`當前供貨師傅為【${currentDriver}】，輸入新師傅姓名：`, '張師傅');
  if (newDriver && newDriver.trim()) {
    await supabase.from('store').update({ driver_name: newDriver.trim() }).eq('id', storeId);
    window.loadHQData();
  }
};

window.registerNewStore = async function () {
  const shopName = prompt('輸入客戶/門店全稱：');
  if (!shopName || !shopName.trim()) return;
  const phone = prompt('輸入聯繫人 11 位手機號：');
  if (!phone || phone.trim().length < 11) return alert('請輸入有效 11 位手機號！');
  await supabase.from('store').insert([{ tenant_id: currentAgent, name: shopName.trim(), contact: '掌櫃', phone: phone.trim(), credit_limit: 2000, monthly_return_quota: 500, current_debt: 0, driver_name: '張師傅' }]);
  window.loadHQData();
};

window.openPushOrderModal = function () {
  const storeSelect = document.getElementById('push-store-select');
  storeSelect.innerHTML = allStores.map((s) => `<option value="${s.id}">${s.name} (授信餘 ¥${(s.credit_limit || 2000) - (s.current_debt || 0)})</option>`).join('');
  if (allStores.length > 0) window.onPushStoreChange(allStores[0].id);
  document.getElementById('push-products-list').innerHTML = allProducts
    .filter((p) => p.status !== 'inactive')
    .map(
      (p) => `
      <div class="flex justify-between items-center py-1 border-b border-stone-50">
        <span class="text-stone-700">${p.name} (¥${p.tier_1_price}/${p.measure_unit || '件'} · 存${p.stock ?? 0})</span>
        <input type="number" min="0" value="0" id="push-qty-${p.id}" class="w-16 bg-stone-50 border border-stone-200 rounded px-1.5 py-0.5 text-center font-bold font-mono">
      </div>
    `
    )
    .join('');
  window.openModal('push-modal');
};

window.onPushStoreChange = function (storeId) {
  const s = allStores.find((x) => x.id === parseInt(storeId));
  if (s) {
    document.getElementById('push-driver-name').value = s.driver_name || '張師傅';
    if (s.default_settlement) document.getElementById('push-settlement-select').value = s.default_settlement;
  }
};

window.submitVendorPushOrder = async function () {
  const storeId = parseInt(document.getElementById('push-store-select').value);
  const store = allStores.find((s) => s.id === storeId);
  const settlement = document.getElementById('push-settlement-select').value;
  const driver = document.getElementById('push-driver-name').value.trim() || '張師傅';
  const note = document.getElementById('push-note-input').value.trim();

  const items = [];
  let totalAmount = 0;
  for (const p of allProducts) {
    const qty = parseInt(document.getElementById(`push-qty-${p.id}`)?.value || '0');
    if (qty > 0) {
      items.push({ id: p.id, name: p.name, spec: p.spec, measure_unit: p.measure_unit, price: p.tier_1_price, qty });
      totalAmount += p.tier_1_price * qty;
    }
  }
  if (items.length === 0) return alert('請至少挑選 1 樣貨品！');

  const orderNo = `PS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
  const { error } = await supabase.from('store_order').insert([
    {
      order_no: orderNo,
      tenant_id: currentAgent,
      store_id: storeId,
      store_name: store.name,
      driver_name: driver,
      order_source: 'vendor_push',
      settlement_type: settlement,
      settlement_note: note,
      items,
      items_return: [],
      items_exchange: [],
      total_amount: totalAmount,
      return_amount: 0,
      net_settle_amount: totalAmount,
      order_status: 'confirmed',
      delivery_status: 'ordered',
      note: `[廠家主動配貨] ${note}`,
      driver_action_instruction: `【主動配貨】核驗交付 ${items.length}項`
    }
  ]);
  if (error) alert('配發失敗: ' + error.message);
  else {
    await HQService.deductStockForItems(currentAgent, allProducts, items, orderNo, currentOperatorName);
    alert('✅ 主動配貨單已生成並自動扣庫，已匯入「本車裝車總揀貨單」！');
    window.closeModal('push-modal');
    window.loadHQData();
  }
};

window.filterProductByTag = function (tag) {
  activeProdFilter = tag;
  renderProductFilterBar();
  renderProductTable();
};

window.filterStoreByTag = function (tag) {
  activeStoreFilter = tag;
  renderStoreFilterBar();
  renderStoreTable();
};

window.filterOrderStatus = function (status) {
  activeOrderFilter = status;
  ['pending', 'leads', 'over-credit', 'confirmed', 'delivered', 'all'].forEach((k) => {
    const btn = document.getElementById(`order-filter-${k}`);
    if (btn) {
      const isMatch =
        k === status ||
        (status === 'pending_confirm' && k === 'pending') ||
        (status === 'directory_leads' && k === 'leads') ||
        (status === 'over_credit_pending' && k === 'over-credit');
      btn.className = isMatch ? 'px-3 py-1.5 rounded-xl bg-[#1b4332] text-white font-bold transition' : 'px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 hover:bg-stone-200 font-bold transition';
    }
  });
  renderOrderFulfillmentList();
};

window.triggerBarcodeScan = async function () {
  const code = prompt('請用掃碼槍掃入或鍵入商品/物料條碼：');
  if (code && code.trim()) document.getElementById('prod-barcode').value = code.trim();
};
window.stopBarcodeScan = () => window.closeModal('scanner-modal');

window.previewFullImage = function (url) {
  const w = window.open('');
  w.document.write(`<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${url}" style="max-width:90%;max-height:90%;border-radius:16px;"></body>`);
};

export async function initHQController() {
  const isAuthed = await checkHQAuthStatus();
  if (isAuthed) {
    window.loadHQData();
  }
}
