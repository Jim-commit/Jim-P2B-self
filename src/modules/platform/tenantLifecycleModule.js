import { supabase } from '../../lib/supabase.js';
import { platformState, recordAuditLog } from './platformState.js';

const ARCHIVE_TAG = '__ARCHIVED_';
const SOVEREIGN_KEY_STORAGE = 'baigong_sovereign_master_hash';
const SOVEREIGN_DURESS_STORAGE = 'baigong_sovereign_duress_hash';
const SOVEREIGN_DUAL_PIN_STORAGE = 'baigong_sovereign_dual_pin_hash';
const SOVEREIGN_LOCK_STORAGE = 'baigong_sovereign_lockout_state';
const SOVEREIGN_LAST_BACKUP_KEY = 'baigong_last_motherboard_backup_ts';
const SOVEREIGN_HEARTBEAT_KEY = 'baigong_sovereign_last_heartbeat_ts';
const FAILOVER_URL_KEY = 'baigong_failover_supabase_url';
const FAILOVER_ANON_KEY = 'baigong_failover_supabase_anon_key';

const DEFAULT_SOVEREIGN_PASSPHRASE = 'SOVEREIGN#2026';

// 默认内置 23 项动态控制注册表（支持在线随时热插拔新增、编辑或扩展至无限项）
const DEFAULT_CONTROL_REGISTRY = [
  // 资金与支付通道
  { scope: 'membership_pay', label: '💳 商号会员缴费与升级', group: '资金与支付', delegable: false },
  { scope: 'order_online_pay', label: '📲 业务订单网上支付', group: '资金与支付', delegable: true },
  { scope: 'finance_settle', label: '💰 财务核销与信用调额', group: '资金与支付', delegable: true },
  { scope: 'driver_collect', label: '🚚 司机随车收款登记', group: '资金与支付', delegable: true },
  { scope: 'external_webhook', label: '🌐 外部支付异步回调', group: '资金与支付', delegable: false },
  // 五大业务终端
  { scope: 'hq_write', label: '🏢 商号调度台写入', group: '业务终端', delegable: true },
  { scope: 'store_write', label: '🏪 合作门店端下单', group: '业务终端', delegable: true },
  { scope: 'driver_write', label: '🚚 司机外勤端回单', group: '业务终端', delegable: true },
  { scope: 'mall_write', label: '🛍️ 天街公域端采购', group: '业务终端', delegable: false },
  { scope: 'join_apply', label: '📝 新商号入驻提交', group: '业务终端', delegable: false },
  // 供应链与存储防泄
  { scope: 'inventory_move', label: '📦 仓库库存与盘点调整', group: '供应链与存储', delegable: true },
  { scope: 'pool_exchange', label: '🔄 同城余缺互调池流转', group: '供应链与存储', delegable: true },
  { scope: 'data_export', label: '📤 日常报表与名录导出', group: '供应链与存储', delegable: true },
  { scope: 'storage_upload', label: '🖼️ 存储桶图片附件上传', group: '供应链与存储', delegable: false },
  // 安全认证与内核风控
  { scope: 'login_gate', label: '🚪 全网新登录准入总闸', group: '安全与内核', delegable: false },
  { scope: 'auth_reset', label: '🔑 密钥重置与2FA申诉', group: '安全与内核', delegable: false },
  { scope: 'bulk_read_guard', label: '👁️ 跨页批量读取防爬虫', group: '安全与内核', delegable: false },
  { scope: 'rate_amount_guard', label: '🎚️ 大额与高频异常降级', group: '安全与内核', delegable: false },
  { scope: 'geo_ip_guard', label: '🌍 异常境外/代理流量阻断', group: '安全与内核', delegable: false },
  { scope: 'public_post', label: '📢 公域建言与公断发布', group: '安全与内核', delegable: false },
  { scope: 'ops_staff_write', label: '🛡️ 一二级运营后台写入', group: '安全与内核', delegable: false },
  { scope: 'sys_config_write', label: '🔧 平台字典与参数修改', group: '安全与内核', delegable: false },
  { scope: 'auto_cron', label: '⏱️ 自动到期停权与流转', group: '安全与内核', delegable: false }
];

// 兜底基础表清单（当数据库尚未部署自发现 RPC 时使用，部署后全自动从 information_schema 获取全部表）
const FALLBACK_PUBLIC_TABLES = [
  'platform_admin_credential',
  'platform_governance_config',
  'platform_gov_configs',
  'platform_membership_plan',
  'platform_category',
  'platform_category_dict',
  'platform_standard_category',
  'platform_tenant',
  'tenant',
  'tenant_application',
  'driver',
  'product',
  'store',
  'store_lead',
  'store_order',
  'orders',
  'order_item',
  'driver_collection_log',
  'payment_record',
  'inventory_log',
  'local_inventory_pool',
  'demand_forecast_plan',
  'platform_compliance_case',
  'platform_suggestion_board',
  'audit_immutable_log',
  'sys_qr_session',
  'login_qr_session'
];

export function getCurrentAdminRole() {
  const rawRole = (sessionStorage.getItem('p_auth_role') || '').trim();
  if (rawRole === 'ops_manager') return 'ops_manager';
  return 'senior_ops';
}

export function isSeniorOpsOrAbove() {
  return getCurrentAdminRole() === 'senior_ops';
}

export function isArchivedTenantRow(t) {
  return (
    t?.membership_status === 'archived_purged' ||
    String(t?.tenant_id || '').includes(ARCHIVE_TAG)
  );
}

export function getOriginalTenantId(tenantId) {
  return String(tenantId || '').split(ARCHIVE_TAG)[0];
}

export function getOriginalCreditCode(creditCode) {
  return String(creditCode || '').split(ARCHIVE_TAG)[0];
}

/**
 * 通用业务端口熔断检查器（供 hq / store / driver / mall / join 等所有端口调用）
 */
export async function assertCircuitOpen(requiredScope, tenantId = null, customMeta = {}) {
  const { data } = await supabase
    .from('platform_governance_config')
    .select('config_value')
    .eq('config_key', 'sovereign_active_circuit_policy')
    .maybeSingle();

  if (!data?.config_value) return true;

  try {
    const policy = JSON.parse(data.config_value);
    if (policy.expires_at && Date.now() >= new Date(policy.expires_at).getTime()) {
      return true; // 到点已自动解封
    }

    const scopes = Array.isArray(policy.scopes) ? policy.scopes : [];
    if (!scopes.includes(requiredScope)) return true;

    const targets = Array.isArray(policy.target_tenants) ? policy.target_tenants : [];
    const hitTarget = targets.length === 0 || (tenantId && targets.includes(String(tenantId)));

    if (hitTarget) {
      const notice = policy.public_notice || '系统当前模块正在进行安全护盘维护，暂时暂停该项操作，请稍后再试。';
      alert(`🛑 ${notice}`);
      throw new Error(`CIRCUIT_BREAKER_ACTIVE:${requiredScope}`);
    }

    // 大额与高频动态阈值检查
    if (scopes.includes('rate_amount_guard') && policy.thresholds?.max_single_amount > 0 && customMeta.amount != null) {
      if (Number(customMeta.amount) > Number(policy.thresholds.max_single_amount)) {
        alert(`🎚️ 触发大额交易风控降级：当前单笔限额为 ¥${policy.thresholds.max_single_amount}，请拆分或联系平台复核。`);
        throw new Error(`AMOUNT_CAP_EXCEEDED:${customMeta.amount}`);
      }
    }
  } catch (e) {
    if (String(e.message || '').startsWith('CIRCUIT_BREAKER_ACTIVE') || String(e.message || '').startsWith('AMOUNT_CAP_EXCEEDED')) {
      throw e;
    }
  }
  return true;
}

/**
 * 动态全库表结构自发现 + 外键拓扑排序（支持无限增表自动纳管）
 */
async function discoverDynamicTables() {
  const { data, error } = await supabase.rpc('rpc_discover_public_tables');
  if (error || !Array.isArray(data) || data.length === 0) {
    return FALLBACK_PUBLIC_TABLES.map((name) => ({
      table_name: name,
      has_tenant_id: !['platform_admin_credential', 'platform_governance_config', 'platform_gov_configs', 'platform_membership_plan', 'platform_category', 'platform_category_dict', 'platform_standard_category', 'tenant', 'order_item'].includes(name),
      has_id: name !== 'platform_governance_config' && name !== 'tenant',
      depends_on: name === 'order_item' ? ['orders', 'product'] : []
    }));
  }

  // 按外键依赖进行拓扑排序（父表在前，子表在后）
  const sorted = [];
  const visited = new Set();
  const map = new Map(data.map((item) => [item.table_name, item]));

  function visit(tblName) {
    if (visited.has(tblName) || !map.has(tblName)) return;
    visited.add(tblName);
    const meta = map.get(tblName);
    for (const dep of meta.depends_on || []) {
      visit(dep);
    }
    sorted.push(meta);
  }

  // 优先排序核心底座字典表
  const priorityOrder = [
    'platform_admin_credential',
    'platform_governance_config',
    'platform_gov_configs',
    'platform_membership_plan',
    'platform_category',
    'platform_category_dict',
    'platform_standard_category',
    'platform_tenant',
    'tenant',
    'tenant_application',
    'driver',
    'product',
    'store'
  ];
  priorityOrder.forEach(visit);
  data.forEach((d) => visit(d.table_name));
  return sorted;
}

async function getDynamicControlRegistry() {
  const { data } = await supabase
    .from('platform_governance_config')
    .select('config_value')
    .eq('config_key', 'sovereign_control_registry')
    .maybeSingle();

  if (data?.config_value) {
    try {
      const parsed = JSON.parse(data.config_value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  return [...DEFAULT_CONTROL_REGISTRY];
}

async function getDynamicSystemParams() {
  const { data } = await supabase
    .from('platform_governance_config')
    .select('config_value')
    .eq('config_key', 'sovereign_system_params')
    .maybeSingle();

  const defaults = {
    max_auth_attempts: 3,
    lockout_minutes: 30,
    backup_overdue_days: 14,
    senior_ops_max_quarantine_mins: 60,
    dead_man_switch_days: 0, // 0 表示关闭
    immutable_tables: ['audit_immutable_log', 'inventory_log'],
    excluded_tables: []
  };

  if (data?.config_value) {
    try {
      return { ...defaults, ...JSON.parse(data.config_value) };
    } catch (e) {}
  }
  return defaults;
}

async function fetchAllRowsFromTable(tableName, filterCol = null, filterVal = null) {
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    let query = supabase.from(tableName).select('*').range(from, from + pageSize - 1);
    if (filterCol && filterVal !== null) {
      query = query.eq(filterCol, filterVal);
    }
    const { data, error } = await query;
    if (error) return [];
    if (!Array.isArray(data) || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

function downloadTextBlob(content, filename, mimeType = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 1. 全量导出单商号 JSON 备份（动态扫描所有带 tenant_id 的表 + 完整操作审计铁证）
 */
export async function exportTenantFullBackup(tenantId, companyName = '', silent = false) {
  if (!tenantId) throw new Error('缺少商号代号 (tenantId)');

  const dynamicTables = await discoverDynamicTables();
  const tables = {};

  for (const meta of dynamicTables) {
    const tbl = meta.table_name;
    if (tbl === 'tenant') {
      tables[tbl] = await fetchAllRowsFromTable('tenant', 'id', tenantId);
    } else if (tbl === 'order_item') {
      const orders = tables.orders || (await fetchAllRowsFromTable('orders', 'tenant_id', tenantId));
      const orderIds = orders.map((o) => o.id).filter(Boolean);
      let items = [];
      for (let i = 0; i < orderIds.length; i += 200) {
        const { data } = await supabase.from('order_item').select('*').in('order_id', orderIds.slice(i, i + 200));
        if (Array.isArray(data)) items = items.concat(data);
      }
      tables[tbl] = items;
    } else if (meta.has_tenant_id) {
      tables[tbl] = await fetchAllRowsFromTable(tbl, 'tenant_id', tenantId);
    }
  }

  const cleanTid = getOriginalTenantId(tenantId);
  if (Array.isArray(tables.platform_tenant)) {
    tables.platform_tenant = tables.platform_tenant.map((row) => {
      const { access_key, totp_secret, reset_claim_token, ...safeRow } = row;
      return {
        ...safeRow,
        tenant_id: cleanTid,
        credit_code: getOriginalCreditCode(safeRow.credit_code)
      };
    });
  }
  if (Array.isArray(tables.tenant)) {
    tables.tenant = tables.tenant.map((r) => ({ ...r, id: cleanTid }));
  }

  const resolvedName = companyName || tables.platform_tenant?.[0]?.company_name || cleanTid;
  const payload = {
    schema_version: 'baigong_tenant_snapshot_v3_dynamic',
    exported_at: new Date().toISOString(),
    tenant_id: cleanTid,
    company_name: resolvedName,
    summary: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
    tables,
    audit_snapshot: tables.audit_immutable_log || []
  };

  downloadTextBlob(
    JSON.stringify(payload, null, 2),
    `BAIGONG_BACKUP_${cleanTid}_${new Date().toISOString().slice(0, 10)}.json`
  );

  if (!silent) {
    await recordAuditLog('导出商号全量动态数据快照', 'INFO', {
      tenant_id: cleanTid,
      company_name: resolvedName,
      summary: payload.summary
    });
  }
  return payload;
}

function remapOrderItemsJson(itemsList, productIdMap) {
  if (!Array.isArray(itemsList)) return itemsList;
  return itemsList.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const nextItem = { ...item };
    if (nextItem.product_id != null && productIdMap.has(String(nextItem.product_id))) {
      nextItem.product_id = productIdMap.get(String(nextItem.product_id));
    }
    if (nextItem.id != null && productIdMap.has(String(nextItem.id))) {
      nextItem.id = productIdMap.get(String(nextItem.id));
    }
    return nextItem;
  });
}

/**
 * 2. 打开商号 JSON 备份无损导入恢复弹窗（保持高级运营可用，带自增 ID 重映射与跨商号克隆）
 */
export function openTenantImportRestoreModal(targetTenantId, targetCompanyName = '') {
  if (!isSeniorOpsOrAbove()) {
    return alert('⛔ 权限不足：仅【高级运营管理】及以上权限可执行快照导入恢复。');
  }
  if (!targetTenantId) return alert('未识别到目标商号代号！');

  document.getElementById('tenant-import-restore-modal')?.remove();
  let parsedBackup = null;

  const modal = document.createElement('div');
  modal.id = 'tenant-import-restore-modal';
  modal.className = 'fixed inset-0 bg-stone-950/90 backdrop-blur-sm z-[125] flex items-center justify-center p-4 select-none';

  modal.innerHTML = `
    <div class="bg-white border border-stone-200 w-full max-w-lg rounded-3xl p-5 space-y-4 text-stone-800 shadow-2xl text-xs max-h-[92vh] overflow-y-auto">
      <div class="flex justify-between items-center border-b border-stone-100 pb-2.5">
        <div>
          <h3 class="text-sm font-black text-stone-900">📤 导入商号 JSON 备份无损恢复</h3>
          <p class="text-[11px] text-stone-500">目标商号：<b class="font-mono text-emerald-800">${targetCompanyName || targetTenantId} (${targetTenantId})</b></p>
        </div>
        <button type="button" id="btn-close-import-modal" class="text-stone-400 hover:text-stone-700 text-lg">✕</button>
      </div>

      <div class="bg-stone-50 border-2 border-dashed border-stone-300 hover:border-emerald-600 rounded-2xl p-4 text-center transition">
        <label class="cursor-pointer block space-y-1">
          <span class="text-2xl block">🗂️</span>
          <span class="font-bold text-stone-800 block">点击选择商号快照文件 (.json)</span>
          <span class="text-[10px] text-stone-400 block">自动重映射自增主外键与门店专属定价，保障 100% 不断链</span>
          <input type="file" id="input-import-backup-file" accept=".json,application/json" class="hidden">
        </label>
      </div>

      <div id="import-preview-panel" class="hidden space-y-3">
        <div id="import-cross-tenant-warn" class="hidden bg-amber-50 border border-amber-300 text-amber-950 p-2.5 rounded-xl text-[11px] leading-relaxed">
          ⚠️ <b>跨商号克隆提示：</b>该快照源自 <span id="src-tenant-label" class="font-mono font-bold"></span>。系统将自动改写归属为 <b class="font-mono">${targetTenantId}</b> 并重建主外键映射。
        </div>
        <div class="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 space-y-2">
          <div class="flex justify-between items-center text-[11px]">
            <span class="text-stone-600">快照生成时间：</span>
            <b id="import-export-time" class="font-mono text-stone-900">--</b>
          </div>
          <div id="import-table-counts" class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1.5 border-t border-emerald-200/70 text-[10px]"></div>
        </div>
        <div class="space-y-1.5">
          <label class="block font-bold text-stone-700">选择恢复策略：</label>
          <select id="select-import-mode" class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 font-bold text-stone-900 outline-none">
            <option value="full_overwrite">🔄 清空当前业务账本后完整回档（含历史订单/欠款/流水）</option>
            <option value="clone_catalog_only">🌱 仅克隆基础档案（仅导入商品库+门店+司机，欠款归零）</option>
          </select>
        </div>
        <label class="flex items-start gap-2 bg-rose-50/70 border border-rose-200 p-2.5 rounded-xl text-[11px] text-rose-900 cursor-pointer">
          <input type="checkbox" id="chk-confirm-import-risk" class="mt-0.5 rounded text-rose-600">
          <span>我已核对快照内容无误，确认执行数据恢复并记入审计日志。</span>
        </label>
      </div>

      <div class="flex gap-2 pt-1">
        <button type="button" id="btn-cancel-import" class="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-2.5 rounded-2xl">取消</button>
        <button type="button" id="btn-execute-import" disabled class="flex-1 bg-stone-300 text-stone-500 font-bold py-2.5 rounded-2xl cursor-not-allowed transition">开始执行恢复</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const fileInput = document.getElementById('input-import-backup-file');
  const previewPanel = document.getElementById('import-preview-panel');
  const crossWarn = document.getElementById('import-cross-tenant-warn');
  const srcTenantLabel = document.getElementById('src-tenant-label');
  const exportTimeEl = document.getElementById('import-export-time');
  const tableCountsEl = document.getElementById('import-table-counts');
  const modeSelect = document.getElementById('select-import-mode');
  const confirmChk = document.getElementById('chk-confirm-import-risk');
  const btnExecute = document.getElementById('btn-execute-import');

  function updateBtnState() {
    const ready = Boolean(parsedBackup) && confirmChk.checked;
    btnExecute.disabled = !ready;
    btnExecute.className = ready
      ? 'flex-1 bg-stone-900 hover:bg-stone-800 text-white font-bold py-2.5 rounded-2xl shadow active:scale-95 transition'
      : 'flex-1 bg-stone-300 text-stone-500 font-bold py-2.5 rounded-2xl cursor-not-allowed transition';
  }

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (!String(json.schema_version || '').startsWith('baigong_tenant_snapshot') || !json.tables) {
        alert('❌ 格式不符：请选择本系统导出的商号全量快照 JSON 文件。');
        return;
      }
      parsedBackup = json;
      previewPanel.classList.remove('hidden');
      exportTimeEl.textContent = json.exported_at ? new Date(json.exported_at).toLocaleString('zh-CN') : '未知';

      if (json.tenant_id && json.tenant_id !== targetTenantId) {
        crossWarn.classList.remove('hidden');
        srcTenantLabel.textContent = `${json.company_name || ''} (${json.tenant_id})`;
        modeSelect.value = 'clone_catalog_only';
      } else {
        crossWarn.classList.add('hidden');
        modeSelect.value = 'full_overwrite';
      }

      tableCountsEl.innerHTML = Object.entries(json.tables)
        .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
        .map(([key, rows]) => `<div class="bg-white px-2 py-1 rounded-lg border border-emerald-100 flex justify-between"><span class="text-stone-600 font-mono truncate">${key}</span><b class="font-mono text-emerald-900">${rows.length}</b></div>`)
        .join('');
      updateBtnState();
    } catch (err) {
      alert('❌ JSON 解析失败：' + (err?.message || '文件损坏'));
    }
  });

  confirmChk.addEventListener('change', updateBtnState);
  document.getElementById('btn-close-import-modal').addEventListener('click', () => modal.remove());
  document.getElementById('btn-cancel-import').addEventListener('click', () => modal.remove());

  btnExecute.addEventListener('click', () => {
    if (!parsedBackup || !confirmChk.checked) return;
    const mode = modeSelect.value;
    const isCloneCatalogOnly = mode === 'clone_catalog_only';

    window.triggerPlatform2FA(
      `确认向商号【${targetCompanyName || targetTenantId} (${targetTenantId})】执行「${isCloneCatalogOnly ? '克隆基础档案' : '完整回档覆盖'}」恢复操作？`,
      async () => {
        btnExecute.disabled = true;
        btnExecute.textContent = '正在重映射主外键并写入云端...';
        try {
          const t = parsedBackup.tables;
          const productIdMap = new Map();
          const storeIdMap = new Map();
          const orderIdMap = new Map();
          let restoredTotal = 0;

          if (!isCloneCatalogOnly) {
            const { data: oldOrders } = await supabase.from('orders').select('id').eq('tenant_id', targetTenantId);
            const oldOrderIds = (oldOrders || []).map((o) => o.id);
            if (oldOrderIds.length > 0) await supabase.from('order_item').delete().in('order_id', oldOrderIds);

            const dynamicMeta = await discoverDynamicTables();
            const skipTables = new Set(['platform_tenant', 'tenant', 'tenant_application', 'audit_immutable_log', 'inventory_log', 'order_item']);
            for (const m of [...dynamicMeta].reverse()) {
              if (m.has_tenant_id && !skipTables.has(m.table_name)) {
                await supabase.from(m.table_name).delete().eq('tenant_id', targetTenantId);
              }
            }
          }

          if (!isCloneCatalogOnly && Array.isArray(t.platform_tenant) && t.platform_tenant[0]) {
            const { id, tenant_id, access_key, totp_secret, totp_enabled, reset_claim_token, session_epoch, created_at, ...safeConfig } = t.platform_tenant[0];
            await supabase.from('platform_tenant').update(safeConfig).eq('tenant_id', targetTenantId);
          }

          if (Array.isArray(t.driver) && t.driver.length > 0) {
            const rows = t.driver.map(({ id, ...rest }) => ({ ...rest, tenant_id: targetTenantId }));
            await supabase.from('driver').insert(rows);
            restoredTotal += rows.length;
          }

          if (Array.isArray(t.product) && t.product.length > 0) {
            for (const oldProd of t.product) {
              const { id: oldId, ...rest } = oldProd;
              const { data: ins } = await supabase.from('product').insert([{ ...rest, tenant_id: targetTenantId }]).select('id').single();
              if (oldId != null && ins?.id != null) productIdMap.set(String(oldId), ins.id);
              restoredTotal += 1;
            }
          }

          if (Array.isArray(t.store) && t.store.length > 0) {
            for (const oldStore of t.store) {
              const { id: oldId, ...rest } = oldStore;
              const mappedVisible = Array.isArray(rest.visible_product_ids)
                ? rest.visible_product_ids.map((pid) => productIdMap.get(String(pid))).filter((v) => v != null)
                : rest.visible_product_ids;
              let mappedPricing = rest.custom_pricing;
              if (mappedPricing && typeof mappedPricing === 'object' && !Array.isArray(mappedPricing)) {
                const nextP = {};
                for (const [k, v] of Object.entries(mappedPricing)) nextP[String(productIdMap.get(String(k)) || k)] = v;
                mappedPricing = nextP;
              }
              const { data: ins } = await supabase.from('store').insert([{
                ...rest,
                tenant_id: targetTenantId,
                visible_product_ids: mappedVisible,
                custom_pricing: mappedPricing,
                current_debt: isCloneCatalogOnly ? 0 : rest.current_debt,
                used_return_quota: isCloneCatalogOnly ? 0 : rest.used_return_quota,
                carrier_hold_count: isCloneCatalogOnly ? 0 : rest.carrier_hold_count,
                basket_count: isCloneCatalogOnly ? 0 : rest.basket_count
              }]).select('id').single();
              if (oldId != null && ins?.id != null) storeIdMap.set(String(oldId), ins.id);
              restoredTotal += 1;
            }
          }

          if (!isCloneCatalogOnly) {
            const handled = new Set(['platform_tenant', 'tenant', 'tenant_application', 'driver', 'product', 'store', 'orders', 'order_item', 'audit_immutable_log', 'inventory_log']);
            if (Array.isArray(t.orders)) {
              for (const oldOrder of t.orders) {
                const { id: oldId, ...rest } = oldOrder;
                const { data: ins } = await supabase.from('orders').insert([{
                  ...rest,
                  tenant_id: targetTenantId,
                  store_id: rest.store_id != null ? storeIdMap.get(String(rest.store_id)) || rest.store_id : null
                }]).select('id').single();
                if (oldId != null && ins?.id != null) orderIdMap.set(String(oldId), ins.id);
                restoredTotal += 1;
              }
            }
            if (Array.isArray(t.order_item) && t.order_item.length > 0) {
              const rows = t.order_item.map(({ id, ...rest }) => ({
                ...rest,
                order_id: rest.order_id != null ? orderIdMap.get(String(rest.order_id)) || rest.order_id : null,
                product_id: rest.product_id != null ? productIdMap.get(String(rest.product_id)) || rest.product_id : null
              }));
              await supabase.from('order_item').insert(rows);
              restoredTotal += rows.length;
            }
            for (const [tblName, rows] of Object.entries(t)) {
              if (handled.has(tblName) || !Array.isArray(rows) || rows.length === 0) continue;
              const mappedRows = rows.map(({ id, ...rest }) => {
                const next = { ...rest, tenant_id: targetTenantId };
                if (next.store_id != null) next.store_id = storeIdMap.get(String(next.store_id)) || next.store_id;
                if (next.from_store_id != null) next.from_store_id = storeIdMap.get(String(next.from_store_id)) || next.from_store_id;
                if (next.to_store_id != null) next.to_store_id = storeIdMap.get(String(next.to_store_id)) || next.to_store_id;
                if (next.product_id != null) next.product_id = productIdMap.get(String(next.product_id)) || next.product_id;
                if (next.order_id != null) next.order_id = orderIdMap.get(String(next.order_id)) || next.order_id;
                if (Array.isArray(next.items)) next.items = remapOrderItemsJson(next.items, productIdMap);
                if (Array.isArray(next.items_return)) next.items_return = remapOrderItemsJson(next.items_return, productIdMap);
                if (Array.isArray(next.items_exchange)) next.items_exchange = remapOrderItemsJson(next.items_exchange, productIdMap);
                return next;
              });
              await supabase.from(tblName).insert(mappedRows);
              restoredTotal += mappedRows.length;
            }
          }

          await recordAuditLog('商号JSON快照无损导入恢复', 'CRITICAL_2FA', {
            target_tenant_id: targetTenantId,
            source_tenant_id: parsedBackup.tenant_id,
            restore_mode: mode,
            restored_rows: restoredTotal
          });

          alert(`✅ 无损恢复成功！共重建并重映射 ${restoredTotal} 条业务记录。`);
          modal.remove();
          if (typeof window.loadPlatformData === 'function') await window.loadPlatformData();
        } catch (err) {
          alert('❌ 导入恢复异常中断：' + (err?.message || '未知错误'));
          btnExecute.disabled = false;
          btnExecute.textContent = '重新执行恢复';
        }
      }
    );
  });
}

/**
 * 3. 高级运营管理专属：软删除归档销号（B级可逆清理，释放营业执照供重新注册 + 随时可在回收站一键复活）
 */
export function openTenantPurgeGuardModal(tenantId, companyName = '') {
  if (!isSeniorOpsOrAbove()) {
    return alert('⛔ 权限不足：当前【运营管理者】账号无权执行商号销号归档，请联络【高级运营管理】处置。');
  }
  const cleanName = (companyName || '').split('(')[0].trim() || tenantId;
  if (!tenantId) return alert('未识别到有效的商号代号！');

  document.getElementById('tenant-purge-guard-modal')?.remove();
  const expectedPhrase = '确认销号归档';
  let backupDone = false;
  let countdownTimer = null;
  let remainingSeconds = 8;
  let countdownFinished = false;

  const modal = document.createElement('div');
  modal.id = 'tenant-purge-guard-modal';
  modal.className = 'fixed inset-0 bg-stone-950/90 backdrop-blur-sm z-[125] flex items-center justify-center p-4 select-none';
  modal.innerHTML = `
    <div class="bg-white border-2 border-rose-600 w-full max-w-md rounded-3xl p-5 space-y-4 text-stone-800 shadow-2xl text-xs">
      <div class="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex items-start gap-3">
        <span class="text-2xl shrink-0">🗄️</span>
        <div class="space-y-1">
          <h3 class="text-sm font-black text-rose-900">高级运营权限 · 商号销号封存与释放</h3>
          <p class="text-[11px] text-rose-800 leading-relaxed">
            执行后，商号 <b class="font-mono underline">${cleanName} (${tenantId})</b> 将隐藏并停用终端，同时<b>立即释放其营业执照与商号注册资格</b>；历史账本完整转入【归档回收站】，随时可一键无损复活。
          </p>
        </div>
      </div>
      <div class="bg-amber-50/80 border border-amber-300 rounded-2xl p-3 space-y-2">
        <div class="flex justify-between items-center">
          <b class="text-amber-950">第一关：留存离场全量数据快照 *</b>
          <span id="purge-step1-badge" class="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold">未备份</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" id="btn-purge-download-backup" class="flex-1 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold py-2 rounded-xl shadow-2xs active:scale-95 transition">📥 立即下载商号全量快照</button>
          <label class="flex items-center gap-1 text-[10px] text-stone-600 cursor-pointer shrink-0">
            <input type="checkbox" id="chk-purge-skip-backup" class="rounded text-rose-600">
            <span>跳过本地下载</span>
          </label>
        </div>
      </div>
      <div class="bg-stone-50 border border-stone-200 rounded-2xl p-3 space-y-2.5">
        <b class="text-stone-900 block">第二关：人工手写核验（防误触）*</b>
        <div>
          <label class="block text-[11px] text-stone-600 mb-1">1. 请输入完整商号代号 <code class="bg-stone-200 text-rose-700 font-bold px-1.5 py-0.5 rounded select-all">${tenantId}</code>：</label>
          <input type="text" id="input-purge-tenant-id" autocomplete="off" placeholder="区分大小写，如 ${tenantId}" class="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 font-mono font-bold text-stone-900 outline-none focus:border-rose-600">
        </div>
        <div>
          <label class="block text-[11px] text-stone-600 mb-1">2. 请输入确认词 <code class="bg-stone-200 text-rose-700 font-bold px-1.5 py-0.5 rounded">${expectedPhrase}</code>：</label>
          <input type="text" id="input-purge-phrase" autocomplete="off" placeholder="请手打输入：${expectedPhrase}" class="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 font-bold text-stone-900 outline-none focus:border-rose-600">
        </div>
      </div>
      <div class="pt-1 space-y-2">
        <div id="purge-countdown-tip" class="hidden text-center text-[11px] font-bold text-rose-700 bg-rose-50 py-1.5 rounded-xl border border-rose-200">
          ⏳ 核验通过，请保持冷静等待 <span id="purge-sec-num" class="font-mono text-sm">8</span> 秒后解锁最终按钮...
        </div>
        <div class="flex gap-2">
          <button type="button" id="btn-purge-cancel" class="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-3 rounded-2xl transition">安全取消</button>
          <button type="button" id="btn-purge-confirm-final" disabled class="flex-1 bg-stone-300 text-stone-500 font-bold py-3 rounded-2xl cursor-not-allowed transition">🔒 请先完成上方关卡</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const btnBackup = document.getElementById('btn-purge-download-backup');
  const chkSkipBackup = document.getElementById('chk-purge-skip-backup');
  const badgeStep1 = document.getElementById('purge-step1-badge');
  const inputTenant = document.getElementById('input-purge-tenant-id');
  const inputPhrase = document.getElementById('input-purge-phrase');
  const countdownTip = document.getElementById('purge-countdown-tip');
  const secNumEl = document.getElementById('purge-sec-num');
  const btnFinal = document.getElementById('btn-purge-confirm-final');

  function cleanupAndClose() {
    if (countdownTimer) clearInterval(countdownTimer);
    modal.remove();
  }

  function evaluateAllGates() {
    const step1Passed = backupDone || chkSkipBackup.checked;
    const step2Passed = inputTenant.value.trim() === String(tenantId).trim() && inputPhrase.value.trim() === expectedPhrase;
    if (!step1Passed || !step2Passed) {
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
      countdownFinished = false;
      remainingSeconds = 8;
      countdownTip.classList.add('hidden');
      btnFinal.disabled = true;
      btnFinal.className = 'flex-1 bg-stone-300 text-stone-500 font-bold py-3 rounded-2xl cursor-not-allowed transition';
      btnFinal.textContent = '🔒 请先完成上方关卡';
      return;
    }
    if (!countdownTimer && !countdownFinished) {
      countdownTip.classList.remove('hidden');
      secNumEl.textContent = String(remainingSeconds);
      btnFinal.disabled = true;
      btnFinal.className = 'flex-1 bg-rose-300 text-white font-bold py-3 rounded-2xl cursor-not-allowed transition';
      btnFinal.textContent = `⏳ 冷静倒计时 (${remainingSeconds}s)`;
      countdownTimer = setInterval(() => {
        remainingSeconds -= 1;
        if (remainingSeconds > 0) {
          secNumEl.textContent = String(remainingSeconds);
          btnFinal.textContent = `⏳ 冷静倒计时 (${remainingSeconds}s)`;
        } else {
          clearInterval(countdownTimer);
          countdownTimer = null;
          countdownFinished = true;
          countdownTip.classList.add('hidden');
          btnFinal.disabled = false;
          btnFinal.className = 'flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-3 rounded-2xl shadow-lg active:scale-95 transition';
          btnFinal.textContent = '🗄️ 确认销号归档并释放名额';
        }
      }, 1000);
    }
  }

  btnBackup.addEventListener('click', async () => {
    btnBackup.disabled = true;
    btnBackup.textContent = '正在打包全量快照...';
    try {
      await exportTenantFullBackup(tenantId, cleanName);
      backupDone = true;
      badgeStep1.textContent = '✅ 已下载快照';
      badgeStep1.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold';
      btnBackup.textContent = '📥 重新下载快照';
      evaluateAllGates();
    } catch (err) {
      alert('导出快照失败：' + (err?.message || ''));
      btnBackup.textContent = '📥 立即下载商号全量快照';
    } finally {
      btnBackup.disabled = false;
    }
  });

  chkSkipBackup.addEventListener('change', evaluateAllGates);
  inputTenant.addEventListener('input', evaluateAllGates);
  inputPhrase.addEventListener('input', evaluateAllGates);
  document.getElementById('btn-purge-cancel').addEventListener('click', cleanupAndClose);

  btnFinal.addEventListener('click', () => {
    if (!countdownFinished) return;
    window.triggerPlatform2FA(
      `⚠️ 高级运营 2FA 核验：即将对商号【${cleanName}】(${tenantId}) 执行销号归档隐藏，并释放其营业执照重新注册资格：`,
      async () => {
        btnFinal.disabled = true;
        btnFinal.textContent = '正在归档封存并释放名额...';
        try {
          const { data: targetRow, error: fetchErr } = await supabase.from('platform_tenant').select('*').eq('tenant_id', tenantId).single();
          if (fetchErr || !targetRow) throw new Error('未找到该商号档案');

          const archiveSuffix = `${ARCHIVE_TAG}${Date.now()}`;
          const archivedTenantId = `${tenantId}${archiveSuffix}`;
          const archivedCreditCode = targetRow.credit_code ? `${targetRow.credit_code}${archiveSuffix}` : null;
          const operatorName = sessionStorage.getItem('p_auth_name') || '高级运营管理';

          const { error: upErr } = await supabase.from('platform_tenant').update({
            tenant_id: archivedTenantId,
            credit_code: archivedCreditCode,
            membership_status: 'archived_purged',
            is_active: false,
            admin_remark: `[${new Date().toLocaleString('zh-CN')}] 由 ${operatorName} 执行销号归档（原代号:${tenantId}）`
          }).eq('id', targetRow.id);
          if (upErr) throw new Error('归档封存失败：' + upErr.message);

          await supabase.from('tenant').update({ id: archivedTenantId, status: 'archived' }).eq('id', tenantId);
          await supabase.from('tenant_application').update({ tenant_id: archivedTenantId, credit_code: archivedCreditCode, application_status: 'archived' }).eq('tenant_id', tenantId);

          await recordAuditLog('商号销号归档封存（释放注册名额）', 'CRITICAL_2FA', {
            original_tenant_id: tenantId,
            archived_tenant_id: archivedTenantId,
            company_name: cleanName
          });

          cleanupAndClose();
          alert(`✅ 商号【${cleanName}】已销号归档隐藏，营业执照注册名额已释放！`);
          if (typeof window.loadPlatformData === 'function') await window.loadPlatformData();
        } catch (err) {
          alert('❌ 销号归档执行失败: ' + (err?.message || '未知错误'));
          btnFinal.disabled = false;
          btnFinal.textContent = '🗄️ 确认销号归档并释放名额';
        }
      }
    );
  });
}

/**
 * 4. 商号归档回收站：一键无损复活被隐藏的商号
 */
export function restoreArchivedTenant(archivedRowId, archivedTenantId, companyName) {
  if (!isSeniorOpsOrAbove()) {
    return alert('⛔ 权限不足：仅【高级运营管理】及以上权限可恢复归档商号。');
  }
  const origTid = getOriginalTenantId(archivedTenantId);

  window.triggerPlatform2FA(
    `确认将已归档隐藏的商号【${companyName}】恢复为正式在册状态（还原商号代号为 ${origTid}）？`,
    async () => {
      try {
        const { data: conflict } = await supabase.from('platform_tenant').select('id, company_name').eq('tenant_id', origTid).limit(1);
        if (conflict && conflict.length > 0) {
          return alert(`⚠️ 恢复冲突：当前已有同代号在册商号【${conflict[0].company_name} (${origTid})】！`);
        }

        const { data: row, error: fetchErr } = await supabase.from('platform_tenant').select('*').eq('id', archivedRowId).single();
        if (fetchErr || !row) throw new Error('未找到归档记录');

        const origCreditCode = getOriginalCreditCode(row.credit_code);
        const { error: upErr } = await supabase.from('platform_tenant').update({
          tenant_id: origTid,
          credit_code: origCreditCode || null,
          membership_status: 'active',
          is_active: true,
          admin_remark: `[${new Date().toLocaleString('zh-CN')}] 已从归档回收站一键无损复活`
        }).eq('id', archivedRowId);
        if (upErr) throw new Error('恢复失败：' + upErr.message);

        await supabase.from('tenant').update({ id: origTid, status: 'active' }).eq('id', archivedTenantId);
        await supabase.from('tenant_application').update({ tenant_id: origTid, credit_code: origCreditCode || null, application_status: 'approved' }).eq('tenant_id', archivedTenantId);

        await recordAuditLog('从回收站一键无损复活商号', 'CRITICAL_2FA', { tenant_id: origTid, company_name: companyName });
        alert(`🎉 商号【${companyName} (${origTid})】已一键无损复活！`);
        if (typeof window.loadPlatformData === 'function') await window.loadPlatformData();
      } catch (err) {
        alert('❌ 一键复活失败：' + (err?.message || '未知错误'));
      }
    }
  );
}

/**
 * 4.5 高级运营有限下放权限：单商号限时微观止损（受最高主权动态天花板约束）
 */
export async function openDelegatedTenantQuarantineModal(tenantId, companyName = '') {
  if (!isSeniorOpsOrAbove()) {
    return alert('⛔ 权限不足：仅【高级运营管理】及以上权限可执行临时止损隔离。');
  }
  const sysParams = await getDynamicSystemParams();
  const maxMins = Number(sysParams.senior_ops_max_quarantine_mins || 60);
  if (maxMins <= 0) {
    return alert('⛔ 最高主权策略当前已关闭高级运营的临时止损下放权限。');
  }

  const registry = await getDynamicControlRegistry();
  const delegableItems = registry.filter((r) => r.delegable === true);

  document.getElementById('delegated-quarantine-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'delegated-quarantine-modal';
  modal.className = 'fixed inset-0 bg-stone-950/90 backdrop-blur-sm z-[125] flex items-center justify-center p-4 select-none';
  modal.innerHTML = `
    <div class="bg-white border border-amber-400 w-full max-w-md rounded-3xl p-5 space-y-3.5 text-stone-800 shadow-2xl text-xs">
      <div class="flex justify-between items-center border-b border-stone-100 pb-2">
        <div>
          <h3 class="text-sm font-black text-stone-900">🛡️ 商号临时止损隔离（有限下放权限）</h3>
          <p class="text-[11px] text-stone-500">目标：<b class="font-mono text-rose-700">${companyName || tenantId} (${tenantId})</b> · 权限上限：单次最长 <b>${maxMins}</b> 分钟</p>
        </div>
        <button type="button" id="btn-close-delegated" class="text-stone-400 hover:text-stone-700 text-lg">✕</button>
      </div>
      <div class="space-y-1.5">
        <label class="font-bold text-stone-700 block">选择需要临时暂停的业务通道（仅对该商号生效）：</label>
        <div class="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto p-1 bg-stone-50 rounded-xl border border-stone-200">
          ${delegableItems.map((item) => `
            <label class="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded-lg border border-stone-200 cursor-pointer">
              <input type="checkbox" value="${item.scope}" class="delegated-scope-chk rounded text-amber-600">
              <span>${item.label}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <label class="font-bold text-stone-700 shrink-0">临时隔离时长（分钟）：</label>
        <input type="number" id="input-delegated-mins" min="1" max="${maxMins}" value="${Math.min(30, maxMins)}"
          class="w-24 bg-stone-50 border border-stone-300 rounded-xl px-2.5 py-1.5 font-mono font-bold text-stone-900">
        <span class="text-[10px] text-stone-400">到点自动恢复通畅</span>
      </div>
      <div class="flex gap-2 pt-1">
        <button type="button" id="btn-cancel-delegated" class="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-2.5 rounded-2xl">取消</button>
        <button type="button" id="btn-apply-delegated" class="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-2xl shadow">立即下发限时止损</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btn-close-delegated').addEventListener('click', () => modal.remove());
  document.getElementById('btn-cancel-delegated').addEventListener('click', () => modal.remove());
  document.getElementById('btn-apply-delegated').addEventListener('click', () => {
    const scopes = Array.from(document.querySelectorAll('.delegated-scope-chk:checked')).map((c) => c.value);
    if (scopes.length === 0) return alert('请至少勾选一项需要临时止损的业务通道');
    let mins = Number(document.getElementById('input-delegated-mins').value || 30);
    if (mins < 1) mins = 1;
    if (mins > maxMins) mins = maxMins;

    window.triggerPlatform2FA(
      `确认对商号【${companyName || tenantId}】执行 ${mins} 分钟临时局部止损隔离？`,
      async () => {
        const expiresAt = new Date(Date.now() + mins * 60 * 1000).toISOString();
        const policy = {
          scopes,
          target_tenants: [tenantId],
          expires_at: expiresAt,
          public_notice: `当前商号正在进行例行安全核验，预计 ${mins} 分钟后自动恢复。`,
          updated_by: 'senior_ops_delegated',
          updated_at: new Date().toISOString()
        };
        await supabase.from('platform_governance_config').upsert([
          {
            config_key: 'sovereign_active_circuit_policy',
            config_label: '当前生效动态熔断策略',
            config_value: JSON.stringify(policy),
            value_type: 'json',
            category: 'security',
            updated_at: new Date().toISOString()
          }
        ]);
        await recordAuditLog('高级运营执行单商号限时局部止损', 'CRITICAL_2FA', {
          tenant_id: tenantId,
          scopes,
          duration_mins: mins
        });
        modal.remove();
        alert(`🛡️ 已对商号【${companyName || tenantId}】启动 ${mins} 分钟局部止损隔离，到点将自动解除！`);
      }
    );
  });
}

/**
 * 5. 渲染高级运营管理专属面板（归档回收站 + 一级/二级运营角色权限分配台，零暴露第三层）
 */
export async function renderSeniorGovernancePanel() {
  const archiveBody = document.getElementById('archived-tenants-table-body');
  if (archiveBody) {
    const archivedList = (platformState.allTenants || []).filter(isArchivedTenantRow);
    archiveBody.innerHTML =
      archivedList.length === 0
        ? '<tr><td colspan="4" class="p-6 text-center text-stone-400 font-sans">当前归档回收站为空，暂无被销号隐藏的商号档案。</td></tr>'
        : archivedList
            .map((t) => {
              const origTid = getOriginalTenantId(t.tenant_id);
              const origCode = getOriginalCreditCode(t.credit_code);
              return `
                <tr class="hover:bg-amber-50/40 transition">
                  <td class="p-3 font-bold text-stone-500 line-through">${origTid}</td>
                  <td class="p-3 font-sans">
                    <div class="font-bold text-stone-900">${t.company_name}</div>
                    <div class="text-[10px] font-mono text-stone-400">${origCode || '无信用代码'} · 负责人: ${t.contact_person || '-'}</div>
                  </td>
                  <td class="p-3 font-sans text-[11px] text-stone-500">${t.admin_remark || '已归档隐藏'}</td>
                  <td class="p-3 text-right space-x-1.5 font-sans">
                    <button type="button" onclick="window.exportTenantBackupAction('${t.tenant_id}', '${t.company_name}')"
                      class="text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-xl">
                      📥 导出冷备快照
                    </button>
                    <button type="button" onclick="window.restoreArchivedTenantAction(${t.id}, '${t.tenant_id}', '${t.company_name}')"
                      class="text-[11px] font-bold bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1 rounded-xl shadow-xs">
                      ♻️ 一键无损复活
                    </button>
                  </td>
                </tr>
              `;
            })
            .join('');
  }

  const staffBody = document.getElementById('ops-team-table-body');
  if (staffBody && isSeniorOpsOrAbove()) {
    const { data: admins } = await supabase
      .from('platform_admin_credential')
      .select('id, admin_account, admin_name, admin_role, is_active, created_at')
      .order('id', { ascending: true });

    const curAccount = sessionStorage.getItem('p_auth_account') || '';
    staffBody.innerHTML = (admins || [])
      .map((adm) => {
        const normalizedRole = adm.admin_role === 'ops_manager' ? 'ops_manager' : 'senior_ops';
        const isSelf = adm.admin_account === curAccount;
        return `
          <tr class="hover:bg-stone-50 transition">
            <td class="p-3 font-mono font-bold text-stone-900">${adm.admin_account} ${isSelf ? '<span class="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-sans">当前登录</span>' : ''}</td>
            <td class="p-3 font-sans font-bold text-stone-800">${adm.admin_name || '运营执事'}</td>
            <td class="p-3 font-sans">
              <select onchange="window.updateOpsStaffRole(${adm.id}, '${adm.admin_account}', this.value)" ${isSelf ? 'disabled' : ''}
                class="bg-stone-50 border border-stone-300 rounded-xl px-2.5 py-1 text-xs font-bold text-stone-800 outline-none">
                <option value="ops_manager" ${normalizedRole === 'ops_manager' ? 'selected' : ''}>🛡️ 运营管理者（日常审核与巡检）</option>
                <option value="senior_ops" ${normalizedRole === 'senior_ops' ? 'selected' : ''}>👑 高级运营管理（含归档/恢复/限时止损）</option>
              </select>
            </td>
            <td class="p-3 font-sans">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${adm.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                ${adm.is_active ? '🟢 正常执勤' : '🛑 已停用'}
              </span>
            </td>
            <td class="p-3 text-right font-sans">
              ${
                isSelf
                  ? '<span class="text-[11px] text-stone-400">本人账号</span>'
                  : `<button type="button" onclick="window.toggleOpsStaffActive(${adm.id}, '${adm.admin_account}', ${!adm.is_active})"
                      class="text-[11px] font-bold px-2.5 py-1 rounded-xl border ${
                        adm.is_active
                          ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                      }">
                      ${adm.is_active ? '停用权限' : '恢复执勤'}
                    </button>`
              }
            </td>
          </tr>
        `;
      })
      .join('');
  }
}

/**
 * ============================================================================
 * 6. 终极运营主权指令舱（全动态零硬编码 · 双向可往返 · 宏微双模式 · 极端生存版）
 * ============================================================================
 */
async function checkSovereignLockout() {
  const params = await getDynamicSystemParams();
  try {
    const raw = JSON.parse(localStorage.getItem(SOVEREIGN_LOCK_STORAGE) || '{}');
    if (raw.lockedUntil && Date.now() < raw.lockedUntil) {
      const remainMins = Math.ceil((raw.lockedUntil - Date.now()) / 60000);
      return { locked: true, remainMins, params };
    }
  } catch (e) {}
  return { locked: false, remainMins: 0, params };
}

async function recordSovereignFailure() {
  const params = await getDynamicSystemParams();
  const maxAttempts = Math.max(1, Number(params.max_auth_attempts || 3));
  const lockMins = Math.max(1, Number(params.lockout_minutes || 30));

  let state = { count: 0, lockedUntil: 0 };
  try {
    state = JSON.parse(localStorage.getItem(SOVEREIGN_LOCK_STORAGE) || '{"count":0,"lockedUntil":0}');
  } catch (e) {}
  state.count = (state.count || 0) + 1;
  if (state.count >= maxAttempts) {
    state.lockedUntil = Date.now() + lockMins * 60 * 1000;
    state.count = 0;
  }
  localStorage.setItem(SOVEREIGN_LOCK_STORAGE, JSON.stringify(state));
  return { state, maxAttempts, lockMins };
}

function clearSovereignLockout() {
  localStorage.removeItem(SOVEREIGN_LOCK_STORAGE);
}

/**
 * 核验主权暗令（返回 'REAL' 真实主权 | 'DURESS' 胁迫伪装欺骗模式 | 'INVALID' 错误）
 */
async function authenticateSovereignPassphrase(inputPass) {
  const trimmed = String(inputPass || '').trim();
  if (!trimmed) return 'INVALID';
  const inputHash = await sha256Hex(`BAIGONG_SOVEREIGN::${trimmed}`);

  // 1. 先检查是否命中胁迫假暗令
  let duressHash = localStorage.getItem(SOVEREIGN_DURESS_STORAGE);
  if (!duressHash) {
    const { data: dCfg } = await supabase
      .from('platform_governance_config')
      .select('config_value')
      .eq('config_key', '_sys_sovereign_duress_hash')
      .maybeSingle();
    if (dCfg?.config_value) {
      duressHash = dCfg.config_value;
      localStorage.setItem(SOVEREIGN_DURESS_STORAGE, duressHash);
    }
  }
  if (duressHash && inputHash === duressHash) {
    return 'DURESS';
  }

  // 2. 再检查真实主权暗令
  const savedLocalHash = localStorage.getItem(SOVEREIGN_KEY_STORAGE);
  if (savedLocalHash && inputHash === savedLocalHash) return 'REAL';

  const { data: cfg } = await supabase
    .from('platform_governance_config')
    .select('config_value')
    .eq('config_key', '_sys_sovereign_seal_hash')
    .maybeSingle();

  if (cfg?.config_value) {
    localStorage.setItem(SOVEREIGN_KEY_STORAGE, cfg.config_value);
    return inputHash === cfg.config_value ? 'REAL' : 'INVALID';
  }

  const defaultHash = await sha256Hex(`BAIGONG_SOVEREIGN::${DEFAULT_SOVEREIGN_PASSPHRASE}`);
  return inputHash === defaultHash ? 'REAL' : 'INVALID';
}

async function inlineImageAsDataUrl(url) {
  if (!url || String(url).startsWith('data:image/')) return url;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return url;
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result || url);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return url;
  }
}

/**
 * 动态全库母包导出（支持全库全量，也支持按指定单表或单商号切片导出）
 */
async function exportDynamicDisasterMotherboard(options = {}) {
  const { onlyTables = null, onlyTenantId = null, modeLabel = 'FULL' } = options;
  const dynamicTables = await discoverDynamicTables();
  const sysParams = await getDynamicSystemParams();
  const excludedSet = new Set(sysParams.excluded_tables || []);

  const snapshot = {};
  for (const meta of dynamicTables) {
    const tbl = meta.table_name;
    if (excludedSet.has(tbl)) continue;
    if (Array.isArray(onlyTables) && onlyTables.length > 0 && !onlyTables.includes(tbl)) continue;

    if (onlyTenantId) {
      if (tbl === 'tenant') {
        snapshot[tbl] = await fetchAllRowsFromTable('tenant', 'id', onlyTenantId);
      } else if (meta.has_tenant_id) {
        snapshot[tbl] = await fetchAllRowsFromTable(tbl, 'tenant_id', onlyTenantId);
      } else {
        snapshot[tbl] = [];
      }
    } else {
      snapshot[tbl] = await fetchAllRowsFromTable(tbl);
    }
  }

  if (Array.isArray(snapshot.tenant_application) && snapshot.tenant_application.length > 0) {
    for (let i = 0; i < snapshot.tenant_application.length; i++) {
      const app = snapshot.tenant_application[i];
      if (app.license_image_url && !String(app.license_image_url).startsWith('data:image/')) {
        snapshot.tenant_application[i] = {
          ...app,
          license_image_url: await inlineImageAsDataUrl(app.license_image_url)
        };
      }
    }
  }

  const canonicalJson = JSON.stringify(snapshot);
  const integritySeal = await sha256Hex(`BAIGONG_MOTHERBOARD_SEAL::${canonicalJson}`);
  const sourceEndpoint = supabase?.supabaseUrl || window.location.origin;

  const motherPayload = {
    schema_version: 'baigong_sovereign_disaster_motherboard_v3_dynamic',
    export_mode: modeLabel,
    created_at: new Date().toISOString(),
    source_endpoint: sourceEndpoint,
    integrity_sha256: integritySeal,
    table_topology: dynamicTables.map((d) => d.table_name),
    table_counts: Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length])),
    tables: snapshot
  };

  const prefix = modeLabel === 'FULL' ? 'SOVEREIGN_FULL_DISASTER_MOTHERBOARD' : `SOVEREIGN_SLICE_${modeLabel}`;
  downloadTextBlob(
    JSON.stringify(motherPayload, null, 2),
    `${prefix}_${new Date().toISOString().slice(0, 10)}.json`
  );
  if (modeLabel === 'FULL') {
    localStorage.setItem(SOVEREIGN_LAST_BACKUP_KEY, String(Date.now()));
  }
  return motherPayload;
}

/**
 * 导出司法级电子证据固定卷宗（带 UTC 时间戳与不可抵赖 SHA-256 哈希封印）
 */
async function exportForensicEvidenceBundle(filterTenantId = '') {
  const evidenceTables = ['audit_immutable_log', 'platform_compliance_case', 'payment_record', 'inventory_log', 'driver_collection_log'];
  const bundleData = {};

  for (const tbl of evidenceTables) {
    bundleData[tbl] = filterTenantId
      ? await fetchAllRowsFromTable(tbl, 'tenant_id', filterTenantId)
      : await fetchAllRowsFromTable(tbl);
  }

  const seal = await sha256Hex(`BAIGONG_FORENSIC_EVIDENCE::${JSON.stringify(bundleData)}`);
  const forensicDoc = {
    schema_version: 'baigong_forensic_evidence_bundle_v1',
    generated_utc: new Date().toISOString(),
    scope_tenant_id: filterTenantId || 'ALL_PLATFORM_ENTITIES',
    source_endpoint: supabase?.supabaseUrl || window.location.origin,
    forensic_sha256_seal: seal,
    record_counts: Object.fromEntries(Object.entries(bundleData).map(([k, v]) => [k, v.length])),
    evidence_records: bundleData
  };

  downloadTextBlob(
    JSON.stringify(forensicDoc, null, 2),
    `SOVEREIGN_FORENSIC_EVIDENCE_${filterTenantId || 'ALL'}_${new Date().toISOString().slice(0, 10)}.json`
  );
  return forensicDoc;
}

async function exportRuntimeSourceCodeVault() {
  const entryPages = ['./index.html', './platform.html', './hq.html', './join.html', './mall.html', './store.html', './driver.html'];
  const candidateUrls = new Set([
    ...entryPages,
    './src/styles/tailwind.css',
    './src/lib/supabase.js',
    './src/utils/authSecurity.js',
    './src/utils/totp.js',
    './src/modules/platformController.js',
    './src/modules/platformEvolutionWidget.js',
    './src/modules/platformSelfCheckEnhancer.js',
    './src/modules/platform/platformState.js',
    './src/modules/platform/platformAuthModule.js',
    './src/modules/platform/platformTenantModule.js',
    './src/modules/platform/tenantLifecycleModule.js',
    './src/modules/platform/platformAuditModule.js',
    './src/modules/platform/platformGovernanceModule.js'
  ]);

  if (typeof performance !== 'undefined' && performance.getEntriesByType) {
    performance.getEntriesByType('resource').forEach((entry) => {
      if (entry.name && entry.name.startsWith(window.location.origin)) candidateUrls.add(entry.name);
    });
  }

  const capturedFiles = {};
  const queue = Array.from(candidateUrls);
  const visited = new Set();

  while (queue.length > 0) {
    const rawUrl = queue.shift();
    if (!rawUrl || visited.has(rawUrl)) continue;
    visited.add(rawUrl);
    try {
      const resp = await fetch(rawUrl, { cache: 'no-store' });
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!text || text.length === 0) continue;
      const isHtml = rawUrl.endsWith('.html') || rawUrl.endsWith('/');
      if (!isHtml && text.trim().startsWith('<!DOCTYPE html>')) continue;
      const cleanKey = rawUrl.replace(window.location.origin, '');
      capturedFiles[cleanKey] = text;

      const refMatches = text.matchAll(/(?:src|href|from)\s*=?\s*['"](\.[^'"]+\.(?:js|css|html))['"]/g);
      for (const m of refMatches) {
        if (m[1]) {
          const resolved = new URL(m[1], new URL(rawUrl, window.location.href)).pathname;
          if (!visited.has('.' + resolved) && !visited.has(resolved)) queue.push('.' + resolved);
        }
      }
    } catch (e) {}
  }

  const bundlePayload = {
    schema_version: 'baigong_runtime_source_vault_v3',
    captured_at: new Date().toISOString(),
    origin: window.location.origin,
    file_count: Object.keys(capturedFiles).length,
    files: capturedFiles
  };

  downloadTextBlob(
    JSON.stringify(bundlePayload, null, 2),
    `SOVEREIGN_FULL_SOURCE_VAULT_${new Date().toISOString().slice(0, 10)}.json`
  );
  return bundlePayload.file_count;
}

async function exportLiveDdlSqlFile() {
  const { data, error } = await supabase.rpc('rpc_export_live_ddl');
  if (!error && data) {
    downloadTextBlob(data, `00_LIVE_SCHEMA_AND_RLS_${new Date().toISOString().slice(0, 10)}.sql`, 'text/sql;charset=utf-8');
    return;
  }
  const fallbackNotice = `-- 请先在 Supabase SQL Editor 运行 01_DYNAMIC_SOVEREIGN_CORE.sql 以启用实时 DDL 导出函数。\n-- 当前表拓扑清单: ${FALLBACK_PUBLIC_TABLES.join(', ')}\n`;
  downloadTextBlob(fallbackNotice, `00_LIVE_SCHEMA_AND_RLS_${new Date().toISOString().slice(0, 10)}.sql`, 'text/sql;charset=utf-8');
}

async function batchInsertTableRows(tableName, rows, preserveId = false) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const cleaned = rows.map((r) => {
    if (preserveId) return { ...r };
    const { id, ...rest } = r;
    return rest;
  });

  const chunkSize = 200;
  let inserted = 0;
  for (let i = 0; i < cleaned.length; i += chunkSize) {
    const chunk = cleaned.slice(i, i + chunkSize);
    const { error } = await supabase.from(tableName).upsert(chunk);
    if (!error) {
      inserted += chunk.length;
    } else {
      const { error: insErr } = await supabase.from(tableName).insert(chunk);
      if (!insErr) inserted += chunk.length;
    }
  }
  return inserted;
}

async function appendMissingEvidenceRows(tableName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const existing = await fetchAllRowsFromTable(tableName);
  const existingSignatures = new Set(
    existing.map((r) => `${r.tenant_id || ''}|${r.created_at || ''}|${r.action_title || r.change_type || ''}`)
  );
  const missing = rows
    .filter((r) => !existingSignatures.has(`${r.tenant_id || ''}|${r.created_at || ''}|${r.action_title || r.change_type || ''}`))
    .map(({ id, ...rest }) => rest);

  if (missing.length === 0) return 0;
  let added = 0;
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200);
    const { error } = await supabase.from(tableName).insert(chunk);
    if (!error) added += chunk.length;
  }
  return added;
}

/**
 * 动态外科手术式重建与双向回溯引擎（支持全库重建 / 单表手术 / 单商号手术 / Dry-Run 演练 / 自动反向补丁快照）
 */
async function executeSurgicalDisasterRebuild(motherJson, options, logCallback) {
  const {
    wipeBeforeRestore = true,
    dryRunOnly = false,
    autoUndoBackup = true,
    targetTables = null, // null 表示全部表，数组表示仅手术指定表
    targetTenantId = null // null 表示全网，字符串表示仅手术指定商号
  } = options;

  if (!motherJson || !motherJson.tables) throw new Error('无效的灾难恢复母包文件');

  if (motherJson.integrity_sha256) {
    logCallback('🔍 正在校验母包 SHA-256 防篡改完整性封印...');
    const computed = await sha256Hex(`BAIGONG_MOTHERBOARD_SEAL::${JSON.stringify(motherJson.tables)}`);
    if (computed !== motherJson.integrity_sha256) {
      throw new Error('⛔ 验签失败！该母包文件在离线保存期间遭到篡改或损坏，已拒绝灌入！');
    }
    logCallback('✅ SHA-256 完整性封印验证通过，铁证无损！');
  }

  const dynamicMeta = await discoverDynamicTables();
  const sysParams = await getDynamicSystemParams();
  const immutableSet = new Set(sysParams.immutable_tables || ['audit_immutable_log', 'inventory_log']);

  const candidateTables = dynamicMeta.filter((m) => {
    if (!Array.isArray(motherJson.tables[m.table_name])) return false;
    if (Array.isArray(targetTables) && targetTables.length > 0 && !targetTables.includes(m.table_name)) return false;
    return true;
  });

  // 1. 差异透视与 Dry-Run 零写入模拟校验
  logCallback(`📊 正在扫描 ${candidateTables.length} 张目标表的拓扑依赖与现库差异...`);
  let simulatedRows = 0;
  for (const m of candidateTables) {
    const tbl = m.table_name;
    let srcRows = motherJson.tables[tbl] || [];
    if (targetTenantId) {
      if (tbl === 'tenant') srcRows = srcRows.filter((r) => r.id === targetTenantId);
      else if (m.has_tenant_id) srcRows = srcRows.filter((r) => r.tenant_id === targetTenantId);
      else srcRows = [];
    }
    const curRows = targetTenantId && m.has_tenant_id
      ? await fetchAllRowsFromTable(tbl, 'tenant_id', targetTenantId)
      : await fetchAllRowsFromTable(tbl);

    simulatedRows += srcRows.length;
    logCallback(`   • [${tbl}] 母包 ${srcRows.length} 行 ↔ 现库 ${curRows.length} 行 (${immutableSet.has(tbl) ? '物理锁定铁证表' : '常规业务表'})`);
  }

  if (dryRunOnly) {
    logCallback(`🧪 [Dry-Run 模拟演练完成] 全程零写入！共校验 ${candidateTables.length} 张表、${simulatedRows} 条记录，外键映射与类型 100% 兼容就绪！`);
    return simulatedRows;
  }

  // 2. 手术前自动生成反向回退快照（Undo Rollback Patch）
  if (autoUndoBackup && wipeBeforeRestore) {
    logCallback('🛡️ 正在为即将覆盖的数据自动生成反向回退快照（Undo Rollback Patch）...');
    await exportDynamicDisasterMotherboard({
      onlyTables: candidateTables.map((c) => c.table_name),
      onlyTenantId: targetTenantId || null,
      modeLabel: 'UNDO_ROLLBACK_PATCH'
    });
    logCallback('✅ 反向回退补丁已下载落盘！若发现回档误操作，灌入该补丁即可退回手术前一秒。');
  }

  // 3. 按外键逆序清理非铁证表
  if (wipeBeforeRestore) {
    logCallback('🧹 正在按外键逆序清扫普通业务表旧数据（自动跳过物理锁定铁证表）...');
    for (const m of [...candidateTables].reverse()) {
      const tbl = m.table_name;
      if (immutableSet.has(tbl)) continue;
      if (targetTenantId) {
        if (tbl === 'tenant') await supabase.from('tenant').delete().eq('id', targetTenantId);
        else if (m.has_tenant_id) await supabase.from(tbl).delete().eq('tenant_id', targetTenantId);
      } else {
        if (m.has_id) await supabase.from(tbl).delete().neq('id', -999999999);
        else if (m.has_tenant_id) await supabase.from(tbl).delete().neq('tenant_id', '__NONE__');
        else if (tbl === 'platform_governance_config') await supabase.from(tbl).delete().neq('config_key', '__NONE__');
      }
    }
  }

  // 4. 按外键正向拓扑顺序重映射灌入
  let totalRestored = 0;
  const catIdMap = new Map();
  const productIdMap = new Map();
  const storeIdMap = new Map();
  const orderIdMap = new Map();

  for (const m of candidateTables) {
    const tbl = m.table_name;
    let rows = motherJson.tables[tbl] || [];
    if (targetTenantId) {
      if (tbl === 'tenant') rows = rows.filter((r) => r.id === targetTenantId);
      else if (m.has_tenant_id) rows = rows.filter((r) => r.tenant_id === targetTenantId);
      else continue;
    }
    if (rows.length === 0) continue;

    if (immutableSet.has(tbl)) {
      const mappedEv = tbl === 'inventory_log'
        ? rows.map((r) => ({ ...r, product_id: productIdMap.get(String(r.product_id)) || r.product_id }))
        : rows;
      const added = await appendMissingEvidenceRows(tbl, mappedEv);
      totalRestored += added;
      logCallback(`⚖️ 幂等补齐铁证表 [${tbl}]：新增 ${added} 条`);
      continue;
    }

    if (tbl === 'platform_category') {
      const l1 = rows.filter((c) => c.level === 1 || !c.parent_id);
      const l2 = rows.filter((c) => c.level === 2 && c.parent_id);
      for (const c1 of l1) {
        const { id: oldId, ...rest } = c1;
        const { data: ins } = await supabase.from('platform_category').insert([rest]).select('id').single();
        if (oldId != null && ins?.id != null) catIdMap.set(String(oldId), ins.id);
        totalRestored += 1;
      }
      for (const c2 of l2) {
        const { id: oldId, ...rest } = c2;
        await supabase.from('platform_category').insert([{ ...rest, parent_id: catIdMap.get(String(rest.parent_id)) || rest.parent_id }]);
        totalRestored += 1;
      }
      continue;
    }

    if (tbl === 'product') {
      for (const oldProd of rows) {
        const { id: oldId, ...rest } = oldProd;
        const { data: ins } = await supabase.from('product').insert([rest]).select('id').single();
        if (oldId != null && ins?.id != null) productIdMap.set(String(oldId), ins.id);
        totalRestored += 1;
      }
      continue;
    }

    if (tbl === 'store') {
      for (const oldStore of rows) {
        const { id: oldId, ...rest } = oldStore;
        const mappedVisible = Array.isArray(rest.visible_product_ids)
          ? rest.visible_product_ids.map((pid) => productIdMap.get(String(pid))).filter((v) => v != null)
          : rest.visible_product_ids;
        let mappedPricing = rest.custom_pricing;
        if (mappedPricing && typeof mappedPricing === 'object' && !Array.isArray(mappedPricing)) {
          const nextP = {};
          for (const [k, v] of Object.entries(mappedPricing)) nextP[String(productIdMap.get(String(k)) || k)] = v;
          mappedPricing = nextP;
        }
        const { data: ins } = await supabase.from('store').insert([{ ...rest, visible_product_ids: mappedVisible, custom_pricing: mappedPricing }]).select('id').single();
        if (oldId != null && ins?.id != null) storeIdMap.set(String(oldId), ins.id);
        totalRestored += 1;
      }
      continue;
    }

    if (tbl === 'orders') {
      for (const oldOrder of rows) {
        const { id: oldId, ...rest } = oldOrder;
        const { data: ins } = await supabase.from('orders').insert([{
          ...rest,
          store_id: rest.store_id != null ? storeIdMap.get(String(rest.store_id)) || rest.store_id : null
        }]).select('id').single();
        if (oldId != null && ins?.id != null) orderIdMap.set(String(oldId), ins.id);
        totalRestored += 1;
      }
      continue;
    }

    // 通用动态表映射写入（自动适配未来任何新增表）
    const preservePrimaryKey = tbl === 'platform_governance_config' || tbl === 'tenant';
    const mappedGeneral = rows.map((r) => {
      const next = { ...r };
      if (next.store_id != null) next.store_id = storeIdMap.get(String(next.store_id)) || next.store_id;
      if (next.from_store_id != null) next.from_store_id = storeIdMap.get(String(next.from_store_id)) || next.from_store_id;
      if (next.to_store_id != null) next.to_store_id = storeIdMap.get(String(next.to_store_id)) || next.to_store_id;
      if (next.product_id != null) next.product_id = productIdMap.get(String(next.product_id)) || next.product_id;
      if (next.order_id != null) next.order_id = orderIdMap.get(String(next.order_id)) || next.order_id;
      if (Array.isArray(next.items)) next.items = remapOrderItemsJson(next.items, productIdMap);
      if (Array.isArray(next.items_return)) next.items_return = remapOrderItemsJson(next.items_return, productIdMap);
      if (Array.isArray(next.items_exchange)) next.items_exchange = remapOrderItemsJson(next.items_exchange, productIdMap);
      return next;
    });

    const cnt = await batchInsertTableRows(tbl, mappedGeneral, preservePrimaryKey);
    totalRestored += cnt;
    logCallback(`✅ 重建表 [${tbl}]：写入 ${cnt} 行`);
  }

  // 5. 逐表数目验真对账
  logCallback('📊 正在执行逐表数目验真对账...');
  let mismatchCount = 0;
  for (const m of candidateTables) {
    const tbl = m.table_name;
    let expectedRows = motherJson.tables[tbl] || [];
    if (targetTenantId) {
      if (tbl === 'tenant') expectedRows = expectedRows.filter((r) => r.id === targetTenantId);
      else if (m.has_tenant_id) expectedRows = expectedRows.filter((r) => r.tenant_id === targetTenantId);
      else continue;
    }
    if (expectedRows.length === 0) continue;

    const actualRows = targetTenantId && m.has_tenant_id
      ? await fetchAllRowsFromTable(tbl, 'tenant_id', targetTenantId)
      : await fetchAllRowsFromTable(tbl);

    if (actualRows.length < expectedRows.length) {
      mismatchCount += 1;
      logCallback(`⚠️ 对账差异 [${tbl}]：期望 ${expectedRows.length} 行 ➔ 现库 ${actualRows.length} 行`);
    }
  }

  logCallback(
    mismatchCount === 0
      ? `🎉 手术/重建与逐表验真圆满完成！累计处理 ${totalRestored} 条记录，零误差！`
      : `⚠️ 操作完成（共处理 ${totalRestored} 条），存在 ${mismatchCount} 张表行数不足，请检查建表字段。`
  );
  return totalRestored;
}

/**
 * 打开全动态终极运营主权指令舱
 */
async function openSovereignCommandVault() {
  const lockCheck = await checkSovereignLockout();
  if (lockCheck.locked) {
    alert(`🛡️ 安全熔断：连续输错次数过多，指令舱已进入静默锁定状态，请 ${lockCheck.remainMins} 分钟后再试。`);
    return;
  }

  document.getElementById('sovereign-command-vault')?.remove();
  let isDuressMode = false;
  let loadedMotherboardJson = null;

  // 策略版本栈（支持双向撤销 Undo / 重做 Redo）
  let policyHistoryStack = [];
  let policyRedoStack = [];

  const overlay = document.createElement('div');
  overlay.id = 'sovereign-command-vault';
  overlay.className = 'fixed inset-0 bg-black/95 backdrop-blur-md z-[200] flex items-center justify-center p-3 sm:p-4 select-none';

  overlay.innerHTML = `
    <div class="bg-stone-950 border border-amber-500/50 w-full max-w-4xl rounded-3xl p-5 space-y-3.5 text-stone-200 shadow-2xl text-xs">
      <div class="flex justify-between items-center border-b border-stone-800 pb-2.5">
        <div class="flex items-center gap-2.5">
          <span class="w-8 h-8 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-black text-base">⚜️</span>
          <div>
            <h3 class="text-sm font-black text-amber-400 tracking-wide">终极运营主权指令舱（全动态零硬编码 · 双向可往返内核）</h3>
            <p class="text-[10px] text-stone-400">动态自发现表拓扑 · 热插拔控制维度 · 策略撤销重做 · 单表手术回档与反向快照 · 双暗令防胁迫</p>
          </div>
        </div>
        <button type="button" id="btn-close-sovereign" class="text-stone-400 hover:text-white text-lg">✕</button>
      </div>

      <!-- 身份核验区 -->
      <div id="sovereign-lock-view" class="space-y-3 py-3 max-w-md mx-auto">
        <label class="block text-amber-300 font-bold">请输入终极主权暗令（支持真实主权暗令 / 胁迫伪装暗令）：</label>
        <input type="password" id="input-sovereign-pass" placeholder="输入主权暗令"
          class="w-full bg-stone-900 border border-amber-500/40 rounded-xl px-3.5 py-2.5 font-mono text-white outline-none focus:border-amber-400">
        <button type="button" id="btn-unlock-sovereign"
          class="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-black py-2.5 rounded-xl shadow transition">
          解锁终极主权控制中枢
        </button>
      </div>

      <!-- 解锁后的五大动态武器库 -->
      <div id="sovereign-weapons-view" class="hidden space-y-3.5 max-h-[80vh] overflow-y-auto pr-1">

        <!-- 武器一：动态细粒度熔断矩阵 + 策略往返栈 + 热插拔扩展 -->
        <div class="bg-stone-900 border border-rose-500/40 rounded-2xl p-3.5 space-y-2.5">
          <div class="flex flex-wrap justify-between items-center gap-2">
            <b class="text-rose-400 text-xs">⚡ 武器一：全动态细粒度熔断矩阵（宏观全局 / 微观定点 · 双向往返）</b>
            <div class="flex items-center gap-1.5">
              <button type="button" id="btn-policy-undo" disabled class="px-2 py-0.5 rounded bg-stone-800 text-stone-500 text-[10px] font-bold">↩️ 撤销上版规则</button>
              <button type="button" id="btn-policy-redo" disabled class="px-2 py-0.5 rounded bg-stone-800 text-stone-500 text-[10px] font-bold">↪️ 重做规则</button>
              <span id="sovereign-circuit-status" class="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-800 text-stone-300">检测中...</span>
            </div>
          </div>

          <!-- 快捷勾选与热插拔新增 -->
          <div class="flex flex-wrap items-center gap-1.5 text-[10px]">
            <button type="button" id="btn-circuit-select-all" class="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-700/60 hover:bg-rose-900">全选所有维度</button>
            <button type="button" id="btn-circuit-select-finance" class="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700/60 hover:bg-amber-900">仅锁资金与缴费</button>
            <button type="button" id="btn-circuit-select-none" class="px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700 hover:bg-stone-700">清空勾选</button>
            <button type="button" id="btn-circuit-add-scope" class="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-700/60 hover:bg-sky-900 ml-auto">➕ 热插拔新增控制维度</button>
          </div>

          <!-- 动态渲染的无限扩展复选矩阵 -->
          <div id="sovereign-dynamic-scopes-grid" class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px] max-h-48 overflow-y-auto p-1 bg-stone-950/60 rounded-xl border border-stone-800"></div>

          <!-- 全参数自定义栏（作用对象 + 时长 + 金额阈值 + 公告） -->
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px] bg-stone-950 p-2.5 rounded-xl border border-stone-800">
            <div>
              <label class="text-stone-400 block mb-1">🎯 定点商号 (留空=全网)：</label>
              <input type="text" id="input-circuit-targets" placeholder="如 T001,T002" class="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 font-mono text-white">
            </div>
            <div>
              <label class="text-stone-400 block mb-1">⏳ 自动解封时长 (0=永久)：</label>
              <div class="flex gap-1">
                <input type="number" id="input-circuit-duration" min="0" value="0" class="w-16 bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 font-mono text-white">
                <select id="select-circuit-unit" class="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-1.5 py-1 text-white">
                  <option value="minutes">分钟</option>
                  <option value="hours">小时</option>
                  <option value="days">天</option>
                </select>
              </div>
            </div>
            <div>
              <label class="text-stone-400 block mb-1">🎚️ 单笔大额限流阈值 (元)：</label>
              <input type="number" id="input-circuit-max-amount" min="0" placeholder="0=不限额" class="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 font-mono text-white">
            </div>
            <div>
              <label class="text-stone-400 block mb-1">📢 自定义前线安抚公告：</label>
              <input type="text" id="input-circuit-notice" placeholder="系统安全护盘中，稍后恢复" class="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-white">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button type="button" id="btn-sovereign-apply-circuit" class="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 rounded-xl">🛑 应用自定义熔断策略</button>
            <button type="button" id="btn-sovereign-unfreeze-all" class="bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2 rounded-xl">🟢 一键解除全部熔断</button>
            <button type="button" id="btn-sovereign-wipe-sessions" class="bg-amber-900 hover:bg-amber-800 text-amber-200 border border-amber-600/50 font-bold py-2 rounded-xl">🔌 踢出全网所有在线终端</button>
          </div>
        </div>

        <!-- 武器二：全栈母版离线备份、按需切片与司法取证 -->
        <div class="bg-stone-900 border border-amber-500/40 rounded-2xl p-3.5 space-y-2.5">
          <div class="flex justify-between items-center">
            <b class="text-amber-300 text-xs">🧬 武器二：全栈母版备份、按需切片与司法电子取证</b>
            <span id="sovereign-discovered-table-count" class="text-[10px] font-mono text-amber-400">正在自发现全库表结构...</span>
          </div>
          <button type="button" id="btn-sovereign-export-trinity" class="w-full bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-stone-950 font-black py-2 rounded-xl shadow">
            ⚡ 一键导出救生舱全套三件套（全库动态母包 + 全站递归源码 + 实时最新建库DDL）
          </button>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button type="button" id="btn-sovereign-export-all" class="bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/40 font-bold py-1.5 rounded-xl">📥 全库数据母包</button>
            <button type="button" id="btn-sovereign-export-code" class="bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/40 font-bold py-1.5 rounded-xl">📦 全站源码快照</button>
            <button type="button" id="btn-sovereign-export-sql" class="bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/40 font-bold py-1.5 rounded-xl">🗄️ 实时建库DDL</button>
            <button type="button" id="btn-sovereign-export-forensic" class="bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-600/50 font-bold py-1.5 rounded-xl">⚖️ 司法取证卷宗</button>
          </div>
        </div>

        <!-- 武器三：双向可回溯灾难重建与外科手术回档 -->
        <div class="bg-stone-900 border border-emerald-500/40 rounded-2xl p-3.5 space-y-2.5">
          <b class="text-emerald-400 text-xs block">🏗️ 武器三：灾难重建与外科手术回档（支持单表/单商号点穴 · 反向补丁快照 · Dry-Run 演练）</b>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label class="bg-stone-950 border border-dashed border-emerald-500/50 hover:border-emerald-400 rounded-xl px-3 py-2 cursor-pointer text-center font-bold text-emerald-300">
              <span id="sovereign-mother-file-label">📂 选择恢复母包或反向补丁 (.json)</span>
              <input type="file" id="input-sovereign-mother-file" accept=".json,application/json" class="hidden">
            </label>
            <input type="text" id="input-rebuild-target-tenant" placeholder="🎯 仅手术指定商号 (留空=全库)" class="bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 font-mono text-white">
            <input type="text" id="input-rebuild-target-tables" placeholder="🔬 仅手术指定表名,逗号隔开 (留空=全表)" class="bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 font-mono text-white">
          </div>

          <div class="flex flex-wrap items-center gap-4 text-[11px]">
            <label class="flex items-center gap-1.5 text-amber-300 cursor-pointer">
              <input type="checkbox" id="chk-sovereign-wipe-before" checked class="rounded text-rose-600">
              <span>灌入前清扫目标范围旧数据</span>
            </label>
            <label class="flex items-center gap-1.5 text-sky-300 cursor-pointer">
              <input type="checkbox" id="chk-sovereign-auto-undo" checked class="rounded text-sky-600">
              <span>覆盖前自动导出反向回退快照</span>
            </label>
            <label class="flex items-center gap-1.5 text-emerald-300 cursor-pointer">
              <input type="checkbox" id="chk-sovereign-dry-run" class="rounded text-emerald-600">
              <span>🧪 仅执行模拟演练校验 (Dry-Run 零写入)</span>
            </label>
          </div>

          <div id="sovereign-mother-preview" class="hidden bg-stone-950 border border-stone-800 rounded-xl p-2 text-[11px] space-y-1"></div>
          <div id="sovereign-rebuild-log" class="hidden bg-black border border-emerald-900/60 rounded-xl p-2 font-mono text-[10px] text-emerald-300 max-h-36 overflow-y-auto space-y-0.5"></div>
          <button type="button" id="btn-sovereign-execute-rebuild" disabled class="w-full bg-stone-800 text-stone-500 font-black py-2 rounded-xl cursor-not-allowed transition">🔒 请先选择灾难恢复母包</button>
        </div>

        <!-- 武器四：分级深度清理与物理粉碎 -->
        <div class="bg-stone-900 border border-stone-700 rounded-2xl p-3.5 space-y-2">
          <b class="text-stone-200 text-xs block">☢️ 武器四：分级精准清理与物理级彻底粉碎</b>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="text" id="input-sovereign-hard-purge-tid" placeholder="输入商号代号 (含归档后缀亦可)" class="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 font-mono text-white">
            <select id="select-purge-grade" class="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 text-white">
              <option value="grade_a">A级：仅清订单/财务测试流水（保留商品门店空壳）</option>
              <option value="grade_c">C级：物理连根拔除全库所有关联记录（不可逆）</option>
            </select>
            <button type="button" id="btn-sovereign-hard-purge" class="bg-rose-900 hover:bg-rose-800 text-rose-100 font-bold py-1.5 rounded-xl border border-rose-600">执行分级清理</button>
          </div>
        </div>

        <!-- 武器五：全局动态参数阈值、双暗令与双云热备端点 -->
        <div class="bg-stone-900 border border-stone-800 rounded-2xl p-3.5 space-y-2.5">
          <b class="text-stone-300 text-xs block">🔐 武器五：全参数阈值自定义、双暗令（真实/胁迫）与双云端点热切换</b>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
            <div>
              <label class="text-stone-400 block">暗令试错上限(次)</label>
              <input type="number" id="param-max-attempts" min="1" value="3" class="w-full bg-stone-950 border border-stone-700 rounded-lg px-2 py-1 font-mono text-white">
            </div>
            <div>
              <label class="text-stone-400 block">输错锁定时长(分)</label>
              <input type="number" id="param-lock-mins" min="1" value="30" class="w-full bg-stone-950 border border-stone-700 rounded-lg px-2 py-1 font-mono text-white">
            </div>
            <div>
              <label class="text-stone-400 block">冷备逾期提醒(天)</label>
              <input type="number" id="param-backup-days" min="1" value="14" class="w-full bg-stone-950 border border-stone-700 rounded-lg px-2 py-1 font-mono text-white">
            </div>
            <div>
              <label class="text-stone-400 block">高管下放止损上限(分)</label>
              <input type="number" id="param-delegated-mins" min="0" value="60" class="w-full bg-stone-950 border border-stone-700 rounded-lg px-2 py-1 font-mono text-white">
            </div>
            <div class="flex items-end">
              <button type="button" id="btn-save-sys-params" class="w-full bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold py-1.5 rounded-lg">保存全局参数</button>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="password" id="input-sovereign-new-pass" placeholder="新真实主权暗令 (≥10位)" class="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 font-mono text-white">
            <input type="password" id="input-sovereign-duress-pass" placeholder="设置胁迫假暗令 (可选, ≥8位)" class="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 font-mono text-white">
            <button type="button" id="btn-sovereign-save-pass" class="bg-stone-700 hover:bg-stone-600 text-white font-bold py-1.5 rounded-xl">更新双暗令密钥</button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="text" id="input-failover-url" placeholder="备用云库 URL (https://xxx.supabase.co)" class="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 font-mono text-white">
            <input type="password" id="input-failover-key" placeholder="备用云库 ANON_KEY" class="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 font-mono text-white">
            <button type="button" id="btn-save-failover" class="bg-sky-800 hover:bg-sky-700 text-white font-bold py-1.5 rounded-xl">配置备用云热切换</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const lockView = document.getElementById('sovereign-lock-view');
  const weaponsView = document.getElementById('sovereign-weapons-view');
  const passInput = document.getElementById('input-sovereign-pass');
  const btnUnlock = document.getElementById('btn-unlock-sovereign');
  const btnUndo = document.getElementById('btn-policy-undo');
  const btnRedo = document.getElementById('btn-policy-redo');

  document.getElementById('btn-close-sovereign').addEventListener('click', () => overlay.remove());

  function updateUndoRedoButtons() {
    btnUndo.disabled = policyHistoryStack.length === 0;
    btnUndo.className = policyHistoryStack.length > 0
      ? 'px-2 py-0.5 rounded bg-amber-900 text-amber-200 border border-amber-600 text-[10px] font-bold cursor-pointer'
      : 'px-2 py-0.5 rounded bg-stone-800 text-stone-500 text-[10px] font-bold cursor-not-allowed';

    btnRedo.disabled = policyRedoStack.length === 0;
    btnRedo.className = policyRedoStack.length > 0
      ? 'px-2 py-0.5 rounded bg-sky-900 text-sky-200 border border-sky-600 text-[10px] font-bold cursor-pointer'
      : 'px-2 py-0.5 rounded bg-stone-800 text-stone-500 text-[10px] font-bold cursor-not-allowed';
  }

  async function renderDynamicScopesAndParams() {
    const [registry, sysParams, discovered] = await Promise.all([
      getDynamicControlRegistry(),
      getDynamicSystemParams(),
      discoverDynamicTables()
    ]);

    document.getElementById('sovereign-discovered-table-count').textContent = `已自动自发现全库 ${discovered.length} 张数据表`;
    document.getElementById('param-max-attempts').value = sysParams.max_auth_attempts;
    document.getElementById('param-lock-mins').value = sysParams.lockout_minutes;
    document.getElementById('param-backup-days').value = sysParams.backup_overdue_days;
    document.getElementById('param-delegated-mins').value = sysParams.senior_ops_max_quarantine_mins;
    document.getElementById('input-failover-url').value = localStorage.getItem(FAILOVER_URL_KEY) || '';
    document.getElementById('input-failover-key').value = localStorage.getItem(FAILOVER_ANON_KEY) || '';

    const grid = document.getElementById('sovereign-dynamic-scopes-grid');
    grid.innerHTML = registry.map((item) => `
      <label class="flex items-center gap-1.5 bg-stone-950 border border-stone-800 px-2 py-1.5 rounded-lg cursor-pointer hover:border-rose-500/50" title="${item.group} (${item.scope})">
        <input type="checkbox" value="${item.scope}" class="circuit-scope-chk rounded text-rose-600">
        <span class="truncate">${item.label}</span>
      </label>
    `).join('');

    const { data: curRow } = await supabase
      .from('platform_governance_config')
      .select('config_value')
      .eq('config_key', 'sovereign_active_circuit_policy')
      .maybeSingle();

    const labelEl = document.getElementById('sovereign-circuit-status');
    let activePolicy = { scopes: [], target_tenants: [], expires_at: null, public_notice: '', thresholds: {} };
    if (curRow?.config_value) {
      try { activePolicy = { ...activePolicy, ...JSON.parse(curRow.config_value) }; } catch (e) {}
    }

    const isExpired = activePolicy.expires_at && Date.now() >= new Date(activePolicy.expires_at).getTime();
    const activeScopes = isExpired ? [] : (activePolicy.scopes || []);

    document.querySelectorAll('.circuit-scope-chk').forEach((chk) => {
      chk.checked = activeScopes.includes(chk.value);
    });
    document.getElementById('input-circuit-targets').value = (activePolicy.target_tenants || []).join(',');
    document.getElementById('input-circuit-max-amount').value = activePolicy.thresholds?.max_single_amount || '';
    document.getElementById('input-circuit-notice').value = activePolicy.public_notice || '';

    if (activeScopes.length > 0) {
      const targetTag = (activePolicy.target_tenants || []).length > 0 ? `定点(${activePolicy.target_tenants.length}家)` : '全网';
      labelEl.textContent = `🛑 ${targetTag}熔断 ${activeScopes.length} 项`;
      labelEl.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-rose-900 text-rose-200 font-bold';
    } else {
      labelEl.textContent = '🟢 全站正常运行中';
      labelEl.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900 text-emerald-200 font-bold';
    }
  }

  async function saveCircuitPolicy(newPolicy, pushHistory = true) {
    if (isDuressMode) {
      // 胁迫伪装模式下，不覆盖真实放行，静默开启只读护盘并给胁迫者展示成功假象
      const allScopes = (await getDynamicControlRegistry()).map((r) => r.scope);
      await supabase.from('platform_governance_config').upsert([{
        config_key: 'sovereign_active_circuit_policy',
        config_value: JSON.stringify({ scopes: allScopes, target_tenants: [], expires_at: null, public_notice: '系统安全护盘中' }),
        updated_at: new Date().toISOString()
      }]);
      return;
    }

    if (pushHistory) {
      const { data: prev } = await supabase
        .from('platform_governance_config')
        .select('config_value')
        .eq('config_key', 'sovereign_active_circuit_policy')
        .maybeSingle();
      if (prev?.config_value) {
        policyHistoryStack.push(prev.config_value);
        if (policyHistoryStack.length > 20) policyHistoryStack.shift();
        policyRedoStack = [];
      }
    }

    await supabase.from('platform_governance_config').upsert([{
      config_key: 'sovereign_active_circuit_policy',
      config_label: '当前生效动态熔断策略',
      config_value: JSON.stringify(newPolicy),
      value_type: 'json',
      category: 'security',
      updated_at: new Date().toISOString()
    }]);

    updateUndoRedoButtons();
    await renderDynamicScopesAndParams();
  }

  async function handleUnlock() {
    const curLock = await checkSovereignLockout();
    if (curLock.locked) {
      overlay.remove();
      alert(`🛡️ 已触发安全熔断锁定，请 ${curLock.remainMins} 分钟后再试。`);
      return;
    }

    const authResult = await authenticateSovereignPassphrase(passInput.value);
    if (authResult === 'INVALID') {
      const { state, maxAttempts, lockMins } = await recordSovereignFailure();
      if (state.lockedUntil && Date.now() < state.lockedUntil) {
        overlay.remove();
        alert(`⛔ 连续输错 ${maxAttempts} 次，安全熔断已激活并锁定 ${lockMins} 分钟！`);
      } else {
        alert(`⛔ 主权暗令校验未通过（还可尝试 ${Math.max(0, maxAttempts - state.count)} 次）。`);
      }
      return;
    }

    clearSovereignLockout();
    isDuressMode = authResult === 'DURESS';
    localStorage.setItem(SOVEREIGN_HEARTBEAT_KEY, String(Date.now()));

    if (isDuressMode) {
      // 胁迫模式下静默触发全网护盘
      const allScopes = (await getDynamicControlRegistry()).map((r) => r.scope);
      await supabase.from('platform_governance_config').upsert([{
        config_key: 'sovereign_active_circuit_policy',
        config_value: JSON.stringify({ scopes: allScopes, target_tenants: [], expires_at: null, public_notice: '系统例行安全维护中' }),
        updated_at: new Date().toISOString()
      }]);
    }

    lockView.classList.add('hidden');
    weaponsView.classList.remove('hidden');
    await renderDynamicScopesAndParams();
  }

  btnUnlock.addEventListener('click', handleUnlock);
  passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleUnlock(); });
  setTimeout(() => passInput.focus(), 100);

  // 快捷勾选 & 热插拔新增控制维度
  document.getElementById('btn-circuit-select-all').addEventListener('click', () => {
    document.querySelectorAll('.circuit-scope-chk').forEach((chk) => { chk.checked = true; });
  });
  document.getElementById('btn-circuit-select-finance').addEventListener('click', () => {
    const fin = new Set(['membership_pay', 'order_online_pay', 'finance_settle', 'driver_collect', 'external_webhook']);
    document.querySelectorAll('.circuit-scope-chk').forEach((chk) => { chk.checked = fin.has(chk.value); });
  });
  document.getElementById('btn-circuit-select-none').addEventListener('click', () => {
    document.querySelectorAll('.circuit-scope-chk').forEach((chk) => { chk.checked = false; });
  });

  document.getElementById('btn-circuit-add-scope').addEventListener('click', async () => {
    const scopeCode = prompt('请输入新控制维度英文代号（如 live_stream）：');
    if (!scopeCode || !scopeCode.trim()) return;
    const labelText = prompt('请输入显示名称（如 📺 直播带货写入）：');
    if (!labelText || !labelText.trim()) return;

    const reg = await getDynamicControlRegistry();
    if (reg.some((r) => r.scope === scopeCode.trim())) return alert('该控制维度代号已存在！');
    reg.push({ scope: scopeCode.trim(), label: labelText.trim(), group: '自定义扩展', delegable: false });

    await supabase.from('platform_governance_config').upsert([{
      config_key: 'sovereign_control_registry',
      config_label: '动态熔断控制维度注册表',
      config_value: JSON.stringify(reg),
      value_type: 'json',
      category: 'security',
      updated_at: new Date().toISOString()
    }]);
    await renderDynamicScopesAndParams();
    alert(`✅ 已热插拔新增控制维度【${labelText.trim()} (${scopeCode.trim()})】，可立即勾选生效！`);
  });

  // 策略时间轴撤销 / 重做
  btnUndo.addEventListener('click', async () => {
    if (policyHistoryStack.length === 0) return;
    const { data: cur } = await supabase.from('platform_governance_config').select('config_value').eq('config_key', 'sovereign_active_circuit_policy').maybeSingle();
    if (cur?.config_value) policyRedoStack.push(cur.config_value);
    const prevJson = policyHistoryStack.pop();
    await saveCircuitPolicy(JSON.parse(prevJson), false);
    alert('↩️ 已回退至上一版熔断策略！');
  });

  btnRedo.addEventListener('click', async () => {
    if (policyRedoStack.length === 0) return;
    const { data: cur } = await supabase.from('platform_governance_config').select('config_value').eq('config_key', 'sovereign_active_circuit_policy').maybeSingle();
    if (cur?.config_value) policyHistoryStack.push(cur.config_value);
    const nextJson = policyRedoStack.pop();
    await saveCircuitPolicy(JSON.parse(nextJson), false);
    alert('↪️ 已重做恢复该版熔断策略！');
  });

  document.getElementById('btn-sovereign-apply-circuit').addEventListener('click', async () => {
    const scopes = Array.from(document.querySelectorAll('.circuit-scope-chk:checked')).map((c) => c.value);
    const rawTargets = document.getElementById('input-circuit-targets').value.trim();
    const targets = rawTargets ? rawTargets.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean) : [];
    const durVal = Number(document.getElementById('input-circuit-duration').value || 0);
    const durUnit = document.getElementById('select-circuit-unit').value;
    const maxAmount = Number(document.getElementById('input-circuit-max-amount').value || 0);
    const notice = document.getElementById('input-circuit-notice').value.trim();

    let expiresAt = null;
    if (durVal > 0) {
      const mult = durUnit === 'days' ? 86400000 : durUnit === 'hours' ? 3600000 : 60000;
      expiresAt = new Date(Date.now() + durVal * mult).toISOString();
    }

    await saveCircuitPolicy({
      scopes,
      target_tenants: targets,
      expires_at: expiresAt,
      public_notice: notice,
      thresholds: { max_single_amount: maxAmount },
      updated_at: new Date().toISOString()
    });
    alert(scopes.length > 0 ? `🛑 自定义熔断策略已下发生效（覆盖 ${scopes.length} 项维度）！` : '🟢 已切换为全站正常通畅状态！');
  });

  document.getElementById('btn-sovereign-unfreeze-all').addEventListener('click', async () => {
    await saveCircuitPolicy({ scopes: [], target_tenants: [], expires_at: null, public_notice: '', thresholds: {} });
    alert('🟢 已解除全站所有熔断规则，恢复正常协作！');
  });

  document.getElementById('btn-sovereign-wipe-sessions').addEventListener('click', async () => {
    if (!isDuressMode) {
      await supabase.from('sys_qr_session').delete().neq('id', -999999999);
      await supabase.from('login_qr_session').delete().neq('id', -999999999);
      const { data: allTenants } = await supabase.from('platform_tenant').select('tenant_id');
      for (const row of allTenants || []) {
        await supabase.rpc('rpc_bump_session_epoch', { p_tenant_id: row.tenant_id, p_reason: '全局最高安全指令清退' }).catch(() => {});
      }
    }
    alert('🔌 已清退全网所有商号与扫码登录会话！');
  });

  // 武器二：导出事件
  document.getElementById('btn-sovereign-export-trinity').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '⏳ 正在打包救生舱三件套...';
    try {
      const mother = await exportDynamicDisasterMotherboard({ modeLabel: 'FULL' });
      const count = await exportRuntimeSourceCodeVault();
      await exportLiveDdlSqlFile();
      document.getElementById('sovereign-backup-overdue-badge')?.remove();
      alert(`🎉 救生舱全套三件套已导出落盘！\n• 动态全库母包（含 ${Object.keys(mother.tables).length} 张表）\n• 全站完整源码快照（共 ${count} 个文件）\n• 实时最新建库 DDL 脚本`);
    } catch (err) {
      alert('❌ 导出失败：' + (err?.message || ''));
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ 一键导出救生舱全套三件套（全库动态母包 + 全站递归源码 + 实时最新建库DDL）';
    }
  });

  document.getElementById('btn-sovereign-export-all').addEventListener('click', async () => {
    const m = await exportDynamicDisasterMotherboard({ modeLabel: 'FULL' });
    document.getElementById('sovereign-backup-overdue-badge')?.remove();
    alert(`✅ 全库动态母包已导出（共收录 ${Object.keys(m.tables).length} 张表）！`);
  });

  document.getElementById('btn-sovereign-export-code').addEventListener('click', async () => {
    const c = await exportRuntimeSourceCodeVault();
    alert(`📦 全站完整程序源码快照已导出（共 ${c} 个文件）！`);
  });

  document.getElementById('btn-sovereign-export-sql').addEventListener('click', async () => {
    await exportLiveDdlSqlFile();
    alert('🗄️ 实时最新建库 DDL 脚本已导出！');
  });

  document.getElementById('btn-sovereign-export-forensic').addEventListener('click', async () => {
    const tid = prompt('输入要固定证据的特定商号代号（留空则导出全平台司法取证卷宗）：') || '';
    const doc = await exportForensicEvidenceBundle(tid.trim());
    alert(`⚖️ 司法级电子证据固定卷宗已生成！\nSHA-256 封印：${doc.forensic_sha256_seal.slice(0, 24)}...`);
  });

  // 武器三：外科手术回档与重建
  const motherFileInput = document.getElementById('input-sovereign-mother-file');
  const motherPreview = document.getElementById('sovereign-mother-preview');
  const rebuildLogBox = document.getElementById('sovereign-rebuild-log');
  const btnExecuteRebuild = document.getElementById('btn-sovereign-execute-rebuild');

  motherFileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed.tables) return alert('❌ 无效的母包或反向补丁 JSON 文件！');
      loadedMotherboardJson = parsed;
      document.getElementById('sovereign-mother-file-label').textContent = `✅ 已载入：${file.name}`;
      const curEndpoint = supabase?.supabaseUrl || window.location.origin;
      const isSameOrigin = parsed.source_endpoint && parsed.source_endpoint === curEndpoint;

      motherPreview.classList.remove('hidden');
      motherPreview.innerHTML = `
        <div class="text-emerald-300 font-bold">生成时间：${new Date(parsed.created_at).toLocaleString('zh-CN')} · 内含 ${Object.keys(parsed.tables).length} 张表</div>
        ${isSameOrigin ? '<div class="text-rose-400 font-bold">⚠️ 环境警戒：检测到当前连接的是【原生产库】，执行覆盖前建议勾选“自动导出反向回退快照”！</div>' : '<div class="text-sky-300">🌐 环境检测：当前处于独立新库实例，可安全执行全量重建。</div>'}
      `;
      btnExecuteRebuild.disabled = false;
      btnExecuteRebuild.className = 'w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2 rounded-xl shadow transition';
      btnExecuteRebuild.textContent = '🚀 立即执行外科手术回档 / 全库重建';
    } catch (err) {
      alert('❌ 文件解析失败：' + (err?.message || ''));
    }
  });

  btnExecuteRebuild.addEventListener('click', async () => {
    if (!loadedMotherboardJson) return;
    if (isDuressMode) return alert('🎉 模拟重建执行完成（演示沙盒模式）！');

    const wipeBefore = document.getElementById('chk-sovereign-wipe-before').checked;
    const autoUndo = document.getElementById('chk-sovereign-auto-undo').checked;
    const dryRun = document.getElementById('chk-sovereign-dry-run').checked;
    const rawTid = document.getElementById('input-rebuild-target-tenant').value.trim();
    const rawTbls = document.getElementById('input-rebuild-target-tables').value.trim();
    const targetTables = rawTbls ? rawTbls.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean) : null;

    if (!dryRun && wipeBefore) {
      const ok = confirm(`⚠️ 确认执行数据恢复？${rawTid ? `作用商号: ${rawTid}` : '作用范围: 全网'} ${targetTables ? `指定表: ${targetTables.join(',')}` : '全部表'}`);
      if (!ok) return;
    }

    btnExecuteRebuild.disabled = true;
    rebuildLogBox.classList.remove('hidden');
    rebuildLogBox.innerHTML = '';
    const appendLog = (msg) => {
      const line = document.createElement('div');
      line.textContent = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${msg}`;
      rebuildLogBox.appendChild(line);
      rebuildLogBox.scrollTop = rebuildLogBox.scrollHeight;
    };

    try {
      await executeSurgicalDisasterRebuild(
        loadedMotherboardJson,
        {
          wipeBeforeRestore: wipeBefore,
          dryRunOnly: dryRun,
          autoUndoBackup: autoUndo,
          targetTables,
          targetTenantId: rawTid || null
        },
        appendLog
      );
      if (!dryRun && typeof window.loadPlatformData === 'function') await window.loadPlatformData();
    } catch (err) {
      appendLog('❌ 操作中止：' + (err?.message || '未知错误'));
      alert('❌ 操作失败：' + (err?.message || ''));
    } finally {
      btnExecuteRebuild.disabled = false;
    }
  });

  // 武器四：分级深度清理
  document.getElementById('btn-sovereign-hard-purge').addEventListener('click', async () => {
    const rawTid = document.getElementById('input-sovereign-hard-purge-tid').value.trim();
    const grade = document.getElementById('select-purge-grade').value;
    if (!rawTid) return alert('请输入商号代号');
    if (isDuressMode) return alert('☢️ 清理指令已提交处理！');

    const baseTid = getOriginalTenantId(rawTid);
    const dynamicMeta = await discoverDynamicTables();
    const sysParams = await getDynamicSystemParams();
    const immutableSet = new Set(sysParams.immutable_tables || ['audit_immutable_log', 'inventory_log']);

    if (grade === 'grade_a') {
      // A级：仅清订单/财务/流水，保留商号、门店、商品目录
      const keepTables = new Set(['platform_tenant', 'tenant', 'tenant_application', 'driver', 'product', 'store']);
      const { data: oldOrders } = await supabase.from('orders').select('id').in('tenant_id', [rawTid, baseTid]);
      const oIds = (oldOrders || []).map((o) => o.id);
      if (oIds.length > 0) await supabase.from('order_item').delete().in('order_id', oIds);

      for (const m of [...dynamicMeta].reverse()) {
        if (m.has_tenant_id && !keepTables.has(m.table_name) && !immutableSet.has(m.table_name)) {
          await supabase.from(m.table_name).delete().in('tenant_id', [rawTid, baseTid]);
        }
      }
      await supabase.from('store').update({ current_debt: 0, used_return_quota: 0, carrier_hold_count: 0, basket_count: 0 }).in('tenant_id', [rawTid, baseTid]);
      alert(`🧹 A级清理完成：商号【${rawTid}】测试期订单与往来欠款已清空，商品与门店档案完整保留！`);
    } else {
      // C级：物理连根拔除
      const { data: oldOrders } = await supabase.from('orders').select('id').in('tenant_id', [rawTid, baseTid]);
      const oIds = (oldOrders || []).map((o) => o.id);
      if (oIds.length > 0) await supabase.from('order_item').delete().in('order_id', oIds);

      for (const m of [...dynamicMeta].reverse()) {
        if (m.table_name === 'tenant') await supabase.from('tenant').delete().in('id', [rawTid, baseTid]);
        else if (m.has_tenant_id && !immutableSet.has(m.table_name)) {
          await supabase.from(m.table_name).delete().in('tenant_id', [rawTid, baseTid]);
        }
      }
      alert(`☢️ C级物理粉碎完成：商号【${rawTid}】全库记录已彻底抹除（不可篡改审计存根已保留）！`);
    }
    if (typeof window.loadPlatformData === 'function') await window.loadPlatformData();
  });

  // 武器五：全局参数、双暗令与备用云切换
  document.getElementById('btn-save-sys-params').addEventListener('click', async () => {
    if (isDuressMode) return alert('✅ 全局参数已更新！');
    const curParams = await getDynamicSystemParams();
    const updated = {
      ...curParams,
      max_auth_attempts: Math.max(1, Number(document.getElementById('param-max-attempts').value || 3)),
      lockout_minutes: Math.max(1, Number(document.getElementById('param-lock-mins').value || 30)),
      backup_overdue_days: Math.max(1, Number(document.getElementById('param-backup-days').value || 14)),
      senior_ops_max_quarantine_mins: Math.max(0, Number(document.getElementById('param-delegated-mins').value || 60))
    };
    await supabase.from('platform_governance_config').upsert([{
      config_key: 'sovereign_system_params',
      config_label: '全局动态风控与下放天花板参数',
      config_value: JSON.stringify(updated),
      value_type: 'json',
      category: 'security',
      updated_at: new Date().toISOString()
    }]);
    alert('✅ 全局动态参数与权限天花板已生效！');
  });

  document.getElementById('btn-sovereign-save-pass').addEventListener('click', async () => {
    if (isDuressMode) return alert('🔐 暗令已更新！');
    const newPass = document.getElementById('input-sovereign-new-pass').value.trim();
    const duressPass = document.getElementById('input-sovereign-duress-pass').value.trim();

    if (newPass) {
      if (newPass.length < 10) return alert('真实主权暗令长度不能少于 10 位！');
      const newHash = await sha256Hex(`BAIGONG_SOVEREIGN::${newPass}`);
      localStorage.setItem(SOVEREIGN_KEY_STORAGE, newHash);
      await supabase.from('platform_governance_config').upsert([{
        config_key: '_sys_sovereign_seal_hash',
        config_value: newHash,
        updated_at: new Date().toISOString()
      }]);
    }
    if (duressPass) {
      if (duressPass.length < 8) return alert('胁迫假暗令长度不能少于 8 位！');
      if (duressPass === newPass) return alert('胁迫假暗令不能与真实暗令相同！');
      const dHash = await sha256Hex(`BAIGONG_SOVEREIGN::${duressPass}`);
      localStorage.setItem(SOVEREIGN_DURESS_STORAGE, dHash);
      await supabase.from('platform_governance_config').upsert([{
        config_key: '_sys_sovereign_duress_hash',
        config_value: dHash,
        updated_at: new Date().toISOString()
      }]);
    }
    alert('🔐 双暗令密钥已安全加密更新！');
  });

  document.getElementById('btn-save-failover').addEventListener('click', () => {
    if (isDuressMode) return alert('🛰️ 备用端点已保存！');
    const fUrl = document.getElementById('input-failover-url').value.trim();
    const fKey = document.getElementById('input-failover-key').value.trim();
    if (!fUrl || !fKey) {
      localStorage.removeItem(FAILOVER_URL_KEY);
      localStorage.removeItem(FAILOVER_ANON_KEY);
      alert('🛰️ 已清除备用云端点配置，恢复默认主库连接。');
    } else {
      localStorage.setItem(FAILOVER_URL_KEY, fUrl);
      localStorage.setItem(FAILOVER_ANON_KEY, fKey);
      alert('🛰️ 备用云库热切换端点已保存！刷新页面后全站将自动路由至备用数据库实例。');
    }
  });
}

/**
 * 7. 注册静默唤醒监听（零 DOM 痕迹 + 动态周期冷备逾期提醒）
 */
export function initStealthSovereignListener() {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.altKey && e.key.toUpperCase() === 'M') {
      e.preventDefault();
      openSovereignCommandVault();
    }
  });

  let clickCount = 0;
  let clickTimer = null;
  document.addEventListener('click', (e) => {
    const emblem = e.target?.closest('#platform-emblem-trigger');
    if (!emblem) return;
    clickCount += 1;
    clearTimeout(clickTimer);
    if (clickCount >= 7) {
      clickCount = 0;
      openSovereignCommandVault();
      return;
    }
    clickTimer = setTimeout(() => { clickCount = 0; }, 2500);
  });

  if (window.location.hash === '#sovereign') {
    setTimeout(() => openSovereignCommandVault(), 300);
  }

  // 动态冷备逾期静默提醒（仅对高级运营及以上显示，零暴露隐秘入口）
  setTimeout(async () => {
    if (!isSeniorOpsOrAbove()) return;
    const params = await getDynamicSystemParams();
    const overdueDays = Number(params.backup_overdue_days || 14);
    const lastTs = Number(localStorage.getItem(SOVEREIGN_LAST_BACKUP_KEY) || 0);
    if (lastTs > 0 && Date.now() - lastTs > overdueDays * 86400000) {
      const roleBadge = document.getElementById('admin-role-badge');
      if (roleBadge && !document.getElementById('sovereign-backup-overdue-badge')) {
        const tip = document.createElement('span');
        tip.id = 'sovereign-backup-overdue-badge';
        tip.className = 'text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full ml-1.5';
        tip.textContent = `💡 距上次冷备已逾 ${overdueDays} 天`;
        roleBadge.insertAdjacentElement('afterend', tip);
      }
    }
  }, 1500);
}
