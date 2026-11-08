import { supabase } from '../lib/supabase.js';

export const StoreService = {
  // 获取门店档案
  async getStoreByTenant(tenantId) {
    try {
      const { data, error } = await supabase
        .from('store')
        .select('*')
        .eq('tenant_id', tenantId)
        .limit(1);
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.error('[StoreService] getStoreByTenant 失败:', err);
      return null;
    }
  },

  // 手机号认领门店
  async bindByPhone(phone) {
    try {
      const { data, error } = await supabase
        .from('store')
        .select('*')
        .eq('phone', phone)
        .limit(1);
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.error('[StoreService] bindByPhone 失败:', err);
      return null;
    }
  },

  // 拉取在售货品（结合特权过滤）
  async getProducts(tenantId, visibleIds = null) {
    try {
      const { data, error } = await supabase
        .from('product')
        .select('*')
        .eq('tenant_id', tenantId)
        .neq('status', 'inactive')
        .order('id', { ascending: false });

      if (error) throw error;
      const list = data || [];
      if (visibleIds && Array.isArray(visibleIds) && visibleIds.length > 0) {
        return list.filter(p => visibleIds.includes(p.id));
      }
      return list;
    } catch (err) {
      console.error('[StoreService] getProducts 失败:', err);
      return [];
    }
  },

  // 提交订单并扣减库存、更新挂账欠款
  async submitOrder({ tenantId, storeId, storeName, driverName, totalAmount, items, note, currentDebt }) {
    try {
      // 1. 写入订单主表
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

      // 2. 依次扣减在售商品现货库存（防超卖）
      for (const item of items) {
        const { data: prod } = await supabase
          .from('product')
          .select('stock')
          .eq('id', item.id)
          .single();

        if (prod && prod.stock !== undefined && prod.stock !== null) {
          const remainStock = Math.max(0, prod.stock - item.qty);
          await supabase
            .from('product')
            .update({ stock: remainStock })
            .eq('id', item.id);
        }
      }

      // 3. 累加挂账欠款
      const newDebt = parseFloat(currentDebt || 0) + totalAmount;
      const { error: storeErr } = await supabase
        .from('store')
        .update({ current_debt: newDebt })
        .eq('id', storeId);

      if (storeErr) throw storeErr;
      return true;
    } catch (err) {
      console.error('[StoreService] submitOrder 失败:', err);
      throw err;
    }
  },

  // 查验历史报单列表
  async getMyOrders(storeId) {
    try {
      const { data, error } = await supabase
        .from('store_order')
        .select('*')
        .eq('store_id', storeId)
        .order('id', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[StoreService] getMyOrders 失败:', err);
      return [];
    }
  },

  // 查验随车师傅收款电子收条
  async getMyReceipts(storeId) {
    try {
      const { data, error } = await supabase
        .from('driver_collection_log')
        .select('*')
        .eq('store_id', storeId)
        .order('id', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[StoreService] getMyReceipts 失败:', err);
      return [];
    }
  }
};
