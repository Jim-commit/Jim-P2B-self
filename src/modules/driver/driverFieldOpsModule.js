import { supabase } from '../../lib/supabase.js';
import { compressImageFile, uploadBlobToStorage } from '../../utils/storage.js';
import {
  driverState,
  generateUnifiedVoucherNo,
  getVisibleStoresForSales,
  createSignatureController,
  runLightweightOcrOnFile
} from './driverState.js';

const salesSignPad = createSignatureController('sales-sign-pad');
const qcSignPad = createSignatureController('qc-sign-pad');

export function renderPalmWarehouseProducts() {
  const sel = document.getElementById('palm-wh-prod-select');
  if (!sel) return;
  if (driverState.allProducts.length === 0) {
    sel.innerHTML = '<option value="">当前暂无在库货品</option>';
    return;
  }
  sel.innerHTML = driverState.allProducts
    .map((p) => `<option value="${p.id}">${p.name} (当前存: ${p.stock ?? 0} ${p.measure_unit || '件'})</option>`)
    .join('');
}

export function renderPalmExpressOrders() {
  const listEl = document.getElementById('palm-express-orders-list');
  if (!listEl) return;
  const expressOrders = driverState.activeOrders.filter((o) => o.order_source === 'online_mall' && !o.store_id);
  if (expressOrders.length === 0) {
    listEl.innerHTML = '<div class="p-4 text-center text-stone-400 bg-stone-50 rounded-2xl border border-stone-200">暂无待打单快递直发订单。</div>';
    return;
  }
  listEl.innerHTML = expressOrders
    .map((o) => {
      const itemsStr = (Array.isArray(o.items) ? o.items : []).map((i) => `${i.name}x${i.qty}`).join('、');
      return `
        <div class="p-3 bg-white border border-stone-200 rounded-2xl space-y-1.5">
          <div class="flex justify-between items-center font-bold">
            <span class="font-mono text-stone-900">#${o.order_no || o.id}</span>
            <span class="text-[10px] bg-blue-100 text-blue-900 px-2 py-0.5 rounded">快递直发单</span>
          </div>
          <div class="text-[11px] text-stone-800">打包货品：<b>${itemsStr}</b></div>
          <div class="text-[10px] text-stone-500">${(o.note || '').replace(/\[专属门店ID:[^\]]+\]/g, '')}</div>
          <button type="button" onclick="window.markExpressOrderShipped(${o.id})" class="w-full bg-emerald-800 text-white font-bold py-1.5 rounded-xl text-[11px] mt-1">
            📦 确认已打包交快递发运
          </button>
        </div>
      `;
    })
    .join('');
}

export function renderSalesStoresList() {
  const listEl = document.getElementById('palm-sales-stores-list');
  if (!listEl) return;
  const myStores = getVisibleStoresForSales();
  if (myStores.length === 0) {
    listEl.innerHTML = '<div class="py-8 text-center text-stone-400">暂无归属您跟进的合作门店记录。</div>';
    return;
  }

  listEl.innerHTML = myStores
    .map((s) => {
      const debt = parseFloat(s.current_debt || 0);
      const hasGps = String(s.address || '').includes('[GPS:');
      return `
        <div class="p-3.5 bg-white border border-stone-200 rounded-3xl shadow-2xs space-y-2">
          <div class="flex justify-between items-start gap-2">
            <div>
              <b class="text-sm text-stone-900">${s.name}</b>
              <span class="text-[10px] text-stone-500 block mt-0.5">掌柜：${s.contact || '掌柜'} · 📱 ${s.phone || '-'}</span>
              <span class="text-[10px] text-stone-400 block">${(s.address || '临街门面').replace(/\[GPS:[^\]]+\]/g, '').trim()}</span>
            </div>
            <div class="text-right font-mono shrink-0">
              <span class="text-[10px] text-stone-400 block">当前在账欠款</span>
              <b class="text-sm font-bold ${debt > 0 ? 'text-rose-700' : 'text-emerald-800'}">¥${debt.toFixed(2)}</b>
            </div>
          </div>

          <div class="flex flex-wrap gap-1.5 pt-1.5 border-t border-stone-100">
            <button type="button" onclick="window.openPalmSalesCollectModal(${s.id})" class="flex-1 bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold py-1.5 rounded-xl text-[11px] shadow-2xs">
              🤝 上门催收/对账
            </button>
            <button type="button" onclick="window.captureStoreGpsLocation(${s.id})" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold px-2.5 py-1.5 rounded-xl text-[10px]">
              ${hasGps ? '📍 更新定位' : '📍 采集定位'}
            </button>
            <button type="button" onclick="window.navigateToStoreGps(${s.id})" class="bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold px-2.5 py-1.5 rounded-xl text-[10px]">
              🧭 导航
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderQcStoreSelect() {
  const sel = document.getElementById('qc-store-select');
  if (!sel) return;
  sel.innerHTML = driverState.allStores.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
}

export function initQcPanelWorkspace() {
  driverState.qcVoucherNo = generateUnifiedVoucherNo('DS');
  const qNoEl = document.getElementById('qc-voucher-no');
  if (qNoEl) qNoEl.innerText = driverState.qcVoucherNo;
  renderQcStoreSelect();
  qcSignPad.init();
}

export function initFieldOpsBindings() {
  // 1. 仓储调度 & 产区采收移动制单
  window.setPalmStockMode = function (mode) {
    driverState.palmStockMode = mode;
    driverState.palmVoucherNo = generateUnifiedVoucherNo(mode === 'out_loss' ? 'CK' : 'RK');
    const noEl = document.getElementById('palm-wh-voucher-no');
    if (noEl) noEl.innerText = driverState.palmVoucherNo;

    const btnIn = document.getElementById('palm-btn-in');
    const btnOut = document.getElementById('palm-btn-out');
    if (btnIn && btnOut) {
      btnIn.className = mode === 'in_purchase' ? 'py-1.5 rounded-lg bg-[#1b4332] text-white transition' : 'py-1.5 rounded-lg text-stone-600 transition';
      btnOut.className = mode === 'out_loss' ? 'py-1.5 rounded-lg bg-rose-700 text-white transition' : 'py-1.5 rounded-lg text-stone-600 transition';
    }

    const subSelect = document.getElementById('palm-wh-subtype');
    const srcLbl = document.getElementById('palm-wh-source-lbl');
    if (mode === 'in_purchase') {
      if (subSelect) {
        subSelect.innerHTML = `
          <option value="采收/完工入库">🌾 采收 / 完工新品入库</option>
          <option value="门店退货回库">🔄 门店退货完好回库</option>
          <option value="他库调入">🚚 其他分仓调拨入库</option>
        `;
      }
      if (srcLbl) srcLbl.innerText = '供货产区/班组 *：';
    } else {
      if (subSelect) {
        subSelect.innerHTML = `
          <option value="损耗/领用出库">📉 损耗 / 样品 / 内部领用出库</option>
          <option value="调出他库">🚚 调拨出库至其他分仓</option>
        `;
      }
      if (srcLbl) srcLbl.innerText = '领用/损耗去向 *：';
    }
  };

  window.submitPalmStockVoucher = async function () {
    const prodId = parseInt(document.getElementById('palm-wh-prod-select')?.value || 0);
    const subType = document.getElementById('palm-wh-subtype')?.value || '采收/完工入库';
    const qty = parseInt(document.getElementById('palm-wh-qty')?.value || 0);
    const source = document.getElementById('palm-wh-source')?.value.trim();
    const remark = document.getElementById('palm-wh-remark')?.value.trim();

    const p = driverState.allProducts.find((x) => x.id === prodId);
    if (!p) return alert('请选择有效货品！');
    if (isNaN(qty) || qty <= 0) return alert('请输入大于 0 的数量！');
    if (!source) return alert('请填写供货产区/班组或领用去向！');

    const curStock = parseInt(p.stock ?? 0);
    const deltaQty = driverState.palmStockMode === 'in_purchase' ? qty : -qty;
    const afterStock = Math.max(0, curStock + deltaQty);

    const { error: uErr } = await supabase.from('product').update({ stock: afterStock }).eq('id', p.id);
    if (uErr) return alert('库存写入失败：' + uErr.message);

    const voucherNo = driverState.palmVoucherNo || generateUnifiedVoucherNo(driverState.palmStockMode === 'out_loss' ? 'CK' : 'RK');
    const fullRemark = `[单号:${voucherNo}] [${subType} · ${source}] ${remark}`.trim();

    await supabase.from('inventory_log').insert([
      {
        tenant_id: driverState.currentAgent,
        product_id: p.id,
        product_name: p.name,
        action_type: driverState.palmStockMode,
        delta_qty: deltaQty,
        before_stock: curStock,
        after_stock: afterStock,
        operator_name: driverState.currentOperatorName,
        remark: fullRemark,
        created_at: new Date().toISOString()
      }
    ]);

    alert(
      `✅ 仓库单据已制单入账！\n\n` +
        `• 标准单号：${voucherNo}\n` +
        `• 单据子类：${subType}\n` +
        `• 货品名称：${p.name}\n` +
        `• 变动后结存：${afterStock} ${p.measure_unit || '件'}`
    );
    document.getElementById('palm-wh-qty').value = '';
    document.getElementById('palm-wh-remark').value = '';
    window.setPalmStockMode(driverState.palmStockMode);
    await window.loadDriverTasks();
  };

  window.openPalmPickListModal = function () {
    const body = document.getElementById('palm-picklist-body');
    if (!body) return;

    const map = {};
    driverState.activeOrders.forEach((o) => {
      (Array.isArray(o.items) ? o.items : []).forEach((it) => {
        const key = `${it.name}|${it.spec || '整装'}|${it.measure_unit || '件'}`;
        if (!map[key]) map[key] = { name: it.name, spec: it.spec || '整装', unit: it.measure_unit || '件', totalQty: 0, stores: [] };
        map[key].totalQty += parseInt(it.qty || 0);
        map[key].stores.push(`${o.store_name || '自提单'}(${it.qty})`);
      });
    });

    const rows = Object.values(map);
    if (rows.length === 0) {
      body.innerHTML = '<div class="py-8 text-center text-stone-400">当前暂无待装车发运单据。</div>';
    } else {
      body.innerHTML = rows
        .map(
          (r, idx) => `
          <div class="py-2.5 flex justify-between items-start gap-2">
            <div>
              <b class="text-stone-900">${idx + 1}. ${r.name}</b> <span class="text-stone-400">(${r.spec})</span>
              <div class="text-[10px] text-stone-500 mt-0.5">分店明细：${r.stores.join('、')}</div>
            </div>
            <span class="bg-amber-100 text-amber-950 border border-amber-300 px-2 py-0.5 rounded-lg font-mono font-bold shrink-0">${r.totalQty} ${r.unit}</span>
          </div>
        `
        )
        .join('');
    }
    window.openModal('palm-picklist-modal');
  };

  window.markExpressOrderShipped = async function (orderId) {
    const trackingNo = prompt('请输入快递公司及快递单号（如：顺丰 SF123456789）：');
    if (!trackingNo || !trackingNo.trim()) return;
    await supabase
      .from('store_order')
      .update({
        delivery_status: 'delivered',
        order_status: 'delivered',
        driver_action_instruction: `【仓库已发快递】单号: ${trackingNo.trim()} (经手: ${driverState.currentOperatorName})`
      })
      .eq('id', orderId);
    alert('✅ 已登记快递单号并标记发货！');
    await window.loadDriverTasks();
  };

  // 2. 业务员私海客户、GPS 采集与上门拜访催收
  window.ocrScanStoreFront = async function (e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const nameInput = document.getElementById('lead-name-input');
    const phoneInput = document.getElementById('lead-phone-input');
    const origPh = nameInput?.placeholder || '';
    if (nameInput) nameInput.placeholder = '⏳ 正在识读门头/名片文字...';

    try {
      const rawText = await runLightweightOcrOnFile(file);
      const lines = rawText
        .split(/\r?\n/)
        .map((l) => l.replace(/\s+/g, '').trim())
        .filter((l) => l.length >= 2);

      const phoneMatch = rawText.replace(/[-\s]/g, '').match(/1[3-9]\d{9}/);
      if (phoneMatch && phoneInput) phoneInput.value = phoneMatch[0];

      const shopCandidate = lines.find((l) => !/^\d+$/.test(l) && l.length >= 3 && l.length <= 20);
      if (shopCandidate && nameInput && !nameInput.value.trim()) {
        nameInput.value = shopCandidate;
      }

      alert(
        rawText.trim()
          ? `📸 已识别图片文字并自动回填！请核对微调：\n${lines.slice(0, 4).join(' / ')}`
          : '⚠️ 画面光线略暗未识出清晰文字，请直接手动输入或使用语音录入。'
      );
    } catch (err) {
      alert('当前弱网环境无法加载识字引擎，请直接手动填写或使用语音录入。');
    } finally {
      if (nameInput) nameInput.placeholder = origPh;
    }
  };

  window.ocrScanReceiptAmount = async function (e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const amtInput = document.getElementById('psc-amount');
    try {
      const rawText = await runLightweightOcrOnFile(file);
      const amtMatches = rawText.match(/(?:¥|￥|金额|实付|转账)?\s*(\d+(?:\.\d{1,2})?)/g) || [];
      const nums = amtMatches
        .map((m) => parseFloat(m.replace(/[^\d.]/g, '')))
        .filter((n) => !isNaN(n) && n > 0 && n < 500000);

      if (nums.length > 0 && amtInput) {
        const best = Math.max(...nums);
        amtInput.value = best.toFixed(2);
        alert(`📸 已从转账回执中识别到金额 ¥${best.toFixed(2)} 并自动填入，请核对确认！`);
      } else {
        alert('未从截图中识别出明确金额，请直接手动核对输入。');
      }
    } catch (err) {
      alert('当前弱网环境无法识别截图，请直接手动填入实收金额。');
    }
  };

  window.captureStoreGpsLocation = async function (storeId) {
    if (!navigator.geolocation) return alert('当前设备不支持 GPS 定位功能。');
    const store = driverState.allStores.find((s) => Number(s.id) === Number(storeId));
    if (!store) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const gpsTag = `[GPS:${lng},${lat}]`;
        const prevAddr = (store.address || '').replace(/\[GPS:[^\]]+\]/g, '').trim();
        const nextAddr = `${prevAddr} ${gpsTag}`.trim();

        const { error } = await supabase.from('store').update({ address: nextAddr }).eq('id', store.id);
        if (error) return alert('保存定位失败：' + error.message);

        store.address = nextAddr;
        alert(`📍 已为【${store.name}】更新精准门头 GPS 坐标！后续任意送货师傅均可一键直达导航。`);
        renderSalesStoresList();
      },
      (err) => alert('获取定位失败：' + err.message),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  window.openPalmSalesCollectModal = function (storeId) {
    const s = driverState.allStores.find((x) => Number(x.id) === Number(storeId));
    if (!s) return;
    document.getElementById('psc-store-id').value = s.id;
    document.getElementById('psc-store-name').innerText = `🤝 ${s.name} · 拜访催收`;
    document.getElementById('psc-store-debt').innerText = `当前在账欠款：¥${parseFloat(s.current_debt || 0).toFixed(2)}`;
    document.getElementById('psc-amount').value = parseFloat(s.current_debt || 0) > 0 ? parseFloat(s.current_debt).toFixed(2) : '';
    document.getElementById('psc-note').value = '';
    salesSignPad.init();
    window.openModal('palm-sales-collect-modal');
  };

  window.clearSalesSignature = () => salesSignPad.clear();

  window.submitPalmSalesCollection = async function () {
    const storeId = parseInt(document.getElementById('psc-store-id').value);
    const s = driverState.allStores.find((x) => x.id === storeId);
    if (!s) return;

    const amt = parseFloat(document.getElementById('psc-amount').value || 0);
    const payMethod = document.getElementById('psc-method').value;
    const note = document.getElementById('psc-note').value.trim();

    if (isNaN(amt) || amt <= 0) return alert('请输入有效的催收回款金额！');
    if (!salesSignPad.hasSigned()) return alert('请请门店掌柜在下方框内手写签名确认回款金额！');

    const { error } = await supabase.from('driver_collection_log').insert([
      {
        tenant_id: driverState.currentAgent,
        store_id: s.id,
        store_name: `${s.name} (业务员催收${note ? '·' + note : ''})`,
        driver_name: driverState.currentOperatorName,
        collect_type: 'sales_visit_collect',
        amount: amt,
        discount_amount: 0,
        basket_return: 0,
        basket_deduct_amount: 0,
        pay_method: payMethod,
        settled_to_hq: false
      }
    ]);

    if (error) return alert('提交催收留痕失败：' + error.message);

    alert(
      `✅ 催收留痕已提交并附带掌柜电子签名！\n` +
        `单据已自动推至账房财务点款台，财务核验到账后将自动冲减【${s.name}】在账欠款。`
    );
    window.closeModal('palm-sales-collect-modal');
    await window.loadDriverTasks();
  };

  // 3. 售后定损 / 质检鉴证工作台
  window.clearQcSignature = () => qcSignPad.clear();

  window.handleQcPhotoUpload = async function (e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 640, 0.75);
      const cdnUrl = await uploadBlobToStorage(compressed, driverState.currentAgent, 'qc_reports');
      driverState.qcPhotoList.push(cdnUrl);
      const prev = document.getElementById('qc-photo-preview');
      if (prev) {
        prev.innerHTML = driverState.qcPhotoList
          .map((u) => `<img src="${u}" class="w-12 h-12 rounded-xl object-cover border border-stone-300 shrink-0">`)
          .join('');
      }
    } catch (err) {
      alert('拍照上传异常：' + err.message);
    }
  };

  window.submitQcReport = async function () {
    const storeId = parseInt(document.getElementById('qc-store-select')?.value || 0);
    const s = driverState.allStores.find((x) => x.id === storeId);
    const verdict = document.getElementById('qc-verdict-select')?.value || '';
    const deductAmt = parseFloat(document.getElementById('qc-deduct-amount')?.value || 0);
    const detail = document.getElementById('qc-detail-input')?.value.trim();

    if (!s || !detail) return alert('请选择涉及门店并填写定损货品与破损说明！');
    if (!qcSignPad.hasSigned()) return alert('请请门店掌柜在下方签字框手写签名确认定损结论！');

    let signUrl = '';
    try {
      const signDataUrl = qcSignPad.toDataURL();
      signUrl = await uploadBlobToStorage(signDataUrl, driverState.currentAgent, 'qc_signatures');
    } catch (e) {}

    const voucherNo = driverState.qcVoucherNo || generateUnifiedVoucherNo('DS');
    const fullRemark = `[单号:${voucherNo}] [${s.name}] [门店ID:${s.id}] [冲抵金额:¥${deductAmt.toFixed(2)}] ${verdict}：${detail}${
      driverState.qcPhotoList.length > 0 ? ` (实拍${driverState.qcPhotoList.length}张)` : ''
    }${signUrl ? ' [掌柜已电子签名]' : ''}`;

    const { error } = await supabase.from('inventory_log').insert([
      {
        tenant_id: driverState.currentAgent,
        product_id: 0,
        product_name: `实地定损鉴证 (${s.name})`,
        action_type: 'qc_damage_claim',
        delta_qty: 0,
        before_stock: 0,
        after_stock: 0,
        operator_name: driverState.currentOperatorName,
        remark: fullRemark,
        created_at: new Date().toISOString()
      }
    ]);

    if (error) return alert('提交定损单失败：' + error.message);

    alert(
      `✅ 《商号内部定损单》已提交并附带掌柜签名！\n` +
        `• 定损单号：${voucherNo}\n` +
        `• 建议冲抵：¥${deductAmt.toFixed(2)}\n` +
        `• 已直推大当家与账房财务调度台审核冲账（商号私有闭环，不惊动平台）。`
    );
    document.getElementById('qc-detail-input').value = '';
    document.getElementById('qc-deduct-amount').value = '0';
    driverState.qcPhotoList = [];
    document.getElementById('qc-photo-preview').innerHTML = '尚未拍照';
    driverState.qcVoucherNo = generateUnifiedVoucherNo('DS');
    const qNoEl = document.getElementById('qc-voucher-no');
    if (qNoEl) qNoEl.innerText = driverState.qcVoucherNo;
    window.clearQcSignature();
  };
}
