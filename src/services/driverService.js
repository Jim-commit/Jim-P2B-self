import { supabase } from '../lib/supabase.js';

const OFFLINE_QUEUE_KEY = 'driver_offline_settlements_v1';

export const DriverService = {
  getOfflineQueue() {
    try {
      return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  },

  saveOfflineQueue(queue) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  },

  enqueueOfflineRecord(record) {
    const queue = this.getOfflineQueue();
    queue.push(record);
    this.saveOfflineQueue(queue);
    return queue.length;
  },

  async verifyTenant(tenantId) {
    const { data } = await supabase
      .from('platform_tenant')
      .select('tenant_id, company_name, is_active')
      .eq('tenant_id', tenantId)
      .limit(1);
    return data && data.length > 0 ? data[0] : null;
  },

  async fetchRouteData(tenantId) {
    const [storesRes, ordersRes] = await Promise.all([
      supabase.from('store').select('*').eq('tenant_id', tenantId).order('current_debt', { ascending: false }),
      supabase
        .from('store_order')
        .select('*')
        .eq('tenant_id', tenantId)
        .neq('delivery_status', 'delivered')
        .in('order_status', ['confirmed', 'over_credit_approved', 'over_credit_pending'])
        .order('id', { ascending: false })
    ]);

    return {
      stores: storesRes.data || [],
      pendingOrders: ordersRes.data || []
    };
  },

  async fetchOrderDetail(orderId) {
    const { data } = await supabase.from('store_order').select('*').eq('id', parseInt(orderId)).single();
    return data || null;
  },

  async requestOverCreditApproval(orderId, overAmount) {
    if (!orderId) return;
    await supabase
      .from('store_order')
      .update({
        order_status: 'over_credit_pending',
        over_credit_amount: overAmount,
        driver_action_instruction: `【待调度台特批】超授信 ¥${overAmount.toFixed(2)}，待供货方特信放行`
      })
      .eq('id', parseInt(orderId));
  },

  async executeSettlement(record) {
    const isOnlinePickup = !!record.isOnlinePickup;
    const hasBasketReturn = (record.logPayload?.basket_return || 0) > 0;

    if (record.amount > 0 || hasBasketReturn || !isOnlinePickup) {
      const logPayload = { ...record.logPayload };
      let { error: logErr } = await supabase.from('driver_collection_log').insert([logPayload]);

      if (logErr && logErr.message && logErr.message.includes('basket_deduct_amount')) {
        delete logPayload.basket_deduct_amount;
        delete logPayload.discount_amount;
        delete logPayload.basket_return;
        const retry = await supabase.from('driver_collection_log').insert([logPayload]);
        logErr = retry.error;
      }

      if (logErr) throw logErr;
    }

    await supabase
      .from('store')
      .update({
        current_debt: record.expectedNewDebt,
        basket_count: record.newBaskets,
        carrier_hold_count: record.newBaskets
      })
      .eq('id', record.storeId);

    // 支持单张订单或同一门店多张待交割订单合并一次性签收核销
    const targetOrderIds =
      Array.isArray(record.orderIds) && record.orderIds.length > 0
        ? record.orderIds.map((id) => parseInt(id)).filter((n) => !isNaN(n))
        : record.orderId
        ? [parseInt(record.orderId)]
        : [];

    if (targetOrderIds.length > 0) {
      const orderUpdate = {
        delivery_status: 'delivered',
        order_status: 'delivered',
        pay_status: isOnlinePickup
          ? 'online_paid'
          : record.amount > 0
          ? 'paid'
          : record.method === '现金'
          ? 'cash_zero_cleared'
          : 'credit_logged',
        sign_image_url: record.signBase64
      };
      if (Array.isArray(record.proofImages) && record.proofImages.length > 0) {
        orderUpdate.proof_images = record.proofImages;
      }
      await supabase.from('store_order').update(orderUpdate).in('id', targetOrderIds);
    }
  },

  async submitStoreLead(payload) {
    return await supabase.from('store_lead').insert([payload]);
  },

  async submitSuggestion(payload) {
    return await supabase.from('platform_suggestion_board').insert([payload]);
  },

  async fetchUnsettledLogs(tenantId, driverName) {
    const { data } = await supabase
      .from('driver_collection_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('driver_name', driverName)
      .eq('settled_to_hq', false);
    return data || [];
  },

  async finalizeDriverCheckout(tenantId, driverName) {
    return await supabase
      .from('driver_collection_log')
      .update({ settled_to_hq: true })
      .eq('tenant_id', tenantId)
      .eq('driver_name', driverName)
      .eq('settled_to_hq', false);
  }
};
