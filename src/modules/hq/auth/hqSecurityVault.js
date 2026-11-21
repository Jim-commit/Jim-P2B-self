import { supabase } from '../../../lib/supabase.js';
import { TOTP } from '../../../utils/totp.js';
import { HQService } from '../../../services/hqService.js';
import { AuthSecurity } from '../../../utils/authSecurity.js';
import { hqState } from '../hqState.js';
import { renderHQSecurityBanner } from './hqSessionGuard.js';

export function updateTotpStatusBadge(isEnabled) {
  const totpBtn = document.getElementById('btn-top-totp');
  if (!totpBtn) return;
  if (isEnabled) {
    totpBtn.innerHTML = '✅ 验证器已绑';
    totpBtn.className = 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs px-2.5 py-1.5 rounded-xl font-bold border border-emerald-400/50 active:scale-95 transition';
  } else {
    totpBtn.innerHTML = '🛡️ 验证器';
    totpBtn.className = 'bg-white/5 hover:bg-white/15 text-emerald-200 text-xs px-2.5 py-1.5 rounded-xl font-medium border border-emerald-600/40 active:scale-95 transition';
  }
}

export function bindSecurityVaultActions() {
  // 1. 凭验证器动态码或一次性恢复码秒设新密码
  window.submitSelfRecoverPassword = async function () {
    const phone = document.getElementById('rec-phone').value.trim();
    const creditCode = document.getElementById('rec-credit-code').value.trim().toUpperCase();
    const totpOrRecovery = document.getElementById('rec-totp-code').value.trim();
    const newPwd = document.getElementById('rec-new-pwd').value.trim();

    if (phone.length !== 11 || creditCode.length !== 18) {
      return alert('请完整填写 11 位登记手机号与 18 位信用代码/身份证全号！');
    }
    if (!totpOrRecovery) {
      return alert('请输入手机验证器 6 位动态码或 1 组 8 位应急恢复码（若全设备均已遗失，请点击「72小时无人值守安全找回」）。');
    }

    const { data: rows } = await supabase.from('platform_tenant').select('*').eq('credit_code', creditCode).limit(1);
    if (!rows || rows.length === 0) return alert('⚠️ 未找到该 18 位信用代码/身份证号对应的入驻档案。');

    const tenant = rows[0];
    if (tenant.phone !== phone && tenant.backup_phone !== phone) {
      return alert('⚠️ 输入的手机号码与登记的主联络手机或备用紧急手机号不符！');
    }

    const pwdCheck = AuthSecurity.validatePasswordStrength(newPwd, tenant.tenant_id, phone);
    if (!pwdCheck.ok) return alert('⚠️ 新密码强度提示：' + pwdCheck.msg);

    let verified = false;
    if (/^\d{6}$/.test(totpOrRecovery)) {
      verified = await TOTP.verify(tenant.totp_secret || 'JBSWY3DPEHPK3PXP', totpOrRecovery, 4);
    } else {
      const codeHash = await TOTP.sha256Hex(totpOrRecovery);
      const { data: recRes } = await supabase.rpc('rpc_consume_recovery_code', {
        p_tenant_id: tenant.tenant_id,
        p_code_hash: codeHash
      });
      verified = Boolean(recRes?.ok);
    }

    if (!verified) return alert('⚠️ 动态口令或一次性应急恢复码核验未通过！');

    const hashedNew = await AuthSecurity.hashPassword(newPwd, tenant.tenant_id);
    await HQService.updateTenantWithVerify(tenant.tenant_id, { access_key: hashedNew, reset_claim_token: null });
    await supabase.rpc('rpc_bump_session_epoch', { p_tenant_id: tenant.tenant_id, p_reason: '自助核身重设主密码并清退旧终端' });

    alert(`🎉 核身找回成功！您的商号代号为【${tenant.tenant_id}】，新密码已加密生效并已自动清退所有旧终端！`);
    window.closeModal('modal-self-recover-pwd');
    document.getElementById('hq-login-tenant').value = tenant.tenant_id;
  };

  // 2. 门外零误伤通道：发起 72 小时无人值守时间锁安全找回
  window.submitEmergencyFreezeAccount = async function () {
    const creditCode = document.getElementById('frz-credit-code').value.trim().toUpperCase();
    const phoneOrName = document.getElementById('frz-person-name').value.trim();
    if (creditCode.length !== 18 || !phoneOrName) {
      return alert('请完整填写 18 位证件全号与登记的主/备手机号！');
    }

    const { data: rows } = await supabase.from('platform_tenant').select('*').eq('credit_code', creditCode).limit(1);
    if (!rows || rows.length === 0) return alert('未找到该证件号对应的在册商号档案。');
    const tenant = rows[0];

    const { data: rpcRes, error } = await supabase.rpc('rpc_initiate_timelock_recovery', {
      p_tenant_id: tenant.tenant_id,
      p_credit_code: creditCode,
      p_phone: phoneOrName
    });

    if (error || !rpcRes?.ok) {
      return alert(`⚠️ 无法启动 72 小时安全找回：${rpcRes?.error || error?.message || '请核对登记的主联系手机号或紧急备用手机号'}`);
    }

    const expStr = new Date(rpcRes.expires_at).toLocaleString('zh-CN', { hour12: false });
    alert(
      `⏳ 已为商号【${rpcRes.company_name} (${rpcRes.tenant_id})】启动【72小时无人值守时间锁】！\n\n` +
      `· 观察期写保护已生效：一线接单与送货照常运行，已自动锁死改密、删账与改底价；\n` +
      `· 预计解锁时间：${expStr}（到期后可在此直接设定新主密码，全程无需等待人工）；\n` +
      `· 若赶上抢收急用，可联系平台总控凭手持证件加急提前放行。`
    );
    window.closeModal('modal-emergency-freeze');
  };

  // 3. 核身驳回进行中的 72 小时时间锁（并激活 7 天防骚扰冷却期）
  window.rejectTimelockRecovery = async function () {
    const proof = prompt(
      '🛡️【核身驳回 72 小时找回申请】\n\n为防盗号者反向拦截真老板，请输入以下任一凭证：\n· 手机验证器 6 位动态口令\n· 1 组 8 位一次性应急恢复码\n· 登记的紧急备用手机号'
    );
    if (!proof || !proof.trim()) return;

    const clean = proof.trim();
    const { data: tenant } = await HQService.fetchTenant(hqState.currentAgent);
    if (!tenant) return;

    let valid = false;
    if (/^\d{6}$/.test(clean)) {
      valid = await TOTP.verify(tenant.totp_secret || '', clean, 4);
    } else if (tenant.backup_phone && clean === tenant.backup_phone.trim()) {
      valid = true;
    } else {
      const codeHash = await TOTP.sha256Hex(clean);
      const { data: recRes } = await supabase.rpc('rpc_consume_recovery_code', {
        p_tenant_id: tenant.tenant_id,
        p_code_hash: codeHash
      });
      valid = Boolean(recRes?.ok);
    }

    if (!valid) {
      return alert('⚠️ 核身凭证验证未通过！请确认输入了正确的 TOTP 动态码、应急恢复码或备用手机号。');
    }

    const fp = AuthSecurity.getDeviceFingerprint();
    await supabase.rpc('rpc_reject_timelock_recovery', {
      p_tenant_id: tenant.tenant_id,
      p_verify_proof: fp.summary
    });

    if (hqState.currentTenantData) {
      hqState.currentTenantData.timelock_status = 'none';
      hqState.currentTenantData.timelock_expires_at = null;
    }
    renderHQSecurityBanner(hqState.currentTenantData);
    alert('✅ 已成功驳回该找回申请，并开启【7 天防骚扰冷却期】！');
  };

  // 4. 打开 TOTP 验证器绑定弹窗
  window.openTotpSetupModal = async function () {
    const { data: tenant, error } = await HQService.fetchTenant(hqState.currentAgent);
    if (error) return alert('读取商号信息失败：' + error.message);

    let secret = (tenant?.totp_secret || '').trim();
    if (!secret) {
      secret = TOTP.generateSecret(20);
      try {
        await HQService.updateTenantWithVerify(hqState.currentAgent, { totp_secret: secret, totp_enabled: true });
      } catch (upErr) {
        return alert('⚠️ 云端数据库写入秘钥被拦截：' + upErr.message);
      }
    }

    document.getElementById('totp-secret-display').innerText = secret;
    document.getElementById('totp-test-code').value = '';
    const otpUri = TOTP.getOtpAuthUri(secret, `${tenant?.company_name || hqState.currentAgent}(${hqState.currentAgent})`);
    document.getElementById('totp-setup-qr').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpUri)}`;
    window.openModal('modal-totp-setup');
  };

  window.copyTotpSecret = function () {
    navigator.clipboard.writeText(document.getElementById('totp-secret-display').innerText).then(() => alert('TOTP 金钥已复制！'));
  };

  window.verifyAndSaveTotp = async function () {
    const code = document.getElementById('totp-test-code').value.trim();
    const secret = document.getElementById('totp-secret-display').innerText.trim();
    if (!code || code.length !== 6) return alert('请输入验证器中显示的 6 位动态口令！');

    const isValid = await TOTP.verify(secret, code, 4);
    if (!isValid) {
      return alert('⚠️ 动态口令验证未通过！\n1. 请确认手机「自动设置时间」已开启；\n2. 若扫码异常，请点击「复制密钥」，在手机验证器选择「手动输入密钥」添加（时间基准）。');
    }

    try {
      const recoveryBundle = await TOTP.generateRecoveryCodeBundle(6);
      const { data: tenant } = await HQService.fetchTenant(hqState.currentAgent);

      await HQService.updateTenantWithVerify(hqState.currentAgent, { totp_secret: secret, totp_enabled: true });
      await supabase.rpc('rpc_bind_totp_and_recovery', {
        p_tenant_id: hqState.currentAgent,
        p_access_key: tenant?.access_key || '',
        p_totp_secret: secret,
        p_recovery_hashes: recoveryBundle.hashedCodes
      });

      if (hqState.currentTenantData) {
        hqState.currentTenantData.totp_secret = secret;
        hqState.currentTenantData.totp_enabled = true;
      }
      updateTotpStatusBadge(true);
      renderHQSecurityBanner(hqState.currentTenantData);
      window.closeModal('modal-totp-setup');

      AuthSecurity.showVoucherPreviewModal({
        tenantId: hqState.currentAgent,
        companyName: tenant?.company_name || hqState.currentAgent,
        legalName: tenant?.contact_person || tenant?.contact_name || '',
        phone: tenant?.phone || '',
        backupPhone: tenant?.backup_phone || '',
        recoveryCodes: recoveryBundle.plainCodes
      });
    } catch (err) {
      alert('⚠️ 数据库写入被拦截：' + err.message);
    }
  };

  // 5. 修改主密码（自动清退其他旧终端）
  window.openChangePasswordModal = function () {
    ['chg-old-key', 'chg-new-key', 'chg-confirm-key', 'chg-totp-code'].forEach((id) => (document.getElementById(id).value = ''));
    window.openModal('modal-change-password');
  };

  window.submitChangePassword = async function () {
    const oldKey = document.getElementById('chg-old-key').value.trim();
    const newKey = document.getElementById('chg-new-key').value.trim();
    const confirmKey = document.getElementById('chg-confirm-key').value.trim();
    const totpCode = document.getElementById('chg-totp-code').value.trim();
    if (!oldKey || !newKey) return alert('请填全原密码与新密码！');
    if (newKey !== confirmKey) return alert('两次输入的新密码不一致！');
    if (!totpCode) return alert('请输入手机验证器 6 位动态码或 1 组 8 位应急恢复码！');

    const pwdCheck = AuthSecurity.validatePasswordStrength(newKey, hqState.currentAgent, '');
    if (!pwdCheck.ok) return alert('⚠️ 新密码强度提示：' + pwdCheck.msg);

    const { data: tenant } = await HQService.fetchTenant(hqState.currentAgent);
    if (!tenant) return;
    const isOldKeyMatch = await AuthSecurity.verifyPassword(oldKey, tenant.access_key, hqState.currentAgent);
    const isTokenMatch = tenant.reset_claim_token && oldKey.toUpperCase() === tenant.reset_claim_token.toUpperCase();
    if (!isOldKeyMatch && !isTokenMatch) return alert('⚠️ 原访问密钥不正确！');

    let isTotpValid = false;
    if (/^\d{6}$/.test(totpCode)) {
      isTotpValid = await TOTP.verify(tenant.totp_secret || 'JBSWY3DPEHPK3PXP', totpCode, 4);
    } else {
      const codeHash = await TOTP.sha256Hex(totpCode);
      const { data: recRes } = await supabase.rpc('rpc_consume_recovery_code', {
        p_tenant_id: hqState.currentAgent,
        p_code_hash: codeHash
      });
      isTotpValid = Boolean(recRes?.ok);
    }
    if (!isTotpValid) return alert('⚠️ 验证器动态码或应急恢复码核验未通过！');

    const hashedNewKey = await AuthSecurity.hashPassword(newKey, hqState.currentAgent);
    try {
      await HQService.updateTenantWithVerify(hqState.currentAgent, { access_key: hashedNewKey, reset_claim_token: null });
      const { data: epochRes } = await supabase.rpc('rpc_bump_session_epoch', {
        p_tenant_id: hqState.currentAgent,
        p_reason: '大当家修改安家主密码并清退旧终端'
      });
      sessionStorage.setItem('hq_tenant_session_' + hqState.currentAgent, hashedNewKey);
      if (epochRes?.session_epoch) {
        sessionStorage.setItem('hq_session_epoch_' + hqState.currentAgent, String(epochRes.session_epoch));
      }
      document.getElementById('hq-default-pwd-banner')?.classList.add('hidden');
      alert('🎉 新密钥已哈希加密写入云端并生效存盘，其他旧终端已自动清退！');
      window.closeModal('modal-change-password');
    } catch (err) {
      alert('⚠️ 修改密码写入云端被拦截：' + err.message);
    }
  };

  // 6. 二因子核身门禁（同时兼容 TOTP 6位数字与 8位一次性恢复码）
  window.trigger2FAAction = function (actionDesc, onVerifiedCallback) {
    const guard = AuthSecurity.guardWriteOperation(hqState.currentTenantData, 'high_risk');
    if (!guard.allowed) {
      alert(guard.reason);
      return;
    }

    document.getElementById('modal-2fa-desc').innerText = actionDesc;
    document.getElementById('input-2fa-code').value = '';
    hqState.pending2FACallback = onVerifiedCallback;
    window.openModal('modal-2fa-verify');
    setTimeout(() => document.getElementById('input-2fa-code').focus(), 150);
  };

  window.close2FAModal = function () {
    hqState.pending2FACallback = null;
    window.closeModal('modal-2fa-verify');
  };

  window.submit2FAVerification = async function () {
    const code = document.getElementById('input-2fa-code').value.trim();
    if (!code) return alert('⚠️ 请输入 6 位动态口令或 1 组 8 位应急恢复码！');

    const { data: tenant } = await HQService.fetchTenant(hqState.currentAgent);
    let isValid = false;

    if (/^\d{6}$/.test(code)) {
      isValid = await TOTP.verify(tenant?.totp_secret || 'JBSWY3DPEHPK3PXP', code, 4);
    } else {
      const codeHash = await TOTP.sha256Hex(code);
      const { data: recRes } = await supabase.rpc('rpc_consume_recovery_code', {
        p_tenant_id: hqState.currentAgent,
        p_code_hash: codeHash
      });
      isValid = Boolean(recRes?.ok);
      if (isValid) {
        alert(`✅ 一次性应急恢复码核销成功（剩余 ${recRes.remaining}/6 组）！`);
      }
    }

    if (!isValid) return alert('⚠️ 动态口令或一次性恢复码验证失败！');
    window.close2FAModal();
    if (typeof hqState.pending2FACallback === 'function') hqState.pending2FACallback();
  };
}
