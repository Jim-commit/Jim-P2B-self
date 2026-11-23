import { supabase } from '../lib/supabase.js';

export function mountPublicSupervisionWidget(sourceTag = '百业名录') {
  if (document.getElementById('modal-shared-public-supervision')) return;

  const modalHtml = `
    <div id="modal-shared-public-supervision" class="hidden fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-3">
      <div class="bg-white w-full max-w-sm rounded-3xl p-5 space-y-3 text-stone-800 shadow-2xl text-xs max-h-[90vh] overflow-y-auto no-scrollbar">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2">
          <div>
            <h3 class="font-bold text-sm text-emerald-950">💬 公众监督与商道建言堂</h3>
            <p class="text-[10px] text-stone-400">护私守密 · 温婉调处 · 事事有回音</p>
          </div>
          <button type="button" onclick="window.closeSharedPubSupModal()" class="text-stone-400 text-lg">✕</button>
        </div>

        <div class="grid grid-cols-3 gap-1 bg-stone-100 p-1 rounded-2xl font-bold text-center text-[11px]">
          <button type="button" id="spub-tab-submit" onclick="window.switchSharedPubSupTab('submit')" class="py-2 rounded-xl bg-[#1b4332] text-white transition">✍️ 监督 / 建言</button>
          <button type="button" id="spub-tab-query" onclick="window.switchSharedPubSupTab('query')" class="py-2 rounded-xl text-stone-600 transition">📬 查私人回音</button>
          <button type="button" id="spub-tab-public" onclick="window.switchSharedPubSupTab('public')" class="py-2 rounded-xl text-stone-600 transition">⚖️ 阳光公示栏</button>
        </div>

        <div id="spub-pane-submit" class="space-y-2.5">
          <div>
            <label class="block text-stone-600 font-bold mb-1">反馈类别（聚焦平台底线监督与规则共建）：</label>
            <select id="spub-type" onchange="window.onSharedPubSupTypeChange(this.value)" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold text-emerald-950 outline-none">
              <option value="底线违规监督">🛡️ 虚假宣传 / 超范围经营 / 冒名欺诈监督</option>
              <option value="平台规则建言">📜 平台公议规则与运维会费标准建言</option>
              <option value="功能体验建议">💡 平台功能优化与操作体验建议</option>
              <option value="custom">✏️ 其他事项（点击自由输入主题）</option>
            </select>
            <input type="text" id="spub-custom-type" placeholder="请输入您自定义的反馈主题..." class="hidden mt-2 w-full bg-amber-50/70 border border-amber-300 rounded-xl px-3 py-2 font-bold text-stone-800 outline-none">
          </div>

          <div>
            <label class="block text-stone-600 font-bold mb-1">涉及商号 / 合作社或专柜名称（平台建言可留空）：</label>
            <input type="text" id="spub-target" placeholder="如：XX合作社 或 XX工坊" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 outline-none">
          </div>

          <div>
            <label class="block text-stone-600 font-bold mb-1">具体事实说明或建言内容 *：</label>
            <textarea id="spub-content" rows="3" placeholder="请客观和气地描述发现的问题细节或您的宝贵建言..." class="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 outline-none"></textarea>
          </div>

          <div>
            <label class="block text-stone-600 font-bold mb-1">联系手机号或称呼（严格保密，仅用于查私人回音）：</label>
            <input type="text" id="spub-contact" placeholder="如：13800000000 或 王先生（留空则生成匿名回音码）" class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 outline-none">
          </div>

          <button type="button" id="btn-spub-submit" onclick="window.submitSharedPubSup()" class="w-full bg-[#1b4332] hover:bg-[#143628] text-white font-bold py-2.5 rounded-xl shadow active:scale-95 transition">
            📜 直呈平台监督与建言堂
          </button>

          <div id="spub-receipt-card" class="hidden bg-amber-50 border border-amber-300 p-3 rounded-2xl space-y-1.5 text-center">
            <div class="text-emerald-950 font-bold">✅ 已直呈平台治理中枢（身份信息严格保密）：</div>
            <div class="bg-white border border-amber-300 py-1.5 px-3 rounded-xl font-mono text-base font-bold text-stone-900 tracking-wider" id="spub-receipt-code">JY-0000</div>
            <p class="text-[10px] text-stone-600">凭此回音码或您留下的手机号，随时点上方「📬 查私人回音」查看答复。</p>
          </div>
        </div>

        <div id="spub-pane-query" class="hidden space-y-2.5">
          <div class="flex gap-2">
            <input type="text" id="spub-query-input" placeholder="输入回音码 (如 JY-0042) 或手机号" class="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono outline-none font-bold">
            <button type="button" onclick="window.querySharedPubSupReplies()" class="bg-[#1b4332] text-white font-bold px-3.5 py-2 rounded-xl">查回音</button>
          </div>
          <div id="spub-reply-list" class="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
            <div class="py-6 text-center text-stone-400">输入回音凭证码或手机号，查看平台核查回音</div>
          </div>
        </div>

        <div id="spub-pane-public" class="hidden space-y-2.5">
          <div class="bg-emerald-50 border border-emerald-200 p-2.5 rounded-2xl text-[10px] text-emerald-950 leading-relaxed">
            <b>⚖️ 对事不对人 · 脱敏公示：</b>本栏仅公开批准公示的典型建言采纳与温婉调处结论，严格隐藏个人隐私与商业机密。
          </div>
          <div id="spub-public-list" class="space-y-2 max-h-64 overflow-y-auto no-scrollbar"></div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  window.openSharedPubSupModal = function (tab = 'submit') {
    document.getElementById('modal-shared-public-supervision')?.classList.remove('hidden');
    window.switchSharedPubSupTab(tab);
  };

  window.closeSharedPubSupModal = function () {
    document.getElementById('modal-shared-public-supervision')?.classList.add('hidden');
  };

  window.onSharedPubSupTypeChange = function (val) {
    const el = document.getElementById('spub-custom-type');
    if (el) {
      el.classList.toggle('hidden', val !== 'custom');
      if (val === 'custom') el.focus();
    }
  };

  window.switchSharedPubSupTab = function (tab) {
    ['submit', 'query', 'public'].forEach((t) => {
      document.getElementById(`spub-pane-${t}`)?.classList.toggle('hidden', t !== tab);
      const btn = document.getElementById(`spub-tab-${t}`);
      if (btn) {
        btn.className = t === tab ? 'py-2 rounded-xl bg-[#1b4332] text-white transition' : 'py-2 rounded-xl text-stone-600 transition';
      }
    });
    if (tab === 'query') {
      const saved = localStorage.getItem('last_pub_sup_code') || '';
      const qInp = document.getElementById('spub-query-input');
      if (qInp && !qInp.value && saved) {
        qInp.value = saved;
        window.querySharedPubSupReplies();
      }
    } else if (tab === 'public') {
      window.loadSharedPubSupBulletins();
    }
  };

  window.submitSharedPubSup = async function () {
    const rawType = document.getElementById('spub-type')?.value || '底线违规监督';
    const customType = document.getElementById('spub-custom-type')?.value.trim();
    const target = document.getElementById('spub-target')?.value.trim();
    const content = document.getElementById('spub-content')?.value.trim();
    const contact = document.getElementById('spub-contact')?.value.trim();
    const btn = document.getElementById('btn-spub-submit');

    if (rawType === 'custom' && !customType) return alert('请输入自定义反馈主题！');
    if (!content) return alert('请填写具体监督或建言内容！');

    const finalType = rawType === 'custom' ? `自定义·${customType}` : rawType;
    const receiptCode = `JY-${String(Math.floor(1000 + Math.random() * 9000))}`;

    if (btn) { btn.disabled = true; btn.innerText = '正在呈交中...'; }
    try {
      const fullText = `[${receiptCode}]【${sourceTag}公众通道 · ${finalType}】${target ? `[涉及对象：${target}] ` : ''}${content}`;
      const { error } = await supabase.from('platform_suggestion_board').insert([{
        tenant_id: target || 'PUBLIC_WEB',
        proposer_type: 'public_consumer',
        proposer_name: contact || `访客匿名(${receiptCode})`,
        content: fullText,
        reply_status: 'pending'
      }]);
      if (error) throw error;

      localStorage.setItem('last_pub_sup_code', receiptCode);
      document.getElementById('spub-custom-type').value = '';
      document.getElementById('spub-target').value = '';
      document.getElementById('spub-content').value = '';
      document.getElementById('spub-receipt-code').innerText = receiptCode;
      document.getElementById('spub-receipt-card')?.classList.remove('hidden');
    } catch (err) {
      alert('提交失败：' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = '📜 直呈平台监督与建言堂'; }
    }
  };

  window.querySharedPubSupReplies = async function () {
    const kw = (document.getElementById('spub-query-input')?.value || '').trim().toUpperCase();
    const listEl = document.getElementById('spub-reply-list');
    if (!listEl || !kw) return alert('请输入回音码或手机号！');
    listEl.innerHTML = '<div class="py-4 text-center text-stone-400">查询中...</div>';

    const { data, error } = await supabase
      .from('platform_suggestion_board')
      .select('*')
      .eq('proposer_type', 'public_consumer')
      .order('id', { ascending: false })
      .limit(50);

    if (error) { listEl.innerHTML = `<div class="text-rose-600 text-center">${error.message}</div>`; return; }

    const matched = (data || []).filter(
      (r) => String(r.content || '').toUpperCase().includes(kw) || String(r.proposer_name || '').toUpperCase().includes(kw)
    );
    if (matched.length === 0) {
      listEl.innerHTML = '<div class="py-6 text-center text-stone-400">未找到匹配记录，请核对回音码或手机号。</div>';
      return;
    }
    listEl.innerHTML = matched.map((r) => {
      const rep = r.admin_reply || r.official_reply || '';
      const done = r.reply_status === 'replied' || !!rep;
      return `
        <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-1">
          <div class="flex justify-between text-[10px]">
            <span class="text-stone-400 font-mono">${r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
            <span class="font-bold ${done ? 'text-emerald-800' : 'text-amber-800'}">${done ? '✅ 已批复' : '⏳ 核查中'}</span>
          </div>
          <p class="text-[11px] text-stone-800">${r.content || ''}</p>
          ${rep ? `<div class="bg-emerald-50 border border-emerald-200 p-2 rounded-xl text-[11px] text-emerald-950"><b>🏛️ 官方回音：</b>${rep}</div>` : ''}
        </div>
      `;
    }).join('');
  };

  window.loadSharedPubSupBulletins = async function () {
    const listEl = document.getElementById('spub-public-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="py-4 text-center text-stone-400">加载公示中...</div>';

    const { data } = await supabase
      .from('platform_suggestion_board')
      .select('id, content, admin_reply, official_reply, created_at')
      .not('proposer_type', 'in', '("c2b_demand","mall_review")')
      .order('id', { ascending: false })
      .limit(60);

    const rows = (data || []).filter((r) => String(r.admin_reply || r.official_reply || '').includes('公开公示'));
    if (rows.length === 0) {
      listEl.innerHTML = '<div class="py-6 text-center text-stone-400">🌿 暂无新的公开公示事项。</div>';
      return;
    }
    listEl.innerHTML = rows.map((r) => {
      const cleanC = String(r.content || '').replace(/1[3-9]\d{9}/g, '***').replace(/\[JY-\d+\]/g, '');
      const cleanR = String(r.admin_reply || r.official_reply || '').replace(/【公开公示】|\[公开公示\]/g, '').replace(/1[3-9]\d{9}/g, '***').trim();
      return `
        <div class="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-1">
          <div class="text-[10px] text-stone-400 font-mono">公示 #${r.id}</div>
          <p class="text-[11px] text-stone-700"><b>事项：</b>${cleanC}</p>
          <div class="bg-emerald-50 border border-emerald-200 p-2 rounded-xl text-[11px] text-emerald-950"><b>🏛️ 温婉调处结论：</b>${cleanR}</div>
        </div>
      `;
    }).join('');
  };
}
