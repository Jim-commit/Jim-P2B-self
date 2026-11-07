import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || window.ENV_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || window.ENV_SUPABASE_ANON_KEY;

// 动态提取当前总代租户参数（不设静默默认值）
const urlParams = new URLSearchParams(window.location.search);
export const currentTenant = urlParams.get('tenant');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      // 若无租户参数，注入非法标识，确保后端 RLS 拦截
      'x-tenant-id': currentTenant || 'NO_TENANT_SPECIFIED',
    },
  },
});
