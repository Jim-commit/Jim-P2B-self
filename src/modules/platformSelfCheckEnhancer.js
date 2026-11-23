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

async function sha256Hex(text) {
  const msgBuffer = new TextEncoder().encode(String(text || '').trim().toUpperCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generatePlatformRecoveryCodes(count = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes = [];
  for (let i = 0; i < count; i++) {
    let p1 = '';
    let p2 = '';
    for (let j = 0; j < 4; j++) {
      p1 += chars[Math.floor(Math.random() * chars.length)];
      p2 += chars[Math.floor(Math.random() * chars.length)];
    }
    codes.push(`PT-${p1}-${p2}`);
  }
  return codes;
}

function requireCommanderAuth(actionDesc, callback) {
  if (typeof window.requestPlatform2FA === 'function') {
    window.requestPlatform2FA(actionDesc, callback);
    return;
  }
  const savedToken = sessionStorage.getItem('platform_admin_token') || '';
  const input = prompt(`🛡️ 【绝对掌控 · 执事核身】\n${actionDesc}\n\n请输入总控管理令牌 (Token) 确认授权：`);
  if (input === null) return;
  if (!input.trim() || (savedToken && input.trim() !== savedToken)) {
    alert('❌ 核身令牌不匹配，已拦截本次总闸指令！');
    return;
  }
  callback();
}

async function logGovernanceAudit(title, detail, level = 'CRITICAL') {
  try {
    await supabase.from('platform_audit_logs').insert([
      {
        tenant_id: 'PLATFORM_HQ',
        operator_name: '总控最高执事',
        risk_level: level,
        action_title: title,
        detail_summary: detail
      }
    ]);
  } catch {
    // 兼容审计表字段差异
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

// 挂载总控 TOTP 8组保命恢复码签发与遗失重绑双保险
function mountPlatformTotpRecoveryGuard() {
  if (document.getElementById('modal-platform-recovery-codes')) return;

  // 1. 恢复码签发展示弹窗
  const recoveryModalHtml = `
    <div id="modal-platform-recovery-codes" class="hidden fixed inset-0 bg-stone-950/90 backdrop-blur-sm z-[140] flex items-center justify-center p-4">
      <div class="bg-stone-900 border border-amber-400/50 w-full max-w-md rounded-3xl p-6 space-y-4 text-white shadow-2xl text-xs">
        <div class="flex items-center gap-2 border-b border-stone-800 pb-3">
          <span class="text-2xl">🗝️</span>
          <div>
            <h3 class="font-bold text-sm text-amber-300">《总控最高执事 · 8组一次性保命应急恢复码》</h3>
            <p class="text-[10px] text-stone-400">主力手机丢失或重装验证器时，凭任一组恢复码即可解锁重绑（云端零明文存储）</p>
          </div>
        </div>

        <div id="platform-recovery-codes-grid" class="grid grid-cols-2 gap-2 bg-stone-950 p-3.5 rounded-2xl border border-stone-800 font-mono text-sm font-bold text-emerald-300 text-center"></div>

        <p class="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl leading-relaxed">
          ⚠️ 请立即点击下方按钮下载离线存根文件，存入加密 U 盘或打印妥善保管。每组恢复码使用一次后自动作废！
        </p>

        <div class="flex gap-2 pt-1">
          <button type="button" onclick="window.downloadPlatformRecoveryCodesTxt()"
            class="flex-1 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold shadow">
            📄 一键下载《总控应急恢复码存根.txt》
          </button>
          <button type="button" onclick="document.getElementById('modal-platform-recovery-codes').classList.add('hidden')"
            class="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold">
            已妥善保存
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', recoveryModalHtml);

  let latestGeneratedRecoveryCodes = [];

  window.downloadPlatformRecoveryCodesTxt = function () {
    if (!latestGeneratedRecoveryCodes.length) return;
    const content = [
      '======================================================',
      '百工百业数字协作平台 · 总控最高执事一次性应急恢复码存根',
      `签发生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
      '======================================================',
      '用途说明：当绑定 TOTP 验证器的主力手机遗失或损坏时，',
      '可在总控登录门禁底部点击【遗失验证器 · 凭应急恢复码重置】，',
      '输入以下任意一组未使用的恢复码即可重新扫码绑定新手机。',
      '------------------------------------------------------',
      ...latestGeneratedRecoveryCodes.map((c, idx) => `第 ${idx + 1} 组：  ${c}`),
      '------------------------------------------------------',
      '安全提示：云端仅存储 SHA-256 单向摘要，每组用过即自动作废。'
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `百工天街总控应急恢复码存根_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  window.issueNewPlatformRecoveryCodes = async function () {
    const plainCodes = generatePlatformRecoveryCodes(8);
    latestGeneratedRecoveryCodes = plainCodes;
    const hashes = await Promise.all(plainCodes.map((c) => sha256Hex(c)));

    await supabase.from('platform_gov_configs').upsert({
      config_key: 'platform_totp_recovery_hashes',
      config_value: JSON.stringify(hashes),
      description: '总控 TOTP 验证器一次性应急恢复码 SHA-256 哈希集合'
    });

    const grid = document.getElementById('platform-recovery-codes-grid');
    if (grid) {
      grid.innerHTML = plainCodes
        .map((c) => `<div class="py-1.5 px-2 bg-stone-900 rounded-lg border border-stone-800">${c}</div>`)
        .join('');
    }
    document.getElementById('modal-platform-recovery-codes')?.classList.remove('hidden');
  };

  // 2. 包装原有的 verifyAndSavePlatformTotp：绑定成功瞬间自动签发 8 组恢复码
  setTimeout(() => {
    const origVerifyTotp = window.verifyAndSavePlatformTotp;
    if (typeof origVerifyTotp === 'function' && !origVerifyTotp._recoveryWrapped) {
      const wrapped = async function (...args) {
        const res = await origVerifyTotp.apply(this, args);
        const setupModal = document.getElementById('modal-platform-totp-setup');
        if (setupModal && setupModal.classList.contains('hidden')) {
          await window.issueNewPlatformRecoveryCodes();
        }
        return res;
      };
      wrapped._recoveryWrapped = true;
      window.verifyAndSavePlatformTotp = wrapped;
    }
  }, 300);

  // 3. 在总控登录门禁底部注入「遗失验证器 · 凭应急恢复码重置验证器」通道
  const authGateCard = document.querySelector('#platform-auth-gate > div');
  if (authGateCard && !document.getElementById('btn-platform-totp-recover')) {
    authGateCard.insertAdjacentHTML(
      'beforeend',
      `
      <div class="pt-2 border-t border-stone-800 text-center">
        <button type="button" id="btn-platform-totp-recover" onclick="window.openPlatformTotpRecoveryFlow()"
          class="text-[11px] text-amber-300/90 hover:text-amber-200 underline font-bold">
          🔑 手机遗失？凭《8组应急恢复码》重置并重绑验证器
        </button>
      </div>
      `
    );
  }

  window.openPlatformTotpRecoveryFlow = async function () {
    const codeInput = prompt(
      '🔑 【总控验证器应急重置通道】\n请输入您离线保存的任一组《应急恢复码》（格式如 PT-XXXX-XXXX）：'
    );
    if (!codeInput || !codeInput.trim()) return;

    const cleanCode = codeInput.trim().toUpperCase();
    const inputHash = await sha256Hex(cleanCode);

    const { data } = await supabase
      .from('platform_gov_configs')
      .select('config_value')
      .eq('config_key', 'platform_totp_recovery_hashes')
      .maybeSingle();

    let hashes = [];
    try {
      hashes = JSON.parse(data?.config_value || '[]');
    } catch {
      hashes = [];
    }

    const matchIdx = hashes.indexOf(inputHash);
    if (matchIdx === -1) {
      alert('❌ 应急恢复码无效或已被使用过！请核对离线存根后重试。');
      return;
    }

    // 作废已使用的这一组恢复码
    hashes.splice(matchIdx, 1);
    await supabase.from('platform_gov_configs').upsert({
      config_key: 'platform_totp_recovery_hashes',
      config_value: JSON.stringify(hashes),
      description: '总控 TOTP 验证器一次性应急恢复码 SHA-256 哈希集合'
    });

    // 清除本机旧 TOTP 锁定标记并放行进入重绑流程
    localStorage.removeItem('platform_totp_secret');
    localStorage.removeItem('platform_totp_enabled');
    await logGovernanceAudit(
      '总控验证器应急恢复码核销重置',
      `已核销 1 组一次性恢复码（剩余 ${hashes.length} 组可用），放行重新绑定新手机验证器。`,
      'CRITICAL'
    );

    alert(
      `✅ 应急恢复码核验通过（该组已作废，剩余 ${hashes.length} 组可用）！\n请先使用总控账号与管理令牌登录，随后立即点击顶栏「🛡️ 绑定总控验证器」扫描新手机二维码。`
    );
  };
}

export function mountPlatformSelfCheckEnhancer() {
  mountPlatformTotpRecoveryGuard();

  const selfcheckSection = document.getElementById('p-tab-selfcheck');
  if (!selfcheckSection || document.getElementById('global-emergency-switchboard')) return;

  const covenantGrid = selfcheckSection.children[1];
  const switchboardHtml = `
    <div id="global-emergency-switchboard" class="bg-gradient-to-r from-[#faf8f5] via-amber-50/40 to-emerald-50/50 text-stone-800 p-5 rounded-3xl shadow-sm border border-emerald-800/25 space-y-3 transition-colors duration-300">
      <div class="flex flex-wrap justify-between items-center gap-2 border-b border-emerald-800/15 pb-2.5">
        <div>
          <h3 class="text-sm font-bold text-emerald-950 flex items-center gap-1.5">
            <span>⚡</span> 全局应急与守护总闸（2FA 强核身 · 全站 7 端实时硬生效）
          </h3>
          <p class="text-[11px] text-stone-500">平时温润稳态不打扰一线；遇突发风控、恶意抢注或极端保供时一秒硬控全网</p>
        </div>
        <span id="switchboard-sync-hint" class="text-[11px] font-mono text-emerald-800 font-bold"></span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <!-- 开关 1：全网入驻审核戒备 -->
        <div id="card-join-strict-mode" class="bg-white border border-stone-200/90 p-3.5 rounded-2xl flex flex-col justify-between gap-2.5 shadow-2xs transition">
          <div>
            <div class="flex justify-between items-center">
              <b class="text-stone-900 text-xs">🛡️ 入驻审核戒备</b>
              <span id="badge-join-strict-mode" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">常规核验</span>
            </div>
            <p class="text-[11px] text-stone-500 mt-1 leading-relaxed">遇批量抢注产区名时，一键切为「从严逐笔人工终审」。</p>
          </div>
          <button type="button" id="btn-toggle-join-strict" onclick="window.toggleGlobalJoinStrictMode()"
            class="w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl border border-stone-300 active:scale-95 transition">
            切换为【从严终审】
          </button>
        </div>

        <!-- 开关 2：AI 商道清朗全网急扫 -->
        <div class="bg-white border border-stone-200/90 p-3.5 rounded-2xl flex flex-col justify-between gap-2.5 shadow-2xs">
          <div>
            <div class="flex justify-between items-center">
              <b class="text-stone-900 text-xs">🤖 全网清朗急扫</b>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">全网巡检</span>
            </div>
            <p class="text-[11px] text-stone-500 mt-1 leading-relaxed">立即扫雷在架货品违禁词与异常价格疑点，并同步体检。</p>
          </div>
          <button type="button" onclick="window.triggerEmergencyComplianceScan()"
            class="w-full py-2 bg-[#1b4332] hover:bg-[#143628] text-white font-bold text-xs rounded-xl shadow-xs active:scale-95 transition">
            🔍 立即执行全网急扫
          </button>
        </div>

        <!-- 开关 3：签发全网商道公告 -->
        <div class="bg-white border border-stone-200/90 p-3.5 rounded-2xl flex flex-col justify-between gap-2.5 shadow-2xs">
          <div>
            <div class="flex justify-between items-center">
              <b class="text-stone-900 text-xs">📢 全网置顶广播</b>
              <span id="badge-global-notice-state" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 border border-stone-200">未挂公告</span>
            </div>
            <p id="preview-global-notice" class="text-[11px] text-stone-500 mt-1 leading-relaxed truncate">向所有合作社与门店顶栏同步推送保供或公约修订通知。</p>
          </div>
          <button type="button" onclick="window.openGlobalNoticeEditor()"
            class="w-full py-2 bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-xs rounded-xl border border-amber-500/60 shadow-xs active:scale-95 transition">
            ✍️ 签发 / 撤下公告
          </button>
        </div>

        <!-- 开关 4：全网紧急熔断（只读保供模式） -->
        <div id="card-emergency-freeze" class="bg-white border border-stone-200/90 p-3.5 rounded-2xl flex flex-col justify-between gap-2.5 shadow-2xs transition">
          <div>
            <div class="flex justify-between items-center">
              <b class="text-stone-900 text-xs">🛑 紧急只读熔断</b>
              <span id="badge-emergency-freeze" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">全网畅通</span>
            </div>
            <p class="text-[11px] text-stone-500 mt-1 leading-relaxed">极端风控时冻结全网新注册与新上架，保留既有订单交割。</p>
          </div>
          <button type="button" id="btn-toggle-emergency-freeze" onclick="window.toggleGlobalEmergencyFreeze()"
            class="w-full py-2 bg-stone-100 hover:bg-rose-50 hover:text-rose-800 hover:border-rose-300 text-stone-700 font-bold text-xs rounded-xl border border-stone-300 active:scale-95 transition">
            启动【只读保供熔断】
          </button>
        </div>
      </div>
    </div>
  `;

  if (covenantGrid) {
    covenantGrid.insertAdjacentHTML('beforebegin', switchboardHtml);

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

  const editorModalHtml = `
    <div id="modal-covenant-editor" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
      <div class="bg-white w-full max-w-lg rounded-3xl p-5 space-y-3 text-stone-800 shadow-2xl text-xs">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2">
          <h3 id="covenant-editor-title" class="font-bold text-sm text-stone-900">✏️ 在线修订商道公约（2FA 核身 · 自动写入审计链）</h3>
          <button type="button" onclick="document.getElementById('modal-covenant-editor').classList.add('hidden')" class="text-stone-400 text-lg">✕</button>
        </div>
        <input type="hidden" id="covenant-editor-target" value="">
        <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
          每行一条条款（建议以「第X条（标题）：正文」格式书写）。保存需经总控核身，生效后全网同步公示并写入防篡改审计流水。
        </p>
        <textarea id="covenant-editor-textarea" rows="8"
          class="w-full bg-stone-50 border border-stone-300 rounded-2xl p-3 text-xs leading-relaxed text-stone-900 outline-none focus:border-emerald-700"></textarea>
        <div class="flex justify-end gap-2 pt-2 border-t border-stone-100">
          <button type="button" onclick="document.getElementById('modal-covenant-editor').classList.add('hidden')"
            class="px-4 py-2 rounded-xl bg-stone-100 text-stone-600 font-bold">取消</button>
          <button type="button" id="btn-save-covenant" onclick="window.saveCovenantRevision()"
            class="px-4 py-2 rounded-xl bg-stone-900 text-amber-300 font-bold">🛡️ 核身颁布并记入审计链</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', editorModalHtml);

  let currentStrictMode = 'normal';
  let currentFreezeMode = 'off';
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
          'global_emergency_freeze',
          'global_platform_notice',
          'covenant_platform_text',
          'covenant_store_text'
        ]);

      (data || []).forEach((row) => {
        if (row.config_key === 'join_audit_strict_mode') currentStrictMode = row.config_value || 'normal';
        if (row.config_key === 'global_emergency_freeze') currentFreezeMode = row.config_value || 'off';
        if (row.config_key === 'global_platform_notice') currentNoticeText = row.config_value || '';
        if (row.config_key === 'covenant_platform_text' && row.config_value?.trim()) {
          platformCovenantRaw = row.config_value.trim();
        }
        if (row.config_key === 'covenant_store_text' && row.config_value?.trim()) {
          storeCovenantRaw = row.config_value.trim();
        }
      });

      const modeCard = document.getElementById('card-join-strict-mode');
      const modeBadge = document.getElementById('badge-join-strict-mode');
      const modeBtn = document.getElementById('btn-toggle-join-strict');
      if (currentStrictMode === 'strict') {
        modeCard?.classList.add('border-rose-400', 'bg-rose-50/40');
        if (modeBadge) {
          modeBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-bold animate-pulse';
          modeBadge.innerText = '🚨 从严终审中';
        }
        if (modeBtn) {
          modeBtn.className = 'w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs active:scale-95 transition';
          modeBtn.innerText = '恢复【常规核验】';
        }
      } else {
        modeCard?.classList.remove('border-rose-400', 'bg-rose-50/40');
        if (modeBadge) {
          modeBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold';
          modeBadge.innerText = '常规核验';
        }
        if (modeBtn) {
          modeBtn.className = 'w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl border border-stone-300 active:scale-95 transition';
          modeBtn.innerText = '切换为【从严终审】';
        }
      }

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
        if (noticePreview) noticePreview.innerText = '向所有合作社与门店顶栏同步推送保供或公约修订通知。';
      }

      const freezeCard = document.getElementById('card-emergency-freeze');
      const freezeBadge = document.getElementById('badge-emergency-freeze');
      const freezeBtn = document.getElementById('btn-toggle-emergency-freeze');
      if (currentFreezeMode === 'freeze') {
        freezeCard?.classList.add('border-rose-500', 'bg-rose-50/60', 'ring-2', 'ring-rose-300');
        if (freezeBadge) {
          freezeBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold animate-pulse';
          freezeBadge.innerText = '🛑 全网只读熔断中';
        }
        if (freezeBtn) {
          freezeBtn.className = 'w-full py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs rounded-xl shadow active:scale-95 transition';
          freezeBtn.innerText = '解除熔断 · 恢复全网写入';
        }
      } else {
        freezeCard?.classList.remove('border-rose-500', 'bg-rose-50/60', 'ring-2', 'ring-rose-300');
        if (freezeBadge) {
          freezeBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold';
          freezeBadge.innerText = '全网畅通';
        }
        if (freezeBtn) {
          freezeBtn.className = 'w-full py-2 bg-stone-100 hover:bg-rose-50 hover:text-rose-800 hover:border-rose-300 text-stone-700 font-bold text-xs rounded-xl border border-stone-300 active:scale-95 transition';
          freezeBtn.innerText = '启动【只读保供熔断】';
        }
      }

      const pBody = document.getElementById('covenant-platform-body');
      const sBody = document.getElementById('covenant-store-body');
      if (pBody) pBody.innerHTML = renderLinesAsParagraphs(platformCovenantRaw);
      if (sBody) sBody.innerHTML = renderLinesAsParagraphs(storeCovenantRaw);
    } catch {
      // 保持默认呈现
    }
  };

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

  window.toggleGlobalJoinStrictMode = function () {
    const nextMode = currentStrictMode === 'strict' ? 'normal' : 'strict';
    const desc =
      nextMode === 'strict'
        ? '切换全网入驻审核为【从严人工逐笔终审戒备模式】'
        : '恢复全网入驻审核为【常规核验放行模式】';

    requireCommanderAuth(desc, async () => {
      const { error } = await supabase.from('platform_gov_configs').upsert({
        config_key: 'join_audit_strict_mode',
        config_value: nextMode,
        description: '全网入驻审核模式：normal=常规核验放行，strict=防抢注从严逐笔终审'
      });
      if (error) return alert('切换失败：' + error.message);

      await logGovernanceAudit('调整全网入驻审核戒备态', desc, 'HIGH');
      await window.syncGlobalGovernanceState();
      alert(`✅ 已执行：${desc}`);
    });
  };

  window.toggleGlobalEmergencyFreeze = function () {
    const nextFreeze = currentFreezeMode === 'freeze' ? 'off' : 'freeze';
    const desc =
      nextFreeze === 'freeze'
        ? '启动【全网只读保供熔断】：立即冻结全站新主体注册与新货品上架，仅保留既有订单履约与平账！'
        : '解除【全网只读保供熔断】：恢复全站正常入驻与发布功能。';

    requireCommanderAuth(desc, async () => {
      const { error } = await supabase.from('platform_gov_configs').upsert({
        config_key: 'global_emergency_freeze',
        config_value: nextFreeze,
        description: '全网紧急熔断开关：off=正常协作，freeze=全网只读保供模式'
      });
      if (error) return alert('熔断切换失败：' + error.message);

      await logGovernanceAudit(
        nextFreeze === 'freeze' ? '启动全网紧急只读熔断' : '解除全网紧急只读熔断',
        desc,
        'CRITICAL'
      );
      await window.syncGlobalGovernanceState();
      alert(`✅ 已执行：${desc}`);
    });
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

  window.openGlobalNoticeEditor = function () {
    const nextText = prompt(
      '请输入要向全网合作社与社区门店置顶广播的《商道公告》（清空内容并确定即撤下公告）：',
      currentNoticeText
    );
    if (nextText === null) return;

    const trimmed = nextText.trim();
    const actionDesc = trimmed ? `全网置顶签发《商道公告》：${trimmed}` : '撤下全网置顶《商道公告》';

    requireCommanderAuth(actionDesc, async () => {
      const { error } = await supabase.from('platform_gov_configs').upsert({
        config_key: 'global_platform_notice',
        config_value: trimmed,
        description: '全网商道公告横幅内容'
      });
      if (error) return alert('更新公告失败：' + error.message);

      await logGovernanceAudit(trimmed ? '签发全网置顶商道公告' : '撤下全网置顶公告', actionDesc, 'HIGH');
      await window.syncGlobalGovernanceState();
      alert(trimmed ? '📢 全网商道公告已实时推送至各端顶栏，并记入天道明鉴审计！' : '✅ 已撤下全网公告。');
    });
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

  window.saveCovenantRevision = function () {
    const target = document.getElementById('covenant-editor-target')?.value;
    const content = document.getElementById('covenant-editor-textarea')?.value.trim();
    const btn = document.getElementById('btn-save-covenant');
    if (!content) return alert('公约内容不能为空！');

    const configKey = target === 'platform' ? 'covenant_platform_text' : 'covenant_store_text';
    const covenantTitle =
      target === 'platform'
        ? '《百工百业数字公器 · 平台入驻与商道公约》'
        : '《合作门店与社区邻里驿站公约》';

    requireCommanderAuth(`在线修订${covenantTitle}并全网公示`, async () => {
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

        await logGovernanceAudit(`在线修订${covenantTitle}`, `新颁条款摘要：${content.slice(0, 80)}...`, 'CRITICAL');
        await window.syncGlobalGovernanceState();
        document.getElementById('modal-covenant-editor')?.classList.add('hidden');
        alert(`✅ ${covenantTitle}已正式更新生效，并已写入天道明鉴防篡改审计流水！`);
      } catch (err) {
        alert('保存失败：' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = '🛡️ 核身颁布并记入审计链';
        }
      }
    });
  };
}
