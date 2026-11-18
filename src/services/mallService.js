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
      .limit(50);
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
    }
    const { data } = await query.order('id', { ascending: false });
    const list = data || [];
    if (tenantId) return list;
    // 优先展示 online / both 商品；若后台均未区分渠道则展示全部在售良品，避免货架空白
    const onlineOnly = list.filter((p) => ['online', 'both'].includes(p.sales_channel_type));
    return onlineOnly.length > 0 ? onlineOnly : list;
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

  // =========================================================================
  // C2B 需求发榜、跟单凑量与工厂接单报价（复用 platform_suggestion_board）
  // =========================================================================
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

  async joinC2BDemand(demandId, updatedContent) {
    return await supabase
      .from('platform_suggestion_board')
      .update({ content: updatedContent })
      .eq('id', demandId);
  },

  // =========================================================================
  // 统一查询：B2C 现货订单 + C2B 需求榜进度
  // =========================================================================
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
