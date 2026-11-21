import { supabase } from '../lib/supabase.js';

const urlParams = new URLSearchParams(window.location.search);
let directTenantParam = (urlParams.get('t') || urlParams.get('tenant') || '').trim().toUpperCase();
const refStoreNameParam = (urlParams.get('ref') || '').trim();

let allSuppliers = [];
let allProducts = [];

function formatEntityLabel(type, tenantId) {
  const tid = String(tenantId || '').toUpperCase();
  if (type === 'individual' || tid.startsWith('GR-')) {
    return { label: '👨‍🌾 个人农户 / 手艺人 / 个体匠人', cls: 'bg-amber-100 text-amber-950 border-amber-300' };
  }
  const map = {
    coop: { label: '🌾 村社合作社 / 产区直供站', cls: 'bg-emerald-100 text-emerald-950 border-emerald-300' },
    factory: { label: '🏭 源头工坊 / 生产制造厂', cls: 'bg-sky-100 text-sky-950 border-sky-300' },
    dealer: { label: '🏢 区域平准仓 / 集散商行', cls: 'bg-indigo-100 text-indigo-950 border-indigo-300' },
    service: { label: '🛠️ 工料配套 / 专业服务机构', cls: 'bg-stone-200 text-stone-800 border-stone-300' }
  };
  return map[type] || map.coop;
}

window.clearDirectFilter = function () {
  directTenantParam = '';
  document.getElementById('direct-tenant-banner')?.classList.add('hidden');
  renderSupplierCards();
};

window.openInquiryModal = function (tenantId, companyName, isPaused = false) {
  document.getElementById('modal-tenant-id').value = tenantId;
  document.getElementById('modal-supplier-name').innerText = `目标供货方：${companyName} (${tenantId})`;
  const noteEl = document.getElementById('lead-note');
  if (noteEl && isPaused && !noteEl.value) {
    noteEl.value = '看到贵处当前农忙/盘点暂歇，先预约节后上门送样洽谈！';
  }
  document.getElementById('inquiry-modal')?.classList.remove('hidden');
};

window.closeInquiryModal = function () {
  document.getElementById('inquiry-modal')?.classList.add('hidden');
};

async function notifySupplierWebhook(tenantId, messageText) {
  try {
    const supplier = allSuppliers.find((s) => s.tenant_id === tenantId);
    const url = (supplier?.webhook_url || '').trim();
    if (!url || !url.startsWith('http')) return;

    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content: messageText },
        content: { text: messageText }
      })
    });
  } catch (e) {}
}

function renderSupplierCards() {
  const listEl = document.getElementById('supplier-list');
  const emptyEl = document.getElementById('empty-state');
  const keyword = (document.getElementById('search-input')?.value || '').trim().toLowerCase();

  let list = [...allSuppliers];

  if (keyword) {
    list = list.filter((s) => {
      const sProds = allProducts.filter((p) => p.tenant_id === s.tenant_id);
      const prodText = sProds.map((p) => `${p.name} ${p.spec || ''} ${p.origin_place || ''}`).join(' ').toLowerCase();
      return (
        (s.company_name || '').toLowerCase().includes(keyword) ||
        (s.tenant_id || '').toLowerCase().includes(keyword) ||
        (s.brand_origin_desc || '').toLowerCase().includes(keyword) ||
        (s.sponsor_org || '').toLowerCase().includes(keyword) ||
        prodText.includes(keyword)
      );
    });
  }

  if (directTenantParam) {
    list.sort((a, b) => (a.tenant_id === directTenantParam ? -1 : b.tenant_id === directTenantParam ? 1 : 0));
  }

  const statEl = document.getElementById('stat-supplier-count');
  if (statEl) statEl.innerText = `${allSuppliers.length} 家`;

  if (list.length === 0) {
    if (listEl) listEl.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');
  if (!listEl) return;

  listEl.innerHTML = list
    .map((s) => {
      const badge = formatEntityLabel(s.business_type, s.tenant_id);
      const settings = s.custom_settings && typeof s.custom_settings === 'object' ? s.custom_settings : {};
      const seasonalPause = settings.seasonalPause || {};
      const isPaused = !!seasonalPause.isPaused;
      const isHarvestAid = !!settings.harvestAidOn;
      const sponsorOrg = (s.sponsor_org || '').trim();
      const sProds = allProducts.filter((p) => p.tenant_id === s.tenant_id);

      const sponsorHtml = sponsorOrg
        ? `<div class="bg-amber-50 border border-amber-300 text-amber-950 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
            <span>🛡️</span>
            <span>品质联保背书：由【${sponsorOrg}】提供品质联保担保</span>
          </div>`
        : '';

      const pauseHtml = isPaused
        ? `<div class="bg-amber-100 border border-amber-400 text-amber-950 px-3 py-2 rounded-xl text-xs leading-relaxed">
            <b>🍵 农忙 / 盘点暂歇接单：</b>${seasonalPause.reason || '产区集中采收加工中'}${
            seasonalPause.resumeDate ? `（预计 <b>${seasonalPause.resumeDate}</b> 恢复接单）` : ''
          }
          </div>`
        : '';

      const prodsPreviewHtml =
        sProds.length > 0
          ? `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              ${sProds
                .slice(0, 4)
                .map(
                  (p) => `
                  <div class="bg-stone-50 border border-stone-200/80 rounded-2xl p-2 flex items-center gap-2">
                    <div class="w-10 h-10 rounded-xl bg-stone-200/70 overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-stone-400">
                      ${p.image_url ? `<img src="${p.image_url}" class="w-full h-full object-cover">` : '实物'}
                    </div>
                    <div class="min-w-0">
                      <b class="text-[11px] text-stone-900 block truncate">${p.name}</b>
                      <span class="text-[10px] font-mono text-emerald-900 font-bold">¥${parseFloat(p.tier_1_price || 0).toFixed(2)}/${p.measure_unit || '件'}</span>
                    </div>
                  </div>
                `
                )
                .join('')}
            </div>`
          : '';

      return `
        <article class="bg-white rounded-3xl p-5 shadow-sm border ${
          isPaused ? 'border-amber-300' : 'border-stone-200/90'
        } space-y-3 hover:shadow-md transition">
          <div class="flex flex-wrap justify-between items-start gap-2">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.cls}">${badge.label}</span>
                <span class="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md font-bold">✅ 实名资质已核验</span>
                ${isHarvestAid ? '<span class="text-[11px] bg-emerald-600 text-white px-2 py-0.5 rounded-md font-bold">🌾 丰产助农直供</span>' : ''}
              </div>
              <h3 class="text-base sm:text-lg font-bold text-stone-900 pt-0.5">${s.company_name}</h3>
            </div>
            <div class="text-right font-mono">
              <span class="text-[10px] text-stone-400 block">商号代号</span>
              <b class="text-xs bg-stone-100 text-stone-800 px-2 py-0.5 rounded-lg border border-stone-200">${s.tenant_id}</b>
            </div>
          </div>

          ${sponsorHtml}
          ${pauseHtml}

          <p class="text-xs text-stone-600 leading-relaxed">
            ${s.brand_origin_desc || '坚守物勒工名、实名保真商道，源头平准直供，支持周边合作门店与食堂预约送货师傅上门送样、先验货后合作。'}
          </p>

          ${prodsPreviewHtml}

          <div class="pt-3 border-t border-stone-100 flex flex-wrap justify-between items-center gap-2 text-xs">
            <div class="text-[11px] text-stone-500 font-mono">
              <span>执事：<b>${s.contact_person || s.contact_name || '当家掌柜'}</b></span>
              <span class="mx-2">·</span>
              <span>协作模式：<b>${s.service_mode || '实体与电商双轨'}</b></span>
            </div>

            <div class="flex items-center gap-2">
              <a href="mall.html?t=${encodeURIComponent(s.tenant_id)}" class="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold transition">
                🏛️ 进数字专柜 (${sProds.length})
              </a>
              <button type="button" onclick="window.openInquiryModal('${s.tenant_id}', '${(s.company_name || '').replace(/'/g, '')}', ${isPaused})" class="px-4 py-2 rounded-xl ${
        isPaused ? 'bg-amber-500 hover:bg-amber-600 text-stone-950' : 'bg-[#1b4332] hover:bg-[#143628] text-white'
      } font-bold shadow-xs active:scale-95 transition">
                ${isPaused ? '📅 预约节后送样' : '🤝 预约送样合作'}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

async function handleInquirySubmit(e) {
  e.preventDefault();
  const tenantId = document.getElementById('modal-tenant-id').value;
  const storeName = document.getElementById('lead-store-name').value.trim();
  const contactName = document.getElementById('lead-contact-name').value.trim();
  const phone = document.getElementById('lead-phone').value.trim();
  const address = document.getElementById('lead-address').value.trim();
  const note = document.getElementById('lead-note').value.trim();
  const btn = document.getElementById('submit-inquiry-btn');

  if (!storeName || !contactName || !phone || phone.length < 11 || !address) {
    return alert('请完整填写门店名称、联系人、11位手机号及详细地址！');
  }

  btn.disabled = true;
  btn.innerText = '正在传达供货中枢...';

  const orderNo = 'LEAD-' + Date.now().toString().slice(-6);
  const refPrefix = refStoreNameParam ? `[同行老店引荐:${refStoreNameParam}] ` : '';
  const fullNote = `[新店合作意向] ${refPrefix}联系人：${contactName} (${phone}) · 地址：${address}${note ? ` · 需求：${note}` : ''}`;

  const { error } = await supabase.from('store_order').insert([
    {
      order_no: orderNo,
      tenant_id: tenantId,
      store_name: storeName,
      order_source: 'b2b_directory_lead',
      settlement_type: 'credit',
      settlement_note: `${contactName}|${phone}|${address}`,
      items: [],
      total_amount: 0,
      net_settle_amount: 0,
      order_status: 'pending_confirm',
      delivery_status: 'ordered',
      note: fullNote
    }
  ]);

  btn.disabled = false;
  btn.innerText = '确认提交合作意向';

  if (error) {
    return alert('提交失败：' + error.message);
  }

  await notifySupplierWebhook(
    tenantId,
    `🤝【新店合作意向提醒】\n意向门店：${storeName}\n联系人：${contactName} (${phone})\n地址：${address}\n${refPrefix}${note ? `需求：${note}\n` : ''}请登录调度台「新店合作意向」联系送样立户！`
  );

  alert('🎉 合作意向已直达供货方调度台！当值执事或送货师傅将尽快电话联系您安排上门送样。');
  document.getElementById('inquiry-form')?.reset();
  window.closeInquiryModal();
}

export async function initSuppliersController() {
  if (refStoreNameParam) {
    document.getElementById('referrer-name-label').innerText = refStoreNameParam;
    document.getElementById('referrer-banner')?.classList.remove('hidden');
  }

  if (directTenantParam) {
    document.getElementById('direct-tenant-code').innerText = directTenantParam;
    document.getElementById('direct-tenant-banner')?.classList.remove('hidden');
  }

  document.getElementById('search-input')?.addEventListener('input', () => renderSupplierCards());
  document.getElementById('inquiry-form')?.addEventListener('submit', handleInquirySubmit);

  const [tenantsRes, prodsRes] = await Promise.all([
    supabase
      .from('platform_tenant')
      .select('tenant_id, company_name, business_type, service_mode, contact_person, contact_name, brand_origin_desc, media_url, sponsor_org, webhook_url, custom_settings, is_active, membership_status')
      .eq('is_active', true)
      .order('id', { ascending: false }),
    supabase
      .from('product')
      .select('id, tenant_id, name, spec, measure_unit, tier_1_price, origin_place, image_url, status')
      .eq('status', 'active')
      .order('id', { ascending: false })
      .limit(300)
  ]);

  document.getElementById('loading-state')?.classList.add('hidden');

  if (!tenantsRes.error && Array.isArray(tenantsRes.data)) {
    allSuppliers = tenantsRes.data.filter((t) => t.membership_status !== 'paused');
  }
  if (!prodsRes.error && Array.isArray(prodsRes.data)) {
    allProducts = prodsRes.data;
  }

  renderSupplierCards();
}
