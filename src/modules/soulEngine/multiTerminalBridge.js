/**
 * 百工百业 · 五端统一协同与跨端桥接引擎（零重复注入收口版 · 门店安全收银双扫码绑定）
 * 覆盖：index.html (绑定原生收银弹窗与凑单开产) / driver.html / mall.html / suppliers.html
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
  tip.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-40 max-w-sm w-[92%] bg-stone-900/95 text-white px-3.5 py-2 rounded-2xl shadow-lg flex items-center justify-between gap-2 text-[11px] border border-stone-700';
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
 * 其余三端（driver / mall / suppliers）一体式商号门头身份切换栏（不再对 index.html 重复注入）
 */
function mountMobileQuickRoleSwitchDock(currentFile) {
  if (currentFile === 'index.html') return;
  if (document.getElementById('baigong-mobile-role-dock')) return;
  const items = [
    { file: 'hq.html', label: '批发与调度' },
    { file: 'index.html', label: '门店工作台' },
    { file: 'driver.html', label: '送货与上门' },
    { file: 'mall.html', label: '逛大集' }
  ];

  const greenHeader =
    document.querySelector('header') ||
    Array.from(document.querySelectorAll('div')).find((el) => {
      const cls = String(el.className || '');
      return (cls.includes('bg-[#1b4332]') || cls.includes('bg-emerald-9') || cls.includes('bg-green-9')) && el.offsetHeight > 70;
    });

  const barWrap = document.createElement('div');
  barWrap.id = 'baigong-mobile-role-dock';
  const isWideHeader = greenHeader && greenHeader.offsetWidth > 768;

  barWrap.innerHTML = `
    <div class="bg-[#0f291e]/85 p-1 rounded-xl grid grid-cols-4 gap-1 text-xs text-center min-w-[280px]">
      ${items
        .map((it) => {
          const isActive = currentFile === it.file || (currentFile === 'suppliers.html' && it.file === 'mall.html');
          return `<a href="${it.file}" class="py-1 px-2 rounded-lg font-bold tracking-wide whitespace-nowrap transition ${
            isActive
              ? 'bg-amber-300 text-emerald-950 shadow-2xs'
              : 'text-emerald-100/80 hover:text-white hover:bg-emerald-800/40'
          }">${it.label}</a>`;
        })
        .join('')}
    </div>
  `;

  if (greenHeader) {
    if (isWideHeader) {
      const topFlexRow = greenHeader.querySelector('.flex.items-center.justify-between, .flex.justify-between');
      if (topFlexRow && topFlexRow.children.length >= 2) {
        barWrap.className = 'mx-auto';
        topFlexRow.insertBefore(barWrap, topFlexRow.children[1]);
        return;
      }
    }
    greenHeader.style.borderTopLeftRadius = '0px';
    greenHeader.style.borderTopRightRadius = '0px';
    greenHeader.style.marginTop = '0px';
    barWrap.className = 'w-full bg-[#143628] border-b border-emerald-800/70 px-3 py-1.5 rounded-t-3xl mx-auto';
    if (greenHeader.parentElement) {
      const mw = getComputedStyle(greenHeader).maxWidth;
      if (mw && mw !== 'none') barWrap.style.maxWidth = mw;
    }
    greenHeader.insertAdjacentElement('beforebegin', barWrap);
  } else {
    barWrap.className = 'w-full bg-[#1b4332] py-1.5 px-3 flex justify-center';
    document.body.insertAdjacentElement('afterbegin', barWrap);
  }
}

function openBridgeSheetModal({ id, title, subtitle, bodyHtml, confirmText, onConfirm, hideFooter = false }) {
  document.getElementById(id)?.remove();
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto';
  wrap.innerHTML = `
    <div class="bg-white border border-stone-200 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 space-y-3.5 shadow-2xl text-xs my-auto">
      <div class="flex justify-between items-start border-b border-stone-100 pb-2.5">
        <div>
          <b class="text-base text-stone-900 block">${title}</b>
          ${subtitle ? `<span class="text-[11px] text-stone-500 mt-0.5 block">${subtitle}</span>` : ''}
        </div>
        <button type="button" id="${id}-close" class="w-7 h-7 rounded-full bg-stone-100 text-stone-500 hover:text-stone-900 font-bold flex items-center justify-center shrink-0">✕</button>
      </div>
      <div class="space-y-3">${bodyHtml}</div>
      ${
        hideFooter
          ? ''
          : `<div class="flex gap-2 pt-1">
               <button type="button" id="${id}-cancel" class="flex-1 py-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold">取消</button>
               <button type="button" id="${id}-submit" class="flex-2 py-2.5 px-5 rounded-2xl bg-[#1b4332] hover:bg-[#143628] text-amber-300 font-bold shadow">${confirmText || '确认提交'}</button>
             </div>`
      }
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  document.getElementById(`${id}-close`)?.addEventListener('click', close);
  document.getElementById(`${id}-cancel`)?.addEventListener('click', close);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) close();
  });
  if (!hideFooter && onConfirm) {
    document.getElementById(`${id}-submit`)?.addEventListener('click', async () => {
      await onConfirm(close);
    });
  }
}

/**
 * 门店柜台轻量收银与收款码安全管理存储（绑定 index.html 原生弹窗 #modal-store-counter-pos）
 */
const POS_PAYCODE_KEY = 'baigong_store_pos_paycode_v1';
const POS_LEDGER_KEY = 'baigong_store_pos_ledger_v1';
const POS_BARCODE_DB_KEY = 'baigong_store_barcode_memory_v1';

function readPosPaycodeConfig() {
  try {
    return JSON.parse(localStorage.getItem(POS_PAYCODE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writePosPaycodeConfig(cfg) {
  localStorage.setItem(POS_PAYCODE_KEY, JSON.stringify(cfg));
}

function readPosLedgerList() {
  try {
    return JSON.parse(localStorage.getItem(POS_LEDGER_KEY) || '[]');
  } catch {
    return [];
  }
}

function writePosLedgerList(list) {
  localStorage.setItem(POS_LEDGER_KEY, JSON.stringify(list));
}

function readBarcodeMemoryDb() {
  try {
    return JSON.parse(localStorage.getItem(POS_BARCODE_DB_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeBarcodeMemoryDb(db) {
  localStorage.setItem(POS_BARCODE_DB_KEY, JSON.stringify(db));
}

function bindNativeStoreCounterPosBindings() {
  let cameraStream = null;
  let selectedPayMethod = '微信/支付宝';

  window.stopStorePosCamera = function () {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    document.getElementById('pos-barcode-scanner-box')?.classList.add('hidden');
  };

  window.closeStoreCounterPosModal = function () {
    window.stopStorePosCamera();
    document.getElementById('modal-store-counter-pos')?.classList.add('hidden');
  };

  window.switchStorePosTab = function (tabName) {
    window.stopStorePosCamera();
    ['collect', 'qr', 'summary'].forEach((k) => {
      const btn = document.getElementById(`pos-tab-${k}`);
      const panel = document.getElementById(`pos-panel-${k}`);
      if (btn) {
        btn.className =
          k === tabName
            ? 'py-1.5 rounded-xl bg-[#1b4332] text-amber-300 shadow-2xs'
            : 'py-1.5 rounded-xl text-stone-700';
      }
      if (panel) panel.classList.toggle('hidden', k !== tabName);
    });
  };

  window.refreshStorePosRoundBtn = function () {
    const amtInput = document.getElementById('pos-collect-amt');
    const roundBtn = document.getElementById('btn-pos-round-down');
    const val = parseFloat(amtInput?.value || '0');
    const fl = Math.floor(val);
    if (roundBtn) {
      if (val > fl && fl > 0) {
        roundBtn.innerText = `✂️ 抹零收 ¥${fl}`;
        roundBtn.classList.remove('hidden');
      } else {
        roundBtn.classList.add('hidden');
      }
    }
  };

  window.applyStorePosRoundDown = function () {
    const amtInput = document.getElementById('pos-collect-amt');
    const fl = Math.floor(parseFloat(amtInput?.value || '0'));
    if (fl > 0 && amtInput) {
      amtInput.value = fl.toFixed(2);
      document.getElementById('btn-pos-round-down')?.classList.add('hidden');
    }
  };

  window.pressStorePosKey = function (k) {
    const amtInput = document.getElementById('pos-collect-amt');
    if (!amtInput) return;
    if (k === '清空') amtInput.value = '';
    else if (k === '退格') amtInput.value = String(amtInput.value || '').slice(0, -1);
    else if (k === '+10') amtInput.value = (parseFloat(amtInput.value || '0') + 10).toFixed(2);
    else if (k === '+50') amtInput.value = (parseFloat(amtInput.value || '0') + 50).toFixed(2);
    else amtInput.value = String(amtInput.value || '') + k;
    window.refreshStorePosRoundBtn();
  };

  window.selectStorePosMethod = function (btnEl, methodName) {
    selectedPayMethod = methodName;
    document.querySelectorAll('.pos-method-btn').forEach((b) => {
      b.className = 'pos-method-btn border border-stone-200 bg-stone-50 text-stone-700 rounded-xl py-2 text-center';
    });
    if (btnEl) {
      btnEl.className = 'pos-method-btn border border-emerald-600 bg-emerald-50 text-emerald-950 rounded-xl py-2 text-center';
    }
  };

  const handleRecognizedBarcode = (code) => {
    const cleanCode = String(code || '').trim();
    if (!cleanCode) return;
    const db = readBarcodeMemoryDb();
    const descInp = document.getElementById('pos-item-desc');
    const amtInput = document.getElementById('pos-collect-amt');
    if (db[cleanCode]) {
      const hit = db[cleanCode];
      if (descInp) descInp.value = hit.name;
      if (amtInput && hit.price > 0) {
        amtInput.value = Number(hit.price).toFixed(2);
        window.refreshStorePosRoundBtn();
      }
      window.stopStorePosCamera();
      alert(`✅ 条码识别成功：${hit.name}（零售价 ¥${Number(hit.price).toFixed(2)}）`);
      return;
    }
    window.stopStorePosCamera();
    const newName = prompt(`首次扫到条码【${cleanCode}】，请输入商品名称（下次再扫自动识别）：`);
    if (!newName || !newName.trim()) return;
    const newPrice = parseFloat(prompt(`请输入【${newName.trim()}】的零售单价（元）：`, '0') || '0');
    db[cleanCode] = { name: newName.trim(), price: isNaN(newPrice) ? 0 : newPrice };
    writeBarcodeMemoryDb(db);
    if (descInp) descInp.value = newName.trim();
    if (amtInput && newPrice > 0) {
      amtInput.value = newPrice.toFixed(2);
      window.refreshStorePosRoundBtn();
    }
  };

  window.lookupManualStoreBarcode = function () {
    const code = document.getElementById('pos-manual-barcode')?.value.trim();
    if (code) handleRecognizedBarcode(code);
  };

  window.startStorePosBarcodeScanner = async function () {
    const box = document.getElementById('pos-barcode-scanner-box');
    const video = document.getElementById('pos-barcode-video');
    box?.classList.remove('hidden');
    if (!navigator.mediaDevices?.getUserMedia || !video) return;

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = cameraStream;
      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] });
        const scanTimer = setInterval(async () => {
          if (!cameraStream) return clearInterval(scanTimer);
          try {
            const codes = await detector.detect(video);
            if (codes?.[0]?.rawValue) {
              clearInterval(scanTimer);
              handleRecognizedBarcode(codes[0].rawValue);
            }
          } catch {
            // 忽略单帧解码波动
          }
        }, 500);
      }
    } catch {
      // 未授权摄像头时保留下方手动条码输入兜底
    }
  };

  function renderStorePosModalState() {
    const storeName = (document.getElementById('store-title')?.innerText || getSavedContactProfile().storeName || '本店柜台').trim();
    const payCfg = readPosPaycodeConfig();
    const todayStr = new Date().toISOString().slice(0, 10);
    const allRows = readPosLedgerList();
    const todayValid = allRows.filter((r) => !r.voided && String(r.createdAt || '').startsWith(todayStr));
    const todayCash = todayValid.filter((r) => r.method === '现金').reduce((s, r) => s + r.amount, 0);
    const todayDigital = todayValid.filter((r) => r.method !== '现金').reduce((s, r) => s + r.amount, 0);
    const todayTotal = todayCash + todayDigital;

    const countBadge = document.getElementById('pos-today-count-badge');
    if (countBadge) countBadge.innerText = String(todayValid.length);
    const sumTotalEl = document.getElementById('pos-sum-total');
    if (sumTotalEl) sumTotalEl.innerText = `¥${todayTotal.toFixed(2)}`;
    const sumDigEl = document.getElementById('pos-sum-digital');
    if (sumDigEl) sumDigEl.innerText = `¥${todayDigital.toFixed(2)}`;
    const sumCashEl = document.getElementById('pos-sum-cash');
    if (sumCashEl) sumCashEl.innerText = `¥${todayCash.toFixed(2)}`;

    const rowsHost = document.getElementById('pos-ledger-rows-container');
    if (rowsHost) {
      rowsHost.innerHTML =
        allRows.slice(0, 15).length === 0
          ? '<p class="text-center text-stone-400 py-4">今日暂无柜台零售流水</p>'
          : allRows
              .slice(0, 15)
              .map(
                (r) => `
              <div class="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 ${r.voided ? 'opacity-50 line-through' : ''}">
                <div>
                  <b class="text-stone-800">${r.itemDesc}</b>
                  <span class="text-[10px] text-stone-500 block">${String(r.createdAt || '').slice(11, 16)} · ${r.method}</span>
                </div>
                <div class="flex items-center gap-2">
                  <b class="font-mono text-emerald-950">¥${Number(r.amount || 0).toFixed(2)}</b>
                  ${
                    r.voided
                      ? '<span class="text-[10px] text-rose-600 font-bold">已作废</span>'
                      : `<button type="button" onclick="window.voidStorePosEntry(${r.id})" class="text-[10px] text-rose-600 underline">作废</button>`
                  }
                </div>
              </div>`
              )
              .join('');
    }

    const hasWx = !!payCfg.wxQr;
    const hasAli = !!payCfg.aliQr;
    const hasLinkedUrl = !!payCfg.linkedCodeText;
    const hasAnyCode = hasWx || hasAli || hasLinkedUrl;

    const verifiedCard = document.getElementById('pos-qr-verified-card');
    const emptyTip = document.getElementById('pos-qr-empty-tip');
    const editor = document.getElementById('pos-paycode-editor');
    const ownerLbl = document.getElementById('pos-qr-owner-label');
    const switchBtns = document.getElementById('pos-qr-switch-btns');
    const stage = document.getElementById('pos-qr-display-stage');
    const linkInput = document.getElementById('pos-link-qr-input');
    if (linkInput && payCfg.linkedCodeText) linkInput.value = payCfg.linkedCodeText;

    if (hasAnyCode) {
      verifiedCard?.classList.remove('hidden');
      emptyTip?.classList.add('hidden');
      editor?.classList.add('hidden');
      if (ownerLbl) ownerLbl.innerText = `🔒 已核验归属：${storeName}`;
      if (switchBtns) {
        switchBtns.innerHTML = [
          hasWx ? '<button type="button" onclick="window.showStoreQrStage(\'wx\')" class="bg-emerald-700 text-white font-bold px-3 py-1 rounded-xl text-[11px]">💚 微信收款码</button>' : '',
          hasAli ? '<button type="button" onclick="window.showStoreQrStage(\'ali\')" class="bg-sky-600 text-white font-bold px-3 py-1 rounded-xl text-[11px]">💙 支付宝收款码</button>' : '',
          hasLinkedUrl ? '<button type="button" onclick="window.showStoreQrStage(\'link\')" class="bg-amber-500 text-stone-950 font-bold px-3 py-1 rounded-xl text-[11px]">🔗 关联收款码</button>' : ''
        ].join('');
      }
      if (stage) {
        const defaultType = hasWx ? 'wx' : hasAli ? 'ali' : 'link';
        window.showStoreQrStage(defaultType);
      }
    } else {
      verifiedCard?.classList.add('hidden');
      emptyTip?.classList.remove('hidden');
      editor?.classList.remove('hidden');
    }
  }

  window.showStoreQrStage = function (kind) {
    const payCfg = readPosPaycodeConfig();
    const stage = document.getElementById('pos-qr-display-stage');
    if (!stage) return;
    if (kind === 'wx' && payCfg.wxQr) {
      stage.innerHTML = `<img src="${payCfg.wxQr}" class="w-52 h-52 object-contain rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xs"/><span class="text-[10px] text-emerald-800 font-bold mt-1.5">💚 微信收款码 · 资金直达掌柜本人 (${payCfg.updatedAt || '已锁定'})</span>`;
    } else if (kind === 'ali' && payCfg.aliQr) {
      stage.innerHTML = `<img src="${payCfg.aliQr}" class="w-52 h-52 object-contain rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xs"/><span class="text-[10px] text-sky-800 font-bold mt-1.5">💙 支付宝收款码 · 资金直达掌柜本人 (${payCfg.updatedAt || '已锁定'})</span>`;
    } else if (kind === 'link' && payCfg.linkedCodeText) {
      stage.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payCfg.linkedCodeText)}" class="w-52 h-52 object-contain rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xs"/><span class="text-[10px] text-amber-900 font-bold mt-1.5">🔗 已关联商户收款码 (${payCfg.updatedAt || '已锁定'})</span>`;
    }
  };

  window.unlockEditStorePaycode = function () {
    const payCfg = readPosPaycodeConfig();
    const inputPin = prompt('🔒 请输入 4 位掌柜安全码以解锁更换收款码：');
    if (inputPin === null) return;
    if (payCfg.pin && inputPin.trim() !== String(payCfg.pin)) {
      return alert('❌ 安全码不正确，非掌柜本人不可更换本店收款码！');
    }
    document.getElementById('pos-paycode-editor')?.classList.remove('hidden');
  };

  const compressQrFileToDataUrl = (file) =>
    new Promise((resolve) => {
      if (!file) return resolve('');
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 480;
          const scale = Math.min(1, maxW / img.width);
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = ev.target?.result;
      };
      reader.readAsDataURL(file);
    });

  window.saveStorePaycodeConfig = async function () {
    const payCfg = readPosPaycodeConfig();
    const pin = document.getElementById('pos-owner-pin')?.value.trim();
    if (!pin || pin.length !== 4) return alert('请设置 4 位掌柜安全码（如 8888），防止他人私自替换收款码！');

    const wxFile = document.getElementById('pos-upload-wx-qr')?.files?.[0];
    const aliFile = document.getElementById('pos-upload-ali-qr')?.files?.[0];
    const linkedText = document.getElementById('pos-link-qr-input')?.value.trim() || '';

    const wxDataUrl = wxFile ? await compressQrFileToDataUrl(wxFile) : payCfg.wxQr || '';
    const aliDataUrl = aliFile ? await compressQrFileToDataUrl(aliFile) : payCfg.aliQr || '';

    if (!wxDataUrl && !aliDataUrl && !linkedText) {
      return alert('请至少上传一张微信/支付宝收款码图片，或填写关联收款码链接！');
    }

    writePosPaycodeConfig({
      wxQr: wxDataUrl,
      aliQr: aliDataUrl,
      linkedCodeText: linkedText,
      pin,
      updatedAt: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    });
    alert('🔒 本店收款码已安全锁定保存！');
    renderStorePosModalState();
  };

  window.saveStorePosEntry = function () {
    const amtInput = document.getElementById('pos-collect-amt');
    const amt = parseFloat(amtInput?.value || '0');
    if (isNaN(amt) || amt <= 0) return alert('请输入有效的实收金额！');
    const descInp = document.getElementById('pos-item-desc');
    const itemDesc = descInp?.value.trim() || '柜台零售';

    const list = readPosLedgerList();
    list.unshift({
      id: Date.now(),
      itemDesc,
      amount: Number(amt.toFixed(2)),
      method: selectedPayMethod,
      voided: false,
      createdAt: new Date().toISOString()
    });
    writePosLedgerList(list);
    if (amtInput) amtInput.value = '';
    if (descInp) descInp.value = '';
    window.closeStoreCounterPosModal();
    alert(`✅ 已记入今日营收：${itemDesc} ¥${amt.toFixed(2)}（${selectedPayMethod}）`);
  };

  window.voidStorePosEntry = function (targetId) {
    if (!confirm('确认作废该笔流水？（作废后将保留划除痕迹，不静默删账）')) return;
    const list = readPosLedgerList().map((r) => (Number(r.id) === Number(targetId) ? { ...r, voided: true } : r));
    writePosLedgerList(list);
    renderStorePosModalState();
  };

  window.copyStorePosClosingWechat = function () {
    const storeName = (document.getElementById('store-title')?.innerText || getSavedContactProfile().storeName || '本店柜台').trim();
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayValid = readPosLedgerList().filter((r) => !r.voided && String(r.createdAt || '').startsWith(todayStr));
    const todayCash = todayValid.filter((r) => r.method === '现金').reduce((s, r) => s + r.amount, 0);
    const todayDigital = todayValid.filter((r) => r.method !== '现金').reduce((s, r) => s + r.amount, 0);
    const todayTotal = todayCash + todayDigital;

    const msg = `🧾【${storeName} · 今日柜台收摊小结】(${todayStr})\n• 今日零售共收：¥${todayTotal.toFixed(2)}（共 ${todayValid.length} 笔）\n• 其中扫码/转账：¥${todayDigital.toFixed(2)}\n• 其中现金收款：¥${todayCash.toFixed(2)}\n账目清晰、日清日结！`;
    navigator.clipboard?.writeText(msg);
    alert(`✅ 今日收摊小结已复制，可直接发微信留存！\n\n${msg}`);
  };

  window.openStoreCounterPosModal = function () {
    renderStorePosModalState();
    window.switchStorePosTab('collect');
    document.getElementById('modal-store-counter-pos')?.classList.remove('hidden');
  };
}

let storeBridgeWatcherStarted = false;
let lastRenderedStoreAgent = '';

/**
 * 1. 门店工作台 (index.html)：仅同步词典、温润空品项提示、源头“凑单开产”接龙与收银绑定（绝不重复注入导航或按钮条）
 */
export async function initStoreTerminalBridge() {
  showWeChatPinGuideIfFirstTime();
  bindNativeStoreCounterPosBindings();
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

    document.querySelectorAll('button, span').forEach((el) => {
      const txt = el.innerText || '';
      if ((txt.includes('有限公司') || txt.includes('供应链') || txt.includes('合作社')) && el.tagName === 'BUTTON') {
        el.style.maxWidth = '135px';
        el.style.overflow = 'hidden';
        el.style.textOverflow = 'ellipsis';
        el.style.whiteSpace = 'nowrap';
      }
    });

    const container =
      document.getElementById('product-container') ||
      document.getElementById('product-list') ||
      document.getElementById('goods-list') ||
      document.getElementById('items-container');

    if (container && container.innerText?.includes('加载遇到波动')) {
      container.innerHTML = `
        <div class="py-10 px-4 text-center text-xs text-stone-500 space-y-2">
          <div class="text-2xl">🌱</div>
          <b class="text-stone-700 block">当前供货方暂未上架公开品项</b>
          <span class="block text-[11px]">您可点击上方切换其他供货方，或点左上角菜单【逛大集】发掘更多源头供货方</span>
        </div>
      `;
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
      const storeTitle = document.getElementById('store-title')?.innerText || profile.storeName || '合作门店';
      openBridgeSheetModal({
        id: 'modal-store-crowd-claim',
        title: '🌾 凑单开产 · 门店认领登记',
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
 * 2. 送货与上门 · 移动一线工作台 (driver.html)
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
  bar.className = 'mx-3 mt-2.5 bg-stone-50 border border-stone-200 p-2.5 rounded-2xl space-y-2 text-xs';
  bar.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-1.5">
      <b class="text-stone-800 text-[11px]">一线现场记账与快捷工具</b>
      <div class="flex flex-wrap items-center gap-1">
        <button type="button" id="btn-palm-sync-offline" onclick="window.flushPalmOfflineQueue()" class="hidden bg-amber-400 text-stone-950 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          待补传 0 笔
        </button>
        <button type="button" onclick="window.openPalmPhotoEvidenceModal()" class="bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          拍照留底
        </button>
        <button type="button" onclick="window.copyDriverDepartureNotice()" class="bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          出发预告
        </button>
        <button type="button" onclick="window.openPalmMapNavigation()" class="bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-bold px-2 py-0.5 rounded-lg text-[10px]">
          地图导航
        </button>
        <button type="button" onclick="window.openPalmQuickWalkInModal()" class="bg-[#1b4332] text-amber-300 font-bold px-2.5 py-0.5 rounded-lg text-[10px]">
          + 现场开单
        </button>
      </div>
    </div>
    <div class="flex gap-1.5">
      <input type="text" id="palm-quick-note-input" placeholder="如：旺顺饭庄收现金800元 / 帮张大爷修好水泵收120元" class="flex-1 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 text-[11px] outline-none focus:border-emerald-800">
      <button type="button" onclick="window.startVoiceInput?.('palm-quick-note-input')" class="bg-stone-200 text-stone-800 font-bold px-2.5 rounded-xl text-[11px] shrink-0">语音</button>
      <button type="button" onclick="window.submitPalmQuickCommand()" class="bg-[#1b4332] text-white font-bold px-3 rounded-xl text-[11px] shrink-0">记一笔</button>
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
      btn.innerText = `待补传 ${q.length} 笔`;
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

  document.querySelectorAll('p, span, div').forEach((el) => {
    if (el.children.length === 0 && el.innerText?.includes('物勒工名·服务归店·产区直达')) {
      el.innerText = '源头直供 · 邻里拼单 · 百业找货找人';
    }
  });
  document.querySelectorAll('button, a').forEach((btn) => {
    const t = btn.innerText || '';
    if (t.includes('进专柜') && !t.includes('4')) {
      btn.style.display = 'none';
    }
    if (t.includes('天街良品') && btn.parentElement) {
      btn.parentElement.style.maxWidth = '680px';
      btn.parentElement.style.marginLeft = 'auto';
      btn.parentElement.style.marginRight = 'auto';
    }
  });

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
