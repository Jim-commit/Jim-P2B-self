import { supabase } from '../../lib/supabase.js';
import { platformState, recordAuditLog, getGovConfigValue } from './platformState.js';

// 1. 渲染一盘货标准类目（已彻底移除实体/电商渠道割裂，支持自由标签引导）
export function renderStandardCategories() {
  const container = document.getElementById('categories-list-container');
  if (!container) return;

  if (!platformState.allCategories || platformState.allCategories.length === 0) {
    container.innerHTML =
      '<div class="py-8 text-center text-stone-400 text-xs">尚未建立标准大类，请点击右上角「+ 制定标准大类」（一盘货全网通用，不再割裂渠道）。</div>';
    return;
  }

  const level1List = platformState.allCategories.filter((c) => Number(c.level) === 1);
  const level2List = platformState.allCategories.filter((c) => Number(c.level) === 2);

  container.innerHTML = level1List
    .map((cat1) => {
      const children = level2List.filter((c2) => Number(c2.parent_id) === Number(cat1.id));
      return `
        <div class="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
          <div class="flex justify-between items-center">
            <div class="flex items-center gap-2">
              <b class="text-sm text-stone-900">📁 ${cat1.category_name}</b>
              <span class="text-[10px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full font-bold">一盘货全网通用</span>
            </div>
            <button onclick="window.deleteStandardCategory(${cat1.id}, '${cat1.category_name}')" class="text-[11px] text-rose-600 hover:underline font-bold">
              删除
            </button>
          </div>
          ${
            cat1.suggested_tags
              ? `<div class="text-[11px] text-stone-500">引导标签胶囊：${cat1.suggested_tags
                  .split(/[,，]/)
                  .filter(Boolean)
                  .map((t) => `<span class="inline-block bg-amber-100/80 text-amber-900 px-1.5 py-0.2 rounded mr-1">#${t.trim()}</span>`)
                  .join('')}</div>`
              : ''
          }
          <div class="flex flex-wrap gap-1.5 pt-1">
            ${
              children.length > 0
                ? children
                    .map(
                      (c2) => `
                  <span class="inline-flex items-center gap-1 bg-white border border-stone-300 px-2.5 py-1 rounded-xl text-xs text-stone-700">
                    <span>${c2.category_name}</span>
                    <button onclick="window.deleteStandardCategory(${c2.id}, '${c2.category_name}')" class="text-stone-400 hover:text-rose-600 font-bold ml-1">×</button>
                  </span>
                `
                    )
                    .join('')
                : '<span class="text-[11px] text-stone-400">暂无二级细目</span>'
            }
          </div>
        </div>
      `;
    })
    .join('');
}

// 2. 渲染全域“零写死”运行参数设置表单
export function renderGovernanceConfigs() {
  const container = document.getElementById('gov-configs-container');
  if (!container) return;

  if (!platformState.allGovConfigs || platformState.allGovConfigs.length === 0) {
    container.innerHTML = '<div class="py-8 text-center text-stone-400 text-xs">暂未加载到运行参数，请先执行第一阶段数据库建表语句。</div>';
    return;
  }

  container.innerHTML = platformState.allGovConfigs
    .map(
      (cfg) => `
      <div class="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div class="space-y-0.5 flex-1">
          <div class="flex items-center gap-2">
            <b class="text-xs text-stone-900">${cfg.config_label}</b>
            <span class="text-[10px] font-mono text-stone-400">${cfg.config_key}</span>
          </div>
          <p class="text-[11px] text-stone-500">${cfg.description || ''}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <input
            type="${cfg.value_type === 'number' ? 'number' : 'text'}"
            id="cfg-input-${cfg.config_key}"
            value="${String(cfg.config_value || '').replace(/"/g, '"')}"
            placeholder="留空或填写配置值"
            class="bg-white border border-stone-300 rounded-xl px-3 py-1.5 text-xs font-mono text-stone-900 w-56 md:w-64 outline-none focus:border-amber-500"
          />
          <button
            type="button"
            onclick="window.saveSingleGovConfig('${cfg.config_key}', '${cfg.config_label}')"
            class="bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl transition active:scale-95"
          >
            保存生效
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

// 3. 渲染自定义会员等级与运维会费模板
export function renderMembershipPlans() {
  const container = document.getElementById('membership-plans-container');
  if (!container) return;

  const cycleMap = {
    trial: '体验期',
    monthly: '按月缴纳',
    quarterly: '按季缴纳',
    yearly: '按年缴纳',
    lifetime: '一次核定'
  };

  if (!platformState.allMembershipPlans || platformState.allMembershipPlans.length === 0) {
    container.innerHTML = '<div class="py-8 text-center text-stone-400 text-xs">暂无自定义会员等级，请点击上方新增。</div>';
    return;
  }

  container.innerHTML = platformState.allMembershipPlans
    .map(
      (p) => `
      <div class="p-4 bg-stone-50 border border-stone-200 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <b class="text-sm text-stone-900">${p.plan_name}</b>
            <span class="text-[10px] font-mono bg-stone-200 text-stone-700 px-2 py-0.5 rounded">${p.plan_code}</span>
            <span class="text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
              运维会费：¥${Number(p.fee_amount || 0)} / ${cycleMap[p.billing_cycle] || p.billing_cycle}
            </span>
          </div>
          <p class="text-xs text-stone-600">${p.tagline || ''}</p>
          <div class="text-[11px] text-stone-500 font-mono">
            • 允许授任帮手账号上限：<b>${p.max_staff_accounts}</b> 个 ｜ 允许协作周边门店上限：<b>${p.max_partner_stations}</b> 家
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onclick="window.openEditPlanModal(${p.id})"
            class="text-xs bg-white border border-stone-300 hover:border-stone-500 text-stone-800 font-bold px-3 py-1.5 rounded-xl transition"
          >
            ✏️ 修改档位
          </button>
          <button
            type="button"
            onclick="window.deleteMembershipPlan(${p.id}, '${p.plan_name}')"
            class="text-xs bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold px-3 py-1.5 rounded-xl transition"
          >
            删除
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

// 4. 渲染 AI 铁面判官四道巡检、双轨申诉与重大事项公断台
export function renderComplianceCases() {
  const container = document.getElementById('compliance-cases-container');
  if (!container) return;

  const typeLabelMap = {
    scope_block: '🚫 超经营范围拦截',
    promo_audit: '🔍 宣传真伪与外链巡检',
    price_guard: '⚖️ 极端异常标价护盘',
    public_report: '📣 街坊品质监督反馈',
    major_arbitration: '🏛️ 重大事项三位老匠人联署公断'
  };

  if (!platformState.allComplianceCases || platformState.allComplianceCases.length === 0) {
    container.innerHTML =
      '<div class="py-10 text-center text-stone-400 text-xs">当前风清气正，暂无待处理的 AI 巡检申诉或街坊监督事项。</div>';
    return;
  }

  container.innerHTML = platformState.allComplianceCases
    .map((item) => {
      const isClosed = item.status === 'resolved_pass' || item.status === 'resolved_reject';
      const isAppealed = item.status === 'appealed_review';

      return `
        <div class="p-4 bg-stone-50 border ${isAppealed ? 'border-amber-400 shadow-sm' : 'border-stone-200'} rounded-2xl space-y-2.5">
          <div class="flex flex-wrap justify-between items-center gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-stone-900 text-amber-300">
                ${typeLabelMap[item.case_type] || item.case_type}
              </span>
              <b class="text-sm text-stone-900">${item.target_title || '未命名事项'}</b>
              <span class="text-[11px] text-stone-500 font-mono">(${item.company_name || item.tenant_id})</span>
            </div>
            <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
              item.status === 'resolved_pass'
                ? 'bg-emerald-100 text-emerald-800'
                : item.status === 'resolved_reject'
                ? 'bg-rose-100 text-rose-800'
                : isAppealed
                ? 'bg-amber-100 text-amber-900 animate-pulse'
                : 'bg-sky-100 text-sky-900'
            }">
              ${
                item.status === 'resolved_pass'
                  ? '✅ 已核验放行'
                  : item.status === 'resolved_reject'
                  ? '🛑 维持下架处理'
                  : isAppealed
                  ? '📨 掌柜已交凭证申诉·待复判'
                  : '⏳ 暂缓展示·待掌柜说明'
              }
            </span>
          </div>

          <div class="text-xs bg-white p-3 rounded-xl border border-stone-200 text-stone-700 space-y-1">
            <div><b class="text-stone-900">🤖 AI 巡检研判说明：</b>${item.ai_findings}</div>
            ${
              item.merchant_appeal_note
                ? `<div class="text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-200 mt-1">
                     <b>📝 掌柜申诉陈述：</b>${item.merchant_appeal_note}
                     ${
                       item.merchant_evidence_url
                         ? `<a href="${item.merchant_evidence_url}" target="_blank" class="underline font-bold ml-2 text-blue-700">[查看所附检疫/授权凭证]</a>`
                         : ''
                     }
                   </div>`
                : ''
            }
            ${
              item.arbiter_notes
                ? `<div class="text-emerald-900 bg-emerald-50 p-2 rounded-lg border border-emerald-200 mt-1">
                     <b>⚖️ 终审 / 联署公断记录：</b>${item.arbiter_notes}
                   </div>`
                : ''
            }
          </div>

          ${
            !isClosed
              ? `<div class="flex flex-wrap justify-end gap-2 pt-1">
                   <button
                     type="button"
                     onclick="window.resolveComplianceCase(${item.id}, 'resolved_reject')"
                     class="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3 py-1.5 rounded-xl transition"
                   >
                     🛑 维持暂缓 / 确认违规下架
                   </button>
                   <button
                     type="button"
                     onclick="window.resolveComplianceCase(${item.id}, 'resolved_pass')"
                     class="text-xs bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-4 py-1.5 rounded-xl shadow transition"
                   >
                     ✅ 凭证属实 · 恢复正常展示
                   </button>
                 </div>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

// 5. 纯前端零成本 AI 四道铁面巡检引擎（可供 hq.html 上架与 platform.html 手动测试共调）
export function runLocalAiProductAudit({
  companyName = '',
  businessScope = '',
  productTitle = '',
  productDesc = '',
  price = 0,
  videoUrl = ''
}) {
  const findings = [];
  let caseType = '';
  const combinedText = `${productTitle} ${productDesc}`;

  // 防线一：经营范围防越界（识别高危跨界品类）
  const highRiskScopeRules = [
    { prodKw: ['白酒', '散装酒', '米酒', '药酒', '果酒'], scopeKw: ['酒'], msg: '商品涉及酒类，但登记经营范围未见酒类许可' },
    { prodKw: ['农药', '化肥', '兽药', '种子'], scopeKw: ['农资', '种子', '化肥', '农药'], msg: '商品涉及农资种子，需核验对应经营资质' },
    { prodKw: ['处方药', '中药材饮片', '理疗仪'], scopeKw: ['药', '医疗器械'], msg: '商品涉及医药健康器械，需提供专项许可凭证' }
  ];

  if (businessScope) {
    for (const rule of highRiskScopeRules) {
      const hitProd = rule.prodKw.some((k) => combinedText.includes(k));
      const hitScope = rule.scopeKw.some((k) => businessScope.includes(k));
      if (hitProd && !hitScope) {
        findings.push(rule.msg);
        caseType = 'scope_block';
      }
    }
  }

  // 防线二：宣传夸大与违禁词库扫描（动态读取后台自定义词库）
  const rawBlocked = getGovConfigValue(
    'blocked_promo_keywords',
    '国家级,根治,包治百病,特效药,第一品牌,稳赚不赔,刷单,兼职返现'
  );
  const blockedList = rawBlocked
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hitWords = blockedList.filter((w) => combinedText.includes(w));
  if (hitWords.length > 0) {
    findings.push(`描述中含有夸大或违规引导词汇：【${hitWords.join('、')}】，请改为平实客观的产地与工艺介绍`);
    if (!caseType) caseType = 'promo_audit';
  }

  // 防线三：音视频外链安全白名单校验
  if (videoUrl && videoUrl.trim()) {
    const rawDomains = getGovConfigValue(
      'allowed_video_domains',
      'douyin.com,kuaishou.com,bilibili.com,weixin.qq.com,v.qq.com,aliyuncs.com,myqcloud.com'
    );
    const allowedList = rawDomains
      .split(/[,，]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    try {
      const u = new URL(videoUrl.trim());
      const host = u.hostname.toLowerCase();
      const isAllowed = allowedList.some((d) => host === d || host.endsWith('.' + d));
      if (!isAllowed) {
        findings.push(`外链音视频域名（${host}）不在常用安全白名单内，为防外部恶意跳转已暂缓展示`);
        if (!caseType) caseType = 'promo_audit';
      }
    } catch (e) {
      findings.push('音视频链接格式不规范，请填写完整的 https:// 网址');
      if (!caseType) caseType = 'promo_audit';
    }
  }

  // 防线四：极端异常标价护盘（只防 1 分钱引流刷单或明显天价欺诈，不干预正常议价）
  const numPrice = Number(price);
  if (!isNaN(numPrice) && numPrice > 0 && numPrice <= 0.05) {
    findings.push(`标价（¥${numPrice}）过低，疑似引流刷单标价，请按实际公允价值标价`);
    if (!caseType) caseType = 'price_guard';
  }

  return {
    passed: findings.length === 0,
    caseType: caseType || 'promo_audit',
    summary: findings.join('；')
  };
}

export function initPlatformGovernanceBindings() {
  // 切换一级大类 / 二级细目时控制父级大类下拉框
  window.onCategoryLevelChange = function (lvl) {
    const parentBox = document.getElementById('cat-parent-box');
    const parentSel = document.getElementById('cat-parent-select');
    if (String(lvl) === '2') {
      parentBox?.classList.remove('hidden');
      const level1List = (platformState.allCategories || []).filter((c) => Number(c.level) === 1);
      if (parentSel) {
        parentSel.innerHTML = level1List.map((c) => `<option value="${c.id}">${c.category_name}</option>`).join('');
      }
    } else {
      parentBox?.classList.add('hidden');
    }
  };

  // 保存新制定的一盘货标准类目（彻底去除渠道三选一）
  window.saveNewStandardCategory = async function () {
    const level = parseInt(document.getElementById('cat-level-select')?.value || '1');
    const parent_id = level === 2 ? parseInt(document.getElementById('cat-parent-select')?.value || '0') || null : null;
    const category_name = document.getElementById('cat-name-input')?.value.trim();
    const suggested_tags = document.getElementById('cat-tags-input')?.value.trim() || '';

    if (!category_name) return alert('请输入类目规范名称！');
    if (level === 2 && !parent_id) return alert('请先建立一级大类，再添加二级细目！');

    const { error } = await supabase.from('platform_standard_category').insert([
      {
        level,
        parent_id,
        category_name,
        suggested_tags,
        is_active: true
      }
    ]);

    if (error) return alert('保存类目失败：' + error.message);

    document.getElementById('cat-name-input').value = '';
    document.getElementById('cat-tags-input').value = '';
    window.closeModal('modal-new-category');
    await window.loadPlatformData();
  };

  window.deleteStandardCategory = async function (id, name) {
    if (!confirm(`确认删除标准类目【${name}】吗？`)) return;
    await supabase.from('platform_standard_category').delete().eq('id', id);
    await window.loadPlatformData();
  };

  // 保存单项全域运行参数
  window.saveSingleGovConfig = async function (configKey, configLabel) {
    const inp = document.getElementById(`cfg-input-${configKey}`);
    if (!inp) return;
    const newVal = inp.value.trim();

    const { error } = await supabase
      .from('platform_governance_config')
      .update({ config_value: newVal, updated_at: new Date().toISOString() })
      .eq('config_key', configKey);

    if (error) return alert('❌ 参数保存失败：' + error.message);
    await recordAuditLog('调整平台治理参数', 'WARN', { config_key: configKey, label: configLabel, value: newVal });
    alert(`✅ 【${configLabel}】已更新生效！`);
    await window.loadPlatformData();
  };

  // 打开新建 / 编辑会员等级弹窗
  window.openNewPlanModal = function () {
    document.getElementById('plan-edit-id').value = '';
    document.getElementById('plan-code-input').value = 'PLAN_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    document.getElementById('plan-name-input').value = '';
    document.getElementById('plan-tagline-input').value = '';
    document.getElementById('plan-fee-input').value = '199';
    document.getElementById('plan-cycle-input').value = 'yearly';
    document.getElementById('plan-staff-input').value = '5';
    document.getElementById('plan-station-input').value = '20';
    window.openModal('modal-membership-plan');
  };

  window.openEditPlanModal = function (planId) {
    const p = (platformState.allMembershipPlans || []).find((x) => Number(x.id) === Number(planId));
    if (!p) return;
    document.getElementById('plan-edit-id').value = p.id;
    document.getElementById('plan-code-input').value = p.plan_code;
    document.getElementById('plan-name-input').value = p.plan_name;
    document.getElementById('plan-tagline-input').value = p.tagline || '';
    document.getElementById('plan-fee-input').value = p.fee_amount;
    document.getElementById('plan-cycle-input').value = p.billing_cycle;
    document.getElementById('plan-staff-input').value = p.max_staff_accounts;
    document.getElementById('plan-station-input').value = p.max_partner_stations;
    window.openModal('modal-membership-plan');
  };

  window.saveMembershipPlan = async function () {
    const editId = document.getElementById('plan-edit-id').value;
    const payload = {
      plan_code: document.getElementById('plan-code-input').value.trim().toUpperCase(),
      plan_name: document.getElementById('plan-name-input').value.trim(),
      tagline: document.getElementById('plan-tagline-input').value.trim(),
      fee_amount: parseFloat(document.getElementById('plan-fee-input').value) || 0,
      billing_cycle: document.getElementById('plan-cycle-input').value,
      max_staff_accounts: parseInt(document.getElementById('plan-staff-input').value) || 1,
      max_partner_stations: parseInt(document.getElementById('plan-station-input').value) || 5
    };

    if (!payload.plan_name || !payload.plan_code) return alert('请填写等级代号与名称！');

    if (editId) {
      const { error } = await supabase.from('platform_membership_plan').update(payload).eq('id', parseInt(editId));
      if (error) return alert('修改失败：' + error.message);
    } else {
      const { error } = await supabase.from('platform_membership_plan').insert([payload]);
      if (error) return alert('新增失败：' + error.message);
    }

    window.closeModal('modal-membership-plan');
    await recordAuditLog('配置自定义会员等级', 'WARN', payload);
    alert(`✅ 会员等级【${payload.plan_name}】已保存生效！`);
    await window.loadPlatformData();
  };

  window.deleteMembershipPlan = async function (id, name) {
    if (!confirm(`确认删除会员等级【${name}】吗？`)) return;
    await supabase.from('platform_membership_plan').delete().eq('id', id);
    await window.loadPlatformData();
  };

  // 处理 AI 巡检申诉 / 街坊监督 / 重大事项三位老匠人联署公断
  window.resolveComplianceCase = async function (caseId, targetStatus) {
    const isPass = targetStatus === 'resolved_pass';
    const note = prompt(
      isPass
        ? '请输入核验放行说明（如：已核验SC生产许可证/检疫证明原件，予以恢复展示）：'
        : '请输入维持暂缓/下架说明（如：仍存在夸大疗效描述，或经三位德高望重老匠人联署公断确认失信）：',
      isPass ? '核验凭证属实，已恢复正常展示。' : '核实不符合商道规范，维持暂缓展示。'
    );
    if (note === null) return;

    const { error } = await supabase
      .from('platform_compliance_case')
      .update({
        status: targetStatus,
        arbiter_notes: note.trim(),
        resolved_at: new Date().toISOString()
      })
      .eq('id', caseId);

    if (error) return alert('处理失败：' + error.message);

    await recordAuditLog(isPass ? '复核放行巡检/申诉事项' : '维持暂缓/下架处理', 'WARN', {
      case_id: caseId,
      note: note.trim()
    });
    alert('✅ 裁决结果已生效并通知相关方！');
    await window.loadPlatformData();
  };

  // 登记重大事项（除名清退/重大失信）三位老匠人联署公断单
  window.createMajorArbitrationCase = async function () {
    const tenantId = prompt('请输入涉事商号代号（如 HZ-XXXXXX）：');
    if (!tenantId) return;
    const summary = prompt('请简述重大失信或争议事实，及三位德高望重在册老匠人/理事长联署意见：');
    if (!summary) return;

    const { error } = await supabase.from('platform_compliance_case').insert([
      {
        case_type: 'major_arbitration',
        tenant_id: tenantId.trim().toUpperCase(),
        company_name: tenantId.trim().toUpperCase(),
        target_title: '重大事项联署公断议案',
        ai_findings: summary.trim(),
        status: 'appealed_review'
      }
    ]);

    if (error) return alert('登记失败：' + error.message);
    alert('✅ 已立项进入重大事项公断池！');
    await window.loadPlatformData();
  };
}
