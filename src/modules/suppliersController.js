import { SuppliersService, DEMO_SUPPLIERS } from '../services/suppliersService.js';

const params = new URLSearchParams(window.location.search);
const urlTargetTenant = (params.get('t') || '').trim().toUpperCase();
const urlReferrer = (params.get('ref') || '').trim();
let allSuppliers = [];

function escapeAttr(str) {
  return String(str || '').replace(/'/g, "\\'").replace(/"/g, '"');
}

function renderSampleCard(p) {
  const tags = Array.isArray(p.tags) ? p.tags : [];
  const attrs = p.custom_specs && typeof p.custom_specs === 'object' && p.custom_specs.attrs ? p.custom_specs.attrs : {};

  const attrHtml = Object.entries(attrs)
    .map(([k, v]) => `<span class="inline-block bg-white border border-stone-200 text-stone-600 px-1.5 py-0.2 rounded text-[9px] mr-1 mt-1">${k}:${v}</span>`)
    .join('');

  const tagHtml = tags
    .slice(0, 2)
    .map((t) => `<span class="inline-block bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded text-[9px] mr-1 mt-1 font-bold">${t}</span>`)
    .join('');

  return `
    <div class="shrink-0 w-44 bg-stone-50 border border-stone-200/80 rounded-2xl p-2.5 flex flex-col justify-between">
      <div>
        ${p.image_url ? `<img src="${p.image_url}" class="w-full h-20 object-cover rounded-xl mb-2 border border-stone-200/60">` : ''}
        <div class="text-xs font-bold text-stone-800 line-clamp-2" title="${escapeAttr(p.name)}">${p.name}</div>
        <div class="text-[11px] text-stone-500 mt-1 truncate">规格：${p.spec || '整装'}</div>
        <div class="mt-0.5">${tagHtml}${attrHtml}</div>
      </div>
      <div class="mt-2 flex items-center justify-between">
        <span class="inline-block px-1.5 py-0.5 rounded bg-amber-100/80 text-amber-900 text-[10px] font-bold">
          单位：${p.measure_unit || '箱'}
        </span>
        ${p.origin_place ? `<span class="text-[9px] text-emerald-800 truncate max-w-[75px]">${p.origin_place}</span>` : ''}
      </div>
    </div>
  `;
}

function renderSuppliers(list) {
  const listEl = document.getElementById('supplier-list');
  const emptyEl = document.getElementById('empty-state');
  const countEl = document.getElementById('stat-supplier-count');

  if (countEl) countEl.textContent = list.length;

  if (!list.length) {
    if (listEl) listEl.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');
  listEl.innerHTML = list
    .map((s) => {
      const isHighlighted = urlTargetTenant && s.tenant_id.toUpperCase() === urlTargetTenant;
      const samplesHtml =
        s.products.length > 0
          ? `<div class="mt-3.5 pt-3 border-t border-stone-100">
              <div class="text-[11px] font-bold text-stone-400 mb-2">主营招牌货品预览（签约后享专属批发底价）：</div>
              <div class="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                ${s.products.map(renderSampleCard).join('')}
              </div>
            </div>`
          : '';

      return `
        <article class="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border ${isHighlighted ? 'border-amber-400 ring-2 ring-amber-200' : 'border-stone-200/80'} hover:border-emerald-400 transition">
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div class="flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-base sm:text-lg font-bold text-stone-900">${s.name}</h3>
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  ✓ 营业执照已核验
                </span>
                <span class="px-2 py-0.5 rounded-lg text-[11px] bg-stone-100 text-stone-700 font-mono font-bold">商号：${s.tenant_id}</span>
                ${s.media_url ? `<a href="${s.media_url}" target="_blank" rel="noopener" class="px-2 py-0.5 rounded-lg text-[11px] bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold transition">🎥 车间实拍</a>` : ''}
              </div>

              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 mt-1.5">
                <span>📦 主营：${s.category}</span>
                <span>📍 覆盖：${s.city}</span>
              </div>

              <p class="text-xs sm:text-sm text-stone-600 mt-2.5 leading-relaxed">
                ${s.description}
              </p>
            </div>

            <div class="flex sm:flex-col items-center sm:items-end justify-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
              <button
                onclick="window.openInquiryModal('${escapeAttr(s.tenant_id)}', '${escapeAttr(s.name)}')"
                class="flex-1 sm:flex-initial w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#1b4332] hover:bg-[#143628] text-white text-xs font-bold shadow transition cursor-pointer active:scale-95"
              >
                预约送样 / 申请供货
              </button>
              <div class="flex items-center gap-1.5">
                ${s.hasCounter && !s.tenant_id.startsWith('DEMO-') ? `<a href="mall.html?t=${encodeURIComponent(s.tenant_id)}" class="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 text-[11px] font-bold transition">🏛️ 数字专柜</a>` : ''}
                <button
                  onclick="window.shareSupplierCard('${escapeAttr(s.tenant_id)}', '${escapeAttr(s.name)}')"
                  class="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-bold transition cursor-pointer"
                >
                  🔗 分享名片
                </button>
              </div>
            </div>
          </div>
          ${samplesHtml}
        </article>
      `;
    })
    .join('');
}

window.clearDirectFilter = () => {
  document.getElementById('direct-tenant-banner')?.classList.add('hidden');
  window.history.replaceState({}, '', 'suppliers.html');
  renderSuppliers(allSuppliers);
};

window.shareSupplierCard = (tenantId, tenantName) => {
  const shareUrl = `${window.location.origin}/suppliers.html?t=${encodeURIComponent(tenantId)}`;
  const msg = `推荐源头供货商【${tenantName}】（商号：${tenantId}），营业执照已核验，支持免费预约送样到店：${shareUrl}`;
  navigator.clipboard.writeText(msg).then(() => {
    alert(`✅ 已复制【${tenantName}】专属招商名片链接，可直接转发微信好友或门店群！`);
  });
};

window.openInquiryModal = (tenantId, tenantName) => {
  document.getElementById('modal-tenant-id').value = tenantId;
  document.getElementById('modal-supplier-name').textContent = `目标厂商：${tenantName} (${tenantId})`;
  document.getElementById('inquiry-modal')?.classList.remove('hidden');
};

window.closeInquiryModal = () => {
  document.getElementById('inquiry-modal')?.classList.add('hidden');
  document.getElementById('inquiry-form')?.reset();
};

function bindEvents() {
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    const kw = e.target.value.trim().toLowerCase();
    if (!kw) {
      renderSuppliers(allSuppliers);
      return;
    }
    const filtered = allSuppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(kw) ||
        s.tenant_id.toLowerCase().includes(kw) ||
        s.category.toLowerCase().includes(kw) ||
        s.city.toLowerCase().includes(kw) ||
        s.products.some(
          (p) => p.name.toLowerCase().includes(kw) || JSON.stringify(p.custom_specs || {}).toLowerCase().includes(kw)
        )
    );
    renderSuppliers(filtered);
  });

  document.getElementById('inquiry-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-inquiry-btn');
    btn.disabled = true;
    btn.textContent = '正在提交...';

    const tenantId = document.getElementById('modal-tenant-id').value;
    const storeName = document.getElementById('lead-store-name').value.trim();
    const contactName = document.getElementById('lead-contact-name').value.trim();
    const phone = document.getElementById('lead-phone').value.trim();
    const address = document.getElementById('lead-address').value.trim();
    const note = document.getElementById('lead-note').value.trim();
    const targetSupplier = allSuppliers.find((s) => s.tenant_id === tenantId);

    try {
      await SuppliersService.submitSampleInquiry({
        tenantId,
        storeName,
        contactName,
        phone,
        address,
        note,
        referrer: urlReferrer,
        webhookUrl: targetSupplier?.webhook_url || ''
      });

      alert('✅ 合作意向已直达厂商调度中枢！厂商业务员或供货师傅将尽快电话联系您安排上门送样。');
      window.closeInquiryModal();
    } catch (err) {
      console.error('提交线索失败:', err);
      alert('提交遇到网络波动，请稍后重试或直接联系厂商：' + (err.message || ''));
    } finally {
      btn.disabled = false;
      btn.textContent = '确认提交合作意向';
    }
  });
}

export async function initSuppliersController() {
  if (urlReferrer) {
    const labelEl = document.getElementById('referrer-name-label');
    if (labelEl) labelEl.textContent = urlReferrer;
    document.getElementById('referrer-banner')?.classList.remove('hidden');
  }

  bindEvents();

  const loadingEl = document.getElementById('loading-state');
  try {
    allSuppliers = await SuppliersService.fetchVerifiedSuppliers();

    if (urlTargetTenant) {
      const targetIdx = allSuppliers.findIndex((s) => s.tenant_id.toUpperCase() === urlTargetTenant);
      if (targetIdx > -1) {
        const [targetObj] = allSuppliers.splice(targetIdx, 1);
        allSuppliers.unshift(targetObj);
        const codeEl = document.getElementById('direct-tenant-code');
        if (codeEl) codeEl.textContent = urlTargetTenant;
        document.getElementById('direct-tenant-banner')?.classList.remove('hidden');
      }
    }

    renderSuppliers(allSuppliers);
  } catch (err) {
    console.error('加载供货商名录失败:', err);
    allSuppliers = DEMO_SUPPLIERS;
    renderSuppliers(allSuppliers);
  } finally {
    loadingEl?.classList.add('hidden');
  }
}
