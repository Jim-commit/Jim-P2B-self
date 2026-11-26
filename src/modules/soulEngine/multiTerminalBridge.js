/**
 * 百工百业 · 五端统一协同与十六重境界跨端桥接引擎
 * 覆盖：index.html (门店端) / driver.html (掌中宝) / mall.html (天街端) / suppliers.html (名录端)
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

let storeBridgeWatcherStarted = false;
let lastRenderedStoreAgent = '';

/**
 * 1. 门店端 (index.html)：
 *    - 识别总部打印的「一户一码快捷补货贴」(?agent=...&store_id=...) 自动锁定商号并亮出极速补货条
 *    - 展示当前供货商发布的「🌾 凑单开产牌」，门店掌柜一键认领数量（支持切换供货商实时联动刷新）
 */
export async function initStoreTerminalBridge() {
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

    if (!activeAgent || activeAgent === '未接入') {
      document.getElementById('store-sticker-welcome-bar')?.remove();
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

    const container =
      document.getElementById('product-container') ||
      document.getElementById('product-list') ||
      document.getElementById('goods-list') ||
      document.getElementById('items-container');
    if (!container) return;

    document.getElementById('store-sticker-welcome-bar')?.remove();
    document.getElementById('store-crowd-produce-box')?.remove();

    // 若通过「一户一码实体贴纸」扫码进入，顶部亮出扫码极速补货欢迎条
    if (stickerStoreId) {
      const stickerBar = document.createElement('div');
      stickerBar.id = 'store-sticker-welcome-bar';
      stickerBar.className = 'mb-3 bg-amber-50 border border-amber-300 text-amber-950 p-3 rounded-2xl flex items-center justify-between gap-2 text-xs shadow-2xs';
      stickerBar.innerHTML = `
        <div>
          <b class="block">🏷️ 已识别门店专属补货贴（编号 #${stickerStoreId}）</b>
          <span class="text-[10px] text-amber-800">直接点下方商品“+”号选择数量，底部一键生成送货凭单</span>
        </div>
        <button type="button" onclick="window.repeatLastOrder?.()" class="bg-[#1b4332] text-white font-bold px-2.5 py-1.5 rounded-xl text-[10px] shrink-0">
          ⚡ 一键复购上次
        </button>
      `;
      container.parentNode?.insertBefore(stickerBar, container);
    }

    // 若供货商发布了「凑单开产牌」，在商品列表上方亮出拼单认领卡片
    const crowdList = crowdRes?.data || [];
    if (crowdList.length > 0) {
      const crowdBox = document.createElement('div');
      crowdBox.id = 'store-crowd-produce-box';
      crowdBox.className = 'mb-3 bg-emerald-50/90 border border-emerald-300 p-3 rounded-2xl space-y-2 text-xs';
      crowdBox.innerHTML = `
        <div class="flex items-center justify-between">
          <b class="text-emerald-950">🌾 源头「凑单开产」预售接龙（凑满即开炉直供）</b>
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

    window.claimCrowdProduceItem = async function (noticeId, contentText) {
      const qtyStr = prompt(`请输入您本店要认领的数量：\n（${contentText}）`, '10');
      const qty = parseInt(qtyStr || '0', 10);
      if (!qty || qty <= 0) return;

      const storeTitle = document.getElementById('store-title')?.innerText || '合作门店';
      const { error } = await supabase.from('platform_suggestion_board').insert([{
        proposer_type: 'c2b_demand',
        proposer_name: storeTitle,
        category: `[凑单认领 · ${activeAgent}]`,
        content: `🙋【凑单认领】${storeTitle} 认领 ${qty} 件（响应：${contentText.slice(0, 40)}...）`
      }]);
      if (error) return alert('认领提交失败：' + error.message);
      alert(`✅ 认领成功！已向源头供货方登记您认领 ${qty} 件，凑满开产后将优先为您配发！`);
    };
  }

  await renderCrowdBannerForActiveAgent(true);

  if (!storeBridgeWatcherStarted) {
    storeBridgeWatcherStarted = true;
    setInterval(() => {
      renderCrowdBannerForActiveAgent(false);
    }, 3000);
  }
}

/**
 * 2. 掌中宝 / 一线移动工作台 (driver.html)：
 *    - 顶部挂载「🗣️ 一线说话/随手极速记账条」，送货师傅/仓管在外面跑车或仓库里不用点繁琐表单，说句话就能记收款或零门槛开散客单
 */
export function initDriverTerminalBridge() {
  const navHost = document.getElementById('palm-role-nav');
  if (!navHost || document.getElementById('palm-voice-quick-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'palm-voice-quick-bar';
  bar.className = 'mx-3 mt-2.5 bg-emerald-50/90 border border-emerald-200 p-2.5 rounded-2xl space-y-1.5 text-xs';
  bar.innerHTML = `
    <div class="flex items-center justify-between">
      <b class="text-emerald-950 text-[11px]">🗣️ 一线极速记账（散客随手记 / 说话记收款）：</b>
      <button type="button" onclick="window.openPalmQuickWalkInModal()" class="bg-[#1b4332] text-white font-bold px-2.5 py-0.5 rounded-lg text-[10px]">
        ⚡ 散客随手开单
      </button>
    </div>
    <div class="flex gap-1.5">
      <input type="text" id="palm-quick-note-input" placeholder="如：旺顺饭庄收现金800元 / 散客拿2箱油160元" class="flex-1 bg-white border border-emerald-200 rounded-xl px-2.5 py-1.5 text-[11px] outline-none">
      <button type="button" onclick="window.startVoiceInput?.('palm-quick-note-input')" class="bg-amber-100 text-amber-950 border border-amber-300 font-bold px-2.5 rounded-xl text-[11px] shrink-0">🎤</button>
      <button type="button" onclick="window.submitPalmQuickCommand()" class="bg-emerald-800 text-white font-bold px-3 rounded-xl text-[11px] shrink-0">记一笔</button>
    </div>
  `;
  navHost.insertAdjacentElement('beforebegin', bar);

  window.submitPalmQuickCommand = async function () {
    const inp = document.getElementById('palm-quick-note-input');
    const txt = inp?.value.trim() || '';
    if (!txt) return alert('请先输入或语音说出要记的内容！');

    const tenantId = (document.getElementById('tenant-display')?.innerText || localStorage.getItem('hq_active_agent') || '').trim();
    const operator = (document.getElementById('driver-name-display')?.innerText || '一线执事').trim();
    const amtMatch = txt.match(/(\d+(?:\.\d+)?)\s*(?:元|块|¥)?/);
    const amt = amtMatch ? parseFloat(amtMatch[1]) : 0;

    if (!confirm(`确认将以下记录写入商号账本？\n• 内容：${txt}\n• 识别金额：¥${amt.toFixed(2)}\n• 经手人：${operator}`)) return;

    await supabase.from('driver_collection_log').insert([{
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
    }]);

    inp.value = '';
    alert('✅ 已写入随车/一线账本，回库后财务可直接点清核对！');
    if (typeof window.loadDriverTasks === 'function') window.loadDriverTasks();
  };

  window.openPalmQuickWalkInModal = function () {
    const buyer = prompt('请输入买方称呼（如：路过散客 / 城南工地）：', '路过散客');
    if (!buyer) return;
    const itemDesc = prompt('请输入货品与数量（如：菜籽油 2桶）：');
    if (!itemDesc) return;
    const priceStr = prompt('请输入实收总金额（元）：', '0');
    const totalAmt = parseFloat(priceStr || '0');
    if (isNaN(totalAmt) || totalAmt < 0) return;

    const tenantId = (document.getElementById('tenant-display')?.innerText || localStorage.getItem('hq_active_agent') || '').trim();
    const operator = (document.getElementById('driver-name-display')?.innerText || '一线执事').trim();
    const ckNo = generateMobileVoucherNo('CK');

    supabase.from('store_order').insert([{
      order_no: ckNo,
      tenant_id: tenantId,
      store_id: 0,
      store_name: buyer.trim(),
      driver_name: operator,
      order_source: 'vendor_push',
      settlement_type: 'cash',
      settlement_note: `[掌中宝散客随手单] ${itemDesc}`,
      items: [{ id: 0, name: itemDesc.trim(), spec: '现场直售', measure_unit: '批', price: totalAmt, qty: 1 }],
      items_return: [],
      items_exchange: [],
      total_amount: totalAmt,
      return_amount: 0,
      net_settle_amount: totalAmt,
      order_status: 'confirmed',
      delivery_status: 'delivered',
      note: `[掌中宝散客随手单] ${itemDesc}`
    }]).then(({ error }) => {
      if (error) return alert('记账失败：' + error.message);
      alert(`✅ 散客随手单【${ckNo}】（¥${totalAmt.toFixed(2)}）已入账！`);
      if (typeof window.loadDriverTasks === 'function') window.loadDriverTasks();
    });
  };
}

/**
 * 3. 百工天街零售端 (mall.html)：
 *    - 展示全网源头商号的「🌾 凑单开产接龙」
 *    - 若商号开启了「🕯️ 一单微光公益角」，在页面底部展示邻里善意公示牌
 */
export async function initMallTerminalBridge() {
  const [crowdRes, charityTenantsRes] = await Promise.all([
    supabase
      .from('platform_suggestion_board')
      .select('*')
      .eq('proposer_type', 'c2b_demand')
      .ilike('category', '%凑单开产%')
      .order('id', { ascending: false })
      .limit(6),
    supabase
      .from('platform_tenant')
      .select('tenant_id, company_name, custom_settings')
      .eq('is_active', true)
      .limit(50)
  ]);

  const crowdList = crowdRes?.data || [];
  const charityTenants = (charityTenantsRes?.data || []).filter((t) => t.custom_settings?.charity_micro_light_enabled);

  const mainHost = document.querySelector('main') || document.body;
  if (crowdList.length > 0 && !document.getElementById('mall-crowd-produce-strip')) {
    const strip = document.createElement('section');
    strip.id = 'mall-crowd-produce-strip';
    strip.className = 'max-w-5xl mx-auto my-3 px-3';
    strip.innerHTML = `
      <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-2 text-xs">
        <div class="flex items-center justify-between">
          <b class="text-emerald-950 text-sm">🌾 源头「凑单开产」接龙（凑够即开炉直供，比现货更优价）</b>
          <span class="text-[10px] text-emerald-800 font-bold">以销定产 · 零中间商</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${crowdList
            .map(
              (c) => `
              <div class="bg-white p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between gap-2">
                <div>
                  <span class="text-[10px] font-bold text-emerald-800 block">${c.proposer_name || '源头直供商号'}</span>
                  <span class="text-[11px] text-stone-800">${c.content}</span>
                </div>
                <button type="button" onclick="window.mallJoinCrowdProduce('${String(c.category || '').replace(/'/g, '')}', '${String(c.content || '').replace(/'/g, '')}')" class="bg-[#1b4332] text-amber-300 font-bold px-2.5 py-1.5 rounded-xl text-[10px] shrink-0">
                  参与拼单
                </button>
              </div>`
            )
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

  window.mallJoinCrowdProduce = async function (catStr, contentStr) {
    const buyerName = prompt('请输入您的称呼及手机号（方便开产到货通知）：');
    if (!buyerName || !buyerName.trim()) return;
    const qty = parseInt(prompt('请输入您要拼单认领的数量：', '2') || '0', 10);
    if (!qty || qty <= 0) return;

    await supabase.from('platform_suggestion_board').insert([{
      proposer_type: 'c2b_demand',
      proposer_name: buyerName.trim(),
      category: catStr.replace('凑单开产', '天街拼单认领'),
      content: `🛒【天街街坊拼单】${buyerName.trim()} 认领 ${qty} 件（${contentStr.slice(0, 40)}...）`
    }]);
    alert('✅ 拼单认领成功！凑满开产后商号将第一时间为您安排到店自提或配送。');
  };
}

/**
 * 4. 百业供需合作名录 (suppliers.html)：
 *    - 展示跨商号「🏅 实名信义金标」与双向求购/余缺信息板
 */
export async function initSuppliersTerminalBridge() {
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
          <b class="text-sm text-stone-900">🔄 百业双向供需池 · 求购榜 / 凑单开产 / 余缺互调</b>
          <span class="text-[10px] text-stone-500 block">人人既可做卖方供货，也可发求购找源头，实名信义商号直接对接</span>
        </div>
        <button type="button" onclick="window.publishTwoWayDemandPrompt()" class="bg-[#1b4332] text-amber-300 font-bold px-3 py-1.5 rounded-xl text-[11px]">
          📢 发布我的采购/合作需求
        </button>
      </div>
      ${
        list.length === 0
          ? `<p class="text-[11px] text-stone-400 py-2">暂无最新挂榜需求，点击右上角可免费发布您的采购或余缺调剂意向。</p>`
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

  window.publishTwoWayDemandPrompt = async function () {
    const who = prompt('请输入您的商号/门店名称及联系电话：');
    if (!who || !who.trim()) return;
    const need = prompt('请描述您要采购的货品/服务，或要调剂的余货：');
    if (!need || !need.trim()) return;

    const { error } = await supabase.from('platform_suggestion_board').insert([{
      proposer_type: 'c2b_demand',
      proposer_name: who.trim(),
      category: '[全网公域 · 双向供需]',
      content: `📢【双向求购/合作】${need.trim()}`
    }]);
    if (error) return alert('发布失败：' + error.message);
    alert('✅ 已发布至百业双向供需池，相关源头商号将主动与您对接！');
    window.location.reload();
  };
}
