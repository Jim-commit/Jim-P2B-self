import { supabase } from '../lib/supabase.js';

/**
 * 独立价值结算适配层（跨部署解耦设计）
 * 1. 现阶段运行于零成本境外云架构，支持：当面交割结清、先货后款周期对账、线下转账凭证核销、物物/劳务工时抵扣；
 * 2. 未来国内服务器完成 ICP 备案并部署独立支付收银台后，只需在总控台填入 external_payment_gateway_url，
 *    此处自动激活跨站安全跳转收款，全站业务表与界面无需任何重构。
 */
export const SettlementAdapter = {
  // 现阶段内置支持的四大平实交割方式
  BASE_METHODS: [
    {
      code: 'face_to_face',
      label: '🤝 当面交割结清',
      desc: '周边门店自提或顺路送货上门时，双方当面点清货品并结清款项'
    },
    {
      code: 'periodic_ledger',
      label: '📒 先货后款 · 周期对账',
      desc: '合作社与老主顾门店之间按约定周期记账汇总，定期平账'
    },
    {
      code: 'offline_voucher',
      label: '🧾 线下转账 · 凭证核销',
      desc: '大宗订货或平台运维会费通过银行/常用方式转账后，上传凭证确认'
    },
    {
      code: 'barter_or_labor',
      label: '🌾 以物换物 / 劳务工时抵扣',
      desc: '双方自愿缔结等值实物置换或工时互助契约，零现金记账平账'
    }
  ],

  // 动态读取当前可用的全部结算方式（自动探测是否已配置国内独立备案支付网关）
  async getAvailableSettlementMethods() {
    const methods = [...this.BASE_METHODS];
    try {
      const { data } = await supabase
        .from('platform_governance_config')
        .select('config_value')
        .eq('config_key', 'external_payment_gateway_url')
        .maybeSingle();

      const gatewayUrl = (data?.config_value || '').trim();
      if (gatewayUrl && /^https?:\/\//i.test(gatewayUrl)) {
        methods.unshift({
          code: 'external_cn_gateway',
          label: '💳 国内备案收银台在线支付',
          desc: '跳转至已备案的独立合规收银台完成在线付款',
          gatewayUrl
        });
      }
    } catch (e) {}
    return methods;
  },

  // 发起结算动作（自动路由至线下记账或独立国内收银台）
  async initiateSettlement({ orderId, tenantId, payerName, amount, methodCode, voucherNote = '' }) {
    const methods = await this.getAvailableSettlementMethods();
    const chosen = methods.find((m) => m.code === methodCode) || methods[0];

    if (chosen.code === 'external_cn_gateway' && chosen.gatewayUrl) {
      // 构造跨站安全跳转参数（未来国内收银台接收后回调核销）
      const target = new URL(chosen.gatewayUrl);
      target.searchParams.set('order_id', String(orderId || ''));
      target.searchParams.set('tenant_id', String(tenantId || ''));
      target.searchParams.set('amount', String(amount || 0));
      target.searchParams.set('return_url', window.location.href);
      return {
        mode: 'redirect',
        redirectUrl: target.toString(),
        message: '正在前往独立合规收银台完成交割...'
      };
    }

    // 现阶段标准交割：记录约定方式与交割凭证，不经过任何资金池
    return {
      mode: 'ledger',
      methodCode: chosen.code,
      methodLabel: chosen.label,
      status: methodCode === 'offline_voucher' ? 'pending_voucher_confirm' : 'agreed_to_settle',
      voucherNote,
      message: `已按【${chosen.label}】登记交割约定，双方核对无误后即可平账。`
    };
  }
};
