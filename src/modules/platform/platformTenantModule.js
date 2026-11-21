import { supabase } from '../../lib/supabase.js';
import { AuthSecurity } from '../../utils/authSecurity.js';
import {
  platformState,
  getEntityTypeBadge,
  getTenantStatusInfo
} from './platformState.js';

export function renderTenantList() {
  const container = document.getElementById('tenant-list');
  const tbody = document.getElementById('tenant-table-body');
  const targetEl = container || tbody;
  if (!targetEl) return;

  let list = [...platformState.allTenants];

  if (platformState.currentTenantFilter === 'pending') {
    list = list.filter((t) => !t.is_active && (t.membership_status === 'pending_audit' || !t.membership_status));
  } else if (platformState.currentTenantFilter === 'active') {
    list = list.filter((t) => t.is_active && t.membership_status !== 'paused' && t.membership_status !== 'restricted');
  } else if (platformState.currentTenantFilter === 'paused') {
    list = list.filter((t) => t.membership_status === 'paused' || t.membership_status === 'restricted' || (!t.is_active && t.membership_status !== 'pending_audit'));
  }

  if (platformState.currentBusinessTypeFilter !== 'all') {
    list = list.filter((t) => (t.business_type || 'coop') === platformState.currentBusinessTypeFilter);
  }

  if (platformState.currentTenantSearch) {
    const q = platformState.currentTenantSearch;
    list = list.filter(
      (t) =>
        (t.company_name || '').toLowerCase().includes(q) ||
        (t.tenant_id || '').toLowerCase().includes(q) ||
        (t.contact_person || '').toLowerCase().includes(q) ||
        (t.phone || '').includes(q) ||
        (t.credit_code || '').toLowerCase().includes(q) ||
        (t.sponsor_org || '').toLowerCase().includes(q)
    );
  }

  if (list.length === 0) {
    targetEl.innerHTML = container
      ? '<div class="py-10 text-center text-stone-400 text-xs">当前筛选条件下暂无在册商号档案。</div>'
      : '<tr><td colspan="7" class="p-8 text-center text-stone-400">当前筛选条件下暂无在册商号档案</td></tr>';
    return;
  }

  targetEl.innerHTML = list
    .map((t) => {
      const typeInfo = getEntityTypeBadge(t.business_type, t.tenant_id);
      const statusInfo = getTenantStatusInfo(t);
      const permitBM = t.permit_brick_and_mortar !== false && t.service_mode !== '电子商务';
      const permitEC = t.permit_ecommerce !== false && t.service_mode !== '实体店';
      const sponsorOrg = (t.sponsor_org || '').trim();
      const certUrl = t.license_url || t.id_card_url || '';
      const prodCount = platformState.allProductsForAudit.filter((p) => p.tenant_id === t.tenant_id).length;

      return `
        <div class="p-4 bg-white border ${statusInfo.isPending ? 'border-amber-400 bg-amber-50/30' : 'border-stone-200'} rounded-3xl space-y-2.5 shadow-2xs">
          <div class="flex flex-wrap justify-between items-start gap-2">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="font-mono text-xs font-bold bg-[#1b4332] text-amber-300 px-2 py-0.5 rounded-lg">${t.tenant_id}</span>
                <b class="text-sm text-stone-900">${t.company_name}</b>
                <span class="border px-2 py-0.2 rounded-full text-[10px] font-bold ${typeInfo.cls}">${typeInfo.label}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${statusInfo.cls}">${statusInfo.text}</span>
              </div>
              <div class="text-[11px] text-stone-500 flex flex-wrap gap-3 font-mono">
                <span>执事/负责人: <b class="text-stone-800 font-sans">${t.contact_person || '-'}</b></span>
                <span>手机: <b class="text-stone-800">${t.phone || '-'}</b></span>
                ${t.backup_phone ? `<span>应急备机: <b>${t.backup_phone}</b></span>` : ''}
                <span>一照一码/证件: <b class="text-stone-700">${t.credit_code || '-'}</b></span>
                <span>在架货品: <b class="text-emerald-900">${prodCount} 款</b></span>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-1.5">
              ${
                statusInfo.isPending
                  ? `<button type="button" onclick="window.approveTenant('${t.tenant_id}')" class="bg-[#1b4332] hover:bg-[#143628] text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow">✅ 终审准予立约</button>`
                  : ''
              }
              <button type="button" onclick="window.openEditTenantModal('${t.tenant_id}')" class="bg-stone-100 hover:bg-stone-200 text-stone-800 px-3 py-1.5 rounded-xl text-xs font-bold">⚙️ 治理与调权</button>
              <button type="button" onclick="window.issueTenantResetToken('${t.tenant_id}')" class="bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 px-2.5 py-1.5 rounded-xl text-xs font-bold">🔑 签发重置码</button>
              <button type="button" onclick="window.toggleTenantActive('${t.tenant_id}', ${!t.is_active})" class="px-2.5 py-1.5 rounded-xl text-xs font-bold border ${
        t.is_active ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
      }">
                ${t.is_active ? '⏸️ 暂歇停用' : '▶️ 恢复营业'}
              </button>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 text-[11px]">
            <div class="flex flex-wrap items-center gap-1.5">
              ${permitBM ? '<span class="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-lg font-bold">🏬 实体门店批发通道</span>' : '<span class="bg-stone-100 text-stone-400 px-2 py-0.5 rounded-lg line-through">实体批发关闭</span>'}
              ${permitEC ? '<span class="bg-blue-100 text-blue-900 px-2 py-0.5 rounded-lg font-bold">🌐 天街专柜零售通道</span>' : '<span class="bg-stone-100 text-stone-400 px-2 py-0.5 rounded-lg line-through">天街专柜关闭</span>'}
              ${sponsorOrg ? `<span class="bg-amber-50 text-amber-950 border border-amber-300 px-2 py-0.5 rounded-lg font-bold">🛡️ 村社/联保单位：${sponsorOrg}</span>` : ''}
            </div>
            <div class="flex items-center gap-2">
              ${
                certUrl
                  ? `<button type="button" onclick="window.viewTenantCert('${certUrl}')" class="text-emerald-800 hover:underline font-bold">📄 查验证照影印件</button>`
                  : '<span class="text-stone-400">未附证照影印件</span>'
              }
              <a href="hq.html" target="_blank" class="text-stone-500 hover:text-stone-900 underline">前往商家工作台 ➔</a>
            </div>
          </div>
          ${t.admin_remark ? `<div class="text-[11px] text-rose-800 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200">📌 总控治理备注：${t.admin_remark}</div>` : ''}
        </div>
      `;
    })
    .join('');
}

export function initTenantBindings() {
  window.filterTenantsByStatus = function (status) {
    platformState.currentTenantFilter = status;
    document.querySelectorAll('.tenant-status-btn').forEach((btn) => {
      const active = btn.dataset.status === status;
      btn.className = active
        ? 'tenant-status-btn px-3 py-1.5 rounded-xl bg-[#1b4332] text-white text-xs font-bold transition'
        : 'tenant-status-btn px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 hover:bg-stone-200 text-xs font-bold transition';
    });
    renderTenantList();
  };

  window.filterTenantsByType = function (bType) {
    platformState.currentBusinessTypeFilter = bType;
    renderTenantList();
  };

  window.searchTenants = function (val) {
    platformState.currentTenantSearch = (val || '').trim().toLowerCase();
    renderTenantList();
  };

  window.viewTenantCert = function (url) {
    const w = window.open('');
    w.document.write(`<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${url}" style="max-width:92%;max-height:92%;border-radius:16px;"></body>`);
  };

  window.approveTenant = async function (tenantId) {
    const t = platformState.allTenants.find((x) => x.tenant_id === tenantId);
    if (!t) return;
    if (!confirm(`确认核验【${t.company_name} (${tenantId})】的实名证照无误，准予正式立约激活？`)) return;

    const { error } = await supabase
      .from('platform_tenant')
      .update({ is_active: true, membership_status: 'active' })
      .eq('tenant_id', tenantId);

    if (error) return alert('终审激活失败：' + error.message);
    alert(`🎉 【${t.company_name}】已正式准予立约营业！`);
    window.loadPlatformDashboard();
  };

  window.toggleTenantActive = async function (tenantId, nextActive) {
    const t = platformState.allTenants.find((x) => x.tenant_id === tenantId);
    if (!t) return;
    const actionLabel = nextActive ? '恢复正常营业' : '设为商道暂歇/停用';
    if (!confirm(`确认将【${t.company_name} (${tenantId})】${actionLabel}？`)) return;

    const { error } = await supabase
      .from('platform_tenant')
      .update({
        is_active: nextActive,
        membership_status: nextActive ? 'active' : 'paused'
      })
      .eq('tenant_id', tenantId);

    if (error) return alert('状态更新失败：' + error.message);
    alert(`✅ 已将【${t.company_name}】${actionLabel}。`);
    window.loadPlatformDashboard();
  };

  window.openCreateTenantModal = function () {
    ['create-t-name', 'create-t-credit', 'create-t-person', 'create-t-phone', 'create-t-sponsor', 'create-t-desc'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    window.openModal('modal-create-tenant');
  };

  window.submitCreateTenant = async function () {
    const business_type = document.getElementById('create-t-type')?.value || 'coop';
    const company_name = document.getElementById('create-t-name')?.value.trim();
    const credit_code = document.getElementById('create-t-credit')?.value.trim().toUpperCase();
    const contact_person = document.getElementById('create-t-person')?.value.trim();
    const phone = document.getElementById('create-t-phone')?.value.trim();
    const sponsor_org = document.getElementById('create-t-sponsor')?.value.trim() || '';
    const brand_origin_desc = document.getElementById('create-t-desc')?.value.trim() || '';
    const permitBM = document.getElementById('create-t-bm')?.checked !== false;
    const permitEC = document.getElementById('create-t-ec')?.checked !== false;

    if (!company_name || credit_code.length !== 18 || !contact_person || phone.length < 11) {
      return alert('请完整填写主体全称、18 位统一信用代码/身份证全号、负责人姓名与 11 位手机号！');
    }

    const prefixMap = { coop: 'HZ', factory: 'GC', service: 'FW', dealer: 'SH', individual: 'GR' };
    const prefix = prefixMap[business_type] || 'HZ';
    const tenant_id = `${prefix}-${credit_code.slice(0, 8)}${credit_code.slice(-1)}`;
    const rawInitPwd = credit_code.slice(-6).toUpperCase();
    const hashedInitPwd = await AuthSecurity.hashPassword(rawInitPwd, tenant_id);
    const service_mode = permitBM && permitEC ? '实体与电商双轨' : permitBM ? '实体店' : '电子商务';

    const { error } = await supabase.from('platform_tenant').insert([
      {
        tenant_id,
        company_name,
        business_type,
        credit_code,
        contact_person,
        phone,
        sponsor_org,
        brand_origin_desc,
        access_key: hashedInitPwd,
        is_active: true,
        membership_status: 'active',
        service_mode,
        permit_brick_and_mortar: permitBM,
        permit_ecommerce: permitEC
      }
    ]);

    if (error) return alert('立户建档失败：' + error.message);

    alert(
      `🎉 商号【${company_name}】已直接由总控立户建档！\n\n` +
        `• 唯一商号代号：${tenant_id}\n` +
        `• 初始登录密钥：${rawInitPwd}（证件后6位，已加盐哈希入库）`
    );
    window.closeModal('modal-create-tenant');
    window.loadPlatformDashboard();
  };

  window.openEditTenantModal = function (tenantId) {
    const t = platformState.allTenants.find((x) => x.tenant_id === tenantId);
    if (!t) return;
    platformState.editingTenantId = tenantId;

    const titleEl = document.getElementById('edit-t-title');
    if (titleEl) titleEl.innerText = `⚙️ 商号治理与调权 · ${t.company_name} (${t.tenant_id})`;

    const nameEl = document.getElementById('edit-t-name');
    if (nameEl) nameEl.value = t.company_name || '';

    const statusEl = document.getElementById('edit-t-status');
    if (statusEl) statusEl.value = t.membership_status || (t.is_active ? 'active' : 'paused');

    const bmEl = document.getElementById('edit-t-bm');
    if (bmEl) bmEl.checked = t.permit_brick_and_mortar !== false && t.service_mode !== '电子商务';

    const ecEl = document.getElementById('edit-t-ec');
    if (ecEl) ecEl.checked = t.permit_ecommerce !== false && t.service_mode !== '实体店';

    const sponsorEl = document.getElementById('edit-t-sponsor');
    if (sponsorEl) sponsorEl.value = t.sponsor_org || '';

    const remarkEl = document.getElementById('edit-t-remark');
    if (remarkEl) remarkEl.value = t.admin_remark || '';

    window.openModal('modal-edit-tenant');
  };

  window.saveTenantGovernance = async function () {
    const tenantId = platformState.editingTenantId;
    if (!tenantId) return;

    const company_name = document.getElementById('edit-t-name')?.value.trim();
    const status = document.getElementById('edit-t-status')?.value || 'active';
    const permitBM = document.getElementById('edit-t-bm')?.checked !== false;
    const permitEC = document.getElementById('edit-t-ec')?.checked !== false;
    const sponsor_org = document.getElementById('edit-t-sponsor')?.value.trim() || '';
    const admin_remark = document.getElementById('edit-t-remark')?.value.trim() || '';

    const is_active = status === 'active';
    const service_mode = permitBM && permitEC ? '实体与电商双轨' : permitBM ? '实体店' : '电子商务';

    const payload = {
      is_active,
      membership_status: status,
      permit_brick_and_mortar: permitBM,
      permit_ecommerce: permitEC,
      service_mode,
      sponsor_org,
      admin_remark
    };
    if (company_name) payload.company_name = company_name;

    const { error } = await supabase.from('platform_tenant').update(payload).eq('tenant_id', tenantId);
    if (error) return alert('保存治理配置失败：' + error.message);

    alert('✅ 商号治理状态、双渠道权限与联保背书信息已更新生效！');
    window.closeModal('modal-edit-tenant');
    window.loadPlatformDashboard();
  };

  window.issueTenantResetToken = async function (tenantId) {
    const t = platformState.allTenants.find((x) => x.tenant_id === tenantId);
    if (!t) return;
    if (!confirm(`确认为【${t.company_name} (${tenantId})】核发一次性应急重置信码？\n核发后将同步解除旧手机验证器绑定与账户冻结状态。`)) return;

    const claimToken = 'RST-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const { error } = await supabase
      .from('platform_tenant')
      .update({
        reset_claim_token: claimToken,
        totp_enabled: false,
        totp_secret: null,
        membership_status: 'active',
        is_active: true
      })
      .eq('tenant_id', tenantId);

    if (error) return alert('签发重置信码失败：' + error.message);

    prompt(
      `🔑 已为【${t.company_name}】签发一次性重置信码，请复制发给大当家作为「原密码」登录修改新密码：`,
      claimToken
    );
    window.loadPlatformDashboard();
  };

  window.deleteTenantPermanent = async function (tenantId) {
    const t = platformState.allTenants.find((x) => x.tenant_id === tenantId);
    if (!t) return;
    const confirmCode = prompt(`⚠️ 危险操作：确认永久注销删除商号【${t.company_name}】？\n请输入该商号代号（${tenantId}）确认：`);
    if (confirmCode !== tenantId) return alert('商号代号不匹配，已取消注销。');

    const { error } = await supabase.from('platform_tenant').delete().eq('tenant_id', tenantId);
    if (error) return alert('注销失败：' + error.message);
    alert('已永久注销该商号档案。');
    window.loadPlatformDashboard();
  };
}
