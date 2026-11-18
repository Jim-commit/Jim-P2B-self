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

  async fetchPickupStores(tenantId = null) {
    let query = supabase.from('store').select('id, name, address, phone, tenant_id').order('id', { ascending: false }).limit(50);
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    const { data } = await query;
    return data || [];
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

    for (const item of cartItems) {
      try {
        const curStock = parseInt(item.prod.stock_qty ?? item.prod.stock ?? -1);
        if (curStock >= 0) {
          const nextStock = Math.max(0, curStock - item.qty);
          await supabase.from('product').update({ stock_qty: nextStock }).eq('id', item.prod.id);
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
  },

  async submitMallSuggestion(payload) {
    return await supabase.from('platform_suggestion_board').insert([payload]);
  }
};
