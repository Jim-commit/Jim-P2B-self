import { supabase } from '../../lib/supabase.js';
import { compressImageFile, uploadBlobToStorage, downloadCSV } from '../../utils/storage.js';
import { HQService } from '../../services/hqService.js';
import {
  hqState,
  FORBIDDEN_WORDS,
  isEcommerceAllowed,
  isBrickMortarAllowed,
  isWarehouseBlindPrice,
  isAuditorReadOnly,
  generateUnifiedVoucherNo
} from './hqState.js';

export function extractVoucherMeta(log) {
  const raw = log.remark || '';
  const noMatch = raw.match(/\[单号:([^\]]+)\]/);
  const srcMatch = raw.match(/\[单号:[^\]]+\]\s*\[([^\]]+)\]/);

  const voucherNo = noMatch ? noMatch[1] : `RK-${String(log.id || Date.now()).slice(-6)}`;
  const sourceParty = srcMatch ? srcMatch[1] : log.action_type === 'order_ship' ? '门店受单配发' : '仓库日常作业';
  const prod = hqState.allProducts.find((p) => Number(p.id) === Number(log.product_id) || p.name === log.product_name);
  const goodsValue = (Math.abs(parseInt(log.delta_qty || 0)) * parseFloat(prod?.tier_1_price || 0)).toFixed(2);
  const cleanNote = raw
    .replace(/\[单号:[^\]]+\]/g, '')
    .replace(/\[门店ID:\d+\]/g, '')
    .replace(/\[冲抵金额:¥[0-9.]+\]/g, '')
    .replace(/\[[^\]]+\]/g, '')
    .trim();

  return { voucherNo, sourceParty, goodsValue, cleanNote };
}

export function populateCategoryDropdowns() {
  const l1List = hqState.allPlatformCats.filter((c) => c.level === 1);
  const l1Select = document.getElementById('prod-cat-main');
  if (!l1Select) return;
  l1Select.innerHTML = l1List.map((c) => `<option value="${c.name}" data-id="${c.id}">${c.name}</option>`).join('');
  if (l1List.length > 0) window.onMainCategoryChange(l1List[0].name);
}

export function renderProductFilterBar() {
  const bar = document.getElementById('product-tags-filter');
  if (!bar) return;
  const dynamicTags = new Set(['🔥 门店常备', '🌾 合作社直供', '🔄 余缺平价调剂', '💎 阳光工价·诚意价']);
  hqState.allProducts.forEach((p) => (Array.isArray(p.tags) ? p.tags : []).forEach((t) => dynamicTags.add(t)));
  const allTagList = ['全部', ...Array.from(dynamicTags)];
  bar.innerHTML =
    `<span class="text-stone-400 text-[11px] self-center mr-1">特色快筛:</span>` +
    allTagList
      .map(
        (t) => `
      <button onclick="window.filterProductByTag('${t}')" class="px-2.5 py-0.5 rounded-lg text-[10px] transition ${
          hqState.activeProdFilter === t ? 'bg-[#1b4332] text-white font-bold' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
        }">${t}</button>
    `
      )
      .join('');
}

export function renderProductTable() {
  const tbody = document.getElementById('product-table-body');
  if (!tbody) return;
  const defaultMin = parseInt(hqState.globalPolicy.defaultMinStock ?? 10);
  let filtered =
    hqState.activeProdFilter === '全部'
      ? hqState.allProducts
      : hqState.allProducts.filter((p) => Array.isArray(p.tags) && p.tags.includes(hqState.activeProdFilter));

  if (hqState.onlyLowStockFilter) {
    filtered = filtered.filter((p) => parseInt(p.stock ?? 0) <= parseInt(p.custom_specs?.min_stock ?? defaultMin));
  }
  if (hqState.onlyDraftFilter) {
    filtered = filtered.filter((p) => p.status === 'draft');
  }
  if (hqState.activeProdSearch) {
    filtered = filtered.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(hqState.activeProdSearch) ||
        (p.barcode || '').toLowerCase().includes(hqState.activeProdSearch) ||
        (p.spec || '').toLowerCase().includes(hqState.activeProdSearch) ||
        JSON.stringify(p.custom_specs || {}).toLowerCase().includes(hqState.activeProdSearch)
    );
  }

  const blindPrice = isWarehouseBlindPrice();
  const readOnly = isAuditorReadOnly();

  tbody.innerHTML =
    filtered.length === 0
      ? '<tr><td colspan="10" class="p-8 text-center text-stone-400">未找到匹配的货品记录</td></tr>'
      : filtered
          .map((p) => {
            const tags = Array.isArray(p.tags) ? p.tags : [];
            const tagBadges = tags.map((t) => `<span class="bg-emerald-50 text-emerald-900 border border-emerald-200 px-1.5 py-0.2 rounded text-[10px] mr-1">${t}</span>`).join('');
            const isBM = isBrickMortarAllowed(p);
            const isEC = isEcommerceAllowed(p);
            const isDraft = p.status === 'draft';
            const isRectify = p.status === 'rectify_required';
            const rectifyNote = p.custom_specs?.rectify_note || '';

            let channelBadges = '';
            if (isDraft) {
              channelBadges += '<span class="bg-amber-200 text-amber-950 text-[10px] px-1.5 py-0.5 rounded font-bold mr-1 animate-pulse">⏳ 待定价草稿</span>';
            } else if (isRectify) {
              channelBadges += `<span class="bg-amber-500 text-stone-950 text-[10px] px-1.5 py-0.5 rounded font-bold mr-1" title="${rectifyNote}">📜 待润色完善</span>`;
            } else {
              if (isBM) channelBadges += '<span class="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] px-1.5 py-0.5 rounded font-bold mr-1">🏬 实体店批发</span>';
              if (isEC) channelBadges += '<span class="bg-blue-100 text-blue-900 border border-blue-300 text-[10px] px-1.5 py-0.5 rounded font-bold">🌐 天街专柜</span>';
            }

            const customAttrs = p.custom_specs && typeof p.custom_specs === 'object' && p.custom_specs.attrs ? p.custom_specs.attrs : {};
            const attrBadges = Object.entries(customAttrs)
              .map(([k, v]) => `<span class="inline-block bg-stone-100 text-stone-700 border border-stone-200 px-1.5 py-0.2 rounded text-[10px] mr-1 mt-0.5">${k}: <b>${v}</b></span>`)
              .join('');

            const expDate = p.custom_specs?.expiry_date || '';
            const expBadge = expDate ? `<span class="block text-[10px] font-mono text-amber-800 mt-0.5">效期至: ${expDate}</span>` : '';
            const curStock = parseInt(p.stock ?? 0);
            const minLine = parseInt(p.custom_specs?.min_stock ?? defaultMin);
            const isLow = curStock <= minLine;

            const priceColsHtml = blindPrice
              ? ''
              : `
                <td class="p-2.5 font-mono font-bold text-emerald-800">
                  <span class="cursor-pointer hover:bg-emerald-50 px-1.5 py-0.5 rounded border border-transparent hover:border-emerald-200" onclick="window.quickEditPrice(${p.id}, ${p.tier_1_price})">¥${p.tier_1_price} ✏️</span>
                </td>
                <td class="p-2.5 font-mono text-amber-900 font-bold">¥${p.tier_2_price || p.tier_1_price}</td>
              `;

            const opsHtml = readOnly
              ? '<span class="text-stone-300 text-[10px]">受限只读</span>'
              : blindPrice
              ? `<button onclick="window.openEditProductModal(${p.id})" class="text-[11px] text-emerald-800 font-bold hover:underline">完善实物</button>`
              : `
                <button onclick="window.openEditProductModal(${p.id})" class="text-[11px] text-emerald-800 font-bold hover:underline">${isDraft ? '定价上架' : isRectify ? '润色重上' : '编辑'}</button>
                <button onclick="window.deleteProduct(${p.id}, '${p.name}')" class="text-[11px] text-rose-600 font-bold hover:underline">删除</button>
              `;

            return `
              <tr class="hover:bg-stone-50 transition ${isDraft ? 'bg-amber-50/30' : ''}">
                <td class="p-2.5">${p.image_url ? `<img src="${p.image_url}" class="w-10 h-10 rounded-xl object-cover border border-stone-200">` : `<div class="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[9px] text-stone-400">无图</div>`}</td>
                <td class="p-2.5 font-bold">${channelBadges || '<span class="text-stone-300 text-[10px]">未投放</span>'}</td>
                <td class="p-2.5 text-stone-600 font-sans whitespace-normal max-w-[200px]">
                  <div class="text-[11px]">${p.category_main || '常规'} ➔ ${p.category_sub || '通用'} ${p.category_tertiary ? `<b class="text-amber-800">(${p.category_tertiary})</b>` : ''}</div>
                  <div>${attrBadges}</div>
                </td>
                <td class="p-2.5 font-sans">
                  <b class="text-stone-900 block">${p.name}</b>
                  <button type="button" onclick="window.openTraceCardModal(${p.id})" class="font-mono text-[10px] text-emerald-800 hover:underline font-bold">
                    🌾 溯源卡 ${p.trace_code_prefix || 'QC-'}${p.id} ${p.barcode ? '· 码:' + p.barcode : ''}
                  </button>
                </td>
                <td class="p-2.5">${tagBadges || '-'}</td>
                <td class="p-2.5 font-mono">${p.spec || '整装'} / ${p.measure_unit || '件'}${expBadge}</td>
                ${priceColsHtml}
                <td class="p-2.5 font-mono">
                  <button onclick="window.openStockOpsModal(${p.id})" class="px-2.5 py-1 rounded-xl font-bold border transition active:scale-95 ${
              isLow ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse' : 'bg-emerald-50 text-emerald-950 border-emerald-200 hover:bg-emerald-100'
            }" title="点击开具 RK入库单 或 CK出库单">${curStock} ${p.measure_unit || '件'} ⚙️</button>
                </td>
                <td class="p-2.5 text-right space-x-1.5">${opsHtml}</td>
              </tr>
            `;
          })
          .join('');
}

export function renderInventoryLogs() {
  const box = document.getElementById('inventory-log-list');
  if (!box) return;

  const list = hqState.invVoucherSearch
    ? hqState.allInventoryLogs.filter(
        (l) =>
          (l.product_name || '').toLowerCase().includes(hqState.invVoucherSearch) ||
          (l.remark || '').toLowerCase().includes(hqState.invVoucherSearch) ||
          (l.operator_name || '').toLowerCase().includes(hqState.invVoucherSearch)
      )
    : hqState.allInventoryLogs;

  if (list.length === 0) {
    box.innerHTML = '<div class="py-6 text-center text-stone-400">暂无匹配的单据记录。</div>';
    return;
  }

  box.innerHTML = list
    .map((l) => {
      const origIdx = hqState.allInventoryLogs.indexOf(l);
      const isDamageClaim = l.action_type === 'qc_damage_claim';
      const isPlus = parseInt(l.delta_qty || 0) >= 0;
      const typeLabel = isDamageClaim ? 'DS-内部定损单' : isPlus ? 'RK-统一入库单' : 'CK-统一出库单';
      const { voucherNo, sourceParty, goodsValue, cleanNote } = extractVoucherMeta(l);

      const isClaimSettled = String(l.remark || '').includes('[已核准冲账]');
      const claimBtnHtml =
        isDamageClaim && !isWarehouseBlindPrice() && !isAuditorReadOnly() && hqState.currentRoleCode !== 'sales'
          ? isClaimSettled
            ? '<span class="text-[10px] text-emerald-700 font-bold">✓ 已核准冲账</span>'
            : `<button type="button" onclick="window.approveInternalDamageClaim(${l.id})" class="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-xl font-bold text-[10px] shadow-2xs">✅ 核准冲减欠款</button>`
          : '';

      return `
        <div class="py-2.5 flex flex-wrap justify-between items-center gap-2 ${isDamageClaim && !isClaimSettled ? 'bg-rose-50/40 px-2 rounded-2xl' : ''}">
          <div class="space-y-0.5">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="font-mono text-[10px] bg-stone-200 text-stone-800 px-1.5 py-0.2 rounded font-bold">${voucherNo}</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-bold ${
                isDamageClaim ? 'bg-rose-100 text-rose-900' : isPlus ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
              }">${typeLabel}</span>
              <b class="text-stone-900">${l.product_name}</b>
              <span class="text-[10px] bg-white text-stone-700 border border-stone-200 px-1.5 py-0.2 rounded">${sourceParty}</span>
            </div>
            <div class="text-[10px] text-stone-400 font-mono">
              经手人: ${l.operator_name || '仓管'} · 时间: ${new Date(l.created_at).toLocaleString()} ${cleanNote ? `· 详情: ${cleanNote}` : ''}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            ${
              isDamageClaim
                ? ''
                : `<div class="text-right font-mono">
                    <b class="${isPlus ? 'text-emerald-700' : 'text-rose-700'} font-bold">${isPlus ? '+' + l.delta_qty : l.delta_qty}</b>
                    <span class="text-stone-400 text-[10px] ml-1">(${l.before_stock} ➔ ${l.after_stock})</span>
                    ${isWarehouseBlindPrice() ? '' : `<span class="text-[10px] text-stone-600 block">货值: ¥${goodsValue}</span>`}
                  </div>`
            }
            ${claimBtnHtml}
            <button type="button" onclick="window.openStockVoucherPrint(${origIdx})" class="bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 px-2.5 py-1 rounded-xl font-bold text-[10px] shadow-2xs transition">
              🖨️ 凭单
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderTagChips() {
  const box = document.getElementById('quick-tags-box');
  if (!box) return;
  const defaultChips = ['🌾 合作社直供', '🔥 门店常备', '🔄 余缺平价调剂', '💎 阳光工价·诚意价', '❄️ 需冷藏保鲜', '🤝 抱团集采惠'];
  const allUnique = Array.from(new Set([...defaultChips, ...hqState.selectedTags]));
  box.innerHTML = allUnique
    .map((t) => {
      const isSel = hqState.selectedTags.includes(t);
      return `<button type="button" onclick="window.toggleTag('${t}')" class="${
        isSel ? 'bg-[#1b4332] text-white font-bold border-[#1b4332]' : 'bg-white text-stone-700 border-stone-200'
      } border px-2 py-0.5 rounded-lg text-[10px] transition">${t} ${isSel ? '✓' : ''}</button>`;
    })
    .join('');
}

function applyChannelPermissions(tenant, prod = null) {
  const bmChk = document.getElementById('chk-channel-bm');
  const ecChk = document.getElementById('chk-channel-ec');
  const bmLock = document.getElementById('lock-channel-bm');
  const ecLock = document.getElementById('lock-channel-ec');

  const permitBM = tenant?.permit_brick_and_mortar !== false && tenant?.service_mode !== '电子商务';
  const permitEC = tenant?.permit_ecommerce !== false && tenant?.service_mode !== '实体店';

  bmChk.disabled = !permitBM;
  bmLock.classList.toggle('hidden', permitBM);
  bmChk.checked = permitBM ? (prod ? isBrickMortarAllowed(prod) : true) : false;

  ecChk.disabled = !permitEC;
  ecLock.classList.toggle('hidden', permitEC);
  ecChk.checked = permitEC ? (prod ? isEcommerceAllowed(prod) : true) : false;
}

function checkProductCompliance(name, summaryText, price, targetStatus) {
  const combinedText = `${name} ${summaryText}`;
  const hitWords = FORBIDDEN_WORDS.filter((w) => combinedText.includes(w));
  if (hitWords.length > 0) {
    return `⚠️ 温馨合规提示：货品名称或对外简介中包含广告法慎用词【${hitWords.join('、')}】，烦请稍作润色后再提交！`;
  }
  if (targetStatus === 'active') {
    if (isNaN(price) || price <= 0) {
      return `⚠️ 正式上架前请先设定有效的【${hqState.globalPolicy.tier1Name}】（若为仓管人员录入，请点「💾 暂存草稿」交由掌柜定价）。`;
    }
    if (!hqState.uploadedImageBase64) {
      return `⚠️ 正式上架需要上传清晰的「实拍照」以保障交易透明（可先点「💾 暂存草稿」，补拍照片后再正式上架）。`;
    }
  }
  return '';
}

export function initInventoryBindings() {
  window.onMainCategoryChange = function (mainCatName) {
    const l1Obj = hqState.allPlatformCats.find((c) => c.level === 1 && c.name === mainCatName);
    const subSelect = document.getElementById('prod-cat-sub');
    if (!l1Obj || !subSelect) return;
    const subs = hqState.allPlatformCats.filter((c) => c.level === 2 && c.parent_id === l1Obj.id);
    subSelect.innerHTML = subs.map((s) => `<option value="${s.name}">${s.name}</option>`).join('');
  };

  window.onProductSearchInput = function (val) {
    hqState.activeProdSearch = (val || '').trim().toLowerCase();
    renderProductTable();
  };

  window.onProductSearchKeydown = function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = (e.target.value || '').trim();
    if (!raw) return;
    const exactMatch = hqState.allProducts.find(
      (p) => (p.barcode && p.barcode.trim().toLowerCase() === raw.toLowerCase()) || p.name.toLowerCase() === raw.toLowerCase()
    );
    if (exactMatch) window.openStockOpsModal(exactMatch.id);
  };

  window.clearProductSearch = function () {
    hqState.activeProdSearch = '';
    hqState.onlyLowStockFilter = false;
    hqState.onlyDraftFilter = false;
    const input = document.getElementById('prod-search-input');
    if (input) input.value = '';
    const btnLow = document.getElementById('btn-low-stock-filter');
    if (btnLow) {
      btnLow.className = 'text-[11px] bg-white hover:bg-rose-50 text-stone-700 border border-stone-200 px-2.5 py-1.5 rounded-xl font-bold transition';
    }
    const btnDraft = document.getElementById('btn-draft-filter');
    if (btnDraft) {
      btnDraft.className = 'text-[11px] bg-white hover:bg-amber-50 text-stone-700 border border-stone-200 px-2.5 py-1.5 rounded-xl font-bold transition';
    }
    renderProductTable();
  };

  window.filterProductByTag = function (tag) {
    hqState.activeProdFilter = tag;
    renderProductFilterBar();
    renderProductTable();
  };

  window.filterLowStockOnly = function (flag) {
    hqState.onlyLowStockFilter = !!flag;
    const btn = document.getElementById('btn-low-stock-filter');
    if (btn) {
      btn.className = hqState.onlyLowStockFilter
        ? 'text-[11px] bg-rose-600 text-white px-2.5 py-1.5 rounded-xl font-bold transition'
        : 'text-[11px] bg-white hover:bg-rose-50 text-stone-700 border border-stone-200 px-2.5 py-1.5 rounded-xl font-bold transition';
    }
    renderProductTable();
  };

  window.toggleLowStockFilter = () => window.filterLowStockOnly(!hqState.onlyLowStockFilter);

  window.toggleDraftOnlyFilter = function () {
    hqState.onlyDraftFilter = !hqState.onlyDraftFilter;
    const btn = document.getElementById('btn-draft-filter');
    if (btn) {
      btn.className = hqState.onlyDraftFilter
        ? 'text-[11px] bg-amber-500 text-stone-950 px-2.5 py-1.5 rounded-xl font-bold transition'
        : 'text-[11px] bg-white hover:bg-amber-50 text-stone-700 border border-stone-200 px-2.5 py-1.5 rounded-xl font-bold transition';
    }
    renderProductTable();
  };

  window.filterInventoryVouchers = function (val) {
    hqState.invVoucherSearch = (val || '').trim().toLowerCase();
    renderInventoryLogs();
  };

  window.openStockOpsModal = function (prodId) {
    if (isAuditorReadOnly()) return alert('🔍 独立稽核账号仅限只读查验单据，不可制单改动库存。');
    if (hqState.currentRoleCode === 'finance' || hqState.currentRoleCode === 'sales') {
      return alert('⚠️ 当前岗位不直接操作仓库实物出入库，请由仓储调度制单。');
    }
    const p = hqState.allProducts.find((x) => x.id === prodId);
    if (!p) return;
    const curStock = parseInt(p.stock ?? 0);
    const unit = p.measure_unit || '件';

    document.getElementById('stock-ops-prod-id').value = p.id;
    document.getElementById('stock-ops-cur-stock').value = curStock;
    document.getElementById('stock-ops-title').innerText = `📦 开具极简入库/出库单 · ${p.name}`;
    document.getElementById('stock-ops-subtitle').innerText = isWarehouseBlindPrice()
      ? `当前账面库存：${curStock} ${unit}`
      : `当前账面库存：${curStock} ${unit} · 批发基准价 ¥${p.tier_1_price}`;
    document.getElementById('stock-ops-qty-input').value = '';
    document.getElementById('stock-ops-source').value = '';
    document.getElementById('stock-ops-operator').value = hqState.currentOperatorName;
    document.getElementById('stock-ops-remark').value = '';
    window.setStockOpsMode('in_purchase');
    window.openModal('modal-stock-ops');
  };

  window.setStockOpsMode = function (mode) {
    hqState.currentStockOpsMode = mode;
    const prefix = mode === 'out_loss' ? 'CK' : 'RK';
    hqState.currentVoucherNo = generateUnifiedVoucherNo(prefix);
    const voucherEl = document.getElementById('stock-ops-voucher-no');
    if (voucherEl) voucherEl.innerText = hqState.currentVoucherNo;

    const btns = {
      in_purchase: document.getElementById('btn-mode-in'),
      out_loss: document.getElementById('btn-mode-out'),
      audit_adjust: document.getElementById('btn-mode-audit')
    };
    Object.entries(btns).forEach(([k, el]) => {
      if (!el) return;
      el.className = k === mode ? 'py-1.5 rounded-lg bg-[#1b4332] text-white transition' : 'py-1.5 rounded-lg text-stone-600 transition';
    });

    const subSelect = document.getElementById('stock-ops-subtype');
    const label = document.getElementById('stock-ops-qty-label');
    const srcLabel = document.getElementById('stock-ops-source-label');
    const srcInput = document.getElementById('stock-ops-source');
    if (mode === 'in_purchase') {
      if (subSelect) {
        subSelect.innerHTML = `
          <option value="采收/完工入库">🌾 采收 / 完工新品入库</option>
          <option value="门店退货回库">🔄 门店退货完好回库</option>
          <option value="他库调入">🚚 其他分仓调拨入库</option>
        `;
      }
      label.innerText = '本次入库数量 (+) *：';
      if (srcLabel) srcLabel.innerText = '供货产区 / 交货班组 *：';
      if (srcInput) srcInput.placeholder = '例：伏牛山种植合作社一组 / 加工车间一班';
    } else if (mode === 'out_loss') {
      if (subSelect) {
        subSelect.innerHTML = `
          <option value="损耗/领用出库">📉 损耗 / 样品 / 内部领用出库</option>
          <option value="调出他库">🚚 调拨出库至其他分仓</option>
        `;
      }
      label.innerText = '本次出库数量 (-) *：';
      if (srcLabel) srcLabel.innerText = '领用部门 / 去向单位 *：';
      if (srcInput) srcInput.placeholder = '例：展销品鉴样品 / 运输破损报废 / 调出西区仓';
    } else {
      if (subSelect) subSelect.innerHTML = `<option value="实地盘点校准">⚖️ 仓库实地清点校准</option>`;
      label.innerText = '仓库实地清点后的实际库存总数 (=) *：';
      if (srcLabel) srcLabel.innerText = '盘点库区 / 监盘人 *：';
      if (srcInput) srcInput.placeholder = '例：一号恒温总仓 · 财务监盘';
    }
  };

  window.submitStockOperation = async function () {
    const prodId = parseInt(document.getElementById('stock-ops-prod-id').value);
    const curStock = parseInt(document.getElementById('stock-ops-cur-stock').value) || 0;
    const inputVal = parseInt(document.getElementById('stock-ops-qty-input').value);
    const subType = document.getElementById('stock-ops-subtype')?.value || '采收/完工入库';
    const sourceParty = document.getElementById('stock-ops-source').value.trim();
    const operator = document.getElementById('stock-ops-operator').value.trim() || hqState.currentOperatorName;
    const remark = document.getElementById('stock-ops-remark').value.trim();

    if (isNaN(inputVal) || inputVal < 0) return alert('请输入有效的正整数量！');
    if (!sourceParty) return alert('请填写供货产区 / 领用去向 / 盘点库区，以便财务与仓库稽核！');

    const p = hqState.allProducts.find((x) => x.id === prodId);
    if (!p) return;

    let afterStock = curStock;
    let deltaQty = 0;

    if (hqState.currentStockOpsMode === 'in_purchase') {
      if (inputVal === 0) return alert('入库数量需大于 0！');
      deltaQty = inputVal;
      afterStock = curStock + inputVal;
    } else if (hqState.currentStockOpsMode === 'out_loss') {
      if (inputVal === 0) return alert('出库数量需大于 0！');
      deltaQty = -inputVal;
      afterStock = Math.max(0, curStock - inputVal);
    } else {
      afterStock = inputVal;
      deltaQty = afterStock - curStock;
    }

    const execStockWrite = async () => {
      const { error: uErr } = await supabase.from('product').update({ stock: afterStock }).eq('id', prodId);
      if (uErr) return alert('更新库存失败：' + uErr.message);

      const voucherNo = hqState.currentVoucherNo || generateUnifiedVoucherNo(deltaQty >= 0 ? 'RK' : 'CK');
      const fullRemark = `[单号:${voucherNo}] [${subType} · ${sourceParty}] ${remark}`.trim();

      await HQService.recordInventoryChange(hqState.currentAgent, {
        tenant_id: hqState.currentAgent,
        product_id: prodId,
        product_name: p.name,
        action_type: hqState.currentStockOpsMode,
        delta_qty: deltaQty,
        before_stock: curStock,
        after_stock: afterStock,
        operator_name: operator,
        remark: fullRemark,
        created_at: new Date().toISOString()
      });

      alert(
        `✅ 单据已制单入账！\n\n` +
          `• 正式单号：${voucherNo}\n` +
          `• 单据子类：${subType}\n` +
          `• 货品名称：${p.name}\n` +
          `• 库存变动：${curStock} ➔ ${afterStock} ${p.measure_unit || '件'}`
      );
      window.closeModal('modal-stock-ops');
      window.loadHQData();
    };

    if (hqState.globalPolicy.twoFaStockAuditOn && hqState.currentRoleCode === 'owner' && (hqState.currentStockOpsMode === 'out_loss' || deltaQty < 0)) {
      window.trigger2FAAction(`仓库盘亏/损耗出库核销 (${deltaQty} ${p.measure_unit || '件'})，请输入验证器 6 位动态码授权：`, execStockWrite);
    } else {
      await execStockWrite();
    }
  };

  window.openStockVoucherPrint = function (logIdx) {
    const log = hqState.allInventoryLogs[logIdx];
    if (!log) return;
    const { voucherNo, sourceParty, goodsValue, cleanNote } = extractVoucherMeta(log);
    const isDamageClaim = log.action_type === 'qc_damage_claim';
    const isPlus = parseInt(log.delta_qty || 0) >= 0;

    document.getElementById('sv-print-title').innerText = `${hqState.currentTenantData?.company_name || hqState.currentAgent} · ${
      isDamageClaim ? '实地定损鉴证凭单' : isPlus ? '统一入库核验凭单 (RK)' : '统一出库核验凭单 (CK)'
    }`;
    document.getElementById('sv-print-voucher-no').innerText = `正式单据编号：${voucherNo}`;
    document.getElementById('sv-print-type').innerText = isDamageClaim ? '商号内部定损单 (DS)' : isPlus ? '统一入库单 (RK)' : '统一出库单 (CK)';
    document.getElementById('sv-print-time').innerText = log.created_at ? new Date(log.created_at).toLocaleString() : new Date().toLocaleString();
    document.getElementById('sv-print-source').innerText = sourceParty;
    document.getElementById('sv-print-operator').innerText = log.operator_name || '仓管';

    const deltaStr = parseInt(log.delta_qty) >= 0 ? `+${log.delta_qty}` : `${log.delta_qty}`;
    const valueCellHtml = isWarehouseBlindPrice() ? '' : `<td class="border border-stone-400 p-2 text-right font-mono font-bold">¥${goodsValue}</td>`;

    document.getElementById('sv-print-tbody').innerHTML = `
      <tr>
        <td class="border border-stone-400 p-2 font-bold">${log.product_name}</td>
        <td class="border border-stone-400 p-2 text-center font-mono">${log.before_stock}</td>
        <td class="border border-stone-400 p-2 text-center font-mono font-bold">${deltaStr}</td>
        <td class="border border-stone-400 p-2 text-center font-mono font-bold">${log.after_stock}</td>
        ${valueCellHtml}
      </tr>
    `;
    document.getElementById('sv-print-remark').innerText = `事由与批次备注：${cleanNote || '正常单据核销'}`;
    window.openModal('modal-stock-voucher-print');
  };

  window.executeStockVoucherPrint = function () {
    document.body.classList.remove('print-single-slip');
    document.body.classList.add('print-stock-voucher');
    window.print();
    setTimeout(() => document.body.classList.remove('print-stock-voucher'), 500);
  };

  window.approveInternalDamageClaim = async function (logId) {
    if (isAuditorReadOnly() || isWarehouseBlindPrice() || hqState.currentRoleCode === 'sales') {
      return alert('⚠️ 仅大当家或账房财务有权核准定损单并冲减门店欠款。');
    }
    const log = hqState.allInventoryLogs.find((x) => Number(x.id) === Number(logId));
    if (!log) return;

    const meta = extractVoucherMeta(log);
    const amtMatch = (log.remark || '').match(/\[冲抵金额:¥([0-9.]+)\]/);
    const storeIdMatch = (log.remark || '').match(/\[门店ID:(\d+)\]/);
    const deductAmt = amtMatch ? parseFloat(amtMatch[1]) : 0;
    const storeId = storeIdMatch ? parseInt(storeIdMatch[1]) : 0;
    const store = hqState.allStores.find((s) => Number(s.id) === storeId);

    const confirmMsg =
      `【商号内部定损裁定】单号：${meta.voucherNo}\n` +
      `• 涉及门店：${meta.sourceParty}\n` +
      `• 定损说明：${meta.cleanNote}\n` +
      `• 核准退赔冲抵金额：¥${deductAmt.toFixed(2)}\n\n` +
      `确认核准该笔内部定损单，并自动从该门店在账欠款中冲减 ¥${deductAmt.toFixed(2)} 吗？`;

    if (!confirm(confirmMsg)) return;

    if (store && deductAmt > 0) {
      const nextDebt = Math.max(0, Number((parseFloat(store.current_debt || 0) - deductAmt).toFixed(2)));
      await supabase.from('store').update({ current_debt: nextDebt }).eq('id', store.id);
    }

    const nextRemark = `${log.remark || ''} [已核准冲账 · 经手:${hqState.currentOperatorName}]`.trim();
    await supabase.from('inventory_log').update({ remark: nextRemark }).eq('id', log.id);

    alert(`✅ 内部定损单 ${meta.voucherNo} 已核准并完成账目冲抵！`);
    window.loadHQData();
  };

  window.addCustomAttrRow = function (keyVal = '', valStr = '') {
    const box = document.getElementById('custom-attrs-container');
    const row = document.createElement('div');
    row.className = 'flex items-center gap-1.5 custom-attr-row';
    row.innerHTML = `
      <input type="text" placeholder="属性名(如:材质/保质期)" value="${keyVal}" class="attr-key w-1/3 bg-white border border-amber-300 rounded-xl px-2.5 py-1 text-xs outline-none font-bold">
      <input type="text" placeholder="属性值(如:304钢/12个月)" value="${valStr}" class="attr-val flex-1 bg-white border border-amber-300 rounded-xl px-2.5 py-1 text-xs outline-none">
    `;
    box.appendChild(row);
  };

  window.applyIndustryAttrTemplate = function (type) {
    const templates = {
      food: [['保质期', '12个月'], ['贮存方式', '阴凉干燥'], ['执行标准', 'GB标准']],
      hardware: [['材质工艺', '304不锈钢'], ['规格型号', '国标通用'], ['表面处理', '防锈镀锌']],
      service: [['服务范围', '同城及周边乡镇'], ['响应时效', '预约当日上门'], ['质保承诺', '完工验收满意再结']],
      agri: [['有效成分', '高纯度配方'], ['净含量', '25kg/袋'], ['登记证号', '正规备案']]
    };
    const container = document.getElementById('custom-attrs-container');
    if (!container) return;
    container.innerHTML = '';
    (templates[type] || []).forEach(([k, v]) => window.addCustomAttrRow(k, v));
  };

  window.openAddProductModal = function () {
    document.getElementById('prod-modal-title').innerText = '📦 实名保真 · 发布新货品或服务';
    document.getElementById('editing-prod-id').value = '';
    hqState.uploadedImageBase64 = '';
    hqState.selectedTags = [];
    document.getElementById('image-preview-box').innerHTML = '无图';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-barcode').value = '';
    document.getElementById('prod-price').value = '';
    document.getElementById('prod-price-tier2').value = '';
    document.getElementById('prod-stock').value = '100';
    document.getElementById('prod-min-stock').value = String(hqState.globalPolicy.defaultMinStock ?? 10);
    document.getElementById('prod-cat-tertiary').value = '';
    document.getElementById('prod-spec').value = '整装';
    document.getElementById('prod-measure-unit').value = '箱';
    document.getElementById('prod-trace-prefix').value = `${hqState.currentAgent}-QC-`;
    document.getElementById('prod-origin-place').value = '源头合作社/工坊原产';
    document.getElementById('prod-expiry-date').value = '';
    document.getElementById('prod-summary').value = '';
    document.getElementById('prod-remark').value = '';
    document.getElementById('custom-attrs-container').innerHTML = '';
    renderTagChips();
    applyChannelPermissions(hqState.currentTenantData, null);
    window.openModal('product-modal');
  };

  window.openEditProductModal = function (id) {
    const p = hqState.allProducts.find((x) => x.id === id);
    if (!p) return;
    document.getElementById('prod-modal-title').innerText = '✏️ 润饰货品细节与双渠道定价';
    document.getElementById('editing-prod-id').value = p.id;
    applyChannelPermissions(hqState.currentTenantData, p);

    document.getElementById('prod-cat-main').value = p.category_main || '';
    window.onMainCategoryChange(p.category_main || '');
    document.getElementById('prod-cat-sub').value = p.category_sub || '';
    document.getElementById('prod-cat-tertiary').value = p.category_tertiary || '';

    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-barcode').value = p.barcode || '';
    document.getElementById('prod-price').value = p.tier_1_price || '';
    document.getElementById('prod-price-tier2').value = p.tier_2_price || p.tier_1_price || '';
    document.getElementById('prod-stock').value = p.stock ?? 100;
    document.getElementById('prod-min-stock').value = p.custom_specs?.min_stock ?? (hqState.globalPolicy.defaultMinStock ?? 10);
    document.getElementById('prod-spec').value = p.spec || '整装';
    document.getElementById('prod-measure-unit').value = p.measure_unit || '箱';
    document.getElementById('prod-trace-prefix').value = p.trace_code_prefix || 'QC-';
    document.getElementById('prod-origin-place').value = p.origin_place || '源头合作社/工坊原产';
    document.getElementById('prod-expiry-date').value = p.custom_specs?.expiry_date || '';
    document.getElementById('prod-summary').value = p.custom_specs?.summary || p.description || '';
    document.getElementById('prod-remark').value = p.remark || '';

    const attrBox = document.getElementById('custom-attrs-container');
    attrBox.innerHTML = '';
    const attrs = p.custom_specs && p.custom_specs.attrs ? p.custom_specs.attrs : {};
    Object.entries(attrs).forEach(([k, v]) => window.addCustomAttrRow(k, v));

    hqState.uploadedImageBase64 = p.image_url || '';
    document.getElementById('image-preview-box').innerHTML = hqState.uploadedImageBase64 ? `<img src="${hqState.uploadedImageBase64}" class="w-full h-full object-cover">` : '无图';
    hqState.selectedTags = Array.isArray(p.tags) ? [...p.tags] : [];
    renderTagChips();
    window.openModal('product-modal');
  };

  window.closeAddProductModal = () => window.closeModal('product-modal');

  window.submitProductForm = async function (targetStatus = 'active') {
    if (hqState.isUploadingImage) return alert('⏳ 实拍照正在上传图床，请稍候 1 秒！');
    const editId = document.getElementById('editing-prod-id').value;
    const isBM = document.getElementById('chk-channel-bm').checked;
    const isEC = document.getElementById('chk-channel-ec').checked;
    if (!isBM && !isEC) return alert('⚠️ 请至少勾选一个投放渠道！');

    const name = document.getElementById('prod-name').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value);
    const summaryText = document.getElementById('prod-summary')?.value.trim() || '';
    if (!name) return alert('请写明货品或服务全称！');

    const complianceErr = checkProductCompliance(name, summaryText, price, targetStatus);
    if (complianceErr) return alert(complianceErr);

    const attrs = {};
    document.querySelectorAll('#custom-attrs-container .custom-attr-row').forEach((row) => {
      const k = row.querySelector('.attr-key').value.trim();
      const v = row.querySelector('.attr-val').value.trim();
      if (k && v) attrs[k] = v;
    });

    const minStock = parseInt(document.getElementById('prod-min-stock').value) || (hqState.globalPolicy.defaultMinStock ?? 10);
    const expiryDate = document.getElementById('prod-expiry-date')?.value || '';
    const channelLabel = isBM && !isEC ? '实体店' : !isBM && isEC ? '电子商务' : '实体与电商双轨';
    const safeTier1 = !isNaN(price) && price > 0 ? price : 0;
    const rawTier2 = parseFloat(document.getElementById('prod-price-tier2').value);
    const safeTier2 = !isNaN(rawTier2) && rawTier2 > 0 ? rawTier2 : safeTier1;

    const payload = {
      tenant_id: hqState.currentAgent,
      channel_brick_and_mortar: isBM,
      channel_ecommerce: isEC,
      sales_channel_type: channelLabel,
      category_main: document.getElementById('prod-cat-main').value,
      category_sub: document.getElementById('prod-cat-sub').value,
      category_tertiary: document.getElementById('prod-cat-tertiary').value.trim(),
      name,
      barcode: document.getElementById('prod-barcode').value.trim(),
      spec: document.getElementById('prod-spec').value.trim() || '整装',
      measure_unit: document.getElementById('prod-measure-unit').value.trim() || '箱',
      stock: parseInt(document.getElementById('prod-stock').value) || 0,
      tier_1_price: safeTier1,
      tier_2_price: safeTier2,
      trace_code_prefix: document.getElementById('prod-trace-prefix').value.trim() || 'QC-',
      origin_place: document.getElementById('prod-origin-place').value.trim() || '源头合作社/工坊原产',
      image_url: hqState.uploadedImageBase64,
      remark: document.getElementById('prod-remark').value.trim(),
      tags: hqState.selectedTags,
      custom_specs: { attrs, min_stock: minStock, expiry_date: expiryDate, summary: summaryText },
      status: targetStatus
    };

    let res = editId ? await supabase.from('product').update(payload).eq('id', parseInt(editId)) : await supabase.from('product').insert([payload]);
    if (res.error && (res.error.message || '').includes('custom_specs')) {
      delete payload.custom_specs;
      res = editId ? await supabase.from('product').update(payload).eq('id', parseInt(editId)) : await supabase.from('product').insert([payload]);
    }
    if (res.error) return alert('储存失败: ' + res.error.message);

    alert(
      targetStatus === 'draft'
        ? `💾 货品【${name}】已暂存为「待定价草稿」，待完善定价与实拍照后即可正式上架！`
        : `🎉 合规核验通过！货品【${name}】已正式上架生效（投放渠道：${channelLabel}）！`
    );
    window.closeAddProductModal();
    window.loadHQData();
  };

  window.handleImageUpload = async function (event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const compressedBase64 = await compressImageFile(file, 600, 0.75);
      document.getElementById('image-preview-box').innerHTML = `<img src="${compressedBase64}" class="w-full h-full object-cover opacity-60">`;

      hqState.isUploadingImage = true;
      const submitBtn = document.getElementById('btn-submit-product');
      if (submitBtn) submitBtn.innerText = '⏳ 上传图床中...';

      hqState.uploadedImageBase64 = await uploadBlobToStorage(compressedBase64, hqState.currentAgent, 'products');

      hqState.isUploadingImage = false;
      if (submitBtn) submitBtn.innerText = '✅ 合规核验 · 正式上架发布';
      document.getElementById('image-preview-box').innerHTML = `<img src="${hqState.uploadedImageBase64}" class="w-full h-full object-cover">`;
    } catch (e) {
      hqState.isUploadingImage = false;
    }
  };

  window.clearProductImage = () => {
    hqState.uploadedImageBase64 = '';
    document.getElementById('image-preview-box').innerHTML = '无图';
  };

  window.toggleTag = function (tagStr) {
    hqState.selectedTags = hqState.selectedTags.includes(tagStr) ? hqState.selectedTags.filter((t) => t !== tagStr) : [...hqState.selectedTags, tagStr];
    renderTagChips();
  };

  window.promptAddTag = function () {
    const customTag = prompt('输入特色标签（如：🌾 合作社直供、🔄 余缺平价调剂、🤝 抱团集采惠）：');
    if (customTag && customTag.trim()) {
      if (!hqState.selectedTags.includes(customTag.trim())) hqState.selectedTags.push(customTag.trim());
      renderTagChips();
    }
  };

  window.quickEditPrice = function (id, oldPrice) {
    if (isWarehouseBlindPrice() || isAuditorReadOnly()) return;
    const newPrice = prompt(`【调整${hqState.globalPolicy.tier1Name}】原价 ¥${oldPrice}，输入新价格：`, oldPrice);
    if (newPrice !== null && !isNaN(newPrice) && parseFloat(newPrice) > 0) {
      const p = parseFloat(newPrice);
      const maxDropPct = parseFloat(hqState.globalPolicy.twoFaPricePct ?? 15);
      if (hqState.globalPolicy.twoFaPriceOn !== false && (oldPrice - p) / oldPrice > maxDropPct / 100) {
        window.trigger2FAAction(`底价调幅超 ${maxDropPct}% (从 ¥${oldPrice} 调至 ¥${p})，请输入验证器 6 位动态码授权：`, async () => {
          await supabase.from('product').update({ tier_1_price: p }).eq('id', id);
          window.loadHQData();
        });
      } else {
        supabase.from('product').update({ tier_1_price: p }).eq('id', id).then(() => window.loadHQData());
      }
    }
  };

  window.deleteProduct = function (id, name) {
    if (isWarehouseBlindPrice() || isAuditorReadOnly()) return;
    const execDelete = async () => {
      await supabase.from('product').delete().eq('id', id);
      window.loadHQData();
    };
    if (hqState.globalPolicy.twoFaDeleteOn !== false) {
      window.trigger2FAAction(`确认永久删除货品【${name}】？请输入手机验证器 6 位动态码：`, execDelete);
    } else if (confirm(`确认永久删除货品【${name}】？`)) {
      execDelete();
    }
  };

  window.downloadBulkProductTemplate = function () {
    const headers = ['货品全称', hqState.globalPolicy.tier1Name || '批发平准基准价', hqState.globalPolicy.tier2Name || '网上平准零售基准价', '包装规格', '计量单位', '初始库存', '条码', '产地'];
    const sampleRows = [
      ['伏牛山有机五常大米 10kg', '68.00', '78.00', '10kg/袋', '袋', '200', '690123456001', '伏牛山生态合作社'],
      ['农家古法压榨菜籽油 5L', '85.00', '98.00', '4桶/箱', '箱', '120', '690123456002', '源头榨油工坊']
    ];
    downloadCSV('货品批量导入标准模板.csv', headers, sampleRows);
  };

  window.handleBulkCsvFile = function (event) {
    const file = event.target.files[0];
    const previewEl = document.getElementById('bulk-import-preview');
    const btn = document.getElementById('btn-exec-bulk-import');
    hqState.parsedBulkProducts = [];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      const lines = (e.target.result || '').replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length <= 1) {
        if (previewEl) previewEl.innerText = '⚠️ 文件内容为空或仅有表头！';
        if (btn) btn.disabled = true;
        return;
      }
      const l1Default = hqState.allPlatformCats.find((c) => c.level === 1)?.name || '粮油副食';
      const l2Default = hqState.allPlatformCats.find((c) => c.level === 2)?.name || '常规良品';

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
        const name = cols[0];
        const price = parseFloat(cols[1]);
        if (!name || isNaN(price) || price <= 0) continue;
        hqState.parsedBulkProducts.push({
          tenant_id: hqState.currentAgent,
          channel_brick_and_mortar: true,
          channel_ecommerce: true,
          sales_channel_type: '实体与电商双轨',
          category_main: l1Default,
          category_sub: l2Default,
          name,
          tier_1_price: price,
          tier_2_price: parseFloat(cols[2]) || price,
          spec: cols[3] || '整装',
          measure_unit: cols[4] || '件',
          stock: parseInt(cols[5]) || 100,
          barcode: cols[6] || '',
          origin_place: cols[7] || '源头合作社/工坊原产',
          trace_code_prefix: `${hqState.currentAgent}-QC-`,
          tags: ['🌾 合作社直供'],
          status: 'active'
        });
      }
      if (previewEl) {
        previewEl.innerText =
          hqState.parsedBulkProducts.length > 0
            ? `✅ 已成功解析 ${hqState.parsedBulkProducts.length} 款待上架货品，点击下方按钮立即入库！`
            : '⚠️ 未解析到有效货品行，请检查价格是否为数字！';
      }
      if (btn) btn.disabled = hqState.parsedBulkProducts.length === 0;
    };
    reader.readAsText(file, 'UTF-8');
  };

  window.submitBulkProductImport = async function () {
    if (hqState.parsedBulkProducts.length === 0) return;
    const btn = document.getElementById('btn-exec-bulk-import');
    if (btn) {
      btn.disabled = true;
      btn.innerText = '批量入库中...';
    }
    const { error } = await supabase.from('product').insert(hqState.parsedBulkProducts);
    if (btn) {
      btn.disabled = false;
      btn.innerText = '确认批量上架写入云端库';
    }
    if (error) return alert('批量导入失败：' + error.message);
    alert(`🎉 成功批量上架 ${hqState.parsedBulkProducts.length} 款货品！`);
    hqState.parsedBulkProducts = [];
    window.closeModal('modal-bulk-import');
    window.loadHQData();
  };

  window.exportInventorySheetCSV = function () {
    if (hqState.allProducts.length === 0) return alert('暂无货品可导出盘点表！');
    const headers = isWarehouseBlindPrice()
      ? ['货品ID', '货品全称', '规格', '计量单位', '当前账面库存', '实地清点数(手填)', '盘盈/盘亏差异', '内部备注']
      : ['货品ID', '货品全称', '规格', '计量单位', `${hqState.globalPolicy.tier1Name}(元)`, `${hqState.globalPolicy.tier2Name}(元)`, '当前账面库存', '实地清点数(手填)', '盘盈/盘亏差异', '内部备注'];

    const rows = hqState.allProducts.map((p) =>
      isWarehouseBlindPrice()
        ? [p.id, p.name, p.spec || '整装', p.measure_unit || '件', p.stock ?? 0, '', '', p.remark || '']
        : [
            p.id,
            p.name,
            p.spec || '整装',
            p.measure_unit || '件',
            parseFloat(p.tier_1_price || 0).toFixed(2),
            parseFloat(p.tier_2_price || p.tier_1_price || 0).toFixed(2),
            p.stock ?? 0,
            '',
            '',
            p.remark || ''
          ]
    );
    downloadCSV(`${hqState.currentAgent}_仓库实地盘点表_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  window.exportInventoryLogsCSV = function () {
    if (hqState.allInventoryLogs.length === 0) return alert('当前暂无单据记录！');
    const headers = isWarehouseBlindPrice()
      ? ['单据编号', '制单时间', '单据类型', '货品全称', '来源/去向', '变动数量', '变动前库存', '变动后库存', '经手人', '事由备注']
      : ['单据编号', '制单时间', '单据类型', '货品全称', '来源/去向', '变动数量', '变动前库存', '变动后库存', '估算货值(元)', '经手人', '事由备注'];

    const rows = hqState.allInventoryLogs.map((l) => {
      const { voucherNo, sourceParty, goodsValue, cleanNote } = extractVoucherMeta(l);
      const isPlus = parseInt(l.delta_qty) >= 0;
      const typeLabel = l.action_type === 'qc_damage_claim' ? 'DS-内部定损单' : isPlus ? 'RK-统一入库单' : 'CK-统一出库单';
      return isWarehouseBlindPrice()
        ? [
            voucherNo,
            l.created_at ? new Date(l.created_at).toLocaleString() : '',
            typeLabel,
            l.product_name || '',
            sourceParty,
            l.delta_qty ?? 0,
            l.before_stock ?? 0,
            l.after_stock ?? 0,
            l.operator_name || '仓管',
            cleanNote.replace(/[\r\n,]+/g, ' ')
          ]
        : [
            voucherNo,
            l.created_at ? new Date(l.created_at).toLocaleString() : '',
            typeLabel,
            l.product_name || '',
            sourceParty,
            l.delta_qty ?? 0,
            l.before_stock ?? 0,
            l.after_stock ?? 0,
            goodsValue,
            l.operator_name || '仓管',
            cleanNote.replace(/[\r\n,]+/g, ' ')
          ];
    });
    downloadCSV(`${hqState.currentAgent}_极简单据台账_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };
}
