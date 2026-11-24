import { supabase } from '../../../lib/supabase.js';
import { AuthSecurity } from '../../../utils/authSecurity.js';
import {
  ATOMIC_CAPABILITIES,
  ROLE_PRESET_TEMPLATES,
  PRICE_VISIBILITY_LEVELS,
  resolveEffectiveStaffAuth
} from '../../../services/modularAuthService.js';
import { hqState } from '../hqState.js';
import { renderHQSecurityBanner, startSessionEpochHeartbeat, stopSessionEpochHeartbeat } from './hqSessionGuard.js';

function generateStaffInitialPassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return (
    letters[buf[0] % 24] +
    letters[24 + (buf[1] % 23)] +
    digits[buf[2] % digits.length] +
    digits[buf[3] % digits.length] +
    digits[buf[4] % digits.length] +
    digits[buf[5] % digits.length] +
    letters[buf[6] % 24] +
    letters[24 + (buf[7] % 23)]
  );
}

export function applyRoleViewExperience(roleCode, operatorName) {
  const displayEl = document.getElementById('hq-operator-role-display');
  const effAuth = resolveEffectiveStaffAuth(roleCode, hqState.currentSubUserRecord);
  const visBadge = effAuth.priceVisibility === 'L0' ? 'L0盲价' : effAuth.priceVisibility === 'L1' ? 'L1基准价' : 'L2全账目';
  const delegateTip = effAuth.activeDelegation ? ' · ⏱️临时代班中' : '';

  const roleLabels = {
    owner: '大当家主账号 (全盘管理权)',
    warehouse: `仓储调度 · ${operatorName} (${visBadge}${delegateTip})`,
    producer: `产区采收/班组长 · ${operatorName} (${visBadge}${delegateTip})`,
    finance: `账房财务 · ${operatorName} (${visBadge}${delegateTip})`,
    sales: `业务员/客户经理 · ${operatorName} (${visBadge}${delegateTip})`,
    driver: `送货师傅 · ${operatorName} (${visBadge}${delegateTip})`,
    qc_service: `售后定损/质检 · ${operatorName} (${visBadge}${delegateTip})`,
    auditor: `独立稽核 · ${operatorName} (只读审计 · ${visBadge})`
  };
  if (displayEl) displayEl.innerText = roleLabels[roleCode] || `${operatorName} (${visBadge}${delegateTip})`;

  if (roleCode !== 'owner') {
    document.getElementById('btn-top-chg-pwd')?.classList.add('hidden');
    document.getElementById('btn-top-totp')?.classList.add('hidden');
    document.getElementById('btn-top-evict')?.classList.add('hidden');
    document.querySelectorAll('.owner-only-guard').forEach((el) => el.classList.add('hidden'));
  }

  // L0 完全盲价视野隔离
  if (effAuth.priceVisibility === 'L0') {
    document.querySelectorAll('.price-col-guard').forEach((el) => el.classList.add('hidden'));
    document.getElementById('btn-top-statement')?.classList.add('hidden');
    document.getElementById('btn-top-counter')?.classList.add('hidden');
    document.getElementById('tab-btn-stores')?.classList.add('hidden');
    document.getElementById('tab-btn-perf')?.classList.add('hidden');
    const moneyCard = document.getElementById('flow-money-card');
    if (moneyCard) moneyCard.classList.add('hidden');
    window.switchTab('products');
  } else if (effAuth.priceVisibility === 'L1') {
    // L1 仅见基准价：屏蔽总应收资金流与返利核算表
    document.getElementById('tab-btn-perf')?.classList.add('hidden');
    const moneyCard = document.getElementById('flow-money-card');
    if (moneyCard) moneyCard.classList.add('hidden');
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
    const tenantRow = data[0];
    const localEpoch = Number(sessionStorage.getItem('hq_session_epoch_' + authedTenant) || tenantRow.session_epoch || 1);
    const remoteEpoch = Number(tenantRow.session_epoch || 1);
    if (remoteEpoch > localEpoch) {
      sessionStorage.removeItem('hq_tenant_session_' + authedTenant);
      sessionStorage.removeItem('hq_active_authed_tenant');
      document.getElementById('hq-auth-gate')?.classList.remove('hidden');
      return false;
    }

    sessionStorage.setItem('hq_session_epoch_' + authedTenant, String(remoteEpoch));
    hqState.currentAgent = authedTenant;
    hqState.currentTenantData = tenantRow;
    hqState.currentRoleCode = sessionStorage.getItem('hq_sub_role_' + authedTenant) || 'owner';
    hqState.currentAccountCode = sessionStorage.getItem('hq_sub_account_' + authedTenant) || '';
    hqState.currentOperatorName = sessionStorage.getItem('hq_sub_name_' + authedTenant) || '大当家主账号';

    // 若为子账号登录，实时同步其最新原子权限与临时代班状态
    if (hqState.currentRoleCode !== 'owner' && hqState.currentAccountCode) {
      const { data: subRows } = await supabase
        .from('tenant_sub_user')
        .select('*')
        .eq('tenant_id', authedTenant)
        .eq('account_name', hqState.currentAccountCode)
        .eq('is_active', true)
        .limit(1);
      if (!subRows || subRows.length === 0) {
        sessionStorage.removeItem('hq_tenant_session_' + authedTenant);
        sessionStorage.removeItem('hq_active_authed_tenant');
        document.getElementById('hq-auth-gate')?.classList.remove('hidden');
        return false;
      }
      hqState.currentSubUserRecord = subRows[0];
    } else {
      hqState.currentSubUserRecord = null;
    }

    document.getElementById('hq-auth-gate')?.classList.add('hidden');
    applyRoleViewExperience(hqState.currentRoleCode, hqState.currentOperatorName);
    renderHQSecurityBanner(tenantRow);
    startSessionEpochHeartbeat(authedTenant);
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
    finance: '账房财务',
    warehouse: '仓储调度',
    sales: '业务员/客户经理',
    driver: '送货师傅',
    producer: '产区采收/班组长',
    qc_service: '售后定损/质检',
    auditor: '独立稽核'
  };
  const visTagMap = {
    L0: '<span class="bg-stone-200 text-stone-800 px-1.5 py-0.2 rounded text-[10px] font-mono">L0盲价</span>',
    L1: '<span class="bg-sky-100 text-sky-900 px-1.5 py-0.2 rounded text-[10px] font-mono">L1基准价</span>',
    L2: '<span class="bg-amber-100 text-amber-950 px-1.5 py-0.2 rounded text-[10px] font-mono">L2全账目</span>'
  };

  tbody.innerHTML = hqState.allSubUsers
    .map((u) => {
      const phoneParts = String(u.phone || '').split('|');
      const purePhone = phoneParts[0] || '-';
      const customTitle = phoneParts[1] || defaultRoles[u.role_code] || u.role_code;
      const effAuth = resolveEffectiveStaffAuth(u.role_code, u);
      const capLabels = effAuth.capabilities
        .map((k) => ATOMIC_CAPABILITIES.find((c) => c.key === k)?.label?.replace(/^[^\s]+\s/, '') || k)
        .slice(0, 3)
        .join('、');
      const moreCount = Math.max(0, effAuth.capabilities.length - 3);
      const delBadge = effAuth.activeDelegation
        ? `<span class="block text-[10px] text-indigo-700 font-bold mt-0.5">⏱️ 临时代班至 ${new Date(effAuth.activeDelegation.until).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>`
        : '';

      return `
        <tr class="hover:bg-stone-50 transition">
          <td class="p-2.5 font-bold font-mono">${u.account_name}</td>
          <td class="p-2.5 font-bold">${u.real_name}</td>
          <td class="p-2.5 font-medium text-emerald-950">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span>${customTitle}</span>
              ${visTagMap[effAuth.priceVisibility] || ''}
            </div>
            <span class="text-[10px] text-stone-500 block mt-0.5">${capLabels}${moreCount > 0 ? ` 等${effAuth.capabilities.length}项` : ''}</span>
            ${delBadge}
          </td>
          <td class="p-2.5 font-mono text-stone-500">${purePhone}</td>
          <td class="p-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${u.is_active ? '在册当值' : '停用'}</span></td>
          <td class="p-2.5 text-right space-x-2">
            ${
              u.is_active && u.role_code !== 'auditor'
                ? `<button type="button" onclick="window.openStaffDelegationModal(${u.id})" class="text-[11px] font-bold text-indigo-700 hover:underline">⏱️ 临时代班</button>`
                : ''
            }
            <button type="button" onclick="window.toggleSubUserActive(${u.id}, ${u.is_active})" class="text-[11px] font-bold text-stone-600 hover:underline">${u.is_active ? '停职清退' : '复职'}</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderModularCapMatrixInModal() {
  const modal = document.getElementById('modal-add-subuser');
  if (!modal) return;
  let container = document.getElementById('modular-cap-matrix-box');
  if (!container) {
    container = document.createElement('div');
    container.id = 'modular-cap-matrix-box';
    container.className = 'space-y-2.5 pt-2 border-t border-stone-100';
    const existingCb = modal.querySelector('.sub-perm-cb');
    const targetParent = existingCb ? existingCb.closest('div')?.parentElement : modal.querySelector('form, .space-y-3, .space-y-4');
    if (targetParent) targetParent.appendChild(container);
  }

  container.innerHTML = `
    <div>
      <label class="text-[11px] font-bold text-stone-700 block mb-1">👁️ 价格与账目数据视野等级：</label>
      <select id="sub-price-visibility" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-stone-800">
        ${Object.values(PRICE_VISIBILITY_LEVELS)
          .map((v) => `<option value="${v.code}">${v.label}</option>`)
          .join('')}
      </select>
    </div>
    <div>
      <label class="text-[11px] font-bold text-stone-700 block mb-1">🧩 12 项原子能力积木（支持一人多岗自由勾选）：</label>
      <div class="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto p-1 bg-stone-50/70 rounded-xl border border-stone-200">
        ${ATOMIC_CAPABILITIES.map(
          (c) => `
          <label class="flex items-center gap-1.5 px-2 py-1.5 bg-white rounded-lg border border-stone-200 cursor-pointer hover:border-emerald-500 text-[11px]">
            <input type="checkbox" class="sub-atomic-cap-cb accent-emerald-700" value="${c.key}">
            <span class="truncate font-medium text-stone-800">${c.label}</span>
          </label>
        `
        ).join('')}
      </div>
    </div>
  `;
}

export function bindLoginAndStaffActions() {
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
          const tenantRow = tenantRows[0];
          sessionStorage.setItem('hq_tenant_session_' + approvedTid, tenantRow.access_key);
          sessionStorage.setItem('hq_active_authed_tenant', approvedTid);
          sessionStorage.setItem('hq_session_epoch_' + approvedTid, String(tenantRow.session_epoch || 1));
          sessionStorage.removeItem('hq_sub_role_' + approvedTid);
          sessionStorage.removeItem('hq_sub_account_' + approvedTid);
          sessionStorage.removeItem('hq_sub_name_' + approvedTid);

          hqState.currentAgent = approvedTid;
          hqState.currentTenantData = tenantRow;
          hqState.currentSubUserRecord = null;
          hqState.currentRoleCode = 'owner';
          hqState.currentAccountCode = '';
          hqState.currentOperatorName = data[0].operator_name || '大当家主账号';

          document.getElementById('hq-auth-gate')?.classList.add('hidden');
          applyRoleViewExperience('owner', hqState.currentOperatorName);
          renderHQSecurityBanner(tenantRow);
          startSessionEpochHeartbeat(approvedTid);
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
      const tenantRow = tenantList[0];
      hqState.currentAgent = tenantId;
      hqState.currentTenantData = tenantRow;
      hqState.currentSubUserRecord = subList[0];
      hqState.currentRoleCode = subList[0].role_code;
      hqState.currentAccountCode = subList[0].account_name;
      hqState.currentOperatorName = subList[0].real_name;
      sessionStorage.setItem('hq_tenant_session_' + tenantId, tenantRow.access_key);
      sessionStorage.setItem('hq_active_authed_tenant', tenantId);
      sessionStorage.setItem('hq_session_epoch_' + tenantId, String(tenantRow.session_epoch || 1));
      sessionStorage.setItem('hq_sub_role_' + tenantId, hqState.currentRoleCode);
      sessionStorage.setItem('hq_sub_account_' + tenantId, hqState.currentAccountCode);
      sessionStorage.setItem('hq_sub_name_' + tenantId, hqState.currentOperatorName);

      document.getElementById('hq-auth-gate').classList.add('hidden');
      applyRoleViewExperience(hqState.currentRoleCode, hqState.currentOperatorName);
      renderHQSecurityBanner(tenantRow);
      startSessionEpochHeartbeat(tenantId);
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

    const tenantRow = data[0];
    AuthSecurity.clearLoginFailure(`HQ_${tenantId}`);
    sessionStorage.setItem('hq_tenant_session_' + tenantId, tenantRow.access_key);
    sessionStorage.setItem('hq_active_authed_tenant', tenantId);
    sessionStorage.setItem('hq_session_epoch_' + tenantId, String(tenantRow.session_epoch || 1));
    sessionStorage.removeItem('hq_sub_role_' + tenantId);
    sessionStorage.removeItem('hq_sub_account_' + tenantId);
    sessionStorage.removeItem('hq_sub_name_' + tenantId);
    hqState.currentAgent = tenantId;
    hqState.currentTenantData = tenantRow;
    hqState.currentSubUserRecord = null;
    hqState.currentRoleCode = 'owner';
    hqState.currentAccountCode = '';
    hqState.currentOperatorName = '大当家主账号';
    document.getElementById('hq-auth-gate').classList.add('hidden');
    applyRoleViewExperience('owner', '大当家主账号');
    renderHQSecurityBanner(tenantRow);
    startSessionEpochHeartbeat(tenantId);
    window.loadHQData();
  };

  window.logoutHQ = function () {
    if (hqState.hqQrPollTimer) clearInterval(hqState.hqQrPollTimer);
    stopSessionEpochHeartbeat();
    sessionStorage.removeItem('hq_tenant_session_' + hqState.currentAgent);
    sessionStorage.removeItem('hq_active_authed_tenant');
    document.getElementById('hq-auth-gate')?.classList.remove('hidden');
  };

  window.onSubRoleTemplateChange = function (roleCode) {
    renderModularCapMatrixInModal();
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

    const tpl = ROLE_PRESET_TEMPLATES[roleCode] || { priceVisibility: 'L0', capabilities: [] };
    const visSel = document.getElementById('sub-price-visibility');
    if (visSel) visSel.value = tpl.priceVisibility;
    document.querySelectorAll('.sub-atomic-cap-cb').forEach((cb) => {
      cb.checked = tpl.capabilities.includes(cb.value);
    });
  };

  window.openAddSubUserModal = () => {
    document.getElementById('sub-account-input').value = '';
    document.getElementById('sub-name-input').value = '';
    document.getElementById('sub-phone-input').value = '';
    const pwdInp = document.getElementById('sub-pwd-input');
    if (pwdInp) {
      pwdInp.type = 'text';
      pwdInp.value = generateStaffInitialPassword();
    }
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
    const price_visibility = document.getElementById('sub-price-visibility')?.value || 'L0';

    if (!account_name || !real_name || !pwd) return alert('请填全账号、姓名与密码！');
    if (pwd.length < 6 || ['123456', '654321', '888888', '000000', '111111'].includes(pwd)) {
      return alert('⚠️ 为防同行或外部人员猜测，属员登录密码长度不能少于 6 位，且严禁使用 123456 / 888888 等纯数字弱密码！');
    }

    const atomicCaps = Array.from(document.querySelectorAll('.sub-atomic-cap-cb:checked')).map((el) => el.value);
    const legacyPerms = Array.from(document.querySelectorAll('.sub-perm-cb:checked')).map((el) => el.value);
    if (atomicCaps.length === 0 && legacyPerms.length === 0) {
      return alert('请至少勾选一项原子能力或岗位权限！');
    }

    // 兼容传统四权分立与新原子能力互斥校验
    const hasStockCap = atomicCaps.includes('stock_in') || atomicCaps.includes('stock_out') || legacyPerms.includes('perm_stock');
    const hasFinanceCap = atomicCaps.includes('finance_settle') || legacyPerms.includes('perm_finance_settle');
    if (hasStockCap && hasFinanceCap) {
      return alert('🚨 四权分立内控拦截：\n「仓库实物出入库制单」与「财务点款销账」属于互斥不相容能力，严禁同一人兼任！');
    }
    if ((role_code === 'auditor' || legacyPerms.includes('perm_audit_readonly')) && atomicCaps.length > 1) {
      return alert('🚨 四权分立内控拦截：\n「独立稽核」属于第三方监督岗位，不可同时兼任业务操作能力！');
    }

    const storedPhoneAndTitle = `${phone}|${customTitle}`;
    const hashedSubPwd = await AuthSecurity.hashPassword(pwd, hqState.currentAgent);
    const { error } = await supabase
      .from('tenant_sub_user')
      .insert([
        {
          tenant_id: hqState.currentAgent,
          account_name,
          real_name,
          role_code,
          password_hash: hashedSubPwd,
          phone: storedPhoneAndTitle,
          capabilities: atomicCaps,
          price_visibility,
          is_active: true
        }
      ]);
    if (error) alert('授任失败: ' + error.message);
    else {
      navigator.clipboard?.writeText(`${account_name}:${pwd}`).catch(() => {});
      alert(
        `🎉 已授任【${real_name}】（${customTitle} · 视野 ${price_visibility} · ${atomicCaps.length}项原子能力）！\n\n` +
        `• 登录口令（已复制到剪贴板）：${account_name}:${pwd}\n` +
        `• 电脑端与手机掌中宝通用，云端已单向哈希加密保护。`
      );
      window.closeModal('modal-add-subuser');
      window.loadHQData();
    }
  };

  // 大当家限时临时代班授权弹窗
  window.openStaffDelegationModal = function (subUserId) {
    if (hqState.currentRoleCode !== 'owner') {
      return alert('仅大当家主账号可授予或收回临时代班权限！');
    }
    const u = hqState.allSubUsers.find((x) => Number(x.id) === Number(subUserId));
    if (!u) return;

    document.getElementById('modal-staff-delegation')?.remove();
    const curDelCaps = Array.isArray(u.delegate_capabilities) ? u.delegate_capabilities : [];

    const modal = document.createElement('div');
    modal.id = 'modal-staff-delegation';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-md w-full p-5 space-y-3.5 shadow-2xl text-xs">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2">
          <div>
            <b class="text-sm text-indigo-950">⏱️ 限时临时代班授权 · ${u.real_name}</b>
            <p class="text-[11px] text-stone-500 mt-0.5">大当家外出时可临时赋权，到期系统自动收回</p>
          </div>
          <button type="button" onclick="document.getElementById('modal-staff-delegation')?.remove()" class="text-stone-400 hover:text-stone-800 text-base font-bold">✕</button>
        </div>

        <div>
          <label class="font-bold text-stone-700 block mb-1">1. 选择代班有效期：</label>
          <select id="del-hours-select" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
            <option value="4">4 小时（半日代班）</option>
            <option value="24" selected>24 小时（一日代班）</option>
            <option value="72">72 小时（三日外出代班）</option>
            <option value="0">立即收回全部代班权限</option>
          </select>
        </div>

        <div>
          <label class="font-bold text-stone-700 block mb-1">2. 勾选临时附加能力：</label>
          <div class="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto p-1 bg-stone-50 rounded-xl border border-stone-200">
            ${ATOMIC_CAPABILITIES.map(
              (c) => `
              <label class="flex items-center gap-1.5 px-2 py-1.5 bg-white rounded-lg border border-stone-200 cursor-pointer text-[11px]">
                <input type="checkbox" class="del-cap-cb accent-indigo-600" value="${c.key}" ${curDelCaps.includes(c.key) ? 'checked' : ''}>
                <span class="truncate">${c.label}</span>
              </label>
            `
            ).join('')}
          </div>
        </div>

        <div class="flex gap-2 pt-1">
          <button type="button" onclick="document.getElementById('modal-staff-delegation')?.remove()" class="flex-1 py-2 rounded-xl bg-stone-100 text-stone-700 font-bold">取消</button>
          <button type="button" onclick="window.confirmStaffDelegation(${u.id})" class="flex-1 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-bold shadow">✅ 确认代班授权</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.confirmStaffDelegation = async function (subUserId) {
    const hours = parseInt(document.getElementById('del-hours-select')?.value || '0', 10);
    const caps = Array.from(document.querySelectorAll('.del-cap-cb:checked')).map((el) => el.value);

    const payload =
      hours <= 0 || caps.length === 0
        ? { delegate_until: null, delegate_capabilities: [] }
        : {
            delegate_until: new Date(Date.now() + hours * 3600000).toISOString(),
            delegate_capabilities: caps
          };

    const { error } = await supabase.from('tenant_sub_user').update(payload).eq('id', subUserId);
    if (error) return alert('设置临时代班失败：' + error.message);

    document.getElementById('modal-staff-delegation')?.remove();
    alert(hours <= 0 || caps.length === 0 ? '🔓 已立即收回该员工的临时代班权限。' : `⏱️ 临时代班授权已生效（有效期 ${hours} 小时），到期自动收回！`);
    window.loadHQData();
  };

  window.toggleSubUserActive = async function (id, curState) {
    const nextState = !curState;
    const subUser = hqState.allSubUsers.find((u) => Number(u.id) === Number(id));
    await supabase.from('tenant_sub_user').update({ is_active: nextState }).eq('id', id);

    if (!nextState) {
      await supabase.rpc('rpc_bump_session_epoch', {
        p_tenant_id: hqState.currentAgent,
        p_reason: `停职属员账号(ID:${id})触发旧终端清退`
      });

      if (subUser && subUser.account_name) {
        const ownedStores = (hqState.allStores || []).filter((s) => s.sales_owner === subUser.account_name);
        if (ownedStores.length > 0) {
          const activeSalesList = hqState.allSubUsers.filter(
            (u) => u.is_active && Number(u.id) !== Number(id) && u.role_code === 'sales'
          );
          const candidateTips = activeSalesList.map((u) => `${u.account_name}(${u.real_name})`).join('、');
          const targetOwner = prompt(
            `📋 离职资产交接提醒：\n` +
            `【${subUser.real_name}】名下尚有 ${ownedStores.length} 家专属跟进门店！\n\n` +
            `• 直接点击「确定」（留空）将全部划转至【🌐 全员公海】；\n` +
            `• 或输入接任业务员账号进行一对一移交${candidateTips ? `\n  可选在职业务员：${candidateTips}` : ''}：`,
            ''
          );

          if (targetOwner !== null) {
            const cleanTarget = targetOwner.trim();
            await supabase
              .from('store')
              .update({ sales_owner: cleanTarget || null })
              .eq('tenant_id', hqState.currentAgent)
              .eq('sales_owner', subUser.account_name);
            alert(
              cleanTarget
                ? `✅ 已将 ${ownedStores.length} 家合作门店平稳移交至业务员【${cleanTarget}】名下！`
                : `✅ 已将 ${ownedStores.length} 家合作门店划转至【🌐 全员公海】，由团队继续跟进！`
            );
          }
        }
      }
    }
    window.loadHQData();
  };
}
