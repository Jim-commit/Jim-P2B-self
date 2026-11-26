import { supabase } from '../lib/supabase.js';
import { getNormalizedItemPlugins } from '../modules/soulEngine/universalPluginsEngine.js';
import { calcWarehouseStockDelta } from '../modules/soulEngine/multiOrgAndWarehouseEngine.js';

export const HQService = {
  async fetchTenant(tenantId) {
    return await supabase.from('platform_tenant').select('*').eq('tenant_id', tenantId).single();
  },

  async updateTenantWithVerify(tenantId, payload) {
    const { data, error } = await supabase
      .from('platform_tenant')
      .update(payload)
      .eq('tenant_id', tenantId)
      .select();
    if (error || !data || data.length === 0) {
      throw new Error(error?.message || '受影响行数为 0，请检查 Supabase RLS 更新权限');
    }
    return data[0];
  },

  async fetchFullDashboardData(tenantId) {
    const [catsRes, prodsRes, storesRes, logsRes, ordersRes, invRes, subRes, demandsRes] = await Promise.all([
      supabase.from('platform_category').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      supabase.from('product').select('*').eq('tenant_id', tenantId).order('id', { ascending: false }),
      supabase.from('store').select('*').eq('tenant_id', tenantId),
      supabase.from('driver_collection_log').select('*').eq('tenant_id', tenantId).eq('settled_to_hq', false).order('id', { ascending: false }),
      supabase.from('store_order').select('*').eq('tenant_id', tenantId).order('id', { ascending: false }).limit(100),
      supabase.from('inventory_log').select('*').eq('tenant_id', tenantId).order('id', { ascending: false }).limit(50),
      supabase.from('tenant_sub_user').select('*').eq('tenant_id', tenantId).order('id', { ascending: true }),
      supabase
        .from('platform_suggestion_board')
        .select('*')
        .eq('proposer_type', 'c2b_demand')
        .or(`category.ilike.%${tenantId}%,category.ilike.%全网公域%`)
        .order('id', { ascending: false })
        .limit(30)
    ]);

    return {
      categories: catsRes.data || [],
      products: prodsRes.data || [],
      stores: storesRes.data || [],
      pendingCashLogs: logsRes.data || [],
      orders: ordersRes.data || [],
      c2bDemands: demandsRes.data || [],
      inventoryLogs: !invRes.error && Array.isArray(invRes.data)
        ? invRes.data
        : JSON.parse(localStorage.getItem('hq_local_inv_logs_' + tenantId) || '[]'),
      subUsers: subRes.data || []
    };
  },

  async replyC2BDemand(demandId, replyText) {
    return await supabase
      .from('platform_suggestion_board')
      .update({ official_reply: replyText })
      .eq('id', demandId);
  },

  async recordInventoryChange(tenantId, logRow) {
    const { error } = await supabase.from('inventory_log').insert([logRow]);
    if (error) {
      const localLogs = JSON.parse(localStorage.getItem('hq_local_inv_logs_' + tenantId) || '[]');
      localLogs.unshift(logRow);
      localStorage.setItem('hq_local_inv_logs_' + tenantId, JSON.stringify(localLogs.slice(0, 100)));
    }
  },

  async deductSingleProductStock(tenantId, prod, qty, orderNo, operatorLabel, warehouses, targetWh, subReason = '配货发运自动扣库') {
    if (!prod || qty <= 0) return;
    const isMultiWh = warehouses.length > 1;
    const beforeStock = parseInt(prod.stock ?? 0);
    const whDelta = calcWarehouseStockDelta(prod, warehouses, targetWh, -qty);
    const afterStock = isMultiWh ? whDelta.nextTotalStock : Math.max(0, beforeStock - qty);
    prod.stock = afterStock;

    const updatePayload = { stock: afterStock };
    if (isMultiWh) {
      const nextSpecs = {
        ...(prod.custom_specs && typeof prod.custom_specs === 'object' ? prod.custom_specs : {}),
        warehouse_stocks: whDelta.nextWarehouseStocks
      };
      prod.custom_specs = nextSpecs;
      updatePayload.custom_specs = nextSpecs;
    }

    await supabase.from('product').update(updatePayload).eq('id', prod.id);

    const whTag = isMultiWh ? ` [仓库:${targetWh}]` : '';
    await this.recordInventoryChange(tenantId, {
      tenant_id: tenantId,
      product_id: prod.id,
      product_name: prod.name,
      action_type: 'order_ship',
      delta_qty: -qty,
      before_stock: beforeStock,
      after_stock: afterStock,
      operator_name: operatorLabel,
      remark: `[单号:${orderNo}] [门店受单配发]${whTag} ${subReason}`,
      created_at: new Date().toISOString()
    });
  },

  async deductStockForItems(tenantId, allProducts, items, orderNo, operatorLabel, options = {}) {
    if (!Array.isArray(items) || items.length === 0) return;
    const warehouses = Array.isArray(options?.warehouses) && options.warehouses.length > 0 ? options.warehouses : ['主仓库'];
    const targetWh = options?.warehouse && warehouses.includes(options.warehouse) ? options.warehouse : warehouses[0];

    for (const it of items) {
      const prod = allProducts.find((p) => String(p.id) === String(it.id) || p.name === it.name);
      if (!prod) continue;

      const plg = getNormalizedItemPlugins(prod);
      if (!plg.stock.enabled) continue;

      const qty = parseFloat(it.qty || 0);
      if (qty <= 0) continue;

      // 1. 扣减主商品库存
      await this.deductSingleProductStock(tenantId, prod, qty, orderNo, operatorLabel, warehouses, targetWh, '配货发运自动扣库');

      // 2. 若配置了简易组合装子料配方，自动按比例扣减对应子料库存
      const comps = Array.isArray(plg.stock.bundleComponents) ? plg.stock.bundleComponents : [];
      for (const comp of comps) {
        const subProd = allProducts.find(
          (p) => p.id !== prod.id && (p.name === comp.name || p.name.includes(comp.name))
        );
        const subQty = Number((qty * parseFloat(comp.qty || 0)).toFixed(2));
        if (subProd && subQty > 0) {
          const subPlg = getNormalizedItemPlugins(subProd);
          if (subPlg.stock.enabled) {
            await this.deductSingleProductStock(
              tenantId,
              subProd,
              subQty,
              orderNo,
              operatorLabel,
              warehouses,
              targetWh,
              `组合装子料扣减（随【${prod.name}】×${qty}）`
            );
          }
        }
      }
    }
  },

  async sendWebhookMessage(url, messageText) {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content: messageText },
        content: { text: messageText }
      })
    });
  }
};
