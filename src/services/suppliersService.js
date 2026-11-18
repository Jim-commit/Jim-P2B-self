import { supabase } from '../lib/supabase.js';

export const DEMO_SUPPLIERS = [
  {
    tenant_id: 'DEMO-HX888',
    name: '华兴源头粮油食品商行（示例展位）',
    category: '粮油米面 · 调味干货',
    city: '本地核心仓储配送圈',
    description: '专注社区超市、餐饮店一站式粮油调味直供，自有厢式货车每日早晚两班准时送货到店，破损包退。',
    media_url: '',
    hasCounter: true,
    products: [
      {
        name: '非转基因一级压榨花生油',
        spec: '5L×4桶/箱',
        measure_unit: '箱',
        origin_place: '源头工坊原产',
        tags: ['🔥 街坊抢手'],
        custom_specs: { attrs: { 保质期: '18个月', 工艺: '物理压榨' } },
        image_url: ''
      },
      {
        name: '东北长粒香大米（餐饮专供）',
        spec: '25kg/袋',
        measure_unit: '袋',
        origin_place: '黑龙江五常',
        tags: ['💎 高毛利'],
        custom_specs: { attrs: { 等级: 'GB/T19266一级' } },
        image_url: ''
      }
    ]
  }
];

const TYPE_LABEL_MAP = {
  dealer: '区域总经销 · 源头批发商',
  factory: '品牌制造工厂 · 源头直供',
  service: '工料配件 · 综合供应链'
};

export const SuppliersService = {
  async fetchVerifiedSuppliers() {
    if (!supabase) return DEMO_SUPPLIERS;

    const { data: tenants, error: tErr } = await supabase
      .from('platform_tenant')
      .select('*')
      .eq('is_active', true)
      .order('id', { ascending: false });

    if (tErr) throw tErr;

    const validTenants = (tenants || []).filter(
      (t) => t.permit_brick_and_mortar !== false && !['电子商务', '电商直供', 'online'].includes(t.service_mode)
    );

    if (validTenants.length === 0) return DEMO_SUPPLIERS;

    const { data: products, error: pErr } = await supabase
      .from('product')
      .select('id, tenant_id, name, category_main, category_sub, spec, measure_unit, origin_place, image_url, tags, custom_specs, status, channel_brick_and_mortar, channel_ecommerce, sales_channel_type')
      .eq('status', 'active');

    if (pErr) console.warn('[SuppliersService] 读取商品样例失败:', pErr);

    const productMap = {};
    const counterEnabledMap = {};

    (products || []).forEach((p) => {
      const isBM =
        p.channel_brick_and_mortar !== undefined
          ? !!p.channel_brick_and_mortar
          : ['实体店', '实体与电商双轨', '双轨', 'offline', 'both'].includes(p.sales_channel_type) || !p.sales_channel_type;

      const isEC =
        p.channel_ecommerce !== undefined
          ? !!p.channel_ecommerce
          : ['电子商务', '电商直供', '实体与电商双轨', '双轨', 'online', 'both'].includes(p.sales_channel_type);

      if (isEC) counterEnabledMap[p.tenant_id] = true;
      if (!isBM) return;

      if (!productMap[p.tenant_id]) productMap[p.tenant_id] = [];
      if (productMap[p.tenant_id].length < 8) {
        productMap[p.tenant_id].push(p);
      }
    });

    return validTenants.map((t) => {
      const prods = productMap[t.tenant_id] || [];
      const cats = Array.from(new Set(prods.map((p) => p.category_main).filter(Boolean)));
      const rawType = t.business_type || t.business_scope || '';
      const displayCategory = TYPE_LABEL_MAP[rawType] || rawType || (cats.length > 0 ? cats.join(' · ') : '实体全品类直供');

      return {
        tenant_id: t.tenant_id,
        name: t.company_name || t.tenant_id,
        category: displayCategory,
        city: t.region || t.address || '本地仓储配送覆盖',
        description:
          t.brand_origin_desc ||
          t.intro ||
          `源头正规供货商（商号：${t.tenant_id}），营业执照与资质已核验，支持签约门店定期配送、电子签收与往来授信对账。`,
        media_url: t.media_url || t.video_url || '',
        hasCounter: !!counterEnabledMap[t.tenant_id] || t.permit_ecommerce !== false,
        products: prods,
        webhook_url: t.webhook_url || ''
      };
    });
  },

  async submitSampleInquiry({ tenantId, storeName, contactName, phone, address, note, referrer, webhookUrl }) {
    if (!supabase || tenantId.startsWith('DEMO-')) return;

    const orderNo = `LEAD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const refTag = referrer ? ` | 推荐老客:${referrer}` : '';
    const fullNote = `[新店招商线索] 联系人:${contactName} | 电话:${phone} | 地址:${address}${refTag}${note ? ' | 意向:' + note : ''}`;

    let validStoreId = null;
    const { data: existingStores } = await supabase.from('store').select('id').eq('tenant_id', tenantId).limit(1);

    if (existingStores && existingStores.length > 0) {
      validStoreId = existingStores[0].id;
    } else {
      const { data: createdStore, error: sErr } = await supabase
        .from('store')
        .insert([
          {
            tenant_id: tenantId,
            name: storeName,
            contact: contactName,
            phone,
            credit_limit: 0,
            monthly_return_quota: 500,
            current_debt: 0,
            driver_name: '待指派'
          }
        ])
        .select('id')
        .single();

      if (sErr) throw sErr;
      validStoreId = createdStore.id;
    }

    const baseOrderPayload = {
      order_no: orderNo,
      tenant_id: tenantId,
      store_id: validStoreId,
      store_name: storeName,
      driver_name: '待指派业务员',
      settlement_type: 'credit',
      settlement_note: `${contactName}|${phone}|${address}`,
      items: [],
      items_return: [],
      items_exchange: [],
      total_amount: 0,
      return_amount: 0,
      net_settle_amount: 0,
      order_status: 'pending_confirm',
      delivery_status: 'lead_pending',
      note: fullNote,
      driver_action_instruction: `【新店送样线索】联系 ${contactName}(${phone}) 上门洽谈`
    };

    let { error } = await supabase.from('store_order').insert([
      {
        ...baseOrderPayload,
        order_source: 'b2b_directory_lead'
      }
    ]);

    if (error && (error.message || '').includes('order_source')) {
      const retryRes = await supabase.from('store_order').insert([baseOrderPayload]);
      error = retryRes.error;
    }

    if (error) throw error;

    if (webhookUrl && webhookUrl.startsWith('http')) {
      const msg = `🤝【新店招商线索提醒】\n意向门店：${storeName}\n联系人：${contactName} (${phone})\n地址：${address}${refTag}\n请及时联系送样并一键建档开户！`;
      fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'text', text: { content: msg }, content: { text: msg } })
      }).catch(() => {});
    }
  }
};
