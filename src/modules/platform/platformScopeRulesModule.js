import { supabase } from '../../lib/supabase.js';

export function initAdminScopeRulesBindings() {
  window.openAdminDynamicScopeModal = async function (tenantId) {
    if (!tenantId) return alert('请指定要配置的商号代号！');
    document.getElementById('modal-admin-dynamic-scope')?.remove();

    const { data: tenant, error } = await supabase
      .from('platform_tenant')
      .select('tenant_id, company_name, dynamic_scope_rules_json')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !tenant) return alert('读取商号合规边界配置失败：' + (error?.message || '未找到商号'));

    const rulesObj =
      tenant.dynamic_scope_rules_json && typeof tenant.dynamic_scope_rules_json === 'object'
        ? tenant.dynamic_scope_rules_json
        : {
            blockedKeywords: ['包治百病', '国家级', '绝对第一', '特效药'],
            allowedCategories: ['粮油副食', '生鲜果蔬', '手工特产', '日用百货', '五金农资'],
            requireOriginProof: true
          };

    const modal = document.createElement('div');
    modal.id = 'modal-admin-dynamic-scope';
    modal.className = 'fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white border border-stone-200 rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-2xl text-xs">
        <div class="flex justify-between items-center border-b border-stone-100 pb-2.5">
          <div>
            <b class="text-sm text-stone-900">⚖️ 动态行业合规边界规则库</b>
            <p class="text-[11px] text-stone-500 mt-0.5">当前配置主体：【${tenant.company_name || tenant.tenant_id}】</p>
          </div>
          <button type="button" onclick="document.getElementById('modal-admin-dynamic-scope')?.remove()" class="text-stone-400 hover:text-stone-800 text-base font-bold">✕</button>
        </div>

        <div>
          <label class="text-stone-700 font-bold block mb-1">准许经营大类白名单（每行一项）</label>
          <textarea id="admin-scope-cats" rows="3" class="w-full bg-stone-50 border border-stone-200 rounded-xl p-2 text-[11px]">${(rulesObj.allowedCategories || []).join('\n')}</textarea>
        </div>

        <div>
          <label class="text-stone-700 font-bold block mb-1">AI 巡检拦截违禁词库（每行一词，热更新即时生效）</label>
          <textarea id="admin-scope-keywords" rows="3" class="w-full bg-stone-50 border border-stone-200 rounded-xl p-2 text-[11px]">${(rulesObj.blockedKeywords || []).join('\n')}</textarea>
        </div>

        <label class="flex items-center gap-2 bg-emerald-50/70 border border-emerald-200 p-2.5 rounded-xl cursor-pointer">
          <input type="checkbox" id="admin-scope-origin-req" ${rulesObj.requireOriginProof !== false ? 'checked' : ''}>
          <span class="font-bold text-emerald-950">强制要求上架商品填写产地/工坊溯源信息</span>
        </label>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" onclick="document.getElementById('modal-admin-dynamic-scope')?.remove()" class="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 font-bold">取消</button>
          <button type="button" onclick="window.saveAdminDynamicScopeRules('${tenant.tenant_id}')" class="px-5 py-2 rounded-xl bg-[#1b4332] hover:bg-[#143628] text-white font-bold shadow">💾 保存并热更新规则</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.saveAdminDynamicScopeRules = async function (tenantId) {
    const allowedCategories = (document.getElementById('admin-scope-cats')?.value || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const blockedKeywords = (document.getElementById('admin-scope-keywords')?.value || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const requireOriginProof = !!document.getElementById('admin-scope-origin-req')?.checked;

    const payload = { allowedCategories, blockedKeywords, requireOriginProof };
    const { error } = await supabase
      .from('platform_tenant')
      .update({ dynamic_scope_rules_json: payload })
      .eq('tenant_id', tenantId);

    if (error) return alert('保存合规边界规则失败：' + error.message);

    document.getElementById('modal-admin-dynamic-scope')?.remove();
    alert('✅ 动态行业合规边界规则已保存，该商号上架自检已热更新！');
  };
}
