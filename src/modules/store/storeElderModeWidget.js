import { supabase } from '../../lib/supabase.js';
import { storeState } from './storeState.js';

const OFFLINE_QUEUE_KEY = 'baigong_offline_demand_queue_v1';
const LAST_DEMAND_KEY = 'baigong_last_elder_demand_v1';

let revokeWindowMinutes = 5; // 默认兜底值，初始化时从 platform_gov_configs 动态覆盖
let countdownTimer = null;

function getStoreContext() {
  const storeName =
    storeState.currentStore?.name ||
    document.getElementById('store-title')?.innerText?.trim() ||
    '合作门店';
  const agentTag =
    storeState.currentAgent ||
    localStorage.getItem('active_agent') ||
    document.getElementById('menu-current-agent-tag')?.innerText?.trim() ||
    'PUBLIC';
  const storeId = storeState.currentStore?.id || null;
  return { storeName, agentTag, storeId };
}

async function loadDynamicRevokeWindow() {
  try {
    const { data } = await supabase
      .from('platform_gov_configs')
      .select('config_value')
      .eq('config_key', 'order_revoke_window_minutes')
      .maybeSingle();
    if (data && data.config_value !== undefined && data.config_value !== null) {
      const parsed = Number(data.config_value);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        revokeWindowMinutes = parsed;
      }
    }
  } catch {
    // 弱网或离线时保留默认 5 分钟
  }
}

function speakElderNotice(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 0.92;
    window.speechSynthesis.speak(utter);
  } catch {
    // 忽略不支持语音合成的旧设备
  }
}

async function flushOfflineDemandQueue() {
  let queue = [];
  try {
    queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    queue = [];
  }
  if (!Array.isArray(queue) || queue.length === 0 || !navigator.onLine) return;

  const remaining = [];
  let syncedCount = 0;
  for (const item of queue) {
    try {
      const { error } = await supabase.from('demand_forecast_plan').insert([item.payload]);
      if (error) {
        remaining.push(item);
      } else {
        syncedCount++;
      }
    } catch {
      remaining.push(item);
    }
  }
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  if (syncedCount > 0) {
    speakElderNotice(`百工天街提醒您，刚才离线暂存的${syncedCount}笔要货单已自动发送给供货产区。`);
    if (typeof window.loadElderRecentPlans === 'function') {
      await window.loadElderRecentPlans();
    }
  }
}

function mountBannerInsideMainCard() {
  if (document.getElementById('btn-enter-elder-mode')) return;

  const bannerHtml = `
    <div class="px-3 pt-2">
      <button type="button" id="btn-enter-elder-mode" onclick="window.toggleElderMode(true)"
        class="w-full bg-amber-100 hover:bg-amber-200 border border-amber-400 text-amber-950 font-bold text-xs px-3.5 py-2 rounded-2xl flex items-center justify-between shadow-xs active:scale-98 transition">
        <span class="flex items-center gap-1.5">
          <span class="text-base">👵</span>
          <span>字太小看不清？点此切换【极简大字版 · 3键直达】</span>
        </span>
        <span class="bg-amber-500 text-stone-950 px-2 py-0.5 rounded-lg text-[11px] font-extrabold shrink-0">切换 ➔</span>
      </button>
    </div>
  `;

  const mainContainer = document.querySelector('#app, main, .max-w-md, .max-w-lg') || document.body;
  const headerEl = mainContainer.querySelector('header') || mainContainer.firstElementChild;
  if (headerEl && headerEl.parentNode) {
    headerEl.insertAdjacentHTML('afterend', bannerHtml);
  } else {
    mainContainer.insertAdjacentHTML('afterbegin', bannerHtml);
  }
}

export function mountStoreElderModeWidget() {
  if (document.getElementById('elder-mode-overlay')) return;

  mountBannerInsideMainCard();
  loadDynamicRevokeWindow();
  flushOfflineDemandQueue();
  window.addEventListener('online', flushOfflineDemandQueue);

  const overlayHtml = `
    <div id="elder-mode-overlay" class="hidden fixed inset-0 z-50 bg-[#f7f5f0] text-stone-900 overflow-y-auto pb-12">
      <div class="max-w-md mx-auto p-4 space-y-4">
        
        <!-- 顶部吸顶大字报头与切换 -->
        <div class="sticky top-2 z-20 bg-[#1b4332] text-white p-4 rounded-3xl shadow-lg flex justify-between items-center gap-2">
          <div>
            <span class="text-xs text-emerald-200 block">百工天街 · 极简适老版</span>
            <h2 id="elder-store-title" class="text-xl font-bold tracking-wide mt-0.5">合作门店</h2>
          </div>
          <button type="button" onclick="window.toggleElderMode(false)"
            class="bg-white text-stone-950 font-bold text-sm px-3.5 py-2.5 rounded-2xl shadow active:scale-95 shrink-0">
            📊 完整账台
          </button>
        </div>

        <!-- 三大核心动作大按钮 -->
        <div class="grid grid-cols-1 gap-3.5">
          
          <!-- 动作 1：报用度（支持语音口信与照搬昨日单） -->
          <button type="button" onclick="window.openElderActionCard('demand')"
            class="w-full bg-amber-400 hover:bg-amber-300 text-stone-950 p-5 rounded-3xl shadow-md border-2 border-amber-500 flex items-center justify-between text-left active:scale-98 transition">
            <div class="space-y-1">
              <div class="text-2xl font-extrabold flex items-center gap-2">
                <span>📝</span> 1. 报用度（喊话要货）
              </div>
              <p class="text-sm font-bold text-stone-800">按住说话、打字或照搬昨日要货单</p>
            </div>
            <span class="text-3xl font-bold">➔</span>
          </button>

          <!-- 动作 2：点收货（核验签收与语音播报） -->
          <button type="button" onclick="window.openElderActionCard('receive')"
            class="w-full bg-[#1b4332] hover:bg-[#143628] text-white p-5 rounded-3xl shadow-md border-2 border-emerald-900 flex items-center justify-between text-left active:scale-98 transition">
            <div class="space-y-1">
              <div class="text-2xl font-extrabold flex items-center gap-2">
                <span>📦</span> 2. 点收货（到货签收）
              </div>
              <p class="text-sm font-bold text-emerald-200">查看在途货品与街坊自提码，点一下签收</p>
            </div>
            <span class="text-3xl font-bold text-amber-300">➔</span>
          </button>

          <!-- 动作 3：转余缺（同城调货/借工具） -->
          <button type="button" onclick="window.openElderActionCard('swap')"
            class="w-full bg-white hover:bg-emerald-50 text-stone-900 p-5 rounded-3xl shadow-md border-2 border-emerald-700 flex items-center justify-between text-left active:scale-98 transition">
            <div class="space-y-1">
              <div class="text-2xl font-extrabold text-emerald-950 flex items-center gap-2">
                <span>🔄</span> 3. 转余缺（邻里互调）
              </div>
              <p class="text-sm font-bold text-stone-600">多出的菜/货转给隔壁店，或借用闲置工具</p>
            </div>
            <span class="text-3xl font-bold text-emerald-800">➔</span>
          </button>

        </div>

        <!-- 子面板 A：语音/大字报用度 + 照搬昨日单 + 限时防误触撤回 -->
        <div id="elder-panel-demand" class="hidden bg-white border-2 border-amber-400 rounded-3xl p-5 space-y-3.5 shadow-lg">
          <div class="flex justify-between items-center border-b border-stone-200 pb-2">
            <b class="text-lg text-stone-900">📝 说出或写出您要的货</b>
            <button type="button" onclick="window.closeElderSubPanels()" class="text-stone-400 text-2xl font-bold">✕</button>
          </div>

          <div class="grid grid-cols-1 gap-2">
            <button type="button" id="btn-elder-voice" onclick="window.startElderVoiceInput()"
              class="w-full py-3.5 bg-amber-100 hover:bg-amber-200 border-2 border-amber-400 text-amber-950 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 active:scale-95 transition">
              <span>🎙️</span> 点这里开始说话（自动变文字）
            </button>

            <button type="button" onclick="window.copyLastElderDemand()"
              class="w-full py-2.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-800 rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition">
              <span>📋</span> 照搬上一笔要货单（改改数量就能发）
            </button>
          </div>

          <textarea id="elder-demand-text" rows="3" placeholder="例如：明天早上送5箱土鸡蛋、2袋五常大米，送到店门口。"
            class="w-full bg-stone-50 border-2 border-stone-300 rounded-2xl p-3.5 text-lg font-bold text-stone-900 outline-none focus:border-emerald-700"></textarea>

          <button type="button" id="btn-elder-submit-demand" onclick="window.submitElderDemandPlan()"
            class="w-full py-4 bg-[#1b4332] text-white font-extrabold text-lg rounded-2xl shadow-md active:scale-95 transition">
            ✅ 确认发给供货产区
          </button>

          <!-- 最近已发报单与零写死时间窗口防误触撤回区 -->
          <div class="pt-3 border-t border-stone-200 space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-stone-500">🕒 最近已发要货单（发错可限时撤回）</span>
              <span id="elder-revoke-policy-tag" class="text-[11px] font-mono text-emerald-800 font-bold"></span>
            </div>
            <div id="elder-recent-plans-list" class="space-y-2 text-sm"></div>
          </div>
        </div>

        <!-- 子面板 B：大字点收货 -->
        <div id="elder-panel-receive" class="hidden bg-white border-2 border-emerald-700 rounded-3xl p-5 space-y-3.5 shadow-lg">
          <div class="flex justify-between items-center border-b border-stone-200 pb-2">
            <b class="text-lg text-emerald-950">📦 待收货与待自提单据</b>
            <button type="button" onclick="window.closeElderSubPanels()" class="text-stone-400 text-2xl font-bold">✕</button>
          </div>
          <div id="elder-orders-list" class="space-y-3 text-base">
            <div class="py-6 text-center text-stone-400">正在查询本店待收货单据...</div>
          </div>
        </div>

        <!-- 底部主权带走与切回完整账台 -->
        <div class="grid grid-cols-1 gap-2.5 pt-1">
          <button type="button" onclick="window.exportStoreLedgerBackup()"
            class="w-full py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-950 font-bold text-sm rounded-2xl active:scale-95 transition">
            📦 一键打包带走本店全部账本档案（CSV）
          </button>
          <button type="button" onclick="window.toggleElderMode(false)"
            class="w-full py-3.5 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold text-base rounded-2xl active:scale-95 transition">
            📊 返回完整掌柜账台
          </button>
        </div>

      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', overlayHtml);

  window.toggleElderMode = async function (enable) {
    const overlay = document.getElementById('elder-mode-overlay');
    if (!overlay) return;
    if (enable) {
      await loadDynamicRevokeWindow();
      const { storeName } = getStoreContext();
      const titleEl = document.getElementById('elder-store-title');
      if (titleEl) titleEl.innerText = storeName;
      localStorage.setItem('prefer_elder_mode', '1');
      overlay.classList.remove('hidden');
      await window.openElderActionCard('demand');
    } else {
      localStorage.removeItem('prefer_elder_mode');
      overlay.classList.add('hidden');
      if (countdownTimer) clearInterval(countdownTimer);
    }
  };

  window.closeElderSubPanels = function () {
    document.getElementById('elder-panel-demand')?.classList.add('hidden');
    document.getElementById('elder-panel-receive')?.classList.add('hidden');
  };

  window.openElderActionCard = async function (action) {
    window.closeElderSubPanels();
    if (action === 'demand') {
      document.getElementById('elder-panel-demand')?.classList.remove('hidden');
      await window.loadElderRecentPlans();
    } else if (action === 'receive') {
      document.getElementById('elder-panel-receive')?.classList.remove('hidden');
      await window.loadElderPendingOrders();
    } else if (action === 'swap') {
      window.toggleElderMode(false);
      if (typeof window.openCommunityHubModal === 'function') {
        window.openCommunityHubModal();
      } else {
        alert('请点击页面中的「余缺互调 / 邻里互助」按钮发布或认领周边货品。');
      }
    }
  };

  window.copyLastElderDemand = function () {
    const textarea = document.getElementById('elder-demand-text');
    const saved = localStorage.getItem(LAST_DEMAND_KEY) || '';
    if (!saved) {
      alert('本店还没有历史要货记录，请先说一遍或输入今天的要货单，下次就能一键照搬了！');
      textarea?.focus();
      return;
    }
    if (textarea) {
      textarea.value = saved;
      textarea.focus();
    }
  };

  window.startElderVoiceInput = function () {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = document.getElementById('btn-elder-voice');
    const textarea = document.getElementById('elder-demand-text');
    if (!SpeechRec) {
      alert('当前手机浏览器暂不支持直接语音转写，请点手机键盘上的「麦克风语音输入」按钮说话即可！');
      textarea?.focus();
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    if (btn) btn.innerHTML = '<span>🔴</span> 正在听您说话，请讲...';

    rec.onresult = function (event) {
      const spoken = event.results?.[0]?.[0]?.transcript || '';
      if (spoken && textarea) {
        textarea.value = `${textarea.value} ${spoken}`.trim();
      }
    };
    rec.onerror = function () {
      alert('未听清语音，请靠近麦克风再试一次，或直接用键盘语音输入。');
    };
    rec.onend = function () {
      if (btn) btn.innerHTML = '<span>🎙️</span> 点这里继续说话（自动变文字）';
    };
    rec.start();
  };

  window.submitElderDemandPlan = async function () {
    const text = document.getElementById('elder-demand-text')?.value.trim();
    const btn = document.getElementById('btn-elder-submit-demand');
    if (!text) return alert('请先说出或输入您需要的货品！');

    localStorage.setItem(LAST_DEMAND_KEY, text);
    const { storeName, agentTag, storeId } = getStoreContext();
    const payload = {
      tenant_id: agentTag && agentTag !== '未接入' ? agentTag : 'PUBLIC',
      store_id: storeId,
      store_name: storeName,
      product_name: `[适老语音报单] ${text}`,
      planned_qty: 1,
      measure_unit: '批',
      expected_date: new Date().toISOString().slice(0, 10),
      status: 'pending'
    };

    if (btn) {
      btn.disabled = true;
      btn.innerText = '正在发送给产区...';
    }

    // 弱网或断网自动转入本地离线队列，恢复信号后自动交卷
    if (!navigator.onLine) {
      const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
      queue.push({ id: Date.now(), payload });
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      document.getElementById('elder-demand-text').value = '';
      if (btn) {
        btn.disabled = false;
        btn.innerText = '✅ 确认发给供货产区';
      }
      alert('📶 当前村镇信号较弱，已为您稳妥暂存在本机！等手机恢复信号会自动发送给产区。');
      return;
    }

    try {
      const { error } = await supabase.from('demand_forecast_plan').insert([payload]);
      if (error) throw error;

      document.getElementById('elder-demand-text').value = '';
      speakElderNotice('要货单已成功发给供货产区。');
      alert('✅ 已成功发给供货产区！产区看到后就会安排备货送达。');
      await window.loadElderRecentPlans();
    } catch (err) {
      const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
      queue.push({ id: Date.now(), payload });
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      document.getElementById('elder-demand-text').value = '';
      alert('📶 网络波动，已自动转入本机离线队列，稍后自动同步给产区！');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = '✅ 确认发给供货产区';
      }
    }
  };

  window.loadElderRecentPlans = async function () {
    const listEl = document.getElementById('elder-recent-plans-list');
    const tagEl = document.getElementById('elder-revoke-policy-tag');
    if (!listEl) return;

    if (tagEl) {
      tagEl.innerText =
        revokeWindowMinutes > 0 ? `保护窗：${revokeWindowMinutes} 分钟内可撤回` : '自助撤回已关闭';
    }

    const { storeId, storeName } = getStoreContext();
    try {
      let query = supabase
        .from('demand_forecast_plan')
        .select('*')
        .order('id', { ascending: false })
        .limit(5);
      if (storeId) query = query.eq('store_id', storeId);

      const { data } = await query;
      const rows = (data || []).filter((p) => storeId || p.store_name === storeName);

      if (rows.length === 0) {
        listEl.innerHTML = '<div class="text-xs text-stone-400 py-2">暂无近期报单记录</div>';
        return;
      }

      const renderList = () => {
        const now = Date.now();
        listEl.innerHTML = rows
          .map((p) => {
            const createdMs = p.created_at ? new Date(p.created_at).getTime() : 0;
            const windowMs = revokeWindowMinutes * 60 * 1000;
            const remainSec = createdMs > 0 ? Math.floor((createdMs + windowMs - now) / 1000) : 0;
            const canRevoke = p.status === 'pending' && revokeWindowMinutes > 0 && remainSec > 0;
            const minPart = Math.floor(remainSec / 60);
            const secPart = String(remainSec % 60).padStart(2, '0');

            const statusLabel =
              p.status === 'pending'
                ? '<span class="text-amber-700 font-bold">待产区备货</span>'
                : '<span class="text-emerald-700 font-bold">产区已接单排产</span>';

            return `
              <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex flex-col gap-2">
                <div class="flex justify-between items-start gap-2">
                  <b class="text-stone-900 leading-snug">${String(p.product_name || '').replace('[适老语音报单] ', '')}</b>
                  <span class="text-xs shrink-0">${statusLabel}</span>
                </div>
                ${
                  canRevoke
                    ? `<button type="button" onclick="window.revokeElderDemandPlan(${p.id})"
                        class="w-full py-2 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 font-extrabold text-xs rounded-xl active:scale-95 transition">
                        ↩️ 刚才点错了 · 撤回重填（剩余 ${minPart}:${secPart}）
                      </button>`
                    : ''
                }
              </div>
            `;
          })
          .join('');
      };

      renderList();
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(renderList, 1000);
    } catch {
      listEl.innerHTML = '<div class="text-xs text-stone-400">弱网状态下暂未拉取历史记录</div>';
    }
  };

  window.revokeElderDemandPlan = async function (planId) {
    if (!confirm('确定要撤回这笔要货单吗？撤回后可以重新填写发送。')) return;
    // 乐观锁：仅当状态仍为 pending（产区尚未接单排产）时才允许撤回，防止多端状态冲突
    const { data, error } = await supabase
      .from('demand_forecast_plan')
      .delete()
      .eq('id', planId)
      .eq('status', 'pending')
      .select();

    if (error) return alert('撤回失败：' + error.message);
    if (!data || data.length === 0) {
      alert('⚠️ 供货产区刚刚已经接单安排备货了，无法直接线上撤回，请电话联系产区负责人协商调整！');
      await window.loadElderRecentPlans();
      return;
    }
    alert('✅ 已成功撤回！您现在可以重新输入正确的要货数量了。');
    await window.loadElderRecentPlans();
  };

  window.loadElderPendingOrders = async function () {
    const listEl = document.getElementById('elder-orders-list');
    if (!listEl) return;
    const { storeId, storeName } = getStoreContext();

    try {
      let query = supabase
        .from('store_order')
        .select('id, order_no, items, total_amount, delivery_status, note')
        .neq('delivery_status', 'delivered')
        .order('id', { ascending: false })
        .limit(10);

      if (storeId) query = query.eq('store_id', storeId);

      const { data } = await query;
      const rows = (data || []).filter((o) => storeId || String(o.note || '').includes(storeName));

      if (rows.length === 0) {
        listEl.innerHTML = '<div class="py-6 text-center text-stone-500 font-bold">🎉 当前没有待签收的在途货单！</div>';
        return;
      }

      speakElderNotice(`百工天街提醒您，本店共有${rows.length}笔在途货单待查收。`);

      listEl.innerHTML = rows
        .map((o) => {
          const itemsStr = Array.isArray(o.items)
            ? o.items.map((it) => `${it.name}×${it.qty}`).join('、')
            : '标准货品';
          return `
            <div class="p-4 bg-stone-50 border-2 border-stone-200 rounded-2xl space-y-2">
              <div class="flex justify-between items-center">
                <b class="font-mono text-stone-900">#${o.order_no || o.id}</b>
                <span class="bg-amber-100 text-amber-950 font-bold px-2.5 py-0.5 rounded-full text-xs">在途待收</span>
              </div>
              <p class="font-bold text-stone-800 leading-snug">${itemsStr}</p>
              <button type="button" onclick="window.confirmElderOrderDelivery(${o.id})"
                class="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold text-base rounded-xl shadow active:scale-95 transition">
                ✅ 货已收到 · 一键签收
              </button>
            </div>
          `;
        })
        .join('');
    } catch {
      listEl.innerHTML = '<div class="py-4 text-center text-rose-600">加载单据失败，请稍后再试</div>';
    }
  };

  window.confirmElderOrderDelivery = async function (orderId) {
    const { data, error } = await supabase
      .from('store_order')
      .update({ delivery_status: 'delivered' })
      .eq('id', orderId)
      .neq('delivery_status', 'delivered')
      .select();

    if (error) return alert('签收失败：' + error.message);
    if (!data || data.length === 0) {
      alert('该单据刚才已完成签收，无需重复操作。');
      await window.loadElderPendingOrders();
      return;
    }
    speakElderNotice('签收成功，已通知产区与街坊。');
    alert('✅ 签收成功！已通知产区与街坊货已到店。');
    await window.loadElderPendingOrders();
  };

  window.exportStoreLedgerBackup = async function () {
    const { storeId, storeName } = getStoreContext();
    try {
      let query = supabase
        .from('store_order')
        .select('id, order_no, total_amount, delivery_status, created_at, note')
        .order('id', { ascending: false })
        .limit(500);
      if (storeId) query = query.eq('store_id', storeId);
      const { data } = await query;

      const header = ['单据号', '金额(元)', '状态', '时间', '备注'];
      const lines = (data || []).map((r) => [
        r.order_no || r.id,
        r.total_amount ?? 0,
        r.delivery_status || '',
        r.created_at || '',
        `"${String(r.note || '').replace(/"/g, '""')}"`
      ]);
      const csvContent = '\uFEFF' + [header.join(','), ...lines.map((l) => l.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${storeName}_完整账本备份_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('导出账本失败：' + err.message);
    }
  };

  if (localStorage.getItem('prefer_elder_mode') === '1') {
    window.toggleElderMode(true);
  }
}
