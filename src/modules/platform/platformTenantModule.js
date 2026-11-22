import { supabase } from '../../lib/supabase.js';
import { AuthSecurity } from '../../utils/authSecurity.js';
import {
  platformState,
  formatBusinessTypeLabel,
  recordAuditLog
} from './platformState.js';

export function renderApplications() {
  const container = document.getElementById('applications-list');
  if (!container) return;

  if (platformState.allApplications.length === 0) {
    container.innerHTML = '<div class="py-12 text-center text-stone-400 text-xs">当前暂无入驻申请档案。</div>';
    return;
  }

  container.innerHTML = platformState.allApplications
    .map((a) => {
      const isPending = a.application_status === 'pending_review';
      const isAiApproved = a.application_status === 'approved_by_ai';
      const isApproved = a.application_status === 'approved' || isAiApproved || a.application_status === 'approved_manually';
      const isIndividual = a.business_type === 'individual' || String(a.tenant_id || '').startsWith('GR-');
      const isClaimAppeal = String(a.review_note || '').includes('疑似抢注申诉');
      const cipherMatch = String(a.review_note || '').match(/\[查验暗号[:：]([A-Z0-9-]+)\]/i);
      const backupMatch = String(a.review_note || '').match(/\[备用手机[:：](\d{11})\]/);
      const cipherStr = cipherMatch ? cipherMatch[1].toUpperCase() : '';
      const backupStr = backupMatch ? backupMatch[1] : '';

      return `
        <div class="p-4 bg-stone-50 border ${isClaimAppeal ? 'border-rose-400 shadow-md' : isPending ? 'border-amber-300 shadow-sm' : 'border-stone-200'} rounded-2xl space-y-2.5">
          <div class="flex flex-wrap justify-between items-start gap-2">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <b class="text-sm text-stone-900">${a.company_name}</b>
                <span class="text-[10px] bg-stone-200 text-stone-700 font-mono px-1.5 py-0.2 rounded font-bold">${a.tenant_id}</span>
                ${a.business_type ? `<span class="text-[10px] bg-emerald-50 text-emerald-900 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">${formatBusinessTypeLabel(a.business_type)}</span>` : ''}
                ${isIndividual ? '<span class="text-[10px] bg-amber-100 text-amber-950 px-1.5 py-0.2 rounded font-bold">实名农户/手艺人</span>' : ''}
                ${a.credit_code ? `<span class="text-[10px] bg-amber-100/80 text-amber-900 font-mono px-1.5 py-0.2 rounded font-bold">${a.credit_code}</span>` : ''}
                ${isClaimAppeal ? '<span class="text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold animate-bounce">⚠️ 疑似抢注申诉·请回拨核实正主</span>' : ''}
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  isPending
                    ? 'bg-amber-100 text-amber-900 animate-pulse'
                    : isAiApproved
                    ? 'bg-sky-100 text-sky-900 border border-sky-300'
                    : isApproved
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }">
                  ${isPending ? '⏳ 待人工复核' : isAiApproved ? '🤖 AI秒批（待巡检）' : isApproved ? '✅ 终审已发证' : '🚫 已退回商榷'}
                </span>
              </div>
              <div class="text-[11px] text-stone-500 font-mono mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>负责人: <b>${a.contact_person || '-'}</b></span>
                <span>· 主手机: <a href="tel:${a.contact_phone}" class="underline font-bold text-stone-800">${a.contact_phone || '-'}</a></span>
                ${backupStr ? `<span>· 备用手机: <a href="tel:${backupStr}" class="underline font-bold text-amber-800">${backupStr}</a></span>` : ''}
                ${cipherStr ? `<span class="bg-emerald-100 text-emerald-900 px-1.5 py-0.2 rounded font-bold">🔐 查验暗号: ${cipherStr}</span>` : ''}
                <span>· 初审分: <b class="text-emerald-700">${a.ai_audit_score || 95}分</b></span>
              </div>
              ${a.review_note ? `<div class="text-[10px] text-stone-500 mt-1 bg-white px-2.5 py-1 rounded-lg border border-stone-200/70">${a.review_note}</div>` : ''}
            </div>
            <div class="text-right">
              <span class="text-[10px] text-stone-400 block font-mono">唯一商号标识</span>
              <b class="font-mono text-sm text-amber-800 font-bold">${a.tenant_id}</b>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200/60 text-[11px]">
            <div class="flex items-center gap-3">
              <span class="text-stone-400">资质原件:</span>
              ${
                a.license_image_url
                  ? `<img src="${a.license_image_url}" class="h-10 w-16 object-cover rounded-lg border border-stone-300 cursor-pointer shadow-sm hover:scale-105 transition" onclick="window.previewFullImage('${a.license_image_url}')" title="点击放大核对">
                     <span class="text-[10px] text-stone-500">(点击放大核验)</span>`
                  : '<span class="text-stone-400">无附图</span>'
              }
            </div>

            ${
              isIndividual
                ? '<span class="text-[10px] text-emerald-800 font-bold">实名个人主体 · 适用限额保护与村社联保机制</span>'
                : `<button type="button" onclick="window.freeGovAuditCheck('${a.company_name}', '${a.credit_code || ''}')" class="bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-xs">
                    <span>🔍</span> 免费查验工商存续状态 (自动复制代码)
                  </button>`
            }
          </div>

          ${
            isPending
              ? `
            <div class="flex flex-wrap gap-2 justify-end pt-2 border-t border-stone-200/60">
              <button onclick="window.rejectApplicationNameMismatch(${a.id})" class="text-xs bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold px-3 py-1.5 rounded-xl transition">
                🏷️ 名实不符退回
              </button>
              <button onclick="window.rejectApplication(${a.id})" class="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3 py-1.5 rounded-xl transition">
                退回补件修正
              </button>
              <button onclick="window.approveApplication(${a.id}, '${a.tenant_id}', '${a.company_name}')" class="text-xs bg-stone-900 hover:bg-stone-800 text-white font-bold px-4 py-1.5 rounded-xl shadow active:scale-95 transition">
                ✅ 终审合格 · 正式开席激活
              </button>
            </div>
          `
              : ''
          }
        </div>
      `;
    })
    .join('');
}

export function renderTenantsTable() {
  const tbody = document.getElementById('tenants-table-body');
  if (!tbody) return;

  tbody.innerHTML = platformState.allTenants
    .map((t) => {
      const status = t.membership_status || (t.is_active ? 'active' : 'paused');
      const matchedApp = platformState.allApplications.find((a) => a.tenant_id === t.tenant_id);
      const isAiTrialInspect = status === 'trial' && matchedApp?.application_status === 'approved_by_ai';

      let statusTag = '';
      if (!t.is_active || status === 'paused') statusTag = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">🛑 商道暂歇</span>';
      else if (isAiTrialInspect) statusTag = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-900 border border-sky-300">🤖 AI秒批（待巡检）</span>';
      else if (status === 'trial') statusTag = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800">🍃 尝鲜体验</span>';
      else if (status === 'grace') statusTag = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">🍃 春风宽待</span>';
      else if (status === 'restricted') statusTag = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">🛡️ 护盘存续</span>';
      else statusTag = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">🟢 和合在册</span>';

      const isTimelockPending = t.timelock_status === 'pending';
      const timelockBadge = isTimelockPending
        ? `<div class="mt-1 flex items-center gap-1 font-sans">
             <span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-950 border border-amber-300">⏳ 72h找回观察期</span>
             <button type="button" onclick="window.expediteTimelockRelease('${t.tenant_id}', '${t.company_name}')" class="text-[10px] bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold px-1.5 py-0.2 rounded shadow-2xs">
               ⚡ 核验加急放行
             </button>
           </div>`
        : '';

      return `
        <tr class="hover:bg-stone-50 transition">
          <td class="p-3 font-bold text-amber-800">${t.tenant_id}</td>
          <td class="p-3 font-sans">
            <div class="font-bold text-stone-900">${t.company_name}</div>
            <div class="text-[10px] font-mono text-stone-400">${t.credit_code || '特邀/实名立户'} · 运维会费: ¥${t.membership_fee || 0}/年${t.backup_phone ? ` · 备号:${t.backup_phone}` : ''}</div>
            ${timelockBadge}
          </td>
          <td class="p-3 font-sans">${formatBusinessTypeLabel(t.business_type)}</td>
          <td class="p-3 font-sans">${t.contact_person || t.contact_name || '-'}</td>
          <td class="p-3 font-mono text-stone-400">
            <span class="tracking-widest font-bold">••••••••</span>
            <button onclick="window.issueResetTokenPrompt(${t.id}, '${t.tenant_id}', '${t.company_name}')" class="text-emerald-800 text-[11px] font-bold hover:underline ml-1.5 font-sans">
              签发新约信码
            </button>
          </td>
          <td class="p-3">${statusTag}</td>
          <td class="p-3 text-right space-x-1">
            <button onclick="window.freeGovAuditCheck('${t.company_name}', '${t.credit_code || ''}')" class="text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 border border-blue-200 px-2 py-1 rounded-xl transition font-sans" title="转正前核查是否在营">
              🔍 查底库
            </button>
            <button onclick="window.openTenantStatusModal(${t.id}, '${t.tenant_id}', '${t.company_name}', '${status}')" class="text-[11px] font-bold text-stone-700 hover:text-stone-900 bg-white border border-stone-200 px-2.5 py-1 rounded-xl shadow-xs hover:border-stone-400 transition font-sans">
              ⚖️ 商契调控
            </button>
            <button onclick="window.confirmPurgeTenantAction('${t.tenant_id}', '${t.company_name}')" class="text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 border border-rose-200 px-2 py-1 rounded-xl shadow-xs hover:bg-rose-100 transition font-sans">
              🗑️ 销号
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

export function initPlatformTenantBindings() {
  window.fillManualStrongPwd = function () {
    const pwdInp = document.getElementById('m-access-key');
    if (pwdInp) pwdInp.value = AuthSecurity.generateStrongMasterPassword();
  };

  window.syncManualModalDefaults = function () {
    const ccode = document.getElementById('m-credit-code').value.trim().toUpperCase();
    const bType = document.getElementById('m-business-type')?.value || 'coop';
    const person = document.getElementById('m-contact-person')?.value || '';
    const tidInp = document.getElementById('m-tenant-id');
    const pwdInp = document.getElementById('m-access-key');

    if (ccode.length === 18 && tidInp) {
      const locked = AuthSecurity.generateLockedTenantId(bType, ccode, person);
      if (locked) tidInp.value = locked;
    }
    if (pwdInp && !pwdInp.value.trim()) {
      pwdInp.value = AuthSecurity.generateStrongMasterPassword();
    }
  };

  window.expediteTimelockRelease = function (tenantId, companyName) {
    window.triggerPlatform2FA(
      `确认已核验【${companyName} (${tenantId})】法定负责人手持证件原件无误，加急提前放行其「72小时无人值守时间锁」以允许立即重设主密码？`,
      async () => {
        const { error } = await supabase
          .from('platform_tenant')
          .update({ timelock_status: 'ready', timelock_expires_at: new Date().toISOString() })
          .eq('tenant_id', tenantId);

        if (error) return alert('❌ 加急放行失败：' + error.message);
        await recordAuditLog('加急放行72小时安全时间锁', 'CRITICAL_2FA', { tenant_id: tenantId, company_name: companyName });
        alert(`✅ 已为【${companyName}】加急放行时间锁！请通知掌柜前往调度台登录页重设新主密码。`);
        await window.loadPlatformData();
      }
    );
  };

  window.freeGovAuditCheck = function (companyName, creditCode) {
    const queryKey = creditCode && creditCode.length >= 15 ? creditCode : companyName;
    navigator.clipboard
      .writeText(queryKey)
      .then(() => {
        alert(`📋 已自动复制：【${queryKey}】\n\n即将打开免费工商查询页（爱企查），请直接贴上核对该合作社/企业是否为「存续/在营」状态！`);
        window.open(`https://aiqicha.baidu.com/s?q=${encodeURIComponent(queryKey)}`, '_blank');
      })
      .catch(() => {
        window.open(`https://aiqicha.baidu.com/s?q=${encodeURIComponent(queryKey)}`, '_blank');
      });
  };

  window.rejectApplicationNameMismatch = async function (appId) {
    const app = platformState.allApplications.find((a) => a.id === appId);
    const metaTags = (String(app?.review_note || '').match(/\[(查验暗号|备用手机)[:：][^\]]+\]/g) || []).join(' ');
    const defaultReason =
      '【名实不符退回】平台恪守“物勒工名、名实相符”商道，严禁抢注公共产区名或未在营业执照上体现的品牌字号。请严格按照营业执照《名称》一栏（或本人真实姓名+镇村/行当）修改后重新提交。';
    const reason = prompt('确认以【名实不符】退回该申请（可微调批示说明）：', defaultReason);
    if (!reason) return;

    await supabase
      .from('tenant_application')
      .update({
        application_status: 'rejected',
        review_note: `${reason.trim()} ${metaTags}`.trim(),
        reviewed_at: new Date().toISOString()
      })
      .eq('id', appId);

    await recordAuditLog('名实不符退回入驻申请', 'WARN', { application_id: appId, reason: reason.trim() });
    alert('已按【名实不符】退回修润！申请方查进度时将看到该商道规范批示。');
    window.loadPlatformData();
  };

  window.issueResetTokenPrompt = function (id, tenantId, companyName) {
    window.triggerPlatform2FA(`您正在为商号【${companyName}】签发专属【自立新约重置信码】。由当家掌柜在调度台自行重置密码，平台不留存也不窥探密码：`, async () => {
      const resetToken = 'CLAIM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      await supabase.from('platform_tenant').update({ access_key: resetToken, reset_claim_token: resetToken }).eq('tenant_id', tenantId);
      await supabase.rpc('rpc_bump_session_epoch', { p_tenant_id: tenantId, p_reason: '平台总控签发重置信码并清退旧终端' }).catch(() => {});

      recordAuditLog('签发自立新约信码', 'CRITICAL_2FA', { tenant_id: tenantId, claim_token: resetToken });
      alert(`📜 已为【${companyName}】签发自立新约信码（同步清退所有旧终端）！\n\n• 单次重置信码：${resetToken}\n• 交付说明：请转交该合作社/企业负责人，在 hq.html 凭此信码即可自立新密码。`);
      window.loadPlatformData();
    });
  };

  window.openTenantStatusModal = function (id, tenantId, companyName, currentStatus) {
    document.getElementById('adjust-tenant-id').value = tenantId || id;
    document.getElementById('adjust-tenant-title').innerText = `${companyName} (${tenantId})`;

    const radios = document.getElementsByName('membership_status_choice');
    radios.forEach((r) => (r.checked = r.value === currentStatus));

    const aiInsight = `人工终审提示：7天尝鲜试用期满转正为【🟢 和合在册】正式会员时，请先点击「🔍 查底库」确认合作社/企业在营，并核收象征性年度公共运维会费。`;
    document.getElementById('adjust-ai-insight').innerText = aiInsight;

    window.openModal('modal-status-adjust');
  };

  window.saveTenantStatusAdjustment = async function () {
    const tenantKey = document.getElementById('adjust-tenant-id').value;
    const statusEl = document.querySelector('input[name="membership_status_choice"]:checked');
    if (!statusEl) return alert('请选择一种商契气象状态！');

    const status = statusEl.value;
    const note = document.getElementById('adjust-note-input').value.trim();

    window.closeModal('modal-status-adjust');

    try {
      const is_active = status !== 'paused';

      let { data, error } = await supabase
        .from('platform_tenant')
        .update({ membership_status: status, is_active: is_active })
        .eq('tenant_id', tenantKey)
        .select();

      if (!error && (!data || data.length === 0) && !isNaN(tenantKey)) {
        const retry = await supabase
          .from('platform_tenant')
          .update({ membership_status: status, is_active: is_active })
          .eq('id', parseInt(tenantKey))
          .select();
        data = retry.data;
        error = retry.error;
      }

      if (error) return alert('❌ 数据库更新失败: ' + error.message);
      if (!data || data.length === 0) return alert(`⚠️ 未找到商号标识为【${tenantKey}】的数据列！`);

      await recordAuditLog('商契气象调控', 'WARN', { tenant_key: tenantKey, target_status: status, note });

      alert(`✅ 商契气象已成功调控为【${status}】！`);
      await window.loadPlatformData();
    } catch (err) {
      alert('❌ 执行出错: ' + err.message);
    }
  };

  window.triggerPurgeFromModal = function () {
    const tenantKey = document.getElementById('adjust-tenant-id').value;
    const title = document.getElementById('adjust-tenant-title').innerText;
    window.closeModal('modal-status-adjust');
    window.confirmPurgeTenantAction(tenantKey, title);
  };

  window.confirmPurgeTenantAction = function (tenantId, companyName) {
    const cleanName = (companyName || '').split('(')[0].trim();

    window.triggerPlatform2FA(`⚠️ 最高警戒：即将彻底销号商号【${cleanName || tenantId}】(${tenantId})，清空入驻审核与主体账本。请出示 2FA 口令确认：`, async () => {
      const confirmCode = prompt(
        `⚠️ 危险确认：商号【${cleanName || tenantId}】即将作废除名！\n\n` +
          `该操作将物理清除 platform_tenant 与 tenant_application 记录。\n` +
          `完成后合作社/工坊可持执照原件前往 join.html 重新扫描核验。\n\n` +
          `若确认销号重置，请在下方输入大写：DELETE`
      );

      if (confirmCode !== 'DELETE') return alert('操作已取消，未做任何变更。');

      try {
        await supabase.from('tenant_application').delete().or(`tenant_id.eq.${tenantId},company_name.eq.${cleanName}`);
        try {
          await supabase.from('goods').delete().eq('tenant_id', tenantId);
        } catch (e) {}
        try {
          await supabase.from('customers').delete().eq('tenant_id', tenantId);
        } catch (e) {}

        const { data: deletedRows, error: delError } = await supabase
          .from('platform_tenant')
          .delete()
          .or(`tenant_id.eq.${tenantId},company_name.eq.${cleanName}`)
          .select();

        if (delError) throw new Error('数据库拒绝删除: ' + delError.message);
        if (!deletedRows || deletedRows.length === 0) throw new Error(`未找到商号【${tenantId}】，或数据库 RLS 策略阻止了 DELETE 权限！`);

        await recordAuditLog('商号作废除名销号', 'CRITICAL_2FA', { tenant_id: tenantId, company_name: cleanName });

        alert(`✅ 商号【${cleanName}】已彻底清除（已销毁 ${deletedRows.length} 笔在册档案）！\n商号代号已完全释放，可返回 join.html 重新拍照验证。`);
        await window.loadPlatformData();
      } catch (err) {
        alert('❌ 销号执行失败: ' + err.message);
      }
    });
  };

  window.approveApplication = async function (appId, tenantId, companyName) {
    const fee = prompt(`为【${companyName}】核定年度公共运维会费（元，用于服务器与带宽运维，象征性收取如 199 或公益试点填 0）：`, '199');
    if (fee === null) return;

    const app = platformState.allApplications.find((a) => a.id === appId);
    const backupMatch = String(app?.review_note || '').match(/\[备用手机[:：](\d{11})\]/);
    const extractedBackupPhone = backupMatch ? backupMatch[1] : null;
    const existingKey = (app?.access_key || '').trim();
    let storedAccessKey = existingKey;
    let plainGeneratedPwd = '';

    if (!storedAccessKey) {
      const strongDefault = AuthSecurity.generateStrongMasterPassword();
      const inputPwd = prompt('请为该商号设定 12 位以上初始安家主密码（含大小写字母+数字+特殊符号）：', strongDefault);
      if (!inputPwd) return;
      const check = AuthSecurity.validatePasswordStrength(inputPwd, tenantId, app?.contact_phone || '');
      if (!check.ok) return alert('⚠️ 密码强度不符：' + check.msg);
      plainGeneratedPwd = inputPwd.trim();
      storedAccessKey = await AuthSecurity.hashPassword(plainGeneratedPwd, tenantId);
    } else if (!storedAccessKey.startsWith('SHA256:')) {
      storedAccessKey = await AuthSecurity.hashPassword(storedAccessKey, tenantId);
    }

    await supabase
      .from('tenant_application')
      .update({
        application_status: 'approved',
        payment_status: 'paid',
        membership_fee: parseFloat(fee) || 0,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', appId);

    await supabase.from('platform_tenant').upsert([
      {
        tenant_id: tenantId,
        company_name: companyName,
        credit_code: app ? app.credit_code : '',
        business_type: app ? app.business_type : 'coop',
        service_mode: app ? app.service_mode : '实体与电商双轨',
        contact_person: app ? app.contact_person : '掌柜',
        contact_name: app ? app.contact_person : '掌柜',
        phone: app ? app.contact_phone : '',
        backup_phone: extractedBackupPhone,
        access_key: storedAccessKey,
        membership_fee: parseFloat(fee) || 0,
        membership_status: 'active',
        is_active: true
      }
    ]);

    await supabase.rpc('rpc_sync_tenant_vault', {
      p_tenant_id: tenantId,
      p_access_key: storedAccessKey,
      p_backup_phone: extractedBackupPhone
    }).catch(() => {});

    recordAuditLog('审批激活新会员主体', 'CRITICAL_2FA', { tenant_id: tenantId, company_name: companyName, ops_fee: parseFloat(fee) || 0 });

    alert(`🎉 审核通过并激活立户！\n\n• 主体全称: ${companyName}\n• 商号代号（唯一标识）: ${tenantId}\n• 年度公共运维会费: ¥${parseFloat(fee) || 0}\n• 安家密钥：${plainGeneratedPwd || '沿用入驻方自设强加密主密码（云端零明文）'}`);
    window.loadPlatformData();
  };

  window.rejectApplication = async function (appId) {
    const app = platformState.allApplications.find((a) => a.id === appId);
    const metaTags = (String(app?.review_note || '').match(/\[(查验暗号|备用手机)[:：][^\]]+\]/g) || []).join(' ');
    const reason = prompt('输入商榷退回说明（负责人将在查询页面看到此意见并重新上传补件）：', '执照公章略有反光模糊，请在光线均匀处重新拍摄上传。');
    if (!reason) return;

    await supabase
      .from('tenant_application')
      .update({
        application_status: 'rejected',
        review_note: `${reason.trim()} ${metaTags}`.trim(),
        reviewed_at: new Date().toISOString()
      })
      .eq('id', appId);

    alert('已退回修润建议！负责人凭三重核身查询即可看到并补件重提。');
    window.loadPlatformData();
  };

  window.openManualTenantModal = function () {
    document.getElementById('m-company-name').value = '';
    document.getElementById('m-credit-code').value = '';
    document.getElementById('m-tenant-id').value = '';
    document.getElementById('m-contact-person').value = '';
    const phoneEl = document.getElementById('m-contact-phone');
    if (phoneEl) phoneEl.value = '';
    document.getElementById('m-access-key').value = AuthSecurity.generateStrongMasterPassword();
    window.openModal('manual-tenant-modal');
  };

  window.submitManualTenant = function () {
    const company_name = document.getElementById('m-company-name').value.trim();
    const credit_code = document.getElementById('m-credit-code').value.trim().toUpperCase();
    const tenant_id = document.getElementById('m-tenant-id').value.trim().toUpperCase();
    const business_type = document.getElementById('m-business-type').value;
    const service_mode = document.getElementById('m-service-mode').value;
    const contact_person = document.getElementById('m-contact-person').value.trim();
    const contact_phone = document.getElementById('m-contact-phone')?.value.trim() || '';
    const plainPwd = document.getElementById('m-access-key').value.trim();

    if (!company_name || !tenant_id) return alert('请完整填写主体全称与商号代号！');

    const pwdCheck = AuthSecurity.validatePasswordStrength(plainPwd, tenant_id, contact_phone);
    if (!pwdCheck.ok) {
      return alert(`⚠️ 初始安家主密码强度不足：\n${pwdCheck.msg}\n\n请点击「🎲 重新生成14位强密码」或输入 12 位以上（含大小写字母+数字+特殊符号）。`);
    }

    window.triggerPlatform2FA(`您正在免审核直接为【${company_name}】特邀开立独立账本商号【${tenant_id}】（密码经 SHA-256 单向加密零明文落库），请核验总控 2FA 凭证：`, async () => {
      const hashedAccessKey = await AuthSecurity.hashPassword(plainPwd, tenant_id);
      const { error } = await supabase.from('platform_tenant').insert([
        {
          tenant_id,
          company_name,
          credit_code,
          business_type,
          service_mode,
          contact_person,
          contact_name: contact_person,
          phone: contact_phone,
          access_key: hashedAccessKey,
          membership_status: 'active',
          is_active: true
        }
      ]);

      if (error) alert('开户失败: ' + error.message);
      else {
        await supabase.rpc('rpc_sync_tenant_vault', {
          p_tenant_id: tenant_id,
          p_access_key: hashedAccessKey,
          p_backup_phone: null
        }).catch(() => {});

        recordAuditLog('线下特邀直通立户', 'CRITICAL_2FA', { tenant_id, company_name });
        window.closeModal('manual-tenant-modal');
        await window.loadPlatformData();

        AuthSecurity.showVoucherPreviewModal({
          tenantId: tenant_id,
          companyName: company_name,
          legalName: contact_person,
          phone: contact_phone,
          accessKeyHint: `${plainPwd}（请转交掌柜妥善保存，云端已单向哈希加密）`
        });
      }
    });
  };
}
