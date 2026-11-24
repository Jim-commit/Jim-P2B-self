import { supabase } from '../../lib/supabase.js';
import { printReceiptViaWebBluetooth } from '../../services/ultimateEcosystemService.js';
import { getNormalizedTenantRules } from '../../services/tenantRulesService.js';

const FIELD_VISIBLE_ROLES = new Set(['driver', 'sales']);

function getCurrentActivePalmRole() {
  const ownerSelect = document.getElementById('owner-role-preview-select');
  const switcher = document.getElementById('owner-view-switcher');
  if (ownerSelect && switcher && !switcher.classList.contains('hidden')) {
    return ownerSelect.value || 'owner_cockpit';
  }
  const deliverPane = document.getElementById('pane-deliver');
  const salesPane = document.getElementById('pane-sales-stores');
  if (deliverPane && !deliverPane.classList.contains('hidden')) return 'driver';
  if (salesPane && !salesPane.classList.contains('hidden')) return 'sales';
  return 'other';
}

export function syncDriverFieldToolsVisibility() {
  const bar = document.getElementById('driver-field-tools-bar');
  if (!bar) return;
  const role = getCurrentActivePalmRole();
  if (FIELD_VISIBLE_ROLES.has(role)) {
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

async function syncPalmTenantPolicy() {
  const tenantId = document.getElementById('tenant-display')?.innerText?.trim();
  if (!tenantId || tenantId === '--') return;

  try {
    const { data: tenant } = await supabase
      .from('platform_tenant')
      .select('tenant_id, company_name, custom_settings')
      .eq('tenant_id', tenantId)
      .single();

    if (!tenant) return;
    const policy = tenant.custom_settings && typeof tenant.custom_settings === 'object' ? tenant.custom_settings : {};
    window.__palmTenantPolicy = policy;
    window.__palmTenantCompany = tenant.company_name || tenant.tenant_id;

    const rules = getNormalizedTenantRules(policy);
    const warnLimit = rules.carrierWarnThreshold || 12;
    const mainCarrier = Array.isArray(policy.carriers) && policy.carriers[0] ? policy.carriers[0] : { name: '周转筐', deposit: 15 };

    const infoEl = document.getElementById('driver-field-policy-summary');
    if (infoEl) {
      infoEl.innerHTML = `${mainCarrier.name}押金 <b>¥${mainCarrier.deposit}</b> · 回收线 ≥ <b>${warnLimit}</b> 件`;
    }

    // 若大当家启动了紧急止损拉闸，在掌中宝顶栏下方同步提示（旧单交割照常运行）
    const header = document.querySelector('header');
    let brakeBanner = document.getElementById('palm-emergency-brake-banner');
    if (policy.emergencyBrakeActive) {
      if (!brakeBanner && header) {
        brakeBanner = document.createElement('div');
        brakeBanner.id = 'palm-emergency-brake-banner';
        header.insertAdjacentElement('afterend', brakeBanner);
      }
      if (brakeBanner) {
        brakeBanner.className = 'mx-3 mt-2 bg-rose-950 text-white border border-rose-500 px-3 py-2 rounded-2xl text-[11px] leading-relaxed';
        brakeBanner.innerHTML = `🚨 <b>商号紧急止损拉闸中</b>：${policy.emergencyBrakeReason || '全网新单已熔断'}（随车旧单交割与收款照常进行）`;
      }
    } else {
      brakeBanner?.remove();
    }
  } catch (err) {
    console.warn('掌中宝同步商号策略跳过:', err?.message);
  }
}

export function mountDriverFieldToolsBar(context = {}) {
  if (document.getElementById('driver-field-tools-bar')) return;
  const host =
    document.querySelector('header') ||
    document.getElementById('palm-role-nav') ||
    document.querySelector('main');

  const rules = getNormalizedTenantRules(context.tenantSettings || {});
  const warnLimit = rules.carrierWarnThreshold || 12;

  const bar = document.createElement('div');
  bar.id = 'driver-field-tools-bar';
  bar.className = 'hidden mx-3 mt-2 bg-amber-50 border border-amber-300 px-3 py-2 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs';
  bar.innerHTML = `
    <div class="flex items-center gap-1.5 text-amber-950 font-bold">
      <span>🚚 外勤助手：</span>
      <span id="driver-field-policy-summary" class="text-[11px] font-normal">载具回收线 ≥ <b>${warnLimit}</b> 件</span>
    </div>
    <div class="flex items-center gap-1.5">
      <button type="button" onclick="window.openDriverCarpoolSafe()" class="bg-cyan-700 hover:bg-cyan-800 text-white font-bold px-2.5 py-1 rounded-xl text-[11px] shadow-2xs active:scale-95 transition">
        🚚 顺路捎带接力
      </button>
      <button type="button" onclick="window.printLastDriverSlipBluetooth()" class="bg-[#1b4332] hover:bg-[#143628] text-amber-300 font-bold px-2.5 py-1 rounded-xl text-[11px] shadow-2xs active:scale-95 transition">
        🖨️ 蓝牙打印凭单
      </button>
    </div>
  `;

  if (host && host.parentNode) {
    host.insertAdjacentElement(host.id === 'palm-role-nav' ? 'beforebegin' : 'afterend', bar);
  } else {
    document.body.insertAdjacentElement('afterbegin', bar);
  }

  // 监听岗位切换、面板显隐及商号登录变化
  const ownerSelect = document.getElementById('owner-role-preview-select');
  ownerSelect?.addEventListener('change', () => setTimeout(syncDriverFieldToolsVisibility, 50));

  ['pane-deliver', 'pane-sales-stores', 'pane-warehouse', 'pane-qc-service', 'pane-owner-cockpit'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      new MutationObserver(syncDriverFieldToolsVisibility).observe(el, {
        attributes: true,
        attributeFilter: ['class']
      });
    }
  });

  const tenantDisp = document.getElementById('tenant-display');
  if (tenantDisp) {
    new MutationObserver(() => syncPalmTenantPolicy()).observe(tenantDisp, { childList: true, characterData: true, subtree: true });
  }

  syncDriverFieldToolsVisibility();
  syncPalmTenantPolicy();
  setTimeout(() => {
    syncDriverFieldToolsVisibility();
    syncPalmTenantPolicy();
  }, 800);
}

export function initDriverFieldToolsBindings(getLastSlipFn) {
  window.openDriverCarpoolSafe = async function () {
    if (typeof window.loadAndRenderCarpoolRelays === 'function') {
      await window.loadAndRenderCarpoolRelays();
    }
    if (typeof window.openCarpoolRelayModal === 'function') {
      window.openCarpoolRelayModal();
      return;
    }
    const modal = document.getElementById('modal-carpool-relay');
    const list = document.getElementById('carpool-relay-list');
    if (list && !list.innerHTML.trim()) {
      list.innerHTML = '<div class="py-6 text-center text-stone-400">当前暂无周边门店待顺路捎带的余缺互调单</div>';
    }
    modal?.classList.remove('hidden');
  };

  window.printLastDriverSlipBluetooth = async function () {
    const slip = typeof getLastSlipFn === 'function' ? getLastSlipFn() : window.__lastDriverDeliverySlip;
    const policy = window.__palmTenantPolicy || {};
    const companyName = window.__palmTenantCompany || '百工百业直供主体';
    const headerSub = policy.slipHeaderSub || '源头直供 · 诚信相照 · 货真价实';
    const footerNote = policy.slipFooterNote || '门店掌柜确认：已当面点清货品与载具数量';
    const stampText = policy.slipStampText || '调度专用章';

    const receiptText = slip
      ? [
          `================================`,
          `【${companyName}】`,
          `${headerSub}`,
          `--------------------------------`,
          `交割时间：${new Date().toLocaleString('zh-CN')}`,
          `收货门店：${slip.storeName || '合作门店'}`,
          `单据编号：#${slip.orderNo || '-'}`,
          `实收金额：¥${Number(slip.collectedAmount || 0).toFixed(2)} (${slip.payMethod || '随车结'})`,
          `发新载具：${slip.carrierOut || 0} 件 | 回收旧载具：${slip.carrierReturn || 0} 件`,
          `送货师傅：${slip.driverName || '当值司机'}`,
          `--------------------------------`,
          `${footerNote}`,
          `[电子核验印章：${stampText}]`
        ].join('\n')
      : [
          `================================`,
          `【${companyName} · 蓝牙小票机测试单】`,
          `${headerSub}`,
          `测试时间：${new Date().toLocaleString('zh-CN')}`,
          `设备状态：Web Bluetooth 蓝牙通道正常`,
          `[电子核验印章：${stampText}]`
        ].join('\n');

    try {
      const devName = await printReceiptViaWebBluetooth(receiptText);
      alert(`🖨️ 已通过蓝牙小票机【${devName}】打印随车交割凭单！`);
    } catch (err) {
      alert(`蓝牙打印提示：${err.message}\n\n（已为您复制凭单文本到剪贴板，可直接微信发给门店掌柜留存）`);
      navigator.clipboard?.writeText(receiptText).catch(() => {});
    }
  };
}
