/**
 * 百工百业 · 第2步核心引擎：万能项目卡 + 四个活插件（纯增量兼容，零表结构破坏）
 * 1. 📦 扣库存插件 (stock): 实物买卖、大小包装拆零、库存预警（老商品默认开启）
 * 2. 🎯 进度里程碑插件 (milestone): 工程装修、软件定制、设计法务分阶段收款节点
 * 3. 🔁 周期自动续费插件 (recurring): 代理记账、设备维保、会员托管按月/季/年自动生单
 * 4. 👤 派工与提成插件 (dispatch): 上门安装、维修、项目执行人指定与完工提成核算
 */

export const DEFAULT_ITEM_PLUGINS = {
  stock: { enabled: true, packRatio: 1, subUnit: '' },
  milestone: { enabled: false, stages: ['定金 30%', '中期验收 40%', '完工尾款 30%'] },
  recurring: { enabled: false, cycle: 'monthly', billDay: 1, autoDeductPrepaid: true },
  dispatch: { enabled: false, assigneeName: '', commissionType: 'fixed', commissionValue: 0 }
};

/**
 * 解析项目插件配置（老数据无 plugins 字段时，自动视同开启“扣库存”并隐藏其余三项，100% 平滑兼容）
 */
export function getNormalizedItemPlugins(product = {}) {
  const saved = product?.custom_specs?.plugins;
  if (!saved || typeof saved !== 'object') {
    return {
      stock: { ...DEFAULT_ITEM_PLUGINS.stock, enabled: true },
      milestone: { ...DEFAULT_ITEM_PLUGINS.milestone, enabled: false },
      recurring: { ...DEFAULT_ITEM_PLUGINS.recurring, enabled: false },
      dispatch: { ...DEFAULT_ITEM_PLUGINS.dispatch, enabled: false }
    };
  }
  return {
    stock: { ...DEFAULT_ITEM_PLUGINS.stock, ...(saved.stock || {}) },
    milestone: { ...DEFAULT_ITEM_PLUGINS.milestone, ...(saved.milestone || {}) },
    recurring: { ...DEFAULT_ITEM_PLUGINS.recurring, ...(saved.recurring || {}) },
    dispatch: { ...DEFAULT_ITEM_PLUGINS.dispatch, ...(saved.dispatch || {}) }
  };
}

/**
 * 生成列表页一眼看懂的插件徽章（纯实物默认只显示库存；纯服务不显示库存字样，亮出里程碑/续费/派工徽章）
 */
export function renderItemPluginBadgesHtml(product = {}) {
  const plg = getNormalizedItemPlugins(product);
  const badges = [];
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

/**
 * 渲染商品/项目弹窗里的“手电筒式四个活插件”配置卡片（勾选哪项，哪项输入框立刻亮起）
 */
export function renderPluginsEditorPanel(product = null) {
  const plg = getNormalizedItemPlugins(product || {});
  const stagesText = (plg.milestone.stages || []).join('\n');

  return `
    <div id="universal-plugins-panel" class="bg-stone-50 border border-stone-200 rounded-2xl p-3 space-y-2.5 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-1">
        <b class="text-stone-900">🧩 业务能力活插件（做啥生意勾哪项，不用的自动隐藏）：</b>
        <span class="text-[10px] text-stone-500">支持实物、服务、工程混搭</span>
      </div>

      <!-- 4个开关胶囊 -->
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

      <!-- 1. 扣库存与大小包装拆零区 -->
      <div id="plg-box-stock" class="${plg.stock.enabled ? '' : 'hidden'} bg-white border border-emerald-200 rounded-xl p-2.5 grid grid-cols-2 gap-2">
        <div>
          <label class="text-[11px] text-stone-600 font-bold block mb-0.5">整散拆零比例（1整单位等于多少零散单位）</label>
          <input type="number" min="1" id="plg-stock-ratio" value="${plg.stock.packRatio || 1}" placeholder="1（不拆零填1，如1箱=24瓶填24）" class="w-full bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 font-mono">
        </div>
        <div>
          <label class="text-[11px] text-stone-600 font-bold block mb-0.5">零散小单位名称（选填）</label>
          <input type="text" id="plg-stock-subunit" value="${plg.stock.subUnit || ''}" placeholder="如：瓶、个、斤" class="w-full bg-stone-50 border border-stone-200 rounded-lg px-2 py-1">
        </div>
      </div>

      <!-- 2. 分阶段里程碑收款区 -->
      <div id="plg-box-milestone" class="${plg.milestone.enabled ? '' : 'hidden'} bg-white border border-purple-200 rounded-xl p-2.5 space-y-1">
        <label class="text-[11px] text-purple-950 font-bold block">🎯 验收与收款阶段设置（每行一个阶段，完工点亮即提醒收款）：</label>
        <textarea id="plg-milestone-stages" rows="3" placeholder="例如：\n定金 30%\n中期验收 40%\n完工交付 30%" class="w-full bg-stone-50 border border-purple-200 rounded-lg p-1.5 text-[11px]">${stagesText}</textarea>
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

/**
 * 从表单收集四个活插件的配置对象
 */
export function collectPluginsFromDOM() {
  const stockEnabled = document.getElementById('plg-chk-stock')?.checked ?? true;
  const milestoneEnabled = document.getElementById('plg-chk-milestone')?.checked ?? false;
  const recurringEnabled = document.getElementById('plg-chk-recurring')?.checked ?? false;
  const dispatchEnabled = document.getElementById('plg-chk-dispatch')?.checked ?? false;

  const stages = (document.getElementById('plg-milestone-stages')?.value || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    stock: {
      enabled: stockEnabled,
      packRatio: Math.max(1, parseInt(document.getElementById('plg-stock-ratio')?.value || '1', 10)),
      subUnit: (document.getElementById('plg-stock-subunit')?.value || '').trim()
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
