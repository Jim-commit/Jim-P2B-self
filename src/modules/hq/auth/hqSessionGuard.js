import { supabase } from '../../../lib/supabase.js';
import { AuthSecurity } from '../../../utils/authSecurity.js';
import { hqState } from '../hqState.js';

let _sessionEpochTimer = null;

/**
 * 渲染全局安全护盘预警横幅（72小时时间锁观察期红框 / 未绑验证器温馨提示）
 */
export function renderHQSecurityBanner(tenantRow) {
  let host = document.getElementById('hq-security-banner-host');
  if (!host) {
    const mainContainer = document.querySelector('main') || document.body;
    host = document.createElement('div');
    host.id = 'hq-security-banner-host';
    host.className = 'max-w-7xl mx-auto px-3 sm:px-6 pt-3';
    mainContainer.insertBefore(host, mainContainer.firstChild);
  }
  if (!tenantRow) {
    host.innerHTML = '';
    return;
  }

  // 1. 最高优先级：处于 72 小时无人值守时间锁观察期
  if (tenantRow.timelock_status === 'pending' || tenantRow.timelock_status === 'ready') {
    const expText = tenantRow.timelock_expires_at
      ? new Date(tenantRow.timelock_expires_at).toLocaleString('zh-CN', { hour12: false })
      : '72小时后';
    host.innerHTML = `
      <div class="bg-rose-900 text-white p-3.5 rounded-2xl shadow-lg border border-rose-500/50 flex flex-wrap items-center justify-between gap-3 mb-2">
        <div class="text-xs sm:text-sm leading-relaxed">
          <div class="font-bold text-amber-200">🚨【72小时安全找回观察期 · 账本写保护已激活】</div>
          <div>有人正通过门外通道申请重置本商号主密码（预计 <strong>${expText}</strong> 自动生效）。当前一线接单与送货照常运行，已自动锁死改密与删账。如非本人操作，请立即核身驳回！</div>
        </div>
        <button type="button" onclick="window.rejectTimelockRecovery()" class="bg-white text-rose-900 hover:bg-rose-50 text-xs font-extrabold px-4 py-2 rounded-xl shadow active:scale-95 transition shrink-0">
          🛡️ 我是当家 · 立即核身驳回
        </button>
      </div>
    `;
    return;
  }

  // 2. 次优先级：尚未绑定 TOTP 动态验证器
  if (!tenantRow.totp_enabled && hqState.currentRoleCode === 'owner') {
    host.innerHTML = `
      <div class="bg-amber-50 border border-amber-300 text-amber-950 px-4 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
        <div>
          <strong>🛡️ 账本护航提示：</strong>当前商号尚未绑定手机动态验证器（TOTP）与 6 组保命恢复码，建议花 30 秒开启防护，防范盗号与内部误删账。
        </div>
        <button type="button" onclick="window.openTotpSetupModal()" class="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg transition shrink-0">
          立即 30 秒加固
        </button>
      </div>
    `;
    return;
  }

  host.innerHTML = '';
}

/**
 * 启动全网会话纪元（session_epoch）心跳巡检（每 45 秒轮询）
 */
export function startSessionEpochHeartbeat(tenantId) {
  stopSessionEpochHeartbeat();
  if (!tenantId) return;

  const checkEpoch = async () => {
    if (!hqState.currentAgent || hqState.currentAgent !== tenantId) return;
    const { data } = await supabase
      .from('platform_tenant')
      .select('session_epoch, timelock_status, timelock_expires_at, totp_enabled, is_active')
      .eq('tenant_id', tenantId)
      .limit(1);

    if (!data || data.length === 0) return;
    const remote = data[0];

    if (!remote.is_active) {
      stopSessionEpochHeartbeat();
      alert('🚫 当前商号状态已变更为暂歇，系统将自动退出登录。');
      window.logoutHQ?.();
      return;
    }

    const localEpoch = Number(sessionStorage.getItem('hq_session_epoch_' + tenantId) || 1);
    const remoteEpoch = Number(remote.session_epoch || 1);

    if (remoteEpoch > localEpoch) {
      stopSessionEpochHeartbeat();
      alert('🛡️【登录终端已清退】\n当前商号已在其他信任设备执行了“全网清退旧终端”或重设了安家主密码。\n为保护账本安全，本终端已自动下线，请重新核身登录！');
      window.logoutHQ?.();
      return;
    }

    if (hqState.currentTenantData) {
      hqState.currentTenantData.timelock_status = remote.timelock_status;
      hqState.currentTenantData.timelock_expires_at = remote.timelock_expires_at;
      hqState.currentTenantData.totp_enabled = remote.totp_enabled;
    }
    renderHQSecurityBanner(remote);
  };

  checkEpoch();
  _sessionEpochTimer = setInterval(checkEpoch, 45000);
}

export function stopSessionEpochHeartbeat() {
  if (_sessionEpochTimer) {
    clearInterval(_sessionEpochTimer);
    _sessionEpochTimer = null;
  }
}

/**
 * 一键清退所有其他登录终端（session_epoch + 1）
 */
export async function executeGlobalTerminalRevoke() {
  if (!confirm('🛡️【一键清退其他登录终端】\n\n适用场景：主力手机遗失、怀疑旧电脑忘退账号或人员离职。\n执行后，除当前这台设备外，其他所有电脑和手机的登录状态将在 45 秒内全部强制失效！\n\n确定立即清退其他终端吗？')) {
    return;
  }
  const fp = AuthSecurity.getDeviceFingerprint();
  const { data, error } = await supabase.rpc('rpc_bump_session_epoch', {
    p_tenant_id: hqState.currentAgent,
    p_reason: `当家主动清退其他登录终端 (${fp.summary})`
  });
  if (error || !data?.ok) {
    return alert('终端清退指令执行失败，请检查网络后重试。');
  }
  sessionStorage.setItem('hq_session_epoch_' + hqState.currentAgent, String(data.session_epoch));
  alert(`✅ 全网旧终端已清退（安全纪元 v${data.session_epoch}）！\n本机已保留在线，其他所有设备均已强制下线。`);
}
