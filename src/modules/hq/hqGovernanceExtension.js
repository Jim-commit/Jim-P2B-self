import { supabase } from '../../lib/supabase.js';
import { hqState } from './hqState.js';
import { SettlementAdapter } from '../../services/settlementAdapter.js';

let cachedGovConfigs = [];
let cachedMemPlans = [];
let cachedTenantCases = [];
let cachedBarterContracts = [];

function getCfgVal(key, fallback = '') {
  const row = cachedGovConfigs.find((c) => c.config_key === key);
  return row && row.config_value !== undefined && row.config_value !== '' ? row.config_value : fallback;
}

// 1. 拉取全局动态参数、会员档位、本店申诉单与物物置换契约
export async function loadAndRenderHqGovernanceExtension() {
  const tenantId = hqState.currentAgent;
  if (!tenantId) return;

  const [cfgRes, planRes, caseRes] = await Promise.all([
    supabase.from('platform_governance_config').select('*'),
    supabase.from('platform_membership_plan').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('platform_compliance_case').select('*').eq('tenant_id', tenantId).order('id', { ascending: false })
  ]);

  cachedGovConfigs = cfgRes.data || [];
  cachedMemPlans = planRes.data || [];
  cachedTenantCases = caseRes.data || [];

  renderMembershipGraceBanner();
  renderHqGovernanceModalContent();
}

// 2. 顶部温婉体验期 / 宽待期演进引导横幅（零写死天数，全读后台参数）
function renderMembershipGraceBanner() {
  const host = document.getElementById('hq-membership-grace-banner');
  if (!host) return;

  const t = hqState.currentTenantData;
  if (!t) {
    host.classList.add('hidden');
    return;
  }

  const status = t.membership_status || 'active';
  const validUntil = t.valid_until ? new Date(`${t.valid_until}T23:59:59`) : null;
  const now = new Date();
  const daysLeft = validUntil ? Math.ceil((validUntil.getTime() - now.getTime()) / (24 * 3600 * 1000)) : null;

  const openCasesCount = cachedTenantCases.filter((c) => c.status === 'pending_appeal').length;

  // 若有被 AI 暂缓展示的商品待说明申诉，优先温婉提醒
  if (openCasesCount > 0) {
    host.className =
      'bg-amber-50 border border-amber-400 text-amber-950 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs';
    host.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-base">🛡️</span>
        <span><b>商道规范提醒：</b>您有 <b>${openCasesCount}</b> 项商品或宣传内容经 AI 巡检暂缓展示，支持上传检疫证/授权书或说明一键发起申诉复判。</span>
      </div>
      <button type="button" onclick="window.openHqGovernanceModal('appeals')" class="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold px-3.5 py-1.5 rounded-xl text-[11px] shadow-2xs">
        查看并提交凭证申诉 ➔
      </button>
    `;
    return;
  }

  if (status === 'trial' || status === 'grace' || status === 'restricted' || (daysLeft !== null && daysLeft <= 7)) {
    const dayTip =
      daysLeft === null
        ? ''
        : daysLeft > 0
        ? `（距期满还有 <b>${daysLeft}</b> 天，截止 ${t.valid_until}）`
        : `（已届期满日 ${t.valid_until}，老订单仍可照常履约平账）`;

    host.className =
      'bg-emerald-50 border border-emerald-300 text-emerald-950 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs';
    host.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-base">🍃</span>
        <span>
          当前商契气象：<b>${status === 'trial' ? '新入驻体验席' : status === 'grace' ? '春风宽待延期中' : status === 'restricted' ? '免费基础展销席' : '和合在册'}</b>${dayTip}。
          平台不抽交易佣金，仅收取平台运维费用（以会员费形式），到期可自主选档、申请宽待延期或保留基础展销。
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" onclick="window.openHqGovernanceModal('membership')" class="bg-[#1b4332] hover:bg-[#143628] text-amber-300 font-bold px-3.5 py-1.5 rounded-xl text-[11px] shadow-2xs">
          🎖️ 自主选档 / 申请宽待延期
        </button>
      </div>
    `;
  } else {
    host.classList.add('hidden');
  }
}

// 3. 渲染百宝箱弹窗内容（① 会员选档与延期 ② 合规申诉 ③ 百工物物/劳务置换账本）
function renderHqGovernanceModalContent() {
  // ① 会员等级与续约/宽待延期
  const planBox = document.getElementById('hq-gov-plans-list');
  if (planBox) {
    const graceDays = parseInt(getCfgVal('grace_extension_days', '7'));
    const maxGraceTimes = parseInt(getCfgVal('max_grace_extensions', '2'));
    const cycleMap = { trial: '体验期', monthly: '按月', quarterly: '按季', yearly: '按年', lifetime: '一次核定' };

    const paidPlans = cachedMemPlans.filter((p) => Number(p.fee_amount || 0) > 0);
    planBox.innerHTML = `
      <div class="bg-stone-50 border border-stone-200 p-3 rounded-2xl space-y-2">
        <div class="flex justify-between items-center">
          <b class="text-stone-900">🍃 若农忙或暂未回款，可申请温情宽待延期</b>
          <span class="text-[10px] text-stone-500 font-mono">单次宽待 ${graceDays} 天 · 最多 ${maxGraceTimes} 次</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" onclick="window.applyHqGraceExtension()" class="bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold px-3 py-1.5 rounded-xl text-[11px]">
            ⏳ 一键申请宽待延期 ${graceDays} 天
          </button>
          <button type="button" onclick="window.switchToBasicPublicCare()" class="bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 font-bold px-3 py-1.5 rounded-xl text-[11px]">
            🛡️ 转为免费基础展销席（老订单照常平账）
          </button>
        </div>
      </div>

      <div class="space-y-2 pt-1">
        <b class="text-stone-900 block">🎖️ 自主选择正式会员档位（仅收取平台运维费用，以会员费形式）：</b>
        ${
          paidPlans.length === 0
            ? '<div class="text-stone-400 py-4 text-center">暂无可选付费档位</div>'
            : paidPlans
                .map(
                  (p) => `
              <div class="p-3 bg-white border border-stone-200 hover:border-emerald-500 rounded-2xl flex flex-wrap justify-between items-center gap-2 transition">
                <div class="space-y-0.5">
                  <div class="flex items-center gap-2">
                    <b class="text-stone-900 text-xs">${p.plan_name}</b>
                    <span class="bg-amber-100 text-amber-900 font-mono font-bold px-2 py-0.5 rounded-full text-[11px]">¥${p.fee_amount} / ${cycleMap[p.billing_cycle] || p.billing_cycle}</span>
                  </div>
                  <p class="text-[11px] text-stone-500">${p.tagline || ''}</p>
                  <span class="text-[10px] text-stone-400 font-mono">帮手账号上限：${p.max_staff_accounts} 个 ｜ 协作门店上限：${p.max_partner_stations} 家</span>
                </div>
                <button type="button" onclick="window.submitMembershipRenewal('${p.plan_code}', '${p.plan_name}', ${p.fee_amount})" class="bg-[#1b4332] hover:bg-[#143628] text-white font-bold px-3.5 py-2 rounded-xl text-[11px] shadow-2xs">
                  选定此档交割续约 ➔
                </button>
              </div>
            `
                )
                .join('')
        }
      </div>
    `;
  }

  // ② 合规巡检与掌柜凭证申诉通道
  const appealsBox = document.getElementById('hq-gov-appeals-list');
  if (appealsBox) {
    appealsBox.innerHTML =
      cachedTenantCases.length === 0
        ? '<div class="py-8 text-center text-stone-400">🌿 当前本店所有上架货品与宣传均符合商道规范，无暂缓展示记录。</div>'
        : cachedTenantCases
            .map(
              (c) => `
            <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
              <div class="flex justify-between items-center">
                <b class="text-stone-900">${c.target_title || '规范提醒事项'}</b>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  c.status === 'resolved_pass'
                    ? 'bg-emerald-100 text-emerald-800'
                    : c.status === 'resolved_reject'
                    ? 'bg-rose-100 text-rose-800'
                    : c.status === 'appealed_review'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-sky-100 text-sky-900'
                }">
                  ${
                    c.status === 'resolved_pass'
                      ? '✅ 复核已放行'
                      : c.status === 'resolved_reject'
                      ? '🛑 维持暂缓'
                      : c.status === 'appealed_review'
                      ? '📨 凭证已交·复核中'
                      : '⏳ 暂缓展示·可申诉'
                  }
                </span>
              </div>
              <p class="text-[11px] text-stone-600">🤖 提醒缘由：${c.ai_findings}</p>
              ${
                c.arbiter_notes
                  ? `<p class="text-[11px] text-emerald-900 bg-emerald-50 p-2 rounded-xl border border-emerald-200">⚖️ 处理回执：${c.arbiter_notes}</p>`
                  : ''
              }
              ${
                c.status === 'pending_appeal'
                  ? `<div class="text-right">
                       <button type="button" onclick="window.submitHqCaseAppeal(${c.id})" class="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold px-3 py-1.5 rounded-xl text-[11px]">
                         📎 补充检疫/授权说明并申诉
                       </button>
                     </div>`
                  : ''
              }
            </div>
          `
            )
            .join('');
  }

  // ③ 百工物物 / 劳务工时置换契约账本
  const barterBox = document.getElementById('hq-gov-barter-list');
  if (barterBox) {
    const barterOrders = (hqState.allOrders || []).filter(
      (o) => String(o.settlement_type || '').includes('barter') || String(o.note || '').includes('[以物换物/劳务抵扣]')
    );
    barterBox.innerHTML =
      barterOrders.length === 0
        ? '<div class="py-6 text-center text-stone-400">暂无已缔结的以物换物或劳务工时置换契约，可在上方快捷登记一笔。</div>'
        : barterOrders
            .slice(0, 15)
            .map(
              (o) => `
            <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex justify-between items-center gap-2">
              <div>
                <b class="text-stone-900">${o.store_name || '协作方'}</b>
                <p class="text-[11px] text-stone-600 mt-0.5">${o.note || '双向实物/劳务工时置换契约'}</p>
                <span class="text-[10px] text-stone-400 font-mono">单号 #${o.order_no || o.id} · 折算公允基准值：¥${parseFloat(o.total_amount || 0).toFixed(2)}</span>
              </div>
              <span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${
                o.delivery_status === 'delivered' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
              }">
                ${o.delivery_status === 'delivered' ? '✅ 双方已交割平账' : '🤝 履约进行中'}
              </span>
            </div>
          `
            )
            .join('');
  }
}

// 4. 供发布商品时调用的 AI 四道铁面预检（零硬编码词库，读取后台自定义配置）
export async function runHqProductPreAudit({ productTitle, productDesc, price, videoUrl = '' }) {
  const findings = [];
  let caseType = 'promo_audit';
  const combinedText = `${productTitle || ''} ${productDesc || ''}`;
  const businessScope = hqState.currentTenantData?.business_scope || '';

  // ① 经营范围防越界
  const scopeRules = [
    { prodKw: ['白酒', '散装酒', '米酒', '药酒', '果酒'], scopeKw: ['酒'], msg: '商品涉及酒类，但登记经营范围暂未包含酒类经营资质' },
    { prodKw: ['农药', '化肥', '兽药', '种子'], scopeKw: ['农资', '种子', '化肥', '农药'], msg: '商品涉及农资种子，需补充农资经营许可凭证' },
    { prodKw: ['处方药', '中药材饮片', '理疗仪'], scopeKw: ['药', '医疗器械'], msg: '商品涉及医药保健器械，需补充专项许可凭证' }
  ];
  if (businessScope) {
    for (const r of scopeRules) {
      if (r.prodKw.some((k) => combinedText.includes(k)) && !r.scopeKw.some((k) => businessScope.includes(k))) {
        findings.push(r.msg);
        caseType = 'scope_block';
      }
    }
  }

  // ② 宣传夸大与违禁词库（读取后台自定义配置）
  const rawBlocked = getCfgVal('blocked_promo_keywords', '国家级,根治,包治百病,特效药,第一品牌,稳赚不赔,刷单,兼职返现');
  const blockedList = rawBlocked
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hitWords = blockedList.filter((w) => combinedText.includes(w));
  if (hitWords.length > 0) {
    findings.push(`描述中包含夸大或违规词汇：【${hitWords.join('、')}】，建议改为平实客观的产地工艺介绍`);
  }

  // ③ 外链音视频白名单校验
  if (videoUrl && videoUrl.trim()) {
    const rawDomains = getCfgVal(
      'allowed_video_domains',
      'douyin.com,kuaishou.com,bilibili.com,weixin.qq.com,v.qq.com,aliyuncs.com,myqcloud.com'
    );
    const allowedDomains = rawDomains
      .split(/[,，]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    try {
      const u = new URL(videoUrl.trim());
      const host = u.hostname.toLowerCase();
      if (!allowedDomains.some((d) => host === d || host.endsWith('.' + d))) {
        findings.push(`视频外链域名（${host}）不在常用安全白名单内，为防外部跳转已暂缓展示`);
      }
    } catch (e) {
      findings.push('外链视频网址格式不规范，请填写完整 https:// 链接');
    }
  }

  // ④ 极端异常标价护盘（不干预正常议价，只防 1 分钱刷单引流）
  const numPrice = Number(price);
  if (!isNaN(numPrice) && numPrice > 0 && numPrice <= 0.05) {
    findings.push(`标价（¥${numPrice}）过低，疑似引流刷单标价，请按实际公允价值填写`);
    caseType = 'price_guard';
  }

  if (findings.length > 0) {
    const summary = findings.join('；');
    // 自动写入平台巡检申诉表，方便掌柜一键补充凭证申诉
    await supabase
      .from('platform_compliance_case')
      .insert([
        {
          case_type: caseType,
          tenant_id: hqState.currentAgent,
          company_name: hqState.currentTenantData?.company_name || hqState.currentAgent,
          target_title: productTitle,
          ai_findings: summary,
          status: 'pending_appeal'
        }
      ])
      .catch(() => {});
    return { passed: false, summary };
  }

  return { passed: true, summary: '' };
}

export function initHqGovernanceExtensionBindings() {
  window.openHqGovernanceModal = function (tab = 'membership') {
    window.switchHqGovTab(tab);
    window.openModal('modal-hq-governance-hub');
  };

  window.switchHqGovTab = function (tab) {
    ['membership', 'appeals', 'barter'].forEach((t) => {
      document.getElementById(`hq-gov-pane-${t}`)?.classList.toggle('hidden', t !== tab);
      const btn = document.getElementById(`hq-gov-tab-${t}`);
      if (btn) {
        btn.className =
          t === tab
            ? 'py-2 rounded-xl bg-[#1b4332] text-white font-bold transition'
            : 'py-2 rounded-xl text-stone-600 hover:bg-stone-200 font-bold transition';
      }
    });
  };

  // 一键申请宽待延期（读取后台配置的宽待天数与最多次数）
  window.applyHqGraceExtension = async function () {
    const t = hqState.currentTenantData;
    if (!t) return;
    const graceDays = parseInt(getCfgVal('grace_extension_days', '7'));
    const maxTimes = parseInt(getCfgVal('max_grace_extensions', '2'));
    const usedTimes = parseInt(t.grace_used_count || 0);

    if (usedTimes >= maxTimes) {
      return alert(`您已使用过 ${usedTimes} 次宽待延期（上限 ${maxTimes} 次），可选择转为免费基础展销席（老订单照常履约），或选定正式会员档位续约。`);
    }

    const baseDate = t.valid_until ? new Date(`${t.valid_until}T00:00:00`) : new Date();
    const startFrom = baseDate.getTime() > Date.now() ? baseDate : new Date();
    startFrom.setDate(startFrom.getDate() + graceDays);
    const nextDateStr = startFrom.toISOString().slice(0, 10);

    const { error } = await supabase
      .from('platform_tenant')
      .update({
        membership_status: 'grace',
        valid_until: nextDateStr,
        grace_used_count: usedTimes + 1
      })
      .eq('tenant_id', t.tenant_id);

    if (error) return alert('申请宽待延期失败：' + error.message);
    alert(`🍃 已为您顺利办理春风宽待延期 ${graceDays} 天，有效期延至 ${nextDateStr}，安心忙您的生产经营即可！`);
    window.closeModal('modal-hq-governance-hub');
    await window.loadHQData();
  };

  // 转为免费基础展销席（老订单照常履约平账，绝不强制）
  window.switchToBasicPublicCare = async function () {
    const t = hqState.currentTenantData;
    if (!t) return;
    if (!confirm('转为免费基础展销席后，已有合作门店订单与往来对账依然照常运行，仅暂缓发布全网新推广，确认切换吗？')) return;

    const { error } = await supabase
      .from('platform_tenant')
      .update({ membership_status: 'restricted' })
      .eq('tenant_id', t.tenant_id);

    if (error) return alert('切换失败：' + error.message);
    alert('🛡️ 已平稳切换为免费基础展销席，老订单与对账照常畅通。');
    window.closeModal('modal-hq-governance-hub');
    await window.loadHQData();
  };

  // 选定会员档位交割续约（接入 membership_pay 精准熔断检查 + 大额阈值护盘）
  window.submitMembershipRenewal = async function (planCode, planName, feeAmount) {
    if (
      window.checkBusinessCircuit &&
      !(await window.checkBusinessCircuit('membership_pay', hqState.currentAgent, { amount: feeAmount }))
    ) {
      return;
    }

    const methods = await SettlementAdapter.getAvailableSettlementMethods();
    const hasOnlineGateway = methods.some((m) => m.code === 'external_cn_gateway');

    if (hasOnlineGateway) {
      const res = await SettlementAdapter.initiateSettlement({
        orderId: `RENEW-${hqState.currentAgent}-${Date.now()}`,
        tenantId: hqState.currentAgent,
        payerName: hqState.currentTenantData?.company_name || hqState.currentAgent,
        amount: feeAmount,
        methodCode: 'external_cn_gateway'
      });
      if (res.mode === 'redirect' && res.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
    }

    const voucher = prompt(
      `您已选定【${planName}】（平台运维会费 ¥${feeAmount}）。\n现阶段支持线下对公/常用方式转账后凭回执核销，请输入您的转账流水号或付款人备注：`
    );
    if (!voucher || !voucher.trim()) return;

    await supabase.from('platform_suggestion_board').insert([
      {
        proposer_type: 'merchant_hq',
        proposer_name: `${hqState.currentTenantData?.company_name || hqState.currentAgent} (${hqState.currentAgent})`,
        content: `【会员档位续约凭证核销】申请档位：${planName} (${planCode})，运维会费：¥${feeAmount}，转账凭证说明：${voucher.trim()}`,
        reply_status: 'pending'
      }
    ]);

    alert(`✅ 您的【${planName}】续约凭证已提交平台总控核销！核销期间业务照常畅通无阻。`);
    window.closeModal('modal-hq-governance-hub');
  };

  // 掌柜提交合规凭证申诉
  window.submitHqCaseAppeal = async function (caseId) {
    const note = prompt('请填写说明陈述（如：本店已取得对应资质或已修改客观描述）：');
    if (!note || !note.trim()) return;
    const evidenceUrl = prompt('如有检疫报告、授权书或执照照片链接，请粘贴网址（没有可直接点确定跳过）：') || '';

    const { error } = await supabase
      .from('platform_compliance_case')
      .update({
        status: 'appealed_review',
        merchant_appeal_note: note.trim(),
        merchant_evidence_url: evidenceUrl.trim()
      })
      .eq('id', caseId);

    if (error) return alert('提交申诉失败：' + error.message);
    alert('📨 您的申诉说明与凭证已递交复判台，请留意审核回执！');
    await loadAndRenderHqGovernanceExtension();
  };

  // 登记一笔百工以物换物 / 劳务工时置换契约（接入 hq_write 调度台写入熔断检查）
  window.submitHqBarterContract = async function () {
    if (window.checkBusinessCircuit && !(await window.checkBusinessCircuit('hq_write', hqState.currentAgent))) {
      return;
    }

    const partnerName = document.getElementById('barter-partner-input')?.value.trim();
    const myOffer = document.getElementById('barter-my-offer')?.value.trim();
    const partnerOffer = document.getElementById('barter-partner-offer')?.value.trim();
    const fairVal = parseFloat(document.getElementById('barter-fair-value')?.value || '0');

    if (!partnerName || !myOffer || !partnerOffer) {
      return alert('请完整填写置换对象、我方提供物品/劳务及对方置换内容！');
    }

    const orderNo = `HH-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
    const { error } = await supabase.from('store_order').insert([
      {
        tenant_id: hqState.currentAgent,
        order_no: orderNo,
        store_name: partnerName,
        total_amount: isNaN(fairVal) ? 0 : fairVal,
        net_settle_amount: 0,
        settlement_type: 'barter_or_labor',
        order_status: 'confirmed',
        delivery_status: 'pending',
        note: `[以物换物/劳务抵扣] 我方出：${myOffer} ⇄ 对方出：${partnerOffer}`
      }
    ]);

    if (error) return alert('登记置换契约失败：' + error.message);

    document.getElementById('barter-partner-input').value = '';
    document.getElementById('barter-my-offer').value = '';
    document.getElementById('barter-partner-offer').value = '';
    document.getElementById('barter-fair-value').value = '';
    alert(`🤝 双向置换契约（单号 ${orderNo}）已立约入账，双方交割确认后即可零现金平账！`);
    await window.loadHQData();
  };
}
