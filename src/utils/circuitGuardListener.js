import { supabase } from '../lib/supabase.js';

const PAGE_SCOPE_MAP = {
  'hq.html': 'hq_write',
  'join.html': 'join_apply',
  'mall.html': 'mall_write',
  'store.html': 'store_write',
  'driver.html': 'driver_write'
};

let cachedGlobalPolicy = null;
let cachedSelfPolicies = {};
let lastFetchTs = 0;

function detectCurrentPageName() {
  const path = window.location.pathname || '';
  const file = path.split('/').pop() || 'index.html';
  return file.toLowerCase();
}

function syncTenantSessionContext() {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlTid = params.get('t') || params.get('tenant_id');
    if (urlTid) {
      localStorage.setItem('baigong_current_tenant_id', urlTid);
      sessionStorage.setItem('hq_tenant_id', urlTid);
      sessionStorage.setItem('store_tenant_id', urlTid);
      sessionStorage.setItem('driver_tenant_id', urlTid);
    }

    // 兼容读取各端已有会话缓存
    const activeAgent = localStorage.getItem('active_agent');
    if (activeAgent) {
      sessionStorage.setItem('store_tenant_id', activeAgent);
    }

    const palmSessRaw = localStorage.getItem('baigong_palm_session_v1');
    if (palmSessRaw) {
      const palmSess = JSON.parse(palmSessRaw);
      if (palmSess?.tenantId) {
        sessionStorage.setItem('driver_tenant_id', palmSess.tenantId);
      }
    }

    const hqSessRaw = sessionStorage.getItem('hq_session') || localStorage.getItem('hq_session');
    if (hqSessRaw) {
      const hqSess = JSON.parse(hqSessRaw);
      if (hqSess?.tenantId || hqSess?.agent) {
        sessionStorage.setItem('hq_tenant_id', hqSess.tenantId || hqSess.agent);
      }
    }
  } catch (e) {}
}

function detectCurrentTenantId() {
  syncTenantSessionContext();
  const page = detectCurrentPageName();
  const params = new URLSearchParams(window.location.search);
  const urlTid = params.get('t') || params.get('tenant_id');
  if (urlTid) return urlTid;

  if (page === 'hq.html') {
    return sessionStorage.getItem('hq_tenant_id') || localStorage.getItem('baigong_current_tenant_id') || null;
  }
  if (page === 'store.html') {
    return sessionStorage.getItem('store_tenant_id') || localStorage.getItem('active_agent') || null;
  }
  if (page === 'driver.html') {
    return sessionStorage.getItem('driver_tenant_id') || localStorage.getItem('baigong_palm_last_tid') || null;
  }

  return (
    sessionStorage.getItem('hq_tenant_id') ||
    sessionStorage.getItem('store_tenant_id') ||
    sessionStorage.getItem('driver_tenant_id') ||
    localStorage.getItem('baigong_current_tenant_id') ||
    null
  );
}

async function fetchCombinedPolicies(tenantId = null, forceRefresh = false) {
  const keys = ['sovereign_active_circuit_policy'];
  if (tenantId) keys.push(`tenant_self_circuit_${tenantId}`);

  if (!forceRefresh && cachedGlobalPolicy && Date.now() - lastFetchTs < 15000) {
    return {
      globalPolicy: cachedGlobalPolicy,
      selfPolicy: tenantId ? cachedSelfPolicies[tenantId] || null : null
    };
  }

  try {
    const { data, error } = await supabase
      .from('platform_governance_config')
      .select('config_key, config_value')
      .in('config_key', keys);

    cachedGlobalPolicy = { scopes: [], target_tenants: [], expires_at: null, public_notice: '', thresholds: {} };
    if (tenantId) cachedSelfPolicies[tenantId] = null;

    if (!error && Array.isArray(data)) {
      data.forEach((row) => {
        if (!row.config_value) return;
        try {
          const parsed = JSON.parse(row.config_value);
          if (row.config_key === 'sovereign_active_circuit_policy') {
            cachedGlobalPolicy = parsed;
          } else if (tenantId && row.config_key === `tenant_self_circuit_${tenantId}`) {
            cachedSelfPolicies[tenantId] = parsed;
          }
        } catch (e) {}
      });
    }
    lastFetchTs = Date.now();
  } catch (e) {
    cachedGlobalPolicy = { scopes: [], target_tenants: [], expires_at: null, public_notice: '', thresholds: {} };
  }

  return {
    globalPolicy: cachedGlobalPolicy,
    selfPolicy: tenantId ? cachedSelfPolicies[tenantId] || null : null
  };
}

function isPolicyHit(policy, requiredScope, tenantId = null, isSelfPolicy = false) {
  if (!policy || !Array.isArray(policy.scopes)) return false;
  if (policy.expires_at && Date.now() >= new Date(policy.expires_at).getTime()) return false;
  if (!policy.scopes.includes(requiredScope)) return false;

  if (isSelfPolicy) return true;

  const targets = Array.isArray(policy.target_tenants) ? policy.target_tenants : [];
  if (targets.length === 0) return true;
  if (tenantId && targets.includes(String(tenantId))) return true;
  return false;
}

function renderMaintenanceOverlay(noticeText, isFullLock = false, expiresAt = null) {
  document.getElementById('baigong-circuit-banner')?.remove();
  document.getElementById('baigong-circuit-fullscreen')?.remove();

  const timeTip = expiresAt
    ? `（预计恢复时间：${new Date(expiresAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}）`
    : '';

  if (isFullLock) {
    const mask = document.createElement('div');
    mask.id = 'baigong-circuit-fullscreen';
    mask.style.cssText =
      'position:fixed;inset:0;background:rgba(12,10,9,0.94);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;color:#f5f5f4;font-family:system-ui,-apple-system,sans-serif;';
    mask.innerHTML = `
      <div style="max-width:440px;width:100%;background:#1c1917;border:1px solid #d97706;border-radius:24px;padding:28px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);">
        <div style="font-size:36px;margin-bottom:12px;">🛡️</div>
        <h2 style="font-size:18px;font-weight:900;color:#fbbf24;margin:0 0 10px;">系统安全护盘维护中</h2>
        <p style="font-size:13px;line-height:1.7;color:#d6d3d1;margin:0 0 16px;">${noticeText}${timeTip}</p>
        <button type="button" onclick="window.location.reload()" style="background:#f59e0b;color:#0c0a09;border:none;padding:10px 22px;border-radius:12px;font-weight:800;font-size:12px;cursor:pointer;">
          🔄 刷新检测恢复状态
        </button>
      </div>
    `;
    document.body.appendChild(mask);
  } else {
    const banner = document.createElement('div');
    banner.id = 'baigong-circuit-banner';
    banner.style.cssText =
      'position:sticky;top:0;left:0;right:0;background:#78350f;color:#fef3c7;border-bottom:1px solid #f59e0b;padding:10px 16px;font-size:12px;z-index:9999;display:flex;align-items:center;justify-content:center;gap:8px;text-align:center;font-family:system-ui,-apple-system,sans-serif;';
    banner.innerHTML = `
      <span>🛡️ <b>护盘提示：</b>${noticeText}${timeTip}（当前处于只读浏览保护状态）</span>
      <button type="button" onclick="this.parentElement.remove()" style="background:rgba(0,0,0,0.25);color:#fde68a;border:none;padding:2px 8px;border-radius:6px;font-size:11px;cursor:pointer;">知道了</button>
    `;
    document.body.prepend(banner);
  }
}

export async function checkBusinessCircuit(requiredScope, tenantId = null, meta = {}) {
  const resolvedTid = tenantId || detectCurrentTenantId();
  const { globalPolicy, selfPolicy } = await fetchCombinedPolicies(resolvedTid, true);

  // 1. 优先校验平台最高主权熔断
  if (isPolicyHit(globalPolicy, requiredScope, resolvedTid, false)) {
    const notice = globalPolicy.public_notice || '平台当前模块正在进行安全护盘维护，暂时暂停该项操作，请稍后再试。';
    alert(`🛡️ 平台护盘通知：\n\n${notice}`);
    return false;
  }

  // 2. 校验商号大当家自己启用的本店紧急拉闸保护
  if (selfPolicy && isPolicyHit(selfPolicy, requiredScope, resolvedTid, true)) {
    const selfNotice = selfPolicy.public_notice || '本店掌柜已开启临时盘点与安全保护锁，暂停该项业务提交，请稍后再试。';
    alert(`🔒 商号安全自救提示：\n\n${selfNotice}`);
    return false;
  }

  // 3. 校验平台大额交易限流
  if (
    isPolicyHit(globalPolicy, 'rate_amount_guard', resolvedTid, false) &&
    Number(globalPolicy.thresholds?.max_single_amount || 0) > 0 &&
    meta.amount != null
  ) {
    const cap = Number(globalPolicy.thresholds.max_single_amount);
    if (Number(meta.amount) > cap) {
      alert(`🎚️ 大额交易风控降级提示：\n\n当前单笔交易限额为 ¥${cap}，您的单笔金额（¥${meta.amount}）已超出临时风控上限，请拆分下单或稍后再试。`);
      return false;
    }
  }

  return true;
}

export async function initPageCircuitGuard() {
  const pageName = detectCurrentPageName();
  const tenantId = detectCurrentTenantId();
  const { globalPolicy, selfPolicy } = await fetchCombinedPolicies(tenantId, true);

  if (isPolicyHit(globalPolicy, 'login_gate', tenantId, false)) {
    renderMaintenanceOverlay(
      globalPolicy.public_notice || '系统正在进行安全护盘维护，预计稍后恢复正常营业。',
      true,
      globalPolicy.expires_at
    );
    return;
  }

  const mappedScope = PAGE_SCOPE_MAP[pageName];
  if (mappedScope) {
    if (isPolicyHit(globalPolicy, mappedScope, tenantId, false)) {
      renderMaintenanceOverlay(
        globalPolicy.public_notice || '平台正在进行安全护盘维护，预计稍后恢复正常营业。',
        false,
        globalPolicy.expires_at
      );
    } else if (selfPolicy && isPolicyHit(selfPolicy, mappedScope, tenantId, true)) {
      renderMaintenanceOverlay(
        selfPolicy.public_notice || '本店掌柜已开启临时安全保护，暂停新单提交。',
        false,
        selfPolicy.expires_at
      );
    }
  }
}

window.checkBusinessCircuit = checkBusinessCircuit;
window.initPageCircuitGuard = initPageCircuitGuard;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initPageCircuitGuard());
} else {
  initPageCircuitGuard();
}
