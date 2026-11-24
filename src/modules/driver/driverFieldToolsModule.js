import { printReceiptViaWebBluetooth } from '../../services/ultimateEcosystemService.js';
import { getNormalizedTenantRules } from '../../services/tenantRulesService.js';

export function mountDriverFieldToolsBar(context = {}) {
  const host = document.querySelector('header') || document.querySelector('nav');
  if (!host || document.getElementById('driver-field-tools-bar')) return;

  const rules = getNormalizedTenantRules(context.tenantSettings || {});
  const warnLimit = rules.carrierWarnThreshold || 12;

  const bar = document.createElement('div');
  bar.id = 'driver-field-tools-bar';
  bar.className = 'mx-3 mt-2 bg-amber-50 border border-amber-300 px-3 py-2 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs';
  bar.innerHTML = `
    <div class="flex items-center gap-1.5 text-amber-950 font-bold">
      <span>🚚 外勤助手：</span>
      <span class="text-[11px] font-normal">载具重点回收线 ≥ <b>${warnLimit}</b> 件</span>
    </div>
    <button type="button" onclick="window.printLastDriverSlipBluetooth()" class="bg-[#1b4332] hover:bg-[#143628] text-amber-300 font-bold px-3 py-1 rounded-xl text-[11px] shadow-2xs active:scale-95 transition">
      🖨️ 蓝牙打印交割凭单
    </button>
  `;
  host.insertAdjacentElement('afterend', bar);
}

export function initDriverFieldToolsBindings(getLastSlipFn) {
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
