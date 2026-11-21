import { supabase } from '../../lib/supabase.js';
import {
  PLATFORM_GOV_PREFS_KEY,
  PLATFORM_SEVERE_TERMS,
  platformState,
  recordAuditLog
} from './platformState.js';

export function loadGovernancePrefs() {
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

export function getFlaggedProductsList() {
  const activeProds = platformState.allProducts.filter((p) => p.status === 'active');
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

export function renderSuggestions() {
  const container = document.getElementById('suggestions-list');
  if (!container) return;

  if (platformState.allSuggestions.length === 0) {
    container.innerHTML = '<div class="py-12 text-center text-stone-400 text-xs">暂无建言帖，万事清和。</div>';
    return;
  }

  container.innerHTML = platformState.allSuggestions
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

export function renderCategoryTree() {
  const container = document.getElementById('category-tree-display');
  if (!container) return;

  const l1List = platformState.allCategories.filter((c) => c.level === 1);

  container.innerHTML = l1List
    .map((l1) => {
      const subs = platformState.allCategories.filter((c) => c.level === 2 && c.parent_id === l1.id);
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

export function renderAuditLogs() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  tbody.innerHTML = platformState.allAuditLogs
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

export function initPlatformAuditBindings() {
  window.savePlatformGovernancePrefs = function () {
    const prefs = {
      aiAutoMinor: !!document.getElementById('chk-ai-auto-minor')?.checked,
      humanSevereOnly: !!document.getElementById('chk-human-severe-only')?.checked
    };
    localStorage.setItem(PLATFORM_GOV_PREFS_KEY, JSON.stringify(prefs));
    window.runPlatformAIComplianceScan();
  };

  window.runPlatformAIComplianceScan = function () {
    const listEl = document.getElementById('platform-compliance-list');
    const sumEl = document.getElementById('platform-compliance-summary');
    if (!listEl) return;

    const prefs = loadGovernancePrefs();
    const activeProds = platformState.allProducts.filter((p) => p.status === 'active');
    const allFlagged = getFlaggedProductsList();
    const severeCount = allFlagged.filter((x) => x.isSevere).length;
    const minorCount = allFlagged.filter((x) => !x.isSevere).length;

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
        const tenantObj = platformState.allTenants.find((t) => t.tenant_id === prod.tenant_id);
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
      await supabase.from('product').update({ custom_specs: nextSpecs }).eq('id', item.prod.id);
    }

    alert(`🤖 AI 参谋已自动向 ${minorItems.length} 款缺实拍照商品所属商号发送温和润色提示（保持在架不中断业务）。`);
    await window.loadPlatformData();
  };

  window.requestProductRectify = async function (prodId, prodName, reasonText, isSevere = true) {
    const prod = platformState.allProducts.find((p) => Number(p.id) === Number(prodId));
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

  window.openAddCategoryModal = function () {
    window.onCatLevelChange('1');
    window.openModal('add-category-modal');
  };

  window.onCatLevelChange = function (lvl) {
    const parentBox = document.getElementById('parent-cat-box');
    if (lvl === '2') {
      const l1List = platformState.allCategories.filter((c) => c.level === 1);
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
}
