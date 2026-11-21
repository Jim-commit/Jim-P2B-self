import { supabase } from '../../lib/supabase.js';
import { AuthSecurity } from '../../utils/authSecurity.js';
import {
  platformState,
  getBusinessTypeLabel,
  getMembershipBadge
} from './platformState.js';

export function renderTenantTable() {
  const tbody = document.getElementById('tenant-table-body');
  if (!tbody) return;

  let list = platformState.allTenants;
  if (platformState.currentTenantFilter === 'pending') {
    list = list.filter((t) => !t.is_active && (t.membership_status === 'pending_audit' || !t.membership_status));
  } else if (platformState.currentTenantFilter === 'active') {
    list = list.filter((t) => t.is_active && t.membership_status !== 'paused' && t.membership_status !== 'restricted');
  } else if (platformState.currentTenantFilter === 'restricted') {
    list = list.filter((t) => t.membership_status === 'restricted' || t.membership_status === 'paused' || (!t.is_active && t.membership_status !== 'pending_audit'));
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
    tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-stone-400">当前筛选条件下暂无在册商号档案</td></tr>';
    return;
  }

  tbody.innerHTML = list
    .map((t) => {
      const isPending = !t.is_active && (t.membership_status === 'pending_audit' || !t.membership_status);
      const permitBM = t.permit_brick_and_mortar !== false;
      const permitEC = t.permit_ecommerce !== false;
      const sponsorOrg = (t.sponsor_org || '').trim();
      const licenseUrl = t.license_url || t.id_card_url || '';

      return `
        <tr class="hover:bg-stone-50 transition ${isPending ? 'bg-amber-50/40' : ''}">
          <td class="p-3 font-mono font-bold text-emerald-950">
            <div>${t.tenant_id}</div>
            <span class="text-[10px] text-stone-400 font-sans font-normal">${getBusinessTypeLabel(t.business_type, t.tenant_id)}</span>
          </td>
          <td class="p-3">
            <b class="text-stone-900 block">${t.company_name}</b>
            <span class="text-[10px] font-mono text-stone-500">信用代码/证件: ${t.credit_code || '-'}</span>
            ${sponsorOrg ? `<span class="inline-block bg-amber-100 text-amber-950 border border-amber-300 text-[10px] font-bold px-1.5 py-0.2 rounded mt-0.5">🛡️ 联保背书: ${sponsorOrg}</span>` : ''}
          </td>
          <td class="p-3 text-xs">
            <div class="font-bold text-stone-800">${t.contact_person || '-'}</div>
            <div class="font-mono text-[11px] text-stone-500">📱 ${t.phone || '-'}</div>
            ${t.backup_phone ? `<div class="font-mono text-[10px] text-stone-400">备: ${t.backup_phone}</div>` : ''}
          </td>
          <td class="p-3 text-[11px] space-y-1">
            <div>
              ${permitBM ? '<span class="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-bold mr-1">🏬 实体批发</span>' : ''}
              ${permitEC ? '<span class="bg-blue-100 text-blue-900 px-1.5 py-0.2 rounded font-bold">🌐 天街专柜</span>' : ''}
            </div>
            ${
              licenseUrl
                ? `<button type="button" onclick="window.previewCertImage('${licenseUrl}')" class="text-[10px] text-emerald-800 hover:underline font-bold">📄 查验入驻证照影印件</button>`
                : '<span class="text-[10px] text-stone-400">未附影印件</span>'
            }
          </td>
          <td class="p-3">${getMembershipBadge(t)}</td>
          <td class="p-3 text-right space-x-1.5 whitespace-nowrap">
            ${
              isPending
                ? `<button type="button" onclick="window.approveNewTenant('${t.tenant_id}')" class="bg-[#1b4332] hover:bg-[#143628] text-white px-3 py-1 rounded-xl text-[11px] font-bold shadow">✅ 终审准予立约</button>`
                : ''
            }
            <button type="button" onclick="window.openEditTenantModal('${t.tenant_id}')" class="bg-stone-100 hover:bg-stone-200 text-stone-800 px-2.5 py-1 rounded-xl text-[11px] font-bold">⚙️ 治理/调权</button>
            <button type="button" onclick="window.issueResetClaimToken('${t.tenant_id}')" class="bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 px-2.5 py-1 rounded-xl text-[11px] font-bold" title="大当家遗失手机验证器时签发一次性重置信码">🔑 重置口令</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

export function initTenantBindings() {
  window.filterTenants = function (filterType) {
    platformState.currentTenantFilter = filterType;
    document.querySelectorAll('.tenant-filter-btn').forEach((btn) => {
      const active = btn.dataset.filter === filterType;
      btn.className = active
        ? 'tenant-filter-btn px-3 py-1.5 rounded-xl bg-[#1b4332] text-white text-xs font-bold transition'
        : 'tenant-filter-btn px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 hover:bg-stone-200 text-xs font-bold transition';
    });
    renderTenantTable();
  };

  window.onSearchTenants = function (val) {
    platformState.currentTenantSearch = (val || '').trim().toLowerCase();
    renderTenantTable();
  };

  window.previewCertImage = function (url) {
    const w = window.open('');
    w.document.write(`<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${url}" style="max-width:92%;max-height:92%;border-radius:16px;"></body>`);
  };

  window.approveNewTenant = async function (tenantId) {
    const t = platformState.allTenants.find((x) => x.tenant_id === tenantId);
    if (!t) return;
    if (!confirm(`确认【${t.company_name} (${tenantId})】证照与一照一码核验无误，准予正式立约营业？`)) return;

    const { error } = await supabase
      .from('platform_tenant')
      .update({ is_active: true, membership_status: 'active' })
      .eq('tenant_id', tenantId);

    if (error) return alert('终审操作失败：' + error.message);
    alert(`🎉 【${t.company_name}】已正式激活立约！该商号现已同步出现在百业供需名录与百工天街中。`);
    window.loadPlatformDashboard();
  };

  window.openCreateTenantModal = function () {
    ['new-t-name', 'new-t-credit', 'new-t-person', 'new-t-phone', 'new-t-sponsor', 'new-t-desc'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    window.openModal('modal-create-tenant');
  };

  window.submitCreateNewTenant = async function () {
    const business_type = document.getElementById('new-t-type')?.value || 'coop';
    const company_name = document.getElementById('new-t-name')?.value.trim();
    const credit_code = document.getElementById('new-t-credit')?.value.trim().toUpperCase();
    const contact_person = document.getElementById('new-t-person')?.value.trim();
    const phone = document.getElementById('new-t-phone')?.value.trim();
    const sponsor_org = document.getElementById('new-t-sponsor')?.value.trim() || '';
    const brand_origin_desc = document.getElementById('new-t-desc')?.value.trim() || '';
    const permitBM = document.getElementById('new-t-bm')?.checked !== false;
    const permitEC = document.getElementById('new-t-ec')?.checked !== false;

    if (!company_name || credit_code.length !== 18 || !contact_person || phone.length < 11) {
      return alert('请完整填写商号全称、18 位统一信用代码/身份证全号、负责人姓名与 11 位手机号！');
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
        `• 初始登录密钥：${rawInitPwd}（证件后6位，已哈希加密入库）`
    );
    window.closeModal('modal-create-tenant');
    window.loadPlatformDashboard();
  };

  window.openEditTenantModal = function (tenantId) {
    const t = platformState.allTenants.find((x) => x.tenant_id === tenantId);
    if (!t) return;
    platformState.editingTenantId = tenantId;

    document.getElementById('edit-t-title').innerText = `⚙️ 商号治理与权限配置 · ${t.company_name} (${t.tenant_id})`;
    document.getElementById('edit-t-status').value = t.membership_status || (t.is_active ? 'active' : 'paused');
    document.getElementById('edit-t-bm').checked = t.permit_brick_and_mortar !== false;
    document.getElementById('edit-t-ec').checked = t.permit_ecommerce !== false;
    document.getElementById('edit-t-sponsor').value = t.sponsor_org || '';
    document.getElementById('edit-t-remark').value = t.admin_remark || '';
    window.openModal('modal-edit-tenant');
  };

  window.saveTenantGovernance = async function () {
    const tenantId = platformState.editingTenantId;
    if (!tenantId) return;

    const status = document.getElementById('edit-t-status').value;
    const permitBM = document.getElementById('edit-t-bm').checked;
    const permitEC = document.getElementById('edit-t-ec').checked;
    const sponsor_org = document.getElementById('edit-t-sponsor').value.trim();
    const admin_remark = document.getElementById('edit-t-remark').value.trim();

    const is_active = status === 'active';
    const service_mode = permitBM && permitEC ? '实体与电商双轨' : permitBM ? '实体店' : '电子商务';

    const { error } = await supabase
      .from('platform_tenant')
      .update({
        is_active,
        membership_status: status,
        permit_brick_and_mortar: permitBM,
        permit_ecommerce: permitEC,
        service_mode,
        sponsor_org,
        admin_remark
      })
      .eq('tenant_id', tenantId);

    if (error) return alert('保存治理配置失败：' + error.message);

    alert('✅ 商号治理状态与双渠道准入权限已更新生效！');
    window.closeModal('modal-edit-tenant');
    window.loadPlatformDashboard();
  };

  window.issueResetClaimToken = async function (tenantId) {
    const t = platformState.allTenants.find((x) => x.tenant_id === tenantId);
    if (!t) return;
    if (!confirm(`确认为【${t.company_name} (${tenantId})】核发一次性应急重置信码？\n核发后请核对大当家实体公章申明书后告知该信码。`)) return;

    const claimToken = 'RST-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const { error } = await supabase
      .from('platform_tenant')
      .update({ reset_claim_token: claimToken, totp_enabled: false, totp_secret: null, membership_status: 'active', is_active: true })
      .eq('tenant_id', tenantId);

    if (error) return alert('签发重置信码失败：' + error.message);

    prompt(
      `🔑 已为【${t.company_name}】签发一次性重置信码（同时已解除旧手机验证器绑定与冻结状态），请复制发给大当家作为「原密码」登录修改新密码：`,
      claimToken
    );
    window.loadPlatformDashboard();
  };
}
