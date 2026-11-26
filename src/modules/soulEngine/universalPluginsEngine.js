/**
 * 百工百业 · 万能项目卡 + 四个活插件（含简易组合装子料配方，零改表兼容）
 * 1. 📦 扣库存插件 (stock): 实物买卖、大小包装拆零、库存预警、简易组合装/加工子料配方
 * 2. 🎯 进度里程碑插件 (milestone): 支持完全自定义任意阶段数、阶段名称、比例或固定金额
 * 3. 🔁 周期自动续费插件 (recurring): 代理记账、设备维保、会员托管按月/季/年自动生单
 * 4. 👤 派工与提成插件 (dispatch): 上门安装、维修、项目执行人指定与完工提成核算
 */

export const DEFAULT_ITEM_PLUGINS = {
  stock: { enabled: true, packRatio: 1, subUnit: '', bundleComponents: [] },
  milestone: { enabled: false, stages: ['定金 30%', '中期验收 40%', '完工尾款 30%'] },
  recurring: { enabled: false, cycle: 'monthly', billDay: 1, autoDeductPrepaid: true },
  dispatch: { enabled: false, assigneeName: '', commissionType: 'fixed', commissionValue: 0 }
};

export function getNormalizedItemPlugins(product = {}) {
  const saved = product?.custom_specs?.plugins;
  if (!saved || typeof saved !== 'object') {
    return {
      stock: { ...DEFAULT_ITEM_PLUGINS.stock, enabled: true, bundleComponents: [] },
      milestone: { ...DEFAULT_ITEM_PLUGINS.milestone, enabled: false },
      recurring: { ...DEFAULT_ITEM_PLUGINS.recurring, enabled: false },
      dispatch: { ...DEFAULT_ITEM_PLUGINS.dispatch, enabled: false }
    };
  }
  const stockPart = { ...DEFAULT_ITEM_PLUGINS.stock, ...(saved.stock || {}) };
  if (!Array.isArray(stockPart.bundleComponents)) stockPart.bundleComponents = [];
  return {
    stock: stockPart,
    milestone: { ...DEFAULT_ITEM_PLUGINS.milestone, ...(saved.milestone || {}) },
    recurring: { ...DEFAULT_ITEM_PLUGINS.recurring, ...(saved.recurring || {}) },
    dispatch: { ...DEFAULT_ITEM_PLUGINS.dispatch, ...(saved.dispatch || {}) }
  };
}

export function parseMilestoneStage(stageStr, totalAmount = 0) {
  const raw = String(stageStr || '').trim();
  const pctMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  const fixedMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:元|块|¥)/);

  let amount = 0;
  let mode = 'text';
  if (pctMatch) {
    mode = 'percent';
    amount = Number(((totalAmount * parseFloat(pctMatch[1])) / 100).toFixed(2));
  } else if (fixedMatch) {
    mode = 'fixed';
    amount = Number(parseFloat(fixedMatch[1]).toFixed(2));
  }
  return { label: raw, mode, amount };
}

export function renderItemPluginBadgesHtml(product = {}) {
  const plg = getNormalizedItemPlugins(product);
  const badges = [];
  if (plg.stock.enabled && Array.isArray(plg.stock.bundleComponents) && plg.stock.bundleComponents.length > 0) {
    badges.push(
      `<span class="bg-emerald-50 text-emerald-900 border border-emerald-300 px-1.5 py-0.2 rounded text-[10px] font-bold mr-1">🎁 组合装(${plg.stock.bundleComponents.length}料)</span>`
    );
  }
  if (plg.milestone.enabled) {
    badges.push(
      `<span class="bg-purple-50 text-purple-800 border border-purple-200 px-1.5 py-0.2 rounded text-[10px] font-bold mr-1">🎯 ${plg.milestone.stages.length}阶段收款</span>`
    );
  }
  if (plg.recurring.enabled) {
    const cycleMap = { monthly: '按月续费', quarterly: '按季续费', yearly: '按年续费' };
    badges.push(
      `<span class="bg-cyan-50 text-cyan-800 border border-cyan-200 px-1.5 py-0.2 rounded text-[10px] font-bold mr-1">🔁 ${cycleMap[plg.recurring.cycle] || '周期续费'}</span>`
    );
  }
  if (plg.dispatch.enabled) {
    badges.push(
      `<span class="bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded text-[10px] font-bold mr-1">👤 派工${plg.dispatch.assigneeName ? ':' + plg.dispatch.assigneeName : ''}</span>`
    );
  }
  if (!plg.stock.enabled && badges.length === 0) {
    badges.push(
      `<span class="bg-stone-100 text-stone-600 border border-stone-200 px-1.5 py-0.2 rounded text-[10px] mr-1">🧾 纯服务/无库存项</span>`
    );
  }
  return badges.join('');
}

function renderSingleMilestoneRowHtml(val = '', idx = 0) {
  return `
    <div class="flex items-center gap-1.5 plg-milestone-row">
      <span class="text-[10px] font-mono text-purple-700 font-bold w-6 text-center">#${idx + 1}</span>
      <input type="text" value="${String(val).replace(/"/g, '"')}" placeholder="如：签约定金 30% 或 到场费 500元"
        class="plg-milestone-input flex-1 bg-stone-50 border border-purple-200 rounded-lg px-2 py-1 text-[11px] outline-none">
      <button type="button" onclick="this.closest('.plg-milestone-row').remove()" title="删除此阶段"
        class="text-stone-400 hover:text-rose-600 font-bold px-1.5 py-0.5 text-xs">✕</button>
    </div>
  `;
}

function renderSingleBundleComponentRowHtml(comp = { name: '', qty: 1 }) {
  return `
    <div class="flex items-center gap-1.5 plg-bundle-row">
      <input type="text" value="${String(comp.name || '').replace(/"/g, '"')}" placeholder="输入子原料/单品名（如：菜籽油）"
        class="plg-bundle-name flex-1 bg-stone-50 border border-emerald-200 rounded-lg px-2 py-1 text-[11px] outline-none">
      <span class="text-[10px] text-stone-500">×</span>
      <input type="number" step="0.01" min="0.01" value="${comp.qty || 1}"
        class="plg-bundle-qty w-16 bg-stone-50 border border-emerald-200 rounded-lg px-2 py-1 font-mono text-[11px] text-center outline-none">
      <button type="button" onclick="this.closest('.plg-bundle-row').remove()" title="移除子料"
        class="text-stone-400 hover:text-rose-600 font-bold px-1.5 py-0.5 text-xs">✕</button>
    </div>
  `;
}

export function renderPluginsEditorPanel(product = null) {
  const plg = getNormalizedItemPlugins(product || {});
  const stages = Array.isArray(plg.milestone.stages) && plg.milestone.stages.length > 0
    ? plg.milestone.stages
    : ['定金 30%', '中期验收 40%', '完工尾款 30%'];
  const bundleComps = Array.isArray(plg.stock.bundleComponents) ? plg.stock.bundleComponents : [];

  if (typeof window !== 'undefined') {
    window.addCustomMilestoneStageRow = function (presetText = '') {
      const box = document.getElementById('plg-milestone-rows-box');
      if (!box) return;
      const idx = box.querySelectorAll('.plg-milestone-row').length;
      box.insertAdjacentHTML('beforeend', renderSingleMilestoneRowHtml(presetText, idx));
    };
    window.addBundleComponentRow = function () {
      const box = document.getElementById('plg-bundle-rows-box');
      if (!box) return;
      box.insertAdjacentHTML('beforeend', renderSingleBundleComponentRowHtml({ name: '', qty: 1 }));
    };
  }

  return `
    <div id="universal-plugins-panel" class="bg-stone-50 border border-stone-200 rounded-2xl p-3 space-y-2.5 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-1">
        <b class="text-stone-900">🧩 业务能力活插件（做啥生意勾哪项，不用的自动隐藏）：</b>
        <span class="text-[10px] text-stone-500">支持实物、组合套装、服务、工程混搭</span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label class="flex items-center gap-1.5 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 cursor-pointer font-bold text-stone-800">
          <input type="checkbox" id="plg-chk-stock" ${plg.stock.enabled ? 'checked' : ''} onchange="window.togglePluginSection('stock')" class="rounded text-emerald-700">
          <span>📦 管库存/拆零</span>
        </label>
        <label class="flex items-center gap-1.5 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 cursor-pointer font-bold text-stone-800">
          <input type="checkbox" id="plg-chk-milestone" ${plg.milestone.enabled ? 'checked' : ''} onchange="window.togglePluginSection('milestone')" class="rounded text-purple-700">
          <span>🎯 分阶段收款</span>
        </label>
        <label class="flex items-center gap-1.5 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 cursor-pointer font-bold text-stone-800">
          <input type="checkbox" id="plg-chk-recurring" ${plg.recurring.enabled ? 'checked' : ''} onchange="window.togglePluginSection('recurring')" class="rounded text-cyan-700">
          <span>🔁 周期自动续费</span>
        </label>
        <label class="flex items-center gap-1.5 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 cursor-pointer font-bold text-stone-800">
          <input type="checkbox" id="plg-chk-dispatch" ${plg.dispatch.enabled ? 'checked' : ''} onchange="window.togglePluginSection('dispatch')" class="rounded text-amber-700">
          <span>👤 派工与提成</span>
        </label>
      </div>

      <!-- 1. 扣库存、整散拆零与简易组合装子料配方 -->
      <div id="plg-box-stock" class="${plg.stock.enabled ? '' : 'hidden'} bg-white border border-emerald-200 rounded-xl p-2.5 space-y-2">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-[11px] text-stone-600 font-bold block mb-0.5">整散拆零比例（1整单位=多少零散单位）</label>
            <input type="number" min="1" id="plg-stock-ratio" value="${plg.stock.packRatio || 1}" placeholder="1" class="w-full bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 font-mono">
          </div>
          <div>
            <label class="text-[11px] text-stone-600 font-bold block mb-0.5">零散小单位名称（选填）</label>
            <input type="text" id="plg-stock-subunit" value="${plg.stock.subUnit || ''}" placeholder="如：瓶、个、斤" class="w-full bg-stone-50 border border-stone-200 rounded-lg px-2 py-1">
          </div>
        </div>
        <div class="pt-1.5 border-t border-emerald-100 space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-emerald-950">🎁 简易组合装 / 子料扣减配方（选填，出货时自动按比例扣对应原料）：</span>
            <button type="button" onclick="window.addBundleComponentRow()" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold px-2 py-0.5 rounded-lg text-[10px]">
              + 添加子料
            </button>
          </div>
          <div id="plg-bundle-rows-box" class="space-y-1">
            ${bundleComps.map((c) => renderSingleBundleComponentRowHtml(c)).join('')}
          </div>
        </div>
      </div>

      <!-- 2. 自定义分阶段里程碑收款区 -->
      <div id="plg-box-milestone" class="${plg.milestone.enabled ? '' : 'hidden'} bg-white border border-purple-200 rounded-xl p-2.5 space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-1">
          <label class="text-[11px] text-purple-950 font-bold">🎯 自定义验收与收款阶段（支持填百分比如 30%，或固定金额如 500元）：</label>
          <button type="button" onclick="window.addCustomMilestoneStageRow('')" class="bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 font-bold px-2 py-0.5 rounded-lg text-[10px]">
            + 添加一阶段
          </button>
        </div>
        <div id="plg-milestone-rows-box" class="space-y-1.5">
          ${stages.map((st, idx) => renderSingleMilestoneRowHtml(st, idx)).join('')}
        </div>
      </div>

      <!-- 3. 周期自动续费区 -->
      <div id="plg-box-recurring" class="${plg.recurring.enabled ? '' : 'hidden'} bg-white border border-cyan-200 rounded-xl p-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
        <div>
          <label class="text-[11px] text-cyan-950 font-bold block mb-0.5">续费周期</label>
          <select id="plg-rec-cycle" class="w-full bg-stone-50 border border-cyan-200 rounded-lg px-2 py-1 font-bold">
            <option value="monthly" ${plg.recurring.cycle === 'monthly' ? 'selected' : ''}>每月自动续费</option>
            <option value="quarterly" ${plg.recurring.cycle === 'quarterly' ? 'selected' : ''}>每季度自动续费</option>
            <option value="yearly" ${plg.recurring.cycle === 'yearly' ? 'selected' : ''}>每年自动续费</option>
          </select>
        </div>
        <div>
          <label class="text-[11px] text-cyan-950 font-bold block mb-0.5">每月几号生单提醒</label>
          <input type="number" min="1" max="28" id="plg-rec-day" value="${plg.recurring.billDay || 1}" class="w-full bg-stone-50 border border-cyan-200 rounded-lg px-2 py-1 font-mono">
        </div>
        <label class="flex items-center gap-1.5 text-[11px] text-cyan-950 font-bold pt-3 cursor-pointer">
          <input type="checkbox" id="plg-rec-autodeduct" ${plg.recurring.autoDeductPrepaid !== false ? 'checked' : ''} class="rounded text-cyan-700">
          <span>客户有预存款时自动划扣</span>
        </label>
      </div>

      <!-- 4. 派工与提成区 -->
      <div id="plg-box-dispatch" class="${plg.dispatch.enabled ? '' : 'hidden'} bg-white border border-amber-200 rounded-xl p-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label class="text-[11px] text-amber-950 font-bold block mb-0.5">默认负责人员/师傅</label>
          <input type="text" id="plg-disp-assignee" value="${plg.dispatch.assigneeName || ''}" placeholder="如：李师傅 / 王会计" class="w-full bg-stone-50 border border-amber-200 rounded-lg px-2 py-1">
        </div>
        <div>
          <label class="text-[11px] text-amber-950 font-bold block mb-0.5">提成计算方式</label>
          <select id="plg-disp-type" class="w-full bg-stone-50 border border-amber-200 rounded-lg px-2 py-1 font-bold">
            <option value="fixed" ${plg.dispatch.commissionType === 'fixed' ? 'selected' : ''}>每单固定提成(元)</option>
            <option value="percent" ${plg.dispatch.commissionType === 'percent' ? 'selected' : ''}>按成交额百分比(%)</option>
          </select>
        </div>
        <div>
          <label class="text-[11px] text-amber-950 font-bold block mb-0.5">提成数值</label>
          <input type="number" step="0.01" id="plg-disp-val" value="${plg.dispatch.commissionValue || 0}" class="w-full bg-stone-50 border border-amber-200 rounded-lg px-2 py-1 font-mono">
        </div>
      </div>
    </div>
  `;
}

export function collectPluginsFromDOM() {
  const stockEnabled = document.getElementById('plg-chk-stock')?.checked ?? true;
  const milestoneEnabled = document.getElementById('plg-chk-milestone')?.checked ?? false;
  const recurringEnabled = document.getElementById('plg-chk-recurring')?.checked ?? false;
  const dispatchEnabled = document.getElementById('plg-chk-dispatch')?.checked ?? false;

  const stages = Array.from(document.querySelectorAll('#plg-milestone-rows-box .plg-milestone-input'))
    .map((inp) => inp.value.trim())
    .filter(Boolean);

  const bundleComponents = Array.from(document.querySelectorAll('#plg-bundle-rows-box .plg-bundle-row'))
    .map((row) => {
      const name = (row.querySelector('.plg-bundle-name')?.value || '').trim();
      const qty = parseFloat(row.querySelector('.plg-bundle-qty')?.value || '0') || 0;
      return name && qty > 0 ? { name, qty } : null;
    })
    .filter(Boolean);

  return {
    stock: {
      enabled: stockEnabled,
      packRatio: Math.max(1, parseInt(document.getElementById('plg-stock-ratio')?.value || '1', 10)),
      subUnit: (document.getElementById('plg-stock-subunit')?.value || '').trim(),
      bundleComponents
    },
    milestone: {
      enabled: milestoneEnabled,
      stages: stages.length > 0 ? stages : ['定金 30%', '中期验收 40%', '完工尾款 30%']
    },
    recurring: {
      enabled: recurringEnabled,
      cycle: document.getElementById('plg-rec-cycle')?.value || 'monthly',
      billDay: Math.min(28, Math.max(1, parseInt(document.getElementById('plg-rec-day')?.value || '1', 10))),
      autoDeductPrepaid: document.getElementById('plg-rec-autodeduct')?.checked ?? true
    },
    dispatch: {
      enabled: dispatchEnabled,
      assigneeName: (document.getElementById('plg-disp-assignee')?.value || '').trim(),
      commissionType: document.getElementById('plg-disp-type')?.value || 'fixed',
      commissionValue: parseFloat(document.getElementById('plg-disp-val')?.value || '0') || 0
    }
  };
}
