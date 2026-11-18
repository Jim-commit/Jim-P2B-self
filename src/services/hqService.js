import { supabase } from '../lib/supabase.js';

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

  async deductStockForItems(tenantId, allProducts, items, orderNo, operatorLabel) {
    if (!Array.isArray(items) || items.length === 0) return;
    for (const it of items) {
      const prod = allProducts.find((p) => String(p.id) === String(it.id) || p.name === it.name);
      if (!prod) continue;
      const qty = parseInt(it.qty || 0);
      if (qty <= 0) continue;

      const beforeStock = parseInt(prod.stock ?? 0);
      const afterStock = Math.max(0, beforeStock - qty);
      prod.stock = afterStock;

      await supabase.from('product').update({ stock: afterStock }).eq('id', prod.id);
      await this.recordInventoryChange(tenantId, {
        tenant_id: tenantId,
        product_id: prod.id,
        product_name: prod.name,
        action_type: 'order_ship',
        delta_qty: -qty,
        before_stock: beforeStock,
        after_stock: afterStock,
        operator_name: operatorLabel,
        remark: `配货发运自动扣库 (单号 #${orderNo})`,
        created_at: new Date().toISOString()
      });
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
