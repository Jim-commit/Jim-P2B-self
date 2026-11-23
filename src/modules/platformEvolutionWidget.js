import { supabase } from '../lib/supabase.js';

export function mountPlatformEvolutionWidget() {
  if (document.getElementById('platform-evolution-modal')) return;

  const triggerHtml = `
    <button type="button" onclick="window.openPlatformEvolutionModal()"
      class="fixed bottom-5 right-5 z-40 bg-emerald-900 hover:bg-emerald-800 text-amber-300 border border-amber-400/50 font-bold text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-1.5 active:scale-95 transition">
      <span>🌱</span> 生态自主演化参谋
    </button>
  `;
  document.body.insertAdjacentHTML('beforeend', triggerHtml);

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
          <div class="flex items-center gap-2">
            <button type="button" onclick="window.openPlatformEvolutionModal()"
              class="bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-600 px-2.5 py-1 rounded-lg text-[11px] font-bold active:scale-95 transition">
              🔄 重新扫描
            </button>
            <button type="button" onclick="document.getElementById('platform-evolution-modal').classList.add('hidden')"
              class="text-stone-400 hover:text-white text-xl font-bold px-2">✕</button>
          </div>
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
        supabase.from('product').select('*').limit(300),
        supabase.from('local_inventory_pool').select('*').order('id', { ascending: false }).limit(100),
        supabase.from('demand_forecast_plan').select('*').order('id', { ascending: false }).limit(100),
        supabase.from('platform_category_dict').select('*')
      ]);

      const products = prodRes.data || [];
      const pools = poolRes.data || [];
      const plans = planRes.data || [];
      const existingCats = new Set(
        (catRes.data || []).map((c) => String(c.category_name || c.name || '').trim())
      );

      // 1. 品类与规格自生长
      const unitCounter = {};
      const customCategoryCounter = {};
      products.forEach((p) => {
        const u = String(p.measure_unit || p.unit || p.spec || '').trim();
        if (u) unitCounter[u] = (unitCounter[u] || 0) + 1;

        const c = String(p.category || p.tag || '').trim();
        if (c && !existingCats.has(c)) {
          customCategoryCounter[c] = (customCategoryCounter[c] || 0) + 1;
        }
      });

      const emergingCategories = Object.entries(customCategoryCounter)
        .filter(([, count]) => count >= 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

      const topUnits = Object.entries(unitCounter)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

      // 2. 供需网络与城乡共配路线自优化
      const storeActivity = {};
      pools.forEach((r) => {
        const s = String(r.from_store_name || r.store_name || '').trim();
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

      const routeSuggestionText =
        hotspotStores.length >= 2
          ? `【城乡顺路共配建议】近期「${hotspotStores.map((x) => x[0]).join('、')}」要货与互调活跃，建议设为早班顺路共配串点，实现余缺当日顺路平账。`
          : hotspotStores.length === 1
          ? `【单点集配建议】「${hotspotStores[0][0]}」近期高频申报用度，建议优先安排直达补货并带动周边邻里拼单。`
          : '';

      bodyEl.innerHTML = `
        <!-- 模块一：品类与规格自生长 -->
        <div class="bg-[#27272a] border border-stone-700 rounded-2xl p-4 space-y-2.5">
          <div class="flex justify-between items-center">
            <b class="text-emerald-300 text-sm">🧬 一、品类与规格自生长（高频字段沉淀建议）</b>
            <span class="text-[10px] text-stone-400">已扫描 ${products.length} 款在架良品</span>
          </div>

          <div class="text-stone-300">
            <span class="text-stone-400">全网高频通用计量规格：</span>
            ${
              topUnits.length > 0
                ? topUnits
                    .map(
                      ([u, cnt]) =>
                        `<span class="inline-block bg-stone-800 border border-stone-600 px-2 py-0.5 rounded-lg mr-1.5 mb-1 font-mono text-amber-300">${u} (${cnt}款)</span>`
                    )
                    .join('')
                : '<span class="text-stone-500">暂无足够样本（请先确认已执行数据库只读权限放通）</span>'
            }
          </div>

          <div class="pt-1 border-t border-stone-700/70 space-y-2">
            <span class="text-stone-300 font-bold block">✨ 检测到未入公共字典的活跃行当/类目（点击可一键沉淀为公共标准模板）：</span>
            ${
              emergingCategories.length > 0
                ? emergingCategories
                    .map(
                      ([catName, count]) => `
                      <div class="flex justify-between items-center bg-stone-900/90 border border-emerald-500/30 px-3 py-2 rounded-xl">
                        <div>
                          <b class="text-white">${catName}</b>
                          <span class="text-[11px] text-emerald-400 ml-2">在架 ${count} 款货品</span>
                        </div>
                        <button type="button" onclick="window.adoptEmergingCategory('${catName.replace(/'/g, '')}')"
                          class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] active:scale-95 transition">
                          ➕ 采纳为公共标准类目
                        </button>
                      </div>
                    `
                    )
                    .join('')
                : '<div class="text-[11px] text-stone-400 bg-stone-900/60 p-2.5 rounded-xl">当前扫到的货品类目均已归入标准字典，暂无未归档新类目。</div>'
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
              routeSuggestionText
                ? `💡 <b>${routeSuggestionText}</b>`
                : '💡 门店在首页使用「报用度」或「余缺互调」后，此处将自动测算最优城乡共配串点路线并生成调度指令。'
            }
          </p>

          ${
            routeSuggestionText
              ? `<button type="button" onclick="navigator.clipboard?.writeText('${routeSuggestionText}'); alert('✅ 已复制共配调度建议，可直接发给送货师傅或区域负责人！')"
                  class="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-3 py-1.5 rounded-xl text-[11px] active:scale-95 transition">
                  📋 一键复制共配调度指令
                </button>`
              : ''
          }

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
    alert(`🎉 已将【${catName}】正式沉淀为全网公共标准类目模板！`);
    await window.openPlatformEvolutionModal();
  };
}
