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

  async submitOnlineOrder(orderPayload) {
    const rows = Array.isArray(orderPayload) ? orderPayload : [orderPayload];
    return await supabase.from('store_order').insert(rows);
  }
};
