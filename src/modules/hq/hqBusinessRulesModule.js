import { supabase } from '../../lib/supabase.js';
import { hqState } from './hqState.js';
import {
  INDUSTRY_RULE_PRESETS,
  getNormalizedTenantRules,
  evaluateTenantRiskRadar,
  whitelistAiAlertKey
} from '../../services/tenantRulesService.js';

export function renderHqBusinessRulesAndRiskRadar() {
  const host = document.getElementById('ai-advisor-cards');
  if (!host) return;

  const rawSettings = hqState.currentTenantData?.custom_settings || {};
  const rules = getNormalizedTenantRules(rawSettings);
  const alerts = evaluateTenantRiskRadar({
    stores: hqState.allStores || [],
    products: hqState.allProducts || [],
    orders: hqState.allOrders || [],
    logs: hqState.allInventoryLogs || [],
    rules
  });

  const headerHtml = `
    <div class="col-span-full flex flex-wrap items-center justify-between gap-2 bg-stone-50 border border-stone-200 px-3.5 py-2.5 rounded-2xl text-xs">
      <div class="flex items-center gap-2 text-stone-700">
        <span>📋</span>
        <span>
          本店自定行规：<b>拼单线 ${rules.groupBuyTargetQty} 件</b> · <b>载具警戒 ${rules.carrierWarnThreshold} 件</b> · <b>小额定损免批 ≤ ¥${rules.qcAutoApproveLimit}</b> · <b>AI 风控：${
            rules.aiRiskSensitivity === 'strict' ? '保守护盘' : rules.aiRiskSensitivity === 'relaxed' ? '宽松放行' : '平衡模式'
          }</b>
        </span>
      </div>
      ${
        hqState.currentRoleCode === 'owner'
          ? `<button type="button" onclick="window.openHqBusinessRulesModal()" class="bg-[#1b4332] hover:bg-[#143628] text-amber-300 font-bold px-3 py-1 rounded-xl text-[11px] shadow-2xs">
               ⚙️ 自定义经营行规与风控阈值
             </button>`
          : '<span class="text-[10px] text-stone-400">由大当家统筹设定</span>'
      }
    </div>
  `;

  if (alerts.length === 0) {
    host.innerHTML =
      headerHtml +
      `<div class="col-span-full p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center justify-between">
        <span>🛡️ <b>AI 风险雷达实时巡检正常：</b>当前所有合作门店账款、周转载具、货品保质期及线上交易均处于健康安全基线内。</span>
        <span class="font-mono text-[10px] text-emerald-700">风控评分：0 风险</span>
      </div>`;
    return;
  }

  const cardsHtml = alerts
    .map(
      (a) => `
      <div class="p-3.5 rounded-2xl border ${
        a.level === 'high' ? 'bg-rose-50/80 border-rose-300' : 'bg-amber-50/80 border-amber-300'
      } space-y-2 text-xs">
        <div class="flex justify-between items-start gap-2">
          <div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${
              a.level === 'high' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-stone-950'
            }">${a.category} · 风险分 ${a.score}</span>
            <b class="block text-stone-900 mt-1">${a.title}</b>
          </div>
        </div>
        <p class="text-[11px] text-stone-600">${a.reason}</p>
        <p class="text-[11px] text-emerald-900 font-medium">💡 参谋建议：${a.suggestion}</p>
        <div class="flex flex-wrap gap-1.5 pt-1">
          ${
            a.actionType === 'switch_store_cash'
              ? `<button type="button" onclick="window.applyAiSwitchStoreCash(${a.targetId}, '${a.key}')" class="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2.5 py-1 rounded-xl text-[10px]">
                   ✅ 采纳：切为随车现结
                 </button>`
              : ''
          }
          <button type="button" onclick="window.dismissAiAlertToWhitelist('${a.key}')" class="bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 font-bold px-2.5 py-1 rounded-xl text-[10px]">
            🛡️ 误报放行（加入白名单）
          </button>
        </div>
      </div>
    `
    )
    .join('');

  host.innerHTML = headerHtml + cardsHtml;
}

export function initHqBusinessRulesBindings() {
  window.applyAiSwitchStoreCash = async function (storeId, alertKey) {
    if (!confirm('确认采纳 AI 建议，将该门店默认结算方式切换为「随车现结」以防范坏账风险？')) return;
    const { error } = await supabase
      .from('store')
      .update({ default_settlement: 'cash', settle_workflow: 'cash_on_delivery' })
      .eq('id', storeId);
    if (error) return alert('操作失败：' + error.message);

    alert('✅ 已将该门店调整为「随车现结」模式！');
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  window.dismissAiAlertToWhitelist = async function (alertKey) {
    try {
      const nextSettings = await whitelistAiAlertKey(
        hqState.currentAgent,
        hqState.currentTenantData?.custom_settings || {},
        alertKey
      );
      if (hqState.currentTenantData) {
        hqState.currentTenantData.custom_settings = nextSettings;
      }
      renderHqBusinessRulesAndRiskRadar();
    } catch (err) {
      alert('更新白名单失败：' + err.message);
    }
  };

  window.openHqBusinessRulesModal = function () {
    if (hqState.currentRoleCode !== 'owner') {
      return alert('仅大当家主账号可修改本店经营行规与风控参数！');
    }
    document.getElementById('modal-hq-business-rules')?.remove();

    const cfg = getNormalizedTenantRules(hqState.currentTenantData?.custom_settings || {});
    const methodsText = cfg.settlementMethods.map((m) => `${m.code}:${m.label}`).join('\n');
    const reasonsText = cfg.returnReasons.join('\n');

    const modal = document.createElement('div');
    modal.id = 'modal-hq-business-rules';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-xl w-full p-5 space-y-4 shadow-2xl text-xs my-auto">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2.5">
          <div>
            <b class="text-sm text-stone-900">📋 本店自主经营行规与 AI 风控阈值</b>
            <p class="text-[11px] text-stone-500 mt-0.5">全部参数归属本商号独立生效，零硬编码，随时可调</p>
          </div>
          <button type="button" onclick="document.getElementById('modal-hq-business-rules')?.remove()" class="text-stone-400 hover:text-stone-800 text-base font-bold">✕</button>
        </div>

        <div class="bg-emerald-50/70 border border-emerald-200 p-3 rounded-2xl space-y-1.5">
          <b class="text-emerald-950 block">⚡ 一键套用行业常用行规模板：</b>
          <div class="flex flex-wrap gap-1.5">
            ${Object.entries(INDUSTRY_RULE_PRESETS)
              .map(
                ([k, v]) => `
                <button type="button" onclick="window.applyBusinessRulesPreset('${k}')" class="bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold px-2.5 py-1 rounded-xl text-[11px]">
                  ${v.label}
                </button>
              `
              )
              .join('')}
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div>
            <label class="text-stone-600 font-bold block mb-1">天街邻里拼单直发线(件)</label>
            <input type="number" id="cfg-group-qty" value="${cfg.groupBuyTargetQty}" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono font-bold">
          </div>
          <div>
            <label class="text-stone-600 font-bold block mb-1">周转载具未还预警(件)</label>
            <input type="number" id="cfg-carrier-warn" value="${cfg.carrierWarnThreshold}" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono font-bold">
          </div>
          <div>
            <label class="text-stone-600 font-bold block mb-1">默认单件载具押金(元)</label>
            <input type="number" id="cfg-carrier-dep" value="${cfg.carrierDefaultDeposit}" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono font-bold">
          </div>
          <div>
            <label class="text-stone-600 font-bold block mb-1">货品临期预警天数(天)</label>
            <input type="number" id="cfg-expiry-days" value="${cfg.expiryWarnDays}" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono font-bold">
          </div>
          <div>
            <label class="text-stone-600 font-bold block mb-1">小额定损免批上限(元)</label>
            <input type="number" id="cfg-qc-limit" value="${cfg.qcAutoApproveLimit}" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono font-bold">
          </div>
          <div>
            <label class="text-stone-600 font-bold block mb-1">AI 风控雷达灵敏度</label>
            <select id="cfg-ai-sens" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 font-bold">
              <option value="strict" ${cfg.aiRiskSensitivity === 'strict' ? 'selected' : ''}>🛡️ 保守护盘（提前预警）</option>
              <option value="balanced" ${cfg.aiRiskSensitivity === 'balanced' ? 'selected' : ''}>⚖️ 平衡模式（推荐）</option>
              <option value="relaxed" ${cfg.aiRiskSensitivity === 'relaxed' ? 'selected' : ''}>🌿 宽松放行（重效率）</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label class="text-stone-600 font-bold block mb-1">自定义结算方式（每行格式：代码:名称）</label>
            <textarea id="cfg-settlements" rows="4" class="w-full bg-stone-50 border border-stone-200 rounded-xl p-2 font-mono text-[11px]">${methodsText}</textarea>
          </div>
          <div>
            <label class="text-stone-600 font-bold block mb-1">自定义退换货原由（每行一项）</label>
            <textarea id="cfg-reasons" rows="4" class="w-full bg-stone-50 border border-stone-200 rounded-xl p-2 text-[11px]">${reasonsText}</textarea>
          </div>
        </div>

        <div class="flex justify-between items-center pt-1">
          <button type="button" onclick="window.resetAiWhitelist()" class="text-[11px] text-stone-500 underline">清空已忽略的 AI 白名单 (${cfg.aiWhitelistKeys.length})</button>
          <div class="flex gap-2">
            <button type="button" onclick="document.getElementById('modal-hq-business-rules')?.remove()" class="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 font-bold">取消</button>
            <button type="button" onclick="window.saveHqBusinessRulesSettings()" class="px-5 py-2 rounded-xl bg-[#1b4332] hover:bg-[#143628] text-white font-bold shadow">💾 保存并全端生效</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.applyBusinessRulesPreset = function (presetKey) {
    const p = INDUSTRY_RULE_PRESETS[presetKey];
    if (!p) return;
    document.getElementById('cfg-group-qty').value = p.groupBuyTargetQty;
    document.getElementById('cfg-carrier-warn').value = p.carrierWarnThreshold;
    document.getElementById('cfg-carrier-dep').value = p.carrierDefaultDeposit;
    document.getElementById('cfg-expiry-days').value = p.expiryWarnDays;
    document.getElementById('cfg-qc-limit').value = p.qcAutoApproveLimit;
    document.getElementById('cfg-ai-sens').value = p.aiRiskSensitivity;
    document.getElementById('cfg-settlements').value = p.settlementMethods.map((m) => `${m.code}:${m.label}`).join('\n');
    document.getElementById('cfg-reasons').value = p.returnReasons.join('\n');
  };

  window.resetAiWhitelist = async function () {
    const prev = hqState.currentTenantData?.custom_settings || {};
    const next = { ...prev, aiWhitelistKeys: [] };
    await supabase.from('platform_tenant').update({ custom_settings: next }).eq('tenant_id', hqState.currentAgent);
    if (hqState.currentTenantData) hqState.currentTenantData.custom_settings = next;
    alert('✅ 已清空 AI 忽略白名单，雷达将重新巡检所有风险项。');
    document.getElementById('modal-hq-business-rules')?.remove();
    renderHqBusinessRulesAndRiskRadar();
  };

  window.saveHqBusinessRulesSettings = async function () {
    const prev = hqState.currentTenantData?.custom_settings || {};
    const settlementLines = (document.getElementById('cfg-settlements')?.value || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const settlementMethods = settlementLines.map((line, idx) => {
      const [code, ...rest] = line.split(':');
      return {
        code: (code || `custom_${idx}`).trim(),
        label: (rest.join(':') || code || '自定义结算').trim()
      };
    });

    const returnReasons = (document.getElementById('cfg-reasons')?.value || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const nextSettings = {
      ...prev,
      groupBuyTargetQty: parseInt(document.getElementById('cfg-group-qty')?.value || '10', 10),
      carrierWarnThreshold: parseInt(document.getElementById('cfg-carrier-warn')?.value || '15', 10),
      carrierDefaultDeposit: parseFloat(document.getElementById('cfg-carrier-dep')?.value || '15'),
      expiryWarnDays: parseInt(document.getElementById('cfg-expiry-days')?.value || '30', 10),
      qcAutoApproveLimit: parseFloat(document.getElementById('cfg-qc-limit')?.value || '50'),
      aiRiskSensitivity: document.getElementById('cfg-ai-sens')?.value || 'balanced',
      settlementMethods: settlementMethods.length > 0 ? settlementMethods : undefined,
      returnReasons: returnReasons.length > 0 ? returnReasons : undefined
    };

    const { error } = await supabase
      .from('platform_tenant')
      .update({ custom_settings: nextSettings })
      .eq('tenant_id', hqState.currentAgent);

    if (error) return alert('保存经营行规失败：' + error.message);

    if (hqState.currentTenantData) hqState.currentTenantData.custom_settings = nextSettings;
    document.getElementById('modal-hq-business-rules')?.remove();
    alert('✅ 本店自主经营行规与 AI 风控阈值已保存！天街拼单线、外勤载具规则与 AI 雷达已即时同步更新。');
    renderHqBusinessRulesAndRiskRadar();
  };
}
