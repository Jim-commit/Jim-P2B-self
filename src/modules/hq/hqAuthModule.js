import { supabase } from '../../lib/supabase.js';
import { TOTP } from '../../utils/totp.js';
import { HQService } from '../../services/hqService.js';
import { AuthSecurity } from '../../utils/authSecurity.js';
import { hqState } from './hqState.js';

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

export function applyRoleViewExperience(roleCode, operatorName) {
  const displayEl = document.getElementById('hq-operator-role-display');
  const roleLabels = {
    owner: '大当家主账号 (全盘管理权)',
    warehouse: `仓储调度 · ${operatorName} (仅管实物 · 物理盲价)`,
    producer: `产区采收/班组长 · ${operatorName} (预入库与排产 · 物理盲价)`,
    finance: `账房财务 · ${operatorName} (管账审单 · 不改库)`,
    sales: `业务员/客户经理 · ${operatorName} (私海客户跟进与催收留痕)`,
    driver: `送货师傅 · ${operatorName} (随车交割)`,
    qc_service: `售后定损/质检 · ${operatorName} (定损鉴证)`,
    auditor: `独立稽核 · ${operatorName} (全盘只读审计)`
  };
  if (displayEl) displayEl.innerText = roleLabels[roleCode] || operatorName;

  if (roleCode !== 'owner') {
    document.getElementById('btn-top-chg-pwd')?.classList.add('hidden');
    document.getElementById('btn-top-totp')?.classList.add('hidden');
    document.querySelectorAll('.owner-only-guard').forEach((el) => el.classList.add('hidden'));
  }

  if (roleCode === 'warehouse' || roleCode === 'producer') {
    document.querySelectorAll('.price-col-guard').forEach((el) => el.classList.add('hidden'));
    document.getElementById('btn-top-statement')?.classList.add('hidden');
    document.getElementById('btn-top-counter')?.classList.add('hidden');
    document.getElementById('tab-btn-stores')?.classList.add('hidden');
    document.getElementById('tab-btn-perf')?.classList.add('hidden');
    const moneyCard = document.getElementById('flow-money-card');
    if (moneyCard) moneyCard.classList.add('hidden');
    window.switchTab('products');
  }

  if (roleCode === 'finance') {
    document.getElementById('btn-bulk-import')?.classList.add('hidden');
    document.getElementById('btn-add-product')?.classList.add('hidden');
    window.switchTab('settle');
  }

  if (roleCode === 'sales') {
    document.getElementById('btn-bulk-import')?.classList.add('hidden');
    document.getElementById('btn-add-product')?.classList.add('hidden');
    window.switchTab('stores');
  }

  if (roleCode === 'auditor') {
    document.querySelectorAll('.write-op-guard').forEach((el) => el.classList.add('hidden'));
    document.getElementById('btn-bulk-import')?.classList.add('hidden');
    document.getElementById('btn-add-product')?.classList.add('hidden');
  }
}

export async function checkHQAuthStatus() {
  const authedTenant = sessionStorage.getItem('hq_active_authed_tenant');
  if (!authedTenant) {
    document.getElementById('hq-auth-gate')?.classList.remove('hidden');
    return false;
  }
  const savedKey = sessionStorage.getItem('hq_tenant_session_' + authedTenant);
  if (!savedKey) {
    document.getElementById('hq-auth-gate')?.classList.remove('hidden');
    const loginInp = document.getElementById('hq-login-tenant');
    if (loginInp) loginInp.value = authedTenant;
    return false;
  }

  const { data } = await supabase
    .from('platform_tenant')
    .select('*')
    .eq('tenant_id', authedTenant)
    .eq('access_key', savedKey)
    .eq('is_active', true)
    .limit(1);

  if (data && data.length > 0) {
    hqState.currentAgent = authedTenant;
    hqState.currentRoleCode = sessionStorage.getItem('hq_sub_role_' + authedTenant) || 'owner';
    hqState.currentAccountCode = sessionStorage.getItem('hq_sub_account_' + authedTenant) || '';
    hqState.currentOperatorName = sessionStorage.getItem('hq_sub_name_' + authedTenant) || '大当家主账号';
    document.getElementById('hq-auth-gate')?.classList.add('hidden');
    applyRoleViewExperience(hqState.currentRoleCode, hqState.currentOperatorName);
    return true;
  } else {
    sessionStorage.removeItem('hq_tenant_session_' + authedTenant);
    sessionStorage.removeItem('hq_active_authed_tenant');
    document.getElementById('hq-auth-gate')?.classList.remove('hidden');
    return false;
  }
}

export function renderSubUsersTable() {
  const tbody = document.getElementById('subuser-table-body');
  if (!tbody) return;
  const defaultRoles = {
    finance: '账房财务 (管账审单 · 不过手现金 · 不改策略)',
    warehouse: '仓储调度 (出入库盘点发货 · 物理盲价)',
    sales: '业务员/客户经理 (拜访跟进 · 催收留痕交财务核销)',
    driver: '送货师傅 (随车收款签收 · 不管总账)',
    producer: '产区采收/班组长 (预入库与排产 · 物理盲价)',
    qc_service: '售后定损/质检 (上门验损定责 · 签发DS定损单)',
    auditor: '独立稽核 (全盘只读审计 · 零改动权限)'
  };
  tbody.innerHTML = hqState.allSubUsers
    .map((u) => {
      const phoneParts = String(u.phone || '').split('|');
      const purePhone = phoneParts[0] || '-';
      const customTitle = phoneParts[1] || defaultRoles[u.role_code] || u.role_code;
      return `
        <tr class="hover:bg-stone-50 transition">
          <td class="p-2.5 font-bold font-mono">${u.account_name}</td>
          <td class="p-2.5 font-bold">${u.real_name}</td>
          <td class="p-2.5 font-medium text-emerald-950">${customTitle}</td>
          <td class="p-2.5 font-mono text-stone-500">${purePhone}</td>
          <td class="p-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${u.is_active ? '在册当值' : '停用'}</span></td>
          <td class="p-2.5 text-right"><button onclick="window.toggleSubUserActive(${u.id}, ${u.is_active})" class="text-[11px] font-bold text-stone-600 hover:underline">${u.is_active ? '停职' : '复职'}</button></td>
        </tr>
      `;
    })
    .join('');
}

export function initAuthBindings() {
  window.switchHQLoginMode = function (mode) {
    const pwdForm = document.getElementById('pane-login-pwd');
    const qrPane = document.getElementById('pane-login-qr');
    const tabPwd = document.getElementById('hq-login-tab-pwd');
    const tabQr = document.getElementById('hq-login-tab-qr');

    if (mode === 'qr') {
      pwdForm?.classList.add('hidden');
      qrPane?.classList.remove('hidden');
      if (tabQr) tabQr.className = 'py-2 rounded-xl bg-[#1b4332] text-white shadow transition';
      if (tabPwd) tabPwd.className = 'py-2 rounded-xl text-stone-600 hover:text-stone-900 transition';
      window.initHQScanQrSession();
    } else {
      if (hqState.hqQrPollTimer) clearInterval(hqState.hqQrPollTimer);
      qrPane?.classList.add('hidden');
      pwdForm?.classList.remove('hidden');
      if (tabPwd) tabPwd.className = 'py-2 rounded-xl bg-[#1b4332] text-white shadow transition';
      if (tabQr) tabQr.className = 'py-2 rounded-xl text-stone-600 hover:text-stone-900 transition';
    }
  };

  window.initHQScanQrSession = async function () {
    if (hqState.hqQrPollTimer) clearInterval(hqState.hqQrPollTimer);
    document.getElementById('hq-scan-qr-expired')?.classList.add('hidden');

    const sessionToken = 'SCAN-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    document.getElementById('hq-scan-token-text').innerText = sessionToken;
    document.getElementById('hq-scan-status-text').innerText = '等待手机扫码授权...';

    const qrTargetUrl = `${window.location.origin}/driver.html?qr_token=${encodeURIComponent(sessionToken)}`;
    document.getElementById('hq-scan-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrTargetUrl)}`;

    try {
      await supabase.from('login_qr_session').insert([{ session_token: sessionToken, status: 'waiting' }]);
    } catch (e) {}

    let elapsedSec = 0;
    hqState.hqQrPollTimer = setInterval(async () => {
      elapsedSec += 2;
      if (elapsedSec >= 90) {
        clearInterval(hqState.hqQrPollTimer);
        document.getElementById('hq-scan-qr-expired')?.classList.remove('hidden');
        document.getElementById('hq-scan-status-text').innerText = '二维码已过期';
        return;
      }

      const { data } = await supabase
        .from('login_qr_session')
        .select('*')
        .eq('session_token', sessionToken)
        .eq('status', 'approved')
        .limit(1);

      if (data && data.length > 0 && data[0].tenant_id) {
        clearInterval(hqState.hqQrPollTimer);
        const approvedTid = data[0].tenant_id;
        const { data: tenantRows } = await supabase
          .from('platform_tenant')
          .select('*')
          .eq('tenant_id', approvedTid)
          .eq('is_active', true)
          .limit(1);

        if (tenantRows && tenantRows.length > 0) {
          sessionStorage.setItem('hq_tenant_session_' + approvedTid, tenantRows[0].access_key);
          sessionStorage.setItem('hq_active_authed_tenant', approvedTid);
          sessionStorage.removeItem('hq_sub_role_' + approvedTid);
          sessionStorage.removeItem('hq_sub_account_' + approvedTid);
          sessionStorage.removeItem('hq_sub_name_' + approvedTid);

          hqState.currentAgent = approvedTid;
          hqState.currentRoleCode = 'owner';
          hqState.currentAccountCode = '';
          hqState.currentOperatorName = data[0].operator_name || '大当家主账号';

          document.getElementById('hq-auth-gate')?.classList.add('hidden');
          applyRoleViewExperience('owner', hqState.currentOperatorName);
          window.loadHQData();
        }
      }
    }, 2000);
  };

  window.verifyHQAuthPwd = async function (e) {
    e.preventDefault();
    const tenantId = document.getElementById('hq-login-tenant').value.trim().toUpperCase();
    const rawKey = document.getElementById('hq-login-key').value.trim();
    const errBox = document.getElementById('hq-auth-error');
    const btn = document.getElementById('btn-hq-pwd');

    const lockInfo = AuthSecurity.checkLoginLockout(`HQ_${tenantId}`);
    if (lockInfo.locked) {
      errBox.innerText = `🛡️ 安全保护：该商号连续输错次数过多，请 ${lockInfo.remainMins} 分钟后再试。`;
      errBox.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.innerText = '核对中...';
    errBox.classList.add('hidden');

    if (rawKey.includes(':') || rawKey.includes('：')) {
      const [subAcc, subPwd] = rawKey.split(/[:：]/).map((s) => s.trim());
      const { data: tenantList } = await supabase.from('platform_tenant').select('*').eq('tenant_id', tenantId).eq('is_active', true).limit(1);
      if (!tenantList || tenantList.length === 0) {
        AuthSecurity.recordLoginFailure(`HQ_${tenantId}`);
        btn.disabled = false;
        btn.innerText = '核验密钥 · 登录调度台';
        errBox.innerText = '⚠️ 商号代号不存在或已暂歇！';
        errBox.classList.remove('hidden');
        return;
      }
      const { data: subList } = await supabase
        .from('tenant_sub_user')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('account_name', subAcc)
        .eq('is_active', true)
        .limit(1);

      let subValid = false;
      if (subList && subList.length > 0) {
        subValid = await AuthSecurity.verifyPassword(subPwd, subList[0].password_hash, tenantId);
      }

      if (!subValid) {
        const failRec = AuthSecurity.recordLoginFailure(`HQ_${tenantId}`);
        btn.disabled = false;
        btn.innerText = '核验密钥 · 登录调度台';
        errBox.innerText = `⚠️ 属员子账号或密码不正确（还可尝试 ${Math.max(0, 5 - failRec.count)} 次）！`;
        errBox.classList.remove('hidden');
        return;
      }

      AuthSecurity.clearLoginFailure(`HQ_${tenantId}`);
      hqState.currentAgent = tenantId;
      hqState.currentRoleCode = subList[0].role_code;
      hqState.currentAccountCode = subList[0].account_name;
      hqState.currentOperatorName = subList[0].real_name;
      sessionStorage.setItem('hq_tenant_session_' + tenantId, tenantList[0].access_key);
      sessionStorage.setItem('hq_active_authed_tenant', tenantId);
      sessionStorage.setItem('hq_sub_role_' + tenantId, hqState.currentRoleCode);
      sessionStorage.setItem('hq_sub_account_' + tenantId, hqState.currentAccountCode);
      sessionStorage.setItem('hq_sub_name_' + tenantId, hqState.currentOperatorName);

      document.getElementById('hq-auth-gate').classList.add('hidden');
      applyRoleViewExperience(hqState.currentRoleCode, hqState.currentOperatorName);
      window.loadHQData();
      return;
    }

    const { data, error } = await supabase.from('platform_tenant').select('*').eq('tenant_id', tenantId).limit(1);
    let ownerMatched = false;
    if (!error && data && data.length > 0) {
      ownerMatched = await AuthSecurity.verifyPassword(rawKey, data[0].access_key, tenantId);
    }

    if (!ownerMatched) {
      const failRec = AuthSecurity.recordLoginFailure(`HQ_${tenantId}`);
      btn.disabled = false;
      btn.innerText = '核验密钥 · 登录调度台';
      errBox.innerText = `⚠️ 商号代号不存在或安家访问密钥不符（还可尝试 ${Math.max(0, 5 - failRec.count)} 次）！`;
      errBox.classList.remove('hidden');
      return;
    }
    if (!data[0].is_active) {
      btn.disabled = false;
      btn.innerText = '核验密钥 · 登录调度台';
      errBox.innerText = '🚫 该商号已被平台设案暂歇！';
      errBox.classList.remove('hidden');
      return;
    }

    AuthSecurity.clearLoginFailure(`HQ_${tenantId}`);
    sessionStorage.setItem('hq_tenant_session_' + tenantId, data[0].access_key);
    sessionStorage.setItem('hq_active_authed_tenant', tenantId);
    sessionStorage.removeItem('hq_sub_role_' + tenantId);
    sessionStorage.removeItem('hq_sub_account_' + tenantId);
    sessionStorage.removeItem('hq_sub_name_' + tenantId);
    hqState.currentAgent = tenantId;
    hqState.currentRoleCode = 'owner';
    hqState.currentAccountCode = '';
    hqState.currentOperatorName = '大当家主账号';
    document.getElementById('hq-auth-gate').classList.add('hidden');
    applyRoleViewExperience('owner', '大当家主账号');
    window.loadHQData();
  };

  window.logoutHQ = function () {
    if (hqState.hqQrPollTimer) clearInterval(hqState.hqQrPollTimer);
    sessionStorage.removeItem('hq_tenant_session_' + hqState.currentAgent);
    sessionStorage.removeItem('hq_active_authed_tenant');
    document.getElementById('hq-auth-gate')?.classList.remove('hidden');
  };

  window.submitSelfRecoverPassword = async function () {
    const phone = document.getElementById('rec-phone').value.trim();
    const creditCode = document.getElementById('rec-credit-code').value.trim().toUpperCase();
    const totpCode = document.getElementById('rec-totp-code').value.trim();
    const newPwd = document.getElementById('rec-new-pwd').value.trim();

    if (phone.length !== 11 || creditCode.length !== 18) return alert('请完整填写 11 位登记手机号与 18 位信用代码/身份证全号！');
    if (totpCode.length !== 6) return alert('请输入手机验证器 6 位动态码（若手机一并丢失，请使用「紧急挂失冻结」并联系平台总控核发重置信码）。');

    const { data: rows } = await supabase.from('platform_tenant').select('*').eq('credit_code', creditCode).limit(1);
    if (!rows || rows.length === 0) return alert('⚠️ 未找到该 18 位信用代码/身份证号对应的入驻档案。');

    const tenant = rows[0];
    if (tenant.phone !== phone && tenant.backup_phone !== phone) return alert('⚠️ 输入的手机号码与登记的主联络手机或备用紧急手机号不符！');

    const pwdCheck = AuthSecurity.validatePasswordStrength(newPwd, tenant.tenant_id, phone);
    if (!pwdCheck.ok) return alert('⚠️ 新密码强度提示：' + pwdCheck.msg);

    const isTotpOk = await TOTP.verifyTOTP(tenant.totp_secret || 'JBSWY3DPEHPK3PXP', totpCode, 2);
    if (!isTotpOk) return alert('⚠️ 手机验证器 6 位动态码验证未通过！');

    const hashedNew = await AuthSecurity.hashPassword(newPwd, tenant.tenant_id);
    await HQService.updateTenantWithVerify(tenant.tenant_id, { access_key: hashedNew, reset_claim_token: null });

    alert(`🎉 核身找回成功！您的商号代号为【${tenant.tenant_id}】，新密码已加密生效！`);
    window.closeModal('modal-self-recover-pwd');
    document.getElementById('hq-login-tenant').value = tenant.tenant_id;
  };

  window.submitEmergencyFreezeAccount = async function () {
    const creditCode = document.getElementById('frz-credit-code').value.trim().toUpperCase();
    const personName = document.getElementById('frz-person-name').value.trim();
    if (creditCode.length !== 18 || !personName) return alert('请完整填写 18 位证件全号与登记时的负责人真实姓名！');

    const { data: rows } = await supabase.from('platform_tenant').select('*').eq('credit_code', creditCode).limit(1);
    if (!rows || rows.length === 0) return alert('未找到该证件号对应的在册商号档案。');

    const tenant = rows[0];
    const recordedPerson = (tenant.contact_person || tenant.contact_name || '').trim();
    if (recordedPerson && !recordedPerson.includes(personName) && !personName.includes(recordedPerson)) {
      return alert('⚠️ 负责人姓名与立户登记档案不符，无法执行挂失冻结！');
    }

    await supabase.from('platform_tenant').update({ membership_status: 'restricted' }).eq('tenant_id', tenant.tenant_id);
    alert(`🛡️ 已对商号【${tenant.company_name} (${tenant.tenant_id})】启动【护盘冻结保护】！请凭实体公章申明书联系平台总控核发重置信码。`);
    window.closeModal('modal-emergency-freeze');
  };

  window.openTotpSetupModal = async function () {
    const { data: tenant, error } = await HQService.fetchTenant(hqState.currentAgent);
    if (error) return alert('读取商号信息失败：' + error.message);

    let secret = (tenant?.totp_secret || '').trim();
    if (!secret) {
      secret = TOTP.generateRandomSecret();
      try {
        await HQService.updateTenantWithVerify(hqState.currentAgent, { totp_secret: secret, totp_enabled: true });
      } catch (upErr) {
        return alert('⚠️ 云端数据库写入秘钥被拦截：' + upErr.message);
      }
    }

    document.getElementById('totp-secret-display').innerText = secret;
    document.getElementById('totp-test-code').value = '';
    document.getElementById('totp-setup-qr').src = TOTP.buildQrImageUrl('SupplyChainHQ', hqState.currentAgent, secret);
    window.openModal('modal-totp-setup');
  };

  window.copyTotpSecret = function () {
    navigator.clipboard.writeText(document.getElementById('totp-secret-display').innerText).then(() => alert('TOTP 金钥已复制！'));
  };

  window.verifyAndSaveTotp = async function () {
    const code = document.getElementById('totp-test-code').value.trim();
    const secret = document.getElementById('totp-secret-display').innerText.trim();
    if (!code || code.length !== 6) return alert('请输入验证器中显示的 6 位动态口令！');

    const isValid = await TOTP.verifyTOTP(secret, code, 2);
    if (!isValid) {
      return alert('⚠️ 动态口令验证未通过！\n1. 请确认手机「自动设置时间」已开启；\n2. 若扫码异常，请点击「复制密钥」，在手机验证器选择「手动输入密钥」添加（时间基准）。');
    }

    try {
      await HQService.updateTenantWithVerify(hqState.currentAgent, { totp_secret: secret, totp_enabled: true });
      if (hqState.currentTenantData) {
        hqState.currentTenantData.totp_secret = secret;
        hqState.currentTenantData.totp_enabled = true;
      }
      updateTotpStatusBadge(true);
      alert('🎉 身份验证器已写入云端并绑定成功！');
      window.closeModal('modal-totp-setup');
    } catch (err) {
      alert('⚠️ 数据库写入被拦截：' + err.message);
    }
  };

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
    if (!totpCode || totpCode.length !== 6) return alert('请输入手机验证器 6 位动态码！');

    const pwdCheck = AuthSecurity.validatePasswordStrength(newKey, hqState.currentAgent, '');
    if (!pwdCheck.ok) return alert('⚠️ 新密码强度提示：' + pwdCheck.msg);

    const { data: tenant } = await HQService.fetchTenant(hqState.currentAgent);
    if (!tenant) return;
    const isOldKeyMatch = await AuthSecurity.verifyPassword(oldKey, tenant.access_key, hqState.currentAgent);
    const isTokenMatch = tenant.reset_claim_token && oldKey.toUpperCase() === tenant.reset_claim_token.toUpperCase();
    if (!isOldKeyMatch && !isTokenMatch) return alert('⚠️ 原访问密钥不正确！');

    const isTotpValid = await TOTP.verifyTOTP(tenant.totp_secret || 'JBSWY3DPEHPK3PXP', totpCode, 2);
    if (!isTotpValid) return alert('⚠️ 验证器 6 位动态码错误！');

    const hashedNewKey = await AuthSecurity.hashPassword(newKey, hqState.currentAgent);
    try {
      await HQService.updateTenantWithVerify(hqState.currentAgent, { access_key: hashedNewKey, reset_claim_token: null });
      sessionStorage.setItem('hq_tenant_session_' + hqState.currentAgent, hashedNewKey);
      document.getElementById('hq-default-pwd-banner')?.classList.add('hidden');
      alert('🎉 新密钥已哈希加密写入云端并生效存盘！');
      window.closeModal('modal-change-password');
    } catch (err) {
      alert('⚠️ 修改密码写入云端被拦截：' + err.message);
    }
  };

  window.trigger2FAAction = function (actionDesc, onVerifiedCallback) {
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
    if (!code || code.length !== 6) return alert('⚠️ 请输入 6 位动态码！');
    const { data: tenant } = await HQService.fetchTenant(hqState.currentAgent);
    const isValid = await TOTP.verifyTOTP(tenant?.totp_secret || 'JBSWY3DPEHPK3PXP', code, 2);
    if (!isValid) return alert('⚠️ 动态口令验证失败！');
    window.close2FAModal();
    if (typeof hqState.pending2FACallback === 'function') hqState.pending2FACallback();
  };

  window.onSubRoleTemplateChange = function (roleCode) {
    const presetTitles = {
      sales: '业务员 / 客户经理',
      warehouse: '仓储调度员',
      finance: '账房财务',
      driver: '送货师傅',
      producer: '产区采收 / 车间班组长',
      qc_service: '售后定损 / 质检员',
      auditor: '独立稽核员'
    };
    const presetPerms = {
      sales: ['perm_sales_visit'],
      warehouse: ['perm_stock'],
      finance: ['perm_finance_settle'],
      driver: ['perm_deliver'],
      producer: ['perm_stock'],
      qc_service: ['perm_deliver'],
      auditor: ['perm_audit_readonly']
    };
    const titleEl = document.getElementById('sub-custom-title-input');
    if (titleEl) titleEl.value = presetTitles[roleCode] || roleCode;
    const perms = presetPerms[roleCode] || [];
    document.querySelectorAll('.sub-perm-cb').forEach((cb) => {
      cb.checked = perms.includes(cb.value);
    });
  };

  window.openAddSubUserModal = () => {
    document.getElementById('sub-account-input').value = '';
    document.getElementById('sub-name-input').value = '';
    document.getElementById('sub-phone-input').value = '';
    window.onSubRoleTemplateChange('sales');
    window.openModal('modal-add-subuser');
  };

  window.saveSubUser = async function () {
    const account_name = document.getElementById('sub-account-input').value.trim();
    const real_name = document.getElementById('sub-name-input').value.trim();
    const role_code = document.getElementById('sub-role-select').value;
    const customTitle = document.getElementById('sub-custom-title-input').value.trim() || role_code;
    const pwd = document.getElementById('sub-pwd-input').value.trim();
    const phone = document.getElementById('sub-phone-input').value.trim();

    if (!account_name || !real_name || !pwd) return alert('请填全账号、姓名与密码！');

    const checkedPerms = Array.from(document.querySelectorAll('.sub-perm-cb:checked')).map((el) => el.value);
    if (checkedPerms.length === 0) return alert('请至少勾选一项岗位权限！');

    if (checkedPerms.includes('perm_stock') && checkedPerms.includes('perm_finance_settle')) {
      return alert('🚨 四权分立内控拦截：\n「仓库实物出入库制单」与「财务核账回款销账」属于互斥不相容岗位，严禁同一人兼任！');
    }
    if (checkedPerms.includes('perm_audit_readonly') && checkedPerms.length > 1) {
      return alert('🚨 四权分立内控拦截：\n「独立稽核」属于第三方监督岗位，不可同时兼任业务操作权限！');
    }

    const storedPhoneAndTitle = `${phone}|${customTitle}`;
    const hashedSubPwd = await AuthSecurity.hashPassword(pwd, hqState.currentAgent);
    const { error } = await supabase
      .from('tenant_sub_user')
      .insert([{ tenant_id: hqState.currentAgent, account_name, real_name, role_code, password_hash: hashedSubPwd, phone: storedPhoneAndTitle, is_active: true }]);
    if (error) alert('授任失败: ' + error.message);
    else {
      alert(`🎉 已授任【${real_name}】（${customTitle}），电脑端与掌中宝均可使用 ${account_name}:${pwd} 登录（密码已哈希加密保护）！`);
      window.closeModal('modal-add-subuser');
      window.loadHQData();
    }
  };

  window.toggleSubUserActive = async function (id, curState) {
    await supabase.from('tenant_sub_user').update({ is_active: !curState }).eq('id', id);
    window.loadHQData();
  };
}
