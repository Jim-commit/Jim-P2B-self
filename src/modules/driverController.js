import { supabase } from '../lib/supabase.js';
import { DriverService } from '../services/driverService.js';
import { AuthSecurity } from '../utils/authSecurity.js';
import { MobileSecurityGuard } from '../utils/mobileSecurityGuard.js';
import {
  PALM_SESSION_KEY,
  driverState,
  isDirectoryLead,
  speakPalmVoiceNotice,
  updateOfflineBanner,
  initOfflineAndUtilityBindings
} from './driver/driverState.js';
import { initDriverAuthBindings } from './driver/driverAuthModule.js';
import {
  renderPalmWarehouseProducts,
  renderPalmExpressOrders,
  renderSalesStoresList,
  initQcPanelWorkspace,
  initFieldOpsBindings
} from './driver/driverFieldOpsModule.js';
import {
  renderRoute,
  initDeliveryBindings
} from './driver/driverDeliveryModule.js';

window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

window.togglePalmLargeFont = function () {
  const isLarge = document.body.classList.toggle('large-font-mode');
  localStorage.setItem('baigong_palm_large_font', isLarge ? '1' : '0');
  const btn = document.getElementById('btn-palm-large-font');
  if (btn) btn.innerText = isLarge ? '🔎 标准字' : '🔍 大字';
};

window.switchOwnerPreviewRole = function (role) {
  driverState.effectiveViewRole = role;
  renderRoleAdaptiveShell();
};

function renderRoleAdaptiveShell() {
  const roleNames = {
    owner: '👑 大当家双合一专席',
    driver: '🚚 送货师傅专席',
    warehouse: '📦 仓储调度专席 (盲价)',
    sales: '🤝 业务员 / 催收专席',
    producer: '🌾 产区采收 / 车间专席',
    qc_service: '🔧 售后定损 / 质检专席'
  };

  document.getElementById('tenant-display').innerText = driverState.currentAgent || '未绑定商号';
  document.getElementById('driver-name-display').innerText = driverState.currentOperatorName;
  document.getElementById('palm-role-badge').innerText = roleNames[driverState.currentRoleCode] || driverState.currentRoleCode;

  document.getElementById('btn-palm-qr-auth')?.classList.toggle('hidden', driverState.currentRoleCode !== 'owner');

  const ownerSwitcher = document.getElementById('owner-view-switcher');
  if (ownerSwitcher) {
    ownerSwitcher.classList.toggle('hidden', driverState.currentRoleCode !== 'owner');
    const sel = document.getElementById('owner-role-preview-select');
    if (sel && driverState.currentRoleCode === 'owner') sel.value = driverState.effectiveViewRole;
  }

  const viewRole = driverState.currentRoleCode === 'owner' ? driverState.effectiveViewRole : driverState.currentRoleCode;

  ['pane-owner-cockpit', 'pane-deliver', 'pane-warehouse', 'pane-sales-stores', 'pane-qc-service', 'pane-explore'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.getElementById('driver-cash-summary-card')?.classList.add('hidden');
  document.getElementById('driver-checkout-footer')?.classList.add('hidden');

  const navBox = document.getElementById('palm-role-nav');
  if (!navBox) return;

  if (viewRole === 'owner_cockpit') {
    navBox.innerHTML = '';
    document.getElementById('pane-owner-cockpit')?.classList.remove('hidden');
    renderOwnerMobileCockpit();
  } else if (viewRole === 'driver') {
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
    initQcPanelWorkspace();
  } else {
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

function renderOwnerMobileCockpit() {
  const goodsVal = driverState.allProducts.reduce((s, p) => s + parseFloat(p.tier_1_price || 0) * parseInt(p.stock ?? 0), 0);
  const debtVal = driverState.allStores.reduce((s, st) => s + parseFloat(st.current_debt || 0), 0);
  const settledVal = driverState.deliveredOrdersCache.reduce((s, o) => s + parseFloat(o.net_settle_amount || o.total_amount || 0), 0);

  const gEl = document.getElementById('oc-goods-val');
  const dEl = document.getElementById('oc-debt-val');
  const sEl = document.getElementById('oc-settled-val');
  if (gEl) gEl.innerText = `¥${goodsVal.toFixed(0)}`;
  if (dEl) dEl.innerText = `¥${debtVal.toFixed(0)}`;
  if (sEl) sEl.innerText = `¥${settledVal.toFixed(0)}`;

  const listEl = document.getElementById('oc-todo-list');
  if (!listEl) return;

  const cards = [];
  const pendingClaims = driverState.inventoryLogsCache.filter((l) => l.action_type === 'qc_damage_claim' && !String(l.remark || '').includes('[已核准冲账]'));
  pendingClaims.forEach((c) => {
    const noMatch = (c.remark || '').match(/\[单号:([^\]]+)\]/);
    const amtMatch = (c.remark || '').match(/\[冲抵金额:¥([0-9.]+)\]/);
    const voucherNo = noMatch ? noMatch[1] : `DS-${c.id}`;
    const amt = amtMatch ? parseFloat(amtMatch[1]) : 0;
    cards.push(`
      <div class="p-3 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-1.5">
        <div class="flex justify-between items-center font-bold">
          <span class="text-rose-900">🔧 内部定损单 ${voucherNo}</span>
          <span class="font-mono text-rose-700">冲抵 ¥${amt.toFixed(2)}</span>
        </div>
        <p class="text-[11px] text-stone-600">${c.remark || ''}</p>
        <button type="button" onclick="window.approveOwnerMobileClaim(${c.id})" class="w-full bg-rose-600 text-white font-bold py-1.5 rounded-xl text-[11px]">
          ✅ 手机核准定损并冲减欠款
        </button>
      </div>
    `);
  });

  const draftProds = driverState.allProducts.filter((p) => p.status === 'draft');
  draftProds.forEach((p) => {
    cards.push(`
      <div class="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1.5">
        <div class="flex justify-between items-center font-bold">
          <span class="text-amber-950">📝 待定价草稿：${p.name}</span>
          <span class="font-mono text-stone-500">存 ${p.stock ?? 0}${p.measure_unit || '件'}</span>
        </div>
        <button type="button" onclick="window.quickPriceAndPublishDraft(${p.id}, '${p.name.replace(/'/g, '')}')" class="w-full bg-[#1b4332] text-white font-bold py-1.5 rounded-xl text-[11px]">
          💎 手机设定基准价并上架
        </button>
      </div>
    `);
  });

  if (cards.length === 0) {
    listEl.innerHTML = '<div class="py-6 text-center text-stone-400">🌿 暂无待审批定损单或待定价草稿，可在顶部下拉切换任意一线岗位巡检！</div>';
  } else {
    listEl.innerHTML = cards.join('');
  }
}

window.approveOwnerMobileClaim = async function (logId) {
  const log = driverState.inventoryLogsCache.find((x) => Number(x.id) === Number(logId));
  if (!log) return;
  const amtMatch = (log.remark || '').match(/\[冲抵金额:¥([0-9.]+)\]/);
  const storeIdMatch = (log.remark || '').match(/\[门店ID:(\d+)\]/);
  const deductAmt = amtMatch ? parseFloat(amtMatch[1]) : 0;
  const storeId = storeIdMatch ? parseInt(storeIdMatch[1]) : 0;
  const store = driverState.allStores.find((s) => Number(s.id) === storeId);

  if (!confirm(`确认核准该笔内部定损单并冲减门店欠款 ¥${deductAmt.toFixed(2)}？`)) return;

  if (store && deductAmt > 0) {
    const nextDebt = Math.max(0, Number((parseFloat(store.current_debt || 0) - deductAmt).toFixed(2)));
    await supabase.from('store').update({ current_debt: nextDebt }).eq('id', store.id);
  }
  await supabase
    .from('inventory_log')
    .update({ remark: `${log.remark || ''} [已核准冲账 · 掌柜手机核准]`.trim() })
    .eq('id', log.id);

  alert('✅ 定损单已核准并完成账目冲抵！');
  await window.loadDriverTasks();
};

window.quickPriceAndPublishDraft = async function (prodId, prodName) {
  const p1 = prompt(`为【${prodName}】设定「批发平准基准价」(元)：`);
  if (!p1 || isNaN(p1) || parseFloat(p1) <= 0) return;
  const p2 = prompt(`为【${prodName}】设定「网上平准零售基准价」(元，留空同批发价)：`, p1);
  const tier1 = parseFloat(p1);
  const tier2 = p2 && !isNaN(p2) && parseFloat(p2) > 0 ? parseFloat(p2) : tier1;

  await supabase.from('product').update({ tier_1_price: tier1, tier_2_price: tier2, status: 'active' }).eq('id', prodId);
  alert(`🎉 【${prodName}】已设定基准价（批发 ¥${tier1} / 零售 ¥${tier2}）并正式上架！`);
  await window.loadDriverTasks();
};

window.openPalmHelpModal = function () {
  const viewRole = driverState.currentRoleCode === 'owner' ? driverState.effectiveViewRole : driverState.currentRoleCode;
  const helpMap = {
    owner_cockpit: '• <b>掌柜移动指挥舱</b>：手机随时查看三流晴雨、核准商号内部定损单(DS-)冲减欠款、或为仓管提交的草稿货品定好价格正式上架。<br/>• <b>扫码授权电脑</b>：点击顶栏「📷 授权电脑」扫描电脑调度台二维码，免输长密码秒登电脑。<br/>• <b>快捷短码锁屏</b>：点击顶栏「🔒 锁屏」一键锁定为 4 位数字九宫格，防旁人误看。',
    driver: '• <b>随车交割</b>：点击合作门店卡片即可查看新配、退验与对调明细，清点回收周转载具并让掌柜手写签名确认。<br/>• <b>精准导航</b>：点击门店「🧭 导航」可直接调起地图直达店门口。<br/>• <b>地下室防丢单</b>：无信号时照常提交签收，出库有信号后点击顶部黄色提示条一键同步回库。',
    warehouse: '• <b>盲价隔离保护</b>：本工作台已自动屏蔽所有商品进销价格与客户账款。<br/>• <b>标准单据制单</b>：系统自动生成年月日时标准入库单(RK)与出库单(CK)，并可查看装车总拣货单。',
    producer: '• <b>田间/车间预入库</b>：采收或完工后，选择货品与交货班组直接提交 RK 入库单，仓库库存实时增加。',
    sales: '• <b>私海客户与催收</b>：仅显示归属您跟进及公海门店；拍门头或转账回执可自动识字填金额，催收单经掌柜签名后直推财务核销。',
    qc_service: '• <b>商号内部定损单 (DS-)</b>：选择门店、填写建议冲抵金额、拍照并请掌柜签名，写入商号私有账本供财务核准冲账（不惊动平台）。'
  };
  const body = document.getElementById('palm-help-body');
  if (body) body.innerHTML = helpMap[viewRole] || helpMap.driver;
  window.openModal('modal-palm-help');
};

async function runPalmSecurityPatrol() {
  if (!driverState.currentAgent) return;
  let savedSession = null;
  try {
    savedSession = JSON.parse(localStorage.getItem(PALM_SESSION_KEY) || 'null');
  } catch (e) {}

  await MobileSecurityGuard.runMobileSecurityCheck({
    tenantId: driverState.currentAgent,
    localSessionEpoch: savedSession?.sessionEpoch || driverState.sessionEpoch || 1,
    flushOfflineQueueFn: async () => {
      if (navigator.onLine && typeof window.syncOfflineQueue === 'function') {
        await window.syncOfflineQueue(true);
      }
    },
    onTerminalRevokedFn: () => {
      if (typeof window.logoutPalmTerminal === 'function') {
        window.logoutPalmTerminal();
      } else {
        localStorage.removeItem(PALM_SESSION_KEY);
        document.getElementById('palm-auth-gate')?.classList.remove('hidden');
      }
    }
  });
}

window.loadDriverTasks = async function () {
  if (!driverState.currentAgent) return;
  updateOfflineBanner();

  // 执行弱网离线队列优先入库、72小时观察期三端联动预警及终端清退巡检
  await runPalmSecurityPatrol();

  const [tenantRes, stores, prods, activeOrds, deliveredOrds, todayLogs, invLogsRes] = await Promise.all([
    supabase.from('platform_tenant').select('custom_settings, session_epoch').eq('tenant_id', driverState.currentAgent).maybeSingle(),
    DriverService.fetchRouteStores(driverState.currentAgent),
    supabase.from('product').select('*').eq('tenant_id', driverState.currentAgent).order('id', { ascending: false }),
    DriverService.fetchActiveOrders(driverState.currentAgent),
    DriverService.fetchTodayDeliveredOrders(driverState.currentAgent),
    DriverService.fetchTodayCollections(driverState.currentAgent),
    supabase.from('inventory_log').select('*').eq('tenant_id', driverState.currentAgent).order('id', { ascending: false }).limit(50)
  ]);

  if (tenantRes?.data?.session_epoch) {
    driverState.sessionEpoch = Number(tenantRes.data.session_epoch);
    try {
      const curSess = JSON.parse(localStorage.getItem(PALM_SESSION_KEY) || 'null');
      if (curSess && !curSess.sessionEpoch) {
        curSess.sessionEpoch = driverState.sessionEpoch;
        localStorage.setItem(PALM_SESSION_KEY, JSON.stringify(curSess));
      }
    } catch (e) {}
  }

  const settings = tenantRes?.data?.custom_settings && typeof tenantRes.data.custom_settings === 'object'
    ? tenantRes.data.custom_settings
    : {};
  if (Array.isArray(settings.carriers) && settings.carriers.length > 0) {
    driverState.globalCarriersList = settings.carriers;
    driverState.currentCarrierLabel = settings.carriers[0].name || '周转筐';
  }

  driverState.allStores = stores;
  driverState.allProducts = prods.data || [];
  driverState.activeOrders = activeOrds.filter((o) => !isDirectoryLead(o));
  driverState.deliveredOrdersCache = deliveredOrds;
  driverState.inventoryLogsCache = invLogsRes?.data || [];

  let newStoreName = '';
  driverState.activeOrders.forEach((o) => {
    const oid = Number(o.id);
    if (!driverState.knownActiveOrderIds.has(oid)) {
      if (driverState.knownActiveOrderIds.size > 0) {
        newStoreName = o.store_name || '合作门店';
      }
      driverState.knownActiveOrderIds.add(oid);
    }
  });
  if (newStoreName) {
    speakPalmVoiceNotice(`您有一笔发往${newStoreName}的新配货单，请留意核对装车`);
  }

  renderRoute();

  const cashAmt = todayLogs.filter((l) => l.pay_method === '现金').reduce((sum, l) => sum + parseFloat(l.amount || 0), 0);
  const wechatAmt = todayLogs.filter((l) => l.pay_method !== '现金').reduce((sum, l) => sum + parseFloat(l.amount || 0), 0);
  document.getElementById('today-cash-collected').innerText = `¥${(cashAmt + wechatAmt).toFixed(2)}`;
  document.getElementById('stat-cash').innerText = `¥${cashAmt.toFixed(0)}`;
  document.getElementById('stat-wechat').innerText = `¥${wechatAmt.toFixed(0)}`;
  document.getElementById('stat-done-count').innerText = driverState.deliveredOrdersCache.length;

  const viewRole = driverState.currentRoleCode === 'owner' ? driverState.effectiveViewRole : driverState.currentRoleCode;
  if (viewRole === 'owner_cockpit') {
    renderOwnerMobileCockpit();
  } else if (viewRole === 'warehouse' || viewRole === 'producer') {
    renderPalmWarehouseProducts();
    renderPalmExpressOrders();
  } else if (viewRole === 'sales') {
    renderSalesStoresList();
  } else if (viewRole === 'qc_service') {
    initQcPanelWorkspace();
  }
};

async function bootPalmWorkspace() {
  renderRoleAdaptiveShell();
  await window.loadDriverTasks();

  const urlParams = new URLSearchParams(window.location.search);
  const incomingQr = urlParams.get('qr_token');
  if (incomingQr && driverState.currentRoleCode === 'owner') {
    window.openPalmQrAuthorizeModal();
    window.preparePalmApproveQrToken(incomingQr);
  }
}

export async function initDriverController() {
  initOfflineAndUtilityBindings();
  initDriverAuthBindings({ onBootWorkspace: bootPalmWorkspace });
  initFieldOpsBindings();
  initDeliveryBindings();

  if (localStorage.getItem('baigong_palm_large_font') === '1') {
    document.body.classList.add('large-font-mode');
    const btn = document.getElementById('btn-palm-large-font');
    if (btn) btn.innerText = '🔎 标准字';
  }

  let savedSession = null;
  try {
    savedSession = JSON.parse(localStorage.getItem(PALM_SESSION_KEY) || 'null');
  } catch (e) {}

  if (savedSession && savedSession.tenantId) {
    driverState.currentAgent = savedSession.tenantId;
    driverState.sessionEpoch = Number(savedSession.sessionEpoch || 1);
    driverState.currentRoleCode = savedSession.roleCode || 'driver';
    driverState.effectiveViewRole = driverState.currentRoleCode === 'owner' ? 'owner_cockpit' : driverState.currentRoleCode;
    driverState.currentAccountCode = savedSession.accountCode || '';
    driverState.currentOperatorName = savedSession.operatorName || '一线执事';
    document.getElementById('palm-auth-gate')?.classList.add('hidden');
    await bootPalmWorkspace();
    return;
  }

  const lastTid = localStorage.getItem('baigong_palm_last_tid') || '';
  const pinInfo = lastTid ? AuthSecurity.getDeviceQuickPinInfo(lastTid) : null;
  if (pinInfo && pinInfo.sessionSnapshot) {
    document.getElementById('palm-pin-tenant-label').innerText = `商号：${lastTid}`;
    document.getElementById('palm-pin-operator-label').innerText = `欢迎回来，${pinInfo.sessionSnapshot.operatorName} · 请按 4 位快捷短码`;
    document.getElementById('palm-pin-unlock-box')?.classList.remove('hidden');
    document.getElementById('palm-full-login-form')?.classList.add('hidden');
    document.getElementById('btn-palm-back-pin')?.classList.remove('hidden');
  } else if (lastTid) {
    const tidInp = document.getElementById('palm-login-tenant');
    if (tidInp) tidInp.value = lastTid;
  }

  document.getElementById('palm-auth-gate')?.classList.remove('hidden');
}
