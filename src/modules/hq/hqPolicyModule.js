import { HQService } from '../../services/hqService.js';
import { hqState, DEFAULT_GLOBAL_POLICY } from './hqState.js';

export const NINE_2FA_ITEMS = [
  { key: 'twoFaCashOn', domId: 'gp-2fa-cash-on', layer: 'L1 · 资金与价盘安全', code: '2FA-01', title: '大额财务销账 / 坏账冲抵', desc: '财务点清回款销账或核准定损冲减欠款超过阈值时触发动态口令', scope: '总舵账房结算' },
  { key: 'twoFaPriceOn', domId: 'gp-2fa-price-on', layer: 'L1 · 资金与价盘安全', code: '2FA-02', title: '大幅下调平准基准价', desc: '下调批发或网上基准价幅度超过安全百分比时触发防误调/防恶意砸价核验', scope: '总舵 ➔ 门店订货台 / 天街专柜' },
  { key: 'twoFaCreditOn', domId: 'gp-2fa-credit-on', layer: 'L1 · 资金与价盘安全', code: '2FA-03', title: '超授信额度特批放行', desc: '合作门店赊账超出分级授信上限仍需特批发货时强制大当家核身', scope: '门店订货台 ➔ 总舵 / 掌中宝' },
  { key: 'twoFaLimitOn', domId: 'gp-2fa-limit-on', layer: 'L1 · 资金与价盘安全', code: '2FA-04', title: '调高合作门店信用额度', desc: '上调单家合作门店赊账信用天花板时触发双因素授权', scope: '总舵 ➔ 门店订货台' },
  { key: 'twoFaStockAuditOn', domId: 'gp-2fa-stock-audit-on', layer: 'L2 · 货品与资产边界', code: '2FA-05', title: '库存盘亏核销 / 强行平仓', desc: '仓储盘点出现库存报损核销或强制修正账面库存时触发核验', scope: '总舵仓储台账' },
  { key: 'twoFaDeleteOn', domId: 'gp-2fa-delete-on', layer: 'L2 · 货品与资产边界', code: '2FA-06', title: '删除在供货品 / 清理档案', desc: '永久下架删除商品或清理往来档案时防止误删或恶意清空', scope: '总舵 ➔ 全端货架' },
  { key: 'twoFaPolicyOn', domId: 'gp-2fa-policy-on', layer: 'L3 · 规则与数据主权', code: '2FA-07', title: '改写全局经营策略与风控规则', desc: '修改分级折扣、多载具押金、返利分润及本页 9 项风控开关时触发核验', scope: '全端全局策略生效' },
  { key: 'twoFaExportOn', domId: 'gp-2fa-export-on', layer: 'L3 · 规则与数据主权', code: '2FA-08', title: '导出全量核心账本与分润表', desc: '批量导出客户档案、价格体系及返利核算 CSV 时防数据批量外泄', scope: '总舵数据主权保护' },
  { key: 'twoFaEmergencyBrakeOn', domId: 'gp-2fa-emergency-brake-on', layer: 'L4 · 全局应急熔断', code: '2FA-09', title: '🚨 紧急止损拉闸（全盘熔断锁单）', desc: '遭遇异常刷单、行情剧烈波动或突发事故时，一键熔断全网新单入口（拉闸与合闸均需 2FA）', scope: '立即锁定门店订货台与天街专柜下单' }
];

const PRESET_DISPLAY_NAMES = {
  coop: '村社合作社/生鲜标准策略',
  factory: '源头工坊/制造直供策略',
  hardware: '五金建材/汽配集采策略',
  cylinder: '水桶/气瓶循环押金策略'
};

export function polishHQHeaderVisualBalance() {
  const header = document.getElementById('hq-main-header') || document.querySelector('header');
  const secHost = document.getElementById('hq-security-banner-host');
  const circuitSlot = document.getElementById('hq-header-circuit-slot');
  if (!header || !secHost) return;

  const mergeInnerBanner = () => {
    const firstCard = secHost.firstElementChild;
    if (!firstCard) return;
    firstCard.className = 'mb-2.5 pb-2 border-b border-emerald-700/50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-100/85';
    firstCard.querySelectorAll('span, p, div').forEach((el) => {
      if (el.classList.contains('text-stone-600') || el.classList.contains('text-stone-700')) {
        el.classList.remove('text-stone-600', 'text-stone-700');
        el.classList.add('text-emerald-100/85');
      }
    });
    const brakeBtn = firstCard.querySelector('button');
    if (brakeBtn) {
      brakeBtn.className = 'bg-rose-950/90 hover:bg-rose-700 text-rose-100 border border-rose-500/60 px-2.5 py-1 rounded-xl font-bold text-[11px] active:scale-95 transition flex items-center gap-1';
    }
    if (circuitSlot) {
      circuitSlot.appendChild(firstCard);
    } else {
      header.insertAdjacentElement('afterbegin', firstCard);
    }
  };

  mergeInnerBanner();
  if (!secHost.dataset.observed) {
    new MutationObserver(() => mergeInnerBanner()).observe(secHost, { childList: true });
    secHost.dataset.observed = '1';
  }

  const totpBtn = document.getElementById('btn-top-totp');
  if (totpBtn && !totpBtn.dataset.styleLocked) {
    const fixTotpStyle = () => {
      const targetClass = 'w-full text-left px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-bold flex items-center gap-1.5';
      if (totpBtn.className !== targetClass) {
        totpBtn.className = targetClass;
      }
    };
    fixTotpStyle();
    new MutationObserver(fixTotpStyle).observe(totpBtn, { attributes: true, attributeFilter: ['class'] });
    totpBtn.dataset.styleLocked = '1';
  }
}

export function applyIndustryTerminology(tenant) {
  const entityVal = document.getElementById('entity-type-selector')?.value || '';
  const selectText = document.getElementById('entity-type-selector')?.selectedOptions?.[0]?.text || '';
  const bizType = `${entityVal} ${tenant?.business_type || ''} ${tenant?.industry_type || ''} ${selectText}`.trim();

  const isAgri = entityVal === 'coop' || /coop|农|合作社|生鲜|果蔬|粮油|种植|养殖/.test(bizType);
  const isFactory = entityVal === 'factory' || /factory|工坊|制造|加工|生产|厂/.test(bizType);

  const terms = isAgri
    ? {
        industryCategory: 'agri',
        hqTitle: '源头直供与产销调度台',
        pauseBtnHtml: '<span>🍵</span> 农忙暂歇设置',
        pauseStatus: '农忙采收 / 休市暂歇',
        pauseDefaultReason: '产区农忙采收集中加工中',
        harvestBtnHtml: '<span>🌾</span> 采收排产总单',
        harvestAggBtnHtml: '<span>🌾</span> 采收排产汇总单',
        harvestModalTitle: '🌾 源头采收 / 产区排产汇总单',
        mediaBtnHtml: '<span>🎥</span> 产区实拍与外链',
        counterModalTitle: '🎥 产区水土档案与外部平台外链矩阵',
        aidBadge: '🌾 丰产助农平准认领开启',
        aidSettingTitle: '🌾 丰产助农/助工平准特惠',
        promoTabName: '② 丰歉平准与阶梯价',
        groupPackTitle: '🏛️ 企事业单位 / 食堂阳光集采包',
        groupPackDesc: '一键汇总营业执照核验、联保背书与全品阳光工价报价单。'
      }
    : isFactory
    ? {
        industryCategory: 'factory',
        hqTitle: '源头工坊与产销调度台',
        pauseBtnHtml: '<span>🏭</span> 检修 / 盘点暂歇',
        pauseStatus: '产线检修 / 仓库盘点暂歇',
        pauseDefaultReason: '车间产线检修与仓库盘点中',
        harvestBtnHtml: '<span>⚙️</span> 车间排产总单',
        harvestAggBtnHtml: '<span>⚙️</span> 车间排产汇总单',
        harvestModalTitle: '⚙️ 源头工坊 / 车间排产汇总单',
        mediaBtnHtml: '<span>🏭</span> 工厂实拍与外链',
        counterModalTitle: '🏭 工厂车间档案与外部平台外链矩阵',
        aidBadge: '🏭 产能平准集采认领开启',
        aidSettingTitle: '🏭 产能平准集采特惠',
        promoTabName: '② 产能平准与阶梯价',
        groupPackTitle: '🏛️ 政企单位 / 工程集采报价包',
        groupPackDesc: '一键汇总企业资质核验、出厂质保背书与全品出厂集采报价单。'
      }
    : {
        industryCategory: 'commerce',
        hqTitle: '百工百业数字调度台',
        pauseBtnHtml: '<span>⏸️</span> 盘点 / 休市暂歇',
        pauseStatus: '仓库盘点 / 休市暂歇',
        pauseDefaultReason: '仓库盘点清仓与休市整理中',
        harvestBtnHtml: '<span>📋</span> 用度备货总单',
        harvestAggBtnHtml: '<span>📋</span> 用度备货汇总单',
        harvestModalTitle: '📋 真实用度备货 / 排产汇总单',
        mediaBtnHtml: '<span>🏢</span> 企业实拍与外链',
        counterModalTitle: '🏢 企业仓储档案与外部平台外链矩阵',
        aidBadge: '📦 余缺平准调剂认领开启',
        aidSettingTitle: '📦 阶段平准集采认领特惠',
        promoTabName: '② 阶段调剂与阶梯价',
        groupPackTitle: '🏛️ 政企单位 / 大客户阳光集采包',
        groupPackDesc: '一键汇总营业执照核验、主体信义背书与全品阳光集采报价单。'
      };

  window.__hqIndustryTerms = terms;
  if (hqState.globalPolicy) hqState.globalPolicy.industryTerms = terms;

  const mapHtml = {
    'btn-seasonal-pause': terms.pauseBtnHtml,
    'btn-top-plan-agg': terms.harvestBtnHtml,
    'btn-settle-plan-agg': terms.harvestAggBtnHtml,
    'btn-top-counter': terms.mediaBtnHtml
  };
  Object.entries(mapHtml).forEach(([id, html]) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });

  const mapText = {
    'hq-title': terms.hqTitle,
    'plan-agg-modal-title': terms.harvestModalTitle,
    'counter-modal-title': terms.counterModalTitle,
    'gp-tab-promo': terms.promoTabName,
    'gp-aid-title-lbl': terms.aidSettingTitle
  };
  Object.entries(mapText).forEach(([id, txt]) => {
    const el = document.getElementById(id);
    if (el) el.innerText = txt;
  });

  const rewriteAdvisorCards = () => {
    const advisorBox = document.getElementById('ai-advisor-cards');
    if (!advisorBox) return;
    advisorBox.querySelectorAll('b, h3, h4, div').forEach((el) => {
      if (el.children.length === 0 && (el.innerText.includes('食堂阳光集采包') || el.innerText.includes('阳光集采包') || el.innerText.includes('工程集采报价包'))) {
        el.innerText = terms.groupPackTitle;
      }
    });
    advisorBox.querySelectorAll('p, span, div').forEach((el) => {
      if (el.children.length === 0 && (el.innerText.includes('全品阳光工价报价单') || el.innerText.includes('出厂集采报价单') || el.innerText.includes('全品阳光集采报价单'))) {
        el.innerText = terms.groupPackDesc;
      }
    });
  };

  rewriteAdvisorCards();
  const advisorBox = document.getElementById('ai-advisor-cards');
  if (advisorBox && !advisorBox.dataset.termObserved) {
    new MutationObserver(() => rewriteAdvisorCards()).observe(advisorBox, { childList: true, subtree: true });
    advisorBox.dataset.termObserved = '1';
  }
}

export function renderActivePolicyBadgesBar() {
  const bar = document.getElementById('active-policy-badges-bar');
  if (!bar) return;

  const gp = hqState.globalPolicy;
  const terms = window.__hqIndustryTerms || { aidBadge: '📦 余缺平准调剂认领开启' };
  const chips = [];

  if (gp.activePolicyName) {
    chips.push(`<span class="bg-amber-300 text-stone-950 px-2.5 py-0.5 rounded-full font-bold shadow-2xs">📌 在用方案：${gp.activePolicyName}</span>`);
  }
  if (gp.emergencyBrakeActive) {
    chips.push('<span class="bg-rose-600 text-white border border-rose-300 px-2.5 py-0.5 rounded-full font-bold animate-pulse">🚨 紧急止损已拉闸（全网新单熔断中）</span>');
  }
  if (gp.storeTierEnabled !== false) {
    chips.push('<span class="bg-white/10 text-emerald-100 border border-white/15 px-2.5 py-0.5 rounded-full">🟢 门店分级折扣生效中</span>');
  }
  if (gp.harvestAidOn) {
    chips.push(`<span class="bg-white/10 text-emerald-100 border border-white/15 px-2.5 py-0.5 rounded-full">${terms.aidBadge}</span>`);
  }
  if (parseInt(gp.rationLimitQty || 0) > 0) {
    chips.push(`<span class="bg-white/10 text-amber-200 border border-amber-300/30 px-2.5 py-0.5 rounded-full">🛡️ 紧缺定额限购 ${gp.rationLimitQty} 件</span>`);
  }
  if (gp.onlinePriceEnabled) {
    chips.push('<span class="bg-white/10 text-emerald-100 border border-white/15 px-2.5 py-0.5 rounded-full">🌐 网上多档价格生效中</span>');
  }
  if (gp.rebateEnabled !== false) {
    chips.push('<span class="bg-white/10 text-emerald-100 border border-white/15 px-2.5 py-0.5 rounded-full">🎁 进货返利生效中</span>');
  }
  if (gp.pickupServiceEnabled) {
    const unitTxt = gp.pickupServiceMode === 'percent' ? `${gp.pickupServiceValue || 0}%` : `¥${gp.pickupServiceValue || 0}/单`;
    chips.push(`<span class="bg-white/10 text-emerald-100 border border-white/15 px-2.5 py-0.5 rounded-full">📍 门店自提履约补贴 ${unitTxt}</span>`);
  }
  if (gp.campaignActive) {
    chips.push('<span class="bg-white/10 text-amber-200 border border-amber-300/30 px-2.5 py-0.5 rounded-full">🔥 促销活动进行中</span>');
  }

  const enabled2faCount = NINE_2FA_ITEMS.filter((item) =>
    item.key === 'twoFaStockAuditOn' || item.key === 'twoFaPolicyOn' || item.key === 'twoFaExportOn'
      ? !!gp[item.key]
      : gp[item.key] !== false
  ).length;
  chips.push(`<span class="bg-white/10 text-emerald-200 border border-white/15 px-2 py-0.5 rounded-full font-mono">🛡️ 2FA防线 ${enabled2faCount}/9 已布防</span>`);

  bar.innerHTML = chips.join('');
}

export function syncSeasonalPauseBannerUI() {
  const gp = hqState.globalPolicy;
  const sp = gp.seasonalPause;
  const banner = document.getElementById('hq-seasonal-pause-banner');
  const textEl = document.getElementById('hq-seasonal-pause-text');
  if (!banner || !textEl) return;

  const terms = window.__hqIndustryTerms || { pauseStatus: '盘点 / 休市暂歇' };

  if (gp.emergencyBrakeActive) {
    banner.classList.remove('hidden');
    banner.className = 'bg-rose-950 text-white border-2 border-rose-500 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs shadow-lg';
    textEl.innerHTML = `🚨 <b>【紧急止损拉闸已生效】</b>：${gp.emergencyBrakeReason || '全盘行情/风控紧急熔断中'}（已锁定合作门店订货台与百工天街新单提交，旧单交割与对账照常运行）`;
    return;
  }

  if (sp && sp.isPaused) {
    banner.classList.remove('hidden');
    textEl.innerText = `⏸️ 当前处于【${terms.pauseStatus}】状态：${sp.reason || '仓库盘点/休市整理中'}${sp.resumeDate ? `（预计 ${sp.resumeDate} 恢复接单）` : ''}`;
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
    activePolicyName: '商号现行默认策略',
    pickupServiceEnabled: true,
    pickupServiceMode: 'fixed',
    pickupServiceValue: 1.5,
    twoFaEmergencyBrakeOn: true,
    emergencyBrakeActive: false,
    emergencyBrakeReason: '',
    ...savedLocal,
    ...cloudPolicy
  };

  if (!gp.activePolicyName) gp.activePolicyName = '商号现行默认策略';
  if (gp.pickupServiceEnabled === undefined) gp.pickupServiceEnabled = true;
  if (!gp.pickupServiceMode) gp.pickupServiceMode = 'fixed';
  if (gp.pickupServiceValue === undefined) gp.pickupServiceValue = 1.5;
  if (gp.twoFaEmergencyBrakeOn === undefined) gp.twoFaEmergencyBrakeOn = true;
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

  polishHQHeaderVisualBalance();
  applyIndustryTerminology(tenant);
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

function renderCustomPresetsBar(isExpanded = false, pendingPreviewName = '') {
  const bar = document.getElementById('policy-presets-bar');
  if (!bar) return;

  const parentBox = bar.parentElement;
  if (parentBox) {
    Array.from(parentBox.children).forEach((child) => {
      if (child !== bar) child.classList.add('hidden');
    });
  }

  let customPresets = [];
  try {
    customPresets = JSON.parse(localStorage.getItem('hq_custom_presets_' + hqState.currentAgent) || '[]');
  } catch (e) {}

  const activeName = hqState.globalPolicy.activePolicyName || '商号现行默认策略';

  bar.className = 'w-full space-y-2 text-xs';
  bar.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="inline-flex items-center gap-1.5 bg-[#1b4332] text-white px-3 py-1.5 rounded-xl font-bold shadow-2xs">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>本商号当前在用策略：</span>
          <span class="text-amber-300">【${activeName}】</span>
        </span>
        ${
          pendingPreviewName
            ? `<span class="bg-amber-200 text-amber-950 px-2.5 py-1 rounded-xl font-bold text-[11px]">⚠️ 已载入【${pendingPreviewName}】预览，请点底部「保存」生效</span>`
            : ''
        }
      </div>

      <div class="flex items-center gap-1.5">
        <button type="button" onclick="window.saveCurrentAsCustomPreset()" class="px-2.5 py-1.5 rounded-xl bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-950 font-bold transition">
          💾 存为新方案
        </button>
        <button type="button" id="btn-toggle-preset-drawer" onclick="window.togglePresetDrawer()" class="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold transition shadow-2xs">
          ${isExpanded ? '收起参考样板 ▲' : '📂 切换 / 套用参考策略 ▾'}
        </button>
      </div>
    </div>

    <div id="gp-preset-drawer" class="${isExpanded ? '' : 'hidden'} pt-2.5 mt-1 border-t border-amber-200/80 space-y-2.5">
      <div class="text-[11px] text-amber-900">
        💡 点击任一方案可将下方 5 页参数整套替换为该模板，确认无误后点击弹窗最底部<b>「保存全局经营策略」</b>即可全端生效：
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-[11px] font-bold text-stone-600 mr-1">① 行业参考样板：</span>
        <button type="button" onclick="window.applyGlobalPreset('coop')" class="px-2.5 py-1 rounded-xl bg-white hover:bg-emerald-50 border border-amber-300 text-stone-800 font-bold transition">🌾 村社合作社/生鲜</button>
        <button type="button" onclick="window.applyGlobalPreset('factory')" class="px-2.5 py-1 rounded-xl bg-white hover:bg-emerald-50 border border-amber-300 text-stone-800 font-bold transition">🏭 源头工坊/制造</button>
        <button type="button" onclick="window.applyGlobalPreset('hardware')" class="px-2.5 py-1 rounded-xl bg-white hover:bg-emerald-50 border border-amber-300 text-stone-800 font-bold transition">🛠️ 五金建材/汽配</button>
        <button type="button" onclick="window.applyGlobalPreset('cylinder')" class="px-2.5 py-1 rounded-xl bg-white hover:bg-emerald-50 border border-amber-300 text-stone-800 font-bold transition">💧 水桶/气瓶循环</button>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-[11px] font-bold text-emerald-950 mr-1">② 本店自存方案：</span>
        ${
          customPresets.length === 0
            ? '<span class="text-[11px] text-stone-400">暂无自存方案（点右上角「💾 存为新方案」可保存当前这套参数）</span>'
            : customPresets
                .map((cp, idx) => {
                  const isCurrent = cp.name === activeName;
                  return `
                    <span class="inline-flex items-center rounded-xl ${
                      isCurrent ? 'bg-[#1b4332] text-amber-300 border border-[#1b4332]' : 'bg-emerald-100 text-emerald-950 border border-emerald-400'
                    } font-bold overflow-hidden">
                      <button type="button" onclick="window.applySavedCustomPreset(${idx})" class="px-2.5 py-1 hover:opacity-90 transition">
                        ${isCurrent ? '🟢' : '⭐'} ${cp.name}
                      </button>
                      <button type="button" onclick="window.deleteSavedCustomPreset(${idx})" title="删除此方案" class="px-1.5 py-1 hover:bg-rose-600 hover:text-white border-l ${
                        isCurrent ? 'border-emerald-700 text-emerald-200' : 'border-emerald-300 text-emerald-800'
                      } transition">✕</button>
                    </span>
                  `;
                })
                .join('')
        }
      </div>
    </div>
  `;
}

function enhancePolicyModalHierarchy() {
  const terms = window.__hqIndustryTerms || { promoTabName: '② 阶段调剂与阶梯价' };
  const promoTabBtn = document.getElementById('gp-tab-promo');
  if (promoTabBtn) promoTabBtn.innerText = terms.promoTabName;

  const riskTabBtn = document.getElementById('gp-tab-risk');
  if (riskTabBtn) riskTabBtn.innerText = '④ 价盘与9项2FA风控';

  const tabMetaMap = {
    tiers: {
      layer: '第一层 · 客户建档与授信层',
      scope: '保存即同步至【合作门店订货台（自动折算分级价/校验授信）】与【百工掌中宝（交割单打印档案）】'
    },
    promo: {
      layer: `第二层 · ${terms.promoTabName.replace(/^②\s*/, '')}层（含推客分润与自提履约费独立核算）`,
      scope: '保存即同步至【合作门店订货台 / 百工天街专柜（阶梯折算与限购）】及【本台绩效返利与分润台账】'
    },
    carriers: {
      layer: '第三层 · 循环载具资产层',
      scope: '保存即同步至【百工掌中宝（随车回收按押金抵扣货款）】与【合作门店订货台（结存提醒）】'
    },
    risk: {
      layer: '第四层 · 价盘基准与 9 项 2FA 高危风控层（含紧急止损拉闸）',
      scope: '全端硬拦截生效（总舵调度台 / 合作门店订货台 / 百工天街 / 百工掌中宝）'
    },
    slip: {
      layer: '第五层 · 凭单落款与印章审计层',
      scope: '保存即印制于【百工掌中宝蓝牙交割小票】与【门店周期电子对账单】'
    }
  };

  Object.entries(tabMetaMap).forEach(([tabKey, info]) => {
    const pane = document.getElementById(`gp-pane-${tabKey}`);
    if (!pane) return;
    let banner = pane.querySelector('.gp-layer-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'gp-layer-banner mb-3 bg-stone-900 text-white px-3.5 py-2 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-[11px]';
      pane.insertAdjacentElement('afterbegin', banner);
    }
    banner.innerHTML = `
      <span class="font-bold text-amber-300">🧭 ${info.layer}</span>
      <span class="text-stone-300 text-[10px]">生效边界：${info.scope}</span>
    `;
  });

  const riskPane = document.getElementById('gp-pane-risk');
  if (!riskPane) return;

  const gp = hqState.globalPolicy;
  const isBraked = !!gp.emergencyBrakeActive;

  let brakeBox = document.getElementById('gp-emergency-brake-card');
  if (!brakeBox) {
    brakeBox = document.createElement('div');
    brakeBox.id = 'gp-emergency-brake-card';
    const layerBanner = riskPane.querySelector('.gp-layer-banner');
    if (layerBanner) {
      layerBanner.insertAdjacentElement('afterend', brakeBox);
    } else {
      riskPane.insertAdjacentElement('afterbegin', brakeBox);
    }
  }

  brakeBox.className = `mb-3 p-3.5 rounded-2xl border-2 ${
    isBraked ? 'bg-rose-950 text-white border-rose-500 shadow-lg' : 'bg-rose-50/90 text-rose-950 border-rose-300'
  } space-y-2.5 text-xs`;

  brakeBox.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div class="font-bold text-sm flex items-center gap-1.5">
          <span>🚨 第 9 项 2FA 核心防线：紧急止损拉闸（全盘熔断锁单）</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full font-mono ${
            isBraked ? 'bg-rose-500 text-white' : 'bg-emerald-700 text-white'
          }">${isBraked ? '已拉闸熔断中' : '当前正常营业'}</span>
        </div>
        <p class="text-[11px] opacity-85 mt-0.5">
          遭遇行情剧烈波动、异常恶意刷单或紧急盘点时，可立即拉闸锁死 <b>合作门店订货台</b> 与 <b>百工天街专柜</b> 新单入口（旧单交割与对账不受影响）。
        </p>
      </div>
      <button type="button" onclick="window.toggleEmergencyStopBrake()" class="${
        isBraked
          ? 'bg-emerald-500 hover:bg-emerald-400 text-stone-950'
          : 'bg-rose-600 hover:bg-rose-700 text-white'
      } font-bold px-4 py-2 rounded-xl text-xs shadow active:scale-95 transition shrink-0">
        ${isBraked ? '🟢 2FA 核身合闸恢复接单' : '🚨 立即 2FA 紧急止损拉闸'}
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t ${isBraked ? 'border-rose-800' : 'border-rose-200'}">
      <label class="flex items-center gap-2 cursor-pointer font-bold">
        <input type="checkbox" id="gp-2fa-emergency-brake-on" ${gp.twoFaEmergencyBrakeOn !== false ? 'checked' : ''} class="w-4 h-4 rounded text-rose-600">
        <span>拉闸 / 合闸操作强制启用 2FA 动态口令核验</span>
      </label>
      <input type="text" id="gp-emergency-brake-reason" value="${gp.emergencyBrakeReason || ''}" placeholder="拉闸公示说明（如：行情波动调价中，暂缓接新单）" class="w-full ${
        isBraked ? 'bg-rose-900 border-rose-700 text-white placeholder-rose-300' : 'bg-white border-rose-200 text-stone-800'
      } border rounded-xl px-2.5 py-1 text-[11px] outline-none">
    </div>
  `;

  let matrixBox = document.getElementById('gp-nine-2fa-matrix-summary');
  if (!matrixBox) {
    matrixBox = document.createElement('div');
    matrixBox.id = 'gp-nine-2fa-matrix-summary';
    matrixBox.className = 'mt-3 bg-indigo-50/60 border border-indigo-200 p-3 rounded-2xl space-y-2 text-[11px]';
    riskPane.appendChild(matrixBox);
  }

  matrixBox.innerHTML = `
    <div class="flex items-center justify-between border-b border-indigo-200/70 pb-1.5">
      <b class="text-indigo-950">🛡️ 商号 9 项 2FA 双因素高危风控防线总览（保存即全端生效）</b>
      <span class="text-[10px] font-mono text-indigo-700">L1资金价盘 · L2货权资产 · L3数据规则 · L4应急熔断</span>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-1.5">
      ${NINE_2FA_ITEMS.map((item) => {
        const isChecked =
          item.key === 'twoFaStockAuditOn' || item.key === 'twoFaPolicyOn' || item.key === 'twoFaExportOn'
            ? !!gp[item.key]
            : gp[item.key] !== false;
        return `
          <div class="bg-white border ${isChecked ? 'border-emerald-300' : 'border-stone-200'} p-2 rounded-xl flex flex-col justify-between gap-1">
            <div class="flex items-center justify-between">
              <span class="font-mono text-[10px] font-bold text-indigo-800">${item.code} · ${item.layer.split('·')[0].trim()}</span>
              <span class="text-[10px] font-bold ${isChecked ? 'text-emerald-700' : 'text-stone-400'}">${isChecked ? '● 2FA已布防' : '○ 未开启'}</span>
            </div>
            <b class="text-stone-900 text-[11px]">${item.title}</b>
            <span class="text-[10px] text-stone-500">作用端：${item.scope}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export function initPolicyBindings(callbacks) {
  const entitySelect = document.getElementById('entity-type-selector');
  entitySelect?.addEventListener('change', async () => {
    applyIndustryTerminology(hqState.currentTenantData);
    renderActivePolicyBadgesBar();
    syncSeasonalPauseBannerUI();
    try {
      await HQService.updateTenantWithVerify(hqState.currentAgent, { custom_settings: hqState.globalPolicy });
    } catch (e) {}
  });

  const syncUniversalWording = () => {
    const terms = window.__hqIndustryTerms;
    if (!terms) return;
    document.querySelectorAll('#ai-advisor-cards b, #ai-advisor-cards p, #ai-advisor-cards span, #ai-advisor-cards div').forEach((el) => {
      if (el.children.length > 0) return;
      if (el.innerText.includes('食堂阳光集采包') || el.innerText.includes('阳光集采包') || el.innerText.includes('工程集采报价包')) {
        el.innerText = terms.groupPackTitle;
      }
      if (el.innerText.includes('全品阳光工价报价单') || el.innerText.includes('出厂集采报价单') || el.innerText.includes('全品阳光集采报价单')) {
        el.innerText = terms.groupPackDesc;
      }
    });
  };
  setInterval(syncUniversalWording, 1200);

  window.togglePresetDrawer = function () {
    const drawer = document.getElementById('gp-preset-drawer');
    const isCurrentlyHidden = drawer ? drawer.classList.contains('hidden') : true;
    renderCustomPresetsBar(isCurrentlyHidden);
  };

  window.toggleEmergencyStopBrake = async function () {
    const nextState = !hqState.globalPolicy.emergencyBrakeActive;
    const reasonInput = document.getElementById('gp-emergency-brake-reason')?.value.trim();
    const reason =
      reasonInput ||
      (nextState
        ? prompt('请输入【紧急止损拉闸】原因（将实时公示给合作门店与天街买家）：', '行情波动平准调价中，紧急暂停新单接入') || '紧急止损熔断中'
        : '');

    if (nextState && !reason) return;

    const executeBrakeToggle = async () => {
      hqState.globalPolicy.emergencyBrakeActive = nextState;
      hqState.globalPolicy.emergencyBrakeReason = nextState ? reason : '';
      const brakeCheck = document.getElementById('gp-2fa-emergency-brake-on');
      if (brakeCheck) hqState.globalPolicy.twoFaEmergencyBrakeOn = brakeCheck.checked;

      localStorage.setItem('hq_global_policy_' + hqState.currentAgent, JSON.stringify(hqState.globalPolicy));
      try {
        await HQService.updateTenantWithVerify(hqState.currentAgent, { custom_settings: hqState.globalPolicy });
        if (hqState.currentTenantData) hqState.currentTenantData.custom_settings = hqState.globalPolicy;
      } catch (err) {
        console.warn('云端同步拉闸状态提示:', err.message);
      }

      renderActivePolicyBadgesBar();
      syncSeasonalPauseBannerUI();
      enhancePolicyModalHierarchy();
      callbacks?.onPolicyUpdated?.();

      alert(
        nextState
          ? `🚨 【紧急止损拉闸已生效】！\n原因：${reason}\n\n已立即熔断合作门店订货台与百工天街的新订单提交入口，旧单交割与对账仍可正常进行。`
          : '🟢 【紧急止损已合闸解除】！全网门店订货台与百工天街专柜已恢复正常接单。'
      );
    };

    const need2fa =
      document.getElementById('gp-2fa-emergency-brake-on')?.checked ??
      hqState.globalPolicy.twoFaEmergencyBrakeOn !== false;

    if (need2fa && typeof window.trigger2FAAction === 'function') {
      window.trigger2FAAction(
        nextState
          ? '🚨 执行【第9项2FA · 紧急止损拉闸】将立即锁定全网新单入口，请输入手机验证器 6 位动态码授权：'
          : '🟢 解除【紧急止损拉闸】恢复全网接单，请输入手机验证器 6 位动态码授权：',
        executeBrakeToggle
      );
    } else {
      await executeBrakeToggle();
    }
  };

  window.openSeasonalPauseModal = function () {
    const terms = window.__hqIndustryTerms || {
      pauseBtnHtml: '<span>⏸️</span> 盘点 / 休市暂歇',
      pauseDefaultReason: '仓库盘点清仓与休市整理中'
    };
    const sp = hqState.globalPolicy.seasonalPause || { isPaused: false, reason: terms.pauseDefaultReason, resumeDate: '' };
    const modal = document.getElementById('modal-seasonal-pause');
    const titleEl = modal?.querySelector('h3');
    if (titleEl) titleEl.innerHTML = `${terms.pauseBtnHtml}（全网挂牌公示）`;

    document.getElementById('sp-is-paused').checked = !!sp.isPaused;
    document.getElementById('sp-reason').value = sp.reason || terms.pauseDefaultReason;
    document.getElementById('sp-resume-date').value = sp.resumeDate || '';
    window.openModal('modal-seasonal-pause');
  };

  window.saveSeasonalPauseSettings = async function () {
    const terms = window.__hqIndustryTerms || {
      pauseStatus: '盘点 / 休市暂歇',
      pauseDefaultReason: '仓库盘点清仓与休市整理中'
    };
    const isPaused = document.getElementById('sp-is-paused').checked;
    const reason = document.getElementById('sp-reason').value.trim() || terms.pauseDefaultReason;
    const resumeDate = document.getElementById('sp-resume-date').value || '';

    hqState.globalPolicy.seasonalPause = { isPaused, reason, resumeDate };
    localStorage.setItem('hq_global_policy_' + hqState.currentAgent, JSON.stringify(hqState.globalPolicy));

    try {
      await HQService.updateTenantWithVerify(hqState.currentAgent, { custom_settings: hqState.globalPolicy });
      if (hqState.currentTenantData) hqState.currentTenantData.custom_settings = hqState.globalPolicy;
    } catch (e) {}

    syncSeasonalPauseBannerUI();
    window.closeModal('modal-seasonal-pause');
    alert(isPaused ? `⏸️ 已挂出【${terms.pauseStatus}】告示（${reason}），门店订货台与天街专柜已同步显示！` : '🟢 已解除暂歇告示，恢复正常接单营业！');
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
    const defaultSuggest = hqState.globalPolicy.activePolicyName || '';
    const name = prompt('为当前这套策略组合起个方案名称（如：日常平销策略 / 节前备货模式）：', defaultSuggest);
    if (!name || !name.trim()) return;
    const cleanName = name.trim();

    let customPresets = [];
    try {
      customPresets = JSON.parse(localStorage.getItem('hq_custom_presets_' + hqState.currentAgent) || '[]');
    } catch (e) {}

    const snapshot = JSON.parse(JSON.stringify(hqState.globalPolicy));
    snapshot.activePolicyName = cleanName;

    const existIdx = customPresets.findIndex((x) => x.name === cleanName);
    if (existIdx >= 0) {
      customPresets[existIdx] = { name: cleanName, policy: snapshot };
    } else {
      customPresets.push({ name: cleanName, policy: snapshot });
    }
    localStorage.setItem('hq_custom_presets_' + hqState.currentAgent, JSON.stringify(customPresets));

    hqState.globalPolicy.activePolicyName = cleanName;
    renderCustomPresetsBar(false);
    alert(`✅ 已将当前策略存为本店方案【${cleanName}】！点击弹窗底部「保存全局经营策略」即可全端生效。`);
  };

  window.deleteSavedCustomPreset = function (idx) {
    let customPresets = [];
    try {
      customPresets = JSON.parse(localStorage.getItem('hq_custom_presets_' + hqState.currentAgent) || '[]');
    } catch (e) {}
    const target = customPresets[idx];
    if (!target || !confirm(`确定删除本店自存方案【${target.name}】吗？`)) return;
    customPresets.splice(idx, 1);
    localStorage.setItem('hq_custom_presets_' + hqState.currentAgent, JSON.stringify(customPresets));
    renderCustomPresetsBar(true);
  };

  window.applySavedCustomPreset = function (idx) {
    let customPresets = [];
    try {
      customPresets = JSON.parse(localStorage.getItem('hq_custom_presets_' + hqState.currentAgent) || '[]');
    } catch (e) {}
    const target = customPresets[idx];
    if (!target) return;
    hqState.globalPolicy = JSON.parse(JSON.stringify(target.policy));
    hqState.globalPolicy.activePolicyName = target.name;
    window.openGlobalPolicyModal('tiers', false, target.name);
  };

  window.addPolicyTierRow = function (name = '', credit = 2000, rate = 1.0, retQuota = 500) {
    const box = document.getElementById('gp-tiers-container');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-1.5 items-center bg-stone-50 p-2 rounded-xl border border-stone-200 gp-tier-row';
    row.innerHTML = `
      <input type="text" placeholder="分级名称(如LV1核心店)" value="${name}" class="gp-t-name col-span-4 bg-white border border-stone-200 rounded-lg px-2 py-1 font-bold outline-none">
      <input type="number" placeholder="信用额度" value="${credit}" title="默认信用额度(元)" class="gp-t-credit col-span-3 bg-white border border-stone-200 rounded-lg px-2 py-1 font-mono outline-none">
      <input type="number" step="0.01" placeholder="折扣系数" value="${rate}" title="协议折扣系数(0.95=95折)" class="gp-t-rate col-span-3 bg-white border border-stone-200 rounded-lg px-2 py-1 font-mono outline-none">
      <input type="number" placeholder="免批退货额" value="${retQuota}" title="月度免批退货额度(元)" class="gp-t-ret col-span-2 bg-white border border-stone-200 rounded-lg px-2 py-1 font-mono outline-none">
    `;
    box.appendChild(row);
  };

  window.addPolicyStoreFieldRow = function (fieldName = '') {
    const box = document.getElementById('gp-store-fields-container');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 bg-stone-50 p-2 rounded-xl border border-stone-200 gp-store-field-row';
    row.innerHTML = `<input type="text" placeholder="信息栏名称(如:施工工地名称 / 冷库容量 / 开票税号)" value="${fieldName}" class="gp-sf-name flex-1 bg-white border border-stone-200 rounded-lg px-2.5 py-1 font-bold outline-none">`;
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
      <input type="text" placeholder="标签(如满5件9.5折)" value="${label}" class="gp-ot-label col-span-4 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 outline-none">
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
      <input type="text" placeholder="活动名称(如:金秋订货节)" value="${title}" class="gp-pr-title w-1/3 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 font-bold outline-none">
      <input type="text" placeholder="优惠规则说明(如:满20件送1件 / 满500减30)" value="${rule}" class="gp-pr-rule flex-1 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 outline-none">
    `;
    box.appendChild(row);
  };

  window.addPolicyCarrierRow = function (name = '', deposit = 15) {
    const box = document.getElementById('gp-carriers-container');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 bg-stone-50 p-2 rounded-xl border border-stone-200 gp-carrier-row';
    row.innerHTML = `
      <input type="text" placeholder="载具名称(如:塑料周转筐/木托盘/气瓶)" value="${name}" class="gp-c-name flex-1 bg-white border border-stone-200 rounded-lg px-2.5 py-1 font-bold outline-none">
      <span class="text-stone-500">押金单价 ¥</span>
      <input type="number" step="1" placeholder="15" value="${deposit}" class="gp-c-deposit w-24 bg-white border border-stone-200 rounded-lg px-2 py-1 font-mono font-bold outline-none">
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

  window.openGlobalPolicyModal = function (defaultTab = 'tiers', expandPresets = false, pendingPreviewName = '') {
    const gp = hqState.globalPolicy;
    renderCustomPresetsBar(expandPresets, pendingPreviewName);
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

    const pickupChk = document.getElementById('gp-pickup-service-enabled');
    const pickupMode = document.getElementById('gp-pickup-service-mode');
    const pickupVal = document.getElementById('gp-pickup-service-value');
    if (pickupChk) pickupChk.checked = gp.pickupServiceEnabled !== false;
    if (pickupMode) pickupMode.value = gp.pickupServiceMode || 'fixed';
    if (pickupVal) pickupVal.value = gp.pickupServiceValue ?? 1.5;

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

    enhancePolicyModalHierarchy();
    window.switchPolicyTab(defaultTab);
    window.openModal('modal-global-policy');
  };

  window.applyGlobalPreset = function (presetKey) {
    const presets = {
      coop: {
        activePolicyName: PRESET_DISPLAY_NAMES.coop,
        storeTierEnabled: true,
        storeTiers: [
          { name: 'LV1 核心连锁生鲜店', creditLimit: 5000, discountRate: 0.95, returnQuota: 1000 },
          { name: 'LV2 社区便民店', creditLimit: 2000, discountRate: 1.0, returnQuota: 500 },
          { name: 'LV3 村社自提服务点', creditLimit: 3000, discountRate: 0.96, returnQuota: 800 }
        ],
        storeCustomFields: ['冷库/保鲜柜容量', '食品经营许可证号'],
        harvestAidOn: true,
        rationLimitQty: 0,
        onlinePriceEnabled: true,
        onlineTiers: [
          { minQty: 1, rate: 1.0, label: '单件零售正价' },
          { minQty: 5, rate: 0.95, label: '满5件享9.5折' },
          { minQty: 20, rate: 0.88, label: '满20件抱团8.8折' }
        ],
        rebateEnabled: true,
        rebateTiers: [
          { threshold: 10000, rate: 3.0 },
          { threshold: 30000, rate: 5.0 }
        ],
        promoterEnabled: true,
        promoterRate: 8.0,
        referralBonus: 100,
        pickupServiceEnabled: true,
        pickupServiceMode: 'fixed',
        pickupServiceValue: 1.5,
        campaignActive: true,
        promos: [{ title: '产区丰收季直供惠', rule: '合作门店单笔订满 20 件赠同款 1 件' }],
        carriers: [{ name: '塑料周转筐', deposit: 15 }],
        tier1Name: '批发平准基准价',
        tier2Name: '网上平准零售基准价',
        twoFaCashOn: true,
        twoFaThreshold: 3000,
        twoFaPriceOn: true,
        twoFaPricePct: 15,
        twoFaCreditOn: true,
        twoFaDeleteOn: true,
        twoFaLimitOn: true,
        twoFaStockAuditOn: false,
        twoFaPolicyOn: false,
        twoFaExportOn: false,
        twoFaEmergencyBrakeOn: true,
        emergencyBrakeActive: false,
        emergencyBrakeReason: '',
        defaultMinStock: 15,
        expiryWarnDays: 7,
        allowStoreReturn: true,
        slipHeaderSub: '村社合作社源头直供 · 新鲜直达 · 诚信相照',
        slipFooterNote: '生鲜农产请当面验货签收，周转筐随车清点回收。',
        slipStampText: '合作社调度专用章',
        seasonalPause: hqState.globalPolicy.seasonalPause || { isPaused: false, reason: '', resumeDate: '' }
      },
      factory: {
        activePolicyName: PRESET_DISPLAY_NAMES.factory,
        storeTierEnabled: true,
        storeTiers: [
          { name: '一级区域总代', creditLimit: 20000, discountRate: 0.9, returnQuota: 2000 },
          { name: '二级签约经销商', creditLimit: 8000, discountRate: 0.95, returnQuota: 800 },
          { name: '直供终端门店', creditLimit: 3000, discountRate: 1.0, returnQuota: 300 }
        ],
        storeCustomFields: ['企业开票税号', '指定物流专线/卸货仓'],
        harvestAidOn: false,
        rationLimitQty: 0,
        onlinePriceEnabled: true,
        onlineTiers: [
          { minQty: 1, rate: 1.0, label: '专柜零售正价' },
          { minQty: 10, rate: 0.85, label: '满10件整批8.5折' }
        ],
        rebateEnabled: true,
        rebateTiers: [
          { threshold: 50000, rate: 4.0 },
          { threshold: 100000, rate: 6.0 }
        ],
        promoterEnabled: true,
        promoterRate: 6.0,
        referralBonus: 200,
        pickupServiceEnabled: true,
        pickupServiceMode: 'percent',
        pickupServiceValue: 2.0,
        campaignActive: false,
        promos: [],
        carriers: [{ name: '标准木托盘', deposit: 80 }],
        tier1Name: '批发平准基准价',
        tier2Name: '网上平准零售基准价',
        twoFaCashOn: true,
        twoFaThreshold: 5000,
        twoFaPriceOn: true,
        twoFaPricePct: 10,
        twoFaCreditOn: true,
        twoFaDeleteOn: true,
        twoFaLimitOn: true,
        twoFaStockAuditOn: true,
        twoFaPolicyOn: true,
        twoFaExportOn: false,
        twoFaEmergencyBrakeOn: true,
        emergencyBrakeActive: false,
        emergencyBrakeReason: '',
        defaultMinStock: 30,
        expiryWarnDays: 45,
        allowStoreReturn: true,
        slipHeaderSub: '源头工坊直发 · 实名保真 · 品质溯源',
        slipFooterNote: '整托发运请核对封签批号，标准木托盘循环计账。',
        slipStampText: '工坊出库核验章',
        seasonalPause: hqState.globalPolicy.seasonalPause || { isPaused: false, reason: '', resumeDate: '' }
      },
      hardware: {
        activePolicyName: PRESET_DISPLAY_NAMES.hardware,
        storeTierEnabled: true,
        storeTiers: [
          { name: '工程项目战略户', creditLimit: 30000, discountRate: 0.92, returnQuota: 3000 },
          { name: '五金机电合作店', creditLimit: 5000, discountRate: 0.96, returnQuota: 500 },
          { name: '零星维修工坊', creditLimit: 1000, discountRate: 1.0, returnQuota: 200 }
        ],
        storeCustomFields: ['施工工地名称', '开票税号与收货负责人'],
        harvestAidOn: false,
        rationLimitQty: 0,
        onlinePriceEnabled: false,
        onlineTiers: [{ minQty: 1, rate: 1.0, label: '网购散装价' }],
        rebateEnabled: true,
        rebateTiers: [{ threshold: 30000, rate: 2.5 }],
        promoterEnabled: true,
        promoterRate: 5.0,
        referralBonus: 150,
        pickupServiceEnabled: true,
        pickupServiceMode: 'fixed',
        pickupServiceValue: 2.0,
        campaignActive: false,
        promos: [],
        carriers: [{ name: '周转铁料箱', deposit: 50 }],
        tier1Name: '批发平准基准价',
        tier2Name: '网上平准零售基准价',
        twoFaCashOn: true,
        twoFaThreshold: 5000,
        twoFaPriceOn: true,
        twoFaPricePct: 15,
        twoFaCreditOn: true,
        twoFaDeleteOn: true,
        twoFaLimitOn: true,
        twoFaStockAuditOn: false,
        twoFaPolicyOn: false,
        twoFaExportOn: false,
        twoFaEmergencyBrakeOn: true,
        emergencyBrakeActive: false,
        emergencyBrakeReason: '',
        defaultMinStock: 20,
        expiryWarnDays: 0,
        allowStoreReturn: true,
        slipHeaderSub: '工料配件直供中心 · 规格齐全 · 按需配送',
        slipFooterNote: '非质量问题定制件不退不换，标准件完整包装支持调换。',
        slipStampText: '仓储配发专用章',
        seasonalPause: hqState.globalPolicy.seasonalPause || { isPaused: false, reason: '', resumeDate: '' }
      },
      cylinder: {
        activePolicyName: PRESET_DISPLAY_NAMES.cylinder,
        storeTierEnabled: true,
        storeTiers: [
          { name: '大型企业/机构集采户', creditLimit: 5000, discountRate: 0.94, returnQuota: 500 },
          { name: '配送分销网点', creditLimit: 3000, discountRate: 0.96, returnQuota: 300 }
        ],
        storeCustomFields: ['容器押金单编号', '配送楼层/电梯备注'],
        harvestAidOn: false,
        rationLimitQty: 0,
        onlinePriceEnabled: true,
        onlineTiers: [
          { minQty: 1, rate: 1.0, label: '单桶零售价' },
          { minQty: 5, rate: 0.9, label: '5桶套餐9折' }
        ],
        rebateEnabled: true,
        rebateTiers: [{ threshold: 8000, rate: 3.0 }],
        promoterEnabled: true,
        promoterRate: 10.0,
        referralBonus: 80,
        pickupServiceEnabled: true,
        pickupServiceMode: 'fixed',
        pickupServiceValue: 1.0,
        campaignActive: false,
        promos: [],
        carriers: [
          { name: '18.9L PC周转水桶', deposit: 30 },
          { name: '标准钢瓶容器', deposit: 120 }
        ],
        tier1Name: '批发平准基准价',
        tier2Name: '网上平准零售基准价',
        twoFaCashOn: true,
        twoFaThreshold: 2000,
        twoFaPriceOn: true,
        twoFaPricePct: 15,
        twoFaCreditOn: true,
        twoFaDeleteOn: true,
        twoFaLimitOn: true,
        twoFaStockAuditOn: false,
        twoFaPolicyOn: false,
        twoFaExportOn: false,
        twoFaEmergencyBrakeOn: true,
        emergencyBrakeActive: false,
        emergencyBrakeReason: '',
        defaultMinStock: 50,
        expiryWarnDays: 15,
        allowStoreReturn: false,
        slipHeaderSub: '安全循环配送 · 空桶/空瓶随车清点抵账',
        slipFooterNote: '送一收一，缺失容器按押金标准计入往来账目。',
        slipStampText: '配送调度核验章',
        seasonalPause: hqState.globalPolicy.seasonalPause || { isPaused: false, reason: '', resumeDate: '' }
      }
    };

    const chosen = presets[presetKey];
    if (!chosen) return;
    hqState.globalPolicy = JSON.parse(JSON.stringify(chosen));
    window.openGlobalPolicyModal('tiers', false, chosen.activePolicyName);
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

      const brakeCheckEl = document.getElementById('gp-2fa-emergency-brake-on');
      const brakeReasonEl = document.getElementById('gp-emergency-brake-reason');

      const nextPolicy = {
        ...hqState.globalPolicy,
        industryTerms: window.__hqIndustryTerms || hqState.globalPolicy.industryTerms,
        activePolicyName: hqState.globalPolicy.activePolicyName || '商号现行默认策略',
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
        pickupServiceEnabled: document.getElementById('gp-pickup-service-enabled')?.checked ?? true,
        pickupServiceMode: document.getElementById('gp-pickup-service-mode')?.value || 'fixed',
        pickupServiceValue: parseFloat(document.getElementById('gp-pickup-service-value')?.value) || 0,
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
        twoFaEmergencyBrakeOn: brakeCheckEl ? brakeCheckEl.checked : hqState.globalPolicy.twoFaEmergencyBrakeOn !== false,
        emergencyBrakeReason: brakeReasonEl ? brakeReasonEl.value.trim() : hqState.globalPolicy.emergencyBrakeReason || '',
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
      } catch (err) {
        console.warn('云端 custom_settings 同步提示（本地已生效）:', err.message);
      }

      loadGlobalPolicyFromTenant(hqState.currentTenantData);
      callbacks?.onPolicyUpdated?.();
      alert(`🎉 商号全局经营策略【${nextPolicy.activePolicyName}】已保存并同步全端生效！`);
      window.closeModal('modal-global-policy');
    };

    if (hqState.globalPolicy.twoFaPolicyOn) {
      window.trigger2FAAction('修改全局价格、返利与 9 项风控策略，请输入手机验证器 6 位动态口令授权：', execSave);
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
      alert('✅ 企业/产区档案与外部社交平台矩阵已同步至数字专柜与合作名片！');
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
    const msg = `🔔【${hqState.currentTenantData?.company_name || hqState.currentAgent}】报单提醒测试成功！后续合作门店下新单或新店预约送样，本群将第一时间收到通知。`;
    try {
      await HQService.sendWebhookMessage(url, msg);
      alert('📡 测试消息已发出！请打开您的企业微信 / 钉钉 / 飞书群查看是否收到提醒。');
    } catch (err) {
      alert('发送失败，请检查网址格式是否正确：' + err.message);
    }
  };
}
