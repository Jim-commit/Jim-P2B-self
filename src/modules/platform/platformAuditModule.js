import { supabase } from '../../lib/supabase.js';
import {
  platformState,
  DEFAULT_CATEGORY_SEED,
  scanProductCompliance
} from './platformState.js';

export function renderAuditProductList() {
  const container = document.getElementById('audit-product-list') || document.getElementById('platform-audit-list');
  if (!container) return;

  const flagged = [];
  const clean = [];
  platformState.allProductsForAudit.forEach((p) => {
    const hits = scanProductCompliance(p);
    if (hits.length > 0 || p.status === 'rectify_required' || p.status === 'inactive') {
      flagged.push({ prod: p, hits });
    } else {
      clean.push({ prod: p, hits: [] });
    }
  });

  const flaggedBadge = document.getElementById('audit-flagged-count');
  if (flaggedBadge) flaggedBadge.innerText = flagged.length;

  const list = platformState.currentAuditFilter === 'flagged' ? flagged : [...flagged, ...clean];

  if (list.length === 0) {
    container.innerHTML =
      '<div class="py-10 text-center text-stone-400 text-xs">🌿 商道清朗，全网在架货品均未检出绝对化慎用词。</div>';
    return;
  }

  container.innerHTML = list
    .map(({ prod, hits }) => {
      const tenant = platformState.allTenants.find((t) => t.tenant_id === prod.tenant_id);
      const tenantName = tenant ? tenant.company_name : prod.tenant_id;
      const isRectify = prod.status === 'rectify_required';
      const isInactive = prod.status === 'inactive';
      const rectifyNote = prod.custom_specs?.rectify_note || '';

      return `
        <div class="p-3.5 bg-white border ${
          isInactive ? 'border-rose-300 bg-rose-50/30' : hits.length > 0 || isRectify ? 'border-amber-300 bg-amber-50/40' : 'border-stone-200'
        } rounded-2xl flex flex-wrap justify-between items-center gap-3 text-xs shadow-2xs">
          <div class="space-y-1 flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="font-mono text-[10px] bg-stone-100 text-stone-700 border border-stone-200 px-2 py-0.2 rounded-lg font-bold">${tenantName} (${prod.tenant_id})</span>
              <b class="text-stone-900">${prod.name}</b>
              ${
                isInactive
                  ? '<span class="bg-rose-600 text-white px-2 py-0.2 rounded-full text-[10px] font-bold">🚫 已下架停售</span>'
                  : hits.length > 0
                  ? `<span class="bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.2 rounded-full text-[10px] font-bold">⚠️ 检出慎用词: ${hits.join('、')}</span>`
                  : isRectify
                  ? '<span class="bg-amber-200 text-amber-950 px-2 py-0.2 rounded-full text-[10px] font-bold">📜 已发礼貌润色提示</span>'
                  : '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.2 rounded-full text-[10px] font-bold">✅ 词风质朴合规</span>'
              }
            </div>
            <div class="text-[11px] text-stone-500 truncate">
              类目: ${prod.category_main || '常规'} ➔ ${prod.category_sub || '通用'} · 规格: ${prod.spec || '整装'} · 基准价: ¥${prod.tier_1_price}
            </div>
            <div class="text-[11px] text-stone-600 line-clamp-1">
              简介: ${prod.custom_specs?.summary || prod.description || '无对外说明'}
            </div>
            ${rectifyNote ? `<div class="text-[10px] text-amber-950 bg-amber-100/70 px-2 py-0.5 rounded-lg inline-block font-bold">💬 平台润色叮咛：${rectifyNote}</div>` : ''}
          </div>
          <div class="flex flex-wrap items-center gap-1.5 shrink-0">
            <button type="button" onclick="window.sendPoliteRectifyPrompt(${prod.id}, '${hits.join('、')}')" class="bg-amber-400 hover:bg-amber-500 text-stone-950 px-3 py-1.5 rounded-xl font-bold text-[11px] shadow-2xs">
              📜 礼貌润色提示
            </button>
            ${
              isRectify || isInactive
                ? `<button type="button" onclick="window.restoreProductActive(${prod.id})" class="bg-emerald-800 hover:bg-emerald-900 text-white px-2.5 py-1.5 rounded-xl font-bold text-[11px]">✓ 核验恢复</button>`
                : `<button type="button" onclick="window.forceOfflineProduct(${prod.id}, '${prod.name.replace(/'/g, '')}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-1.5 rounded-xl font-bold text-[11px]">🚫 暂下架</button>`
            }
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderCategoryTree() {
  const container = document.getElementById('category-tree') || document.getElementById('platform-category-tree');
  if (!container) return;

  const l1List = platformState.allCategories.filter((c) => c.level === 1);
  if (l1List.length === 0) {
    container.innerHTML = `
      <div class="py-8 text-center space-y-3 bg-stone-50 rounded-2xl border border-stone-200 p-4">
        <div class="text-stone-500 text-xs">当前尚未建立平台统一标准类目树</div>
        <button type="button" onclick="window.seedDefaultPlatformCategories()" class="bg-[#1b4332] text-white text-xs font-bold px-4 py-2 rounded-xl shadow">
          🌾 一键初始化六大民生百工标准类目树
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = l1List
    .map((l1) => {
      const subs = platformState.allCategories.filter((c) => c.level === 2 && Number(c.parent_id) === Number(l1.id));
      return `
        <div class="p-3.5 bg-white border border-stone-200 rounded-2xl space-y-2.5 text-xs shadow-2xs">
          <div class="flex flex-wrap justify-between items-center gap-2">
            <div class="flex items-center gap-2">
              <span class="bg-[#1b4332] text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-lg">一级大类</span>
              <b class="text-stone-900 text-sm">${l1.name}</b>
              <span class="text-[10px] font-mono text-stone-400">(${subs.length} 个子类)</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="window.promptAddSubCategory(${l1.id}, '${l1.name}')" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-xl font-bold text-[11px]">
                + 添二级子类
              </button>
              <button type="button" onclick="window.renamePlatformCategory(${l1.id}, '${l1.name}')" class="bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-1 rounded-xl font-bold text-[11px]">
                改名
              </button>
              <button type="button" onclick="window.deletePlatformCategory(${l1.id}, '${l1.name}')" class="text-rose-600 hover:underline text-[11px] font-bold px-1.5">
                删除
              </button>
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5 pl-2.5 border-l-2 border-emerald-200">
            ${
              subs.length === 0
                ? '<span class="text-[11px] text-stone-400">暂无二级子类，点击右上角添加</span>'
                : subs
                    .map(
                      (s) => `
                      <span class="inline-flex items-center gap-1.5 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-xl text-[11px] text-stone-800 font-bold">
                        <span class="cursor-pointer hover:text-emerald-800" onclick="window.renamePlatformCategory(${s.id}, '${s.name}')" title="点击修改名称">${s.name}</span>
                        <button type="button" onclick="window.deletePlatformCategory(${s.id}, '${s.name}')" class="text-stone-400 hover:text-rose-600 ml-0.5">✕</button>
                      </span>
                    `
                    )
                    .join('')
            }
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderSuggestionList() {
  const container = document.getElementById('suggestion-list') || document.getElementById('platform-suggestion-list');
  if (!container) return;

  let list = platformState.allSuggestions.filter(
    (s) => s.proposer_type === 'merchant_hq' || s.proposer_type === 'platform_feedback' || !s.proposer_type
  );

  if (platformState.currentSuggestionFilter === 'pending') {
    list = list.filter((s) => !s.official_reply);
  } else if (platformState.currentSuggestionFilter === 'replied') {
    list = list.filter((s) => !!s.official_reply);
  }

  if (list.length === 0) {
    container.innerHTML = '<div class="py-8 text-center text-stone-400 text-xs">当前筛选项下暂无商号掌柜建言与自省来信。</div>';
    return;
  }

  container.innerHTML = list
    .map((s) => {
      const hasReply = !!s.official_reply;
      return `
        <div class="p-3.5 bg-white border ${hasReply ? 'border-stone-200' : 'border-amber-300 bg-amber-50/30'} rounded-2xl space-y-2 text-xs shadow-2xs">
          <div class="flex justify-between items-center">
            <div>
              <b class="text-stone-900">${s.proposer_name || '在册合作商号'}</b>
              <span class="text-[10px] text-stone-400 font-mono ml-2">${new Date(s.created_at).toLocaleString()}</span>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
              hasReply ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200 text-amber-950'
            }">${hasReply ? '✅ 执事已批复' : '⏳ 待总控批复'}</span>
          </div>
          <p class="text-stone-800 leading-relaxed bg-stone-50 p-2.5 rounded-xl border border-stone-100">${s.content}</p>
          ${
            hasReply
              ? `<div class="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-emerald-950 text-[11px]"><b>🏛️ 平准执事批复：</b>${s.official_reply}</div>`
              : ''
          }
          <div class="text-right">
            <button type="button" onclick="window.replyToMerchantSuggestion(${s.id})" class="bg-[#1b4332] hover:bg-[#143628] text-white px-3 py-1 rounded-xl font-bold text-[11px]">
              ${hasReply ? '✏️ 修改批复' : '✍️ 批复回信'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

export function initAuditBindings() {
  window.filterAuditProducts = function (filterType) {
    platformState.currentAuditFilter = filterType;
    document.querySelectorAll('.audit-filter-btn').forEach((btn) => {
      const active = btn.dataset.afilter === filterType;
      btn.className = active
        ? 'audit-filter-btn px-3 py-1.5 rounded-xl bg-[#1b4332] text-white text-xs font-bold transition'
        : 'audit-filter-btn px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 text-xs font-bold transition';
    });
    renderAuditProductList();
  };

  window.filterSuggestions = function (filterType) {
    platformState.currentSuggestionFilter = filterType;
    renderSuggestionList();
  };

  window.sendPoliteRectifyPrompt = async function (prodId, hitWordsStr) {
    const prod = platformState.allProductsForAudit.find((x) => Number(x.id) === Number(prodId));
    if (!prod) return;

    const defaultTip = hitWordsStr
      ? `商号掌柜您好，您上架的【${prod.name}】中包含广告法慎用词汇（${hitWordsStr}），烦请替换为质朴平实的产地与工艺描述后重新发布，感谢共同守护清朗商道！`
      : `商号掌柜您好，烦请进一步完善【${prod.name}】的产地溯源与规格说明，让合作门店与街坊买得更放心。`;

    const note = prompt('请输入发往该商号调度台的礼貌润色提示语：', defaultTip);
    if (!note || !note.trim()) return;

    const nextSpecs = { ...(prod.custom_specs || {}), rectify_note: note.trim() };
    const { error } = await supabase
      .from('product')
      .update({ status: 'rectify_required', custom_specs: nextSpecs })
      .eq('id', prodId);

    if (error) return alert('发送润色提示失败：' + error.message);

    alert('📜 已发送礼貌润色提示！该商号登录调度台后将第一时间收到提示并自主修改重上。');
    window.loadPlatformDashboard();
  };

  window.forceOfflineProduct = async function (prodId, prodName) {
    const reason = prompt(`确认将违规货品【${prodName}】强制下架停售？请输入下架原因：`, '含违规夸大宣传或资质不符，请修改合规后再上架');
    if (!reason || !reason.trim()) return;

    const prod = platformState.allProductsForAudit.find((x) => Number(x.id) === Number(prodId));
    const nextSpecs = { ...(prod?.custom_specs || {}), rectify_note: `[总控下架] ${reason.trim()}` };
    const { error } = await supabase
      .from('product')
      .update({ status: 'inactive', custom_specs: nextSpecs })
      .eq('id', prodId);

    if (error) return alert('下架操作失败：' + error.message);
    alert(`🚫 货品【${prodName}】已下架停售。`);
    window.loadPlatformDashboard();
  };

  window.restoreProductActive = async function (prodId) {
    const prod = platformState.allProductsForAudit.find((x) => Number(x.id) === Number(prodId));
    if (!prod) return;
    const nextSpecs = { ...(prod.custom_specs || {}) };
    delete nextSpecs.rectify_note;

    const { error } = await supabase
      .from('product')
      .update({ status: 'active', custom_specs: nextSpecs })
      .eq('id', prodId);

    if (error) return alert('恢复上架失败：' + error.message);
    alert('✅ 已核验通过并恢复该货品正常在架状态！');
    window.loadPlatformDashboard();
  };

  window.seedDefaultPlatformCategories = async function () {
    if (!confirm('确认一键初始化六大民生百工标准一级与二级类目树？')) return;
    for (const group of DEFAULT_CATEGORY_SEED) {
      const { data: l1Data, error } = await supabase
        .from('platform_category')
        .insert([{ name: group.name, level: 1, parent_id: null, is_active: true }])
        .select('id')
        .single();
      if (!error && l1Data?.id && Array.isArray(group.subs)) {
        const subRows = group.subs.map((subName) => ({
          name: subName,
          level: 2,
          parent_id: l1Data.id,
          is_active: true
        }));
        await supabase.from('platform_category').insert(subRows);
      }
    }
    alert('🎉 六大民生百工标准类目树已初始化完成！');
    window.loadPlatformDashboard();
  };

  window.promptAddMainCategory = async function () {
    const name = prompt('输入平台标准一级大类名称（如：粮油副食 / 生鲜果蔬 / 五金建材 / 农资农具）：');
    if (!name || !name.trim()) return;
    const { error } = await supabase.from('platform_category').insert([{ name: name.trim(), level: 1, parent_id: null, is_active: true }]);
    if (error) return alert('新增一级类目失败：' + error.message);
    window.loadPlatformDashboard();
  };

  window.promptAddSubCategory = async function (parentId, parentName) {
    const name = prompt(`在【${parentName}】下新增二级子类名称：`);
    if (!name || !name.trim()) return;
    const { error } = await supabase.from('platform_category').insert([{ name: name.trim(), level: 2, parent_id: parentId, is_active: true }]);
    if (error) return alert('新增二级类目失败：' + error.message);
    window.loadPlatformDashboard();
  };

  window.renamePlatformCategory = async function (catId, oldName) {
    const newName = prompt(`修改标准类目名称（原名：${oldName}）：`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const { error } = await supabase.from('platform_category').update({ name: newName.trim() }).eq('id', catId);
    if (error) return alert('修改名称失败：' + error.message);
    window.loadPlatformDashboard();
  };

  window.deletePlatformCategory = async function (catId, catName) {
    if (!confirm(`确认删除标准类目【${catName}】？`)) return;
    const { error } = await supabase.from('platform_category').delete().eq('id', catId);
    if (error) return alert('删除失败：' + error.message);
    window.loadPlatformDashboard();
  };

  window.replyToMerchantSuggestion = async function (suggestionId) {
    const reply = prompt('输入平准执事批复意见：', '感谢掌柜诚恳建言！已纳入平台迭代优化日程，携手共建清朗供需生态。');
    if (!reply || !reply.trim()) return;
    const { error } = await supabase
      .from('platform_suggestion_board')
      .update({ official_reply: reply.trim(), reply_status: 'replied' })
      .eq('id', suggestionId);
    if (error) return alert('批复失败：' + error.message);
    alert('✅ 批复回信已发布！');
    window.loadPlatformDashboard();
  };
}
