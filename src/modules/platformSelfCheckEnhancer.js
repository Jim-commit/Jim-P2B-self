import { supabase } from '../lib/supabase.js';

const DEFAULT_PLATFORM_COVENANT = [
  '第一条（非利润导向定位）：本平台不搞流量竞价排名、绝不抽佣，仅收取平台运维费用（以会员费形式）维持运转。',
  '第二条（捍卫数据主权与隐私）：坚决捍卫各方数据主权、商业机密与个人敏感信息；平台、源头、驿站、个人各守边界、各守本分、彼此协作，各自数据随时可一键带走。',
  '第三条（物勒工名保真）：入驻主体须如实登记法定证件全称，严禁抢注公共产区名或冒用他人字号；上架货品与服务须实拍明码、不作虚假夸大宣传。',
  '第四条（就近化解与公断）：日常交割小分歧由双方或就近驿站当面化解；重大失信或清退事项由总控或三位德高望重在册老匠人联署公断。'
].join('\n');

const DEFAULT_STORE_COVENANT = [
  '第一条（先行官与驿站角色）：合作门店扎根社区村镇，承担邻里体验、展销与自提服务，服务润利全额归属门店。',
  '第二条（诚信账期与载具循环）：依约使用免息信用周转额度，按期清白对账；爱护周转筐、托盘、容器等循环载具，随车及时归还。',
  '第三条（余缺互助 · 零浪费）：店内富余货品或闲置载具可一键挂入同城余缺互调池，平价调剂给周边同行，同舟共济。',
  '第四条（真实用度排产）：如实提报周期真实用度计划，助力源头合作社与工坊按需采收生产，不囤积居奇、不恶意炒作。'
].join('\n');

async function logGovernanceAudit(title, detail) {
  try {
    await supabase.from('platform_audit_logs').insert([
      {
        tenant_id: 'PLATFORM_HQ',
        operator_name: '总控调度中枢',
        risk_level: 'GOVERNANCE',
        action_title: title,
        detail_summary: detail
      }
    ]);
  } catch {
    // 兼容审计表字段差异，静默兜底不阻断主流程
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');
}

function renderLinesAsParagraphs(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colonIdx = line.indexOf('：');
      if (colonIdx > 0 && colonIdx <= 24) {
        const head = escapeHtml(line.slice(0, colonIdx + 1));
        const body = escapeHtml(line.slice(colonIdx + 1));
        return `<p><b>${head}</b>${body}</p>`;
      }
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join('');
}

export function mountPlatformSelfCheckEnhancer() {
  const selfcheckSection = document.getElementById('p-tab-selfcheck');
  if (!selfcheckSection || document.getElementById('global-emergency-switchboard')) return;

  // 1. 在双向公约上方插入「⚡ 全局应急与守护总闸」（暖石浅底 + 深翡翠绿细边儒雅融合版）
  const covenantGrid = selfcheckSection.children[1];
  const switchboardHtml = `
    <div id="global-emergency-switchboard" class="bg-gradient-to-r from-[#faf8f5] via-amber-50/40 to-emerald-50/50 text-stone-800 p-5 rounded-3xl shadow-sm border border-emerald-800/25 space-y-3 transition-colors duration-300">
      <div class="flex flex-wrap justify-between items-center gap-2 border-b border-emerald-800/15 pb-2.5">
        <div>
          <h3 class="text-sm font-bold text-emerald-950 flex items-center gap-1.5">
            <span>⚡</span> 全局应急与守护总闸（一屏掌控全网运行态）
          </h3>
          <p class="text-[11px] text-stone-500">平时保持稳态不打扰一线；遇恶意抢注、违禁词冒头或全网保供调度时一秒切换</p>
        </div>
        <span id="switchboard-sync-hint" class="text-[11px] font-mono text-emerald-800 font-bold"></span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <!-- 开关 1：全网入驻审核模式切换 -->
        <div id="card-join-strict-mode" class="bg-white border border-stone-200/90 p-3.5 rounded-2xl flex flex-col justify-between gap-2.5 shadow-2xs transition">
          <div>
            <div class="flex justify-between items-center">
              <b class="text-stone-900 text-xs">🛡️ 全网入驻审核戒备</b>
              <span id="badge-join-strict-mode" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">常规核验</span>
            </div>
            <p class="text-[11px] text-stone-500 mt-1 leading-relaxed">遇批量抢注公共产区名时，可一键切为「从严逐笔终审」。</p>
          </div>
          <button type="button" id="btn-toggle-join-strict" onclick="window.toggleGlobalJoinStrictMode()"
            class="w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl border border-stone-300 active:scale-95 transition">
            切换为【从严逐笔终审】
          </button>
        </div>

        <!-- 开关 2：AI 商道清朗全网急扫 -->
        <div class="bg-white border border-stone-200/90 p-3.5 rounded-2xl flex flex-col justify-between gap-2.5 shadow-2xs">
          <div>
            <div class="flex justify-between items-center">
              <b class="text-stone-900 text-xs">🤖 AI 商道清朗全网急扫</b>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">全网巡检</span>
            </div>
            <p class="text-[11px] text-stone-500 mt-1 leading-relaxed">立即扫描全网在架货品违禁词与异常低价疑点，并同步刷新体检状态。</p>
          </div>
          <button type="button" onclick="window.triggerEmergencyComplianceScan()"
            class="w-full py-2 bg-[#1b4332] hover:bg-[#143628] text-white font-bold text-xs rounded-xl shadow-xs active:scale-95 transition">
            🔍 立即执行全网清朗急扫
          </button>
        </div>

        <!-- 开关 3：签发全网商道公告 -->
        <div class="bg-white border border-stone-200/90 p-3.5 rounded-2xl flex flex-col justify-between gap-2.5 shadow-2xs">
          <div>
            <div class="flex justify-between items-center">
              <b class="text-stone-900 text-xs">📢 签发全网商道公告</b>
              <span id="badge-global-notice-state" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 border border-stone-200">未挂公告</span>
            </div>
            <p id="preview-global-notice" class="text-[11px] text-stone-500 mt-1 leading-relaxed truncate">向所有合作社与门店同步推送节假日保供或公约修订提醒。</p>
          </div>
          <button type="button" onclick="window.openGlobalNoticeEditor()"
            class="w-full py-2 bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-xs rounded-xl border border-amber-500/60 shadow-xs active:scale-95 transition">
            ✍️ 编辑 / 撤下全网公告
          </button>
        </div>
      </div>
    </div>
  `;

  if (covenantGrid) {
    covenantGrid.insertAdjacentHTML('beforebegin', switchboardHtml);

    // 2. 给两份公约卡片加上 ID 与「✏️ 修订公约条款」在线编辑留痕能力
    const cards = covenantGrid.children;
    if (cards[0]) {
      const h3 = cards[0].querySelector('h3');
      const bodyDiv = cards[0].querySelector('div');
      if (bodyDiv) bodyDiv.id = 'covenant-platform-body';
      if (h3) {
        h3.classList.add('flex', 'justify-between', 'items-center', 'gap-2');
        h3.insertAdjacentHTML(
          'beforeend',
          `<button type="button" onclick="window.openCovenantEditor('platform')"
            class="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-1 rounded-lg font-bold shrink-0 active:scale-95 transition">
            ✏️ 修订公约条款
          </button>`
        );
      }
    }
    if (cards[1]) {
      const h3 = cards[1].querySelector('h3');
      const bodyDiv = cards[1].querySelector('div');
      if (bodyDiv) bodyDiv.id = 'covenant-store-body';
      if (h3) {
        h3.classList.add('flex', 'justify-between', 'items-center', 'gap-2');
        h3.insertAdjacentHTML(
          'beforeend',
          `<button type="button" onclick="window.openCovenantEditor('store')"
            class="text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-lg font-bold shrink-0 active:scale-95 transition">
            ✏️ 修订公约条款
          </button>`
        );
      }
    }
  }

  // 3. 插入公约在线修订弹窗
  const editorModalHtml = `
    <div id="modal-covenant-editor" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
      <div class="bg-white w-full max-w-lg rounded-3xl p-5 space-y-3 text-stone-800 shadow-2xl text-xs">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2">
          <h3 id="covenant-editor-title" class="font-bold text-sm text-stone-900">✏️ 在线修订商道公约（修改自动写入天道明鉴审计）</h3>
          <button type="button" onclick="document.getElementById('modal-covenant-editor').classList.add('hidden')" class="text-stone-400 text-lg">✕</button>
        </div>
        <input type="hidden" id="covenant-editor-target" value="">
        <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
          每行一条条款（建议以「第X条（标题）：正文」格式书写）。保存后立即同步全网公示，并在「⚖️ 天道明鉴审计」留下不可篡改修订记录。
        </p>
        <textarea id="covenant-editor-textarea" rows="8"
          class="w-full bg-stone-50 border border-stone-300 rounded-2xl p-3 text-xs leading-relaxed text-stone-900 outline-none focus:border-emerald-700"></textarea>
        <div class="flex justify-end gap-2 pt-2 border-t border-stone-100">
          <button type="button" onclick="document.getElementById('modal-covenant-editor').classList.add('hidden')"
            class="px-4 py-2 rounded-xl bg-stone-100 text-stone-600 font-bold">取消</button>
          <button type="button" id="btn-save-covenant" onclick="window.saveCovenantRevision()"
            class="px-4 py-2 rounded-xl bg-stone-900 text-amber-300 font-bold">依礼颁布并记入审计链</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', editorModalHtml);

  let currentStrictMode = 'normal';
  let currentNoticeText = '';
  let platformCovenantRaw = DEFAULT_PLATFORM_COVENANT;
  let storeCovenantRaw = DEFAULT_STORE_COVENANT;

  window.syncGlobalGovernanceState = async function () {
    try {
      const { data } = await supabase
        .from('platform_gov_configs')
        .select('config_key, config_value')
        .in('config_key', [
          'join_audit_strict_mode',
          'global_platform_notice',
          'covenant_platform_text',
          'covenant_store_text'
        ]);

      (data || []).forEach((row) => {
        if (row.config_key === 'join_audit_strict_mode') currentStrictMode = row.config_value || 'normal';
        if (row.config_key === 'global_platform_notice') currentNoticeText = row.config_value || '';
        if (row.config_key === 'covenant_platform_text' && row.config_value?.trim()) {
          platformCovenantRaw = row.config_value.trim();
        }
        if (row.config_key === 'covenant_store_text' && row.config_value?.trim()) {
          storeCovenantRaw = row.config_value.trim();
        }
      });

      // 渲染入驻审核戒备态（平时温润浅底，切入戒备态局部亮起警示色）
      const modeCard = document.getElementById('card-join-strict-mode');
      const modeBadge = document.getElementById('badge-join-strict-mode');
      const modeBtn = document.getElementById('btn-toggle-join-strict');
      if (currentStrictMode === 'strict') {
        if (modeCard) {
          modeCard.classList.remove('border-stone-200/90');
          modeCard.classList.add('border-rose-400', 'bg-rose-50/40');
        }
        if (modeBadge) {
          modeBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-bold animate-pulse';
          modeBadge.innerText = '🚨 从严终审戒备中';
        }
        if (modeBtn) {
          modeBtn.className = 'w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs active:scale-95 transition';
          modeBtn.innerText = '恢复为【常规核验放行】';
        }
      } else {
        if (modeCard) {
          modeCard.classList.remove('border-rose-400', 'bg-rose-50/40');
          modeCard.classList.add('border-stone-200/90');
        }
        if (modeBadge) {
          modeBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold';
          modeBadge.innerText = '常规核验';
        }
        if (modeBtn) {
          modeBtn.className = 'w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl border border-stone-300 active:scale-95 transition';
          modeBtn.innerText = '切换为【从严逐笔终审】';
        }
      }

      // 渲染全网公告状态
      const noticeBadge = document.getElementById('badge-global-notice-state');
      const noticePreview = document.getElementById('preview-global-notice');
      if (currentNoticeText.trim()) {
        if (noticeBadge) {
          noticeBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold';
          noticeBadge.innerText = '全网广播中';
        }
        if (noticePreview) noticePreview.innerText = `当前公告：${currentNoticeText}`;
      } else {
        if (noticeBadge) {
          noticeBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 border border-stone-200';
          noticeBadge.innerText = '未挂公告';
        }
        if (noticePreview) noticePreview.innerText = '向所有合作社与门店同步推送节假日保供或公约修订提醒。';
      }

      // 渲染双向公约正文
      const pBody = document.getElementById('covenant-platform-body');
      const sBody = document.getElementById('covenant-store-body');
      if (pBody) pBody.innerHTML = renderLinesAsParagraphs(platformCovenantRaw);
      if (sBody) sBody.innerHTML = renderLinesAsParagraphs(storeCovenantRaw);
    } catch {
      // 保持默认呈现
    }
  };

  // 第 1 项精修：4 张自检卡片加上悬停微浮起与亮金边动效 + 智能下钻分流
  window.applySmartSelfCheckDrilldown = function () {
    const grid = document.getElementById('platform-selfcheck-grid');
    if (!grid) return;

    Array.from(grid.children).forEach((card, idx) => {
      card.style.cursor = 'pointer';
      card.classList.add(
        'hover:border-amber-400',
        'hover:shadow-md',
        'hover:-translate-y-0.5',
        'transition-all',
        'duration-200'
      );

      if (idx === 0) {
        card.title = '点击进入「🎖️ 会员等级与会费」调整体验期与运维会费标准';
        card.onclick = () => window.switchTab?.('membership');
      } else if (idx === 1) {
        card.title = '点击进入「🎛️ 全局参数与网关」核验数据主权与收银台配置';
        card.onclick = () => window.switchTab?.('configs');
      } else if (idx === 2) {
        card.title = '点击进入「🏢 在册主体名册」查看主体档案与防抢注状态';
        card.onclick = () => window.switchTab?.('tenants');
      } else if (idx === 3) {
        const text = card.innerText || '';
        const match = text.match(/疑点仅\s*(\d+)\s*项|疑点\s*(\d+)\s*项/);
        const suspectCount = match ? Number(match[1] || match[2] || 0) : 0;
        if (suspectCount > 0) {
          card.classList.add('border-rose-500', 'bg-rose-50/80', 'ring-2', 'ring-rose-400');
          card.title = `检测到 ${suspectCount} 项高风险疑点！点击立即直达「🌿 商道清朗巡检」处置`;
          card.onclick = () => {
            window.switchTab?.('compliance');
            window.runPlatformAIComplianceScan?.();
          };
        } else {
          card.classList.remove('border-rose-500', 'bg-rose-50/80', 'ring-2', 'ring-rose-400');
          card.title = '全网清朗 100%，点击进入「⚖️ 天道明鉴审计」查阅防篡改流水';
          card.onclick = () => window.switchTab?.('audit');
        }
      }
    });
  };

  window.toggleGlobalJoinStrictMode = async function () {
    const nextMode = currentStrictMode === 'strict' ? 'normal' : 'strict';
    const desc =
      nextMode === 'strict'
        ? '已切换为【从严人工逐笔终审戒备模式】，所有新入驻申请均需人工核验执照原件后方可立户。'
        : '已恢复为【常规核验放行模式】。';

    const { error } = await supabase.from('platform_gov_configs').upsert({
      config_key: 'join_audit_strict_mode',
      config_value: nextMode,
      description: '全网入驻审核模式：normal=常规核验放行，strict=防抢注从严逐笔终审'
    });
    if (error) return alert('切换失败：' + error.message);

    await logGovernanceAudit('切换全网入驻审核戒备态', desc);
    await window.syncGlobalGovernanceState();
    alert(`✅ ${desc}`);
  };

  window.triggerEmergencyComplianceScan = async function () {
    const hint = document.getElementById('switchboard-sync-hint');
    if (hint) hint.innerText = '⏳ 正在执行全网清朗急扫...';
    if (typeof window.runPlatformAIComplianceScan === 'function') {
      await window.runPlatformAIComplianceScan();
    }
    if (typeof window.runInteractiveSelfCheck === 'function') {
      await window.runInteractiveSelfCheck();
    }
    if (hint) hint.innerText = `✅ 全网急扫完成（${new Date().toLocaleTimeString('zh-CN', { hour12: false })}）`;
  };

  window.openGlobalNoticeEditor = async function () {
    const nextText = prompt(
      '请输入要向全网合作社与社区门店推送的《商道公告》（清空内容并确定即撤下公告）：',
      currentNoticeText
    );
    if (nextText === null) return;

    const trimmed = nextText.trim();
    const { error } = await supabase.from('platform_gov_configs').upsert({
      config_key: 'global_platform_notice',
      config_value: trimmed,
      description: '全网商道公告横幅内容'
    });
    if (error) return alert('更新公告失败：' + error.message);

    await logGovernanceAudit(
      trimmed ? '签发全网商道公告' : '撤下全网商道公告',
      trimmed || '已清空全网公告横幅'
    );
    await window.syncGlobalGovernanceState();
    alert(trimmed ? '📢 全网商道公告已生效并记入天道明鉴审计！' : '✅ 已撤下全网公告。');
  };

  window.openCovenantEditor = function (target) {
    const modal = document.getElementById('modal-covenant-editor');
    const titleEl = document.getElementById('covenant-editor-title');
    const targetInput = document.getElementById('covenant-editor-target');
    const textarea = document.getElementById('covenant-editor-textarea');
    if (!modal || !textarea || !targetInput) return;

    targetInput.value = target;
    if (target === 'platform') {
      if (titleEl) titleEl.innerText = '✏️ 修订《百工百业数字公器 · 平台入驻与商道公约》';
      textarea.value = platformCovenantRaw;
    } else {
      if (titleEl) titleEl.innerText = '✏️ 修订《合作门店与社区邻里驿站公约》';
      textarea.value = storeCovenantRaw;
    }
    modal.classList.remove('hidden');
  };

  window.saveCovenantRevision = async function () {
    const target = document.getElementById('covenant-editor-target')?.value;
    const content = document.getElementById('covenant-editor-textarea')?.value.trim();
    const btn = document.getElementById('btn-save-covenant');
    if (!content) return alert('公约内容不能为空！');

    const configKey = target === 'platform' ? 'covenant_platform_text' : 'covenant_store_text';
    const covenantTitle =
      target === 'platform'
        ? '《百工百业数字公器 · 平台入驻与商道公约》'
        : '《合作门店与社区邻里驿站公约》';

    if (btn) {
      btn.disabled = true;
      btn.innerText = '正在颁布并留痕...';
    }
    try {
      const { error } = await supabase.from('platform_gov_configs').upsert({
        config_key: configKey,
        config_value: content,
        description: `${covenantTitle}在线修订版正文`
      });
      if (error) throw error;

      await logGovernanceAudit(`在线修订${covenantTitle}`, `新颁条款摘要：${content.slice(0, 80)}...`);
      await window.syncGlobalGovernanceState();
      document.getElementById('modal-covenant-editor')?.classList.add('hidden');
      alert(`✅ ${covenantTitle}已正式更新生效，并已写入天道明鉴防篡改审计流水！`);
    } catch (err) {
      alert('保存失败：' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = '依礼颁布并记入审计链';
      }
    }
  };
}
