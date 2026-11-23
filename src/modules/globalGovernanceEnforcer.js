import { supabase } from '../lib/supabase.js';

export async function enforceGlobalGovernance() {
  try {
    const { data } = await supabase
      .from('platform_gov_configs')
      .select('config_key, config_value')
      .in('config_key', [
        'global_platform_notice',
        'global_emergency_freeze',
        'join_audit_strict_mode'
      ]);

    const cfg = {};
    (data || []).forEach((r) => {
      cfg[r.config_key] = r.config_value || '';
    });

    // 1. 全网置顶广播公告：只要总控签发公告，前台所有端面顶部自动出现醒目商道公告条
    if (cfg.global_platform_notice && cfg.global_platform_notice.trim() && !document.getElementById('global-hq-notice-bar')) {
      const noticeHtml = `
        <div id="global-hq-notice-bar" class="bg-amber-400 text-stone-950 text-xs font-bold px-4 py-2 text-center shadow-xs border-b border-amber-500">
          📢 【百工天街平台商道公告】${cfg.global_platform_notice.trim()}
        </div>
      `;
      document.body.insertAdjacentHTML('afterbegin', noticeHtml);
    }

    // 2. 全网紧急只读熔断：若总控启动熔断，入驻页与商品新建按钮自动锁定保护
    if (cfg.global_emergency_freeze === 'freeze') {
      const path = window.location.pathname || '';
      if (path.includes('join')) {
        document.querySelectorAll('form button[type="submit"]').forEach((btn) => {
          btn.disabled = true;
          btn.innerText = '🛑 平台当前处于应急保供维护期，暂缓新主体入驻';
          btn.className = 'w-full py-3 rounded-xl bg-stone-400 text-white font-bold cursor-not-allowed';
        });
      }
      if (!document.getElementById('global-freeze-banner')) {
        document.body.insertAdjacentHTML(
          'afterbegin',
          `<div id="global-freeze-banner" class="bg-rose-700 text-white text-xs font-bold px-4 py-2 text-center">
            🛑 平台当前处于【全网只读保供模式】：既有订单交割与对账照常运行，暂缓新入驻与新货品上架。
          </div>`
        );
      }
    }

    // 3. 入驻戒备态提示：若总控开启从严终审，入驻页自动提示需人工核验原件
    if (cfg.join_audit_strict_mode === 'strict' && (window.location.pathname || '').includes('join')) {
      const form = document.querySelector('form');
      if (form && !document.getElementById('join-strict-tip')) {
        form.insertAdjacentHTML(
          'afterbegin',
          `<div id="join-strict-tip" class="bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold p-3 rounded-2xl mb-3">
            🛡️ 当前处于【防抢注从严人工终审期】：请务必上传清晰完整的营业执照或实名证件原件，核验通过后方可立户。
          </div>`
        );
      }
    }
  } catch {
    // 弱网下不阻塞前台正常运行
  }
}
