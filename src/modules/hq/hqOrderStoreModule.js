import { supabase } from '../../lib/supabase.js';
import { downloadCSV } from '../../utils/storage.js';
import { HQService } from '../../services/hqService.js';
import {
  hqState,
  isDirectoryLead,
  isWarehouseBlindPrice,
  isAuditorReadOnly,
  getVisibleStoresForCurrentRole,
  generateUnifiedVoucherNo,
  calcStoreEffectivePrice
} from './hqState.js';
import {
  recordOrderHabit,
  getLastDealPrice,
  getPartnerTop6Items,
  calcRoundOffDiscount,
  checkBelowCostAlert
} from '../soulEngine/silentMemoryAndLexicon.js';

function calcStoreCreditScore(store) {
  const debt = parseFloat(store.current_debt || 0);
  const limit = parseFloat(store.credit_limit || 2000);
  const baskets = parseInt(store.carrier_hold_count || store.basket_count || 0);
  const deliveredCount = hqState.allOrders.filter((o) => Number(o.store_id) === Number(store.id) && o.delivery_status === 'delivered').length;
  let score = 80 + Math.min(15, deliveredCount * 2);
  if (debt > limit) score -= 12;
  if (baskets >= 20) score -= 5;
  return Math.max(50, Math.min(100, score));
}

export function renderStoreFilterBar() {
  const bar = document.getElementById('store-tags-filter');
  if (!bar) return;
  const visibleStores = getVisibleStoresForCurrentRole();
  const dynamicTags = new Set(['#社区便民店', '#餐饮食堂', '#工程工料', '#村社自提点']);
  hqState.globalPolicy.storeTiers.forEach((t) => dynamicTags.add(`#${t.name}`));
  visibleStores.forEach((s) => (Array.isArray(s.tags) ? s.tags : []).forEach((t) => dynamicTags.add(t)));
  const list = ['全部', ...Array.from(dynamicTags)];
  bar.innerHTML =
    `<span class="text-stone-400 text-[11px] self-center mr-1">分级与圈子快筛:</span>` +
    list
      .map(
        (t) => `
      <button onclick="window.filterStoreByTag('${t}')" class="px-2.5 py-0.5 rounded-lg text-[10px] transition ${
          hqState.activeStoreFilter === t ? 'bg-[#1b4332] text-white font-bold' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
        }">${t}</button>
    `
      )
      .join('');
}

export function renderStoreTable() {
  const listEl = document.getElementById('store-list');
  if (!listEl) return;
  const visibleStores = getVisibleStoresForCurrentRole();
  let filtered =
    hqState.activeStoreFilter === '全部'
      ? visibleStores
      : visibleStores.filter((s) => Array.isArray(s.tags) && s.tags.includes(hqState.activeStoreFilter));

  if (hqState.sortStoresDebtDesc) {
    filtered = [...filtered].sort((a, b) => parseFloat(b.current_debt || 0) - parseFloat(a.current_debt || 0));
  }

  const readOnly = isAuditorReadOnly();

  listEl.innerHTML =
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
                  <span class="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded font-mono font-bold">${hqState.carrierLabel}借用: ${
              s.carrier_hold_count || s.basket_count || 0
            } 件</span>
                  ${discountRate !== 1 && hqState.globalPolicy.storeTierEnabled !== false ? `<span class="text-[10px] bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.2 rounded font-bold">协议 ${(discountRate * 10).toFixed(1)} 折</span>` : ''}
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

function parseDemandPayload(rawContent) {
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && parsed.title) return parsed;
  } catch (e) {}
  return { title: rawContent, qty: '若干', budget: '面议', delivery: '灵活协商', coBuyers: 1 };
}

export function renderOrderFulfillmentList() {
  const container = document.getElementById('order-fulfillment-list');
  if (!container) return;

  const blindPrice = isWarehouseBlindPrice();
  const readOnly = isAuditorReadOnly();

  if (hqState.activeOrderFilter === 'demand_plans') {
    if (hqState.allDemandPlans.length === 0) {
      container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">暂无合作门店提报的真实用度计划单。</div>';
      return;
    }
    container.innerHTML = hqState.allDemandPlans
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
              }">${isSubmitted ? '⏳ 待纳入排产' : isScheduled ? '✅ 已纳入产区排产' : '📦 已履约配发'}</span>
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
                  <button onclick="window.convertPlanToPushOrder(${p.id})" class="bg-white hover:bg-stone-50 text-emerald-950 border border-emerald-300 px-3 py-1.5 rounded-xl font-bold shadow-xs">📦 一键转为配货单</button>
                  ${
                    isSubmitted
                      ? `<button onclick="window.updateDemandPlanStatus(${p.id}, 'scheduled')" class="bg-[#1b4332] text-white px-3.5 py-1.5 rounded-xl font-bold shadow">✅ 纳入产区采收/排产</button>`
                      : isScheduled
                      ? `<button onclick="window.updateDemandPlanStatus(${p.id}, 'fulfilled')" class="bg-amber-400 text-stone-950 px-3.5 py-1.5 rounded-xl font-bold shadow">✓ 标记已按计划配发</button>`
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

  if (hqState.activeOrderFilter === 'local_pool') {
    if (hqState.allLocalPoolItems.length === 0) {
      container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">当前暂无合作门店挂出的同城余缺互调记录。</div>';
      return;
    }
    container.innerHTML = hqState.allLocalPoolItems
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
              }">${isOpen ? '🟢 挂池待认领' : isClaimed ? '🚚 已认领待顺路捎带' : isCompleted ? '✅ 已交割平账' : '已撤回'}</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2 bg-white p-2.5 rounded-2xl border border-cyan-100 text-[11px]">
              <div>调出门店：<b>${item.from_store_name}</b></div>
              <div>调入门店：<b class="text-emerald-900">${item.to_store_name || '等待同行认领'}</b></div>
              <div class="font-mono">调剂让利总值：<b class="text-rose-700">${blindPrice ? '***' : `¥${totalVal}`}</b></div>
            </div>
            ${item.reason ? `<div class="text-[11px] text-stone-600">💬 调剂缘由：${item.reason}</div>` : ''}
            <div class="flex justify-between items-center pt-1 border-t border-cyan-200/50 text-[11px]">
              <span class="text-stone-400 font-mono">挂池时间：${new Date(item.created_at).toLocaleString()}</span>
              ${isClaimed && !readOnly ? `<button onclick="window.completeLocalPoolItem(${item.id})" class="bg-[#1b4332] text-white px-3.5 py-1.5 rounded-xl font-bold shadow">✅ 确认已顺路交割平账</button>` : ''}
            </div>
          </div>
        `;
      })
      .join('');
    return;
  }

  if (hqState.activeOrderFilter === 'c2b_demands') {
    if (hqState.allC2BDemands.length === 0) {
      container.innerHTML = '<div class="p-8 text-center text-stone-400 text-xs">暂无天街求购或定制用度需求帖。</div>';
      return;
    }
    container.innerHTML = hqState.allC2BDemands
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
              }">${info.acceptedByBuyer ? '🤝 需求方已锁定意向' : hasReplied ? '✅ 已回应待确认' : '⏳ 待源头直供回应'}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-2xl border border-amber-200/80 text-[11px] font-mono">
              <div>需求数量: <b>${info.qty}</b></div>
              <div>期望工价: <b class="text-emerald-900">${blindPrice ? '***' : info.budget}</b></div>
              <div>交付要求: <b class="font-sans">${info.delivery}</b></div>
            </div>
            ${info.note ? `<div class="text-[11px] text-stone-600">💬 定制规格细节：${info.note}</div>` : ''}
            ${hasReplied ? `<div class="bg-emerald-50 border border-emerald-200 p-2.5 rounded-2xl text-[11px] text-emerald-950"><b>已发直供回应：</b>${d.official_reply}</div>` : ''}
            <div class="flex justify-between items-center pt-1 text-[11px]">
              <span class="text-stone-400">发起人：${d.proposer_name || '天街买家'}</span>
              ${
                readOnly || blindPrice
                  ? ''
                  : `<button onclick="window.replyToC2BDemand(${d.id}, '${info.title.replace(/'/g, '')}')" class="bg-[#1b4332] text-white px-4 py-1.5 rounded-xl font-bold shadow">${hasReplied ? '✏️ 修改回应' : '💰 填报工价直供'}</button>`
              }
            </div>
          </div>
        `;
      })
      .join('');
    return;
  }

  let filtered = hqState.allOrders;
  if (hqState.activeOrderFilter === 'pending_confirm') filtered = hqState.allOrders.filter((o) => (o.order_status === 'pending_confirm' || o.order_status === 'counter_proposal') && !isDirectoryLead(o));
  else if (hqState.activeOrderFilter === 'directory_leads') filtered = hqState.allOrders.filter((o) => isDirectoryLead(o));
  else if (hqState.activeOrderFilter === 'over_credit_pending') filtered = hqState.allOrders.filter((o) => o.order_status === 'over_credit_pending');
  else if (hqState.activeOrderFilter === 'confirmed') filtered = hqState.allOrders.filter((o) => o.order_status === 'confirmed' && o.delivery_status !== 'delivered');
  else if (hqState.activeOrderFilter === 'delivered') filtered = hqState.allOrders.filter((o) => o.delivery_status === 'delivered');

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
              </div>
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${isConverted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200 text-amber-950 animate-pulse'}">${isConverted ? '✓ 已立户建档' : '待联系送样'}</span>
            </div>
            <div class="bg-white p-3 rounded-2xl border border-amber-200/80 text-xs text-stone-700">${o.note || '意向门店申请上门送样洽谈'}</div>
            <div class="flex justify-between items-center pt-1 text-xs">
              <span class="text-[10px] text-stone-400 font-mono">提交时间: ${o.created_at ? new Date(o.created_at).toLocaleString() : '刚刚'}</span>
              ${isConverted || readOnly ? '' : `<button onclick="window.convertLeadToStore(${o.id})" class="bg-[#1b4332] text-white px-4 py-1.5 rounded-xl font-bold shadow">🏪 一键立户转为合作门店</button>`}
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
              }">${isDelivered ? '已核销交割' : isOverCredit ? '🚨 授信超额待特批' : isPending ? '待确认接单' : '已排单发运'}</span>
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
              ? `<div class="flex items-center justify-between text-[10px] pt-0.5"><span class="text-amber-800">${o.note ? `💬 附言: ${o.note}` : ''}</span><div class="flex gap-1 items-center">${proofs.map((src) => `<img src="${src}" class="h-6 w-6 rounded border object-cover cursor-pointer" onclick="window.previewFullImage('${src}')">`).join('')}${o.sign_image_url ? `<img src="${o.sign_image_url}" class="h-6 border bg-white rounded px-1 cursor-pointer" onclick="window.previewFullImage('${o.sign_image_url}')">` : ''}</div></div>`
              : ''
          }
          <div class="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-stone-200/60 text-xs">
            <span class="font-mono text-stone-800 font-bold">净结: ${blindPrice ? '***' : `¥${netTotal.toFixed(2)}`}</span>
            <div class="flex flex-wrap items-center gap-2">
              ${canRestockReturn && !readOnly ? `<button onclick="window.restockReturnedItems(${o.id})" class="bg-rose-50 text-rose-800 border border-rose-300 px-3 py-1.5 rounded-xl font-bold">📥 退货质检回库</button>` : ''}
              <button onclick="window.openSingleDeliverySlipPrint(${o.id})" class="bg-white text-stone-800 border border-stone-300 px-3 py-1.5 rounded-xl font-bold">🖨️ 打印交割单</button>
              ${
                readOnly
                  ? ''
                  : isOverCredit && !blindPrice
                  ? `<button onclick="window.hqRejectOverCredit(${o.id})" class="bg-rose-50 text-rose-700 px-3 py-1.5 rounded-xl border border-rose-200 font-bold">拒绝赊销</button>
                     <button onclick="window.hqApproveOverCredit(${o.id}, ${o.store_id}, ${o.over_credit_amount || 0})" class="bg-emerald-800 text-white px-4 py-1.5 rounded-xl font-bold shadow">🛡️ 特信放行</button>`
                  : isPending
                  ? `<button onclick="window.hqRejectWithProposal(${o.id})" class="bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-xl font-bold">建议微调</button>
                     <button onclick="window.hqApproveOrder(${o.id})" class="bg-[#1b4332] text-white px-4 py-1.5 rounded-xl font-bold shadow">✅ 应允接单并扣库</button>`
                  : `<span class="text-stone-400 font-mono text-[11px]">${o.driver_action_instruction || '正常办理'}</span>`
              }
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderDriverSettleList(logs) {
  const box = document.getElementById('driver-settle-list');
  if (!box) return;
  const readOnly = isAuditorReadOnly();
  box.innerHTML =
    logs.length === 0
      ? '<div class="p-6 text-center text-stone-400 text-xs">随车师傅与业务员交回的款项已全部清点入库，无待交钱款。</div>'
      : logs
          .map((l) => {
            const isSalesCollect = l.collect_type === 'sales_visit_collect';
            return `
              <div class="p-3 bg-stone-50 border ${isSalesCollect ? 'border-amber-300 bg-amber-50/30' : 'border-stone-200'} rounded-2xl flex justify-between items-center">
                <div>
                  <div class="flex items-center gap-1.5 font-bold text-stone-800">
                    <span class="px-1.5 py-0.2 rounded text-[10px] ${isSalesCollect ? 'bg-amber-200 text-amber-950' : 'bg-emerald-100 text-emerald-900'}">${isSalesCollect ? '🤝 业务催收' : '🚚 随车收款'}</span>
                    <span>经手: ${l.driver_name}</span>
                    <span class="text-[10px] bg-stone-200 text-stone-700 px-1.5 py-0.2 rounded font-mono">${l.pay_method}</span>
                    <span class="text-xs text-stone-600">从【${l.store_name}】收回</span>
                  </div>
                  <div class="text-[10px] text-stone-400 mt-0.5 font-mono">登记时间: ${new Date(l.created_at).toLocaleString()}</div>
                </div>
                <div class="text-right">
                  <b class="text-base font-mono text-emerald-900 font-bold block">¥${l.amount}</b>
                  ${
                    readOnly || hqState.currentRoleCode === 'sales'
                      ? '<span class="text-[10px] text-amber-700 font-bold">待财务核验销账</span>'
                      : `<button onclick="window.confirmLogSettled(${l.id}, ${l.amount}, ${l.store_id || 0}, '${l.collect_type || ''}')" class="text-[10px] bg-[#1b4332] text-white font-bold px-2.5 py-1 rounded-lg shadow">财务点清入库${isSalesCollect ? '并冲减欠款' : ''}</button>`
                  }
                </div>
              </div>
            `;
          })
          .join('');
}

export function initOrderStoreBindings() {
  window.filterStoreByTag = function (tag) {
    hqState.sortStoresDebtDesc = false;
    hqState.activeStoreFilter = tag;
    renderStoreFilterBar();
    renderStoreTable();
  };

  window.sortStoresByDebt = function () {
    hqState.sortStoresDebtDesc = true;
    hqState.activeStoreFilter = '全部';
    renderStoreFilterBar();
    renderStoreTable();
  };

  window.filterOrderStatus = function (status) {
    hqState.activeOrderFilter = status;
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

  window.openSalesCollectModal = function (storeId) {
    if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验。');
    const s = hqState.allStores.find((x) => Number(x.id) === Number(storeId));
    if (!s) return;
    document.getElementById('sc-store-id').value = s.id;
    document.getElementById('sc-store-subtitle').innerText = `${s.name} · 当前在账欠款 ¥${parseFloat(s.current_debt || 0).toFixed(2)}`;
    document.getElementById('sc-amount-input').value = parseFloat(s.current_debt || 0) > 0 ? parseFloat(s.current_debt).toFixed(2) : '';
    document.getElementById('sc-note-input').value = '';
    window.openModal('modal-sales-collect');
  };

  window.submitSalesVisitCollection = async function () {
    const storeId = parseInt(document.getElementById('sc-store-id').value);
    const s = hqState.allStores.find((x) => x.id === storeId);
    if (!s) return;
    const amt = parseFloat(document.getElementById('sc-amount-input').value || 0);
    const payMethod = document.getElementById('sc-pay-method').value;
    const note = document.getElementById('sc-note-input').value.trim();
    if (isNaN(amt) || amt <= 0) return alert('请输入有效的本次催收回款金额！');

    const { error } = await supabase.from('driver_collection_log').insert([
      {
        tenant_id: hqState.currentAgent,
        store_id: s.id,
        store_name: `${s.name} (业务员催收${note ? '·' + note : ''})`,
        driver_name: hqState.currentOperatorName,
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
    alert('✅ 拜访催收留痕已提交至账房财务点款台！');
    window.closeModal('modal-sales-collect');
    window.loadHQData();
  };

  window.editStoreTagsPrompt = async function (storeId) {
    const s = hqState.allStores.find((x) => Number(x.id) === Number(storeId));
    if (!s) return;
    const newTagStr = prompt(`为【${s.name}】设定同业圈子标签（逗号隔开）：`, (Array.isArray(s.tags) ? s.tags : []).join(', '));
    if (newTagStr !== null) {
      const cleanTags = newTagStr.split(/[,，]/).map((i) => i.trim()).filter(Boolean).map((t) => (t.startsWith('#') ? t : '#' + t));
      const { error } = await supabase.from('store').update({ tags: cleanTags }).eq('id', storeId);
      if (error) return alert('更新标签失败：' + error.message);
      window.loadHQData();
    }
  };

  window.addCustomPriceRuleRow = function (prodId = '', specialPrice = '') {
    const box = document.getElementById('custom-price-rules-box');
    const row = document.createElement('div');
    row.className = 'flex items-center gap-1.5 custom-price-row';
    const optionsHtml = hqState.allProducts.map((p) => `<option value="${p.id}" ${String(p.id) === String(prodId) ? 'selected' : ''}>${p.name} (批发基准¥${p.tier_1_price})</option>`).join('');
    row.innerHTML = `
      <select class="rule-prod-id flex-1 bg-white border border-emerald-300 rounded-lg px-2 py-1 text-[11px] outline-none">${optionsHtml}</select>
      <input type="number" step="0.01" placeholder="协议工价" value="${specialPrice}" class="rule-price w-24 bg-white border border-emerald-300 rounded-lg px-2 py-1 font-mono font-bold text-[11px] outline-none">
    `;
    box.appendChild(row);
  };

  window.openStorePolicyModal = function (storeId) {
    const s = hqState.allStores.find((x) => x.id === storeId);
    if (!s) return;

    const tierSelect = document.getElementById('policy-tier-preset-select');
    if (tierSelect) {
      tierSelect.innerHTML =
        '<option value="">-- 选择全局分级模板一键套用 --</option>' +
        hqState.globalPolicy.storeTiers.map((t, idx) => `<option value="${idx}">${t.name} (授信¥${t.creditLimit} · ${(t.discountRate * 10).toFixed(1)}折 · 免批退货¥${t.returnQuota})</option>`).join('');
    }

    const pricing = s.custom_pricing && typeof s.custom_pricing === 'object' ? s.custom_pricing : {};
    const salesSelect = document.getElementById('policy-sales-owner-select');
    if (salesSelect) {
      const activeStaff = (hqState.allSubUsers || []).filter((u) => u.is_active !== false);
      const ownerAccount = hqState.currentAgent || 'owner';
      const roleLabels = { sales: '业务跟单', warehouse: '仓储调度', finance: '账房财务', driver: '送货师傅', manager: '店长主管' };
      salesSelect.innerHTML =
        '<option value="">🌐 全员公海客户 (所有内部人员可见)</option>' +
        `<option value="${ownerAccount}" ${pricing.sales_owner === ownerAccount ? 'selected' : ''}>👑 老板主账号亲自跟进 (${hqState.currentOperatorName || '老板'})</option>` +
        activeStaff
          .map(
            (u) =>
              `<option value="${u.account_name}" ${pricing.sales_owner === u.account_name ? 'selected' : ''}>🤝 ${u.real_name} (${roleLabels[u.role_code] || u.role_code || '员工'} · ${u.account_name})</option>`
          )
          .join('');
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
    const customFields = Array.isArray(hqState.globalPolicy.storeCustomFields) ? hqState.globalPolicy.storeCustomFields : [];
    const existingExt = pricing.ext_profile && typeof pricing.ext_profile === 'object' ? pricing.ext_profile : {};
    if (extBox && extInputsEl) {
      if (customFields.length > 0) {
        extBox.classList.remove('hidden');
        extInputsEl.innerHTML = customFields
          .map((fName) => `<div><label class="block text-[10px] text-stone-600 mb-0.5">${fName}：</label><input type="text" data-ext-key="${fName}" value="${existingExt[fName] || ''}" placeholder="输入${fName}..." class="policy-ext-field-input w-full bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 outline-none"></div>`)
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
    document.querySelectorAll('.policy-cb').forEach((cb) => (cb.checked = allowed.includes(cb.value)));
    window.openModal('store-policy-modal');
  };

  window.applyStoreTierPreset = function (idxStr) {
    if (idxStr === '') return;
    const tier = hqState.globalPolicy.storeTiers[parseInt(idxStr)];
    if (!tier) return;
    document.getElementById('policy-credit-limit').value = tier.creditLimit;
    document.getElementById('policy-discount-rate').value = tier.discountRate;
    document.getElementById('policy-return-quota').value = tier.returnQuota;
  };

  window.saveStorePolicySettings = async function () {
    const storeId = parseInt(document.getElementById('policy-store-id').value);
    const storeObj = hqState.allStores.find((x) => x.id === storeId);
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
      const tierObj = hqState.globalPolicy.storeTiers[parseInt(chosenTierIdx)];
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

    if (hqState.globalPolicy.twoFaLimitOn !== false && credit_limit > oldCreditLimit) {
      window.trigger2FAAction(`调高【${storeObj?.name}】信用周转额度（¥${oldCreditLimit} ➔ ¥${credit_limit}），请输入验证器 6 位动态码授权：`, execSaveStore);
    } else {
      await execSaveStore();
    }
  };

  window.openVisibilityModal = function (storeId) {
    const s = hqState.allStores.find((x) => Number(x.id) === Number(storeId));
    if (!s) return;
    hqState.currentStoreForVis = storeId;
    document.getElementById('vis-store-title').innerText = `${s.name} (专享通道与协议折算价)`;
    const selected = Array.isArray(s.visible_product_ids) ? s.visible_product_ids : [];

    document.getElementById('vis-checkbox-group').innerHTML = hqState.allProducts
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
              <button type="button" onclick="window.editStoreProductPriceAndNote(${s.id}, ${p.id})" class="bg-stone-100 hover:bg-amber-100 text-stone-700 border border-stone-200 px-2 py-0.5 rounded-lg text-[10px] font-bold transition">✏️ 改价/备注</button>
            </div>
          </div>
        `;
      })
      .join('');
    window.openModal('visibility-modal');
  };

  window.editStoreProductPriceAndNote = async function (storeId, prodId) {
    const s = hqState.allStores.find((x) => Number(x.id) === Number(storeId));
    const p = hqState.allProducts.find((x) => Number(x.id) === Number(prodId));
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
    if (!priceInput.trim() || isNaN(cleanPrice) || cleanPrice <= 0) delete item_prices[String(prodId)];
    else item_prices[String(prodId)] = cleanPrice;

    if (!noteInput.trim()) delete item_notes[String(prodId)];
    else item_notes[String(prodId)] = noteInput.trim();

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
      .update({ visible_product_ids: checkedBoxes.length === hqState.allProducts.length ? null : checkedBoxes })
      .eq('id', hqState.currentStoreForVis);
    window.closeModal('visibility-modal');
    window.loadHQData();
  };

  window.reassignDriverPrompt = async function (storeId) {
    const s = hqState.allStores.find((x) => Number(x.id) === Number(storeId));
    const newDriver = prompt(`当前送货师傅为【${s?.driver_name || '送货师傅'}】，输入新师傅姓名：`, '张师傅');
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

    const defaultTier = hqState.globalPolicy.storeTiers[hqState.globalPolicy.storeTiers.length - 1] || { name: '普通门店', creditLimit: 2000, returnQuota: 500, discountRate: 1.0 };
    await supabase.from('store').insert([
      {
        tenant_id: hqState.currentAgent,
        name: shopName.trim(),
        contact: '掌柜',
        phone: phone.trim(),
        tags: [`#${defaultTier.name}`],
        credit_limit: defaultTier.creditLimit,
        monthly_return_quota: defaultTier.returnQuota,
        current_debt: 0,
        driver_name: '张师傅',
        custom_pricing: { discount_rate: defaultTier.discountRate, sales_owner: hqState.currentRoleCode === 'sales' ? hqState.currentAccountCode : '' }
      }
    ]);
    window.loadHQData();
  };

  window.convertLeadToStore = async function (orderId) {
    const leadOrder = hqState.allOrders.find((o) => o.id === orderId);
    if (!leadOrder) return;
    const parts = (leadOrder.settlement_note || '').split('|');
    const storeName = leadOrder.store_name || '新合作门店';
    const defaultTier = hqState.globalPolicy.storeTiers[hqState.globalPolicy.storeTiers.length - 1] || { name: '新合作门店', creditLimit: 2000, returnQuota: 500, discountRate: 1.0 };

    if (!confirm(`确认将意向门店【${storeName}】（${parts[0] || '掌柜'} ${parts[1] || ''}）建档立户？\n将自动套用分级【${defaultTier.name}】（授信 ¥${defaultTier.creditLimit}）。`)) return;
    const { error: storeErr } = await supabase.from('store').insert([
      {
        tenant_id: hqState.currentAgent,
        name: storeName,
        contact: parts[0] || '掌柜',
        phone: parts[1] || '',
        address: parts[2] || '',
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
    if (hqState.globalPolicy.twoFaCreditOn !== false) {
      window.trigger2FAAction(`特批放行【超额周转 ¥${overAmount}】单据，请输入验证器 6 位动态口令：`, execApprove);
    } else if (confirm(`确认特批放行【超额周转 ¥${overAmount}】单据？`)) {
      execApprove();
    }
  };

  window.hqRejectOverCredit = async function (orderId) {
    const reason = prompt('输入拒绝记账指令：', '超额授信，请当场收现！');
    if (!reason) return;
    await supabase.from('store_order').update({ order_status: 'over_credit_rejected', driver_action_instruction: `【拒绝记账】${reason}` }).eq('id', orderId);
    window.loadHQData();
  };

  window.hqApproveOrder = async function (orderId) {
    const order = hqState.allOrders.find((o) => o.id === orderId);
    const driverCmd = `【发运指令】配发货品 ${order?.items?.length || 0}项；${order?.settlement_type === 'cash' ? '当面点收现款；' : `按${order?.settlement_type}签收！`}`;
    await supabase.from('store_order').update({ order_status: 'confirmed', driver_action_instruction: driverCmd }).eq('id', orderId);
    if (order?.items) {
      await HQService.deductStockForItems(hqState.currentAgent, hqState.allProducts, order.items, order.order_no || order.id, hqState.currentOperatorName);
      recordOrderHabit(hqState.currentAgent, { partnerId: order.store_id, items: order.items });
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

  window.confirmLogSettled = function (logId, amount, storeId = 0, collectType = '') {
    const amt = parseFloat(amount || 0);
    const threshold = parseFloat(hqState.globalPolicy.twoFaThreshold ?? 3000);
    const execSettle = async () => {
      await supabase.from('driver_collection_log').update({ settled_to_hq: true }).eq('id', logId);
      if (collectType === 'sales_visit_collect' && storeId) {
        const store = hqState.allStores.find((s) => Number(s.id) === Number(storeId));
        if (store) {
          const nextDebt = Math.max(0, Number((parseFloat(store.current_debt || 0) - amt).toFixed(2)));
          await supabase.from('store').update({ current_debt: nextDebt }).eq('id', store.id);
        }
      }
      alert('✅ 财务已点验入库并完成账目核销！');
      window.loadHQData();
    };

    if (hqState.globalPolicy.twoFaCashOn !== false && amt >= threshold) {
      window.trigger2FAAction(`大额资金平账 ¥${amt.toFixed(2)}（已达全局风控门槛 ¥${threshold}），请输入验证器 6 位动态码授权：`, execSettle);
    } else if (confirm('确认已点清该笔回款/收款入库？')) {
      execSettle();
    }
  };

  window.restockReturnedItems = async function (orderId) {
    if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验。');
    const o = hqState.allOrders.find((x) => Number(x.id) === Number(orderId));
    if (!o) return;
    const returns = Array.isArray(o.items_return) ? o.items_return : [];
    if (returns.length === 0) return alert('该单据无验退货品明细！');

    const summary = returns.map((r) => `${r.name} x${r.qty}`).join('、');
    const isGoodCondition = confirm(`【退货质检验收】退回货品：${summary}\n\n• 点击「确定」：质检完好，良品回库自动增加可用库存；\n• 点击「取消」：仅记入报损/销毁台账（不增加库存）。`);
    for (const r of returns) {
      const prod = hqState.allProducts.find((p) => Number(p.id) === Number(r.id) || p.name === r.name);
      if (!prod) continue;
      const qty = parseInt(r.qty || 0);
      if (qty <= 0) continue;
      const beforeStock = parseInt(prod.stock ?? 0);
      const afterStock = isGoodCondition ? beforeStock + qty : beforeStock;
      if (isGoodCondition) await supabase.from('product').update({ stock: afterStock }).eq('id', prod.id);
      const voucherNo = generateUnifiedVoucherNo(isGoodCondition ? 'RK' : 'CK');
      await HQService.recordInventoryChange(hqState.currentAgent, {
        tenant_id: hqState.currentAgent,
        product_id: prod.id,
        product_name: prod.name,
        action_type: isGoodCondition ? 'in_purchase' : 'out_loss',
        delta_qty: isGoodCondition ? qty : 0,
        before_stock: beforeStock,
        after_stock: afterStock,
        operator_name: hqState.currentOperatorName,
        remark: `[单号:${voucherNo}] [门店退货回库 · ${o.store_name || '合作门店'}] ${isGoodCondition ? '退货质检完好回库' : '退货报损销毁留痕'} (原单 #${o.order_no || o.id})`,
        created_at: new Date().toISOString()
      });
    }
    await supabase.from('store_order').update({ note: `${o.note || ''} [退货已质检入账]`.trim() }).eq('id', o.id);
    alert(isGoodCondition ? '✅ 退回良品已质检验收入库并生成入库凭单，可用库存已自动加回！' : '✅ 已登记退货报损凭单台账，可用库存保持不变。');
    window.loadHQData();
  };

  window.openSingleDeliverySlipPrint = function (orderId) {
    const o = hqState.allOrders.find((x) => Number(x.id) === Number(orderId));
    if (!o) return;
    const store = hqState.allStores.find((s) => Number(s.id) === Number(o.store_id));
    document.getElementById('print-slip-company-title').innerText = `${hqState.currentTenantData?.company_name || hqState.currentAgent} · 随车送货交割凭单`;
    const subEl = document.getElementById('print-slip-custom-sub');
    if (subEl) subEl.innerText = hqState.globalPolicy.slipHeaderSub || '';
    document.getElementById('print-slip-meta-line').innerText = `单号：#${o.order_no || o.id} | 制单日期：${new Date(o.created_at || Date.now()).toLocaleString()}`;

    const gridEl = document.getElementById('print-slip-store-grid');
    if (gridEl) {
      const extProfile = store?.custom_pricing?.ext_profile && typeof store.custom_pricing.ext_profile === 'object' ? store.custom_pricing.ext_profile : {};
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
    document.getElementById('print-slip-items-tbody').innerHTML =
      items.length === 0
        ? '<tr><td colspan="6" class="border border-stone-400 p-2 text-center text-stone-400">本单为调退冲抵单，无新配货品</td></tr>'
        : items
            .map((it, idx) => {
              const price = parseFloat(it.price || 0);
              const qty = parseInt(it.qty || 0);
              return `<tr><td class="border border-stone-400 p-1.5 text-center font-mono">${idx + 1}</td><td class="border border-stone-400 p-1.5 font-bold">${it.name}</td><td class="border border-stone-400 p-1.5">${it.spec || '整装'}</td><td class="border border-stone-400 p-1.5 text-center font-mono">${qty} ${it.measure_unit || '件'}</td><td class="border border-stone-400 p-1.5 text-right font-mono">${isWarehouseBlindPrice() ? '***' : `¥${price.toFixed(2)}`}</td><td class="border border-stone-400 p-1.5 text-right font-mono font-bold">${isWarehouseBlindPrice() ? '***' : `¥${(price * qty).toFixed(2)}`}</td></tr>`;
            })
            .join('');

    const returnItems = Array.isArray(o.items_return) ? o.items_return : [];
    const exchangeItems = Array.isArray(o.items_exchange) ? o.items_exchange : [];
    const notesArr = [];
    if (returnItems.length > 0) notesArr.push(`• 验退旧品冲抵：${returnItems.map((r) => `${r.name} x${r.qty}`).join('、')}`);
    if (exchangeItems.length > 0) notesArr.push(`• 平价换新对调：${exchangeItems.map((e) => `${e.name} x${e.qty}`).join('、')}`);
    if (o.note) notesArr.push(`• 交接附言：${o.note}`);
    const baskets = parseInt(store?.carrier_hold_count || store?.basket_count || 0);
    const carrierListStr = hqState.globalPolicy.carriers.map((c) => `${c.name}(¥${c.deposit}/件)`).join('、');
    notesArr.push(`• 该门店累计借存${hqState.carrierLabel}：${baskets} 件（支持回收标准：${carrierListStr}，本次归还：_____ 件）`);
    const specialNotesEl = document.getElementById('print-slip-special-notes');
    if (specialNotesEl) specialNotesEl.innerHTML = notesArr.map((n) => `<div>${n}</div>`).join('');

    const totalAmt = parseFloat(o.total_amount || 0);
    const returnAmt = parseFloat(o.return_amount || 0);
    const netAmt = parseFloat(o.net_settle_amount || totalAmt - returnAmt);
    document.getElementById('print-slip-total-amt').innerText = isWarehouseBlindPrice() ? '***' : `¥${totalAmt.toFixed(2)}`;
    document.getElementById('print-slip-return-amt').innerText = isWarehouseBlindPrice() ? '***' : `-¥${returnAmt.toFixed(2)}`;
    document.getElementById('print-slip-net-amt').innerText = isWarehouseBlindPrice() ? '***' : `¥${netAmt.toFixed(2)}`;
    document.getElementById('print-slip-footer-terms').innerText = hqState.globalPolicy.slipFooterNote || '';
    document.getElementById('print-slip-stamp-label').innerText = hqState.globalPolicy.slipStampText || '调度专用章';
    window.openModal('modal-delivery-note-print');
  };

  window.executeSingleDeliverySlipPrint = function () {
    document.body.classList.remove('print-stock-voucher');
    document.body.classList.add('print-single-slip');
    window.print();
    setTimeout(() => document.body.classList.remove('print-single-slip'), 500);
  };

  window.openStoreStatementModal = function (preselectStoreId = null) {
    if (isWarehouseBlindPrice()) return;
    const visibleStores = getVisibleStoresForCurrentRole();
    if (visibleStores.length === 0) return alert('当前名册下暂无合作门店！');
    const selectEl = document.getElementById('stmt-store-select');
    selectEl.innerHTML = visibleStores.map((s) => `<option value="${s.id}">${s.name} (在账 ¥${parseFloat(s.current_debt || 0).toFixed(2)})</option>`).join('');
    if (preselectStoreId) selectEl.value = preselectStoreId;

    const now = new Date();
    const startEl = document.getElementById('stmt-start-date');
    const endEl = document.getElementById('stmt-end-date');
    if (startEl && !startEl.value) startEl.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    if (endEl && !endEl.value) endEl.value = now.toISOString().slice(0, 10);

    window.renderStoreStatementDetail();
    window.openModal('modal-store-statement');
  };

  window.renderStoreStatementDetail = function () {
    const storeId = parseInt(document.getElementById('stmt-store-select')?.value || 0);
    const store = hqState.allStores.find((s) => s.id === storeId);
    if (!store) return;
    const startTs = new Date(`${document.getElementById('stmt-start-date')?.value || '2000-01-01'}T00:00:00`).getTime();
    const endTs = new Date(`${document.getElementById('stmt-end-date')?.value || '2099-12-31'}T23:59:59`).getTime();

    const orders = hqState.allOrders.filter((o) => !isDirectoryLead(o) && Number(o.store_id) === storeId && o.order_status !== 'cancelled' && new Date(o.created_at || 0).getTime() >= startTs && new Date(o.created_at || 0).getTime() <= endTs);
    const orderSum = orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
    const returnSum = orders.reduce((sum, o) => sum + parseFloat(o.return_amount || 0), 0);
    const netSum = orders.reduce((sum, o) => sum + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);
    const curDebt = parseFloat(store.current_debt || 0);

    document.getElementById('stmt-order-sum').innerText = `¥${orderSum.toFixed(2)}`;
    document.getElementById('stmt-return-sum').innerText = `-¥${returnSum.toFixed(2)}`;
    document.getElementById('stmt-net-sum').innerText = `¥${netSum.toFixed(2)}`;
    document.getElementById('stmt-current-debt').innerText = `¥${curDebt.toFixed(2)}`;
    document.getElementById('stmt-basket-info').innerText = `${hqState.carrierLabel}借存：${parseInt(store.carrier_hold_count || store.basket_count || 0)} 件`;
    document.getElementById('stmt-settle-amount').value = curDebt > 0 ? curDebt.toFixed(2) : '';

    const listEl = document.getElementById('stmt-orders-list');
    if (listEl) {
      listEl.innerHTML =
        orders.length === 0
          ? '<div class="py-6 text-center text-stone-400">区间内暂无往来单据。</div>'
          : orders
              .map((o) => {
                const items = Array.isArray(o.items) ? o.items : [];
                const itemSummary = items.map((i) => `${i.name}x${i.qty}`).join('、') || '调退单';
                const net = parseFloat(o.net_settle_amount || o.total_amount || 0);
                return `<div class="py-2 flex justify-between items-start gap-2"><div><b class="text-stone-900 font-mono">#${o.order_no || o.id}</b> <span class="text-[10px] text-stone-400 ml-1">${new Date(o.created_at).toLocaleDateString()} · ${o.settlement_type}</span><div class="text-[10px] text-stone-600 mt-0.5">${itemSummary}</div></div><div class="text-right font-mono shrink-0"><b class="text-stone-900 font-bold">¥${net.toFixed(2)}</b><span class="block text-[9px] ${o.delivery_status === 'delivered' ? 'text-emerald-700' : 'text-amber-700'}">${o.delivery_status === 'delivered' ? '已签收' : '配送/排单中'}</span></div></div>`;
              })
              .join('');
    }
  };

  window.submitStoreStatementSettle = async function () {
    if (isAuditorReadOnly() || hqState.currentRoleCode === 'sales') return alert('当前岗位无总账核销权限。');
    const storeId = parseInt(document.getElementById('stmt-store-select')?.value || 0);
    const store = hqState.allStores.find((s) => s.id === storeId);
    const payAmt = parseFloat(document.getElementById('stmt-settle-amount')?.value || 0);
    const payMethod = document.getElementById('stmt-pay-method')?.value || '银行公户/微信转账';
    if (!store || isNaN(payAmt) || payAmt <= 0) return alert('请输入有效的实收平账金额！');

    const nextDebt = Math.max(0, Number((parseFloat(store.current_debt || 0) - payAmt).toFixed(2)));
    const doSettle = async () => {
      await supabase.from('store').update({ current_debt: nextDebt }).eq('id', store.id);
      await supabase.from('driver_collection_log').insert([{ tenant_id: hqState.currentAgent, store_id: store.id, store_name: store.name, driver_name: hqState.currentOperatorName, collect_type: 'period_settlement', amount: payAmt, discount_amount: 0, basket_return: 0, basket_deduct_amount: 0, pay_method: payMethod, settled_to_hq: true }]);
      alert(`🎉 平账销账成功！剩余在账余额：¥${nextDebt.toFixed(2)}`);
      await window.loadHQData();
      window.renderStoreStatementDetail();
    };

    const threshold = parseFloat(hqState.globalPolicy.twoFaThreshold ?? 3000);
    if (hqState.globalPolicy.twoFaCashOn !== false && payAmt >= threshold) {
      window.trigger2FAAction(`大额账期平账 ¥${payAmt.toFixed(2)}，请输入验证器 6 位动态码授权：`, doSettle);
    } else if (confirm(`确认收到【${store.name}】回款 ¥${payAmt.toFixed(2)} 并冲减欠款？`)) {
      await doSettle();
    }
  };

  function buildAggregatedPlanItems() {
    const activePlans = hqState.allDemandPlans.filter((p) => p.status === 'submitted' || p.status === 'scheduled');
    const map = {};
    activePlans.forEach((p) => {
      const items = Array.isArray(p.items) ? p.items : [];
      items.forEach((it) => {
        const unit = it.unit || '件';
        const key = `${it.name}|${unit}`;
        if (!map[key]) {
          const matchedProd = hqState.allProducts.find((prod) => prod.name === it.name || prod.name.includes(it.name));
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
    document.getElementById('plan-agg-tenant-name').innerText = `${hqState.currentTenantData?.company_name || hqState.currentAgent} · 源头采收/排产汇总单`;
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
      `【${hqState.currentTenantData?.company_name || hqState.currentAgent} 产销排产汇总单】`,
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
    downloadCSV(`${hqState.currentAgent}_产销排产汇总单_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  window.openBatchPickListModal = function () {
    const toShipOrders = hqState.allOrders.filter(
      (o) => (o.order_status === 'confirmed' || o.order_status === 'over_credit_approved') && o.delivery_status !== 'delivered' && !isDirectoryLead(o)
    );
    document.getElementById('picklist-tenant-name').innerText = `${hqState.currentTenantData?.company_name || hqState.currentAgent} · 装车总拣货单`;
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
    const toShipOrders = hqState.allOrders.filter(
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
      `【${hqState.currentTenantData?.company_name || hqState.currentAgent} 装车总拣货单】`,
      `时间：${new Date().toLocaleString()} | 共 ${toShipOrders.length} 家门店`,
      `------------------------`,
      ...Object.entries(map).map(([k, q], i) => `${i + 1}. ${k} × ${q}`),
      `------------------------`,
      `配送门店：${toShipOrders.map((o) => o.store_name || '天街自提单').join('、')}`
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => alert('✅ 装车总拣货单已复制！'));
  };

  window.exportOrdersToCSV = function () {
    const validOrders = hqState.allOrders.filter((o) => !isDirectoryLead(o));
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
      downloadCSV(`${hqState.currentAgent}_往来对账单_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    };
    if (hqState.globalPolicy.twoFaExportOn) {
      window.trigger2FAAction('导出全量业务往来核心账单 (CSV)，请输入验证器 6 位动态码授权：', execExport);
    } else {
      execExport();
    }
  };

  window.copyStoreStatementText = function () {
    const storeId = parseInt(document.getElementById('stmt-store-select')?.value || 0);
    const store = hqState.allStores.find((s) => s.id === storeId);
    if (!store) return;
    const startDate = document.getElementById('stmt-start-date')?.value || '2000-01-01';
    const endDate = document.getElementById('stmt-end-date')?.value || '2099-12-31';
    const startTs = new Date(`${startDate}T00:00:00`).getTime();
    const endTs = new Date(`${endDate}T23:59:59`).getTime();

    const orders = hqState.allOrders.filter((o) => !isDirectoryLead(o) && Number(o.store_id) === storeId && o.order_status !== 'cancelled' && new Date(o.created_at || 0).getTime() >= startTs && new Date(o.created_at || 0).getTime() <= endTs);
    const orderSum = orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
    const returnSum = orders.reduce((sum, o) => sum + parseFloat(o.return_amount || 0), 0);
    const netSum = orders.reduce((sum, o) => sum + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);
    const curDebt = parseFloat(store.current_debt || 0);
    const baskets = parseInt(store.carrier_hold_count || store.basket_count || 0);

    const lines = [
      `【${hqState.currentTenantData?.company_name || hqState.currentAgent} · 往来电子对账单】`,
      `合作门店：${store.name}（${store.contact || '掌柜'}）`,
      `对账周期：${startDate} 至 ${endDate}`,
      `------------------------`,
      `• 区间新配货品总额：¥${orderSum.toFixed(2)}`,
      `• 区间验退冲抵金额：-¥${returnSum.toFixed(2)}`,
      `• 区间发生净额合计：¥${netSum.toFixed(2)}（共 ${orders.length} 笔）`,
      `• 当前累计在账应结：¥${curDebt.toFixed(2)}`,
      `• ${hqState.carrierLabel}借存结余：${baskets} 件`,
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
    const storeId = parseInt(document.getElementById('stmt-store-select')?.value || 0);
    const store = hqState.allStores.find((s) => s.id === storeId);
    if (!store) return;
    const startDate = document.getElementById('stmt-start-date')?.value || '2000-01-01';
    const endDate = document.getElementById('stmt-end-date')?.value || '2099-12-31';
    const startTs = new Date(`${startDate}T00:00:00`).getTime();
    const endTs = new Date(`${endDate}T23:59:59`).getTime();
    const orders = hqState.allOrders.filter((o) => !isDirectoryLead(o) && Number(o.store_id) === storeId && o.order_status !== 'cancelled' && new Date(o.created_at || 0).getTime() >= startTs && new Date(o.created_at || 0).getTime() <= endTs);

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
    if (hqState.globalPolicy.twoFaExportOn) {
      window.trigger2FAAction('导出客户财务往来对账单 (CSV)，请输入验证器 6 位动态码授权：', execExport);
    } else {
      execExport();
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
    const plan = hqState.allDemandPlans.find((p) => p.id === planId);
    if (!plan) return;
    if (hqState.allStores.length === 0) return alert('当前名册下暂无合作门店，请先在「合作门店」中立户！');

    window.openPushOrderModal();
    const storeSelect = document.getElementById('push-store-select');
    const matchedStore = hqState.allStores.find((s) => Number(s.id) === Number(plan.store_id) || s.name === plan.store_name);
    if (storeSelect && matchedStore) {
      storeSelect.value = matchedStore.id;
      window.onPushStoreChange(matchedStore.id);
    }
    const noteInput = document.getElementById('push-note-input');
    if (noteInput) noteInput.value = `按【${plan.plan_cycle}】用度计划排产配发${plan.note ? '（' + plan.note + '）' : ''}`;

    const planItems = Array.isArray(plan.items) ? plan.items : [];
    const unmatched = [];
    planItems.forEach((it) => {
      const prod = hqState.allProducts.find((p) => p.name === it.name || p.name.includes(it.name));
      if (prod) {
        const qtyInput = document.getElementById(`push-qty-${prod.id}`);
        if (qtyInput) {
          qtyInput.value = parseInt(it.qty || 0);
          window.recalcPushOrderSummary?.();
        }
      } else {
        unmatched.push(`${it.name}x${it.qty}${it.unit || '件'}`);
      }
    });
    if (unmatched.length > 0) {
      alert(`已为您自动匹配门店并回填在架货品数量！\n以下计划品项暂未上架标准货品，请核对：\n• ${unmatched.join('\n• ')}`);
    }
  };

  window.completeLocalPoolItem = async function (poolId) {
    if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验。');
    if (!confirm('确认该笔同城余缺调剂货物已由送货师傅顺路交割并完成平账？')) return;
    await supabase.from('local_inventory_pool').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', poolId);
    alert('✅ 同城余缺互调单已标记交割平账！');
    window.loadHQData();
  };

  window.replyToC2BDemand = async function (demandId, demandTitle) {
    if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验。');
    const quote = prompt(`【百工天街求购回应】针对「${demandTitle}」，请输入您的平准直供工价、起订量与交付时间：`, '合作社直供工价 ¥62/件，满20件包配送至合作门店自提，3天内安排发车！');
    if (!quote || !quote.trim()) return;
    const senderLabel = `${hqState.currentTenantData?.company_name || hqState.currentAgent}（${hqState.currentOperatorName}）`;
    const { error } = await HQService.replyC2BDemand(demandId, `【${senderLabel}】${quote.trim()}`);
    if (error) alert('回应提交失败：' + error.message);
    else {
      alert('🎉 直供回应已发送至百工天街！');
      window.loadHQData();
    }
  };

  // ============================================================================
  // 主动开单 / 配货：静默历史拿价 + 常拿货 Top6 + 亏本红字提醒 + 一键抹零头
  // ============================================================================
  let pushRoundMode = 'none'; // 'none' | 'fen' | 'jiao' | 'yuan' | 'custom'

  window.setPushRoundMode = function (mode) {
    pushRoundMode = pushRoundMode === mode && mode !== 'custom' ? 'none' : mode;
    window.recalcPushOrderSummary();
  };

  window.recalcPushOrderSummary = function () {
    const blindPrice = isWarehouseBlindPrice();
    let rawTotal = 0;

    hqState.allProducts
      .filter((p) => p.status !== 'inactive' && p.status !== 'draft')
      .forEach((p) => {
        const qty = parseInt(document.getElementById(`push-qty-${p.id}`)?.value || '0', 10);
        const priceEl = document.getElementById(`push-price-${p.id}`);
        const price = priceEl ? parseFloat(priceEl.value || '0') : parseFloat(p.tier_1_price || '0');
        if (qty > 0 && !isNaN(price)) {
          rawTotal += price * qty;
        }
      });

    const summaryBar = document.getElementById('push-smart-summary-bar');
    if (!summaryBar) return;
    if (blindPrice) {
      summaryBar.innerHTML = `<span class="text-stone-500 text-[11px]">库管盲价模式：仅核对出库数量，不显示金额</span>`;
      return;
    }

    const customValStr = document.getElementById('push-custom-final-input')?.value;
    const customFinal = customValStr !== undefined && customValStr !== '' ? parseFloat(customValStr) : null;
    const calc =
      pushRoundMode === 'none'
        ? { rawTotal: Number(rawTotal.toFixed(2)), finalAmount: Number(rawTotal.toFixed(2)), bossDiscount: 0 }
        : calcRoundOffDiscount(rawTotal, pushRoundMode, customFinal);

    summaryBar.innerHTML = `
      <div class="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-2.5 space-y-2 text-xs">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-stone-700 font-bold">💰 货款合计：<b class="font-mono text-stone-900">¥${calc.rawTotal.toFixed(2)}</b></span>
          <div class="flex flex-wrap items-center gap-1">
            <button type="button" onclick="window.setPushRoundMode('jiao')" class="px-2 py-0.5 rounded-lg text-[11px] font-bold border transition ${
              pushRoundMode === 'jiao' ? 'bg-[#1b4332] text-amber-300 border-[#1b4332]' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
            }">✂️ 抹角分</button>
            <button type="button" onclick="window.setPushRoundMode('yuan')" class="px-2 py-0.5 rounded-lg text-[11px] font-bold border transition ${
              pushRoundMode === 'yuan' ? 'bg-[#1b4332] text-amber-300 border-[#1b4332]' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
            }">✂️ 抹个位</button>
            <div class="flex items-center gap-1 ml-1">
              <span class="text-[11px] text-stone-500">一口价:</span>
              <input type="number" step="0.01" id="push-custom-final-input" value="${pushRoundMode === 'custom' && customFinal !== null ? customFinal : ''}"
                oninput="window.setPushRoundMode('custom')" placeholder="凑整实收"
                class="w-20 bg-white border border-stone-300 rounded-lg px-1.5 py-0.5 font-mono font-bold text-[11px] outline-none">
            </div>
          </div>
        </div>
        <div class="flex items-center justify-between border-t border-emerald-200/60 pt-1.5">
          <span class="text-[11px] text-amber-900 font-bold">
            ${calc.bossDiscount > 0 ? `🎁 老板抹零让利：-¥${calc.bossDiscount.toFixed(2)}` : calc.bossDiscount < 0 ? `📈 凑整调增：+¥${Math.abs(calc.bossDiscount).toFixed(2)}` : '未抹零，按原价实收'}
          </span>
          <span class="text-sm font-black text-emerald-950 font-mono">本单实收：¥${calc.finalAmount.toFixed(2)}</span>
        </div>
      </div>
    `;
  };

  window.onPushPriceInput = function (prodId) {
    const prod = hqState.allProducts.find((p) => Number(p.id) === Number(prodId));
    const priceEl = document.getElementById(`push-price-${prodId}`);
    const warnEl = document.getElementById(`push-cost-warn-${prodId}`);
    if (prod && priceEl && warnEl) {
      const check = checkBelowCostAlert(priceEl.value, prod);
      if (check.isLoss) {
        priceEl.classList.add('border-rose-500', 'bg-rose-50', 'text-rose-800');
        warnEl.innerHTML = `<span class="text-[10px] text-rose-600 font-bold block mt-0.5">${check.message}</span>`;
      } else {
        priceEl.classList.remove('border-rose-500', 'bg-rose-50', 'text-rose-800');
        warnEl.innerHTML = '';
      }
    }
    window.recalcPushOrderSummary();
  };

  window.quickAddPushTopItem = function (prodId) {
    const qtyEl = document.getElementById(`push-qty-${prodId}`);
    if (qtyEl) {
      qtyEl.value = (parseInt(qtyEl.value || '0', 10) || 0) + 1;
      qtyEl.classList.add('ring-2', 'ring-amber-400');
      setTimeout(() => qtyEl.classList.remove('ring-2', 'ring-amber-400'), 400);
      window.recalcPushOrderSummary();
    }
  };

  window.applyPushLastPrice = function (prodId, lastPrice) {
    const priceEl = document.getElementById(`push-price-${prodId}`);
    if (priceEl) {
      priceEl.value = Number(lastPrice).toFixed(2);
      window.onPushPriceInput(prodId);
    }
  };

  window.openPushOrderModal = function () {
    pushRoundMode = 'none';
    const visibleStores = getVisibleStoresForCurrentRole();
    const storeSelect = document.getElementById('push-store-select');
    storeSelect.innerHTML = visibleStores.map((s) => `<option value="${s.id}">${s.name} (信用余 ¥${(s.credit_limit || 2000) - (s.current_debt || 0)})</option>`).join('');
    if (visibleStores.length > 0) window.onPushStoreChange(visibleStores[0].id);
    window.openModal('push-modal');
  };

  window.onPushStoreChange = function (storeId) {
    const s = hqState.allStores.find((x) => x.id === parseInt(storeId));
    if (s) {
      document.getElementById('push-driver-name').value = s.driver_name || '张师傅';
      if (s.default_settlement) document.getElementById('push-settlement-select').value = s.default_settlement;
    }

    const blindPrice = isWarehouseBlindPrice();
    const activeProducts = hqState.allProducts.filter((p) => p.status !== 'inactive' && p.status !== 'draft');
    const top6 = getPartnerTop6Items(hqState.currentAgent, storeId, activeProducts, hqState.allOrders || []);

    const prodBox = document.getElementById('push-products-list');
    if (prodBox) {
      const top6Html =
        top6.length > 0
          ? `<div class="bg-amber-50/90 border border-amber-200 rounded-xl p-2 mb-2 flex flex-wrap items-center gap-1.5">
               <span class="text-[11px] font-bold text-amber-900">🔥 他常拿的货：</span>
               ${top6
                 .map(
                   (item) => `
                   <button type="button" onclick="window.quickAddPushTopItem(${item.id})"
                     class="text-[11px] bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 px-2 py-0.5 rounded-full font-bold transition shadow-2xs">
                     + ${item.name} <span class="text-stone-400 font-normal">(${item._orderCount}次)</span>
                   </button>`
                 )
                 .join('')}
             </div>`
          : '';

      const rowsHtml = activeProducts
        .map((p) => {
          const { price } = calcStoreEffectivePrice(s, p);
          const lastDeal = !blindPrice ? getLastDealPrice(hqState.currentAgent, storeId, p.id, hqState.allOrders || []) : null;
          const unitLabel = p.measure_unit || '件';

          const lastPriceBadge =
            lastDeal && Number(lastDeal.price) !== Number(price)
              ? `<button type="button" onclick="window.applyPushLastPrice(${p.id}, ${lastDeal.price})" title="点击一键改用上次成交价"
                   class="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.2 rounded-md font-mono font-bold ml-1">
                   📌 上次 ¥${Number(lastDeal.price).toFixed(2)}
                 </button>`
              : lastDeal
              ? `<span class="text-[10px] text-emerald-700 font-mono ml-1">✓ 同上次拿价</span>`
              : '';

          return `
            <div class="py-1.5 border-b border-stone-100">
              <div class="flex justify-between items-center gap-2">
                <div class="min-w-0 flex-1">
                  <span class="text-stone-800 font-bold text-xs">${p.name}</span>
                  <span class="text-[10px] text-stone-400 font-mono ml-1">(存${p.stock ?? 0}${unitLabel})</span>
                  ${lastPriceBadge}
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  ${
                    blindPrice
                      ? `<span class="text-[11px] text-stone-400 font-mono">${unitLabel}</span>`
                      : `<div class="flex items-center bg-stone-50 border border-stone-200 rounded px-1.5 py-0.5">
                           <span class="text-[10px] text-stone-400 mr-0.5">¥</span>
                           <input type="number" step="0.01" value="${price.toFixed(2)}" id="push-price-${p.id}"
                             oninput="window.onPushPriceInput(${p.id})"
                             class="w-14 bg-transparent font-mono font-bold text-xs text-emerald-950 outline-none text-right">
                           <span class="text-[10px] text-stone-400 ml-0.5">/${unitLabel}</span>
                         </div>`
                  }
                  <input type="number" min="0" value="0" id="push-qty-${p.id}"
                    oninput="window.recalcPushOrderSummary()"
                    class="w-14 bg-stone-50 border border-stone-200 rounded px-1.5 py-0.5 text-center font-bold font-mono">
                </div>
              </div>
              <div id="push-cost-warn-${p.id}"></div>
            </div>
          `;
        })
        .join('');

      prodBox.innerHTML = `${top6Html}${rowsHtml}<div id="push-smart-summary-bar" class="mt-2.5"></div>`;
      window.recalcPushOrderSummary();
    }
  };

  window.submitVendorPushOrder = async function () {
    const storeId = parseInt(document.getElementById('push-store-select').value);
    const store = hqState.allStores.find((s) => s.id === storeId);
    const settlement = document.getElementById('push-settlement-select').value;
    const driver = document.getElementById('push-driver-name').value.trim() || '张师傅';
    const note = document.getElementById('push-note-input').value.trim();

    const items = [];
    let rawTotalAmount = 0;
    for (const p of hqState.allProducts) {
      const qty = parseInt(document.getElementById(`push-qty-${p.id}`)?.value || '0');
      if (qty > 0) {
        const customPriceEl = document.getElementById(`push-price-${p.id}`);
        const price = customPriceEl ? parseFloat(customPriceEl.value || '0') : calcStoreEffectivePrice(store, p).price;
        items.push({ id: p.id, name: p.name, spec: p.spec, measure_unit: p.measure_unit, price, qty });
        rawTotalAmount += price * qty;
      }
    }
    if (items.length === 0) return alert('请至少挑选 1 样货品！');

    // 计算抹零/一口价老板让利
    const customValStr = document.getElementById('push-custom-final-input')?.value;
    const customFinal = customValStr !== undefined && customValStr !== '' ? parseFloat(customValStr) : null;
    const roundRes =
      pushRoundMode === 'none'
        ? { rawTotal: Number(rawTotalAmount.toFixed(2)), finalAmount: Number(rawTotalAmount.toFixed(2)), bossDiscount: 0 }
        : calcRoundOffDiscount(rawTotalAmount, pushRoundMode, customFinal);

    const discountNote =
      roundRes.bossDiscount > 0
        ? ` [老板抹零让利 -¥${roundRes.bossDiscount.toFixed(2)}]`
        : roundRes.bossDiscount < 0
        ? ` [凑整调增 +¥${Math.abs(roundRes.bossDiscount).toFixed(2)}]`
        : '';

    const orderNo = generateUnifiedVoucherNo('CK');
    const { error } = await supabase.from('store_order').insert([
      {
        order_no: orderNo,
        tenant_id: hqState.currentAgent,
        store_id: storeId,
        store_name: store.name,
        driver_name: driver,
        order_source: 'vendor_push',
        settlement_type: settlement,
        settlement_note: `${note}${discountNote}`.trim(),
        items,
        items_return: [],
        items_exchange: [],
        total_amount: roundRes.rawTotal,
        return_amount: roundRes.bossDiscount > 0 ? roundRes.bossDiscount : 0,
        net_settle_amount: roundRes.finalAmount,
        order_status: 'confirmed',
        delivery_status: 'ordered',
        note: `[主动铺底配发] ${note}${discountNote}`.trim(),
        driver_action_instruction: `【主动配货】核验交付 ${items.length}项`
      }
    ]);
    if (error) return alert('配发失败: ' + error.message);

    // 静默自学习：记住本单客户拿价与常拿货频次
    recordOrderHabit(hqState.currentAgent, { partnerId: storeId, items });

    await HQService.deductStockForItems(hqState.currentAgent, hqState.allProducts, items, orderNo, hqState.currentOperatorName);
    alert(`✅ 统一出库配货单 (${orderNo}) 已生成并自动扣库！${roundRes.bossDiscount > 0 ? `\n已应用老板抹零让利 ¥${roundRes.bossDiscount.toFixed(2)}，实收 ¥${roundRes.finalAmount.toFixed(2)}` : ''}`);
    window.closeModal('push-modal');
    window.loadHQData();
  };
}
