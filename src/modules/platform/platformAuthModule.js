import { supabase } from '../../lib/supabase.js';
import { TOTP } from '../../utils/totp.js';
import {
  P_AUTH_SESSION_KEY,
  platformState,
  recordAuditLog
} from './platformState.js';

export async function checkPlatformAuthStatus() {
  const savedToken = sessionStorage.getItem(P_AUTH_SESSION_KEY);
  if (!savedToken) {
    document.getElementById('platform-auth-gate')?.classList.remove('hidden');
    return false;
  }

  const { data } = await supabase
    .from('platform_admin_credential')
    .select('*')
    .eq('secret_token', savedToken)
    .eq('is_active', true)
    .limit(1);

  if (data && data.length > 0) {
    document.getElementById('platform-auth-gate')?.classList.add('hidden');
    const pill = document.getElementById('totp-status-pill');
    const btnTotp = document.getElementById('btn-platform-totp');
    if (data[0].totp_enabled && data[0].totp_secret) {
      if (pill) {
        pill.className = 'bg-emerald-500/20 text-emerald-300 text-[10px] px-2.5 py-0.5 rounded-full border border-emerald-400/40 font-mono font-bold flex items-center gap-1';
        pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> TOTP 已护航';
      }
      if (btnTotp) {
        btnTotp.innerHTML = '<span>✅</span> 总控验证器已绑';
        btnTotp.className =
          'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs px-3.5 py-2 rounded-xl font-bold border border-emerald-400/50 active:scale-95 transition flex items-center gap-1.5';
      }
    } else {
      if (pill) {
        pill.className = 'bg-stone-800 text-stone-400 text-[10px] px-2.5 py-0.5 rounded-full border border-stone-700 font-mono font-bold flex items-center gap-1';
        pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-stone-500"></span> TOTP 未激活';
      }
      if (btnTotp) {
        btnTotp.innerHTML = '<span>🛡️</span> 绑定总控验证器';
        btnTotp.className =
          'bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs px-3.5 py-2 rounded-xl font-bold border border-amber-400/30 active:scale-95 transition flex items-center gap-1.5';
      }
    }
    return true;
  } else {
    sessionStorage.removeItem(P_AUTH_SESSION_KEY);
    document.getElementById('platform-auth-gate')?.classList.remove('hidden');
    return false;
  }
}

export function initPlatformAuthBindings() {
  window.openPlatformTotpSetup = async function () {
    const account = sessionStorage.getItem('p_auth_account') || 'admin';
    const { data: admin, error } = await supabase
      .from('platform_admin_credential')
      .select('*')
      .eq('admin_account', account)
      .single();

    if (error || !admin) {
      return alert('读取总控管理员信息失败：' + (error?.message || '未找到账号'));
    }

    let secret = (admin.totp_secret || '').trim();
    if (!secret) {
      secret = TOTP.generateRandomSecret();
      const { data: upData, error: upErr } = await supabase
        .from('platform_admin_credential')
        .update({ totp_secret: secret })
        .eq('admin_account', account)
        .select();

      if (upErr || !upData || upData.length === 0) {
        return alert('⚠️ 云端数据库写入秘钥被拦截，请先在 Supabase SQL Editor 执行 RLS 更新放行策略：' + (upErr?.message || '受影响行数为 0'));
      }
    }

    document.getElementById('platform-totp-secret-display').innerText = secret;
    document.getElementById('platform-totp-test-code').value = '';
    document.getElementById('platform-totp-qr').src = TOTP.buildQrImageUrl('PlatformMasterHQ', account, secret);
    window.openModal('modal-platform-totp-setup');
  };

  window.copyPlatformTotpSecret = function () {
    const secret = document.getElementById('platform-totp-secret-display').innerText;
    navigator.clipboard.writeText(secret).then(() => alert('总控 TOTP 密钥已复制到剪贴簿！'));
  };

  window.verifyAndSavePlatformTotp = async function () {
    const code = document.getElementById('platform-totp-test-code').value.trim();
    const secret = document.getElementById('platform-totp-secret-display').innerText.trim();
    const account = sessionStorage.getItem('p_auth_account') || 'admin';

    if (!code || code.length !== 6) return alert('请输入验证器中显示的 6 位动态口令！');

    const isValid = await TOTP.verifyTOTP(secret, code, 2);
    if (!isValid) {
      return alert('⚠️ 动态口令验证未通过！\n1. 请确认手机「自动设置时间」已开启；\n2. 若扫码异常，请点击「复制密钥」，在手机验证器选择「手动输入密钥」添加（基于时间）。');
    }

    const { data, error } = await supabase
      .from('platform_admin_credential')
      .update({ totp_secret: secret, totp_enabled: true })
      .eq('admin_account', account)
      .select();

    if (error || !data || data.length === 0) {
      return alert('⚠️ 数据库写入被拦截（请在 Supabase SQL Editor 执行 platform_admin_credential 的 UPDATE 放行策略）：' + (error?.message || '受影响行数为 0'));
    }

    await recordAuditLog('绑定总控TOTP验证器', 'CRITICAL_2FA', { admin_account: account });
    alert('🎉 平台总控身份验证器已真正写入云端并绑定成功！');
    window.closeModal('modal-platform-totp-setup');
    await checkPlatformAuthStatus();
  };

  window.verifyPlatformAuthPwd = async function (e) {
    e.preventDefault();
    const account = document.getElementById('p-auth-account').value.trim();
    const token = document.getElementById('p-auth-token').value.trim();
    const errBox = document.getElementById('p-auth-error');
    const btn = document.getElementById('btn-platform-auth');

    btn.disabled = true;
    btn.innerText = '正在核对密钥...';
    errBox.classList.add('hidden');

    const { data, error } = await supabase
      .from('platform_admin_credential')
      .select('*')
      .eq('admin_account', account)
      .eq('secret_token', token)
      .eq('is_active', true)
      .limit(1);

    if (error || !data || data.length === 0) {
      btn.disabled = false;
      btn.innerText = '安全验证 · 登录总控台';
      errBox.innerText = '⚠️ 安全凭证无效或账号已被锁定！';
      errBox.classList.remove('hidden');
      return;
    }

    sessionStorage.setItem(P_AUTH_SESSION_KEY, token);
    sessionStorage.setItem('p_auth_account', account);
    sessionStorage.setItem('p_auth_name', data[0].admin_name || '总控执事');
    document.getElementById('platform-auth-gate').classList.add('hidden');
    alert(`✅ 凭证核验通过！欢迎：${data[0].admin_name}`);
    window.loadPlatformData();
    checkPlatformAuthStatus();
  };

  window.logoutPlatform = function () {
    sessionStorage.removeItem(P_AUTH_SESSION_KEY);
    sessionStorage.removeItem('p_auth_account');
    sessionStorage.removeItem('p_auth_name');
    document.getElementById('platform-auth-gate')?.classList.remove('hidden');
  };

  window.triggerPlatform2FA = async function (actionDesc, onVerifiedCallback) {
    document.getElementById('modal-platform-2fa-desc').innerText = actionDesc;
    document.getElementById('input-platform-2fa-token').value = '';
    platformState.pendingPlatform2FACallback = onVerifiedCallback;
    window.openModal('modal-platform-2fa');
    setTimeout(() => document.getElementById('input-platform-2fa-token').focus(), 150);
  };

  window.closePlatform2FAModal = function () {
    platformState.pendingPlatform2FACallback = null;
    window.closeModal('modal-platform-2fa');
  };

  window.submitPlatform2FAVerification = async function () {
    const inputVal = document.getElementById('input-platform-2fa-token').value.trim();
    const account = sessionStorage.getItem('p_auth_account') || 'admin';
    const curToken = sessionStorage.getItem(P_AUTH_SESSION_KEY);

    const { data: admin } = await supabase
      .from('platform_admin_credential')
      .select('*')
      .eq('admin_account', account)
      .single();

    let isSuccess = false;
    if (admin?.totp_enabled && admin?.totp_secret && inputVal.length === 6 && /^\d+$/.test(inputVal)) {
      isSuccess = await TOTP.verifyTOTP(admin.totp_secret, inputVal, 2);
    } else {
      isSuccess = inputVal === curToken;
    }

    if (!isSuccess) {
      return alert('⚠️ 身份核身失败！口令或总控令牌不符，操作已被中止。');
    }

    window.closePlatform2FAModal();
    if (typeof platformState.pendingPlatform2FACallback === 'function') {
      platformState.pendingPlatform2FACallback();
    }
  };
}
