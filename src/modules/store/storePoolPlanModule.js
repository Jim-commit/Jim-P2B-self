import { supabase } from '../../lib/supabase.js';
import {
  storeState,
  safeSetText,
  getStorePriceInfo,
  notifyVendorWebhook
} from './storeState.js';

export function renderPendingCollectionBanner() {
  let banner = document.getElementById('store-pending-audit-banner');
  const headerEl = document.querySelector('header');
  if (!banner && headerEl) {
    banner = document.createElement('div');
    banner.id = 'store-pending-audit-banner';
    banner.className = 'hidden mx-3 mt-2.5 bg-amber-50 border border-amber-300 text-amber-950 p-2.5 rounded-2xl text-[11px] leading-relaxed shadow-2xs';
    headerEl.insertAdjacentElement('afterend', banner);
  }
  if (!banner) return;

  if (storeState.pendingAuditCollections.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  const totalPending = storeState.pendingAuditCollections.reduce((s, x) => s + parseFloat(x.amount || 0), 0);
  banner.classList.remove('hidden');
  banner.innerHTML =
    `<b>⏳ 回款核账安心提示：</b>您有 <b>${storeState.pendingAuditCollections.length}</b> 笔回款（合计 <b class="font-mono text-emerald-900">¥${totalPending.toFixed(2)}</b>）已登记提交，正等待供货方财务点验入库（已留存电子凭据，请勿重复交款）。`;
}

function getFilteredSelfStatement() {
  const startDate = document.getElementById('self-stmt-start')?.value || '2000-01-01';
  const endDate = document.getElementById('self-stmt-end')?.value || '2099-12-31';
  const startTs = new Date(`${startDate}T00:00:00`).getTime();
  const endTs = new Date(`${endDate}T23:59:59`).getTime();

  const orders = storeState.cachedSelfStatementOrders.filter((o) => {
    const t = o.created_at ? new Date(o.created_at).getTime() : 0;
    return t >= startTs && t <= endTs;
  });

  const orderSum = orders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
  const returnSum = orders.reduce((s, o) => s + parseFloat(o.return_amount || 0), 0);
  const netSum = orders.reduce((s, o) => s + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);

  return { startDate, endDate, orders, orderSum, returnSum, netSum };
}

async function loadLocalPoolList() {
  const listEl = document.getElementById('local-pool-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="py-8 text-center text-stone-400">正在查探同城同行互调余货...</div>';

  const { data, error } = await supabase
    .from('local_inventory_pool')
    .select('*')
    .eq('tenant_id', storeState.currentAgent)
    .in('status', ['open', 'claimed'])
    .order('id', { ascending: false })
    .limit(30);

  if (error) {
    listEl.innerHTML = `<div class="py-6 text-center text-rose-500">读取互调池异常：${error.message}</div>`;
    return;
  }

  const rows = data || [];
  if (rows.length === 0) {
    listEl.innerHTML = '<div class="py-8 text-center text-stone-400">当前同城互调池暂无挂出余货，若有临期/富余货品可点上方「挂出本店余货」调剂。</div>';
    return;
  }

  const myStoreId = storeState.currentStore?.id || 0;
  listEl.innerHTML = rows
    .map((item) => {
      const isMine = Number(item.from_store_id) === Number(myStoreId);
      const isOpen = item.status === 'open';
      return `
        <div class="p-3 bg-stone-50 border ${isOpen ? 'border-emerald-200' : 'border-stone-200 opacity-75'} rounded-2xl space-y-1.5">
          <div class="flex justify-between items-start gap-2">
            <div>
              <b class="text-xs text-stone-900">${item.product_name}</b>
              <span class="text-[10px] text-stone-500 block font-mono">规格: ${item.spec || '整装'} · 余量: <b class="text-emerald-900">${item.qty} ${item.measure_unit || '件'}</b></span>
            </div>
            <div class="text-right shrink-0">
              <b class="text-sm font-mono font-bold text-rose-700">¥${parseFloat(item.transfer_price || 0).toFixed(2)}</b>
              <span class="text-[9px] text-stone-400 block">/${item.measure_unit || '件'}</span>
            </div>
          </div>

          <div class="text-[10px] text-stone-600 bg-white px-2.5 py-1 rounded-xl border border-stone-100">
            🏪 挂出门店：<b>${item.from_store_name}</b> ${item.reason ? `· ${item.reason}` : ''}
          </div>

          <div class="flex justify-between items-center pt-1">
            <span class="text-[10px] font-bold ${isOpen ? 'text-emerald-800' : 'text-amber-800'}">
              ${isOpen ? '🟢 待认领调剂' : `🚚 已由【${item.to_store_name || '同行门店'}】认领待捎带`}
            </span>
            ${
              isOpen && !isMine
                ? `<button type="button" onclick="window.claimLocalPoolItem(${item.id})" class="px-3 py-1 rounded-xl bg-[#1b4332] hover:bg-[#143628] text-white text-[10px] font-bold shadow active:scale-95 transition">🤝 认领调入本店</button>`
                : isOpen && isMine
                ? `<button type="button" onclick="window.cancelLocalPoolItem(${item.id})" class="px-2.5 py-1 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-700 text-[10px] font-bold">撤回挂单</button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadMyDemandPlans() {
  const listEl = document.getElementById('my-demand-plans-list');
  if (!listEl || !storeState.currentStore) return;

  const { data } = await supabase
    .from('demand_forecast_plan')
    .select('*')
    .eq('tenant_id', storeState.currentAgent)
    .eq('store_id', storeState.currentStore.id)
    .order('id', { ascending: false })
    .limit(10);

  const rows = data || [];
  if (rows.length === 0) {
    listEl.innerHTML = '<div class="text-center py-3 text-stone-400">暂无历史用度计划记录</div>';
    return;
  }

  listEl.innerHTML = rows
    .map((p) => {
      const items = Array.isArray(p.items) ? p.items : [];
      const itemStr = items.map((i) => `${i.name}x${i.qty}${i.unit || '件'}`).join('、');
      const statusMap = {
        submitted: '<span class="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-bold">⏳ 已提报待排产</span>',
        scheduled: '<span class="bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">✅ 产区已纳入排产</span>',
        fulfilled: '<span class="bg-stone-200 text-stone-700 px-1.5 py-0.2 rounded">📦 已履约配发</span>'
      };
      return `
        <div class="p-2.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1 text-[11px]">
          <div class="flex justify-between items-center">
            <b class="text-stone-800">${p.plan_cycle} · 期望 ${p.expected_date || '近期'}</b>
            ${statusMap[p.status] || statusMap.submitted}
          </div>
          <div class="text-stone-600">用度：${itemStr}</div>
          ${p.note ? `<div class="text-[10px] text-stone-400">备注：${p.note}</div>` : ''}
        </div>
      `;
    })
    .join('');
}

export function initPoolPlanBindings() {
  // 1. 本店云端扩充货架码
  window.openCloudShelfModal = function () {
    window.closeAllMenus();
    const storeName = storeState.currentStore?.name || (document.getElementById('store-title')?.innerText || '').trim() || '厚德便民门店';
    const storeIdParam = storeState.currentStore?.id ? `?ref=${encodeURIComponent(storeState.currentStore.id)}` : '';
    const cloudShelfUrl = `${window.location.origin}/mall.html${storeIdParam}`;

    safeSetText('cloud-shelf-store-title', `${storeName} · 云端扩充货架`);
    safeSetText('cloud-shelf-link-text', cloudShelfUrl);
    const qrImg = document.getElementById('cloud-shelf-qr-img');
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(cloudShelfUrl)}`;
    }
    window.openModal('cloud-shelf-modal');
  };

  window.copyCloudShelfLink = function () {
    const storeName = storeState.currentStore?.name || (document.getElementById('store-title')?.innerText || '').trim() || '厚德便民门店';
    const link = document.getElementById('cloud-shelf-link-text')?.innerText || `${window.location.origin}/mall.html`;
    const shareText = `【${storeName} · 云端扩充货架】店里摆不下的源头整箱良品、产区特产与按需定制品，扫码直达源头合作社与工坊选货，支持送到本店自提验货：${link}`;
    navigator.clipboard.writeText(shareText).then(() => {
      alert('✅ 本店云端扩充货架分享文案与链接已复制！街坊扫码预订，服务润利全额归属本店。');
    });
  };

  // 2. 推荐同行互助裂变
  window.openReferralModal = function () {
    window.closeAllMenus();
    const storeName = storeState.currentStore?.name || (document.getElementById('store-title')?.innerText || '').trim() || '厚德便民门店';
    const curAgentObj = storeState.myAgents.find((a) => a.id === storeState.currentAgent);
    const agentName = curAgentObj?.name || storeState.currentAgent;
    const refUrl = `${window.location.origin}/suppliers.html?t=${encodeURIComponent(storeState.currentAgent)}&ref=${encodeURIComponent(storeName)}`;

    safeSetText('ref-store-title', `${storeName} · 诚意推荐`);
    safeSetText('ref-agent-subtitle', `携手【${agentName}】源头平准直供 · 送货到店`);
    const qrImg = document.getElementById('ref-qr-img');
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(refUrl)}`;
    }
    window.openModal('referral-modal');
  };

  window.copyReferralShareText = function () {
    const storeName = storeState.currentStore?.name || (document.getElementById('store-title')?.innerText || '').trim() || '厚德便民门店';
    const curAgentObj = storeState.myAgents.find((a) => a.id === storeState.currentAgent);
    const agentName = curAgentObj?.name || storeState.currentAgent;
    const refUrl = `${window.location.origin}/suppliers.html?t=${encodeURIComponent(storeState.currentAgent)}&ref=${encodeURIComponent(storeName)}`;
    const shareText = `【同行推荐】我们门店一直在用【${agentName}】的货，源头合作社与工坊直供、工价实在、送货准时！通过我的专属链接预约送货师傅免费上门送样：${refUrl}`;
    navigator.clipboard.writeText(shareText).then(() => {
      alert('✅ 专属同行推荐话术与链接已复制，可直接转发微信好友或同业群！');
    });
  };

  // 3. 本店周期电子对账单
  window.openStoreSelfStatementModal = async function () {
    window.closeAllMenus();
    if (!storeState.currentStore) return alert('当前供货方尚未绑定有效门店档案，无法生成电子对账单！');

    const curAgentObj = storeState.myAgents.find((a) => a.id === storeState.currentAgent);
    safeSetText('self-stmt-agent-label', `供货方：${curAgentObj?.name || storeState.currentAgent}`);

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    const startEl = document.getElementById('self-stmt-start');
    const endEl = document.getElementById('self-stmt-end');
    if (startEl && !startEl.value) startEl.value = firstDay;
    if (endEl && !endEl.value) endEl.value = today;

    const [ordersRes, pendingLogsRes] = await Promise.all([
      supabase
        .from('store_order')
        .select('*')
        .eq('store_id', storeState.currentStore.id)
        .eq('tenant_id', storeState.currentAgent)
        .neq('order_source', 'online_mall')
        .neq('order_status', 'cancelled')
        .order('id', { ascending: false })
        .limit(100),
      supabase
        .from('driver_collection_log')
        .select('*')
        .eq('store_id', storeState.currentStore.id)
        .eq('tenant_id', storeState.currentAgent)
        .eq('settled_to_hq', false)
        .order('id', { ascending: false })
    ]);

    storeState.cachedSelfStatementOrders = ordersRes.data || [];
    storeState.pendingAuditCollections = pendingLogsRes.data || [];
    renderPendingCollectionBanner();

    window.renderStoreSelfStatement();
    window.openModal('store-self-statement-modal');
  };

  window.renderStoreSelfStatement = function () {
    const { orders, orderSum, returnSum, netSum } = getFilteredSelfStatement();
    const curDebt = parseFloat(storeState.currentStore?.current_debt || 0);
    const baskets = parseInt(storeState.currentStore?.carrier_hold_count || storeState.currentStore?.basket_count || 0);

    safeSetText('self-stmt-order-sum', `¥${orderSum.toFixed(2)}`);
    safeSetText('self-stmt-return-sum', `-¥${returnSum.toFixed(2)}`);
    safeSetText('self-stmt-net-sum', `¥${netSum.toFixed(2)}`);
    safeSetText('self-stmt-debt-sum', `¥${curDebt.toFixed(2)}`);
    safeSetText('self-stmt-basket-label', `载具借存：${baskets} 件`);

    const listEl = document.getElementById('self-stmt-orders-list');
    if (!listEl) return;

    const pendingHtml = storeState.pendingAuditCollections
      .map(
        (c) => `
        <div class="py-2 bg-amber-50/80 px-2 rounded-xl my-1 flex justify-between items-center gap-2 border border-amber-200">
          <div>
            <b class="text-amber-950">⏳ 拜访/随车回款待财务核账</b>
            <span class="text-[10px] text-amber-800 block">${new Date(c.created_at).toLocaleString()} · 经手：${c.driver_name} (${c.pay_method})</span>
          </div>
          <b class="font-mono text-emerald-900 font-bold shrink-0">¥${parseFloat(c.amount || 0).toFixed(2)}</b>
        </div>
      `
      )
      .join('');

    if (orders.length === 0 && !pendingHtml) {
      listEl.innerHTML = '<div class="py-6 text-center text-stone-400">所选日期区间内暂无往来单据。</div>';
      return;
    }

    const ordersHtml = orders
      .map((o) => {
        const items = Array.isArray(o.items) ? o.items : [];
        const itemSummary = items.map((i) => `${i.name}x${i.qty}`).join('、') || '调退冲抵单';
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
                ${o.delivery_status === 'delivered' ? '已交割' : '排单/配送中'}
              </span>
            </div>
          </div>
        `;
      })
      .join('');

    listEl.innerHTML = pendingHtml + ordersHtml;
  };

  window.copyStoreSelfStatementText = function () {
    const { startDate, endDate, orders, orderSum, returnSum, netSum } = getFilteredSelfStatement();
    const curAgentObj = storeState.myAgents.find((a) => a.id === storeState.currentAgent);
    const storeName = storeState.currentStore?.name || '厚德便民门店';
    const curDebt = parseFloat(storeState.currentStore?.current_debt || 0);
    const baskets = parseInt(storeState.currentStore?.carrier_hold_count || storeState.currentStore?.basket_count || 0);

    const lines = [
      `【${storeName} · 往来核账明细单】`,
      `合作供货方：${curAgentObj?.name || storeState.currentAgent}`,
      `核对周期：${startDate} 至 ${endDate}`,
      `------------------------`,
      `• 区间进货总额：¥${orderSum.toFixed(2)}`,
      `• 区间退验冲抵：-¥${returnSum.toFixed(2)}`,
      `• 区间发生净额：¥${netSum.toFixed(2)}（共 ${orders.length} 笔）`,
      `• 当前在账余额：¥${curDebt.toFixed(2)}`,
      `• 周转载具借存：${baskets} 件`,
      `------------------------`,
      ...orders.map((o, idx) => {
        const d = new Date(o.created_at).toLocaleDateString();
        const net = parseFloat(o.net_settle_amount || o.total_amount || 0).toFixed(2);
        const itemStr = (Array.isArray(o.items) ? o.items : []).map((i) => `${i.name}x${i.qty}`).join('、');
        return `${idx + 1}. [${d}] #${o.order_no || o.id} ¥${net} (${itemStr || '调退'})`;
      })
    ];

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      alert('✅ 本店电子对账单明细已复制到剪贴板！');
    });
  };

  window.confirmStoreSelfStatement = async function () {
    if (!storeState.currentStore) return;
    const { startDate, endDate, netSum } = getFilteredSelfStatement();
    const curDebt = parseFloat(storeState.currentStore.current_debt || 0);
    const storeName = storeState.currentStore.name || '厚德便民门店';

    if (
      !confirm(
        `确认核对无误？\n\n` +
          `• 对账周期：${startDate} 至 ${endDate}\n` +
          `• 区间发生净额：¥${netSum.toFixed(2)}\n` +
          `• 当前在账应结余额：¥${curDebt.toFixed(2)}\n\n` +
          `点击确定将向供货方调度台回传「掌柜已核对确认」回执。`
      )
    ) {
      return;
    }

    await notifyVendorWebhook(
      storeState.currentAgent,
      `🧾【门店对账确认回执】\n合作门店：${storeName}\n对账周期：${startDate} 至 ${endDate}\n区间发生净额：¥${netSum.toFixed(2)} | 当前在账余额：¥${curDebt.toFixed(2)}\n门店掌柜已在手机端核对账目无误！`
    );

    alert(`🎉 已确认本期对账单无误！\n核对回执已同步传达供货方财务调度台，和合共生！`);
    window.closeModal('store-self-statement-modal');
  };

  // 4. 同城余缺互调池
  window.openLocalPoolModal = async function () {
    window.openModal('local-pool-modal');
    window.switchLocalPoolTab('browse');

    const selectEl = document.getElementById('pool-prod-select');
    if (selectEl) {
      selectEl.innerHTML =
        '<option value="">-- 自由手填品名，或点选在架良品 --</option>' +
        storeState.allProducts
          .map((p) => {
            const { price } = getStorePriceInfo(p);
            return `<option value="${p.id}" data-name="${p.name}" data-spec="${p.spec || '整装'}" data-price="${price}">${p.name} (${p.spec || '整装'} · ¥${price.toFixed(2)})</option>`;
          })
          .join('');
    }

    await loadLocalPoolList();
  };

  window.switchLocalPoolTab = function (tab) {
    const browsePane = document.getElementById('pool-pane-browse');
    const publishPane = document.getElementById('pool-pane-publish');
    const btnBrowse = document.getElementById('pool-tab-browse');
    const btnPublish = document.getElementById('pool-tab-publish');

    if (tab === 'browse') {
      browsePane?.classList.remove('hidden');
      publishPane?.classList.add('hidden');
      if (btnBrowse) btnBrowse.className = 'flex-1 py-2 rounded-xl bg-[#1b4332] text-white shadow transition';
      if (btnPublish) btnPublish.className = 'flex-1 py-2 rounded-xl text-stone-600 hover:text-stone-900 transition';
      loadLocalPoolList();
    } else {
      browsePane?.classList.add('hidden');
      publishPane?.classList.remove('hidden');
      if (btnPublish) btnPublish.className = 'flex-1 py-2 rounded-xl bg-[#1b4332] text-white shadow transition';
      if (btnBrowse) btnBrowse.className = 'flex-1 py-2 rounded-xl text-stone-600 hover:text-stone-900 transition';
    }
  };

  window.onSelectPoolProduct = function (prodId) {
    const selectEl = document.getElementById('pool-prod-select');
    if (!selectEl || !prodId) return;
    const opt = selectEl.options[selectEl.selectedIndex];
    if (!opt) return;
    document.getElementById('pool-prod-name').value = opt.dataset.name || '';
    document.getElementById('pool-prod-spec').value = opt.dataset.spec || '';
    document.getElementById('pool-prod-price').value = opt.dataset.price || '';
  };

  window.submitLocalPoolOffer = async function (e) {
    e.preventDefault();
    if (!storeState.currentStore) return alert('当前供货方尚未绑定有效门店档案，无法发起同城余货调剂！');

    // 动作级精准熔断检查：同城余缺互调池流转 (pool_exchange)
    if (window.checkBusinessCircuit && !(await window.checkBusinessCircuit('pool_exchange', storeState.currentAgent))) {
      return;
    }

    const prodIdVal = document.getElementById('pool-prod-select')?.value;
    const prodName = document.getElementById('pool-prod-name').value.trim();
    const spec = document.getElementById('pool-prod-spec').value.trim() || '整装';
    const qty = parseInt(document.getElementById('pool-prod-qty').value) || 1;
    const transferPrice = parseFloat(document.getElementById('pool-prod-price').value) || 0;
    const reason = document.getElementById('pool-prod-reason').value.trim();

    if (!prodName || qty <= 0) return alert('请完整填写余货品名与调剂数量！');

    const { error } = await supabase.from('local_inventory_pool').insert([
      {
        tenant_id: storeState.currentAgent,
        from_store_id: storeState.currentStore.id,
        from_store_name: storeState.currentStore.name || '厚德便民门店',
        product_id: prodIdVal ? parseInt(prodIdVal) : null,
        product_name: prodName,
        spec,
        measure_unit: '件',
        qty,
        transfer_price: transferPrice,
        reason,
        driver_name: storeState.currentStore.driver_name || '老张师傅',
        status: 'open'
      }
    ]);

    if (error) return alert('挂入互调池失败：' + error.message);

    await notifyVendorWebhook(
      storeState.currentAgent,
      `🔄【同城余缺互调挂单】\n挂出门店：${storeState.currentStore.name}\n调剂良品：${prodName} (${spec}) x ${qty}件\n调剂让利价：¥${transferPrice.toFixed(2)}/件\n请调度中枢留意顺路捎带调剂！`
    );

    alert('✅ 已成功挂入同城余缺互调池！同行门店认领后将由送货师傅顺路捎带交割。');
    document.getElementById('pool-pane-publish')?.reset();
    window.switchLocalPoolTab('browse');
  };

  window.claimLocalPoolItem = async function (poolId) {
    if (!storeState.currentStore) return alert('当前供货方尚未绑定有效门店档案，无法认领余货！');
    const { data: item } = await supabase.from('local_inventory_pool').select('*').eq('id', poolId).single();
    if (!item || item.status !== 'open') return alert('该笔余货已被其他同行认领或撤回！');

    const totalVal = (parseFloat(item.transfer_price || 0) * parseInt(item.qty || 1)).toFixed(2);

    // 动作级精准熔断检查：同城余缺互调认领成单 (pool_exchange) + 大额限流
    if (
      window.checkBusinessCircuit &&
      !(await window.checkBusinessCircuit('pool_exchange', storeState.currentAgent, { amount: parseFloat(totalVal) }))
    ) {
      return;
    }

    if (
      !confirm(
        `确认认领同城余货调剂？\n\n` +
          `• 调出门店：${item.from_store_name}\n` +
          `• 调剂货品：${item.product_name} (${item.spec || '整装'}) x ${item.qty}${item.measure_unit || '件'}\n` +
          `• 调剂总值：¥${totalVal}\n\n` +
          `确认后将通知送货师傅顺路从【${item.from_store_name}】取货送达本店！`
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from('local_inventory_pool')
      .update({
        to_store_id: storeState.currentStore.id,
        to_store_name: storeState.currentStore.name || '厚德便民门店',
        status: 'claimed',
        claimed_at: new Date().toISOString()
      })
      .eq('id', poolId)
      .eq('status', 'open');

    if (error) return alert('认领失败：' + error.message);

    const swapOrderPayload = {
      order_no: `SWAP-${Date.now().toString().slice(-6)}`,
      tenant_id: storeState.currentAgent,
      store_id: storeState.currentStore.id,
      store_name: storeState.currentStore.name || '厚德便民门店',
      driver_name: storeState.currentStore.driver_name || item.driver_name || '老张师傅',
      settlement_type: 'credit',
      settlement_note: `同城余缺互调平账（调出方：${item.from_store_name}）`,
      items: [
        {
          id: item.product_id || 0,
          name: `[同城调剂] ${item.product_name}`,
          spec: item.spec || '整装',
          measure_unit: item.measure_unit || '件',
          price: parseFloat(item.transfer_price || 0),
          qty: parseInt(item.qty || 1)
        }
      ],
      total_amount: parseFloat(totalVal),
      return_amount: 0,
      net_settle_amount: parseFloat(totalVal),
      order_status: 'confirmed',
      delivery_status: 'ordered',
      note: `【同城余缺互调】从【${item.from_store_name}】顺路取货送至【${storeState.currentStore.name}】`,
      driver_action_instruction: `顺路先去【${item.from_store_name}】取调剂货 ${item.product_name}x${item.qty}，再送至【${storeState.currentStore.name}】`
    };

    let { error: swapOrderErr } = await supabase.from('store_order').insert([swapOrderPayload]);
    if (swapOrderErr) {
      const fallbackPayload = { ...swapOrderPayload };
      delete fallbackPayload.driver_action_instruction;
      delete fallbackPayload.settlement_note;
      delete fallbackPayload.net_settle_amount;
      delete fallbackPayload.return_amount;
      const retryRes = await supabase.from('store_order').insert([fallbackPayload]);
      swapOrderErr = retryRes.error;
    }

    if (swapOrderErr) {
      alert(`⚠️ 互调池已认领，但同步生成随车顺路单时出现异常：${swapOrderErr.message}\n请联系供货调度中枢安排随车捎带。`);
      await loadLocalPoolList();
      return;
    }

    await notifyVendorWebhook(
      storeState.currentAgent,
      `🤝【同城余缺互调已成单】\n调出门店：${item.from_store_name}\n调入门店：${storeState.currentStore.name}\n货品：${item.product_name} x ${item.qty}件（¥${totalVal}）\n已生成随车顺路捎带单，请安排送货师傅取送！`
    );

    alert('🎉 认领成功！已生成随车顺路调剂单并通知供货中枢与送货师傅。');
    await loadLocalPoolList();
  };

  window.cancelLocalPoolItem = async function (poolId) {
    if (!confirm('确认撤回该笔余货挂单？')) return;
    await supabase.from('local_inventory_pool').update({ status: 'cancelled' }).eq('id', poolId);
    await loadLocalPoolList();
  };

  // 5. 真实用度计划单
  window.openDemandPlanModal = async function () {
    window.openModal('demand-plan-modal');

    const dateInput = document.getElementById('plan-expected-date');
    if (dateInput && !dateInput.value) {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      dateInput.value = tomorrow;
    }

    const rowsContainer = document.getElementById('demand-plan-rows');
    if (rowsContainer && rowsContainer.children.length === 0) {
      window.addDemandPlanRow();
      window.addDemandPlanRow();
    }

    await loadMyDemandPlans();
  };

  window.addDemandPlanRow = function () {
    const rowsContainer = document.getElementById('demand-plan-rows');
    if (!rowsContainer) return;

    const datalistId = 'plan-prod-datalist';
    if (!document.getElementById(datalistId)) {
      const dl = document.createElement('datalist');
      dl.id = datalistId;
      dl.innerHTML = storeState.allProducts.map((p) => `<option value="${p.name}">`).join('');
      document.body.appendChild(dl);
    }

    const row = document.createElement('div');
    row.className = 'flex items-center gap-1.5 demand-plan-item-row';
    row.innerHTML = `
      <input type="text" list="${datalistId}" placeholder="品名（选或填）" class="plan-item-name flex-1 bg-white border border-amber-200 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-stone-800 outline-none">
      <input type="number" min="1" value="10" placeholder="数量" class="plan-item-qty w-16 bg-white border border-amber-200 rounded-xl px-2 py-1.5 text-[11px] font-mono font-bold text-center outline-none">
      <input type="text" value="件" placeholder="单位" class="plan-item-unit w-12 bg-white border border-amber-200 rounded-xl px-1.5 py-1.5 text-[11px] text-center outline-none">
      <button type="button" onclick="this.parentElement.remove()" class="text-stone-400 hover:text-rose-600 px-1 text-xs">✕</button>
    `;
    rowsContainer.appendChild(row);
  };

  window.submitDemandPlan = async function (e) {
    e.preventDefault();
    if (!storeState.currentStore) return alert('当前供货方尚未绑定有效门店档案，无法提报真实用度计划！');

    // 动作级精准熔断检查：门店提报计划单 (store_write)
    if (window.checkBusinessCircuit && !(await window.checkBusinessCircuit('store_write', storeState.currentAgent))) {
      return;
    }

    const planCycle = document.getElementById('plan-cycle-select')?.value || '未来3日用度';
    const expectedDate = document.getElementById('plan-expected-date')?.value;
    const note = document.getElementById('plan-note-input')?.value.trim() || '';

    const rowEls = document.querySelectorAll('.demand-plan-item-row');
    const items = [];
    rowEls.forEach((row) => {
      const name = row.querySelector('.plan-item-name')?.value.trim();
      const qty = parseInt(row.querySelector('.plan-item-qty')?.value) || 0;
      const unit = row.querySelector('.plan-item-unit')?.value.trim() || '件';
      if (name && qty > 0) {
        items.push({ name, qty, unit });
      }
    });

    if (items.length === 0) {
      return alert('请至少填写一项有效的计划用度货品与预估数量！');
    }

    const { error } = await supabase.from('demand_forecast_plan').insert([
      {
        tenant_id: storeState.currentAgent,
        store_id: storeState.currentStore.id,
        store_name: storeState.currentStore.name || '厚德便民门店',
        plan_cycle: planCycle,
        expected_date: expectedDate || null,
        items,
        note,
        status: 'submitted'
      }
    ]);

    if (error) return alert('提报用度计划失败：' + error.message);

    const summaryStr = items.map((i) => `${i.name} x${i.qty}${i.unit}`).join('、');
    await notifyVendorWebhook(
      storeState.currentAgent,
      `📅【门店真实用度计划单】\n提报门店：${storeState.currentStore.name}\n用度周期：${planCycle}（期望到店：${expectedDate || '近期'}）\n用度明细：${summaryStr}\n${note ? `叮咛：${note}\n` : ''}请合作社/工坊纳入按需采收排产备货！`
    );

    alert('🎉 真实用度计划单已提报！已直达村社合作社与源头工坊调度台按需排产。');
    document.getElementById('plan-note-input').value = '';
    const rowsContainer = document.getElementById('demand-plan-rows');
    if (rowsContainer) {
      rowsContainer.innerHTML = '';
      window.addDemandPlanRow();
    }
    await loadMyDemandPlans();
  };
}
