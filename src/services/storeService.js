import { supabase } from '../lib/supabase.js';

export const StoreService = {
  // 1. 获取特定总代下的门店账本与额度档案
  async getStoreByTenant(tenantId, phone = null) {
    try {
      let query = supabase.from('store').select('*').eq('tenant_id', tenantId);
      if (phone) {
        query = query.eq('phone', phone);
      }
      const { data, error } = await query.limit(1);
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.error('[StoreService] getStoreByTenant 失败:', err);
      return null;
    }
  },

  // 2. 手机号认领门店
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

  // 3. 拉取当前总代的在售货品（结合特权过滤）
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

  // 4. 提交订单并扣减当前总代库存、更新该总代账本挂账
  async submitOrder({ tenantId, storeId, storeName, driverName, totalAmount, items, note, currentDebt }) {
    try {
      // ① 写入当前总代的订单表
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

      // ② 依次扣减在售商品现货库存（防超卖）
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

      // ③ 仅累加当前总代的挂账欠款
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

  // 5. 查验本店在该总代下的历史报单
  async getMyOrders(storeId, tenantId) {
    try {
      let query = supabase.from('store_order').select('*').eq('store_id', storeId);
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      const { data, error } = await query.order('id', { ascending: false }).limit(10);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[StoreService] getMyOrders 失败:', err);
      return [];
    }
  },

  // 6. 查验本店在该总代下的师傅收款电子收条
  async getMyReceipts(storeId, tenantId) {
    try {
      let query = supabase.from('driver_collection_log').select('*').eq('store_id', storeId);
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      const { data, error } = await query.order('id', { ascending: false }).limit(10);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[StoreService] getMyReceipts 失败:', err);
      return [];
    }
  }
};
