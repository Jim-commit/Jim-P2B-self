import { supabase } from '../lib/supabase.js';
import { JoinService } from '../services/joinService.js';
import { AuthSecurity } from '../utils/authSecurity.js';

let currentCompressedBase64 = null;
let isLicenseVerified = false;
let isManualFallbackMode = false;
let failedAttemptsCount = 0;
let verifiedAuditSummary = '';
let lastQueriedApps = [];
let dynamicTrialDays = 7;
let lastOcrExtractedText = '';

// 核心高频地理标志与老字号公共名基线词库（支持通过 platform_governance_config.protected_public_names 动态追加）
let protectedPublicNames = [
  '西湖龙井',
  '阳澄湖',
  '五常大米',
  '茅台',
  '五粮液',
  '同仁堂',
  '全聚德',
  '东阿阿胶',
  '安溪铁观音',
  '武夷大红袍',
  '赣南脐橙',
  '洛川苹果',
  '库尔勒香梨',
  '吐鲁番葡萄',
  '阳山蜜桃',
  '烟台苹果',
  '涪陵榨菜',
  '镇江香醋',
  '山西老陈醋',
  '金华火腿',
  '宣威火腿',
  '郫县豆瓣',
  '景德镇',
  '宜兴紫砂',
  '普洱茶',
  '信阳毛尖',
  '黄山毛峰',
  '洞庭碧螺春',
  '六安瓜片',
  '祈门红茶',
  '长白山人参',
  '宁夏枸杞',
  '和田玉',
  '平遥牛肉',
  '德州扒鸡',
  '道口烧鸡',
  '柳州螺蛳粉',
  '兰州拉面',
  '沙县小吃'
];

async function loadDynamicGovernanceConfig() {
  try {
    const { data } = await supabase
      .from('platform_governance_config')
      .select('config_key, config_value')
      .in('config_key', ['trial_days', 'protected_public_names']);

    (data || []).forEach((row) => {
      if (row.config_key === 'trial_days' && row.config_value) {
        dynamicTrialDays = parseInt(row.config_value, 10) || 7;
        document.querySelectorAll('.js-dynamic-trial-days').forEach((el) => {
          el.innerText = `${dynamicTrialDays} 天`;
        });
      } else if (row.config_key === 'protected_public_names' && row.config_value) {
        const extra = String(row.config_value)
          .split(/[,，、\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (extra.length > 0) {
          protectedPublicNames = Array.from(new Set([...protectedPublicNames, ...extra]));
        }
      }
    });
  } catch (e) {}
}

function checkProtectedPublicNameConflict(companyName, businessType) {
  const cleanInput = String(companyName || '').replace(/\s+/g, '');
  if (!cleanInput) return null;

  const hitWord = protectedPublicNames.find((kw) => kw && cleanInput.includes(kw));
  if (!hitWord) return null;

  // 若营业执照 OCR 原件识别文本中本身完整包含该名称，说明确系当地合法核准主体，名实相符直接放行
  if (lastOcrExtractedText && lastOcrExtractedText.includes(hitWord)) {
    return null;
  }

  return {
    hitWord,
    isInd: businessType === 'individual'
  };
}

function generateCheckCipher() {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let body = '';
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 6; i++) {
    body += chars[arr[i] % chars.length];
  }
  return `SD-${body}`;
}

function extractCipherFromReviewNote(note) {
  const m = String(note || '').match(/\[查验暗号[:：]([A-Z0-9-]+)\]/i);
  return m ? m[1].toUpperCase() : '';
}

function extractBackupPhoneFromReviewNote(note) {
  const m = String(note || '').match(/\[备用手机[:：](\d{11})\]/);
  return m ? m[1] : '';
}

window.syncTenantIdFromCreditCode = function (codeVal) {
  const bType = document.getElementById('v-business-type')?.value || 'coop';
  const personName = document.getElementById('v-contact-person')?.value || '';
  const tidInput = document.getElementById('v-tenant-id');
  if (!tidInput) return;

  const generated = AuthSecurity.generateLockedTenantId(bType, codeVal, personName);
  if (generated) {
    tidInput.value = generated;
  }
};

window.fillGeneratedMemorablePwd = function () {
  const pwd = AuthSecurity.generateStrongMasterPassword();
  const p1 = document.getElementById('v-access-key');
  const p2 = document.getElementById('v-access-key-confirm');
  if (p1) p1.value = pwd;
  if (p2) p2.value = pwd;
  navigator.clipboard?.writeText(pwd).catch(() => {});
  alert(
    `🎲 已为您生成 14 位高强度顺口安家主密码并复制到剪贴板：\n\n【 ${pwd} 】\n\n` +
      `（同时包含大小写字母、数字与特殊符号，请随手存进微信收藏；首次登录掌中宝后即可设置 4 位快捷短码秒进！）`
  );
};

window.onBusinessTypeChange = function (bType) {
  const isInd = bType === 'individual';
  document.getElementById('individual-rule-tip')?.classList.toggle('hidden', !isInd);
  document.getElementById('individual-sponsor-box')?.classList.toggle('hidden', !isInd);

  const lblUpload = document.getElementById('lbl-license-upload');
  const lblMain = document.getElementById('lbl-upload-main');
  const lblName = document.getElementById('lbl-company-name');
  const lblCode = document.getElementById('lbl-credit-code');
  const lblScope = document.getElementById('lbl-business-scope');

  if (isInd) {
    if (lblUpload) lblUpload.innerText = '2. 个人实名身份证件 / 手艺资质实拍照 *：';
    if (lblMain) lblMain.innerText = '点击拍摄或上传本人身份证件正面原件';
    if (lblName) lblName.innerText = '个人实名招牌 (格式：真实姓名·所在镇村/行当，如：王建国·石界河镇农户) *：';
    if (lblCode) lblCode.innerText = '个人身份证号码 (18位 · 系统自动生成 GR- 专属代号) *：';
    if (lblScope) lblScope.innerText = '主营农产 / 手艺服务范围（防越界自律备案） *：';
  } else {
    if (lblUpload) lblUpload.innerText = '2. 营业执照正本 / 副本实拍照 (拍照后自动即时核验) *：';
    if (lblMain) lblMain.innerText = '点击拍摄或上传营业执照原件';
    if (lblName) lblName.innerText = '法定主体全称 (严格与营业执照《名称》一致，不准自起花名) *：';
    if (lblCode) lblCode.innerText = '统一社会信用代码 (18位国标校验 · 自动按机构代码锁定商号) *：';
    if (lblScope) lblScope.innerText = '营业执照经营范围（系统自动核验，上架商品不超范围） *：';
  }

  const curCode = document.getElementById('v-credit-code')?.value || '';
  window.syncTenantIdFromCreditCode(curCode);
};

window.switchJoinTab = function (tab) {
  const formEl = document.getElementById('join-vendor-form');
  const queryEl = document.getElementById('query-status-section');
  const btnApply = document.getElementById('tab-btn-apply');
  const btnQuery = document.getElementById('tab-btn-query');

  if (tab === 'apply') {
    formEl?.classList.remove('hidden');
    queryEl?.classList.add('hidden');
    if (btnApply) btnApply.className = 'flex-1 py-2.5 rounded-xl bg-amber-500 text-stone-950 transition shadow';
    if (btnQuery) btnQuery.className = 'flex-1 py-2.5 rounded-xl text-stone-400 hover:text-white transition';
  } else {
    formEl?.classList.add('hidden');
    queryEl?.classList.remove('hidden');
    if (btnQuery) btnQuery.className = 'flex-1 py-2.5 rounded-xl bg-amber-500 text-stone-950 transition shadow';
    if (btnApply) btnApply.className = 'flex-1 py-2.5 rounded-xl text-stone-400 hover:text-white transition';
  }
};

window.toggleForgotCipherBox = function () {
  document.getElementById('forgot-cipher-box')?.classList.toggle('hidden');
};

function updateSubmitButtonState(enabled, isManual = false) {
  const btn = document.getElementById('btn-submit-join');
  if (!btn) return;
  const isResubmit = !!document.getElementById('resubmit-app-id')?.value;

  if (enabled && !isManual) {
    btn.disabled = false;
    btn.className =
      'w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-2xl active:scale-95 transition shadow-lg text-sm flex items-center justify-center gap-2 cursor-pointer';
    btn.innerHTML = isResubmit
      ? '<span>🔄</span> 资质已验真 · 立即重新递交复核'
      : `<span>📜</span> 资质已验真 · 当场签约发证（免费体验${dynamicTrialDays}天）`;
  } else if (enabled && isManual) {
    btn.disabled = false;
    btn.className =
      'w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl active:scale-95 transition shadow-lg text-sm flex items-center justify-center gap-2 cursor-pointer';
    btn.innerHTML = isResubmit
      ? '<span>📨</span> 重新提交补件资料 · 领取查验暗号'
      : '<span>📨</span> 提交资料转人工复核 · 立即领取查验暗号';
  } else {
    btn.disabled = true;
    btn.className =
      'w-full py-3.5 bg-stone-700 text-stone-400 cursor-not-allowed font-bold rounded-2xl transition shadow-lg text-sm flex items-center justify-center gap-2';
    btn.innerHTML = '<span>🔒</span> 请先完成资质原件核验以解锁提交';
  }
}

function renderInteractiveFeedback(passed, successes, issues, creditCode) {
  const box = document.getElementById('audit-feedback-box');
  const title = document.getElementById('audit-feedback-title');
  const list = document.getElementById('audit-feedback-list');
  const retryBtn = document.getElementById('audit-retry-btn');
  const isInd = document.getElementById('v-business-type')?.value === 'individual';

  box?.classList.remove('hidden');

  if (passed) {
    isLicenseVerified = true;
    isManualFallbackMode = false;
    box.className = 'p-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 text-emerald-200 space-y-2';
    title.innerHTML = isInd
      ? '🎉 个人实名证件核验通过！提交即当场发放商号信物'
      : '🎉 营业执照三维度光学验真通过！提交即当场发放商号信物';
    retryBtn?.classList.add('hidden');

    list.innerHTML = successes.map((s) => `<li>${s}</li>`).join('');

    if (creditCode) {
      document.getElementById('v-credit-code').value = creditCode;
      window.syncTenantIdFromCreditCode(creditCode);
    }

    verifiedAuditSummary = successes.join(' | ').replace(/<[^>]+>/g, '');
    updateSubmitButtonState(true, false);
  } else {
    failedAttemptsCount++;
    isLicenseVerified = false;

    if (failedAttemptsCount >= 2 || isInd) {
      isManualFallbackMode = true;
      box.className = 'p-4 rounded-2xl border border-amber-500/50 bg-amber-950/30 text-amber-200 space-y-2';
      title.innerHTML = isInd
        ? '👨‍🌾 个人实名证件已留档 · 已开启【人工绿色复核通道】'
        : '🛡️ 已为您开启【人工绿色复核通道】';
      retryBtn?.classList.remove('hidden');
      if (retryBtn) retryBtn.innerText = '📷 再试一次清晰拍摄';

      list.innerHTML = [
        '<li>请在下方核对填写您的<b>法定主体全称</b>、<b>18位代码/证件号</b>与<b>紧急备用手机号</b>。</li>',
        '<li>提交后系统将<b>当场发放 8 位专属【查验暗号】</b>，总控人工复核通过后凭暗号即可领取商号信物。</li>'
      ].join('');

      verifiedAuditSummary = isInd
        ? '【个人实名入驻通道】已附实名证件原件转入后台人工复核。'
        : '【触发人工兜底通道】前端光学未自动放行，已附原件转入后台人工复核。';
      updateSubmitButtonState(true, true);
    } else {
      isManualFallbackMode = false;
      box.className = 'p-4 rounded-2xl border border-rose-500/50 bg-rose-950/30 text-rose-200 space-y-2';
      title.innerHTML = '⚠️ 照片清晰度或防伪特征未达标，请按提示重拍（第 1 次提醒）：';
      retryBtn?.classList.remove('hidden');

      const allItems = [...issues, ...successes];
      list.innerHTML = allItems.map((item) => `<li>${item}</li>`).join('');
      updateSubmitButtonState(false, false);
    }
  }
}

async function runInteractiveLicenseCheck(imgElement, base64Data) {
  const isInd = document.getElementById('v-business-type')?.value === 'individual';
  lastOcrExtractedText = '';
  if (isInd) {
    renderInteractiveFeedback(false, [], [], '');
    return;
  }

  const progressBox = document.getElementById('ocr-progress-box');
  const statusText = document.getElementById('ocr-status-text');
  const pctText = document.getElementById('ocr-progress-pct');
  const progressBar = document.getElementById('ocr-progress-bar');
  const feedbackBox = document.getElementById('audit-feedback-box');

  feedbackBox?.classList.add('hidden');
  progressBox?.classList.remove('hidden');
  statusText.innerText = '正在检测执照右上角官方二维码...';
  pctText.innerText = '15%';
  progressBar.style.width = '15%';

  const qrScan = JoinService.scanOfficialLicenseQR(imgElement);

  let recognizedText = '';
  let isOcrTimeout = false;

  try {
    const ocrPromise = (async () => {
      const worker = await window.Tesseract.createWorker('chi_sim', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const p = Math.min(95, 20 + Math.floor(m.progress * 75));
            statusText.innerText = `正在逐行校对执照文字与代码 (${p}%)...`;
            pctText.innerText = `${p}%`;
            progressBar.style.width = `${p}%`;
          }
        }
      });
      const ret = await worker.recognize(base64Data);
      await worker.terminate();
      return ret.data.text.replace(/\s+/g, '');
    })();

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('OCR_TIMEOUT')), 12000));
    recognizedText = await Promise.race([ocrPromise, timeoutPromise]);
    lastOcrExtractedText = recognizedText;
  } catch (err) {
    isOcrTimeout = true;
  }

  progressBox?.classList.add('hidden');

  if (isOcrTimeout) {
    failedAttemptsCount = 2;
    renderInteractiveFeedback(false, [], ['⚠️ 当前网络较慢或设备光学识别超时，已自动为您转入人工快速核验通道。'], '');
    return;
  }

  const issues = [];
  const successes = [];

  const keywords = ['营业执照', '统一社会信用代码', '法定代表人', '登记机关', '住所', '有限责任公司', '经营范围', '专业合作社'];
  const hitKeywords = keywords.filter((kw) => recognizedText.includes(kw));

  if (hitKeywords.length >= 2) {
    successes.push(`✅ <b>版面特征合法</b>：识别到「${hitKeywords.slice(0, 3).join('、')}」等法定字段。`);
  } else {
    issues.push('❌ <b>未识别到营业执照版面文字</b>：请确保上传的是营业执照原件，光线充足无严重模糊。');
  }

  let finalCreditCode = qrScan.extractedCode;
  if (!finalCreditCode) {
    const match18 = recognizedText.match(/[0-9A-HJ-NPQRTUWXY]{18}/);
    if (match18) finalCreditCode = match18[0];
  }

  const isCodeChecksumPass = JoinService.verifyCreditCodeGB32100(finalCreditCode);

  if (qrScan.isOfficial) {
    successes.push(`✅ <b>官方二维码验真通过</b>：成功解码国家公示系统防伪码。`);
  } else {
    issues.push('⚠️ <b>右上角官方二维码未扫出</b>：可能存在反光或折痕，建议对准右上角重拍。');
  }

  if (finalCreditCode && isCodeChecksumPass) {
    successes.push(`✅ <b>国标 18 位代码校验合格</b>：<code>${finalCreditCode}</code>（已自动按机构代码锁定专属商号）。`);
  } else if (finalCreditCode) {
    issues.push(`❌ <b>信用代码读取有误（${finalCreditCode}）</b>：校验位不符，请拉近对焦重拍。`);
  } else {
    issues.push('❌ <b>未提取到 18 位统一社会信用代码</b>：请确保代码区域完整入镜。');
  }

  const nameMatch = recognizedText.match(/名称[:：]?([\u4e00-\u9fa5()（）]{4,30}(?:合作社|公司|厂|店|社|中心))/);
  if (nameMatch && nameMatch[1] && !document.getElementById('v-company-name').value) {
    document.getElementById('v-company-name').value = nameMatch[1];
  }

  const scopeMatch = recognizedText.match(/经营范围[:：]?([\u4e00-\u9fa5、，；()（）]{4,80})/);
  const scopeInput = document.getElementById('v-business-scope');
  if (scopeMatch && scopeMatch[1] && scopeInput && !scopeInput.value) {
    scopeInput.value = scopeMatch[1];
  }

  const canPass = hitKeywords.length >= 2 && (qrScan.isOfficial || isCodeChecksumPass);
  renderInteractiveFeedback(canPass, successes, issues, finalCreditCode);
}

window.handleImageUpload = function (e) {
  const file = e.target.files[0];
  if (!file) return;

  isLicenseVerified = false;
  updateSubmitButtonState(false, false);

  const reader = new FileReader();
  reader.onload = function (evt) {
    const rawBase64 = evt.target.result;
    const img = document.getElementById('license-preview-img');

    img.onload = async function () {
      currentCompressedBase64 = JoinService.compressImageForStorage(img);
      await runInteractiveLicenseCheck(img, rawBase64);
    };

    img.src = rawBase64;
    img.classList.remove('hidden');
    document.getElementById('upload-placeholder')?.classList.add('hidden');
    document.getElementById('btn-reupload')?.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
};

window.handleVendorRegister = async function (e, isClaimAppeal = false) {
  if (e && e.preventDefault) e.preventDefault();
  if (!document.getElementById('chk-agree-covenant')?.checked) {
    return alert('请先阅读并勾选同意《百工百业平台入驻与商道公约》！');
  }
  if (!isLicenseVerified && !isManualFallbackMode) {
    return alert('请先上传营业执照或实名证件原件并完成核验！');
  }

  const resubmitId = document.getElementById('resubmit-app-id').value;
  const companyName = document.getElementById('v-company-name').value.trim();
  const creditCode = document.getElementById('v-credit-code').value.trim().toUpperCase();
  const businessType = document.getElementById('v-business-type').value;
  const businessScope = document.getElementById('v-business-scope')?.value.trim() || '';
  const contactPerson = document.getElementById('v-contact-person').value.trim();
  const contactPhone = document.getElementById('v-contact-phone').value.trim();
  const backupPhone = document.getElementById('v-backup-phone')?.value.trim() || '';
  const sponsorOrg = document.getElementById('v-sponsor-org')?.value.trim() || '';
  const rawPwd = document.getElementById('v-access-key').value.trim();
  const confirmPwd = document.getElementById('v-access-key-confirm').value.trim();

  if (creditCode.length !== 18) {
    return alert('请完整填写 18 位统一社会信用代码或 18 位个人身份证号码！');
  }
  if (!businessScope) {
    return alert('请填写营业执照经营范围或主营农产/手艺范围（用于防越界自律备案）！');
  }
  if (!/^1\d{10}$/.test(contactPhone)) {
    return alert('请填写正确的 11 位主联络手机号码！');
  }
  if (!/^1\d{10}$/.test(backupPhone)) {
    return alert('⚠️ 紧急备用手机号为必填项，请填写正确的 11 位手机号码（可填监事长、合伙人或家人手机号）！');
  }
  if (contactPhone === backupPhone) {
    return alert('⚠️ 紧急备用手机号不能与主联络手机号相同，请填写另一个可联系到的手机号码！');
  }

  // 老字号与产区公共名“名实互证”温婉护栏
  let effectiveManualMode = isManualFallbackMode;
  let publicNameAuditNote = '';
  const conflict = checkProtectedPublicNameConflict(companyName, businessType);
  if (conflict) {
    const proceedManual = confirm(
      `🌿 产区公共名与老字号“名实相符”温和提示：\n\n` +
        `系统检测到您填写的名称中包含受保护的公共地理标志或老字号字样【${conflict.hitWord}】，但尚未在上传的执照原件文字中自动核对到该名称。\n\n` +
        `• 若您尚未按执照全称填写，请点「取消」并严格修改为营业执照核准全称（或个人实名格式）；\n` +
        `• 若您确系当地产区农户/非遗传承人或持有授权证明，请点「确定」，系统将自动转入【平台总控人工复核通道】为您核实开席。`
    );
    if (!proceedManual) {
      document.getElementById('v-company-name')?.focus();
      return;
    }
    effectiveManualMode = true;
    publicNameAuditNote = `[需核验公共地标/字号:${conflict.hitWord}]`;
  }

  const tenantId = AuthSecurity.generateLockedTenantId(businessType, creditCode, contactPerson);
  document.getElementById('v-tenant-id').value = tenantId;

  if (rawPwd !== confirmPwd) {
    return alert('⚠️ 两次输入的安家主密码不一致，请核对后重新输入！');
  }

  const pwdCheck = AuthSecurity.validatePasswordStrength(rawPwd, tenantId, contactPhone);
  if (!pwdCheck.ok) {
    return alert(
      `⚠️ 主密码强度未达标：\n${pwdCheck.msg}\n\n` +
        `请使用 12 位以上（含大小写字母 + 数字 + 特殊符号），或点击「🎲 一键生成14位高强顺口密码」。`
    );
  }

  const btn = document.getElementById('btn-submit-join');
  btn.disabled = true;
  btn.innerHTML = '正在核对一证一户分级唯一性并原子提交...';

  try {
    const hashedAccessKey = await AuthSecurity.hashPassword(rawPwd, tenantId);
    const checkCipher = generateCheckCipher();

    const extraNotes = [`[查验暗号:${checkCipher}]`, `[备用手机:${backupPhone}]`, `[经营范围:${businessScope}]`];
    if (publicNameAuditNote) extraNotes.push(publicNameAuditNote);
    if (sponsorOrg) extraNotes.push(`联保担保单位：${sponsorOrg}`);
    const finalAuditSummary = `${verifiedAuditSummary} | ${extraNotes.join(' ')}`;

    const res = await JoinService.submitVendorApplicationAtomic({
      resubmitId,
      tenantId,
      companyName,
      creditCode,
      contactPerson,
      contactPhone,
      backupPhone,
      sponsorOrg,
      businessType,
      accessKey: hashedAccessKey,
      isManualFallback: effectiveManualMode,
      auditSummary: finalAuditSummary,
      licenseBase64: currentCompressedBase64,
      isClaimAppeal
    });

    if (!res?.ok) {
      if (res?.code === 'CAN_APPEAL_CLAIM') {
        const wantAppeal = confirm(
          `🛡️ 发现疑似抢注记录：\n\n${res.msg}\n\n是否立即作为【正主发起抢注申诉】并附原件转交平台总控核实覆盖？`
        );
        if (wantAppeal) {
          btn.disabled = false;
          return window.handleVendorRegister(null, true);
        }
      } else {
        alert(res?.msg || '提交未通过校验');
      }
      btn.disabled = false;
      updateSubmitButtonState(true, effectiveManualMode);
      return;
    }

    // 同步初始化私有安全保险箱与法定经营范围
    try {
      await supabase.rpc('rpc_sync_tenant_vault', {
        p_tenant_id: tenantId,
        p_access_key: hashedAccessKey,
        p_backup_phone: backupPhone
      });
      await supabase
        .from('platform_tenant')
        .update({ business_scope: businessScope })
        .eq('tenant_id', tenantId);
    } catch (e) {}

    navigator.clipboard?.writeText(checkCipher).catch(() => {});

    const isAutoApproved = res.status === 'approved_by_ai';

    if (isAutoApproved) {
      alert(
        `🎉 AI 核验秒过 · 当场发放商号信物！已为您开通「🍃 尝鲜体验」${dynamicTrialDays}天全功能席位！\n\n` +
          `• 法定主体名称：${companyName}\n` +
          `• 专属商号代号（登录账号）：${tenantId}\n` +
          `• 专属查验暗号（已复制）：${checkCipher}\n` +
          `• 安家主密码：您刚才设定的 12 位以上高强度主密码\n\n` +
          `接下来将为您生成《商号安家立户凭证卡》，请长按保存至手机相册！`
      );
    } else {
      alert(
        `📨 资料已成功转入平台总控人工绿色复核通道！\n\n` +
          `🔐 请务必牢记或截屏保存您的专属【查验暗号】：\n` +
          `【 ${checkCipher} 】（已自动复制到剪贴板）\n\n` +
          `• 锁定商号代号：${tenantId}\n` +
          `• 主联络手机：${contactPhone}\n` +
          `• 紧急备用手机：${backupPhone}\n\n` +
          `总控核验通过后，凭「主手机 + 证件后6位 + 查验暗号」三重核身即可领取商号信物！`
      );
    }

    window.cancelResubmitMode();
    document.getElementById('q-search-phone').value = contactPhone;
    document.getElementById('q-search-last6').value = creditCode.slice(-6);
    document.getElementById('q-search-cipher').value = checkCipher;
    window.switchJoinTab('query');
    await window.queryApplicationStatus();

    AuthSecurity.showVoucherPreviewModal({
      tenantId,
      companyName,
      legalName: `${contactPerson}（查验暗号：${checkCipher}）`,
      phone: contactPhone,
      backupPhone,
      accessKeyHint: `查验暗号：${checkCipher} ｜ 密码：您自设的12位以上强密码`
    });
  } catch (err) {
    alert('❌ 提交处理失败: ' + err.message);
    btn.disabled = false;
    updateSubmitButtonState(true, effectiveManualMode);
  }
};

window.openAppVoucherCard = function (appId) {
  const app = lastQueriedApps.find((a) => Number(a.id) === Number(appId));
  if (!app) return;
  const cipher = extractCipherFromReviewNote(app.review_note);
  const backup = extractBackupPhoneFromReviewNote(app.review_note);
  AuthSecurity.showVoucherPreviewModal({
    tenantId: app.tenant_id,
    companyName: app.company_name,
    legalName: `${app.contact_person || ''}${cipher ? `（查验暗号：${cipher}）` : ''}`,
    phone: app.contact_phone || '',
    backupPhone: backup,
    accessKeyHint: `${cipher ? `查验暗号：${cipher} ｜ ` : ''}您入驻时亲自设定的12位以上高强度安家主密码`
  });
};

function renderMatchedApplicationCards(matchedApps, container) {
  lastQueriedApps = matchedApps;
  container.innerHTML = matchedApps
    .map((app) => {
      const status = app.application_status;
      const isApproved = status === 'approved' || status === 'approved_by_ai' || status === 'approved_manually';
      const isRejected = status === 'rejected';
      const isInd = app.business_type === 'individual' || String(app.tenant_id || '').startsWith('GR-');
      const cipher = extractCipherFromReviewNote(app.review_note);
      const cleanReviewNote = String(app.review_note || '')
        .replace(/\[查验暗号[:：][A-Z0-9-]+\]/gi, '')
        .replace(/\[备用手机[:：]\d{11}\]/g, '')
        .replace(/\[经营范围[:：][^\]]+\]/g, '')
        .trim();

      const typeBadge = isInd
        ? '<span class="bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full text-[10px] font-bold">👨‍🌾 个人实名入驻 (GR)</span>'
        : '<span class="bg-sky-500/20 text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded-full text-[10px] font-bold">🏢 商事主体执照入驻</span>';

      if (isApproved) {
        return `
          <div class="bg-emerald-950/30 border border-emerald-500/40 rounded-2xl p-5 space-y-3">
            <div class="flex flex-wrap justify-between items-center gap-2 border-b border-emerald-500/20 pb-2">
              <div class="flex items-center gap-2">
                <b class="text-sm text-white">${app.company_name}</b>
                ${typeBadge}
              </div>
              <span class="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full font-bold text-[11px]">
                ✅ 核身通过 · 已开席
              </span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-2 bg-stone-900/80 p-3 rounded-xl border border-stone-800 font-mono">
              <div>
                <span class="text-[10px] text-stone-400 block">专属商号信物 (登录账号)</span>
                <b class="text-amber-400 text-base font-bold">${app.tenant_id}</b>
              </div>
              <div>
                <span class="text-[10px] text-stone-400 block">专属查验暗号</span>
                <b class="text-emerald-300 text-xs font-bold">${cipher || '已验真激活'}</b>
              </div>
              <div>
                <span class="text-[10px] text-stone-400 block">安家主密码状态</span>
                <b class="text-emerald-400 text-xs font-bold font-sans">🔐 您自设的12位强密码</b>
              </div>
            </div>

            <p class="text-[11px] text-emerald-200/80">
              🎉 核验成功！您可凭商号代号【<b>${app.tenant_id}</b>】与您亲自设定的安家主密码登录；手机端首次登录后可设置「4位快捷短码」秒进。
            </p>

            <div class="pt-1 flex flex-wrap justify-end gap-2">
              <button type="button" onclick="window.openAppVoucherCard(${app.id})" class="bg-rose-900/70 hover:bg-rose-800 text-rose-100 border border-rose-500/40 font-bold px-3.5 py-2 rounded-xl transition">
                📜 保存凭证卡
              </button>
              <a href="mall.html?t=${encodeURIComponent(app.tenant_id)}" class="bg-stone-800 hover:bg-stone-700 text-amber-300 font-bold px-3.5 py-2 rounded-xl transition">
                🏛️ 查看数字专柜
              </a>
              <a href="driver.html" class="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-3.5 py-2 rounded-xl transition">
                📱 打开百工掌中宝
              </a>
              <a href="hq.html?t=${encodeURIComponent(app.tenant_id)}" class="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-xl shadow transition">
                🚀 登录电脑调度台 ➔
              </a>
            </div>
          </div>
        `;
      } else if (isRejected) {
        return `
          <div class="bg-rose-950/30 border border-rose-500/50 rounded-2xl p-5 space-y-3">
            <div class="flex flex-wrap justify-between items-center gap-2 border-b border-rose-500/20 pb-2">
              <div class="flex items-center gap-2">
                <b class="text-sm text-white">${app.company_name}</b>
                ${typeBadge}
              </div>
              <span class="bg-rose-500/20 text-rose-300 border border-rose-400/30 px-2.5 py-0.5 rounded-full font-bold text-[11px]">
                🚫 退回商榷 · 需补件修正
              </span>
            </div>
            <div class="bg-stone-900/90 p-3.5 rounded-xl border border-rose-500/30 space-y-1">
              <b class="text-rose-400 text-[11px] block">📋 平台审核批示意见（不通过原因）：</b>
              <p class="text-stone-200 text-xs leading-relaxed">${cleanReviewNote || '资质图片不够清晰或与法定名称不符，请重新上传清晰原件照片。'}</p>
            </div>
            <div class="pt-1 flex justify-end">
              <button type="button" onclick="window.startResubmitCorrection(${app.id})" class="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-xl shadow active:scale-95 transition flex items-center gap-1.5">
                <span>🔄</span> 立即改善并重新上传资质
              </button>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="bg-amber-950/20 border border-amber-500/40 rounded-2xl p-5 space-y-2.5">
            <div class="flex flex-wrap justify-between items-center gap-2 border-b border-amber-500/20 pb-2">
              <div class="flex items-center gap-2">
                <b class="text-sm text-white">${app.company_name}</b>
                ${typeBadge}
              </div>
              <span class="bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2.5 py-0.5 rounded-full font-bold text-[11px] animate-pulse">
                ⏳ 人工绿色通道加急审核中
              </span>
            </div>
            <p class="text-[11px] text-stone-300 leading-relaxed">
              您的申请资料已进入平台人工复核队列（商号代号：<b class="font-mono text-amber-300">${app.tenant_id}</b>${cipher ? `，查验暗号：<b class="font-mono text-emerald-300">${cipher}</b>` : ''}）。总控核对无误后，您即可凭商号代号与自设主密码登录运营。
            </p>
            <div class="flex justify-between items-center pt-1">
              <span class="text-[10px] text-stone-500 font-mono">提交时间：${new Date(app.created_at).toLocaleString()}</span>
              <button type="button" onclick="window.openAppVoucherCard(${app.id})" class="text-[11px] text-amber-300 hover:underline font-bold">
                📜 查看并保存凭证卡
              </button>
            </div>
          </div>
        `;
      }
    })
    .join('');
}

window.queryApplicationStatus = async function () {
  const phone = document.getElementById('q-search-phone').value.trim();
  const last6 = document.getElementById('q-search-last6').value.trim().toUpperCase();
  const cipher = document.getElementById('q-search-cipher').value.trim().toUpperCase();
  const container = document.getElementById('query-result-container');

  if (!/^1\d{10}$/.test(phone) || last6.length !== 6 || cipher.length < 6) {
    return alert('请完整输入「11位主联络手机号码」、「证件/代码后 6 位」以及「8 位查验暗号」！');
  }

  container.innerHTML = '<div class="text-center py-6 text-stone-400">正在进行数据库级三重核身校验...</div>';

  try {
    const res = await JoinService.verifyAndQueryOnboarding({
      mode: 'cipher',
      phone,
      idLast6: last6,
      cipher
    });

    if (!res?.ok) {
      container.innerHTML = `
        <div class="bg-[#202023] border border-rose-500/40 rounded-2xl p-6 text-center space-y-2">
          <span class="text-2xl block">🛡️</span>
          <b class="text-rose-300 block">${res?.msg || '三重核身未通过'}</b>
          <p class="text-[11px] text-stone-400">
            若忘记查验暗号，可点击上方「🔑 忘记查验暗号？使用紧急备用手机四重应急核身找回」。
          </p>
        </div>
      `;
      return;
    }

    renderMatchedApplicationCards(res.apps || [], container);
  } catch (err) {
    container.innerHTML = `<div class="text-center py-6 text-rose-400">查询异常：${err.message}</div>`;
  }
};

window.queryApplicationByEmergency = async function () {
  const phone = document.getElementById('q-emerg-phone').value.trim();
  const backup = document.getElementById('q-emerg-backup').value.trim();
  const last6 = document.getElementById('q-emerg-last6').value.trim().toUpperCase();
  const compName = document.getElementById('q-emerg-name').value.trim();
  const container = document.getElementById('query-result-container');

  if (!/^1\d{10}$/.test(phone) || !/^1\d{10}$/.test(backup) || last6.length !== 6 || !compName) {
    return alert('请完整填写主联络手机、紧急备用手机、证件后 6 位以及法定主体全称/个人招牌！');
  }

  container.innerHTML = '<div class="text-center py-6 text-stone-400">正在进行数据库级四重应急核身校验...</div>';

  try {
    const res = await JoinService.verifyAndQueryOnboarding({
      mode: 'emergency',
      phone,
      idLast6: last6,
      backupPhone: backup,
      companyName: compName
    });

    if (!res?.ok) {
      container.innerHTML = `
        <div class="bg-[#202023] border border-rose-500/40 rounded-2xl p-6 text-center space-y-2">
          <span class="text-2xl block">🔐</span>
          <b class="text-rose-300 block">${res?.msg || '四重应急核身未匹配'}</b>
          <p class="text-[11px] text-stone-400">
            请核对主手机号、紧急备用手机号、证件后 6 位及法定全称是否一字不差。如均遗忘，请联系平台总控主叫您的主联络手机号核实。
          </p>
        </div>
      `;
      return;
    }

    renderMatchedApplicationCards(res.apps || [], container);
  } catch (err) {
    container.innerHTML = `<div class="text-center py-6 text-rose-400">应急查询异常：${err.message}</div>`;
  }
};

window.startResubmitCorrection = function (appId) {
  const app = lastQueriedApps.find((a) => a.id === appId);
  if (!app) return;

  document.getElementById('resubmit-app-id').value = app.id;
  document.getElementById('resubmit-banner')?.classList.remove('hidden');

  document.getElementById('v-company-name').value = app.company_name || '';
  document.getElementById('v-credit-code').value = app.credit_code || '';
  document.getElementById('v-business-type').value = app.business_type || 'coop';
  window.onBusinessTypeChange(app.business_type || 'coop');
  window.syncTenantIdFromCreditCode(app.credit_code || '');
  document.getElementById('v-contact-person').value = app.contact_person || '';
  document.getElementById('v-contact-phone').value = app.contact_phone || '';
  const savedBackup = extractBackupPhoneFromReviewNote(app.review_note);
  if (savedBackup && document.getElementById('v-backup-phone')) {
    document.getElementById('v-backup-phone').value = savedBackup;
  }

  currentCompressedBase64 = null;
  isLicenseVerified = false;
  isManualFallbackMode = false;
  failedAttemptsCount = 0;

  document.getElementById('license-preview-img')?.classList.add('hidden');
  document.getElementById('upload-placeholder')?.classList.remove('hidden');
  document.getElementById('audit-feedback-box')?.classList.add('hidden');
  updateSubmitButtonState(false, false);

  window.switchJoinTab('apply');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.cancelResubmitMode = function () {
  document.getElementById('resubmit-app-id').value = '';
  document.getElementById('resubmit-banner')?.classList.add('hidden');
  failedAttemptsCount = 0;
};

export function initJoinController() {
  loadDynamicGovernanceConfig();
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('tab') === 'query') {
    window.switchJoinTab('query');
  }
}
