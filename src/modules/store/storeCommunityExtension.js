import { supabase } from '../../lib/supabase.js';
import { storeState } from './storeState.js';

function getCurrentStoreMeta() {
  const storeName =
    storeState.currentStore?.name ||
    document.getElementById('store-title')?.innerText?.trim() ||
    '合作门店';
  const bossName =
    storeState.currentStore?.contact_name ||
    storeState.currentStore?.boss_name ||
    document.getElementById('store-boss')?.innerText?.trim() ||
    '掌柜';
  const agentTag =
    storeState.currentAgent ||
    localStorage.getItem('active_agent') ||
    document.getElementById('menu-current-agent-tag')?.innerText?.trim() ||
    '';
  return { storeName, bossName, agentTag };
}

export async function loadAndRenderCommunityTools() {
  const listEl = document.getElementById('community-tools-list');
  if (!listEl) return;

  const { agentTag } = getCurrentStoreMeta();
  try {
    let query = supabase
      .from('local_inventory_pool')
      .select('*')
      .in('status', ['open', 'claimed'])
      .order('id', { ascending: false })
      .limit(20);

    if (agentTag && agentTag !== '未接入') {
      query = query.eq('tenant_id', agentTag);
    }

    const { data } = await query;
    const toolItems = (data || []).filter(
      (x) => String(x.product_name || '').includes('[公器共享]') || String(x.product_name || '').includes('[物物置换]')
    );

    if (toolItems.length === 0) {
      listEl.innerHTML =
        '<div class="py-6 text-center text-stone-400">暂无在池邻里公器或物物置换单，可在上方发布本店闲置工具或置换意向。</div>';
      return;
    }

    listEl.innerHTML = toolItems
      .map(
        (item) => `
        <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
          <div class="flex justify-between items-start gap-2">
            <div>
              <b class="text-stone-900 text-xs">${item.product_name}</b>
              <span class="block text-[10px] text-stone-500 mt-0.5">发布驿站：<b>${item.from_store_name || '邻里小店'}</b></span>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${
              item.status === 'claimed' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
            }">
              ${item.status === 'claimed' ? '🤝 已预约互助' : '🌿 开放共享/置换'}
            </span>
          </div>
          ${
            item.status === 'open'
              ? `<div class="text-right pt-1">
                   <button type="button" onclick="window.claimCommunityToolItem(${item.id})" class="bg-[#1b4332] text-white font-bold px-3 py-1 rounded-xl text-[11px]">
                     🤝 预约借用 / 发起置换
                   </button>
                 </div>`
              : ''
          }
        </div>
      `
      )
      .join('');
  } catch (e) {}
}

export function initStoreCommunityExtension() {
  window.openCommunityHubModal = async function () {
    await loadAndRenderCommunityTools();
    document.getElementById('community-hub-modal')?.classList.remove('hidden');
  };

  window.submitCommunityToolOffer = async function (e) {
    e.preventDefault();
    const { storeName, agentTag } = getCurrentStoreMeta();
    const kind = document.getElementById('comm-offer-kind')?.value || '[公器共享]';
    const title = document.getElementById('comm-offer-title')?.value.trim();
    const note = document.getElementById('comm-offer-note')?.value.trim();

    if (!title) return alert('请填写共享工具名称或置换物品说明！');

    const { error } = await supabase.from('local_inventory_pool').insert([
      {
        tenant_id: agentTag && agentTag !== '未接入' ? agentTag : 'PUBLIC',
        from_store_name: storeName,
        product_name: `${kind} ${title}${note ? `（${note}）` : ''}`,
        qty: 1,
        measure_unit: '项',
        offer_price: 0,
        status: 'open'
      }
    ]);

    if (error) return alert('发布失败：' + error.message);

    document.getElementById('comm-offer-title').value = '';
    document.getElementById('comm-offer-note').value = '';
    alert('✅ 已发布至邻里驿站公器共享与物物置换池，街坊同行即可就近预约！');
    await loadAndRenderCommunityTools();
  };

  window.claimCommunityToolItem = async function (id) {
    const { storeName } = getCurrentStoreMeta();
    const { error } = await supabase
      .from('local_inventory_pool')
      .update({
        status: 'claimed',
        to_store_name: `已由【${storeName}】预约借用/置换`
      })
      .eq('id', id);

    if (error) return alert('预约失败：' + error.message);
    alert('🤝 预约成功！请直接联系对方掌柜或请随车送货师傅顺路捎带交接。');
    await loadAndRenderCommunityTools();
  };

  window.exportStoreLocalBackup = function () {
    const { storeName, bossName, agentTag } = getCurrentStoreMeta();
    const backupObj = {
      exportedAt: new Date().toISOString(),
      storeName,
      bossName,
      supplierTenantId: agentTag,
      myAgents: storeState.myAgents || [],
      localStorageSnapshot: { ...localStorage }
    };
    const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${storeName}_独立往来账本备份_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    alert('💾 本店独立往来账本与缓存记录已打包下载到本地！数据主权完全归您所有。');
  };
}
