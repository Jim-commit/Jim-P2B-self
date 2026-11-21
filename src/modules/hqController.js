import { supabase } from '../lib/supabase.js';
import { TOTP } from '../utils/totp.js';
import { compressImageFile, uploadBlobToStorage, downloadCSV } from '../utils/storage.js';
import { HQService } from '../services/hqService.js';
import { AuthSecurity } from '../utils/authSecurity.js';

function isDirectoryLead(o) {
  return (
    o?.order_source === 'b2b_directory_lead' ||
    String(o?.order_no || '').startsWith('LEAD-') ||
    String(o?.note || '').includes('[新店招商线索]') ||
    String(o?.note || '').includes('[新店招商線索]') ||
    String(o?.note || '').includes('[新店合作意向]')
  );
}

function isEcommerceAllowed(p) {
  if (!p) return false;
  if (p.channel_ecommerce !== undefined) return !!p.channel_ecommerce;
  return ['电子商务', '实体与电商双轨'].includes(p.sales_channel_type);
}

function isBrickMortarAllowed(p) {
  if (!p) return true;
  if (p.channel_brick_and_mortar !== undefined) return !!p.channel_brick_and_mortar;
  return ['实体店', '实体与电商双轨'].includes(p.sales_channel_type) || !p.sales_channel_type;
}

const DEFAULT_GLOBAL_POLICY = {
  storeTierEnabled: true,
  storeTiers: [
    { name: 'LV1 核心战略店', creditLimit: 5000, discountRate: 0.95, returnQuota: 1000 },
    { name: 'LV2 长期伙计店', creditLimit: 3000, discountRate: 0.98, returnQuota: 600 },
    { name: 'LV3 临街便民店', creditLimit: 2000, discountRate: 1.0, returnQuota: 500 }
  ],
  storeCustomFields: ['开票税号 / 营业执照号', '收货仓库 / 卸货点备注'],
  harvestAidOn: false,
  rationLimitQty: 0,
  onlinePriceEnabled: false,
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
  campaignActive: false,
  promos: [{ title: '产区直供季', rule: '单笔满 20 件赠同款 1 件' }],
  carriers: [{ name: '周转筐', deposit: 15 }],
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
  defaultMinStock: 10,
  expiryWarnDays: 30,
  allowStoreReturn: true,
  slipHeaderSub: '源头平准直供 · 诚信相照 · 货畅其流',
  slipFooterNote: '请当面点清数量与效期，签字后即作为往来对账依据。',
  slipStampText: '调度专用章',
  seasonalPause: { isPaused: false, reason: '', resumeDate: '' }
};

const FORBIDDEN_WORDS = ['国家级', '世界级', '最高级', '第一', '绝对', '包治百病', '根治', '神效', '假一赔万', '100%有效', '加微信', '微信号'];

let currentAgent = localStorage.getItem('hq_active_agent') || 'BJ_SHUNDA';
let currentRoleCode = sessionStorage.getItem('hq_sub_role_' + currentAgent) || 'owner';
let currentAccountCode = sessionStorage.getItem('hq_sub_account_' + currentAgent) || '';
let currentOperatorName = sessionStorage.getItem('hq_sub_name_' + currentAgent) || '大当家主账号';
let globalPolicy = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY));
let carrierLabel = '周转筐';
let currentStoreForVis = null;
let currentTenantData = null;
let allProducts = [];
let allStores = [];
let allOrders = [];
let allC2BDemands = [];
let allDemandPlans = [];
let allLocalPoolItems = [];
let allSubUsers = [];
let allPlatformCats = [];
let allInventoryLogs = [];
let pendingCashLogsCache = [];
let parsedBulkProducts = [];
let uploadedImageBase64 = '';
let isUploadingImage = false;
let selectedTags = [];
let activeProdFilter = '全部';
let activeProdSearch = '';
let onlyLowStockFilter = false;
let onlyDraftFilter = false;
let activeOrderFilter = 'pending_confirm';
let activeStoreFilter = '全部';
let sortStoresDebtDesc = false;
let invVoucherSearch = '';
let currentStockOpsMode = 'in_purchase';
let currentVoucherNo = '';
let pending2FACallback = null;
let currentTraceCardText = '';
let hqQrPollTimer = null;

window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

window.removeLastRow = function (containerId) {
  const box = document.getElementById(containerId);
  if (!box || box.children.length === 0) return;
  box.removeChild(box.lastElementChild);
};

window.dismissOnboardingGuide = function () {
  localStorage.setItem('hq_onboarding_dismissed_' + currentAgent, '1');
  document.getElementById('hq-onboarding-guide')?.classList.add('hidden');
};

window.restoreOnboardingGuide = function () {
  localStorage.removeItem('hq_onboarding_dismissed_' + currentAgent);
  document.getElementById('hq-onboarding-guide')?.classList.remove('hidden');
};

function isWarehouseBlindPrice() {
  return currentRoleCode === 'warehouse' || currentRoleCode === 'producer';
}

function isAuditorReadOnly() {
  return currentRoleCode === 'auditor';
}

function getVisibleStoresForCurrentRole() {
  if (currentRoleCode !== 'sales') return allStores;
  return allStores.filter((s) => {
    const ownerAcc = s.custom_pricing?.sales_owner || '';
    return !ownerAcc || ownerAcc === currentAccountCode || ownerAcc === currentOperatorName;
  });
}

function calcStoreCreditScore(store) {
  const debt = parseFloat(store.current_debt || 0);
  const limit = parseFloat(store.credit_limit || 2000);
  const baskets = parseInt(store.carrier_hold_count || store.basket_count || 0);
  const deliveredCount = allOrders.filter((o) => Number(o.store_id) === Number(store.id) && o.delivery_status === 'delivered').length;
  let score = 80 + Math.min(15, deliveredCount * 2);
  if (debt > limit) score -= 12;
  if (baskets >= 20) score -= 5;
  return Math.max(50, Math.min(100, score));
}

function generateUnifiedVoucherNo(prefix) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const rand4 = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}${h}-${rand4}`;
}

function calcStoreEffectivePrice(store, prod) {
  const basePrice = parseFloat(prod?.tier_1_price || 0);
  if (!store) return { price: basePrice, badge: '批发基准', note: '' };

  const pricing = store.custom_pricing && typeof store.custom_pricing === 'object' ? store.custom_pricing : {};
  const itemNotes = pricing.item_notes && typeof pricing.item_notes === 'object' ? pricing.item_notes : {};
  const note = itemNotes[String(prod.id)] || '';

  if (pricing.item_prices && pricing.item_prices[String(prod.id)] !== undefined) {
    const special = parseFloat(pricing.item_prices[String(prod.id)]);
    if (!isNaN(special) && special > 0) {
      return { price: special, badge: '单品特约价', note };
    }
  }

  let effectiveBase = basePrice;
  if (pricing.price_tier === 'tier_2' && prod.tier_2_price) {
    effectiveBase = parseFloat(prod.tier_2_price);
  }

  if (globalPolicy.storeTierEnabled !== false) {
    const rate = parseFloat(pricing.discount_rate || 1);
    if (!isNaN(rate) && rate > 0 && rate !== 1) {
      return {
        price: Number((effectiveBase * rate).toFixed(2)),
        badge: `${(rate * 10).toFixed(1)}折策略价`,
        note
      };
    }
  }

  return { price: effectiveBase, badge: '批发基准', note };
}

window.openContextualHelpModal = function () {
  const roleNames = {
    owner: '大当家主账号',
    warehouse: '仓储调度',
    finance: '账房财务',
    sales: '业务员/客户经理',
    driver: '送货师傅',
    producer: '产区采收/班组长',
    qc_service: '售后定损/质检',
    auditor: '独立稽核'
  };

  const subEl = document.getElementById('help-context-subtitle');
  if (subEl) {
    subEl.innerText = `当值岗位：【${roleNames[currentRoleCode] || currentOperatorName}】 · 实时经营体检`;
  }

  const diagnostics = [];

  if (currentRoleCode === 'owner' && !(currentTenantData?.totp_enabled && currentTenantData?.totp_secret)) {
    diagnostics.push({
      title: '🛡️ 安全体检：尚未绑定手机身份验证器 (2FA)',
      desc: '绑定微信「腾讯身份验证器」后，大额销账、大幅降价与删品均受动态口令护航，守住自家账本安全。',
      btnText: '立即绑定验证器 ➔',
      action: `window.closeModal('modal-contextual-help'); window.openTotpSetupModal();`
    });
  }

  const pendingClaims = allInventoryLogs.filter((l) => l.action_type === 'qc_damage_claim' && !String(l.remark || '').includes('[已核准冲账]'));
  if (!isWarehouseBlindPrice() && pendingClaims.length > 0) {
    diagnostics.push({
      title: `🔧 内部定损待核：有 ${pendingClaims.length} 笔《实地定损鉴证单》待裁定冲账`,
      desc: '售后定损员已提交现场实拍照与门店掌柜签名，核准后将自动冲减对应门店欠款。',
      btnText: '去核准定损单 ➔',
      action: `window.closeModal('modal-contextual-help'); window.switchTab('advisor');`
    });
  }

  const draftProds = allProducts.filter((p) => p.status === 'draft');
  if (!isWarehouseBlindPrice() && draftProds.length > 0) {
    diagnostics.push({
      title: `📝 待定价草稿：有 ${draftProds.length} 款货品草稿等待定价格并正式上架`,
      desc: '仓管已录好实物规格与库存，点击即可设置批发价与网上零售价并完成合规自检。',
      btnText: '去定价格上架 ➔',
      action: `window.closeModal('modal-contextual-help'); window.switchTab('products'); onlyDraftFilter = true; renderProductTable();`
    });
  }

  diagnostics.push({
    title: '📖 当前岗位操作要领与常见问题',
    desc: '• 仓管/产区岗：点击「当前库存」即可开具 RK 入库单或 CK 出库单，全程物理盲价隔离；\n• 业务员：在「合作门店」中仅见名下私海与公海门店，拜访催收后单据自动推送财务核销；\n• 财务岗：点清回款与定损单后销账，大额操作自动校验 2FA。',
    btnText: '查看极简单据台账 ➔',
    action: `window.closeModal('modal-contextual-help'); window.switchTab('advisor');`
  });

  const box = document.getElementById('help-guidance-cards');
  if (box) {
    box.innerHTML = diagnostics
      .map(
        (d) => `
        <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
          <b class="text-emerald-950 block">${d.title}</b>
          <p class="text-[11px] text-stone-600 whitespace-pre-line leading-relaxed">${d.desc}</p>
          <div class="text-right">
            <button type="button" onclick="${d.action}" class="bg-[#1b4332] text-white font-bold px-3 py-1 rounded-xl text-[11px]">${d.btnText}</button>
          </div>
        </div>
      `
      )
      .join('');
  }

  window.openModal('modal-contextual-help');
};

window.openTraceCardModal = function (prodId) {
  const p = allProducts.find((x) => Number(x.id) === Number(prodId));
  if (!p) return;
  const traceCode = `${p.trace_code_prefix || 'QC-'}${p.id}`;
  const company = currentTenantData?.company_name || currentAgent;
  const origin = p.origin_place || '源头合作社/工坊原产';
  const summary = p.custom_specs?.summary || '顺应时令采收/匠心制造，实名保真直供';
  const exp = p.custom_specs?.expiry_date || '见包装喷码';

  currentTraceCardText =
    `【实名保真 · 品质溯源卡】\n` +
    `货品全称：${p.name}\n` +
    `溯源编码：${traceCode}\n` +
    `生产/直供主体：${company}（执照已核验）\n` +
    `产地/工坊：${origin}\n` +
    `包装规格：${p.spec || '整装'} / ${p.measure_unit || '件'}\n` +
    `保质期限：${exp}\n` +
    `品质说明：${summary}`;

  const body = document.getElementById('trace-card-body');
  if (body) {
    body.innerHTML = `
      <div class="flex justify-between items-center border-b border-stone-200 pb-2">
        <b class="text-sm text-stone-900">${p.name}</b>
        <span class="font-mono text-[10px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded font-bold">${traceCode}</span>
      </div>
      <div class="space-y-1 text-[11px] text-stone-700">
        <div>直供主体：<b>${company}</b> <span class="text-emerald-700 text-[10px]">(营业执照已核验)</span></div>
        <div>产地工坊：<b>${origin}</b></div>
        <div>包装规格：<b>${p.spec || '整装'} / ${p.measure_unit || '件'}</b> · 效期：<b>${exp}</b></div>
        <div>品质说明：<span>${summary}</span></div>
      </div>
    `;
  }
  window.openModal('modal-trace-card');
};

window.copyTraceCardText = function () {
  navigator.clipboard.writeText(currentTraceCardText).then(() => alert('✅ 品质溯源卡信息已复制，可直接发送微信给客户查验！'));
};

window.openHqSuggestionModal = function () {
  document.getElementById('hq-suggestion-text').value = '';
  window.openModal('modal-hq-suggestion');
};

window.submitHqSuggestion = async function () {
  const content = document.getElementById('hq-suggestion-text')?.value.trim();
  if (!content) return alert('请写下您的宝贵建议！');
  const { error } = await supabase.from('platform_suggestion_board').insert([
    {
      proposer_type: 'merchant_hq',
      proposer_name: `${currentTenantData?.company_name || currentAgent} · ${currentOperatorName}`,
      content,
      reply_status: 'pending'
    }
  ]);
  if (error) return alert('提交失败：' + error.message);
  alert('🙏 感谢掌柜建言，已呈达平台建言堂！');
  window.closeModal('modal-hq-suggestion');
};

window.approveInternalDamageClaim = async function (logId) {
  if (isAuditorReadOnly() || isWarehouseBlindPrice() || currentRoleCode === 'sales') {
    return alert('⚠️ 仅大当家或账房财务有权核准定损单并冲减门店欠款。');
  }
  const log = allInventoryLogs.find((x) => Number(x.id) === Number(logId));
  if (!log) return;

  const meta = extractVoucherMeta(log);
  const amtMatch = (log.remark || '').match(/\[冲抵金额:¥([0-9.]+)\]/);
  const storeIdMatch = (log.remark || '').match(/\[门店ID:(\d+)\]/);
  const deductAmt = amtMatch ? parseFloat(amtMatch[1]) : 0;
  const storeId = storeIdMatch ? parseInt(storeIdMatch[1]) : 0;
  const store = allStores.find((s) => Number(s.id) === storeId);

  const confirmMsg =
    `【商号内部定损裁定】单号：${meta.voucherNo}\n` +
    `• 涉及门店：${meta.sourceParty}\n` +
    `• 定损说明：${meta.cleanNote}\n` +
    `• 核准退赔冲抵金额：¥${deductAmt.toFixed(2)}\n\n` +
    `确认核准该笔内部定损单，并自动从该门店在账欠款中冲减 ¥${deductAmt.toFixed(2)} 吗？`;

  if (!confirm(confirmMsg)) return;

  if (store && deductAmt > 0) {
    const nextDebt = Math.max(0, Number((parseFloat(store.current_debt || 0) - deductAmt).toFixed(2)));
    await supabase.from('store').update({ current_debt: nextDebt }).eq('id', store.id);
  }

  const nextRemark = `${log.remark || ''} [已核准冲账 · 经手:${currentOperatorName}]`.trim();
  await supabase.from('inventory_log').update({ remark: nextRemark }).eq('id', log.id);

  alert(`✅ 内部定损单 ${meta.voucherNo} 已核准并完成账目冲抵！`);
  window.loadHQData();
};

window.openSalesCollectModal = function (storeId) {
  if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验。');
  const s = allStores.find((x) => Number(x.id) === Number(storeId));
  if (!s) return;

  document.getElementById('sc-store-id').value = s.id;
  document.getElementById('sc-store-subtitle').innerText = `${s.name} · 当前在账欠款 ¥${parseFloat(s.current_debt || 0).toFixed(2)}`;
  document.getElementById('sc-amount-input').value = parseFloat(s.current_debt || 0) > 0 ? parseFloat(s.current_debt).toFixed(2) : '';
  document.getElementById('sc-note-input').value = '';
  window.openModal('modal-sales-collect');
};

window.submitSalesVisitCollection = async function () {
  const storeId = parseInt(document.getElementById('sc-store-id').value);
  const s = allStores.find((x) => x.id === storeId);
  if (!s) return;

  const amt = parseFloat(document.getElementById('sc-amount-input').value || 0);
  const payMethod = document.getElementById('sc-pay-method').value;
  const note = document.getElementById('sc-note-input').value.trim();

  if (isNaN(amt) || amt <= 0) return alert('请输入有效的本次催收回款金额！');

  const { error } = await supabase.from('driver_collection_log').insert([
    {
      tenant_id: currentAgent,
      store_id: s.id,
      store_name: `${s.name} (业务员催收${note ? '·' + note : ''})`,
      driver_name: currentOperatorName,
      collect_type: 'sales_visit_collect',
      amount: amt,
      discount_amount: 0,
      basket_return: 0,
      basket_deduct_amount: 0,
      pay_method: payMethod,
      settled_to_hq: false
    }
  ]);

  if (error) return alert('提交催收留痕失败：' + error.message);

  alert(
    `✅ 拜访催收留痕已提交！\n\n` +
      `• 客户门店：${s.name}\n` +
      `• 催收金额：¥${amt.toFixed(2)}（${payMethod}）\n` +
      `• 下一步：单据已推送至账房财务点款台，财务核验到账后将自动冲减该店在账欠款。`
  );
  window.closeModal('modal-sales-collect');
  window.loadHQData();
};

window.jumpToDriverCashPanel = function () {
  if (isWarehouseBlindPrice()) return;
  window.switchTab('settle');
  setTimeout(() => {
    const el = document.getElementById('driver-settle-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-amber-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400'), 2000);
    }
  }, 80);
};

window.sortStoresByDebt = function () {
  sortStoresDebtDesc = true;
  activeStoreFilter = '全部';
  renderStoreFilterBar();
  renderStoreTable();
};

window.filterLowStockOnly = function (flag) {
  onlyLowStockFilter = !!flag;
  const btn = document.getElementById('btn-low-stock-filter');
  if (btn) {
    btn.className = onlyLowStockFilter
      ? 'text-[11px] bg-rose-600 text-white px-2.5 py-1.5 rounded-xl font-bold transition'
      : 'text-[11px] bg-white hover:bg-rose-50 text-stone-700 border border-stone-200 px-2.5 py-1.5 rounded-xl font-bold transition';
  }
  renderProductTable();
};

window.toggleLowStockFilter = function () {
  window.filterLowStockOnly(!onlyLowStockFilter);
};

window.toggleDraftOnlyFilter = function () {
  onlyDraftFilter = !onlyDraftFilter;
  const btn = document.getElementById('btn-draft-filter');
  if (btn) {
    btn.className = onlyDraftFilter
      ? 'text-[11px] bg-amber-500 text-stone-950 px-2.5 py-1.5 rounded-xl font-bold transition'
      : 'text-[11px] bg-white hover:bg-amber-50 text-stone-700 border border-stone-200 px-2.5 py-1.5 rounded-xl font-bold transition';
  }
  renderProductTable();
};

window.openNotificationDrawer = function () {
  const listEl = document.getElementById('hq-notif-list');
  if (!listEl) return;

  const msgs = [];
  const draftProds = allProducts.filter((p) => p.status === 'draft');
  const rectifyProds = allProducts.filter((p) => p.status === 'rectify_required');
  const pendingClaims = allInventoryLogs.filter((l) => l.action_type === 'qc_damage_claim' && !String(l.remark || '').includes('[已核准冲账]'));
  const normalPending = allOrders.filter((o) => o.order_status === 'pending_confirm' && !isDirectoryLead(o));
  const overCredits = allOrders.filter((o) => o.order_status === 'over_credit_pending');
  const leads = allOrders.filter((o) => isDirectoryLead(o) && o.order_status === 'pending_confirm');
  const submittedPlans = allDemandPlans.filter((p) => p.status === 'submitted');
  const openDemands = allC2BDemands.filter((d) => !d.official_reply);

  if (!isWarehouseBlindPrice() && pendingClaims.length > 0) {
    pendingClaims.forEach((c) => {
      const meta = extractVoucherMeta(c);
      msgs.push({
        badge: '🔧 内部定损单',
        badgeCls: 'bg-rose-600 text-white',
        title: `【${meta.sourceParty}】定损单 ${meta.voucherNo} 待核准冲账`,
        desc: meta.cleanNote,
        action: `window.closeModal('modal-hq-notifications'); window.approveInternalDamageClaim(${c.id});`
      });
    });
  }

  if (!isWarehouseBlindPrice() && rectifyProds.length > 0) {
    msgs.push({
      badge: '📜 礼貌润色提醒',
      badgeCls: 'bg-amber-500 text-stone-950',
      title: `有 ${rectifyProds.length} 款货品收到平台规范润色提示`,
      desc: rectifyProds.map((r) => r.name).join('、'),
      action: `window.closeModal('modal-hq-notifications'); window.switchTab('products');`
    });
  }

  if (!isWarehouseBlindPrice() && draftProds.length > 0) {
    msgs.push({
      badge: '📝 待定价草稿',
      badgeCls: 'bg-amber-500 text-stone-950',
      title: `仓管提交了 ${draftProds.length} 款新货品草稿等待定基准价并上架`,
      desc: draftProds.map((d) => d.name).join('、'),
      action: `window.closeModal('modal-hq-notifications'); window.switchTab('products'); onlyDraftFilter = true; renderProductTable();`
    });
  }

  if (!isWarehouseBlindPrice()) {
    overCredits.forEach((o) => {
      msgs.push({
        badge: '🚨 超信特批',
        badgeCls: 'bg-rose-600 text-white',
        title: `【${o.store_name}】申请超授信额度 ¥${o.over_credit_amount || 0} 放行`,
        desc: `单号 #${o.order_no || o.id} · 净结 ¥${parseFloat(o.net_settle_amount || o.total_amount || 0).toFixed(2)}`,
        action: `window.closeModal('modal-hq-notifications'); window.switchTab('settle'); window.filterOrderStatus('over_credit_pending');`
      });
    });
  }

  normalPending.forEach((o) => {
    const amtText = isWarehouseBlindPrice() ? `共 ${(o.items || []).length} 品项` : `¥${parseFloat(o.net_settle_amount || o.total_amount || 0).toFixed(2)}`;
    msgs.push({
      badge: '📥 门店补货单',
      badgeCls: 'bg-emerald-800 text-white',
      title: `【${o.store_name}】发来新补货单（${amtText}）`,
      desc: `单号 #${o.order_no || o.id} · 交割方式：${o.settlement_type}`,
      action: `window.closeModal('modal-hq-notifications'); window.switchTab('settle'); window.filterOrderStatus('pending_confirm');`
    });
  });

  submittedPlans.forEach((p) => {
    msgs.push({
      badge: '📅 真实用度计划',
      badgeCls: 'bg-amber-500 text-stone-950',
      title: `【${p.store_name}】提报 ${p.plan_cycle} 用度计划`,
      desc: `期望到店：${p.expected_date || '近期'} · 共 ${(p.items || []).length} 项货品`,
      action: `window.closeModal('modal-hq-notifications'); window.switchTab('settle'); window.filterOrderStatus('demand_plans');`
    });
  });

  leads.forEach((l) => {
    msgs.push({
      badge: '🤝 新店意向',
      badgeCls: 'bg-amber-200 text-amber-950',
      title: `意向门店【${l.store_name}】预约上门送样`,
      desc: l.note || '申请合作洽谈',
      action: `window.closeModal('modal-hq-notifications'); window.switchTab('settle'); window.filterOrderStatus('directory_leads');`
    });
  });

  openDemands.forEach((d) => {
    msgs.push({
      badge: '📢 天街求购',
      badgeCls: 'bg-indigo-700 text-white',
      title: `天街买家发布求购需求待回应`,
      desc: `发起人：${d.proposer_name || '天街买家'}`,
      action: `window.closeModal('modal-hq-notifications'); window.switchTab('settle'); window.filterOrderStatus('c2b_demands');`
    });
  });

  if (!isWarehouseBlindPrice() && pendingCashLogsCache.length > 0) {
    const sumCash = pendingCashLogsCache.reduce((s, x) => s + parseFloat(x.amount || 0), 0);
    msgs.push({
      badge: '💵 随车/催收待点款',
      badgeCls: 'bg-amber-700 text-white',
      title: `有 ${pendingCashLogsCache.length} 笔回款/收款待财务点清入库（合计 ¥${sumCash.toFixed(2)}）`,
      desc: '包含送货师傅随车收款与业务员上门拜访催收留痕',
      action: `window.closeModal('modal-hq-notifications'); window.jumpToDriverCashPanel();`
    });
  }

  if (msgs.length === 0) {
    listEl.innerHTML = '<div class="py-10 text-center text-stone-400">🌿 当前所有往来单据均已处理完毕，无待办提醒。</div>';
  } else {
    listEl.innerHTML = msgs
      .map(
        (m) => `
        <div onclick="${m.action}" class="cursor-pointer p-3 bg-stone-50 hover:bg-emerald-50/60 border border-stone-200 rounded-2xl flex justify-between items-center gap-2 transition">
          <div class="space-y-0.5">
            <div class="flex items-center gap-1.5">
              <span class="px-1.5 py-0.2 rounded text-[10px] font-bold ${m.badgeCls}">${m.badge}</span>
              <b class="text-stone-900">${m.title}</b>
            </div>
            <p class="text-[11px] text-stone-500">${m.desc}</p>
          </div>
          <span class="text-emerald-800 font-bold shrink-0">去处理 ➔</span>
        </div>
      `
      )
      .join('');
  }

  window.openModal('modal-hq-notifications');
};

function renderActivePolicyBadgesBar() {
  const bar = document.getElementById('active-policy-badges-bar');
  if (!bar) return;

  const chips = [];
  if (globalPolicy.storeTierEnabled !== false) {
    chips.push('<span class="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full">🟢 门店分级折扣生效中</span>');
  }
  if (globalPolicy.harvestAidOn) {
    chips.push('<span class="bg-amber-400/25 text-amber-200 border border-amber-400/40 px-2 py-0.5 rounded-full">🌾 丰产助农平准认领开启</span>');
  }
  if (parseInt(globalPolicy.rationLimitQty || 0) > 0) {
    chips.push(`<span class="bg-rose-500/25 text-rose-200 border border-rose-400/30 px-2 py-0.5 rounded-full">🛡️ 紧缺定额限购 ${globalPolicy.rationLimitQty} 件</span>`);
  }
  if (globalPolicy.onlinePriceEnabled) {
    chips.push('<span class="bg-blue-500/20 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded-full">🌐 网上多档价格策略生效中</span>');
  }
  if (globalPolicy.rebateEnabled !== false) {
    chips.push('<span class="bg-amber-400/20 text-amber-200 border border-amber-400/30 px-2 py-0.5 rounded-full">🎁 进货返利策略生效中</span>');
  }
  if (globalPolicy.campaignActive) {
    chips.push('<span class="bg-rose-500/25 text-rose-200 border border-rose-400/30 px-2 py-0.5 rounded-full">🔥 促销活动进行中</span>');
  }

  bar.innerHTML =
    chips.length > 0
      ? chips.join('')
      : '<span class="text-emerald-200/70">当前按基准原价直出（未启用额外折扣策略）</span>';
}

function loadGlobalPolicyFromTenant(tenant) {
  let savedLocal = {};
  try {
    savedLocal = JSON.parse(localStorage.getItem('hq_global_policy_' + currentAgent) || '{}');
  } catch (e) {}

  const cloudPolicy = tenant?.custom_settings && typeof tenant.custom_settings === 'object' ? tenant.custom_settings : {};
  globalPolicy = {
    ...JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY)),
    ...savedLocal,
    ...cloudPolicy
  };

  if (!globalPolicy.tier1Name || globalPolicy.tier1Name === '平准供货底价') {
    globalPolicy.tier1Name = '批发平准基准价';
  }
  if (!globalPolicy.tier2Name || globalPolicy.tier2Name === '集采惠价') {
    globalPolicy.tier2Name = '网上平准零售基准价';
  }

  if (!Array.isArray(globalPolicy.storeTiers) || globalPolicy.storeTiers.length === 0) {
    globalPolicy.storeTiers = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY.storeTiers));
  }
  if (!Array.isArray(globalPolicy.storeCustomFields)) {
    globalPolicy.storeCustomFields = [...DEFAULT_GLOBAL_POLICY.storeCustomFields];
  }
  if (!Array.isArray(globalPolicy.onlineTiers) || globalPolicy.onlineTiers.length === 0) {
    globalPolicy.onlineTiers = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY.onlineTiers));
  }
  if (!Array.isArray(globalPolicy.rebateTiers) || globalPolicy.rebateTiers.length === 0) {
    globalPolicy.rebateTiers = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY.rebateTiers));
  }
  if (!Array.isArray(globalPolicy.carriers) || globalPolicy.carriers.length === 0) {
    globalPolicy.carriers = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICY.carriers));
  }
  if (!Array.isArray(globalPolicy.promos)) {
    globalPolicy.promos = [];
  }

  localStorage.setItem('hq_global_policy_' + currentAgent, JSON.stringify(globalPolicy));

  const mainCarrier = globalPolicy.carriers[0] || { name: '周转筐', deposit: 15 };
  carrierLabel = mainCarrier.name;
  localStorage.setItem('hq_carrier_label_' + currentAgent, carrierLabel);

  renderActivePolicyBadgesBar();
  syncSeasonalPauseBannerUI();

  const th1 = document.getElementById('th-tier1-label');
  const th2 = document.getElementById('th-tier2-label');
  if (th1) th1.innerText = globalPolicy.tier1Name;
  if (th2) th2.innerText = globalPolicy.tier2Name;

  const lbl1 = document.getElementById('lbl-prod-tier1');
  const lbl2 = document.getElementById('lbl-prod-tier2');
  if (lbl1) lbl1.innerText = `🏬 ${globalPolicy.tier1Name} (元) *：`;
  if (lbl2) lbl2.innerText = `🌐 ${globalPolicy.tier2Name} (元)：`;

  const opt1 = document.getElementById('opt-policy-t1');
  const opt2 = document.getElementById('opt-policy-t2');
  if (opt1) opt1.innerText = globalPolicy.tier1Name;
  if (opt2) opt2.innerText = globalPolicy.tier2Name;
}
function renderCustomPresetsBar() {
  const bar = document.getElementById('policy-presets-bar');
  if (!bar) return;
  let customPresets = [];
  try {
    customPresets = JSON.parse(localStorage.getItem('hq_custom_presets_' + currentAgent) || '[]');
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

window.saveCurrentAsCustomPreset = function () {
  const name = prompt('为当前这套策略组合起个模板名称（如：日常平销策略 / 秋收助农模式）：');
  if (!name || !name.trim()) return;
  let customPresets = [];
  try {
    customPresets = JSON.parse(localStorage.getItem('hq_custom_presets_' + currentAgent) || '[]');
  } catch (e) {}
  customPresets.push({ name: name.trim(), policy: JSON.parse(JSON.stringify(globalPolicy)) });
  localStorage.setItem('hq_custom_presets_' + currentAgent, JSON.stringify(customPresets));
  renderCustomPresetsBar();
  alert(`✅ 已将当前策略存为专属模板【${name.trim()}】，以后可随时一键切换！`);
};

window.applySavedCustomPreset = function (idx) {
  let customPresets = [];
  try {
    customPresets = JSON.parse(localStorage.getItem('hq_custom_presets_' + currentAgent) || '[]');
  } catch (e) {}
  const target = customPresets[idx];
  if (!target) return;
  globalPolicy = JSON.parse(JSON.stringify(target.policy));
  window.openGlobalPolicyModal('tiers');
  alert(`✅ 已载入您的专属模板【${target.name}】，点击底部「保存全局经营策略」即可全端生效。`);
};

window.openGlobalPolicyModal = function (defaultTab = 'tiers') {
  renderCustomPresetsBar();
  document.getElementById('gp-store-tier-enabled').checked = globalPolicy.storeTierEnabled !== false;
  renderPolicyTiersEditor();
  renderPolicyStoreFieldsEditor();
  renderOnlineTiersEditor();
  renderRebateTiersEditor();
  renderPolicyCarriersEditor();
  renderPolicyPromosEditor();

  document.getElementById('gp-harvest-aid-on').checked = !!globalPolicy.harvestAidOn;
  document.getElementById('gp-ration-limit-qty').value = globalPolicy.rationLimitQty ?? 0;
  document.getElementById('gp-online-price-enabled').checked = !!globalPolicy.onlinePriceEnabled;
  document.getElementById('gp-rebate-enabled').checked = globalPolicy.rebateEnabled !== false;
  document.getElementById('gp-promoter-enabled').checked = globalPolicy.promoterEnabled !== false;
  document.getElementById('gp-promoter-rate').value = globalPolicy.promoterRate ?? 8.0;
  document.getElementById('gp-referral-bonus').value = globalPolicy.referralBonus ?? 100;
  document.getElementById('gp-campaign-active').checked = !!globalPolicy.campaignActive;

  document.getElementById('gp-2fa-cash-on').checked = globalPolicy.twoFaCashOn !== false;
  document.getElementById('gp-2fa-threshold').value = globalPolicy.twoFaThreshold ?? 3000;
  document.getElementById('gp-2fa-price-on').checked = globalPolicy.twoFaPriceOn !== false;
  document.getElementById('gp-2fa-price-pct').value = globalPolicy.twoFaPricePct ?? 15;
  document.getElementById('gp-2fa-credit-on').checked = globalPolicy.twoFaCreditOn !== false;
  document.getElementById('gp-2fa-delete-on').checked = globalPolicy.twoFaDeleteOn !== false;
  document.getElementById('gp-2fa-limit-on').checked = globalPolicy.twoFaLimitOn !== false;
  document.getElementById('gp-2fa-stock-audit-on').checked = !!globalPolicy.twoFaStockAuditOn;
  document.getElementById('gp-2fa-policy-on').checked = !!globalPolicy.twoFaPolicyOn;
  document.getElementById('gp-2fa-export-on').checked = !!globalPolicy.twoFaExportOn;

  document.getElementById('gp-tier1-name').value = globalPolicy.tier1Name || '批发平准基准价';
  document.getElementById('gp-tier2-name').value = globalPolicy.tier2Name || '网上平准零售基准价';
  document.getElementById('gp-default-min-stock').value = globalPolicy.defaultMinStock ?? 10;
  document.getElementById('gp-expiry-warn-days').value = globalPolicy.expiryWarnDays ?? 30;
  document.getElementById('gp-allow-store-return').checked = globalPolicy.allowStoreReturn !== false;

  document.getElementById('gp-slip-header-sub').value = globalPolicy.slipHeaderSub || '';
  document.getElementById('gp-slip-footer-note').value = globalPolicy.slipFooterNote || '';
  document.getElementById('gp-slip-stamp-text').value = globalPolicy.slipStampText || '调度专用章';

  window.switchPolicyTab(defaultTab);
  window.openModal('modal-global-policy');
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

function renderPolicyTiersEditor() {
  const box = document.getElementById('gp-tiers-container');
  if (!box) return;
  box.innerHTML = '';
  globalPolicy.storeTiers.forEach((tier) => window.addPolicyTierRow(tier.name, tier.creditLimit, tier.discountRate, tier.returnQuota));
}

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

function renderPolicyStoreFieldsEditor() {
  const box = document.getElementById('gp-store-fields-container');
  if (!box) return;
  box.innerHTML = '';
  (globalPolicy.storeCustomFields || []).forEach((f) => window.addPolicyStoreFieldRow(f));
}

window.addPolicyStoreFieldRow = function (fieldName = '') {
  const box = document.getElementById('gp-store-fields-container');
  if (!box) return;
  const row = document.createElement('div');
  row.className = 'flex items-center gap-2 bg-stone-50 p-2 rounded-xl border border-stone-200 gp-store-field-row';
  row.innerHTML = `
    <input type="text" placeholder="信息栏名称(如:施工工地名称 / 冷库容量 / 开票税号)" value="${fieldName}" class="gp-sf-name flex-1 bg-white border border-stone-200 rounded-lg px-2.5 py-1 font-bold outline-none">
  `;
  box.appendChild(row);
};

function renderOnlineTiersEditor() {
  const box = document.getElementById('gp-online-tiers-container');
  if (!box) return;
  box.innerHTML = '';
  (globalPolicy.onlineTiers || []).forEach((t) => window.addOnlineTierRow(t.minQty, t.rate, t.label));
}

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

function renderRebateTiersEditor() {
  const box = document.getElementById('gp-rebate-tiers-container');
  if (!box) return;
  box.innerHTML = '';
  (globalPolicy.rebateTiers || []).forEach((r) => window.addRebateTierRow(r.threshold, r.rate));
}

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

function renderPolicyPromosEditor() {
  const box = document.getElementById('gp-promos-container');
  if (!box) return;
  box.innerHTML = '';
  (globalPolicy.promos || []).forEach((pr) => window.addPolicyPromoRow(pr.title, pr.rule));
}

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

function renderPolicyCarriersEditor() {
  const box = document.getElementById('gp-carriers-container');
  if (!box) return;
  box.innerHTML = '';
  globalPolicy.carriers.forEach((c) => window.addPolicyCarrierRow(c.name, c.deposit));
}

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

window.applyGlobalPreset = function (presetKey) {
  const presets = {
    coop: {
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
      defaultMinStock: 15,
      expiryWarnDays: 7,
      allowStoreReturn: true,
      slipHeaderSub: '村社合作社源头直供 · 新鲜直达 · 诚信相照',
      slipFooterNote: '生鲜农产请当面验货签收，周转筐随车清点回收。',
      slipStampText: '合作社调度专用章'
    },
    factory: {
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
      defaultMinStock: 30,
      expiryWarnDays: 45,
      allowStoreReturn: true,
      slipHeaderSub: '源头工坊直发 · 实名保真 · 品质溯源',
      slipFooterNote: '整托发运请核对封签批号，标准木托盘循环计账。',
      slipStampText: '工坊出库核验章'
    },
    hardware: {
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
      defaultMinStock: 20,
      expiryWarnDays: 0,
      allowStoreReturn: true,
      slipHeaderSub: '工料配件直供中心 · 规格齐全 · 按需配送',
      slipFooterNote: '非质量问题定制件不退不换，标准件完整包装支持调换。',
      slipStampText: '仓储配发专用章'
    },
    cylinder: {
      storeTierEnabled: true,
      storeTiers: [
        { name: '大型餐饮食堂户', creditLimit: 5000, discountRate: 0.94, returnQuota: 500 },
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
      defaultMinStock: 50,
      expiryWarnDays: 15,
      allowStoreReturn: false,
      slipHeaderSub: '安全循环配送 · 空桶/空瓶随车清点抵账',
      slipFooterNote: '送一收一，缺失容器按押金标准计入往来账目。',
      slipStampText: '配送调度核验章'
    }
  };

  const chosen = presets[presetKey];
  if (!chosen) return;
  globalPolicy = JSON.parse(JSON.stringify(chosen));
  window.openGlobalPolicyModal('tiers');
  alert('✅ 已套用行业预设模板！您可继续微调各项开关与数字后点击底部「保存全局经营策略」。');
};

window.saveGlobalPolicySettings = async function () {
  const execSave = async () => {
    const tiers = [];
    document.querySelectorAll('#gp-tiers-container .gp-tier-row').forEach((row) => {
      const name = row.querySelector('.gp-t-name')?.value.trim();
      if (!name) return;
      tiers.push({
        name,
        creditLimit: parseFloat(row.querySelector('.gp-t-credit')?.value) || 2000,
        discountRate: parseFloat(row.querySelector('.gp-t-rate')?.value) || 1.0,
        returnQuota: parseFloat(row.querySelector('.gp-t-ret')?.value) || 500
      });
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
      if (!name) return;
      carriers.push({
        name,
        deposit: parseFloat(row.querySelector('.gp-c-deposit')?.value) || 15
      });
    });

    const nextPolicy = {
      ...globalPolicy,
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

    localStorage.setItem('hq_global_policy_' + currentAgent, JSON.stringify(nextPolicy));
    globalPolicy = nextPolicy;

    try {
      await HQService.updateTenantWithVerify(currentAgent, { custom_settings: nextPolicy });
      if (currentTenantData) currentTenantData.custom_settings = nextPolicy;
    } catch (err) {
      console.warn('云端 custom_settings 同步提示（本地已生效）:', err.message);
    }

    loadGlobalPolicyFromTenant(currentTenantData);
    renderStoreTable();
    renderThreeFlowsAndAIAdvisor();
    renderPerformanceAndCommissions();
    alert('🎉 商号全局经营策略已保存并同步全端生效！');
    window.closeModal('modal-global-policy');
  };

  if (globalPolicy.twoFaPolicyOn) {
    window.trigger2FAAction('修改全局价格、返利与风控策略，请输入手机验证器 6 位动态口令授权：', execSave);
  } else {
    await execSave();
  }
};

window.openCounterProfileModal = function () {
  document.getElementById('counter-origin-desc-input').value = currentTenantData?.brand_origin_desc || '';
  document.getElementById('counter-media-url-input').value = currentTenantData?.media_url || '';
  const links = globalPolicy.socialLinks || {};
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

  globalPolicy.socialLinks = socialLinks;
  localStorage.setItem('hq_global_policy_' + currentAgent, JSON.stringify(globalPolicy));

  try {
    await HQService.updateTenantWithVerify(currentAgent, {
      brand_origin_desc,
      media_url,
      custom_settings: globalPolicy
    });
    if (currentTenantData) {
      currentTenantData.brand_origin_desc = brand_origin_desc;
      currentTenantData.media_url = media_url;
      currentTenantData.custom_settings = globalPolicy;
    }
    alert('✅ 产区水土档案与外部社交平台矩阵已同步至数字专柜与合作名片！');
    window.closeModal('modal-counter-profile');
  } catch (err) {
    alert('⚠️ 储存失败：' + err.message);
  }
};

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
    alert(url ? '✅ 报单群机器人已写入云端并启用！' : '已关闭报单群机器人通知。');
    window.closeModal('modal-webhook-setup');
  } catch (err) {
    alert('⚠️ 储存失败：' + err.message);
  }
};

window.testWebhookPing = async function () {
  const url = document.getElementById('webhook-url-input').value.trim();
  if (!url) return alert('请先粘贴群机器人 Webhook 地址！');
  const msg = `🔔【${currentTenantData?.company_name || currentAgent}】报单提醒测试成功！后续合作门店下新单或新店预约送样，本群将第一时间收到通知。`;
  try {
    await HQService.sendWebhookMessage(url, msg);
    alert('📡 测试消息已发出！请打开您的企业微信 / 钉钉 / 飞书群查看是否收到提醒。');
  } catch (err) {
    alert('发送失败，请检查网址格式是否正确：' + err.message);
  }
};

function updateWebhookStatusBadge(url) {
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

function updateTotpStatusBadge(isEnabled) {
  const totpBtn = document.getElementById('btn-top-totp');
  if (!totpBtn) return;
  if (isEnabled) {
    totpBtn.innerHTML = '✅ 验证器已绑';
    totpBtn.className = 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs px-2.5 py-1.5 rounded-xl font-bold border border-emerald-400/50 active:scale-95 transition';
  } else {
    totpBtn.innerHTML = '🛡️ 验证器';
    totpBtn.className = 'bg-white/5 hover:bg-white/15 text-emerald-200 text-xs px-2.5 py-1.5 rounded-xl font-medium border border-emerald-600/40 active:scale-95 transition';
  }
}

function applyRoleViewExperience(roleCode, operatorName) {
  const displayEl = document.getElementById('hq-operator-role-display');
  const roleLabels = {
    owner: '大当家主账号 (全盘管理权)',
    warehouse: `仓储调度 · ${operatorName} (仅管实物 · 物理盲价)`,
    producer: `产区采收/班组长 · ${operatorName} (预入库与排产 · 物理盲价)`,
    finance: `账房财务 · ${operatorName} (管账审单 · 不改库)`,
    sales: `业务员/客户经理 · ${operatorName} (私海客户跟进与催收留痕)`,
    driver: `送货师傅 · ${operatorName} (随车交割)`,
    qc_service: `售后定损/质检 · ${operatorName} (定损鉴证)`,
    auditor: `独立稽核 · ${operatorName} (全盘只读审计)`
  };
  if (displayEl) displayEl.innerText = roleLabels[roleCode] || operatorName;

  if (roleCode !== 'owner') {
    document.getElementById('btn-top-chg-pwd')?.classList.add('hidden');
    document.getElementById('btn-top-totp')?.classList.add('hidden');
    document.querySelectorAll('.owner-only-guard').forEach((el) => el.classList.add('hidden'));
  }

  if (roleCode === 'warehouse' || roleCode === 'producer') {
    document.querySelectorAll('.price-col-guard').forEach((el) => el.classList.add('hidden'));
    document.getElementById('btn-top-statement')?.classList.add('hidden');
    document.getElementById('btn-top-counter')?.classList.add('hidden');
    document.getElementById('tab-btn-stores')?.classList.add('hidden');
    document.getElementById('tab-btn-perf')?.classList.add('hidden');
    const moneyCard = document.getElementById('flow-money-card');
    if (moneyCard) moneyCard.classList.add('hidden');
    window.switchTab('products');
  }

  if (roleCode === 'finance') {
    document.getElementById('btn-bulk-import')?.classList.add('hidden');
    document.getElementById('btn-add-product')?.classList.add('hidden');
    window.switchTab('settle');
  }

  if (roleCode === 'sales') {
    document.getElementById('btn-bulk-import')?.classList.add('hidden');
    document.getElementById('btn-add-product')?.classList.add('hidden');
    window.switchTab('stores');
  }

  if (roleCode === 'auditor') {
    document.querySelectorAll('.write-op-guard').forEach((el) => el.classList.add('hidden'));
    document.getElementById('btn-bulk-import')?.classList.add('hidden');
    document.getElementById('btn-add-product')?.classList.add('hidden');
  }
}

window.openStockOpsModal = function (prodId) {
  if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验单据，不可制单改动库存。');
  if (currentRoleCode === 'finance' || currentRoleCode === 'sales') {
    return alert('⚠️ 当前岗位不直接操作仓库实物出入库，请由仓储调度制单。');
  }

  const p = allProducts.find((x) => x.id === prodId);
  if (!p) return;
  const curStock = parseInt(p.stock ?? 0);
  const unit = p.measure_unit || '件';

  document.getElementById('stock-ops-prod-id').value = p.id;
  document.getElementById('stock-ops-cur-stock').value = curStock;
  document.getElementById('stock-ops-title').innerText = `📦 开具极简入库/出库单 · ${p.name}`;
  document.getElementById('stock-ops-subtitle').innerText = isWarehouseBlindPrice()
    ? `当前账面库存：${curStock} ${unit}`
    : `当前账面库存：${curStock} ${unit} · 批发基准价 ¥${p.tier_1_price}`;
  document.getElementById('stock-ops-qty-input').value = '';
  document.getElementById('stock-ops-source').value = '';
  document.getElementById('stock-ops-operator').value = currentOperatorName;
  document.getElementById('stock-ops-remark').value = '';
  window.setStockOpsMode('in_purchase');
  window.openModal('modal-stock-ops');
};

window.setStockOpsMode = function (mode) {
  currentStockOpsMode = mode;
  const prefix = mode === 'out_loss' ? 'CK' : 'RK';
  currentVoucherNo = generateUnifiedVoucherNo(prefix);
  const voucherEl = document.getElementById('stock-ops-voucher-no');
  if (voucherEl) voucherEl.innerText = currentVoucherNo;

  const btns = {
    in_purchase: document.getElementById('btn-mode-in'),
    out_loss: document.getElementById('btn-mode-out'),
    audit_adjust: document.getElementById('btn-mode-audit')
  };
  Object.entries(btns).forEach(([k, el]) => {
    if (!el) return;
    el.className = k === mode ? 'py-1.5 rounded-lg bg-[#1b4332] text-white transition' : 'py-1.5 rounded-lg text-stone-600 transition';
  });

  const subSelect = document.getElementById('stock-ops-subtype');
  const label = document.getElementById('stock-ops-qty-label');
  const srcLabel = document.getElementById('stock-ops-source-label');
  const srcInput = document.getElementById('stock-ops-source');
  if (mode === 'in_purchase') {
    if (subSelect) {
      subSelect.innerHTML = `
        <option value="采收/完工入库">🌾 采收 / 完工新品入库</option>
        <option value="门店退货回库">🔄 门店退货完好回库</option>
        <option value="他库调入">🚚 其他分仓调拨入库</option>
      `;
    }
    label.innerText = '本次入库数量 (+) *：';
    if (srcLabel) srcLabel.innerText = '供货产区 / 交货班组 *：';
    if (srcInput) srcInput.placeholder = '例：伏牛山种植合作社一组 / 加工车间一班';
  } else if (mode === 'out_loss') {
    if (subSelect) {
      subSelect.innerHTML = `
        <option value="损耗/领用出库">📉 损耗 / 样品 / 内部领用出库</option>
        <option value="调出他库">🚚 调拨出库至其他分仓</option>
      `;
    }
    label.innerText = '本次出库数量 (-) *：';
    if (srcLabel) srcLabel.innerText = '领用部门 / 去向单位 *：';
    if (srcInput) srcInput.placeholder = '例：展销品鉴样品 / 运输破损报废 / 调出西区仓';
  } else {
    if (subSelect) {
      subSelect.innerHTML = `<option value="实地盘点校准">⚖️ 仓库实地清点校准</option>`;
    }
    label.innerText = '仓库实地清点后的实际库存总数 (=) *：';
    if (srcLabel) srcLabel.innerText = '盘点库区 / 监盘人 *：';
    if (srcInput) srcInput.placeholder = '例：一号恒温总仓 · 财务监盘';
  }
};

window.submitStockOperation = async function () {
  const prodId = parseInt(document.getElementById('stock-ops-prod-id').value);
  const curStock = parseInt(document.getElementById('stock-ops-cur-stock').value) || 0;
  const inputVal = parseInt(document.getElementById('stock-ops-qty-input').value);
  const subType = document.getElementById('stock-ops-subtype')?.value || '采收/完工入库';
  const sourceParty = document.getElementById('stock-ops-source').value.trim();
  const operator = document.getElementById('stock-ops-operator').value.trim() || currentOperatorName;
  const remark = document.getElementById('stock-ops-remark').value.trim();

  if (isNaN(inputVal) || inputVal < 0) return alert('请输入有效的正整数量！');
  if (!sourceParty) return alert('请填写供货产区 / 领用去向 / 盘点库区，以便财务与仓库稽核！');

  const p = allProducts.find((x) => x.id === prodId);
  if (!p) return;

  let afterStock = curStock;
  let deltaQty = 0;

  if (currentStockOpsMode === 'in_purchase') {
    if (inputVal === 0) return alert('入库数量需大于 0！');
    deltaQty = inputVal;
    afterStock = curStock + inputVal;
  } else if (currentStockOpsMode === 'out_loss') {
    if (inputVal === 0) return alert('出库数量需大于 0！');
    deltaQty = -inputVal;
    afterStock = Math.max(0, curStock - inputVal);
  } else {
    afterStock = inputVal;
    deltaQty = afterStock - curStock;
  }

  const execStockWrite = async () => {
    const { error: uErr } = await supabase.from('product').update({ stock: afterStock }).eq('id', prodId);
    if (uErr) return alert('更新库存失败：' + uErr.message);

    const voucherNo = currentVoucherNo || generateUnifiedVoucherNo(deltaQty >= 0 ? 'RK' : 'CK');
    const fullRemark = `[单号:${voucherNo}] [${subType} · ${sourceParty}] ${remark}`.trim();

    await HQService.recordInventoryChange(currentAgent, {
      tenant_id: currentAgent,
      product_id: prodId,
      product_name: p.name,
      action_type: currentStockOpsMode,
      delta_qty: deltaQty,
      before_stock: curStock,
      after_stock: afterStock,
      operator_name: operator,
      remark: fullRemark,
      created_at: new Date().toISOString()
    });

    alert(
      `✅ 单据已制单入账！\n\n` +
        `• 正式单号：${voucherNo}\n` +
        `• 单据子类：${subType}\n` +
        `• 货品名称：${p.name}\n` +
        `• 库存变动：${curStock} ➔ ${afterStock} ${p.measure_unit || '件'}`
    );
    window.closeModal('modal-stock-ops');
    window.loadHQData();
  };

  if (globalPolicy.twoFaStockAuditOn && currentRoleCode === 'owner' && (currentStockOpsMode === 'out_loss' || deltaQty < 0)) {
    window.trigger2FAAction(`仓库盘亏/损耗出库核销 (${deltaQty} ${p.measure_unit || '件'})，请输入验证器 6 位动态码授权：`, execStockWrite);
  } else {
    await execStockWrite();
  }
};

function extractVoucherMeta(log) {
  const raw = log.remark || '';
  const noMatch = raw.match(/\[单号:([^\]]+)\]/);
  const srcMatch = raw.match(/\[单号:[^\]]+\]\s*\[([^\]]+)\]/);

  const voucherNo = noMatch ? noMatch[1] : `RK-${String(log.id || Date.now()).slice(-6)}`;
  const sourceParty = srcMatch ? srcMatch[1] : log.action_type === 'order_ship' ? '门店受单配发' : '仓库日常作业';
  const prod = allProducts.find((p) => Number(p.id) === Number(log.product_id) || p.name === log.product_name);
  const goodsValue = (Math.abs(parseInt(log.delta_qty || 0)) * parseFloat(prod?.tier_1_price || 0)).toFixed(2);
  const cleanNote = raw
    .replace(/\[单号:[^\]]+\]/g, '')
    .replace(/\[门店ID:\d+\]/g, '')
    .replace(/\[冲抵金额:¥[0-9.]+\]/g, '')
    .replace(/\[[^\]]+\]/g, '')
    .trim();

  return { voucherNo, sourceParty, goodsValue, cleanNote };
}

window.openStockVoucherPrint = function (logIdx) {
  const log = allInventoryLogs[logIdx];
  if (!log) return;
  const { voucherNo, sourceParty, goodsValue, cleanNote } = extractVoucherMeta(log);
  const isDamageClaim = log.action_type === 'qc_damage_claim';
  const isPlus = parseInt(log.delta_qty || 0) >= 0;

  document.getElementById('sv-print-title').innerText = `${currentTenantData?.company_name || currentAgent} · ${
    isDamageClaim ? '实地定损鉴证凭单' : isPlus ? '统一入库核验凭单 (RK)' : '统一出库核验凭单 (CK)'
  }`;
  document.getElementById('sv-print-voucher-no').innerText = `正式单据编号：${voucherNo}`;
  document.getElementById('sv-print-type').innerText = isDamageClaim ? '商号内部定损单 (DS)' : isPlus ? '统一入库单 (RK)' : '统一出库单 (CK)';
  document.getElementById('sv-print-time').innerText = log.created_at ? new Date(log.created_at).toLocaleString() : new Date().toLocaleString();
  document.getElementById('sv-print-source').innerText = sourceParty;
  document.getElementById('sv-print-operator').innerText = log.operator_name || '仓管';

  const deltaStr = parseInt(log.delta_qty) >= 0 ? `+${log.delta_qty}` : `${log.delta_qty}`;
  const valueCellHtml = isWarehouseBlindPrice()
    ? ''
    : `<td class="border border-stone-400 p-2 text-right font-mono font-bold">¥${goodsValue}</td>`;

  document.getElementById('sv-print-tbody').innerHTML = `
    <tr>
      <td class="border border-stone-400 p-2 font-bold">${log.product_name}</td>
      <td class="border border-stone-400 p-2 text-center font-mono">${log.before_stock}</td>
      <td class="border border-stone-400 p-2 text-center font-mono font-bold">${deltaStr}</td>
      <td class="border border-stone-400 p-2 text-center font-mono font-bold">${log.after_stock}</td>
      ${valueCellHtml}
    </tr>
  `;
  document.getElementById('sv-print-remark').innerText = `事由与批次备注：${cleanNote || '正常单据核销'}`;
  window.openModal('modal-stock-voucher-print');
};

window.executeStockVoucherPrint = function () {
  document.body.classList.remove('print-single-slip');
  document.body.classList.add('print-stock-voucher');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('print-stock-voucher');
  }, 500);
};

window.filterInventoryVouchers = function (val) {
  invVoucherSearch = (val || '').trim().toLowerCase();
  renderInventoryLogs();
};

function renderInventoryLogs() {
  const box = document.getElementById('inventory-log-list');
  if (!box) return;

  const list = invVoucherSearch
    ? allInventoryLogs.filter(
        (l) =>
          (l.product_name || '').toLowerCase().includes(invVoucherSearch) ||
          (l.remark || '').toLowerCase().includes(invVoucherSearch) ||
          (l.operator_name || '').toLowerCase().includes(invVoucherSearch)
      )
    : allInventoryLogs;

  if (list.length === 0) {
    box.innerHTML = '<div class="py-6 text-center text-stone-400">暂无匹配的单据记录。</div>';
    return;
  }

  box.innerHTML = list
    .map((l) => {
      const origIdx = allInventoryLogs.indexOf(l);
      const isDamageClaim = l.action_type === 'qc_damage_claim';
      const isPlus = parseInt(l.delta_qty || 0) >= 0;
      const typeLabel = isDamageClaim ? 'DS-内部定损单' : isPlus ? 'RK-统一入库单' : 'CK-统一出库单';
      const { voucherNo, sourceParty, goodsValue, cleanNote } = extractVoucherMeta(l);

      const isClaimSettled = String(l.remark || '').includes('[已核准冲账]');
      const claimBtnHtml =
        isDamageClaim && !isWarehouseBlindPrice() && !isAuditorReadOnly() && currentRoleCode !== 'sales'
          ? isClaimSettled
            ? '<span class="text-[10px] text-emerald-700 font-bold">✓ 已核准冲账</span>'
            : `<button type="button" onclick="window.approveInternalDamageClaim(${l.id})" class="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-xl font-bold text-[10px] shadow-2xs">✅ 核准冲减欠款</button>`
          : '';

      return `
        <div class="py-2.5 flex flex-wrap justify-between items-center gap-2 ${isDamageClaim && !isClaimSettled ? 'bg-rose-50/40 px-2 rounded-2xl' : ''}">
          <div class="space-y-0.5">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="font-mono text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.2 rounded font-bold">${voucherNo}</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-bold ${
                isDamageClaim ? 'bg-rose-100 text-rose-900' : isPlus ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
              }">${typeLabel}</span>
              <b class="text-stone-900">${l.product_name}</b>
              <span class="text-[10px] bg-white text-stone-700 border border-stone-200 px-1.5 py-0.2 rounded">${sourceParty}</span>
            </div>
            <div class="text-[10px] text-stone-400 font-mono">
              经手人: ${l.operator_name || '仓管'} · 时间: ${new Date(l.created_at).toLocaleString()} ${cleanNote ? `· 详情: ${cleanNote}` : ''}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            ${
              isDamageClaim
                ? ''
                : `<div class="text-right font-mono">
                    <b class="${isPlus ? 'text-emerald-700' : 'text-rose-700'} font-bold">${isPlus ? '+' + l.delta_qty : l.delta_qty}</b>
                    <span class="text-stone-400 text-[10px] ml-1">(${l.before_stock} ➔ ${l.after_stock})</span>
                    ${isWarehouseBlindPrice() ? '' : `<span class="text-[10px] text-stone-600 block">货值: ¥${goodsValue}</span>`}
                  </div>`
            }
            ${claimBtnHtml}
            <button type="button" onclick="window.openStockVoucherPrint(${origIdx})" class="bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 px-2.5 py-1 rounded-xl font-bold text-[10px] shadow-2xs transition">
              🖨️ 凭单
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

window.downloadBulkProductTemplate = function () {
  const headers = ['货品全称', globalPolicy.tier1Name || '批发平准基准价', globalPolicy.tier2Name || '网上平准零售基准价', '包装规格', '计量单位', '初始库存', '条码', '产地'];
  const sampleRows = [
    ['伏牛山有机五常大米 10kg', '68.00', '78.00', '10kg/袋', '袋', '200', '690123456001', '伏牛山生态合作社'],
    ['农家古法压榨菜籽油 5L', '85.00', '98.00', '4桶/箱', '箱', '120', '690123456002', '源头榨油工坊']
  ];
  downloadCSV('货品批量导入标准模板.csv', headers, sampleRows);
};

window.handleBulkCsvFile = function (event) {
  const file = event.target.files[0];
  const previewEl = document.getElementById('bulk-import-preview');
  const btn = document.getElementById('btn-exec-bulk-import');
  parsedBulkProducts = [];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const text = (e.target.result || '').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      if (previewEl) previewEl.innerText = '⚠️ 文件内容为空或仅有表头！';
      if (btn) btn.disabled = true;
      return;
    }

    const l1Default = allPlatformCats.find((c) => c.level === 1)?.name || '粮油副食';
    const l2Default = allPlatformCats.find((c) => c.level === 2)?.name || '常规良品';

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      const name = cols[0];
      const price = parseFloat(cols[1]);
      if (!name || isNaN(price) || price <= 0) continue;

      const tier2 = parseFloat(cols[2]) || price;
      const spec = cols[3] || '整装';
      const unit = cols[4] || '件';
      const stock = parseInt(cols[5]) || 100;
      const barcode = cols[6] || '';
      const origin = cols[7] || '源头合作社/工坊原产';

      parsedBulkProducts.push({
        tenant_id: currentAgent,
        channel_brick_and_mortar: true,
        channel_ecommerce: true,
        sales_channel_type: '实体与电商双轨',
        category_main: l1Default,
        category_sub: l2Default,
        name,
        tier_1_price: price,
        tier_2_price: tier2,
        spec,
        measure_unit: unit,
        stock,
        barcode,
        origin_place: origin,
        trace_code_prefix: `${currentAgent}-QC-`,
        tags: ['🌾 合作社直供'],
        status: 'active'
      });
    }

    if (parsedBulkProducts.length === 0) {
      if (previewEl) previewEl.innerText = '⚠️ 未解析到有效货品行，请检查价格是否为数字！';
      if (btn) btn.disabled = true;
    } else {
      if (previewEl) previewEl.innerText = `✅ 已成功解析 ${parsedBulkProducts.length} 款待上架货品，点击下方按钮立即入库！`;
      if (btn) btn.disabled = false;
    }
  };
  reader.readAsText(file, 'UTF-8');
};

window.submitBulkProductImport = async function () {
  if (parsedBulkProducts.length === 0) return;
  const btn = document.getElementById('btn-exec-bulk-import');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '批量入库中...';
  }

  const { error } = await supabase.from('product').insert(parsedBulkProducts);
  if (btn) {
    btn.disabled = false;
    btn.innerText = '确认批量上架写入云端库';
  }

  if (error) return alert('批量导入失败：' + error.message);

  alert(`🎉 成功批量上架 ${parsedBulkProducts.length} 款货品！`);
  parsedBulkProducts = [];
  window.closeModal('modal-bulk-import');
  window.loadHQData();
};

window.exportInventorySheetCSV = function () {
  if (allProducts.length === 0) return alert('暂无货品可导出盘点表！');
  const headers = isWarehouseBlindPrice()
    ? ['货品ID', '货品全称', '规格', '计量单位', '当前账面库存', '实地清点数(手填)', '盘盈/盘亏差异', '内部备注']
    : ['货品ID', '货品全称', '规格', '计量单位', `${globalPolicy.tier1Name}(元)`, `${globalPolicy.tier2Name}(元)`, '当前账面库存', '实地清点数(手填)', '盘盈/盘亏差异', '内部备注'];

  const rows = allProducts.map((p) =>
    isWarehouseBlindPrice()
      ? [p.id, p.name, p.spec || '整装', p.measure_unit || '件', p.stock ?? 0, '', '', p.remark || '']
      : [
          p.id,
          p.name,
          p.spec || '整装',
          p.measure_unit || '件',
          parseFloat(p.tier_1_price || 0).toFixed(2),
          parseFloat(p.tier_2_price || p.tier_1_price || 0).toFixed(2),
          p.stock ?? 0,
          '',
          '',
          p.remark || ''
        ]
  );
  downloadCSV(`${currentAgent}_仓库实地盘点表_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
};

window.exportInventoryLogsCSV = function () {
  if (allInventoryLogs.length === 0) return alert('当前暂无单据记录！');
  const headers = isWarehouseBlindPrice()
    ? ['单据编号', '制单时间', '单据类型', '货品全称', '来源/去向', '变动数量', '变动前库存', '变动后库存', '经手人', '事由备注']
    : ['单据编号', '制单时间', '单据类型', '货品全称', '来源/去向', '变动数量', '变动前库存', '变动后库存', '估算货值(元)', '经手人', '事由备注'];

  const rows = allInventoryLogs.map((l) => {
    const { voucherNo, sourceParty, goodsValue, cleanNote } = extractVoucherMeta(l);
    const isPlus = parseInt(l.delta_qty) >= 0;
    const typeLabel = l.action_type === 'qc_damage_claim' ? 'DS-内部定损单' : isPlus ? 'RK-统一入库单' : 'CK-统一出库单';
    return isWarehouseBlindPrice()
      ? [
          voucherNo,
          l.created_at ? new Date(l.created_at).toLocaleString() : '',
          typeLabel,
          l.product_name || '',
          sourceParty,
          l.delta_qty ?? 0,
          l.before_stock ?? 0,
          l.after_stock ?? 0,
          l.operator_name || '仓管',
          cleanNote.replace(/[\r\n,]+/g, ' ')
        ]
      : [
          voucherNo,
          l.created_at ? new Date(l.created_at).toLocaleString() : '',
          typeLabel,
          l.product_name || '',
          sourceParty,
          l.delta_qty ?? 0,
          l.before_stock ?? 0,
          l.after_stock ?? 0,
          goodsValue,
          l.operator_name || '仓管',
          cleanNote.replace(/[\r\n,]+/g, ' ')
        ];
  });
  downloadCSV(`${currentAgent}_极简单据台账_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
};

window.addCustomAttrRow = function (keyVal = '', valStr = '') {
  const box = document.getElementById('custom-attrs-container');
  const row = document.createElement('div');
  row.className = 'flex items-center gap-1.5 custom-attr-row';
  row.innerHTML = `
    <input type="text" placeholder="属性名(如:材质/保质期)" value="${keyVal}" class="attr-key w-1/3 bg-white border border-amber-300 rounded-xl px-2.5 py-1 text-xs outline-none font-bold">
    <input type="text" placeholder="属性值(如:304钢/12个月)" value="${valStr}" class="attr-val flex-1 bg-white border border-amber-300 rounded-xl px-2.5 py-1 text-xs outline-none">
  `;
  box.appendChild(row);
};

window.applyIndustryAttrTemplate = function (type) {
  const templates = {
    food: [['保质期', '12个月'], ['贮存方式', '阴凉干燥'], ['执行标准', 'GB标准']],
    hardware: [['材质工艺', '304不锈钢'], ['规格型号', '国标通用'], ['表面处理', '防锈镀锌']],
    service: [['服务范围', '同城及周边乡镇'], ['响应时效', '预约当日上门'], ['质保承诺', '完工验收满意再结']],
    agri: [['有效成分', '高纯度配方'], ['净含量', '25kg/袋'], ['登记证号', '正规备案']]
  };
  const rows = templates[type] || [];
  const container = document.getElementById('custom-attrs-container');
  if (!container) return;
  container.innerHTML = '';
  rows.forEach(([k, v]) => window.addCustomAttrRow(k, v));
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
    .map((p) => `<option value="${p.id}" ${String(p.id) === String(prodId) ? 'selected' : ''}>${p.name} (批发基准¥${p.tier_1_price})</option>`)
    .join('');
  row.innerHTML = `
    <select class="rule-prod-id flex-1 bg-white border border-emerald-300 rounded-lg px-2 py-1 text-[11px] outline-none">${optionsHtml}</select>
    <input type="number" step="0.01" placeholder="协议工价" value="${specialPrice}" class="rule-price w-24 bg-white border border-emerald-300 rounded-lg px-2 py-1 font-mono font-bold text-[11px] outline-none">
  `;
  box.appendChild(row);
};

function renderThreeFlowsAndAIAdvisor() {
  const defaultMin = parseInt(globalPolicy.defaultMinStock ?? 10);
  const goodsValue = allProducts.reduce((sum, p) => sum + parseFloat(p.tier_1_price || 0) * parseInt(p.stock ?? 0), 0);
  const toShipOrders = allOrders.filter(
    (o) => (o.order_status === 'confirmed' || o.order_status === 'over_credit_approved') && o.delivery_status !== 'delivered' && !isDirectoryLead(o)
  );
  const lowStockProds = allProducts.filter((p) => parseInt(p.stock ?? 0) <= parseInt(p.custom_specs?.min_stock ?? defaultMin));

  document.getElementById('flow-goods-value').innerText = isWarehouseBlindPrice()
    ? '***'
    : `¥${goodsValue.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
  document.getElementById('flow-goods-toship').innerText = `${toShipOrders.length} 单`;
  document.getElementById('flow-goods-lowstock').innerText = `${lowStockProds.length} 款`;

  const visibleStores = getVisibleStoresForCurrentRole();
  const receivable = visibleStores.reduce((sum, s) => sum + parseFloat(s.current_debt || 0), 0);
  const settledTotal = allOrders
    .filter((o) => o.delivery_status === 'delivered' && !isDirectoryLead(o))
    .reduce((sum, o) => sum + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);
  document.getElementById('flow-money-receivable').innerText = isWarehouseBlindPrice() ? '***' : `¥${receivable.toFixed(2)}`;
  document.getElementById('flow-money-settled').innerText = isWarehouseBlindPrice() ? '***' : `¥${settledTotal.toFixed(2)}`;

  const pendingOrders = allOrders.filter((o) => o.order_status === 'pending_confirm' && !isDirectoryLead(o));
  const leadsList = allOrders.filter((o) => isDirectoryLead(o) && o.order_status === 'pending_confirm');
  const openDemands = allC2BDemands.filter((d) => !d.official_reply);
  const pendingPlans = allDemandPlans.filter((p) => p.status === 'submitted');
  const activePoolItems = allLocalPoolItems.filter((i) => i.status === 'open' || i.status === 'claimed');
  const draftProds = allProducts.filter((p) => p.status === 'draft');
  const pendingClaims = allInventoryLogs.filter((l) => l.action_type === 'qc_damage_claim' && !String(l.remark || '').includes('[已核准冲账]'));

  document.getElementById('flow-info-orders').innerText = `${pendingOrders.length + openDemands.length + pendingPlans.length} 笔`;
  document.getElementById('flow-info-leads').innerText = `${leadsList.length} 条`;

  const aiTips = [];
  if (!isWarehouseBlindPrice() && pendingClaims.length > 0) {
    const firstClaim = pendingClaims[0];
    const meta = extractVoucherMeta(firstClaim);
    aiTips.push({
      level: 'rose',
      icon: '🔧',
      title: `内部定损待核：有 ${pendingClaims.length} 笔《实地定损鉴证单》待裁定冲账`,
      desc: `最新一笔来自【${meta.sourceParty}】（单号 ${meta.voucherNo}）：${meta.cleanNote}`,
      btnText: '立即核准冲账 ➔',
      action: `window.approveInternalDamageClaim(${firstClaim.id});`
    });
  }

  if (!isWarehouseBlindPrice() && draftProds.length > 0) {
    aiTips.push({
      level: 'amber',
      icon: '📝',
      title: `分段上架待定策：有 ${draftProds.length} 款货品草稿待定基准价并合规上架`,
      desc: `仓管已录好实物规格与库存，点击即可设定批发与网上零售基准价并通过AI违禁词核验正式上架。`,
      btnText: '立即定价上架 ➔',
      action: `window.switchTab('products'); onlyDraftFilter = true; renderProductTable();`
    });
  }

  if (pendingPlans.length > 0) {
    aiTips.push({
      level: 'emerald',
      icon: '📅',
      title: `真实用度计划：有 ${pendingPlans.length} 份合作门店用度计划待纳入排产`,
      desc: `门店已提前提报未来周期真实用度预估量，可先查看「采收排产汇总单」合并总量，再按需采收排产。`,
      btnText: '查看排产总单 ➔',
      action: `window.openPlanAggregateModal();`
    });
  }

  if (activePoolItems.length > 0) {
    aiTips.push({
      level: 'amber',
      icon: '🔄',
      title: `同城余缺互调池：当前有 ${activePoolItems.length} 笔门店余货正在互调流通`,
      desc: `合作门店挂出的富余货品正进行同城平价调剂，可安排送货师傅顺路捎带交割，减少终端损耗。`,
      btnText: '查看互调动态 ➔',
      action: `window.switchTab('settle'); window.filterOrderStatus('local_pool');`
    });
  }

  if (openDemands.length > 0) {
    aiTips.push({
      level: 'amber',
      icon: '📢',
      title: `天街新需求：有 ${openDemands.length} 条门店/抱团求购榜待回应`,
      desc: `百工天街买家与门店已发起真实用度求购或定制聚量需求，按阳光工价给出直供报价即可锁定产销计划。`,
      btnText: '立即报工价接单 ➔',
      action: `window.switchTab('settle'); window.filterOrderStatus('c2b_demands');`
    });
  }

  lowStockProds.forEach((p) => {
    aiTips.push({
      level: 'rose',
      icon: '📦',
      title: `库存紧缺预警：【${p.name}】仅剩 ${p.stock ?? 0}${p.measure_unit || '件'}`,
      desc: `已低于安全预警线，建议立即开具采收/完工入库单备货，保障门店日常不断供。`,
      btnText: '+ 立即开入库单',
      action: `window.openStockOpsModal(${p.id})`
    });
  });

  const warnDays = parseInt(globalPolicy.expiryWarnDays ?? 30);
  if (warnDays > 0) {
    const nowTs = Date.now();
    const warnMs = warnDays * 24 * 3600 * 1000;
    allProducts.forEach((p) => {
      const expStr = p.custom_specs?.expiry_date;
      if (!expStr || parseInt(p.stock ?? 0) <= 0) return;
      const expTs = new Date(`${expStr}T23:59:59`).getTime();
      const diffDays = Math.ceil((expTs - nowTs) / (24 * 3600 * 1000));
      if (expTs - nowTs <= warnMs) {
        aiTips.push({
          level: diffDays <= 7 ? 'rose' : 'amber',
          icon: '⏳',
          title: `${diffDays <= 0 ? '批次已到期提醒' : `临期预警（余 ${diffDays} 天）`}：【${p.name}】在库 ${p.stock}${p.measure_unit || '件'}`,
          desc: `到期日为 ${expStr}（已进入设定的 ${warnDays} 天预警窗），建议优先安排配发或标注余缺调剂。`,
          btnText: '📦 安排优先配发',
          action: `window.openPushOrderModal()`
        });
      }
    });
  }

  if (!isWarehouseBlindPrice()) {
    visibleStores.forEach((s) => {
      const debt = parseFloat(s.current_debt || 0);
      const limit = parseFloat(s.credit_limit || 2000);
      const baskets = parseInt(s.carrier_hold_count || s.basket_count || 0);
      if (debt > limit * 0.85 && debt > 0) {
        aiTips.push({
          level: 'amber',
          icon: '💰',
          title: `信用账款提醒：【${s.name}】在账 ¥${debt.toFixed(2)}（接近周转额度 ¥${limit}）`,
          desc: `建议生成周期电子对账单发给掌柜核对回款平账，或安排业务员上门拜访催收。`,
          btnText: '🤝 拜访催收/对账',
          action: `window.openSalesCollectModal(${s.id});`
        });
      }
      if (baskets >= 15) {
        aiTips.push({
          level: 'amber',
          icon: '🔄',
          title: `${carrierLabel}循环提醒：【${s.name}】借用 ${baskets} 件未归还`,
          desc: `在外周转载具较多，建议提醒送货师傅本趟回程顺路清点带回，物尽其用。`,
          btnText: '🏪 查看门店档案',
          action: `window.switchTab('stores');`
        });
      }
    });
  }

  if (leadsList.length > 0) {
    aiTips.push({
      level: 'emerald',
      icon: '🤝',
      title: `新店合作意向：有 ${leadsList.length} 家意向门店申请上门送样洽谈`,
      desc: `意向门店已提交联系方式，及时联系送样并一键立户可共同完善城乡供需网络。`,
      btnText: '立即承接立户 ➔',
      action: `window.switchTab('settle'); window.filterOrderStatus('directory_leads');`
    });
  }

  if (aiTips.length === 0) {
    aiTips.push({
      level: 'emerald',
      icon: '🌿',
      title: '经营运转平稳：供需平衡、账目清白、货畅其流',
      desc: '当前所有在供良品库存充足，合作门店往来健康。可点击上方「📲 合作名片码」与更多门店和合作社建立直供联系。',
      btnText: '📲 分享合作名片',
      action: `window.openPromoQrModal()`
    });
  }

  document.getElementById('flow-info-ai').innerText = `${aiTips.length} 条`;

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

window.restockReturnedItems = async function (orderId) {
  if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验。');
  const o = allOrders.find((x) => Number(x.id) === Number(orderId));
  if (!o) return;
  const returns = Array.isArray(o.items_return) ? o.items_return : [];
  if (returns.length === 0) return alert('该单据无验退货品明细！');

  const summary = returns.map((r) => `${r.name} x${r.qty}`).join('、');
  const isGoodCondition = confirm(
    `【退货质检验收】退回货品：${summary}\n\n` +
      `• 点击「确定」：质检完好，良品回库自动增加可用库存；\n` +
      `• 点击「取消」：仅记入报损/销毁台账（不增加库存）。`
  );

  for (const r of returns) {
    const prod = allProducts.find((p) => Number(p.id) === Number(r.id) || p.name === r.name);
    if (!prod) continue;
    const qty = parseInt(r.qty || 0);
    if (qty <= 0) continue;

    const beforeStock = parseInt(prod.stock ?? 0);
    const afterStock = isGoodCondition ? beforeStock + qty : beforeStock;

    if (isGoodCondition) {
      await supabase.from('product').update({ stock: afterStock }).eq('id', prod.id);
    }

    const voucherNo = generateUnifiedVoucherNo(isGoodCondition ? 'RK' : 'CK');
    await HQService.recordInventoryChange(currentAgent, {
      tenant_id: currentAgent,
      product_id: prod.id,
      product_name: prod.name,
      action_type: isGoodCondition ? 'in_purchase' : 'out_loss',
      delta_qty: isGoodCondition ? qty : 0,
      before_stock: beforeStock,
      after_stock: afterStock,
      operator_name: currentOperatorName,
      remark: `[单号:${voucherNo}] [门店退货回库 · ${o.store_name || '合作门店'}] ${
        isGoodCondition ? '退货质检完好回库' : '退货报损销毁留痕'
      } (原单 #${o.order_no || o.id})`,
      created_at: new Date().toISOString()
    });
  }

  const nextNote = `${o.note || ''} [退货已质检入账]`.trim();
  await supabase.from('store_order').update({ note: nextNote }).eq('id', o.id);

  alert(isGoodCondition ? '✅ 退回良品已质检验收入库并生成入库凭单，可用库存已自动加回！' : '✅ 已登记退货报损凭单台账，可用库存保持不变。');
  window.loadHQData();
};

window.openSingleDeliverySlipPrint = function (orderId) {
  const o = allOrders.find((x) => Number(x.id) === Number(orderId));
  if (!o) return;

  const store = allStores.find((s) => Number(s.id) === Number(o.store_id));
  const companyTitle = currentTenantData?.company_name || currentAgent;

  document.getElementById('print-slip-company-title').innerText = `${companyTitle} · 随车送货交割凭单`;
  const subEl = document.getElementById('print-slip-custom-sub');
  if (subEl) subEl.innerText = globalPolicy.slipHeaderSub || '';
  document.getElementById('print-slip-meta-line').innerText = `单号：#${o.order_no || o.id} | 制单日期：${
    o.created_at ? new Date(o.created_at).toLocaleString() : new Date().toLocaleString()
  }`;

  const gridEl = document.getElementById('print-slip-store-grid');
  if (gridEl) {
    const extProfile = store?.custom_pricing?.ext_profile && typeof store.custom_pricing.ext_profile === 'object'
      ? store.custom_pricing.ext_profile
      : {};
    const extHtml = Object.entries(extProfile)
      .map(([k, v]) => `<div>${k}：<b>${v}</b></div>`)
      .join('');

    gridEl.innerHTML = `
      <div>收货门店：<b>${o.store_name || store?.name || '合作门店'}</b></div>
      <div>联系方式：<b class="font-mono">${store?.phone || '-'}</b></div>
      <div>送货地址：<span>${(store?.address || '临街门面').replace(/\[GPS:[^\]]+\]/g, '').trim()}</span></div>
      <div>交割方式：<b>${o.settlement_type || 'credit'}</b> · 师傅：<b>${o.driver_name || store?.driver_name || '送货师傅'}</b></div>
      ${extHtml}
    `;
  }

  const items = Array.isArray(o.items) ? o.items : [];
  const tbody = document.getElementById('print-slip-items-tbody');
  tbody.innerHTML =
    items.length === 0
      ? '<tr><td colspan="6" class="border border-stone-400 p-2 text-center text-stone-400">本单为调退冲抵单，无新配货品</td></tr>'
      : items
          .map((it, idx) => {
            const price = parseFloat(it.price || 0);
            const qty = parseInt(it.qty || 0);
            const sub = price * qty;
            return `
              <tr>
                <td class="border border-stone-400 p-1.5 text-center font-mono">${idx + 1}</td>
                <td class="border border-stone-400 p-1.5 font-bold">${it.name}</td>
                <td class="border border-stone-400 p-1.5">${it.spec || '整装'}</td>
                <td class="border border-stone-400 p-1.5 text-center font-mono">${qty} ${it.measure_unit || '件'}</td>
                <td class="border border-stone-400 p-1.5 text-right font-mono">${isWarehouseBlindPrice() ? '***' : `¥${price.toFixed(2)}`}</td>
                <td class="border border-stone-400 p-1.5 text-right font-mono font-bold">${isWarehouseBlindPrice() ? '***' : `¥${sub.toFixed(2)}`}</td>
              </tr>
            `;
          })
          .join('');

  const returnItems = Array.isArray(o.items_return) ? o.items_return : [];
  const exchangeItems = Array.isArray(o.items_exchange) ? o.items_exchange : [];
  const notesArr = [];
  if (returnItems.length > 0) {
    notesArr.push(`• 验退旧品冲抵：${returnItems.map((r) => `${r.name} x${r.qty}`).join('、')}`);
  }
  if (exchangeItems.length > 0) {
    notesArr.push(`• 平价换新对调：${exchangeItems.map((e) => `${e.name} x${e.qty}`).join('、')}`);
  }
  if (o.note) {
    notesArr.push(`• 交接附言：${o.note}`);
  }
  const baskets = parseInt(store?.carrier_hold_count || store?.basket_count || 0);
  const carrierListStr = globalPolicy.carriers.map((c) => `${c.name}(¥${c.deposit}/件)`).join('、');
  notesArr.push(`• 该门店累计借存周转载具：${baskets} 件（支持回收载具标准：${carrierListStr}，本次归还：_____ 件）`);

  document.getElementById('print-slip-special-notes').innerHTML = notesArr.map((n) => `<div>${n}</div>`).join('');

  const totalAmt = parseFloat(o.total_amount || 0);
  const returnAmt = parseFloat(o.return_amount || 0);
  const netAmt = parseFloat(o.net_settle_amount || totalAmt - returnAmt);

  document.getElementById('print-slip-total-amt').innerText = isWarehouseBlindPrice() ? '***' : `¥${totalAmt.toFixed(2)}`;
  document.getElementById('print-slip-return-amt').innerText = isWarehouseBlindPrice() ? '***' : `-¥${returnAmt.toFixed(2)}`;
  document.getElementById('print-slip-net-amt').innerText = isWarehouseBlindPrice() ? '***' : `¥${netAmt.toFixed(2)}`;

  const footerTermsEl = document.getElementById('print-slip-footer-terms');
  if (footerTermsEl) footerTermsEl.innerText = globalPolicy.slipFooterNote || '';
  const stampEl = document.getElementById('print-slip-stamp-label');
  if (stampEl) stampEl.innerText = globalPolicy.slipStampText || '调度专用章';

  window.openModal('modal-delivery-note-print');
};

window.executeSingleDeliverySlipPrint = function () {
  document.body.classList.remove('print-stock-voucher');
  document.body.classList.add('print-single-slip');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('print-single-slip');
  }, 500);
};

window.openStoreStatementModal = function (preselectStoreId = null) {
  if (isWarehouseBlindPrice()) return;
  const visibleStores = getVisibleStoresForCurrentRole();
  if (visibleStores.length === 0) return alert('当前名册下暂无合作门店！');
  const selectEl = document.getElementById('stmt-store-select');
  selectEl.innerHTML = visibleStores
    .map((s) => `<option value="${s.id}">${s.name} (在账 ¥${parseFloat(s.current_debt || 0).toFixed(2)})</option>`)
    .join('');

  if (preselectStoreId) {
    selectEl.value = preselectStoreId;
  }

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const startEl = document.getElementById('stmt-start-date');
  const endEl = document.getElementById('stmt-end-date');
  if (startEl && !startEl.value) startEl.value = firstDay;
  if (endEl && !endEl.value) endEl.value = today;

  window.renderStoreStatementDetail();
  window.openModal('modal-store-statement');
};

function getFilteredStatementData() {
  const storeId = parseInt(document.getElementById('stmt-store-select')?.value || 0);
  const store = allStores.find((s) => s.id === storeId);
  const startDate = document.getElementById('stmt-start-date')?.value || '2000-01-01';
  const endDate = document.getElementById('stmt-end-date')?.value || '2099-12-31';

  const startTs = new Date(`${startDate}T00:00:00`).getTime();
  const endTs = new Date(`${endDate}T23:59:59`).getTime();

  const orders = allOrders.filter((o) => {
    if (isDirectoryLead(o)) return false;
    if (Number(o.store_id) !== storeId) return false;
    if (o.order_status === 'cancelled') return false;
    const t = o.created_at ? new Date(o.created_at).getTime() : 0;
    return t >= startTs && t <= endTs;
  });

  const orderSum = orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
  const returnSum = orders.reduce((sum, o) => sum + parseFloat(o.return_amount || 0), 0);
  const netSum = orders.reduce((sum, o) => sum + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);

  return { store, startDate, endDate, orders, orderSum, returnSum, netSum };
}

window.renderStoreStatementDetail = function () {
  const { store, orders, orderSum, returnSum, netSum } = getFilteredStatementData();
  if (!store) return;

  const curDebt = parseFloat(store.current_debt || 0);
  const baskets = parseInt(store.carrier_hold_count || store.basket_count || 0);

  document.getElementById('stmt-order-sum').innerText = `¥${orderSum.toFixed(2)}`;
  document.getElementById('stmt-return-sum').innerText = `-¥${returnSum.toFixed(2)}`;
  document.getElementById('stmt-net-sum').innerText = `¥${netSum.toFixed(2)}`;
  document.getElementById('stmt-current-debt').innerText = `¥${curDebt.toFixed(2)}`;
  document.getElementById('stmt-basket-info').innerText = `${carrierLabel}借存：${baskets} 件`;
  document.getElementById('stmt-settle-amount').value = curDebt > 0 ? curDebt.toFixed(2) : '';

  const listEl = document.getElementById('stmt-orders-list');
  if (!listEl) return;
  if (orders.length === 0) {
    listEl.innerHTML = '<div class="py-6 text-center text-stone-400">所选日期区间内暂无往来交割单据。</div>';
    return;
  }

  listEl.innerHTML = orders
    .map((o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      const itemSummary = items.map((i) => `${i.name}x${i.qty}`).join('、') || '调退单';
      const net = parseFloat(o.net_settle_amount || o.total_amount || 0);
      return `
        <div class="py-2 flex justify-between items-start gap-2">
          <div>
            <b class="text-stone-900 font-mono">#${o.order_no || o.id}</b>
            <span class="text-[10px] text-stone-400 ml-1">${new Date(o.created_at).toLocaleDateString()} · ${o.settlement_type}</span>
            <div class="text-[10px] text-stone-600 mt-0.5">${itemSummary}</div>
          </div>
          <div class="text-right font-mono shrink-0">
            <b class="text-stone-900 font-bold">¥${net.toFixed(2)}</b>
            <span class="block text-[9px] ${o.delivery_status === 'delivered' ? 'text-emerald-700' : 'text-amber-700'}">
              ${o.delivery_status === 'delivered' ? '已签收' : '配送/排单中'}
            </span>
          </div>
        </div>
      `;
    })
    .join('');
};

window.copyStoreStatementText = function () {
  const { store, startDate, endDate, orders, orderSum, returnSum, netSum } = getFilteredStatementData();
  if (!store) return;
  const curDebt = parseFloat(store.current_debt || 0);
  const baskets = parseInt(store.carrier_hold_count || store.basket_count || 0);

  const lines = [
    `【${currentTenantData?.company_name || currentAgent} · 往来电子对账单】`,
    `合作门店：${store.name}（${store.contact || '掌柜'}）`,
    `对账周期：${startDate} 至 ${endDate}`,
    `------------------------`,
    `• 区间新配货品总额：¥${orderSum.toFixed(2)}`,
    `• 区间验退冲抵金额：-¥${returnSum.toFixed(2)}`,
    `• 区间发生净额合计：¥${netSum.toFixed(2)}（共 ${orders.length} 笔）`,
    `• 当前累计在账应结：¥${curDebt.toFixed(2)}`,
    `• ${carrierLabel}借存结余：${baskets} 件`,
    `------------------------`,
    `明细清单：`,
    ...(orders.length > 0
      ? orders.map((o, idx) => {
          const d = new Date(o.created_at).toLocaleDateString();
          const net = parseFloat(o.net_settle_amount || o.total_amount || 0).toFixed(2);
          const itemStr = (Array.isArray(o.items) ? o.items : []).map((i) => `${i.name}x${i.qty}`).join('、');
          return `${idx + 1}. [${d}] #${o.order_no || o.id} ¥${net} (${itemStr || '调退'})`;
        })
      : ['（本期无新增往来单据）']),
    `------------------------`,
    `诚信相照，清白对账！请掌柜核验，如有疑问随时联系我们。`
  ];

  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    alert(`✅ 【${store.name}】电子对账单已复制到剪贴板，可直接发送微信给掌柜核对！`);
  });
};

window.exportStoreStatementCSV = function () {
  const { store, startDate, endDate, orders } = getFilteredStatementData();
  if (!store) return;
  const execExport = () => {
    const headers = ['单据号', '日期', '门店名称', '交割方式', '新配金额(元)', '退验冲抵(元)', '净额(元)', '状态', '货品明细'];
    const rows = orders.map((o) => [
      o.order_no || o.id,
      new Date(o.created_at).toLocaleString(),
      store.name,
      o.settlement_type || '',
      parseFloat(o.total_amount || 0).toFixed(2),
      parseFloat(o.return_amount || 0).toFixed(2),
      parseFloat(o.net_settle_amount || o.total_amount || 0).toFixed(2),
      o.delivery_status === 'delivered' ? '已签收' : '配送/排单中',
      (Array.isArray(o.items) ? o.items : []).map((i) => `${i.name}x${i.qty}`).join('; ')
    ]);
    downloadCSV(`${store.name}_往来对账单_${startDate}_${endDate}.csv`, headers, rows);
  };
  if (globalPolicy.twoFaExportOn) {
    window.trigger2FAAction('导出客户财务往来对账单 (CSV)，请输入验证器 6 位动态码授权：', execExport);
  } else {
    execExport();
  }
};

window.submitStoreStatementSettle = async function () {
  if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验，不可核销账款。');
  if (currentRoleCode === 'sales') return alert('🤝 业务员不可直接核销总账，请使用「拜访催收」提交回款留痕交由财务核销。');
  const storeId = parseInt(document.getElementById('stmt-store-select')?.value || 0);
  const store = allStores.find((s) => s.id === storeId);
  if (!store) return;

  const payAmt = parseFloat(document.getElementById('stmt-settle-amount')?.value || 0);
  const payMethod = document.getElementById('stmt-pay-method')?.value || '银行公户/微信转账';
  if (isNaN(payAmt) || payAmt <= 0) return alert('请输入有效的实收平账金额！');

  const curDebt = parseFloat(store.current_debt || 0);
  const nextDebt = Math.max(0, Number((curDebt - payAmt).toFixed(2)));

  const doSettle = async () => {
    const { error: sErr } = await supabase.from('store').update({ current_debt: nextDebt }).eq('id', store.id);
    if (sErr) return alert('冲减欠款失败：' + sErr.message);

    await supabase.from('driver_collection_log').insert([
      {
        tenant_id: currentAgent,
        store_id: store.id,
        store_name: store.name,
        driver_name: currentOperatorName,
        collect_type: 'period_settlement',
        amount: payAmt,
        discount_amount: 0,
        basket_return: 0,
        basket_deduct_amount: 0,
        pay_method: payMethod,
        settled_to_hq: true
      }
    ]);

    alert(`🎉 平账销账成功！\n已核销【${store.name}】回款 ¥${payAmt.toFixed(2)}（${payMethod}）\n门店剩余在账余额：¥${nextDebt.toFixed(2)}`);
    await window.loadHQData();
    window.renderStoreStatementDetail();
  };

  const threshold = parseFloat(globalPolicy.twoFaThreshold ?? 3000);
  if (globalPolicy.twoFaCashOn !== false && payAmt >= threshold) {
    window.trigger2FAAction(`大额账期平账 ¥${payAmt.toFixed(2)}（已达全局风控门槛 ¥${threshold}），请输入手机验证器 6 位动态码授权：`, doSettle);
  } else {
    if (!confirm(`确认收到【${store.name}】回款 ¥${payAmt.toFixed(2)}（${payMethod}）并冲减在账欠款？`)) return;
    await doSettle();
  }
};

function buildAggregatedPlanItems() {
  const activePlans = allDemandPlans.filter((p) => p.status === 'submitted' || p.status === 'scheduled');
  const map = {};
  activePlans.forEach((p) => {
    const items = Array.isArray(p.items) ? p.items : [];
    items.forEach((it) => {
      const unit = it.unit || '件';
      const key = `${it.name}|${unit}`;
      if (!map[key]) {
        const matchedProd = allProducts.find((prod) => prod.name === it.name || prod.name.includes(it.name));
        map[key] = {
          name: it.name,
          unit,
          totalQty: 0,
          currentStock: matchedProd ? parseInt(matchedProd.stock ?? 0) : null,
          stores: []
        };
      }
      map[key].totalQty += parseInt(it.qty || 0);
      map[key].stores.push(`${p.store_name}(${it.qty}${unit}·${p.expected_date || '近期'})`);
    });
  });
  return { activePlans, aggregatedList: Object.values(map) };
}

window.openPlanAggregateModal = function () {
  const { activePlans, aggregatedList } = buildAggregatedPlanItems();
  document.getElementById('plan-agg-tenant-name').innerText = `${currentTenantData?.company_name || currentAgent} · 源头采收/排产汇总单`;
  document.getElementById('plan-agg-summary-meta').innerText = `汇总时间：${new Date().toLocaleString()}`;
  document.getElementById('plan-agg-count').innerText = `${activePlans.length} 份计划`;

  const container = document.getElementById('plan-agg-items-container');
  if (aggregatedList.length === 0) {
    container.innerHTML = '<div class="py-8 text-center text-stone-400">当前暂无「待排产 / 已纳入排产」的门店真实用度计划。</div>';
    window.openModal('modal-plan-aggregate');
    return;
  }

  container.innerHTML = aggregatedList
    .map((row, idx) => {
      const gap = row.currentStock !== null ? Math.max(0, row.totalQty - row.currentStock) : null;
      return `
        <div class="py-2.5 flex justify-between items-start gap-2">
          <div>
            <div class="font-bold text-stone-900 text-xs">${idx + 1}. ${row.name}</div>
            <div class="text-[10px] text-stone-500 mt-0.5">门店需求拆解：${row.stores.join('、')}</div>
            ${
              row.currentStock !== null
                ? `<div class="text-[10px] font-mono mt-0.5 ${gap > 0 ? 'text-rose-700 font-bold' : 'text-emerald-700'}">当前账面库存：${row.currentStock}${row.unit} ${
                    gap > 0 ? `（净缺口需采收/排产 ${gap}${row.unit}）` : '（现货充足可直接配发）'
                  }</div>`
                : '<div class="text-[10px] text-amber-800 mt-0.5">非标准在库品 · 需按需定制/采收</div>'
            }
          </div>
          <span class="bg-emerald-100 text-emerald-950 border border-emerald-300 px-2.5 py-0.5 rounded-lg font-mono font-bold text-sm shrink-0">${row.totalQty} ${row.unit}</span>
        </div>
      `;
    })
    .join('');

  window.openModal('modal-plan-aggregate');
};

window.copyPlanAggregateText = function () {
  const { activePlans, aggregatedList } = buildAggregatedPlanItems();
  if (aggregatedList.length === 0) return alert('暂无可复制的排产计划！');
  const lines = [
    `【${currentTenantData?.company_name || currentAgent} 产销排产汇总单】`,
    `汇总时间：${new Date().toLocaleString()} | 涵盖 ${activePlans.length} 份门店用度计划`,
    `------------------------`,
    ...aggregatedList.map((r, i) => {
      const stockInfo = r.currentStock !== null ? `（在库${r.currentStock}${r.unit}，缺口${Math.max(0, r.totalQty - r.currentStock)}${r.unit}）` : '';
      return `${i + 1}. ${r.name}：共需 ${r.totalQty} ${r.unit} ${stockInfo}`;
    }),
    `------------------------`,
    `请村社合作社与源头工坊按此真实用度总量安排采收与生产！`
  ];
  navigator.clipboard.writeText(lines.join('\n')).then(() => alert('✅ 产销排产汇总单已复制，可直接发至产区合作社或工坊微信群！'));
};

window.exportPlanAggregateCSV = function () {
  const { aggregatedList } = buildAggregatedPlanItems();
  if (aggregatedList.length === 0) return alert('暂无可导出的排产汇总数据！');
  const headers = ['品名', '单位', '门店计划总需量', '当前在库库存', '需新增采收/排产缺口', '各门店明细拆解'];
  const rows = aggregatedList.map((r) => [
    r.name,
    r.unit,
    r.totalQty,
    r.currentStock !== null ? r.currentStock : '非在库品',
    r.currentStock !== null ? Math.max(0, r.totalQty - r.currentStock) : r.totalQty,
    r.stores.join('; ')
  ]);
  downloadCSV(`${currentAgent}_产销排产汇总单_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
};

window.openBatchPickListModal = function () {
  const toShipOrders = allOrders.filter(
    (o) => (o.order_status === 'confirmed' || o.order_status === 'over_credit_approved') && o.delivery_status !== 'delivered' && !isDirectoryLead(o)
  );
  document.getElementById('picklist-tenant-name').innerText = `${currentTenantData?.company_name || currentAgent} · 装车总拣货单`;
  document.getElementById('picklist-time-label').innerText = `生成时间：${new Date().toLocaleString()}`;
  document.getElementById('picklist-order-count').innerText = `${toShipOrders.length} 单待发`;

  const container = document.getElementById('picklist-items-container');
  if (toShipOrders.length === 0) {
    container.innerHTML = '<div class="py-8 text-center text-stone-400">当前暂无「已排单发运」的待送货品。</div>';
    window.openModal('modal-batch-picklist');
    return;
  }

  const itemSummaryMap = {};
  toShipOrders.forEach((o) => {
    (Array.isArray(o.items) ? o.items : []).forEach((it) => {
      const key = `${it.name}|${it.spec || '整装'}|${it.measure_unit || '件'}`;
      if (!itemSummaryMap[key]) itemSummaryMap[key] = { name: it.name, spec: it.spec || '整装', unit: it.measure_unit || '件', totalQty: 0, stores: [] };
      itemSummaryMap[key].totalQty += parseInt(it.qty || 0);
      itemSummaryMap[key].stores.push(`${o.store_name || '天街自提单'}(${it.qty})`);
    });
  });

  container.innerHTML = Object.values(itemSummaryMap)
    .map(
      (row, idx) => `
      <div class="py-2.5 flex justify-between items-start gap-2">
        <div>
          <div class="font-bold text-stone-900 text-xs">${idx + 1}. ${row.name} <span class="text-stone-400 font-normal">(${row.spec})</span></div>
          <div class="text-[10px] text-stone-500 mt-0.5">分门店明细：${row.stores.join('、')}</div>
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
  if (toShipOrders.length === 0) return alert('暂无待发货单据！');
  const map = {};
  toShipOrders.forEach((o) =>
    (Array.isArray(o.items) ? o.items : []).forEach((it) => {
      const k = `${it.name} (${it.spec || '整装'})`;
      map[k] = (map[k] || 0) + parseInt(it.qty || 0);
    })
  );
  const lines = [
    `【${currentTenantData?.company_name || currentAgent} 装车总拣货单】`,
    `时间：${new Date().toLocaleString()} | 共 ${toShipOrders.length} 家门店`,
    `------------------------`,
    ...Object.entries(map).map(([k, q], i) => `${i + 1}. ${k} × ${q}`),
    `------------------------`,
    `配送门店：${toShipOrders.map((o) => o.store_name || '天街自提单').join('、')}`
  ];
  navigator.clipboard.writeText(lines.join('\n')).then(() => alert('✅ 装车总拣货单已复制！'));
};

window.exportOrdersToCSV = function () {
  const validOrders = allOrders.filter((o) => !isDirectoryLead(o));
  if (validOrders.length === 0) return alert('当前暂无可导出的业务往来单据！');
  const execExport = () => {
    const headers = ['单据编号', '下单时间', '合作门店', '交割方式', '新配金额(元)', '调退抵扣(元)', '应结净额(元)', '单据状态', '履约交割状态', '货品明细', '备注'];
    const rows = validOrders.map((o) => [
      o.order_no || o.id,
      o.created_at ? new Date(o.created_at).toLocaleString() : '',
      o.store_name || '天街买家',
      o.settlement_type || '',
      parseFloat(o.total_amount || 0).toFixed(2),
      parseFloat(o.return_amount || 0).toFixed(2),
      parseFloat(o.net_settle_amount || o.total_amount || 0).toFixed(2),
      o.order_status || '',
      o.delivery_status === 'delivered' ? '已交割签收' : '待配送/处理中',
      (Array.isArray(o.items) ? o.items : []).map((i) => `${i.name}x${i.qty}`).join('; '),
      (o.note || '').replace(/[\r\n,]+/g, ' ')
    ]);
    downloadCSV(`${currentAgent}_往来对账单_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };
  if (globalPolicy.twoFaExportOn) {
    window.trigger2FAAction('导出全量业务往来核心账单 (CSV)，请输入验证器 6 位动态码授权：', execExport);
  } else {
    execExport();
  }
};

window.openPromoQrModal = function () {
  const promoUrl = `${window.location.origin}/suppliers.html?t=${encodeURIComponent(currentAgent)}`;
  document.getElementById('promo-qr-company').innerText = currentTenantData?.company_name || currentAgent;
  document.getElementById('promo-qr-code-text').innerText = `唯一商号代号：${currentAgent}`;
  document.getElementById('promo-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(promoUrl)}`;
  window.openModal('modal-promo-qr');
};

window.copyPromoLink = function () {
  const promoUrl = `${window.location.origin}/suppliers.html?t=${encodeURIComponent(currentAgent)}`;
  const shareText = `【${currentTenantData?.company_name || currentAgent}】源头合作社与匠心工坊直供，实名资质已核验，支持预约送货师傅上门送样、先验货后合作！点击预约：${promoUrl}`;
  navigator.clipboard.writeText(shareText).then(() => alert('✅ 专属合作文案与链接已复制！'));
};

window.openTotpSetupModal = async function () {
  const { data: tenant, error } = await HQService.fetchTenant(currentAgent);
  if (error) return alert('读取商号信息失败：' + error.message);

  let secret = (tenant?.totp_secret || '').trim();
  if (!secret) {
    secret = TOTP.generateRandomSecret();
    try {
      await HQService.updateTenantWithVerify(currentAgent, { totp_secret: secret, totp_enabled: true });
    } catch (upErr) {
      return alert('⚠️ 云端数据库写入秘钥被拦截：' + upErr.message);
    }
  }

  document.getElementById('totp-secret-display').innerText = secret;
  document.getElementById('totp-test-code').value = '';
  document.getElementById('totp-setup-qr').src = TOTP.buildQrImageUrl('SupplyChainHQ', currentAgent, secret);
  window.openModal('modal-totp-setup');
};

window.copyTotpSecret = function () {
  navigator.clipboard.writeText(document.getElementById('totp-secret-display').innerText).then(() => alert('TOTP 金钥已复制！'));
};

window.verifyAndSaveTotp = async function () {
  const code = document.getElementById('totp-test-code').value.trim();
  const secret = document.getElementById('totp-secret-display').innerText.trim();
  if (!code || code.length !== 6) return alert('请输入验证器中显示的 6 位动态口令！');

  const isValid = await TOTP.verifyTOTP(secret, code, 2);
  if (!isValid) {
    return alert('⚠️ 动态口令验证未通过！\n1. 请确认手机「自动设置时间」已开启；\n2. 若扫码异常，请点击「复制密钥」，在手机验证器选择「手动输入密钥」添加（时间基准）。');
  }

  try {
    await HQService.updateTenantWithVerify(currentAgent, { totp_secret: secret, totp_enabled: true });
    if (currentTenantData) {
      currentTenantData.totp_secret = secret;
      currentTenantData.totp_enabled = true;
    }
    updateTotpStatusBadge(true);
    alert('🎉 身份验证器已写入云端并绑定成功！');
    window.closeModal('modal-totp-setup');
  } catch (err) {
    alert('⚠️ 数据库写入被拦截：' + err.message);
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
  if (!oldKey || !newKey) return alert('请填全原密码与新密码！');
  if (newKey !== confirmKey) return alert('两次输入的新密码不一致！');
  if (!totpCode || totpCode.length !== 6) return alert('请输入手机验证器 6 位动态码！');

  const pwdCheck = AuthSecurity.validatePasswordStrength(newKey, currentAgent, '');
  if (!pwdCheck.ok) return alert('⚠️ 新密码强度提示：' + pwdCheck.msg);

  const { data: tenant } = await HQService.fetchTenant(currentAgent);
  if (!tenant) return;
  const isOldKeyMatch = await AuthSecurity.verifyPassword(oldKey, tenant.access_key, currentAgent);
  const isTokenMatch = tenant.reset_claim_token && oldKey.toUpperCase() === tenant.reset_claim_token.toUpperCase();
  if (!isOldKeyMatch && !isTokenMatch) return alert('⚠️ 原访问密钥不正确！');

  const isTotpValid = await TOTP.verifyTOTP(tenant.totp_secret || 'JBSWY3DPEHPK3PXP', totpCode, 2);
  if (!isTotpValid) return alert('⚠️ 验证器 6 位动态码错误！');

  const hashedNewKey = await AuthSecurity.hashPassword(newKey, currentAgent);

  try {
    await HQService.updateTenantWithVerify(currentAgent, { access_key: hashedNewKey, reset_claim_token: null });
    sessionStorage.setItem('hq_tenant_session_' + currentAgent, hashedNewKey);
    document.getElementById('hq-default-pwd-banner')?.classList.add('hidden');
    alert('🎉 新密钥已哈希加密写入云端并生效存盘！');
    window.closeModal('modal-change-password');
  } catch (err) {
    alert('⚠️ 修改密码写入云端被拦截：' + err.message);
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
  if (!code || code.length !== 6) return alert('⚠️ 请输入 6 位动态码！');
  const { data: tenant } = await HQService.fetchTenant(currentAgent);
  const isValid = await TOTP.verifyTOTP(tenant?.totp_secret || 'JBSWY3DPEHPK3PXP', code, 2);
  if (!isValid) return alert('⚠️ 动态口令验证失败！');
  window.close2FAModal();
  if (typeof pending2FACallback === 'function') pending2FACallback();
};

window.verifyHQAuthPwd = async function (e) {
  e.preventDefault();
  const tenantId = document.getElementById('hq-login-tenant').value.trim().toUpperCase();
  const rawKey = document.getElementById('hq-login-key').value.trim();
  const errBox = document.getElementById('hq-auth-error');
  const btn = document.getElementById('btn-hq-pwd');

  const lockInfo = AuthSecurity.checkLoginLockout(`HQ_${tenantId}`);
  if (lockInfo.locked) {
    errBox.innerText = `🛡️ 安全保护：该商号连续输错次数过多，请 ${lockInfo.remainMins} 分钟后再试。`;
    errBox.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.innerText = '核对中...';
  errBox.classList.add('hidden');

  if (rawKey.includes(':') || rawKey.includes('：')) {
    const [subAcc, subPwd] = rawKey.split(/[:：]/).map((s) => s.trim());
    const { data: tenantList } = await supabase.from('platform_tenant').select('*').eq('tenant_id', tenantId).eq('is_active', true).limit(1);
    if (!tenantList || tenantList.length === 0) {
      AuthSecurity.recordLoginFailure(`HQ_${tenantId}`);
      btn.disabled = false;
      btn.innerText = '核验密钥 · 登录调度台';
      errBox.innerText = '⚠️ 商号代号不存在或已暂歇！';
      errBox.classList.remove('hidden');
      return;
    }
    const { data: subList } = await supabase
      .from('tenant_sub_user')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('account_name', subAcc)
      .eq('is_active', true)
      .limit(1);

    let subValid = false;
    if (subList && subList.length > 0) {
      subValid = await AuthSecurity.verifyPassword(subPwd, subList[0].password_hash, tenantId);
    }

    if (!subValid) {
      const failRec = AuthSecurity.recordLoginFailure(`HQ_${tenantId}`);
      btn.disabled = false;
      btn.innerText = '核验密钥 · 登录调度台';
      errBox.innerText = `⚠️ 属员子账号或密码不正确（还可尝试 ${Math.max(0, 5 - failRec.count)} 次）！`;
      errBox.classList.remove('hidden');
      return;
    }

    AuthSecurity.clearLoginFailure(`HQ_${tenantId}`);
    currentAgent = tenantId;
    currentRoleCode = subList[0].role_code;
    currentAccountCode = subList[0].account_name;
    currentOperatorName = subList[0].real_name;
    sessionStorage.setItem('hq_tenant_session_' + tenantId, tenantList[0].access_key);
    sessionStorage.setItem('hq_active_authed_tenant', tenantId);
    sessionStorage.setItem('hq_sub_role_' + tenantId, currentRoleCode);
    sessionStorage.setItem('hq_sub_account_' + tenantId, currentAccountCode);
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
    .limit(1);

  let ownerMatched = false;
  if (!error && data && data.length > 0) {
    ownerMatched = await AuthSecurity.verifyPassword(rawKey, data[0].access_key, tenantId);
  }

  if (!ownerMatched) {
    const failRec = AuthSecurity.recordLoginFailure(`HQ_${tenantId}`);
    btn.disabled = false;
    btn.innerText = '核验密钥 · 登录调度台';
    errBox.innerText = `⚠️ 商号代号不存在或安家访问密钥不符（还可尝试 ${Math.max(0, 5 - failRec.count)} 次）！`;
    errBox.classList.remove('hidden');
    return;
  }
  if (!data[0].is_active) {
    btn.disabled = false;
    btn.innerText = '核验密钥 · 登录调度台';
    errBox.innerText = '🚫 该商号已被平台设案暂歇！';
    errBox.classList.remove('hidden');
    return;
  }

  AuthSecurity.clearLoginFailure(`HQ_${tenantId}`);
  sessionStorage.setItem('hq_tenant_session_' + tenantId, data[0].access_key);
  sessionStorage.setItem('hq_active_authed_tenant', tenantId);
  sessionStorage.removeItem('hq_sub_role_' + tenantId);
  sessionStorage.removeItem('hq_sub_account_' + tenantId);
  sessionStorage.removeItem('hq_sub_name_' + tenantId);
  currentAgent = tenantId;
  currentRoleCode = 'owner';
  currentAccountCode = '';
  currentOperatorName = '大当家主账号';
  document.getElementById('hq-auth-gate').classList.add('hidden');
  applyRoleViewExperience('owner', '大当家主账号');
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
    currentAccountCode = sessionStorage.getItem('hq_sub_account_' + currentAgent) || '';
    currentOperatorName = sessionStorage.getItem('hq_sub_name_' + currentAgent) || '大当家主账号';
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
  if (hqQrPollTimer) clearInterval(hqQrPollTimer);
  sessionStorage.removeItem('hq_tenant_session_' + currentAgent);
  sessionStorage.removeItem('hq_active_authed_tenant');
  document.getElementById('hq-auth-gate').classList.remove('hidden');
};

window.switchEntityType = function (type) {
  localStorage.setItem('hq_entity_type', type);
  const titles = {
    coop: '村社合作社 · 产区直供与城乡调度台',
    factory: '源头工坊 · 生产制造与按需直配台',
    service: '工料配套 · 专业服务与仓储对账台',
    dealer: '区域平准仓 · 集散调度与供需平衡台'
  };
  document.getElementById('hq-title').innerText = titles[type] || titles.dealer;
};

window.switchTab = function (tabName) {
  localStorage.setItem('hq_active_tab', tabName);
  ['advisor', 'products', 'stores', 'settle', 'perf'].forEach((t) => {
    document.getElementById(`tab-${t}`)?.classList.add('hidden');
    const btn = document.getElementById(`tab-btn-${t}`);
    if (btn) {
      btn.className = 'py-2.5 px-2 text-center rounded-xl text-stone-600 hover:text-emerald-950 hover:bg-stone-50 transition flex items-center justify-center gap-1';
    }
  });
  document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');
  const activeBtn = document.getElementById(`tab-btn-${tabName}`);
  if (activeBtn) {
    activeBtn.className = 'py-2.5 px-2 text-center rounded-xl bg-[#1b4332] text-white transition flex items-center justify-center gap-1 shadow-xs';
  }
  if (tabName === 'perf') {
    renderPerformanceAndCommissions();
  }
};

window.loadHQData = async function () {
  const { data: curTenant, error: tErr } = await HQService.fetchTenant(currentAgent);
  if (tErr || !curTenant || !curTenant.is_active) {
    window.logoutHQ();
    return;
  }

  currentTenantData = curTenant;
  document.getElementById('hq-company-badge').innerText = curTenant.company_name || curTenant.tenant_id;
  document.getElementById('hq-tenant-id').innerText = curTenant.tenant_id;
  loadGlobalPolicyFromTenant(curTenant);
  updateWebhookStatusBadge(curTenant.webhook_url || '');
  updateTotpStatusBadge(!!(curTenant.totp_enabled && curTenant.totp_secret));

  const guideEl = document.getElementById('hq-onboarding-guide');
  if (guideEl) {
    const isDismissed = localStorage.getItem('hq_onboarding_dismissed_' + currentAgent) === '1';
    guideEl.classList.toggle('hidden', isDismissed);
  }

  const defaultBanner = document.getElementById('hq-default-pwd-banner');
  if (currentRoleCode === 'owner' && curTenant.credit_code && curTenant.credit_code.length >= 6) {
    const last6 = curTenant.credit_code.slice(-6).toUpperCase();
    if ((curTenant.access_key || '').toUpperCase() === last6) defaultBanner?.classList.remove('hidden');
    else defaultBanner?.classList.add('hidden');
  }

  const [dashData, plansRes, poolRes] = await Promise.all([
    HQService.fetchFullDashboardData(currentAgent),
    supabase.from('demand_forecast_plan').select('*').eq('tenant_id', currentAgent).order('id', { ascending: false }).limit(40),
    supabase.from('local_inventory_pool').select('*').eq('tenant_id', currentAgent).order('id', { ascending: false }).limit(40)
  ]);

  allPlatformCats = dashData.categories;
  allProducts = dashData.products;
  allStores = dashData.stores;
  allOrders = dashData.orders;
  allC2BDemands = dashData.c2bDemands || [];
  allDemandPlans = plansRes.data || [];
  allLocalPoolItems = poolRes.data || [];
  allInventoryLogs = dashData.inventoryLogs;
  allSubUsers = dashData.subUsers;
  pendingCashLogsCache = dashData.pendingCashLogs || [];
  const logs = pendingCashLogsCache;

  populateCategoryDropdowns();
  renderProductFilterBar();
  renderProductTable();

  const draftCount = allProducts.filter((p) => p.status === 'draft').length;
  const draftBadge = document.getElementById('draft-prod-badge');
  if (draftBadge) {
    if (draftCount > 0 && !isWarehouseBlindPrice()) {
      draftBadge.classList.remove('hidden');
      draftBadge.innerText = `${draftCount}待定价`;
    } else {
      draftBadge.classList.add('hidden');
    }
  }

  const visibleStores = getVisibleStoresForCurrentRole();
  document.getElementById('stat-active-stores').innerText = `${visibleStores.length} 家`;
  const totalBaskets = visibleStores.reduce((sum, s) => sum + parseInt(s.carrier_hold_count || s.basket_count || 0), 0);
  document.getElementById('stat-baskets').innerText = `${totalBaskets} 件`;
  renderStoreFilterBar();
  renderStoreTable();

  const totalPendingCash = logs.reduce((sum, l) => sum + parseFloat(l.amount || 0), 0);
  document.getElementById('flow-money-pending').innerText = isWarehouseBlindPrice() ? '***' : `¥${totalPendingCash.toFixed(2)}`;
  renderDriverSettleList(logs);

  const leadsList = allOrders.filter((o) => isDirectoryLead(o) && o.order_status === 'pending_confirm');
  const normalPendingList = allOrders.filter((o) => o.order_status === 'pending_confirm' && !isDirectoryLead(o));
  const overCreditList = allOrders.filter((o) => o.order_status === 'over_credit_pending');
  const openDemandsList = allC2BDemands.filter((d) => !d.official_reply);
  const submittedPlansList = allDemandPlans.filter((p) => p.status === 'submitted');
  const activePoolList = allLocalPoolItems.filter((i) => i.status === 'open' || i.status === 'claimed');
  const pendingClaims = allInventoryLogs.filter((l) => l.action_type === 'qc_damage_claim' && !String(l.remark || '').includes('[已核准冲账]'));

  document.getElementById('count-pending-confirm').innerText = normalPendingList.length;
  document.getElementById('count-directory-leads').innerText = leadsList.length;
  document.getElementById('count-c2b-demands').innerText = openDemandsList.length;
  document.getElementById('stores-tab-lead-count').innerText = leadsList.length;
  document.getElementById('count-over-credit').innerText = overCreditList.length;

  const planCountEl = document.getElementById('count-demand-plans');
  if (planCountEl) planCountEl.innerText = submittedPlansList.length;
  const poolCountEl = document.getElementById('count-local-pool');
  if (poolCountEl) poolCountEl.innerText = activePoolList.length;

  const totalTodos =
    logs.length +
    normalPendingList.length +
    leadsList.length +
    overCreditList.length +
    openDemandsList.length +
    submittedPlansList.length +
    (isWarehouseBlindPrice() ? 0 : draftCount + pendingClaims.length);

  const badge = document.getElementById('unsettled-badge');
  const notifBadge = document.getElementById('hq-notif-badge');
  if (totalTodos > 0) {
    badge.classList.remove('hidden');
    badge.innerText = `${totalTodos}待办`;
    if (notifBadge) {
      notifBadge.classList.remove('hidden');
      notifBadge.innerText = totalTodos;
    }
  } else {
    badge.classList.add('hidden');
    notifBadge?.classList.add('hidden');
  }

  renderOrderFulfillmentList();
  renderInventoryLogs();
  renderSubUsersTable();
  renderThreeFlowsAndAIAdvisor();
  renderPerformanceAndCommissions();
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

window.onProductSearchInput = function (val) {
  activeProdSearch = (val || '').trim().toLowerCase();
  renderProductTable();
};

window.onProductSearchKeydown = function (e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const raw = (e.target.value || '').trim();
  if (!raw) return;
  const exactMatch = allProducts.find(
    (p) => (p.barcode && p.barcode.trim().toLowerCase() === raw.toLowerCase()) || p.name.toLowerCase() === raw.toLowerCase()
  );
  if (exactMatch) {
    window.openStockOpsModal(exactMatch.id);
  }
};

window.clearProductSearch = function () {
  activeProdSearch = '';
  onlyLowStockFilter = false;
  onlyDraftFilter = false;
  const input = document.getElementById('prod-search-input');
  if (input) input.value = '';
  const btnLow = document.getElementById('btn-low-stock-filter');
  if (btnLow) {
    btnLow.className = 'text-[11px] bg-white hover:bg-rose-50 text-stone-700 border border-stone-200 px-2.5 py-1.5 rounded-xl font-bold transition';
  }
  const btnDraft = document.getElementById('btn-draft-filter');
  if (btnDraft) {
    btnDraft.className = 'text-[11px] bg-white hover:bg-amber-50 text-stone-700 border border-stone-200 px-2.5 py-1.5 rounded-xl font-bold transition';
  }
  renderProductTable();
};

function renderProductFilterBar() {
  const bar = document.getElementById('product-tags-filter');
  if (!bar) return;
  const dynamicTags = new Set(['🔥 门店常备', '🌾 合作社直供', '🔄 余缺平价调剂', '💎 阳光工价·诚意价']);
  allProducts.forEach((p) => (Array.isArray(p.tags) ? p.tags : []).forEach((t) => dynamicTags.add(t)));
  const allTagList = ['全部', ...Array.from(dynamicTags)];
  bar.innerHTML =
    `<span class="text-stone-400 text-[11px] self-center mr-1">特色快筛:</span>` +
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
  const defaultMin = parseInt(globalPolicy.defaultMinStock ?? 10);
  let filtered = activeProdFilter === '全部' ? allProducts : allProducts.filter((p) => Array.isArray(p.tags) && p.tags.includes(activeProdFilter));
  if (onlyLowStockFilter) {
    filtered = filtered.filter((p) => parseInt(p.stock ?? 0) <= parseInt(p.custom_specs?.min_stock ?? defaultMin));
  }
  if (onlyDraftFilter) {
    filtered = filtered.filter((p) => p.status === 'draft');
  }
  if (activeProdSearch) {
    filtered = filtered.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(activeProdSearch) ||
        (p.barcode || '').toLowerCase().includes(activeProdSearch) ||
        (p.spec || '').toLowerCase().includes(activeProdSearch) ||
        JSON.stringify(p.custom_specs || {}).toLowerCase().includes(activeProdSearch)
    );
  }

  const blindPrice = isWarehouseBlindPrice();
  const readOnly = isAuditorReadOnly();

  document.getElementById('product-table-body').innerHTML =
    filtered.length === 0
      ? '<tr><td colspan="10" class="p-8 text-center text-stone-400">未找到匹配的货品记录</td></tr>'
      : filtered
          .map((p) => {
            const tags = Array.isArray(p.tags) ? p.tags : [];
            const tagBadges = tags.map((t) => `<span class="bg-emerald-50 text-emerald-900 border border-emerald-200 px-1.5 py-0.2 rounded text-[10px] mr-1">${t}</span>`).join('');
            const isBM = isBrickMortarAllowed(p);
            const isEC = isEcommerceAllowed(p);
            const isDraft = p.status === 'draft';
            const isRectify = p.status === 'rectify_required';
            const rectifyNote = p.custom_specs?.rectify_note || '';

            let channelBadges = '';
            if (isDraft) {
              channelBadges += '<span class="bg-amber-200 text-amber-950 text-[10px] px-1.5 py-0.5 rounded font-bold mr-1 animate-pulse">⏳ 待定价草稿</span>';
            } else if (isRectify) {
              channelBadges += `<span class="bg-amber-500 text-stone-950 text-[10px] px-1.5 py-0.5 rounded font-bold mr-1" title="${rectifyNote}">📜 待润色完善</span>`;
            } else {
              if (isBM) channelBadges += '<span class="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] px-1.5 py-0.5 rounded font-bold mr-1">🏬 实体店批发</span>';
              if (isEC) channelBadges += '<span class="bg-blue-100 text-blue-900 border border-blue-300 text-[10px] px-1.5 py-0.5 rounded font-bold">🌐 天街专柜</span>';
            }

            const customAttrs = p.custom_specs && typeof p.custom_specs === 'object' && p.custom_specs.attrs ? p.custom_specs.attrs : {};
            const attrBadges = Object.entries(customAttrs)
              .map(([k, v]) => `<span class="inline-block bg-stone-100 text-stone-700 border border-stone-200 px-1.5 py-0.2 rounded text-[10px] mr-1 mt-0.5">${k}: <b>${v}</b></span>`)
              .join('');

            const expDate = p.custom_specs?.expiry_date || '';
            const expBadge = expDate ? `<span class="block text-[10px] font-mono text-amber-800 mt-0.5">效期至: ${expDate}</span>` : '';

            const curStock = parseInt(p.stock ?? 0);
            const minLine = parseInt(p.custom_specs?.min_stock ?? defaultMin);
            const isLow = curStock <= minLine;

            const priceColsHtml = blindPrice
              ? ''
              : `
                <td class="p-2.5 font-mono font-bold text-emerald-800">
                  <span class="cursor-pointer hover:bg-emerald-50 px-1.5 py-0.5 rounded border border-transparent hover:border-emerald-200" onclick="window.quickEditPrice(${p.id}, ${p.tier_1_price})">¥${p.tier_1_price} ✏️</span>
                </td>
                <td class="p-2.5 font-mono text-amber-900 font-bold">¥${p.tier_2_price || p.tier_1_price}</td>
              `;

            const opsHtml = readOnly
              ? '<span class="text-stone-300 text-[10px]">受限只读</span>'
              : blindPrice
              ? `<button onclick="window.openEditProductModal(${p.id})" class="text-[11px] text-emerald-800 font-bold hover:underline">完善实物</button>`
              : `
                <button onclick="window.openEditProductModal(${p.id})" class="text-[11px] text-emerald-800 font-bold hover:underline">${isDraft ? '定价上架' : isRectify ? '润色重上' : '编辑'}</button>
                <button onclick="window.deleteProduct(${p.id}, '${p.name}')" class="text-[11px] text-rose-600 font-bold hover:underline">删除</button>
              `;

            return `
              <tr class="hover:bg-stone-50 transition ${isDraft ? 'bg-amber-50/30' : ''}">
                <td class="p-2.5">${p.image_url ? `<img src="${p.image_url}" class="w-10 h-10 rounded-xl object-cover border border-stone-200">` : `<div class="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[9px] text-stone-400">无图</div>`}</td>
                <td class="p-2.5 font-bold">${channelBadges || '<span class="text-stone-300 text-[10px]">未投放</span>'}</td>
                <td class="p-2.5 text-stone-600 font-sans whitespace-normal max-w-[200px]">
                  <div class="text-[11px]">${p.category_main || '常规'} ➔ ${p.category_sub || '通用'} ${p.category_tertiary ? `<b class="text-amber-800">(${p.category_tertiary})</b>` : ''}</div>
                  <div>${attrBadges}</div>
                </td>
                <td class="p-2.5 font-sans">
                  <b class="text-stone-900 block">${p.name}</b>
                  <button type="button" onclick="window.openTraceCardModal(${p.id})" class="font-mono text-[10px] text-emerald-800 hover:underline font-bold">
                    🌾 溯源卡 ${p.trace_code_prefix || 'QC-'}${p.id} ${p.barcode ? '· 码:' + p.barcode : ''}
                  </button>
                </td>
                <td class="p-2.5">${tagBadges || '-'}</td>
                <td class="p-2.5 font-mono">${p.spec || '整装'} / ${p.measure_unit || '件'}${expBadge}</td>
                ${priceColsHtml}
                <td class="p-2.5 font-mono">
                  <button onclick="window.openStockOpsModal(${p.id})" class="px-2.5 py-1 rounded-xl font-bold border transition active:scale-95 ${
              isLow ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse' : 'bg-emerald-50 text-emerald-950 border-emerald-200 hover:bg-emerald-100'
            }" title="点击开具 RK入库单 或 CK出库单">${curStock} ${p.measure_unit || '件'} ⚙️</button>
                </td>
                <td class="p-2.5 text-right space-x-1.5">${opsHtml}</td>
              </tr>
            `;
          })
          .join('');
}

function renderStoreFilterBar() {
  const bar = document.getElementById('store-tags-filter');
  if (!bar) return;
  const visibleStores = getVisibleStoresForCurrentRole();
  const dynamicTags = new Set(['#社区便民店', '#餐饮食堂', '#工程工料', '#村社自提点']);
  globalPolicy.storeTiers.forEach((t) => dynamicTags.add(`#${t.name}`));
  visibleStores.forEach((s) => (Array.isArray(s.tags) ? s.tags : []).forEach((t) => dynamicTags.add(t)));
  const list = ['全部', ...Array.from(dynamicTags)];
  bar.innerHTML =
    `<span class="text-stone-400 text-[11px] self-center mr-1">分级与圈子快筛:</span>` +
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
  const visibleStores = getVisibleStoresForCurrentRole();
  let filtered = activeStoreFilter === '全部' ? visibleStores : visibleStores.filter((s) => Array.isArray(s.tags) && s.tags.includes(activeStoreFilter));
  if (sortStoresDebtDesc) {
    filtered = [...filtered].sort((a, b) => parseFloat(b.current_debt || 0) - parseFloat(a.current_debt || 0));
  }

  const readOnly = isAuditorReadOnly();

  document.getElementById('store-list').innerHTML =
    filtered.length === 0
      ? '<div class="py-8 text-center text-stone-400">暂无归属您跟进的合作门店，点击右上角「+ 快速建档立户」即可添加。</div>'
      : filtered
          .map((s) => {
            const tags = Array.isArray(s.tags) ? s.tags : [];
            const tagBadges = tags.map((t) => `<span class="bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded text-[10px] mr-1 font-bold">${t}</span>`).join('');
            const pricing = s.custom_pricing && typeof s.custom_pricing === 'object' ? s.custom_pricing : {};
            const discountRate = parseFloat(pricing.discount_rate || 1);
            const customRuleCount = pricing.item_prices ? Object.keys(pricing.item_prices).length : 0;
            const extProfile = pricing.ext_profile && typeof pricing.ext_profile === 'object' ? pricing.ext_profile : {};
            const extBadges = Object.entries(extProfile)
              .map(([k, v]) => `<span class="bg-stone-100 text-stone-700 border border-stone-200 px-1.5 py-0.2 rounded text-[10px]">${k}: <b>${v}</b></span>`)
              .join(' ');
            const salesOwner = pricing.sales_owner || '全员公海';
            const creditScore = calcStoreCreditScore(s);

            return `
            <div class="py-3.5 flex flex-wrap justify-between items-center gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-bold text-stone-900 text-xs">${s.name}</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded font-mono bg-emerald-100 text-emerald-950 font-bold">🏅 信义分: ${creditScore}</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded font-mono bg-stone-100 text-stone-600 border border-stone-200">📱 ${s.phone}</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded font-medium ${
                    s.current_debt > s.credit_limit * 0.8 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }">在账: ¥${s.current_debt || 0} / 信用额度: ¥${s.credit_limit || 2000}</span>
                  <span class="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded font-mono font-bold">${carrierLabel}借用: ${
              s.carrier_hold_count || s.basket_count || 0
            } 件</span>
                  ${discountRate !== 1 && globalPolicy.storeTierEnabled !== false ? `<span class="text-[10px] bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.2 rounded font-bold">协议 ${(discountRate * 10).toFixed(1)} 折</span>` : ''}
                  ${customRuleCount > 0 ? `<span class="text-[10px] bg-purple-50 text-purple-800 border border-purple-200 px-1.5 py-0.2 rounded font-bold">${customRuleCount}款单品协议工价</span>` : ''}
                </div>
                <div class="text-[11px] text-stone-400 mt-1 flex flex-wrap gap-3 font-mono">
                  <span>分级/圈子: ${tagBadges || '<span class="text-stone-300">未归圈</span>'}</span>
                  <span>跟单业务员: <b class="text-stone-700">${salesOwner}</b></span>
                  <span>送货师傅: <b class="text-emerald-900">${s.driver_name || '张师傅'}</b></span>
                  <span>专供品道: <b class="text-amber-800">${s.visible_product_ids ? `${s.visible_product_ids.length} 种专享` : '全品类开放'}</b></span>
                </div>
                ${extBadges ? `<div class="mt-1 flex flex-wrap gap-1.5">${extBadges}</div>` : ''}
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                <button onclick="window.openStoreStatementModal(${s.id})" class="text-[11px] bg-emerald-800 hover:bg-emerald-900 text-white px-2.5 py-1 rounded-xl font-bold shadow-xs">🧾 账期对账</button>
                ${
                  readOnly
                    ? ''
                    : `
                  <button onclick="window.openSalesCollectModal(${s.id})" class="text-[11px] bg-amber-500 hover:bg-amber-600 text-stone-950 px-2.5 py-1 rounded-xl font-bold shadow-2xs">🤝 拜访催收</button>
                  <button onclick="window.editStoreTagsPrompt(${s.id})" class="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2.5 py-1 rounded-xl font-bold">🏷️ 贴圈子标签</button>
                  <button onclick="window.openStorePolicyModal(${s.id})" class="text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 px-2.5 py-1 rounded-xl font-bold">💎 协议与归属</button>
                  <button onclick="window.openVisibilityModal(${s.id})" class="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-xl font-bold">🎯 专供品道</button>
                  <button onclick="window.reassignDriverPrompt(${s.id})" class="text-[11px] bg-stone-50 text-stone-700 border border-stone-200 px-2.5 py-1 rounded-xl font-bold">🚚 指派师傅</button>
                `
                }
              </div>
            </div>
          `;
          })
          .join('');
}

window.editStoreTagsPrompt = async function (storeId) {
  const s = allStores.find((x) => Number(x.id) === Number(storeId));
  if (!s) return;
  const tags = Array.isArray(s.tags) ? s.tags : [];
  const newTagStr = prompt(`为【${s.name}】设定同业圈子标签（逗号隔开，如：#餐饮食堂, #社区便民店, #村社自提点）：`, tags.join(', '));
  if (newTagStr !== null) {
    const cleanTags = newTagStr
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : '#' + t));
    const { error } = await supabase.from('store').update({ tags: cleanTags }).eq('id', storeId);
    if (error) return alert('更新标签失败：' + error.message);
    window.loadHQData();
  }
};

window.openStorePolicyModal = function (storeId) {
  const s = allStores.find((x) => x.id === storeId);
  if (!s) return;

  const tierSelect = document.getElementById('policy-tier-preset-select');
  if (tierSelect) {
    tierSelect.innerHTML =
      '<option value="">-- 选择全局分级模板一键套用 --</option>' +
      globalPolicy.storeTiers
        .map(
          (t, idx) =>
            `<option value="${idx}">${t.name} (授信¥${t.creditLimit} · ${(t.discountRate * 10).toFixed(1)}折 · 免批退货¥${t.returnQuota})</option>`
        )
        .join('');
  }

  const pricing = s.custom_pricing && typeof s.custom_pricing === 'object' ? s.custom_pricing : {};
  const salesSelect = document.getElementById('policy-sales-owner-select');
  if (salesSelect) {
    const salesStaff = allSubUsers.filter((u) => u.role_code === 'sales' && u.is_active);
    salesSelect.innerHTML =
      '<option value="">🌐 全员公海门店 (所有业务员可见)</option>' +
      salesStaff.map((u) => `<option value="${u.account_name}" ${pricing.sales_owner === u.account_name ? 'selected' : ''}>🤝 ${u.real_name} (${u.account_name})</option>`).join('');
  }

  document.getElementById('policy-store-id').value = s.id;
  document.getElementById('policy-store-name').innerText = `${s.name} (联系人: ${s.contact || '掌柜'})`;
  document.getElementById('policy-credit-limit').value = s.credit_limit || 2000;
  document.getElementById('policy-return-quota').value = s.monthly_return_quota || 500;
  document.getElementById('policy-default-settlement').value = s.default_settlement || 'credit';
  document.getElementById('policy-workflow-select').value = s.settle_workflow || 'cash_on_delivery';
  document.getElementById('policy-custom-terms').value = s.custom_settlement_terms || '';

  document.getElementById('policy-price-tier').value = pricing.price_tier || 'tier_1';
  document.getElementById('policy-discount-rate').value = pricing.discount_rate || '1.00';

  const extBox = document.getElementById('policy-custom-store-fields-box');
  const extInputsEl = document.getElementById('policy-custom-store-fields-inputs');
  const customFields = Array.isArray(globalPolicy.storeCustomFields) ? globalPolicy.storeCustomFields : [];
  const existingExt = pricing.ext_profile && typeof pricing.ext_profile === 'object' ? pricing.ext_profile : {};
  if (extBox && extInputsEl) {
    if (customFields.length > 0) {
      extBox.classList.remove('hidden');
      extInputsEl.innerHTML = customFields
        .map(
          (fName) => `
          <div>
            <label class="block text-[10px] text-stone-600 mb-0.5">${fName}：</label>
            <input type="text" data-ext-key="${fName}" value="${existingExt[fName] || ''}" placeholder="输入${fName}..." class="policy-ext-field-input w-full bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 outline-none">
          </div>
        `
        )
        .join('');
    } else {
      extBox.classList.add('hidden');
      extInputsEl.innerHTML = '';
    }
  }

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

window.applyStoreTierPreset = function (idxStr) {
  if (idxStr === '') return;
  const tier = globalPolicy.storeTiers[parseInt(idxStr)];
  if (!tier) return;
  document.getElementById('policy-credit-limit').value = tier.creditLimit;
  document.getElementById('policy-discount-rate').value = tier.discountRate;
  document.getElementById('policy-return-quota').value = tier.returnQuota;
};

window.saveStorePolicySettings = async function () {
  const storeId = parseInt(document.getElementById('policy-store-id').value);
  const storeObj = allStores.find((x) => x.id === storeId);
  const prevPricing = storeObj?.custom_pricing && typeof storeObj.custom_pricing === 'object' ? storeObj.custom_pricing : {};
  const oldCreditLimit = parseFloat(storeObj?.credit_limit || 2000);

  const credit_limit = parseFloat(document.getElementById('policy-credit-limit').value) || 2000;
  const monthly_return_quota = parseFloat(document.getElementById('policy-return-quota').value) || 500;
  const default_settlement = document.getElementById('policy-default-settlement').value;
  const settle_workflow = document.getElementById('policy-workflow-select').value;
  const custom_settlement_terms = document.getElementById('policy-custom-terms').value.trim();
  const sales_owner = document.getElementById('policy-sales-owner-select')?.value || '';

  const price_tier = document.getElementById('policy-price-tier').value;
  const discount_rate = parseFloat(document.getElementById('policy-discount-rate').value) || 1.0;
  const item_prices = {};
  document.querySelectorAll('#custom-price-rules-box .custom-price-row').forEach((row) => {
    const pid = row.querySelector('.rule-prod-id')?.value;
    const sp = parseFloat(row.querySelector('.rule-price')?.value);
    if (pid && !isNaN(sp) && sp > 0) item_prices[pid] = sp;
  });

  const ext_profile = { ...(prevPricing.ext_profile || {}) };
  document.querySelectorAll('#policy-custom-store-fields-inputs .policy-ext-field-input').forEach((inp) => {
    const k = inp.dataset.extKey;
    const v = inp.value.trim();
    if (k) {
      if (v) ext_profile[k] = v;
      else delete ext_profile[k];
    }
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
    custom_pricing: { ...prevPricing, sales_owner, price_tier, discount_rate, item_prices, ext_profile }
  };

  const chosenTierIdx = document.getElementById('policy-tier-preset-select')?.value;
  if (chosenTierIdx !== '' && chosenTierIdx !== undefined) {
    const tierObj = globalPolicy.storeTiers[parseInt(chosenTierIdx)];
    if (tierObj && storeObj) {
      const tierTag = `#${tierObj.name}`;
      const existingTags = Array.isArray(storeObj.tags) ? storeObj.tags : [];
      if (!existingTags.includes(tierTag)) {
        updatePayload.tags = [...existingTags, tierTag];
      }
    }
  }

  const execSaveStore = async () => {
    let { error } = await supabase.from('store').update(updatePayload).eq('id', storeId);
    if (error && (error.message || '').includes('custom_pricing')) {
      delete updatePayload.custom_pricing;
      await supabase.from('store').update(updatePayload).eq('id', storeId);
    }

    alert('✅ 合作门店协议工价、归属业务员与信用策略已储存！');
    window.closeModal('store-policy-modal');
    window.loadHQData();
  };

  if (globalPolicy.twoFaLimitOn !== false && credit_limit > oldCreditLimit) {
    window.trigger2FAAction(`调高【${storeObj?.name}】信用周转额度（¥${oldCreditLimit} ➔ ¥${credit_limit}），请输入验证器 6 位动态码授权：`, execSaveStore);
  } else {
    await execSaveStore();
  }
};

window.openVisibilityModal = function (storeId) {
  const s = allStores.find((x) => Number(x.id) === Number(storeId));
  if (!s) return;
  currentStoreForVis = storeId;
  document.getElementById('vis-store-title').innerText = `${s.name} (专享通道与协议折算价)`;
  const selected = Array.isArray(s.visible_product_ids) ? s.visible_product_ids : [];

  document.getElementById('vis-checkbox-group').innerHTML = allProducts
    .filter((p) => p.status !== 'inactive' && p.status !== 'draft')
    .map((p) => {
      const { price, badge, note } = calcStoreEffectivePrice(s, p);
      return `
        <div class="py-2.5 px-1 flex justify-between items-center gap-2 hover:bg-stone-50">
          <label class="flex items-start gap-2 cursor-pointer flex-1 min-w-0">
            <input type="checkbox" value="${p.id}" ${selected.length === 0 || selected.includes(p.id) ? 'checked' : ''} class="vis-prod-checkbox mt-0.5 rounded text-emerald-800">
            <div class="min-w-0">
              <span class="font-bold text-stone-800 block truncate">${p.name}</span>
              <span class="text-[10px] text-stone-400 font-mono">批发基准 ¥${p.tier_1_price} · ${badge}</span>
              ${note ? `<span class="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 rounded inline-block mt-0.5">📝 ${note}</span>` : ''}
            </div>
          </label>
          <div class="flex items-center gap-1.5 shrink-0 font-mono">
            <b class="text-emerald-900 font-bold text-xs">¥${price.toFixed(2)}</b>
            <button type="button" onclick="window.editStoreProductPriceAndNote(${s.id}, ${p.id})" class="bg-stone-100 hover:bg-amber-100 text-stone-700 border border-stone-200 px-2 py-0.5 rounded-lg text-[10px] font-bold transition" title="微调该店该商品特约价与协议备注">
              ✏️ 改价/备注
            </button>
          </div>
        </div>
      `;
    })
    .join('');
  window.openModal('visibility-modal');
};

window.editStoreProductPriceAndNote = async function (storeId, prodId) {
  const s = allStores.find((x) => Number(x.id) === Number(storeId));
  const p = allProducts.find((x) => Number(x.id) === Number(prodId));
  if (!s || !p) return;

  const { price, note } = calcStoreEffectivePrice(s, p);
  const priceInput = prompt(`为【${s.name}】设定【${p.name}】专属协议工价（原批发基准 ¥${p.tier_1_price}，当前折算 ¥${price.toFixed(2)}，留空则恢复按分级策略自动折算）：`, price.toFixed(2));
  if (priceInput === null) return;

  const noteInput = prompt(`为【${s.name}】的【${p.name}】填写协议备注（如：满20件赠1件 / 专供特价，留空则无备注）：`, note);
  if (noteInput === null) return;

  const prevPricing = s.custom_pricing && typeof s.custom_pricing === 'object' ? s.custom_pricing : {};
  const item_prices = { ...(prevPricing.item_prices || {}) };
  const item_notes = { ...(prevPricing.item_notes || {}) };

  const cleanPrice = parseFloat(priceInput);
  if (!priceInput.trim() || isNaN(cleanPrice) || cleanPrice <= 0) {
    delete item_prices[String(prodId)];
  } else {
    item_prices[String(prodId)] = cleanPrice;
  }

  if (!noteInput.trim()) {
    delete item_notes[String(prodId)];
  } else {
    item_notes[String(prodId)] = noteInput.trim();
  }

  const nextPricing = { ...prevPricing, item_prices, item_notes };
  const { error } = await supabase.from('store').update({ custom_pricing: nextPricing }).eq('id', storeId);
  if (error) return alert('保存单品协议价失败：' + error.message);

  s.custom_pricing = nextPricing;
  window.openVisibilityModal(storeId);
  renderStoreTable();
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

function applyChannelPermissions(tenant, prod = null) {
  const bmChk = document.getElementById('chk-channel-bm');
  const ecChk = document.getElementById('chk-channel-ec');
  const bmLock = document.getElementById('lock-channel-bm');
  const ecLock = document.getElementById('lock-channel-ec');

  const permitBM = tenant?.permit_brick_and_mortar !== false && tenant?.service_mode !== '电子商务';
  const permitEC = tenant?.permit_ecommerce !== false && tenant?.service_mode !== '实体店';

  bmChk.disabled = !permitBM;
  bmLock.classList.toggle('hidden', permitBM);
  bmChk.checked = permitBM ? (prod ? isBrickMortarAllowed(prod) : true) : false;

  ecChk.disabled = !permitEC;
  ecLock.classList.toggle('hidden', permitEC);
  ecChk.checked = permitEC ? (prod ? isEcommerceAllowed(prod) : true) : false;
}

window.openAddProductModal = function () {
  document.getElementById('prod-modal-title').innerText = '📦 实名保真 · 发布新货品或服务';
  document.getElementById('editing-prod-id').value = '';
  uploadedImageBase64 = '';
  selectedTags = [];
  document.getElementById('image-preview-box').innerHTML = '无图';
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-barcode').value = '';
  document.getElementById('prod-price').value = '';
  document.getElementById('prod-price-tier2').value = '';
  document.getElementById('prod-stock').value = '100';
  document.getElementById('prod-min-stock').value = String(globalPolicy.defaultMinStock ?? 10);
  document.getElementById('prod-cat-tertiary').value = '';
  document.getElementById('prod-spec').value = '整装';
  document.getElementById('prod-measure-unit').value = '箱';
  document.getElementById('prod-trace-prefix').value = `${currentAgent}-QC-`;
  document.getElementById('prod-origin-place').value = '源头合作社/工坊原产';
  document.getElementById('prod-expiry-date').value = '';
  document.getElementById('prod-summary').value = '';
  document.getElementById('prod-remark').value = '';
  document.getElementById('custom-attrs-container').innerHTML = '';
  renderTagChips();
  applyChannelPermissions(currentTenantData, null);
  window.openModal('product-modal');
};

window.openEditProductModal = function (id) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return;
  document.getElementById('prod-modal-title').innerText = '✏️ 润饰货品细节与双渠道定价';
  document.getElementById('editing-prod-id').value = p.id;
  applyChannelPermissions(currentTenantData, p);

  document.getElementById('prod-cat-main').value = p.category_main || '';
  window.onMainCategoryChange(p.category_main || '');
  document.getElementById('prod-cat-sub').value = p.category_sub || '';
  document.getElementById('prod-cat-tertiary').value = p.category_tertiary || '';

  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-barcode').value = p.barcode || '';
  document.getElementById('prod-price').value = p.tier_1_price || '';
  document.getElementById('prod-price-tier2').value = p.tier_2_price || p.tier_1_price || '';
  document.getElementById('prod-stock').value = p.stock ?? 100;
  document.getElementById('prod-min-stock').value = p.custom_specs?.min_stock ?? (globalPolicy.defaultMinStock ?? 10);
  document.getElementById('prod-spec').value = p.spec || '整装';
  document.getElementById('prod-measure-unit').value = p.measure_unit || '箱';
  document.getElementById('prod-trace-prefix').value = p.trace_code_prefix || 'QC-';
  document.getElementById('prod-origin-place').value = p.origin_place || '源头合作社/工坊原产';
  document.getElementById('prod-expiry-date').value = p.custom_specs?.expiry_date || '';
  document.getElementById('prod-summary').value = p.custom_specs?.summary || p.description || '';
  document.getElementById('prod-remark').value = p.remark || '';

  const attrBox = document.getElementById('custom-attrs-container');
  attrBox.innerHTML = '';
  const attrs = p.custom_specs && p.custom_specs.attrs ? p.custom_specs.attrs : {};
  Object.entries(attrs).forEach(([k, v]) => window.addCustomAttrRow(k, v));

  uploadedImageBase64 = p.image_url || '';
  document.getElementById('image-preview-box').innerHTML = uploadedImageBase64 ? `<img src="${uploadedImageBase64}" class="w-full h-full object-cover">` : '无图';
  selectedTags = Array.isArray(p.tags) ? [...p.tags] : [];
  renderTagChips();
  window.openModal('product-modal');
};

window.closeAddProductModal = () => window.closeModal('product-modal');

function checkProductCompliance(name, summaryText, price, targetStatus) {
  const combinedText = `${name} ${summaryText}`;
  const hitWords = FORBIDDEN_WORDS.filter((w) => combinedText.includes(w));
  if (hitWords.length > 0) {
    return `⚠️ 温馨合规提示：货品名称或对外简介中包含广告法慎用词【${hitWords.join('、')}】，烦请稍作润色后再提交！`;
  }
  if (targetStatus === 'active') {
    if (isNaN(price) || price <= 0) {
      return `⚠️ 正式上架前请先设定有效的【${globalPolicy.tier1Name}】（若为仓管人员录入，请点「💾 暂存草稿」交由掌柜定价）。`;
    }
    if (!uploadedImageBase64) {
      return `⚠️ 正式上架需要上传清晰的「实拍照」以保障交易透明（可先点「💾 暂存草稿」，补拍照片后再正式上架）。`;
    }
  }
  return '';
}

window.submitProductForm = async function (targetStatus = 'active') {
  if (isUploadingImage) return alert('⏳ 实拍照正在上传图床，请稍候 1 秒！');
  const editId = document.getElementById('editing-prod-id').value;
  const isBM = document.getElementById('chk-channel-bm').checked;
  const isEC = document.getElementById('chk-channel-ec').checked;
  if (!isBM && !isEC) return alert('⚠️ 请至少勾选一个投放渠道！');

  const name = document.getElementById('prod-name').value.trim();
  const price = parseFloat(document.getElementById('prod-price').value);
  const summaryText = document.getElementById('prod-summary')?.value.trim() || '';

  if (!name) return alert('请写明货品或服务全称！');

  const complianceErr = checkProductCompliance(name, summaryText, price, targetStatus);
  if (complianceErr) return alert(complianceErr);

  const customAttrs = collectCustomAttrs();
  const minStock = parseInt(document.getElementById('prod-min-stock').value) || (globalPolicy.defaultMinStock ?? 10);
  const expiryDate = document.getElementById('prod-expiry-date')?.value || '';
  const channelLabel = isBM && !isEC ? '实体店' : !isBM && isEC ? '电子商务' : '实体与电商双轨';

  const safeTier1 = !isNaN(price) && price > 0 ? price : 0;
  const rawTier2 = parseFloat(document.getElementById('prod-price-tier2').value);
  const safeTier2 = !isNaN(rawTier2) && rawTier2 > 0 ? rawTier2 : safeTier1;

  const payload = {
    tenant_id: currentAgent,
    channel_brick_and_mortar: isBM,
    channel_ecommerce: isEC,
    sales_channel_type: channelLabel,
    category_main: document.getElementById('prod-cat-main').value,
    category_sub: document.getElementById('prod-cat-sub').value,
    category_tertiary: document.getElementById('prod-cat-tertiary').value.trim(),
    name,
    barcode: document.getElementById('prod-barcode').value.trim(),
    spec: document.getElementById('prod-spec').value.trim() || '整装',
    measure_unit: document.getElementById('prod-measure-unit').value.trim() || '箱',
    stock: parseInt(document.getElementById('prod-stock').value) || 0,
    tier_1_price: safeTier1,
    tier_2_price: safeTier2,
    trace_code_prefix: document.getElementById('prod-trace-prefix').value.trim() || 'QC-',
    origin_place: document.getElementById('prod-origin-place').value.trim() || '源头合作社/工坊原产',
    image_url: uploadedImageBase64,
    remark: document.getElementById('prod-remark').value.trim(),
    tags: selectedTags,
    custom_specs: { attrs: customAttrs, min_stock: minStock, expiry_date: expiryDate, summary: summaryText },
    status: targetStatus
  };

  let res = editId ? await supabase.from('product').update(payload).eq('id', parseInt(editId)) : await supabase.from('product').insert([payload]);

  if (res.error && (res.error.message || '').includes('custom_specs')) {
    delete payload.custom_specs;
    res = editId ? await supabase.from('product').update(payload).eq('id', parseInt(editId)) : await supabase.from('product').insert([payload]);
  }

  if (res.error) alert('储存失败: ' + res.error.message);
  else {
    alert(
      targetStatus === 'draft'
        ? `💾 货品【${name}】已暂存为「待定价草稿」，待完善定价与实拍照后即可正式上架！`
        : `🎉 合规核验通过！货品【${name}】已正式上架生效（投放渠道：${channelLabel}）！`
    );
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
    if (submitBtn) submitBtn.innerText = '⏳ 上传图床中...';

    uploadedImageBase64 = await uploadBlobToStorage(compressedBase64, currentAgent, 'products');

    isUploadingImage = false;
    if (submitBtn) submitBtn.innerText = '✅ 合规核验 · 正式上架发布';
    document.getElementById('image-preview-box').innerHTML = `<img src="${uploadedImageBase64}" class="w-full h-full object-cover">`;
  } catch (e) {
    isUploadingImage = false;
  }
};

window.clearProductImage = () => {
  uploadedImageBase64 = '';
  document.getElementById('image-preview-box').innerHTML = '无图';
};

window.toggleTag = function (tagStr) {
  selectedTags = selectedTags.includes(tagStr) ? selectedTags.filter((t) => t !== tagStr) : [...selectedTags, tagStr];
  renderTagChips();
};

window.promptAddTag = function () {
  const customTag = prompt('输入特色标签（如：🌾 合作社直供、🔄 余缺平价调剂、🤝 抱团集采惠）：');
  if (customTag && customTag.trim()) {
    const clean = customTag.trim();
    if (!selectedTags.includes(clean)) selectedTags.push(clean);
    renderTagChips();
  }
};

function renderTagChips() {
  const box = document.getElementById('quick-tags-box');
  const defaultChips = ['🌾 合作社直供', '🔥 门店常备', '🔄 余缺平价调剂', '💎 阳光工价·诚意价', '❄️ 需冷藏保鲜', '🤝 抱团集采惠'];
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
  if (isWarehouseBlindPrice() || isAuditorReadOnly()) return;
  const newPrice = prompt(`【调整${globalPolicy.tier1Name}】原价 ¥${oldPrice}，输入新价格：`, oldPrice);
  if (newPrice !== null && !isNaN(newPrice) && parseFloat(newPrice) > 0) {
    const p = parseFloat(newPrice);
    const maxDropPct = parseFloat(globalPolicy.twoFaPricePct ?? 15);
    const dropRatio = (oldPrice - p) / oldPrice;
    if (globalPolicy.twoFaPriceOn !== false && dropRatio > maxDropPct / 100) {
      window.trigger2FAAction(`底价调幅超 ${maxDropPct}% (从 ¥${oldPrice} 调至 ¥${p})，请输入验证器 6 位动态码授权：`, async () => {
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
  if (isWarehouseBlindPrice() || isAuditorReadOnly()) return;
  const execDelete = async () => {
    await supabase.from('product').delete().eq('id', id);
    window.loadHQData();
  };
  if (globalPolicy.twoFaDeleteOn !== false) {
    window.trigger2FAAction(`确认永久删除货品【${name}】？请输入手机验证器 6 位动态码：`, execDelete);
  } else {
    if (confirm(`确认永久删除货品【${name}】？`)) execDelete();
  }
};

window.updateDemandPlanStatus = async function (planId, nextStatus) {
  if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验。');
  const label = nextStatus === 'scheduled' ? '已纳入产区排产' : '已履约配发';
  const { error } = await supabase.from('demand_forecast_plan').update({ status: nextStatus }).eq('id', planId);
  if (error) return alert('更新用度计划状态失败：' + error.message);
  alert(`✅ 该份用度计划单已标记为【${label}】，合作门店端将同步收到回执！`);
  window.loadHQData();
};

window.convertPlanToPushOrder = function (planId) {
  if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验。');
  const plan = allDemandPlans.find((p) => p.id === planId);
  if (!plan) return;
  if (allStores.length === 0) return alert('当前名册下暂无合作门店，请先在「合作门店」中立户！');

  window.openPushOrderModal();

  const storeSelect = document.getElementById('push-store-select');
  const matchedStore = allStores.find((s) => Number(s.id) === Number(plan.store_id) || s.name === plan.store_name);
  if (storeSelect && matchedStore) {
    storeSelect.value = matchedStore.id;
    window.onPushStoreChange(matchedStore.id);
  }

  const noteInput = document.getElementById('push-note-input');
  if (noteInput) {
    noteInput.value = `按【${plan.plan_cycle}】用度计划排产配发${plan.note ? '（' + plan.note + '）' : ''}`;
  }

  const planItems = Array.isArray(plan.items) ? plan.items : [];
  const unmatched = [];
  planItems.forEach((it) => {
    const prod = allProducts.find((p) => p.name === it.name || p.name.includes(it.name));
    if (prod) {
      const qtyInput = document.getElementById(`push-qty-${prod.id}`);
      if (qtyInput) qtyInput.value = parseInt(it.qty || 0);
    } else {
      unmatched.push(`${it.name}x${it.qty}${it.unit || '件'}`);
    }
  });

  if (unmatched.length > 0) {
    alert(`已为您自动匹配门店并回填在架货品数量！\n以下计划品项暂未上架标准货品，请核对或先发布良品：\n• ${unmatched.join('\n• ')}`);
  }
};

window.completeLocalPoolItem = async function (poolId) {
  if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验。');
  if (!confirm('确认该笔同城余缺调剂货物已由送货师傅顺路交割并完成平账？')) return;
  const { error } = await supabase
    .from('local_inventory_pool')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', poolId);
  if (error) return alert('更新互调状态失败：' + error.message);
  alert('✅ 同城余缺互调单已标记交割平账！');
  window.loadHQData();
};

function parseDemandPayload(rawContent) {
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && parsed.title) return parsed;
  } catch (e) {}
  return {
    title: rawContent,
    qty: '若干',
    budget: '面议',
    delivery: '灵活协商',
    coBuyers: 1
  };
}

window.replyToC2BDemand = async function (demandId, demandTitle) {
  if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验。');
  const quote = prompt(
    `【百工天街求购回应】针对「${demandTitle}」，请输入您的平准直供工价、起订量与交付时间（需求方将立即在手机端收到）：`,
    '合作社直供工价 ¥62/件，满20件包配送至合作门店自提，3天内安排发车！'
  );
  if (!quote || !quote.trim()) return;
  const senderLabel = `${currentTenantData?.company_name || currentAgent}（${currentOperatorName}）`;
  const { error } = await HQService.replyC2BDemand(demandId, `【${senderLabel}】${quote.trim()}`);
  if (error) alert('回应提交失败：' + error.message);
  else {
    alert('🎉 直供回应已发送至百工天街！对方确认锁定后系统将第一时间通知您排产备货。');
    window.loadHQData();
  }
};

function renderOrderFulfillmentList() {
  const container = document.getElementById('order-fulfillment-list');
  if (!container) return;

  const blindPrice = isWarehouseBlindPrice();
  const readOnly = isAuditorReadOnly();

  if (activeOrderFilter === 'demand_plans') {
    if (allDemandPlans.length === 0) {
      container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">暂无合作门店提报的真实用度计划单。</div>';
      return;
    }
    container.innerHTML = allDemandPlans
      .map((p) => {
        const items = Array.isArray(p.items) ? p.items : [];
        const itemsHtml = items
          .map((it) => `<span class="inline-block bg-white border border-emerald-200 text-stone-800 px-2 py-0.5 rounded-lg mr-1.5 mb-1 font-bold">${it.name} × <b class="text-emerald-800 font-mono">${it.qty}${it.unit || '件'}</b></span>`)
          .join('');
        const isSubmitted = p.status === 'submitted';
        const isScheduled = p.status === 'scheduled';
        return `
          <div class="p-4 bg-emerald-50/50 border border-emerald-200 rounded-3xl space-y-2.5">
            <div class="flex justify-between items-start gap-2">
              <div>
                <span class="bg-[#1b4332] text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-lg mr-1.5">📅 真实用度计划单</span>
                <b class="text-sm text-stone-900">${p.store_name}</b>
                <span class="text-[11px] text-emerald-900 font-bold ml-2">· ${p.plan_cycle}</span>
              </div>
              <span class="text-[10px] px-2.5 py-0.5 rounded-full font-bold shrink-0 ${
                isSubmitted ? 'bg-amber-200 text-amber-950 animate-pulse' : isScheduled ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-700'
              }">
                ${isSubmitted ? '⏳ 待纳入排产' : isScheduled ? '✅ 已纳入产区排产' : '📦 已履约配发'}
              </span>
            </div>
            <div class="bg-stone-50 p-2.5 rounded-2xl border border-emerald-200/70">
              <div class="text-[10px] text-stone-400 mb-1">预估真实用度明细（期望到店日期：<b class="text-stone-800 font-mono">${p.expected_date || '近期'}</b>）：</div>
              <div>${itemsHtml || '无明细'}</div>
            </div>
            ${p.note ? `<div class="text-[11px] text-stone-600">💬 门店叮咛：${p.note}</div>` : ''}
            <div class="flex flex-wrap justify-between items-center gap-2 pt-1 border-t border-emerald-200/50 text-[11px]">
              <span class="text-stone-400 font-mono">提报时间：${new Date(p.created_at).toLocaleString()}</span>
              <div class="flex flex-wrap gap-1.5">
                ${
                  readOnly
                    ? ''
                    : `
                  <button onclick="window.convertPlanToPushOrder(${p.id})" class="bg-white hover:bg-stone-50 text-emerald-950 border border-emerald-300 px-3 py-1.5 rounded-xl font-bold shadow-xs active:scale-95 transition">📦 一键转为配货单</button>
                  ${
                    isSubmitted
                      ? `<button onclick="window.updateDemandPlanStatus(${p.id}, 'scheduled')" class="bg-[#1b4332] hover:bg-[#143628] text-white px-3.5 py-1.5 rounded-xl font-bold shadow active:scale-95 transition">✅ 纳入产区采收/排产</button>`
                      : isScheduled
                      ? `<button onclick="window.updateDemandPlanStatus(${p.id}, 'fulfilled')" class="bg-amber-400 hover:bg-amber-300 text-stone-950 px-3.5 py-1.5 rounded-xl font-bold shadow active:scale-95 transition">✓ 标记已按计划配发</button>`
                      : '<span class="text-stone-400 font-bold self-center">已完成履约闭环</span>'
                  }
                `
                }
              </div>
            </div>
          </div>
        `;
      })
      .join('');
    return;
  }

  if (activeOrderFilter === 'local_pool') {
    if (allLocalPoolItems.length === 0) {
      container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">当前暂无合作门店挂出的同城余缺互调记录。</div>';
      return;
    }
    container.innerHTML = allLocalPoolItems
      .map((item) => {
        const isOpen = item.status === 'open';
        const isClaimed = item.status === 'claimed';
        const isCompleted = item.status === 'completed';
        const totalVal = (parseFloat(item.transfer_price || 0) * parseInt(item.qty || 1)).toFixed(2);
        return `
          <div class="p-4 bg-cyan-50/40 border border-cyan-200 rounded-3xl space-y-2.5">
            <div class="flex justify-between items-start gap-2">
              <div>
                <span class="bg-cyan-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg mr-1.5">🔄 同城余缺互调</span>
                <b class="text-sm text-stone-900">${item.product_name}</b>
                <span class="text-[11px] font-mono text-stone-500 ml-1">(${item.spec || '整装'} × ${item.qty}${item.measure_unit || '件'})</span>
              </div>
              <span class="text-[10px] px-2.5 py-0.5 rounded-full font-bold shrink-0 ${
                isOpen ? 'bg-emerald-100 text-emerald-900' : isClaimed ? 'bg-amber-200 text-amber-950 animate-pulse' : isCompleted ? 'bg-stone-200 text-stone-700' : 'bg-rose-100 text-rose-700'
              }">
                ${isOpen ? '🟢 挂池待认领' : isClaimed ? '🚚 已认领待顺路捎带' : isCompleted ? '✅ 已交割平账' : '已撤回'}
              </span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2 bg-white p-2.5 rounded-2xl border border-cyan-100 text-[11px]">
              <div>调出门店：<b>${item.from_store_name}</b></div>
              <div>调入门店：<b class="text-emerald-900">${item.to_store_name || '等待同行认领'}</b></div>
              <div class="font-mono">调剂让利总值：<b class="text-rose-700">${blindPrice ? '***' : `¥${totalVal}`}</b></div>
            </div>
            ${item.reason ? `<div class="text-[11px] text-stone-600">💬 调剂缘由：${item.reason}</div>` : ''}
            <div class="flex justify-between items-center pt-1 border-t border-cyan-200/50 text-[11px]">
              <span class="text-stone-400 font-mono">挂池时间：${new Date(item.created_at).toLocaleString()}</span>
              ${
                isClaimed && !readOnly
                  ? `<button onclick="window.completeLocalPoolItem(${item.id})" class="bg-[#1b4332] hover:bg-[#143628] text-white px-3.5 py-1.5 rounded-xl font-bold shadow active:scale-95 transition">✅ 确认已顺路交割平账</button>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');
    return;
  }

  if (activeOrderFilter === 'c2b_demands') {
    if (allC2BDemands.length === 0) {
      container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">暂无天街求购或定制用度需求帖。</div>';
      return;
    }
    container.innerHTML = allC2BDemands
      .map((d) => {
        const info = parseDemandPayload(d.content);
        const hasReplied = !!d.official_reply;
        return `
          <div class="p-4 bg-amber-50/60 border border-amber-300 rounded-3xl space-y-2.5">
            <div class="flex justify-between items-start gap-2">
              <div>
                <span class="bg-amber-500 text-stone-950 text-[10px] font-bold px-2 py-0.5 rounded-lg mr-1.5">📢 天街求购榜</span>
                <b class="text-sm text-stone-900">${info.title}</b>
                <span class="text-[10px] bg-stone-200 text-stone-700 px-1.5 py-0.5 rounded-full font-bold ml-1">🔥 ${info.coBuyers || 1} 人抱团凑单</span>
              </div>
              <span class="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                info.acceptedByBuyer ? 'bg-emerald-600 text-white' : hasReplied ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200 text-amber-950'
              }">
                ${info.acceptedByBuyer ? '🤝 需求方已锁定意向' : hasReplied ? '✅ 已回应待确认' : '⏳ 待源头直供回应'}
              </span>
            </div>
            <div class="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-2xl border border-amber-200/80 text-[11px] font-mono">
              <div>需求数量: <b>${info.qty}</b></div>
              <div>期望工价: <b class="text-emerald-900">${blindPrice ? '***' : info.budget}</b></div>
              <div>交付要求: <b class="font-sans">${info.delivery}</b></div>
            </div>
            ${info.note ? `<div class="text-[11px] text-stone-600">💬 定制规格细节：${info.note}</div>` : ''}
            ${
              hasReplied
                ? `<div class="bg-emerald-50 border border-emerald-200 p-2.5 rounded-2xl text-[11px] text-emerald-950"><b>已发直供回应：</b>${d.official_reply}</div>`
                : ''
            }
            <div class="flex justify-between items-center pt-1 text-[11px]">
              <span class="text-stone-400">发起人：${d.proposer_name || '天街买家'} · ${new Date(d.created_at).toLocaleDateString()}</span>
              ${
                readOnly || blindPrice
                  ? ''
                  : `<button onclick="window.replyToC2BDemand(${d.id}, '${info.title.replace(/'/g, '')}')" class="bg-[#1b4332] hover:bg-[#143628] text-white px-4 py-1.5 rounded-xl font-bold shadow active:scale-95 transition">
                      ${hasReplied ? '✏️ 修改回应' : '💰 填报工价直供'}
                    </button>`
              }
            </div>
          </div>
        `;
      })
      .join('');
    return;
  }

  let filtered = allOrders;
  if (activeOrderFilter === 'pending_confirm') filtered = allOrders.filter((o) => (o.order_status === 'pending_confirm' || o.order_status === 'counter_proposal') && !isDirectoryLead(o));
  else if (activeOrderFilter === 'directory_leads') filtered = allOrders.filter((o) => isDirectoryLead(o));
  else if (activeOrderFilter === 'over_credit_pending') filtered = allOrders.filter((o) => o.order_status === 'over_credit_pending');
  else if (activeOrderFilter === 'confirmed') filtered = allOrders.filter((o) => o.order_status === 'confirmed' && o.delivery_status !== 'delivered');
  else if (activeOrderFilter === 'delivered') filtered = allOrders.filter((o) => o.delivery_status === 'delivered');

  if (filtered.length === 0) {
    container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">当前分类下暂无单据。</div>';
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
                <span class="bg-amber-500 text-stone-950 text-[10px] font-bold px-2 py-0.5 rounded-lg mr-1.5">🤝 供需名录合作意向</span>
                <b class="text-sm text-stone-900">${o.store_name}</b>
                <span class="text-[10px] font-mono bg-stone-200 text-stone-700 px-1.5 rounded ml-1">#${o.order_no || o.id}</span>
              </div>
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${isConverted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200 text-amber-950 animate-pulse'}">
                ${isConverted ? '✓ 已立户建档' : '待联系送样'}
              </span>
            </div>
            <div class="bg-white p-3 rounded-2xl border border-amber-200/80 text-xs text-stone-700 leading-relaxed">${o.note || '意向门店申请上门送样洽谈'}</div>
            <div class="flex justify-between items-center pt-1 text-xs">
              <span class="text-[10px] text-stone-400 font-mono">提交时间: ${o.created_at ? new Date(o.created_at).toLocaleString() : '刚刚'}</span>
              ${
                isConverted
                  ? '<span class="text-emerald-800 font-bold text-xs">已录入合作门店名册</span>'
                  : readOnly
                  ? ''
                  : `<button onclick="window.convertLeadToStore(${o.id})" class="bg-[#1b4332] hover:bg-[#143628] text-white px-4 py-1.5 rounded-xl font-bold shadow active:scale-95 transition">🏪 一键立户转为合作门店</button>`
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
      const canRestockReturn = isDelivered && returnItems.length > 0 && !String(o.note || '').includes('[退货已质检入账]');

      const step1Cls = 'bg-emerald-700 text-white';
      const step2Cls = !isPending && !isOverCredit ? 'bg-emerald-700 text-white' : 'bg-stone-200 text-stone-500';
      const step3Cls = isDelivered ? 'bg-emerald-700 text-white' : 'bg-stone-200 text-stone-500';

      return `
        <div class="p-4 bg-stone-50 border ${isOverCredit ? 'border-rose-400 bg-rose-50/30' : isPending ? 'border-amber-300' : 'border-stone-200'} rounded-3xl space-y-2.5">
          <div class="flex justify-between items-start">
            <div>
              <b class="text-sm text-stone-900">${o.store_name || '百工天街直供单'}</b>
              <span class="text-[10px] font-mono bg-stone-200 text-stone-700 px-1.5 rounded ml-1">#${o.order_no || o.id}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ml-1 ${
                isDelivered ? 'bg-emerald-100 text-emerald-800' : isOverCredit ? 'bg-rose-600 text-white' : isPending ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'
              }">
                ${isDelivered ? '已核销交割' : isOverCredit ? '🚨 授信超额待特批' : isPending ? '待确认接单' : '已排单发运'}
              </span>
            </div>
            <span class="font-bold text-xs bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-lg">${o.settlement_type}</span>
          </div>

          <div class="flex items-center gap-1.5 text-[10px] font-bold">
            <span class="px-2 py-0.5 rounded-full ${step1Cls}">① 已提交制单</span>
            <span class="text-stone-300">➔</span>
            <span class="px-2 py-0.5 rounded-full ${step2Cls}">② 接单扣库装车</span>
            <span class="text-stone-300">➔</span>
            <span class="px-2 py-0.5 rounded-full ${step3Cls}">③ 送达签收平账</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-2 bg-white p-2.5 rounded-2xl border border-stone-100 text-[11px]">
            <div>新配: ${orderItems.map((i) => `${i.name}x${i.qty}`).join('、') || '无'}</div>
            <div class="text-rose-700">退验: ${returnItems.map((i) => `${i.name}x${i.qty}`).join('、') || '无'}</div>
            <div class="text-amber-800">对调: ${exchangeItems.map((i) => `${i.name}x${i.qty}`).join('、') || '无'}</div>
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
          <div class="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-stone-200/60 text-xs">
            <span class="font-mono text-stone-800 font-bold">净结: ${blindPrice ? '***' : `¥${netTotal.toFixed(2)}`}</span>
            <div class="flex flex-wrap items-center gap-2">
              ${
                canRestockReturn && !readOnly
                  ? `<button onclick="window.restockReturnedItems(${o.id})" class="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 px-3 py-1.5 rounded-xl font-bold shadow-xs transition">📥 退货质检回库</button>`
                  : ''
              }
              <button onclick="window.openSingleDeliverySlipPrint(${o.id})" class="bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 px-3 py-1.5 rounded-xl font-bold shadow-xs transition">
                🖨️ 打印交割单
              </button>
              ${
                readOnly
                  ? ''
                  : isOverCredit && !blindPrice
                  ? `
                <button onclick="window.hqRejectOverCredit(${o.id})" class="bg-rose-50 text-rose-700 px-3 py-1.5 rounded-xl border border-rose-200 font-bold">拒绝赊销</button>
                <button onclick="window.hqApproveOverCredit(${o.id}, ${o.store_id}, ${o.over_credit_amount || 0})" class="bg-emerald-800 text-white px-4 py-1.5 rounded-xl font-bold shadow">🛡️ 特信放行</button>
              `
                  : isPending
                  ? `
                <button onclick="window.hqRejectWithProposal(${o.id})" class="bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-xl font-bold">建议微调</button>
                <button onclick="window.hqApproveOrder(${o.id})" class="bg-[#1b4332] text-white px-4 py-1.5 rounded-xl font-bold shadow">✅ 应允接单并扣库</button>
              `
                  : `<span class="text-stone-400 font-mono text-[11px]">${o.driver_action_instruction || '正常办理'}</span>`
              }
            </div>
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
  const contactName = parts[0] || '掌柜';
  const phone = parts[1] || '';
  const address = parts[2] || '';
  const storeName = leadOrder.store_name || '新合作门店';
  const defaultTier = globalPolicy.storeTiers[globalPolicy.storeTiers.length - 1] || { name: '新合作门店', creditLimit: 2000, returnQuota: 500, discountRate: 1.0 };

  if (!confirm(`确认将意向门店【${storeName}】（${contactName} ${phone}）建档立户？\n将自动套用分级【${defaultTier.name}】（授信 ¥${defaultTier.creditLimit}）。`)) return;

  const { error: storeErr } = await supabase.from('store').insert([
    {
      tenant_id: currentAgent,
      name: storeName,
      contact: contactName,
      phone,
      address,
      tags: [`#${defaultTier.name}`],
      credit_limit: defaultTier.creditLimit,
      monthly_return_quota: defaultTier.returnQuota,
      current_debt: 0,
      driver_name: '张师傅',
      custom_pricing: { discount_rate: defaultTier.discountRate }
    }
  ]);
  if (storeErr) return alert('建档立户失败：' + storeErr.message);

  await supabase.from('store_order').update({ order_status: 'lead_converted', delivery_status: 'delivered', driver_action_instruction: '【已转为正式合作门店】' }).eq('id', orderId);
  alert(`🎉 门店【${storeName}】已建档立户！`);
  window.loadHQData();
  window.switchTab('stores');
};

window.hqApproveOverCredit = function (orderId, storeId, overAmount) {
  const execApprove = async () => {
    await supabase.from('store_order').update({ order_status: 'over_credit_approved', driver_action_instruction: '【主管已特批】允许记账交割' }).eq('id', orderId);
    window.loadHQData();
  };
  if (globalPolicy.twoFaCreditOn !== false) {
    window.trigger2FAAction(`特批放行【超额周转 ¥${overAmount}】单据，请输入验证器 6 位动态口令：`, execApprove);
  } else {
    if (confirm(`确认特批放行【超额周转 ¥${overAmount}】单据？`)) execApprove();
  }
};

window.hqRejectOverCredit = async function (orderId) {
  const reason = prompt('输入拒绝记账指令：', '超额授信，请当场收现！');
  if (!reason) return;
  await supabase.from('store_order').update({ order_status: 'over_credit_rejected', driver_action_instruction: `【拒绝记账】${reason}` }).eq('id', orderId);
  window.loadHQData();
};

window.hqApproveOrder = async function (orderId) {
  const order = allOrders.find((o) => o.id === orderId);
  let driverCmd = `【发运指令】配发货品 ${order?.items?.length || 0}项；`;
  if (order?.settlement_type === 'cash') driverCmd += `当面点收现款；`;
  else driverCmd += `按${order?.settlement_type}签收！`;

  await supabase.from('store_order').update({ order_status: 'confirmed', driver_action_instruction: driverCmd }).eq('id', orderId);
  if (order?.items) {
    await HQService.deductStockForItems(currentAgent, allProducts, order.items, order.order_no || order.id, currentOperatorName);
  }
  alert('✅ 已确认接单并自动扣减对应库存，已汇入「本车装车总拣货单」！');
  window.loadHQData();
};

window.hqRejectWithProposal = async function (orderId) {
  const feedback = prompt('输入给门店掌柜的修润建议：');
  if (!feedback || !feedback.trim()) return;
  await supabase.from('store_order').update({ order_status: 'counter_proposal', vendor_feedback: feedback.trim() }).eq('id', orderId);
  window.loadHQData();
};

function renderDriverSettleList(logs) {
  const readOnly = isAuditorReadOnly();
  document.getElementById('driver-settle-list').innerHTML =
    logs.length === 0
      ? '<div class="p-6 text-center text-stone-400 text-xs">随车师傅与业务员交回的款项已全部清点入库，无待交钱款。</div>'
      : logs
          .map((l) => {
            const isSalesCollect = l.collect_type === 'sales_visit_collect';
            return `
              <div class="p-3 bg-stone-50 border ${isSalesCollect ? 'border-amber-300 bg-amber-50/30' : 'border-stone-200'} rounded-2xl flex justify-between items-center">
                <div>
                  <div class="flex items-center gap-1.5 font-bold text-stone-800">
                    <span class="px-1.5 py-0.2 rounded text-[10px] ${isSalesCollect ? 'bg-amber-200 text-amber-950' : 'bg-emerald-100 text-emerald-900'}">
                      ${isSalesCollect ? '🤝 业务催收' : '🚚 随车收款'}
                    </span>
                    <span>经手: ${l.driver_name}</span>
                    <span class="text-[10px] bg-stone-200 text-stone-700 px-1.5 py-0.2 rounded font-mono">${l.pay_method}</span>
                    <span class="text-xs text-stone-600">从【${l.store_name}】收回</span>
                  </div>
                  <div class="text-[10px] text-stone-400 mt-0.5 font-mono">登记时间: ${new Date(l.created_at).toLocaleString()}</div>
                </div>
                <div class="text-right">
                  <b class="text-base font-mono text-emerald-900 font-bold block">¥${l.amount}</b>
                  ${
                    readOnly || currentRoleCode === 'sales'
                      ? '<span class="text-[10px] text-amber-700 font-bold">待财务核验销账</span>'
                      : `<button onclick="window.confirmLogSettled(${l.id}, ${l.amount}, ${l.store_id || 0}, '${l.collect_type || ''}')" class="text-[10px] bg-[#1b4332] text-white font-bold px-2.5 py-1 rounded-lg active:scale-95 shadow">财务点清入库${
                          isSalesCollect ? '并冲减欠款' : ''
                        }</button>`
                  }
                </div>
              </div>
            `;
          })
          .join('');
}

window.confirmLogSettled = function (logId, amount, storeId = 0, collectType = '') {
  const amt = parseFloat(amount || 0);
  const threshold = parseFloat(globalPolicy.twoFaThreshold ?? 3000);
  const execSettle = async () => {
    await supabase.from('driver_collection_log').update({ settled_to_hq: true }).eq('id', logId);
    if (collectType === 'sales_visit_collect' && storeId) {
      const store = allStores.find((s) => Number(s.id) === Number(storeId));
      if (store) {
        const nextDebt = Math.max(0, Number((parseFloat(store.current_debt || 0) - amt).toFixed(2)));
        await supabase.from('store').update({ current_debt: nextDebt }).eq('id', store.id);
      }
    }
    alert('✅ 财务已点验入库并完成账目核销！');
    window.loadHQData();
  };

  if (globalPolicy.twoFaCashOn !== false && amt >= threshold) {
    window.trigger2FAAction(`大额资金平账 ¥${amt.toFixed(2)}（已达全局风控门槛 ¥${threshold}），请输入验证器 6 位动态码授权：`, execSettle);
  } else {
    if (!confirm('确认已点清该笔回款/收款入库？')) return;
    execSettle();
  }
};

function calcStoreRebateBonus(b2bTotal) {
  if (globalPolicy.rebateEnabled === false) return { bonus: 0, rate: 0 };
  const tiers = Array.isArray(globalPolicy.rebateTiers) ? [...globalPolicy.rebateTiers] : [];
  tiers.sort((a, b) => b.threshold - a.threshold);
  const matched = tiers.find((t) => b2bTotal >= parseFloat(t.threshold || 0));
  if (!matched) return { bonus: 0, rate: 0 };
  const rate = parseFloat(matched.rate || 0);
  return { bonus: Number(((b2bTotal * rate) / 100).toFixed(2)), rate };
}

function renderPerformanceAndCommissions() {
  const staffTbody = document.getElementById('staff-perf-tbody');
  if (staffTbody) {
    const staffMap = {};
    const ensurePerson = (name, roleLabel) => {
      const key = name || '大当家主账号';
      if (!staffMap[key]) {
        staffMap[key] = { name: key, role: roleLabel, stockOpsCount: 0, deliveryCount: 0, collectedAmt: 0, carrierReturned: 0 };
      }
      return staffMap[key];
    };

    ensurePerson('大当家主账号', '大当家主账号');
    allSubUsers.forEach((u) => {
      ensurePerson(u.real_name, `${u.phone && u.phone.includes('|') ? u.phone.split('|')[1] : u.role_code} (${u.account_name})`);
    });

    allInventoryLogs.forEach((l) => {
      const rec = ensurePerson(l.operator_name || '仓管', '仓储/操作员');
      rec.stockOpsCount += 1;
    });

    allOrders
      .filter((o) => o.delivery_status === 'delivered' && !isDirectoryLead(o))
      .forEach((o) => {
        const rec = ensurePerson(o.driver_name || '送货师傅', '送货师傅');
        rec.deliveryCount += 1;
        rec.collectedAmt += parseFloat(o.net_settle_amount || o.total_amount || 0);
      });

    staffTbody.innerHTML = Object.values(staffMap)
      .map(
        (st) => `
        <tr class="hover:bg-stone-50 transition">
          <td class="p-2.5 font-bold text-stone-900">${st.name}</td>
          <td class="p-2.5 text-stone-600">${st.role}</td>
          <td class="p-2.5 font-mono font-bold text-emerald-900">${st.stockOpsCount} 笔</td>
          <td class="p-2.5 font-mono font-bold text-indigo-800">${st.deliveryCount} 单</td>
          <td class="p-2.5 font-mono font-bold text-stone-900">¥${st.collectedAmt.toFixed(2)}</td>
          <td class="p-2.5 font-mono text-amber-800">${st.carrierReturned} 件</td>
        </tr>
      `
      )
      .join('');
  }

  const commListEl = document.getElementById('external-commission-list');
  if (commListEl) {
    const promoterEnabled = globalPolicy.promoterEnabled !== false;
    const promoterRate = parseFloat(globalPolicy.promoterRate ?? 8.0);

    if (allStores.length === 0) {
      commListEl.innerHTML = '<div class="py-6 text-center text-stone-400">暂无在册合作门店数据。</div>';
      return;
    }

    commListEl.innerHTML = allStores
      .map((s) => {
        const b2bOrders = allOrders.filter(
          (o) => Number(o.store_id) === Number(s.id) && o.order_source !== 'online_mall' && !isDirectoryLead(o) && o.order_status !== 'cancelled'
        );
        const b2bTotal = b2bOrders.reduce((sum, o) => sum + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);
        const { bonus: rebateBonus, rate: matchedRebateRate } = calcStoreRebateBonus(b2bTotal);

        const mallOrders = allOrders.filter(
          (o) =>
            o.order_source === 'online_mall' &&
            (Number(o.store_id) === Number(s.id) || String(o.note || '').includes(`[专属门店ID: ${s.id}]`))
        );
        const mallTotal = mallOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
        const promoterCommission = promoterEnabled ? Number(((mallTotal * promoterRate) / 100).toFixed(2)) : 0;

        return `
          <div class="py-3 flex flex-wrap justify-between items-center gap-3">
            <div>
              <b class="text-stone-900 text-xs">${s.name}</b>
              <div class="text-[11px] text-stone-500 mt-0.5 font-mono">
                累计实体批发额: <b>¥${b2bTotal.toFixed(2)}</b> · 天街带货额: <b>¥${mallTotal.toFixed(2)}</b> (${mallOrders.length}单)
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span class="px-2.5 py-1 rounded-xl border ${
                rebateBonus > 0 ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold' : 'bg-stone-50 text-stone-400 border-stone-200'
              }">
                ${globalPolicy.rebateEnabled !== false ? `阶梯返利(${matchedRebateRate}%): ¥${rebateBonus.toFixed(2)}` : '进货返利已停用'}
              </span>
              <span class="px-2.5 py-1 rounded-xl ${
                promoterEnabled ? 'bg-amber-50 text-amber-950 border border-amber-300 font-bold' : 'bg-stone-50 text-stone-400 border border-stone-200'
              }">
                ${promoterEnabled ? `天街推客润利(${promoterRate}%): ¥${promoterCommission.toFixed(2)}` : '推客润利已停用'}
              </span>
            </div>
          </div>
        `;
      })
      .join('');
  }
}

window.exportPerformanceCSV = function () {
  const execExport = () => {
    const promoterRate = parseFloat(globalPolicy.promoterRate ?? 8.0);
    const headers = ['合作门店', '累计批发进货额(元)', '阶梯进货返利(元)', '天街带货额(元)', '推客服务润利(元)', '合计应结奖励(元)'];
    const rows = allStores.map((s) => {
      const b2bTotal = allOrders
        .filter((o) => Number(o.store_id) === Number(s.id) && o.order_source !== 'online_mall' && !isDirectoryLead(o) && o.order_status !== 'cancelled')
        .reduce((sum, o) => sum + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);
      const { bonus: rebateBonus } = calcStoreRebateBonus(b2bTotal);
      const mallTotal = allOrders
        .filter((o) => o.order_source === 'online_mall' && (Number(o.store_id) === Number(s.id) || String(o.note || '').includes(`[专属门店ID: ${s.id}]`)))
        .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
      const promoterCommission = globalPolicy.promoterEnabled !== false ? (mallTotal * promoterRate) / 100 : 0;
      return [s.name, b2bTotal.toFixed(2), rebateBonus.toFixed(2), mallTotal.toFixed(2), promoterCommission.toFixed(2), (rebateBonus + promoterCommission).toFixed(2)];
    });
    downloadCSV(`${currentAgent}_门店返利与推客分润核算表_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };
  if (globalPolicy.twoFaExportOn) {
    window.trigger2FAAction('导出绩效与推客分润核算表 (CSV)，请输入验证器 6 位动态码授权：', execExport);
  } else {
    execExport();
  }
};

window.onSubRoleTemplateChange = function (roleCode) {
  const presetTitles = {
    sales: '业务员 / 客户经理',
    warehouse: '仓储调度员',
    finance: '账房财务',
    driver: '送货师傅',
    producer: '产区采收 / 车间班组长',
    qc_service: '售后定损 / 质检员',
    auditor: '独立稽核员'
  };
  const presetPerms = {
    sales: ['perm_sales_visit'],
    warehouse: ['perm_stock'],
    finance: ['perm_finance_settle'],
    driver: ['perm_deliver'],
    producer: ['perm_stock'],
    qc_service: ['perm_deliver'],
    auditor: ['perm_audit_readonly']
  };
  const titleEl = document.getElementById('sub-custom-title-input');
  if (titleEl) titleEl.value = presetTitles[roleCode] || roleCode;
  const perms = presetPerms[roleCode] || [];
  document.querySelectorAll('.sub-perm-cb').forEach((cb) => {
    cb.checked = perms.includes(cb.value);
  });
};

function renderSubUsersTable() {
  const defaultRoles = {
    finance: '账房财务 (管账审单 · 不过手现金 · 不改策略)',
    warehouse: '仓储调度 (出入库盘点发货 · 物理盲价)',
    sales: '业务员/客户经理 (拜访跟进 · 催收留痕交财务核销)',
    driver: '送货师傅 (随车收款签收 · 不管总账)',
    producer: '产区采收/班组长 (预入库与排产 · 物理盲价)',
    qc_service: '售后定损/质检 (上门验损定责 · 签发DS定损单)',
    auditor: '独立稽核 (全盘只读审计 · 零改动权限)'
  };
  document.getElementById('subuser-table-body').innerHTML = allSubUsers
    .map((u) => {
      const phoneParts = String(u.phone || '').split('|');
      const purePhone = phoneParts[0] || '-';
      const customTitle = phoneParts[1] || defaultRoles[u.role_code] || u.role_code;
      return `
        <tr class="hover:bg-stone-50 transition">
          <td class="p-2.5 font-bold font-mono">${u.account_name}</td>
          <td class="p-2.5 font-bold">${u.real_name}</td>
          <td class="p-2.5 font-medium text-emerald-950">${customTitle}</td>
          <td class="p-2.5 font-mono text-stone-500">${purePhone}</td>
          <td class="p-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${u.is_active ? '在册当值' : '停用'}</span></td>
          <td class="p-2.5 text-right"><button onclick="window.toggleSubUserActive(${u.id}, ${u.is_active})" class="text-[11px] font-bold text-stone-600 hover:underline">${u.is_active ? '停职' : '复职'}</button></td>
        </tr>
      `;
    })
    .join('');
}

window.openAddSubUserModal = () => {
  document.getElementById('sub-account-input').value = '';
  document.getElementById('sub-name-input').value = '';
  document.getElementById('sub-phone-input').value = '';
  window.onSubRoleTemplateChange('sales');
  window.openModal('modal-add-subuser');
};

window.saveSubUser = async function () {
  const account_name = document.getElementById('sub-account-input').value.trim();
  const real_name = document.getElementById('sub-name-input').value.trim();
  const role_code = document.getElementById('sub-role-select').value;
  const customTitle = document.getElementById('sub-custom-title-input').value.trim() || role_code;
  const pwd = document.getElementById('sub-pwd-input').value.trim();
  const phone = document.getElementById('sub-phone-input').value.trim();

  if (!account_name || !real_name || !pwd) return alert('请填全账号、姓名与密码！');

  const checkedPerms = Array.from(document.querySelectorAll('.sub-perm-cb:checked')).map((el) => el.value);
  if (checkedPerms.length === 0) return alert('请至少勾选一项岗位权限！');

  if (checkedPerms.includes('perm_stock') && checkedPerms.includes('perm_finance_settle')) {
    return alert('🚨 四权分立内控拦截：\n「仓库实物出入库制单」与「财务核账回款销账」属于互斥不相容岗位，严禁同一人兼任！');
  }
  if (checkedPerms.includes('perm_audit_readonly') && checkedPerms.length > 1) {
    return alert('🚨 四权分立内控拦截：\n「独立稽核」属于第三方监督岗位，不可同时兼任业务操作权限！');
  }

  const storedPhoneAndTitle = `${phone}|${customTitle}`;
  const hashedSubPwd = await AuthSecurity.hashPassword(pwd, currentAgent);
  const { error } = await supabase
    .from('tenant_sub_user')
    .insert([{ tenant_id: currentAgent, account_name, real_name, role_code, password_hash: hashedSubPwd, phone: storedPhoneAndTitle, is_active: true }]);
  if (error) alert('授任失败: ' + error.message);
  else {
    alert(`🎉 已授任【${real_name}】（${customTitle}），电脑端与掌中宝均可使用 ${account_name}:${pwd} 登录（密码已哈希加密保护）！`);
    window.closeModal('modal-add-subuser');
    window.loadHQData();
  }
};

window.toggleSubUserActive = async function (id, curState) {
  await supabase.from('tenant_sub_user').update({ is_active: !curState }).eq('id', id);
  window.loadHQData();
};

window.reassignDriverPrompt = async function (storeId) {
  const s = allStores.find((x) => Number(x.id) === Number(storeId));
  const currentDriver = s?.driver_name || '送货师傅';
  const newDriver = prompt(`当前送货师傅为【${currentDriver}】，输入新师傅姓名：`, '张师傅');
  if (newDriver && newDriver.trim()) {
    await supabase.from('store').update({ driver_name: newDriver.trim() }).eq('id', storeId);
    window.loadHQData();
  }
};

window.registerNewStore = async function () {
  const shopName = prompt('输入合作门店全称：');
  if (!shopName || !shopName.trim()) return;
  const phone = prompt('输入联系人 11 位手机号：');
  if (!phone || phone.trim().length < 11) return alert('请输入有效 11 位手机号！');

  const defaultTier = globalPolicy.storeTiers[globalPolicy.storeTiers.length - 1] || { name: '普通门店', creditLimit: 2000, returnQuota: 500, discountRate: 1.0 };
  await supabase.from('store').insert([
    {
      tenant_id: currentAgent,
      name: shopName.trim(),
      contact: '掌柜',
      phone: phone.trim(),
      tags: [`#${defaultTier.name}`],
      credit_limit: defaultTier.creditLimit,
      monthly_return_quota: defaultTier.returnQuota,
      current_debt: 0,
      driver_name: '张师傅',
      custom_pricing: { discount_rate: defaultTier.discountRate, sales_owner: currentRoleCode === 'sales' ? currentAccountCode : '' }
    }
  ]);
  window.loadHQData();
};

window.openPushOrderModal = function () {
  const visibleStores = getVisibleStoresForCurrentRole();
  const storeSelect = document.getElementById('push-store-select');
  storeSelect.innerHTML = visibleStores.map((s) => `<option value="${s.id}">${s.name} (信用余 ¥${(s.credit_limit || 2000) - (s.current_debt || 0)})</option>`).join('');
  if (visibleStores.length > 0) window.onPushStoreChange(visibleStores[0].id);
  window.openModal('push-modal');
};

window.onPushStoreChange = function (storeId) {
  const s = allStores.find((x) => x.id === parseInt(storeId));
  if (s) {
    document.getElementById('push-driver-name').value = s.driver_name || '张师傅';
    if (s.default_settlement) document.getElementById('push-settlement-select').value = s.default_settlement;
  }
  const prodBox = document.getElementById('push-products-list');
  if (prodBox) {
    prodBox.innerHTML = allProducts
      .filter((p) => p.status !== 'inactive' && p.status !== 'draft')
      .map((p) => {
        const { price } = calcStoreEffectivePrice(s, p);
        const priceLabel = isWarehouseBlindPrice() ? `${p.measure_unit || '件'}` : `¥${price.toFixed(2)}/${p.measure_unit || '件'}`;
        return `
          <div class="flex justify-between items-center py-1 border-b border-stone-50">
            <span class="text-stone-700">${p.name} (${priceLabel} · 存${p.stock ?? 0})</span>
            <input type="number" min="0" value="0" id="push-qty-${p.id}" class="w-16 bg-stone-50 border border-stone-200 rounded px-1.5 py-0.5 text-center font-bold font-mono">
          </div>
        `;
      })
      .join('');
  }
};

window.submitVendorPushOrder = async function () {
  const storeId = parseInt(document.getElementById('push-store-select').value);
  const store = allStores.find((s) => s.id === storeId);
  const settlement = document.getElementById('push-settlement-select').value;
  const driver = document.getElementById('push-driver-name').value.trim() || '张师傅';
  const note = document.getElementById('push-note-input').value.trim();

  const items = [];
  let totalAmount = 0;
  for (const p of allProducts) {
    const qty = parseInt(document.getElementById(`push-qty-${p.id}`)?.value || '0');
    if (qty > 0) {
      const { price } = calcStoreEffectivePrice(store, p);
      items.push({ id: p.id, name: p.name, spec: p.spec, measure_unit: p.measure_unit, price, qty });
      totalAmount += price * qty;
    }
  }
  if (items.length === 0) return alert('请至少挑选 1 样货品！');

  const orderNo = generateUnifiedVoucherNo('CK');
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
      note: `[主动铺底配发] ${note}`,
      driver_action_instruction: `【主动配货】核验交付 ${items.length}项`
    }
  ]);
  if (error) alert('配发失败: ' + error.message);
  else {
    await HQService.deductStockForItems(currentAgent, allProducts, items, orderNo, currentOperatorName);
    alert(`✅ 统一出库配货单 (${orderNo}) 已生成并自动扣库！`);
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
  sortStoresDebtDesc = false;
  activeStoreFilter = tag;
  renderStoreFilterBar();
  renderStoreTable();
};

window.filterOrderStatus = function (status) {
  activeOrderFilter = status;
  ['pending', 'demand-plans', 'local-pool', 'c2b-demands', 'leads', 'over-credit', 'confirmed', 'delivered', 'all'].forEach((k) => {
    const btn = document.getElementById(`order-filter-${k}`);
    if (btn) {
      const isMatch =
        k === status ||
        (status === 'pending_confirm' && k === 'pending') ||
        (status === 'demand_plans' && k === 'demand-plans') ||
        (status === 'local_pool' && k === 'local-pool') ||
        (status === 'c2b_demands' && k === 'c2b-demands') ||
        (status === 'directory_leads' && k === 'leads') ||
        (status === 'over_credit_pending' && k === 'over-credit');
      btn.className = isMatch ? 'px-3 py-1.5 rounded-xl bg-[#1b4332] text-white font-bold transition' : 'px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 hover:bg-stone-200 font-bold transition';
    }
  });
  renderOrderFulfillmentList();
};

window.triggerBarcodeScan = async function () {
  const code = prompt('请用扫码枪扫入或键入商品/物料条码：');
  if (code && code.trim()) document.getElementById('prod-barcode').value = code.trim();
};
window.stopBarcodeScan = () => window.closeModal('scanner-modal');

window.previewFullImage = function (url) {
  const w = window.open('');
  w.document.write(`<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${url}" style="max-width:90%;max-height:90%;border-radius:16px;"></body>`);
};

// =========================================================================
// 电脑端手机扫码免密登录 + 自助找回 + 紧急挂失 + 农忙休息 + 全量账本备份
// =========================================================================
window.switchHQLoginMode = function (mode) {
  const pwdForm = document.getElementById('pane-login-pwd');
  const qrPane = document.getElementById('pane-login-qr');
  const tabPwd = document.getElementById('hq-login-tab-pwd');
  const tabQr = document.getElementById('hq-login-tab-qr');

  if (mode === 'qr') {
    pwdForm?.classList.add('hidden');
    qrPane?.classList.remove('hidden');
    if (tabQr) tabQr.className = 'py-2 rounded-xl bg-[#1b4332] text-white shadow transition';
    if (tabPwd) tabPwd.className = 'py-2 rounded-xl text-stone-600 hover:text-stone-900 transition';
    window.initHQScanQrSession();
  } else {
    if (hqQrPollTimer) clearInterval(hqQrPollTimer);
    qrPane?.classList.add('hidden');
    pwdForm?.classList.remove('hidden');
    if (tabPwd) tabPwd.className = 'py-2 rounded-xl bg-[#1b4332] text-white shadow transition';
    if (tabQr) tabQr.className = 'py-2 rounded-xl text-stone-600 hover:text-stone-900 transition';
  }
};

window.initHQScanQrSession = async function () {
  if (hqQrPollTimer) clearInterval(hqQrPollTimer);
  document.getElementById('hq-scan-qr-expired')?.classList.add('hidden');

  const sessionToken = 'SCAN-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  document.getElementById('hq-scan-token-text').innerText = sessionToken;
  document.getElementById('hq-scan-status-text').innerText = '等待手机扫码授权...';

  const qrTargetUrl = `${window.location.origin}/driver.html?qr_token=${encodeURIComponent(sessionToken)}`;
  document.getElementById('hq-scan-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrTargetUrl)}`;

  try {
    await supabase.from('login_qr_session').insert([{ session_token: sessionToken, status: 'waiting' }]);
  } catch (e) {}

  let elapsedSec = 0;
  hqQrPollTimer = setInterval(async () => {
    elapsedSec += 2;
    if (elapsedSec >= 90) {
      clearInterval(hqQrPollTimer);
      document.getElementById('hq-scan-qr-expired')?.classList.remove('hidden');
      document.getElementById('hq-scan-status-text').innerText = '二维码已过期';
      return;
    }

    const { data } = await supabase
      .from('login_qr_session')
      .select('*')
      .eq('session_token', sessionToken)
      .eq('status', 'approved')
      .limit(1);

    if (data && data.length > 0 && data[0].tenant_id) {
      clearInterval(hqQrPollTimer);
      const approvedTid = data[0].tenant_id;
      const { data: tenantRows } = await supabase
        .from('platform_tenant')
        .select('*')
        .eq('tenant_id', approvedTid)
        .eq('is_active', true)
        .limit(1);

      if (tenantRows && tenantRows.length > 0) {
        sessionStorage.setItem('hq_tenant_session_' + approvedTid, tenantRows[0].access_key);
        sessionStorage.setItem('hq_active_authed_tenant', approvedTid);
        sessionStorage.removeItem('hq_sub_role_' + approvedTid);
        sessionStorage.removeItem('hq_sub_account_' + approvedTid);
        sessionStorage.removeItem('hq_sub_name_' + approvedTid);

        currentAgent = approvedTid;
        currentRoleCode = 'owner';
        currentAccountCode = '';
        currentOperatorName = data[0].operator_name || '大当家主账号';

        document.getElementById('hq-auth-gate')?.classList.add('hidden');
        applyRoleViewExperience('owner', currentOperatorName);
        window.loadHQData();
      }
    }
  }, 2000);
};

window.submitSelfRecoverPassword = async function () {
  const phone = document.getElementById('rec-phone').value.trim();
  const creditCode = document.getElementById('rec-credit-code').value.trim().toUpperCase();
  const totpCode = document.getElementById('rec-totp-code').value.trim();
  const newPwd = document.getElementById('rec-new-pwd').value.trim();

  if (phone.length !== 11 || creditCode.length !== 18) {
    return alert('请完整填写 11 位登记手机号与 18 位信用代码/身份证全号！');
  }
  if (totpCode.length !== 6) {
    return alert('请输入手机验证器 6 位动态码（若手机一并丢失，请使用「紧急挂失冻结」并联系平台总控核发重置信码）。');
  }

  const { data: rows } = await supabase.from('platform_tenant').select('*').eq('credit_code', creditCode).limit(1);
  if (!rows || rows.length === 0) return alert('⚠️ 未找到该 18 位信用代码/身份证号对应的入驻档案。');

  const tenant = rows[0];
  if (tenant.phone !== phone && tenant.backup_phone !== phone) {
    return alert('⚠️ 输入的手机号码与登记的主联络手机或备用紧急手机号不符！');
  }

  const pwdCheck = AuthSecurity.validatePasswordStrength(newPwd, tenant.tenant_id, phone);
  if (!pwdCheck.ok) return alert('⚠️ 新密码强度提示：' + pwdCheck.msg);

  const isTotpOk = await TOTP.verifyTOTP(tenant.totp_secret || 'JBSWY3DPEHPK3PXP', totpCode, 2);
  if (!isTotpOk) return alert('⚠️ 手机验证器 6 位动态码验证未通过！');

  const hashedNew = await AuthSecurity.hashPassword(newPwd, tenant.tenant_id);
  await HQService.updateTenantWithVerify(tenant.tenant_id, { access_key: hashedNew, reset_claim_token: null });

  alert(`🎉 核身找回成功！您的商号代号为【${tenant.tenant_id}】，新密码已加密生效！`);
  window.closeModal('modal-self-recover-pwd');
  document.getElementById('hq-login-tenant').value = tenant.tenant_id;
};

window.submitEmergencyFreezeAccount = async function () {
  const creditCode = document.getElementById('frz-credit-code').value.trim().toUpperCase();
  const personName = document.getElementById('frz-person-name').value.trim();
  if (creditCode.length !== 18 || !personName) return alert('请完整填写 18 位证件全号与登记时的负责人真实姓名！');

  const { data: rows } = await supabase.from('platform_tenant').select('*').eq('credit_code', creditCode).limit(1);
  if (!rows || rows.length === 0) return alert('未找到该证件号对应的在册商号档案。');

  const tenant = rows[0];
  const recordedPerson = (tenant.contact_person || tenant.contact_name || '').trim();
  if (recordedPerson && !recordedPerson.includes(personName) && !personName.includes(recordedPerson)) {
    return alert('⚠️ 负责人姓名与立户登记档案不符，无法执行挂失冻结！');
  }

  await supabase.from('platform_tenant').update({ membership_status: 'restricted' }).eq('tenant_id', tenant.tenant_id);
  alert(`🛡️ 已对商号【${tenant.company_name} (${tenant.tenant_id})】启动【护盘冻结保护】！请凭实体公章申明书联系平台总控核发重置信码。`);
  window.closeModal('modal-emergency-freeze');
};

window.openSeasonalPauseModal = function () {
  const sp = globalPolicy.seasonalPause || { isPaused: false, reason: '产区农忙采收集中加工中', resumeDate: '' };
  document.getElementById('sp-is-paused').checked = !!sp.isPaused;
  document.getElementById('sp-reason').value = sp.reason || '';
  document.getElementById('sp-resume-date').value = sp.resumeDate || '';
  window.openModal('modal-seasonal-pause');
};

window.saveSeasonalPauseSettings = async function () {
  const isPaused = document.getElementById('sp-is-paused').checked;
  const reason = document.getElementById('sp-reason').value.trim() || '产区农忙/仓库盘点暂歇';
  const resumeDate = document.getElementById('sp-resume-date').value || '';

  globalPolicy.seasonalPause = { isPaused, reason, resumeDate };
  localStorage.setItem('hq_global_policy_' + currentAgent, JSON.stringify(globalPolicy));

  try {
    await HQService.updateTenantWithVerify(currentAgent, { custom_settings: globalPolicy });
    if (currentTenantData) currentTenantData.custom_settings = globalPolicy;
  } catch (e) {}

  syncSeasonalPauseBannerUI();
  window.closeModal('modal-seasonal-pause');
  alert(isPaused ? `🍵 已挂出【暂歇接单】告示（${reason}），门店订货台与天街专柜已同步显示！` : '🟢 已解除暂歇告示，恢复正常接单营业！');
};

function syncSeasonalPauseBannerUI() {
  const sp = globalPolicy.seasonalPause;
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

window.exportFullTenantBackup = function () {
  const backupBundle = {
    exportedAt: new Date().toISOString(),
    platform: '百工百业数字协作平台 · 商号独立私有账本全量备份',
    tenant: { tenant_id: currentAgent, company_name: currentTenantData?.company_name || currentAgent, globalPolicy },
    products: allProducts,
    stores: allStores,
    orders: allOrders,
    inventoryLogs: allInventoryLogs
  };
  const blob = new Blob([JSON.stringify(backupBundle, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentAgent}_全套私有账本备份_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert(`💾 本店全套私有账本备份已下载到您的电脑（含 ${allProducts.length} 款货品、${allStores.length} 家门店、${allOrders.length} 笔单据）！`);
};

export async function initHQController() {
  const isAuthed = await checkHQAuthStatus();
  if (isAuthed) {
    window.loadHQData();
  }
}
