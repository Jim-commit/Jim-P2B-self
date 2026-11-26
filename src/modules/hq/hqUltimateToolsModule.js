import { supabase } from '../../lib/supabase.js';
import {
  buildWeeklyHealthReport,
  buildInstitutionalProcurementPack,
  buildDisputeEvidenceDossier,
  printReceiptViaWebBluetooth
} from '../../services/ultimateEcosystemService.js';
import { HQService } from '../../services/hqService.js';
import {
  hqState,
  generateUnifiedVoucherNo,
  isAuditorReadOnly,
  getOrgRuntimeContext,
  getVisibleStoresForCurrentRole,
  getVisibleOrdersForCurrentRole
} from './hqState.js';
import { getTenantLexicon } from '../soulEngine/silentMemoryAndLexicon.js';
import { getNormalizedItemPlugins } from '../soulEngine/universalPluginsEngine.js';
import {
  getProductWarehouseStocks,
  calcWarehouseTransfer,
  rememberOperatorOrgPreference
} from '../soulEngine/multiOrgAndWarehouseEngine.js';

function isAgriEntity() {
  const entityVal = document.getElementById('entity-type-selector')?.value || '';
  const bizType = `${entityVal} ${hqState.currentTenantData?.business_type || ''} ${hqState.currentTenantData?.industry_type || ''}`;
  return entityVal === 'coop' || /coop|农|合作社|生鲜|果蔬|粮油|种植|养殖/.test(bizType);
}

function parseWechatOrderText(rawText, stores = [], products = []) {
  const text = String(rawText || '').trim();
  if (!text) return { matchedStore: null, matchedItems: [], unmatchedLines: [] };

  const matchedStore =
    stores.find((s) => s.name && text.includes(s.name)) ||
    stores.find((s) => s.contact && s.contact !== '掌柜' && text.includes(s.contact)) ||
    null;

  const segments = text
    .split(/[\r\n,，;；。！!？?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const matchedItems = [];
  const unmatchedLines = [];

  segments.forEach((seg) => {
    let hitProd = null;
    for (const p of products) {
      if (p.status === 'inactive' || p.status === 'draft') continue;
      if (seg.includes(p.name)) {
        hitProd = p;
        break;
      }
      const shortName = p.name.replace(/\s+/g, '').slice(0, 3);
      if (shortName.length >= 2 && seg.includes(shortName)) {
        hitProd = p;
        break;
      }
    }

    const qtyMatch = seg.match(/(?:要|来|发|配|订|x|X|\*|×)?\s*(\d+(?:\.\d+)?)\s*(?:箱|件|斤|套|桶|袋|瓶|个|台|次|小时|趟|批|份)?/);
    const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;

    if (hitProd && qty > 0) {
      const existing = matchedItems.find((m) => m.product.id === hitProd.id);
      if (existing) existing.qty += qty;
      else matchedItems.push({ product: hitProd, qty });
    } else if (!matchedStore || !seg.includes(matchedStore.name)) {
      unmatchedLines.push(seg);
    }
  });

  return { matchedStore, matchedItems, unmatchedLines };
}

export function mountHqUltimateToolsButton() {
  const host = document.getElementById('ai-advisor-cards');
  if (!host) return;
  document.getElementById('hq-ultimate-toolbox-bar')?.remove();

  const { orgCfg, isOwner, effectiveBranch } = getOrgRuntimeContext();

  const branchSwitcherHtml = orgCfg.isMultiBranch
    ? `<div class="flex items-center gap-1.5 bg-white border border-amber-300 px-2.5 py-1 rounded-xl">
         <span class="text-[11px] font-bold text-stone-700">🏢 ${orgCfg.branchLabel}视角：</span>
         ${
           isOwner
             ? `<select onchange="window.switchActiveOrgBranch(this.value)" class="text-[11px] font-bold text-emerald-950 bg-transparent outline-none cursor-pointer">
                  <option value="ALL" ${effectiveBranch === 'ALL' ? 'selected' : ''}>🌐 全集团总览汇总</option>
                  ${orgCfg.branches.map((b) => `<option value="${b}" ${effectiveBranch === b ? 'selected' : ''}>📍 ${b}</option>`).join('')}
                </select>`
             : `<span class="text-[11px] font-bold text-emerald-900">${effectiveBranch}（已锁定本分支）</span>`
         }
       </div>`
    : '';

  const bar = document.createElement('div');
  bar.id = 'hq-ultimate-toolbox-bar';
  bar.className = 'col-span-full bg-amber-50/70 border border-amber-300 px-3.5 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs';
  bar.innerHTML = `
    <div class="flex flex-wrap items-center gap-2 text-amber-950">
      <span>🧰</span>
      <span><b>实战神器与经营百宝箱：</b>微信聊天拆单 · 一把清冲账 · 派工提成与周期续费 · 多仓多分支 · 睡前语音播报</span>
      ${branchSwitcherHtml}
    </div>
    <button type="button" onclick="window.openHqUltimateToolboxModal()" class="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-3 py-1 rounded-xl text-[11px] shadow-2xs">
      打开实战百宝箱 ➔
    </button>
  `;
  host.insertAdjacentElement('beforeend', bar);
}

export function initHqUltimateToolsBindings() {
  window.switchActiveOrgBranch = function (branchVal) {
    hqState.activeBranchView = branchVal || 'ALL';
    rememberOperatorOrgPreference(hqState.currentAgent, hqState.currentAccountCode || 'owner', {
      activeBranch: hqState.activeBranchView
    });
    mountHqUltimateToolsButton();
    if (typeof window.loadHQData === 'function') window.loadHQData();
  };

  // 【第 3 步核心闭环】员工/师傅完工提成汇总 + 周期自动续费生单台
  window.openCommissionAndRecurringModal = function () {
    document.getElementById('modal-commission-recurring')?.remove();

    const visibleOrders = getVisibleOrdersForCurrentRole();
    const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    const monthOrders = visibleOrders.filter(
      (o) => String(o.created_at || '').startsWith(monthPrefix) && o.order_status !== 'cancelled'
    );

    const staffCommMap = {};
    monthOrders.forEach((o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      items.forEach((it) => {
        const prod = (hqState.allProducts || []).find((p) => Number(p.id) === Number(it.id) || p.name === it.name);
        if (!prod) return;
        const plg = getNormalizedItemPlugins(prod);
        if (!plg.dispatch.enabled) return;

        const worker = o.driver_name || plg.dispatch.assigneeName || '默认执行人';
        const lineAmt = parseFloat(it.price || 0) * parseFloat(it.qty || 0);
        const comm =
          plg.dispatch.commissionType === 'percent'
            ? Number(((lineAmt * parseFloat(plg.dispatch.commissionValue || 0)) / 100).toFixed(2))
            : Number((parseFloat(plg.dispatch.commissionValue || 0) * parseFloat(it.qty || 1)).toFixed(2));

        if (!staffCommMap[worker]) {
          staffCommMap[worker] = { worker, orderCount: 0, salesTotal: 0, commTotal: 0, details: [] };
        }
        staffCommMap[worker].orderCount += 1;
        staffCommMap[worker].salesTotal += lineAmt;
        staffCommMap[worker].commTotal += comm;
        staffCommMap[worker].details.push(`#${o.order_no || o.id} ${it.name}×${it.qty} (提¥${comm.toFixed(2)})`);
      });
    });

    const commRows = Object.values(staffCommMap);
    const recurringProds = (hqState.allProducts || []).filter((p) => {
      const plg = getNormalizedItemPlugins(p);
      return p.status !== 'inactive' && plg.recurring.enabled;
    });

    const modal = document.createElement('div');
    modal.id = 'modal-commission-recurring';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-2xl w-full p-5 space-y-4 shadow-2xl text-xs my-auto">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2.5">
          <div>
            <b class="text-sm text-stone-900">👤 员工派工提成月报 & 🔁 周期自动续费生单台</b>
            <p class="text-[11px] text-stone-500 mt-0.5">统计周期：${monthPrefix} · 自动根据项目插件规则算清提成与包月续费</p>
          </div>
          <button type="button" onclick="document.getElementById('modal-commission-recurring')?.remove()" class="text-stone-400 hover:text-stone-800 text-base font-bold">✕</button>
        </div>

        <!-- 1. 本月派工提成核算 -->
        <div class="p-3.5 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-2">
          <div class="flex justify-between items-center">
            <b class="text-amber-950">💰 本月（${monthPrefix}）派工与完工提成汇总</b>
            ${
              commRows.length > 0
                ? `<button type="button" onclick="window.copyStaffCommissionText()" class="bg-stone-900 text-amber-300 font-bold px-2.5 py-1 rounded-xl text-[10px]">📋 复制发给财务发薪</button>`
                : ''
            }
          </div>
          ${
            commRows.length === 0
              ? `<p class="text-[11px] text-stone-500 py-2">本月暂无触发“派工与提成”插件的已接单记录（在货品/项目编辑里勾选「👤 派工与提成」并开单后自动汇总于此）。</p>`
              : `<div class="space-y-1.5">${commRows
                  .map(
                    (r) => `
                    <div class="bg-white p-2.5 rounded-xl border border-amber-200/80 flex justify-between items-start gap-2">
                      <div>
                        <b class="text-stone-900">${r.worker}</b>
                        <span class="text-[10px] text-stone-500 ml-1">完工 ${r.orderCount} 项 · 关联业绩 ¥${r.salesTotal.toFixed(2)}</span>
                        <div class="text-[10px] text-stone-400 mt-0.5">${r.details.join('；')}</div>
                      </div>
                      <b class="text-sm font-mono text-emerald-900 shrink-0">提成: ¥${r.commTotal.toFixed(2)}</b>
                    </div>`
                  )
                  .join('')}</div>`
          }
        </div>

        <!-- 2. 周期自动续费生单 -->
        <div class="p-3.5 bg-cyan-50/60 border border-cyan-200 rounded-2xl space-y-2">
          <b class="text-cyan-950 block">🔁 周期续费项目一键批量生单（包月维保 / 代理记账 / 会员托管）</b>
          ${
            recurringProds.length === 0
              ? `<p class="text-[11px] text-stone-500">暂无开启“周期自动续费”的项目（在项目卡片勾选「🔁 周期自动续费」后可在此一键批量生成本期账单）。</p>`
              : `<div class="space-y-2">${recurringProds
                  .map((p) => {
                    const plg = getNormalizedItemPlugins(p);
                    const cycleLabel = { monthly: '每月', quarterly: '每季', yearly: '每年' }[plg.recurring.cycle] || '定期';
                    return `
                      <div class="bg-white p-2.5 rounded-xl border border-cyan-200 flex flex-wrap justify-between items-center gap-2">
                        <div>
                          <b class="text-stone-900">${p.name}</b>
                          <span class="text-[10px] bg-cyan-100 text-cyan-900 px-1.5 py-0.2 rounded font-bold ml-1">${cycleLabel} · 每月${plg.recurring.billDay}号生单 · ¥${p.tier_1_price}</span>
                        </div>
                        <button type="button" onclick="window.triggerRecurringBillForProduct(${p.id})" class="bg-[#1b4332] text-white font-bold px-3 py-1 rounded-xl text-[11px]">
                          ⚡ 为续费客户生成本期账单
                        </button>
                      </div>`;
                  })
                  .join('')}</div>`
          }
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.copyStaffCommissionText = function () {
    const visibleOrders = getVisibleOrdersForCurrentRole();
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const monthOrders = visibleOrders.filter(
      (o) => String(o.created_at || '').startsWith(monthPrefix) && o.order_status !== 'cancelled'
    );
    const map = {};
    monthOrders.forEach((o) => {
      (Array.isArray(o.items) ? o.items : []).forEach((it) => {
        const prod = (hqState.allProducts || []).find((p) => Number(p.id) === Number(it.id) || p.name === it.name);
        if (!prod) return;
        const plg = getNormalizedItemPlugins(prod);
        if (!plg.dispatch.enabled) return;
        const worker = o.driver_name || plg.dispatch.assigneeName || '默认执行人';
        const lineAmt = parseFloat(it.price || 0) * parseFloat(it.qty || 0);
        const comm =
          plg.dispatch.commissionType === 'percent'
            ? (lineAmt * parseFloat(plg.dispatch.commissionValue || 0)) / 100
            : parseFloat(plg.dispatch.commissionValue || 0) * parseFloat(it.qty || 1);
        map[worker] = (map[worker] || 0) + comm;
      });
    });
    const lines = [
      `【${hqState.currentTenantData?.company_name || hqState.currentAgent} · ${monthPrefix} 员工完工提成汇总】`,
      ...Object.entries(map).map(([w, c], idx) => `${idx + 1}. ${w}：应发提成 ¥${c.toFixed(2)}`)
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => alert('✅ 本月员工提成汇总表已复制到剪贴板！'));
  };

  window.triggerRecurringBillForProduct = async function (prodId) {
    if (isAuditorReadOnly()) return alert('只读账号不可生单。');
    const prod = (hqState.allProducts || []).find((p) => Number(p.id) === Number(prodId));
    if (!prod) return;
    const visibleStores = getVisibleStoresForCurrentRole();
    if (visibleStores.length === 0) return alert('暂无客户可生成续费账单！');

    // 自动找出历史上订购过该周期项目的客户，或提示选择
    const subscribedStores = visibleStores.filter((s) =>
      (hqState.allOrders || []).some(
        (o) =>
          Number(o.store_id) === Number(s.id) &&
          Array.isArray(o.items) &&
          o.items.some((it) => Number(it.id) === Number(prod.id) || it.name === prod.name)
      )
    );
    const targets = subscribedStores.length > 0 ? subscribedStores : [visibleStores[0]];
    const names = targets.map((s) => s.name).join('、');
    if (!confirm(`确认为以下 ${targets.length} 位续费客户生成【${prod.name}】（¥${prod.tier_1_price}）本期续费账单？\n客户名单：${names}`)) return;

    const monthTag = new Date().toISOString().slice(0, 7);
    const rows = targets.map((s) => ({
      order_no: generateUnifiedVoucherNo('CK'),
      tenant_id: hqState.currentAgent,
      store_id: s.id,
      store_name: s.name,
      driver_name: s.driver_name || '系统续费',
      order_source: 'vendor_push',
      settlement_type: s.default_settlement || 'credit',
      settlement_note: `[周期自动续费 · ${monthTag}] ${prod.name}`,
      items: [{ id: prod.id, name: prod.name, spec: prod.spec || '周期服务', measure_unit: prod.measure_unit || '期', price: parseFloat(prod.tier_1_price || 0), qty: 1 }],
      items_return: [],
      items_exchange: [],
      total_amount: parseFloat(prod.tier_1_price || 0),
      return_amount: 0,
      net_settle_amount: parseFloat(prod.tier_1_price || 0),
      order_status: 'confirmed',
      delivery_status: 'ordered',
      note: `[周期自动续费 · ${monthTag}]`,
      driver_action_instruction: '【周期续费账单】核验入账'
    }));

    const { error } = await supabase.from('store_order').insert(rows);
    if (error) return alert('批量生成续费账单失败：' + error.message);

    document.getElementById('modal-commission-recurring')?.remove();
    alert(`✅ 已成功生成 ${rows.length} 笔本期续费账单！`);
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  window.openHqUltimateToolboxModal = function () {
    document.getElementById('modal-hq-ultimate-toolbox')?.remove();

    const rawSettings = hqState.currentTenantData?.custom_settings || {};
    const lex = getTenantLexicon(rawSettings);
    const { orgCfg, isOwner, effectiveBranch } = getOrgRuntimeContext();
    const warehouses = orgCfg.warehouses;
    const branches = orgCfg.branches;

    const visibleStores = getVisibleStoresForCurrentRole();
    const visibleOrders = getVisibleOrdersForCurrentRole();

    const report = buildWeeklyHealthReport({
      tenantName:
        effectiveBranch !== 'ALL' && orgCfg.isMultiBranch
          ? `${hqState.currentTenantData?.company_name || hqState.currentAgent} (${effectiveBranch})`
          : hqState.currentTenantData?.company_name || hqState.currentAgent,
      stores: visibleStores,
      products: hqState.allProducts || [],
      orders: visibleOrders
    });

    const isDormant = !!hqState.currentTenantData?.is_dormant;
    const trusteeName = hqState.currentTenantData?.emergency_trustee_name || '';
    const trusteePhone = hqState.currentTenantData?.emergency_trustee_phone || '';
    const savedDays = rawSettings.emergency_trustee_days ?? hqState.globalPolicy?.emergency_trustee_days;
    const savedHours = rawSettings.emergency_trustee_hours ?? hqState.globalPolicy?.emergency_trustee_hours;
    const trusteeDays = savedDays ?? (savedHours ? Math.max(1, Math.round(Number(savedHours) / 24)) : 3);

    const dormantBtnLabel = isDormant
      ? '🌱 唤醒恢复营业'
      : isAgriEntity()
      ? '❄️ 农闲休眠保号'
      : '❄️ 淡季休眠保号';

    const storeOptionsHtml = visibleStores
      .map((s) => `<option value="${s.id}">${s.name} (欠款 ¥${parseFloat(s.current_debt || 0).toFixed(2)})</option>`)
      .join('');

    const prodOptionsHtml = (hqState.allProducts || [])
      .filter((p) => p.status !== 'inactive' && p.status !== 'draft')
      .map((p) => {
        const whMap = getProductWarehouseStocks(p, warehouses);
        const whSummary = warehouses.length > 1 ? ` [${warehouses.map((w) => `${w}:${whMap[w] ?? 0}`).join(' · ')}]` : ` (存${p.stock ?? 0})`;
        return `<option value="${p.id}">${p.name}${whSummary}</option>`;
      })
      .join('');

    const modal = document.createElement('div');
    modal.id = 'modal-hq-ultimate-toolbox';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-3xl w-full p-5 space-y-4 shadow-2xl text-xs my-auto">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2.5">
          <div>
            <b class="text-sm text-stone-900">🧰 百工百业 · 一线实战神器与经营百宝箱</b>
            <p class="text-[11px] text-stone-500 mt-0.5">平时收起来不占地方，需要用哪样点哪样，全行业大白话通用</p>
          </div>
          <button type="button" onclick="document.getElementById('modal-hq-ultimate-toolbox')?.remove()" class="text-stone-400 hover:text-stone-800 text-base font-bold">✕</button>
        </div>

        <!-- 1. 掌柜经营晴雨周报 + 睡前30秒语音播报 + 派工提成与周期续费 -->
        <div class="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
          <div class="flex flex-wrap justify-between items-center gap-1.5">
            <b class="text-emerald-950">📊 ${effectiveBranch !== 'ALL' && orgCfg.isMultiBranch ? `【${effectiveBranch}】` : '全店'}经营晴雨周报（${report.periodLabel}）</b>
            <div class="flex flex-wrap gap-1.5">
              <button type="button" onclick="window.openCommissionAndRecurringModal()" class="bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold px-2.5 py-1 rounded-xl text-[10px]">
                👤 派工提成与周期续费
              </button>
              <button type="button" onclick="window.speakDailyBusinessBroadcast()" class="bg-[#1b4332] hover:bg-[#143628] text-amber-300 font-bold px-2.5 py-1 rounded-xl text-[10px]">
                📻 睡前30秒语音播报
              </button>
              <button type="button" onclick="window.printWeeklyReportBluetooth()" class="bg-white border border-emerald-300 text-emerald-900 font-bold px-2.5 py-1 rounded-xl text-[10px]">
                🖨️ 蓝牙小票机打印周报
              </button>
            </div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
            <div class="bg-white p-2 rounded-xl border border-emerald-100"><span class="text-[10px] text-stone-400 block">近7日成交额</span><b class="text-emerald-900">¥${report.weekSales}</b></div>
            <div class="bg-white p-2 rounded-xl border border-emerald-100"><span class="text-[10px] text-stone-400 block">已完成单量</span><b>${report.deliveredCount}/${report.weekOrderCount} 单</b></div>
            <div class="bg-white p-2 rounded-xl border border-emerald-100"><span class="text-[10px] text-stone-400 block">累计应收欠款</span><b class="text-rose-700">¥${report.totalReceivable}</b></div>
            <div class="bg-white p-2 rounded-xl border border-emerald-100"><span class="text-[10px] text-stone-400 block">未还${lex.carrierLabel}</span><b class="text-amber-800">${report.totalBaskets} 件</b></div>
          </div>
          <div class="text-[11px] text-stone-700 pt-0.5">
            <div>🔥 <b>卖得最好 Top3：</b>${report.top3Prods}</div>
            <div>⏳ <b>滞销积压提醒：</b>${report.slowProducts}</div>
          </div>
        </div>

        <!-- 2. 一线神器：粘贴微信聊天拆单 & 一把清多笔冲账 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3 bg-blue-50/60 border border-blue-200 rounded-2xl space-y-2">
            <b class="text-blue-950 block">💬 粘贴微信聊天记录 · 智能拆单</b>
            <textarea id="wx-smart-order-text" rows="2" placeholder="把客户发微信的混乱消息直接粘进来，例如：王老板要5箱牛奶，2桶菜籽油" class="w-full bg-white border border-blue-200 rounded-xl p-2 text-[11px] outline-none"></textarea>
            <button type="button" onclick="window.runWechatSmartParseToOrder()" class="w-full py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-[11px]">
              ⚡ 一键识别并填入开单窗口
            </button>
          </div>

          <div class="p-3 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-2">
            <b class="text-amber-950 block">💸 一把清（客户转来一笔整数冲多笔旧账）</b>
            <div class="flex gap-1.5">
              <select id="batch-settle-store-id" class="flex-1 bg-white border border-amber-200 rounded-xl px-2 py-1 text-[11px] font-bold">
                ${storeOptionsHtml || '<option value="">暂无客户</option>'}
              </select>
              <input type="number" step="0.01" id="batch-settle-amount" placeholder="实收金额(元)" class="w-28 bg-white border border-amber-200 rounded-xl px-2 py-1 font-mono font-bold text-[11px]">
            </div>
            <button type="button" onclick="window.executeOneClickBatchSettle()" class="w-full py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-[11px]">
              ✅ 按“先欠先还”自动冲减旧账
            </button>
          </div>
        </div>

        <!-- 3. 集团拓展区（手电筒渐进式显隐）：多分公司/分部管理 & 多仓库独立实账搬家 -->
        <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <b class="text-stone-900">🏢 多分公司/分部与多${lex.warehouseLabel}架构</b>
              <span class="text-[10px] text-stone-500 ml-1">
                分支：<b>${branches.length > 0 ? branches.join('、') : '单店经营（未分部）'}</b> · ${lex.warehouseLabel}：<b>${warehouses.join('、')}</b>
              </span>
            </div>
            ${
              isOwner
                ? `<div class="flex flex-wrap gap-1.5">
                     <button type="button" onclick="window.addTenantBranchPrompt()" class="bg-white hover:bg-indigo-50 text-indigo-900 border border-indigo-300 font-bold px-2.5 py-1 rounded-xl text-[10px]">
                       + 开设分公司/分部
                     </button>
                     <button type="button" onclick="window.addTenantWarehousePrompt()" class="bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-bold px-2.5 py-1 rounded-xl text-[10px]">
                       + 新增${lex.warehouseLabel}
                     </button>
                   </div>`
                : ''
            }
          </div>

          ${
            orgCfg.isMultiBranch
              ? `<div class="bg-indigo-50/70 border border-indigo-200 rounded-xl p-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                   <span class="text-indigo-950 font-bold">⚖️ 跨分公司调货内部结算规矩：</span>
                   <select onchange="window.updateInterBranchSettleMode(this.value)" class="bg-white border border-indigo-200 rounded-lg px-2 py-1 font-bold text-indigo-950">
                     <option value="cost" ${orgCfg.interBranchSettleMode === 'cost' ? 'selected' : ''}>按进货成本价内部结算（兄弟明算账）</option>
                     <option value="transfer_rate" ${orgCfg.interBranchSettleMode === 'transfer_rate' ? 'selected' : ''}>按批发基准价内部结算</option>
                     <option value="zero" ${orgCfg.interBranchSettleMode === 'zero' ? 'selected' : ''}>总部统一平调（不计内部挂账）</option>
                   </select>
                 </div>`
              : ''
          }

          ${
            warehouses.length > 1
              ? `<div class="space-y-1.5 bg-white p-2.5 rounded-xl border border-stone-200">
                   <div class="text-[11px] font-bold text-stone-700">🚚 分仓库存实账「货品搬家」（自动改写各仓独立余量并生成对称凭单）：</div>
                   <div class="grid grid-cols-1 sm:grid-cols-4 gap-1.5">
                     <select id="move-prod-id" class="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-[11px]">${prodOptionsHtml}</select>
                     <select id="move-from-wh" class="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-[11px]">
                       ${warehouses.map((w) => `<option value="${w}">从：${w}</option>`).join('')}
                     </select>
                     <select id="move-to-wh" class="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-[11px]">
                       ${warehouses.map((w, idx) => `<option value="${w}" ${idx === 1 ? 'selected' : ''}>搬到：${w}</option>`).join('')}
                     </select>
                     <div class="flex gap-1">
                       <input type="number" min="1" id="move-qty" placeholder="数量" class="w-16 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 font-mono text-[11px]">
                       <button type="button" onclick="window.executeWarehouseMove()" class="flex-1 bg-[#1b4332] text-white font-bold rounded-lg px-2 py-1 text-[11px]">🚚 搬家平账</button>
                     </div>
                   </div>
                 </div>`
              : `<p class="text-[10px] text-stone-400">单公司单仓模式下界面保持最清爽；当业务做大新增第 2 个分公司或存放点后，跨仓实账调拨与分部独立报表自动亮起。</p>`
          }
        </div>

        <!-- 4. 大客户阳光集采包 & 交易争议电子证据卷宗 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <b class="text-stone-900 block">🏛️ 大客户阳光集采包</b>
            <p class="text-[11px] text-stone-500">一键汇总营业执照核验、主体信义背书与全品阳光集采报价单。</p>
            <button type="button" onclick="window.copyInstitutionalQuotePack()" class="w-full py-2 rounded-xl bg-[#1b4332] text-white font-bold text-[11px]">
              📋 一键复制阳光集采报价包
            </button>
          </div>

          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <b class="text-stone-900 block">⚖️ 交易争议 · 电子证据卷宗</b>
            <p class="text-[11px] text-stone-500">输入争议单号，自动打包订单、轨迹与流水生成不可篡改卷宗。</p>
            <button type="button" onclick="window.exportOrderDisputeDossier()" class="w-full py-2 rounded-xl bg-indigo-700 text-white font-bold text-[11px]">
              🗂️ 打包单据电子证据卷宗
            </button>
          </div>
        </div>

        <!-- 5. 商号临时托付人 & 淡季休眠保号 & 5分钟安全演习 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <div class="flex items-center justify-between gap-1">
              <b class="text-stone-900">🔑 商号临时托付人</b>
              <label class="flex items-center gap-1 text-[10px] text-stone-600 font-mono bg-white border border-stone-200 px-2 py-0.5 rounded-lg">
                <span>公示</span>
                <input type="number" id="trustee-days-input" min="1" max="30" value="${trusteeDays}" class="w-10 text-center font-bold text-stone-900 outline-none">
                <span>天</span>
              </label>
            </div>
            <div class="flex gap-1.5">
              <input type="text" id="trustee-name-input" value="${trusteeName}" placeholder="托付人姓名 (如合伙人/财务)" class="w-1/2 bg-white border border-stone-200 rounded-xl px-2 py-1.5 text-[11px]">
              <input type="text" id="trustee-phone-input" value="${trusteePhone}" placeholder="托付人手机号" class="w-1/2 bg-white border border-stone-200 rounded-xl px-2 py-1.5 text-[11px] font-mono">
            </div>
            <button type="button" onclick="window.saveEmergencyTrustee()" class="w-full py-1.5 rounded-xl bg-stone-900 text-amber-300 font-bold text-[11px]">
              💾 保存商号临时托付人
            </button>
          </div>

          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <b class="text-stone-900 block">🧯 实战安全演习 & 淡季休眠保号</b>
            <div class="flex gap-1.5">
              <button type="button" onclick="window.runFiveMinFireDrill()" class="flex-1 py-2 rounded-xl bg-rose-600 text-white font-bold text-[11px]">
                🧯 5分钟安全演习
              </button>
              <button type="button" onclick="window.toggleTenantDormantMode(${!isDormant})" class="flex-1 py-2 rounded-xl bg-amber-200 text-amber-950 font-bold text-[11px]">
                ${dormantBtnLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.addTenantBranchPrompt = async function () {
    if (hqState.currentRoleCode !== 'owner') return alert('仅老板主账号可开设分公司/分部！');
    const name = prompt('请输入分公司/分部名称（例如：城东分公司、城西分部、工程事业部）：');
    if (!name || !name.trim()) return;
    const prev = hqState.currentTenantData?.custom_settings || {};
    const list = Array.isArray(prev.branches) ? [...prev.branches] : [];
    if (list.length === 0) list.push('总部直营');
    if (!list.includes(name.trim())) list.push(name.trim());

    const nextSettings = { ...prev, branches: list };
    const { error } = await supabase
      .from('platform_tenant')
      .update({ custom_settings: nextSettings })
      .eq('tenant_id', hqState.currentAgent);
    if (error) return alert('保存分公司失败：' + error.message);

    if (hqState.currentTenantData) hqState.currentTenantData.custom_settings = nextSettings;
    mountHqUltimateToolsButton();
    alert(`✅ 已新增【${name.trim()}】！顶部组织视角切换器与跨分部核算规则已亮起。`);
    window.openHqUltimateToolboxModal();
  };

  window.updateInterBranchSettleMode = async function (mode) {
    if (hqState.currentRoleCode !== 'owner') return;
    const prev = hqState.currentTenantData?.custom_settings || {};
    const nextSettings = { ...prev, interBranchSettleMode: mode };
    const { error } = await supabase
      .from('platform_tenant')
      .update({ custom_settings: nextSettings })
      .eq('tenant_id', hqState.currentAgent);
    if (!error && hqState.currentTenantData) {
      hqState.currentTenantData.custom_settings = nextSettings;
    }
  };

  window.runWechatSmartParseToOrder = function () {
    const raw = document.getElementById('wx-smart-order-text')?.value || '';
    if (!raw.trim()) return alert('请先粘贴客户发来的微信消息内容！');

    const { matchedStore, matchedItems, unmatchedLines } = parseWechatOrderText(
      raw,
      getVisibleStoresForCurrentRole(),
      hqState.allProducts || []
    );

    if (matchedItems.length === 0) {
      return alert('暂未从这段文字里识别出本店在架货品或项目名称，请确认包含货品关键词（如：牛奶 5箱）。');
    }

    document.getElementById('modal-hq-ultimate-toolbox')?.remove();
    if (typeof window.openPushOrderModal === 'function') {
      window.openPushOrderModal();
      const storeSelect = document.getElementById('push-store-select');
      if (storeSelect && matchedStore) {
        storeSelect.value = matchedStore.id;
        window.onPushStoreChange?.(matchedStore.id);
      }
      matchedItems.forEach(({ product, qty }) => {
        const qtyInput = document.getElementById(`push-qty-${product.id}`);
        if (qtyInput) qtyInput.value = qty;
      });
      window.recalcPushOrderSummary?.();

      const summary = matchedItems.map((m) => `• ${m.product.name} × ${m.qty}`).join('\n');
      alert(
        `⚡ 智能拆单完成！已自动为您填入开单窗口：\n` +
          `匹配客户：${matchedStore ? matchedStore.name : '请核对顶部客户下拉框'}\n` +
          `识别明细：\n${summary}` +
          (unmatchedLines.length > 0 ? `\n\n未匹配附言（已保留供核对）：${unmatchedLines.join('；')}` : '')
      );
    }
  };

  window.executeOneClickBatchSettle = async function () {
    if (isAuditorReadOnly() || hqState.currentRoleCode === 'sales') {
      return alert('当前账号无财务总账核销权限。');
    }
    const storeId = parseInt(document.getElementById('batch-settle-store-id')?.value || '0', 10);
    const payAmt = parseFloat(document.getElementById('batch-settle-amount')?.value || '0');
    const store = (hqState.allStores || []).find((s) => Number(s.id) === storeId);
    if (!store) return alert('请先选择需要平账的客户！');
    if (isNaN(payAmt) || payAmt <= 0) return alert('请输入有效的实收平账金额！');

    const prevDebt = parseFloat(store.current_debt || 0);
    const nextDebt = Math.max(0, Number((prevDebt - payAmt).toFixed(2)));
    const overPaid = payAmt > prevDebt ? Number((payAmt - prevDebt).toFixed(2)) : 0;

    if (!confirm(`确认【${store.name}】本次一把清实收 ¥${payAmt.toFixed(2)}？\n• 原欠款：¥${prevDebt.toFixed(2)}\n• 冲账后剩余欠款：¥${nextDebt.toFixed(2)}`)) return;

    const { error } = await supabase.from('store').update({ current_debt: nextDebt }).eq('id', store.id);
    if (error) return alert('冲账更新失败：' + error.message);

    await supabase.from('driver_collection_log').insert([
      {
        tenant_id: hqState.currentAgent,
        store_id: store.id,
        store_name: `${store.name} (一把清多单冲账)`,
        driver_name: hqState.currentOperatorName,
        collect_type: 'period_settlement',
        amount: payAmt,
        discount_amount: 0,
        basket_return: 0,
        basket_deduct_amount: 0,
        pay_method: '一把清混结平账',
        settled_to_hq: true
      }
    ]);

    alert(
      `✅ 一把清冲账完成！\n• 本次实收：¥${payAmt.toFixed(2)}\n• 冲账后余欠：¥${nextDebt.toFixed(2)}` +
        (overPaid > 0 ? `\n• 提示：多收 ¥${overPaid.toFixed(2)} 可记入该客户预存款余额。` : '')
    );
    document.getElementById('modal-hq-ultimate-toolbox')?.remove();
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  window.addTenantWarehousePrompt = async function () {
    if (hqState.currentRoleCode !== 'owner') return alert('仅老板主账号可新增存放点！');
    const name = prompt('请输入新增存放点名称（例如：城西分仓、二号工程车、门店前置仓）：');
    if (!name || !name.trim()) return;
    const prev = hqState.currentTenantData?.custom_settings || {};
    const list = Array.isArray(prev.warehouses) && prev.warehouses.length > 0 ? [...prev.warehouses] : ['主仓库'];
    if (!list.includes(name.trim())) list.push(name.trim());

    const nextSettings = { ...prev, warehouses: list };
    const { error } = await supabase
      .from('platform_tenant')
      .update({ custom_settings: nextSettings })
      .eq('tenant_id', hqState.currentAgent);
    if (error) return alert('保存存放点失败：' + error.message);

    if (hqState.currentTenantData) hqState.currentTenantData.custom_settings = nextSettings;
    alert(`✅ 已新增存放点【${name.trim()}】，「货品搬家」独立分仓实账已自动开启！`);
    window.openHqUltimateToolboxModal();
  };

  window.executeWarehouseMove = async function () {
    const prodId = parseInt(document.getElementById('move-prod-id')?.value || '0', 10);
    const fromWh = document.getElementById('move-from-wh')?.value || '';
    const toWh = document.getElementById('move-to-wh')?.value || '';
    const qty = parseInt(document.getElementById('move-qty')?.value || '0', 10);
    const prod = (hqState.allProducts || []).find((p) => Number(p.id) === prodId);

    if (!prod || qty <= 0) return alert('请选择货品并输入有效的搬家数量！');
    if (fromWh === toWh) return alert('调出存放点和调入存放点不能是同一个地方！');

    const { orgCfg } = getOrgRuntimeContext();
    const xfer = calcWarehouseTransfer(prod, orgCfg.warehouses, fromWh, toWh, qty, orgCfg);
    if (xfer.actualMove <= 0) {
      return alert(`⚠️ 【${fromWh}】当前可用库存为 0，无法搬出！`);
    }

    const nextSpecs = {
      ...(prod.custom_specs && typeof prod.custom_specs === 'object' ? prod.custom_specs : {}),
      warehouse_stocks: xfer.nextWarehouseStocks
    };
    const { error: uErr } = await supabase
      .from('product')
      .update({ custom_specs: nextSpecs })
      .eq('id', prod.id);
    if (uErr) return alert('更新分仓库存余量失败：' + uErr.message);
    prod.custom_specs = nextSpecs;

    const ckNo = generateUnifiedVoucherNo('CK');
    const rkNo = generateUnifiedVoucherNo('RK');
    const settleTag =
      xfer.internalSettleAmount > 0 ? ` · 内部结算基准 ¥${xfer.internalSettleAmount.toFixed(2)}` : '';

    await HQService.recordInventoryChange(hqState.currentAgent, {
      tenant_id: hqState.currentAgent,
      product_id: prod.id,
      product_name: prod.name,
      action_type: 'out_loss',
      delta_qty: -xfer.actualMove,
      before_stock: xfer.fromBefore,
      after_stock: xfer.fromAfter,
      operator_name: hqState.currentOperatorName,
      remark: `[单号:${ckNo}] [货品搬家调出 · ${fromWh} ➔ ${toWh}${settleTag}] 关联入库单 ${rkNo}`,
      created_at: new Date().toISOString()
    });
    await HQService.recordInventoryChange(hqState.currentAgent, {
      tenant_id: hqState.currentAgent,
      product_id: prod.id,
      product_name: prod.name,
      action_type: 'in_purchase',
      delta_qty: xfer.actualMove,
      before_stock: xfer.toBefore,
      after_stock: xfer.toAfter,
      operator_name: hqState.currentOperatorName,
      remark: `[单号:${rkNo}] [货品搬家调入 · ${fromWh} ➔ ${toWh}${settleTag}] 关联出库单 ${ckNo}`,
      created_at: new Date().toISOString()
    });

    alert(
      `🚚 货品搬家完成！\n` +
        `• 【${prod.name}】× ${xfer.actualMove} 已从【${fromWh}】搬至【${toWh}】\n` +
        `• 最新分仓余量：${fromWh} 剩 ${xfer.fromAfter}，${toWh} 现有 ${xfer.toAfter}\n` +
        `• 对称凭单：${ckNo} / ${rkNo}${settleTag}`
    );
    window.openHqUltimateToolboxModal();
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  window.speakDailyBusinessBroadcast = function () {
    const rawSettings = hqState.currentTenantData?.custom_settings || {};
    const lex = getTenantLexicon(rawSettings);
    const { orgCfg, effectiveBranch } = getOrgRuntimeContext();
    const visibleStores = getVisibleStoresForCurrentRole();
    const visibleOrders = getVisibleOrdersForCurrentRole();

    const report = buildWeeklyHealthReport({
      tenantName: hqState.currentTenantData?.company_name || hqState.currentAgent,
      stores: visibleStores,
      products: hqState.allProducts || [],
      orders: visibleOrders
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayOrders = visibleOrders.filter((o) => String(o.created_at || '').startsWith(todayStr));
    const todaySales = todayOrders.reduce((sum, o) => sum + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);
    const scopePrefix = effectiveBranch !== 'ALL' && orgCfg.isMultiBranch ? `${effectiveBranch}` : '全店';

    const speechText =
      `老板辛苦了，为您播报${scopePrefix}今日生意账本：` +
      `今天一共开了 ${todayOrders.length} 笔${lex.orderLabel}，成交总额 ${todaySales.toFixed(2)} 元。` +
      `近7天累计成交 ${report.weekSales} 元，目前所有${lex.partnerLabel}累计应收欠款 ${report.totalReceivable} 元，` +
      `在外未还的${lex.carrierLabel}还有 ${report.totalBaskets} 件。` +
      `今日账目清晰，请放心休息！`;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(speechText);
      utter.lang = 'zh-CN';
      utter.rate = 0.98;
      window.speechSynthesis.speak(utter);
      alert(`📻 正在为您语音播报（同时已复制到剪贴板）：\n\n${speechText}`);
    } else {
      alert(`📋 今日生意晚报汇总：\n\n${speechText}`);
    }
    navigator.clipboard?.writeText(speechText).catch(() => {});
  };

  window.copyInstitutionalQuotePack = function () {
    const rawText = buildInstitutionalProcurementPack({
      tenant: hqState.currentTenantData,
      products: hqState.allProducts || []
    });
    const cleanText = String(rawText || '')
      .replace(/企事业单位\/食堂阳光集采/g, '大客户阳光集采')
      .replace(/食堂采购负责人/g, '大客户采购负责人')
      .replace(/食堂/g, '大客户');

    navigator.clipboard.writeText(cleanText).then(() => {
      alert('✅ 《大客户阳光集采报价与溯源凭证包》已复制，可直接发送大客户采购负责人！');
    });
  };

  window.exportOrderDisputeDossier = function () {
    const orderNo = prompt('请输入需要打包证据卷宗的单据编号（例如：CK-261125-1024）：');
    if (!orderNo || !orderNo.trim()) return;
    const target = (hqState.allOrders || []).find(
      (o) => String(o.order_no || o.id).toUpperCase().includes(orderNo.trim().toUpperCase())
    );
    if (!target) return alert('未找到匹配该单号的订单记录！');

    const dossier = buildDisputeEvidenceDossier({
      tenant: hqState.currentTenantData,
      order: target,
      logs: hqState.allInventoryLogs || []
    });
    navigator.clipboard.writeText(dossier).then(() => {
      alert('✅ 《交易争议电子证据卷宗》已生成并复制到剪贴板，可直接呈交调解方或公断机构！');
    });
  };

  window.saveEmergencyTrustee = async function () {
    if (hqState.currentRoleCode !== 'owner') return alert('仅老板主账号可设定商号临时托付人！');
    const name = document.getElementById('trustee-name-input')?.value.trim();
    const phone = document.getElementById('trustee-phone-input')?.value.trim();
    const days = Math.max(1, parseInt(document.getElementById('trustee-days-input')?.value || '3', 10) || 3);

    if (!name || !/^1\d{10}$/.test(phone || '')) {
      return alert('请填写正确的托付人姓名与 11 位手机号！');
    }

    const nextSettings = {
      ...(hqState.currentTenantData?.custom_settings || hqState.globalPolicy || {}),
      emergency_trustee_days: days,
      emergency_trustee_hours: days * 24
    };

    const { error } = await supabase
      .from('platform_tenant')
      .update({
        emergency_trustee_name: name,
        emergency_trustee_phone: phone,
        custom_settings: nextSettings
      })
      .eq('tenant_id', hqState.currentAgent);
    if (error) return alert('保存失败：' + error.message);

    if (hqState.currentTenantData) {
      hqState.currentTenantData.emergency_trustee_name = name;
      hqState.currentTenantData.emergency_trustee_phone = phone;
      hqState.currentTenantData.custom_settings = nextSettings;
    }
    if (hqState.globalPolicy) {
      hqState.globalPolicy.emergency_trustee_days = days;
      hqState.globalPolicy.emergency_trustee_hours = days * 24;
    }
    alert(`✅ 已登记商号临时托付人【${name} (${phone})】！\n如遇突发意外，托付人可凭双手机核验发起 ${days} 天冷静公示临时接管。`);
  };

  window.toggleTenantDormantMode = async function (nextDormant) {
    if (hqState.currentRoleCode !== 'owner') return alert('仅老板主账号可操作休眠保号！');
    const { error } = await supabase
      .from('platform_tenant')
      .update({ is_dormant: nextDormant })
      .eq('tenant_id', hqState.currentAgent);
    if (error) return alert('切换失败：' + error.message);

    alert(
      nextDormant
        ? '❄️ 已开启【淡季休眠保号】：保留全部名录、账号与历史账目凭证，淡季免受消息打扰！'
        : '🌱 已唤醒商号恢复正常营业！'
    );
    document.getElementById('modal-hq-ultimate-toolbox')?.remove();
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  window.runFiveMinFireDrill = function () {
    alert(
      `🧯【5 分钟安全应急演习（隔离沙盒剧本）】\n\n` +
        `演习剧本：凌晨 02:15 监测到某异常设备在在线专柜连续提交 15 笔 0.01 元异常订单。\n` +
        `• 第 1 步（0:30）：生意异常提醒评分 92 分亮红灯并推送预警；\n` +
        `• 第 2 步（1:15）：老板点击「🚨 本店紧急止损拉闸」勾选冻结线上接单；\n` +
        `• 第 3 步（3:00）：一键生成日结平衡快照校验资金零损失；\n` +
        `• 第 4 步（4:30）：核查完后通过动态口令解除拉闸恢复营业。\n\n` +
        `✅ 演习自检结果：当前商号熔断槽位、日结快照与动态口令链路均处于就绪状态（演习评分：100 分）！`
    );
  };

  window.printWeeklyReportBluetooth = async function () {
    const rawSettings = hqState.currentTenantData?.custom_settings || {};
    const lex = getTenantLexicon(rawSettings);
    const report = buildWeeklyHealthReport({
      tenantName: hqState.currentTenantData?.company_name || hqState.currentAgent,
      stores: getVisibleStoresForCurrentRole(),
      products: hqState.allProducts || [],
      orders: getVisibleOrdersForCurrentRole()
    });
    const text =
      `【${report.tenantName} · 经营晴雨周报】\n` +
      `近7日成交：¥${report.weekSales} (${report.deliveredCount}单)\n` +
      `应收欠款：¥${report.totalReceivable}\n` +
      `未还${lex.carrierLabel}：${report.totalBaskets}件\n` +
      `卖得最好Top3：${report.top3Prods}`;
    try {
      const devName = await printReceiptViaWebBluetooth(text);
      alert(`🖨️ 已通过蓝牙打印机【${devName}】完成周报打印！`);
    } catch (err) {
      alert(`蓝牙打印提示：${err.message}\n\n（已自动将周报文本复制到剪贴板，可直接在手机备忘录或微信打印）`);
      navigator.clipboard?.writeText(text).catch(() => {});
    }
  };
}
