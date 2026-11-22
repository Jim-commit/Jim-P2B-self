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

  // 校验手机号或商号代号是否已存在
  async checkExistingApplication(contactPhone, tenantId) {
    const { data } = await supabase
      .from('tenant_application')
      .select('id, tenant_id, contact_phone')
      .or(`contact_phone.eq.${contactPhone},tenant_id.eq.${tenantId}`);
    return data || [];
  },

  // 提交新入驻申请或退回补件重提
  async submitVendorApplication({
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
    licenseBase64
  }) {
    const appStatus = isManualFallback ? 'pending_review' : 'approved_by_ai';
    const auditScore = isManualFallback ? 65 : 98;

    if (resubmitId) {
      const { error: updErr } = await supabase
        .from('tenant_application')
        .update({
          company_name: companyName,
          credit_code: creditCode,
          contact_person: contactPerson,
          contact_phone: contactPhone,
          business_type: businessType,
          access_key: accessKey,
          application_status: appStatus,
          ai_audit_score: auditScore,
          review_note: `【补件重提】${auditSummary}`,
          license_image_url: licenseBase64
        })
        .eq('id', parseInt(resubmitId));

      if (updErr) throw new Error('补件更新失败: ' + updErr.message);
    } else {
      const { error: appErr } = await supabase.from('tenant_application').insert([
        {
          tenant_id: tenantId,
          company_name: companyName,
          credit_code: creditCode,
          contact_person: contactPerson,
          contact_phone: contactPhone,
          business_type: businessType,
          service_mode: '实体与电商双轨',
          access_key: accessKey,
          application_status: appStatus,
          ai_audit_score: auditScore,
          review_note: auditSummary,
          license_image_url: licenseBase64
        }
      ]);

      if (appErr) throw new Error('申请登记失败: ' + appErr.message);
    }

    if (!isManualFallback) {
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 7);

      const { error: tenantErr } = await supabase.from('platform_tenant').upsert([
        {
          tenant_id: tenantId,
          company_name: companyName,
          credit_code: creditCode,
          business_type: businessType,
          service_mode: '实体与电商双轨',
          contact_person: contactPerson,
          contact_name: contactPerson,
          phone: contactPhone,
          backup_phone: backupPhone || null,
          sponsor_org: sponsorOrg || null,
          access_key: accessKey,
          membership_status: 'trial',
          is_active: true,
          permit_brick_and_mortar: true,
          permit_ecommerce: true,
          valid_until: trialEndDate.toISOString().slice(0, 10)
        }
      ]);

      if (tenantErr) throw new Error('开席激活失败: ' + tenantErr.message);
    }
  },

  // 凭主手机号 + 证件代码后 6 位拉取关联记录（供三重核身与四重应急核身过滤）
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
