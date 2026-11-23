import { supabase } from '../../lib/supabase.js';
import { platformState, recordAuditLog } from './platformState.js';

const ARCHIVE_TAG = '__ARCHIVED_';
const SOVEREIGN_KEY_STORAGE = 'baigong_sovereign_master_hash';
const DEFAULT_SOVEREIGN_PASSPHRASE = 'SOVEREIGN#2026';

/**
 * 获取当前登录管理员角色（兼容旧库 null / super_admin 默认映射为 senior_ops，绝不暴露更高层级）
 */
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
 * 分页全量拉取指定表的所有记录（突破单次 1000 行上限，确保铁证与流水一字不漏）
 */
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
    if (error) {
      // 兼容不同部署环境中部分可选表不存在的情况
      return [];
    }
    if (!Array.isArray(data) || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

/**
 * 1. 全量导出单商号 JSON 备份（覆盖全部 14 张商号主表与业务子表 + 完整操作审计铁证）
 */
export async function exportTenantFullBackup(tenantId, companyName = '', silent = false) {
  if (!tenantId) throw new Error('缺少商号代号 (tenantId)');

  const [
    ptRows,
    tRows,
    driverRows,
    prodRows,
    storeRows,
    leadRows,
    storeOrderRows,
    ordersRows,
    driverColRows,
    payRecRows,
    invLogRows,
    poolRows,
    planRows,
    auditRows
  ] = await Promise.all([
    fetchAllRowsFromTable('platform_tenant', 'tenant_id', tenantId),
    fetchAllRowsFromTable('tenant', 'id', tenantId),
    fetchAllRowsFromTable('driver', 'tenant_id', tenantId),
    fetchAllRowsFromTable('product', 'tenant_id', tenantId),
    fetchAllRowsFromTable('store', 'tenant_id', tenantId),
    fetchAllRowsFromTable('store_lead', 'tenant_id', tenantId),
    fetchAllRowsFromTable('store_order', 'tenant_id', tenantId),
    fetchAllRowsFromTable('orders', 'tenant_id', tenantId),
    fetchAllRowsFromTable('driver_collection_log', 'tenant_id', tenantId),
    fetchAllRowsFromTable('payment_record', 'tenant_id', tenantId),
    fetchAllRowsFromTable('inventory_log', 'tenant_id', tenantId),
    fetchAllRowsFromTable('local_inventory_pool', 'tenant_id', tenantId),
    fetchAllRowsFromTable('demand_forecast_plan', 'tenant_id', tenantId),
    fetchAllRowsFromTable('audit_immutable_log', 'tenant_id', tenantId)
  ]);

  const orderIds = ordersRows.map((o) => o.id).filter(Boolean);
  let orderItems = [];
  if (orderIds.length > 0) {
    for (let i = 0; i < orderIds.length; i += 200) {
      const chunk = orderIds.slice(i, i + 200);
      const { data } = await supabase.from('order_item').select('*').in('order_id', chunk);
      if (Array.isArray(data)) orderItems = orderItems.concat(data);
    }
  }

  const cleanTid = getOriginalTenantId(tenantId);
  const safePlatformTenants = ptRows.map((row) => {
    const { access_key, totp_secret, reset_claim_token, ...safeRow } = row;
    return {
      ...safeRow,
      tenant_id: cleanTid,
      credit_code: getOriginalCreditCode(safeRow.credit_code)
    };
  });

  const tables = {
    platform_tenant: safePlatformTenants,
    tenant: tRows.map((r) => ({ ...r, id: cleanTid })),
    driver: driverRows,
    product: prodRows,
    store: storeRows,
    store_lead: leadRows,
    store_order: storeOrderRows,
    orders: ordersRows,
    order_item: orderItems,
    driver_collection_log: driverColRows,
    payment_record: payRecRows,
    inventory_log: invLogRows,
    local_inventory_pool: poolRows,
    demand_forecast_plan: planRows,
    audit_immutable_log: auditRows
  };

  const resolvedName = companyName || safePlatformTenants[0]?.company_name || cleanTid;
  const payload = {
    schema_version: 'baigong_tenant_snapshot_v2',
    exported_at: new Date().toISOString(),
    tenant_id: cleanTid,
    company_name: resolvedName,
    summary: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
    tables,
    audit_snapshot: auditRows
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BAIGONG_BACKUP_${cleanTid}_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  if (!silent) {
    await recordAuditLog('导出商号全量数据与审计铁证快照', 'INFO', {
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
 * 2. 打开商号 JSON 备份无损导入恢复弹窗（带自增 ID 映射与跨商号克隆）
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
          ⚠️ <b>跨商号克隆提示：</b>该快照源自 <span id="src-tenant-label" class="font-mono font-bold"></span>。系统将自动改写所有归属为 <b class="font-mono">${targetTenantId}</b> 并重建主外键映射，绝不影响源商号。
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
            <option value="clone_catalog_only">🌱 仅克隆基础档案（仅导入商品库+门店+司机，欠款归零，跳过历史订单）</option>
          </select>
        </div>

        <label class="flex items-start gap-2 bg-rose-50/70 border border-rose-200 p-2.5 rounded-xl text-[11px] text-rose-900 cursor-pointer">
          <input type="checkbox" id="chk-confirm-import-risk" class="mt-0.5 rounded text-rose-600">
          <span>我已核对快照内容无误，确认执行数据恢复并记入天道明鉴审计日志。</span>
        </label>
      </div>

      <div class="flex gap-2 pt-1">
        <button type="button" id="btn-cancel-import" class="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-2.5 rounded-2xl">取消</button>
        <button type="button" id="btn-execute-import" disabled
          class="flex-1 bg-stone-300 text-stone-500 font-bold py-2.5 rounded-2xl cursor-not-allowed transition">
          开始执行恢复
        </button>
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

  const tableLabels = {
    product: '货品目录',
    store: '合作门店',
    driver: '执事/司机',
    store_lead: '意向线索',
    store_order: '门店配送单',
    orders: '标准订单',
    order_item: '订单明细',
    driver_collection_log: '随车收款',
    payment_record: '财务核销',
    inventory_log: '库存流水',
    local_inventory_pool: '余缺调剂',
    demand_forecast_plan: '要货计划',
    audit_immutable_log: '审计铁证'
  };

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
      if (json.schema_version !== 'baigong_tenant_snapshot_v2' || !json.tables) {
        alert('❌ 格式不符：请选择本系统导出的 v2 版商号全量快照 JSON 文件。');
        parsedBackup = null;
        previewPanel.classList.add('hidden');
        updateBtnState();
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

      tableCountsEl.innerHTML = Object.entries(tableLabels)
        .map(([key, label]) => {
          const cnt = Array.isArray(json.tables[key]) ? json.tables[key].length : 0;
          return `<div class="bg-white px-2 py-1 rounded-lg border border-emerald-100 flex justify-between">
            <span class="text-stone-600">${label}</span>
            <b class="font-mono text-emerald-900">${cnt}</b>
          </div>`;
        })
        .join('');

      updateBtnState();
    } catch (err) {
      alert('❌ JSON 解析失败：' + (err?.message || '文件损坏'));
      parsedBackup = null;
      previewPanel.classList.add('hidden');
      updateBtnState();
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
            if (oldOrderIds.length > 0) {
              await supabase.from('order_item').delete().in('order_id', oldOrderIds);
            }
            const clearTables = [
              'payment_record',
              'driver_collection_log',
              'inventory_log',
              'local_inventory_pool',
              'demand_forecast_plan',
              'orders',
              'store_order',
              'store_lead',
              'store',
              'product',
              'driver'
            ];
            for (const tbl of clearTables) {
              await supabase.from(tbl).delete().eq('tenant_id', targetTenantId);
            }
          }

          if (!isCloneCatalogOnly && Array.isArray(t.platform_tenant) && t.platform_tenant[0]) {
            const {
              id,
              tenant_id,
              access_key,
              totp_secret,
              totp_enabled,
              reset_claim_token,
              session_epoch,
              created_at,
              ...safeConfig
            } = t.platform_tenant[0];
            await supabase.from('platform_tenant').update(safeConfig).eq('tenant_id', targetTenantId);
          }

          if (Array.isArray(t.driver) && t.driver.length > 0) {
            const rows = t.driver.map(({ id, ...rest }) => ({ ...rest, tenant_id: targetTenantId }));
            const { error } = await supabase.from('driver').insert(rows);
            if (error) throw new Error('恢复司机/执事表失败：' + error.message);
            restoredTotal += rows.length;
          }

          if (Array.isArray(t.product) && t.product.length > 0) {
            for (const oldProd of t.product) {
              const { id: oldId, ...rest } = oldProd;
              const { data: inserted, error } = await supabase
                .from('product')
                .insert([{ ...rest, tenant_id: targetTenantId }])
                .select('id')
                .single();
              if (error) throw new Error(`恢复商品【${oldProd.name}】失败：${error.message}`);
              if (oldId != null && inserted?.id != null) {
                productIdMap.set(String(oldId), inserted.id);
              }
              restoredTotal += 1;
            }
          }

          if (Array.isArray(t.store) && t.store.length > 0) {
            for (const oldStore of t.store) {
              const { id: oldId, ...rest } = oldStore;
              const mappedVisibleIds = Array.isArray(rest.visible_product_ids)
                ? rest.visible_product_ids
                    .map((pid) => productIdMap.get(String(pid)))
                    .filter((v) => v != null)
                : rest.visible_product_ids;

              let mappedCustomPricing = rest.custom_pricing;
              if (mappedCustomPricing && typeof mappedCustomPricing === 'object' && !Array.isArray(mappedCustomPricing)) {
                const nextPricing = {};
                for (const [oldPid, priceVal] of Object.entries(mappedCustomPricing)) {
                  const newPid = productIdMap.get(String(oldPid)) || oldPid;
                  nextPricing[String(newPid)] = priceVal;
                }
                mappedCustomPricing = nextPricing;
              }

              const { data: inserted, error } = await supabase
                .from('store')
                .insert([
                  {
                    ...rest,
                    tenant_id: targetTenantId,
                    visible_product_ids: mappedVisibleIds,
                    custom_pricing: mappedCustomPricing,
                    current_debt: isCloneCatalogOnly ? 0 : rest.current_debt,
                    used_return_quota: isCloneCatalogOnly ? 0 : rest.used_return_quota,
                    carrier_hold_count: isCloneCatalogOnly ? 0 : rest.carrier_hold_count,
                    basket_count: isCloneCatalogOnly ? 0 : rest.basket_count
                  }
                ])
                .select('id')
                .single();
              if (error) throw new Error(`恢复门店【${oldStore.name}】失败：${error.message}`);
              if (oldId != null && inserted?.id != null) {
                storeIdMap.set(String(oldId), inserted.id);
              }
              restoredTotal += 1;
            }
          }

          if (Array.isArray(t.store_lead) && t.store_lead.length > 0) {
            const rows = t.store_lead.map(({ id, ...rest }) => ({ ...rest, tenant_id: targetTenantId }));
            const { error } = await supabase.from('store_lead').insert(rows);
            if (error) throw new Error('恢复意向门店线索失败：' + error.message);
            restoredTotal += rows.length;
          }

          if (!isCloneCatalogOnly) {
            if (Array.isArray(t.store_order) && t.store_order.length > 0) {
              const rows = t.store_order.map(({ id, ...rest }) => ({
                ...rest,
                tenant_id: targetTenantId,
                store_id: storeIdMap.get(String(rest.store_id)) || rest.store_id,
                items: remapOrderItemsJson(rest.items, productIdMap),
                items_return: remapOrderItemsJson(rest.items_return, productIdMap),
                items_exchange: remapOrderItemsJson(rest.items_exchange, productIdMap)
              }));
              const { error } = await supabase.from('store_order').insert(rows);
              if (error) throw new Error('恢复门店配送单失败：' + error.message);
              restoredTotal += rows.length;
            }

            if (Array.isArray(t.orders) && t.orders.length > 0) {
              for (const oldOrder of t.orders) {
                const { id: oldId, ...rest } = oldOrder;
                const { data: inserted, error } = await supabase
                  .from('orders')
                  .insert([
                    {
                      ...rest,
                      tenant_id: targetTenantId,
                      store_id: rest.store_id != null ? storeIdMap.get(String(rest.store_id)) || rest.store_id : null
                    }
                  ])
                  .select('id')
                  .single();
                if (error) throw new Error(`恢复订单【${oldOrder.order_no}】失败：${error.message}`);
                if (oldId != null && inserted?.id != null) {
                  orderIdMap.set(String(oldId), inserted.id);
                }
                restoredTotal += 1;
              }
            }

            if (Array.isArray(t.order_item) && t.order_item.length > 0) {
              const rows = t.order_item.map(({ id, ...rest }) => ({
                ...rest,
                order_id: rest.order_id != null ? orderIdMap.get(String(rest.order_id)) || rest.order_id : null,
                product_id: rest.product_id != null ? productIdMap.get(String(rest.product_id)) || rest.product_id : null
              }));
              const { error } = await supabase.from('order_item').insert(rows);
              if (error) throw new Error('恢复订单明细失败：' + error.message);
              restoredTotal += rows.length;
            }

            if (Array.isArray(t.driver_collection_log) && t.driver_collection_log.length > 0) {
              const rows = t.driver_collection_log.map(({ id, ...rest }) => ({
                ...rest,
                tenant_id: targetTenantId,
                store_id: storeIdMap.get(String(rest.store_id)) || rest.store_id
              }));
              const { error } = await supabase.from('driver_collection_log').insert(rows);
              if (error) throw new Error('恢复随车收款记录失败：' + error.message);
              restoredTotal += rows.length;
            }

            if (Array.isArray(t.payment_record) && t.payment_record.length > 0) {
              const rows = t.payment_record.map(({ id, ...rest }) => ({
                ...rest,
                tenant_id: targetTenantId,
                store_id: rest.store_id != null ? storeIdMap.get(String(rest.store_id)) || rest.store_id : null,
                order_id: rest.order_id != null ? orderIdMap.get(String(rest.order_id)) || rest.order_id : null
              }));
              const { error } = await supabase.from('payment_record').insert(rows);
              if (error) throw new Error('恢复财务核销记录失败：' + error.message);
              restoredTotal += rows.length;
            }

            if (Array.isArray(t.inventory_log) && t.inventory_log.length > 0) {
              const rows = t.inventory_log.map(({ id, ...rest }) => ({
                ...rest,
                tenant_id: targetTenantId,
                product_id: productIdMap.get(String(rest.product_id)) || rest.product_id
              }));
              const { error } = await supabase.from('inventory_log').insert(rows);
              if (error) throw new Error('恢复库存流水失败：' + error.message);
              restoredTotal += rows.length;
            }

            if (Array.isArray(t.local_inventory_pool) && t.local_inventory_pool.length > 0) {
              const rows = t.local_inventory_pool.map(({ id, ...rest }) => ({
                ...rest,
                tenant_id: targetTenantId,
                from_store_id: storeIdMap.get(String(rest.from_store_id)) || rest.from_store_id,
                to_store_id: rest.to_store_id != null ? storeIdMap.get(String(rest.to_store_id)) || rest.to_store_id : null,
                product_id: rest.product_id != null ? productIdMap.get(String(rest.product_id)) || rest.product_id : null
              }));
              const { error } = await supabase.from('local_inventory_pool').insert(rows);
              if (error) throw new Error('恢复余缺调剂池失败：' + error.message);
              restoredTotal += rows.length;
            }

            if (Array.isArray(t.demand_forecast_plan) && t.demand_forecast_plan.length > 0) {
              const rows = t.demand_forecast_plan.map(({ id, ...rest }) => ({
                ...rest,
                tenant_id: targetTenantId,
                store_id: storeIdMap.get(String(rest.store_id)) || rest.store_id,
                items: remapOrderItemsJson(rest.items, productIdMap)
              }));
              const { error } = await supabase.from('demand_forecast_plan').insert(rows);
              if (error) throw new Error('恢复要货预测计划失败：' + error.message);
              restoredTotal += rows.length;
            }
          }

          await recordAuditLog('商号JSON快照无损导入恢复', 'CRITICAL_2FA', {
            target_tenant_id: targetTenantId,
            source_tenant_id: parsedBackup.tenant_id,
            restore_mode: mode,
            restored_rows: restoredTotal
          });

          alert(`✅ 无损恢复成功！共重建并重映射 ${restoredTotal} 条业务记录（主外键与专属定价已自动对齐）。`);
          modal.remove();
          if (typeof window.loadPlatformData === 'function') {
            await window.loadPlatformData();
          }
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
 * 3. 高级运营管理专属：软删除归档销号（隐藏主列表 + 释放营业执照供重新注册 + 随时可在回收站一键复活）
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
            执行后，商号 <b class="font-mono underline">${cleanName} (${tenantId})</b> 将从在册名册隐藏并停用全部终端登录，同时<b>立即释放其营业执照与商号注册资格</b>；历史账本将完整转入【商号归档回收站】，随时可一键无损恢复。
          </p>
        </div>
      </div>

      <div class="bg-amber-50/80 border border-amber-300 rounded-2xl p-3 space-y-2">
        <div class="flex justify-between items-center">
          <b class="text-amber-950">第一关：留存离场全量数据快照 *</b>
          <span id="purge-step1-badge" class="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold">未备份</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" id="btn-purge-download-backup"
            class="flex-1 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold py-2 rounded-xl shadow-2xs active:scale-95 transition">
            📥 立即下载商号全量快照
          </button>
          <label class="flex items-center gap-1 text-[10px] text-stone-600 cursor-pointer shrink-0">
            <input type="checkbox" id="chk-purge-skip-backup" class="rounded text-rose-600">
            <span>跳过本地下载</span>
          </label>
        </div>
      </div>

      <div class="bg-stone-50 border border-stone-200 rounded-2xl p-3 space-y-2.5">
        <b class="text-stone-900 block">第二关：人工手写核验（防误触）*</b>
        <div>
          <label class="block text-[11px] text-stone-600 mb-1">
            1. 请输入完整商号代号 <code class="bg-stone-200 text-rose-700 font-bold px-1.5 py-0.5 rounded select-all">${tenantId}</code>：
          </label>
          <input type="text" id="input-purge-tenant-id" autocomplete="off" placeholder="区分大小写，如 ${tenantId}"
            class="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 font-mono font-bold text-stone-900 outline-none focus:border-rose-600">
        </div>
        <div>
          <label class="block text-[11px] text-stone-600 mb-1">
            2. 请输入确认词 <code class="bg-stone-200 text-rose-700 font-bold px-1.5 py-0.5 rounded">${expectedPhrase}</code>：
          </label>
          <input type="text" id="input-purge-phrase" autocomplete="off" placeholder="请手打输入：${expectedPhrase}"
            class="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 font-bold text-stone-900 outline-none focus:border-rose-600">
        </div>
      </div>

      <div class="pt-1 space-y-2">
        <div id="purge-countdown-tip" class="hidden text-center text-[11px] font-bold text-rose-700 bg-rose-50 py-1.5 rounded-xl border border-rose-200">
          ⏳ 核验通过，请保持冷静等待 <span id="purge-sec-num" class="font-mono text-sm">8</span> 秒后解锁最终按钮...
        </div>

        <div class="flex gap-2">
          <button type="button" id="btn-purge-cancel"
            class="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-3 rounded-2xl transition">
            安全取消
          </button>
          <button type="button" id="btn-purge-confirm-final" disabled
            class="flex-1 bg-stone-300 text-stone-500 font-bold py-3 rounded-2xl cursor-not-allowed transition">
            🔒 请先完成上方关卡
          </button>
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
  const btnCancel = document.getElementById('btn-purge-cancel');

  function cleanupAndClose() {
    if (countdownTimer) clearInterval(countdownTimer);
    modal.remove();
  }

  function evaluateAllGates() {
    const step1Passed = backupDone || chkSkipBackup.checked;
    const step2Passed =
      inputTenant.value.trim() === String(tenantId).trim() &&
      inputPhrase.value.trim() === expectedPhrase;

    if (!step1Passed || !step2Passed) {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
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
          btnFinal.className =
            'flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-3 rounded-2xl shadow-lg active:scale-95 transition';
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
      alert('导出快照失败：' + (err?.message || '请检查网络后重试'));
      btnBackup.textContent = '📥 立即下载商号全量快照';
    } finally {
      btnBackup.disabled = false;
    }
  });

  chkSkipBackup.addEventListener('change', evaluateAllGates);
  inputTenant.addEventListener('input', evaluateAllGates);
  inputPhrase.addEventListener('input', evaluateAllGates);
  btnCancel.addEventListener('click', cleanupAndClose);

  btnFinal.addEventListener('click', () => {
    if (!countdownFinished) return;

    window.triggerPlatform2FA(
      `⚠️ 高级运营 2FA 核验：即将对商号【${cleanName}】(${tenantId}) 执行销号归档隐藏，并释放其营业执照重新注册资格：`,
      async () => {
        btnFinal.disabled = true;
        btnFinal.textContent = '正在归档封存并释放名额...';

        try {
          const { data: targetRow, error: fetchErr } = await supabase
            .from('platform_tenant')
            .select('*')
            .eq('tenant_id', tenantId)
            .single();

          if (fetchErr || !targetRow) throw new Error('未找到该商号档案，可能已被处理。');

          const archiveSuffix = `${ARCHIVE_TAG}${Date.now()}`;
          const archivedTenantId = `${tenantId}${archiveSuffix}`;
          const archivedCreditCode = targetRow.credit_code ? `${targetRow.credit_code}${archiveSuffix}` : null;
          const operatorName = sessionStorage.getItem('p_auth_name') || '高级运营管理';

          const { error: upErr } = await supabase
            .from('platform_tenant')
            .update({
              tenant_id: archivedTenantId,
              credit_code: archivedCreditCode,
              membership_status: 'archived_purged',
              is_active: false,
              admin_remark: `[${new Date().toLocaleString('zh-CN')}] 由 ${operatorName} 执行销号归档（原代号:${tenantId}）`
            })
            .eq('id', targetRow.id);

          if (upErr) throw new Error('归档封存失败：' + upErr.message);

          await supabase.from('tenant').update({ id: archivedTenantId, status: 'archived' }).eq('id', tenantId);
          await supabase
            .from('tenant_application')
            .update({
              tenant_id: archivedTenantId,
              credit_code: archivedCreditCode,
              application_status: 'archived'
            })
            .eq('tenant_id', tenantId);

          await recordAuditLog('商号销号归档封存（释放注册名额）', 'CRITICAL_2FA', {
            original_tenant_id: tenantId,
            archived_tenant_id: archivedTenantId,
            company_name: cleanName
          });

          cleanupAndClose();
          alert(
            `✅ 商号【${cleanName}】已销号归档隐藏！\n\n• 营业执照与商号注册名额已释放，可随时重新申请入驻；\n• 原全套账本数据已安全封存至【归档回收站与团队权限】，随时可一键无损复活。`
          );
          if (typeof window.loadPlatformData === 'function') {
            await window.loadPlatformData();
          }
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
        const { data: conflict } = await supabase
          .from('platform_tenant')
          .select('id, company_name')
          .eq('tenant_id', origTid)
          .limit(1);

        if (conflict && conflict.length > 0) {
          return alert(
            `⚠️ 恢复冲突：当前已有同代号在册商号【${conflict[0].company_name} (${origTid})】！\n请先将该占用的商号归档或导出快照克隆恢复。`
          );
        }

        const { data: row, error: fetchErr } = await supabase
          .from('platform_tenant')
          .select('*')
          .eq('id', archivedRowId)
          .single();

        if (fetchErr || !row) throw new Error('未找到归档记录');

        const origCreditCode = getOriginalCreditCode(row.credit_code);

        const { error: upErr } = await supabase
          .from('platform_tenant')
          .update({
            tenant_id: origTid,
            credit_code: origCreditCode || null,
            membership_status: 'active',
            is_active: true,
            admin_remark: `[${new Date().toLocaleString('zh-CN')}] 已从归档回收站一键无损复活`
          })
          .eq('id', archivedRowId);

        if (upErr) throw new Error('恢复失败：' + upErr.message);

        await supabase.from('tenant').update({ id: origTid, status: 'active' }).eq('id', archivedTenantId);
        await supabase
          .from('tenant_application')
          .update({
            tenant_id: origTid,
            credit_code: origCreditCode || null,
            application_status: 'approved'
          })
          .eq('tenant_id', archivedTenantId);

        await recordAuditLog('从回收站一键无损复活商号', 'CRITICAL_2FA', {
          tenant_id: origTid,
          company_name: companyName
        });

        alert(`🎉 商号【${companyName} (${origTid})】已一键无损复活！原门店、商品、订单与往来账本已全部恢复连通。`);
        if (typeof window.loadPlatformData === 'function') {
          await window.loadPlatformData();
        }
      } catch (err) {
        alert('❌ 一键复活失败：' + (err?.message || '未知错误'));
      }
    }
  );
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
                <option value="senior_ops" ${normalizedRole === 'senior_ops' ? 'selected' : ''}>👑 高级运营管理（含归档/恢复/灾备）</option>
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
 * 6. 终极运营管理者「三零隐身秘密武器 · 全栈灾难母舰引擎 v2」
 *    - 涵盖：26 张全库核心业务表 + 不可篡改审计铁证 + 操作日志 + 程序源码快照
 *    - 具备：SHA-256 防篡改验签 + 空白新环境一键自举重建 + 全网终端紧急踢出
 * ============================================================================
 */
const MOTHERBOARD_TABLES = [
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
  'sys_qr_session'
];

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifySovereignPassphrase(inputPass) {
  const trimmed = String(inputPass || '').trim();
  if (!trimmed) return false;
  const inputHash = await sha256Hex(`BAIGONG_SOVEREIGN::${trimmed}`);

  const savedLocalHash = localStorage.getItem(SOVEREIGN_KEY_STORAGE);
  if (savedLocalHash) {
    return inputHash === savedLocalHash;
  }

  const { data: cfg } = await supabase
    .from('platform_governance_config')
    .select('config_value')
    .eq('config_key', '_sys_sovereign_seal_hash')
    .maybeSingle();

  if (cfg?.config_value) {
    return inputHash === cfg.config_value;
  }

  const defaultHash = await sha256Hex(`BAIGONG_SOVEREIGN::${DEFAULT_SOVEREIGN_PASSPHRASE}`);
  return inputHash === defaultHash;
}

/**
 * 打包导出全平台 26 表全量数据 + 不可篡改审计铁证 + 操作流水（带 SHA-256 防篡改验真封印）
 */
async function exportFullPlatformDisasterMotherboard() {
  const snapshot = {};
  for (const tbl of MOTHERBOARD_TABLES) {
    snapshot[tbl] = await fetchAllRowsFromTable(tbl);
  }

  const canonicalJson = JSON.stringify(snapshot);
  const integritySeal = await sha256Hex(`BAIGONG_MOTHERBOARD_SEAL::${canonicalJson}`);

  const motherPayload = {
    schema_version: 'baigong_sovereign_disaster_motherboard_v2',
    created_at: new Date().toISOString(),
    integrity_sha256: integritySeal,
    evidence_summary: {
      immutable_audit_logs: snapshot.audit_immutable_log.length,
      compliance_arbitration_cases: snapshot.platform_compliance_case.length,
      inventory_operation_logs: snapshot.inventory_log.length,
      financial_payment_records: snapshot.payment_record.length,
      driver_collection_logs: snapshot.driver_collection_log.length,
      total_tenants: snapshot.platform_tenant.length,
      total_orders: snapshot.orders.length + snapshot.store_order.length
    },
    table_counts: Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length])),
    tables: snapshot
  };

  const blob = new Blob([JSON.stringify(motherPayload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SOVEREIGN_FULL_DISASTER_MOTHERBOARD_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * 打包当前运行时程序源码快照（捕获 HTML 入口与所有已加载 JS 模块源码，供离线代码容灾）
 */
async function exportRuntimeSourceCodeVault() {
  const candidateUrls = new Set([
    './platform.html',
    './hq.html',
    './join.html',
    './mall.html',
    './index.html',
    './src/modules/platformController.js',
    './src/modules/platform/platformState.js',
    './src/modules/platform/platformAuthModule.js',
    './src/modules/platform/platformTenantModule.js',
    './src/modules/platform/tenantLifecycleModule.js',
    './src/modules/platform/platformAuditModule.js',
    './src/modules/platform/platformGovernanceModule.js',
    './src/utils/authSecurity.js',
    './src/utils/totp.js',
    './src/lib/supabase.js'
  ]);

  // 自动收集当前页面性能资源列表中的所有同源 JS/CSS 脚本
  if (typeof performance !== 'undefined' && performance.getEntriesByType) {
    performance.getEntriesByType('resource').forEach((entry) => {
      if (entry.name && entry.name.startsWith(window.location.origin)) {
        candidateUrls.add(entry.name);
      }
    });
  }

  const capturedFiles = {};
  for (const rawUrl of candidateUrls) {
    try {
      const resp = await fetch(rawUrl, { cache: 'no-store' });
      if (resp.ok) {
        const text = await resp.text();
        if (text && text.length > 0 && !text.startsWith('<!DOCTYPE html>') || rawUrl.endsWith('.html') || rawUrl.endsWith('/')) {
          const cleanKey = rawUrl.replace(window.location.origin, '');
          capturedFiles[cleanKey] = text;
        }
      }
    } catch (e) {}
  }

  const bundlePayload = {
    schema_version: 'baigong_runtime_source_vault_v1',
    captured_at: new Date().toISOString(),
    origin: window.location.origin,
    file_count: Object.keys(capturedFiles).length,
    files: capturedFiles
  };

  const blob = new Blob([JSON.stringify(bundlePayload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SOVEREIGN_PROGRAM_SOURCE_VAULT_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return bundlePayload.file_count;
}

/**
 * 批量分片安全插入（自动剥离自增 id 冲突并兼容表结构）
 */
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
      // 若表无主键冲突约束则降级为普通 insert
      const { error: insErr } = await supabase.from(tableName).insert(chunk);
      if (!insErr) inserted += chunk.length;
    }
  }
  return inserted;
}

/**
 * 终极灾难母包一键全库重建引擎（在空白新库或遭破坏环境中按拓扑外键序重建 26 张表 + 审计铁证）
 */
async function executeFullMotherboardDisasterRebuild(motherJson, wipeBeforeRestore, logCallback) {
  if (!motherJson || !motherJson.tables) {
    throw new Error('无效的灾难恢复母包文件');
  }

  // 1. 校验 SHA-256 防篡改封印（v2 母包强制验真）
  if (motherJson.schema_version === 'baigong_sovereign_disaster_motherboard_v2' && motherJson.integrity_sha256) {
    logCallback('🔍 正在校验灾难母包 SHA-256 防篡改完整性封印...');
    const computed = await sha256Hex(`BAIGONG_MOTHERBOARD_SEAL::${JSON.stringify(motherJson.tables)}`);
    if (computed !== motherJson.integrity_sha256) {
      throw new Error('⛔ 验签失败！该母包文件在离线保存期间遭到过篡改或损坏，系统已拒绝灌入以防污染！');
    }
    logCallback('✅ 母包 SHA-256 完整性封印验证通过，铁证无损！');
  }

  const t = motherJson.tables;

  // 2. 若勾选重建前清扫残余脏数据，按外键逆序清理
  if (wipeBeforeRestore) {
    logCallback('🧹 正在按外键逆序清扫当前数据库残余脏数据...');
    const reverseOrder = [...MOTHERBOARD_TABLES].reverse();
    for (const tbl of reverseOrder) {
      // 使用通用条件清空表（兼容 text 主键与 numeric 主键）
      await supabase.from(tbl).delete().neq('id', -999999999);
      await supabase.from(tbl).delete().neq('tenant_id', '__NONE__');
      await supabase.from(tbl).delete().neq('config_key', '__NONE__');
    }
  }

  let totalRestored = 0;

  // 3. 第一梯队：系统根基（管理员凭证、治理配置、会员档位、标准品类树）
  logCallback('🏛️ [1/5] 正在重建管理员凭证库、全域治理参数与会员等级体系...');
  totalRestored += await batchInsertTableRows('platform_admin_credential', t.platform_admin_credential);
  totalRestored += await batchInsertTableRows('platform_governance_config', t.platform_governance_config, true);
  totalRestored += await batchInsertTableRows('platform_gov_configs', t.platform_gov_configs);
  totalRestored += await batchInsertTableRows('platform_membership_plan', t.platform_membership_plan);

  // 重建标准品类树并映射父子 parent_id
  if (Array.isArray(t.platform_category) && t.platform_category.length > 0) {
    const catIdMap = new Map();
    const l1Cats = t.platform_category.filter((c) => c.level === 1 || !c.parent_id);
    const l2Cats = t.platform_category.filter((c) => c.level === 2 && c.parent_id);
    for (const c1 of l1Cats) {
      const { id: oldId, ...rest } = c1;
      const { data: ins } = await supabase.from('platform_category').insert([rest]).select('id').single();
      if (oldId != null && ins?.id != null) catIdMap.set(String(oldId), ins.id);
      totalRestored += 1;
    }
    for (const c2 of l2Cats) {
      const { id: oldId, ...rest } = c2;
      const mappedParent = catIdMap.get(String(rest.parent_id)) || rest.parent_id;
      await supabase.from('platform_category').insert([{ ...rest, parent_id: mappedParent }]);
      totalRestored += 1;
    }
  }
  totalRestored += await batchInsertTableRows('platform_category_dict', t.platform_category_dict);
  totalRestored += await batchInsertTableRows('platform_standard_category', t.platform_standard_category);

  // 4. 第二梯队：在册商号主档与入驻资质档案
  logCallback('🏢 [2/5] 正在重建全网商号主档、入驻申请资质与执事司机名册...');
  totalRestored += await batchInsertTableRows('platform_tenant', t.platform_tenant);
  totalRestored += await batchInsertTableRows('tenant', t.tenant, true);
  totalRestored += await batchInsertTableRows('tenant_application', t.tenant_application);
  totalRestored += await batchInsertTableRows('driver', t.driver);

  // 5. 第三梯队：全网商品库、合作门店与订单（重建自增 ID 映射）
  logCallback('📦 [3/5] 正在重建全网商品库、合作门店（含一店一价重映射）与订单主档...');
  const productIdMap = new Map();
  if (Array.isArray(t.product)) {
    for (const oldProd of t.product) {
      const { id: oldId, ...rest } = oldProd;
      const { data: ins } = await supabase.from('product').insert([rest]).select('id').single();
      if (oldId != null && ins?.id != null) productIdMap.set(String(oldId), ins.id);
      totalRestored += 1;
    }
  }

  const storeIdMap = new Map();
  if (Array.isArray(t.store)) {
    for (const oldStore of t.store) {
      const { id: oldId, ...rest } = oldStore;
      const mappedVisible = Array.isArray(rest.visible_product_ids)
        ? rest.visible_product_ids.map((pid) => productIdMap.get(String(pid))).filter((v) => v != null)
        : rest.visible_product_ids;
      let mappedPricing = rest.custom_pricing;
      if (mappedPricing && typeof mappedPricing === 'object' && !Array.isArray(mappedPricing)) {
        const nextP = {};
        for (const [k, v] of Object.entries(mappedPricing)) {
          nextP[String(productIdMap.get(String(k)) || k)] = v;
        }
        mappedPricing = nextP;
      }
      const { data: ins } = await supabase
        .from('store')
        .insert([{ ...rest, visible_product_ids: mappedVisible, custom_pricing: mappedPricing }])
        .select('id')
        .single();
      if (oldId != null && ins?.id != null) storeIdMap.set(String(oldId), ins.id);
      totalRestored += 1;
    }
  }

  totalRestored += await batchInsertTableRows('store_lead', t.store_lead);

  if (Array.isArray(t.store_order) && t.store_order.length > 0) {
    const mappedStoreOrders = t.store_order.map(({ id, ...rest }) => ({
      ...rest,
      store_id: storeIdMap.get(String(rest.store_id)) || rest.store_id,
      items: remapOrderItemsJson(rest.items, productIdMap),
      items_return: remapOrderItemsJson(rest.items_return, productIdMap),
      items_exchange: remapOrderItemsJson(rest.items_exchange, productIdMap)
    }));
    totalRestored += await batchInsertTableRows('store_order', mappedStoreOrders);
  }

  const orderIdMap = new Map();
  if (Array.isArray(t.orders)) {
    for (const oldOrder of t.orders) {
      const { id: oldId, ...rest } = oldOrder;
      const { data: ins } = await supabase
        .from('orders')
        .insert([{ ...rest, store_id: rest.store_id != null ? storeIdMap.get(String(rest.store_id)) || rest.store_id : null }])
        .select('id')
        .single();
      if (oldId != null && ins?.id != null) orderIdMap.set(String(oldId), ins.id);
      totalRestored += 1;
    }
  }

  if (Array.isArray(t.order_item) && t.order_item.length > 0) {
    const mappedOrderItems = t.order_item.map(({ id, ...rest }) => ({
      ...rest,
      order_id: rest.order_id != null ? orderIdMap.get(String(rest.order_id)) || rest.order_id : null,
      product_id: rest.product_id != null ? productIdMap.get(String(rest.product_id)) || rest.product_id : null
    }));
    totalRestored += await batchInsertTableRows('order_item', mappedOrderItems);
  }

  // 6. 第四梯队：财务核销、随车收款、库存流水、余缺调剂与用度计划
  logCallback('💰 [4/5] 正在重建全部财务核销流水、随车收款记录与库存变动明细...');
  if (Array.isArray(t.driver_collection_log) && t.driver_collection_log.length > 0) {
    const rows = t.driver_collection_log.map(({ id, ...rest }) => ({
      ...rest,
      store_id: storeIdMap.get(String(rest.store_id)) || rest.store_id
    }));
    totalRestored += await batchInsertTableRows('driver_collection_log', rows);
  }
  if (Array.isArray(t.payment_record) && t.payment_record.length > 0) {
    const rows = t.payment_record.map(({ id, ...rest }) => ({
      ...rest,
      store_id: rest.store_id != null ? storeIdMap.get(String(rest.store_id)) || rest.store_id : null,
      order_id: rest.order_id != null ? orderIdMap.get(String(rest.order_id)) || rest.order_id : null
    }));
    totalRestored += await batchInsertTableRows('payment_record', rows);
  }
  if (Array.isArray(t.inventory_log) && t.inventory_log.length > 0) {
    const rows = t.inventory_log.map(({ id, ...rest }) => ({
      ...rest,
      product_id: productIdMap.get(String(rest.product_id)) || rest.product_id
    }));
    totalRestored += await batchInsertTableRows('inventory_log', rows);
  }
  if (Array.isArray(t.local_inventory_pool) && t.local_inventory_pool.length > 0) {
    const rows = t.local_inventory_pool.map(({ id, ...rest }) => ({
      ...rest,
      from_store_id: storeIdMap.get(String(rest.from_store_id)) || rest.from_store_id,
      to_store_id: rest.to_store_id != null ? storeIdMap.get(String(rest.to_store_id)) || rest.to_store_id : null,
      product_id: rest.product_id != null ? productIdMap.get(String(rest.product_id)) || rest.product_id : null
    }));
    totalRestored += await batchInsertTableRows('local_inventory_pool', rows);
  }
  if (Array.isArray(t.demand_forecast_plan) && t.demand_forecast_plan.length > 0) {
    const rows = t.demand_forecast_plan.map(({ id, ...rest }) => ({
      ...rest,
      store_id: storeIdMap.get(String(rest.store_id)) || rest.store_id,
      items: remapOrderItemsJson(rest.items, productIdMap)
    }));
    totalRestored += await batchInsertTableRows('demand_forecast_plan', rows);
  }

  // 7. 第五梯队：铁证回填（天道明鉴不可篡改审计流水 + 联署公断案卷 + 建言与公域求购留痕）
  logCallback('⚖️ [5/5] 正在回填【天道明鉴不可篡改审计铁证】与联署公断历史案卷...');
  totalRestored += await batchInsertTableRows('platform_compliance_case', t.platform_compliance_case);
  totalRestored += await batchInsertTableRows('platform_suggestion_board', t.platform_suggestion_board);
  totalRestored += await batchInsertTableRows('audit_immutable_log', t.audit_immutable_log);

  logCallback(`🎉 全栈灾难重建圆满完成！累计精准还原 ${totalRestored} 条数据与铁证记录。`);
  return totalRestored;
}

function openSovereignCommandVault() {
  document.getElementById('sovereign-command-vault')?.remove();

  let loadedMotherboardJson = null;

  const overlay = document.createElement('div');
  overlay.id = 'sovereign-command-vault';
  overlay.className = 'fixed inset-0 bg-black/95 backdrop-blur-md z-[200] flex items-center justify-center p-4 select-none';

  overlay.innerHTML = `
    <div class="bg-stone-950 border border-amber-500/50 w-full max-w-2xl rounded-3xl p-6 space-y-4 text-stone-200 shadow-2xl text-xs">
      <div class="flex justify-between items-center border-b border-stone-800 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="w-8 h-8 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-black text-base">⚜️</span>
          <div>
            <h3 class="text-sm font-black text-amber-400 tracking-wide">终极运营主权指令舱（全栈灾难母舰 v2）</h3>
            <p class="text-[10px] text-stone-400">独立主权加密验证 · 覆盖全库数据 + 审计操作铁证 + 程序源码容灾</p>
          </div>
        </div>
        <button type="button" id="btn-close-sovereign" class="text-stone-400 hover:text-white text-lg">✕</button>
      </div>

      <!-- 身份核验区 -->
      <div id="sovereign-lock-view" class="space-y-3 py-2">
        <label class="block text-amber-300 font-bold">请输入终极主权暗令（默认 SOVEREIGN#2026，验证后可自定义修改）：</label>
        <input type="password" id="input-sovereign-pass" placeholder="输入主权暗令"
          class="w-full bg-stone-900 border border-amber-500/40 rounded-xl px-3.5 py-2.5 font-mono text-white outline-none focus:border-amber-400">
        <button type="button" id="btn-unlock-sovereign"
          class="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-black py-2.5 rounded-xl shadow transition">
          解锁终极控制武器库
        </button>
      </div>

      <!-- 解锁后的终极武器库 -->
      <div id="sovereign-weapons-view" class="hidden space-y-3.5 max-h-[78vh] overflow-y-auto pr-1">
        <!-- 武器一：全网紧急熔断与全端踢出 -->
        <div class="bg-stone-900 border border-rose-500/40 rounded-2xl p-3.5 space-y-2">
          <div class="flex justify-between items-center">
            <b class="text-rose-400 text-xs">⚡ 武器一：全网紧急熔断与全端强制踢出（Kill-Switch）</b>
            <span id="sovereign-circuit-status" class="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-800 text-stone-300">检测中...</span>
          </div>
          <p class="text-[11px] text-stone-400">遭遇攻击或内部异常时，一键冻结全站外部写入，并可立即作废全网所有在线终端凭证。</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button type="button" id="btn-sovereign-freeze-all" class="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 rounded-xl">
              🛑 启动全网熔断护盘
            </button>
            <button type="button" id="btn-sovereign-unfreeze-all" class="bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2 rounded-xl">
              🟢 解除熔断恢复通畅
            </button>
            <button type="button" id="btn-sovereign-wipe-sessions" class="bg-amber-900 hover:bg-amber-800 text-amber-200 border border-amber-600/50 font-bold py-2 rounded-xl">
              🔌 踢出全网所有在线终端
            </button>
          </div>
        </div>

        <!-- 武器二：全栈母版灾备导出（26表数据+审计操作铁证 + 程序源码包） -->
        <div class="bg-stone-900 border border-amber-500/40 rounded-2xl p-3.5 space-y-2.5">
          <b class="text-amber-300 text-xs block">🧬 武器二：全栈母版离线备份（26表数据 + 审计操作铁证 + 程序源码）</b>
          <p class="text-[11px] text-stone-400">
            完整包含 <b>audit_immutable_log（防篡改审计铁证）</b>、<b>inventory_log（库存操作流水）</b>、<b>payment_record（财务核销流水）</b>及全网 26 表数据（带 SHA-256 防篡改封印），另可一键打包当前程序源码。
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" id="btn-sovereign-export-all" class="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black py-2.5 rounded-xl">
              📥 下载全库 26 表与铁证母包 (.json)
            </button>
            <button type="button" id="btn-sovereign-export-code" class="bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/40 font-bold py-2.5 rounded-xl">
              📦 打包下载当前程序源码快照 (.json)
            </button>
          </div>
        </div>

        <!-- 武器三：从零开始 · 上传母包一键灾难重建 -->
        <div class="bg-stone-900 border border-emerald-500/40 rounded-2xl p-3.5 space-y-2.5">
          <b class="text-emerald-400 text-xs block">🏗️ 武器三：从零开始 · 上传灾难母包一键全库重建（含审计铁证还原）</b>
          <p class="text-[11px] text-stone-400">
            遭遇极端毁灭性破坏时，在新库建好基础空表后上传母包，自动验证 SHA-256 封印并按拓扑外键序重建全网数据与审计铁证。
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex-1 bg-stone-950 border border-dashed border-emerald-500/50 hover:border-emerald-400 rounded-xl px-3 py-2 cursor-pointer text-center font-bold text-emerald-300">
              <span id="sovereign-mother-file-label">📂 点击选择灾难恢复母包 (.json)</span>
              <input type="file" id="input-sovereign-mother-file" accept=".json,application/json" class="hidden">
            </label>
            <label class="flex items-center gap-1.5 text-[11px] text-amber-300 cursor-pointer shrink-0">
              <input type="checkbox" id="chk-sovereign-wipe-before" checked class="rounded text-rose-600">
              <span>灌入前清扫脏数据</span>
            </label>
          </div>
          <div id="sovereign-mother-preview" class="hidden bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-[11px] space-y-1"></div>
          <div id="sovereign-rebuild-log" class="hidden bg-black border border-emerald-900/60 rounded-xl p-2.5 font-mono text-[10px] text-emerald-300 max-h-32 overflow-y-auto space-y-0.5"></div>
          <button type="button" id="btn-sovereign-execute-rebuild" disabled
            class="w-full bg-stone-800 text-stone-500 font-black py-2.5 rounded-xl cursor-not-allowed transition">
            🔒 请先选择灾难恢复母包
          </button>
        </div>

        <!-- 武器四：指定商号物理级彻底粉碎 -->
        <div class="bg-stone-900 border border-stone-700 rounded-2xl p-3.5 space-y-2">
          <b class="text-stone-200 text-xs block">☢️ 武器四：物理级彻底抹除（不可逆粉碎指定商号）</b>
          <div class="flex gap-2">
            <input type="text" id="input-sovereign-hard-purge-tid" placeholder="输入商号代号（含 __ARCHIVED_ 后缀亦可）"
              class="flex-1 bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 font-mono text-white outline-none">
            <button type="button" id="btn-sovereign-hard-purge" class="bg-rose-900 hover:bg-rose-800 text-rose-100 font-bold px-3.5 py-1.5 rounded-xl border border-rose-600">
              物理粉碎
            </button>
          </div>
        </div>

        <!-- 武器五：自定义主权暗令 -->
        <div class="bg-stone-900 border border-stone-800 rounded-2xl p-3.5 space-y-2">
          <b class="text-stone-300 text-xs block">🔐 武器五：重设终极主权暗令</b>
          <div class="flex gap-2">
            <input type="password" id="input-sovereign-new-pass" placeholder="输入新的高强度主权暗令（至少10位）"
              class="flex-1 bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 font-mono text-white outline-none">
            <button type="button" id="btn-sovereign-save-pass" class="bg-stone-700 hover:bg-stone-600 text-white font-bold px-3.5 py-1.5 rounded-xl">
              更新暗令
            </button>
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

  document.getElementById('btn-close-sovereign').addEventListener('click', () => overlay.remove());

  async function refreshCircuitLabel() {
    const labelEl = document.getElementById('sovereign-circuit-status');
    if (!labelEl) return;
    const { data } = await supabase
      .from('platform_governance_config')
      .select('config_value')
      .eq('config_key', 'emergency_circuit_breaker')
      .maybeSingle();
    const isFrozen = data?.config_value === 'ON';
    labelEl.textContent = isFrozen ? '🛑 全网熔断中' : '🟢 正常运行中';
    labelEl.className = isFrozen
      ? 'text-[10px] font-mono px-2 py-0.5 rounded bg-rose-900 text-rose-200 font-bold'
      : 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900 text-emerald-200 font-bold';
  }

  async function handleUnlock() {
    const ok = await verifySovereignPassphrase(passInput.value);
    if (!ok) {
      alert('⛔ 主权暗令校验未通过。');
      return;
    }
    lockView.classList.add('hidden');
    weaponsView.classList.remove('hidden');
    await refreshCircuitLabel();
  }

  btnUnlock.addEventListener('click', handleUnlock);
  passInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleUnlock();
  });
  setTimeout(() => passInput.focus(), 100);

  // 武器一绑定
  document.getElementById('btn-sovereign-freeze-all').addEventListener('click', async () => {
    await supabase.from('platform_governance_config').upsert([
      {
        config_key: 'emergency_circuit_breaker',
        config_label: '全网应急熔断状态',
        config_value: 'ON',
        value_type: 'boolean',
        category: 'security',
        updated_at: new Date().toISOString()
      }
    ]);
    await refreshCircuitLabel();
    alert('🛑 已激活全网紧急熔断护盘！');
  });

  document.getElementById('btn-sovereign-unfreeze-all').addEventListener('click', async () => {
    await supabase.from('platform_governance_config').upsert([
      {
        config_key: 'emergency_circuit_breaker',
        config_label: '全网应急熔断状态',
        config_value: 'OFF',
        value_type: 'boolean',
        category: 'security',
        updated_at: new Date().toISOString()
      }
    ]);
    await refreshCircuitLabel();
    alert('🟢 已解除全网熔断，全站恢复正常协作！');
  });

  document.getElementById('btn-sovereign-wipe-sessions').addEventListener('click', async () => {
    await supabase.from('sys_qr_session').delete().neq('id', -999999999);
    await supabase.from('login_qr_session').delete().neq('id', -999999999);
    const { data: allTenants } = await supabase.from('platform_tenant').select('tenant_id');
    for (const row of allTenants || []) {
      await supabase.rpc('rpc_bump_session_epoch', {
        p_tenant_id: row.tenant_id,
        p_reason: '全局最高安全指令清退所有在线终端'
      }).catch(() => {});
    }
    alert('🔌 已清退全网所有商号与扫码登录会话，所有终端必须重新核验身份！');
  });

  // 武器二绑定
  document.getElementById('btn-sovereign-export-all').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '⏳ 正在全库提取 26 张表与审计铁证...';
    try {
      await exportFullPlatformDisasterMotherboard();
      alert('✅ 全平台 26 表数据 + 不可篡改审计铁证母包已导出下载（含 SHA-256 防篡改封印）！');
    } catch (err) {
      alert('❌ 导出失败：' + (err?.message || ''));
    } finally {
      btn.disabled = false;
      btn.textContent = '📥 下载全库 26 表与铁证母包 (.json)';
    }
  });

  document.getElementById('btn-sovereign-export-code').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '⏳ 正在收集前端程序与模块源码...';
    try {
      const count = await exportRuntimeSourceCodeVault();
      alert(`📦 已打包下载当前运行时程序源码快照（共收录 ${count} 个核心程序源文件）！`);
    } catch (err) {
      alert('❌ 源码打包失败：' + (err?.message || ''));
    } finally {
      btn.disabled = false;
      btn.textContent = '📦 打包下载当前程序源码快照 (.json)';
    }
  });

  // 武器三绑定（上传母包一键灾难重建）
  const motherFileInput = document.getElementById('input-sovereign-mother-file');
  const motherFileLabel = document.getElementById('sovereign-mother-file-label');
  const motherPreview = document.getElementById('sovereign-mother-preview');
  const rebuildLogBox = document.getElementById('sovereign-rebuild-log');
  const btnExecuteRebuild = document.getElementById('btn-sovereign-execute-rebuild');

  motherFileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed.tables || !String(parsed.schema_version || '').startsWith('baigong_sovereign_disaster_motherboard')) {
        alert('❌ 格式错误：请选择终极主权指令舱导出的灾难恢复母包文件！');
        return;
      }
      loadedMotherboardJson = parsed;
      motherFileLabel.textContent = `✅ 已载入：${file.name}`;
      const ev = parsed.evidence_summary || {};
      motherPreview.classList.remove('hidden');
      motherPreview.innerHTML = `
        <div class="text-emerald-300 font-bold">母包生成时间：${new Date(parsed.created_at).toLocaleString('zh-CN')}</div>
        <div class="text-stone-300">内含：在册/归档商号 <b>${ev.total_tenants ?? (parsed.tables.platform_tenant?.length || 0)}</b> 家 · 订单 <b>${ev.total_orders ?? 0}</b> 笔 · 不可篡改审计铁证 <b>${ev.immutable_audit_logs ?? (parsed.tables.audit_immutable_log?.length || 0)}</b> 条 · 财务与库存流水 <b>${(ev.financial_payment_records || 0) + (ev.inventory_operation_logs || 0)}</b> 条</div>
        <div class="text-amber-400 font-mono truncate">SHA-256 封印：${parsed.integrity_sha256 || 'v1兼容包'}</div>
      `;
      btnExecuteRebuild.disabled = false;
      btnExecuteRebuild.className = 'w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2.5 rounded-xl shadow transition';
      btnExecuteRebuild.textContent = '🚀 立即执行全库灾难重建与铁证还原';
    } catch (err) {
      alert('❌ 母包文件解析失败：' + (err?.message || '文件损坏'));
    }
  });

  btnExecuteRebuild.addEventListener('click', async () => {
    if (!loadedMotherboardJson) return;
    const wipeBefore = document.getElementById('chk-sovereign-wipe-before').checked;
    btnExecuteRebuild.disabled = true;
    btnExecuteRebuild.textContent = '⏳ 正在执行全栈灾难重建，请勿关闭页面...';
    rebuildLogBox.classList.remove('hidden');
    rebuildLogBox.innerHTML = '';

    const appendLog = (msg) => {
      const line = document.createElement('div');
      line.textContent = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${msg}`;
      rebuildLogBox.appendChild(line);
      rebuildLogBox.scrollTop = rebuildLogBox.scrollHeight;
    };

    try {
      const total = await executeFullMotherboardDisasterRebuild(loadedMotherboardJson, wipeBefore, appendLog);
      alert(`🎉 灾难重建圆满完成！全库 26 张核心表、业务往来与不可篡改审计铁证（共 ${total} 条记录）已全部还原！`);
      if (typeof window.loadPlatformData === 'function') {
        await window.loadPlatformData();
      }
    } catch (err) {
      appendLog('❌ 重建中止：' + (err?.message || '未知错误'));
      alert('❌ 灾难重建失败：' + (err?.message || '未知错误'));
    } finally {
      btnExecuteRebuild.disabled = false;
      btnExecuteRebuild.textContent = '🚀 重新执行全库灾难重建';
    }
  });

  // 武器四绑定
  document.getElementById('btn-sovereign-hard-purge').addEventListener('click', async () => {
    const rawTid = document.getElementById('input-sovereign-hard-purge-tid').value.trim();
    if (!rawTid) return alert('请输入要物理粉碎的商号代号');
    const baseTid = getOriginalTenantId(rawTid);

    const { data: oldOrders } = await supabase.from('orders').select('id').in('tenant_id', [rawTid, baseTid]);
    const oldOrderIds = (oldOrders || []).map((o) => o.id);
    if (oldOrderIds.length > 0) {
      await supabase.from('order_item').delete().in('order_id', oldOrderIds);
    }

    const childTables = [
      'payment_record',
      'driver_collection_log',
      'inventory_log',
      'local_inventory_pool',
      'demand_forecast_plan',
      'orders',
      'store_order',
      'store_lead',
      'store',
      'product',
      'driver',
      'sys_qr_session',
      'login_qr_session'
    ];
    for (const tbl of childTables) {
      await supabase.from(tbl).delete().in('tenant_id', [rawTid, baseTid]);
    }
    await supabase.from('tenant_application').delete().in('tenant_id', [rawTid, baseTid]);
    await supabase.from('tenant').delete().in('id', [rawTid, baseTid]);
    await supabase.from('platform_tenant').delete().in('tenant_id', [rawTid, baseTid]);

    alert(`☢️ 商号【${rawTid}】及其全库关联表已执行物理级彻底粉碎！`);
    if (typeof window.loadPlatformData === 'function') await window.loadPlatformData();
  });

  // 武器五绑定
  document.getElementById('btn-sovereign-save-pass').addEventListener('click', async () => {
    const newPass = document.getElementById('input-sovereign-new-pass').value.trim();
    if (newPass.length < 10) return alert('为确保主权安全，新暗令长度不能少于 10 位！');
    const newHash = await sha256Hex(`BAIGONG_SOVEREIGN::${newPass}`);
    localStorage.setItem(SOVEREIGN_KEY_STORAGE, newHash);
    await supabase.from('platform_governance_config').upsert([
      {
        config_key: '_sys_sovereign_seal_hash',
        config_label: '系统底层完整性校验指纹',
        config_value: newHash,
        value_type: 'text',
        category: 'internal',
        updated_at: new Date().toISOString()
      }
    ]);
    alert('🔐 终极主权暗令已更新加密保存！');
  });
}

/**
 * 7. 注册静默唤醒监听（零 DOM 痕迹）
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
    clickTimer = setTimeout(() => {
      clickCount = 0;
    }, 2500);
  });

  if (window.location.hash === '#sovereign') {
    setTimeout(() => openSovereignCommandVault(), 300);
  }
}
