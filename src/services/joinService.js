import { supabase } from '../lib/supabase.js';

export const JoinService = {
  // GB 32100-2015 统一社会信用代码 18 位国标校验位算法
  verifyCreditCodeGB32100(code) {
    if (!code || code.length !== 18) return false;
    const regex = /^[0-9A-HJ-NPQRTUWXY]{2}[0-9]{6}[0-9A-HJ-NPQRTUWXY]{10}$/;
    if (!regex.test(code)) return false;

    const charMap = '0123456789ABCDEFGHJKLMNPQRTUWXY';
    const weights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];
    let sum = 0;

    for (let i = 0; i < 17; i++) {
      const val = charMap.indexOf(code[i]);
      if (val === -1) return false;
      sum += val * weights[i];
    }

    const remainder = sum % 31;
    const checkIndex = remainder === 0 ? 0 : 31 - remainder;
    return code[17] === charMap[checkIndex];
  },

  // 扫描营业执照右上角国家公示系统防伪二维码
  scanOfficialLicenseQR(imgElement) {
    try {
      if (typeof window.jsQR !== 'function') {
        return { found: false, isOfficial: false, extractedCode: '', rawUrl: '' };
      }
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const scale = Math.min(1, 1400 / Math.max(imgElement.naturalWidth, imgElement.naturalHeight));
      canvas.width = imgElement.naturalWidth * scale;
      canvas.height = imgElement.naturalHeight * scale;
      ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qrResult = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });

      if (qrResult && qrResult.data) {
        const url = qrResult.data;
        const codeInUrl = url.match(/[0-9A-HJ-NPQRTUWXY]{18}/);
        const isGov = url.includes('gsxt.gov.cn') || url.includes('uniscid') || !!codeInUrl;
        return {
          found: true,
          isOfficial: isGov,
          extractedCode: codeInUrl ? codeInUrl[0] : '',
          rawUrl: url
        };
      }
    } catch (e) {}
    return { found: false, isOfficial: false, extractedCode: '', rawUrl: '' };
  },

  // 压缩执照照片用于存档
  compressImageForStorage(imgElement) {
    const canvas = document.createElement('canvas');
    const maxDim = 1000;
    const scale = Math.min(1, maxDim / Math.max(imgElement.naturalWidth, imgElement.naturalHeight));
    canvas.width = imgElement.naturalWidth * scale;
    canvas.height = imgElement.naturalHeight * scale;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78);
  },

  // 单入口原子化提交（防前端 F12 绕过，支持分级占用与正主抢注申诉）
  async submitVendorApplicationAtomic({
    resubmitId,
    tenantId,
    companyName,
    creditCode,
    contactPerson,
    contactPhone,
    backupPhone,
    sponsorOrg,
    businessType,
    accessKey,
    isManualFallback,
    auditSummary,
    licenseBase64,
    isClaimAppeal = false
  }) {
    const { data, error } = await supabase.rpc('rpc_submit_vendor_onboarding', {
      p_resubmit_id: resubmitId ? parseInt(resubmitId) : null,
      p_tenant_id: tenantId,
      p_company_name: companyName,
      p_credit_code: creditCode,
      p_contact_person: contactPerson,
      p_contact_phone: contactPhone,
      p_backup_phone: backupPhone,
      p_sponsor_org: sponsorOrg || '',
      p_business_type: businessType,
      p_access_key: accessKey,
      p_is_manual_fallback: isManualFallback,
      p_audit_summary: auditSummary,
      p_license_base64: licenseBase64,
      p_is_claim_appeal: isClaimAppeal
    });

    if (error) throw new Error('原子提交接口异常: ' + error.message);
    return data;
  },

  // 库级三重核身 / 四重应急核身查询（带数据库级 5 次熔断）
  async verifyAndQueryOnboarding({ mode, phone, idLast6, cipher = '', backupPhone = '', companyName = '' }) {
    const { data, error } = await supabase.rpc('rpc_verify_and_query_onboarding', {
      p_mode: mode,
      p_phone: phone,
      p_id_last6: idLast6,
      p_cipher: cipher,
      p_backup_phone: backupPhone,
      p_company_name: companyName
    });

    if (error) throw new Error('核身接口异常: ' + error.message);
    return data;
  },

  // 【向下兼容保留】校验手机号或商号代号是否已存在
  async checkExistingApplication(contactPhone, tenantId) {
    const { data } = await supabase
      .from('tenant_application')
      .select('id, tenant_id, contact_phone')
      .or(`contact_phone.eq.${contactPhone},tenant_id.eq.${tenantId}`);
    return data || [];
  },

  // 【向下兼容保留】凭主手机号 + 证件代码后 6 位拉取关联记录
  async queryApplicationsByPhoneAndLast6(phone, last6) {
    const { data, error } = await supabase
      .from('tenant_application')
      .select('*')
      .eq('contact_phone', phone)
      .order('id', { ascending: false });

    if (error) throw error;

    return (data || []).filter((app) => {
      const code = (app.credit_code || '').trim().toUpperCase();
      return code.endsWith(last6);
    });
  }
};
