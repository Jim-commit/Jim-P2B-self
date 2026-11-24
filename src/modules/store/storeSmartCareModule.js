import { parseWechatOrderText, speakChineseNotice } from '../../services/smartFieldAssistantService.js';
import { storeState } from './storeState.js';

export function mountStoreSmartCareToolbar() {
  const headerEl = document.querySelector('header');
  if (!headerEl || document.getElementById('store-smart-care-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'store-smart-care-bar';
  bar.className = 'mx-3 mt-2 bg-stone-100 border border-stone-200 px-3 py-2 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs';
  bar.innerHTML = `
    <div class="flex items-center gap-1.5 text-stone-700 font-bold">
      <span>⚡ 快捷助手：</span>
      <button type="button" onclick="window.openWechatTextSplitModal()" class="bg-[#1b4332] hover:bg-[#143628] text-amber-300 font-bold px-3 py-1 rounded-xl text-[11px] shadow-2xs">
        📋 微信文本清单智能拆单
      </button>
    </div>
    <button type="button" onclick="window.toggleStoreElderCareMode()" id="btn-store-elder-mode" class="bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold px-3 py-1 rounded-xl text-[11px] shadow-2xs">
      👴 极简三键大字模式
    </button>
  `;
  headerEl.insertAdjacentElement('afterend', bar);

  if (localStorage.getItem('store_elder_care_mode') === '1') {
    renderStoreElderCareOverlay(true);
  }
}

function renderStoreElderCareOverlay(enable) {
  let overlay = document.getElementById('store-elder-care-overlay');
  if (!enable) {
    overlay?.remove();
    localStorage.removeItem('store_elder_care_mode');
    return;
  }

  localStorage.setItem('store_elder_care_mode', '1');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'store-elder-care-overlay';
    overlay.className = 'fixed inset-0 bg-stone-50 z-40 flex flex-col justify-between p-5 overflow-y-auto';
    document.body.appendChild(overlay);
  }

  const storeName = storeState.currentStore?.name || '合作门店';
  const curDebt = parseFloat(storeState.currentStore?.current_debt || 0).toFixed(2);
  const agentPhone = storeState.currentStore?.driver_phone || '';

  overlay.innerHTML = `
    <div class="flex justify-between items-center border-b-2 border-stone-200 pb-3">
      <div>
        <h2 class="text-xl font-black text-stone-900">🏪 ${storeName}</h2>
        <p class="text-sm text-stone-600 mt-0.5">当前在账欠款：<b class="text-rose-700 font-mono text-lg">¥${curDebt}</b></p>
      </div>
      <button type="button" onclick="window.toggleStoreElderCareMode()" class="bg-stone-200 text-stone-800 font-bold px-3.5 py-2 rounded-2xl text-sm">
        退出极简模式
      </button>
    </div>

    <div class="grid grid-cols-1 gap-4 my-auto py-4">
      <button type="button" onclick="window.elderActionRestock()" class="w-full py-7 px-5 rounded-3xl bg-[#1b4332] active:scale-98 text-white shadow-lg flex items-center justify-between">
        <div class="text-left">
          <div class="text-2xl font-black text-amber-300">1. 我要进货补单</div>
          <div class="text-sm text-emerald-100 mt-1">粘贴微信清单或点选常订好货</div>
        </div>
        <span class="text-4xl">📦</span>
      </button>

      <button type="button" onclick="window.elderActionCheckBill()" class="w-full py-7 px-5 rounded-3xl bg-amber-500 active:scale-98 text-stone-950 shadow-lg flex items-center justify-between">
        <div class="text-left">
          <div class="text-2xl font-black">2. 查账单与语音播报</div>
          <div class="text-sm text-stone-900 mt-1">大声读出当前欠款与核对周期明细</div>
        </div>
        <span class="text-4xl">🔊</span>
      </button>

      <button type="button" onclick="window.elderActionCallSupport('${agentPhone}')" class="w-full py-7 px-5 rounded-3xl bg-sky-700 active:scale-98 text-white shadow-lg flex items-center justify-between">
        <div class="text-left">
          <div class="text-2xl font-black">3. 一键呼叫送货对接人</div>
          <div class="text-sm text-sky-100 mt-1">有事直接打电话，不用打字发消息</div>
        </div>
        <span class="text-4xl">📞</span>
      </button>
    </div>

    <div class="text-center text-xs text-stone-400">百工百业 · 适老关怀一屏三键模式</div>
  `;
}

export function initStoreSmartCareBindings() {
  window.toggleStoreElderCareMode = function () {
    const isCurOn = !!document.getElementById('store-elder-care-overlay');
    const nextOn = !isCurOn;
    renderStoreElderCareOverlay(nextOn);
    if (nextOn) {
      speakChineseNotice('已开启极简三键大字模式，您可以直接点选进货补单、查账单或呼叫送货师傅。');
    }
  };

  window.elderActionRestock = function () {
    renderStoreElderCareOverlay(false);
    speakChineseNotice('请点选需要补货的商品，或直接粘贴微信进货清单。');
    window.openWechatTextSplitModal();
  };

  window.elderActionCheckBill = function () {
    const storeName = storeState.currentStore?.name || '本店';
    const curDebt = parseFloat(storeState.currentStore?.current_debt || 0).toFixed(2);
    speakChineseNotice(`${storeName}当前在账应结余款为 ${curDebt} 元。`);
    renderStoreElderCareOverlay(false);
    if (typeof window.openStoreSelfStatementModal === 'function') {
      window.openStoreSelfStatementModal();
    }
  };

  window.elderActionCallSupport = function (phone) {
    if (phone) {
      speakChineseNotice('正在为您拨通专属送货对接人电话。');
      window.location.href = `tel:${phone}`;
    } else {
      speakChineseNotice('暂未登记对接人电话，请打开同城互调或向供货方留言。');
      alert('暂未登记专属送货对接人电话，请联系供货合作社补充登记。');
    }
  };

  window.openWechatTextSplitModal = function () {
    document.getElementById('modal-wechat-text-split')?.remove();
    const modal = document.createElement('div');
    modal.id = 'modal-wechat-text-split';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-md w-full p-5 space-y-3.5 shadow-2xl text-xs">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2">
          <div>
            <b class="text-sm text-stone-900">📋 微信文本清单智能拆单</b>
            <p class="text-[11px] text-stone-500 mt-0.5">直接粘贴微信聊天里的要货清单，自动匹配货品并填入数量</p>
          </div>
          <button type="button" onclick="document.getElementById('modal-wechat-text-split')?.remove()" class="text-stone-400 hover:text-stone-800 text-base font-bold">✕</button>
        </div>

        <textarea id="wechat-split-input" rows="4" placeholder="例如：\n土鸡蛋 5箱\n菜籽油 2桶，大米 3袋" class="w-full bg-stone-50 border border-stone-200 rounded-2xl p-3 text-xs text-stone-800 outline-none focus:border-emerald-600"></textarea>

        <div id="wechat-split-preview" class="space-y-1.5 max-h-40 overflow-y-auto"></div>

        <div class="flex gap-2">
          <button type="button" onclick="window.previewWechatTextSplit()" class="flex-1 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold">🔍 智能识别预览</button>
          <button type="button" onclick="window.applyWechatTextSplitToCart()" class="flex-1 py-2.5 rounded-xl bg-[#1b4332] hover:bg-[#143628] text-white font-bold shadow">✅ 一键填入补货篮</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.previewWechatTextSplit = function () {
    const raw = document.getElementById('wechat-split-input')?.value || '';
    const { matched, unmatched } = parseWechatOrderText(raw, storeState.allProducts || []);
    const box = document.getElementById('wechat-split-preview');
    if (!box) return;

    if (matched.length === 0 && unmatched.length === 0) {
      box.innerHTML = '<div class="text-stone-400 text-center py-2">请输入要货文本后再识别</div>';
      return;
    }

    const okHtml = matched
      .map(
        (m) => `
        <div class="px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
          <b class="text-emerald-950">✅ ${m.product.name}</b>
          <span class="font-mono font-bold text-emerald-800">× ${m.qty} ${m.product.measure_unit || '件'}</span>
        </div>
      `
      )
      .join('');

    const missHtml = unmatched
      .map(
        (u) => `
        <div class="px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-xl flex justify-between items-center text-amber-900">
          <span>⚠️ 未匹配到：「${u.rawSegment}」</span>
          <span class="text-[10px]">请手动点选</span>
        </div>
      `
      )
      .join('');

    box.innerHTML = okHtml + missHtml;
  };

  window.applyWechatTextSplitToCart = function () {
    const raw = document.getElementById('wechat-split-input')?.value || '';
    const { matched, unmatched } = parseWechatOrderText(raw, storeState.allProducts || []);
    if (matched.length === 0) {
      return alert('未识别到本店在架匹配的货品，请检查品名后重试！');
    }

    matched.forEach((m) => {
      if (typeof window.changeStoreCartQty === 'function') {
        window.changeStoreCartQty(m.product.id, m.qty);
      } else if (typeof window.addToStoreCart === 'function') {
        for (let i = 0; i < m.qty; i += 1) window.addToStoreCart(m.product.id);
      }
    });

    document.getElementById('modal-wechat-text-split')?.remove();
    speakChineseNotice(`已为您智能填入 ${matched.length} 款货品到补货篮，请核对数量后提交。`);
    alert(
      `✅ 智能拆单完成！已将 ${matched.length} 款货品填入补货篮` +
        (unmatched.length > 0 ? `\n（另有 ${unmatched.length} 项未自动匹配，请在货架手动补充）` : '！')
    );
  };
}
