/**
 * 百工百业 · 五端统一协同与跨端桥接引擎（门店智能定价毛利看板 · 熟客赊账本 · 多品接龙海报 · 双模式扫码收银）
 * 覆盖：index.html (门店工作台) / driver.html (送货与上门) / mall.html / suppliers.html (逛大集)
 */
import { supabase } from '../../lib/supabase.js';
import { getTenantLexicon } from './silentMemoryAndLexicon.js';

function getUrlParams() {
  return new URLSearchParams(window.location.search);
}

function generateMobileVoucherNo(prefix = 'CK') {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${ymd}-${rnd}`;
}

function getSavedContactProfile() {
  try {
    return JSON.parse(localStorage.getItem('baigong_saved_contact_profile') || '{}');
  } catch {
    return {};
  }
}

function saveContactProfile(patch = {}) {
  try {
    const prev = getSavedContactProfile();
    const next = { ...prev };
    Object.keys(patch).forEach((k) => {
      if (patch[k] && String(patch[k]).trim()) next[k] = String(patch[k]).trim();
    });
    localStorage.setItem('baigong_saved_contact_profile', JSON.stringify(next));
  } catch {
    // 忽略隐私模式存储限制
  }
}

function showWeChatPinGuideIfFirstTime() {
  if (localStorage.getItem('baigong_wechat_pin_dismissed') === '1') return;
  if (document.getElementById('baigong-wechat-pin-tip')) return;
  const tip = document.createElement('div');
  tip.id = 'baigong-wechat-pin-tip';
  tip.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-40 max-w-sm w-[92%] bg-stone-900/95 text-white px-3.5 py-2 rounded-2xl shadow-lg flex items-center justify-between gap-2 text-[11px] border border-stone-700';
  tip.innerHTML = `
    <span>💡 点微信右上角 <b>【···】→【浮窗】</b>，下次像微信一样一点就开</span>
    <button type="button" id="btn-close-wechat-pin-tip" class="text-amber-300 font-bold shrink-0 px-1.5">知道了</button>
  `;
  document.body.appendChild(tip);
  document.getElementById('btn-close-wechat-pin-tip')?.addEventListener('click', () => {
    localStorage.setItem('baigong_wechat_pin_dismissed', '1');
    tip.remove();
  });
}

/**
 * 其余三端（driver / mall / suppliers）一体式商号门头身份切换栏（不再对 index.html 重复注入）
 */
function mountMobileQuickRoleSwitchDock(currentFile) {
  if (currentFile === 'index.html') return;
  if (document.getElementById('baigong-mobile-role-dock')) return;
  const items = [
    { file: 'hq.html', label: '批发与调度' },
    { file: 'index.html', label: '门店工作台' },
    { file: 'driver.html', label: '送货与上门' },
    { file: 'mall.html', label: '逛大集' }
  ];

  const greenHeader =
    document.querySelector('header') ||
    Array.from(document.querySelectorAll('div')).find((el) => {
      const cls = String(el.className || '');
      return (cls.includes('bg-[#1b4332]') || cls.includes('bg-emerald-9') || cls.includes('bg-green-9')) && el.offsetHeight > 70;
    });

  const barWrap = document.createElement('div');
  barWrap.id = 'baigong-mobile-role-dock';
  const isWideHeader = greenHeader && greenHeader.offsetWidth > 768;

  barWrap.innerHTML = `
    <div class="bg-[#0f291e]/85 p-1 rounded-xl grid grid-cols-4 gap-1 text-xs text-center min-w-[280px]">
      ${items
        .map((it) => {
          const isActive = currentFile === it.file || (currentFile === 'suppliers.html' && it.file === 'mall.html');
          return `<a href="${it.file}" class="py-1 px-2 rounded-lg font-bold tracking-wide whitespace-nowrap transition ${
            isActive
              ? 'bg-amber-300 text-emerald-950 shadow-2xs'
              : 'text-emerald-100/80 hover:text-white hover:bg-emerald-800/40'
          }">${it.label}</a>`;
        })
        .join('')}
    </div>
  `;

  if (greenHeader) {
    if (isWideHeader) {
      const topFlexRow = greenHeader.querySelector('.flex.items-center.justify-between, .flex.justify-between');
      if (topFlexRow && topFlexRow.children.length >= 2) {
        barWrap.className = 'mx-auto';
        topFlexRow.insertBefore(barWrap, topFlexRow.children[1]);
        return;
      }
    }
    greenHeader.style.borderTopLeftRadius = '0px';
    greenHeader.style.borderTopRightRadius = '0px';
    greenHeader.style.marginTop = '0px';
    barWrap.className = 'w-full bg-[#143628] border-b border-emerald-800/70 px-3 py-1.5 rounded-t-3xl mx-auto';
    if (greenHeader.parentElement) {
      const mw = getComputedStyle(greenHeader).maxWidth;
      if (mw && mw !== 'none') barWrap.style.maxWidth = mw;
    }
    greenHeader.insertAdjacentElement('beforebegin', barWrap);
  } else {
    barWrap.className = 'w-full bg-[#1b4332] py-1.5 px-3 flex justify-center';
    document.body.insertAdjacentElement('afterbegin', barWrap);
  }
}

function openBridgeSheetModal({ id, title, subtitle, bodyHtml, confirmText, onConfirm, hideFooter = false }) {
  document.getElementById(id)?.remove();
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto';
  wrap.innerHTML = `
    <div class="bg-white border border-stone-200 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 space-y-3.5 shadow-2xl text-xs my-auto">
      <div class="flex justify-between items-start border-b border-stone-100 pb-2.5">
        <div>
          <b class="text-base text-stone-900 block">${title}</b>
          ${subtitle ? `<span class="text-[11px] text-stone-500 mt-0.5 block">${subtitle}</span>` : ''}
        </div>
        <button type="button" id="${id}-close" class="w-7 h-7 rounded-full bg-stone-100 text-stone-500 hover:text-stone-900 font-bold flex items-center justify-center shrink-0">✕</button>
      </div>
      <div class="space-y-3">${bodyHtml}</div>
      ${
        hideFooter
          ? ''
          : `<div class="flex gap-2 pt-1">
               <button type="button" id="${id}-cancel" class="flex-1 py-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold">取消</button>
               <button type="button" id="${id}-submit" class="flex-2 py-2.5 px-5 rounded-2xl bg-[#1b4332] hover:bg-[#143628] text-amber-300 font-bold shadow">${confirmText || '确认提交'}</button>
             </div>`
      }
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  document.getElementById(`${id}-close`)?.addEventListener('click', close);
  document.getElementById(`${id}-cancel`)?.addEventListener('click', close);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) close();
  });
  if (!hideFooter && onConfirm) {
    document.getElementById(`${id}-submit`)?.addEventListener('click', async () => {
      await onConfirm(close);
    });
  }
}

/**
 * =========================================================================
 * 门店智能定价、收银、毛利看板、熟客赊账本与多品接龙海报存储引擎
 * =========================================================================
 */
const POS_PAYCODE_KEY = 'baigong_store_pos_paycode_v1';
const POS_LEDGER_KEY = 'baigong_store_pos_ledger_v1';
const POS_BARCODE_DB_KEY = 'baigong_store_barcode_memory_v1';
const POS_RETAIL_OVERRIDE_KEY = 'baigong_store_retail_price_overrides_v1';
const POS_MARKUP_RATE_KEY = 'baigong_store_default_markup_rate_v1';
const POS_CREDIT_BOOK_KEY = 'baigong_store_credit_customers_v1';

let cachedSupplierCatalog = [];

function readPosPaycodeConfig() {
  try {
    return JSON.parse(localStorage.getItem(POS_PAYCODE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writePosPaycodeConfig(cfg) {
  localStorage.setItem(POS_PAYCODE_KEY, JSON.stringify(cfg));
}

function readPosLedgerList() {
  try {
    return JSON.parse(localStorage.getItem(POS_LEDGER_KEY) || '[]');
  } catch {
    return [];
  }
}

function writePosLedgerList(list) {
  localStorage.setItem(POS_LEDGER_KEY, JSON.stringify(list));
}

function readBarcodeMemoryDb() {
  try {
    return JSON.parse(localStorage.getItem(POS_BARCODE_DB_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeBarcodeMemoryDb(db) {
  localStorage.setItem(POS_BARCODE_DB_KEY, JSON.stringify(db));
}

function readRetailPriceOverrides() {
  try {
    return JSON.parse(localStorage.getItem(POS_RETAIL_OVERRIDE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeRetailPriceOverrides(map) {
  localStorage.setItem(POS_RETAIL_OVERRIDE_KEY, JSON.stringify(map));
}

function getDefaultMarkupRate() {
  const val = parseFloat(localStorage.getItem(POS_MARKUP_RATE_KEY) || '1.25');
  return isNaN(val) || val < 1 ? 1.25 : val;
}

function setDefaultMarkupRate(rate) {
  const clean = Math.max(1, Number(parseFloat(rate || '1.25').toFixed(2)));
  localStorage.setItem(POS_MARKUP_RATE_KEY, String(clean));
  return clean;
}

function readStoreCreditBook() {
  try {
    return JSON.parse(localStorage.getItem(POS_CREDIT_BOOK_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeStoreCreditBook(list) {
  localStorage.setItem(POS_CREDIT_BOOK_KEY, JSON.stringify(list));
}

/**
 * 智能三层零售价计算（优先级：1.掌柜单品微调记忆价 > 2.条码记忆库价格 > 3.进货价 × 默认加价率）
 */
function resolveSmartRetailPrice(itemName, costPrice = 0, barcode = '') {
  const cleanName = String(itemName || '').trim();
  const overrides = readRetailPriceOverrides();
  if (cleanName && overrides[cleanName] && Number(overrides[cleanName].retailPrice) > 0) {
    return {
      retailPrice: Number(overrides[cleanName].retailPrice),
      costPrice: Number(overrides[cleanName].costPrice || costPrice || 0),
      isCustomTuned: true
    };
  }
  if (barcode) {
    const bdb = readBarcodeMemoryDb();
    if (bdb[barcode] && Number(bdb[barcode].price) > 0) {
      return {
        retailPrice: Number(bdb[barcode].price),
        costPrice: Number(bdb[barcode].costPrice || costPrice || 0),
        isCustomTuned: true
      };
    }
  }
  const cPrice = Number(costPrice || 0);
  if (cPrice > 0) {
    const rate = getDefaultMarkupRate();
    const calc = Number((cPrice * rate).toFixed(1));
    return { retailPrice: calc, costPrice: cPrice, isCustomTuned: false };
  }
  return { retailPrice: 0, costPrice: 0, isCustomTuned: false };
}

/**
 * 同步刷新顶栏今日收银/盈利提示 与 熟客赊账徽标
 */
function refreshStoreHeaderLiveStats() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const allRows = readPosLedgerList();
  const todayValid = allRows.filter((r) => !r.voided && String(r.createdAt || '').startsWith(todayStr));
  const todayTotal = todayValid.reduce((s, r) => s + Number(r.amount || 0), 0);
  const todayProfit = todayValid.reduce((s, r) => s + Number(r.profit || 0), 0);

  const liveBadge = document.getElementById('header-live-profit-badge');
  if (liveBadge) {
    liveBadge.innerText = `今日收 ¥${todayTotal.toFixed(0)} · 赚 ¥${todayProfit.toFixed(0)} ▸`;
  }

  const creditList = readStoreCreditBook();
  const totalUnpaid = creditList.reduce((s, c) => s + Math.max(0, Number(c.balance || 0)), 0);
  const debtBadge = document.getElementById('menu-credit-debt-badge');
  if (debtBadge) {
    if (totalUnpaid > 0) {
      debtBadge.innerText = `¥${totalUnpaid.toFixed(0)}`;
      debtBadge.classList.remove('hidden');
    } else {
      debtBadge.classList.add('hidden');
    }
  }
}

/**
 * 绑定门店全套智能收银、经营毛利看板、熟客赊账本、单品调价与多品接龙海报交互
 */
function bindNativeStoreCounterPosBindings() {
  let cameraStream = null;
  let selectedPayMethod = '微信/支付宝';
  let currentEntryMode = 'scan'; // 'scan' | 'manual'
  let scannedBasket = []; // [{ key, barcode, name, costPrice, retailPrice, qty, isCustomTuned }]

  window.stopStorePosCamera = function () {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    const vid = document.getElementById('pos-barcode-video');
    vid?.classList.add('hidden');
    const toggleBtn = document.getElementById('btn-toggle-pos-cam');
    if (toggleBtn) toggleBtn.innerText = '开启相机连扫';
  };

  window.closeStoreCounterPosModal = function () {
    window.stopStorePosCamera();
    document.getElementById('modal-store-counter-pos')?.classList.add('hidden');
  };

  window.switchStorePosTab = function (tabName) {
    window.stopStorePosCamera();
    ['collect', 'qr', 'summary'].forEach((k) => {
      const btn = document.getElementById(`pos-tab-${k}`);
      const panel = document.getElementById(`pos-panel-${k}`);
      if (btn) {
        btn.className =
          k === tabName
            ? 'py-1.5 rounded-xl bg-[#1b4332] text-amber-300 shadow-2xs'
            : 'py-1.5 rounded-xl text-stone-700';
      }
      if (panel) panel.classList.toggle('hidden', k !== tabName);
    });
  };

  window.setStorePosEntryMode = function (mode) {
    currentEntryMode = mode;
    const scanBtn = document.getElementById('pos-mode-scan-btn');
    const manualBtn = document.getElementById('pos-mode-manual-btn');
    const scanArea = document.getElementById('pos-scan-mode-area');
    const manualArea = document.getElementById('pos-manual-mode-area');
    if (mode === 'scan') {
      if (scanBtn) scanBtn.className = 'py-1.5 px-2 rounded-xl bg-amber-400 text-stone-950 shadow-2xs flex items-center justify-center gap-1';
      if (manualBtn) manualBtn.className = 'py-1.5 px-2 rounded-xl text-stone-700 flex items-center justify-center gap-1';
      scanArea?.classList.remove('hidden');
      manualArea?.classList.add('hidden');
      recalcScannedBasketTotals();
    } else {
      window.stopStorePosCamera();
      if (manualBtn) manualBtn.className = 'py-1.5 px-2 rounded-xl bg-amber-400 text-stone-950 shadow-2xs flex items-center justify-center gap-1';
      if (scanBtn) scanBtn.className = 'py-1.5 px-2 rounded-xl text-stone-700 flex items-center justify-center gap-1';
      manualArea?.classList.remove('hidden');
      scanArea?.classList.add('hidden');
      window.refreshStorePosRoundBtn();
    }
  };

  function recalcScannedBasketTotals() {
    const amtInput = document.getElementById('pos-collect-amt');
    const profitHint = document.getElementById('pos-est-profit-hint');
    if (currentEntryMode === 'scan') {
      const sumRetail = scannedBasket.reduce((s, it) => s + it.retailPrice * it.qty, 0);
      const sumCost = scannedBasket.reduce((s, it) => s + it.costPrice * it.qty, 0);
      if (amtInput) amtInput.value = sumRetail > 0 ? sumRetail.toFixed(2) : '';
      const estProfit = sumCost > 0 ? sumRetail - sumCost : sumRetail * (1 - 1 / getDefaultMarkupRate());
      if (profitHint) profitHint.innerText = `预计毛利 ¥${Math.max(0, estProfit).toFixed(2)}`;
    }
    window.refreshStorePosRoundBtn();
  }

  function renderScannedBasketList() {
    const host = document.getElementById('pos-scanned-basket-list');
    if (!host) return;
    if (scannedBasket.length === 0) {
      host.innerHTML = '<div class="text-center text-stone-400 py-3 text-[11px]">开启相机扫商品条码，或点上方热卖商品胶囊自动计价</div>';
      recalcScannedBasketTotals();
      return;
    }
    host.innerHTML = scannedBasket
      .map(
        (it, idx) => `
        <div class="bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <b class="text-stone-900 truncate block">${it.name}</b>
            <div class="flex items-center gap-1.5 text-[10px] text-stone-500">
              <span>进价 ¥${it.costPrice.toFixed(2)}</span>
              <span>·</span>
              <button type="button" onclick="window.tuneScannedItemRetailPrice(${idx})" class="text-emerald-800 font-bold underline">
                零售 ¥${it.retailPrice.toFixed(2)} ${it.isCustomTuned ? '(已锁定)' : '(点此微调)'}
              </button>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0 font-mono">
            <button type="button" onclick="window.changeScannedItemQty(${idx}, -1)" class="w-6 h-6 rounded-lg bg-stone-100 font-bold text-stone-700">-</button>
            <b class="w-6 text-center text-xs">${it.qty}</b>
            <button type="button" onclick="window.changeScannedItemQty(${idx}, 1)" class="w-6 h-6 rounded-lg bg-emerald-100 font-bold text-emerald-950">+</button>
          </div>
        </div>`
      )
      .join('');
    recalcScannedBasketTotals();
  }

  window.changeScannedItemQty = function (idx, delta) {
    if (!scannedBasket[idx]) return;
    scannedBasket[idx].qty += delta;
    if (scannedBasket[idx].qty <= 0) scannedBasket.splice(idx, 1);
    renderScannedBasketList();
  };

  window.tuneScannedItemRetailPrice = function (idx) {
    const it = scannedBasket[idx];
    if (!it) return;
    const raw = prompt(`微调【${it.name}】零售单价（当前进价 ¥${it.costPrice.toFixed(2)}，修改后永久记住）：`, String(it.retailPrice));
    if (raw === null) return;
    const nextPrice = parseFloat(raw);
    if (isNaN(nextPrice) || nextPrice < 0) return alert('请输入有效零售价格！');

    it.retailPrice = Number(nextPrice.toFixed(2));
    it.isCustomTuned = true;
    const overrides = readRetailPriceOverrides();
    overrides[it.name] = { retailPrice: it.retailPrice, costPrice: it.costPrice };
    writeRetailPriceOverrides(overrides);

    if (it.barcode) {
      const bdb = readBarcodeMemoryDb();
      bdb[it.barcode] = { name: it.name, price: it.retailPrice, costPrice: it.costPrice };
      writeBarcodeMemoryDb(bdb);
    }
    renderScannedBasketList();
  };

  function pushProductToScannedBasket({ name, costPrice = 0, barcode = '' }) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    const resolved = resolveSmartRetailPrice(cleanName, costPrice, barcode);
    const hitIdx = scannedBasket.findIndex((x) => x.name === cleanName);
    if (hitIdx >= 0) {
      scannedBasket[hitIdx].qty += 1;
    } else {
      scannedBasket.unshift({
        barcode,
        name: cleanName,
        costPrice: resolved.costPrice,
        retailPrice: resolved.retailPrice,
        qty: 1,
        isCustomTuned: resolved.isCustomTuned
      });
    }
    if (currentEntryMode !== 'scan') window.setStorePosEntryMode('scan');
    else renderScannedBasketList();
  }

  function renderHotItemQuickChips() {
    const host = document.getElementById('pos-hot-items-chips');
    if (!host) return;
    const ledger = readPosLedgerList().filter((r) => !r.voided);
    const freqMap = {};
    ledger.forEach((r) => {
      if (r.itemDesc && r.itemDesc !== '柜台零售') {
        freqMap[r.itemDesc] = (freqMap[r.itemDesc] || 0) + 1;
      }
    });
    const hotNames = Object.keys(freqMap)
      .sort((a, b) => freqMap[b] - freqMap[a])
      .slice(0, 4);

    // 补充货架前几款商品作为默认快捷胶囊
    const catalogExtras = (cachedSupplierCatalog || [])
      .map((p) => p.name)
      .filter((n) => n && !hotNames.includes(n))
      .slice(0, Math.max(0, 5 - hotNames.length));

    const chips = [...hotNames, ...catalogExtras];
    if (chips.length === 0) {
      host.innerHTML = '';
      return;
    }
    host.innerHTML = chips
      .map((n) => {
        const prod = (cachedSupplierCatalog || []).find((p) => p.name === n);
        const cost = parseFloat(prod?.tier_1_price || 0);
        const info = resolveSmartRetailPrice(n, cost);
        return `<button type="button" onclick="window.quickPickHotItemToPos('${String(n).replace(/'/g, '')}', ${cost})" class="bg-stone-100 hover:bg-amber-100 text-stone-800 border border-stone-200 px-2.5 py-1 rounded-xl whitespace-nowrap text-[10px] font-bold shrink-0">
          + ${n}${info.retailPrice > 0 ? ` ¥${info.retailPrice}` : ''}
        </button>`;
      })
      .join('');
  }

  window.quickPickHotItemToPos = function (name, costPrice) {
    pushProductToScannedBasket({ name, costPrice });
  };

  window.refreshStorePosRoundBtn = function () {
    const amtInput = document.getElementById('pos-collect-amt');
    const roundBtn = document.getElementById('btn-pos-round-down');
    const profitHint = document.getElementById('pos-est-profit-hint');
    const val = parseFloat(amtInput?.value || '0');
    if (currentEntryMode === 'manual' && profitHint) {
      const rate = getDefaultMarkupRate();
      const est = val > 0 ? val * (1 - 1 / rate) : 0;
      profitHint.innerText = `预计毛利 ¥${est.toFixed(2)}`;
    }
    const fl = Math.floor(val);
    if (roundBtn) {
      if (val > fl && fl > 0) {
        roundBtn.innerText = `✂️ 抹零收 ¥${fl}`;
        roundBtn.classList.remove('hidden');
      } else {
        roundBtn.classList.add('hidden');
      }
    }
  };

  window.applyStorePosRoundDown = function () {
    const amtInput = document.getElementById('pos-collect-amt');
    const fl = Math.floor(parseFloat(amtInput?.value || '0'));
    if (fl > 0 && amtInput) {
      amtInput.value = fl.toFixed(2);
      document.getElementById('btn-pos-round-down')?.classList.add('hidden');
    }
  };

  window.pressStorePosKey = function (k) {
    const amtInput = document.getElementById('pos-collect-amt');
    if (!amtInput) return;
    if (k === '清空') amtInput.value = '';
    else if (k === '退格') amtInput.value = String(amtInput.value || '').slice(0, -1);
    else if (k === '+10') amtInput.value = (parseFloat(amtInput.value || '0') + 10).toFixed(2);
    else if (k === '+50') amtInput.value = (parseFloat(amtInput.value || '0') + 50).toFixed(2);
    else amtInput.value = String(amtInput.value || '') + k;
    window.refreshStorePosRoundBtn();
  };

  window.selectStorePosMethod = function (btnEl, methodName) {
    selectedPayMethod = methodName;
    document.querySelectorAll('.pos-method-btn').forEach((b) => {
      b.className = 'pos-method-btn border border-stone-200 bg-stone-50 text-stone-700 rounded-xl py-2 text-center';
    });
    if (btnEl) {
      btnEl.className = 'pos-method-btn border border-emerald-600 bg-emerald-50 text-emerald-950 rounded-xl py-2 text-center';
    }
    const creditBox = document.getElementById('pos-credit-customer-box');
    if (methodName === '熟客记账') {
      const dl = document.getElementById('pos-saved-customers-list');
      if (dl) {
        dl.innerHTML = readStoreCreditBook()
          .map((c) => `<option value="${c.name}">`)
          .join('');
      }
      creditBox?.classList.remove('hidden');
    } else {
      creditBox?.classList.add('hidden');
    }
  };

  const handleRecognizedBarcodeOrQuery = (rawCodeOrName) => {
    const query = String(rawCodeOrName || '').trim();
    if (!query) return;

    // 1. 先查条码记忆库
    const db = readBarcodeMemoryDb();
    if (db[query]) {
      const hit = db[query];
      pushProductToScannedBasket({ name: hit.name, costPrice: hit.costPrice || 0, barcode: query });
      return;
    }

    // 2. 再按商品名称模糊匹配供货商货架目录（自动按进货价 × 加价率出零售价）
    const matchedCatalog = (cachedSupplierCatalog || []).find(
      (p) => p.name && (p.name.includes(query) || query.includes(p.name))
    );
    if (matchedCatalog) {
      pushProductToScannedBasket({
        name: matchedCatalog.name,
        costPrice: parseFloat(matchedCatalog.tier_1_price || 0),
        barcode: /^\d{6,}$/.test(query) ? query : ''
      });
      if (/^\d{6,}$/.test(query)) {
        const info = resolveSmartRetailPrice(matchedCatalog.name, parseFloat(matchedCatalog.tier_1_price || 0));
        db[query] = { name: matchedCatalog.name, price: info.retailPrice, costPrice: info.costPrice };
        writeBarcodeMemoryDb(db);
      }
      return;
    }

    // 3. 首次遇到的全新条码或商品：建档一次，永久记忆
    window.stopStorePosCamera();
    const isBarcodeDigits = /^\d{5,}$/.test(query);
    const prodName = isBarcodeDigits
      ? prompt(`首次扫到条码【${query}】，请输入商品名称（下次扫码自动出价）：`)
      : query;
    if (!prodName || !prodName.trim()) return;

    const rate = getDefaultMarkupRate();
    const retailStr = prompt(`请输入【${prodName.trim()}】的零售单价（元）：`, '');
    if (retailStr === null) return;
    const retailVal = parseFloat(retailStr || '0');
    const estCost = retailVal > 0 ? Number((retailVal / rate).toFixed(2)) : 0;

    if (isBarcodeDigits) {
      db[query] = { name: prodName.trim(), price: isNaN(retailVal) ? 0 : retailVal, costPrice: estCost };
      writeBarcodeMemoryDb(db);
    }
    const overrides = readRetailPriceOverrides();
    if (retailVal > 0) {
      overrides[prodName.trim()] = { retailPrice: retailVal, costPrice: estCost };
      writeRetailPriceOverrides(overrides);
    }
    pushProductToScannedBasket({
      name: prodName.trim(),
      costPrice: estCost,
      barcode: isBarcodeDigits ? query : ''
    });
  };

  window.lookupManualStoreBarcode = function () {
    const inp = document.getElementById('pos-manual-barcode');
    const code = inp?.value.trim();
    if (code) {
      inp.value = '';
      handleRecognizedBarcodeOrQuery(code);
    }
  };

  window.toggleStorePosCamera = async function () {
    if (cameraStream) {
      window.stopStorePosCamera();
      return;
    }
    const video = document.getElementById('pos-barcode-video');
    const toggleBtn = document.getElementById('btn-toggle-pos-cam');
    if (!navigator.mediaDevices?.getUserMedia || !video) {
      return alert('当前浏览器不支持直接调用摄像头，可直接在下方输入框扫码或输品名添加。');
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = cameraStream;
      video.classList.remove('hidden');
      if (toggleBtn) toggleBtn.innerText = '关闭相机';

      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] });
        let lastScanCode = '';
        let lastScanTs = 0;
        const scanTimer = setInterval(async () => {
          if (!cameraStream) return clearInterval(scanTimer);
          try {
            const codes = await detector.detect(video);
            const rawVal = codes?.[0]?.rawValue;
            if (rawVal) {
              const now = Date.now();
              // 1.8秒冷却防连扫重复误触
              if (rawVal === lastScanCode && now - lastScanTs < 1800) return;
              lastScanCode = rawVal;
              lastScanTs = now;
              handleRecognizedBarcodeOrQuery(rawVal);
            }
          } catch {
            // 忽略单帧识别波动
          }
        }, 450);
      }
    } catch {
      alert('未获取到相机权限，请使用下方输入框扫描或输入商品名称。');
    }
  };

  function renderStorePosModalState() {
    const storeName = (document.getElementById('store-title')?.innerText || getSavedContactProfile().storeName || '本店柜台').trim();
    const payCfg = readPosPaycodeConfig();
    const todayStr = new Date().toISOString().slice(0, 10);
    const allRows = readPosLedgerList();
    const todayValid = allRows.filter((r) => !r.voided && String(r.createdAt || '').startsWith(todayStr));
    const todayTotal = todayValid.reduce((s, r) => s + Number(r.amount || 0), 0);
    const todayActualPaid = todayValid
      .filter((r) => r.method !== '熟客记账')
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const todayProfit = todayValid.reduce((s, r) => s + Number(r.profit || 0), 0);

    const countBadge = document.getElementById('pos-today-count-badge');
    if (countBadge) countBadge.innerText = String(todayValid.length);
    const sumTotalEl = document.getElementById('pos-sum-total');
    if (sumTotalEl) sumTotalEl.innerText = `¥${todayTotal.toFixed(2)}`;
    const sumDigEl = document.getElementById('pos-sum-digital');
    if (sumDigEl) sumDigEl.innerText = `¥${todayActualPaid.toFixed(2)}`;
    const sumProfitEl = document.getElementById('pos-sum-profit');
    if (sumProfitEl) sumProfitEl.innerText = `+¥${todayProfit.toFixed(2)}`;

    const rowsHost = document.getElementById('pos-ledger-rows-container');
    if (rowsHost) {
      rowsHost.innerHTML =
        allRows.slice(0, 20).length === 0
          ? '<p class="text-center text-stone-400 py-4">今日暂无柜台零售流水</p>'
          : allRows
              .slice(0, 20)
              .map(
                (r) => `
              <div class="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 ${r.voided ? 'opacity-50 line-through' : ''}">
                <div class="min-w-0 pr-2">
                  <b class="text-stone-800 truncate block">${r.itemDesc}</b>
                  <span class="text-[10px] text-stone-500 block">${String(r.createdAt || '').slice(11, 16)} · ${r.method}${r.customerName ? ` (${r.customerName})` : ''} · 毛利 ¥${Number(r.profit || 0).toFixed(2)}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <b class="font-mono text-emerald-950">¥${Number(r.amount || 0).toFixed(2)}</b>
                  ${
                    r.voided
                      ? '<span class="text-[10px] text-rose-600 font-bold">已作废</span>'
                      : `<button type="button" onclick="window.voidStorePosEntry(${r.id})" class="text-[10px] text-rose-600 underline">作废</button>`
                  }
                </div>
              </div>`
              )
              .join('');
    }

    const hasWx = !!payCfg.wxQr;
    const hasAli = !!payCfg.aliQr;
    const hasLinkedUrl = !!payCfg.linkedCodeText;
    const hasAnyCode = hasWx || hasAli || hasLinkedUrl;

    const verifiedCard = document.getElementById('pos-qr-verified-card');
    const emptyTip = document.getElementById('pos-qr-empty-tip');
    const editor = document.getElementById('pos-paycode-editor');
    const ownerLbl = document.getElementById('pos-qr-owner-label');
    const switchBtns = document.getElementById('pos-qr-switch-btns');
    const stage = document.getElementById('pos-qr-display-stage');
    const linkInput = document.getElementById('pos-link-qr-input');
    if (linkInput && payCfg.linkedCodeText) linkInput.value = payCfg.linkedCodeText;

    if (hasAnyCode) {
      verifiedCard?.classList.remove('hidden');
      emptyTip?.classList.add('hidden');
      editor?.classList.add('hidden');
      if (ownerLbl) ownerLbl.innerText = `🔒 已核验归属：${storeName}`;
      if (switchBtns) {
        switchBtns.innerHTML = [
          hasWx ? '<button type="button" onclick="window.showStoreQrStage(\'wx\')" class="bg-emerald-700 text-white font-bold px-3 py-1 rounded-xl text-[11px]">💚 微信收款码</button>' : '',
          hasAli ? '<button type="button" onclick="window.showStoreQrStage(\'ali\')" class="bg-sky-600 text-white font-bold px-3 py-1 rounded-xl text-[11px]">💙 支付宝收款码</button>' : '',
          hasLinkedUrl ? '<button type="button" onclick="window.showStoreQrStage(\'link\')" class="bg-amber-500 text-stone-950 font-bold px-3 py-1 rounded-xl text-[11px]">🔗 关联收款码</button>' : ''
        ].join('');
      }
      if (stage) {
        const defaultType = hasWx ? 'wx' : hasAli ? 'ali' : 'link';
        window.showStoreQrStage(defaultType);
      }
    } else {
      verifiedCard?.classList.add('hidden');
      emptyTip?.classList.remove('hidden');
      editor?.classList.remove('hidden');
    }
  }

  window.showStoreQrStage = function (kind) {
    const payCfg = readPosPaycodeConfig();
    const stage = document.getElementById('pos-qr-display-stage');
    if (!stage) return;
    if (kind === 'wx' && payCfg.wxQr) {
      stage.innerHTML = `<img src="${payCfg.wxQr}" class="w-52 h-52 object-contain rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xs"/><span class="text-[10px] text-emerald-800 font-bold mt-1.5">💚 微信收款码 · 资金直达掌柜本人 (${payCfg.updatedAt || '已锁定'})</span>`;
    } else if (kind === 'ali' && payCfg.aliQr) {
      stage.innerHTML = `<img src="${payCfg.aliQr}" class="w-52 h-52 object-contain rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xs"/><span class="text-[10px] text-sky-800 font-bold mt-1.5">💙 支付宝收款码 · 资金直达掌柜本人 (${payCfg.updatedAt || '已锁定'})</span>`;
    } else if (kind === 'link' && payCfg.linkedCodeText) {
      stage.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payCfg.linkedCodeText)}" class="w-52 h-52 object-contain rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xs"/><span class="text-[10px] text-amber-900 font-bold mt-1.5">🔗 已关联商户收款码 (${payCfg.updatedAt || '已锁定'})</span>`;
    }
  };

  window.unlockEditStorePaycode = function () {
    const payCfg = readPosPaycodeConfig();
    const inputPin = prompt('🔒 请输入 4 位掌柜安全码以解锁更换收款码：');
    if (inputPin === null) return;
    if (payCfg.pin && inputPin.trim() !== String(payCfg.pin)) {
      return alert('❌ 安全码不正确，非掌柜本人不可更换本店收款码！');
    }
    document.getElementById('pos-paycode-editor')?.classList.remove('hidden');
  };

  const compressQrFileToDataUrl = (file) =>
    new Promise((resolve) => {
      if (!file) return resolve('');
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 480;
          const scale = Math.min(1, maxW / img.width);
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = ev.target?.result;
      };
      reader.readAsDataURL(file);
    });

  window.saveStorePaycodeConfig = async function () {
    const payCfg = readPosPaycodeConfig();
    const pin = document.getElementById('pos-owner-pin')?.value.trim();
    if (!pin || pin.length !== 4) return alert('请设置 4 位掌柜安全码（如 8888），防止他人私自替换收款码！');

    const wxFile = document.getElementById('pos-upload-wx-qr')?.files?.[0];
    const aliFile = document.getElementById('pos-upload-ali-qr')?.files?.[0];
    const linkedText = document.getElementById('pos-link-qr-input')?.value.trim() || '';

    const wxDataUrl = wxFile ? await compressQrFileToDataUrl(wxFile) : payCfg.wxQr || '';
    const aliDataUrl = aliFile ? await compressQrFileToDataUrl(aliFile) : payCfg.aliQr || '';

    if (!wxDataUrl && !aliDataUrl && !linkedText) {
      return alert('请至少上传一张微信/支付宝收款码图片，或填写关联收款码链接！');
    }

    writePosPaycodeConfig({
      wxQr: wxDataUrl,
      aliQr: aliDataUrl,
      linkedCodeText: linkedText,
      pin,
      updatedAt: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    });
    alert('🔒 本店收款码已安全锁定保存！');
    renderStorePosModalState();
  };

  window.saveStorePosEntry = function () {
    const amtInput = document.getElementById('pos-collect-amt');
    const amt = parseFloat(amtInput?.value || '0');
    if (isNaN(amt) || amt <= 0) return alert('请先扫码添加商品或输入有效的实收金额！');

    let itemDesc = '柜台零售';
    let estProfit = 0;
    const rate = getDefaultMarkupRate();

    if (currentEntryMode === 'scan' && scannedBasket.length > 0) {
      itemDesc = scannedBasket.map((it) => `${it.name}${it.qty > 1 ? `×${it.qty}` : ''}`).join('、');
      const totalCost = scannedBasket.reduce((s, it) => s + it.costPrice * it.qty, 0);
      estProfit = totalCost > 0 ? amt - totalCost : amt * (1 - 1 / rate);
    } else {
      const descInp = document.getElementById('pos-item-desc');
      itemDesc = descInp?.value.trim() || '柜台零售';
      estProfit = amt * (1 - 1 / rate);
      if (descInp) descInp.value = '';
    }

    let customerName = '';
    if (selectedPayMethod === '熟客记账') {
      customerName = document.getElementById('pos-credit-customer-name')?.value.trim() || '';
      if (!customerName) return alert('选择「熟客先记账」时，请填写或选择熟客称呼！');

      const creditList = readStoreCreditBook();
      const hit = creditList.find((c) => c.name === customerName);
      const recordItem = {
        date: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        desc: itemDesc,
        amount: Number(amt.toFixed(2))
      };
      if (hit) {
        hit.balance = Number((Number(hit.balance || 0) + amt).toFixed(2));
        hit.history = [recordItem, ...(hit.history || [])];
      } else {
        creditList.unshift({
          id: Date.now(),
          name: customerName,
          balance: Number(amt.toFixed(2)),
          history: [recordItem]
        });
      }
      writeStoreCreditBook(creditList);
    }

    const list = readPosLedgerList();
    list.unshift({
      id: Date.now(),
      itemDesc,
      amount: Number(amt.toFixed(2)),
      profit: Number(Math.max(0, estProfit).toFixed(2)),
      method: selectedPayMethod,
      customerName,
      voided: false,
      createdAt: new Date().toISOString()
    });
    writePosLedgerList(list);

    scannedBasket = [];
    if (amtInput) amtInput.value = '';
    refreshStoreHeaderLiveStats();
    window.closeStoreCounterPosModal();
    alert(`✅ 已记入今日营收：${itemDesc} ¥${amt.toFixed(2)}（${selectedPayMethod}${customerName ? ` · ${customerName}` : ''}）`);
  };

  window.voidStorePosEntry = function (targetId) {
    if (!confirm('确认作废该笔流水？（作废后将保留划除痕迹，不静默删账）')) return;
    const list = readPosLedgerList().map((r) => (Number(r.id) === Number(targetId) ? { ...r, voided: true } : r));
    writePosLedgerList(list);
    refreshStoreHeaderLiveStats();
    renderStorePosModalState();
  };

  window.copyStorePosClosingWechat = function () {
    const storeName = (document.getElementById('store-title')?.innerText || getSavedContactProfile().storeName || '本店柜台').trim();
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayValid = readPosLedgerList().filter((r) => !r.voided && String(r.createdAt || '').startsWith(todayStr));
    const todayTotal = todayValid.reduce((s, r) => s + Number(r.amount || 0), 0);
    const todayCash = todayValid.filter((r) => r.method === '现金').reduce((s, r) => s + Number(r.amount || 0), 0);
    const todayDigital = todayValid.filter((r) => r.method === '微信/支付宝').reduce((s, r) => s + Number(r.amount || 0), 0);
    const todayCredit = todayValid.filter((r) => r.method === '熟客记账').reduce((s, r) => s + Number(r.amount || 0), 0);
    const todayProfit = todayValid.reduce((s, r) => s + Number(r.profit || 0), 0);

    const msg = `🧾【${storeName} · 今日打烊收摊与盈利小结】(${todayStr})\n• 今日零售总额：¥${todayTotal.toFixed(2)}（共 ${todayValid.length} 笔）\n• 扫码实收：¥${todayDigital.toFixed(2)} ｜ 现金实收：¥${todayCash.toFixed(2)} ｜ 熟客挂账：¥${todayCredit.toFixed(2)}\n• 今日估算毛利：+¥${todayProfit.toFixed(2)}\n账目清晰、日清日结！`;
    navigator.clipboard?.writeText(msg);
    alert(`✅ 今日收摊与盈利小结已复制，可直接发微信留存！\n\n${msg}`);
  };

  window.openStoreCounterPosModal = function () {
    scannedBasket = [];
    renderHotItemQuickChips();
    renderScannedBasketList();
    renderStorePosModalState();
    window.switchStorePosTab('collect');
    window.setStorePosEntryMode('scan');
    document.getElementById('modal-store-counter-pos')?.classList.remove('hidden');
  };

  /**
   * 1. 今日经营看板与毛利估算弹窗（右上角菜单第1项）
   */
  window.openStoreBusinessReportModal = function () {
    const storeName = (document.getElementById('store-title')?.innerText || '厚德便民门店').trim();
    const todayStr = new Date().toISOString().slice(0, 10);
    const allRows = readPosLedgerList().filter((r) => !r.voided);
    const todayRows = allRows.filter((r) => String(r.createdAt || '').startsWith(todayStr));

    const todaySales = todayRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const todayProfit = todayRows.reduce((s, r) => s + Number(r.profit || 0), 0);
    const todayCash = todayRows.filter((r) => r.method === '现金').reduce((s, r) => s + Number(r.amount || 0), 0);
    const todayDigital = todayRows.filter((r) => r.method === '微信/支付宝').reduce((s, r) => s + Number(r.amount || 0), 0);
    const todayCredit = todayRows.filter((r) => r.method === '熟客记账').reduce((s, r) => s + Number(r.amount || 0), 0);

    // 7日累计概览
    const sevenDaysAgo = Date.now() - 7 * 86400 * 1000;
    const weekRows = allRows.filter((r) => new Date(r.createdAt || 0).getTime() >= sevenDaysAgo);
    const weekSales = weekRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const weekProfit = weekRows.reduce((s, r) => s + Number(r.profit || 0), 0);

    // 熟客总挂账
    const unpaidCustomers = readStoreCreditBook().reduce((s, c) => s + Math.max(0, Number(c.balance || 0)), 0);

    openBridgeSheetModal({
      id: 'modal-store-business-report',
      title: `📊 ${storeName} · 经营状况与盈利看板`,
      subtitle: `默认加价倍率 ${getDefaultMarkupRate()}x · 单品微调价自动参与毛利核算`,
      confirmText: '📋 复制今日经营战报发微信',
      bodyHtml: `
        <div class="bg-gradient-to-br from-[#1b4332] to-[#143628] text-white rounded-2xl p-4 space-y-3">
          <div class="grid grid-cols-2 gap-3 text-center">
            <div class="bg-white/10 rounded-xl p-2.5">
              <span class="text-[10px] text-emerald-200 block">今日柜台营业额</span>
              <b class="text-lg font-mono text-amber-300">¥${todaySales.toFixed(2)}</b>
            </div>
            <div class="bg-white/10 rounded-xl p-2.5">
              <span class="text-[10px] text-emerald-200 block">今日估算净毛利</span>
              <b class="text-lg font-mono text-emerald-300">+¥${todayProfit.toFixed(2)}</b>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-1.5 text-center text-[11px] pt-1 border-t border-emerald-700/60">
            <div><span class="text-emerald-200/70 block text-[9px]">微信/支付宝</span><b class="font-mono">¥${todayDigital.toFixed(2)}</b></div>
            <div><span class="text-emerald-200/70 block text-[9px]">现金收讫</span><b class="font-mono">¥${todayCash.toFixed(2)}</b></div>
            <div><span class="text-emerald-200/70 block text-[9px]">今日熟客挂账</span><b class="font-mono text-amber-200">¥${todayCredit.toFixed(2)}</b></div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 text-center">
          <div class="bg-stone-50 border border-stone-200 rounded-2xl p-3">
            <span class="text-[10px] text-stone-500 block">近 7 日累计营收 / 毛利</span>
            <b class="text-xs font-mono text-stone-900">¥${weekSales.toFixed(0)} / <span class="text-emerald-800">+¥${weekProfit.toFixed(0)}</span></b>
          </div>
          <div onclick="document.getElementById('modal-store-business-report')?.remove(); window.openStoreCreditBookModal();" class="cursor-pointer bg-rose-50/70 border border-rose-200 rounded-2xl p-3">
            <span class="text-[10px] text-rose-700 block">外欠熟客赊账总额 ▸</span>
            <b class="text-xs font-mono text-rose-800">¥${unpaidCustomers.toFixed(2)}</b>
          </div>
        </div>
      `,
      onConfirm: async (close) => {
        window.copyStorePosClosingWechat();
        close();
      }
    });
  };

  /**
   * 2. 熟客赊账本（谁欠门店钱 · 历史明细 · 一键还款平账）
   */
  window.openStoreCreditBookModal = function () {
    const list = readStoreCreditBook().filter((c) => Number(c.balance || 0) > 0);
    const totalDebt = list.reduce((s, c) => s + Number(c.balance || 0), 0);

    openBridgeSheetModal({
      id: 'modal-store-credit-book',
      title: '📒 熟客赊账本（街坊挂账明细）',
      subtitle: `当前外欠总计：¥${totalDebt.toFixed(2)} · 还款后自动计入今日营收`,
      hideFooter: true,
      bodyHtml:
        list.length === 0
          ? `<div class="py-8 text-center text-stone-400 space-y-1">
               <div class="text-2xl">🎉</div>
               <b class="text-stone-700 block">目前没有街坊赊账，账目清清爽爽！</b>
               <span class="text-[11px] block">在「柜台收银」选择【熟客先记账】即可自动记入此处</span>
             </div>`
          : `<div class="space-y-2 max-h-80 overflow-y-auto">
               ${list
                 .map(
                   (c) => `
                   <div class="bg-stone-50 border border-stone-200 rounded-2xl p-3 space-y-1.5">
                     <div class="flex items-center justify-between">
                       <div>
                         <b class="text-sm text-stone-900">${c.name}</b>
                         <span class="text-[10px] text-stone-500 block">最近：${c.history?.[0]?.date || ''} ${c.history?.[0]?.desc || ''}</span>
                       </div>
                       <div class="text-right">
                         <span class="text-[10px] text-rose-600 block">待还欠款</span>
                         <b class="font-mono text-sm text-rose-700">¥${Number(c.balance).toFixed(2)}</b>
                       </div>
                     </div>
                     <div class="flex justify-end gap-1.5 pt-1 border-t border-stone-200/70">
                       <button type="button" onclick="window.settleStoreCustomerCredit(${c.id}, false)" class="bg-white border border-stone-300 text-stone-800 font-bold px-2.5 py-1 rounded-xl text-[10px]">部分还款</button>
                       <button type="button" onclick="window.settleStoreCustomerCredit(${c.id}, true)" class="bg-[#1b4332] text-amber-300 font-bold px-3 py-1 rounded-xl text-[10px]">✅ 全额还清消账</button>
                     </div>
                   </div>`
                 )
                 .join('')}
             </div>`
    });
  };

  window.settleStoreCustomerCredit = function (customerId, isFull) {
    const list = readStoreCreditBook();
    const hit = list.find((c) => Number(c.id) === Number(customerId));
    if (!hit) return;

    let payAmt = Number(hit.balance || 0);
    if (!isFull) {
      const raw = prompt(`【${hit.name}】当前欠款 ¥${payAmt.toFixed(2)}，请输入本次还款金额（元）：`, '');
      if (raw === null) return;
      payAmt = parseFloat(raw);
      if (isNaN(payAmt) || payAmt <= 0) return alert('请输入有效还款金额！');
    } else {
      if (!confirm(`确认【${hit.name}】已结清全部欠款 ¥${payAmt.toFixed(2)}？`)) return;
    }

    hit.balance = Math.max(0, Number((Number(hit.balance) - payAmt).toFixed(2)));
    hit.history = [
      {
        date: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        desc: `✅ 还款消账`,
        amount: -Number(payAmt.toFixed(2))
      },
      ...(hit.history || [])
    ];
    writeStoreCreditBook(list);

    // 同步记入今日收银实收流水（毛利已在挂账时计算，此处只记现金流回收）
    const ledger = readPosLedgerList();
    ledger.unshift({
      id: Date.now(),
      itemDesc: `熟客还款 (${hit.name})`,
      amount: Number(payAmt.toFixed(2)),
      profit: 0,
      method: '微信/支付宝',
      customerName: hit.name,
      voided: false,
      createdAt: new Date().toISOString()
    });
    writePosLedgerList(ledger);
    refreshStoreHeaderLiveStats();
    window.openStoreCreditBookModal();
  };

  /**
   * 3. 商品检索与单品零售价微调弹窗（支持全库搜索、查看进货底价、微调单品零售价并永久记忆）
   */
  window.openStoreRetailPriceTunerModal = function () {
    const rate = getDefaultMarkupRate();
    openBridgeSheetModal({
      id: 'modal-store-price-tuner',
      title: '🏷️ 商品检索与单品零售价微调',
      subtitle: `未微调商品自动按「进货价 × ${rate}倍」定价；微调后永久锁定`,
      hideFooter: true,
      bodyHtml: `
        <input type="text" id="tuner-search-input" oninput="window.renderStorePriceTunerList(this.value)" placeholder="🔍 输入商品名称搜索，查看进货底价与微调零售价..." class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 outline-none font-bold">
        <div id="tuner-items-host" class="max-h-72 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-2xl px-3"></div>
      `
    });
    window.renderStorePriceTunerList('');
  };

  window.renderStorePriceTunerList = function (kw = '') {
    const host = document.getElementById('tuner-items-host');
    if (!host) return;
    const cleanKw = String(kw || '').trim().toLowerCase();
    const overrides = readRetailPriceOverrides();
    const allNames = new Set([
      ...(cachedSupplierCatalog || []).map((p) => p.name),
      ...Object.keys(overrides)
    ]);
    const list = Array.from(allNames)
      .filter((n) => n && (!cleanKw || n.toLowerCase().includes(cleanKw)))
      .slice(0, 30);

    if (list.length === 0) {
      host.innerHTML = '<div class="py-6 text-center text-stone-400">暂无匹配商品</div>';
      return;
    }

    host.innerHTML = list
      .map((name) => {
        const prod = (cachedSupplierCatalog || []).find((p) => p.name === name);
        const cost = parseFloat(prod?.tier_1_price || overrides[name]?.costPrice || 0);
        const info = resolveSmartRetailPrice(name, cost);
        return `
          <div class="py-2.5 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <b class="text-stone-900 truncate block">${name}</b>
              <span class="text-[10px] text-stone-500">进货底价：¥${cost.toFixed(2)} ${info.isCustomTuned ? '· <b class="text-emerald-800">已微调锁定</b>' : '· 自动倍率'}</span>
            </div>
            <button type="button" onclick="window.promptTuneSingleRetailPrice('${String(name).replace(/'/g, '')}', ${cost}, ${info.retailPrice})" class="bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold px-2.5 py-1 rounded-xl text-[11px] shrink-0">
              零售 ¥${info.retailPrice.toFixed(2)} ✎
            </button>
          </div>`;
      })
      .join('');
  };

  window.promptTuneSingleRetailPrice = function (name, cost, curRetail) {
    const raw = prompt(`设置【${name}】的本店零售价（进货价 ¥${Number(cost).toFixed(2)}）：`, String(curRetail));
    if (raw === null) return;
    const nextVal = parseFloat(raw);
    if (isNaN(nextVal) || nextVal < 0) return alert('请输入有效价格！');
    const overrides = readRetailPriceOverrides();
    overrides[name] = { retailPrice: Number(nextVal.toFixed(2)), costPrice: Number(cost) };
    writeRetailPriceOverrides(overrides);
    window.renderStorePriceTunerList(document.getElementById('tuner-search-input')?.value || '');
  };

  /**
   * 4. 零售加价率与 4 位掌柜安全锁设置弹窗（左上角菜单）
   */
  window.openStorePricingAndLockModal = function () {
    const curRate = getDefaultMarkupRate();
    const curPct = Math.round((curRate - 1) * 100);
    const payCfg = readPosPaycodeConfig();

    openBridgeSheetModal({
      id: 'modal-store-pricing-lock',
      title: '⚙️ 默认零售加价率与 4 位掌柜安全锁',
      subtitle: '自动根据供货进货价换算零售价 · 保护收款码防替换',
      confirmText: '✅ 保存门店核心设置',
      bodyHtml: `
        <div>
          <label class="block font-bold text-stone-700 mb-1">默认零售加价率（当前：加价 ${curPct}%，即进货价 × ${curRate}）：</label>
          <div class="grid grid-cols-4 gap-1.5 mb-1.5 text-[11px] font-bold">
            <button type="button" onclick="document.getElementById('set-markup-rate').value='1.15'" class="py-1.5 rounded-xl bg-stone-100 hover:bg-emerald-100">+15% (1.15x)</button>
            <button type="button" onclick="document.getElementById('set-markup-rate').value='1.20'" class="py-1.5 rounded-xl bg-stone-100 hover:bg-emerald-100">+20% (1.20x)</button>
            <button type="button" onclick="document.getElementById('set-markup-rate').value='1.25'" class="py-1.5 rounded-xl bg-stone-100 hover:bg-emerald-100">+25% (1.25x)</button>
            <button type="button" onclick="document.getElementById('set-markup-rate').value='1.30'" class="py-1.5 rounded-xl bg-stone-100 hover:bg-emerald-100">+30% (1.30x)</button>
          </div>
          <input type="number" step="0.05" min="1" id="set-markup-rate" value="${curRate}" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold text-emerald-950">
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">🔒 掌柜 4 位安全码（${payCfg.pin ? '已设置，修改需验证旧码' : '尚未设置'}）：</label>
          <input type="password" maxlength="4" id="set-new-owner-pin" placeholder="输入新的 4 位数字安全码（留空则不改）" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold">
        </div>
      `,
      onConfirm: async (close) => {
        const nextRate = parseFloat(document.getElementById('set-markup-rate')?.value || '1.25');
        if (isNaN(nextRate) || nextRate < 1) return alert('加价倍率不能小于 1.0！');
        setDefaultMarkupRate(nextRate);

        const newPin = document.getElementById('set-new-owner-pin')?.value.trim();
        if (newPin) {
          if (newPin.length !== 4) return alert('安全码必须是 4 位数字！');
          if (payCfg.pin) {
            const oldCheck = prompt('请输入原来的 4 位掌柜安全码进行验证：');
            if (oldCheck !== String(payCfg.pin)) return alert('❌ 原安全码验证失败！');
          }
          writePosPaycodeConfig({ ...payCfg, pin: newPin });
        }
        close();
        alert(`✅ 设置已保存！默认零售倍率已设为 ${nextRate} 倍。`);
      }
    });
  };

  /**
   * 5. 多品组合与微信群拼单接龙海报生成器（支持 2~6 款同框海报 + 一键复制群接龙文本）
   */
  window.openMultiPosterModal = function () {
    const storeName = (document.getElementById('store-title')?.innerText || '厚德便民门店').trim();
    const catalog = cachedSupplierCatalog || [];
    const optionsHtml =
      catalog.length === 0
        ? '<p class="text-stone-400 text-center py-3">当前供货方暂无在架商品，请先切换有货的供货方</p>'
        : catalog
            .slice(0, 20)
            .map((p, idx) => {
              const info = resolveSmartRetailPrice(p.name, parseFloat(p.tier_1_price || 0));
              return `
              <label class="flex items-center justify-between gap-2 p-2 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer hover:bg-amber-50/60">
                <div class="flex items-center gap-2 min-w-0">
                  <input type="checkbox" class="mp-prod-check rounded text-emerald-800" data-name="${String(p.name).replace(/"/g, '')}" data-spec="${String(p.spec || p.measure_unit || '件').replace(/"/g, '')}" data-price="${info.retailPrice.toFixed(2)}" ${idx < 3 ? 'checked' : ''}>
                  <span class="font-bold text-stone-800 truncate">${p.name}</span>
                </div>
                <span class="font-mono font-bold text-rose-700 shrink-0">¥${info.retailPrice.toFixed(2)}</span>
              </label>`;
            })
            .join('');

    openBridgeSheetModal({
      id: 'modal-multi-poster-builder',
      title: '🎨 多品组合特惠 & 微信群接龙海报',
      subtitle: '勾选中意商品（建议 2~6 款），一键生成高清海报与微信接龙文案',
      hideFooter: true,
      bodyHtml: `
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold text-stone-700 mb-1">海报主题模式：</label>
            <select id="mp-theme-mode" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-bold">
              <option value="group_buy">🔥 邻里拼单接龙专场</option>
              <option value="daily_special">🌾 今日鲜货特惠榜</option>
            </select>
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">接龙成团/自提说明：</label>
            <input type="text" id="mp-sub-slogan" value="满15份成团直降 · 明日到店自提" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-bold">
          </div>
        </div>
        <div class="max-h-40 overflow-y-auto space-y-1.5">${optionsHtml}</div>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" onclick="window.generateMultiProductCanvasPoster()" class="py-2.5 rounded-xl bg-[#1b4332] text-amber-300 font-bold shadow">
            🖼️ 生成高清多品海报
          </button>
          <button type="button" onclick="window.copyWeChatGroupRelayText()" class="py-2.5 rounded-xl bg-amber-400 text-stone-950 font-bold shadow">
            📋 复制微信接龙文本
          </button>
        </div>
        <div id="mp-canvas-preview-wrap" class="hidden space-y-1.5 text-center pt-1">
          <img id="mp-generated-poster-img" class="w-full rounded-2xl border border-stone-200 shadow-md" alt="多品海报预览"/>
          <span class="text-[10px] text-stone-500 block">👆 长按上方海报保存到相册，直接发街坊微信群</span>
        </div>
      `
    });

    window.generateMultiProductCanvasPoster = function () {
      const checked = Array.from(document.querySelectorAll('.mp-prod-check:checked')).slice(0, 6);
      if (checked.length === 0) return alert('请至少勾选 1 款商品！');
      const mode = document.getElementById('mp-theme-mode')?.value || 'group_buy';
      const slogan = document.getElementById('mp-sub-slogan')?.value.trim() || '源头直供 · 邻里拼单';

      const canvas = document.createElement('canvas');
      const W = 720;
      const H = 340 + checked.length * 105;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 端庄墨绿底框 + 暖白宣纸内页
      ctx.fillStyle = '#1b4332';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#faf8f3';
      ctx.fillRect(28, 28, W - 56, H - 56);

      // 顶部标题匾额
      ctx.fillStyle = '#1b4332';
      ctx.fillRect(28, 28, W - 56, 155);
      ctx.fillStyle = '#fcd34d';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(mode === 'group_buy' ? `🔥 ${storeName} · 邻里拼单接龙` : `🌾 ${storeName} · 今日特惠货单`, W / 2, 92);

      ctx.fillStyle = '#ecfdf5';
      ctx.font = '22px sans-serif';
      ctx.fillText(slogan, W / 2, 138);

      // 商品列表卡片
      checked.forEach((el, i) => {
        const y = 210 + i * 105;
        const pName = el.getAttribute('data-name') || '';
        const pSpec = el.getAttribute('data-spec') || '';
        const pPrice = el.getAttribute('data-price') || '0.00';

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(54, y, W - 108, 86);
        ctx.strokeStyle = '#d6d3d1';
        ctx.lineWidth = 2;
        ctx.strokeRect(54, y, W - 108, 86);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#1c1917';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText(`${i + 1}. ${pName}`, 76, y + 38);

        ctx.fillStyle = '#78716c';
        ctx.font = '20px sans-serif';
        ctx.fillText(`规格：${pSpec} · 源头直供保真`, 76, y + 68);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#be123c';
        ctx.font = 'bold 32px monospace';
        ctx.fillText(`¥${pPrice}`, W - 76, y + 54);
      });

      // 底部落款
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1b4332';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(`📍 微信群内直接接龙报名 · 到店核销自提（${storeName}）`, W / 2, H - 56);

      const imgEl = document.getElementById('mp-generated-poster-img');
      if (imgEl) imgEl.src = canvas.toDataURL('image/png');
      document.getElementById('mp-canvas-preview-wrap')?.classList.remove('hidden');
    };

    window.copyWeChatGroupRelayText = function () {
      const checked = Array.from(document.querySelectorAll('.mp-prod-check:checked')).slice(0, 6);
      if (checked.length === 0) return alert('请至少勾选 1 款商品！');
      const slogan = document.getElementById('mp-sub-slogan')?.value.trim() || '明日到店自提';
      const lines = checked
        .map((el, i) => `${i + 1}️⃣ ${el.getAttribute('data-name')}（${el.getAttribute('data-spec')}）：¥${el.getAttribute('data-price')}`)
        .join('\n');

      const relayText = `🔥【${storeName} · 邻里拼单接龙】\n${slogan}\n${lines}\n\n👇 需要的街坊请在下方接龙（格式：门牌/名字 + 几号几份）：\n1. `;
      navigator.clipboard?.writeText(relayText);
      alert(`✅ 微信群接龙文案已复制！发海报的同时粘贴进群即可开始接龙：\n\n${relayText}`);
    };
  };
}

let storeBridgeWatcherStarted = false;
let lastRenderedStoreAgent = '';

/**
 * 1. 门店工作台 (index.html)
 */
export async function initStoreTerminalBridge() {
  showWeChatPinGuideIfFirstTime();
  bindNativeStoreCounterPosBindings();
  refreshStoreHeaderLiveStats();

  const params = getUrlParams();
  const stickerAgent = (params.get('agent') || params.get('t') || '').trim();
  const stickerStoreId = (params.get('store_id') || '').trim();

  if (stickerAgent) {
    localStorage.setItem('active_agent_id', stickerAgent);
    localStorage.setItem('active_agent', stickerAgent);
  }
  if (stickerStoreId) {
    localStorage.setItem('sticker_bound_store_id', stickerStoreId);
  }

  async function renderCrowdBannerForActiveAgent(forceRefresh = false) {
    const activeAgent = (
      document.getElementById('menu-current-agent-tag')?.innerText ||
      localStorage.getItem('active_agent') ||
      localStorage.getItem('active_agent_id') ||
      stickerAgent
    ).trim();

    document.querySelectorAll('button, span').forEach((el) => {
      const txt = el.innerText || '';
      if ((txt.includes('有限公司') || txt.includes('供应链') || txt.includes('合作社')) && el.tagName === 'BUTTON') {
        el.style.maxWidth = '135px';
        el.style.overflow = 'hidden';
        el.style.textOverflow = 'ellipsis';
        el.style.whiteSpace = 'nowrap';
      }
    });

    const container =
      document.getElementById('product-container') ||
      document.getElementById('product-list') ||
      document.getElementById('goods-list') ||
      document.getElementById('items-container');

    if (container && container.innerText?.includes('加载遇到波动')) {
      container.innerHTML = `
        <div class="py-10 px-4 text-center text-xs text-stone-500 space-y-2">
          <div class="text-2xl">🌱</div>
          <b class="text-stone-700 block">当前供货方暂未上架公开品项</b>
          <span class="block text-[11px]">您可点击上方切换其他供货方，或点左上角菜单【逛大集】发掘更多源头供货方</span>
        </div>
      `;
    }

    if (!activeAgent || activeAgent === '未接入') {
      document.getElementById('store-crowd-produce-box')?.remove();
      lastRenderedStoreAgent = '';
      return;
    }

    if (!forceRefresh && activeAgent === lastRenderedStoreAgent && document.getElementById('product-container')) {
      return;
    }
    lastRenderedStoreAgent = activeAgent;

    const [tenantRes, crowdRes, productsRes] = await Promise.all([
      supabase
        .from('platform_tenant')
        .select('tenant_id, company_name, custom_settings')
        .eq('tenant_id', activeAgent)
        .maybeSingle(),
      supabase
        .from('platform_suggestion_board')
        .select('*')
        .eq('proposer_type', 'c2b_demand')
        .ilike('category', `%凑单开产 · ${activeAgent}%`)
        .order('id', { ascending: false })
        .limit(5),
      supabase
        .from('product')
        .select('id, name, spec, measure_unit, tier_1_price, status')
        .eq('tenant_id', activeAgent)
        .eq('status', 'active')
        .limit(100)
    ]);

    if (productsRes?.data) {
      cachedSupplierCatalog = productsRes.data;
    }

    const tenant = tenantRes?.data;
    if (tenant?.custom_settings) {
      const lex = getTenantLexicon(tenant.custom_settings);
      document.querySelectorAll('[data-lex]').forEach((el) => {
        const k = el.getAttribute('data-lex');
        if (k && lex[k]) el.textContent = lex[k];
      });
    }

    if (!container) return;
    document.getElementById('store-crowd-produce-box')?.remove();

    const crowdList = crowdRes?.data || [];
    if (crowdList.length > 0) {
      const crowdBox = document.createElement('div');
      crowdBox.id = 'store-crowd-produce-box';
      crowdBox.className = 'mb-3 bg-emerald-50/90 border border-emerald-300 p-3 rounded-2xl space-y-2 text-xs';
      crowdBox.innerHTML = `
        <div class="flex items-center justify-between">
          <b class="text-emerald-950">🌾 源头「凑单开产」预售接龙（凑满即开炉/发班直供）</b>
          <span class="text-[10px] bg-emerald-800 text-white px-2 py-0.5 rounded-full font-bold">零库存优价</span>
        </div>
        ${crowdList
          .map(
            (c) => `
            <div class="bg-white p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between gap-2">
              <span class="text-[11px] text-stone-800 leading-snug">${c.content}</span>
              <button type="button" onclick="window.claimCrowdProduceItem(${c.id}, '${String(c.content).replace(/'/g, '')}')" class="bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold px-2.5 py-1 rounded-xl text-[10px] shrink-0">
                🙋 我要认领
              </button>
            </div>`
          )
          .join('')}
      `;
      container.parentNode?.insertBefore(crowdBox, container);
    }

    window.claimCrowdProduceItem = function (noticeId, contentText) {
      const profile = getSavedContactProfile();
      const storeTitle = document.getElementById('store-title')?.innerText || profile.storeName || '合作门店';
      openBridgeSheetModal({
        id: 'modal-store-crowd-claim',
        title: '🌾 凑单开产 · 门店认领登记',
        subtitle: contentText,
        confirmText: '✅ 确认认领排产',
        bodyHtml: `
          <div>
            <label class="block font-bold text-stone-700 mb-1">认领方称呼：</label>
            <input type="text" id="sc-claim-store" value="${storeTitle}" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">认领数量（件/箱/斤/份）*：</label>
            <input type="number" min="1" id="sc-claim-qty" value="10" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-base font-mono font-bold text-emerald-950">
          </div>
        `,
        onConfirm: async (close) => {
          const sName = document.getElementById('sc-claim-store')?.value.trim() || storeTitle;
          const qty = parseInt(document.getElementById('sc-claim-qty')?.value || '0', 10);
          if (!qty || qty <= 0) return alert('请输入有效的认领数量！');

          saveContactProfile({ storeName: sName });
          const { error } = await supabase.from('platform_suggestion_board').insert([{
            proposer_type: 'c2b_demand',
            proposer_name: sName,
            category: `[凑单认领 · ${activeAgent}]`,
            content: `🙋【凑单认领】${sName} 认领 ${qty} 份（响应：${contentText.slice(0, 40)}...）`
          }]);
          if (error) return alert('认领提交失败：' + error.message);
          close();
          alert(`✅ 认领成功！已向源头供方登记【${sName}】认领 ${qty} 份，凑满开产后将优先为您配发！`);
        }
      });
    };
  }

  await renderCrowdBannerForActiveAgent(true);

  if (!storeBridgeWatcherStarted) {
    storeBridgeWatcherStarted = true;
    setInterval(() => {
      renderCrowdBannerForActiveAgent(false);
    }, 2000);
  }
}

/**
 * 2. 送货与上门 · 移动一线工作台 (driver.html)
 */
const OFFLINE_QUEUE_KEY = 'baigong_palm_offline_queue';

function readPalmOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writePalmOfflineQueue(list) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(list));
}

export function initDriverTerminalBridge() {
  showWeChatPinGuideIfFirstTime();
  mountMobileQuickRoleSwitchDock('driver.html');
  const navHost = document.getElementById('palm-role-nav');
  if (!navHost || document.getElementById('palm-voice-quick-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'palm-voice-quick-bar';
  bar.className = 'mx-3 mt-2.5 bg-stone-50 border border-stone-200 p-2.5 rounded-2xl space-y-2 text-xs';
  bar.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-1.5">
      <b class="text-stone-800 text-[11px]">一线现场记账与快捷工具</b>
      <div class="flex flex-wrap items-center gap-1">
        <button type="button" id="btn-palm-sync-offline" onclick="window.flushPalmOfflineQueue()" class="hidden bg-amber-400 text-stone-950 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          待补传 0 笔
        </button>
        <button type="button" onclick="window.openPalmPhotoEvidenceModal()" class="bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          拍照留底
        </button>
        <button type="button" onclick="window.copyDriverDepartureNotice()" class="bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          出发预告
        </button>
        <button type="button" onclick="window.openPalmMapNavigation()" class="bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          地图导航
        </button>
        <button type="button" onclick="window.openPalmQuickWalkInModal()" class="bg-[#1b4332] text-amber-300 font-bold px-2.5 py-0.5 rounded-lg text-[10px]">
          + 现场开单
        </button>
      </div>
    </div>
    <div class="flex gap-1.5">
      <input type="text" id="palm-quick-note-input" placeholder="如：旺顺饭庄收现金800元 / 帮张大爷修好水泵收120元" class="flex-1 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 text-[11px] outline-none focus:border-emerald-800">
      <button type="button" onclick="window.startVoiceInput?.('palm-quick-note-input')" class="bg-stone-200 text-stone-800 font-bold px-2.5 rounded-xl text-[11px] shrink-0">语音</button>
      <button type="button" onclick="window.submitPalmQuickCommand()" class="bg-[#1b4332] text-white font-bold px-3 rounded-xl text-[11px] shrink-0">记一笔</button>
    </div>
  `;
  navHost.insertAdjacentElement('beforebegin', bar);

  window.openPalmPhotoEvidenceModal = function () {
    openBridgeSheetModal({
      id: 'modal-palm-photo-evidence',
      title: '📷 交割 / 验收 / 器具随手拍照留底',
      subtitle: '自动压缩图片存入云端账本，口说无凭一拍即清',
      confirmText: '✅ 上传留底存证',
      bodyHtml: `
        <div>
          <label class="block font-bold text-stone-700 mb-1">关联客户或事项说明 *：</label>
          <input type="text" id="pe-note" placeholder="如：兴隆饭庄到货签收 / 水泵维修完工验收 / 收回空筐8个" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">点击调用相机拍照或选图 *：</label>
          <input type="file" id="pe-file-input" accept="image/*" capture="environment" class="w-full bg-stone-50 border border-stone-200 rounded-xl p-2 text-xs">
        </div>
      `,
      onConfirm: async (close) => {
        const noteText = document.getElementById('pe-note')?.value.trim();
        const file = document.getElementById('pe-file-input')?.files?.[0];
        if (!noteText) return alert('请填写关联客户或现场说明！');
        if (!file) return alert('请先拍一张现场照片！');

        const tenantId = (document.getElementById('tenant-display')?.innerText || localStorage.getItem('hq_active_agent') || '').trim();
        const operator = (document.getElementById('driver-name-display')?.innerText || '一线执事').trim();

        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const maxW = 640;
              const scale = Math.min(1, maxW / img.width);
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/jpeg', 0.65));
            };
            img.src = ev.target?.result;
          };
          reader.readAsDataURL(file);
        });

        const { error } = await supabase.from('driver_collection_log').insert([{
          tenant_id: tenantId,
          store_id: 0,
          store_name: `📷 现场留底 (${noteText.slice(0, 22)})`,
          driver_name: operator,
          collect_type: 'photo_evidence',
          amount: 0,
          discount_amount: 0,
          basket_return: 0,
          basket_deduct_amount: 0,
          pay_method: dataUrl,
          settled_to_hq: true
        }]);

        if (error) return alert('上传留底失败：' + error.message);
        close();
        alert('✅ 现场照片已压缩存入云端账本，随时可调阅核验！');
      }
    });
  };

  window.copyDriverDepartureNotice = function () {
    const operator = (document.getElementById('driver-name-display')?.innerText || '服务师傅').trim();
    const notice = `🚚【送货/上门出发预告】各位老板好，${operator}已出发前往沿线各点，预计 1 小时内陆续抵达，请提前留好接货或作业位置，到场前会提前电话联系！`;
    navigator.clipboard?.writeText(notice);
    alert(`✅ 出发预告已复制，可直接转发到客户微信或微信群！\n\n${notice}`);
  };

  window.openPalmMapNavigation = function () {
    openBridgeSheetModal({
      id: 'modal-palm-map-nav',
      title: '🗺️ 唤起手机地图一键导航',
      subtitle: '输入客户店名、村镇或街道，直接跳转地图规划路线',
      confirmText: '🧭 立即开始导航',
      bodyHtml: `
        <div>
          <label class="block font-bold text-stone-700 mb-1">目的地名称或地址 *：</label>
          <input type="text" id="palm-nav-dest" placeholder="如：城南兴隆饭庄 / 镇东李家村合作社" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
        </div>
      `,
      onConfirm: async (close) => {
        const dest = document.getElementById('palm-nav-dest')?.value.trim();
        if (!dest) return alert('请输入目的地名称或地址！');
        close();
        window.open(`https://uri.amap.com/search?keyword=${encodeURIComponent(dest)}`, '_blank');
      }
    });
  };

  function refreshOfflineBadge() {
    const q = readPalmOfflineQueue();
    const btn = document.getElementById('btn-palm-sync-offline');
    if (!btn) return;
    if (q.length > 0) {
      btn.innerText = `待补传 ${q.length} 笔`;
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  }
  refreshOfflineBadge();

  window.flushPalmOfflineQueue = async function (silent = false) {
    const q = readPalmOfflineQueue();
    if (q.length === 0) return;
    if (!navigator.onLine) {
      if (!silent) alert('当前仍处于无信号状态，等有网络时再点此按钮即可自动补传。');
      return;
    }

    const remaining = [];
    let syncedCount = 0;
    for (const item of q) {
      const { error } = await supabase.from(item.table).insert([item.payload]);
      if (error) remaining.push(item);
      else syncedCount += 1;
    }
    writePalmOfflineQueue(remaining);
    refreshOfflineBadge();
    if (syncedCount > 0 && !silent) {
      alert(`✅ 信号已恢复！已自动将本地暂存的 ${syncedCount} 笔账目全部上传同步到云端！`);
      if (typeof window.loadDriverTasks === 'function') window.loadDriverTasks();
    }
  };

  window.addEventListener('online', () => {
    window.flushPalmOfflineQueue(false);
  });

  window.submitPalmQuickCommand = async function () {
    const inp = document.getElementById('palm-quick-note-input');
    const txt = inp?.value.trim() || '';
    if (!txt) return alert('请先输入或语音说出要记的内容！');

    const tenantId = (document.getElementById('tenant-display')?.innerText || localStorage.getItem('hq_active_agent') || '').trim();
    const operator = (document.getElementById('driver-name-display')?.innerText || '一线执事').trim();
    const amtMatch = txt.match(/(\d+(?:\.\d+)?)\s*(?:元|块|¥)?/);
    const amt = amtMatch ? parseFloat(amtMatch[1]) : 0;

    if (!confirm(`确认将以下记录写入商号账本？\n• 内容：${txt}\n• 识别金额：¥${amt.toFixed(2)}\n• 经手人：${operator}`)) return;

    const payload = {
      tenant_id: tenantId,
      store_id: 0,
      store_name: `一线随手记 (${txt.slice(0, 18)})`,
      driver_name: operator,
      collect_type: 'delivery_collect',
      amount: amt,
      discount_amount: 0,
      basket_return: 0,
      basket_deduct_amount: 0,
      pay_method: txt.includes('现金') ? '现金' : '随手记/扫码',
      settled_to_hq: false
    };

    const { error } = await supabase.from('driver_collection_log').insert([payload]);
    inp.value = '';
    if (error || !navigator.onLine) {
      const q = readPalmOfflineQueue();
      q.push({ table: 'driver_collection_log', payload, savedAt: Date.now() });
      writePalmOfflineQueue(q);
      refreshOfflineBadge();
      alert('📶 当前无网络信号，已先为您稳妥记在手机本地，恢复信号后自动上传云端！');
      return;
    }

    alert('✅ 已写入随车/一线账本，回库后财务可直接点清核对！');
    if (typeof window.loadDriverTasks === 'function') window.loadDriverTasks();
  };

  window.openPalmQuickWalkInModal = function () {
    openBridgeSheetModal({
      id: 'modal-palm-walkin-order',
      title: '⚡ 现场随手开单（卖货 / 上门服务通用）',
      subtitle: '无需建档，支持弱网本地暂存，现场成交一秒留痕入账',
      confirmText: '✅ 立即出凭单入账',
      bodyHtml: `
        <div>
          <label class="block font-bold text-stone-700 mb-1">需方称呼 *：</label>
          <input type="text" id="pw-buyer" value="现场散客" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">货品或服务明细 *：</label>
          <input type="text" id="pw-item" placeholder="如：菜籽油 2桶 / 农机耕地 3亩 / 上门检修" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">实收总金额 (元) *：</label>
          <input type="number" step="0.01" id="pw-amount" placeholder="0.00" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-base font-mono font-bold text-emerald-950">
        </div>
      `,
      onConfirm: async (close) => {
        const buyer = document.getElementById('pw-buyer')?.value.trim() || '现场散客';
        const itemDesc = document.getElementById('pw-item')?.value.trim();
        const totalAmt = parseFloat(document.getElementById('pw-amount')?.value || '0');
        if (!itemDesc) return alert('请填写货品或服务明细！');
        if (isNaN(totalAmt) || totalAmt < 0) return alert('请输入有效金额！');

        const tenantId = (document.getElementById('tenant-display')?.innerText || localStorage.getItem('hq_active_agent') || '').trim();
        const operator = (document.getElementById('driver-name-display')?.innerText || '一线执事').trim();
        const ckNo = generateMobileVoucherNo('CK');

        const payload = {
          order_no: ckNo,
          tenant_id: tenantId,
          store_id: 0,
          store_name: buyer,
          driver_name: operator,
          order_source: 'vendor_push',
          settlement_type: 'cash',
          settlement_note: `[一线现场随手单] ${itemDesc}`,
          items: [{ id: 0, name: itemDesc, spec: '现场直结', measure_unit: '项', price: totalAmt, qty: 1 }],
          items_return: [],
          items_exchange: [],
          total_amount: totalAmt,
          return_amount: 0,
          net_settle_amount: totalAmt,
          order_status: 'confirmed',
          delivery_status: 'delivered',
          note: `[一线现场随手单] ${itemDesc}`
        };

        const { error } = await supabase.from('store_order').insert([payload]);
        close();
        if (error || !navigator.onLine) {
          const q = readPalmOfflineQueue();
          q.push({ table: 'store_order', payload, savedAt: Date.now() });
          writePalmOfflineQueue(q);
          refreshOfflineBadge();
          alert(`📶 当前网络不通，凭单【${ckNo}】已先存进手机本地缓存，联网后自动补传！`);
          return;
        }

        alert(`✅ 现场随手单【${ckNo}】（¥${totalAmt.toFixed(2)}）已入账！`);
        if (typeof window.loadDriverTasks === 'function') window.loadDriverTasks();
      }
    });
  };
}

/**
 * 3. 逛大集 · 零售与邻里拼单端 (mall.html)
 */
export async function initMallTerminalBridge() {
  showWeChatPinGuideIfFirstTime();
  mountMobileQuickRoleSwitchDock('mall.html');

  document.querySelectorAll('p, span, div').forEach((el) => {
    if (el.children.length === 0 && el.innerText?.includes('物勒工名·服务归店·产区直达')) {
      el.innerText = '源头直供 · 邻里拼单 · 百业找货找人';
    }
  });
  document.querySelectorAll('button, a').forEach((btn) => {
    const t = btn.innerText || '';
    if (t.includes('进专柜') && !t.includes('4')) {
      btn.style.display = 'none';
    }
    if (t.includes('天街良品') && btn.parentElement) {
      btn.parentElement.style.maxWidth = '680px';
      btn.parentElement.style.marginLeft = 'auto';
      btn.parentElement.style.marginRight = 'auto';
    }
  });

  const [crowdRes, claimRes, charityTenantsRes] = await Promise.all([
    supabase
      .from('platform_suggestion_board')
      .select('*')
      .eq('proposer_type', 'c2b_demand')
      .ilike('category', '%凑单开产%')
      .order('id', { ascending: false })
      .limit(6),
    supabase
      .from('platform_suggestion_board')
      .select('*')
      .eq('proposer_type', 'c2b_demand')
      .ilike('category', '%拼单认领%')
      .order('id', { ascending: false })
      .limit(40),
    supabase
      .from('platform_tenant')
      .select('tenant_id, company_name, custom_settings')
      .eq('is_active', true)
      .limit(50)
  ]);

  const crowdList = crowdRes?.data || [];
  const claimList = claimRes?.data || [];
  const charityTenants = (charityTenantsRes?.data || []).filter((t) => t.custom_settings?.charity_micro_light_enabled);

  const mainHost = document.querySelector('main') || document.body;
  if (crowdList.length > 0 && !document.getElementById('mall-crowd-produce-strip')) {
    const strip = document.createElement('section');
    strip.id = 'mall-crowd-produce-strip';
    strip.className = 'max-w-5xl mx-auto my-3 px-3';
    strip.innerHTML = `
      <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-2 text-xs">
        <div class="flex items-center justify-between">
          <b class="text-emerald-950 text-sm">🌾 源头「凑单开产」接龙（凑够即开炉/发班直供，比现货更优价）</b>
          <span class="text-[10px] text-emerald-800 font-bold">大家一起拼 · 零中间商</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${crowdList
            .map((c) => {
              const targetMatch = String(c.content || '').match(/凑够\s*(\d+)/);
              const targetNum = targetMatch ? parseInt(targetMatch[1], 10) : 100;
              const shortKey = String(c.content || '').slice(0, 18);
              const claimedSum = claimList
                .filter((cl) => String(cl.content || '').includes(shortKey))
                .reduce((acc, cl) => {
                  const m = String(cl.content || '').match(/认领\s*(\d+)/);
                  return acc + (m ? parseInt(m[1], 10) : 0);
                }, 0);
              const pct = Math.min(100, Math.round((claimedSum / Math.max(1, targetNum)) * 100));
              const leftNum = Math.max(0, targetNum - claimedSum);

              return `
              <div class="bg-white p-2.5 rounded-xl border border-emerald-200 space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <span class="text-[10px] font-bold text-emerald-800 block">${c.proposer_name || '源头直供商号'}</span>
                    <span class="text-[11px] text-stone-800">${c.content}</span>
                  </div>
                  <button type="button" onclick="window.mallJoinCrowdProduce('${String(c.category || '').replace(/'/g, '')}', '${String(c.content || '').replace(/'/g, '')}')" class="bg-[#1b4332] text-amber-300 font-bold px-2.5 py-1.5 rounded-xl text-[10px] shrink-0">
                    参与拼单
                  </button>
                </div>
                <div class="bg-stone-100 rounded-full h-2 overflow-hidden">
                  <div class="bg-emerald-600 h-full transition-all" style="width:${Math.max(8, pct)}%"></div>
                </div>
                <div class="text-[10px] text-emerald-900 font-bold flex justify-between">
                  <span>🚚 已凑 ${claimedSum} / ${targetNum}</span>
                  <span>${leftNum > 0 ? `再凑 ${leftNum} 立即发车/排产` : '🎉 已满额排产中'}</span>
                </div>
              </div>`;
            })
            .join('')}
        </div>
      </div>
    `;
    mainHost.insertAdjacentElement('afterbegin', strip);
  }

  if (charityTenants.length > 0 && !document.getElementById('mall-charity-footer-note')) {
    const footerNote = document.createElement('div');
    footerNote.id = 'mall-charity-footer-note';
    footerNote.className = 'max-w-5xl mx-auto my-4 px-3';
    footerNote.innerHTML = `
      <div class="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 text-center text-[11px] text-amber-950">
        🕯️ <b>「一单微光」邻里公益公示：</b>本街区 <b>${charityTenants.map((t) => t.company_name || t.tenant_id).join('、')}</b> 已承诺每成交一笔订单均向社区/村镇邻里驿站公益角捐出一份微光心意。
      </div>
    `;
    mainHost.insertAdjacentElement('beforeend', footerNote);
  }

  window.mallJoinCrowdProduce = function (catStr, contentStr) {
    const profile = getSavedContactProfile();
    const defaultContact = [profile.name, profile.phone].filter(Boolean).join(' ');
    openBridgeSheetModal({
      id: 'modal-mall-crowd-join',
      title: '🛒 源头「凑单开产」拼单登记',
      subtitle: contentStr,
      confirmText: '✅ 确认参与拼单',
      bodyHtml: `
        <div>
          <label class="block font-bold text-stone-700 mb-1">您的称呼及手机号（开产/发班通知用）*：</label>
          <input type="text" id="mc-buyer-info" value="${defaultContact}" placeholder="例如：李大姐 13800138000" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">拼单认领数量（件/份/亩）*：</label>
          <input type="number" min="1" id="mc-buyer-qty" value="2" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-base font-mono font-bold text-emerald-950">
        </div>
      `,
      onConfirm: async (close) => {
        const buyerName = document.getElementById('mc-buyer-info')?.value.trim();
        const qty = parseInt(document.getElementById('mc-buyer-qty')?.value || '0', 10);
        if (!buyerName) return alert('请填写您的称呼及手机号！');
        if (!qty || qty <= 0) return alert('请输入有效的拼单数量！');

        const phoneMatch = buyerName.match(/1[3-9]\d{9}/);
        const pureName = buyerName.replace(/1[3-9]\d{9}/, '').trim();
        saveContactProfile({ name: pureName, phone: phoneMatch ? phoneMatch[0] : '' });

        const { error } = await supabase.from('platform_suggestion_board').insert([{
          proposer_type: 'c2b_demand',
          proposer_name: buyerName,
          category: catStr.replace('凑单开产', '天街拼单认领'),
          content: `🛒【拼单认领】${buyerName} 认领 ${qty} 份（${contentStr.slice(0, 40)}...）`
        }]);
        if (error) return alert('拼单提交失败：' + error.message);
        close();
        alert('✅ 拼单认领成功！凑满后供方将第一时间与您联系交付。');
      }
    });
  };
}

/**
 * 4. 逛大集 · 百业双向供需合作名录 (suppliers.html)
 */
export async function initSuppliersTerminalBridge() {
  showWeChatPinGuideIfFirstTime();
  mountMobileQuickRoleSwitchDock('suppliers.html');
  const mainHost = document.querySelector('main') || document.body;
  if (!mainHost || document.getElementById('suppliers-two-way-board')) return;

  const { data: demands } = await supabase
    .from('platform_suggestion_board')
    .select('*')
    .eq('proposer_type', 'c2b_demand')
    .order('id', { ascending: false })
    .limit(8);

  const list = demands || [];
  const board = document.createElement('section');
  board.id = 'suppliers-two-way-board';
  board.className = 'max-w-5xl mx-auto my-3 px-3';
  board.innerHTML = `
    <div class="bg-white border border-stone-200 rounded-2xl p-4 space-y-2.5 text-xs shadow-2xs">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
        <div>
          <b class="text-sm text-stone-900">🔄 找好货 · 找人手 · 调余货 · 一起拼（百业双向供需榜）</b>
          <span class="text-[10px] text-stone-500 block">人人既可做供方接单，也可做需方发求购/找服务，实名信义商号直接对接</span>
        </div>
        <button type="button" onclick="window.publishTwoWayDemandPrompt()" class="bg-[#1b4332] hover:bg-[#143628] text-amber-300 font-bold px-3 py-1.5 rounded-xl text-[11px] shadow-2xs transition">
          📢 发布我的需求/服务意向
        </button>
      </div>
      ${
        list.length === 0
          ? `<p class="text-[11px] text-stone-400 py-2">暂无最新挂榜需求，点击右上角可免费发布您的采购、找人手或余货调剂意向。</p>`
          : `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${list
              .map(
                (d) => `
                <div class="bg-stone-50 border border-stone-200 rounded-xl p-2.5 space-y-1">
                  <div class="flex justify-between items-center text-[10px]">
                    <span class="font-bold text-emerald-900">${d.proposer_name || '实名商户'}</span>
                    <span class="text-stone-400">${String(d.created_at || '').slice(0, 10)}</span>
                  </div>
                  <p class="text-[11px] text-stone-800 leading-snug">${d.content}</p>
                </div>`
              )
              .join('')}</div>`
      }
    </div>
  `;
  mainHost.insertAdjacentElement('afterbegin', board);

  window.publishTwoWayDemandPrompt = function () {
    const profile = getSavedContactProfile();
    openBridgeSheetModal({
      id: 'modal-suppliers-twoway-demand',
      title: '📢 发布采购 / 找人手服务 / 余货调剂意向',
      subtitle: '免费挂榜 · 源头供方与手艺人直接联系，零中间抽佣',
      confirmText: '🚀 立即挂榜发布',
      bodyHtml: `
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold text-stone-700 mb-1">商号 / 个人称呼 *：</label>
            <input type="text" id="tw-who-name" value="${profile.storeName || profile.name || ''}" placeholder="如：厚德合作社 / 王师傅" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold outline-none focus:border-emerald-700">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">联系电话 / 微信 *：</label>
            <input type="tel" id="tw-who-phone" value="${profile.phone || ''}" placeholder="11位手机号" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono outline-none focus:border-emerald-700">
          </div>
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">协作类型：</label>
          <select id="tw-demand-type" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold outline-none">
            <option value="源头寻货采购">🛒 寻找源头货源采购</option>
            <option value="找人手/专业服务">🛠️ 寻找农机 / 维修 / 劳务服务</option>
            <option value="余缺调剂互换">🔄 余货/闲置设备调剂与置换</option>
            <option value="顺路运力带货">🚚 顺路带货 / 物流共配协作</option>
            <option value="定制凑单开产">🌾 定制加工 / 凑单开产合作</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">具体需求或可提供资源描述 *：</label>
          <textarea id="tw-demand-desc" rows="3" placeholder="例如：需要2台收割机下周三到李家村作业约40亩；或长期采购纯压榨菜籽油..." class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-700"></textarea>
        </div>
      `,
      onConfirm: async (close) => {
        const whoName = document.getElementById('tw-who-name')?.value.trim();
        const whoPhone = document.getElementById('tw-who-phone')?.value.trim();
        const dType = document.getElementById('tw-demand-type')?.value || '双向供需';
        const need = document.getElementById('tw-demand-desc')?.value.trim();

        if (!whoName || !whoPhone) return alert('请填写您的称呼和联系电话！');
        if (!need) return alert('请写明您的需求或服务描述！');

        saveContactProfile({ storeName: whoName, phone: whoPhone });
        const proposerLabel = `${whoName} (${whoPhone})`;
        const { error } = await supabase.from('platform_suggestion_board').insert([{
          proposer_type: 'c2b_demand',
          proposer_name: proposerLabel,
          category: `[全网公域 · ${dType}]`,
          content: `📢【${dType}】${need}`
        }]);
        if (error) return alert('发布失败：' + error.message);
        close();
        alert('✅ 已成功挂榜，相关源头供方或服务人将主动与您对接！');
        window.location.reload();
      }
    });
  };
}
