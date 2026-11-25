import { supabase } from '../../lib/supabase.js';
import { hqState } from './hqState.js';
import {
  INDUSTRY_RULE_PRESETS,
  getNormalizedTenantRules,
  evaluateTenantRiskRadar,
  whitelistAiAlertKey
} from '../../services/tenantRulesService.js';
import { getTenantLexicon, tLabel } from '../soulEngine/silentMemoryAndLexicon.js';

function inferSettlementCodeFromLabel(label, idx) {
  const txt = String(label || '').trim();
  if (txt.includes('现') || txt.includes('扫码') || txt.includes('货到付款')) return 'cash';
  if (txt.includes('换') || txt.includes('抵')) return 'barter_or_labor';
  if (txt.includes('回单') || txt.includes('统对')) return 'receipt_only';
  if (txt.includes('赊') || txt.includes('挂账') || txt.includes('月结')) return 'credit';
  return `custom_${idx + 1}`;
}

/**
 * 全局行话词典 DOM 自动刷新器：全站带有 data-lex 的标签随商号自定义称呼即时切换
 */
export function applyTenantLexiconToDOM(tenantSettings = {}) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-lex]').forEach((el) => {
    const key = el.getAttribute('data-lex');
    if (key) {
      el.textContent = tLabel(key, tenantSettings);
    }
  });
}

/**
 * 静默自进化落库助手：当日常开单中某个默认数字连续3次被改成相同新值时，悄悄更新为新默认值
 */
export async function syncEvolvedRuleParamToTenant(paramKey, newValue) {
  if (!hqState.currentAgent || !hqState.currentTenantData) return;
  const prev = hqState.currentTenantData.custom_settings || {};
  const nextSettings = { ...prev, [paramKey]: newValue };
  const { error } = await supabase
    .from('platform_tenant')
    .update({ custom_settings: nextSettings })
    .eq('tenant_id', hqState.currentAgent);
  if (!error) {
    hqState.currentTenantData.custom_settings = nextSettings;
    renderHqBusinessRulesAndRiskRadar();
  }
}

export function renderHqBusinessRulesAndRiskRadar() {
  const host = document.getElementById('ai-advisor-cards');
  if (!host) return;

  const rawSettings = hqState.currentTenantData?.custom_settings || {};
  const rules = getNormalizedTenantRules(rawSettings);
  const lex = getTenantLexicon(rawSettings);
  applyTenantLexiconToDOM(rawSettings);

  const alerts = evaluateTenantRiskRadar({
    stores: hqState.allStores || [],
    products: hqState.allProducts || [],
    orders: hqState.allOrders || [],
    logs: hqState.allInventoryLogs || [],
    rules
  });

  const headerHtml = `
    <div class="col-span-full flex flex-wrap items-center justify-between gap-2 bg-stone-50 border border-stone-200 px-3.5 py-2.5 rounded-2xl text-xs">
      <div class="flex flex-wrap items-center gap-2 text-stone-700">
        <span>📋</span>
        <span>
          本店规矩：<b>凑单起送 ${rules.groupBuyTargetQty} 件</b> · <b>${lex.carrierLabel}未还提醒 ${rules.carrierWarnThreshold} 件</b> · <b>小额报损免审批 ≤ ¥${rules.qcAutoApproveLimit}</b> · <b>提醒严格度：${
            rules.aiRiskSensitivity === 'strict' ? '严格防呆' : rules.aiRiskSensitivity === 'relaxed' ? '宽松少打扰' : '适中模式'
          }</b>
        </span>
        <span class="text-[11px] bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-lg">
          🗣️ 顺口称呼：${lex.partnerLabel} / ${lex.itemLabel} / ${lex.orderLabel} / ${lex.warehouseLabel} / ${lex.carrierLabel}
        </span>
      </div>
      ${
        hqState.currentRoleCode === 'owner'
          ? `<button type="button" onclick="window.openHqBusinessRulesModal()" class="bg-[#1b4332] hover:bg-[#143628] text-amber-300 font-bold px-3 py-1 rounded-xl text-[11px] shadow-2xs">
               ⚙️ 修改顺口称呼与本店规矩
             </button>`
          : '<span class="text-[10px] text-stone-400">由老板主账号统一设置</span>'
      }
    </div>
  `;

  if (alerts.length === 0) {
    host.innerHTML =
      headerHtml +
      `<div class="col-span-full p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center justify-between">
        <span>🛡️ <b>生意健康检查正常：</b>当前所有${lex.partnerLabel}欠款、${lex.carrierLabel}归还、${lex.itemLabel}有效期及线上交易都很正常，放心经营。</span>
        <span class="font-mono text-[10px] text-emerald-700">当前无异常提醒</span>
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
            }">${a.category} · 紧急程度 ${a.score}分</span>
            <b class="block text-stone-900 mt-1">${a.title}</b>
          </div>
        </div>
        <p class="text-[11px] text-stone-600">${a.reason}</p>
        <p class="text-[11px] text-emerald-900 font-medium">💡 建议做法：${a.suggestion}</p>
        <div class="flex flex-wrap gap-1.5 pt-1">
          ${
            a.actionType === 'switch_store_cash'
              ? `<button type="button" onclick="window.applyAiSwitchStoreCash(${a.targetId}, '${a.key}')" class="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2.5 py-1 rounded-xl text-[10px]">
                   ✅ 采纳：改为货到现结
                 </button>`
              : ''
          }
          <button type="button" onclick="window.dismissAiAlertToWhitelist('${a.key}')" class="bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 font-bold px-2.5 py-1 rounded-xl text-[10px]">
            🔕 正常情况，以后不再提醒
          </button>
        </div>
      </div>
    `
    )
    .join('');

  host.innerHTML = headerHtml + cardsHtml;
}

export function initHqBusinessRulesBindings() {
  window.applyAiSwitchStoreCash = async function (storeId) {
    if (!confirm('确认把这家客户的默认结账方式改为「货到现结」，防止欠款继续增加吗？')) return;
    const { error } = await supabase
      .from('store')
      .update({ default_settlement: 'cash', settle_workflow: 'cash_on_delivery' })
      .eq('id', storeId);
    if (error) return alert('操作失败：' + error.message);

    alert('✅ 已将其调整为「货到现结」模式！');
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
      alert('设置忽略提醒失败：' + err.message);
    }
  };

  window.simulateAiRiskRadarCard = function () {
    document.getElementById('modal-hq-business-rules')?.remove();
    const host = document.getElementById('ai-advisor-cards');
    if (!host) return;
    document.getElementById('ai-radar-demo-card')?.remove();

    const sampleStore = (hqState.allStores || [])[0];
    const storeName = sampleStore?.name || '示例客户（王老板便利店）';
    const demoHtml = `
      <div id="ai-radar-demo-card" class="p-3.5 rounded-2xl border bg-rose-50/90 border-rose-300 text-rose-950 flex flex-col justify-between gap-2 shadow-xs">
        <div>
          <div class="flex items-center justify-between gap-1.5">
            <span class="font-bold text-xs">🛡️ 【演练示例】${storeName} 欠款快到上限了</span>
            <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white">欠款提醒 · 88分</span>
          </div>
          <p class="text-[11px] opacity-90 mt-1 leading-relaxed">当前演练模拟欠款已占赊账额度 92%。建议下一单先改成「货到现结」，或安排对账收款。</p>
        </div>
        <div class="flex justify-end flex-wrap gap-1.5">
          ${
            sampleStore
              ? `<button type="button" onclick="window.applyAiSwitchStoreCash(${sampleStore.id}, 'demo_key')" class="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-xl font-bold text-[10px]">
                   ✅ 采纳：改为货到现结
                 </button>`
              : ''
          }
          <button type="button" onclick="document.getElementById('ai-radar-demo-card')?.remove(); alert('🔕 已设为以后不再提醒！');" class="bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 px-2.5 py-1 rounded-xl font-bold text-[10px]">
            正常情况，以后不再提醒
          </button>
        </div>
      </div>
    `;
    host.insertAdjacentHTML('afterbegin', demoHtml);
  };

  window.openHqBusinessRulesModal = function () {
    if (hqState.currentRoleCode !== 'owner') {
      return alert('只有老板主账号可以修改顺口称呼和本店规矩！');
    }
    document.getElementById('modal-hq-business-rules')?.remove();

    const rawSettings = hqState.currentTenantData?.custom_settings || {};
    const cfg = getNormalizedTenantRules(rawSettings);
    const lex = getTenantLexicon(rawSettings);
    const methodsText = cfg.settlementMethods.map((m) => m.label).join('\n');
    const reasonsText = cfg.returnReasons.join('\n');
    const unitsText = (lex.defaultUnits || []).join('、');

    const modal = document.createElement('div');
    modal.id = 'modal-hq-business-rules';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-2xl w-full p-5 space-y-4 shadow-2xl text-xs my-auto">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2.5">
          <div>
            <b class="text-sm text-stone-900">📋 本店顺口称呼与生意规矩设置</b>
            <p class="text-[11px] text-stone-500 mt-0.5">不限行业死板框框，称呼和规矩全按您平时习惯来，改完立刻生效</p>
          </div>
          <button type="button" onclick="document.getElementById('modal-hq-business-rules')?.remove()" class="text-stone-400 hover:text-stone-800 text-base font-bold">✕</button>
        </div>

        <!-- 第一层（手电筒默认亮起区）：五维普适顺口称呼与计价单位 -->
        <div class="bg-blue-50/70 border border-blue-200 p-3.5 rounded-2xl space-y-2.5">
          <div class="flex items-center justify-between">
            <b class="text-blue-950">🗣️ 平时顺口怎么叫（改完界面自动跟着换称呼）：</b>
            <span class="text-[10px] text-blue-700 font-medium">做啥生意都能用</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div>
              <label class="text-stone-600 font-bold block mb-1 text-[11px]">买家/客户叫啥</label>
              <input type="text" id="cfg-lex-partner" value="${lex.partnerLabel}" placeholder="客户/门店/工地" class="w-full bg-white border border-blue-200 rounded-xl px-2.5 py-1.5 font-bold text-stone-800">
            </div>
            <div>
              <label class="text-stone-600 font-bold block mb-1 text-[11px]">卖的货/服务叫啥</label>
              <input type="text" id="cfg-lex-item" value="${lex.itemLabel}" placeholder="货品/项目/服务" class="w-full bg-white border border-blue-200 rounded-xl px-2.5 py-1.5 font-bold text-stone-800">
            </div>
            <div>
              <label class="text-stone-600 font-bold block mb-1 text-[11px]">开的票据叫啥</label>
              <input type="text" id="cfg-lex-order" value="${lex.orderLabel}" placeholder="送货单/项目单" class="w-full bg-white border border-blue-200 rounded-xl px-2.5 py-1.5 font-bold text-stone-800">
            </div>
            <div>
              <label class="text-stone-600 font-bold block mb-1 text-[11px]">放货的地方叫啥</label>
              <input type="text" id="cfg-lex-warehouse" value="${lex.warehouseLabel}" placeholder="仓库/总仓/工程车" class="w-full bg-white border border-blue-200 rounded-xl px-2.5 py-1.5 font-bold text-stone-800">
            </div>
            <div>
              <label class="text-stone-600 font-bold block mb-1 text-[11px]">随单外借物叫啥</label>
              <input type="text" id="cfg-lex-carrier" value="${lex.carrierLabel}" placeholder="外借器具/周转箱/空桶" class="w-full bg-white border border-blue-200 rounded-xl px-2.5 py-1.5 font-bold text-stone-800">
            </div>
          </div>
          <div>
            <label class="text-stone-600 font-bold block mb-1 text-[11px]">常用计价单位（用顿号或逗号隔开，开单会自动记住您最常用的）</label>
            <input type="text" id="cfg-lex-units" value="${unitsText}" placeholder="箱、件、斤、套、户/月、小时、趟、批" class="w-full bg-white border border-blue-200 rounded-xl px-2.5 py-1.5 text-stone-800">
          </div>
        </div>

        <!-- 第二层（手电筒渐进式显隐）：详细规矩数字、结账方式与提醒设置 -->
        <details open class="group border border-stone-200 rounded-2xl p-3 bg-stone-50/50 space-y-3">
          <summary class="cursor-pointer font-bold text-stone-800 flex items-center justify-between select-none">
            <span>🔦 详细生意规矩、结账方式与提醒设置</span>
            <span class="text-[11px] text-stone-400 group-open:hidden">点这里展开设置 ▾</span>
            <span class="text-[11px] text-stone-400 hidden group-open:inline">收起 ▴</span>
          </summary>

          <div class="bg-emerald-50/70 border border-emerald-200 p-2.5 rounded-xl space-y-1.5 mt-2">
            <div class="flex items-center justify-between gap-2">
              <b class="text-emerald-950 text-[11px]">⚡ 懒人起步参考模板（可选套用，之后随时改）：</b>
              <button type="button" onclick="window.simulateAiRiskRadarCard()" class="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 font-bold px-2.5 py-0.5 rounded-xl text-[10px]">
                🧪 演练看看提醒长啥样
              </button>
            </div>
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

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
            <div>
              <label class="text-stone-600 font-bold block mb-1">团购/凑单起送量(件)</label>
              <input type="number" id="cfg-group-qty" value="${cfg.groupBuyTargetQty}" class="w-full bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono font-bold">
            </div>
            <div>
              <label class="text-stone-600 font-bold block mb-1">${lex.carrierLabel}未还提醒(件)</label>
              <input type="number" id="cfg-carrier-warn" value="${cfg.carrierWarnThreshold}" class="w-full bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono font-bold">
            </div>
            <div>
              <label class="text-stone-600 font-bold block mb-1">单个${lex.carrierLabel}押金(元)</label>
              <input type="number" id="cfg-carrier-dep" value="${cfg.carrierDefaultDeposit}" class="w-full bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono font-bold">
            </div>
            <div>
              <label class="text-stone-600 font-bold block mb-1">快过期提前几天提醒(天)</label>
              <input type="number" id="cfg-expiry-days" value="${cfg.expiryWarnDays}" class="w-full bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono font-bold">
            </div>
            <div>
              <label class="text-stone-600 font-bold block mb-1">小额报损免审批上限(元)</label>
              <input type="number" id="cfg-qc-limit" value="${cfg.qcAutoApproveLimit}" class="w-full bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 font-mono font-bold">
            </div>
            <div>
              <label class="text-stone-600 font-bold block mb-1">生意异常提醒严格度</label>
              <select id="cfg-ai-sens" class="w-full bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 font-bold">
                <option value="strict" ${cfg.aiRiskSensitivity === 'strict' ? 'selected' : ''}>🛡️ 严格防呆（早提醒）</option>
                <option value="balanced" ${cfg.aiRiskSensitivity === 'balanced' ? 'selected' : ''}>⚖️ 适中模式（推荐）</option>
                <option value="relaxed" ${cfg.aiRiskSensitivity === 'relaxed' ? 'selected' : ''}>🌿 宽松少打扰（重效率）</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <div>
              <label class="text-stone-600 font-bold block mb-1">常用结账方式（每行写一种即可）</label>
              <textarea id="cfg-settlements" rows="4" placeholder="例如：\n月结/先货后款\n货到现结/微信扫码" class="w-full bg-white border border-stone-200 rounded-xl p-2 text-[11px]">${methodsText}</textarea>
            </div>
            <div>
              <label class="text-stone-600 font-bold block mb-1">常见退换货原因（每行写一项）</label>
              <textarea id="cfg-reasons" rows="4" placeholder="例如：\n品质不符/有瑕疵\n送货途中损坏" class="w-full bg-white border border-stone-200 rounded-xl p-2 text-[11px]">${reasonsText}</textarea>
            </div>
          </div>
        </details>

        <div class="flex justify-between items-center pt-1">
          <button type="button" onclick="window.resetAiWhitelist()" class="text-[11px] text-stone-500 underline">恢复已忽略的提醒 (${cfg.aiWhitelistKeys.length})</button>
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
    document.getElementById('cfg-settlements').value = p.settlementMethods.map((m) => m.label).join('\n');
    document.getElementById('cfg-reasons').value = p.returnReasons.join('\n');
  };

  window.resetAiWhitelist = async function () {
    const prev = hqState.currentTenantData?.custom_settings || {};
    const next = { ...prev, aiWhitelistKeys: [] };
    await supabase.from('platform_tenant').update({ custom_settings: next }).eq('tenant_id', hqState.currentAgent);
    if (hqState.currentTenantData) hqState.currentTenantData.custom_settings = next;
    alert('✅ 已恢复所有被忽略的提醒，系统将重新帮您盯着各项风险。');
    document.getElementById('modal-hq-business-rules')?.remove();
    renderHqBusinessRulesAndRiskRadar();
  };

  window.saveHqBusinessRulesSettings = async function () {
    const prev = hqState.currentTenantData?.custom_settings || {};
    const existingLex = getTenantLexicon(prev);

    const parsedUnits = (document.getElementById('cfg-lex-units')?.value || '')
      .split(/[、,，\s]+/)
      .map((u) => u.trim())
      .filter(Boolean);

    const settlementLines = (document.getElementById('cfg-settlements')?.value || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const settlementMethods = settlementLines.map((line, idx) => {
      if (/^[a-zA-Z0-9_]+[:：]/.test(line)) {
        const [code, ...rest] = line.split(/[:：]/);
        return {
          code: code.trim(),
          label: (rest.join(':') || code).trim()
        };
      }
      return {
        code: inferSettlementCodeFromLabel(line, idx),
        label: line
      };
    });

    const returnReasons = (document.getElementById('cfg-reasons')?.value || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const nextSettings = {
      ...prev,
      lexicon: {
        ...existingLex,
        partnerLabel: document.getElementById('cfg-lex-partner')?.value.trim() || '客户/门店',
        itemLabel: document.getElementById('cfg-lex-item')?.value.trim() || '货品/项目',
        orderLabel: document.getElementById('cfg-lex-order')?.value.trim() || '业务单',
        warehouseLabel: document.getElementById('cfg-lex-warehouse')?.value.trim() || '存放点',
        carrierLabel: document.getElementById('cfg-lex-carrier')?.value.trim() || '外借器具',
        defaultUnits: parsedUnits.length > 0 ? Array.from(new Set(parsedUnits)) : existingLex.defaultUnits
      },
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

    if (error) return alert('保存失败：' + error.message);

    if (hqState.currentTenantData) hqState.currentTenantData.custom_settings = nextSettings;
    applyTenantLexiconToDOM(nextSettings);
    document.getElementById('modal-hq-business-rules')?.remove();
    alert('✅ 本店顺口称呼和生意规矩已保存！全端界面已同步更新。');
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };
}
