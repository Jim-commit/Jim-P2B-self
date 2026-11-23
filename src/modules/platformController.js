import { supabase } from '../lib/supabase.js';
import { platformState } from './platform/platformState.js';
import {
  checkPlatformAuthStatus,
  initPlatformAuthBindings
} from './platform/platformAuthModule.js';
import {
  renderApplications,
  renderTenantsTable,
  initPlatformTenantBindings
} from './platform/platformTenantModule.js';
import {
  loadGovernancePrefs,
  getFlaggedProductsList,
  renderSuggestions,
  renderCategoryTree,
  renderAuditLogs,
  initPlatformAuditBindings
} from './platform/platformAuditModule.js';
import {
  renderGovernanceConfigs,
  renderMembershipPlans,
  renderComplianceCases,
  initPlatformGovernanceBindings
} from './platform/platformGovernanceModule.js';
import { isArchivedTenantRow } from './platform/tenantLifecycleModule.js';

window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

window.switchTab = function (tabName) {
  [
    'apps',
    'tenants',
    'seniorops',
    'compliance',
    'appeals',
    'ecosystem',
    'suggestions',
    'categories',
    'membership',
    'configs',
    'selfcheck',
    'audit'
  ].forEach((t) => {
    document.getElementById(`p-tab-${t}`)?.classList.add('hidden');
    const btn = document.getElementById(`p-tab-btn-${t}`);
    if (btn) {
      btn.className =
        'flex-1 py-2 px-2 text-center rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition flex items-center justify-center gap-1 whitespace-nowrap';
    }
  });
  document.getElementById(`p-tab-${tabName}`)?.classList.remove('hidden');
  const activeBtn = document.getElementById(`p-tab-btn-${tabName}`);
  if (activeBtn) {
    activeBtn.className =
      'flex-1 py-2 px-2 text-center rounded-xl bg-stone-900 text-white transition flex items-center justify-center gap-1 whitespace-nowrap';
  }
};

window.previewFullImage = function (url) {
  const w = window.open('');
  w.document.write(
    `<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${url}" style="max-width:90%;max-height:90%;border-radius:16px;"></body>`
  );
};

function renderEcosystemDashboard() {
  const activeTenants = platformState.allTenants.filter((t) => !isArchivedTenantRow(t));
  const scheduledPlans = platformState.allEcoPlans.filter((p) => p.status === 'scheduled' || p.status === 'fulfilled');
  const matchedPool = platformState.allEcoPool.filter((p) => p.status === 'claimed' || p.status === 'completed');
  const repliedC2B = platformState.allEcoC2B.filter((d) => !!d.official_reply);
  const deliveredOrders = platformState.allEcoOrders.filter((o) => o.delivery_status === 'delivered');

  const elPlans = document.getElementById('eco-stat-plans');
  if (elPlans) elPlans.innerText = `${platformState.allEcoPlans.length} 份`;
  const elPlansSub = document.getElementById('eco-stat-plans-sub');
  if (elPlansSub) elPlansSub.innerText = `已纳入排产：${scheduledPlans.length} 份`;

  const elPool = document.getElementById('eco-stat-pool');
  if (elPool) elPool.innerText = `${platformState.allEcoPool.length} 笔`;
  const elPoolSub = document.getElementById('eco-stat-pool-sub');
  if (elPoolSub) elPoolSub.innerText = `已成单/交割：${matchedPool.length} 笔`;

  const elC2B = document.getElementById('eco-stat-c2b');
  if (elC2B) elC2B.innerText = `${platformState.allEcoC2B.length} 条`;
  const elC2BSub = document.getElementById('eco-stat-c2b-sub');
  if (elC2BSub) elC2BSub.innerText = `源头已回应：${repliedC2B.length} 条`;

  const elOrders = document.getElementById('eco-stat-orders');
  if (elOrders) elOrders.innerText = `${deliveredOrders.length} 单`;

  const rankBody = document.getElementById('ecosystem-rank-body');
  if (rankBody) {
    const statsList = activeTenants.map((t) => {
      const tid = t.tenant_id;
      const tPlans = platformState.allEcoPlans.filter((p) => p.tenant_id === tid);
      const tPlansDone = tPlans.filter((p) => p.status === 'scheduled' || p.status === 'fulfilled');
      const tPool = platformState.allEcoPool.filter((p) => p.tenant_id === tid);
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
      platformState.allEcoC2B.length === 0
        ? '<div class="py-6 text-center text-stone-400">暂无百工天街求购需求</div>'
        : platformState.allEcoC2B
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
      platformState.allEcoPool.length === 0
        ? '<div class="py-6 text-center text-stone-400">暂无同城余缺互调流转记录</div>'
        : platformState.allEcoPool
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
  const activeTenants = platformState.allTenants.filter((t) => !isArchivedTenantRow(t));
  const activeCount = activeTenants.filter((t) => (t.membership_status || 'active') === 'active').length;
  const trialCount = activeTenants.filter((t) => t.membership_status === 'trial').length;
  const timelockCount = activeTenants.filter((t) => t.timelock_status === 'pending').length;
  const severeCount = getFlaggedProductsList().filter((x) => x.isSevere).length;
  const openAppealsCount = (platformState.allComplianceCases || []).filter(
    (c) => c.status !== 'resolved_pass' && c.status !== 'resolved_reject'
  ).length;

  let insight = `当前在册合作社、工坊与实名个体主体 ${activeTenants.length} 家，和合畅运 ${activeCount} 家；全网用度计划 ${platformState.allEcoPlans.length} 份、余缺互调 ${platformState.allEcoPool.length} 笔。`;
  if (timelockCount > 0) insight += ` ⏳ 有 ${timelockCount} 家商号正处于「无人值守时间锁观察期」（若急需抢收可用证件核验加急放行）；`;
  if (severeCount > 0) insight += ` ⚖️ 涉违高风险词疑点 ${severeCount} 款待平台人工终审（常规缺图琐事已由 AI 自动协同提示）；`;
  if (openAppealsCount > 0) insight += ` 🛡️ 商号凭证申诉/监督公断工单 ${openAppealsCount} 件待裁决；`;
  if (trialCount > 0) insight += ` 尝鲜开席试用中 ${trialCount} 家（转正签约时可自选自定义会员档位）；`;
  insight += ` 城乡供需与品类标准运转平稳。`;
  const el = document.getElementById('ai-adviser-text');
  if (el) el.innerText = insight;
}

window.renderPlatformSelfCheck = function () {
  const grid = document.getElementById('platform-selfcheck-grid');
  if (!grid) return;

  const activeTenants = platformState.allTenants.filter((t) => !isArchivedTenantRow(t));
  const totalFees = activeTenants.reduce((s, t) => s + parseFloat(t.membership_fee || 0), 0);
  const individualCount = activeTenants.filter((t) => t.business_type === 'individual' || String(t.tenant_id || '').startsWith('GR-')).length;
  const coopFactoryCount = activeTenants.length - individualCount;
  const activeProdsCount = platformState.allProducts.filter((p) => p.status === 'active').length;
  const severeCount = getFlaggedProductsList().filter((x) => x.isSevere).length;
  const complianceRate = activeProdsCount > 0 ? (((activeProdsCount - severeCount) / activeProdsCount) * 100).toFixed(1) : '100.0';

  const checks = [
    {
      title: '① 非掠夺性公益定位与平台运维会费自查',
      status: '✅ 守正达标',
      desc: `全网交易抽佣率：0.00%（零抽佣、零竞价排名）。在册主体累计定额平台运维会费：¥${totalFees.toFixed(2)}（仅收取平台运维费用，以会员费形式维持运转）。`
    },
    {
      title: '② 数字主权与商业机密隔离自查',
      status: '✅ 边界清白',
      desc: '坚决捍卫各方数据主权、商业机密与个人敏感信息；平台、源头、驿站、个人各守边界、各守本分、彼此协作，各自数据随时可一键带走。'
    },
    {
      title: '③ 百工多元主体包容度与防抢注自查',
      status: '✅ 名实相符',
      desc: `当前在册合作社/工坊/服务机构 ${coopFactoryCount} 家，实名个人农户/手艺人/个体匠人（GR-） ${individualCount} 户，严格执行一证一户与法定字号立户。`
    },
    {
      title: '④ 天道明鉴审计链与内容清朗度自查',
      status: `✅ 清朗率 ${complianceRate}%`,
      desc: `防篡改安全审计流水已留存 ${platformState.allAuditLogs.length} 条记录，数据库物理锁死修改与删除；高风险违禁词疑点仅 ${severeCount} 项。`
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

window.loadPlatformData = async function () {
  loadGovernancePrefs();

  const [
    appsRes,
    tenantsRes,
    prodsRes,
    suggsRes,
    catsRes,
    auditsRes,
    plansRes,
    poolRes,
    c2bRes,
    ordersRes,
    cfgRes,
    memPlansRes,
    casesRes
  ] = await Promise.all([
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
    supabase.from('store_order').select('id, tenant_id, delivery_status, order_status').order('id', { ascending: false }).limit(200),
    supabase.from('platform_governance_config').select('*').order('category', { ascending: true }),
    supabase.from('platform_membership_plan').select('*').order('sort_order', { ascending: true }),
    supabase.from('platform_compliance_case').select('*').order('id', { ascending: false })
  ]);

  platformState.allApplications = appsRes.data || [];
  const pendingApps = platformState.allApplications.filter((a) => a.application_status === 'pending_review');
  document.getElementById('stat-pending-apps').innerText = `${pendingApps.length} 份`;

  const badge = document.getElementById('badge-pending-count');
  if (pendingApps.length > 0) {
    badge.innerText = pendingApps.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
  renderApplications();

  platformState.allTenants = tenantsRes.data || [];
  const activeTenants = platformState.allTenants.filter((t) => !isArchivedTenantRow(t));
  document.getElementById('stat-total-tenants').innerText = `${activeTenants.length} 家`;
  renderTenantsTable();

  platformState.allProducts = prodsRes.data || [];
  const severeList = getFlaggedProductsList().filter((x) => x.isSevere);
  const compBadge = document.getElementById('badge-compliance-count');
  if (compBadge) {
    compBadge.innerText = severeList.length;
    compBadge.classList.toggle('hidden', severeList.length === 0);
  }
  window.runPlatformAIComplianceScan();

  platformState.allSuggestions = suggsRes.data || [];
  const pendingSuggs = platformState.allSuggestions.filter((s) => s.reply_status === 'pending');
  document.getElementById('stat-pending-suggs').innerText = `${pendingSuggs.length} 帖`;
  const sBadge = document.getElementById('badge-sugg-count');
  if (sBadge) {
    sBadge.innerText = pendingSuggs.length;
    sBadge.classList.remove('hidden');
  } else {
    sBadge.classList.add('hidden');
  }
  renderSuggestions();

  platformState.allCategories = catsRes.data || [];
  const l1 = platformState.allCategories.filter((c) => c.level === 1);
  const l2 = platformState.allCategories.filter((c) => c.level === 2);
  document.getElementById('stat-cat-l1').innerText = `${l1.length} 类`;
  document.getElementById('stat-cat-l2').innerText = `${l2.length} 项`;
  renderCategoryTree();

  platformState.allAuditLogs = auditsRes.data || [];
  renderAuditLogs();

  platformState.allEcoPlans = plansRes.data || [];
  platformState.allEcoPool = poolRes.data || [];
  platformState.allEcoC2B = c2bRes.data || [];
  platformState.allEcoOrders = ordersRes.data || [];
  renderEcosystemDashboard();
  window.renderPlatformSelfCheck();

  platformState.allGovConfigs = cfgRes.data || [];
  renderGovernanceConfigs();

  platformState.allMembershipPlans = memPlansRes.data || [];
  renderMembershipPlans();

  platformState.allComplianceCases = casesRes.data || [];
  const openAppeals = platformState.allComplianceCases.filter(
    (c) => c.status !== 'resolved_pass' && c.status !== 'resolved_reject'
  );
  const appealsBadge = document.getElementById('badge-appeals-count');
  if (appealsBadge) {
    appealsBadge.innerText = openAppeals.length;
    appealsBadge.classList.toggle('hidden', openAppeals.length === 0);
  }
  renderComplianceCases();

  updateAISummaryInsight();
};

export async function initPlatformController() {
  initPlatformAuthBindings();
  initPlatformTenantBindings();
  initPlatformAuditBindings();
  initPlatformGovernanceBindings();

  const isAuthed = await checkPlatformAuthStatus();
  if (isAuthed) {
    window.loadPlatformData();
  }
}
