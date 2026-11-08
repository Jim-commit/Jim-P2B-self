import { supabase } from '../lib/supabase.js';

export const StoreService = {
  // 1. 获取门店基础资料
  async getStoreByTenant(tenantId) {
    const { data } = await supabase
      .from('store')
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(1);
    return data && data.length > 0 ? data[0] : null;
  },

  // 2. 手机号认领门店
  async bindByPhone(phone) {
    const { data } = await supabase
      .from('store')
      .select('*')
      .eq('phone', phone)
      .limit(1);
    return data && data.length > 0 ? data[0] : null;
  },

  // 3. 拉取在售货品（结合特权过滤）
  async getProducts(tenantId, visibleIds = null) {
    const { data } = await supabase
      .from('product')
      .select('*')
      .eq('tenant_id', tenantId)
      .neq('status', 'inactive')
      .order('id', { ascending: false });

    const list = data || [];
    if (visibleIds && Array.isArray(visibleIds) && visibleIds.length > 0) {
      return list.filter(p => visibleIds.includes(p.id));
    }
    return list;
  },

  // 4. 提交订单并扣减库存、更新挂账
  async submitOrder({ tenantId, storeId, storeName, driverName, totalAmount, items, note, currentDebt }) {
    // 写入订单主表
    const { error: orderErr } = await supabase.from('store_order').insert([{
      tenant_id: tenantId,
      store_id: storeId,
      store_name: storeName,
      driver_name: driverName || '配送师傅',
      total_amount: totalAmount,
      items: items,
      pay_type: 'credit',
      pay_status: 'pending',
      delivery_status: 'ordered',
      note: note || ''
    }]);

    if (orderErr) throw orderErr;

    // 扣减在售库存
    for (const item of items) {
      const { data: prod } = await supabase.from('product').select('stock').eq('id', item.id).single();
      if (prod && prod.stock !== undefined && prod.stock !== null) {
        await supabase.from('product').update({ stock: Math.max(0, prod.stock - item.qty) }).eq('id', item.id);
      }
    }

    // 更新门店累计挂账欠款
    const newDebt = parseFloat(currentDebt || 0) + totalAmount;
    await supabase.from('store').update({ current_debt: newDebt }).eq('id', storeId);
    return true;
  },

  // 5. 查验历史报单
  async getMyOrders(storeId) {
    const { data } = await supabase
      .from('store_order')
      .select('*')
      .eq('store_id', storeId)
      .order('id', { ascending: false })
      .limit(10);
    return data || [];
  },

  // 6. 查验师傅收款电子收条
  async getMyReceipts(storeId) {
    const { data } = await supabase
      .from('driver_collection_log')
      .select('*')
      .eq('store_id', storeId)
      .order('id', { ascending: false })
      .limit(10);
    return data || [];
  }
};
