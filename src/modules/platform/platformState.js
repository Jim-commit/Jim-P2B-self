import { supabase } from '../../lib/supabase.js';

export const P_AUTH_SESSION_KEY = 'platform_admin_session_token';
export const PLATFORM_GOV_PREFS_KEY = 'baigong_platform_gov_prefs_v1';

export const PLATFORM_SEVERE_TERMS = [
  '国家级', '世界级', '最高级', '第一', '绝对', '包治百病', '根治', '神效',
  '假一赔万', '100%有效', '加微信', '微信号', '私下转账'
];

export const platformState = {
  allApplications: [],
  allTenants: [],
  allProducts: [],
  allCategories: [],
  allSuggestions: [],
  allAuditLogs: [],
  allEcoPlans: [],
  allEcoPool: [],
  allEcoC2B: [],
  allEcoOrders: [],
  // 【新增】全域零写死治理参数、自定义会员等级、AI巡检与双轨申诉工单
  allGovConfigs: [],
  allMembershipPlans: [],
  allComplianceCases: [],
  pendingPlatform2FACallback: null
};

export function formatBusinessTypeLabel(type) {
  const map = {
    coop: '🌾 村社合作社 / 产区直供',
    factory: '🏭 源头工坊 / 生产制造',
    dealer: '🏢 区域平准仓 / 集散商行',
    service: '🛠️ 工料配套 / 专业服务机构',
    individual: '👨‍🌾 个人农户 / 手艺人 / 个体匠人 (GR)'
  };
  return map[type] || '🏢 区域平准仓 / 集散商行';
}

export async function recordAuditLog(actionTitle, level, details) {
  try {
    const account = sessionStorage.getItem('p_auth_account') || 'admin';
    const name = sessionStorage.getItem('p_auth_name') || '总控执事';
    const seal = 'SEAL-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    await supabase.from('audit_immutable_log').insert([
      {
        tenant_id: 'PLATFORM',
        operator_account: account,
        operator_name: name,
        action_level: level,
        action_title: actionTitle,
        action_details: details || {},
        tamper_seal: seal
      }
    ]);
  } catch (e) {}
}

// 【新增】动态读取全域治理参数（无硬编码兜底）
export function getGovConfigValue(key, fallback = '') {
  const found = (platformState.allGovConfigs || []).find((c) => c.config_key === key);
  return found && found.config_value !== undefined && found.config_value !== '' ? found.config_value : fallback;
}
