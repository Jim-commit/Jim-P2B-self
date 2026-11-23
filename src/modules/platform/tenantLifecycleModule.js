import { supabase } from '../../lib/supabase.js';
import { platformState, recordAuditLog } from './platformState.js';

/**
 * 1. 全量导出商号 JSON 备份（覆盖全部 14 张商号主表与业务子表）
 */
export async function exportTenantFullBackup(tenantId, companyName = '') {
  if (!tenantId) throw new Error('缺少商号代号 (tenantId)');

  // 并发拉取主配置与直接挂载 tenant_id 的业务表
  const [
    ptRes,
    tRes,
    driverRes,
    prodRes,
    storeRes,
    leadRes,
    storeOrderRes,
    ordersRes,
    driverColRes,
    payRecRes,
    invLogRes,
    poolRes,
    planRes,
    auditRes
  ] = await Promise.all([
    supabase.from('platform_tenant').select('*').eq('tenant_id', tenantId),
    supabase.from('tenant').select('*').eq('id', tenantId),
    supabase.from('driver').select('*').eq('tenant_id', tenantId),
    supabase.from('product').select('*').eq('tenant_id', tenantId),
    supabase.from('store').select('*').eq('tenant_id', tenantId),
    supabase.from('store_lead').select('*').eq('tenant_id', tenantId),
    supabase.from('store_order').select('*').eq('tenant_id', tenantId),
    supabase.from('orders').select('*').eq('tenant_id', tenantId),
    supabase.from('driver_collection_log').select('*').eq('tenant_id', tenantId),
    supabase.from('payment_record').select('*').eq('tenant_id', tenantId),
    supabase.from('inventory_log').select('*').eq('tenant_id', tenantId),
    supabase.from('local_inventory_pool').select('*').eq('tenant_id', tenantId),
    supabase.from('demand_forecast_plan').select('*').eq('tenant_id', tenantId),
    supabase.from('audit_immutable_log').select('*').eq('tenant_id', tenantId).order('id', { ascending: false }).limit(200)
  ]);

  // order_item 表无 tenant_id，按 orders.id 关联拉取
  const orderIds = (ordersRes.data || []).map((o) => o.id).filter(Boolean);
  let orderItems = [];
  if (orderIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize);
      const { data } = await supabase.from('order_item').select('*').in('order_id', chunk);
      if (Array.isArray(data)) orderItems = orderItems.concat(data);
    }
  }

  // 剥离敏感密钥字段（access_key、totp_secret、reset_claim_token），防止备份文件泄露密码
  const safePlatformTenants = (ptRes.data || []).map((row) => {
    const { access_key, totp_secret, reset_claim_token, ...safeRow } = row;
    return safeRow;
  });

  const tables = {
    platform_tenant: safePlatformTenants,
    tenant: tRes.data || [],
    driver: driverRes.data || [],
    product: prodRes.data || [],
    store: storeRes.data || [],
    store_lead: leadRes.data || [],
    store_order: storeOrderRes.data || [],
    orders: ordersRes.data || [],
    order_item: orderItems,
    driver_collection_log: driverColRes.data || [],
    payment_record: payRecRes.data || [],
    inventory_log: invLogRes.data || [],
    local_inventory_pool: poolRes.data || [],
    demand_forecast_plan: planRes.data || []
  };

  const resolvedName = companyName || safePlatformTenants[0]?.company_name || tenantId;
  const payload = {
    schema_version: 'baigong_tenant_snapshot_v2',
    exported_at: new Date().toISOString(),
    tenant_id: tenantId,
    company_name: resolvedName,
    summary: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
    tables,
    audit_snapshot: auditRes.data || []
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `BAIGONG_BACKUP_${tenantId}_${dateTag}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  await recordAuditLog('导出商号全量数据快照', 'INFO', {
    tenant_id: tenantId,
    company_name: resolvedName,
    summary: payload.summary
  });

  return payload;
}

/**
 * 辅助：重映射 JSON 数组里的商品 ID（适配 store_order.items / items_return / items_exchange）
 */
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
    demand_forecast_plan: '要货计划'
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

  btnExecute.addEventListener('click', async () => {
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

          // 若选择完整回档覆盖，先按外键逆序清理当前商号的业务子表
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

          // 1. 恢复基础商号业务配置（仅完整回档时同步非敏感字段）
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

          // 2. 恢复 driver
          if (Array.isArray(t.driver) && t.driver.length > 0) {
            const rows = t.driver.map(({ id, ...rest }) => ({ ...rest, tenant_id: targetTenantId }));
            const { error } = await supabase.from('driver').insert(rows);
            if (error) throw new Error('恢复司机/执事表失败：' + error.message);
            restoredTotal += rows.length;
          }

          // 3. 恢复 product 并建立旧 product.id -> 新 product.id 映射
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

          // 4. 恢复 store，重映射 visible_product_ids 与 custom_pricing，建立旧 store.id -> 新 store.id 映射
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
                    // 克隆基础档案模式下欠款与周转筐清零，完整回档则保留原数值
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

          // 5. 恢复 store_lead
          if (Array.isArray(t.store_lead) && t.store_lead.length > 0) {
            const rows = t.store_lead.map(({ id, ...rest }) => ({ ...rest, tenant_id: targetTenantId }));
            const { error } = await supabase.from('store_lead').insert(rows);
            if (error) throw new Error('恢复意向门店线索失败：' + error.message);
            restoredTotal += rows.length;
          }

          // 若非“仅克隆基础档案”，继续恢复所有历史订单与财务库存流水
          if (!isCloneCatalogOnly) {
            // 6. 恢复 store_order（重映射 store_id 及 items/items_return/items_exchange 内的 product_id）
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

            // 7. 恢复 orders 并建立旧 order.id -> 新 order.id 映射
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

            // 8. 恢复 order_item（重映射 order_id 与 product_id）
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

            // 9. 恢复 driver_collection_log
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

            // 10. 恢复 payment_record
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

            // 11. 恢复 inventory_log
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

            // 12. 恢复 local_inventory_pool
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

            // 13. 恢复 demand_forecast_plan
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
 * 3. 商号「销号清除」四重安全关卡守卫
 * 第一关：强制先下载全量 JSON 备份快照
 * 第二关：手动抄写完整商号代号 + 声明词「确认永久销毁」
 * 第三关：强制 8 秒冷静倒计时
 * 第四关：2FA 终极核验 + 全库 14 张关联表级联清除 + 不可篡改审计存证
 */
export function openTenantPurgeGuardModal(tenantId, companyName = '') {
  const cleanName = (companyName || '').split('(')[0].trim() || tenantId;
  if (!tenantId) return alert('未识别到有效的商号代号！');

  document.getElementById('tenant-purge-guard-modal')?.remove();

  const expectedPhrase = '确认永久销毁';
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
        <span class="text-2xl shrink-0">☢️</span>
        <div class="space-y-1">
          <h3 class="text-sm font-black text-rose-900">高危不可逆操作：商号彻底销号清除</h3>
          <p class="text-[11px] text-rose-800 leading-relaxed">
            即将物理清空商号 <b class="font-mono underline">${cleanName} (${tenantId})</b> 下的全部门店、商品、订单、收款账本、库存流水与入驻申请档案。<b>未留存备份将永久不可恢复！</b>
          </p>
        </div>
      </div>

      <!-- 第一关：强制留存离场备份 -->
      <div class="bg-amber-50/80 border border-amber-300 rounded-2xl p-3 space-y-2">
        <div class="flex justify-between items-center">
          <b class="text-amber-950">第一关：留存离场全量数据快照 *</b>
          <span id="purge-step1-badge" class="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold">未备份</span>
        </div>
        <p class="text-[11px] text-amber-900">下载后的 .json 文件日后可随时通过「📤 导入恢复」完整重建该商号。</p>
        <div class="flex items-center gap-2">
          <button type="button" id="btn-purge-download-backup"
            class="flex-1 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold py-2 rounded-xl shadow-2xs active:scale-95 transition">
            📥 立即下载商号全量快照
          </button>
          <label class="flex items-center gap-1 text-[10px] text-stone-600 cursor-pointer shrink-0">
            <input type="checkbox" id="chk-purge-skip-backup" class="rounded text-rose-600">
            <span>自愿放弃备份</span>
          </label>
        </div>
      </div>

      <!-- 第二关：手写双重口令校验 -->
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
            2. 请输入声明 <code class="bg-stone-200 text-rose-700 font-bold px-1.5 py-0.5 rounded">${expectedPhrase}</code>：
          </label>
          <input type="text" id="input-purge-phrase" autocomplete="off" placeholder="请手打输入：${expectedPhrase}"
            class="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 font-bold text-stone-900 outline-none focus:border-rose-600">
        </div>
      </div>

      <!-- 第三关：8 秒冷静倒计时 -->
      <div class="pt-1 space-y-2">
        <div id="purge-countdown-tip" class="hidden text-center text-[11px] font-bold text-rose-700 bg-rose-50 py-1.5 rounded-xl border border-rose-200">
          ⏳ 核验通过，请保持冷静等待 <span id="purge-sec-num" class="font-mono text-sm">8</span> 秒后解锁最终按钮...
        </div>

        <div class="flex gap-2">
          <button type="button" id="btn-purge-cancel"
            class="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-3 rounded-2xl transition">
            安全取消（保留商号）
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
          btnFinal.textContent = '🗑️ 确认永久销毁该商号';
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

  // 第四关：最终 2FA 终极验证 + 全库关联表级联彻底清除
  btnFinal.addEventListener('click', () => {
    if (!countdownFinished) return;

    window.triggerPlatform2FA(
      `⚠️ 终极 2FA 核验：即将物理销毁商号【${cleanName}】(${tenantId}) 及其全部业务数据与入驻档案，请出示动态口令：`,
      async () => {
        btnFinal.disabled = true;
        btnFinal.textContent = '正在执行全库级联清除...';

        try {
          // 1. 先按外键逆序清理子业务表（保留 audit_immutable_log 不可篡改审计表）
          const { data: oldOrders } = await supabase.from('orders').select('id').eq('tenant_id', tenantId);
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
            await supabase.from(tbl).delete().eq('tenant_id', tenantId);
          }

          // 2. 清理入驻申请档案（释放营业执照/手机号，允许重新走 join.html 申请）
          await supabase.from('tenant_application').delete().or(`tenant_id.eq.${tenantId},company_name.eq.${cleanName}`);

          // 3. 清理基础 tenant 表与核心 platform_tenant 表
          await supabase.from('tenant').delete().eq('id', tenantId);
          const { data: deletedRows, error: delError } = await supabase
            .from('platform_tenant')
            .delete()
            .or(`tenant_id.eq.${tenantId},company_name.eq.${cleanName}`)
            .select();

          if (delError) throw new Error('数据库拒绝删除主档案: ' + delError.message);
          if (!deletedRows || deletedRows.length === 0) {
            throw new Error(`未找到商号【${tenantId}】，或数据库 RLS 策略阻止了 DELETE 权限！`);
          }

          await recordAuditLog('商号作废除名与全库销号清除', 'CRITICAL_2FA', {
            tenant_id: tenantId,
            company_name: cleanName,
            backup_downloaded: backupDone
          });

          cleanupAndClose();
          alert(`✅ 商号【${cleanName}】已彻底销号清除（主档与全库业务流水均已清空）！\n商号代号已完全释放，可持执照原件重新入驻或导入快照重建。`);
          if (typeof window.loadPlatformData === 'function') {
            await window.loadPlatformData();
          }
        } catch (err) {
          alert('❌ 销号执行失败: ' + (err?.message || '未知错误'));
          btnFinal.disabled = false;
          btnFinal.textContent = '🗑️ 确认永久销毁该商号';
        }
      }
    );
  });
}
