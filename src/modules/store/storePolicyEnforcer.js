import { supabase } from '../../lib/supabase.js';

function getActiveBoundTenantId() {
  const params = new URLSearchParams(window.location.search);
  const urlAgent = params.get('agent') || params.get('t');
  if (urlAgent) return urlAgent.trim().toUpperCase();

  const tagText = document.getElementById('menu-current-agent-tag')?.innerText?.trim();
  if (tagText) return tagText.toUpperCase();

  try {
    const saved = localStorage.getItem('current_bound_agent') || localStorage.getItem('selected_agent_id');
    if (saved) return saved.trim().toUpperCase();
  } catch (e) {}
  return '';
}

function renderStorePolicyBanner(policy, tenantName = '') {
  const header = document.querySelector('header');
  if (!header) return;

  let banner = document.getElementById('store-live-policy-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'store-live-policy-banner';
    header.insertAdjacentElement('afterend', banner);
  }

  if (policy.emergencyBrakeActive) {
    banner.className = 'mx-3 mt-2.5 bg-rose-950 text-white border-2 border-rose-500 p-3 rounded-2xl text-xs shadow-md space-y-1';
    banner.innerHTML = `
      <div class="font-bold flex items-center gap-1.5 text-rose-200">
        <span>🚨 供货方【${tenantName || '合作社/工坊'}】已启动【紧急止损拉闸】</span>
      </div>
      <p class="text-[11px] text-rose-100 leading-relaxed">
        原因：${policy.emergencyBrakeReason || '行情平准调价/紧急盘点中'}。当前新补货单提交已临时锁定，旧单收货与电子对账单不受影响。
      </p>
    `;
    const submitBtn = document.getElementById('btn-submit-order');
    if (submitBtn) {
      submitBtn.classList.add('opacity-60');
      const txtEl = document.getElementById('btn-submit-order-text');
      if (txtEl) txtEl.innerText = '🚨 供货方拉闸熔断中';
    }
    return;
  }

  if (policy.seasonalPause?.isPaused) {
    banner.className = 'mx-3 mt-2.5 bg-amber-50 text-amber-950 border border-amber-300 p-3 rounded-2xl text-xs space-y-1';
    banner.innerHTML = `
      <div class="font-bold">🍵 供货方暂歇接单告示：${policy.seasonalPause.reason || '产区农忙/盘点中'}</div>
      ${policy.seasonalPause.resumeDate ? `<div class="text-[10px] text-amber-800 font-mono">预计恢复接单日期：${policy.seasonalPause.resumeDate}</div>` : ''}
    `;
    return;
  }

  const tags = [];
  if (policy.storeTierEnabled !== false && Array.isArray(policy.storeTiers) && policy.storeTiers.length > 0) {
    tags.push('🟢 已启用门店分级协议折算');
  }
  if (parseInt(policy.rationLimitQty || 0) > 0) {
    tags.push(`🛡️ 紧缺限购 ≤ ${policy.rationLimitQty} 件/单`);
  }
  if (Array.isArray(policy.carriers) && policy.carriers.length > 0) {
    const c0 = policy.carriers[0];
    tags.push(`🧺 ${c0.name}押金 ¥${c0.deposit}/件`);
  }

  if (tags.length > 0) {
    banner.className = 'mx-3 mt-2 bg-emerald-50/90 text-emerald-950 border border-emerald-200 px-3 py-1.5 rounded-2xl text-[11px] flex flex-wrap items-center gap-2';
    banner.innerHTML = `<span class="font-bold text-emerald-800">📜 供货方契约行规：</span>` + tags.map((t) => `<span>${t}</span>`).join('<span class="text-emerald-300">|</span>');
  } else {
    banner.remove();
  }
}

export async function syncAndEnforceStorePolicy() {
  const tenantId = getActiveBoundTenantId();
  if (!tenantId) return;

  try {
    const { data: tenant } = await supabase
      .from('platform_tenant')
      .select('tenant_id, company_name, custom_settings')
      .eq('tenant_id', tenantId)
      .single();

    if (!tenant) return;
    const policy = tenant.custom_settings && typeof tenant.custom_settings === 'object' ? tenant.custom_settings : {};
    window.__currentTenantPolicy = policy;
    window.__currentTenantName = tenant.company_name || tenant.tenant_id;
    renderStorePolicyBanner(policy, window.__currentTenantName);
  } catch (err) {
    console.warn('同步供货方全局策略跳过:', err?.message);
  }
}

export function initStorePolicyEnforcer() {
  const validateBeforeOrderAction = (e) => {
    const policy = window.__currentTenantPolicy || {};
    if (policy.emergencyBrakeActive) {
      e.stopImmediatePropagation();
      e.preventDefault();
      alert(
        `🚨 供货方【${window.__currentTenantName || '合作社/工坊'}】已启动【紧急止损拉闸】熔断保护！\n\n` +
        `原因：${policy.emergencyBrakeReason || '当前行情平准调价中，暂缓接入新单'}\n` +
        `提示：已确认的旧单交割与周期电子对账仍可正常进行。`
      );
      return false;
    }
    if (policy.seasonalPause?.isPaused) {
      e.stopImmediatePropagation();
      e.preventDefault();
      alert(
        `🍵 供货方当前处于【暂歇接单】状态：${policy.seasonalPause.reason || '产区农忙/盘点中'}\n` +
        `${policy.seasonalPause.resumeDate ? `预计 ${policy.seasonalPause.resumeDate} 恢复接单。` : '请稍后再提交新单。'}`
      );
      return false;
    }

    const limitQty = parseInt(policy.rationLimitQty || 0);
    const totalQty = parseInt(document.getElementById('cart-count-badge')?.innerText || '0');
    if (limitQty > 0 && totalQty > limitQty) {
      e.stopImmediatePropagation();
      e.preventDefault();
      alert(`🛡️ 当前处于紧缺平准保供期，供货方设定单笔最高限购 ${limitQty} 件（您当前待配篮共 ${totalQty} 件），请适当调减后再提交。`);
      return false;
    }
    return true;
  };

  // 在捕获阶段拦截下单入口与确认凭单按钮，确保 100% 真实生效
  ['btn-submit-order', 'btn-slip-confirm'].forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', validateBeforeOrderAction, true);
    }
  });

  // 监听供货方标签变化，切换合作社/工坊时立即刷新对应策略
  const tagEl = document.getElementById('menu-current-agent-tag');
  if (tagEl) {
    new MutationObserver(() => syncAndEnforceStorePolicy()).observe(tagEl, { childList: true, characterData: true, subtree: true });
  }

  syncAndEnforceStorePolicy();
  setTimeout(syncAndEnforceStorePolicy, 1200);
}
