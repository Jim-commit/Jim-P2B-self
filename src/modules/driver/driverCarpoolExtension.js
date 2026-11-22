import { supabase } from '../../lib/supabase.js';

// 读取本商号或周边待顺路捎带接力的包裹单
export async function loadAndRenderCarpoolRelays() {
  const banner = document.getElementById('carpool-relay-banner');
  const countEl = document.getElementById('carpool-relay-count');
  const listEl = document.getElementById('carpool-relay-list');

  const tenantId =
    document.getElementById('tenant-display')?.innerText?.trim() ||
    sessionStorage.getItem('palm_tenant_id') ||
    localStorage.getItem('palm_bound_tenant') ||
    '';

  try {
    let query = supabase
      .from('local_inventory_pool')
      .select('*')
      .in('status', ['open', 'claimed'])
      .order('id', { ascending: false })
      .limit(30);

    if (tenantId && tenantId !== '--') {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;
    if (error || !data) return;

    if (banner && countEl) {
      if (data.length > 0) {
        countEl.innerText = data.length;
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    }

    if (listEl) {
      listEl.innerHTML =
        data.length === 0
          ? '<div class="py-8 text-center text-stone-400">当前沿途暂无待顺路捎带的余缺包裹。</div>'
          : data
              .map(
                (item) => `
              <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                <div class="flex justify-between items-start gap-2">
                  <div>
                    <b class="text-stone-900 text-xs">${item.product_name} × ${item.qty}${item.measure_unit || '件'}</b>
                    <span class="block text-[11px] text-stone-600 mt-0.5">
                      📤 发出门店：<b>${item.from_store_name || '源头/门店'}</b>
                    </span>
                    <span class="block text-[11px] text-emerald-900">
                      📥 接收门店：<b>${item.to_store_name || '待周边邻里认领'}</b>
                    </span>
                  </div>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    item.status === 'claimed' ? 'bg-amber-100 text-amber-900' : 'bg-cyan-100 text-cyan-900'
                  }">
                    ${item.status === 'claimed' ? '🚚 顺路捎带中' : '📦 待顺路接力'}
                  </span>
                </div>
                <div class="flex justify-end gap-2 pt-1 border-t border-stone-200/70">
                  ${
                    item.status === 'open'
                      ? `<button type="button" onclick="window.claimCarpoolRelayItem(${item.id})" class="bg-cyan-700 hover:bg-cyan-800 text-white font-bold px-3 py-1 rounded-xl text-[11px]">
                           🚚 我顺路接力带货
                         </button>`
                      : `<button type="button" onclick="window.completeCarpoolRelayItem(${item.id})" class="bg-[#1b4332] hover:bg-[#143628] text-white font-bold px-3 py-1 rounded-xl text-[11px]">
                           ✅ 已顺路送达交接
                         </button>`
                  }
                </div>
              </div>
            `
              )
              .join('');
    }
  } catch (e) {}
}

export function initDriverCarpoolBindings() {
  window.openCarpoolRelayModal = async function () {
    await loadAndRenderCarpoolRelays();
    document.getElementById('modal-carpool-relay')?.classList.remove('hidden');
  };

  window.claimCarpoolRelayItem = async function (poolId) {
    const driverName = document.getElementById('driver-name-display')?.innerText?.trim() || '顺路师傅';
    const { error } = await supabase
      .from('local_inventory_pool')
      .update({
        status: 'claimed',
        to_store_name: `已由【${driverName}】顺路接力承运`
      })
      .eq('id', poolId);

    if (error) return alert('接力登记失败：' + error.message);
    alert(`🚚 已登记由您顺路捎带，送达后点击「已顺路送达交接」即可完成闭环！`);
    await loadAndRenderCarpoolRelays();
  };

  window.completeCarpoolRelayItem = async function (poolId) {
    if (!confirm('确认该顺路捎带包裹已安全送达接收门店并点交清楚吗？')) return;
    const { error } = await supabase
      .from('local_inventory_pool')
      .update({ status: 'completed' })
      .eq('id', poolId);

    if (error) return alert('交接确认失败：' + error.message);
    alert('✅ 顺路捎带包裹已完成交割平账，感谢辛勤捎带！');
    await loadAndRenderCarpoolRelays();
  };

  // 页面加载后延迟探测一次顺路捎带单，并在每次点击刷新路线时同步刷新
  setTimeout(() => {
    loadAndRenderCarpoolRelays();
  }, 1500);
}
