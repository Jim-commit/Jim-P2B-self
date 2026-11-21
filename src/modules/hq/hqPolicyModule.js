import { supabase } from '../../lib/supabase.js';
import { HQService } from '../../services/hqService.js';
import { hqState, DEFAULT_GLOBAL_POLICY } from './hqState.js';

export function renderActivePolicyBadgesBar() {
  const bar = document.getElementById('active-policy-badges-bar');
  if (!bar) return;

  const gp = hqState.globalPolicy;
  const chips = [];
  if (gp.storeTierEnabled !== false) {
    chips.push('<span class="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full">🟢 门店分级折扣生效中</span>');
  }
  if (gp.harvestAidOn) {
    chips.push('<span class="bg-amber-400/25 text-amber-200 border border-amber-400/40 px-2 py-0.5 rounded-full">🌾 丰产助农平准认领开启</span>');
  }
  if (parseInt(gp.rationLimitQty || 0) > 0) {
    chips.push(`<span class="bg-rose-500/25 text-rose-200 border border-rose-400/30 px-2 py-0.5 rounded-full">🛡️ 紧缺定额限购 ${gp.rationLimitQty} 件</span>`);
  }
  if (gp.onlinePriceEnabled) {
    chips.push('<span class="bg-blue-500/20 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded-full">🌐 网上多档价格策略生效中</span>');
  }
  if (gp.rebateEnabled !== false) {
    chips.push('<span class="bg-amber-400/20 text-amber-200 border border-amber-400/30 px-2 py-0.5 rounded-full">🎁 进货返利策略生效中</span>');
  }
  if (gp.campaignActive) {
    chips.push('<span class="bg-rose-500/25 text-rose-200 border border-rose-400/30 px-2 py-0.5 rounded-full">🔥 促销活动进行中</span>');
  }

  bar.innerHTML =
    chips.length > 0
      ? chips.join('')
      : '<span class="text-emerald-200/70">当前按基准原价直出（未启用额外折扣策略）</span>';
}

export function syncSeasonalPauseBannerUI() {
  const sp = hqState.globalPolicy.seasonalPause;
  const banner = document.getElementById('hq-seasonal-pause-banner');
  const textEl = document.getElementById('hq-seasonal-pause-text');
  if (!banner || !textEl) return;
  if (sp && sp.isPaused) {
    banner.classList.remove('hidden');
    textEl.innerText = `🍵 当前处于【暂歇接单】状态：${sp.reason || '农忙/盘点中'}${sp.resumeDate ? `（预计 ${sp.resumeDate} 恢复接单）` : ''}`;
  } else {
    banner.classList.add('hidden');
  }
}

export function updateWebhookStatusBadge(url) {
  const btn = document.getElementById('btn-webhook-status');
  if (!btn) return;
  if (url && url.startsWith('http')) {
    btn.innerHTML = '<span>🔔</span> 群通知已开';
    btn.className = 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs px-3 py-1.5 rounded-xl font-bold border border-emerald-400/50 active:scale-95 transition flex items-center gap-1';
  } else {
    btn.innerHTML = '<span>🔔</span> 报单群通知';
    btn.className = 'bg-[#143628]/80 hover:bg-[#0e271d] text-emerald-200 text-xs px-3 py-1.5 rounded-xl font-bold border border-emerald-500/30 active:scale-95 transition flex items-center gap-1';
  }
}

export function loadGlobalPolicyFromTenant(tenant) {
  let savedLocal = {};
  try {
    savedLocal = JSON.parse(localStorage.getItem('hq_global_policy_' + hqState.currentAgent) || '{}');
  } catch (e) {}

  const cloudPolicy = tenant?.custom_settings && typeof tenant.custom_settings === 'object' ? tenant.custom_settings : {};
  const gp = {
    ...JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY)),
    ...savedLocal,
    ...cloudPolicy
  };

  if (!gp.tier1Name || gp.tier1Name === '平准供货底价') gp.tier1Name = '批发平准基准价';
  if (!gp.tier2Name || gp.tier2Name === '集采惠价') gp.tier2Name = '网上平准零售基准价';
  if (!Array.isArray(gp.storeTiers) || gp.storeTiers.length === 0) gp.storeTiers = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY.storeTiers));
  if (!Array.isArray(gp.storeCustomFields)) gp.storeCustomFields = [...DEFAULT_GLOBAL_POLICY.storeCustomFields];
  if (!Array.isArray(gp.onlineTiers) || gp.onlineTiers.length === 0) gp.onlineTiers = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY.onlineTiers));
  if (!Array.isArray(gp.rebateTiers) || gp.rebateTiers.length === 0) gp.rebateTiers = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY.rebateTiers));
  if (!Array.isArray(gp.carriers) || gp.carriers.length === 0) gp.carriers = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY.carriers));
  if (!Array.isArray(gp.promos)) gp.promos = [];

  hqState.globalPolicy = gp;
  localStorage.setItem('hq_global_policy_' + hqState.currentAgent, JSON.stringify(gp));

  const mainCarrier = gp.carriers[0] || { name: '周转筐', deposit: 15 };
  hqState.carrierLabel = mainCarrier.name;
  localStorage.setItem('hq_carrier_label_' + hqState.currentAgent, hqState.carrierLabel);

  renderActivePolicyBadgesBar();
  syncSeasonalPauseBannerUI();

  const th1 = document.getElementById('th-tier1-label');
  const th2 = document.getElementById('th-tier2-label');
  if (th1) th1.innerText = gp.tier1Name;
  if (th2) th2.innerText = gp.tier2Name;

  const lbl1 = document.getElementById('lbl-prod-tier1');
  const lbl2 = document.getElementById('lbl-prod-tier2');
  if (lbl1) lbl1.innerText = `🏬 ${gp.tier1Name} (元) *：`;
  if (lbl2) lbl2.innerText = `🌐 ${gp.tier2Name} (元)：`;

  const opt1 = document.getElementById('opt-policy-t1');
  const opt2 = document.getElementById('opt-policy-t2');
  if (opt1) opt1.innerText = gp.tier1Name;
  if (opt2) opt2.innerText = gp.tier2Name;
}

function renderCustomPresetsBar() {
  const bar = document.getElementById('policy-presets-bar');
  if (!bar) return;
  let customPresets = [];
  try {
    customPresets = JSON.parse(localStorage.getItem('hq_custom_presets_' + hqState.currentAgent) || '[]');
  } catch (e) {}

  const builtInHtml = `
    <button type="button" onclick="window.applyGlobalPreset('coop')" class="px-2.5 py-1 rounded-xl bg-white hover:bg-emerald-50 border border-amber-300 text-stone-800 font-bold transition">🌾 村社合作社/生鲜</button>
    <button type="button" onclick="window.applyGlobalPreset('factory')" class="px-2.5 py-1 rounded-xl bg-white hover:bg-emerald-50 border border-amber-300 text-stone-800 font-bold transition">🏭 源头工坊/制造</button>
    <button type="button" onclick="window.applyGlobalPreset('hardware')" class="px-2.5 py-1 rounded-xl bg-white hover:bg-emerald-50 border border-amber-300 text-stone-800 font-bold transition">🛠️ 五金建材/汽配</button>
    <button type="button" onclick="window.applyGlobalPreset('cylinder')" class="px-2.5 py-1 rounded-xl bg-white hover:bg-emerald-50 border border-amber-300 text-stone-800 font-bold transition">💧 水桶/气瓶循环</button>
  `;
  const customHtml = customPresets
    .map(
      (cp, idx) => `
      <button type="button" onclick="window.applySavedCustomPreset(${idx})" class="px-2.5 py-1 rounded-xl bg-emerald-100 hover:bg-emerald-200 border border-emerald-400 text-emerald-950 font-bold transition">
        ⭐ ${cp.name}
      </button>
    `
    )
    .join('');

  bar.innerHTML = builtInHtml + customHtml;
}

export function initPolicyBindings(callbacks) {
  window.openSeasonalPauseModal = function () {
    const sp = hqState.globalPolicy.seasonalPause || { isPaused: false, reason: '产区农忙采收集中加工中', resumeDate: '' };
    document.getElementById('sp-is-paused').checked = !!sp.isPaused;
    document.getElementById('sp-reason').value = sp.reason || '';
    document.getElementById('sp-resume-date').value = sp.resumeDate || '';
    window.openModal('modal-seasonal-pause');
  };

  window.saveSeasonalPauseSettings = async function () {
    const isPaused = document.getElementById('sp-is-paused').checked;
    const reason = document.getElementById('sp-reason').value.trim() || '产区农忙/仓库盘点暂歇';
    const resumeDate = document.getElementById('sp-resume-date').value || '';

    hqState.globalPolicy.seasonalPause = { isPaused, reason, resumeDate };
    localStorage.setItem('hq_global_policy_' + hqState.currentAgent, JSON.stringify(hqState.globalPolicy));

    try {
      await HQService.updateTenantWithVerify(hqState.currentAgent, { custom_settings: hqState.globalPolicy });
      if (hqState.currentTenantData) hqState.currentTenantData.custom_settings = hqState.globalPolicy;
    } catch (e) {}

    syncSeasonalPauseBannerUI();
    window.closeModal('modal-seasonal-pause');
    alert(isPaused ? `🍵 已挂出【暂歇接单】告示（${reason}），门店订货台与天街专柜已同步显示！` : '🟢 已解除暂歇告示，恢复正常接单营业！');
  };

  window.exportFullTenantBackup = function () {
    const backupBundle = {
      exportedAt: new Date().toISOString(),
      platform: '百工百业数字协作平台 · 商号独立私有账本全量备份',
      tenant: {
        tenant_id: hqState.currentAgent,
        company_name: hqState.currentTenantData?.company_name || hqState.currentAgent,
        globalPolicy: hqState.globalPolicy
      },
      products: hqState.allProducts,
      stores: hqState.allStores,
      orders: hqState.allOrders,
      inventoryLogs: hqState.allInventoryLogs
    };
    const blob = new Blob([JSON.stringify(backupBundle, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${hqState.currentAgent}_全套私有账本备份_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert(`💾 本店全套私有账本备份已下载到您的电脑（含 ${hqState.allProducts.length} 款货品、${hqState.allStores.length} 家门店、${hqState.allOrders.length} 笔单据）！`);
  };

  window.saveCurrentAsCustomPreset = function () {
    const name = prompt('为当前这套策略组合起个模板名称（如：日常平销策略 / 秋收助农模式）：');
    if (!name || !name.trim()) return;
    let customPresets = [];
    try {
      customPresets = JSON.parse(localStorage.getItem('hq_custom_presets_' + hqState.currentAgent) || '[]');
    } catch (e) {}
    customPresets.push({ name: name.trim(), policy: JSON.parse(JSON.stringify(hqState.globalPolicy)) });
    localStorage.setItem('hq_custom_presets_' + hqState.currentAgent, JSON.stringify(customPresets));
    renderCustomPresetsBar();
    alert(`✅ 已将当前策略存为专属模板【${name.trim()}】，以后可随时一键切换！`);
  };

  window.applySavedCustomPreset = function (idx) {
    let customPresets = [];
    try {
      customPresets = JSON.parse(localStorage.getItem('hq_custom_presets_' + hqState.currentAgent) || '[]');
    } catch (e) {}
    const target = customPresets[idx];
    if (!target) return;
    hqState.globalPolicy = JSON.parse(JSON.stringify(target.policy));
    window.openGlobalPolicyModal('tiers');
    alert(`✅ 已载入您的专属模板【${target.name}】，点击底部「保存全局经营策略」即可全端生效。`);
  };

  window.addPolicyTierRow = function (name = '', credit = 2000, rate = 1.0, retQuota = 500) {
    const box = document.getElementById('gp-tiers-container');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-1.5 items-center bg-stone-50 p-2 rounded-xl border border-stone-200 gp-tier-row';
    row.innerHTML = `
      <input type="text" placeholder="分级名称(如LV1核心店)" value="${name}" class="gp-t-name col-span-4 bg-white border border-stone-200 rounded-lg px-2 py-1 font-bold outline-none">
      <input type="number" placeholder="信用额度" value="${credit}" class="gp-t-credit col-span-3 bg-white border border-stone-200 rounded-lg px-2 py-1 font-mono outline-none">
      <input type="number" step="0.01" placeholder="折扣系数" value="${rate}" class="gp-t-rate col-span-3 bg-white border border-stone-200 rounded-lg px-2 py-1 font-mono outline-none">
      <input type="number" placeholder="免批退货额" value="${retQuota}" class="gp-t-ret col-span-2 bg-white border border-stone-200 rounded-lg px-2 py-1 font-mono outline-none">
    `;
    box.appendChild(row);
  };

  window.addPolicyStoreFieldRow = function (fieldName = '') {
    const box = document.getElementById('gp-store-fields-container');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 bg-stone-50 p-2 rounded-xl border border-stone-200 gp-store-field-row';
    row.innerHTML = `<input type="text" placeholder="信息栏名称" value="${fieldName}" class="gp-sf-name flex-1 bg-white border border-stone-200 rounded-lg px-2.5 py-1 font-bold outline-none">`;
    box.appendChild(row);
  };

  window.addOnlineTierRow = function (minQty = 5, rate = 0.95, label = '') {
    const box = document.getElementById('gp-online-tiers-container');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-1.5 items-center bg-white p-2 rounded-xl border border-blue-200 gp-online-tier-row';
    row.innerHTML = `
      <div class="col-span-4 flex items-center gap-1 font-mono">
        <span class="text-[10px] text-stone-500">满</span>
        <input type="number" min="1" value="${minQty}" class="gp-ot-qty w-full bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 font-bold text-center outline-none">
        <span class="text-[10px] text-stone-500">件</span>
      </div>
      <div class="col-span-4 flex items-center gap-1 font-mono">
        <span class="text-[10px] text-stone-500">系数</span>
        <input type="number" step="0.01" min="0.1" max="2" value="${rate}" class="gp-ot-rate w-full bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 font-bold text-center outline-none">
      </div>
      <input type="text" placeholder="标签" value="${label}" class="gp-ot-label col-span-4 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 outline-none">
    `;
    box.appendChild(row);
  };

  window.addRebateTierRow = function (threshold = 10000, rate = 3.0) {
    const box = document.getElementById('gp-rebate-tiers-container');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-emerald-200 gp-rebate-tier-row font-mono';
    row.innerHTML = `
      <span class="text-[10px] text-stone-500">满¥</span>
      <input type="number" value="${threshold}" class="gp-rt-threshold flex-1 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 font-bold outline-none">
      <span class="text-[10px] text-stone-500">返</span>
      <input type="number" step="0.1" value="${rate}" class="gp-rt-rate w-14 bg-stone-50 border border-stone-200 rounded-lg px-1.5 py-1 font-bold text-center outline-none">
      <span class="text-[10px] text-stone-500">%</span>
    `;
    box.appendChild(row);
  };

  window.addPolicyPromoRow = function (title = '', rule = '') {
    const box = document.getElementById('gp-promos-container');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 bg-white p-2 rounded-xl border border-stone-200 gp-promo-row';
    row.innerHTML = `
      <input type="text" placeholder="活动名称" value="${title}" class="gp-pr-title w-1/3 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 font-bold outline-none">
      <input type="text" placeholder="优惠规则说明" value="${rule}" class="gp-pr-rule flex-1 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 outline-none">
    `;
    box.appendChild(row);
  };

  window.addPolicyCarrierRow = function (name = '', deposit = 15) {
    const box = document.getElementById('gp-carriers-container');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 bg-stone-50 p-2 rounded-xl border border-stone-200 gp-carrier-row';
    row.innerHTML = `
      <input type="text" placeholder="载具名称" value="${name}" class="gp-c-name flex-1 bg-white border border-stone-200 rounded-lg px-2.5 py-1 font-bold outline-none">
      <span class="text-stone-500">押金单价 ¥</span>
      <input type="number" step="1" value="${deposit}" class="gp-c-deposit w-24 bg-white border border-stone-200 rounded-lg px-2 py-1 font-mono font-bold outline-none">
    `;
    box.appendChild(row);
  };

  window.switchPolicyTab = function (tab) {
    ['tiers', 'promo', 'carriers', 'risk', 'slip'].forEach((t) => {
      document.getElementById(`gp-pane-${t}`)?.classList.toggle('hidden', t !== tab);
      const btn = document.getElementById(`gp-tab-${t}`);
      if (btn) {
        btn.className = t === tab ? 'py-2 rounded-xl bg-[#1b4332] text-white transition' : 'py-2 rounded-xl text-stone-600 transition';
      }
    });
  };

  window.openGlobalPolicyModal = function (defaultTab = 'tiers') {
    const gp = hqState.globalPolicy;
    renderCustomPresetsBar();
    document.getElementById('gp-store-tier-enabled').checked = gp.storeTierEnabled !== false;

    const tBox = document.getElementById('gp-tiers-container');
    if (tBox) {
      tBox.innerHTML = '';
      gp.storeTiers.forEach((tier) => window.addPolicyTierRow(tier.name, tier.creditLimit, tier.discountRate, tier.returnQuota));
    }
    const sfBox = document.getElementById('gp-store-fields-container');
    if (sfBox) {
      sfBox.innerHTML = '';
      (gp.storeCustomFields || []).forEach((f) => window.addPolicyStoreFieldRow(f));
    }
    const otBox = document.getElementById('gp-online-tiers-container');
    if (otBox) {
      otBox.innerHTML = '';
      (gp.onlineTiers || []).forEach((t) => window.addOnlineTierRow(t.minQty, t.rate, t.label));
    }
    const rtBox = document.getElementById('gp-rebate-tiers-container');
    if (rtBox) {
      rtBox.innerHTML = '';
      (gp.rebateTiers || []).forEach((r) => window.addRebateTierRow(r.threshold, r.rate));
    }
    const cBox = document.getElementById('gp-carriers-container');
    if (cBox) {
      cBox.innerHTML = '';
      gp.carriers.forEach((c) => window.addPolicyCarrierRow(c.name, c.deposit));
    }
    const prBox = document.getElementById('gp-promos-container');
    if (prBox) {
      prBox.innerHTML = '';
      (gp.promos || []).forEach((pr) => window.addPolicyPromoRow(pr.title, pr.rule));
    }

    document.getElementById('gp-harvest-aid-on').checked = !!gp.harvestAidOn;
    document.getElementById('gp-ration-limit-qty').value = gp.rationLimitQty ?? 0;
    document.getElementById('gp-online-price-enabled').checked = !!gp.onlinePriceEnabled;
    document.getElementById('gp-rebate-enabled').checked = gp.rebateEnabled !== false;
    document.getElementById('gp-promoter-enabled').checked = gp.promoterEnabled !== false;
    document.getElementById('gp-promoter-rate').value = gp.promoterRate ?? 8.0;
    document.getElementById('gp-referral-bonus').value = gp.referralBonus ?? 100;
    document.getElementById('gp-campaign-active').checked = !!gp.campaignActive;

    document.getElementById('gp-2fa-cash-on').checked = gp.twoFaCashOn !== false;
    document.getElementById('gp-2fa-threshold').value = gp.twoFaThreshold ?? 3000;
    document.getElementById('gp-2fa-price-on').checked = gp.twoFaPriceOn !== false;
    document.getElementById('gp-2fa-price-pct').value = gp.twoFaPricePct ?? 15;
    document.getElementById('gp-2fa-credit-on').checked = gp.twoFaCreditOn !== false;
    document.getElementById('gp-2fa-delete-on').checked = gp.twoFaDeleteOn !== false;
    document.getElementById('gp-2fa-limit-on').checked = gp.twoFaLimitOn !== false;
    document.getElementById('gp-2fa-stock-audit-on').checked = !!gp.twoFaStockAuditOn;
    document.getElementById('gp-2fa-policy-on').checked = !!gp.twoFaPolicyOn;
    document.getElementById('gp-2fa-export-on').checked = !!gp.twoFaExportOn;

    document.getElementById('gp-tier1-name').value = gp.tier1Name || '批发平准基准价';
    document.getElementById('gp-tier2-name').value = gp.tier2Name || '网上平准零售基准价';
    document.getElementById('gp-default-min-stock').value = gp.defaultMinStock ?? 10;
    document.getElementById('gp-expiry-warn-days').value = gp.expiryWarnDays ?? 30;
    document.getElementById('gp-allow-store-return').checked = gp.allowStoreReturn !== false;

    document.getElementById('gp-slip-header-sub').value = gp.slipHeaderSub || '';
    document.getElementById('gp-slip-footer-note').value = gp.slipFooterNote || '';
    document.getElementById('gp-slip-stamp-text').value = gp.slipStampText || '调度专用章';

    window.switchPolicyTab(defaultTab);
    window.openModal('modal-global-policy');
  };

  window.applyGlobalPreset = function (presetKey) {
    const presets = {
      coop: {
        ...DEFAULT_GLOBAL_POLICY,
        harvestAidOn: true,
        onlinePriceEnabled: true,
        campaignActive: true,
        slipHeaderSub: '村社合作社源头直供 · 新鲜直达 · 诚信相照'
      },
      factory: {
        ...DEFAULT_GLOBAL_POLICY,
        carriers: [{ name: '标准木托盘', deposit: 80 }],
        twoFaThreshold: 5000,
        twoFaStockAuditOn: true,
        twoFaPolicyOn: true,
        slipHeaderSub: '源头工坊直发 · 实名保真 · 品质溯源'
      },
      hardware: {
        ...DEFAULT_GLOBAL_POLICY,
        carriers: [{ name: '周转铁料箱', deposit: 50 }],
        expiryWarnDays: 0,
        slipHeaderSub: '工料配件直供中心 · 规格齐全 · 按需配送'
      },
      cylinder: {
        ...DEFAULT_GLOBAL_POLICY,
        carriers: [{ name: '18.9L PC周转水桶', deposit: 30 }, { name: '标准钢瓶容器', deposit: 120 }],
        allowStoreReturn: false,
        slipHeaderSub: '安全循环配送 · 空桶/空瓶随车清点抵账'
      }
    };
    const chosen = presets[presetKey];
    if (!chosen) return;
    hqState.globalPolicy = JSON.parse(JSON.stringify(chosen));
    window.openGlobalPolicyModal('tiers');
    alert('✅ 已套用行业预设模板！可继续微调后保存。');
  };

  window.saveGlobalPolicySettings = async function () {
    const execSave = async () => {
      const tiers = [];
      document.querySelectorAll('#gp-tiers-container .gp-tier-row').forEach((row) => {
        const name = row.querySelector('.gp-t-name')?.value.trim();
        if (name) {
          tiers.push({
            name,
            creditLimit: parseFloat(row.querySelector('.gp-t-credit')?.value) || 2000,
            discountRate: parseFloat(row.querySelector('.gp-t-rate')?.value) || 1.0,
            returnQuota: parseFloat(row.querySelector('.gp-t-ret')?.value) || 500
          });
        }
      });

      const storeCustomFields = [];
      document.querySelectorAll('#gp-store-fields-container .gp-store-field-row').forEach((row) => {
        const f = row.querySelector('.gp-sf-name')?.value.trim();
        if (f) storeCustomFields.push(f);
      });

      const onlineTiers = [];
      document.querySelectorAll('#gp-online-tiers-container .gp-online-tier-row').forEach((row) => {
        const minQty = parseInt(row.querySelector('.gp-ot-qty')?.value) || 1;
        const rate = parseFloat(row.querySelector('.gp-ot-rate')?.value) || 1.0;
        const label = row.querySelector('.gp-ot-label')?.value.trim() || `满${minQty}件${(rate * 10).toFixed(1)}折`;
        onlineTiers.push({ minQty, rate, label });
      });
      onlineTiers.sort((a, b) => a.minQty - b.minQty);

      const rebateTiers = [];
      document.querySelectorAll('#gp-rebate-tiers-container .gp-rebate-tier-row').forEach((row) => {
        const threshold = parseFloat(row.querySelector('.gp-rt-threshold')?.value) || 0;
        const rate = parseFloat(row.querySelector('.gp-rt-rate')?.value) || 0;
        if (threshold > 0 && rate > 0) rebateTiers.push({ threshold, rate });
      });
      rebateTiers.sort((a, b) => a.threshold - b.threshold);

      const promos = [];
      document.querySelectorAll('#gp-promos-container .gp-promo-row').forEach((row) => {
        const title = row.querySelector('.gp-pr-title')?.value.trim();
        const rule = row.querySelector('.gp-pr-rule')?.value.trim();
        if (title || rule) promos.push({ title: title || '特惠活动', rule: rule || '' });
      });

      const carriers = [];
      document.querySelectorAll('#gp-carriers-container .gp-carrier-row').forEach((row) => {
        const name = row.querySelector('.gp-c-name')?.value.trim();
        if (name) carriers.push({ name, deposit: parseFloat(row.querySelector('.gp-c-deposit')?.value) || 15 });
      });

      const nextPolicy = {
        ...hqState.globalPolicy,
        storeTierEnabled: document.getElementById('gp-store-tier-enabled').checked,
        storeTiers: tiers.length > 0 ? tiers : DEFAULT_GLOBAL_POLICY.storeTiers,
        storeCustomFields,
        harvestAidOn: document.getElementById('gp-harvest-aid-on').checked,
        rationLimitQty: parseInt(document.getElementById('gp-ration-limit-qty').value) || 0,
        onlinePriceEnabled: document.getElementById('gp-online-price-enabled').checked,
        onlineTiers: onlineTiers.length > 0 ? onlineTiers : DEFAULT_GLOBAL_POLICY.onlineTiers,
        rebateEnabled: document.getElementById('gp-rebate-enabled').checked,
        rebateTiers: rebateTiers.length > 0 ? rebateTiers : DEFAULT_GLOBAL_POLICY.rebateTiers,
        promoterEnabled: document.getElementById('gp-promoter-enabled').checked,
        promoterRate: parseFloat(document.getElementById('gp-promoter-rate').value) || 0,
        referralBonus: parseFloat(document.getElementById('gp-referral-bonus').value) || 0,
        campaignActive: document.getElementById('gp-campaign-active').checked,
        promos,
        carriers: carriers.length > 0 ? carriers : DEFAULT_GLOBAL_POLICY.carriers,
        twoFaCashOn: document.getElementById('gp-2fa-cash-on').checked,
        twoFaThreshold: parseFloat(document.getElementById('gp-2fa-threshold').value) || 3000,
        twoFaPriceOn: document.getElementById('gp-2fa-price-on').checked,
        twoFaPricePct: parseFloat(document.getElementById('gp-2fa-price-pct').value) || 15,
        twoFaCreditOn: document.getElementById('gp-2fa-credit-on').checked,
        twoFaDeleteOn: document.getElementById('gp-2fa-delete-on').checked,
        twoFaLimitOn: document.getElementById('gp-2fa-limit-on').checked,
        twoFaStockAuditOn: document.getElementById('gp-2fa-stock-audit-on').checked,
        twoFaPolicyOn: document.getElementById('gp-2fa-policy-on').checked,
        twoFaExportOn: document.getElementById('gp-2fa-export-on').checked,
        tier1Name: document.getElementById('gp-tier1-name').value.trim() || '批发平准基准价',
        tier2Name: document.getElementById('gp-tier2-name').value.trim() || '网上平准零售基准价',
        defaultMinStock: parseInt(document.getElementById('gp-default-min-stock').value) || 10,
        expiryWarnDays: parseInt(document.getElementById('gp-expiry-warn-days').value) ?? 30,
        allowStoreReturn: document.getElementById('gp-allow-store-return').checked,
        slipHeaderSub: document.getElementById('gp-slip-header-sub').value.trim(),
        slipFooterNote: document.getElementById('gp-slip-footer-note').value.trim(),
        slipStampText: document.getElementById('gp-slip-stamp-text').value.trim() || '调度专用章'
      };

      localStorage.setItem('hq_global_policy_' + hqState.currentAgent, JSON.stringify(nextPolicy));
      hqState.globalPolicy = nextPolicy;

      try {
        await HQService.updateTenantWithVerify(hqState.currentAgent, { custom_settings: nextPolicy });
        if (hqState.currentTenantData) hqState.currentTenantData.custom_settings = nextPolicy;
      } catch (err) {}

      loadGlobalPolicyFromTenant(hqState.currentTenantData);
      callbacks?.onPolicyUpdated?.();
      alert('🎉 商号全局经营策略已保存并同步全端生效！');
      window.closeModal('modal-global-policy');
    };

    if (hqState.globalPolicy.twoFaPolicyOn) {
      window.trigger2FAAction('修改全局价格、返利与风控策略，请输入手机验证器 6 位动态口令授权：', execSave);
    } else {
      await execSave();
    }
  };

  window.openCounterProfileModal = function () {
    document.getElementById('counter-origin-desc-input').value = hqState.currentTenantData?.brand_origin_desc || '';
    document.getElementById('counter-media-url-input').value = hqState.currentTenantData?.media_url || '';
    const links = hqState.globalPolicy.socialLinks || {};
    document.getElementById('counter-website-url-input').value = links.websiteUrl || '';
    document.getElementById('counter-wechat-oa-input').value = links.wechatOa || '';
    document.getElementById('counter-service-wx-input').value = links.serviceWx || '';
    window.openModal('modal-counter-profile');
  };

  window.saveCounterProfile = async function () {
    const brand_origin_desc = document.getElementById('counter-origin-desc-input').value.trim();
    const media_url = document.getElementById('counter-media-url-input').value.trim();
    const socialLinks = {
      websiteUrl: document.getElementById('counter-website-url-input').value.trim(),
      wechatOa: document.getElementById('counter-wechat-oa-input').value.trim(),
      serviceWx: document.getElementById('counter-service-wx-input').value.trim()
    };

    hqState.globalPolicy.socialLinks = socialLinks;
    localStorage.setItem('hq_global_policy_' + hqState.currentAgent, JSON.stringify(hqState.globalPolicy));

    try {
      await HQService.updateTenantWithVerify(hqState.currentAgent, {
        brand_origin_desc,
        media_url,
        custom_settings: hqState.globalPolicy
      });
      if (hqState.currentTenantData) {
        hqState.currentTenantData.brand_origin_desc = brand_origin_desc;
        hqState.currentTenantData.media_url = media_url;
        hqState.currentTenantData.custom_settings = hqState.globalPolicy;
      }
      alert('✅ 产区水土档案与外部社交平台矩阵已同步至数字专柜与合作名片！');
      window.closeModal('modal-counter-profile');
    } catch (err) {
      alert('⚠️ 储存失败：' + err.message);
    }
  };

  window.openWebhookModal = function () {
    document.getElementById('webhook-url-input').value = hqState.currentTenantData?.webhook_url || '';
    window.openModal('modal-webhook-setup');
  };

  window.saveWebhookUrl = async function () {
    const url = document.getElementById('webhook-url-input').value.trim();
    try {
      await HQService.updateTenantWithVerify(hqState.currentAgent, { webhook_url: url });
      if (hqState.currentTenantData) hqState.currentTenantData.webhook_url = url;
      updateWebhookStatusBadge(url);
      alert(url ? '✅ 报单群机器人已写入云端并启用！' : '已关闭报单群机器人通知。');
      window.closeModal('modal-webhook-setup');
    } catch (err) {
      alert('⚠️ 储存失败：' + err.message);
    }
  };

  window.testWebhookPing = async function () {
    const url = document.getElementById('webhook-url-input').value.trim();
    if (!url) return alert('请先粘贴群机器人 Webhook 地址！');
    const msg = `🔔【${hqState.currentTenantData?.company_name || hqState.currentAgent}】报单提醒测试成功！`;
    try {
      await HQService.sendWebhookMessage(url, msg);
      alert('📡 测试消息已发出！请打开您的群聊查看是否收到提醒。');
    } catch (err) {
      alert('发送失败：' + err.message);
    }
  };
}
