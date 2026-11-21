import { supabase } from '../lib/supabase.js';
import { AuthSecurity } from './authSecurity.js';

export const MobileSecurityGuard = {
  async runMobileSecurityCheck({
    tenantId,
    localSessionEpoch = 1,
    flushOfflineQueueFn,
    onTerminalRevokedFn
  }) {
    if (!tenantId) return;

    if (typeof flushOfflineQueueFn === 'function') {
      try {
        await flushOfflineQueueFn();
      } catch (e) {
        console.warn('[MobileSecurity] 离线队列优先入库重试中:', e);
      }
    }

    const { data, error } = await supabase
      .from('platform_tenant')
      .select('company_name, session_epoch, timelock_status, timelock_expires_at, is_active')
      .eq('tenant_id', tenantId)
      .limit(1);

    if (error || !data || data.length === 0) return;
    const remote = data[0];

    const remoteEpoch = Number(remote.session_epoch || 1);
    if (!remote.is_active || remoteEpoch > Number(localSessionEpoch || 1)) {
      alert('🛡️【终端授权已失效】\n已完成的离线签收凭单已为您安全上传入库。\n因商号刚刚执行了“终端清退”或人员权限变更，本设备已自动退出，请重新核身登录！');
      if (typeof onTerminalRevokedFn === 'function') {
        onTerminalRevokedFn();
      }
      return;
    }

    this.renderMobileTimelockBanner(remote);
  },

  renderMobileTimelockBanner(remoteTenant) {
    const existing = document.getElementById('mobile-timelock-alert-banner');
    if (existing) existing.remove();

    if (remoteTenant.timelock_status !== 'pending' && remoteTenant.timelock_status !== 'ready') {
      return;
    }

    const expStr = remoteTenant.timelock_expires_at
      ? new Date(remoteTenant.timelock_expires_at).toLocaleString('zh-CN', { hour12: false })
      : '72小时后';

    const banner = document.createElement('div');
    banner.id = 'mobile-timelock-alert-banner';
    banner.style.cssText =
      'background:#7f1d1d;color:#fff;padding:10px 14px;font-size:12px;line-height:1.5;border-bottom:2px solid #f59e0b;position:sticky;top:0;z-index:9999;';
    banner.innerHTML = `
      <div style="max-width:640px;margin:0 auto;">
        <strong style="color:#fde68a;">🚨【商号安全预警 · 请立即转告大当家】</strong>
        有人正通过门外通道申请重置【${remoteTenant.company_name}】主密码（预计 <b>${expStr}</b> 生效）。
        <br/>当前送货与收款照常运行（已自动标记待复核）；如非老板本人操作，请大当家立即登录电脑调度台核身驳回！
      </div>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
  },

  getDriverDeviceWatermark() {
    return AuthSecurity.getDeviceFingerprint().summary;
  }
};

export default MobileSecurityGuard;
