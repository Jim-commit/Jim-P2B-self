import { supabase } from '../lib/supabase.js';

export const MallService = {
  async fetchActiveTenants() {
    const { data } = await supabase.from('platform_tenant').select('*').eq('is_active', true);
    return data || [];
  },

  async fetchActiveCategories() {
    const { data } = await supabase
      .from('platform_category')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return data || [];
  },

  async fetchReferrerStore(storeId) {
    const { data } = await supabase.from('store').select('*').eq('id', parseInt(storeId)).single();
    return data || null;
  },

  async fetchMallProducts(tenantId = null) {
    let query = supabase.from('product').select('*').eq('status', 'active');
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    } else {
      query = query.in('sales_channel_type', ['online', 'both']);
    }
    const { data } = await query.order('id', { ascending: false });
    return data || [];
  },

  async submitOnlineOrder(orderPayloads, cartItems) {
    const rows = Array.isArray(orderPayloads) ? orderPayloads : [orderPayloads];
    const { error } = await supabase.from('store_order').insert(rows);
    if (error) return { error };

    // 同步扣减对应商品库存并写入库存流水（若商品表启用库存管理）
    for (const item of cartItems) {
      try {
        const curStock = parseInt(item.prod.stock_qty ?? item.prod.stock ?? -1);
        if (curStock >= 0) {
          const nextStock = Math.max(0, curStock - item.qty);
          await supabase
            .from('product')
            .update({ stock_qty: nextStock })
            .eq('id', item.prod.id);
        }
      } catch (e) {}
    }

    return { error: null };
  },

  async queryOrdersByPhone(phone) {
    const cleanPhone = (phone || '').trim();
    if (!cleanPhone) return [];
    const { data } = await supabase
      .from('store_order')
      .select('*')
      .eq('order_source', 'online_mall')
      .ilike('note', `%${cleanPhone}%`)
      .order('id', { ascending: false })
      .limit(20);
    return data || [];
  }
};
