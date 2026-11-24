import { supabase } from '../../lib/supabase.js';

let activePolicyCache = {
  tenantId: '',
  companyName: '',
  policy: {}
};

function getCurrentStoreTenantId() {
  const urlTid = new URLSearchParams(window.location.search).get('t')?.trim().toUpperCase();
  if (urlTid) return urlTid;
  const domTid = document.getElementById('store-tenant-id-display')?.innerText?.trim().toUpperCase();
  if (domTid && domTid !== '--') return domTid;
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i) || '';
    if (k.startsWith('store_session_') || k.startsWith('store_auth_')) {
      const val = sessionStorage.getItem(k);
      if (val && val.length >= 4) return val.trim().toUpperCase();
    }
  }
  return '';
}

function renderStorePolicyBanner(companyName, policy) {
  let banner = document.getElementById('store-live-policy-banner');
  if (!banner) {
    const host = document.querySelector('header') || document.querySelector('main');
    if (!host) return;
    banner = document.createElement('div');
    banner.id = 'store-live-policy-banner';
    host.insertAdjacentElement('afterend', banner);
  }

  const pauseStatusLabel = policy.industryTerms?.pauseStatus || '盘点 / 休市暂歇';
  const tags = [];

  if (policy.emergencyBrakeActive) {
    banner.className = 'mx-auto max-w-2xl mt-2 px-3';
    banner.innerHTML = `
      <div class="bg-rose-950 text-white border-2 border-rose-500 p-3 rounded-2xl text-xs shadow-lg space-y-1">
        <div class="font-bold text-sm flex items-center gap-1.5">
          <span>🚨 【${companyName || '供货总舵'}】已启动紧急止损拉闸（全网熔断锁单）</span>
        </div>
        <p class="text-rose-200 text-[11px]">
          拉闸说明：${policy.emergencyBrakeReason || '行情剧烈波动或紧急风控中，当前暂缓接收新订货单'}（已下单货品交割与对账不受影响）。
        </p>
      </div>
    `;
    return;
  }

  if (policy.seasonalPause?.isPaused) {
    tags.push(`<span class="bg-amber-600 text-white px-2.5 py-0.5 rounded-full font-bold">⏸️ ${pauseStatusLabel}：${policy.seasonalPause.reason || '盘点/休市中'}</span>`);
  }
  if (parseInt(policy.rationLimitQty || 0, 10) > 0) {
    tags.push(`<span class="bg-rose-100 text-rose-900 border border-rose-300 px-2.5 py-0.5 rounded-full font-bold">🛡️ 紧缺定额限购：单笔上限 ${policy.rationLimitQty} 件</span>`);
  }
  if (policy.storeTierEnabled !== false && Array.isArray(policy.storeTiers) && policy.storeTiers.length > 0) {
    tags.push('<span class="bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-0.5 rounded-full">🟢 门店分级协议价与授信已生效</span>');
  }
  if (Array.isArray(policy.carriers) && policy.carriers[0]) {
    tags.push(`<span class="bg-amber-50 text-amber-950 border border-amber-300 px-2.5 py-0.5 rounded-full">🧺 主载具【${policy.carriers[0].name}】押金 ¥${policy.carriers[0].deposit}/件</span>`);
  }
  if (policy.allowStoreReturn === false) {
    tags.push('<span class="bg-stone-200 text-stone-700 px-2.5 py-0.5 rounded-full">🚫 当前暂不开放常规退货申请</span>');
  }

  if (tags.length === 0) {
    banner.innerHTML = '';
    return;
  }

  banner.className = 'mx-auto max-w-2xl mt-2 px-3';
  banner.innerHTML = `
    <div class="bg-white/95 border border-stone-200 p-2.5 rounded-2xl shadow-2xs flex flex-wrap items-center gap-1.5 text-[11px]">
      <span class="font-bold text-stone-700">📜 总舵现行契约行规：</span>
      ${tags.join('')}
    </div>
  `;
}

function validateStoreOrderAgainstPolicy() {
  const { policy, companyName } = activePolicyCache;
  if (!policy || typeof policy !== 'object') return { ok: true };

  if (policy.emergencyBrakeActive) {
    return {
      ok: false,
      msg: `🚨 拦截提交：【${companyName || '供货总舵'}】当前已启动「紧急止损拉闸」全盘熔断！\n\n原因：${policy.emergencyBrakeReason || '行情剧烈波动或风控核查中，暂缓接收新单'}。`
    };
  }

  if (policy.seasonalPause?.isPaused) {
    const label = policy.industryTerms?.pauseStatus || '盘点 / 休市暂歇';
    return {
      ok: false,
      msg: `⏸️ 拦截提交：【${companyName || '供货总舵'}】当前处于「${label}」状态（${policy.seasonalPause.reason || '盘点休市中'}）${
        policy.seasonalPause.resumeDate ? `，预计 ${policy.seasonalPause.resumeDate} 恢复接单` : ''
      }。`
    };
  }

  const rationMax = parseInt(policy.rationLimitQty || 0, 10);
  if (rationMax > 0) {
    let totalCartQty = 0;
    document.querySelectorAll('input[type="number"][data-prod-id], .cart-qty-input, [id^="qty-input-"]').forEach((inp) => {
      const val = parseInt(inp.value || '0', 10);
      if (val > 0) totalCartQty += val;
    });
    if (totalCartQty > rationMax) {
      return {
        ok: false,
        msg: `🛡️ 紧缺物资定额限购拦截：\n总舵当前开启了公平配给限购，单笔最多订购【${rationMax}】件，您当前已选【${totalCartQty}】件，请调减数量后再提交。`
      };
    }
  }

  return { ok: true };
}

export async function refreshStoreTenantPolicy() {
  const tenantId = getCurrentStoreTenantId();
  if (!tenantId) return;

  try {
    const { data, error } = await supabase
      .from('platform_tenant')
      .select('tenant_id, company_name, custom_settings')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) return;
    const policy = data.custom_settings && typeof data.custom_settings === 'object' ? data.custom_settings : {};
    activePolicyCache = {
      tenantId: data.tenant_id,
      companyName: data.company_name || data.tenant_id,
      policy
    };
    window.__storeTenantPolicy = policy;
    renderStorePolicyBanner(activePolicyCache.companyName, policy);
  } catch (err) {
    console.warn('门店端同步总舵策略跳过:', err?.message);
  }
}

export function initStorePolicyEnforcer() {
  refreshStoreTenantPolicy();
  setTimeout(refreshStoreTenantPolicy, 1000);
  setInterval(refreshStoreTenantPolicy, 30000);

  document.addEventListener(
    'click',
    (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const btnText = btn.innerText || '';
      const isOrderSubmit =
        btn.id === 'btn-submit-store-order' ||
        btn.id === 'btn-confirm-order' ||
        btn.getAttribute('onclick')?.includes('submitOrder') ||
        btnText.includes('提交订货') ||
        btnText.includes('确认下单');

      if (!isOrderSubmit) return;

      const verdict = validateStoreOrderAgainstPolicy();
      if (!verdict.ok) {
        e.stopImmediatePropagation();
        e.preventDefault();
        alert(verdict.msg);
      }
    },
    true
  );
}
