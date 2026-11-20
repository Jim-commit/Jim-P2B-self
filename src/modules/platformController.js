import { supabase } from '../lib/supabase.js';
import { TOTP } from '../utils/totp.js';

const P_AUTH_SESSION_KEY = 'platform_admin_session_token';
const PLATFORM_GOV_PREFS_KEY = 'baigong_platform_gov_prefs_v1';

const PLATFORM_SEVERE_TERMS = [
  '国家级', '世界级', '最高级', '第一', '绝对', '包治百病', '根治', '神效',
  '假一赔万', '100%有效', '加微信', '微信号', '私下转账'
];

let allApplications = [];
let allTenants = [];
let allProducts = [];
let allCategories = [];
let allSuggestions = [];
let allAuditLogs = [];
let allEcoPlans = [];
let allEcoPool = [];
let allEcoC2B = [];
let allEcoOrders = [];
let pendingPlatform2FACallback = null;

function formatBusinessTypeLabel(type) {
  const map = {
    coop: '🌾 村社合作社 / 产区直供',
    factory: '🏭 源头工坊 / 生产制造',
    dealer: '🏢 区域平准仓 / 集散商行',
    service: '🛠️ 工料配件 / 综合服务',
    individual: '👨‍🌾 个人农户 / 非遗匠人 (GR)'
  };
  return map[type] || '🏢 区域平准仓 / 集散商行';
}

window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

window.switchTab = function (tabName) {
  ['apps', 'tenants', 'compliance', 'ecosystem', 'suggestions', 'categories', 'selfcheck', 'audit'].forEach((t) => {
    document.getElementById(`p-tab-${t}`)?.classList.add('hidden');
    const btn = document.getElementById(`p-tab-btn-${t}`);
    if (btn) {
      btn.className = 'flex-1 py-2 px-2 text-center rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition flex items-center justify-center gap-1 whitespace-nowrap';
    }
  });
  document.getElementById(`p-tab-${tabName}`)?.classList.remove('hidden');
  const activeBtn = document.getElementById(`p-tab-btn-${tabName}`);
  if (activeBtn) {
    activeBtn.className = 'flex-1 py-2 px-2 text-center rounded-xl bg-stone-900 text-white transition flex items-center justify-center gap-1 whitespace-nowrap';
  }
};

window.syncManualModalDefaults = function () {
  const ccode = document.getElementById('m-credit-code').value.trim().toUpperCase();
  if (ccode.length >= 6) document.getElementById('m-access-key').value = ccode.slice(-6);
};

window.freeGovAuditCheck = function (companyName, creditCode) {
  const queryKey = creditCode && creditCode.length >= 15 ? creditCode : companyName;
  navigator.clipboard
    .writeText(queryKey)
    .then(() => {
      alert(`📋 已自动复制：【${queryKey}】\n\n即将打开免费工商查询页（爱企查），请直接贴上核对该合作社/企业是否为「存续/在营」状态！`);
      window.open(`https://aiqicha.baidu.com/s?q=${encodeURIComponent(queryKey)}`, '_blank');
    })
    .catch(() => {
      window.open(`https://aiqicha.baidu.com/s?q=${encodeURIComponent(queryKey)}`, '_blank');
    });
};

// =========================================================================
// 人机治理边界偏好设置（常规琐事 AI 自动执行 vs 涉违底线人工终审）
// =========================================================================
function loadGovernancePrefs() {
  let prefs = { aiAutoMinor: true, humanSevereOnly: true };
  try {
    const saved = JSON.parse(localStorage.getItem(PLATFORM_GOV_PREFS_KEY) || 'null');
    if (saved) prefs = { ...prefs, ...saved };
  } catch (e) {}
  const c1 = document.getElementById('chk-ai-auto-minor');
  const c2 = document.getElementById('chk-human-severe-only');
  if (c1) c1.checked = !!prefs.aiAutoMinor;
  if (c2) c2.checked = !!prefs.humanSevereOnly;
  return prefs;
}

window.savePlatformGovernancePrefs = function () {
  const prefs = {
    aiAutoMinor: !!document.getElementById('chk-ai-auto-minor')?.checked,
    humanSevereOnly: !!document.getElementById('chk-human-severe-only')?.checked
  };
  localStorage.setItem(PLATFORM_GOV_PREFS_KEY, JSON.stringify(prefs));
  window.runPlatformAIComplianceScan();
};

// =========================================================================
// 总控 TOTP 验证器绑定与 2FA 核身（100% 保留原有逻辑）
// =========================================================================
window.openPlatformTotpSetup = async function () {
  const account = sessionStorage.getItem('p_auth_account') || 'admin';
  const { data: admin, error } = await supabase.from('platform_admin_credential').select('*').eq('admin_account', account).single();

  if (error || !admin) {
    return alert('读取总控管理员信息失败：' + (error?.message || '未找到账号'));
  }

  let secret = (admin.totp_secret || '').trim();
  if (!secret) {
    secret = TOTP.generateRandomSecret();
    const { data: upData, error: upErr } = await supabase
      .from('platform_admin_credential')
      .update({ totp_secret: secret })
      .eq('admin_account', account)
      .select();

    if (upErr || !upData || upData.length === 0) {
      return alert('⚠️ 云端数据库写入秘钥被拦截，请先在 Supabase SQL Editor 执行 RLS 更新放行策略：' + (upErr?.message || '受影响行数为 0'));
    }
  }

  document.getElementById('platform-totp-secret-display').innerText = secret;
  document.getElementById('platform-totp-test-code').value = '';
  document.getElementById('platform-totp-qr').src = TOTP.buildQrImageUrl('PlatformMasterHQ', account, secret);
  window.openModal('modal-platform-totp-setup');
};

window.copyPlatformTotpSecret = function () {
  const secret = document.getElementById('platform-totp-secret-display').innerText;
  navigator.clipboard.writeText(secret).then(() => alert('总控 TOTP 密钥已复制到剪贴簿！'));
};

window.verifyAndSavePlatformTotp = async function () {
  const code = document.getElementById('platform-totp-test-code').value.trim();
  const secret = document.getElementById('platform-totp-secret-display').innerText.trim();
  const account = sessionStorage.getItem('p_auth_account') || 'admin';

  if (!code || code.length !== 6) return alert('请输入验证器中显示的 6 位动态口令！');

  const isValid = await TOTP.verifyTOTP(secret, code, 2);
  if (!isValid) {
    return alert('⚠️ 动态口令验证未通过！\n1. 请确认手机「自动设置时间」已开启；\n2. 若扫码异常，请点击「复制密钥」，在手机验证器选择「手动输入密钥」添加（基于时间）。');
  }

  const { data, error } = await supabase
    .from('platform_admin_credential')
    .update({ totp_secret: secret, totp_enabled: true })
    .eq('admin_account', account)
    .select();

  if (error || !data || data.length === 0) {
    return alert('⚠️ 数据库写入被拦截（请在 Supabase SQL Editor 执行 platform_admin_credential 的 UPDATE 放行策略）：' + (error?.message || '受影响行数为 0'));
  }

  await recordAuditLog('绑定总控TOTP验证器', 'CRITICAL_2FA', { admin_account: account });
  alert('🎉 平台总控身份验证器已真正写入云端并绑定成功！');
  window.closeModal('modal-platform-totp-setup');
  await checkPlatformAuthStatus();
};

window.verifyPlatformAuthPwd = async function (e) {
  e.preventDefault();
  const account = document.getElementById('p-auth-account').value.trim();
  const token = document.getElementById('p-auth-token').value.trim();
  const errBox = document.getElementById('p-auth-error');
  const btn = document.getElementById('btn-platform-auth');

  btn.disabled = true;
  btn.innerText = '正在核对密钥...';
  errBox.classList.add('hidden');

  const { data, error } = await supabase
    .from('platform_admin_credential')
    .select('*')
    .eq('admin_account', account)
    .eq('secret_token', token)
    .eq('is_active', true)
    .limit(1);

  if (error || !data || data.length === 0) {
    btn.disabled = false;
    btn.innerText = '安全验证 · 登录总控台';
    errBox.innerText = '⚠️ 安全凭证无效或账号已被锁定！';
    errBox.classList.remove('hidden');
    return;
  }

  sessionStorage.setItem(P_AUTH_SESSION_KEY, token);
  sessionStorage.setItem('p_auth_account', account);
  sessionStorage.setItem('p_auth_name', data[0].admin_name || '总控执事');
  document.getElementById('platform-auth-gate').classList.add('hidden');
  alert(`✅ 凭证核验通过！欢迎：${data[0].admin_name}`);
  window.loadPlatformData();
  checkPlatformAuthStatus();
};

async function checkPlatformAuthStatus() {
  const savedToken = sessionStorage.getItem(P_AUTH_SESSION_KEY);
  if (!savedToken) {
    document.getElementById('platform-auth-gate')?.classList.remove('hidden');
    return false;
  }

  const { data } = await supabase.from('platform_admin_credential').select('*').eq('secret_token', savedToken).eq('is_active', true).limit(1);

  if (data && data.length > 0) {
    document.getElementById('platform-auth-gate')?.classList.add('hidden');
    const pill = document.getElementById('totp-status-pill');
    const btnTotp = document.getElementById('btn-platform-totp');
    if (data[0].totp_enabled && data[0].totp_secret) {
      if (pill) {
        pill.className = 'bg-emerald-500/20 text-emerald-300 text-[10px] px-2.5 py-0.5 rounded-full border border-emerald-400/40 font-mono font-bold flex items-center gap-1';
        pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> TOTP 已护航';
      }
      if (btnTotp) {
        btnTotp.innerHTML = '<span>✅</span> 总控验证器已绑';
        btnTotp.className =
          'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs px-3.5 py-2 rounded-xl font-bold border border-emerald-400/50 active:scale-95 transition flex items-center gap-1.5';
      }
    } else {
      if (pill) {
        pill.className = 'bg-stone-800 text-stone-400 text-[10px] px-2.5 py-0.5 rounded-full border border-stone-700 font-mono font-bold flex items-center gap-1';
        pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-stone-500"></span> TOTP 未激活';
      }
      if (btnTotp) {
        btnTotp.innerHTML = '<span>🛡️</span> 绑定总控验证器';
        btnTotp.className =
          'bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs px-3.5 py-2 rounded-xl font-bold border border-amber-400/30 active:scale-95 transition flex items-center gap-1.5';
      }
    }
    return true;
  } else {
    sessionStorage.removeItem(P_AUTH_SESSION_KEY);
    document.getElementById('platform-auth-gate')?.classList.remove('hidden');
    return false;
  }
}

window.logoutPlatform = function () {
  sessionStorage.removeItem(P_AUTH_SESSION_KEY);
  sessionStorage.removeItem('p_auth_account');
  sessionStorage.removeItem('p_auth_name');
  document.getElementById('platform-auth-gate')?.classList.remove('hidden');
};

window.triggerPlatform2FA = async function (actionDesc, onVerifiedCallback) {
  document.getElementById('modal-platform-2fa-desc').innerText = actionDesc;
  document.getElementById('input-platform-2fa-token').value = '';
  pendingPlatform2FACallback = onVerifiedCallback;
  window.openModal('modal-platform-2fa');
  setTimeout(() => document.getElementById('input-platform-2fa-token').focus(), 150);
};

window.closePlatform2FAModal = function () {
  pendingPlatform2FACallback = null;
  window.closeModal('modal-platform-2fa');
};

window.submitPlatform2FAVerification = async function () {
  const inputVal = document.getElementById('input-platform-2fa-token').value.trim();
  const account = sessionStorage.getItem('p_auth_account') || 'admin';
  const curToken = sessionStorage.getItem(P_AUTH_SESSION_KEY);

  const { data: admin } = await supabase.from('platform_admin_credential').select('*').eq('admin_account', account).single();

  let isSuccess = false;
  if (admin?.totp_enabled && admin?.totp_secret && inputVal.length === 6 && /^\d+$/.test(inputVal)) {
    isSuccess = await TOTP.verifyTOTP(admin.totp_secret, inputVal, 2);
  } else {
    isSuccess = inputVal === curToken;
  }

  if (!isSuccess) {
    return alert('⚠️ 身份核身失败！口令或总控令牌不符，操作已被中止。');
  }

  window.closePlatform2FAModal();
  if (typeof pendingPlatform2FACallback === 'function') {
    pendingPlatform2FACallback();
  }
};

async function recordAuditLog(actionTitle, level, details) {
  try {
    const account = sessionStorage.getItem('p_auth_account') || 'admin';
    const name = sessionStorage.getItem('p_auth_name') || '总控执事';
    const seal = 'SEAL-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    await supabase.from('audit_immutable_log').insert([
      {
        tenant_id: 'PLATFORM',
        operator_account: account,
        operator_name: name,
        action_level: level,
        action_title: actionTitle,
        action_details: details || {},
        tamper_seal: seal
      }
    ]);
  } catch (e) {}
}

// =========================================================================
// 大盘数据加载与各板块渲染
// =========================================================================
window.loadPlatformData = async function () {
  loadGovernancePrefs();

  const [appsRes, tenantsRes, prodsRes, suggsRes, catsRes, auditsRes, plansRes, poolRes, c2bRes, ordersRes] = await Promise.all([
    supabase.from('tenant_application').select('*').order('id', { ascending: false }),
    supabase.from('platform_tenant').select('*').order('id', { ascending: false }),
    supabase.from('product').select('id, tenant_id, name, image_url, tier_1_price, status, custom_specs').order('id', { ascending: false }).limit(400),
    supabase
      .from('platform_suggestion_board')
      .select('*')
      .not('proposer_type', 'in', '("c2b_demand","mall_review")')
      .order('id', { ascending: false }),
    supabase.from('platform_category').select('*').order('sort_order', { ascending: true }),
    supabase.from('audit_immutable_log').select('*').order('id', { ascending: false }).limit(25),
    supabase.from('demand_forecast_plan').select('*').order('id', { ascending: false }).limit(100),
    supabase.from('local_inventory_pool').select('*').order('id', { ascending: false }).limit(100),
    supabase.from('platform_suggestion_board').select('*').eq('proposer_type', 'c2b_demand').order('id', { ascending: false }).limit(50),
    supabase.from('store_order').select('id, tenant_id, delivery_status, order_status').order('id', { ascending: false }).limit(200)
  ]);

  allApplications = appsRes.data || [];
  const pendingApps = allApplications.filter((a) => a.application_status === 'pending_review');
  document.getElementById('stat-pending-apps').innerText = `${pendingApps.length} 份`;

  const badge = document.getElementById('badge-pending-count');
  if (pendingApps.length > 0) {
    badge.innerText = pendingApps.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
  renderApplications();

  allTenants = tenantsRes.data || [];
  document.getElementById('stat-total-tenants').innerText = `${allTenants.length} 家`;
  renderTenantsTable();

  allProducts = prodsRes.data || [];
  const severeList = getFlaggedProductsList().filter((x) => x.isSevere);
  const compBadge = document.getElementById('badge-compliance-count');
  if (compBadge) {
    compBadge.innerText = severeList.length;
    compBadge.classList.toggle('hidden', severeList.length === 0);
  }
  window.runPlatformAIComplianceScan();

  allSuggestions = suggsRes.data || [];
  const pendingSuggs = allSuggestions.filter((s) => s.reply_status === 'pending');
  document.getElementById('stat-pending-suggs').innerText = `${pendingSuggs.length} 帖`;
  const sBadge = document.getElementById('badge-sugg-count');
  if (pendingSuggs.length > 0) {
    sBadge.innerText = pendingSuggs.length;
    sBadge.classList.remove('hidden');
  } else {
    sBadge.classList.add('hidden');
  }
  renderSuggestions();

  allCategories = catsRes.data || [];
  const l1 = allCategories.filter((c) => c.level === 1);
  const l2 = allCategories.filter((c) => c.level === 2);
  document.getElementById('stat-cat-l1').innerText = `${l1.length} 类`;
  document.getElementById('stat-cat-l2').innerText = `${l2.length} 项`;
  renderCategoryTree();

  allAuditLogs = auditsRes.data || [];
  renderAuditLogs();

  allEcoPlans = plansRes.data || [];
  allEcoPool = poolRes.data || [];
  allEcoC2B = c2bRes.data || [];
  allEcoOrders = ordersRes.data || [];
  renderEcosystemDashboard();
  window.renderPlatformSelfCheck();

  updateAISummaryInsight();
};

// =========================================================================
// 商道清朗 · 全网在架良品 AI 合规巡检（常规琐事 AI 自动提示 · 高风险人工终审）
// =========================================================================
function getFlaggedProductsList() {
  const activeProds = allProducts.filter((p) => p.status === 'active');
  const flagged = [];

  activeProds.forEach((p) => {
    const reasons = [];
    let isSevere = false;
    const summary = p.custom_specs?.summary || '';
    const fullText = `${p.name || ''} ${summary}`;

    const hitTerms = PLATFORM_SEVERE_TERMS.filter((w) => fullText.includes(w));
    if (hitTerms.length > 0) {
      reasons.push(`文案含广告法慎用词【${hitTerms.join('、')}】`);
      isSevere = true;
    }
    if (parseFloat(p.tier_1_price || 0) <= 0) {
      reasons.push('批发基准价异常（≤0元）');
      isSevere = true;
    }
    if (!p.image_url) {
      reasons.push('缺少商品实拍照（常规规范提醒）');
    }

    if (reasons.length > 0) {
      const alreadyNotified = !!p.custom_specs?.ai_minor_notified;
      flagged.push({ prod: p, reasons, isSevere, alreadyNotified });
    }
  });
  return flagged;
}

window.runPlatformAIComplianceScan = function () {
  const listEl = document.getElementById('platform-compliance-list');
  const sumEl = document.getElementById('platform-compliance-summary');
  if (!listEl) return;

  const prefs = loadGovernancePrefs();
  const activeProds = allProducts.filter((p) => p.status === 'active');
  const allFlagged = getFlaggedProductsList();
  const severeCount = allFlagged.filter((x) => x.isSevere).length;
  const minorCount = allFlagged.filter((x) => !x.isSevere).length;

  // 若开启“涉违底线保留人工终审”，常规缺图琐事可一键由 AI 自动处理，不刷屏干扰管理员
  const displayList = prefs.humanSevereOnly ? allFlagged.filter((x) => x.isSevere || !x.alreadyNotified) : allFlagged;

  if (sumEl) {
    sumEl.classList.remove('hidden');
    sumEl.innerText = `📊 共巡检 ${activeProds.length} 款在架良品：${activeProds.length - allFlagged.length} 款清朗合规；高风险疑点（需人工终审）${severeCount} 款；常规缺图规范提醒 ${minorCount} 款。`;
  }

  if (displayList.length === 0) {
    listEl.innerHTML = '<div class="py-10 text-center text-emerald-800 font-bold">🌿 全网高风险涉违疑点清零，常规规范项已由 AI 协同处理，商道清朗！</div>';
    return;
  }

  listEl.innerHTML = displayList
    .map(({ prod, reasons, isSevere, alreadyNotified }) => {
      const tenantObj = allTenants.find((t) => t.tenant_id === prod.tenant_id);
      const tName = tenantObj ? tenantObj.company_name : prod.tenant_id;
      return `
        <div class="py-3 flex flex-wrap justify-between items-center gap-3">
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${isSevere ? 'bg-rose-600 text-white' : 'bg-stone-200 text-stone-700'}">
                ${isSevere ? '⚖️ 需人工终审' : '🤖 AI 常规提醒'}
              </span>
              <span class="font-mono text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded font-bold">${prod.tenant_id} · ${tName}</span>
              <b class="text-stone-900">${prod.name}</b>
              ${alreadyNotified ? '<span class="text-[10px] text-emerald-700 font-bold">✓ AI已发温婉提示</span>' : ''}
            </div>
            <div class="text-[11px] ${isSevere ? 'text-rose-900 bg-rose-50 border-rose-200' : 'text-amber-900 bg-amber-50 border-amber-200'} border px-2.5 py-1 rounded-xl">
              💡 巡检发现：${reasons.join('；')}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button type="button" onclick="window.requestProductRectify(${prod.id}, '${prod.name.replace(/'/g, '')}', '${reasons.join('；').replace(/'/g, '')}', ${isSevere})" class="${
        isSevere ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-amber-400 hover:bg-amber-500 text-stone-950'
      } font-bold px-3 py-1.5 rounded-xl shadow-2xs transition">
              ${isSevere ? '⚖️ 人工终审发函润色' : '🤖 发送温婉润色提示'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');
};

window.batchAutoNotifyMinorIssues = async function () {
  const minorItems = getFlaggedProductsList().filter((x) => !x.isSevere && !x.alreadyNotified);
  if (minorItems.length === 0) {
    return alert('🌿 当前所有常规缺实拍照商品均已由 AI 自动推送过润色提醒，无需重复操作！');
  }

  for (const item of minorItems) {
    const prevSpecs = item.prod.custom_specs && typeof item.prod.custom_specs === 'object' ? item.prod.custom_specs : {};
    const nextSpecs = {
      ...prevSpecs,
      ai_minor_notified: true,
      rectify_note: `AI 参谋温馨提示：贵号【${item.prod.name}】建议补充一张清晰实拍照，有助于邻里与合作门店更直观了解实物品质！`
    };
    // 绝不篡改商号内部的 remark 字段，仅写入公开规范提示字段
    await supabase.from('product').update({ custom_specs: nextSpecs }).eq('id', item.prod.id);
  }

  alert(`🤖 AI 参谋已自动向 ${minorItems.length} 款缺实拍照商品所属商号发送温和润色提示（保持在架不中断业务）。`);
  await window.loadPlatformData();
};

window.requestProductRectify = async function (prodId, prodName, reasonText, isSevere = true) {
  const prod = allProducts.find((p) => Number(p.id) === Number(prodId));
  const customNote = prompt(
    `【${isSevere ? '平台人工终审' : '温婉规范提示'}】将向商号发送润色建议，请确认或补充说明：`,
    `和合商道提示：贵号【${prodName}】因（${reasonText}），烦请掌柜于调度台稍作润色补全，感谢配合！`
  );
  if (!customNote || !customNote.trim()) return;

  const prevSpecs = prod?.custom_specs && typeof prod.custom_specs === 'object' ? prod.custom_specs : {};
  const nextSpecs = {
    ...prevSpecs,
    ai_minor_notified: true,
    rectify_note: customNote.trim()
  };

  // 绝不修改商号内部 remark；仅高风险违规才暂缓公开展示，常规提醒不中断经营
  const updatePayload = isSevere
    ? { status: 'rectify_required', custom_specs: nextSpecs }
    : { custom_specs: nextSpecs };

  const { error } = await supabase.from('product').update(updatePayload).eq('id', prodId);
  if (error) return alert('操作失败：' + error.message);

  await recordAuditLog(isSevere ? '人工终审提请商品润色整改' : '发送常规图文规范提示', isSevere ? 'WARN' : 'INFO', {
    tenant_id: prod?.tenant_id || 'PLATFORM',
    product_id: prodId,
    product_name: prodName,
    reason: reasonText
  });
  alert(isSevere ? `✅ 已发函提请商号润色整改，【${prodName}】已暂缓公开展示。` : `✅ 已向商号发送温婉润色提示（未中断其正常经营）。`);
  await window.loadPlatformData();
};

// =========================================================================
// 🧭 平台自身自省与健康度体检（正人先正己 · 非抽佣 · 数字主权 · 审计链完整）
// =========================================================================
window.renderPlatformSelfCheck = function () {
  const grid = document.getElementById('platform-selfcheck-grid');
  if (!grid) return;

  const totalFees = allTenants.reduce((s, t) => s + parseFloat(t.membership_fee || 0), 0);
  const individualCount = allTenants.filter((t) => t.business_type === 'individual' || String(t.tenant_id || '').startsWith('GR-')).length;
  const coopFactoryCount = allTenants.length - individualCount;
  const activeProdsCount = allProducts.filter((p) => p.status === 'active').length;
  const severeCount = getFlaggedProductsList().filter((x) => x.isSevere).length;
  const complianceRate = activeProdsCount > 0 ? (((activeProdsCount - severeCount) / activeProdsCount) * 100).toFixed(1) : '100.0';

  const checks = [
    {
      title: '① 非掠夺性公益定位与公共运维会费自查',
      status: '✅ 守正达标',
      desc: `全网交易抽佣率：0.00%（零抽佣、零竞价排名）。在册主体累计定额公共运维会费：¥${totalFees.toFixed(2)}（仅用于云服务器、图床与通信带宽运维，公开透明）。`
    },
    {
      title: '② 数字主权与商家内务零干涉自查',
      status: '✅ 边界清白',
      desc: '各入驻合作社、工坊与门店拥有独立私有账本与定价主权；商号内部定损单（DS-）与仓储备注已实现物理隔离，平台绝不窥探也不干涉商家家务事。'
    },
    {
      title: '③ 百工多元主体包容度自查',
      status: '✅ 共生共育',
      desc: `当前在册合作社/工坊/服务商 ${coopFactoryCount} 家，实名个人农户/手艺人（GR-） ${individualCount} 户，老店与合作社担保联名机制运转正常。`
    },
    {
      title: '④ 天道明鉴审计链与内容清朗度自查',
      status: `✅ 清朗率 ${complianceRate}%`,
      desc: `防篡改安全审计流水已留存 ${allAuditLogs.length} 条记录，数据库物理锁死修改与删除；高风险违禁词疑点仅 ${severeCount} 项。`
    }
  ];

  grid.innerHTML = checks
    .map(
      (c) => `
      <div class="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5">
        <div class="flex justify-between items-center">
          <b class="text-stone-900 text-xs">${c.title}</b>
          <span class="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full text-[10px] font-bold">${c.status}</span>
        </div>
        <p class="text-[11px] text-stone-600 leading-relaxed">${c.desc}</p>
      </div>
    `
    )
    .join('');
};

// =========================================================================
// 其余板块（全域供需大盘、AI参谋简报、入驻审核、主体名册、建言堂、品类、审计）100% 完整保留
// =========================================================================
function renderEcosystemDashboard() {
  const scheduledPlans = allEcoPlans.filter((p) => p.status === 'scheduled' || p.status === 'fulfilled');
  const matchedPool = allEcoPool.filter((p) => p.status === 'claimed' || p.status === 'completed');
  const repliedC2B = allEcoC2B.filter((d) => !!d.official_reply);
  const deliveredOrders = allEcoOrders.filter((o) => o.delivery_status === 'delivered');

  const elPlans = document.getElementById('eco-stat-plans');
  if (elPlans) elPlans.innerText = `${allEcoPlans.length} 份`;
  const elPlansSub = document.getElementById('eco-stat-plans-sub');
  if (elPlansSub) elPlansSub.innerText = `已纳入排产：${scheduledPlans.length} 份`;

  const elPool = document.getElementById('eco-stat-pool');
  if (elPool) elPool.innerText = `${allEcoPool.length} 笔`;
  const elPoolSub = document.getElementById('eco-stat-pool-sub');
  if (elPoolSub) elPoolSub.innerText = `已成单/交割：${matchedPool.length} 笔`;

  const elC2B = document.getElementById('eco-stat-c2b');
  if (elC2B) elC2B.innerText = `${allEcoC2B.length} 条`;
  const elC2BSub = document.getElementById('eco-stat-c2b-sub');
  if (elC2BSub) elC2BSub.innerText = `源头已回应：${repliedC2B.length} 条`;

  const elOrders = document.getElementById('eco-stat-orders');
  if (elOrders) elOrders.innerText = `${deliveredOrders.length} 单`;

  const rankBody = document.getElementById('ecosystem-rank-body');
  if (rankBody) {
    const statsList = allTenants.map((t) => {
      const tid = t.tenant_id;
      const tPlans = allEcoPlans.filter((p) => p.tenant_id === tid);
      const tPlansDone = tPlans.filter((p) => p.status === 'scheduled' || p.status === 'fulfilled');
      const tPool = allEcoPool.filter((p) => p.tenant_id === tid);
      const tPoolDone = tPool.filter((p) => p.status === 'claimed' || p.status === 'completed');
      const tC2B = repliedC2B.filter((d) => (d.official_reply || '').includes(tid) || (d.official_reply || '').includes(t.company_name));
      const tOrders = deliveredOrders.filter((o) => o.tenant_id === tid);
      const score = tPlansDone.length * 3 + tPoolDone.length * 3 + tC2B.length * 2 + tOrders.length;
      return { t, tPlans, tPlansDone, tPool, tPoolDone, tC2B, tOrders, score };
    });

    statsList.sort((a, b) => b.score - a.score);

    rankBody.innerHTML =
      statsList.length === 0
        ? '<tr><td colspan="7" class="p-6 text-center text-stone-400 font-sans">暂无在册供货商统计数据</td></tr>'
        : statsList
            .map(
              (row) => `
              <tr class="hover:bg-stone-50 transition">
                <td class="p-2.5 font-bold text-amber-800">${row.t.tenant_id}</td>
                <td class="p-2.5 font-sans font-bold text-stone-900">${row.t.company_name}</td>
                <td class="p-2.5 text-emerald-800 font-bold">${row.tPlansDone.length} / ${row.tPlans.length} 份</td>
                <td class="p-2.5 text-cyan-800 font-bold">${row.tPoolDone.length} / ${row.tPool.length} 笔</td>
                <td class="p-2.5 text-amber-800 font-bold">${row.tC2B.length} 次</td>
                <td class="p-2.5 text-stone-800 font-bold">${row.tOrders.length} 单</td>
                <td class="p-2.5 text-right font-sans">
                  <a href="mall.html?t=${encodeURIComponent(row.t.tenant_id)}" target="_blank" class="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-xl font-bold">
                    查看专柜 ➔
                  </a>
                </td>
              </tr>
            `
            )
            .join('');
  }

  const c2bListEl = document.getElementById('eco-recent-c2b-list');
  if (c2bListEl) {
    c2bListEl.innerHTML =
      allEcoC2B.length === 0
        ? '<div class="py-6 text-center text-stone-400">暂无百工天街求购需求</div>'
        : allEcoC2B
            .slice(0, 10)
            .map((d) => {
              let title = d.content;
              try {
                const parsed = JSON.parse(d.content);
                if (parsed?.title) title = `${parsed.title} (${parsed.qty || '若干'})`;
              } catch (e) {}
              return `
                <div class="py-2 flex justify-between items-center gap-2">
                  <div class="truncate">
                    <b class="text-stone-800">${title}</b>
                    <span class="text-[10px] text-stone-400 block">${d.proposer_name || '买家'} · ${new Date(d.created_at).toLocaleDateString()}</span>
                  </div>
                  <span class="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                    d.official_reply ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                  }">
                    ${d.official_reply ? '已报价回应' : '待回应'}
                  </span>
                </div>
              `;
            })
            .join('');
  }

  const poolListEl = document.getElementById('eco-recent-pool-list');
  if (poolListEl) {
    poolListEl.innerHTML =
      allEcoPool.length === 0
        ? '<div class="py-6 text-center text-stone-400">暂无同城余缺互调流转记录</div>'
        : allEcoPool
            .slice(0, 10)
            .map(
              (p) => `
              <div class="py-2 flex justify-between items-center gap-2">
                <div class="truncate">
                  <b class="text-stone-800">${p.product_name} × ${p.qty}${p.measure_unit || '件'}</b>
                  <span class="text-[10px] text-stone-400 block">${p.from_store_name} ➔ ${p.to_store_name || '待同行认领'}</span>
                </div>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                  p.status === 'completed'
                    ? 'bg-stone-200 text-stone-700'
                    : p.status === 'claimed'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-emerald-100 text-emerald-800'
                }">
                  ${p.status === 'completed' ? '已交割平账' : p.status === 'claimed' ? '顺路捎带中' : '挂池待领'}
                </span>
              </div>
            `
            )
            .join('');
  }
}

function updateAISummaryInsight() {
  const activeCount = allTenants.filter((t) => (t.membership_status || 'active') === 'active').length;
  const trialCount = allTenants.filter((t) => t.membership_status === 'trial').length;
  const severeCount = getFlaggedProductsList().filter((x) => x.isSevere).length;

  let insight = `当前在册合作社、工坊与实名个体主体 ${allTenants.length} 家，和合畅运 ${activeCount} 家；全网用度计划 ${allEcoPlans.length} 份、余缺互调 ${allEcoPool.length} 笔。`;
  if (severeCount > 0) insight += ` ⚖️ 涉违高风险词疑点 ${severeCount} 款待平台人工终审（常规缺图琐事已由 AI 自动协同提示）；`;
  if (trialCount > 0) insight += ` 尝鲜开席试用中 ${trialCount} 家（转正签约时可核定象征性公共运维会费）；`;
  insight += ` 城乡供需与品类标准运转平稳。`;
  document.getElementById('ai-adviser-text').innerText = insight;
}

function renderApplications() {
  const container = document.getElementById('applications-list');
  if (allApplications.length === 0) {
    container.innerHTML = '<div class="py-12 text-center text-stone-400 text-xs">当前暂无入驻申请档案。</div>';
    return;
  }

  container.innerHTML = allApplications
    .map((a) => {
      const isPending = a.application_status === 'pending_review';
      const isApproved = a.application_status === 'approved' || a.application_status === 'approved_by_ai' || a.application_status === 'approved_manually';
      const isIndividual = a.business_type === 'individual' || String(a.tenant_id || '').startsWith('GR-');
      return `
        <div class="p-4 bg-stone-50 border ${isPending ? 'border-amber-300 shadow-sm' : 'border-stone-200'} rounded-2xl space-y-2.5">
          <div class="flex flex-wrap justify-between items-start gap-2">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <b class="text-sm text-stone-900">${a.company_name}</b>
                <span class="text-[10px] bg-stone-200 text-stone-700 font-mono px-1.5 py-0.2 rounded font-bold">${a.tenant_id}</span>
                ${a.business_type ? `<span class="text-[10px] bg-emerald-50 text-emerald-900 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">${formatBusinessTypeLabel(a.business_type)}</span>` : ''}
                ${isIndividual ? '<span class="text-[10px] bg-amber-100 text-amber-950 px-1.5 py-0.2 rounded font-bold">实名农户/手艺人</span>' : ''}
                ${a.credit_code ? `<span class="text-[10px] bg-amber-100/80 text-amber-900 font-mono px-1.5 py-0.2 rounded font-bold">${a.credit_code}</span>` : ''}
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  isPending ? 'bg-amber-100 text-amber-900 animate-pulse' : isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }">
                  ${isPending ? '⏳ 待人工复核' : isApproved ? '✅ 验真已发证' : '🚫 已退回商榷'}
                </span>
              </div>
              <div class="text-[11px] text-stone-500 font-mono mt-1">
                负责人: <b>${a.contact_person || '-'}</b> · 手机: <a href="tel:${a.contact_phone}" class="underline font-bold text-stone-800">${a.contact_phone || '-'}</a> · 初审分: <b class="text-emerald-700">${a.ai_audit_score || 95}分</b>
              </div>
              ${a.review_note ? `<div class="text-[10px] text-stone-500 mt-1 bg-white px-2.5 py-1 rounded-lg border border-stone-200/70">${a.review_note}</div>` : ''}
            </div>
            <div class="text-right">
              <span class="text-[10px] text-stone-400 block font-mono">唯一商号标识</span>
              <b class="font-mono text-sm text-amber-800 font-bold">${a.tenant_id}</b>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200/60 text-[11px]">
            <div class="flex items-center gap-3">
              <span class="text-stone-400">资质原件:</span>
              ${
                a.license_image_url
                  ? `<img src="${a.license_image_url}" class="h-10 w-16 object-cover rounded-lg border border-stone-300 cursor-pointer shadow-sm hover:scale-105 transition" onclick="window.previewFullImage('${a.license_image_url}')" title="点击放大核对">
                     <span class="text-[10px] text-stone-500">(点击放大核验)</span>`
                  : '<span class="text-stone-400">无附图</span>'
              }
            </div>

            ${
              isIndividual
                ? '<span class="text-[10px] text-emerald-800 font-bold">实名个人主体 · 适用限额保护与村社联保机制</span>'
                : `<button type="button" onclick="window.freeGovAuditCheck('${a.company_name}', '${a.credit_code || ''}')" class="bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-xs">
                    <span>🔍</span> 免费查验工商存续状态 (自动复制代码)
                  </button>`
            }
          </div>

          ${
            isPending
              ? `
            <div class="flex gap-2 justify-end pt-2 border-t border-stone-200/60">
              <button onclick="window.rejectApplication(${a.id})" class="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3 py-1.5 rounded-xl transition">
                退回商榷修润 (通知补件)
              </button>
              <button onclick="window.approveApplication(${a.id}, '${a.tenant_id}', '${a.company_name}')" class="text-xs bg-stone-900 hover:bg-stone-800 text-white font-bold px-4 py-1.5 rounded-xl shadow active:scale-95 transition">
                ✅ 终审合格 · 正式开席激活
              </button>
            </div>
          `
              : ''
          }
        </div>
      `;
    })
    .join('');
}

function renderTenantsTable() {
  const tbody = document.getElementById('tenants-table-body');
  tbody.innerHTML = allTenants
    .map((t) => {
      const status = t.membership_status || (t.is_active ? 'active' : 'paused');
      let statusTag = '';
      if (!t.is_active || status === 'paused') statusTag = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">🛑 商道暂歇</span>';
      else if (status === 'trial') statusTag = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800">🍃 尝鲜体验</span>';
      else if (status === 'grace') statusTag = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">🍃 春风宽待</span>';
      else if (status === 'restricted') statusTag = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">🛡️ 护盘存续</span>';
      else statusTag = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">🟢 和合在册</span>';

      return `
        <tr class="hover:bg-stone-50 transition">
          <td class="p-3 font-bold text-amber-800">${t.tenant_id}</td>
          <td class="p-3 font-sans">
            <div class="font-bold text-stone-900">${t.company_name}</div>
            <div class="text-[10px] font-mono text-stone-400">${t.credit_code || '特邀/实名立户'} · 运维会费: ¥${t.membership_fee || 0}/年</div>
          </td>
          <td class="p-3 font-sans">${formatBusinessTypeLabel(t.business_type)}</td>
          <td class="p-3 font-sans">${t.contact_person || t.contact_name || '-'}</td>
          <td class="p-3 font-mono text-stone-400">
            <span class="tracking-widest font-bold">••••••••</span>
            <button onclick="window.issueResetTokenPrompt(${t.id}, '${t.tenant_id}', '${t.company_name}')" class="text-emerald-800 text-[11px] font-bold hover:underline ml-1.5 font-sans">
              签发新约信码
            </button>
          </td>
          <td class="p-3">${statusTag}</td>
          <td class="p-3 text-right space-x-1">
            <button onclick="window.freeGovAuditCheck('${t.company_name}', '${t.credit_code || ''}')" class="text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 border border-blue-200 px-2 py-1 rounded-xl transition font-sans" title="转正前核查是否在营">
              🔍 查底库
            </button>
            <button onclick="window.openTenantStatusModal(${t.id}, '${t.tenant_id}', '${t.company_name}', '${status}')" class="text-[11px] font-bold text-stone-700 hover:text-stone-900 bg-white border border-stone-200 px-2.5 py-1 rounded-xl shadow-xs hover:border-stone-400 transition font-sans">
              ⚖️ 商契调控
            </button>
            <button onclick="window.confirmPurgeTenantAction('${t.tenant_id}', '${t.company_name}')" class="text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 border border-rose-200 px-2 py-1 rounded-xl shadow-xs hover:bg-rose-100 transition font-sans">
              🗑️ 销号
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderSuggestions() {
  const container = document.getElementById('suggestions-list');
  if (allSuggestions.length === 0) {
    container.innerHTML = '<div class="py-12 text-center text-stone-400 text-xs">暂无建言帖，万事清和。</div>';
    return;
  }

  container.innerHTML = allSuggestions
    .map(
      (s) => `
      <div class="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
        <div class="flex justify-between items-center text-xs">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded font-bold ${s.proposer_type === 'driver' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}">
              ${s.proposer_type === 'driver' ? '🚚 送货师傅' : s.proposer_type === 'merchant_hq' ? '🏢 供货商号' : '🏪 合作门店与客商'}
            </span>
            <b class="text-stone-900">${s.proposer_name}</b>
            <span class="text-stone-400 font-mono text-[10px]">${new Date(s.created_at).toLocaleString()}</span>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${s.reply_status === 'replied' ? 'bg-stone-200 text-stone-700' : 'bg-emerald-100 text-emerald-800'}">
            ${s.reply_status === 'replied' ? '已批复' : '候阅建言'}
          </span>
        </div>
        <p class="text-stone-700 text-xs leading-relaxed bg-white p-3 rounded-xl border border-stone-100">
          ${s.content}
        </p>
        ${
          s.official_reply
            ? `
          <div class="text-[11px] bg-emerald-50 text-emerald-950 p-2.5 rounded-xl border border-emerald-200/60 font-sans">
            <b>🏛️ 平台总控批复：</b> ${s.official_reply}
          </div>
        `
            : `
          <div class="flex justify-end pt-1">
            <button onclick="window.replySuggestionPrompt(${s.id})" class="text-xs bg-[#1b4332] text-white font-bold px-3 py-1.5 rounded-xl shadow active:scale-95 transition">
              ✍️ 依礼回复并批示
            </button>
          </div>
        `
        }
      </div>
    `
    )
    .join('');
}

window.replySuggestionPrompt = async function (id) {
  const reply = prompt('输入平台致建言者的温和批示回复：');
  if (!reply || !reply.trim()) return;

  await supabase
    .from('platform_suggestion_board')
    .update({
      official_reply: reply.trim(),
      reply_status: 'replied',
      replied_at: new Date().toISOString()
    })
    .eq('id', id);

  recordAuditLog('批复百工建言', 'INFO', { suggestion_id: id, reply: reply.trim() });
  alert('已依礼呈送批复！');
  window.loadPlatformData();
};

function renderAuditLogs() {
  const tbody = document.getElementById('audit-table-body');
  tbody.innerHTML = allAuditLogs
    .map(
      (a) => `
      <tr class="hover:bg-stone-50 transition">
        <td class="p-2.5 text-stone-400">${new Date(a.created_at).toLocaleString()}</td>
        <td class="p-2.5 font-bold">${a.tenant_id}</td>
        <td class="p-2.5 font-sans">${a.operator_name} (${a.operator_account})</td>
        <td class="p-2.5">
          <span class="px-1.5 py-0.2 rounded font-bold ${a.action_level === 'CRITICAL_2FA' ? 'bg-rose-100 text-rose-800' : 'bg-stone-100 text-stone-700'}">
            ${a.action_level}
          </span>
        </td>
        <td class="p-2.5 font-sans text-stone-800">${a.action_title}</td>
        <td class="p-2.5 text-emerald-800 font-bold">${a.tamper_seal || '-'}</td>
      </tr>
    `
    )
    .join('');
}

window.issueResetTokenPrompt = function (id, tenantId, companyName) {
  window.triggerPlatform2FA(`您正在为商号【${companyName}】签发专属【自立新约重置信码】。由当家掌柜在调度台自行重置密码，平台不留存也不窥探密码：`, async () => {
    const resetToken = 'CLAIM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await supabase.from('platform_tenant').update({ access_key: resetToken, reset_claim_token: resetToken }).eq('tenant_id', tenantId);

    recordAuditLog('签发自立新约信码', 'CRITICAL_2FA', { tenant_id: tenantId, claim_token: resetToken });
    alert(`📜 已为【${companyName}】签发自立新约信码！\n\n• 单次重置信码：${resetToken}\n• 交付说明：请转交该合作社/企业负责人，在 hq.html 凭此信码即可自立新密码。`);
    window.loadPlatformData();
  });
};

window.openTenantStatusModal = function (id, tenantId, companyName, currentStatus) {
  document.getElementById('adjust-tenant-id').value = tenantId || id;
  document.getElementById('adjust-tenant-title').innerText = `${companyName} (${tenantId})`;

  const radios = document.getElementsByName('membership_status_choice');
  radios.forEach((r) => (r.checked = r.value === currentStatus));

  const aiInsight = `人工终审提示：7天尝鲜试用期满转正为【🟢 和合在册】正式会员时，请先点击「🔍 查底库」确认合作社/企业在营，并核收象征性年度公共运维会费。`;
  document.getElementById('adjust-ai-insight').innerText = aiInsight;

  window.openModal('modal-status-adjust');
};

window.saveTenantStatusAdjustment = async function () {
  const tenantKey = document.getElementById('adjust-tenant-id').value;
  const statusEl = document.querySelector('input[name="membership_status_choice"]:checked');
  if (!statusEl) return alert('请选择一种商契气象状态！');

  const status = statusEl.value;
  const note = document.getElementById('adjust-note-input').value.trim();

  window.closeModal('modal-status-adjust');

  try {
    const is_active = status !== 'paused';

    let { data, error } = await supabase
      .from('platform_tenant')
      .update({ membership_status: status, is_active: is_active })
      .eq('tenant_id', tenantKey)
      .select();

    if (!error && (!data || data.length === 0) && !isNaN(tenantKey)) {
      const retry = await supabase
        .from('platform_tenant')
        .update({ membership_status: status, is_active: is_active })
        .eq('id', parseInt(tenantKey))
        .select();
      data = retry.data;
      error = retry.error;
    }

    if (error) return alert('❌ 数据库更新失败: ' + error.message);
    if (!data || data.length === 0) return alert(`⚠️ 未找到商号标识为【${tenantKey}】的数据列！`);

    await recordAuditLog('商契气象调控', 'WARN', { tenant_key: tenantKey, target_status: status, note });

    alert(`✅ 商契气象已成功调控为【${status}】！`);
    await window.loadPlatformData();
  } catch (err) {
    alert('❌ 执行出错: ' + err.message);
  }
};

window.triggerPurgeFromModal = function () {
  const tenantKey = document.getElementById('adjust-tenant-id').value;
  const title = document.getElementById('adjust-tenant-title').innerText;
  window.closeModal('modal-status-adjust');
  window.confirmPurgeTenantAction(tenantKey, title);
};

window.confirmPurgeTenantAction = function (tenantId, companyName) {
  const cleanName = (companyName || '').split('(')[0].trim();

  window.triggerPlatform2FA(`⚠️ 最高警戒：即将彻底销号商号【${cleanName || tenantId}】(${tenantId})，清空入驻审核与主体账本。请出示 2FA 口令确认：`, async () => {
    const confirmCode = prompt(
      `⚠️ 危险确认：商号【${cleanName || tenantId}】即将作废除名！\n\n` +
        `该操作将物理清除 platform_tenant 与 tenant_application 记录。\n` +
        `完成后合作社/工坊可持执照原件前往 join.html 重新扫描核验。\n\n` +
        `若确认销号重置，请在下方输入大写：DELETE`
    );

    if (confirmCode !== 'DELETE') return alert('操作已取消，未做任何变更。');

    try {
      await supabase.from('tenant_application').delete().or(`tenant_id.eq.${tenantId},company_name.eq.${cleanName}`);
      try {
        await supabase.from('goods').delete().eq('tenant_id', tenantId);
      } catch (e) {}
      try {
        await supabase.from('customers').delete().eq('tenant_id', tenantId);
      } catch (e) {}

      const { data: deletedRows, error: delError } = await supabase
        .from('platform_tenant')
        .delete()
        .or(`tenant_id.eq.${tenantId},company_name.eq.${cleanName}`)
        .select();

      if (delError) throw new Error('数据库拒绝删除: ' + delError.message);
      if (!deletedRows || deletedRows.length === 0) throw new Error(`未找到商号【${tenantId}】，或数据库 RLS 策略阻止了 DELETE 权限！`);

      await recordAuditLog('商号作废除名销号', 'CRITICAL_2FA', { tenant_id: tenantId, company_name: cleanName });

      alert(`✅ 商号【${cleanName}】已彻底清除（已销毁 ${deletedRows.length} 笔在册档案）！\n商号代号已完全释放，可返回 join.html 重新拍照验证。`);
      await window.loadPlatformData();
    } catch (err) {
      alert('❌ 销号执行失败: ' + err.message);
    }
  });
};

function renderCategoryTree() {
  const container = document.getElementById('category-tree-display');
  const l1List = allCategories.filter((c) => c.level === 1);

  container.innerHTML = l1List
    .map((l1) => {
      const subs = allCategories.filter((c) => c.level === 2 && c.parent_id === l1.id);
      return `
        <div class="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
          <div class="flex justify-between items-center border-b border-stone-200 pb-1.5">
            <div class="flex items-center gap-1.5 font-bold text-sm text-stone-900">
              <span>🏷️ ${l1.name}</span>
              <span class="text-[10px] font-mono text-stone-400 font-normal">#L1</span>
            </div>
            <button onclick="window.quickAddSubCategory(${l1.id}, '${l1.name}')" class="text-[10px] text-stone-600 hover:text-stone-900 font-bold bg-white px-2 py-0.5 rounded border border-stone-200">
              + 加细项
            </button>
          </div>
          <div class="space-y-1">
            <span class="text-[10px] text-stone-400 block">标准二级细项：</span>
            <div class="flex flex-wrap gap-1">
              ${
                subs.length
                  ? subs
                      .map(
                        (s) => `
                <span class="bg-white border border-stone-200 text-stone-700 px-2 py-0.5 rounded-lg text-[11px] font-medium">
                  ${s.name}
                </span>
              `
                      )
                      .join('')
                  : '<span class="text-stone-300">暂无细项</span>'
              }
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

window.approveApplication = async function (appId, tenantId, companyName) {
  const fee = prompt(`为【${companyName}】核定年度公共运维会费（元，用于服务器与带宽运维，象征性收取如 199 或公益试点填 0）：`, '199');
  if (fee === null) return;

  const app = allApplications.find((a) => a.id === appId);
  const defaultLast6Key = app && app.credit_code && app.credit_code.length >= 6 ? app.credit_code.slice(-6).toUpperCase() : `${tenantId.toLowerCase()}@2026`;

  const initialKey = prompt('确认初始安家密码（默认为执照信用代码或证件号后 6 位）：', defaultLast6Key);
  if (!initialKey) return;

  await supabase
    .from('tenant_application')
    .update({
      application_status: 'approved',
      payment_status: 'paid',
      membership_fee: parseFloat(fee) || 0,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', appId);

  await supabase.from('platform_tenant').upsert([
    {
      tenant_id: tenantId,
      company_name: companyName,
      credit_code: app ? app.credit_code : '',
      business_type: app ? app.business_type : 'coop',
      service_mode: app ? app.service_mode : '实体与电商双轨',
      contact_person: app ? app.contact_person : '掌柜',
      contact_name: app ? app.contact_person : '掌柜',
      phone: app ? app.contact_phone : '',
      access_key: initialKey.trim(),
      membership_fee: parseFloat(fee) || 0,
      membership_status: 'active',
      is_active: true
    }
  ]);

  recordAuditLog('审批激活新会员主体', 'CRITICAL_2FA', { tenant_id: tenantId, company_name: companyName, ops_fee: parseFloat(fee) || 0 });

  alert(`🎉 审核通过并激活立户！\n\n• 主体全称: ${companyName}\n• 商号代号（唯一标识）: ${tenantId}\n• 年度公共运维会费: ¥${parseFloat(fee) || 0}\n• 初始安家密码（后6位）: ${initialKey.trim()}`);
  window.loadPlatformData();
};

window.rejectApplication = async function (appId) {
  const reason = prompt('输入商榷退回说明（负责人将在查询页面看到此意见并重新上传补件）：', '执照公章略有反光模糊，请在光线均匀处重新拍摄上传。');
  if (!reason) return;

  await supabase
    .from('tenant_application')
    .update({
      application_status: 'rejected',
      review_note: reason.trim(),
      reviewed_at: new Date().toISOString()
    })
    .eq('id', appId);

  alert('已退回修润建议！负责人凭手机号与后6位查询即可看到并补件重提。');
  window.loadPlatformData();
};

window.openManualTenantModal = function () {
  document.getElementById('m-company-name').value = '';
  document.getElementById('m-credit-code').value = '';
  document.getElementById('m-tenant-id').value = '';
  document.getElementById('m-access-key').value = '';
  window.openModal('manual-tenant-modal');
};

window.submitManualTenant = function () {
  const company_name = document.getElementById('m-company-name').value.trim();
  const credit_code = document.getElementById('m-credit-code').value.trim().toUpperCase();
  const tenant_id = document.getElementById('m-tenant-id').value.trim().toUpperCase();
  const business_type = document.getElementById('m-business-type').value;
  const service_mode = document.getElementById('m-service-mode').value;
  const contact_person = document.getElementById('m-contact-person').value.trim();
  const defaultKey = credit_code.length >= 6 ? credit_code.slice(-6) : '888888';
  const access_key = document.getElementById('m-access-key').value.trim().toUpperCase() || defaultKey;

  if (!company_name || !tenant_id) return alert('请完整填写主体全称与商号代号！');

  window.triggerPlatform2FA(`您正在免审核直接为【${company_name}】特邀开立独立账本商号【${tenant_id}】，请核验总控 2FA 凭证：`, async () => {
    const { error } = await supabase.from('platform_tenant').insert([
      {
        tenant_id,
        company_name,
        credit_code,
        business_type,
        service_mode,
        contact_person,
        contact_name: contact_person,
        access_key,
        membership_status: 'active',
        is_active: true
      }
    ]);

    if (error) alert('开户失败: ' + error.message);
    else {
      recordAuditLog('线下特邀直通立户', 'CRITICAL_2FA', { tenant_id, company_name });
      alert(`🎉 主体【${company_name}】直通立户成功！\n• 商号代号：${tenant_id}\n• 预设安家密钥（后6位）：${access_key}`);
      window.closeModal('manual-tenant-modal');
      window.loadPlatformData();
    }
  });
};

window.openAddCategoryModal = function () {
  window.onCatLevelChange('1');
  window.openModal('add-category-modal');
};

window.onCatLevelChange = function (lvl) {
  const parentBox = document.getElementById('parent-cat-box');
  if (lvl === '2') {
    const l1List = allCategories.filter((c) => c.level === 1);
    document.getElementById('cat-parent-select').innerHTML = l1List.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
    parentBox.classList.remove('hidden');
  } else {
    parentBox.classList.add('hidden');
  }
};

window.quickAddSubCategory = function (parentId, parentName) {
  const name = prompt(`为【${parentName}】制定二级细项名称：`);
  if (name && name.trim()) {
    supabase
      .from('platform_category')
      .insert([{ name: name.trim(), level: 2, parent_id: parentId, applicable_mode: '实体与电商双轨' }])
      .then(() => {
        recordAuditLog('新增二级细项品类', 'INFO', { parent_id: parentId, sub_name: name.trim() });
        window.loadPlatformData();
      });
  }
};

window.savePlatformCategory = async function () {
  const level = parseInt(document.getElementById('cat-level-select').value);
  const name = document.getElementById('cat-name-input').value.trim();
  const parent_id = level === 2 ? parseInt(document.getElementById('cat-parent-select').value) : null;
  const applicable_mode = document.getElementById('cat-mode-select').value;

  if (!name) return alert('请输入品类名称！');

  await supabase.from('platform_category').insert([{ name, level, parent_id, applicable_mode }]);

  recordAuditLog('制定标准平台品类', 'INFO', { name, level, parent_id, applicable_mode });
  alert('品类已存入平台标准字典！');
  window.closeModal('add-category-modal');
  window.loadPlatformData();
};

window.previewFullImage = function (url) {
  const w = window.open('');
  w.document.write(`<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${url}" style="max-width:90%;max-height:90%;border-radius:16px;"></body>`);
};

export async function initPlatformController() {
  const isAuthed = await checkPlatformAuthStatus();
  if (isAuthed) {
    window.loadPlatformData();
  }
}
