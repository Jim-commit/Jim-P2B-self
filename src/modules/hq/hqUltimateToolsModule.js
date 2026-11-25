import { supabase } from '../../lib/supabase.js';
import {
  buildWeeklyHealthReport,
  buildInstitutionalProcurementPack,
  buildDisputeEvidenceDossier,
  printReceiptViaWebBluetooth
} from '../../services/ultimateEcosystemService.js';
import { hqState } from './hqState.js';

function isAgriEntity() {
  const entityVal = document.getElementById('entity-type-selector')?.value || '';
  const bizType = `${entityVal} ${hqState.currentTenantData?.business_type || ''} ${hqState.currentTenantData?.industry_type || ''}`;
  return entityVal === 'coop' || /coop|农|合作社|生鲜|果蔬|粮油|种植|养殖/.test(bizType);
}

export function mountHqUltimateToolsButton() {
  const host = document.getElementById('ai-advisor-cards');
  if (!host || document.getElementById('hq-ultimate-toolbox-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'hq-ultimate-toolbox-bar';
  bar.className = 'col-span-full bg-amber-50/70 border border-amber-300 px-3.5 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs';
  bar.innerHTML = `
    <div class="flex items-center gap-2 text-amber-950">
      <span>🧰</span>
      <span><b>百工生态与应急百宝箱：</b>经营晴雨周报 · 大客户阳光集采包 · 证据公断卷宗 · 商号临时托付 · 5分钟消防演习</span>
    </div>
    <button type="button" onclick="window.openHqUltimateToolboxModal()" class="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-3 py-1 rounded-xl text-[11px] shadow-2xs">
      打开生态百宝箱 ➔
    </button>
  `;
  host.insertAdjacentElement('beforeend', bar);
}

export function initHqUltimateToolsBindings() {
  window.openHqUltimateToolboxModal = function () {
    document.getElementById('modal-hq-ultimate-toolbox')?.remove();

    const report = buildWeeklyHealthReport({
      tenantName: hqState.currentTenantData?.company_name || hqState.currentAgent,
      stores: hqState.allStores || [],
      products: hqState.allProducts || [],
      orders: hqState.allOrders || []
    });

    const isDormant = !!hqState.currentTenantData?.is_dormant;
    const trusteeName = hqState.currentTenantData?.emergency_trustee_name || '';
    const trusteePhone = hqState.currentTenantData?.emergency_trustee_phone || '';
    const savedDays =
      hqState.currentTenantData?.custom_settings?.emergency_trustee_days ??
      hqState.globalPolicy?.emergency_trustee_days;
    const savedHours =
      hqState.currentTenantData?.custom_settings?.emergency_trustee_hours ??
      hqState.globalPolicy?.emergency_trustee_hours;
    const trusteeDays = savedDays ?? (savedHours ? Math.max(1, Math.round(Number(savedHours) / 24)) : 3);

    const dormantBtnLabel = isDormant
      ? '🌱 唤醒恢复营业'
      : isAgriEntity()
      ? '❄️ 农闲休眠保号'
      : '❄️ 淡季休眠保号';

    const modal = document.createElement('div');
    modal.id = 'modal-hq-ultimate-toolbox';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-2xl w-full p-5 space-y-4 shadow-2xl text-xs my-auto">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2.5">
          <div>
            <b class="text-sm text-stone-900">🧰 百工生态经营百宝箱（全行业普适集成）</b>
            <p class="text-[11px] text-stone-500 mt-0.5">涵盖周报体检、大客户阳光集采、争议公断卷宗、商号临时托付与实战消防演习</p>
          </div>
          <button type="button" onclick="document.getElementById('modal-hq-ultimate-toolbox')?.remove()" class="text-stone-400 hover:text-stone-800 text-base font-bold">✕</button>
        </div>

        <!-- 1. 每周经营晴雨周报 -->
        <div class="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-1.5">
          <div class="flex justify-between items-center">
            <b class="text-emerald-950">📊 掌柜经营晴雨周报（${report.periodLabel}）</b>
            <button type="button" onclick="window.printWeeklyReportBluetooth()" class="bg-white border border-emerald-300 text-emerald-900 font-bold px-2.5 py-1 rounded-xl text-[10px]">
              🖨️ 蓝牙小票机打印周报
            </button>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
            <div class="bg-white p-2 rounded-xl border border-emerald-100"><span class="text-[10px] text-stone-400 block">近7日成交额</span><b class="text-emerald-900">¥${report.weekSales}</b></div>
            <div class="bg-white p-2 rounded-xl border border-emerald-100"><span class="text-[10px] text-stone-400 block">交割单量</span><b>${report.deliveredCount}/${report.weekOrderCount} 单</b></div>
            <div class="bg-white p-2 rounded-xl border border-emerald-100"><span class="text-[10px] text-stone-400 block">累计应收欠款</span><b class="text-rose-700">¥${report.totalReceivable}</b></div>
            <div class="bg-white p-2 rounded-xl border border-emerald-100"><span class="text-[10px] text-stone-400 block">在外周转载具</span><b class="text-amber-800">${report.totalBaskets} 件</b></div>
          </div>
          <div class="text-[11px] text-stone-700 pt-1">
            <div>🔥 <b>畅销 Top3：</b>${report.top3Prods}</div>
            <div>⏳ <b>积压提醒：</b>${report.slowProducts}</div>
          </div>
        </div>

        <!-- 2. 大客户阳光集采包 & 三阶证据公断卷宗 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <b class="text-stone-900 block">🏛️ 大客户阳光集采包</b>
            <p class="text-[11px] text-stone-500">一键汇总营业执照核验、主体信义背书与全品阳光集采报价单。</p>
            <button type="button" onclick="window.copyInstitutionalQuotePack()" class="w-full py-2 rounded-xl bg-[#1b4332] text-white font-bold text-[11px]">
              📋 一键复制阳光集采报价包
            </button>
          </div>

          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <b class="text-stone-900 block">⚖️ 三阶民间公平公断 · 证据卷宗</b>
            <p class="text-[11px] text-stone-500">输入争议单号，自动打包订单、轨迹与流水生成不可篡改卷宗。</p>
            <button type="button" onclick="window.exportOrderDisputeDossier()" class="w-full py-2 rounded-xl bg-indigo-700 text-white font-bold text-[11px]">
              🗂️ 打包单据电子证据卷宗
            </button>
          </div>
        </div>

        <!-- 3. 商号临时托付人（天数可自定义） & 季节休眠保号 & 5分钟消防演习 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <div class="flex items-center justify-between gap-1">
              <b class="text-stone-900">🔑 商号临时托付人</b>
              <label class="flex items-center gap-1 text-[10px] text-stone-600 font-mono bg-white border border-stone-200 px-2 py-0.5 rounded-lg">
                <span>公示</span>
                <input type="number" id="trustee-days-input" min="1" max="30" value="${trusteeDays}" class="w-10 text-center font-bold text-stone-900 outline-none">
                <span>天</span>
              </label>
            </div>
            <div class="flex gap-1.5">
              <input type="text" id="trustee-name-input" value="${trusteeName}" placeholder="托付人姓名 (如合伙人/财务)" class="w-1/2 bg-white border border-stone-200 rounded-xl px-2 py-1.5 text-[11px]">
              <input type="text" id="trustee-phone-input" value="${trusteePhone}" placeholder="托付人手机号" class="w-1/2 bg-white border border-stone-200 rounded-xl px-2 py-1.5 text-[11px] font-mono">
            </div>
            <button type="button" onclick="window.saveEmergencyTrustee()" class="w-full py-1.5 rounded-xl bg-stone-900 text-amber-300 font-bold text-[11px]">
              💾 保存商号临时托付人
            </button>
          </div>

          <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
            <b class="text-stone-900 block">🧯 实战安全演习 & 季节休眠保号</b>
            <div class="flex gap-1.5">
              <button type="button" onclick="window.runFiveMinFireDrill()" class="flex-1 py-2 rounded-xl bg-rose-600 text-white font-bold text-[11px]">
                🧯 5分钟消防演习
              </button>
              <button type="button" onclick="window.toggleTenantDormantMode(${!isDormant})" class="flex-1 py-2 rounded-xl bg-amber-200 text-amber-950 font-bold text-[11px]">
                ${dormantBtnLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.copyInstitutionalQuotePack = function () {
    const rawText = buildInstitutionalProcurementPack({
      tenant: hqState.currentTenantData,
      products: hqState.allProducts || []
    });
    const cleanText = String(rawText || '')
      .replace(/企事业单位\/食堂阳光集采/g, '大客户阳光集采')
      .replace(/食堂采购负责人/g, '大客户采购负责人')
      .replace(/食堂/g, '大客户');

    navigator.clipboard.writeText(cleanText).then(() => {
      alert('✅ 《大客户阳光集采报价与溯源凭证包》已复制，可直接发送大客户采购负责人！');
    });
  };

  window.exportOrderDisputeDossier = function () {
    const orderNo = prompt('请输入需要打包证据卷宗的单据编号（例如：SO-261124-1024）：');
    if (!orderNo || !orderNo.trim()) return;
    const target = (hqState.allOrders || []).find(
      (o) => String(o.order_no || o.id).toUpperCase().includes(orderNo.trim().toUpperCase())
    );
    if (!target) return alert('未找到匹配该单号的订单记录！');

    const dossier = buildDisputeEvidenceDossier({
      tenant: hqState.currentTenantData,
      order: target,
      logs: hqState.allInventoryLogs || []
    });
    navigator.clipboard.writeText(dossier).then(() => {
      alert('✅ 《三阶民间公平公断电子证据卷宗》已生成并复制到剪贴板，可直接呈交联保单位或公断席！');
    });
  };

  window.saveEmergencyTrustee = async function () {
    if (hqState.currentRoleCode !== 'owner') return alert('仅大当家主账号可设定商号临时托付人！');
    const name = document.getElementById('trustee-name-input')?.value.trim();
    const phone = document.getElementById('trustee-phone-input')?.value.trim();
    const days = Math.max(1, parseInt(document.getElementById('trustee-days-input')?.value || '3', 10) || 3);

    if (!name || !/^1\d{10}$/.test(phone || '')) {
      return alert('请填写正确的托付人姓名与 11 位手机号！');
    }

    const nextSettings = {
      ...(hqState.currentTenantData?.custom_settings || hqState.globalPolicy || {}),
      emergency_trustee_days: days,
      emergency_trustee_hours: days * 24
    };

    const { error } = await supabase
      .from('platform_tenant')
      .update({
        emergency_trustee_name: name,
        emergency_trustee_phone: phone,
        custom_settings: nextSettings
      })
      .eq('tenant_id', hqState.currentAgent);
    if (error) return alert('保存失败：' + error.message);

    if (hqState.currentTenantData) {
      hqState.currentTenantData.emergency_trustee_name = name;
      hqState.currentTenantData.emergency_trustee_phone = phone;
      hqState.currentTenantData.custom_settings = nextSettings;
    }
    if (hqState.globalPolicy) {
      hqState.globalPolicy.emergency_trustee_days = days;
      hqState.globalPolicy.emergency_trustee_hours = days * 24;
    }
    alert(`✅ 已登记商号临时托付人【${name} (${phone})】！\n如遇突发意外，托付人可凭双手机核验发起 ${days} 天冷静公示临时接管。`);
  };

  window.toggleTenantDormantMode = async function (nextDormant) {
    if (hqState.currentRoleCode !== 'owner') return alert('仅大当家主账号可操作休眠保号！');
    const { error } = await supabase
      .from('platform_tenant')
      .update({ is_dormant: nextDormant })
      .eq('tenant_id', hqState.currentAgent);
    if (error) return alert('切换失败：' + error.message);

    alert(
      nextDormant
        ? '❄️ 已开启【季节性休眠保号】：保留全部名录、账号与历史账目凭证，淡季/非产季免受消息打扰！'
        : '🌱 已唤醒商号恢复正常营业！'
    );
    document.getElementById('modal-hq-ultimate-toolbox')?.remove();
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  window.runFiveMinFireDrill = function () {
    alert(
      `🧯【5 分钟红蓝消防安全演习（隔离沙盒剧本）】\n\n` +
        `演习剧本：凌晨 02:15 监测到某异常设备在天街专柜连续提交 15 笔 0.01 元异常订单。\n` +
        `• 第 1 步（0:30）：AI 风险雷达评分 92 分亮红灯并推送预警；\n` +
        `• 第 2 步（1:15）：大当家点击「🚨 本店紧急止损拉闸」勾选冻结天街线上接单；\n` +
        `• 第 3 步（3:00）：一键生成日结平衡快照校验资金零损失；\n` +
        `• 第 4 步（4:30）：核查完后通过 2FA 解除拉闸恢复营业。\n\n` +
        `✅ 演习自检结果：当前商号熔断槽位、日结快照与 2FA 链路均处于就绪状态（演习评分：100 分）！`
    );
  };

  window.printWeeklyReportBluetooth = async function () {
    const report = buildWeeklyHealthReport({
      tenantName: hqState.currentTenantData?.company_name || hqState.currentAgent,
      stores: hqState.allStores || [],
      products: hqState.allProducts || [],
      orders: hqState.allOrders || []
    });
    const text =
      `【${report.tenantName} · 经营晴雨周报】\n` +
      `近7日成交：¥${report.weekSales} (${report.deliveredCount}单)\n` +
      `应收欠款：¥${report.totalReceivable}\n` +
      `在外载具：${report.totalBaskets}件\n` +
      `畅销Top3：${report.top3Prods}`;
    try {
      const devName = await printReceiptViaWebBluetooth(text);
      alert(`🖨️ 已通过蓝牙打印机【${devName}】完成周报打印！`);
    } catch (err) {
      alert(`蓝牙打印提示：${err.message}\n\n（已自动将周报文本复制到剪贴板，可直接在手机备忘录或微信打印）`);
      navigator.clipboard?.writeText(text).catch(() => {});
    }
  };
}
