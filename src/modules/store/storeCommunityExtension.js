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
  const contactPhone =
    storeState.currentStore?.phone ||
    storeState.currentStore?.contact_phone ||
    localStorage.getItem('store_comm_contact') ||
    '';
  const agentTag =
    storeState.currentAgent ||
    localStorage.getItem('active_agent') ||
    document.getElementById('menu-current-agent-tag')?.innerText?.trim() ||
    '';
  return { storeName, bossName, contactPhone, agentTag };
}

function parseContactFromProductName(rawName = '') {
  const match = String(rawName).match(/\[联络：([^\]]+)\]/);
  const contact = match ? match[1].trim() : '';
  const cleanTitle = String(rawName).replace(/\s*\[联络：[^\]]+\]/g, '').trim();
  return { cleanTitle, contact };
}

function ensureContactFieldInForm() {
  const form = document.getElementById('community-tool-form') || document.getElementById('comm-offer-note')?.closest('form');
  if (!form || document.getElementById('comm-offer-contact')) return;

  const { contactPhone } = getCurrentStoreMeta();
  const wrapper = document.createElement('div');
  wrapper.className = 'mt-1.5';
  wrapper.innerHTML = `
    <input type="text" id="comm-offer-contact" value="${contactPhone}" placeholder="本店联络电话或微信（预约后向对方亮出以便交接）" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-700 font-mono">
  `;

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    form.insertBefore(wrapper, submitBtn);
  } else {
    form.appendChild(wrapper);
  }
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
      .map((item) => {
        const { cleanTitle, contact } = parseContactFromProductName(item.product_name);
        const safeContact = contact.replace(/'/g, '');
        const phoneMatch = contact.match(/1[3-9]\d{9}/);
        const telHref = phoneMatch ? `tel:${phoneMatch[0]}` : '';

        return `
        <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
          <div class="flex justify-between items-start gap-2">
            <div>
              <b class="text-stone-900 text-xs">${cleanTitle}</b>
              <span class="block text-[10px] text-stone-500 mt-0.5">发布驿站：<b>${item.from_store_name || '邻里小店'}</b></span>
              ${
                item.status === 'claimed'
                  ? `<span class="block text-[10px] text-amber-800 mt-0.5">${item.to_store_name || '已预约互助'}</span>`
                  : ''
              }
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
              item.status === 'claimed' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
            }">
              ${item.status === 'claimed' ? '🤝 已预约互助' : '🌿 开放共享/置换'}
            </span>
          </div>

          ${
            item.status === 'claimed' && contact
              ? `<div class="bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl flex justify-between items-center text-[11px] text-emerald-950">
                   <span>📞 发布掌柜联络：<b>${contact}</b></span>
                   <div class="flex items-center gap-2">
                     ${telHref ? `<a href="${telHref}" class="bg-emerald-800 text-white px-2 py-0.5 rounded-lg font-bold text-[10px]">拨号</a>` : ''}
                     <button type="button" onclick="window.copyPeerContact('${safeContact}')" class="text-emerald-800 underline font-bold text-[10px]">复制</button>
                   </div>
                 </div>`
              : ''
          }

          ${
            item.status === 'open'
              ? `<div class="text-right pt-1">
                   <button type="button" onclick="window.claimCommunityToolItem(${item.id}, '${safeContact}', '${(item.from_store_name || '邻里小店').replace(/'/g, '')}')" class="bg-[#1b4332] text-white font-bold px-3 py-1 rounded-xl text-[11px] active:scale-95 transition">
                     🤝 预约借用 / 发起置换
                   </button>
                 </div>`
              : ''
          }
        </div>
      `;
      })
      .join('');
  } catch (e) {}
}

export function initStoreCommunityExtension() {
  window.copyPeerContact = function (txt) {
    if (!txt) return;
    navigator.clipboard?.writeText(txt).then(() => alert(`✅ 联络方式【${txt}】已复制，可直接联系对方掌柜交接！`));
  };

  window.openCommunityHubModal = async function () {
    ensureContactFieldInForm();
    await loadAndRenderCommunityTools();
    document.getElementById('community-hub-modal')?.classList.remove('hidden');
  };

  window.submitCommunityToolOffer = async function (e) {
    e.preventDefault();
    const { storeName, bossName, contactPhone, agentTag } = getCurrentStoreMeta();
    const kind = document.getElementById('comm-offer-kind')?.value || '[公器共享]';
    const title = document.getElementById('comm-offer-title')?.value.trim();
    const note = document.getElementById('comm-offer-note')?.value.trim();
    const contactInput = document.getElementById('comm-offer-contact')?.value.trim() || contactPhone;

    if (!title) return alert('请填写共享工具名称或置换物品说明！');
    if (!contactInput) return alert('请留下本店联络电话或微信号，方便邻里预约后直接联系交接！');

    localStorage.setItem('store_comm_contact', contactInput);

    const contactTag = ` [联络：${bossName} ${contactInput}]`;
    const { error } = await supabase.from('local_inventory_pool').insert([
      {
        tenant_id: agentTag && agentTag !== '未接入' ? agentTag : 'PUBLIC',
        from_store_name: storeName,
        product_name: `${kind} ${title}${note ? `（${note}）` : ''}${contactTag}`,
        qty: 1,
        measure_unit: '项',
        offer_price: 0,
        status: 'open'
      }
    ]);

    if (error) return alert('发布失败：' + error.message);

    document.getElementById('comm-offer-title').value = '';
    document.getElementById('comm-offer-note').value = '';
    alert('✅ 已发布至邻里驿站公器共享与物物置换池，街坊同行预约后即可获取您的联系方式顺畅交接！');
    await loadAndRenderCommunityTools();
  };

  window.claimCommunityToolItem = async function (id, publisherContact = '', publisherStore = '邻里小店') {
    const { storeName, bossName, contactPhone } = getCurrentStoreMeta();
    const myContact = prompt(
      `请确认或输入您的联络电话/微信，方便【${publisherStore}】掌柜与您对接：`,
      contactPhone || ''
    );
    if (myContact === null) return;
    if (myContact.trim()) localStorage.setItem('store_comm_contact', myContact.trim());

    const { error } = await supabase
      .from('local_inventory_pool')
      .update({
        status: 'claimed',
        to_store_name: `已由【${storeName} · ${bossName}${myContact.trim() ? ` ${myContact.trim()}` : ''}】预约互助`
      })
      .eq('id', id);

    if (error) return alert('预约失败：' + error.message);

    const contactHint = publisherContact
      ? `\n📞 对方掌柜联络方式：【${publisherContact}】`
      : '\n（可请随车送货师傅顺路捎带交接）';
    alert(`🤝 预约成功！${contactHint}`);
    await loadAndRenderCommunityTools();
  };

  window.exportStoreLocalBackup = async function () {
    const { storeName, bossName, agentTag } = getCurrentStoreMeta();

    let mutualLedger = [];
    try {
      const { data } = await supabase
        .from('local_inventory_pool')
        .select('id, created_at, from_store_name, to_store_name, product_name, qty, measure_unit, offer_price, status')
        .order('id', { ascending: false })
        .limit(100);
      mutualLedger = (data || []).filter(
        (r) =>
          String(r.from_store_name || '').includes(storeName) ||
          String(r.to_store_name || '').includes(storeName)
      );
    } catch (e) {}

    const backupObj = {
      exportedAt: new Date().toISOString(),
      storeName,
      bossName,
      supplierTenantId: agentTag,
      myAgents: storeState.myAgents || [],
      mutualAidAndSwapLedger: mutualLedger,
      localStorageSnapshot: { ...localStorage }
    };
    const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${storeName}_独立往来与邻里平账备份_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    alert(`💾 本店独立往来账本及 ${mutualLedger.length} 条邻里余缺互助流水已打包下载到本地！数据主权完全归您所有。`);
  };
}
