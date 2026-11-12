import { supabase } from '../lib/supabase.js';

export const StoreService = {
  // 1. 获取特定总代下的门店账本与额度档案
  async getStoreByTenant(tenantId, phone = null) {
    try {
      const cleanTenant = (tenantId || '').trim().toUpperCase();
      let query = supabase.from('store').select('*').eq('tenant_id', cleanTenant);
      if (phone) {
        query = query.eq('phone', phone.trim());
      }
      const { data, error } = await query.limit(1);
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.error('[StoreService] getStoreByTenant 失败:', err);
      return null;
    }
  },

  // 2. 手机号绑定查询门店
  async bindByPhone(phone) {
    try {
      const { data, error } = await supabase
        .from('store')
        .select('*')
        .eq('phone', (phone || '').trim())
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
      const cleanTenant = (tenantId || '').trim().toUpperCase();
      const { data, error } = await supabase
        .from('product')
        .select('*')
        .eq('tenant_id', cleanTenant)
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
      const cleanTenant = (tenantId || '').trim().toUpperCase();
      const { data, error } = await supabase
        .from('store_order')
        .select('items, created_at, id')
        .eq('store_id', storeId)
        .eq('tenant_id', cleanTenant)
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

  // 5. 追溯某商品的历史累计订购量与当前最大可退换余量 (防止无单退货与超量退货)
  async getProductReturnableQuota(storeId, tenantId, productId) {
    try {
      const cleanTenant = (tenantId || '').trim().toUpperCase();
      const { data: orders, error } = await supabase
        .from('store_order')
        .select('id, order_no, items, items_return, items_exchange, created_at')
        .eq('store_id', storeId)
        .eq('tenant_id', cleanTenant)
        .neq('order_status', 'cancelled');

      if (error || !orders) return { maxReturnable: 0, totalOrdered: 0, totalReturned: 0, lastPrice: 0, lastOrderNo: '' };

      let totalOrdered = 0;
      let totalReturned = 0;
      let lastPrice = 0;
      let lastOrderNo = '';

      for (const o of orders) {
        const items = Array.isArray(o.items) ? o.items : [];
        const returns = Array.isArray(o.items_return) ? o.items_return : [];
        const exchanges = Array.isArray(o.items_exchange) ? o.items_exchange : [];

        const matchOrder = items.find(it => it.id === productId);
        if (matchOrder) {
          totalOrdered += parseInt(matchOrder.qty || 0);
          if (!lastPrice) {
            lastPrice = parseFloat(matchOrder.price || 0);
            lastOrderNo = o.order_no || `#${o.id}`;
          }
        }

        const matchReturn = returns.find(it => it.id === productId);
        if (matchReturn) {
          totalReturned += parseInt(matchReturn.qty || 0);
        }

        const matchExchange = exchanges.find(it => it.id === productId);
        if (matchExchange) {
          totalReturned += parseInt(matchExchange.qty || 0);
        }
      }

      const maxReturnable = Math.max(0, totalOrdered - totalReturned);
      return { maxReturnable, totalOrdered, totalReturned, lastPrice, lastOrderNo };
    } catch (e) {
      console.error('[StoreService] getProductReturnableQuota 出错:', e);
      return { maxReturnable: 0, totalOrdered: 0, totalReturned: 0, lastPrice: 0, lastOrderNo: '' };
    }
  },

  // 6. 提交三合一多模式综合送货单（订/退/换、结算策略、凭据照片）
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
      const cleanTenant = (tenantId || '').trim().toUpperCase();
      const orderNo = `DH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const { data: newOrder, error: orderErr } = await supabase.from('store_order').insert([{
        order_no: orderNo,
        tenant_id: cleanTenant,
        store_id: storeId,
        store_name: storeName,
        driver_name: driverName || '老张师傅',
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

      // 扣减现货库存
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

      // 赊销时记入挂账
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

  // 7. 查验历史报单记录
  async getMyOrders(storeId, tenantId) {
    try {
      let query = supabase.from('store_order').select('*').eq('store_id', storeId);
      if (tenantId) {
        query = query.eq('tenant_id', tenantId.trim().toUpperCase());
      }
      const { data, error } = await query.order('id', { ascending: false }).limit(15);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[StoreService] getMyOrders 失败:', err);
      return [];
    }
  },

  // 8. 查验师傅收款电子收条
  async getMyReceipts(storeId, tenantId) {
    try {
      let query = supabase.from('driver_collection_log').select('*').eq('store_id', storeId);
      if (tenantId) {
        query = query.eq('tenant_id', tenantId.trim().toUpperCase());
      }
      const { data, error } = await query.order('id', { ascending: false }).limit(15);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[StoreService] getMyReceipts 失败:', err);
      return [];
    }
  }
};
