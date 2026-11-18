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
    let query = supabase
      .from('store')
      .select('id, name, address, phone, tenant_id')
      .order('id', { ascending: false })
      .limit(100);
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    const { data } = await query;
    return data || [];
  },

  // 严格恪守「各守本分」渠道隔离：仅展示允许进入天街与云端专柜的货品（排除店头常备专供货）
  async fetchMallProducts(tenantId = null) {
    let query = supabase
      .from('product')
      .select('*')
      .eq('status', 'active')
      .in('sales_channel_type', ['online', 'both']);

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
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

  async fetchC2BDemands(tenantId = null) {
    let query = supabase
      .from('platform_suggestion_board')
      .select('*')
      .eq('proposer_type', 'c2b_demand')
      .order('id', { ascending: false })
      .limit(40);

    if (tenantId) {
      query = query.or(`category.ilike.%${tenantId}%,category.ilike.%全网公域%`);
    }
    const { data } = await query;
    return data || [];
  },

  async publishC2BDemand(payload) {
    return await supabase.from('platform_suggestion_board').insert([payload]);
  },

  async updateC2BDemandContent(demandId, updatedContent) {
    return await supabase
      .from('platform_suggestion_board')
      .update({ content: updatedContent })
      .eq('id', demandId);
  },

  async cancelC2BDemand(demandId) {
    return await supabase
      .from('platform_suggestion_board')
      .delete()
      .eq('id', demandId);
  },

  async queryOrdersByPhone(phone) {
    const cleanPhone = (phone || '').trim();
    if (!cleanPhone) return { orders: [], demands: [] };

    const [ordersRes, demandsRes] = await Promise.all([
      supabase
        .from('store_order')
        .select('*')
        .eq('order_source', 'online_mall')
        .ilike('note', `%${cleanPhone}%`)
        .order('id', { ascending: false })
        .limit(20),
      supabase
        .from('platform_suggestion_board')
        .select('*')
        .eq('proposer_type', 'c2b_demand')
        .ilike('proposer_name', `%${cleanPhone}%`)
        .order('id', { ascending: false })
        .limit(20)
    ]);

    return {
      orders: ordersRes.data || [],
      demands: demandsRes.data || []
    };
  },

  async submitMallSuggestion(payload) {
    return await supabase.from('platform_suggestion_board').insert([payload]);
  }
};
