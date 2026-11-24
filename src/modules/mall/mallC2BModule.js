import { MallService } from '../../services/mallService.js';
import { mallState, LAST_CUST_KEY, JOINED_DEMANDS_KEY } from './mallState.js';

export function parseDemandPayload(rawContent) {
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && parsed.title) return parsed;
  } catch (e) {}
  return {
    title: rawContent,
    qty: '若干',
    budget: '面议',
    delivery: '灵活协商',
    coBuyers: 1,
    acceptedByBuyer: false
  };
}

export function renderVerifiedReviewsWall() {
  const section = document.getElementById('verified-reviews-section');
  const listEl = document.getElementById('verified-reviews-list');
  if (!section || !listEl) return;

  if (mallState.allReviews.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  listEl.innerHTML = mallState.allReviews
    .slice(0, 8)
    .map((r) => {
      let info = { orderNo: '', itemsSummary: '', comment: r.content };
      try {
        const parsed = JSON.parse(r.content);
        if (parsed && parsed.comment) info = parsed;
      } catch (e) {}

      return `
        <div class="shrink-0 w-60 bg-white border border-stone-200 rounded-2xl p-3 shadow-2xs space-y-1.5 text-xs">
          <div class="flex justify-between items-center text-[10px]">
            <span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">📜 验真已购口碑</span>
            <span class="text-stone-400 font-mono">${new Date(r.created_at).toLocaleDateString()}</span>
          </div>
          <p class="text-stone-800 text-[11px] line-clamp-2 leading-relaxed">“${info.comment}”</p>
          <div class="text-[10px] text-stone-400 truncate border-t border-stone-100 pt-1">
            ${info.itemsSummary ? `已购：${info.itemsSummary}` : r.proposer_name || '邻里买家'}
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderC2BDemandsList() {
  const listEl = document.getElementById('c2b-demands-list');
  if (!listEl) return;

  if (mallState.allDemands.length === 0) {
    listEl.innerHTML = `
      <div class="py-12 text-center bg-white rounded-3xl border border-stone-200 p-6 space-y-1.5">
        <div class="text-stone-600 font-bold text-xs">当前暂无公开求购需求帖</div>
        <div class="text-stone-400 text-[11px]">点击下方按钮即可发布您的真实用度或集采需求，由对应合作社与工坊阳光报价</div>
      </div>
    `;
    return;
  }

  let joinedIds = [];
  try {
    joinedIds = JSON.parse(localStorage.getItem(JOINED_DEMANDS_KEY) || '[]');
  } catch (e) {}

  listEl.innerHTML = mallState.allDemands
    .map((d) => {
      const info = parseDemandPayload(d.content);
      const isJoined = joinedIds.includes(d.id);
      const hasFactoryReply = !!d.official_reply;
      const targetTag = d.category || '全网公域发榜';

      return `
        <div class="bg-white border border-stone-200 rounded-3xl p-4 shadow-2xs space-y-2.5 text-xs">
          <div class="flex justify-between items-start gap-2">
            <div>
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="bg-amber-100 text-amber-950 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  🔥 ${info.coBuyers || 1} 人已凑单
                </span>
                <span class="bg-stone-100 text-stone-600 text-[10px] px-2 py-0.5 rounded-full font-mono">
                  ${targetTag}
                </span>
              </div>
              <b class="text-sm text-stone-900 block mt-1.5">${info.title}</b>
            </div>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
              info.acceptedByBuyer
                ? 'bg-emerald-600 text-white'
                : hasFactoryReply
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }">
              ${info.acceptedByBuyer ? '🤝 双方已锁定意向' : hasFactoryReply ? '✅ 源头已回应报价' : '⏳ 抱团集采征集中'}
            </span>
          </div>

          <div class="grid grid-cols-3 gap-1.5 bg-stone-50 p-2 rounded-2xl border border-stone-100 text-[11px] font-mono">
            <div><span class="text-stone-400 block text-[9px]">求购规模</span><b class="text-stone-800">${info.qty}</b></div>
            <div><span class="text-stone-400 block text-[9px]">期望工价</span><b class="text-emerald-900">${info.budget}</b></div>
            <div><span class="text-stone-400 block text-[9px]">交付要求</span><b class="text-stone-700 font-sans">${info.delivery}</b></div>
          </div>

          ${info.note ? `<p class="text-[11px] text-stone-500">💬 规格/定制说明：${info.note}</p>` : ''}

          ${
            hasFactoryReply
              ? `<div class="bg-emerald-50 border border-emerald-200 p-2.5 rounded-2xl text-[11px] text-emerald-950">
                  <b>🌾 源头直供回应：</b> ${d.official_reply}
                </div>`
              : ''
          }

          <div class="pt-2 border-t border-stone-100 flex justify-between items-center text-[10px] text-stone-400">
            <span>发布时间: ${new Date(d.created_at).toLocaleDateString()}</span>
            <button onclick="window.coBuyC2BDemand(${d.id})" ${isJoined ? 'disabled' : ''} class="${
        isJoined
          ? 'bg-stone-100 text-stone-400 px-3 py-1.5 rounded-xl font-bold'
          : 'bg-[#1b4332] hover:bg-[#143628] text-white px-3.5 py-1.5 rounded-xl font-bold shadow active:scale-95 transition'
      }">
              ${isJoined ? '✓ 已参与抱团凑单' : '🤝 我也要 · +1 抱团凑单'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

export async function loadAndRenderC2BDemands() {
  const listEl = document.getElementById('c2b-demands-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="py-10 text-center text-stone-400 text-xs">正调阅百工天街实时求购需求榜...</div>';

  mallState.allDemands = await MallService.fetchC2BDemands(mallState.currentTenantParam);
  renderC2BDemandsList();
}

export function initC2BBindings() {
  window.openReviewModal = function (orderNo, tenantId, itemsSummary) {
    document.getElementById('review-order-no').value = orderNo;
    document.getElementById('review-tenant-id').value = tenantId || '';
    document.getElementById('review-items-summary').value = itemsSummary || '';
    document.getElementById('review-order-badge').innerText = `单据 #${orderNo} · ${itemsSummary || '天街良品'}`;
    document.getElementById('review-comment-input').value = '';
    window.openModal('modal-write-review');
  };

  window.submitOrderReview = async function () {
    const orderNo = document.getElementById('review-order-no').value;
    const tenantId = document.getElementById('review-tenant-id').value;
    const itemsSummary = document.getElementById('review-items-summary').value;
    const comment = document.getElementById('review-comment-input').value.trim();

    if (!comment) return alert('请写下一句您的真实收货或到店自提体验！');

    // 动作级精准熔断检查：公域晒单发布 (public_post)
    if (window.checkBusinessCircuit && !(await window.checkBusinessCircuit('public_post', tenantId || null))) {
      return;
    }

    const payload = {
      proposer_type: 'mall_review',
      proposer_name: '天街验真邻里',
      category: `口碑晒单:${tenantId || 'PLATFORM'}`,
      content: JSON.stringify({ orderNo, itemsSummary, comment })
    };

    const { error } = await MallService.submitVerifiedReview(payload);
    if (error) {
      alert('提交失败: ' + error.message);
    } else {
      alert('🙏 感谢您的真实口碑！已同步展示于天街与对应专柜验真墙。');
      window.closeModal('modal-write-review');
      mallState.allReviews = await MallService.fetchVerifiedReviews(mallState.currentTenantParam);
      renderVerifiedReviewsWall();
    }
  };

  window.openC2BDemandModal = function (presetTitle = '', presetTenantId = '') {
    document.getElementById('c2b-title-input').value = presetTitle || '';
    document.getElementById('c2b-qty-input').value = '';
    document.getElementById('c2b-budget-input').value = '';
    document.getElementById('c2b-delivery-input').value = '';
    document.getElementById('c2b-note-input').value = '';

    const activeTid = presetTenantId || mallState.currentTenantParam || '';
    const matchedTenant = activeTid
      ? mallState.allTenants.find((t) => (t.tenant_id || '').toUpperCase() === activeTid.toUpperCase())
      : null;

    const targetInput = document.getElementById('c2b-target-input');
    const scopeHint = document.getElementById('c2b-scope-hint');
    if (targetInput) {
      targetInput.value = matchedTenant ? matchedTenant.company_name : '';
      targetInput.dataset.lockedTenantId = matchedTenant ? matchedTenant.tenant_id : '';
    }
    if (scopeHint) {
      scopeHint.innerText = matchedTenant
        ? `当前已关联【${matchedTenant.company_name}】，清空即可发往全网合作社与工坊公开征集报价`
        : '留空则面向全网对应行当合作社与工坊公开征集报价';
    }

    try {
      const saved = JSON.parse(localStorage.getItem(LAST_CUST_KEY) || 'null');
      if (saved) {
        if (!document.getElementById('c2b-name-input').value) document.getElementById('c2b-name-input').value = saved.name || '';
        if (!document.getElementById('c2b-phone-input').value) document.getElementById('c2b-phone-input').value = saved.phone || '';
      }
    } catch (e) {}

    window.openModal('modal-c2b-demand');
  };

  window.appendC2BDeliveryChip = function (chipText) {
    const input = document.getElementById('c2b-delivery-input');
    if (!input) return;
    const cur = input.value.trim();
    if (!cur) input.value = chipText;
    else if (!cur.includes(chipText)) input.value = `${cur} / ${chipText}`;
  };

  window.submitC2BDemand = async function () {
    const title = document.getElementById('c2b-title-input').value.trim();
    const qty = document.getElementById('c2b-qty-input').value.trim();
    const budget = document.getElementById('c2b-budget-input').value.trim() || '按阶梯惠价面议';
    const delivery = document.getElementById('c2b-delivery-input').value.trim() || '灵活协商（门店自提/产区直发）';
    const targetText = document.getElementById('c2b-target-input').value.trim();
    const note = document.getElementById('c2b-note-input').value.trim();
    const name = document.getElementById('c2b-name-input').value.trim();
    const phone = document.getElementById('c2b-phone-input').value.trim();

    if (!title || !qty || !phone || phone.length < 11) {
      return alert('请完整填写求购良品名称、需求数量规模以及 11 位联系手机号！');
    }

    const matchedTenant = targetText
      ? mallState.allTenants.find(
          (t) =>
            (t.company_name || '').includes(targetText) ||
            targetText.includes(t.company_name || '') ||
            (t.tenant_id || '').toUpperCase() === targetText.toUpperCase()
        )
      : null;

    // 动作级精准熔断检查：公域求购发榜 (public_post)
    const targetTid = matchedTenant ? matchedTenant.tenant_id : (mallState.currentTenantParam || null);
    if (window.checkBusinessCircuit && !(await window.checkBusinessCircuit('public_post', targetTid))) {
      return;
    }

    const categoryTag = matchedTenant
      ? `C2B专柜:${matchedTenant.tenant_id}(${matchedTenant.company_name})`
      : targetText
      ? `C2B意向:${targetText}`
      : 'C2B全网公域发榜';

    const structuredContent = JSON.stringify({
      title,
      qty,
      budget,
      delivery,
      note,
      coBuyers: 1,
      acceptedByBuyer: false
    });

    const { error } = await MallService.publishC2BDemand({
      proposer_type: 'c2b_demand',
      proposer_name: `${name || '天街买家'} (${phone})`,
      category: categoryTag,
      content: structuredContent
    });

    if (error) {
      alert('发布失败: ' + error.message);
    } else {
      alert('🎉 求购/集采需求已成功发榜！\n其他买家可点击抱团凑单，对应行当合作社与工坊将尽快阳光报价。');
      window.closeModal('modal-c2b-demand');
      await loadAndRenderC2BDemands();
    }
  };

  window.coBuyC2BDemand = async function (demandId) {
    const demand = mallState.allDemands.find((x) => x.id === demandId);
    if (!demand) return;

    const info = parseDemandPayload(demand.content);
    info.coBuyers = (parseInt(info.coBuyers) || 1) + 1;
    await MallService.updateC2BDemandContent(demandId, JSON.stringify(info));

    try {
      const joinedIds = JSON.parse(localStorage.getItem(JOINED_DEMANDS_KEY) || '[]');
      if (!joinedIds.includes(demandId)) {
        joinedIds.push(demandId);
        localStorage.setItem(JOINED_DEMANDS_KEY, JSON.stringify(joinedIds));
      }
    } catch (e) {}

    alert(`🤝 抱团凑单成功！当前已有 ${info.coBuyers} 位买家共同聚量，聚量越大源头直供价越优！`);
    await loadAndRenderC2BDemands();
  };

  window.acceptC2BQuote = async function (demandId, rawContent) {
    if (!confirm('确认认可源头报价并锁定合作意向？确认后对应合作社或工坊将立即联系您安排排产交付。')) return;
    const info = parseDemandPayload(rawContent);
    info.acceptedByBuyer = true;
    await MallService.updateC2BDemandContent(demandId, JSON.stringify(info));
    alert('🤝 已锁定合作意向！专柜执事将尽快致电与您对接排产与交付细节。');
    await window.searchConsumerOrders();
  };

  window.cancelMyC2BDemand = async function (demandId) {
    if (!confirm('确认撤销此条求购需求？撤销后将从天街求购榜下架。')) return;
    await MallService.cancelC2BDemand(demandId);
    alert('已撤销该求购需求。');
    await window.searchConsumerOrders();
  };
}
