import { supabase } from '../lib/supabase.js';

export function mountPlatformEvolutionWidget() {
  if (document.getElementById('platform-evolution-modal')) return;

  // 1. 注入右下角悬浮「生态自主演化参谋」入口按钮（不破坏 platform.html 原有布局）
  const triggerHtml = `
    <button type="button" onclick="window.openPlatformEvolutionModal()"
      class="fixed bottom-5 right-5 z-40 bg-emerald-900 hover:bg-emerald-800 text-amber-300 border border-amber-400/50 font-bold text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-1.5 active:scale-95 transition">
      <span>🌱</span> 生态自主演化参谋
    </button>
  `;
  document.body.insertAdjacentHTML('beforeend', triggerHtml);

  // 2. 注入自主演化分析与一键沉淀弹窗
  const modalHtml = `
    <div id="platform-evolution-modal" class="hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div class="bg-[#1f1f23] border border-stone-700 text-stone-200 w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto">
        
        <div class="flex justify-between items-center border-b border-stone-700 pb-3">
          <div>
            <h3 class="text-base font-bold text-amber-300 flex items-center gap-1.5">
              <span>🌱</span> 百工百业 · 规律自主演化引擎（大巧若拙）
            </h3>
            <p class="text-[11px] text-stone-400 mt-0.5">
              从一线交易、用度计划与余缺互调中自主提炼行业标准模板与城乡共配路线建议
            </p>
          </div>
          <button type="button" onclick="document.getElementById('platform-evolution-modal').classList.add('hidden')"
            class="text-stone-400 hover:text-white text-xl font-bold px-2">✕</button>
        </div>

        <div id="evolution-analysis-body" class="space-y-4 text-xs">
          <div class="py-10 text-center text-stone-400">正在扫描全网商品属性、需求频率与城乡互调流向...</div>
        </div>

      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  window.openPlatformEvolutionModal = async function () {
    const modal = document.getElementById('platform-evolution-modal');
    const bodyEl = document.getElementById('evolution-analysis-body');
    modal?.classList.remove('hidden');
    if (!bodyEl) return;

    bodyEl.innerHTML = '<div class="py-10 text-center text-stone-400">正在聚合作物规格、行当标签与城乡共配数据...</div>';

    try {
      const [prodRes, poolRes, planRes, catRes] = await Promise.all([
        supabase.from('product').select('id, name, category, measure_unit, tenant_id').limit(300),
        supabase.from('local_inventory_pool').select('id, from_store_name, to_store_name, product_name, qty, status').order('id', { ascending: false }).limit(100),
        supabase.from('demand_forecast_plan').select('id, store_name, product_name, planned_qty, status').order('id', { ascending: false }).limit(100),
        supabase.from('platform_category_dict').select('id, category_name')
      ]);

      const products = prodRes.data || [];
      const pools = poolRes.data || [];
      const plans = planRes.data || [];
      const existingCats = new Set((catRes.data || []).map((c) => String(c.category_name || '').trim()));

      // --- 演算法 1：品类与规格自生长（提取高频自定义属性与规格词） ---
      const unitCounter = {};
      const customCategoryCounter = {};
      products.forEach((p) => {
        const u = String(p.measure_unit || '').trim();
        if (u) unitCounter[u] = (unitCounter[u] || 0) + 1;

        const c = String(p.category || '').trim();
        if (c && !existingCats.has(c)) {
          customCategoryCounter[c] = (customCategoryCounter[c] || 0) + 1;
        }
      });

      const emergingCategories = Object.entries(customCategoryCounter)
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

      const topUnits = Object.entries(unitCounter)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

      // --- 演算法 2：供需网络与城乡共配路线自优化 ---
      const storeActivity = {};
      pools.forEach((r) => {
        const s = String(r.from_store_name || '').trim();
        if (s) storeActivity[s] = (storeActivity[s] || 0) + 1;
      });
      plans.forEach((pl) => {
        const s = String(pl.store_name || '').trim();
        if (s) storeActivity[s] = (storeActivity[s] || 0) + 1;
      });

      const hotspotStores = Object.entries(storeActivity)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const openShortageCount = plans.filter((p) => p.status === 'pending').length;
      const activePoolCount = pools.filter((p) => p.status === 'open').length;

      bodyEl.innerHTML = `
        <!-- 模块一：品类与规格自生长 -->
        <div class="bg-[#27272a] border border-stone-700 rounded-2xl p-4 space-y-2.5">
          <div class="flex justify-between items-center">
            <b class="text-emerald-300 text-sm">🧬 一、品类与规格自生长（高频字段沉淀建议）</b>
            <span class="text-[10px] text-stone-400">基于近 ${products.length} 款在架良品</span>
          </div>

          <div class="text-stone-300">
            <span class="text-stone-400">全网高频通用计量规格：</span>
            ${
              topUnits.length > 0
                ? topUnits.map(([u, cnt]) => `<span class="inline-block bg-stone-800 border border-stone-600 px-2 py-0.5 rounded-lg mr-1.5 mb-1 font-mono text-amber-300">${u} (${cnt}次)</span>`).join('')
                : '<span class="text-stone-500">暂无足够样本</span>'
            }
          </div>

          <div class="pt-1 border-t border-stone-700/70 space-y-2">
            <span class="text-stone-300 font-bold block">✨ 检测到聚集度较高的新兴自填行当/标签（建议沉淀为公共标准模板）：</span>
            ${
              emergingCategories.length > 0
                ? emergingCategories
                    .map(
                      ([catName, count]) => `
                      <div class="flex justify-between items-center bg-stone-900/90 border border-emerald-500/30 px-3 py-2 rounded-xl">
                        <div>
                          <b class="text-white">${catName}</b>
                          <span class="text-[11px] text-emerald-400 ml-2">已聚集 ${count} 款货品</span>
                        </div>
                        <button type="button" onclick="window.adoptEmergingCategory('${catName.replace(/'/g, '')}')"
                          class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 rounded-lg text-[11px] active:scale-95 transition">
                          ➕ 采纳为公共标准类目
                        </button>
                      </div>
                    `
                    )
                    .join('')
                : '<div class="text-[11px] text-stone-400 bg-stone-900/60 p-2.5 rounded-xl">当前各行当均已纳入标准类目字典，暂无未归档高频新标签。</div>'
            }
          </div>
        </div>

        <!-- 模块二：供需网络与城乡共配自优化 -->
        <div class="bg-[#27272a] border border-stone-700 rounded-2xl p-4 space-y-2.5">
          <div class="flex justify-between items-center">
            <b class="text-amber-300 text-sm">🚚 二、供需网络与城乡共配路线自优化</b>
            <span class="text-[10px] text-stone-400">待响应要货 ${openShortageCount} 单 · 在池余缺 ${activePoolCount} 单</span>
          </div>

          <p class="text-[11px] text-stone-300 leading-relaxed">
            ${
              hotspotStores.length >= 2
                ? `💡 <b>共配路线撮合建议：</b>近期【<b>${hotspotStores.map((x) => x[0]).join('、')}</b>】要货计划与余缺互调最活跃。建议在送货师傅早班线路中将上述驿站设为<b>「城乡顺路共配串点」</b>，既可消除单店空载率，又能实现邻里余缺当日顺路平账。`
                : '💡 当前全网区域供需运行平稳，待门店上报更多用度计划与互调单后，系统将自动测算最优城乡共配串点路线。'
            }
          </p>

          ${
            hotspotStores.length > 0
              ? `<div class="grid grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                  ${hotspotStores
                    .map(
                      ([sName, freq]) => `
                      <div class="bg-stone-900 border border-stone-700 px-2.5 py-2 rounded-xl">
                        <b class="text-stone-100 block truncate">${sName}</b>
                        <span class="text-[10px] text-amber-400 font-mono">活跃频次：${freq} 次</span>
                      </div>
                    `
                    )
                    .join('')}
                </div>`
              : ''
          }
        </div>
      `;
    } catch (err) {
      bodyEl.innerHTML = `<div class="py-6 text-center text-rose-400">演化数据分析异常：${err.message}</div>`;
    }
  };

  window.adoptEmergingCategory = async function (catName) {
    if (!catName) return;
    const { error } = await supabase.from('platform_category_dict').insert([
      {
        category_name: catName,
        sort_order: 99,
        is_active: true
      }
    ]);
    if (error) return alert('采纳失败：' + error.message);
    alert(`🎉 已将【${catName}】正式沉淀为全网公共标准类目模板！后续同类劳动者入驻与上架可直接一键选用。`);
    await window.openPlatformEvolutionModal();
  };
}
