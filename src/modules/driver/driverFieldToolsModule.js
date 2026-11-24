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
      <span class="text-[11px] font-normal">载具回收线 ≥ <b>${warnLimit}</b> 件</span>
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

  // 监听岗位切换与面板显隐变化，自动控制工具条出现或隐藏
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

  syncDriverFieldToolsVisibility();
  setTimeout(syncDriverFieldToolsVisibility, 500);
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
    const receiptText = slip
      ? [
          `================================`,
          `【百工百业 · 随车交割电子凭单】`,
          `交割时间：${new Date().toLocaleString('zh-CN')}`,
          `收货门店：${slip.storeName || '合作门店'}`,
          `单据编号：#${slip.orderNo || '-'}`,
          `实收金额：¥${Number(slip.collectedAmount || 0).toFixed(2)} (${slip.payMethod || '随车结'})`,
          `发新载具：${slip.carrierOut || 0} 件 | 回收旧载具：${slip.carrierReturn || 0} 件`,
          `送货师傅：${slip.driverName || '当值司机'}`,
          `--------------------------------`,
          `门店掌柜确认：已当面点清货品与载具数量`
        ].join('\n')
      : [
          `================================`,
          `【百工百业 · 外勤蓝牙小票机测试单】`,
          `测试时间：${new Date().toLocaleString('zh-CN')}`,
          `设备状态：Web Bluetooth 蓝牙通道正常`
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
