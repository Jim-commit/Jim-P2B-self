import { JoinService } from '../services/joinService.js';

let currentCompressedBase64 = null;
let isLicenseVerified = false;
let isManualFallbackMode = false;
let failedAttemptsCount = 0;
let verifiedAuditSummary = '';
let lastQueriedApps = [];

window.syncAccessKeyFromCreditCode = function (codeVal) {
  const clean = (codeVal || '').trim().toUpperCase();
  if (clean.length >= 6) {
    const keyInput = document.getElementById('v-access-key');
    if (keyInput) keyInput.value = clean.slice(-6);
  }
};

window.onBusinessTypeChange = function (bType) {
  const isInd = bType === 'individual';
  document.getElementById('individual-rule-tip')?.classList.toggle('hidden', !isInd);
  document.getElementById('individual-sponsor-box')?.classList.toggle('hidden', !isInd);

  const lblUpload = document.getElementById('lbl-license-upload');
  const lblMain = document.getElementById('lbl-upload-main');
  const lblName = document.getElementById('lbl-company-name');
  const lblCode = document.getElementById('lbl-credit-code');
  const tidInput = document.getElementById('v-tenant-id');

  if (isInd) {
    if (lblUpload) lblUpload.innerText = '2. 个人实名身份证件 / 手艺资质实拍照 *：';
    if (lblMain) lblMain.innerText = '点击拍摄或上传本人身份证件正面原件';
    if (lblName) lblName.innerText = '个人匠人/农户名号 (如：王师傅生态果园) *：';
    if (lblCode) lblCode.innerText = '个人身份证号码 (18位 · 后6位即为预设密钥) *：';
    if (tidInput && (!tidInput.value || tidInput.value.startsWith('T-'))) {
      tidInput.value = 'GR-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    }
  } else {
    if (lblUpload) lblUpload.innerText = '2. 营业执照正本 / 副本实拍照 (拍照后自动即时核验) *：';
    if (lblMain) lblMain.innerText = '点击拍摄或上传营业执照原件';
    if (lblName) lblName.innerText = '主体执照全称 (与执照一致) *：';
    if (lblCode) lblCode.innerText = '统一社会信用代码 (18位国标校验 · 后6位即为预设密钥) *：';
    if (tidInput && tidInput.value.startsWith('GR-')) {
      tidInput.value = 'T-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    }
  }
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
      : '<span>📜</span> 资质已验真 · 立即签约开席（免费体验7天）';
  } else if (enabled && isManual) {
    btn.disabled = false;
    btn.className =
      'w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl active:scale-95 transition shadow-lg text-sm flex items-center justify-center gap-2 cursor-pointer';
    btn.innerHTML = isResubmit
      ? '<span>📨</span> 重新提交补件资料 · 转人工复核'
      : '<span>📨</span> 提交资料 · 转入平台人工绿色审核';
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
      ? '🎉 个人实名证件核验通过！已解锁签约开席'
      : '🎉 营业执照三维度光学验真通过！已解锁签约开席';
    retryBtn?.classList.add('hidden');

    list.innerHTML = successes.map((s) => `<li>${s}</li>`).join('');

    if (creditCode) {
      document.getElementById('v-credit-code').value = creditCode;
      window.syncAccessKeyFromCreditCode(creditCode);
    }
    if (!document.getElementById('v-tenant-id').value) {
      const prefix = isInd ? 'GR-' : 'T-';
      document.getElementById('v-tenant-id').value = prefix + Math.random().toString(36).substring(2, 7).toUpperCase();
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
        '<li>请在下方核对填写您的<b>18位统一社会信用代码或个人身份证号码</b>（系统将自动取后6位为预设密钥）。</li>',
        '<li>提交后直接转交平台总控人工复核原件，审核通过后即可正式营业。</li>'
      ].join('');

      if (!document.getElementById('v-tenant-id').value) {
        const prefix = isInd ? 'GR-' : 'T-';
        document.getElementById('v-tenant-id').value = prefix + Math.random().toString(36).substring(2, 7).toUpperCase();
      }

      verifiedAuditSummary = isInd
        ? '【个人实名入驻通道】已附实名证件原件转入后台人工复核。'
        : '【触发人工兜底通道】前端光学多次未达标，已附原件转入后台人工复核。';
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
    successes.push(`✅ <b>国标 18 位代码校验合格</b>：<code>${finalCreditCode}</code>（已同步后 6 位为预设安家密钥）。`);
  } else if (finalCreditCode) {
    issues.push(`❌ <b>信用代码读取有误（${finalCreditCode}）</b>：校验位不符，请拉近对焦重拍。`);
  } else {
    issues.push('❌ <b>未提取到 18 位统一社会信用代码</b>：请确保代码区域完整入镜。');
  }

  const nameMatch = recognizedText.match(/名称[:：]?([\u4e00-\u9fa5()（）]{4,30}(?:合作社|公司|厂|店|社|中心))/);
  if (nameMatch && nameMatch[1] && !document.getElementById('v-company-name').value) {
    document.getElementById('v-company-name').value = nameMatch[1];
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

window.handleVendorRegister = async function (e) {
  e.preventDefault();
  if (!document.getElementById('chk-agree-covenant')?.checked) {
    return alert('请先阅读并勾选同意《百工百业平台入驻与商道公约》！');
  }
  if (!isLicenseVerified && !isManualFallbackMode) {
    return alert('请先上传营业执照或实名证件原件并完成核验！');
  }

  const resubmitId = document.getElementById('resubmit-app-id').value;
  const companyName = document.getElementById('v-company-name').value.trim();
  const creditCode = document.getElementById('v-credit-code').value.trim().toUpperCase();
  const tenantId = document.getElementById('v-tenant-id').value.trim().toUpperCase();
  const businessType = document.getElementById('v-business-type').value;
  const contactPerson = document.getElementById('v-contact-person').value.trim();
  const contactPhone = document.getElementById('v-contact-phone').value.trim();
  const sponsorOrg = document.getElementById('v-sponsor-org')?.value.trim() || '';

  if (creditCode.length < 6) {
    return alert('请完整填写统一社会信用代码或个人身份证号码（至少需包含后 6 位用于核身与预设密钥）！');
  }

  const defaultLast6Key = creditCode.slice(-6);
  const accessKey = document.getElementById('v-access-key').value.trim().toUpperCase() || defaultLast6Key;
  const finalAuditSummary = sponsorOrg
    ? `${verifiedAuditSummary} | 联保担保单位：${sponsorOrg}`
    : verifiedAuditSummary;

  const btn = document.getElementById('btn-submit-join');
  btn.disabled = true;
  btn.innerHTML = '正在核对商号唯一性并签发商契...';

  try {
    if (!resubmitId) {
      const existingApps = await JoinService.checkExistingApplication(contactPhone, tenantId);
      if (existingApps.length > 0) {
        const isSamePhone = existingApps.some((x) => x.contact_phone === contactPhone);
        if (isSamePhone) {
          alert('ℹ️ 检测到该手机号已有入驻申请记录！\n已为您自动跳转至进度查询页查看最新批示。');
          document.getElementById('q-search-phone').value = contactPhone;
          document.getElementById('q-search-last6').value = defaultLast6Key;
          window.switchJoinTab('query');
          window.queryApplicationStatus();
          btn.disabled = false;
          updateSubmitButtonState(true, isManualFallbackMode);
          return;
        } else {
          alert(`⚠️ 商号代号【${tenantId}】已被其他主体使用，请在后方加上数字（如 ${tenantId}01）后重新提交！`);
          btn.disabled = false;
          updateSubmitButtonState(true, isManualFallbackMode);
          return;
        }
      }
    }

    await JoinService.submitVendorApplication({
      resubmitId,
      tenantId,
      companyName,
      creditCode,
      contactPerson,
      contactPhone,
      businessType,
      accessKey,
      isManualFallback: isManualFallbackMode,
      auditSummary: finalAuditSummary,
      licenseBase64: currentCompressedBase64
    });

    if (!isManualFallbackMode) {
      alert(
        `🎉 资质验真通过！已为您开通「🍃 尝鲜体验」7天全功能席位（期满满意转正仅收极少公共运维会费，零交易抽佣）！\n\n` +
          `• 主体名称：${companyName}\n` +
          `• 商号代号（唯一标识）：${tenantId}\n` +
          `• 预设安家密钥（后6位）：${accessKey}`
      );
    } else {
      alert(
        `📨 您的入驻资料与资质原件已成功递交！\n\n` +
          `• 登记手机：${contactPhone}\n` +
          `• 证件/代码后 6 位（查询与预设密码）：${defaultLast6Key}\n` +
          `• 商号代号：${tenantId}\n\n` +
          `平台总控核对原件后将第一时间批示，您随时可凭「手机号 + 后6位」查询结果！`
      );
    }

    window.cancelResubmitMode();
    document.getElementById('q-search-phone').value = contactPhone;
    document.getElementById('q-search-last6').value = defaultLast6Key;
    window.switchJoinTab('query');
    window.queryApplicationStatus();
  } catch (err) {
    alert('❌ 提交处理失败: ' + err.message);
    btn.disabled = false;
    updateSubmitButtonState(true, isManualFallbackMode);
  }
};

window.queryApplicationStatus = async function () {
  const phone = document.getElementById('q-search-phone').value.trim();
  const last6 = document.getElementById('q-search-last6').value.trim().toUpperCase();
  const container = document.getElementById('query-result-container');

  if (!phone || last6.length !== 6) {
    return alert('请完整输入登记时的「手机号码」与「信用代码/证件号后 6 位」！');
  }

  container.innerHTML = '<div class="text-center py-6 text-stone-400">正在核验手机号与后六位...</div>';

  try {
    const matchedApps = await JoinService.queryApplicationsByPhoneAndLast6(phone, last6);
    if (matchedApps.length === 0) {
      container.innerHTML = `
        <div class="bg-[#202023] border border-stone-700/80 rounded-2xl p-6 text-center space-y-2">
          <span class="text-2xl block">🔐</span>
          <b class="text-stone-200 block">未查询到匹配档案（手机号或后 6 位不符）</b>
          <p class="text-[11px] text-stone-400">请核对手机号码及信用代码/证件号码最后 6 位字符（注意区分数字 0 与字母 O）。</p>
        </div>
      `;
      return;
    }

    lastQueriedApps = matchedApps;
    container.innerHTML = matchedApps
      .map((app) => {
        const status = app.application_status;
        const isApproved = status === 'approved' || status === 'approved_by_ai' || status === 'approved_manually';
        const isRejected = status === 'rejected';
        const codeLast6 = (app.credit_code || '').slice(-6);

        if (isApproved) {
          return `
            <div class="bg-emerald-950/30 border border-emerald-500/40 rounded-2xl p-5 space-y-3">
              <div class="flex justify-between items-center border-b border-emerald-500/20 pb-2">
                <div>
                  <b class="text-sm text-white">${app.company_name}</b>
                  <span class="text-[10px] font-mono text-emerald-400 ml-2">${app.credit_code || ''}</span>
                </div>
                <span class="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full font-bold text-[11px]">
                  ✅ 审核通过 · 已开席
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2 bg-stone-900/80 p-3 rounded-xl border border-stone-800 font-mono">
                <div>
                  <span class="text-[10px] text-stone-400 block">商号代号 (唯一业务标识)</span>
                  <b class="text-amber-400 text-base font-bold">${app.tenant_id}</b>
                </div>
                <div>
                  <span class="text-[10px] text-stone-400 block">预设安家密钥 (后 6 位)</span>
                  <b class="text-emerald-400 text-base font-bold">${codeLast6}</b>
                </div>
              </div>

              <p class="text-[11px] text-emerald-200/80">
                🎉 核验成功！您可凭商号代号【<b>${app.tenant_id}</b>】与安家密钥【<b>${codeLast6}</b>】登录产销调度台或百工掌中宝。
              </p>

              <div class="pt-1 flex justify-end gap-2">
                <a href="mall.html?t=${encodeURIComponent(app.tenant_id)}" class="bg-stone-800 hover:bg-stone-700 text-amber-300 font-bold px-3.5 py-2 rounded-xl transition">
                  🏛️ 查看我的数字专柜
                </a>
                <a href="hq.html" class="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-xl shadow transition">
                  🚀 立即登录调度台 ➔
                </a>
              </div>
            </div>
          `;
        } else if (isRejected) {
          return `
            <div class="bg-rose-950/30 border border-rose-500/50 rounded-2xl p-5 space-y-3">
              <div class="flex justify-between items-center border-b border-rose-500/20 pb-2">
                <div>
                  <b class="text-sm text-white">${app.company_name}</b>
                  <span class="text-[10px] font-mono text-rose-300 ml-2">商号：${app.tenant_id}</span>
                </div>
                <span class="bg-rose-500/20 text-rose-300 border border-rose-400/30 px-2.5 py-0.5 rounded-full font-bold text-[11px]">
                  🚫 退回商榷 · 需补件修正
                </span>
              </div>
              <div class="bg-stone-900/90 p-3.5 rounded-xl border border-rose-500/30 space-y-1">
                <b class="text-rose-400 text-[11px] block">📋 平台审核批示意见（不通过原因）：</b>
                <p class="text-stone-200 text-xs leading-relaxed">${app.review_note || '资质图片不够清晰或信息不符，请重新上传清晰原件照片。'}</p>
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
              <div class="flex justify-between items-center border-b border-amber-500/20 pb-2">
                <div>
                  <b class="text-sm text-white">${app.company_name}</b>
                  <span class="text-[10px] font-mono text-amber-300 ml-2">商号：${app.tenant_id}</span>
                </div>
                <span class="bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2.5 py-0.5 rounded-full font-bold text-[11px] animate-pulse">
                  ⏳ 人工绿色通道加急审核中
                </span>
              </div>
              <p class="text-[11px] text-stone-300 leading-relaxed">
                您的申请资料已进入平台人工复核队列。总控核对无误后，您即可凭商号代号【<b>${app.tenant_id}</b>】及后 6 位【<b>${codeLast6}</b>】登录运营。
              </p>
              <div class="text-[10px] text-stone-500 font-mono">
                提交时间：${new Date(app.created_at).toLocaleString()}
              </div>
            </div>
          `;
        }
      })
      .join('');
  } catch (err) {
    container.innerHTML = `<div class="text-center py-6 text-rose-400">查询异常：${err.message}</div>`;
  }
};

window.startResubmitCorrection = function (appId) {
  const app = lastQueriedApps.find((a) => a.id === appId);
  if (!app) return;

  document.getElementById('resubmit-app-id').value = app.id;
  document.getElementById('resubmit-banner')?.classList.remove('hidden');

  document.getElementById('v-company-name').value = app.company_name || '';
  document.getElementById('v-credit-code').value = app.credit_code || '';
  window.syncAccessKeyFromCreditCode(app.credit_code || '');
  document.getElementById('v-tenant-id').value = app.tenant_id || '';
  document.getElementById('v-business-type').value = app.business_type || 'coop';
  window.onBusinessTypeChange(app.business_type || 'coop');
  document.getElementById('v-contact-person').value = app.contact_person || '';
  document.getElementById('v-contact-phone').value = app.contact_phone || '';

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
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('tab') === 'query') {
    window.switchJoinTab('query');
  }
}
