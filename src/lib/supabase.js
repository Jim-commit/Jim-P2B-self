import { createClient } from '@supabase/supabase-js';

// 从 Vercel 注入的环境变量或本地 .env 读取
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || window.ENV_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || window.ENV_SUPABASE_ANON_KEY;

// 动态提取当前总代/租户标识 (多仓/多总代隔离)
const urlParams = new URLSearchParams(window.location.search);
const currentTenant = urlParams.get('tenant') || 'BJ_HQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'x-tenant-id': currentTenant,
    },
  },
});
