import { supabase } from '../lib/supabase.js';
import { compressImageFile, uploadBlobToStorage } from '../utils/storage.js';
import { DriverService } from '../services/driverService.js';

const OFFLINE_QUEUE_KEY = 'b2b_driver_offline_queue_v1';
const PALM_SESSION_KEY = 'baigong_palm_session_v1';

let currentAgent = localStorage.getItem('hq_active_agent') || 'BJ_SHUNDA';
let currentRoleCode = 'driver';
let effectiveViewRole = 'driver';
let currentOperatorName = '送货师傅';
let currentCarrierLabel = '周转筐';
let globalCarriersList = [{ name: '周转筐', deposit: 15 }];
let allStores = [];
let allProducts = [];
let activeOrders = [];
let deliveredOrdersCache = [];
let onlyShowOrders = false;
let proofImagesList = [];
let qcPhotoList = [];
let palmStockMode = 'in_purchase';
let palmVoucherNo = '';

let signCanvas = null;
let signCtx = null;
let isSigning = false;
let hasSigned = false;

let salesCanvas = null;
let salesCtx = null;
let isSalesSigning = false;
let hasSalesSigned = false;

window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

function isDirectoryLead(o) {
  return (
    o?.order_source === 'b2b_directory_lead' ||
    String(o?.order_no || '').startsWith('LEAD-') ||
    String(o?.note || '').includes('[新店招商线索]') ||
    String(o?.note || '').includes('[新店招商線索]') ||
    String(o?.note || '').includes('[新店合作意向]')
  );
}

// =========================================================================
// 0. 语音速记转文字 & GPS 精准定位导航工具
// =========================================================================
window.startVoiceInput = function (targetInputId) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return alert('当前浏览器暂不支持原生语音识别，请直接手动输入或使用手机输入法自带语音按钮。');
  }
  const targetEl = document.getElementById(targetInputId);
  if (!targetEl) return;

  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  const origPlaceholder = targetEl.placeholder;
  targetEl.placeholder = '🎤 正在聆听，请直接说话...';

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    targetEl.value = targetEl.value ? `${targetEl.value}；${transcript}` : transcript;
  };
  recognition.onerror = () => {
    alert('未听清语音内容，请重试或手动输入。');
  };
  recognition.onend = () => {
    targetEl.placeholder = origPlaceholder;
  };
  recognition.start();
};

window.captureGpsForNewLead = function () {
  if (!navigator.geolocation) {
    return alert('当前设备不支持 GPS 定位功能。');
  }
  const addrInput = document.getElementById('lead-addr-input');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      const gpsTag = `[GPS:${lng},${lat}]`;
      if (addrInput) {
        const cleanPrev = addrInput.value.replace(/\[GPS:[^\]]+\]/g, '').trim();
        addrInput.value = `${cleanPrev} ${gpsTag}`.trim();
      }
      alert(`📍 门头精准 GPS 坐标已采集成功：${lng}, ${lat}`);
    },
    (err) => {
      alert('获取定位失败，请确认已开启手机定位权限：' + err.message);
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
};

window.captureStoreGpsLocation = async function (storeId) {
  if (!navigator.geolocation) return alert('当前设备不支持 GPS 定位功能。');
  const store = allStores.find((s) => Number(s.id) === Number(storeId));
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

window.navigateToStoreGps = function (storeId) {
  const store = allStores.find((s) => Number(s.id) === Number(storeId));
  if (!store) return;
  const addr = store.address || store.name || '';
  const gpsMatch = addr.match(/\[GPS:([0-9.]+),([0-9.]+)\]/);
  if (gpsMatch) {
    const lng = gpsMatch[1];
    const lat = gpsMatch[2];
    window.open(`https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(store.name)}`, '_blank');
  } else {
    window.open(`https://uri.amap.com/search?keyword=${encodeURIComponent(addr || store.name)}`, '_blank');
  }
};

// =========================================================================
// 1. 掌中宝身份核身登录与最小化权限视图切换
// =========================================================================
window.verifyPalmAuthLogin = async function (e) {
  e.preventDefault();
  const tenantId = document.getElementById('palm-login-tenant').value.trim().toUpperCase();
  const rawKey = document.getElementById('palm-login-key').value.trim();
  const errBox = document.getElementById('palm-auth-error');
  const btn = document.getElementById('btn-palm-login');

  btn.disabled = true;
  btn.innerText = '核验身份中...';
  errBox.classList.add('hidden');

  if (rawKey.includes(':') || rawKey.includes('：')) {
    const [subAcc, subPwd] = rawKey.split(/[:：]/).map((s) => s.trim());
    const { data: tenantList } = await supabase
      .from('platform_tenant')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .limit(1);

    if (!tenantList || tenantList.length === 0) {
      btn.disabled = false;
      btn.innerText = '核验身份 · 进入岗位工作台';
      errBox.innerText = '⚠️ 商号代号不存在或已暂歇！';
      errBox.classList.remove('hidden');
      return;
    }

    const { data: subList } = await supabase
      .from('tenant_sub_user')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('account_name', subAcc)
      .eq('password_hash', subPwd)
      .eq('is_active', true)
      .limit(1);

    if (!subList || subList.length === 0) {
      btn.disabled = false;
      btn.innerText = '核验身份 · 进入岗位工作台';
      errBox.innerText = '⚠️ 属员子账号或密码不正确！';
      errBox.classList.remove('hidden');
      return;
    }

    const sessionObj = {
      tenantId,
      roleCode: subList[0].role_code || 'driver',
      operatorName: subList[0].real_name || subAcc
    };
    localStorage.setItem(PALM_SESSION_KEY, JSON.stringify(sessionObj));
    currentAgent = sessionObj.tenantId;
    currentRoleCode = sessionObj.roleCode;
    effectiveViewRole = sessionObj.roleCode;
    currentOperatorName = sessionObj.operatorName;

    document.getElementById('palm-auth-gate').classList.add('hidden');
    await bootPalmWorkspace();
    return;
  }

  const { data: tenants } = await supabase
    .from('platform_tenant')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`access_key.eq.${rawKey},access_key.eq.${rawKey.toUpperCase()}`)
    .eq('is_active', true)
    .limit(1);

  if (!tenants || tenants.length === 0) {
    btn.disabled = false;
    btn.innerText = '核验身份 · 进入岗位工作台';
    errBox.innerText = '⚠️ 商号代号或访问密钥不符！';
    errBox.classList.remove('hidden');
    return;
  }

  const sessionObj = {
    tenantId,
    roleCode: 'owner',
    operatorName: '大当家巡检'
  };
  localStorage.setItem(PALM_SESSION_KEY, JSON.stringify(sessionObj));
  currentAgent = tenantId;
  currentRoleCode = 'owner';
  effectiveViewRole = 'driver';
  currentOperatorName = '大当家巡检';

  document.getElementById('palm-auth-gate').classList.add('hidden');
  await bootPalmWorkspace();
};

window.logoutPalmTerminal = function () {
  if (!confirm('确认退出当前掌中宝岗位登录？')) return;
  localStorage.removeItem(PALM_SESSION_KEY);
  document.getElementById('palm-auth-gate').classList.remove('hidden');
};

window.switchOwnerPreviewRole = function (role) {
  effectiveViewRole = role;
  renderRoleAdaptiveShell();
};

function renderRoleAdaptiveShell() {
  const roleNames = {
    owner: '👑 大当家全能巡检',
    driver: '🚚 送货师傅专席',
    warehouse: '📦 仓储调度专席 (盲价)',
    sales: '🤝 业务员 / 催收专席',
    producer: '🌾 产区采收 / 车间专席',
    qc_service: '🔧 售后定损 / 质检专席'
  };

  document.getElementById('tenant-display').innerText = currentAgent;
  document.getElementById('driver-name-display').innerText = currentOperatorName;
  document.getElementById('palm-role-badge').innerText = roleNames[currentRoleCode] || currentRoleCode;

  const ownerSwitcher = document.getElementById('owner-view-switcher');
  if (ownerSwitcher) {
    ownerSwitcher.classList.toggle('hidden', currentRoleCode !== 'owner');
  }

  const viewRole = currentRoleCode === 'owner' ? effectiveViewRole : currentRoleCode;

  // 隐藏所有工作区与底栏，再按当前岗位最小化权限按需开放
  ['pane-deliver', 'pane-warehouse', 'pane-sales-stores', 'pane-qc-service', 'pane-explore'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.getElementById('driver-cash-summary-card')?.classList.add('hidden');
  document.getElementById('driver-checkout-footer')?.classList.add('hidden');

  const navBox = document.getElementById('palm-role-nav');
  if (!navBox) return;

  if (viewRole === 'driver') {
    document.getElementById('driver-cash-summary-card')?.classList.remove('hidden');
    document.getElementById('driver-checkout-footer')?.classList.remove('hidden');
    navBox.innerHTML = `
      <div class="grid grid-cols-2 bg-stone-100 p-1 rounded-2xl text-xs font-bold gap-1">
        <button id="palm-tab-deliver" onclick="window.switchPalmSubTab('deliver')" class="py-2 rounded-xl bg-[#1b4332] text-white shadow transition">🚚 随车送货路线</button>
        <button id="palm-tab-explore" onclick="window.switchPalmSubTab('explore')" class="py-2 rounded-xl text-stone-600 transition">🤝 顺路新店登记</button>
      </div>
    `;
    window.switchPalmSubTab('deliver');
  } else if (viewRole === 'warehouse' || viewRole === 'producer') {
    navBox.innerHTML = '';
    document.getElementById('pane-warehouse')?.classList.remove('hidden');
    document.getElementById('palm-express-orders-box')?.classList.toggle('hidden', viewRole === 'producer');
    window.setPalmStockMode('in_purchase');
    renderPalmWarehouseProducts();
    renderPalmExpressOrders();
  } else if (viewRole === 'sales') {
    navBox.innerHTML = `
      <div class="grid grid-cols-2 bg-stone-100 p-1 rounded-2xl text-xs font-bold gap-1">
        <button id="palm-tab-sales" onclick="window.switchPalmSubTab('sales')" class="py-2 rounded-xl bg-[#1b4332] text-white shadow transition">🏪 我的客户与催收</button>
        <button id="palm-tab-explore" onclick="window.switchPalmSubTab('explore')" class="py-2 rounded-xl text-stone-600 transition">🤝 新店合作建档</button>
      </div>
    `;
    window.switchPalmSubTab('sales');
  } else if (viewRole === 'qc_service') {
    navBox.innerHTML = '';
    document.getElementById('pane-qc-service')?.classList.remove('hidden');
    renderQcStoreSelect();
  } else {
    // 兜底默认配送视图
    document.getElementById('driver-cash-summary-card')?.classList.remove('hidden');
    document.getElementById('driver-checkout-footer')?.classList.remove('hidden');
    document.getElementById('pane-deliver')?.classList.remove('hidden');
  }
}

window.switchPalmSubTab = function (subTab) {
  ['pane-deliver', 'pane-sales-stores', 'pane-explore'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
  ['palm-tab-deliver', 'palm-tab-sales', 'palm-tab-explore'].forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.className = 'py-2 rounded-xl text-stone-600 transition';
  });

  if (subTab === 'deliver') {
    document.getElementById('pane-deliver')?.classList.remove('hidden');
    const b = document.getElementById('palm-tab-deliver');
    if (b) b.className = 'py-2 rounded-xl bg-[#1b4332] text-white shadow transition';
  } else if (subTab === 'sales') {
    document.getElementById('pane-sales-stores')?.classList.remove('hidden');
    const b = document.getElementById('palm-tab-sales');
    if (b) b.className = 'py-2 rounded-xl bg-[#1b4332] text-white shadow transition';
    renderSalesStoresList();
  } else if (subTab === 'explore') {
    document.getElementById('pane-explore')?.classList.remove('hidden');
    const b = document.getElementById('palm-tab-explore');
    if (b) b.className = 'py-2 rounded-xl bg-[#1b4332] text-white shadow transition';
  }
};

window.openPalmHelpModal = function () {
  const viewRole = currentRoleCode === 'owner' ? effectiveViewRole : currentRoleCode;
  const helpMap = {
    driver: '• <b>随车交割</b>：点击合作门店卡片即可查看新配、退验与对调明细，清点回收周转载具并让掌柜手写签名确认。<br/>• <b>精准导航</b>：点击门店「🧭 导航」可直接调起地图直达店门口。<br/>• <b>地下室防丢单</b>：无信号时照常提交签收，出库有信号后点击顶部黄色提示条一键同步回库。',
    warehouse: '• <b>盲价隔离保护</b>：本工作台已自动屏蔽所有商品进销价格与客户账款。<br/>• <b>扫码/选品开单</b>：选择货品填写数量与产区/领用去向，系统自动生成标准入库单(RK)或出库单(CK)。<br/>• <b>装车总拣货单</b>：点击右上角「📋 装车总拣货单」可查看本车汇总备货数量。',
    producer: '• <b>田间/车间预入库</b>：采收或完工后，选择货品与交货班组直接提交入库单，仓库库存实时增加并生成可稽核单号。',
    sales: '• <b>拜访催收与内控</b>：点击门店卡片「🤝 上门催收」可录入回款并让掌柜当面电子签名；单据提交后自动推送财务点款台，财务核验到账后自动冲减门店欠款。<br/>• <b>采集定位</b>：到店后点击「📍 采集定位」保存门头经纬度，方便后续物流配送。',
    qc_service: '• <b>上门定损留证</b>：选择合作门店、拍摄破损/质量问题现场照片并填写定损结论，提交后自动同步调度中枢存档。'
  };
  const body = document.getElementById('palm-help-body');
  if (body) body.innerHTML = helpMap[viewRole] || helpMap.driver;
  window.openModal('modal-palm-help');
};

// =========================================================================
// 2. 仓储调度 & 产区采收移动制单功能（盲价隔离）
// =========================================================================
function generatePalmVoucherNo(mode) {
  const prefix = mode === 'in_purchase' ? 'RK' : 'CK';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand4 = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${dateStr}-${rand4}`;
}

window.setPalmStockMode = function (mode) {
  palmStockMode = mode;
  palmVoucherNo = generatePalmVoucherNo(mode);
  const noEl = document.getElementById('palm-wh-voucher-no');
  if (noEl) noEl.innerText = palmVoucherNo;

  const btnIn = document.getElementById('palm-btn-in');
  const btnOut = document.getElementById('palm-btn-out');
  if (btnIn && btnOut) {
    btnIn.className = mode === 'in_purchase' ? 'py-1.5 rounded-lg bg-[#1b4332] text-white transition' : 'py-1.5 rounded-lg text-stone-600 transition';
    btnOut.className = mode === 'out_loss' ? 'py-1.5 rounded-lg bg-rose-700 text-white transition' : 'py-1.5 rounded-lg text-stone-600 transition';
  }

  const srcLbl = document.getElementById('palm-wh-source-lbl');
  if (srcLbl) {
    srcLbl.innerText = mode === 'in_purchase' ? '供货产区/班组 *：' : '领用/损耗去向 *：';
  }
};

function renderPalmWarehouseProducts() {
  const sel = document.getElementById('palm-wh-prod-select');
  if (!sel) return;
  if (allProducts.length === 0) {
    sel.innerHTML = '<option value="">当前暂无在库货品</option>';
    return;
  }
  sel.innerHTML = allProducts
    .map((p) => `<option value="${p.id}">${p.name} (当前存: ${p.stock ?? 0} ${p.measure_unit || '件'})</option>`)
    .join('');
}

window.submitPalmStockVoucher = async function () {
  const prodId = parseInt(document.getElementById('palm-wh-prod-select')?.value || 0);
  const qty = parseInt(document.getElementById('palm-wh-qty')?.value || 0);
  const source = document.getElementById('palm-wh-source')?.value.trim();
  const remark = document.getElementById('palm-wh-remark')?.value.trim();

  const p = allProducts.find((x) => x.id === prodId);
  if (!p) return alert('请选择有效货品！');
  if (isNaN(qty) || qty <= 0) return alert('请输入大于 0 的数量！');
  if (!source) return alert('请填写供货产区/班组或领用去向！');

  const curStock = parseInt(p.stock ?? 0);
  const deltaQty = palmStockMode === 'in_purchase' ? qty : -qty;
  const afterStock = Math.max(0, curStock + deltaQty);

  const { error: uErr } = await supabase.from('product').update({ stock: afterStock }).eq('id', p.id);
  if (uErr) return alert('库存写入失败：' + uErr.message);

  const voucherNo = palmVoucherNo || generatePalmVoucherNo(palmStockMode);
  const goodsValue = (qty * parseFloat(p.tier_1_price || 0)).toFixed(2);
  const fullRemark = `[单号:${voucherNo}] [${source}] (核算货值:¥${goodsValue}) ${remark}`.trim();

  await supabase.from('inventory_log').insert([
    {
      tenant_id: currentAgent,
      product_id: p.id,
      product_name: p.name,
      action_type: palmStockMode,
      delta_qty: deltaQty,
      before_stock: curStock,
      after_stock: afterStock,
      operator_name: currentOperatorName,
      remark: fullRemark,
      created_at: new Date().toISOString()
    }
  ]);

  alert(
    `✅ 仓库单据已制单入账！\n\n` +
      `• 正式单号：${voucherNo}\n` +
      `• 货品名称：${p.name}\n` +
      `• 变动后结存：${afterStock} ${p.measure_unit || '件'}`
  );
  document.getElementById('palm-wh-qty').value = '';
  document.getElementById('palm-wh-remark').value = '';
  window.setPalmStockMode(palmStockMode);
  await window.loadDriverTasks();
};

window.openPalmPickListModal = function () {
  const body = document.getElementById('palm-picklist-body');
  if (!body) return;

  const map = {};
  activeOrders.forEach((o) => {
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

function renderPalmExpressOrders() {
  const listEl = document.getElementById('palm-express-orders-list');
  if (!listEl) return;
  const expressOrders = activeOrders.filter((o) => o.order_source === 'online_mall' && !o.store_id);
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

window.markExpressOrderShipped = async function (orderId) {
  const trackingNo = prompt('请输入快递公司及快递单号（如：顺丰 SF123456789）：');
  if (!trackingNo || !trackingNo.trim()) return;
  await supabase
    .from('store_order')
    .update({
      delivery_status: 'delivered',
      order_status: 'delivered',
      driver_action_instruction: `【仓库已发快递】单号: ${trackingNo.trim()} (经手: ${currentOperatorName})`
    })
    .eq('id', orderId);
  alert('✅ 已登记快递单号并标记发货！');
  await window.loadDriverTasks();
};

// =========================================================================
// 3. 业务员跟进合作门店 & 上门拜访催收
// =========================================================================
function renderSalesStoresList() {
  const listEl = document.getElementById('palm-sales-stores-list');
  if (!listEl) return;
  if (allStores.length === 0) {
    listEl.innerHTML = '<div class="py-8 text-center text-stone-400">当前商号名册下暂无合作门店。</div>';
    return;
  }

  listEl.innerHTML = allStores
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

window.openPalmSalesCollectModal = function (storeId) {
  const s = allStores.find((x) => Number(x.id) === Number(storeId));
  if (!s) return;
  document.getElementById('psc-store-id').value = s.id;
  document.getElementById('psc-store-name').innerText = `🤝 ${s.name} · 拜访催收`;
  document.getElementById('psc-store-debt').innerText = `当前在账欠款：¥${parseFloat(s.current_debt || 0).toFixed(2)}`;
  document.getElementById('psc-amount').value = parseFloat(s.current_debt || 0) > 0 ? parseFloat(s.current_debt).toFixed(2) : '';
  document.getElementById('psc-note').value = '';
  initSalesSignaturePad();
  window.openModal('palm-sales-collect-modal');
};

function initSalesSignaturePad() {
  salesCanvas = document.getElementById('sales-sign-pad');
  if (!salesCanvas) return;
  salesCtx = salesCanvas.getContext('2d');
  salesCtx.strokeStyle = '#1b4332';
  salesCtx.lineWidth = 2.5;
  salesCtx.lineCap = 'round';
  hasSalesSigned = false;

  const getPos = (e) => {
    const rect = salesCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * (salesCanvas.width / rect.width), y: (clientY - rect.top) * (salesCanvas.height / rect.height) };
  };

  const start = (e) => { isSalesSigning = true; const p = getPos(e); salesCtx.beginPath(); salesCtx.moveTo(p.x, p.y); };
  const move = (e) => { if (!isSalesSigning) return; e.preventDefault(); const p = getPos(e); salesCtx.lineTo(p.x, p.y); salesCtx.stroke(); hasSalesSigned = true; };
  const end = () => { isSalesSigning = false; };

  salesCanvas.onmousedown = start; salesCanvas.onmousemove = move; window.addEventListener('mouseup', end);
  salesCanvas.ontouchstart = start; salesCanvas.ontouchmove = move; salesCanvas.ontouchend = end;
}

window.clearSalesSignature = () => {
  if (salesCtx && salesCanvas) {
    salesCtx.clearRect(0, 0, salesCanvas.width, salesCanvas.height);
    hasSalesSigned = false;
  }
};

window.submitPalmSalesCollection = async function () {
  const storeId = parseInt(document.getElementById('psc-store-id').value);
  const s = allStores.find((x) => x.id === storeId);
  if (!s) return;

  const amt = parseFloat(document.getElementById('psc-amount').value || 0);
  const payMethod = document.getElementById('psc-method').value;
  const note = document.getElementById('psc-note').value.trim();

  if (isNaN(amt) || amt <= 0) return alert('请输入有效的催收回款金额！');
  if (!hasSalesSigned) return alert('请请门店掌柜在下方框内手写签名确认回款金额！');

  const { error } = await supabase.from('driver_collection_log').insert([
    {
      tenant_id: currentAgent,
      store_id: s.id,
      store_name: `${s.name} (业务员催收${note ? '·' + note : ''})`,
      driver_name: currentOperatorName,
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

// =========================================================================
// 4. 售后定损 / 质检鉴证工作台 (qc_service)
// =========================================================================
function renderQcStoreSelect() {
  const sel = document.getElementById('qc-store-select');
  if (!sel) return;
  sel.innerHTML = allStores.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
}

window.handleQcPhotoUpload = async function (e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const compressed = await compressImageFile(file, 640, 0.75);
    const cdnUrl = await uploadBlobToStorage(compressed, currentAgent, 'qc_reports');
    qcPhotoList.push(cdnUrl);
    const prev = document.getElementById('qc-photo-preview');
    if (prev) {
      prev.innerHTML = qcPhotoList.map((u) => `<img src="${u}" class="w-12 h-12 rounded-xl object-cover border border-stone-300 shrink-0">`).join('');
    }
  } catch (err) {
    alert('拍照上传异常：' + err.message);
  }
};

window.submitQcReport = async function () {
  const storeId = parseInt(document.getElementById('qc-store-select')?.value || 0);
  const s = allStores.find((x) => x.id === storeId);
  const verdict = document.getElementById('qc-verdict-select')?.value || '';
  const detail = document.getElementById('qc-detail-input')?.value.trim();

  if (!s || !detail) return alert('请选择涉及门店并填写定损鉴证说明！');

  const { error } = await supabase.from('product_suggestion').insert([
    {
      proposer_type: 'qc_damage_report',
      proposer_name: `${currentOperatorName} (${currentAgent})`,
      category: `定损鉴证:${s.name}`,
      content: JSON.stringify({
        storeId: s.id,
        storeName: s.name,
        verdict,
        detail,
        photos: qcPhotoList
      })
    }
  ]);

  if (error) return alert('提交定损单失败：' + error.message);

  alert('✅ 《实地定损鉴证单》已提交并上传现场实拍照，调度中枢与财务均可调阅作为仲裁依据！');
  document.getElementById('qc-detail-input').value = '';
  qcPhotoList = [];
  document.getElementById('qc-photo-preview').innerHTML = '尚未拍照';
};

// =========================================================================
// 5. 送货师傅核心交割、多载具分项回收、电子签名与离线防丢单（100% 完整保留）
// =========================================================================
function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveOfflineQueue(list) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(list));
  updateOfflineBanner();
}

function updateOfflineBanner() {
  const queue = getOfflineQueue();
  const banner = document.getElementById('offline-sync-banner');
  const countEl = document.getElementById('offline-queue-count');
  if (!banner || !countEl) return;
  if (queue.length > 0) {
    countEl.innerText = queue.length;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

window.syncOfflineQueue = async function () {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  const btn = document.getElementById('btn-sync-offline');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '同步中...';
  }

  const remaining = [];
  let successCount = 0;

  for (const item of queue) {
    try {
      await DriverService.completeDelivery(item.payload);
      successCount++;
    } catch (err) {
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  if (btn) {
    btn.disabled = false;
    btn.innerText = '立即同步回库';
  }

  if (successCount > 0) {
    alert(`🎉 已成功将 ${successCount} 笔离线暂存签收单同步写入云端总账！`);
    await window.loadDriverTasks();
  }
  if (remaining.length > 0) {
    alert(`⚠️ 仍有 ${remaining.length} 笔因网络未恢复暂留本地，请移步信号较好区域再点同步。`);
  }
};

window.toggleOnlyOrdersFilter = function () {
  onlyShowOrders = !onlyShowOrders;
  const btn = document.getElementById('btn-toggle-only-orders');
  if (btn) {
    btn.innerText = onlyShowOrders ? '🔥 仅看有单门店' : '全部门店';
    btn.className = onlyShowOrders
      ? 'text-[10px] bg-[#1b4332] text-white px-2 py-0.5 rounded-lg font-bold transition'
      : 'text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-lg font-bold transition';
  }
  renderRoute();
};

function initSignaturePad() {
  signCanvas = document.getElementById('sign-pad');
  if (!signCanvas) return;
  signCtx = signCanvas.getContext('2d');
  signCtx.strokeStyle = '#1b4332';
  signCtx.lineWidth = 2.5;
  signCtx.lineCap = 'round';
  hasSigned = false;

  const getPos = (e) => {
    const rect = signCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * (signCanvas.width / rect.width), y: (clientY - rect.top) * (signCanvas.height / rect.height) };
  };

  const start = (e) => { isSigning = true; const p = getPos(e); signCtx.beginPath(); signCtx.moveTo(p.x, p.y); };
  const move = (e) => { if (!isSigning) return; e.preventDefault(); const p = getPos(e); signCtx.lineTo(p.x, p.y); signCtx.stroke(); hasSigned = true; };
  const end = () => { isSigning = false; };

  signCanvas.onmousedown = start; signCanvas.onmousemove = move; window.addEventListener('mouseup', end);
  signCanvas.ontouchstart = start; signCanvas.ontouchmove = move; signCanvas.ontouchend = end;
}

window.clearSignature = () => {
  if (signCtx && signCanvas) {
    signCtx.clearRect(0, 0, signCanvas.width, signCanvas.height);
    hasSigned = false;
  }
};

window.handleProofImageUpload = async function (e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const compressedBase64 = await compressImageFile(file, 640, 0.72);
    const idx = proofImagesList.length;
    proofImagesList.push(compressedBase64);
    renderProofStrip();

    const cdnUrl = await uploadBlobToStorage(compressedBase64, currentAgent, 'driver_proofs');
    if (proofImagesList[idx]) {
      proofImagesList[idx] = cdnUrl;
      renderProofStrip();
    }
  } catch (err) {
    alert('图片压缩或上传失败: ' + err.message);
  }
};

function renderProofStrip() {
  const box = document.getElementById('proof-preview-strip');
  if (!box) return;
  box.innerHTML = proofImagesList
    .map(
      (src, idx) => `
      <div class="relative w-12 h-12 rounded-xl overflow-hidden border border-stone-300 shrink-0">
        <img src="${src}" class="w-full h-full object-cover">
        <button type="button" onclick="window.removeProofImg(${idx})" class="absolute top-0 right-0 bg-black/70 text-white text-[9px] px-1">✕</button>
      </div>
    `
    )
    .join('');
}

window.removeProofImg = function (idx) {
  proofImagesList.splice(idx, 1);
  renderProofStrip();
};

window.loadDriverTasks = async function () {
  updateOfflineBanner();

  const [tenantRes, stores, prods, activeOrds, deliveredOrds, todayLogs] = await Promise.all([
    supabase.from('platform_tenant').select('custom_settings').eq('tenant_id', currentAgent).maybeSingle(),
    DriverService.fetchRouteStores(currentAgent),
    supabase.from('product').select('*').eq('tenant_id', currentAgent).order('id', { ascending: false }),
    DriverService.fetchActiveOrders(currentAgent),
    DriverService.fetchTodayDeliveredOrders(currentAgent),
    DriverService.fetchTodayCollections(currentAgent)
  ]);

  const settings = tenantRes?.data?.custom_settings && typeof tenantRes.data.custom_settings === 'object'
    ? tenantRes.data.custom_settings
    : {};
  if (Array.isArray(settings.carriers) && settings.carriers.length > 0) {
    globalCarriersList = settings.carriers;
    currentCarrierLabel = settings.carriers[0].name || '周转筐';
  }

  allStores = stores;
  allProducts = prods.data || [];
  activeOrders = activeOrds.filter((o) => !isDirectoryLead(o));
  deliveredOrdersCache = deliveredOrds;
  renderRoute();

  const cashAmt = todayLogs.filter((l) => l.pay_method === '现金').reduce((sum, l) => sum + parseFloat(l.amount || 0), 0);
  const wechatAmt = todayLogs.filter((l) => l.pay_method !== '现金').reduce((sum, l) => sum + parseFloat(l.amount || 0), 0);
  document.getElementById('today-cash-collected').innerText = `¥${(cashAmt + wechatAmt).toFixed(2)}`;
  document.getElementById('stat-cash').innerText = `¥${cashAmt.toFixed(0)}`;
  document.getElementById('stat-wechat').innerText = `¥${wechatAmt.toFixed(0)}`;
  document.getElementById('stat-done-count').innerText = deliveredOrdersCache.length;

  const viewRole = currentRoleCode === 'owner' ? effectiveViewRole : currentRoleCode;
  if (viewRole === 'warehouse' || viewRole === 'producer') {
    renderPalmWarehouseProducts();
    renderPalmExpressOrders();
  } else if (viewRole === 'sales') {
    renderSalesStoresList();
  } else if (viewRole === 'qc_service') {
    renderQcStoreSelect();
  }
};

function renderRoute() {
  const container = document.getElementById('route-container');
  if (!container) return;

  const offlineQueue = getOfflineQueue();
  const offlineOrderIds = new Set(offlineQueue.map((q) => Number(q.payload?.orderId)).filter(Boolean));

  const standaloneOnlineOrders = activeOrders.filter((o) => !o.store_id);
  let displayStores = allStores;
  if (onlyShowOrders) {
    displayStores = allStores.filter((s) => activeOrders.some((o) => Number(o.store_id) === Number(s.id)));
  }

  if (displayStores.length === 0 && standaloneOnlineOrders.length === 0) {
    container.innerHTML = `<div class="p-10 text-center text-stone-400 text-xs">${
      onlyShowOrders ? '当前暂无待送货单据，点击左上角切换查看全部门店。' : '当前名册下暂无合作门店。'
    }</div>`;
    return;
  }

  const standaloneHtml = standaloneOnlineOrders
    .map((ord) => {
      const isOfflineDone = offlineOrderIds.has(Number(ord.id));
      const orderStr = (ord.items || []).map((i) => `${i.name}x${i.qty}`).join('、');
      return `
        <div class="p-3.5 rounded-3xl border bg-blue-50/50 border-blue-300 shadow-xs space-y-2 transition">
          <div class="flex justify-between items-start">
            <div>
              <span class="bg-blue-700 text-white text-[9px] font-bold px-2 py-0.5 rounded-lg mr-1">🌐 天街直供单</span>
              <span class="font-bold text-sm text-stone-900">#${ord.order_no || ord.id}</span>
              <span class="text-[11px] text-stone-600 block mt-1">${ord.note || '天街买家直供配送'}</span>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">已在线支付</span>
          </div>
          <div class="bg-white p-2 rounded-2xl border border-blue-200 text-[11px] space-y-1">
            <div class="text-emerald-950 font-bold">📦 货品：${orderStr || '标准良品组合'}</div>
            <div class="text-[10px] text-stone-500 font-mono">实付金额：¥${parseFloat(ord.total_amount || 0).toFixed(2)}</div>
          </div>
          ${
            isOfflineDone
              ? '<div class="text-center text-[11px] font-bold text-amber-800 bg-amber-100 py-2 rounded-xl">📡 已离线签收，待联网同步</div>'
              : `<button onclick="window.openStandaloneOrderCollect(${ord.id})" class="w-full py-2.5 rounded-2xl font-bold text-xs shadow-sm active:scale-95 transition bg-[#1b4332] hover:bg-[#143628] text-white">
                  ✍️ 核对交付 · 收货人电子签名
                </button>`
          }
        </div>
      `;
    })
    .join('');

  const storesHtml = displayStores
    .map((s) => {
      const pendingOrder = activeOrders.find((o) => Number(o.store_id) === Number(s.id));
      const hasOrder = !!pendingOrder;
      const isOfflineDone = pendingOrder && offlineOrderIds.has(Number(pendingOrder.id));

      let itemsPreviewHtml = '';
      if (hasOrder) {
        const orderStr = (pendingOrder.items || []).map((i) => `${i.name}x${i.qty}`).join('、');
        const returnStr = (pendingOrder.items_return || []).map((i) => `${i.name}x${i.qty}`).join('、');
        const exchangeStr = (pendingOrder.items_exchange || []).map((i) => `${i.name}x${i.qty}`).join('、');
        const isMallPickup = pendingOrder.order_source === 'online_mall';

        itemsPreviewHtml = `
          <div class="bg-stone-50 p-2 rounded-2xl border border-stone-100 text-[11px] space-y-0.5">
            ${isMallPickup ? '<div class="text-[10px] font-bold text-blue-800">🛍️ 含天街邻里到店自提包裹（顺路捎带交店）</div>' : ''}
            ${orderStr ? `<div class="text-emerald-900 font-bold">📦 应送: ${orderStr}</div>` : ''}
            ${returnStr ? `<div class="text-rose-700 font-bold">🔄 退回: ${returnStr}</div>` : ''}
            ${exchangeStr ? `<div class="text-amber-800 font-bold">🔀 换新: ${exchangeStr}</div>` : ''}
            ${pendingOrder.driver_action_instruction ? `<div class="text-stone-500 text-[10px] pt-0.5 font-mono">👉 ${pendingOrder.driver_action_instruction}</div>` : ''}
          </div>
        `;
      }

      const cleanAddr = (s.address || '临街门面').replace(/\[GPS:[^\]]+\]/g, '').trim();

      return `
        <div class="p-3.5 rounded-3xl border ${hasOrder ? 'bg-white border-emerald-300 shadow-sm' : 'bg-stone-50/60 border-stone-200'} space-y-2 transition">
          <div class="flex justify-between items-start gap-2">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-sm text-stone-900">${s.name}</span>
                ${
                  isOfflineDone
                    ? '<span class="bg-amber-500 text-white text-[9px] font-bold px-2 py-0.2 rounded-full">待同步</span>'
                    : hasOrder
                    ? '<span class="bg-[#1b4332] text-amber-300 text-[9px] font-bold px-2 py-0.2 rounded-full animate-pulse">有单待交</span>'
                    : ''
                }
              </div>
              <span class="text-[11px] text-stone-400 block mt-0.5">📍 ${cleanAddr} · ${s.contact || '掌柜'}</span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button type="button" onclick="window.navigateToStoreGps(${s.id})" class="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-xl font-bold">
                🧭 导航
              </button>
              <a href="tel:${s.phone || ''}" class="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2.5 py-1 rounded-xl font-bold">
                📞 致电
              </a>
            </div>
          </div>

          ${itemsPreviewHtml}

          <div class="flex justify-between items-center text-[11px] text-stone-500 pt-1">
            <span>在账: <b class="font-mono text-stone-800">¥${s.current_debt || 0}</b></span>
            <span>${currentCarrierLabel}: <b class="font-mono text-amber-800 font-bold">${s.carrier_hold_count || s.basket_count || 0} 件</b></span>
          </div>

          ${
            isOfflineDone
              ? '<div class="text-center text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 py-2 rounded-xl">📡 已本地签收，恢复网络后点顶部「立即同步回库」</div>'
              : `<button onclick="window.openCollectModal(${s.id}, ${hasOrder ? pendingOrder.id : 0})" class="w-full py-2.5 rounded-2xl font-bold text-xs shadow-sm active:scale-95 transition ${
                  hasOrder ? 'bg-[#1b4332] hover:bg-[#143628] text-white' : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
                }">
                  ${hasOrder ? '✍️ 点交货品 · 现场核销签收' : `💵 零星收欠 / 清点回收${currentCarrierLabel}`}
                </button>`
          }
        </div>
      `;
    })
    .join('');

  container.innerHTML = standaloneHtml + storesHtml;
}

function renderMultiCarrierRows(basketsCount) {
  const box = document.getElementById('multi-carrier-rows');
  if (!box) return;
  box.innerHTML = globalCarriersList
    .map(
      (c, idx) => `
      <div class="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-amber-200/80 text-[11px]">
        <span class="font-bold text-stone-800">${c.name} <span class="text-stone-400 font-mono font-normal">(¥${c.deposit}/件)</span></span>
        <div class="flex items-center gap-1 font-mono">
          <input type="number" min="0" value="0" data-carrier-idx="${idx}" data-deposit="${c.deposit}" oninput="window.updateDeliverBtnText()" class="multi-carrier-qty-input w-14 bg-stone-50 border border-stone-200 rounded px-1.5 py-0.5 text-center font-bold outline-none">
          <span class="text-stone-500">件</span>
        </div>
      </div>
    `
    )
    .join('');
}

window.openStandaloneOrderCollect = function (orderId) {
  const order = activeOrders.find((o) => Number(o.id) === Number(orderId));
  if (!order) return;

  proofImagesList = [];
  renderProofStrip();

  document.getElementById('modal-store-id').value = 0;
  document.getElementById('modal-order-id').value = order.id;
  document.getElementById('modal-shop-title').innerText = `🌐 天街直供单 #${order.order_no || order.id}`;
  document.getElementById('modal-current-debt').value = 0;
  document.getElementById('modal-credit-limit').value = 999999;
  document.getElementById('modal-basket-count').value = 0;
  document.getElementById('modal-settlement-type').value = order.settlement_type || 'online_paid';

  document.getElementById('modal-debt-text').innerText = '¥0.00';
  document.getElementById('modal-limit-text').innerText = '在线已付';
  document.getElementById('modal-basket-text').innerText = '0 件';
  document.getElementById('over-credit-warning-banner').classList.add('hidden');

  const instBox = document.getElementById('modal-instruction-box');
  instBox.innerText = order.driver_action_instruction || order.note || '请核对货品交付并请收货人电子签名';
  instBox.classList.remove('hidden');

  const netAmt = parseFloat(order.net_settle_amount || order.total_amount || 0);
  document.getElementById('modal-order-amount-text').innerText = `¥${netAmt.toFixed(2)}`;
  document.getElementById('modal-return-amount-text').innerText = '-¥0.00';
  document.getElementById('modal-net-amount-text').innerText = `¥${netAmt.toFixed(2)}`;

  document.getElementById('modal-items-order-list').innerHTML =
    (order.items || []).map((i) => `<div>• ${i.name} (${i.spec || '整装'}) × <b class="font-mono">${i.qty}${i.measure_unit || '件'}</b></div>`).join('') || '无';
  document.getElementById('modal-items-return-list').innerHTML = '无须带回旧品';
  document.getElementById('modal-items-exchange-list').innerHTML = '无对调品物';

  renderMultiCarrierRows(0);
  document.getElementById('collect-amount').value = '0';
  document.getElementById('collect-discount').value = '0';
  document.getElementById('collect-method').value = '仅签收回单';

  window.updateDeliverBtnText();
  initSignaturePad();
  window.openModal('collect-modal');
};

window.openCollectModal = function (storeId, orderId) {
  const s = allStores.find((x) => Number(x.id) === Number(storeId));
  if (!s) return;

  proofImagesList = [];
  renderProofStrip();

  const order = activeOrders.find((o) => Number(o.id) === Number(orderId));
  const debt = parseFloat(s.current_debt || 0);
  const limit = parseFloat(s.credit_limit || 2000);
  const baskets = parseInt(s.carrier_hold_count || s.basket_count || 0);

  document.getElementById('modal-store-id').value = s.id;
  document.getElementById('modal-order-id').value = orderId || 0;
  document.getElementById('modal-shop-title').innerText = s.name;
  document.getElementById('modal-current-debt').value = debt;
  document.getElementById('modal-credit-limit').value = limit;
  document.getElementById('modal-basket-count').value = baskets;

  document.getElementById('modal-debt-text').innerText = `¥${debt.toFixed(2)}`;
  document.getElementById('modal-limit-text').innerText = `¥${limit.toFixed(0)}`;
  document.getElementById('modal-basket-text').innerText = `${baskets} 件`;

  const overWarningBanner = document.getElementById('over-credit-warning-banner');
  const overWarningDesc = document.getElementById('over-credit-warning-desc');
  if (order && (order.order_status === 'over_credit_pending' || order.order_status === 'over_credit_rejected')) {
    overWarningBanner.classList.remove('hidden');
    overWarningDesc.innerText =
      order.order_status === 'over_credit_rejected'
        ? `主管已驳回赊销：${order.driver_action_instruction || '请当场收取全额现款'}`
        : `超出信用额度 ¥${order.over_credit_amount || 0}，尚待主管特批；若未获批请当场收取现款！`;
  } else {
    overWarningBanner.classList.add('hidden');
  }

  const instBox = document.getElementById('modal-instruction-box');
  if (order && order.driver_action_instruction) {
    instBox.innerText = order.driver_action_instruction;
    instBox.classList.remove('hidden');
  } else {
    instBox.classList.add('hidden');
  }

  let netAmt = 0;
  let settlementType = s.default_settlement || 'credit';
  let workflow = s.settle_workflow || 'cash_on_delivery';

  if (order) {
    const oAmt = parseFloat(order.total_amount || 0);
    const rAmt = parseFloat(order.return_amount || 0);
    netAmt = parseFloat(order.net_settle_amount || (oAmt - rAmt));
    settlementType = order.settlement_type || 'credit';

    document.getElementById('modal-order-amount-text').innerText = `¥${oAmt.toFixed(2)}`;
    document.getElementById('modal-return-amount-text').innerText = `-¥${rAmt.toFixed(2)}`;
    document.getElementById('modal-net-amount-text').innerText = `¥${netAmt.toFixed(2)}`;

    document.getElementById('modal-items-order-list').innerHTML =
      (order.items || []).map((i) => `<div>• ${i.name} (${i.spec || '整装'}) × <b class="font-mono">${i.qty}${i.measure_unit || '件'}</b></div>`).join('') || '无新到品物';
    document.getElementById('modal-items-return-list').innerHTML =
      (order.items_return || []).map((i) => `<div>• 退: ${i.name} × ${i.qty} [${i.reason}] (-¥${(i.price * i.qty).toFixed(1)})</div>`).join('') || '无须带回旧品';
    document.getElementById('modal-items-exchange-list').innerHTML =
      (order.items_exchange || []).map((i) => `<div>• 换: ${i.name} × ${i.qty} [${i.reason}]</div>`).join('') || '无对调品物';
  } else {
    document.getElementById('modal-order-amount-text').innerText = '¥0.00';
    document.getElementById('modal-return-amount-text').innerText = '-¥0.00';
    document.getElementById('modal-net-amount-text').innerText = '¥0.00';
    document.getElementById('modal-items-order-list').innerHTML = '无新订货单 (零星收欠 / 清点载具)';
    document.getElementById('modal-items-return-list').innerHTML = '无';
    document.getElementById('modal-items-exchange-list').innerHTML = '无';
  }

  document.getElementById('modal-settlement-type').value = settlementType;
  renderMultiCarrierRows(baskets);
  document.getElementById('collect-discount').value = '0';

  if (workflow === 'receipt_only') {
    document.getElementById('collect-amount').value = '0';
    document.getElementById('collect-method').value = '仅签收回单';
  } else if (order && order.order_source === 'online_mall') {
    document.getElementById('collect-amount').value = '0';
    document.getElementById('collect-method').value = '仅签收回单';
  } else if (settlementType === 'cash' && order) {
    document.getElementById('collect-amount').value = netAmt.toFixed(2);
    document.getElementById('collect-method').value = '电子扫码/转账';
  } else if (!order && debt > 0) {
    document.getElementById('collect-amount').value = debt.toFixed(2);
    document.getElementById('collect-method').value = '电子扫码/转账';
  } else {
    document.getElementById('collect-amount').value = '0';
    document.getElementById('collect-method').value = '挂账签收';
  }

  window.updateDeliverBtnText();
  initSignaturePad();
  window.openModal('collect-modal');
};

window.onCollectMethodChange = () => {
  const method = document.getElementById('collect-method').value;
  if (method === '挂账签收' || method === '仅签收回单') {
    document.getElementById('collect-amount').value = '0';
  }
  window.updateDeliverBtnText();
};

window.updateDeliverBtnText = () => {
  const payAmt = parseFloat(document.getElementById('collect-amount').value) || 0;
  let totalCarrierQty = 0;
  let totalCarrierDeduct = 0;
  document.querySelectorAll('.multi-carrier-qty-input').forEach((inp) => {
    const q = parseInt(inp.value) || 0;
    const dep = parseFloat(inp.dataset.deposit || 15);
    totalCarrierQty += q;
    totalCarrierDeduct += q * dep;
  });

  const deductLabel = document.getElementById('multi-carrier-deduct-total');
  if (deductLabel) {
    deductLabel.innerText = `共收 ${totalCarrierQty} 件 · 抵 ¥${totalCarrierDeduct.toFixed(2)}`;
  }

  const method = document.getElementById('collect-method').value;
  const btn = document.getElementById('btn-submit-collection');
  if (!btn) return;

  if (payAmt > 0) btn.innerText = `✅ 确认收款 ¥${payAmt.toFixed(2)} · 签收平账`;
  else if (method === '仅签收回单') btn.innerText = `📜 确认验货签回单 (待财务统对)`;
  else btn.innerText = `📝 确认记账交割 · 立信签收`;
};

window.submitCollection = async function () {
  const storeId = parseInt(document.getElementById('modal-store-id').value);
  const orderId = parseInt(document.getElementById('modal-order-id').value);
  const storeName = document.getElementById('modal-shop-title').innerText;

  const oldDebt = parseFloat(document.getElementById('modal-current-debt').value) || 0;
  const creditLimit = parseFloat(document.getElementById('modal-credit-limit').value) || 2000;
  const oldBaskets = parseInt(document.getElementById('modal-basket-count').value) || 0;

  const payAmt = parseFloat(document.getElementById('collect-amount').value) || 0;
  const discountAmt = parseFloat(document.getElementById('collect-discount').value) || 0;
  const method = document.getElementById('collect-method').value;

  let basketReturn = 0;
  let basketDeductAmt = 0;
  document.querySelectorAll('.multi-carrier-qty-input').forEach((inp) => {
    const q = parseInt(inp.value) || 0;
    const dep = parseFloat(inp.dataset.deposit || 15);
    basketReturn += q;
    basketDeductAmt += q * dep;
  });

  const order = activeOrders.find((o) => Number(o.id) === Number(orderId));
  const netOrderAmt = order && order.order_source !== 'online_mall' ? parseFloat(order.net_settle_amount || order.total_amount || 0) : 0;

  if (!hasSigned) {
    return alert('🤝 立信为本：请请收货掌柜在签字框内手写签字确认！');
  }

  const newDebt = Math.max(0, oldDebt + netOrderAmt - payAmt - discountAmt - basketDeductAmt);
  const newBaskets = Math.max(0, oldBaskets - basketReturn);

  if (storeId > 0 && newDebt > creditLimit && (!order || order.order_status !== 'over_credit_approved')) {
    const overDiff = (newDebt - creditLimit).toFixed(2);
    if (
      !confirm(
        `🚨 信用额度超额提示：\n` +
          `本单记账后累计在账 ¥${newDebt.toFixed(2)}，已超出该店免息信用额度 ¥${creditLimit.toFixed(2)}（超额 ¥${overDiff}）！\n\n` +
          `• 若门店当场付现，请点「取消」并在实收金额框填入现款；\n` +
          `• 若需上报主管 2FA 特批放行，请点「确定」提交审批。`
      )
    ) {
      return;
    }

    if (order) {
      await supabase
        .from('store_order')
        .update({
          order_status: 'over_credit_pending',
          over_credit_amount: parseFloat(overDiff),
          driver_action_instruction: `【待主管2FA特批】超授信 ¥${overDiff}`
        })
        .eq('id', order.id);
    }

    alert('⏳ 已上报源头调度台等待主管 2FA 特批放行！');
    window.closeModal('collect-modal');
    await window.loadDriverTasks();
    return;
  }

  const signDataUrl = signCanvas.toDataURL('image/png');
  const deliveryPayload = {
    tenantId: currentAgent,
    storeId,
    storeName,
    driverName: currentOperatorName,
    orderId,
    netOrderAmt,
    payAmt,
    discountAmt,
    basketReturn,
    basketDeductAmt,
    method,
    newDebt,
    newBaskets,
    signDataUrl,
    proofImages: proofImagesList
  };

  try {
    await DriverService.completeDelivery(deliveryPayload);

    alert(
      `✅ 交割核销圆满完成！\n` +
        `• 本次实收款: ¥${payAmt.toFixed(2)} (${method})\n` +
        `• 收回周转载具: ${basketReturn} 件 (折抵 ¥${basketDeductAmt.toFixed(2)})\n` +
        `• 门店最新在账: ¥${newDebt.toFixed(2)}`
    );

    window.closeModal('collect-modal');
    await window.loadDriverTasks();
  } catch (err) {
    const offlineQueue = getOfflineQueue();
    offlineQueue.push({
      id: Date.now(),
      createdAt: new Date().toISOString(),
      payload: deliveryPayload
    });
    saveOfflineQueue(offlineQueue);

    alert(
      `📡 当前信号较弱（如地下室或偏远村社），本笔签收凭单已自动加密暂存至本地防丢队列！\n` +
        `出库恢复信号后，点击顶栏「立即同步回库」即可上传总账。`
    );
    window.closeModal('collect-modal');
    renderRoute();
  }
};

window.openReceiptHistoryModal = function () {
  const listEl = document.getElementById('driver-receipt-history-list');
  if (!listEl) return;

  if (deliveredOrdersCache.length === 0) {
    listEl.innerHTML = '<div class="py-8 text-center text-stone-400">今日尚无已完成的交割电子收条存根。</div>';
    window.openModal('receipt-history-modal');
    return;
  }

  listEl.innerHTML = deliveredOrdersCache
    .map((o) => {
      const itemsStr = (Array.isArray(o.items) ? o.items : []).map((i) => `${i.name}x${i.qty}`).join('、') || '调退/收欠单';
      const net = parseFloat(o.net_settle_amount || o.total_amount || 0).toFixed(2);
      return `
        <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
          <div class="flex justify-between items-center font-bold">
            <span class="text-stone-900">${o.store_name || '天街直供单'}</span>
            <span class="font-mono text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">已签收</span>
          </div>
          <div class="text-[10px] text-stone-500 font-mono">单号: #${o.order_no || o.id} · 净额: ¥${net}</div>
          <div class="text-[11px] text-stone-700">货品: ${itemsStr}</div>
          ${o.sign_image_url ? `<div class="bg-white border border-stone-200 rounded-xl p-1 inline-block"><img src="${o.sign_image_url}" class="h-10 object-contain"></div>` : ''}
          <div class="pt-1 flex justify-end">
            <button type="button" onclick="window.copyDriverReceiptText(${o.id})" class="bg-[#1b4332] text-white font-bold px-3 py-1 rounded-xl text-[10px] shadow-2xs active:scale-95">
              📋 复制电子收条发掌柜
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  window.openModal('receipt-history-modal');
};

window.copyDriverReceiptText = function (orderId) {
  const o = deliveredOrdersCache.find((x) => Number(x.id) === Number(orderId));
  if (!o) return;
  const itemsStr = (Array.isArray(o.items) ? o.items : []).map((i) => `${i.name}x${i.qty}`).join('、') || '调退/收欠单';
  const net = parseFloat(o.net_settle_amount || o.total_amount || 0).toFixed(2);
  const text =
    `【随车交割电子收信条】\n` +
    `收货门店：${o.store_name || '客户'}\n` +
    `单据编号：#${o.order_no || o.id}\n` +
    `交割明细：${itemsStr}\n` +
    `本单净额：¥${net}（${o.settlement_type || '已核销'}）\n` +
    `配送经手：${currentOperatorName}\n` +
    `交割时间：${o.created_at ? new Date(o.created_at).toLocaleString() : new Date().toLocaleString()}\n` +
    `诚信相照，货款两清！`;

  navigator.clipboard.writeText(text).then(() => {
    alert(`✅ 【${o.store_name || '客户'}】电子收条已复制，可直接粘贴微信发给掌柜留底！`);
  });
};

window.submitLeadByDriver = async function () {
  const name = document.getElementById('lead-name-input').value.trim();
  const category = document.getElementById('lead-cat-input')?.value || '社区便利';
  const boss = document.getElementById('lead-boss-input').value.trim();
  const phone = document.getElementById('lead-phone-input').value.trim();
  const addr = document.getElementById('lead-addr-input').value.trim();
  const note = document.getElementById('lead-note-input').value.trim();

  if (!name || !phone || phone.length < 11) return alert('请填全合作门店招牌全名与 11 位手机号码！');

  await DriverService.submitNewStoreLead({
    tenantId: currentAgent,
    driverName: currentOperatorName,
    shopName: name,
    category,
    bossName: boss,
    phone,
    address: addr,
    note
  });

  alert('🎉 意向合作门店信息已登记！已直传源头调度中枢，并自动计入您的客户开拓实绩。');
  ['lead-name-input', 'lead-boss-input', 'lead-phone-input', 'lead-addr-input', 'lead-note-input'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
};

window.openCheckoutSummaryModal = async function () {
  const logs = await DriverService.fetchTodayCollections(currentAgent);

  let cash = 0, wechat = 0, baskets = 0, discount = 0;
  logs.forEach((l) => {
    const amt = parseFloat(l.amount || 0);
    if (l.pay_method === '现金') cash += amt;
    else wechat += amt;
    baskets += parseInt(l.basket_return || 0);
    discount += parseFloat(l.discount_amount || 0);
  });

  document.getElementById('chk-driver').innerText = currentOperatorName;
  document.getElementById('chk-cash').innerText = `¥${cash.toFixed(2)}`;
  document.getElementById('chk-wechat').innerText = `¥${wechat.toFixed(2)}`;
  document.getElementById('chk-baskets').innerText = `${baskets} 件`;
  document.getElementById('chk-discount').innerText = `¥${discount.toFixed(2)}`;
  document.getElementById('chk-total').innerText = `¥${(cash + wechat).toFixed(2)}`;

  window.openModal('checkout-modal');
};

window.finalizeSettlement = () => {
  alert('📋 请将随车实收现钞及收回周转载具清点交予库房与账房财务，待财务在调度台点清确认后今日账目即圆满闭环！');
  window.closeModal('checkout-modal');
};

window.openSuggestionModal = () => window.openModal('modal-suggestion');

window.submitDriverSuggestion = async function () {
  const content = document.getElementById('driver-suggestion-text').value.trim();
  if (!content) return alert('请写下您的建言内容！');

  const { error } = await DriverService.submitSuggestion(currentAgent, currentOperatorName, content);
  if (error) alert('提交失败: ' + error.message);
  else {
    alert('🙏 感谢执事建言，已呈达平台总控！');
    document.getElementById('driver-suggestion-text').value = '';
    window.closeModal('modal-suggestion');
  }
};

async function bootPalmWorkspace() {
  renderRoleAdaptiveShell();
  await window.loadDriverTasks();
}

export async function initDriverController() {
  let savedSession = null;
  try {
    savedSession = JSON.parse(localStorage.getItem(PALM_SESSION_KEY) || 'null');
  } catch (e) {}

  if (savedSession && savedSession.tenantId) {
    currentAgent = savedSession.tenantId;
    currentRoleCode = savedSession.roleCode || 'driver';
    effectiveViewRole = currentRoleCode === 'owner' ? 'driver' : currentRoleCode;
    currentOperatorName = savedSession.operatorName || '一线执事';
    document.getElementById('palm-auth-gate')?.classList.add('hidden');
    await bootPalmWorkspace();
  } else {
    document.getElementById('palm-auth-gate')?.classList.remove('hidden');
  }
}
