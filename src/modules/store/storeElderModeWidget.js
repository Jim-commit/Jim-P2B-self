import { supabase } from '../../lib/supabase.js';
import { storeState } from './storeState.js';

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

export function mountStoreElderModeWidget() {
  if (document.getElementById('elder-mode-overlay')) return;

  // 1. 注入顶部悬浮切换按钮（不破坏原有 header 布局）
  const togglePillHtml = `
    <button type="button" id="btn-enter-elder-mode" onclick="window.toggleElderMode(true)"
      class="fixed top-2.5 right-3 z-40 bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-xs px-3 py-1.5 rounded-full shadow-lg border border-amber-500 flex items-center gap-1 active:scale-95 transition">
      <span>👵</span> 极简大字版
    </button>
  `;
  document.body.insertAdjacentHTML('beforeend', togglePillHtml);

  // 2. 注入全屏极简适老 3 大核心动作面板
  const overlayHtml = `
    <div id="elder-mode-overlay" class="hidden fixed inset-0 z-50 bg-[#f7f5f0] text-stone-900 overflow-y-auto pb-10">
      <div class="max-w-md mx-auto p-4 space-y-4">
        
        <!-- 顶部大字报头与切换 -->
        <div class="bg-[#1b4332] text-white p-4 rounded-3xl shadow-md flex justify-between items-center gap-2">
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
          
          <!-- 动作 1：报用度（支持语音口信） -->
          <button type="button" onclick="window.openElderActionCard('demand')"
            class="w-full bg-amber-400 hover:bg-amber-300 text-stone-950 p-5 rounded-3xl shadow-md border-2 border-amber-500 flex items-center justify-between text-left active:scale-98 transition">
            <div class="space-y-1">
              <div class="text-2xl font-extrabold flex items-center gap-2">
                <span>📝</span> 1. 报用度（喊话要货）
              </div>
              <p class="text-sm font-bold text-stone-800">按住说话或打字，告诉产区明天要什么货</p>
            </div>
            <span class="text-3xl font-bold">➔</span>
          </button>

          <!-- 动作 2：点收货（核验签收） -->
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

        <!-- 子面板 A：语音/大字报用度 -->
        <div id="elder-panel-demand" class="hidden bg-white border-2 border-amber-400 rounded-3xl p-5 space-y-3.5 shadow-lg">
          <div class="flex justify-between items-center border-b border-stone-200 pb-2">
            <b class="text-lg text-stone-900">📝 说出或写出您要的货</b>
            <button type="button" onclick="window.closeElderSubPanels()" class="text-stone-400 text-2xl font-bold">✕</button>
          </div>

          <button type="button" id="btn-elder-voice" onclick="window.startElderVoiceInput()"
            class="w-full py-4 bg-amber-100 hover:bg-amber-200 border-2 border-amber-400 text-amber-950 rounded-2xl font-extrabold text-lg flex items-center justify-center gap-2 active:scale-95 transition">
            <span>🎙️</span> 点这里开始说话（自动变文字）
          </button>

          <textarea id="elder-demand-text" rows="3" placeholder="例如：明天早上送5箱土鸡蛋、2袋五常大米，送到店门口。"
            class="w-full bg-stone-50 border-2 border-stone-300 rounded-2xl p-3.5 text-lg font-bold text-stone-900 outline-none focus:border-emerald-700"></textarea>

          <button type="button" id="btn-elder-submit-demand" onclick="window.submitElderDemandPlan()"
            class="w-full py-4 bg-[#1b4332] text-white font-extrabold text-lg rounded-2xl shadow-md active:scale-95 transition">
            ✅ 确认发给供货产区
          </button>
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

      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', overlayHtml);

  window.toggleElderMode = function (enable) {
    const overlay = document.getElementById('elder-mode-overlay');
    if (!overlay) return;
    if (enable) {
      const { storeName } = getStoreContext();
      const titleEl = document.getElementById('elder-store-title');
      if (titleEl) titleEl.innerText = storeName;
      localStorage.setItem('prefer_elder_mode', '1');
      overlay.classList.remove('hidden');
      window.openElderActionCard('demand');
    } else {
      localStorage.removeItem('prefer_elder_mode');
      overlay.classList.add('hidden');
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

  // 原生中文语音转文字（兼容移动端浏览器与微信内置浏览器）
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

    const { storeName, agentTag, storeId } = getStoreContext();
    if (btn) {
      btn.disabled = true;
      btn.innerText = '正在发送给产区...';
    }

    try {
      const { error } = await supabase.from('demand_forecast_plan').insert([
        {
          tenant_id: agentTag && agentTag !== '未接入' ? agentTag : 'PUBLIC',
          store_id: storeId,
          store_name: storeName,
          product_name: `[适老语音报单] ${text}`,
          planned_qty: 1,
          measure_unit: '批',
          expected_date: new Date().toISOString().slice(0, 10),
          status: 'pending'
        }
      ]);
      if (error) throw error;

      document.getElementById('elder-demand-text').value = '';
      alert('✅ 已成功发给供货产区！产区看到后就会安排备货送达。');
    } catch (err) {
      alert('发送失败：' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = '✅ 确认发给供货产区';
      }
    }
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
      const rows = (data || []).filter(
        (o) => storeId || String(o.note || '').includes(storeName)
      );

      if (rows.length === 0) {
        listEl.innerHTML = '<div class="py-6 text-center text-stone-500 font-bold">🎉 当前没有待签收的在途货单！</div>';
        return;
      }

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
    } catch (e) {
      listEl.innerHTML = '<div class="py-4 text-center text-rose-600">加载单据失败，请稍后再试</div>';
    }
  };

  window.confirmElderOrderDelivery = async function (orderId) {
    const { error } = await supabase
      .from('store_order')
      .update({ delivery_status: 'delivered' })
      .eq('id', orderId);
    if (error) return alert('签收失败：' + error.message);
    alert('✅ 签收成功！已通知产区与街坊货已到店。');
    await window.loadElderPendingOrders();
  };

  if (localStorage.getItem('prefer_elder_mode') === '1') {
    window.toggleElderMode(true);
  }
}
