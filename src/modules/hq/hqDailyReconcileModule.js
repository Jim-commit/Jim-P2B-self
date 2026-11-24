import { supabase } from '../../lib/supabase.js';
import { speakChineseNotice } from '../../services/smartFieldAssistantService.js';
import { hqState, canViewReceivablesAndProfits } from './hqState.js';

export async function renderHqDailyReconcileAndDualQueue() {
  const host = document.getElementById('ai-advisor-cards');
  if (!host || !canViewReceivablesAndProfits()) return;

  // 拉取待双人复核队列
  const { data: dualRows } = await supabase
    .from('tenant_dual_approval_queue')
    .select('*')
    .eq('tenant_id', hqState.currentAgent)
    .eq('status', 'pending')
    .order('id', { ascending: false })
    .limit(10);

  const pendingDuals = dualRows || [];

  // 查找最近一条日结快照
  const latestSnapshotLog = (hqState.allInventoryLogs || []).find((l) =>
    String(l.action_title || '').startsWith('每日账目平衡快照')
  );

  let barBox = document.getElementById('hq-daily-reconcile-bar');
  if (!barBox) {
    barBox = document.createElement('div');
    barBox.id = 'hq-daily-reconcile-bar';
    barBox.className = 'col-span-full space-y-2';
    host.insertAdjacentElement('afterbegin', barBox);
  }

  const snapInfo = latestSnapshotLog?.action_details || null;
  const snapSummary = snapInfo
    ? `最近快照（${snapInfo.snapshot_date}）：应收 <b>¥${Number(snapInfo.total_receivable || 0).toFixed(2)}</b> · 在途回款 <b>¥${Number(snapInfo.pending_cash_in_transit || 0).toFixed(2)}</b> · 指纹 <code class="text-[10px] text-stone-500">${String(snapInfo.fingerprint || '').slice(0, 8)}</code>`
    : '今日尚未生成日结平衡快照，建议每日打烊前一键校验封存账目';

  const dualHtml =
    pendingDuals.length > 0
      ? `<div class="bg-indigo-50 border border-indigo-300 p-3 rounded-2xl space-y-2 text-xs">
           <b class="text-indigo-950 block">⚖️ 大额操作双人复核待签（共 ${pendingDuals.length} 笔）：</b>
           ${pendingDuals
             .map(
               (d) => `
               <div class="bg-white p-2.5 rounded-xl border border-indigo-200 flex flex-wrap justify-between items-center gap-2">
                 <div>
                   <b class="text-stone-900">${d.action_title}</b>
                   <span class="text-[11px] text-stone-500 block">发起人：${d.initiator_name} · 涉及金额：<b class="font-mono text-rose-700">¥${Number(d.amount || 0).toFixed(2)}</b></span>
                 </div>
                 <div class="flex gap-1.5">
                   <button type="button" onclick="window.resolveDualApprovalTask(${d.id}, 'approved')" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1 rounded-xl text-[11px]">✅ 复核通过</button>
                   <button type="button" onclick="window.resolveDualApprovalTask(${d.id}, 'rejected')" class="bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold px-2.5 py-1 rounded-xl text-[11px]">驳回</button>
                 </div>
               </div>
             `
             )
             .join('')}
         </div>`
      : '';

  barBox.innerHTML = `
    <div class="bg-emerald-50/80 border border-emerald-200 px-3.5 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
      <div class="flex items-center gap-2 text-emerald-950">
        <span>🟢</span>
        <span>${snapSummary}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button type="button" onclick="window.triggerDailyReconcileSnapshot()" class="bg-[#1b4332] hover:bg-[#143628] text-white font-bold px-3 py-1 rounded-xl text-[11px] shadow-2xs">
          🔒 一键生成今日日结快照
        </button>
      </div>
    </div>
    ${dualHtml}
  `;
}

export function initHqDailyReconcileBindings() {
  window.triggerDailyReconcileSnapshot = async function () {
    const { data, error } = await supabase.rpc('rpc_generate_daily_reconcile_snapshot', {
      p_tenant_id: hqState.currentAgent,
      p_operator_name: hqState.currentOperatorName
    });

    if (error) return alert('生成日结平衡快照失败：' + error.message);

    const msg =
      `今日（${data.snapshot_date}）日结平衡快照已封存！` +
      `全部合作门店累计应收 ${Number(data.total_receivable || 0).toFixed(2)} 元，` +
      `在途待核销回款 ${Number(data.pending_cash_in_transit || 0).toFixed(2)} 元，` +
      `今日已交割 ${data.today_delivered_orders} 单合计 ${Number(data.today_delivered_amount || 0).toFixed(2)} 元。`;

    speakChineseNotice(msg);
    alert(
      `✅ ${msg}\n\n` +
        `• 账目校验状态：${data.health_light === 'GREEN' ? '🟢 绿灯完全平衡' : '🟡 黄灯存在异常负欠款门店请核查'}\n` +
        `• 不可篡改防伪指纹：${data.fingerprint}`
    );
    if (typeof window.loadHQData === 'function') await window.loadHQData();
  };

  window.resolveDualApprovalTask = async function (taskId, decision) {
    const { data: task } = await supabase
      .from('tenant_dual_approval_queue')
      .select('*')
      .eq('id', taskId)
      .single();

    if (!task || task.status !== 'pending') return alert('该复核单已被处理！');
    if (task.initiator_name === hqState.currentOperatorName && hqState.currentRoleCode !== 'owner') {
      return alert('🚨 双人制衡拦截：发起人与复核人不能为同一人！');
    }

    const { error } = await supabase
      .from('tenant_dual_approval_queue')
      .update({
        status: decision,
        reviewer_name: hqState.currentOperatorName,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', taskId);

    if (error) return alert('复核操作失败：' + error.message);

    alert(decision === 'approved' ? '✅ 双人复核已签字通过！' : '🛑 已驳回该笔大额操作申请。');
    await renderHqDailyReconcileAndDualQueue();
  };
}
