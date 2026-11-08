import { supabase } from '../lib/supabase.js';

export const StoreService = {
  // 根据商号代码拉取门店
  async getStoreByTenant(tenantId) {
    const { data } = await supabase.from('store').select('*').eq('tenant_id', tenantId).limit(1);
    return data && data.length > 0 ? data[0] : null;
  },

  // 手机号认领门店
  async bindByPhone(phone) {
    const { data } = await supabase.from('store').select('*').eq('phone', phone).limit(1);
    return data && data.length > 0 ? data[0] : null;
  },

  // 拉取历史报单与货物明细
  async getMyOrders(storeId) {
    const { data } = await supabase.from('store_order').select('*').eq('store_id', storeId).order('id', { ascending: false }).limit(10);
    return data || [];
  },

  // 拉取师傅收款电子收条
  async getMyReceipts(storeId) {
    const { data } = await supabase.from('driver_collection_log').select('*').eq('store_id', storeId).order('id', { ascending: false }).limit(10);
    return data || [];
  }
};
