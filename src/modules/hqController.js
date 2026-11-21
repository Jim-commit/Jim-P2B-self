import { supabase } from '../lib/supabase.js';
import { downloadCSV } from '../utils/storage.js';
import { HQService } from '../services/hqService.js';
import {
  hqState,
  isDirectoryLead,
  isWarehouseBlindPrice,
  getVisibleStoresForCurrentRole
} from './hq/hqState.js';
import {
  checkHQAuthStatus,
  updateTotpStatusBadge,
  renderSubUsersTable,
  initAuthBindings
} from './hq/hqAuthModule.js';
import {
  loadGlobalPolicyFromTenant,
  updateWebhookStatusBadge,
  initPolicyBindings
} from './hq/hqPolicyModule.js';
import {
  extractVoucherMeta,
  populateCategoryDropdowns,
  renderProductFilterBar,
  renderProductTable,
  renderInventoryLogs,
  initInventoryBindings
} from './hq/hqInventoryModule.js';
import {
  renderStoreFilterBar,
  renderStoreTable,
  renderOrderFulfillmentList,
  renderDriverSettleList,
  initOrderStoreBindings
} from './hq/hqOrderStoreModule.js';

window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

window.removeLastRow = function (containerId) {
  const box = document.getElementById(containerId);
  if (box && box.children.length > 0) box.removeChild(box.lastElementChild);
};

window.dismissOnboardingGuide = function () {
  localStorage.setItem('hq_onboarding_dismissed_' + hqState.currentAgent, '1');
  document.getElementById('hq-onboarding-guide')?.classList.add('hidden');
};

window.restoreOnboardingGuide = function () {
  localStorage.removeItem('hq_onboarding_dismissed_' + hqState.currentAgent);
  document.getElementById('hq-onboarding-guide')?.classList.remove('hidden');
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
    if (btn) btn.className = 'py-2.5 px-2 text-center rounded-xl text-stone-600 hover:text-emerald-950 hover:bg-stone-50 transition flex items-center justify-center gap-1';
  });
  document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');
  const activeBtn = document.getElementById(`tab-btn-${tabName}`);
  if (activeBtn) activeBtn.className = 'py-2.5 px-2 text-center rounded-xl bg-[#1b4332] text-white transition flex items-center justify-center gap-1 shadow-xs';
  if (tabName === 'perf') renderPerformanceAndCommissions();
};

function calcStoreRebateBonus(b2bTotal) {
  if (hqState.globalPolicy.rebateEnabled === false) return { bonus: 0, rate: 0 };
  const tiers = Array.isArray(hqState.globalPolicy.rebateTiers) ? [...hqState.globalPolicy.rebateTiers] : [];
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
      if (!staffMap[key]) staffMap[key] = { name: key, role: roleLabel, stockOpsCount: 0, deliveryCount: 0, collectedAmt: 0, carrierReturned: 0 };
      return staffMap[key];
    };

    ensurePerson('大当家主账号', '大当家主账号');
    hqState.allSubUsers.forEach((u) => {
      ensurePerson(u.real_name, `${u.phone && u.phone.includes('|') ? u.phone.split('|')[1] : u.role_code} (${u.account_name})`);
    });
    hqState.allInventoryLogs.forEach((l) => {
      ensurePerson(l.operator_name || '仓管', '仓储/操作员').stockOpsCount += 1;
    });
    hqState.allOrders
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
        </tr>`
      )
      .join('');
  }

  const commListEl = document.getElementById('external-commission-list');
  if (commListEl) {
    const promoterEnabled = hqState.globalPolicy.promoterEnabled !== false;
    const promoterRate = parseFloat(hqState.globalPolicy.promoterRate ?? 8.0);
    if (hqState.allStores.length === 0) {
      commListEl.innerHTML = '<div class="py-6 text-center text-stone-400">暂无在册合作门店数据。</div>';
      return;
    }

    commListEl.innerHTML = hqState.allStores
      .map((s) => {
        const b2bOrders = hqState.allOrders.filter((o) => Number(o.store_id) === Number(s.id) && o.order_source !== 'online_mall' && !isDirectoryLead(o) && o.order_status !== 'cancelled');
        const b2bTotal = b2bOrders.reduce((sum, o) => sum + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);
        const { bonus: rebateBonus, rate: matchedRebateRate } = calcStoreRebateBonus(b2bTotal);

        const mallOrders = hqState.allOrders.filter((o) => o.order_source === 'online_mall' && (Number(o.store_id) === Number(s.id) || String(o.note || '').includes(`[专属门店ID: ${s.id}]`)));
        const mallTotal = mallOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
        const promoterCommission = promoterEnabled ? Number(((mallTotal * promoterRate) / 100).toFixed(2)) : 0;

        return `
          <div class="py-3 flex flex-wrap justify-between items-center gap-3">
            <div>
              <b class="text-stone-900 text-xs">${s.name}</b>
              <div class="text-[11px] text-stone-500 mt-0.5 font-mono">累计实体批发额: <b>¥${b2bTotal.toFixed(2)}</b> · 天街带货额: <b>¥${mallTotal.toFixed(2)}</b> (${mallOrders.length}单)</div>
            </div>
            <div class="flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span class="px-2.5 py-1 rounded-xl border ${rebateBonus > 0 ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold' : 'bg-stone-50 text-stone-400 border-stone-200'}">
                ${hqState.globalPolicy.rebateEnabled !== false ? `阶梯返利(${matchedRebateRate}%): ¥${rebateBonus.toFixed(2)}` : '进货返利已停用'}
              </span>
              <span class="px-2.5 py-1 rounded-xl ${promoterEnabled ? 'bg-amber-50 text-amber-950 border border-amber-300 font-bold' : 'bg-stone-50 text-stone-400 border border-stone-200'}">
                ${promoterEnabled ? `天街推客润利(${promoterRate}%): ¥${promoterCommission.toFixed(2)}` : '推客润利已停用'}
              </span>
            </div>
          </div>`;
      })
      .join('');
  }
}

function renderThreeFlowsAndAIAdvisor() {
  const defaultMin = parseInt(hqState.globalPolicy.defaultMinStock ?? 10);
  const goodsValue = hqState.allProducts.reduce((sum, p) => sum + parseFloat(p.tier_1_price || 0) * parseInt(p.stock ?? 0), 0);
  const toShipOrders = hqState.allOrders.filter((o) => (o.order_status === 'confirmed' || o.order_status === 'over_credit_approved') && o.delivery_status !== 'delivered' && !isDirectoryLead(o));
  const lowStockProds = hqState.allProducts.filter((p) => parseInt(p.stock ?? 0) <= parseInt(p.custom_specs?.min_stock ?? defaultMin));

  document.getElementById('flow-goods-value').innerText = isWarehouseBlindPrice() ? '***' : `¥${goodsValue.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
  document.getElementById('flow-goods-toship').innerText = `${toShipOrders.length} 单`;
  document.getElementById('flow-goods-lowstock').innerText = `${lowStockProds.length} 款`;

  const visibleStores = getVisibleStoresForCurrentRole();
  const receivable = visibleStores.reduce((sum, s) => sum + parseFloat(s.current_debt || 0), 0);
  const settledTotal = hqState.allOrders.filter((o) => o.delivery_status === 'delivered' && !isDirectoryLead(o)).reduce((sum, o) => sum + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);
  document.getElementById('flow-money-receivable').innerText = isWarehouseBlindPrice() ? '***' : `¥${receivable.toFixed(2)}`;
  document.getElementById('flow-money-settled').innerText = isWarehouseBlindPrice() ? '***' : `¥${settledTotal.toFixed(2)}`;

  const pendingOrders = hqState.allOrders.filter((o) => o.order_status === 'pending_confirm' && !isDirectoryLead(o));
  const leadsList = hqState.allOrders.filter((o) => isDirectoryLead(o) && o.order_status === 'pending_confirm');
  const openDemands = hqState.allC2BDemands.filter((d) => !d.official_reply);
  const pendingPlans = hqState.allDemandPlans.filter((p) => p.status === 'submitted');
  const activePoolItems = hqState.allLocalPoolItems.filter((i) => i.status === 'open' || i.status === 'claimed');
  const draftProds = hqState.allProducts.filter((p) => p.status === 'draft');
  const pendingClaims = hqState.allInventoryLogs.filter((l) => l.action_type === 'qc_damage_claim' && !String(l.remark || '').includes('[已核准冲账]'));

  document.getElementById('flow-info-orders').innerText = `${pendingOrders.length + openDemands.length + pendingPlans.length} 笔`;
  document.getElementById('flow-info-leads').innerText = `${leadsList.length} 条`;

  const aiTips = [];
  if (!isWarehouseBlindPrice() && pendingClaims.length > 0) {
    const firstClaim = pendingClaims[0];
    const meta = extractVoucherMeta(firstClaim);
    aiTips.push({ level: 'rose', icon: '🔧', title: `内部定损待核：有 ${pendingClaims.length} 笔《实地定损鉴证单》待裁定冲账`, desc: `最新来自【${meta.sourceParty}】（单号 ${meta.voucherNo}）：${meta.cleanNote}`, btnText: '立即核准冲账 ➔', action: `window.approveInternalDamageClaim(${firstClaim.id});` });
  }
  if (!isWarehouseBlindPrice() && draftProds.length > 0) {
    aiTips.push({ level: 'amber', icon: '📝', title: `分段上架待定策：有 ${draftProds.length} 款货品草稿待定基准价并合规上架`, desc: '仓管已录好实物规格与库存，点击即可设定批发与网上零售基准价。', btnText: '立即定价上架 ➔', action: `window.switchTab('products'); window.toggleDraftOnlyFilter();` });
  }
  if (pendingPlans.length > 0) {
    aiTips.push({ level: 'emerald', icon: '📅', title: `真实用度计划：有 ${pendingPlans.length} 份合作门店用度计划待纳入排产`, desc: '门店已提前提报未来周期真实用度预估量，查看「采收排产汇总单」合并总量。', btnText: '查看排产总单 ➔', action: 'window.openPlanAggregateModal();' });
  }
  if (activePoolItems.length > 0) {
    aiTips.push({ level: 'amber', icon: '🔄', title: `同城余缺互调池：当前有 ${activePoolItems.length} 笔门店余货正在互调流通`, desc: '合作门店挂出的富余货品正进行同城平价调剂，可安排送货师傅顺路捎带交割。', btnText: '查看互调动态 ➔', action: `window.switchTab('settle'); window.filterOrderStatus('local_pool');` });
  }
  if (openDemands.length > 0) {
    aiTips.push({ level: 'amber', icon: '📢', title: `天街新需求：有 ${openDemands.length} 条门店/抱团求购榜待回应`, desc: '百工天街买家与门店已发起真实用度求购需求，按阳光工价给出报价即可锁定排产。', btnText: '立即报工价接单 ➔', action: `window.switchTab('settle'); window.filterOrderStatus('c2b_demands');` });
  }
  lowStockProds.forEach((p) => {
    aiTips.push({ level: 'rose', icon: '📦', title: `库存紧缺预警：【${p.name}】仅剩 ${p.stock ?? 0}${p.measure_unit || '件'}`, desc: '已低于安全预警线，建议立即开具采收/完工入库单备货。', btnText: '+ 立即开入库单', action: `window.openStockOpsModal(${p.id})` });
  });

  const warnDays = parseInt(hqState.globalPolicy.expiryWarnDays ?? 30);
  if (warnDays > 0) {
    const nowTs = Date.now();
    const warnMs = warnDays * 24 * 3600 * 1000;
    hqState.allProducts.forEach((p) => {
      const expStr = p.custom_specs?.expiry_date;
      if (!expStr || parseInt(p.stock ?? 0) <= 0) return;
      const expTs = new Date(`${expStr}T23:59:59`).getTime();
      const diffDays = Math.ceil((expTs - nowTs) / (24 * 3600 * 1000));
      if (expTs - nowTs <= warnMs) {
        aiTips.push({ level: diffDays <= 7 ? 'rose' : 'amber', icon: '⏳', title: `${diffDays <= 0 ? '批次已到期提醒' : `临期预警（余 ${diffDays} 天）`}：【${p.name}】在库 ${p.stock}${p.measure_unit || '件'}`, desc: `到期日为 ${expStr}，建议优先安排配发或标注余缺调剂。`, btnText: '📦 安排优先配发', action: 'window.openPushOrderModal()' });
      }
    });
  }

  if (!isWarehouseBlindPrice()) {
    visibleStores.forEach((s) => {
      const debt = parseFloat(s.current_debt || 0);
      const limit = parseFloat(s.credit_limit || 2000);
      const baskets = parseInt(s.carrier_hold_count || s.basket_count || 0);
      if (debt > limit * 0.85 && debt > 0) {
        aiTips.push({ level: 'amber', icon: '💰', title: `信用账款提醒：【${s.name}】在账 ¥${debt.toFixed(2)}（接近周转额度 ¥${limit}）`, desc: '建议生成周期电子对账单核对回款平账，或安排业务员上门拜访催收。', btnText: '🤝 拜访催收/对账', action: `window.openSalesCollectModal(${s.id});` });
      }
      if (baskets >= 15) {
        aiTips.push({ level: 'amber', icon: '🔄', title: `${hqState.carrierLabel}循环提醒：【${s.name}】借用 ${baskets} 件未归还`, desc: '建议提醒送货师傅本趟回程顺路清点带回。', btnText: '🏪 查看门店档案', action: `window.switchTab('stores');` });
      }
    });
  }

  if (leadsList.length > 0) {
    aiTips.push({ level: 'emerald', icon: '🤝', title: `新店合作意向：有 ${leadsList.length} 家意向门店申请上门送样洽谈`, desc: '意向门店已提交联系方式，及时联系送样并一键立户。', btnText: '立即承接立户 ➔', action: `window.switchTab('settle'); window.filterOrderStatus('directory_leads');` });
  }

  if (aiTips.length === 0) {
    aiTips.push({ level: 'emerald', icon: '🌿', title: '经营运转平稳：供需平衡、账目清白、货畅其流', desc: '当前所有在供良品库存充足，合作门店往来健康。', btnText: '📲 分享合作名片', action: 'window.openPromoQrModal()' });
  }

  document.getElementById('flow-info-ai').innerText = `${aiTips.length} 条`;
  document.getElementById('ai-advisor-cards').innerHTML = aiTips
    .map((t) => {
      const colorCls = t.level === 'rose' ? 'bg-rose-50/70 border-rose-200 text-rose-950' : t.level === 'amber' ? 'bg-amber-50/70 border-amber-200 text-amber-950' : 'bg-emerald-50/70 border-emerald-200 text-emerald-950';
      return `<div class="p-3.5 rounded-2xl border ${colorCls} flex flex-col justify-between gap-2.5"><div><div class="font-bold text-xs flex items-center gap-1.5"><span>${t.icon}</span><span>${t.title}</span></div><p class="text-[11px] opacity-85 mt-1 leading-relaxed">${t.desc}</p></div><div class="text-right"><button onclick="${t.action}" class="bg-white hover:bg-stone-50 text-stone-900 border border-stone-200 px-3 py-1 rounded-xl font-bold text-[11px] shadow-xs">${t.btnText}</button></div></div>`;
    })
    .join('');
}

window.loadHQData = async function () {
  const { data: curTenant, error: tErr } = await HQService.fetchTenant(hqState.currentAgent);
  if (tErr || !curTenant || !curTenant.is_active) {
    window.logoutHQ();
    return;
  }

  hqState.currentTenantData = curTenant;
  document.getElementById('hq-company-badge').innerText = curTenant.company_name || curTenant.tenant_id;
  document.getElementById('hq-tenant-id').innerText = curTenant.tenant_id;
  loadGlobalPolicyFromTenant(curTenant);
  updateWebhookStatusBadge(curTenant.webhook_url || '');
  updateTotpStatusBadge(!!(curTenant.totp_enabled && curTenant.totp_secret));

  const guideEl = document.getElementById('hq-onboarding-guide');
  if (guideEl) guideEl.classList.toggle('hidden', localStorage.getItem('hq_onboarding_dismissed_' + hqState.currentAgent) === '1');

  const [dashData, plansRes, poolRes] = await Promise.all([
    HQService.fetchFullDashboardData(hqState.currentAgent),
    supabase.from('demand_forecast_plan').select('*').eq('tenant_id', hqState.currentAgent).order('id', { ascending: false }).limit(40),
    supabase.from('local_inventory_pool').select('*').eq('tenant_id', hqState.currentAgent).order('id', { ascending: false }).limit(40)
  ]);

  hqState.allPlatformCats = dashData.categories;
  hqState.allProducts = dashData.products;
  hqState.allStores = dashData.stores;
  hqState.allOrders = dashData.orders;
  hqState.allC2BDemands = dashData.c2bDemands || [];
  hqState.allDemandPlans = plansRes.data || [];
  hqState.allLocalPoolItems = poolRes.data || [];
  hqState.allInventoryLogs = dashData.inventoryLogs;
  hqState.allSubUsers = dashData.subUsers;
  hqState.pendingCashLogsCache = dashData.pendingCashLogs || [];

  populateCategoryDropdowns();
  renderProductFilterBar();
  renderProductTable();

  const draftCount = hqState.allProducts.filter((p) => p.status === 'draft').length;
  const draftBadge = document.getElementById('draft-prod-badge');
  if (draftBadge) {
    if (draftCount > 0 && !isWarehouseBlindPrice()) {
      draftBadge.classList.remove('hidden');
      draftBadge.innerText = `${draftCount}待定价`;
    } else draftBadge.classList.add('hidden');
  }

  const visibleStores = getVisibleStoresForCurrentRole();
  document.getElementById('stat-active-stores').innerText = `${visibleStores.length} 家`;
  document.getElementById('stat-baskets').innerText = `${visibleStores.reduce((sum, s) => sum + parseInt(s.carrier_hold_count || s.basket_count || 0), 0)} 件`;
  renderStoreFilterBar();
  renderStoreTable();

  const logs = hqState.pendingCashLogsCache;
  const totalPendingCash = logs.reduce((sum, l) => sum + parseFloat(l.amount || 0), 0);
  document.getElementById('flow-money-pending').innerText = isWarehouseBlindPrice() ? '***' : `¥${totalPendingCash.toFixed(2)}`;
  renderDriverSettleList(logs);

  const leadsList = hqState.allOrders.filter((o) => isDirectoryLead(o) && o.order_status === 'pending_confirm');
  const normalPendingList = hqState.allOrders.filter((o) => o.order_status === 'pending_confirm' && !isDirectoryLead(o));
  const overCreditList = hqState.allOrders.filter((o) => o.order_status === 'over_credit_pending');
  const openDemandsList = hqState.allC2BDemands.filter((d) => !d.official_reply);
  const submittedPlansList = hqState.allDemandPlans.filter((p) => p.status === 'submitted');
  const activePoolList = hqState.allLocalPoolItems.filter((i) => i.status === 'open' || i.status === 'claimed');
  const pendingClaims = hqState.allInventoryLogs.filter((l) => l.action_type === 'qc_damage_claim' && !String(l.remark || '').includes('[已核准冲账]'));

  document.getElementById('count-pending-confirm').innerText = normalPendingList.length;
  document.getElementById('count-directory-leads').innerText = leadsList.length;
  document.getElementById('count-c2b-demands').innerText = openDemandsList.length;
  document.getElementById('stores-tab-lead-count').innerText = leadsList.length;
  document.getElementById('count-over-credit').innerText = overCreditList.length;
  const planCountEl = document.getElementById('count-demand-plans');
  if (planCountEl) planCountEl.innerText = submittedPlansList.length;
  const poolCountEl = document.getElementById('count-local-pool');
  if (poolCountEl) poolCountEl.innerText = activePoolList.length;

  const totalTodos = logs.length + normalPendingList.length + leadsList.length + overCreditList.length + openDemandsList.length + submittedPlansList.length + (isWarehouseBlindPrice() ? 0 : draftCount + pendingClaims.length);
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

export async function initHQController() {
  initAuthBindings();
  initPolicyBindings({
    onPolicyUpdated: () => {
      renderStoreTable();
      renderThreeFlowsAndAIAdvisor();
      renderPerformanceAndCommissions();
    }
  });
  initInventoryBindings();
  initOrderStoreBindings();

  window.openContextualHelpModal = function () {
    const subEl = document.getElementById('help-context-subtitle');
    if (subEl) subEl.innerText = `当值岗位：【${hqState.currentOperatorName}】 · 实时经营体检`;
    const box = document.getElementById('help-guidance-cards');
    if (box) {
      box.innerHTML = `<div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5"><b class="text-emerald-950 block">📖 当前岗位操作要领</b><p class="text-[11px] text-stone-600 leading-relaxed">• 仓管/产区岗：点击「当前库存」开具 RK/CK 单据；<br>• 业务员：拜访催收后单据直推财务核销；<br>• 财务岗：点清回款与定损单后销账。</p></div>`;
    }
    window.openModal('modal-contextual-help');
  };

  window.openNotificationDrawer = function () {
    const listEl = document.getElementById('hq-notif-list');
    if (!listEl) return;
    const msgs = [];
    const draftProds = hqState.allProducts.filter((p) => p.status === 'draft');
    const pendingClaims = hqState.allInventoryLogs.filter((l) => l.action_type === 'qc_damage_claim' && !String(l.remark || '').includes('[已核准冲账]'));
    const normalPending = hqState.allOrders.filter((o) => o.order_status === 'pending_confirm' && !isDirectoryLead(o));
    const overCredits = hqState.allOrders.filter((o) => o.order_status === 'over_credit_pending');
    const leads = hqState.allOrders.filter((o) => isDirectoryLead(o) && o.order_status === 'pending_confirm');
    const submittedPlans = hqState.allDemandPlans.filter((p) => p.status === 'submitted');
    const openDemands = hqState.allC2BDemands.filter((d) => !d.official_reply);

    if (!isWarehouseBlindPrice()) {
      pendingClaims.forEach((c) => {
        const meta = extractVoucherMeta(c);
        msgs.push({ badge: '🔧 内部定损单', badgeCls: 'bg-rose-600 text-white', title: `【${meta.sourceParty}】定损单 ${meta.voucherNo} 待核准冲账`, desc: meta.cleanNote, action: `window.closeModal('modal-hq-notifications'); window.approveInternalDamageClaim(${c.id});` });
      });
      if (draftProds.length > 0) msgs.push({ badge: '📝 待定价草稿', badgeCls: 'bg-amber-500 text-stone-950', title: `有 ${draftProds.length} 款新货品草稿待定价上架`, desc: draftProds.map((d) => d.name).join('、'), action: `window.closeModal('modal-hq-notifications'); window.switchTab('products'); window.toggleDraftOnlyFilter();` });
      overCredits.forEach((o) => msgs.push({ badge: '🚨 超信特批', badgeCls: 'bg-rose-600 text-white', title: `【${o.store_name}】申请超授信额度 ¥${o.over_credit_amount || 0} 放行`, desc: `单号 #${o.order_no || o.id}`, action: `window.closeModal('modal-hq-notifications'); window.switchTab('settle'); window.filterOrderStatus('over_credit_pending');` }));
      if (hqState.pendingCashLogsCache.length > 0) {
        const sumCash = hqState.pendingCashLogsCache.reduce((s, x) => s + parseFloat(x.amount || 0), 0);
        msgs.push({ badge: '💵 随车/催收待点款', badgeCls: 'bg-amber-700 text-white', title: `有 ${hqState.pendingCashLogsCache.length} 笔回款待点清（合计 ¥${sumCash.toFixed(2)}）`, desc: '包含随车收款与业务员拜访催收留痕', action: `window.closeModal('modal-hq-notifications'); window.jumpToDriverCashPanel();` });
      }
    }
    normalPending.forEach((o) => msgs.push({ badge: '📥 门店补货单', badgeCls: 'bg-emerald-800 text-white', title: `【${o.store_name}】发来新补货单`, desc: `单号 #${o.order_no || o.id}`, action: `window.closeModal('modal-hq-notifications'); window.switchTab('settle'); window.filterOrderStatus('pending_confirm');` }));
    submittedPlans.forEach((p) => msgs.push({ badge: '📅 真实用度计划', badgeCls: 'bg-amber-500 text-stone-950', title: `【${p.store_name}】提报 ${p.plan_cycle} 用度计划`, desc: `期望到店：${p.expected_date || '近期'}`, action: `window.closeModal('modal-hq-notifications'); window.switchTab('settle'); window.filterOrderStatus('demand_plans');` }));
    leads.forEach((l) => msgs.push({ badge: '🤝 新店意向', badgeCls: 'bg-amber-200 text-amber-950', title: `意向门店【${l.store_name}】预约上门送样`, desc: l.note || '', action: `window.closeModal('modal-hq-notifications'); window.switchTab('settle'); window.filterOrderStatus('directory_leads');` }));
    openDemands.forEach((d) => msgs.push({ badge: '📢 天街求购', badgeCls: 'bg-indigo-700 text-white', title: '天街买家发布求购需求待回应', desc: d.proposer_name || '', action: `window.closeModal('modal-hq-notifications'); window.switchTab('settle'); window.filterOrderStatus('c2b_demands');` }));

    listEl.innerHTML = msgs.length === 0 ? '<div class="py-10 text-center text-stone-400">🌿 当前无待办提醒。</div>' : msgs.map((m) => `<div onclick="${m.action}" class="cursor-pointer p-3 bg-stone-50 hover:bg-emerald-50/60 border border-stone-200 rounded-2xl flex justify-between items-center gap-2"><div><span class="px-1.5 py-0.2 rounded text-[10px] font-bold ${m.badgeCls}">${m.badge}</span> <b class="text-stone-900">${m.title}</b><p class="text-[11px] text-stone-500 mt-0.5">${m.desc}</p></div><span class="text-emerald-800 font-bold shrink-0">去处理 ➔</span></div>`).join('');
    window.openModal('modal-hq-notifications');
  };

  window.openTraceCardModal = function (prodId) {
    const p = hqState.allProducts.find((x) => Number(x.id) === Number(prodId));
    if (!p) return;
    const traceCode = `${p.trace_code_prefix || 'QC-'}${p.id}`;
    const company = hqState.currentTenantData?.company_name || hqState.currentAgent;
    const origin = p.origin_place || '源头合作社/工坊原产';
    const summary = p.custom_specs?.summary || '顺应时令采收/匠心制造，实名保真直供';
    const exp = p.custom_specs?.expiry_date || '见包装喷码';
    hqState.currentTraceCardText = `【实名保真 · 品质溯源卡】\n货品全称：${p.name}\n溯源编码：${traceCode}\n生产/直供主体：${company}\n产地/工坊：${origin}\n包装规格：${p.spec || '整装'} / ${p.measure_unit || '件'}\n保质期限：${exp}\n品质说明：${summary}`;
    const body = document.getElementById('trace-card-body');
    if (body) body.innerHTML = `<div class="flex justify-between items-center border-b border-stone-200 pb-2"><b class="text-sm text-stone-900">${p.name}</b><span class="font-mono text-[10px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded font-bold">${traceCode}</span></div><div class="space-y-1 text-[11px] text-stone-700"><div>直供主体：<b>${company}</b></div><div>产地工坊：<b>${origin}</b></div><div>包装规格：<b>${p.spec || '整装'} / ${p.measure_unit || '件'}</b> · 效期：<b>${exp}</b></div><div>品质说明：<span>${summary}</span></div></div>`;
    window.openModal('modal-trace-card');
  };
  window.copyTraceCardText = () => navigator.clipboard.writeText(hqState.currentTraceCardText).then(() => alert('✅ 品质溯源卡信息已复制！'));
  window.openHqSuggestionModal = () => {
    document.getElementById('hq-suggestion-text').value = '';
    window.openModal('modal-hq-suggestion');
  };
  window.submitHqSuggestion = async () => {
    const content = document.getElementById('hq-suggestion-text')?.value.trim();
    if (!content) return alert('请写下您的宝贵建议！');
    const { error } = await supabase.from('platform_suggestion_board').insert([{ proposer_type: 'merchant_hq', proposer_name: `${hqState.currentTenantData?.company_name || hqState.currentAgent} · ${hqState.currentOperatorName}`, content, reply_status: 'pending' }]);
    if (error) return alert('提交失败：' + error.message);
    alert('🙏 感谢掌柜建言，已呈达平台建言堂！');
    window.closeModal('modal-hq-suggestion');
  };
  window.jumpToDriverCashPanel = () => {
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
  window.openPromoQrModal = () => {
    const promoUrl = `${window.location.origin}/suppliers.html?t=${encodeURIComponent(hqState.currentAgent)}`;
    document.getElementById('promo-qr-company').innerText = hqState.currentTenantData?.company_name || hqState.currentAgent;
    document.getElementById('promo-qr-code-text').innerText = `唯一商号代号：${hqState.currentAgent}`;
    document.getElementById('promo-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(promoUrl)}`;
    window.openModal('modal-promo-qr');
  };
  window.copyPromoLink = () => {
    const promoUrl = `${window.location.origin}/suppliers.html?t=${encodeURIComponent(hqState.currentAgent)}`;
    const shareText = `【${hqState.currentTenantData?.company_name || hqState.currentAgent}】源头合作社与匠心工坊直供，实名资质已核验，支持预约送货师傅上门送样！点击预约：${promoUrl}`;
    navigator.clipboard.writeText(shareText).then(() => alert('✅ 专属合作文案与链接已复制！'));
  };
  window.exportPerformanceCSV = () => {
    const execExport = () => {
      const promoterRate = parseFloat(hqState.globalPolicy.promoterRate ?? 8.0);
      const headers = ['合作门店', '累计批发进货额(元)', '阶梯进货返利(元)', '天街带货额(元)', '推客服务润利(元)', '合计应结奖励(元)'];
      const rows = hqState.allStores.map((s) => {
        const b2bTotal = hqState.allOrders.filter((o) => Number(o.store_id) === Number(s.id) && o.order_source !== 'online_mall' && !isDirectoryLead(o) && o.order_status !== 'cancelled').reduce((sum, o) => sum + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);
        const { bonus: rebateBonus } = calcStoreRebateBonus(b2bTotal);
        const mallTotal = hqState.allOrders.filter((o) => o.order_source === 'online_mall' && (Number(o.store_id) === Number(s.id) || String(o.note || '').includes(`[专属门店ID: ${s.id}]`))).reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
        const promoterCommission = hqState.globalPolicy.promoterEnabled !== false ? (mallTotal * promoterRate) / 100 : 0;
        return [s.name, b2bTotal.toFixed(2), rebateBonus.toFixed(2), mallTotal.toFixed(2), promoterCommission.toFixed(2), (rebateBonus + promoterCommission).toFixed(2)];
      });
      downloadCSV(`${hqState.currentAgent}_门店返利与推客分润核算表_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    };
    if (hqState.globalPolicy.twoFaExportOn) window.trigger2FAAction('导出绩效与推客分润核算表 (CSV)，请输入验证器 6 位动态码授权：', execExport);
    else execExport();
  };
  window.triggerBarcodeScan = () => {
    const code = prompt('请用扫码枪扫入或键入商品/物料条码：');
    if (code && code.trim()) document.getElementById('prod-barcode').value = code.trim();
  };
  window.stopBarcodeScan = () => window.closeModal('scanner-modal');
  window.previewFullImage = (url) => {
    const w = window.open('');
    w.document.write(`<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${url}" style="max-width:90%;max-height:90%;border-radius:16px;"></body>`);
  };

  const isAuthed = await checkHQAuthStatus();
  if (isAuthed) {
    window.loadHQData();
  }
}
