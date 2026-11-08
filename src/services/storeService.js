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

  // 3. 拉取当前总代的在售货品
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

  // 4. 追溯某商品的最近一次历史送货/进货价格（退货锁定原价）
  async getHistoricalPrice(storeId, tenantId, productId) {
    try {
      const { data, error } = await supabase
        .from('store_order')
        .select('items, created_at, id')
        .eq('store_id', storeId)
        .eq('tenant_id', tenantId)
        .order('id', { ascending: false })
        .limit(10);

      if (error || !data) return null;

      for (const order of data) {
        const items = Array.isArray(order.items) ? order.items : [];
        const match = items.find(it => it.id === productId);
        if (match && match.price) {
          return { price: parseFloat(match.price), orderId: order.id, date: order.created_at };
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  // 5. 提交三合一多模式综合送货单（订/退/换、结算策略、凭据照片）
  async submitComprehensiveOrder({
    tenantId,
    storeId,
    storeName,
    driverName,
    orderSource,
    settlementType,
    settlementNote,
    itemsOrder,
    itemsReturn,
    itemsExchange,
    orderTotal,
    returnTotal,
    netTotal,
    note,
    proofImages,
    currentDebt
  }) {
    try {
      // ① 生成唯一单据流水号
      const orderNo = `DH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      // ② 写入主订单
      const { data: newOrder, error: orderErr } = await supabase.from('store_order').insert([{
        order_no: orderNo,
        tenant_id: tenantId,
        store_id: storeId,
        store_name: storeName,
        driver_name: driverName || '配送师傅',
        order_source: orderSource || 'store_order',
        settlement_type: settlementType || 'credit',
        settlement_note: settlementNote || '',
        items: itemsOrder,
        items_return: itemsReturn,
        items_exchange: itemsExchange,
        total_amount: orderTotal,
        return_amount: returnTotal,
        net_settle_amount: netTotal,
        pay_type: settlementType,
        pay_status: 'pending',
        delivery_status: 'ordered',
        order_status: 'pending_confirm',
        proof_images: proofImages || [],
        note: note || ''
      }]).select().single();

      if (orderErr) throw orderErr;

      // ③ 扣减在售商品现货库存
      for (const item of itemsOrder) {
        const { data: prod } = await supabase
          .from('product')
          .select('stock')
          .eq('id', item.id)
          .single();

        if (prod && prod.stock !== undefined && prod.stock !== null) {
          const remainStock = Math.max(0, prod.stock - item.qty);
          await supabase.from('product').update({ stock: remainStock }).eq('id', item.id);
        }
      }

      // ④ 财务账本更新（若是赊销挂账，累加净额；若是实销/现结不累加挂账）
      if (settlementType === 'credit') {
        const newDebt = Math.max(0, parseFloat(currentDebt || 0) + netTotal);
        await supabase.from('store').update({ current_debt: newDebt }).eq('id', storeId);
      }

      return newOrder;
    } catch (err) {
      console.error('[StoreService] submitComprehensiveOrder 失败:', err);
      throw err;
    }
  },

  // 6. 查验历史报单
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

  // 7. 查验师傅收款电子收条
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
