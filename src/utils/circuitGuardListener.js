import { supabase } from '../lib/supabase.js';

// 各前端入口页与默认熔断维度的映射关系
const PAGE_SCOPE_MAP = {
  'hq.html': 'hq_write',
  'join.html': 'join_apply',
  'mall.html': 'mall_write',
  'store.html': 'store_write',
  'driver.html': 'driver_write'
};

let cachedPolicy = null;
let lastFetchTs = 0;

function detectCurrentPageName() {
  const path = window.location.pathname || '';
  const file = path.split('/').pop() || 'index.html';
  return file.toLowerCase();
}

function detectCurrentTenantId() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('t') ||
    params.get('tenant_id') ||
    sessionStorage.getItem('hq_tenant_id') ||
    sessionStorage.getItem('store_tenant_id') ||
    sessionStorage.getItem('driver_tenant_id') ||
    localStorage.getItem('baigong_current_tenant_id') ||
    null
  );
}

async function fetchActiveCircuitPolicy(forceRefresh = false) {
  if (!forceRefresh && cachedPolicy && Date.now() - lastFetchTs < 15000) {
    return cachedPolicy;
  }

  try {
    const { data, error } = await supabase
      .from('platform_governance_config')
      .select('config_value')
      .eq('config_key', 'sovereign_active_circuit_policy')
      .maybeSingle();

    if (error || !data?.config_value) {
      cachedPolicy = { scopes: [], target_tenants: [], expires_at: null, public_notice: '', thresholds: {} };
    } else {
      cachedPolicy = JSON.parse(data.config_value);
    }
    lastFetchTs = Date.now();
  } catch (e) {
    cachedPolicy = { scopes: [], target_tenants: [], expires_at: null, public_notice: '', thresholds: {} };
  }
  return cachedPolicy;
}

function isPolicyHit(policy, requiredScope, tenantId = null) {
  if (!policy || !Array.isArray(policy.scopes)) return false;

  // 校验定时自动解封：已过期则自动放行
  if (policy.expires_at && Date.now() >= new Date(policy.expires_at).getTime()) {
    return false;
  }

  if (!policy.scopes.includes(requiredScope)) return false;

  const targets = Array.isArray(policy.target_tenants) ? policy.target_tenants : [];
  if (targets.length === 0) return true; // 作用于全网
  if (tenantId && targets.includes(String(tenantId))) return true; // 命中定点隔离商号

  return false;
}

function renderMaintenanceOverlay(noticeText, isFullLock = false, expiresAt = null) {
  document.getElementById('baigong-circuit-banner')?.remove();
  document.getElementById('baigong-circuit-fullscreen')?.remove();

  const timeTip = expiresAt
    ? `（预计恢复时间：${new Date(expiresAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}）`
    : '';

  if (isFullLock) {
    // 全网战时戒严（如开启了 login_gate）：展示全屏友好维护遮罩
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
    // 局部端口只读护盘：在顶部展示醒目温和安抚条（允许继续浏览查账，但提示写入暂停）
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

/**
 * 动作级精准拦截函数（供各业务页面按钮提交前调用）
 * 返回 true 表示放行；返回 false 表示命中熔断或大额限流（已自动弹出安抚公告）
 */
export async function checkBusinessCircuit(requiredScope, tenantId = null, meta = {}) {
  const policy = await fetchActiveCircuitPolicy(true);
  const resolvedTid = tenantId || detectCurrentTenantId();
  const notice = policy.public_notice || '系统当前模块正在进行安全护盘维护，暂时暂停该项操作，请稍后再试。';

  if (isPolicyHit(policy, requiredScope, resolvedTid)) {
    alert(`🛡️ 平台护盘通知：\n\n${notice}`);
    return false;
  }

  // 检查大额交易动态限流保护（rate_amount_guard）
  if (
    isPolicyHit(policy, 'rate_amount_guard', resolvedTid) &&
    Number(policy.thresholds?.max_single_amount || 0) > 0 &&
    meta.amount != null
  ) {
    const cap = Number(policy.thresholds.max_single_amount);
    if (Number(meta.amount) > cap) {
      alert(`🎚️ 大额交易风控降级提示：\n\n当前单笔交易限额为 ¥${cap}，您的单笔金额（¥${meta.amount}）已超出临时风控上限，请拆分下单或稍后再试。`);
      return false;
    }
  }

  return true;
}

/**
 * 页面加载自动巡检初始化
 */
export async function initPageCircuitGuard() {
  const policy = await fetchActiveCircuitPolicy(true);
  const pageName = detectCurrentPageName();
  const tenantId = detectCurrentTenantId();
  const notice = policy.public_notice || '系统正在进行安全护盘维护，预计稍后恢复正常营业。';

  // 1. 优先检查是否开启了全网登录/访问总闸 (login_gate)
  if (isPolicyHit(policy, 'login_gate', tenantId)) {
    renderMaintenanceOverlay(notice, true, policy.expires_at);
    return;
  }

  // 2. 检查当前页面对应的写入通道是否被锁定
  const mappedScope = PAGE_SCOPE_MAP[pageName];
  if (mappedScope && isPolicyHit(policy, mappedScope, tenantId)) {
    renderMaintenanceOverlay(notice, false, policy.expires_at);
  }
}

// 挂载到全局 window 方便内联脚本调用
window.checkBusinessCircuit = checkBusinessCircuit;
window.initPageCircuitGuard = initPageCircuitGuard;

// 自动启动页面巡检
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initPageCircuitGuard());
} else {
  initPageCircuitGuard();
}
