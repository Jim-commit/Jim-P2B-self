/**
 * 百工百业 · 五端统一协同与跨端桥接引擎（海纳百川 · 大道至简 · 独立顶栏不遮挡 · 温和空态引导）
 * 覆盖：index.html (需方下单端) / driver.html (我在执行端) / mall.html / suppliers.html (逛大集)
 */
import { supabase } from '../../lib/supabase.js';
import { getTenantLexicon } from './silentMemoryAndLexicon.js';

function getUrlParams() {
  return new URLSearchParams(window.location.search);
}

function generateMobileVoucherNo(prefix = 'CK') {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${ymd}-${rnd}`;
}

function getSavedContactProfile() {
  try {
    return JSON.parse(localStorage.getItem('baigong_saved_contact_profile') || '{}');
  } catch {
    return {};
  }
}

function saveContactProfile(patch = {}) {
  try {
    const prev = getSavedContactProfile();
    const next = { ...prev };
    Object.keys(patch).forEach((k) => {
      if (patch[k] && String(patch[k]).trim()) next[k] = String(patch[k]).trim();
    });
    localStorage.setItem('baigong_saved_contact_profile', JSON.stringify(next));
  } catch {
    // 忽略隐私模式存储限制
  }
}

function showWeChatPinGuideIfFirstTime() {
  if (localStorage.getItem('baigong_wechat_pin_dismissed') === '1') return;
  if (document.getElementById('baigong-wechat-pin-tip')) return;
  const tip = document.createElement('div');
  tip.id = 'baigong-wechat-pin-tip';
  tip.className = 'fixed top-14 left-1/2 -translate-x-1/2 z-40 max-w-sm w-[92%] bg-stone-900/95 text-white px-3.5 py-2 rounded-2xl shadow-lg flex items-center justify-between gap-2 text-[11px] border border-stone-700';
  tip.innerHTML = `
    <span>💡 点微信右上角 <b>【···】→【浮窗】</b>，下次像微信一样一点就开</span>
    <button type="button" id="btn-close-wechat-pin-tip" class="text-amber-300 font-bold shrink-0 px-1.5">知道了</button>
  `;
  document.body.appendChild(tip);
  document.getElementById('btn-close-wechat-pin-tip')?.addEventListener('click', () => {
    localStorage.setItem('baigong_wechat_pin_dismissed', '1');
    tip.remove();
  });
}

/**
 * 全端通用顶部居中快捷身份切换栏（独立顶栏流式排版，绝不压盖店名招牌，也不遮挡底部提交按钮）
 */
function mountMobileQuickRoleSwitchDock(currentFile) {
  if (document.getElementById('baigong-mobile-role-dock')) return;
  const items = [
    { file: 'hq.html', icon: '🏠', label: '我是供方（接单）' },
    { file: 'index.html', icon: '🛒', label: '我是需方（下单）' },
    { file: 'driver.html', icon: '🚚', label: '我在执行（送货/上门）' },
    { file: 'mall.html', icon: '🛍️', label: '逛大集（找货/找人）' }
  ];
  const barWrap = document.createElement('div');
  barWrap.id = 'baigong-mobile-role-dock';
  barWrap.className = 'w-full bg-stone-100/95 border-b border-stone-200 py-1.5 px-2 flex justify-center z-30';
  barWrap.innerHTML = `
    <div class="max-w-full overflow-x-auto bg-white border border-stone-300 rounded-2xl shadow-2xs px-1.5 py-1 flex items-center gap-1 text-[11px]">
      ${items
        .map((it) => {
          const isActive = currentFile === it.file || (currentFile === 'suppliers.html' && it.file === 'mall.html');
          return `<a href="${it.file}" class="px-2.5 py-1 rounded-xl font-bold whitespace-nowrap transition ${
            isActive ? 'bg-[#1b4332] text-amber-300' : 'text-stone-700 hover:bg-stone-100'
          }">${it.icon} ${it.label}</a>`;
        })
        .join('')}
    </div>
  `;
  document.body.insertAdjacentElement('afterbegin', barWrap);
}

function openBridgeSheetModal({ id, title, subtitle, bodyHtml, confirmText, onConfirm }) {
  document.getElementById(id)?.remove();
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.className = 'fixed inset-0 bg-stone-950/70 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4';
  wrap.innerHTML = `
    <div class="bg-white border border-stone-200 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 space-y-3.5 shadow-2xl text-xs animate-fade-in">
      <div class="flex justify-between items-start border-b border-stone-100 pb-2.5">
        <div>
          <b class="text-base text-stone-900 block">${title}</b>
          ${subtitle ? `<span class="text-[11px] text-stone-500 mt-0.5 block">${subtitle}</span>` : ''}
        </div>
        <button type="button" id="${id}-close" class="w-7 h-7 rounded-full bg-stone-100 text-stone-500 hover:text-stone-900 font-bold flex items-center justify-center">✕</button>
      </div>
      <div class="space-y-3">${bodyHtml}</div>
      <div class="flex gap-2 pt-1">
        <button type="button" id="${id}-cancel" class="flex-1 py-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold">取消</button>
        <button type="button" id="${id}-submit" class="flex-2 py-2.5 px-5 rounded-2xl bg-[#1b4332] hover:bg-[#143628] text-amber-300 font-bold shadow">${confirmText || '确认提交'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  document.getElementById(`${id}-close`)?.addEventListener('click', close);
  document.getElementById(`${id}-cancel`)?.addEventListener('click', close);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) close();
  });
  document.getElementById(`${id}-submit`)?.addEventListener('click', async () => {
    await onConfirm(close);
  });
}

let storeBridgeWatcherStarted = false;
let lastRenderedStoreAgent = '';

/**
 * 1. 需方下单端 (index.html)
 */
export async function initStoreTerminalBridge() {
  showWeChatPinGuideIfFirstTime();
  mountMobileQuickRoleSwitchDock('index.html');
  const params = getUrlParams();
  const stickerAgent = (params.get('agent') || params.get('t') || '').trim();
  const stickerStoreId = (params.get('store_id') || '').trim();

  if (stickerAgent) {
    localStorage.setItem('active_agent_id', stickerAgent);
    localStorage.setItem('active_agent', stickerAgent);
  }
  if (stickerStoreId) {
    localStorage.setItem('sticker_bound_store_id', stickerStoreId);
  }

  async function renderCrowdBannerForActiveAgent(forceRefresh = false) {
    const activeAgent = (
      document.getElementById('menu-current-agent-tag')?.innerText ||
      localStorage.getItem('active_agent') ||
      localStorage.getItem('active_agent_id') ||
      stickerAgent
    ).trim();

    const container =
      document.getElementById('product-container') ||
      document.getElementById('product-list') ||
      document.getElementById('goods-list') ||
      document.getElementById('items-container');

    if (container && container.innerText?.includes('加载遇到波动')) {
      container.innerHTML = `
        <div class="py-8 px-4 text-center text-xs text-stone-500 space-y-2">
          <div class="text-2xl">🌱</div>
          <b class="text-stone-700 block">当前供货方暂未上架公开品项</b>
          <span class="block text-[11px]">您可以点击顶部切换其他供货方，或切到【我是供方】先上架第一件货品/服务</span>
        </div>
      `;
    }

    if (container && !document.getElementById('store-sticker-welcome-bar')) {
      document.querySelectorAll('div').forEach((el) => {
        if (el.innerText?.includes('字太小看不清？点此切换') && el.children.length <= 3) {
          el.style.display = 'none';
        }
      });

      const profile = getSavedContactProfile();
      const myIdentityHint = profile.storeName ? ` · ${profile.storeName}` : '';
      const topBar = document.createElement('div');
      topBar.id = 'store-sticker-welcome-bar';
      topBar.className = 'mb-2.5 bg-amber-50/90 border border-amber-300 text-amber-950 px-3 py-2 rounded-2xl flex items-center justify-between gap-2 text-xs';
      topBar.innerHTML = `
        <span class="font-bold truncate">${stickerStoreId ? `🏷️ 专属快捷码 #${stickerStoreId}` : `🛒 需方下单台${myIdentityHint}`}</span>
        <div class="flex items-center gap-1.5 shrink-0">
          <a href="hq.html" class="bg-white hover:bg-amber-100 border border-amber-300 text-amber-950 font-bold px-2.5 py-1 rounded-xl text-[11px]">
            🏠 切供方
          </a>
          <button type="button" onclick="window.repeatLastOrder?.()" class="bg-[#1b4332] text-white font-bold px-2.5 py-1 rounded-xl text-[11px]">
            ⚡ 照上次订
          </button>
        </div>
      `;
      container.parentNode?.insertBefore(topBar, container);
    }

    if (!activeAgent || activeAgent === '未接入') {
      document.getElementById('store-crowd-produce-box')?.remove();
      lastRenderedStoreAgent = '';
      return;
    }

    if (!forceRefresh && activeAgent === lastRenderedStoreAgent && document.getElementById('product-container')) {
      return;
    }
    lastRenderedStoreAgent = activeAgent;

    const [tenantRes, crowdRes] = await Promise.all([
      supabase
        .from('platform_tenant')
        .select('tenant_id, company_name, custom_settings')
        .eq('tenant_id', activeAgent)
        .maybeSingle(),
      supabase
        .from('platform_suggestion_board')
        .select('*')
        .eq('proposer_type', 'c2b_demand')
        .ilike('category', `%凑单开产 · ${activeAgent}%`)
        .order('id', { ascending: false })
        .limit(5)
    ]);

    const tenant = tenantRes?.data;
    if (tenant?.custom_settings) {
      const lex = getTenantLexicon(tenant.custom_settings);
      document.querySelectorAll('[data-lex]').forEach((el) => {
        const k = el.getAttribute('data-lex');
        if (k && lex[k]) el.textContent = lex[k];
      });
    }

    if (!container) return;
    document.getElementById('store-crowd-produce-box')?.remove();

    const crowdList = crowdRes?.data || [];
    if (crowdList.length > 0) {
      const crowdBox = document.createElement('div');
      crowdBox.id = 'store-crowd-produce-box';
      crowdBox.className = 'mb-3 bg-emerald-50/90 border border-emerald-300 p-3 rounded-2xl space-y-2 text-xs';
      crowdBox.innerHTML = `
        <div class="flex items-center justify-between">
          <b class="text-emerald-950">🌾 源头「凑单开产」预售接龙（凑满即开炉/发班直供）</b>
          <span class="text-[10px] bg-emerald-800 text-white px-2 py-0.5 rounded-full font-bold">零库存优价</span>
        </div>
        ${crowdList
          .map(
            (c) => `
            <div class="bg-white p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between gap-2">
              <span class="text-[11px] text-stone-800 leading-snug">${c.content}</span>
              <button type="button" onclick="window.claimCrowdProduceItem(${c.id}, '${String(c.content).replace(/'/g, '')}')" class="bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold px-2.5 py-1 rounded-xl text-[10px] shrink-0">
                🙋 我要认领
              </button>
            </div>`
          )
          .join('')}
      `;
      container.parentNode?.insertBefore(crowdBox, container);
    }

    window.claimCrowdProduceItem = function (noticeId, contentText) {
      const profile = getSavedContactProfile();
      const storeTitle = document.getElementById('store-title')?.innerText || profile.storeName || '合作需方';
      openBridgeSheetModal({
        id: 'modal-store-crowd-claim',
        title: '🌾 凑单开产 · 需方认领登记',
        subtitle: contentText,
        confirmText: '✅ 确认认领排产',
        bodyHtml: `
          <div>
            <label class="block font-bold text-stone-700 mb-1">认领方称呼：</label>
            <input type="text" id="sc-claim-store" value="${storeTitle}" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">认领数量（件/箱/斤/份）*：</label>
            <input type="number" min="1" id="sc-claim-qty" value="10" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-base font-mono font-bold text-emerald-950">
          </div>
        `,
        onConfirm: async (close) => {
          const sName = document.getElementById('sc-claim-store')?.value.trim() || storeTitle;
          const qty = parseInt(document.getElementById('sc-claim-qty')?.value || '0', 10);
          if (!qty || qty <= 0) return alert('请输入有效的认领数量！');

          saveContactProfile({ storeName: sName });
          const { error } = await supabase.from('platform_suggestion_board').insert([{
            proposer_type: 'c2b_demand',
            proposer_name: sName,
            category: `[凑单认领 · ${activeAgent}]`,
            content: `🙋【凑单认领】${sName} 认领 ${qty} 份（响应：${contentText.slice(0, 40)}...）`
          }]);
          if (error) return alert('认领提交失败：' + error.message);
          close();
          alert(`✅ 认领成功！已向源头供方登记【${sName}】认领 ${qty} 份，凑满开产后将优先为您配发！`);
        }
      });
    };
  }

  await renderCrowdBannerForActiveAgent(true);

  if (!storeBridgeWatcherStarted) {
    storeBridgeWatcherStarted = true;
    setInterval(() => {
      renderCrowdBannerForActiveAgent(false);
    }, 2000);
  }
}

/**
 * 2. 我在执行（送货/上门）移动一线工作台 (driver.html)
 */
const OFFLINE_QUEUE_KEY = 'baigong_palm_offline_queue';

function readPalmOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writePalmOfflineQueue(list) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(list));
}

export function initDriverTerminalBridge() {
  showWeChatPinGuideIfFirstTime();
  mountMobileQuickRoleSwitchDock('driver.html');
  const navHost = document.getElementById('palm-role-nav');
  if (!navHost || document.getElementById('palm-voice-quick-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'palm-voice-quick-bar';
  bar.className = 'mx-3 mt-2.5 bg-emerald-50/90 border border-emerald-200 p-2.5 rounded-2xl space-y-1.5 text-xs';
  bar.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-1">
      <b class="text-emerald-950 text-[11px]">🗣️ 一线现场记账（送货 / 上门服务 / 现场收款）：</b>
      <div class="flex flex-wrap items-center gap-1">
        <button type="button" id="btn-palm-sync-offline" onclick="window.flushPalmOfflineQueue()" class="hidden bg-amber-400 text-stone-950 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          📶 待补传 0 笔
        </button>
        <button type="button" onclick="window.openPalmPhotoEvidenceModal()" class="bg-white hover:bg-emerald-100 text-emerald-950 border border-emerald-300 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          📷 拍照留底
        </button>
        <button type="button" onclick="window.copyDriverDepartureNotice()" class="bg-white hover:bg-emerald-100 text-emerald-950 border border-emerald-300 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          🚚 出发预告
        </button>
        <button type="button" onclick="window.openPalmMapNavigation()" class="bg-white hover:bg-emerald-100 text-emerald-950 border border-emerald-300 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          🗺️ 地图导航
        </button>
        <a href="index.html" class="bg-white hover:bg-emerald-100 text-emerald-950 border border-emerald-300 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          🛒 切为需方
        </a>
        <button type="button" onclick="window.openPalmQuickWalkInModal()" class="bg-[#1b4332] text-white font-bold px-2.5 py-0.5 rounded-lg text-[10px]">
          ⚡ 现场开单
        </button>
      </div>
    </div>
    <div class="flex gap-1.5">
      <input type="text" id="palm-quick-note-input" placeholder="如：旺顺饭庄收现金800元 / 帮张大爷修好水泵收120元" class="flex-1 bg-white border border-emerald-200 rounded-xl px-2.5 py-1.5 text-[11px] outline-none">
      <button type="button" onclick="window.startVoiceInput?.('palm-quick-note-input')" class="bg-amber-100 text-amber-950 border border-amber-300 font-bold px-2.5 rounded-xl text-[11px] shrink-0">🎤</button>
      <button type="button" onclick="window.submitPalmQuickCommand()" class="bg-emerald-800 text-white font-bold px-3 rounded-xl text-[11px] shrink-0">记一笔</button>
    </div>
  `;
  navHost.insertAdjacentElement('beforebegin', bar);

  window.openPalmPhotoEvidenceModal = function () {
    openBridgeSheetModal({
      id: 'modal-palm-photo-evidence',
      title: '📷 交割 / 验收 / 器具随手拍照留底',
      subtitle: '自动压缩图片存入云端账本，口说无凭一拍即清',
      confirmText: '✅ 上传留底存证',
      bodyHtml: `
        <div>
          <label class="block font-bold text-stone-700 mb-1">关联客户或事项说明 *：</label>
          <input type="text" id="pe-note" placeholder="如：兴隆饭庄到货签收 / 水泵维修完工验收 / 收回空筐8个" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">点击调用相机拍照或选图 *：</label>
          <input type="file" id="pe-file-input" accept="image/*" capture="environment" class="w-full bg-stone-50 border border-stone-200 rounded-xl p-2 text-xs">
        </div>
      `,
      onConfirm: async (close) => {
        const noteText = document.getElementById('pe-note')?.value.trim();
        const file = document.getElementById('pe-file-input')?.files?.[0];
        if (!noteText) return alert('请填写关联客户或现场说明！');
        if (!file) return alert('请先拍一张现场照片！');

        const tenantId = (document.getElementById('tenant-display')?.innerText || localStorage.getItem('hq_active_agent') || '').trim();
        const operator = (document.getElementById('driver-name-display')?.innerText || '一线执事').trim();

        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const maxW = 640;
              const scale = Math.min(1, maxW / img.width);
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/jpeg', 0.65));
            };
            img.src = ev.target?.result;
          };
          reader.readAsDataURL(file);
        });

        const { error } = await supabase.from('driver_collection_log').insert([{
          tenant_id: tenantId,
          store_id: 0,
          store_name: `📷 现场留底 (${noteText.slice(0, 22)})`,
          driver_name: operator,
          collect_type: 'photo_evidence',
          amount: 0,
          discount_amount: 0,
          basket_return: 0,
          basket_deduct_amount: 0,
          pay_method: dataUrl,
          settled_to_hq: true
        }]);

        if (error) return alert('上传留底失败：' + error.message);
        close();
        alert('✅ 现场照片已压缩存入云端账本，随时可调阅核验！');
      }
    });
  };

  window.copyDriverDepartureNotice = function () {
    const operator = (document.getElementById('driver-name-display')?.innerText || '服务师傅').trim();
    const notice = `🚚【送货/上门出发预告】各位老板好，${operator}已出发前往沿线各点，预计 1 小时内陆续抵达，请提前留好接货或作业位置，到场前会提前电话联系！`;
    navigator.clipboard?.writeText(notice);
    alert(`✅ 出发预告已复制，可直接转发到客户微信或微信群！\n\n${notice}`);
  };

  window.openPalmMapNavigation = function () {
    openBridgeSheetModal({
      id: 'modal-palm-map-nav',
      title: '🗺️ 唤起手机地图一键导航',
      subtitle: '输入客户店名、村镇或街道，直接跳转地图规划路线',
      confirmText: '🧭 立即开始导航',
      bodyHtml: `
        <div>
          <label class="block font-bold text-stone-700 mb-1">目的地名称或地址 *：</label>
          <input type="text" id="palm-nav-dest" placeholder="如：城南兴隆饭庄 / 镇东李家村合作社" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
        </div>
      `,
      onConfirm: async (close) => {
        const dest = document.getElementById('palm-nav-dest')?.value.trim();
        if (!dest) return alert('请输入目的地名称或地址！');
        close();
        window.open(`https://uri.amap.com/search?keyword=${encodeURIComponent(dest)}`, '_blank');
      }
    });
  };

  function refreshOfflineBadge() {
    const q = readPalmOfflineQueue();
    const btn = document.getElementById('btn-palm-sync-offline');
    if (!btn) return;
    if (q.length > 0) {
      btn.innerText = `📶 待补传 ${q.length} 笔`;
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  }
  refreshOfflineBadge();

  window.flushPalmOfflineQueue = async function (silent = false) {
    const q = readPalmOfflineQueue();
    if (q.length === 0) return;
    if (!navigator.onLine) {
      if (!silent) alert('当前仍处于无信号状态，等有网络时再点此按钮即可自动补传。');
      return;
    }

    const remaining = [];
    let syncedCount = 0;
    for (const item of q) {
      const { error } = await supabase.from(item.table).insert([item.payload]);
      if (error) remaining.push(item);
      else syncedCount += 1;
    }
    writePalmOfflineQueue(remaining);
    refreshOfflineBadge();
    if (syncedCount > 0 && !silent) {
      alert(`✅ 信号已恢复！已自动将本地暂存的 ${syncedCount} 笔账目全部上传同步到云端！`);
      if (typeof window.loadDriverTasks === 'function') window.loadDriverTasks();
    }
  };

  window.addEventListener('online', () => {
    window.flushPalmOfflineQueue(false);
  });

  window.submitPalmQuickCommand = async function () {
    const inp = document.getElementById('palm-quick-note-input');
    const txt = inp?.value.trim() || '';
    if (!txt) return alert('请先输入或语音说出要记的内容！');

    const tenantId = (document.getElementById('tenant-display')?.innerText || localStorage.getItem('hq_active_agent') || '').trim();
    const operator = (document.getElementById('driver-name-display')?.innerText || '一线执事').trim();
    const amtMatch = txt.match(/(\d+(?:\.\d+)?)\s*(?:元|块|¥)?/);
    const amt = amtMatch ? parseFloat(amtMatch[1]) : 0;

    if (!confirm(`确认将以下记录写入商号账本？\n• 内容：${txt}\n• 识别金额：¥${amt.toFixed(2)}\n• 经手人：${operator}`)) return;

    const payload = {
      tenant_id: tenantId,
      store_id: 0,
      store_name: `一线随手记 (${txt.slice(0, 18)})`,
      driver_name: operator,
      collect_type: 'delivery_collect',
      amount: amt,
      discount_amount: 0,
      basket_return: 0,
      basket_deduct_amount: 0,
      pay_method: txt.includes('现金') ? '现金' : '随手记/扫码',
      settled_to_hq: false
    };

    const { error } = await supabase.from('driver_collection_log').insert([payload]);
    inp.value = '';
    if (error || !navigator.onLine) {
      const q = readPalmOfflineQueue();
      q.push({ table: 'driver_collection_log', payload, savedAt: Date.now() });
      writePalmOfflineQueue(q);
      refreshOfflineBadge();
      alert('📶 当前无网络信号，已先为您稳妥记在手机本地，恢复信号后自动上传云端！');
      return;
    }

    alert('✅ 已写入随车/一线账本，回库后财务可直接点清核对！');
    if (typeof window.loadDriverTasks === 'function') window.loadDriverTasks();
  };

  window.openPalmQuickWalkInModal = function () {
    openBridgeSheetModal({
      id: 'modal-palm-walkin-order',
      title: '⚡ 现场随手开单（卖货 / 上门服务通用）',
      subtitle: '无需建档，支持弱网本地暂存，现场成交一秒留痕入账',
      confirmText: '✅ 立即出凭单入账',
      bodyHtml: `
        <div>
          <label class="block font-bold text-stone-700 mb-1">需方称呼 *：</label>
          <input type="text" id="pw-buyer" value="现场散客" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">货品或服务明细 *：</label>
          <input type="text" id="pw-item" placeholder="如：菜籽油 2桶 / 农机耕地 3亩 / 上门检修" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">实收总金额 (元) *：</label>
          <input type="number" step="0.01" id="pw-amount" placeholder="0.00" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-base font-mono font-bold text-emerald-950">
        </div>
      `,
      onConfirm: async (close) => {
        const buyer = document.getElementById('pw-buyer')?.value.trim() || '现场散客';
        const itemDesc = document.getElementById('pw-item')?.value.trim();
        const totalAmt = parseFloat(document.getElementById('pw-amount')?.value || '0');
        if (!itemDesc) return alert('请填写货品或服务明细！');
        if (isNaN(totalAmt) || totalAmt < 0) return alert('请输入有效金额！');

        const tenantId = (document.getElementById('tenant-display')?.innerText || localStorage.getItem('hq_active_agent') || '').trim();
        const operator = (document.getElementById('driver-name-display')?.innerText || '一线执事').trim();
        const ckNo = generateMobileVoucherNo('CK');

        const payload = {
          order_no: ckNo,
          tenant_id: tenantId,
          store_id: 0,
          store_name: buyer,
          driver_name: operator,
          order_source: 'vendor_push',
          settlement_type: 'cash',
          settlement_note: `[一线现场随手单] ${itemDesc}`,
          items: [{ id: 0, name: itemDesc, spec: '现场直结', measure_unit: '项', price: totalAmt, qty: 1 }],
          items_return: [],
          items_exchange: [],
          total_amount: totalAmt,
          return_amount: 0,
          net_settle_amount: totalAmt,
          order_status: 'confirmed',
          delivery_status: 'delivered',
          note: `[一线现场随手单] ${itemDesc}`
        };

        const { error } = await supabase.from('store_order').insert([payload]);
        close();
        if (error || !navigator.onLine) {
          const q = readPalmOfflineQueue();
          q.push({ table: 'store_order', payload, savedAt: Date.now() });
          writePalmOfflineQueue(q);
          refreshOfflineBadge();
          alert(`📶 当前网络不通，凭单【${ckNo}】已先存进手机本地缓存，联网后自动补传！`);
          return;
        }

        alert(`✅ 现场随手单【${ckNo}】（¥${totalAmt.toFixed(2)}）已入账！`);
        if (typeof window.loadDriverTasks === 'function') window.loadDriverTasks();
      }
    });
  };
}

/**
 * 3. 逛大集 · 零售与邻里拼单端 (mall.html)
 */
export async function initMallTerminalBridge() {
  showWeChatPinGuideIfFirstTime();
  mountMobileQuickRoleSwitchDock('mall.html');
  const [crowdRes, claimRes, charityTenantsRes] = await Promise.all([
    supabase
      .from('platform_suggestion_board')
      .select('*')
      .eq('proposer_type', 'c2b_demand')
      .ilike('category', '%凑单开产%')
      .order('id', { ascending: false })
      .limit(6),
    supabase
      .from('platform_suggestion_board')
      .select('*')
      .eq('proposer_type', 'c2b_demand')
      .ilike('category', '%拼单认领%')
      .order('id', { ascending: false })
      .limit(40),
    supabase
      .from('platform_tenant')
      .select('tenant_id, company_name, custom_settings')
      .eq('is_active', true)
      .limit(50)
  ]);

  const crowdList = crowdRes?.data || [];
  const claimList = claimRes?.data || [];
  const charityTenants = (charityTenantsRes?.data || []).filter((t) => t.custom_settings?.charity_micro_light_enabled);

  const mainHost = document.querySelector('main') || document.body;
  if (crowdList.length > 0 && !document.getElementById('mall-crowd-produce-strip')) {
    const strip = document.createElement('section');
    strip.id = 'mall-crowd-produce-strip';
    strip.className = 'max-w-5xl mx-auto my-3 px-3';
    strip.innerHTML = `
      <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-2 text-xs">
        <div class="flex items-center justify-between">
          <b class="text-emerald-950 text-sm">🌾 源头「凑单开产」接龙（凑够即开炉/发班直供，比现货更优价）</b>
          <span class="text-[10px] text-emerald-800 font-bold">大家一起拼 · 零中间商</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${crowdList
            .map((c) => {
              const targetMatch = String(c.content || '').match(/凑够\s*(\d+)/);
              const targetNum = targetMatch ? parseInt(targetMatch[1], 10) : 100;
              const shortKey = String(c.content || '').slice(0, 18);
              const claimedSum = claimList
                .filter((cl) => String(cl.content || '').includes(shortKey))
                .reduce((acc, cl) => {
                  const m = String(cl.content || '').match(/认领\s*(\d+)/);
                  return acc + (m ? parseInt(m[1], 10) : 0);
                }, 0);
              const pct = Math.min(100, Math.round((claimedSum / Math.max(1, targetNum)) * 100));
              const leftNum = Math.max(0, targetNum - claimedSum);

              return `
              <div class="bg-white p-2.5 rounded-xl border border-emerald-200 space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <span class="text-[10px] font-bold text-emerald-800 block">${c.proposer_name || '源头直供商号'}</span>
                    <span class="text-[11px] text-stone-800">${c.content}</span>
                  </div>
                  <button type="button" onclick="window.mallJoinCrowdProduce('${String(c.category || '').replace(/'/g, '')}', '${String(c.content || '').replace(/'/g, '')}')" class="bg-[#1b4332] text-amber-300 font-bold px-2.5 py-1.5 rounded-xl text-[10px] shrink-0">
                    参与拼单
                  </button>
                </div>
                <div class="bg-stone-100 rounded-full h-2 overflow-hidden">
                  <div class="bg-emerald-600 h-full transition-all" style="width:${Math.max(8, pct)}%"></div>
                </div>
                <div class="text-[10px] text-emerald-900 font-bold flex justify-between">
                  <span>🚚 已凑 ${claimedSum} / ${targetNum}</span>
                  <span>${leftNum > 0 ? `再凑 ${leftNum} 立即发车/排产` : '🎉 已满额排产中'}</span>
                </div>
              </div>`;
            })
            .join('')}
        </div>
      </div>
    `;
    mainHost.insertAdjacentElement('afterbegin', strip);
  }

  if (charityTenants.length > 0 && !document.getElementById('mall-charity-footer-note')) {
    const footerNote = document.createElement('div');
    footerNote.id = 'mall-charity-footer-note';
    footerNote.className = 'max-w-5xl mx-auto my-4 px-3';
    footerNote.innerHTML = `
      <div class="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 text-center text-[11px] text-amber-950">
        🕯️ <b>「一单微光」邻里公益公示：</b>本街区 <b>${charityTenants.map((t) => t.company_name || t.tenant_id).join('、')}</b> 已承诺每成交一笔订单均向社区/村镇邻里驿站公益角捐出一份微光心意。
      </div>
    `;
    mainHost.insertAdjacentElement('beforeend', footerNote);
  }

  window.mallJoinCrowdProduce = function (catStr, contentStr) {
    const profile = getSavedContactProfile();
    const defaultContact = [profile.name, profile.phone].filter(Boolean).join(' ');
    openBridgeSheetModal({
      id: 'modal-mall-crowd-join',
      title: '🛒 源头「凑单开产」拼单登记',
      subtitle: contentStr,
      confirmText: '✅ 确认参与拼单',
      bodyHtml: `
        <div>
          <label class="block font-bold text-stone-700 mb-1">您的称呼及手机号（开产/发班通知用）*：</label>
          <input type="text" id="mc-buyer-info" value="${defaultContact}" placeholder="例如：李大姐 13800138000" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold">
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">拼单认领数量（件/份/亩）*：</label>
          <input type="number" min="1" id="mc-buyer-qty" value="2" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-base font-mono font-bold text-emerald-950">
        </div>
      `,
      onConfirm: async (close) => {
        const buyerName = document.getElementById('mc-buyer-info')?.value.trim();
        const qty = parseInt(document.getElementById('mc-buyer-qty')?.value || '0', 10);
        if (!buyerName) return alert('请填写您的称呼及手机号！');
        if (!qty || qty <= 0) return alert('请输入有效的拼单数量！');

        const phoneMatch = buyerName.match(/1[3-9]\d{9}/);
        const pureName = buyerName.replace(/1[3-9]\d{9}/, '').trim();
        saveContactProfile({ name: pureName, phone: phoneMatch ? phoneMatch[0] : '' });

        const { error } = await supabase.from('platform_suggestion_board').insert([{
          proposer_type: 'c2b_demand',
          proposer_name: buyerName,
          category: catStr.replace('凑单开产', '天街拼单认领'),
          content: `🛒【拼单认领】${buyerName} 认领 ${qty} 份（${contentStr.slice(0, 40)}...）`
        }]);
        if (error) return alert('拼单提交失败：' + error.message);
        close();
        alert('✅ 拼单认领成功！凑满后供方将第一时间与您联系交付。');
      }
    });
  };
}

/**
 * 4. 逛大集 · 百业双向供需合作名录 (suppliers.html)
 */
export async function initSuppliersTerminalBridge() {
  showWeChatPinGuideIfFirstTime();
  mountMobileQuickRoleSwitchDock('suppliers.html');
  const mainHost = document.querySelector('main') || document.body;
  if (!mainHost || document.getElementById('suppliers-two-way-board')) return;

  const { data: demands } = await supabase
    .from('platform_suggestion_board')
    .select('*')
    .eq('proposer_type', 'c2b_demand')
    .order('id', { ascending: false })
    .limit(8);

  const list = demands || [];
  const board = document.createElement('section');
  board.id = 'suppliers-two-way-board';
  board.className = 'max-w-5xl mx-auto my-3 px-3';
  board.innerHTML = `
    <div class="bg-white border border-stone-200 rounded-2xl p-4 space-y-2.5 text-xs shadow-2xs">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
        <div>
          <b class="text-sm text-stone-900">🔄 找好货 · 找人手 · 调余货 · 一起拼（百业双向供需榜）</b>
          <span class="text-[10px] text-stone-500 block">人人既可做供方接单，也可做需方发求购/找服务，实名信义商号直接对接</span>
        </div>
        <button type="button" onclick="window.publishTwoWayDemandPrompt()" class="bg-[#1b4332] hover:bg-[#143628] text-amber-300 font-bold px-3 py-1.5 rounded-xl text-[11px] shadow-2xs transition">
          📢 发布我的需求/服务意向
        </button>
      </div>
      ${
        list.length === 0
          ? `<p class="text-[11px] text-stone-400 py-2">暂无最新挂榜需求，点击右上角可免费发布您的采购、找人手或余货调剂意向。</p>`
          : `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${list
              .map(
                (d) => `
                <div class="bg-stone-50 border border-stone-200 rounded-xl p-2.5 space-y-1">
                  <div class="flex justify-between items-center text-[10px]">
                    <span class="font-bold text-emerald-900">${d.proposer_name || '实名商户'}</span>
                    <span class="text-stone-400">${String(d.created_at || '').slice(0, 10)}</span>
                  </div>
                  <p class="text-[11px] text-stone-800 leading-snug">${d.content}</p>
                </div>`
              )
              .join('')}</div>`
      }
    </div>
  `;
  mainHost.insertAdjacentElement('afterbegin', board);

  window.publishTwoWayDemandPrompt = function () {
    const profile = getSavedContactProfile();
    openBridgeSheetModal({
      id: 'modal-suppliers-twoway-demand',
      title: '📢 发布采购 / 找人手服务 / 余货调剂意向',
      subtitle: '免费挂榜 · 源头供方与手艺人直接联系，零中间抽佣',
      confirmText: '🚀 立即挂榜发布',
      bodyHtml: `
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold text-stone-700 mb-1">商号 / 个人称呼 *：</label>
            <input type="text" id="tw-who-name" value="${profile.storeName || profile.name || ''}" placeholder="如：厚德合作社 / 王师傅" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold outline-none focus:border-emerald-700">
          </div>
          <div>
            <label class="block font-bold text-stone-700 mb-1">联系电话 / 微信 *：</label>
            <input type="tel" id="tw-who-phone" value="${profile.phone || ''}" placeholder="11位手机号" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono outline-none focus:border-emerald-700">
          </div>
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">协作类型：</label>
          <select id="tw-demand-type" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold outline-none">
            <option value="源头寻货采购">🛒 寻找源头货源采购</option>
            <option value="找人手/专业服务">🛠️ 寻找农机 / 维修 / 劳务服务</option>
            <option value="余缺调剂互换">🔄 余货/闲置设备调剂与置换</option>
            <option value="顺路运力带货">🚚 顺路带货 / 物流共配协作</option>
            <option value="定制凑单开产">🌾 定制加工 / 凑单开产合作</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-stone-700 mb-1">具体需求或可提供资源描述 *：</label>
          <textarea id="tw-demand-desc" rows="3" placeholder="例如：需要2台收割机下周三到李家村作业约40亩；或长期采购纯压榨菜籽油..." class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-700"></textarea>
        </div>
      `,
      onConfirm: async (close) => {
        const whoName = document.getElementById('tw-who-name')?.value.trim();
        const whoPhone = document.getElementById('tw-who-phone')?.value.trim();
        const dType = document.getElementById('tw-demand-type')?.value || '双向供需';
        const need = document.getElementById('tw-demand-desc')?.value.trim();

        if (!whoName || !whoPhone) return alert('请填写您的称呼和联系电话！');
        if (!need) return alert('请写明您的需求或服务描述！');

        saveContactProfile({ storeName: whoName, phone: whoPhone });
        const proposerLabel = `${whoName} (${whoPhone})`;
        const { error } = await supabase.from('platform_suggestion_board').insert([{
          proposer_type: 'c2b_demand',
          proposer_name: proposerLabel,
          category: `[全网公域 · ${dType}]`,
          content: `📢【${dType}】${need}`
        }]);
        if (error) return alert('发布失败：' + error.message);
        close();
        alert('✅ 已成功挂榜，相关源头供方或服务人将主动与您对接！');
        window.location.reload();
      }
    });
  };
}
