/**
 * 百工百业 · 五端统一协同与跨端桥接引擎（零原生prompt · 多店合并总账 · 本地文件导出导入 · 安全码自救）
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
    // 忽略隐私模式限制
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

function playBeepSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch {
    // 忽略静音限制
  }
}

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
            isActive ? 'bg-amber-300 text-emerald-950 shadow-2xs' : 'text-emerald-100/80 hover:text-white hover:bg-emerald-800/40'
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

const BRANCH_LIST_KEY = 'baigong_multi_branches_v2';
const ACTIVE_BRANCH_KEY = 'baigong_active_branch_name_v2';
const STAFF_MEMBERS_KEY = 'baigong_store_staff_members_v1';
const ACTIVE_STAFF_KEY = 'baigong_active_staff_member_v1';
const HAS_EXTERNAL_POS_KEY = 'baigong_store_has_external_pos_v1';
const AUTO_CAM_PREF_KEY = 'baigong_store_pos_auto_cam_v1';

let cachedUnifiedStoreProducts = [];
let cachedTenantNameMap = {};

function getBranchesList() {
  try {
    const saved = JSON.parse(localStorage.getItem(BRANCH_LIST_KEY) || '[]');
    if (saved.length > 0) return saved;
  } catch {
    // 忽略异常
  }
  return ['厚德便民门店'];
}

function getActiveBranchName() {
  return (localStorage.getItem(ACTIVE_BRANCH_KEY) || document.getElementById('store-title')?.innerText || '厚德便民门店').trim();
}

function branchKeyFor(baseKey, bName = getActiveBranchName()) {
  return `${baseKey}::${bName}`;
}

function shortenSupplierCompanyName(rawName) {
  const s = String(rawName || '').trim();
  return s.replace(/有限责任公司|股份有限公司|有限公司|供应链管理|商贸|合作社|直供中心/g, '').trim() || s;
}

function readStoreStaffMembers() {
  try {
    const list = JSON.parse(localStorage.getItem(STAFF_MEMBERS_KEY) || '[]');
    if (list.length > 0) return list;
  } catch {
    // 忽略异常
  }
  return [
    { id: 'owner_1', name: '老板', role: '掌柜' },
    { id: 'partner_1', name: '老板娘/合伙人', role: '掌柜' },
    { id: 'clerk_1', name: '当班店员', role: '店员' }
  ];
}

function writeStoreStaffMembers(list) {
  localStorage.setItem(STAFF_MEMBERS_KEY, JSON.stringify(list));
}

function getActiveStaffMember() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_STAFF_KEY) || 'null');
    if (saved && saved.name) return saved;
  } catch {
    // 忽略异常
  }
  return readStoreStaffMembers()[0];
}

function setActiveStaffMember(member) {
  localStorage.setItem(ACTIVE_STAFF_KEY, JSON.stringify(member));
  const lbl = document.getElementById('active-staff-label');
  if (lbl) lbl.innerText = `${member.name} (${member.role})`;
}

// 按门店隔离的本地读写函数
function readPosPaycodeConfig(b = getActiveBranchName()) {
  try {
    return JSON.parse(localStorage.getItem(branchKeyFor('baigong_pos_paycode', b)) || '{}');
  } catch {
    return {};
  }
}
function writePosPaycodeConfig(cfg, b = getActiveBranchName()) {
  localStorage.setItem(branchKeyFor('baigong_pos_paycode', b), JSON.stringify(cfg));
}

function readPosLedgerList(b = getActiveBranchName()) {
  try {
    return JSON.parse(localStorage.getItem(branchKeyFor('baigong_pos_ledger', b)) || '[]');
  } catch {
    return [];
  }
}
function writePosLedgerList(list, b = getActiveBranchName()) {
  localStorage.setItem(branchKeyFor('baigong_pos_ledger', b), JSON.stringify(list));
}

function readStoreExpensesList(b = getActiveBranchName()) {
  try {
    return JSON.parse(localStorage.getItem(branchKeyFor('baigong_store_expenses', b)) || '[]');
  } catch {
    return [];
  }
}
function writeStoreExpensesList(list, b = getActiveBranchName()) {
  localStorage.setItem(branchKeyFor('baigong_store_expenses', b), JSON.stringify(list));
}

function readBarcodeMemoryDb() {
  try {
    return JSON.parse(localStorage.getItem('baigong_store_barcode_memory_v1') || '{}');
  } catch {
    return {};
  }
}
function writeBarcodeMemoryDb(db) {
  localStorage.setItem('baigong_store_barcode_memory_v1', JSON.stringify(db));
}

function readRetailPriceOverrides(b = getActiveBranchName()) {
  try {
    return JSON.parse(localStorage.getItem(branchKeyFor('baigong_retail_overrides', b)) || '{}');
  } catch {
    return {};
  }
}
function writeRetailPriceOverrides(map, b = getActiveBranchName()) {
  localStorage.setItem(branchKeyFor('baigong_retail_overrides', b), JSON.stringify(map));
}

function readCustomSelfProducts(b = getActiveBranchName()) {
  try {
    return JSON.parse(localStorage.getItem(branchKeyFor('baigong_self_products', b)) || '[]');
  } catch {
    return [];
  }
}
function writeCustomSelfProducts(list, b = getActiveBranchName()) {
  localStorage.setItem(branchKeyFor('baigong_self_products', b), JSON.stringify(list));
}

function readShelfLocationsMap(b = getActiveBranchName()) {
  try {
    return JSON.parse(localStorage.getItem(branchKeyFor('baigong_shelf_locations', b)) || '{}');
  } catch {
    return {};
  }
}
function writeShelfLocationsMap(map, b = getActiveBranchName()) {
  localStorage.setItem(branchKeyFor('baigong_shelf_locations', b), JSON.stringify(map));
}

function readCategoryMarkupPcts(b = getActiveBranchName()) {
  try {
    return JSON.parse(localStorage.getItem(branchKeyFor('baigong_cat_markups', b)) || '{}');
  } catch {
    return {};
  }
}
function writeCategoryMarkupPcts(map, b = getActiveBranchName()) {
  localStorage.setItem(branchKeyFor('baigong_cat_markups', b), JSON.stringify(map));
}

function getDefaultMarkupPct(b = getActiveBranchName()) {
  const val = parseFloat(localStorage.getItem(branchKeyFor('baigong_default_markup_pct', b)) || '20');
  return isNaN(val) || val < 0 ? 20 : val;
}
function setDefaultMarkupPct(pct, b = getActiveBranchName()) {
  const clean = Math.max(0, Number(parseFloat(pct || '20').toFixed(1)));
  localStorage.setItem(branchKeyFor('baigong_default_markup_pct', b), String(clean));
  return clean;
}
function getDefaultMarkupRate() {
  return 1 + getDefaultMarkupPct() / 100;
}

function readStoreCreditBook(b = getActiveBranchName()) {
  try {
    return JSON.parse(localStorage.getItem(branchKeyFor('baigong_credit_customers', b)) || '[]');
  } catch {
    return [];
  }
}
function writeStoreCreditBook(list, b = getActiveBranchName()) {
  localStorage.setItem(branchKeyFor('baigong_credit_customers', b), JSON.stringify(list));
}

function readShortageMemos(b = getActiveBranchName()) {
  try {
    return JSON.parse(localStorage.getItem(branchKeyFor('baigong_shortage_memos', b)) || '[]');
  } catch {
    return [];
  }
}
function writeShortageMemos(list, b = getActiveBranchName()) {
  localStorage.setItem(branchKeyFor('baigong_shortage_memos', b), JSON.stringify(list));
  refreshShortageMemoBanner();
}

function readAlertThresholds(b = getActiveBranchName()) {
  try {
    return JSON.parse(localStorage.getItem(branchKeyFor('baigong_alert_thresholds', b)) || '{"lowStock":5,"expiryDays":30}');
  } catch {
    return { lowStock: 5, expiryDays: 30 };
  }
}
function writeAlertThresholds(cfg, b = getActiveBranchName()) {
  localStorage.setItem(branchKeyFor('baigong_alert_thresholds', b), JSON.stringify(cfg));
}

/**
 * 优雅的内嵌安全码验证抽屉（彻底取代 browser prompt，含忘记安全码自救通道）
 */
function requestOwnerPinSheet(actionLabel, onSuccess) {
  const payCfg = readPosPaycodeConfig();
  if (!payCfg.pin) {
    openBridgeSheetModal({
      id: 'modal-setup-owner-pin',
      title: '🔒 首次设置 4 位掌柜安全码',
      subtitle: `用于保护【${actionLabel}】，防止顾客或帮工误看进货底价与毛利`,
      confirmText: '🔒 确认设置并进入',
      bodyHtml: `
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold text-stone-700 mb-1">设置 4 位数字安全码 *：</label>
            <input type="password" maxlength="4" id="init-pin-val" placeholder="如 8888" class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-mono font-bold text-center text-base">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">忘密应急手机后4位 *：</label>
            <input type="text" maxlength="4" id="init-pin-recovery" placeholder="如 6789" class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-mono font-bold text-center text-base">
          </div>
        </div>
      `,
      onConfirm: async (close) => {
        const p = document.getElementById('init-pin-val')?.value.trim();
        const r = document.getElementById('init-pin-recovery')?.value.trim();
        if (!p || p.length !== 4) return alert('请设置 4 位数字安全码！');
        if (!r || r.length !== 4) return alert('请填写 4 位应急手机号尾号，方便忘记密码时自助重置！');
        writePosPaycodeConfig({ ...payCfg, pin: p, recoveryHint: r });
        close();
        onSuccess();
      }
    });
    return;
  }

  openBridgeSheetModal({
    id: 'modal-verify-owner-pin',
    title: '🔒 掌柜安全校验',
    subtitle: `验证通过后进入【${actionLabel}】`,
    confirmText: '🔓 确认验证',
    bodyHtml: `
      <input type="password" maxlength="4" id="verify-pin-input" onkeydown="if(event.key==='Enter') document.getElementById('modal-verify-owner-pin-submit')?.click()" placeholder="请输入 4 位掌柜安全码" class="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-2.5 text-center font-mono text-lg tracking-widest font-bold">
      <div class="text-right">
        <button type="button" onclick="document.getElementById('modal-verify-owner-pin')?.remove(); window.triggerForgotSecurityPinReset();" class="text-[11px] text-emerald-800 underline font-bold">
          忘记安全码？点此应急重置
        </button>
      </div>
    `,
    onConfirm: async (close) => {
      const val = document.getElementById('verify-pin-input')?.value.trim();
      if (val !== String(payCfg.pin)) return alert('❌ 安全码不正确！');
      close();
      onSuccess();
    }
  });
}

function getAllUnifiedProductsMerged() {
  const selfList = readCustomSelfProducts();
  const map = new Map();
  (cachedUnifiedStoreProducts || []).forEach((p) => {
    map.set(p.name, {
      id: p.id || 0,
      tenantId: p.tenant_id || '',
      name: p.name,
      category: p.category || '默认分类',
      spec: p.spec || p.measure_unit || '件',
      imageUrl: p.image_url || '',
      supplierShortName: p.supplierShortName || '合作供货方',
      costPrice: parseFloat(p.tier_1_price || 0),
      localStock: null,
      expiryDate: ''
    });
  });
  selfList.forEach((sp) => {
    const existing = map.get(sp.name);
    map.set(sp.name, {
      id: existing?.id || 0,
      tenantId: existing?.tenantId || '',
      name: sp.name,
      category: sp.category || existing?.category || '本地自采',
      spec: sp.spec || existing?.spec || '件',
      imageUrl: existing?.imageUrl || '',
      supplierShortName: sp.supplierShortName || existing?.supplierShortName || '本地自采',
      costPrice: sp.costPrice !== undefined ? Number(sp.costPrice) : existing?.costPrice || 0,
      localStock: sp.stock !== undefined ? Number(sp.stock) : null,
      expiryDate: sp.expiryDate || '',
      barcode: sp.barcode || ''
    });
  });
  return Array.from(map.values());
}

/**
 * 自动扫描低库存与临期预警，合并进预警名单
 */
function computeEffectiveAlertsList() {
  const manualList = readShortageMemos();
  const manualMap = new Map(manualList.map((x) => [x.name, x]));
  const thresholds = readAlertThresholds();
  const unified = getAllUnifiedProductsMerged();
  const nowTs = Date.now();

  unified.forEach((item) => {
    if (manualMap.has(item.name)) return;
    if (item.localStock !== null && item.localStock <= Number(thresholds.lowStock ?? 5)) {
      manualMap.set(item.name, {
        name: item.name,
        supplierName: item.supplierShortName,
        tag: `剩${item.localStock}件`,
        auto: true
      });
    } else if (item.expiryDate) {
      const expTs = new Date(item.expiryDate).getTime();
      const daysLeft = Math.ceil((expTs - nowTs) / (1000 * 86400));
      if (!isNaN(daysLeft) && daysLeft <= Number(thresholds.expiryDays ?? 30)) {
        manualMap.set(item.name, {
          name: item.name,
          supplierName: item.supplierShortName,
          tag: daysLeft <= 0 ? '已到期' : `${daysLeft}天后到期`,
          auto: true
        });
      }
    }
  });
  return Array.from(manualMap.values());
}

function refreshShortageMemoBanner() {
  const list = computeEffectiveAlertsList();
  const strip = document.getElementById('store-shortage-memo-strip');
  const txtEl = document.getElementById('store-shortage-memo-text');
  if (!strip || !txtEl) return;
  if (list.length > 0) {
    txtEl.innerText = `📌 缺货/临期预警 (${list.length}项)：${list.slice(0, 3).map((x) => `${x.name}[${x.tag}]`).join('、')}`;
    strip.classList.remove('hidden');
  } else {
    strip.classList.add('hidden');
  }
}

function applyStorePosModeLayout() {
  const hasExternalPos = localStorage.getItem(HAS_EXTERNAL_POS_KEY) === '1';
  const posBtn = document.getElementById('btn-home-pos-entry');
  const shortageBtn = document.getElementById('btn-home-shortage-order');
  if (posBtn && shortageBtn) {
    posBtn.classList.toggle('hidden', hasExternalPos);
    shortageBtn.classList.toggle('hidden', !hasExternalPos);
  }
}

function resolveSmartRetailPrice(itemName, costPrice = 0, barcode = '', category = '') {
  const cleanName = String(itemName || '').trim();
  const overrides = readRetailPriceOverrides();
  if (cleanName && overrides[cleanName] && Number(overrides[cleanName].retailPrice) > 0) {
    return {
      retailPrice: Number(overrides[cleanName].retailPrice),
      costPrice: Number(overrides[cleanName].costPrice || costPrice || 0),
      priceSource: '单品锁定'
    };
  }
  if (barcode) {
    const bdb = readBarcodeMemoryDb();
    if (bdb[barcode] && Number(bdb[barcode].price) > 0) {
      return {
        retailPrice: Number(bdb[barcode].price),
        costPrice: Number(bdb[barcode].costPrice || costPrice || 0),
        priceSource: '条码记忆'
      };
    }
  }
  const cPrice = Number(costPrice || 0);
  if (cPrice > 0) {
    const catMap = readCategoryMarkupPcts();
    const hasCatPct = category && catMap[category] !== undefined && catMap[category] !== '';
    const pct = hasCatPct ? Number(catMap[category]) : getDefaultMarkupPct();
    const calc = Number((cPrice * (1 + pct / 100)).toFixed(1));
    return {
      retailPrice: calc,
      costPrice: cPrice,
      priceSource: hasCatPct ? `${category}+${pct}%` : `默认+${pct}%`
    };
  }
  return { retailPrice: 0, costPrice: 0, priceSource: '待定价' };
}

function refreshStoreCreditBadgeOnly() {
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
  refreshShortageMemoBanner();
  applyStorePosModeLayout();
}

function bindNativeStoreCounterPosBindings() {
  let cameraStream = null;
  let selectedPayMethod = '微信/支付宝';
  let currentEntryMode = 'scan';
  let scannedBasket = [];

  // 全局空白处点击自动收起所有顶部下拉浮层（解决图一一直挡住界面的问题）
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target.closest?.('[data-dropdown-root]')) {
      document.getElementById('multi-branch-dropdown')?.classList.add('hidden');
      document.getElementById('active-staff-dropdown')?.classList.add('hidden');
      document.getElementById('left-nav-menu')?.classList.add('hidden');
      document.getElementById('right-nav-menu')?.classList.add('hidden');
    }
  });

  window.toggleMultiBranchDropdown = function (e) {
    e?.stopPropagation();
    const dd = document.getElementById('multi-branch-dropdown');
    if (!dd) return;
    const willShow = dd.classList.contains('hidden');
    document.getElementById('active-staff-dropdown')?.classList.add('hidden');
    document.getElementById('left-nav-menu')?.classList.add('hidden');
    document.getElementById('right-nav-menu')?.classList.add('hidden');
    if (willShow) {
      const list = getBranchesList();
      const cur = getActiveBranchName();
      const host = document.getElementById('multi-branch-list');
      if (host) {
        host.innerHTML = list
          .map(
            (name) => `
            <button type="button" onclick="window.switchActiveBranch('${String(name).replace(/'/g, '')}')" class="w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between ${name === cur ? 'bg-emerald-50 text-emerald-950 font-bold' : 'hover:bg-stone-50 text-stone-700'}">
              <span class="truncate">🏪 ${name}</span>
              ${name === cur ? '<span class="text-[10px] text-emerald-700">当前</span>' : ''}
            </button>`
          )
          .join('');
      }
      dd.classList.remove('hidden');
    } else {
      dd.classList.add('hidden');
    }
  };

  window.switchActiveBranch = function (name) {
    const titleEl = document.getElementById('store-title');
    if (titleEl) titleEl.innerText = name;
    localStorage.setItem(ACTIVE_BRANCH_KEY, name);
    document.getElementById('multi-branch-dropdown')?.classList.add('hidden');
    refreshStoreCreditBadgeOnly();
  };

  // 内嵌表单抽屉新增分店（彻底告别图二浏览器原生 prompt 丑弹窗）
  window.openAddBranchDrawer = function () {
    document.getElementById('multi-branch-dropdown')?.classList.add('hidden');
    openBridgeSheetModal({
      id: 'modal-add-store-branch',
      title: '🏪 新增分店 / 独立收货点',
      subtitle: '各分店收银流水、熟客赊账、收款码与商品调价独立隔离',
      confirmText: '✅ 创建并切换到该门店',
      bodyHtml: `
        <div>
          <label class="block font-bold text-stone-700 mb-1">分店 / 收货点名称 *：</label>
          <input type="text" id="new-branch-name" placeholder="如：厚德二店 / 城南工地仓" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold text-stone-700 mb-1">店长/接货人：</label>
            <input type="text" id="new-branch-contact" placeholder="如：王掌柜" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">收货地址：</label>
            <input type="text" id="new-branch-addr" placeholder="街道/村镇位置" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
          </div>
        </div>
      `,
      onConfirm: async (close) => {
        const clean = document.getElementById('new-branch-name')?.value.trim();
        if (!clean) return alert('请输入分店名称！');
        const list = getBranchesList();
        if (!list.includes(clean)) list.push(clean);
        localStorage.setItem(BRANCH_LIST_KEY, JSON.stringify(list));
        window.switchActiveBranch(clean);
        close();
      }
    });
  };

  window.toggleActiveStaffDropdown = function (e) {
    e?.stopPropagation();
    const dd = document.getElementById('active-staff-dropdown');
    if (!dd) return;
    const willShow = dd.classList.contains('hidden');
    document.getElementById('multi-branch-dropdown')?.classList.add('hidden');
    document.getElementById('left-nav-menu')?.classList.add('hidden');
    document.getElementById('right-nav-menu')?.classList.add('hidden');
    if (willShow) {
      const members = readStoreStaffMembers();
      const cur = getActiveStaffMember();
      const host = document.getElementById('active-staff-list');
      if (host) {
        host.innerHTML = members
          .map(
            (m) => `
            <button type="button" onclick="window.selectActiveStaffMember('${m.id}')" class="w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between ${m.id === cur.id ? 'bg-emerald-50 text-emerald-950 font-bold' : 'hover:bg-stone-50 text-stone-700'}">
              <span>👤 ${m.name} <small class="text-stone-400">(${m.role})</small></span>
              ${m.id === cur.id ? '<span class="text-[10px] text-emerald-700">✓</span>' : ''}
            </button>`
          )
          .join('');
      }
      dd.classList.remove('hidden');
    } else {
      dd.classList.add('hidden');
    }
  };

  window.selectActiveStaffMember = function (memberId) {
    const hit = readStoreStaffMembers().find((m) => m.id === memberId);
    if (hit) setActiveStaffMember(hit);
    document.getElementById('active-staff-dropdown')?.classList.add('hidden');
  };

  window.lockStoreCounterScreen = function () {
    const payCfg = readPosPaycodeConfig();
    if (!payCfg.pin) {
      requestOwnerPinSheet('锁屏保护', () => window.lockStoreCounterScreen());
      return;
    }
    const titleEl = document.getElementById('lock-screen-store-title');
    if (titleEl) titleEl.innerText = `${getActiveBranchName()} · 柜台已锁屏`;
    const inp = document.getElementById('unlock-screen-pin-input');
    if (inp) inp.value = '';
    document.getElementById('store-screen-lock-overlay')?.classList.remove('hidden');
  };

  window.unlockStoreCounterScreen = function () {
    const payCfg = readPosPaycodeConfig();
    const val = document.getElementById('unlock-screen-pin-input')?.value.trim() || '';
    if (val !== String(payCfg.pin)) return alert('❌ 安全码不正确！');
    document.getElementById('store-screen-lock-overlay')?.classList.add('hidden');
  };

  // 忘记安全码自救重置抽屉
  window.triggerForgotSecurityPinReset = function () {
    const payCfg = readPosPaycodeConfig();
    openBridgeSheetModal({
      id: 'modal-forgot-pin-reset',
      title: '🔑 掌柜安全码应急重置',
      subtitle: '验证预留应急手机后4位后，可直接设置新的 4 位安全码',
      confirmText: '✅ 验证并重设安全码',
      bodyHtml: `
        <div>
          <label class="block font-bold text-stone-700 mb-1">请输入预留的掌柜应急手机后4位 *：</label>
          <input type="text" maxlength="4" id="fp-recovery-check" placeholder="输入4位应急尾号" class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-mono font-bold text-center text-base">
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">设置新的 4 位数字安全码 *：</label>
          <input type="password" maxlength="4" id="fp-new-pin" placeholder="输入新的4位数字安全码" class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-mono font-bold text-center text-base">
        </div>
      `,
      onConfirm: async (close) => {
        const rec = document.getElementById('fp-recovery-check')?.value.trim();
        const nextPin = document.getElementById('fp-new-pin')?.value.trim();
        if (payCfg.recoveryHint && rec !== String(payCfg.recoveryHint)) {
          return alert('❌ 应急手机后4位不匹配！');
        }
        if (!nextPin || nextPin.length !== 4) return alert('请输入 4 位新数字安全码！');
        writePosPaycodeConfig({ ...payCfg, pin: nextPin });
        document.getElementById('store-screen-lock-overlay')?.classList.add('hidden');
        close();
        alert('✅ 掌柜安全码已成功重置！');
      }
    });
  };

  window.triggerRepeatOrderWithTip = function () {
    if (typeof window.repeatLastOrder === 'function') {
      window.repeatLastOrder();
      setTimeout(() => {
        alert('✅ 已将上次进货清单载入底部进货篮！\n您可直接在当前货架继续点「+」「-」加购或调整数量，核对无误后点底部「提交进货凭单」。');
      }, 300);
    }
  };

  window.stopStorePosCamera = function () {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    document.getElementById('pos-barcode-video')?.classList.add('hidden');
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
    if (currentEntryMode === 'scan') {
      const sumRetail = scannedBasket.reduce((s, it) => s + it.retailPrice * it.qty, 0);
      if (amtInput) amtInput.value = sumRetail > 0 ? sumRetail.toFixed(2) : '';
    }
    window.refreshStorePosRoundBtn();
    window.calcStoreCashChange();
  }

  function renderScannedBasketList() {
    const host = document.getElementById('pos-scanned-basket-list');
    if (!host) return;
    if (scannedBasket.length === 0) {
      host.innerHTML = '<div class="text-center text-stone-400 py-3 text-[11px]">扫商品条码或点上方热卖商品自动计价</div>';
      recalcScannedBasketTotals();
      return;
    }
    host.innerHTML = scannedBasket
      .map(
        (it, idx) => `
        <div class="bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <b class="text-stone-900 truncate block">${it.name}</b>
            <span class="text-[11px] text-emerald-900 font-mono font-bold">零售单价：¥${it.retailPrice.toFixed(2)}</span>
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

  function pushProductToScannedBasket({ name, costPrice = 0, barcode = '', category = '' }) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    const resolved = resolveSmartRetailPrice(cleanName, costPrice, barcode, category);
    const hitIdx = scannedBasket.findIndex((x) => x.name === cleanName);
    if (hitIdx >= 0) {
      scannedBasket[hitIdx].qty += 1;
    } else {
      scannedBasket.unshift({
        barcode,
        name: cleanName,
        costPrice: resolved.costPrice,
        retailPrice: resolved.retailPrice,
        qty: 1
      });
    }
    playBeepSound();
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

    const unified = getAllUnifiedProductsMerged();
    const catalogExtras = unified
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
        const prod = unified.find((p) => p.name === n);
        const cost = parseFloat(prod?.costPrice || 0);
        const info = resolveSmartRetailPrice(n, cost, '', prod?.category || '');
        return `<button type="button" onclick="window.quickPickHotItemToPos('${String(n).replace(/'/g, '')}', ${cost}, '${String(prod?.category || '').replace(/'/g, '')}')" class="bg-stone-100 hover:bg-amber-100 text-stone-800 border border-stone-200 px-2.5 py-1 rounded-xl whitespace-nowrap text-[10px] font-bold shrink-0">
          + ${n}${info.retailPrice > 0 ? ` ¥${info.retailPrice}` : ''}
        </button>`;
      })
      .join('');
  }

  window.quickPickHotItemToPos = function (name, costPrice, category = '') {
    pushProductToScannedBasket({ name, costPrice, category });
  };

  window.refreshStorePosRoundBtn = function () {
    const amtInput = document.getElementById('pos-collect-amt');
    const roundBtn = document.getElementById('btn-pos-round-down');
    const val = parseFloat(amtInput?.value || '0');
    const fl = Math.floor(val);
    if (roundBtn) {
      if (val > fl && fl > 0) {
        roundBtn.innerText = `✂️ 抹零收 ¥${fl}`;
        roundBtn.classList.remove('hidden');
      } else {
        roundBtn.classList.add('hidden');
      }
    }
    window.calcStoreCashChange();
  };

  window.calcStoreCashChange = function () {
    const due = parseFloat(document.getElementById('pos-collect-amt')?.value || '0');
    const tendered = parseFloat(document.getElementById('pos-cash-tendered')?.value || '0');
    const resEl = document.getElementById('pos-cash-change-result');
    if (!resEl) return;
    resEl.innerText = tendered > 0 && tendered >= due ? `¥${(tendered - due).toFixed(2)}` : '¥0.00';
  };

  window.applyStorePosRoundDown = function () {
    const amtInput = document.getElementById('pos-collect-amt');
    const fl = Math.floor(parseFloat(amtInput?.value || '0'));
    if (fl > 0 && amtInput) {
      amtInput.value = fl.toFixed(2);
      document.getElementById('btn-pos-round-down')?.classList.add('hidden');
      window.calcStoreCashChange();
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
    const cashBox = document.getElementById('pos-cash-change-box');
    creditBox?.classList.toggle('hidden', methodName !== '熟客记账');
    cashBox?.classList.toggle('hidden', methodName !== '现金');
    if (methodName === '熟客记账') {
      const dl = document.getElementById('pos-saved-customers-list');
      if (dl) {
        dl.innerHTML = readStoreCreditBook()
          .map((c) => `<option value="${c.name}">`)
          .join('');
      }
    }
  };

  const handleRecognizedBarcodeOrQuery = (rawCodeOrName) => {
    const query = String(rawCodeOrName || '').trim();
    if (!query) return;

    const db = readBarcodeMemoryDb();
    if (db[query]) {
      const hit = db[query];
      pushProductToScannedBasket({ name: hit.name, costPrice: hit.costPrice || 0, barcode: query });
      return;
    }

    const unified = getAllUnifiedProductsMerged();
    const matchedCatalog = unified.find(
      (p) => p.name && (p.name.includes(query) || query.includes(p.name))
    );
    if (matchedCatalog) {
      pushProductToScannedBasket({
        name: matchedCatalog.name,
        costPrice: Number(matchedCatalog.costPrice || 0),
        barcode: /^\d{6,}$/.test(query) ? query : '',
        category: matchedCatalog.category || ''
      });
      if (/^\d{6,}$/.test(query)) {
        const info = resolveSmartRetailPrice(
          matchedCatalog.name,
          Number(matchedCatalog.costPrice || 0),
          '',
          matchedCatalog.category || ''
        );
        db[query] = { name: matchedCatalog.name, price: info.retailPrice, costPrice: info.costPrice };
        writeBarcodeMemoryDb(db);
      }
      return;
    }

    // 未建档条码/商品：弹出优雅内嵌建档表单抽屉（零 prompt）
    window.stopStorePosCamera();
    const isDigits = /^\d{5,}$/.test(query);
    window.openInlineProductFormDrawer({
      prefillBarcode: isDigits ? query : '',
      prefillName: isDigits ? '' : query,
      onSaved: (savedItem) => {
        pushProductToScannedBasket({
          name: savedItem.name,
          costPrice: savedItem.costPrice,
          barcode: savedItem.barcode,
          category: savedItem.category
        });
      }
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

  async function startCameraStreamInternal() {
    const video = document.getElementById('pos-barcode-video');
    const toggleBtn = document.getElementById('btn-toggle-pos-cam');
    if (!navigator.mediaDevices?.getUserMedia || !video) return;

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = cameraStream;
      video.classList.remove('hidden');
      if (toggleBtn) toggleBtn.innerText = '关闭相机';
      localStorage.setItem(AUTO_CAM_PREF_KEY, '1');

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
              if (rawVal === lastScanCode && now - lastScanTs < 1800) return;
              lastScanCode = rawVal;
              lastScanTs = now;
              handleRecognizedBarcodeOrQuery(rawVal);
            }
          } catch {
            // 忽略单帧波动
          }
        }, 450);
      }
    } catch {
      // 未授权时保留下方输入框兜底
    }
  }

  window.toggleStorePosCamera = async function () {
    if (cameraStream) {
      localStorage.setItem(AUTO_CAM_PREF_KEY, '0');
      window.stopStorePosCamera();
      return;
    }
    await startCameraStreamInternal();
  };

  function renderStorePosModalState() {
    const storeName = getActiveBranchName();
    const payCfg = readPosPaycodeConfig();
    const todayStr = new Date().toISOString().slice(0, 10);
    const allRows = readPosLedgerList();
    const todayValid = allRows.filter((r) => !r.voided && String(r.createdAt || '').startsWith(todayStr));
    const todayTotal = todayValid.reduce((s, r) => s + Number(r.amount || 0), 0);
    const todayActualPaid = todayValid
      .filter((r) => r.method !== '熟客记账')
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const todayCredit = todayValid
      .filter((r) => r.method === '熟客记账')
      .reduce((s, r) => s + Number(r.amount || 0), 0);

    const countBadge = document.getElementById('pos-today-count-badge');
    if (countBadge) countBadge.innerText = String(todayValid.length);
    const sumTotalEl = document.getElementById('pos-sum-total');
    if (sumTotalEl) sumTotalEl.innerText = `¥${todayTotal.toFixed(2)}`;
    const sumDigEl = document.getElementById('pos-sum-digital');
    if (sumDigEl) sumDigEl.innerText = `¥${todayActualPaid.toFixed(2)}`;
    const sumCredEl = document.getElementById('pos-sum-credit');
    if (sumCredEl) sumCredEl.innerText = `¥${todayCredit.toFixed(2)}`;

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
                  <span class="text-[10px] text-stone-500 block">${String(r.createdAt || '').slice(11, 16)} · ${r.method}${r.customerName ? ` (${r.customerName})` : ''}${r.staffName ? ` · 经手:${r.staffName}` : ''}</span>
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
    requestOwnerPinSheet('更换/关联本店收款码', () => {
      document.getElementById('pos-paycode-editor')?.classList.remove('hidden');
    });
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
    const recHint = document.getElementById('pos-recovery-hint')?.value.trim();
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
      recoveryHint: recHint || payCfg.recoveryHint || '',
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
    const activeStaff = getActiveStaffMember();

    if (currentEntryMode === 'scan' && scannedBasket.length > 0) {
      itemDesc = scannedBasket.map((it) => `${it.name}${it.qty > 1 ? `×${it.qty}` : ''}`).join('、');
      const totalCost = scannedBasket.reduce((s, it) => s + it.costPrice * it.qty, 0);
      estProfit = totalCost > 0 ? amt - totalCost : amt * (1 - 1 / rate);

      // 自动扣减在库商品本地库存（若低于预警线自动触发预警）
      const selfList = readCustomSelfProducts();
      let stockChanged = false;
      scannedBasket.forEach((sold) => {
        const hit = selfList.find((sp) => sp.name === sold.name && sp.stock !== undefined);
        if (hit) {
          hit.stock = Math.max(0, Number(hit.stock) - sold.qty);
          stockChanged = true;
        }
      });
      if (stockChanged) writeCustomSelfProducts(selfList);
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
        amount: Number(amt.toFixed(2)),
        staffName: activeStaff.name
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
      staffName: activeStaff.name,
      voided: false,
      createdAt: new Date().toISOString()
    });
    writePosLedgerList(list);

    scannedBasket = [];
    if (amtInput) amtInput.value = '';
    const cashInp = document.getElementById('pos-cash-tendered');
    if (cashInp) cashInp.value = '';
    refreshStoreCreditBadgeOnly();
    window.closeStoreCounterPosModal();
    alert(`✅ 收款已入账：${itemDesc} ¥${amt.toFixed(2)}（${selectedPayMethod} · 经手：${activeStaff.name}）`);
  };

  window.voidStorePosEntry = function (targetId) {
    requestOwnerPinSheet('作废历史流水', () => {
      const activeStaff = getActiveStaffMember();
      const list = readPosLedgerList().map((r) =>
        Number(r.id) === Number(targetId) ? { ...r, voided: true, voidedBy: activeStaff.name } : r
      );
      writePosLedgerList(list);
      refreshStoreCreditBadgeOnly();
      renderStorePosModalState();
    });
  };

  window.openStoreCounterPosModal = function () {
    scannedBasket = [];
    renderHotItemQuickChips();
    renderScannedBasketList();
    renderStorePosModalState();
    window.switchStorePosTab('collect');
    window.setStorePosEntryMode('scan');
    document.getElementById('modal-store-counter-pos')?.classList.remove('hidden');
    if (localStorage.getItem(AUTO_CAM_PREF_KEY) === '1') {
      startCameraStreamInternal();
    }
  };

  /**
   * 掌柜内账 · 盈利与全部分店汇总看板（受 4 位安全锁保护）
   */
  window.openStoreBusinessReportModal = function () {
    requestOwnerPinSheet('查看掌柜盈利内账与多店汇总', () => {
      const curBranch = getActiveBranchName();
      const allBranches = getBranchesList();
      const todayStr = new Date().toISOString().slice(0, 10);

      const calcBranchStats = (bName) => {
        const rows = readPosLedgerList(bName).filter((r) => !r.voided && String(r.createdAt || '').startsWith(todayStr));
        const sales = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
        const gross = rows.reduce((s, r) => s + Number(r.profit || 0), 0);
        const exp = readStoreExpensesList(bName)
          .filter((e) => String(e.createdAt || '').startsWith(todayStr))
          .reduce((s, e) => s + Number(e.amount || 0), 0);
        const cash = rows.filter((r) => r.method === '现金').reduce((s, r) => s + Number(r.amount || 0), 0);
        const digital = rows.filter((r) => r.method === '微信/支付宝').reduce((s, r) => s + Number(r.amount || 0), 0);
        const credit = rows.filter((r) => r.method === '熟客记账').reduce((s, r) => s + Number(r.amount || 0), 0);
        return { bName, count: rows.length, sales, gross, exp, net: gross - exp, cash, digital, credit, rows };
      };

      const curStat = calcBranchStats(curBranch);
      const multiSummaryHtml =
        allBranches.length > 1
          ? `<div class="space-y-1.5 pt-1 border-t border-stone-100">
               <b class="text-stone-700 text-[11px] block">🏢 名下全部分店今日合并总览 (${allBranches.length}家)：</b>
               ${allBranches
                 .map((bn) => {
                   const st = calcBranchStats(bn);
                   return `<div class="flex justify-between items-center text-[11px] bg-emerald-50/60 px-2.5 py-1.5 rounded-xl border border-emerald-200">
                     <b>🏪 ${bn}</b>
                     <span class="font-mono">收 ¥${st.sales.toFixed(0)} ｜ 净赚 <b class="text-emerald-900">+¥${st.net.toFixed(0)}</b></span>
                   </div>`;
                 })
                 .join('')}
             </div>`
          : '';

      const staffShiftMap = {};
      curStat.rows.forEach((r) => {
        const sName = r.staffName || '老板';
        if (!staffShiftMap[sName]) staffShiftMap[sName] = { count: 0, cash: 0, digital: 0 };
        staffShiftMap[sName].count += 1;
        if (r.method === '现金') staffShiftMap[sName].cash += Number(r.amount || 0);
        else staffShiftMap[sName].digital += Number(r.amount || 0);
      });

      const shiftLinesHtml =
        Object.keys(staffShiftMap).length === 0
          ? '<p class="text-[10px] text-stone-400">今日暂无交接班收款记录</p>'
          : Object.keys(staffShiftMap)
              .map((sName) => {
                const st = staffShiftMap[sName];
                return `<div class="flex justify-between items-center text-[11px] bg-stone-50 px-2.5 py-1.5 rounded-xl border border-stone-200">
                  <b>👤 ${sName} (${st.count}笔)</b>
                  <span class="font-mono">现金 ¥${st.cash.toFixed(0)} ｜ 扫码 ¥${st.digital.toFixed(0)}</span>
                </div>`;
              })
              .join('');

      openBridgeSheetModal({
        id: 'modal-store-business-report',
        title: `📊 ${curBranch} · 掌柜内账与多店汇总`,
        subtitle: `今日杂费已扣减 ¥${curStat.exp.toFixed(2)} · 仅掌柜可见`,
        confirmText: '📋 复制日终战报与交接单发微信',
        bodyHtml: `
          <div class="bg-gradient-to-br from-[#1b4332] to-[#143628] text-white rounded-2xl p-4 space-y-3">
            <div class="grid grid-cols-2 gap-3 text-center">
              <div class="bg-white/10 rounded-xl p-2.5">
                <span class="text-[10px] text-emerald-200 block">今日零售总额</span>
                <b class="text-lg font-mono text-amber-300">¥${curStat.sales.toFixed(2)}</b>
              </div>
              <div class="bg-white/10 rounded-xl p-2.5">
                <span class="text-[10px] text-emerald-200 block">扣杂费后今日净赚</span>
                <b class="text-lg font-mono text-emerald-300">${curStat.net >= 0 ? '+' : ''}¥${curStat.net.toFixed(2)}</b>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-1.5 text-center text-[11px] pt-1 border-t border-emerald-700/60">
              <div><span class="text-emerald-200/70 block text-[9px]">扫码实收</span><b class="font-mono">¥${curStat.digital.toFixed(2)}</b></div>
              <div><span class="text-emerald-200/70 block text-[9px]">抽屉现金</span><b class="font-mono">¥${curStat.cash.toFixed(2)}</b></div>
              <div><span class="text-emerald-200/70 block text-[9px]">新增赊账</span><b class="font-mono text-amber-200">¥${curStat.credit.toFixed(2)}</b></div>
            </div>
          </div>
          ${multiSummaryHtml}
          <div class="space-y-1.5">
            <div class="flex justify-between items-center">
              <b class="text-stone-700 text-[11px]">🔄 当班成员交接清点明细：</b>
              <button type="button" onclick="document.getElementById('modal-store-business-report')?.remove(); window.openStoreExpenseQuickModal();" class="text-rose-700 font-bold underline text-[10px]">+ 记杂费</button>
            </div>
            ${shiftLinesHtml}
          </div>
        `,
        onConfirm: async (close) => {
          const msg = `🧾【${curBranch} · 掌柜日终内账小结】(${todayStr})\n• 今日零售总额：¥${curStat.sales.toFixed(2)}（共 ${curStat.count} 笔）\n• 扫码实收：¥${curStat.digital.toFixed(2)} ｜ 抽屉现金：¥${curStat.cash.toFixed(2)} ｜ 新增赊账：¥${curStat.credit.toFixed(2)}\n• 销售毛利：¥${curStat.gross.toFixed(2)} ｜ 日常杂费：-¥${curStat.exp.toFixed(2)}\n• 今日到手净赚：¥${curStat.net.toFixed(2)}`;
          navigator.clipboard?.writeText(msg);
          alert(`✅ 掌柜内账与交接小结已复制！\n\n${msg}`);
          close();
        }
      });
    });
  };

  window.openStoreExpenseQuickModal = function () {
    openBridgeSheetModal({
      id: 'modal-store-expense-quick',
      title: '💸 记一笔门店日常杂费',
      subtitle: '自动从今日毛利中扣除，月末算净赚更真实',
      confirmText: '✅ 记入本店杂费',
      bodyHtml: `
        <div>
          <label class="block font-bold text-stone-700 mb-1">杂费用途：</label>
          <select id="exp-type-sel" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
            <option value="包装耗材/塑料袋">🛍️ 包装耗材 / 塑料袋</option>
            <option value="水电/燃气/网费">⚡ 水电 / 燃气 / 网费</option>
            <option value="零工/搬运/运费">🚚 零工 / 搬运 / 运费</option>
            <option value="店内餐饮/其他杂支">🍵 店内日常其他杂支</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">支出金额 (元) *：</label>
          <input type="number" step="0.01" id="exp-amt-inp" placeholder="0.00" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold text-lg text-rose-700">
        </div>
      `,
      onConfirm: async (close) => {
        const title = document.getElementById('exp-type-sel')?.value || '日常杂费';
        const amt = parseFloat(document.getElementById('exp-amt-inp')?.value || '0');
        if (isNaN(amt) || amt <= 0) return alert('请输入有效的支出金额！');
        const list = readStoreExpensesList();
        list.unshift({
          id: Date.now(),
          title,
          amount: Number(amt.toFixed(2)),
          staffName: getActiveStaffMember().name,
          createdAt: new Date().toISOString()
        });
        writeStoreExpensesList(list);
        close();
        alert(`✅ 已记入今日杂费：${title} ¥${amt.toFixed(2)}`);
      }
    });
  };

  /**
   * 内嵌表单抽屉：扫码建档 / 录自采商品 / 编辑展架与预警（零 prompt）
   */
  window.openInlineProductFormDrawer = function ({ prefillBarcode = '', prefillName = '', editItem = null, onSaved = null } = {}) {
    const unified = getAllUnifiedProductsMerged();
    const existCats = Array.from(new Set(['烟酒饮料', '粮油调味', '休闲零食', '日用百货', '本地自采', ...unified.map((p) => p.category).filter(Boolean)]));
    const shelfMap = readShelfLocationsMap();
    const curName = editItem?.name || prefillName;
    const curCost = editItem ? editItem.costPrice : '';
    const curRetail = editItem ? resolveSmartRetailPrice(editItem.name, editItem.costPrice, '', editItem.category).retailPrice : '';
    const curStock = editItem?.localStock !== null && editItem?.localStock !== undefined ? editItem.localStock : '10';
    const curShelf = editItem ? shelfMap[editItem.name] || '' : '';
    const curExp = editItem?.expiryDate || '';

    openBridgeSheetModal({
      id: 'modal-inline-product-editor',
      title: editItem ? `✎ 编辑商品：${editItem.name}` : '📦 扫码/录入本店商品档案',
      subtitle: '填一次永久记忆 · 支持条码、分类、库存预警、展架位与到期日',
      confirmText: '✅ 保存商品档案',
      bodyHtml: `
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold text-stone-700 mb-1">商品条码 (可选)：</label>
            <input type="text" id="ipe-barcode" value="${editItem?.barcode || prefillBarcode}" placeholder="扫码或手填条码" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">所属类别 *：</label>
            <input type="text" id="ipe-category" list="ipe-cat-list" value="${editItem?.category || '本地自采'}" placeholder="选或填新类别" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-bold">
            <datalist id="ipe-cat-list">${existCats.map((c) => `<option value="${c}">`).join('')}</datalist>
          </div>
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">商品名称与规格 *：</label>
          <input type="text" id="ipe-name" value="${curName}" placeholder="如：农家土鸡蛋 30枚/箱" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block font-bold text-stone-700 mb-1">进货成本(元)：</label>
            <input type="number" step="0.01" id="ipe-cost" value="${curCost}" placeholder="0.00" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">零售单价(元) *：</label>
            <input type="number" step="0.01" id="ipe-retail" value="${curRetail}" placeholder="0.00" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono font-bold text-emerald-950">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">当前库存数：</label>
            <input type="number" id="ipe-stock" value="${curStock}" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono font-bold">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold text-stone-700 mb-1">展架摆放位置：</label>
            <input type="text" id="ipe-shelf" value="${curShelf}" placeholder="如：冰柜2层/进门架" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">保质到期日 (预警用)：</label>
            <input type="date" id="ipe-expiry" value="${curExp}" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono">
          </div>
        </div>
      `,
      onConfirm: async (close) => {
        const barcode = document.getElementById('ipe-barcode')?.value.trim() || '';
        const category = document.getElementById('ipe-category')?.value.trim() || '本地自采';
        const name = document.getElementById('ipe-name')?.value.trim() || '';
        const costPrice = parseFloat(document.getElementById('ipe-cost')?.value || '0') || 0;
        const retailPrice = parseFloat(document.getElementById('ipe-retail')?.value || '0') || 0;
        const stock = parseInt(document.getElementById('ipe-stock')?.value || '0', 10);
        const shelf = document.getElementById('ipe-shelf')?.value.trim() || '';
        const expiryDate = document.getElementById('ipe-expiry')?.value || '';

        if (!name) return alert('请填写商品名称！');
        if (retailPrice <= 0) return alert('请填写有效的零售单价！');

        const selfList = readCustomSelfProducts();
        const idx = selfList.findIndex((x) => x.name === name);
        const record = {
          name,
          category,
          spec: editItem?.spec || '件',
          supplierShortName: editItem?.supplierShortName || '本地自采',
          costPrice,
          stock: isNaN(stock) ? 0 : stock,
          expiryDate,
          barcode
        };
        if (idx >= 0) selfList[idx] = record;
        else selfList.unshift(record);
        writeCustomSelfProducts(selfList);

        const ov = readRetailPriceOverrides();
        ov[name] = { retailPrice, costPrice };
        writeRetailPriceOverrides(ov);

        if (barcode) {
          const bdb = readBarcodeMemoryDb();
          bdb[barcode] = { name, price: retailPrice, costPrice };
          writeBarcodeMemoryDb(bdb);
        }
        if (shelf) {
          const sm = readShelfLocationsMap();
          sm[name] = shelf;
          writeShelfLocationsMap(sm);
        }

        refreshShortageMemoBanner();
        close();
        if (onSaved) onSaved(record);
        else if (document.getElementById('modal-store-product-catalog')) window.renderUnifiedStoreCatalogList();
      }
    });
  };

  /**
   * 本店商品总库（扫码检索建档 + 按类别通调价 + 单品调价 + 预警规则配置 + 按供货方一键加入订货单 + 打印价签）
   */
  window.openStoreProductCatalogModal = function (initialFilterMode = 'all') {
    requestOwnerPinSheet('进入本店商品总库与调价视图', () => {
      const curDefaultPct = getDefaultMarkupPct();
      const unified = getAllUnifiedProductsMerged();
      const thresholds = readAlertThresholds();

      const categories = Array.from(new Set(unified.map((p) => p.category || '默认分类').filter(Boolean)));
      const suppliers = Array.from(new Set(unified.map((p) => p.supplierShortName).filter(Boolean)));

      const catOptions = [
        '<option value="__ALL__">全店所有类别</option>',
        ...categories.map((c) => `<option value="${c}">类别：${c}</option>`)
      ].join('');

      const supFilterOptions = [
        '<option value="">全部来源</option>',
        ...suppliers.map((s) => `<option value="${s}">${s}</option>`)
      ].join('');

      const alertCount = computeEffectiveAlertsList().length;

      openBridgeSheetModal({
        id: 'modal-store-product-catalog',
        title: '🏷️ 本店商品总库 · 扫码建档/调价/预警',
        subtitle: `库存≤${thresholds.lowStock}件 或 临期≤${thresholds.expiryDays}天自动预警`,
        hideFooter: true,
        bodyHtml: `
          <!-- 顶部扫码/录商品 + 预警条件设置 + 打印价签 -->
          <div class="flex flex-wrap items-center justify-between gap-1.5">
            <button type="button" onclick="window.openInlineProductFormDrawer()" class="bg-[#1b4332] text-amber-300 font-bold px-2.5 py-1.5 rounded-xl text-[11px]">
              + 扫码 / 录入新商品
            </button>
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="window.openAlertThresholdSettings()" class="bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold px-2.5 py-1.5 rounded-xl text-[10px]">
                ⚙️ 预警条件
              </button>
              <button type="button" onclick="window.printStoreShelfPriceTags()" class="bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-950 font-bold px-2.5 py-1.5 rounded-xl text-[10px]">
                🖨️ 打印价签
              </button>
            </div>
          </div>

          <!-- 按类别通调零售价 -->
          <div class="bg-stone-50 border border-stone-200 rounded-2xl p-2 flex items-center gap-1.5">
            <select id="cat-bulk-target" onchange="window.renderUnifiedStoreCatalogList()" class="flex-1 min-w-0 bg-white border border-stone-200 rounded-xl px-2 py-1.5 font-bold text-stone-800 outline-none truncate">
              ${catOptions}
            </select>
            <div class="flex items-center bg-white border border-stone-200 rounded-xl px-2 py-1 shrink-0">
              <span class="text-[10px] text-stone-500 mr-1">加价</span>
              <input type="number" step="1" min="0" id="cat-bulk-pct-input" value="${curDefaultPct}" class="w-11 font-mono font-bold text-emerald-950 text-center outline-none">
              <span class="font-bold text-stone-600">%</span>
            </div>
            <button type="button" onclick="window.applyBulkMarkupRule()" class="bg-emerald-800 text-white font-bold px-2.5 py-1.5 rounded-xl shrink-0">
              通调
            </button>
          </div>

          <!-- 检索与来源/预警筛选 -->
          <div class="flex gap-1.5">
            <input type="text" id="catalog-search-kw" oninput="window.renderUnifiedStoreCatalogList()" placeholder="🔍 扫条码 / 搜品名 / 展架..." class="flex-1 min-w-0 bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-bold outline-none">
            <select id="catalog-filter-supplier" onchange="window.renderUnifiedStoreCatalogList()" class="w-24 bg-stone-50 border border-stone-200 rounded-xl px-2 py-1.5 font-bold text-stone-700 outline-none truncate">
              ${supFilterOptions}
            </select>
            <button type="button" id="btn-catalog-only-shortage" data-active="${initialFilterMode === 'shortage' ? '1' : '0'}" onclick="window.toggleCatalogShortageFilter()" class="px-2.5 py-1.5 rounded-xl border font-bold shrink-0 ${
              initialFilterMode === 'shortage'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-stone-100 text-stone-700 border-stone-200'
            }">
              📌 预警(${alertCount})
            </button>
          </div>

          <div id="unified-catalog-list-host" class="max-h-72 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-2xl px-2.5"></div>
        `
      });
      window.renderUnifiedStoreCatalogList();
    });
  };

  window.openAlertThresholdSettings = function () {
    const cur = readAlertThresholds();
    openBridgeSheetModal({
      id: 'modal-alert-threshold-cfg',
      title: '⚙️ 自动缺货与临期预警条件设置',
      subtitle: '满足以下任一条件自动亮红灯提醒补货或促销',
      confirmText: '✅ 保存预警规则',
      bodyHtml: `
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold text-stone-700 mb-1">低库存预警线 (件/箱)：</label>
            <input type="number" min="0" id="cfg-low-stock" value="${cur.lowStock ?? 5}" class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-mono font-bold text-center">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">保质期临近天数 (天)：</label>
            <input type="number" min="1" id="cfg-expiry-days" value="${cur.expiryDays ?? 30}" class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-mono font-bold text-center">
          </div>
        </div>
      `,
      onConfirm: async (close) => {
        const lowStock = parseInt(document.getElementById('cfg-low-stock')?.value || '5', 10);
        const expiryDays = parseInt(document.getElementById('cfg-expiry-days')?.value || '30', 10);
        writeAlertThresholds({ lowStock: isNaN(lowStock) ? 5 : lowStock, expiryDays: isNaN(expiryDays) ? 30 : expiryDays });
        refreshShortageMemoBanner();
        close();
        if (document.getElementById('modal-store-product-catalog')) window.renderUnifiedStoreCatalogList();
      }
    });
  };

  window.printStoreShelfPriceTags = function () {
    const storeName = getActiveBranchName();
    const unified = getAllUnifiedProductsMerged().slice(0, 24);
    if (unified.length === 0) return alert('当前商品总库暂无商品可打印价签。');

    const tagsHtml = unified
      .map((item) => {
        const info = resolveSmartRetailPrice(item.name, item.costPrice, '', item.category);
        return `
        <div style="border:2px solid #1b4332;border-radius:10px;padding:10px;text-align:center;font-family:sans-serif;background:#fff">
          <div style="font-size:11px;color:#1b4332;font-weight:bold">${storeName}</div>
          <div style="font-size:15px;font-weight:bold;margin:4px 0;color:#1c1917">${item.name}</div>
          <div style="font-size:11px;color:#57534e">规格：${item.spec}</div>
          <div style="font-size:24px;font-weight:900;color:#be123c;font-family:monospace;margin-top:4px">¥${info.retailPrice.toFixed(2)}</div>
        </div>`;
      })
      .join('');

    const win = window.open('', '_blank', 'width=520,height=640');
    if (win) {
      win.document.write(`
        <div style="padding:14px;font-family:sans-serif">
          <div class="no-print" style="margin-bottom:12px;text-align:center">
            <button onclick="window.print()" style="padding:8px 18px;background:#1b4332;color:#fcd34d;border:none;border-radius:10px;font-weight:bold;cursor:pointer">🖨️ 立即打印货架零售价签（支持58mm热敏/A4纸）</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">${tagsHtml}</div>
          <style>@media print{.no-print{display:none!important}}</style>
        </div>
      `);
    }
  };

  window.toggleCatalogShortageFilter = function () {
    const btn = document.getElementById('btn-catalog-only-shortage');
    if (!btn) return;
    const isNow = btn.getAttribute('data-active') === '1';
    btn.setAttribute('data-active', isNow ? '0' : '1');
    btn.className = !isNow
      ? 'px-2.5 py-1.5 rounded-xl border font-bold shrink-0 bg-rose-600 text-white border-rose-600'
      : 'px-2.5 py-1.5 rounded-xl border font-bold shrink-0 bg-stone-100 text-stone-700 border-stone-200';
    window.renderUnifiedStoreCatalogList();
  };

  window.applyBulkMarkupRule = function () {
    const target = document.getElementById('cat-bulk-target')?.value || '__ALL__';
    const pctVal = parseFloat(document.getElementById('cat-bulk-pct-input')?.value || '');
    if (isNaN(pctVal) || pctVal < 0) return alert('请输入有效的加价百分比数字（例如 20）！');

    if (target === '__ALL__') {
      setDefaultMarkupPct(pctVal);
      alert(`✅ 已将全店默认加价率设为 +${pctVal}%！`);
    } else {
      const map = readCategoryMarkupPcts();
      map[target] = pctVal;
      writeCategoryMarkupPcts(map);
      alert(`✅ 已将【${target}】类别的通调加价率设为 +${pctVal}%！`);
    }
    window.renderUnifiedStoreCatalogList();
  };

  window.renderUnifiedStoreCatalogList = function () {
    const host = document.getElementById('unified-catalog-list-host');
    if (!host) return;
    const kw = (document.getElementById('catalog-search-kw')?.value || '').trim().toLowerCase();
    const catFilter = document.getElementById('cat-bulk-target')?.value || '__ALL__';
    const supFilter = document.getElementById('catalog-filter-supplier')?.value || '';
    const onlyShortage = document.getElementById('btn-catalog-only-shortage')?.getAttribute('data-active') === '1';

    const alertsList = computeEffectiveAlertsList();
    const alertMap = new Map(alertsList.map((x) => [x.name, x]));
    const shelfMap = readShelfLocationsMap();
    const unified = getAllUnifiedProductsMerged();

    const rows = unified.filter((item) => {
      const shelfTxt = shelfMap[item.name] || '';
      if (kw && !item.name.toLowerCase().includes(kw) && !item.category.toLowerCase().includes(kw) && !shelfTxt.toLowerCase().includes(kw) && !String(item.barcode || '').includes(kw)) return false;
      if (catFilter !== '__ALL__' && item.category !== catFilter) return false;
      if (supFilter && item.supplierShortName !== supFilter) return false;
      if (onlyShortage && !alertMap.has(item.name)) return false;
      return true;
    });

    if (rows.length === 0) {
      host.innerHTML = '<div class="py-8 text-center text-stone-400">暂无匹配商品（点左上角“+ 扫码 / 录入新商品”可随时建档）</div>';
      return;
    }

    host.innerHTML = rows
      .slice(0, 60)
      .map((item) => {
        const info = resolveSmartRetailPrice(item.name, item.costPrice, '', item.category);
        const alertObj = alertMap.get(item.name);
        const shelfPos = shelfMap[item.name] || '未设展架';
        const thumbHtml = item.imageUrl
          ? `<img src="${item.imageUrl}" class="w-10 h-10 rounded-xl object-cover bg-stone-100 shrink-0 border border-stone-200"/>`
          : `<div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-900 font-bold flex items-center justify-center shrink-0 border border-emerald-200 text-xs">${item.name.slice(0, 2)}</div>`;

        return `
        <div class="py-2.5 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            ${thumbHtml}
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1">
                <b class="text-stone-900 truncate">${item.name}</b>
                <span class="text-[9px] bg-stone-100 text-stone-600 px-1.5 rounded shrink-0">${item.supplierShortName}</span>
              </div>
              <div class="text-[10px] text-stone-500 mt-0.5 flex flex-wrap items-center gap-1">
                <span>${item.category}</span>
                <span>· 进 ¥${item.costPrice.toFixed(2)}</span>
                ${item.localStock !== null ? `<span>· 余${item.localStock}</span>` : ''}
                <span class="text-sky-800">📍${shelfPos}</span>
              </div>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0">
            <button type="button" onclick='window.openInlineProductFormDrawer({ editItem: ${JSON.stringify(item).replace(/'/g, '')} })' class="bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold px-2 py-0.5 rounded-lg text-[11px]">
              售 ¥${info.retailPrice.toFixed(2)} ✎
            </button>
            <div class="flex items-center gap-1">
              <button type="button" onclick="window.toggleShortageMemoItem('${String(item.name).replace(/'/g, '')}', '${String(item.supplierShortName).replace(/'/g, '')}')" class="px-1.5 py-0.5 rounded-lg text-[9px] font-bold border ${
                alertObj ? 'bg-rose-600 text-white border-rose-600' : 'bg-stone-50 text-stone-600 border-stone-200'
              }">
                ${alertObj ? `📌${alertObj.tag}` : '📌预警'}
              </button>
              <button type="button" onclick="window.quickAddCatalogItemToOrder('${String(item.name).replace(/'/g, '')}')" class="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-[#1b4332] text-amber-300">
                + 订货
              </button>
            </div>
          </div>
        </div>`;
      })
      .join('');
  };

  window.quickAddCatalogItemToOrder = function (name) {
    const cards = Array.from(document.querySelectorAll('#product-container > div'));
    const hitCard = cards.find((el) => (el.innerText || '').includes(name));
    if (hitCard) {
      const plusBtn = Array.from(hitCard.querySelectorAll('button')).find((b) => b.innerText?.trim() === '+');
      if (plusBtn) {
        plusBtn.click();
        alert(`✅ 已将【${name}】+1 加入底部进货单！`);
        return;
      }
    }
    alert(`💡 请先在顶栏切换到【${name}】所属的供货方胶囊，即可直接点「+」批量订货！`);
  };

  window.toggleShortageMemoItem = function (name, supplierName) {
    const list = readShortageMemos();
    const idx = list.findIndex((x) => x.name === name);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.unshift({ name, supplierName, tag: '缺货待补', time: new Date().toLocaleDateString('zh-CN') });
    }
    writeShortageMemos(list);
    const btn = document.getElementById('btn-catalog-only-shortage');
    if (btn) btn.innerText = `📌 预警(${computeEffectiveAlertsList().length})`;
    window.renderUnifiedStoreCatalogList();
  };

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
                     <div class="flex items-center justify-end gap-1.5 pt-1 border-t border-stone-200/70">
                       <input type="number" step="0.01" id="partial-pay-${c.id}" placeholder="部分还款额" class="w-24 bg-white border border-stone-300 rounded-xl px-2 py-1 font-mono text-[11px]">
                       <button type="button" onclick="window.settleStoreCustomerCredit(${c.id}, false)" class="bg-white border border-stone-300 text-stone-800 font-bold px-2.5 py-1 rounded-xl text-[10px]">记部分还款</button>
                       <button type="button" onclick="window.settleStoreCustomerCredit(${c.id}, true)" class="bg-[#1b4332] text-amber-300 font-bold px-3 py-1 rounded-xl text-[10px]">✅ 全额还清</button>
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
      const inp = document.getElementById(`partial-pay-${customerId}`);
      payAmt = parseFloat(inp?.value || '0');
      if (isNaN(payAmt) || payAmt <= 0) return alert('请先在左侧输入框填写部分还款金额！');
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

    const ledger = readPosLedgerList();
    ledger.unshift({
      id: Date.now(),
      itemDesc: `熟客还款 (${hit.name})`,
      amount: Number(payAmt.toFixed(2)),
      profit: 0,
      method: '微信/支付宝',
      customerName: hit.name,
      staffName: getActiveStaffMember().name,
      voided: false,
      createdAt: new Date().toISOString()
    });
    writePosLedgerList(ledger);
    refreshStoreCreditBadgeOnly();
    window.openStoreCreditBookModal();
  };

  window.openStorePosModeAndStaffModal = function () {
    requestOwnerPinSheet('修改门店经营模式与成员权限', () => {
      const hasExternalPos = localStorage.getItem(HAS_EXTERNAL_POS_KEY) === '1';
      const members = readStoreStaffMembers();
      const payCfg = readPosPaycodeConfig();

      openBridgeSheetModal({
        id: 'modal-store-mode-staff',
        title: '🔌 门店模式(POS适配)与成员安全锁',
        subtitle: '已有独立POS机可一键隐藏手机收银 · 支持一家人与合伙人协同',
        confirmText: '✅ 保存配置',
        bodyHtml: `
          <div class="bg-stone-50 border border-stone-200 rounded-2xl p-3 space-y-1.5">
            <label class="block font-bold text-stone-800">1. 门店收银硬件模式选择：</label>
            <select id="cfg-external-pos-mode" class="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 font-bold text-emerald-950">
              <option value="0" ${!hasExternalPos ? 'selected' : ''}>📱 一部手机全能版（同时使用手机扫码收银 + 进货订货）</option>
              <option value="1" ${hasExternalPos ? 'selected' : ''}>🖥️ 本店已有独立POS收银机（隐藏手机收银，专注进货与调价）</option>
            </select>
          </div>

          <div class="bg-stone-50 border border-stone-200 rounded-2xl p-3 space-y-2">
            <b class="text-stone-800 block">2. 一家人 / 合伙人 / 店员名单：</b>
            <div class="space-y-1">
              ${members
                .map(
                  (m) => `
                <div class="flex justify-between items-center bg-white px-2.5 py-1.5 rounded-xl border border-stone-200 text-[11px]">
                  <span>👤 <b>${m.name}</b> (${m.role})</span>
                  <span class="text-[10px] text-stone-400">${m.role === '掌柜' ? '全权限' : '仅前台收银订货'}</span>
                </div>`
                )
                .join('')}
            </div>
            <div class="flex gap-1.5 pt-1">
              <input type="text" id="new-staff-name-inp" placeholder="输入新增家人或店员称呼" class="flex-1 bg-white border border-stone-300 rounded-xl px-2.5 py-1.5">
              <select id="new-staff-role-sel" class="bg-white border border-stone-300 rounded-xl px-2 py-1.5 font-bold">
                <option value="掌柜">掌柜</option>
                <option value="店员">店员</option>
              </select>
              <button type="button" onclick="window.inlineAddStoreStaff()" class="bg-[#1b4332] text-amber-300 font-bold px-2.5 py-1.5 rounded-xl shrink-0">添加</button>
            </div>
          </div>

          <div class="bg-stone-50 border border-stone-200 rounded-2xl p-3 space-y-1.5">
            <label class="block font-bold text-stone-800">3. 修改 4 位掌柜安全码与应急手机尾号：</label>
            <div class="grid grid-cols-2 gap-2">
              <input type="password" maxlength="4" id="cfg-update-owner-pin" placeholder="新4位安全码(留空不改)" class="w-full bg-white border border-stone-300 rounded-xl px-3 py-1.5 font-mono font-bold">
              <input type="text" maxlength="4" id="cfg-update-rec-hint" value="${payCfg.recoveryHint || ''}" placeholder="应急手机后4位" class="w-full bg-white border border-stone-300 rounded-xl px-3 py-1.5 font-mono font-bold">
            </div>
          </div>
        `,
        onConfirm: async (close) => {
          const nextPosMode = document.getElementById('cfg-external-pos-mode')?.value || '0';
          localStorage.setItem(HAS_EXTERNAL_POS_KEY, nextPosMode);
          applyStorePosModeLayout();

          const newPin = document.getElementById('cfg-update-owner-pin')?.value.trim();
          const newRec = document.getElementById('cfg-update-rec-hint')?.value.trim();
          const patch = { ...payCfg };
          if (newPin) {
            if (newPin.length !== 4) return alert('安全码必须是 4 位数字！');
            patch.pin = newPin;
          }
          if (newRec) patch.recoveryHint = newRec;
          writePosPaycodeConfig(patch);
          close();
          alert('✅ 门店模式与安全配置已生效！');
        }
      });
    });
  };

  window.inlineAddStoreStaff = function () {
    const name = document.getElementById('new-staff-name-inp')?.value.trim();
    const role = document.getElementById('new-staff-role-sel')?.value || '店员';
    if (!name) return alert('请输入新增成员称呼！');
    const list = readStoreStaffMembers();
    list.push({ id: `staff_${Date.now()}`, name, role });
    writeStoreStaffMembers(list);
    window.openStorePosModeAndStaffModal();
  };

  /**
   * 合并图三与图四：本地账本文件导出（.json 换机迁移 + .html 断网查阅）与新手机文件导入恢复
   */
  window.openStoreBackupFileModal = function () {
    requestOwnerPinSheet('导出或恢复本店本地账本文件', () => {
      const storeName = getActiveBranchName();
      openBridgeSheetModal({
        id: 'modal-store-backup-files',
        title: '💾 本地账本导出 / 换机文件恢复',
        subtitle: '全量存在手机本地 · 零占云端空间 · 导出发微信【文件传输助手】永久防丢失',
        hideFooter: true,
        bodyHtml: `
          <div class="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 space-y-2">
            <b class="text-emerald-950 block">第一步：导出备份文件存到微信【文件传输助手】</b>
            <p class="text-[10px] text-stone-600">包含全部分店商品、条码、调价、熟客赊账、收款码与收银流水，手机丢失或换新机可 1 秒全量还原。</p>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" onclick="window.downloadStoreJsonMigrationFile()" class="py-2 px-2.5 rounded-xl bg-[#1b4332] text-amber-300 font-bold text-[11px]">
                📦 导出换机恢复文件 (.json)
              </button>
              <button type="button" onclick="if(typeof window.exportStoreLocalBackup==='function') window.exportStoreLocalBackup(); else window.downloadStoreOfflineHtmlReport();" class="py-2 px-2.5 rounded-xl bg-white border border-emerald-300 text-emerald-950 font-bold text-[11px]">
                📄 下载断网可查账本 (.html)
              </button>
            </div>
          </div>

          <div class="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 space-y-2">
            <b class="text-amber-950 block">第二步：换新手机后，选择备份文件一键恢复</b>
            <label class="block w-full py-2.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-center cursor-pointer shadow-2xs">
              📂 选择手机里的 .json 备份文件还原
              <input type="file" accept=".json,application/json" onchange="window.importStoreJsonMigrationFile(event)" class="hidden">
            </label>
          </div>
        `
      });
    });
  };

  window.downloadStoreJsonMigrationFile = function () {
    const storeName = getActiveBranchName();
    const allLocal = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('baigong_')) {
        allLocal[k] = localStorage.getItem(k);
      }
    }
    const blob = new Blob([JSON.stringify({ app: 'baigong_store_backup', exportedAt: new Date().toISOString(), data: allLocal })], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${storeName}_账本迁移备份_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  window.importStoreJsonMigrationFile = function (event) {
    const file = event.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        if (parsed.app !== 'baigong_store_backup' || !parsed.data) {
          return alert('❌ 所选文件不是有效的门店账本备份文件！');
        }
        Object.keys(parsed.data).forEach((k) => {
          localStorage.setItem(k, parsed.data[k]);
        });
        alert('✅ 全部门店商品、调价、熟客赊账、收款码与流水已 100% 还原！页面即将刷新生效。');
        window.location.reload();
      } catch {
        alert('❌ 文件解析失败，请确认文件完整！');
      }
    };
    reader.readAsText(file);
  };

  window.openMultiPosterModal = function () {
    const storeName = getActiveBranchName();
    const catalog = getAllUnifiedProductsMerged();
    const optionsHtml =
      catalog.length === 0
        ? '<p class="text-stone-400 text-center py-3">当前暂无在架商品，请先在总库录入或切换供货方</p>'
        : catalog
            .slice(0, 24)
            .map((p, idx) => {
              const info = resolveSmartRetailPrice(p.name, p.costPrice, '', p.category);
              return `
              <label class="flex items-center justify-between gap-2 p-2 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer hover:bg-amber-50/60">
                <div class="flex items-center gap-2 min-w-0">
                  <input type="checkbox" class="mp-prod-check rounded text-emerald-800" data-name="${String(p.name).replace(/"/g, '')}" data-spec="${String(p.spec || '件').replace(/"/g, '')}" data-price="${info.retailPrice.toFixed(2)}" ${idx < 3 ? 'checked' : ''}>
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

      ctx.fillStyle = '#1b4332';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#faf8f3';
      ctx.fillRect(28, 28, W - 56, H - 56);

      ctx.fillStyle = '#1b4332';
      ctx.fillRect(28, 28, W - 56, 155);
      ctx.fillStyle = '#fcd34d';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(mode === 'group_buy' ? `🔥 ${storeName} · 邻里拼单接龙` : `🌾 ${storeName} · 今日特惠货单`, W / 2, 92);

      ctx.fillStyle = '#ecfdf5';
      ctx.font = '22px sans-serif';
      ctx.fillText(slogan, W / 2, 138);

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

export async function initStoreTerminalBridge() {
  showWeChatPinGuideIfFirstTime();
  bindNativeStoreCounterPosBindings();

  const rememberedBranch = localStorage.getItem(ACTIVE_BRANCH_KEY);
  const titleEl = document.getElementById('store-title');
  if (rememberedBranch && titleEl) titleEl.innerText = rememberedBranch;
  setActiveStaffMember(getActiveStaffMember());
  refreshStoreCreditBadgeOnly();

  if (localStorage.getItem('hq_active_agent')) {
    const hqLink = document.getElementById('link-to-hq-portal');
    if (hqLink) {
      hqLink.innerHTML = '<span>🏭 进入我的批发调度总台</span><span class="text-[9px] text-emerald-700">已开通 ▸</span>';
    }
  }

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
    document.querySelectorAll('div').forEach((el) => {
      if (el.innerText?.includes('字太小看不清？点此切换') && el.children.length <= 3) {
        el.style.display = 'none';
      }
    });

    document.querySelectorAll('#agents-nav-chips button').forEach((btn) => {
      const raw = btn.innerText || '';
      const hasDot = raw.startsWith('●') || raw.startsWith('○');
      const prefix = hasDot ? raw.slice(0, 2) : '';
      const pureName = (hasDot ? raw.slice(2) : raw).trim();
      const shortName = shortenSupplierCompanyName(pureName);
      if (shortName && shortName !== pureName) {
        btn.innerText = `${prefix}${shortName}`;
      }
      btn.style.maxWidth = '115px';
      btn.style.overflow = 'hidden';
      btn.style.textOverflow = 'ellipsis';
      btn.style.whiteSpace = 'nowrap';
    });

    const activeAgent = (
      document.getElementById('menu-current-agent-tag')?.innerText ||
      localStorage.getItem('active_agent') ||
      localStorage.getItem('active_agent_id') ||
      stickerAgent
    ).trim();

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

    if (!forceRefresh && activeAgent === lastRenderedStoreAgent && cachedUnifiedStoreProducts.length > 0) {
      return;
    }
    lastRenderedStoreAgent = activeAgent;

    const boundIdSet = new Set([activeAgent]);
    ['bound_agents_list', 'store_bound_agents', 'my_bound_agents'].forEach((k) => {
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(arr)) {
          arr.forEach((item) => {
            const id = typeof item === 'string' ? item : item?.tenant_id || item?.id;
            if (id) boundIdSet.add(String(id).trim());
          });
        }
      } catch {
        // 忽略解析异常
      }
    });
    const boundIds = Array.from(boundIdSet);

    const [tenantRes, crowdRes, allTenantsRes, allProductsRes] = await Promise.all([
      supabase.from('platform_tenant').select('tenant_id, company_name, custom_settings').eq('tenant_id', activeAgent).maybeSingle(),
      supabase.from('platform_suggestion_board').select('*').eq('proposer_type', 'c2b_demand').ilike('category', `%凑单开产 · ${activeAgent}%`).order('id', { ascending: false }).limit(5),
      supabase.from('platform_tenant').select('tenant_id, company_name').in('tenant_id', boundIds),
      supabase.from('product').select('id, tenant_id, name, category, spec, measure_unit, tier_1_price, image_url, status').in('tenant_id', boundIds).neq('status', 'inactive').limit(300)
    ]);

    if (allTenantsRes?.data) {
      allTenantsRes.data.forEach((t) => {
        cachedTenantNameMap[t.tenant_id] = shortenSupplierCompanyName(t.company_name || t.tenant_id);
      });
    }
    if (allProductsRes?.data) {
      cachedUnifiedStoreProducts = allProductsRes.data.map((p) => ({
        ...p,
        supplierShortName: cachedTenantNameMap[p.tenant_id] || p.tenant_id
      }));
      refreshShortageMemoBanner();
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
      const storeTitle = getActiveBranchName();
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
    if (t.includes('进专柜') && !t.includes('4')) btn.style.display = 'none';
    if (t.includes('天街良品') && btn.parentElement) {
      btn.parentElement.style.maxWidth = '680px';
      btn.parentElement.style.marginLeft = 'auto';
      btn.parentElement.style.marginRight = 'auto';
    }
  });

  const [crowdRes, claimRes, charityTenantsRes] = await Promise.all([
    supabase.from('platform_suggestion_board').select('*').eq('proposer_type', 'c2b_demand').ilike('category', '%凑单开产%').order('id', { ascending: false }).limit(6),
    supabase.from('platform_suggestion_board').select('*').eq('proposer_type', 'c2b_demand').ilike('category', '%拼单认领%').order('id', { ascending: false }).limit(40),
    supabase.from('platform_tenant').select('tenant_id, company_name, custom_settings').eq('is_active', true).limit(50)
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
