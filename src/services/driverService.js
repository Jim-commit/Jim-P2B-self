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
    const txId = record?.clientTxUuid || record?.payload?.clientTxUuid;
    if (txId && queue.some((item) => (item?.clientTxUuid || item?.payload?.clientTxUuid) === txId)) {
      return queue.length;
    }
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

  async fetchRouteStores(tenantId) {
    const { data } = await supabase
      .from('store')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('current_debt', { ascending: false });
    return data || [];
  },

  async fetchActiveOrders(tenantId) {
    const { data } = await supabase
      .from('store_order')
      .select('*')
      .eq('tenant_id', tenantId)
      .neq('delivery_status', 'delivered')
      .in('order_status', ['confirmed', 'over_credit_approved', 'over_credit_pending'])
      .order('id', { ascending: false });
    return data || [];
  },

  async fetchTodayDeliveredOrders(tenantId) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('store_order')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('delivery_status', 'delivered')
      .gte('created_at', startOfDay.toISOString())
      .order('id', { ascending: false });
    return data || [];
  },

  async fetchTodayCollections(tenantId) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('driver_collection_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', startOfDay.toISOString())
      .order('id', { ascending: false });
    return data || [];
  },

  async fetchRouteData(tenantId) {
    const [stores, pendingOrders] = await Promise.all([
      this.fetchRouteStores(tenantId),
      this.fetchActiveOrders(tenantId)
    ]);
    return { stores, pendingOrders };
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

  /**
   * 幂等安全插入收款流水（若遇 23505 唯一索引冲突则视为该笔单据已入库，防止弱网连点/重传重复记账）
   */
  async _insertCollectionLogIdempotent(rawLogPayload) {
    const logPayload = { ...rawLogPayload };
    let { error: logErr } = await supabase.from('driver_collection_log').insert([logPayload]);

    // 幂等唯一键命中（说明此前超时/弱网请求实际已落库成功），直接返回 alreadyCommitted: true
    if (logErr && (logErr.code === '23505' || String(logErr.message || '').includes('duplicate key'))) {
      return { alreadyCommitted: true };
    }

    // 兼容旧版表结构：若部分扩展列尚未迁移则剥离后重试
    if (
      logErr &&
      logErr.message &&
      (logErr.message.includes('client_tx_uuid') || logErr.message.includes('basket_deduct_amount'))
    ) {
      delete logPayload.client_tx_uuid;
      delete logPayload.basket_deduct_amount;
      delete logPayload.discount_amount;
      delete logPayload.basket_return;
      const retry = await supabase.from('driver_collection_log').insert([logPayload]);
      if (retry.error && (retry.error.code === '23505' || String(retry.error.message || '').includes('duplicate key'))) {
        return { alreadyCommitted: true };
      }
      logErr = retry.error;
    }

    if (logErr) throw logErr;
    return { alreadyCommitted: false };
  },

  /**
   * 现场交割核销完整事务（支持 clientTxUuid 幂等防重账）
   */
  async completeDelivery(p) {
    const clientTxUuid = p.clientTxUuid || `TX-${p.tenantId || 'HQ'}-${p.orderId || p.storeId || 0}-${Date.now()}`;

    // 1. 先检查订单是否已被同一幂等事务核销（防止重复扣减门店欠款）
    if (p.orderId && Number(p.orderId) > 0) {
      const { data: existingOrd } = await supabase
        .from('store_order')
        .select('id, delivery_status, last_delivery_tx_uuid')
        .eq('id', Number(p.orderId))
        .maybeSingle();

      if (existingOrd && existingOrd.delivery_status === 'delivered') {
        return { alreadyCommitted: true };
      }
    }

    // 2. 幂等写入随车收款/载具回收流水
    const logEntry = {
      tenant_id: p.tenantId,
      store_id: p.storeId || null,
      store_name: p.storeName || '客户',
      driver_name: p.driverName || '送货师傅',
      order_id: p.orderId || null,
      amount: Number(p.payAmt || 0),
      discount_amount: Number(p.discountAmt || 0),
      basket_return: Number(p.basketReturn || 0),
      basket_deduct_amount: Number(p.basketDeductAmt || 0),
      pay_method: p.method || '电子扫码/转账',
      settled_to_hq: false,
      client_tx_uuid: clientTxUuid
    };

    const { alreadyCommitted } = await this._insertCollectionLogIdempotent(logEntry);
    if (alreadyCommitted) {
      return { alreadyCommitted: true };
    }

    // 3. 更新门店最新在账欠款与周转载具结存
    if (p.storeId && Number(p.storeId) > 0) {
      await supabase
        .from('store')
        .update({
          current_debt: Number(p.newDebt || 0),
          basket_count: Number(p.newBaskets || 0),
          carrier_hold_count: Number(p.newBaskets || 0)
        })
        .eq('id', Number(p.storeId));
    }

    // 4. 更新订单交割状态与电子签名存证
    if (p.orderId && Number(p.orderId) > 0) {
      const orderUpdate = {
        delivery_status: 'delivered',
        order_status: 'delivered',
        pay_status:
          Number(p.payAmt || 0) > 0
            ? 'paid'
            : p.method === '现金'
            ? 'cash_zero_cleared'
            : 'credit_logged',
        sign_image_url: p.signDataUrl || null,
        last_delivery_tx_uuid: clientTxUuid
      };
      if (Array.isArray(p.proofImages) && p.proofImages.length > 0) {
        orderUpdate.proof_images = p.proofImages;
      }

      const { error: ordErr } = await supabase
        .from('store_order')
        .update(orderUpdate)
        .eq('id', Number(p.orderId));

      if (ordErr && ordErr.message && ordErr.message.includes('last_delivery_tx_uuid')) {
        delete orderUpdate.last_delivery_tx_uuid;
        await supabase.from('store_order').update(orderUpdate).eq('id', Number(p.orderId));
      }
    }

    return { alreadyCommitted: false };
  },

  async executeSettlement(record) {
    const isOnlinePickup = !!record.isOnlinePickup;
    const hasBasketReturn = (record.logPayload?.basket_return || 0) > 0;
    const clientTxUuid = record.clientTxUuid || record.logPayload?.client_tx_uuid || null;

    if (record.amount > 0 || hasBasketReturn || !isOnlinePickup) {
      const logPayload = { ...record.logPayload };
      if (clientTxUuid && !logPayload.client_tx_uuid) {
        logPayload.client_tx_uuid = clientTxUuid;
      }
      const { alreadyCommitted } = await this._insertCollectionLogIdempotent(logPayload);
      if (alreadyCommitted) return { alreadyCommitted: true };
    }

    await supabase
      .from('store')
      .update({
        current_debt: record.expectedNewDebt,
        basket_count: record.newBaskets,
        carrier_hold_count: record.newBaskets
      })
      .eq('id', record.storeId);

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
      if (clientTxUuid) orderUpdate.last_delivery_tx_uuid = clientTxUuid;
      if (Array.isArray(record.proofImages) && record.proofImages.length > 0) {
        orderUpdate.proof_images = record.proofImages;
      }
      const { error: ordErr } = await supabase.from('store_order').update(orderUpdate).in('id', targetOrderIds);
      if (ordErr && ordErr.message && ordErr.message.includes('last_delivery_tx_uuid')) {
        delete orderUpdate.last_delivery_tx_uuid;
        await supabase.from('store_order').update(orderUpdate).in('id', targetOrderIds);
      }
    }
    return { alreadyCommitted: false };
  },

  async submitNewStoreLead({ tenantId, driverName, shopName, category, bossName, phone, address, note }) {
    return await supabase.from('store_lead').insert([
      {
        tenant_id: tenantId,
        driver_name: driverName,
        shop_name: shopName,
        category: category || '社区便利',
        boss_name: bossName,
        phone,
        address,
        note
      }
    ]);
  },

  async submitStoreLead(payload) {
    return await supabase.from('store_lead').insert([payload]);
  },

  async submitSuggestion(tenantIdOrPayload, operatorName, content) {
    if (typeof tenantIdOrPayload === 'object' && tenantIdOrPayload !== null) {
      return await supabase.from('platform_suggestion_board').insert([tenantIdOrPayload]);
    }
    return await supabase.from('platform_suggestion_board').insert([
      {
        tenant_id: tenantIdOrPayload,
        proposer_type: 'driver',
        proposer_name: operatorName,
        content,
        reply_status: 'pending'
      }
    ]);
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
