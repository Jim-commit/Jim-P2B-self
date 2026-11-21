import { supabase } from '../../lib/supabase.js';
import { AuthSecurity } from '../../utils/authSecurity.js';
import { PALM_SESSION_KEY, driverState } from './driverState.js';

function updatePalmPinDotsUI() {
  const dots = document.querySelectorAll('#palm-pin-dots span');
  dots.forEach((dot, idx) => {
    dot.className =
      idx < driverState.palmPinBuffer.length
        ? 'w-3.5 h-3.5 rounded-full border-2 border-emerald-700 bg-emerald-700 scale-110 transition'
        : 'w-3.5 h-3.5 rounded-full border-2 border-emerald-700 bg-transparent transition';
  });
}

async function startPalmCameraQrScan() {
  const video = document.getElementById('palm-qr-video');
  const hint = document.getElementById('palm-qr-cam-hint');
  if (!video || !navigator.mediaDevices?.getUserMedia) {
    if (hint) hint.innerText = '当前浏览器不支持直接调摄像头，请点下方「相册选二维码图」或「输口令码」';
    return;
  }
  try {
    driverState.palmQrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = driverState.palmQrStream;
    await video.play();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const tick = () => {
      if (!driverState.palmQrStream) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          stopPalmCameraQrScan();
          window.preparePalmApproveQrToken(code.data);
          return;
        }
      }
      driverState.palmQrRafId = requestAnimationFrame(tick);
    };
    driverState.palmQrRafId = requestAnimationFrame(tick);
  } catch (e) {
    if (hint) hint.innerText = '未获取摄像头权限，请点下方「相册选二维码图」或「输口令码」';
  }
}

function stopPalmCameraQrScan() {
  if (driverState.palmQrRafId) cancelAnimationFrame(driverState.palmQrRafId);
  driverState.palmQrRafId = null;
  if (driverState.palmQrStream) {
    driverState.palmQrStream.getTracks().forEach((t) => t.stop());
    driverState.palmQrStream = null;
  }
}

export function initDriverAuthBindings(callbacks) {
  window.pressPalmPinDigit = async function (digit) {
    if (driverState.palmPinBuffer.length >= 4) return;
    driverState.palmPinBuffer += digit;
    updatePalmPinDotsUI();

    if (driverState.palmPinBuffer.length === 4) {
      const savedTid = localStorage.getItem('baigong_palm_last_tid') || '';
      const res = await AuthSecurity.verifyDeviceQuickPin(savedTid, driverState.palmPinBuffer);
      driverState.palmPinBuffer = '';
      updatePalmPinDotsUI();

      if (res.ok && res.sessionSnapshot) {
        document.getElementById('palm-pin-err')?.classList.add('hidden');
        const s = res.sessionSnapshot;
        localStorage.setItem(PALM_SESSION_KEY, JSON.stringify(s));
        driverState.currentAgent = s.tenantId;
        driverState.sessionEpoch = Number(s.sessionEpoch || 1);
        driverState.currentRoleCode = s.roleCode || 'driver';
        driverState.effectiveViewRole = driverState.currentRoleCode === 'owner' ? 'owner_cockpit' : driverState.currentRoleCode;
        driverState.currentAccountCode = s.accountCode || '';
        driverState.currentOperatorName = s.operatorName || '一线执事';
        document.getElementById('palm-auth-gate')?.classList.add('hidden');
        await callbacks?.onBootWorkspace?.();
      } else {
        const errEl = document.getElementById('palm-pin-err');
        if (res.reason === 'MAX_ATTEMPTS') {
          alert('⚠️ 快捷短码连续输错 3 次，为保障账本安全已退回主密码核身！');
          window.switchPalmToFullLogin(true);
        } else if (errEl) {
          errEl.classList.remove('hidden');
          errEl.innerText = `快捷短码不符，还可尝试 ${res.remain || 1} 次`;
        }
      }
    }
  };

  window.clearPalmPinDigits = function () {
    driverState.palmPinBuffer = '';
    updatePalmPinDotsUI();
  };

  window.backspacePalmPinDigit = function () {
    driverState.palmPinBuffer = driverState.palmPinBuffer.slice(0, -1);
    updatePalmPinDotsUI();
  };

  window.switchPalmToFullLogin = function (clearSavedPin = false) {
    const savedTid = localStorage.getItem('baigong_palm_last_tid') || '';
    if (clearSavedPin && savedTid) {
      AuthSecurity.clearDeviceQuickPin(savedTid);
    }
    document.getElementById('palm-pin-unlock-box')?.classList.add('hidden');
    document.getElementById('palm-full-login-form')?.classList.remove('hidden');
    if (savedTid) {
      const tidInp = document.getElementById('palm-login-tenant');
      if (tidInp) tidInp.value = savedTid;
    }
  };

  window.backToPalmPinPanel = function () {
    document.getElementById('palm-full-login-form')?.classList.add('hidden');
    document.getElementById('palm-pin-unlock-box')?.classList.remove('hidden');
  };

  window.lockPalmQuickPinScreen = function () {
    const pinInfo = AuthSecurity.getDeviceQuickPinInfo(driverState.currentAgent);
    if (!pinInfo) {
      if (confirm('当前手机尚未设置 4 位数字快捷短码，是否现在设置以便离开时一键锁屏？')) {
        window.openPalmPinSetupModal();
      }
      return;
    }
    localStorage.removeItem(PALM_SESSION_KEY);
    document.getElementById('palm-pin-tenant-label').innerText = `商号：${driverState.currentAgent}`;
    document.getElementById('palm-pin-operator-label').innerText = `已锁屏 · ${driverState.currentOperatorName} 请按 4 位短码`;
    document.getElementById('palm-pin-unlock-box')?.classList.remove('hidden');
    document.getElementById('palm-full-login-form')?.classList.add('hidden');
    document.getElementById('btn-palm-back-pin')?.classList.remove('hidden');
    document.getElementById('palm-auth-gate')?.classList.remove('hidden');
  };

  window.openPalmPinSetupModal = function () {
    document.getElementById('palm-setup-pin-1').value = '';
    document.getElementById('palm-setup-pin-2').value = '';
    window.openModal('modal-palm-setup-pin');
  };

  window.confirmSavePalmPin = async function () {
    const p1 = document.getElementById('palm-setup-pin-1').value.trim();
    const p2 = document.getElementById('palm-setup-pin-2').value.trim();
    if (!/^\d{4}$/.test(p1)) return alert('请输入 4 位纯数字短码！');
    if (p1 !== p2) return alert('两次输入的 4 位短码不一致！');

    const sessionSnap = {
      tenantId: driverState.currentAgent,
      sessionEpoch: Number(driverState.sessionEpoch || 1),
      roleCode: driverState.currentRoleCode,
      accountCode: driverState.currentAccountCode,
      operatorName: driverState.currentOperatorName
    };
    await AuthSecurity.saveDeviceQuickPin(driverState.currentAgent, driverState.currentRoleCode, p1, sessionSnap);
    localStorage.setItem('baigong_palm_last_tid', driverState.currentAgent);
    window.closeModal('modal-palm-setup-pin');
    alert('✅ 本机 4 位快捷短码绑定成功！以后打开掌中宝按 4 个数字即可秒进，点顶栏「🔒 锁屏」可随时锁定。');
  };

  window.openPalmQrAuthorizeModal = function () {
    if (driverState.currentRoleCode !== 'owner') {
      return alert('仅大当家账号有权授权电脑端登录平准调度中枢！');
    }
    document.getElementById('palm-qr-scanner-box')?.classList.remove('hidden');
    document.getElementById('palm-qr-confirm-card')?.classList.add('hidden');
    window.openModal('modal-palm-qr-authorize');
    startPalmCameraQrScan();
  };

  window.closePalmQrAuthorizeModal = function () {
    stopPalmCameraQrScan();
    window.closeModal('modal-palm-qr-authorize');
  };

  window.scanPalmQrFromImage = function (e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR ? window.jsQR(imgData.data, imgData.width, imgData.height) : null;
        if (code && code.data) {
          stopPalmCameraQrScan();
          window.preparePalmApproveQrToken(code.data);
        } else {
          alert('未在图片中识别到有效登录二维码，请对准电脑屏幕重拍或手动输入口令码。');
        }
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  };

  window.preparePalmApproveQrToken = function (rawText) {
    let token = String(rawText || '').trim();
    if (token.includes('qr_token=')) {
      const m = token.match(/qr_token=([A-Za-z0-9\-_]+)/);
      if (m) token = m[1];
    }
    if (!token.startsWith('SCAN-')) {
      return alert('无效的登录二维码，请扫描电脑端平准调度台登录页的二维码！');
    }
    driverState.pendingPalmQrToken = token;
    document.getElementById('palm-qr-scanner-box')?.classList.add('hidden');
    document.getElementById('palm-qr-confirm-card')?.classList.remove('hidden');
    document.getElementById('palm-auth-qr-tenant').innerText = driverState.currentAgent;
    document.getElementById('palm-auth-qr-operator').innerText = driverState.currentOperatorName;
    document.getElementById('palm-auth-qr-token').innerText = token;
  };

  window.executePalmApproveQrLogin = async function () {
    if (!driverState.pendingPalmQrToken || !driverState.currentAgent) return;
    const btn = document.getElementById('btn-palm-confirm-qr');
    btn.disabled = true;
    btn.innerText = '正在放行授权...';

    try {
      const { data, error } = await supabase
        .from('login_qr_session')
        .update({
          tenant_id: driverState.currentAgent,
          role_code: 'owner',
          operator_name: driverState.currentOperatorName,
          status: 'approved'
        })
        .eq('session_token', driverState.pendingPalmQrToken)
        .eq('status', 'waiting')
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('该二维码已过期（超过90秒）或已被使用，请刷新电脑端二维码后重试');
      }

      try {
        await supabase.from('audit_logs').insert([
          {
            tenant_id: driverState.currentAgent,
            operator_role: driverState.currentOperatorName,
            action_type: 'QR_PC_LOGIN_APPROVE',
            detail: `通过百工掌中宝扫码放行电脑端平准调度台登录（令牌：${driverState.pendingPalmQrToken}）`
          }
        ]);
      } catch (e) {}

      alert('✅ 授权放行成功！电脑端平准调度中枢正在自动登入。');
      window.closePalmQrAuthorizeModal();
    } catch (err) {
      alert('❌ 授权失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerText = '✅ 确认授权登录';
    }
  };

  window.verifyPalmAuthLogin = async function (e) {
    e.preventDefault();
    const tenantId = document.getElementById('palm-login-tenant').value.trim().toUpperCase();
    const rawKey = document.getElementById('palm-login-key').value.trim();
    const wantBindPin = document.getElementById('chk-palm-bind-pin')?.checked;
    const errBox = document.getElementById('palm-auth-error');
    const btn = document.getElementById('btn-palm-login');

    const lockInfo = AuthSecurity.checkLoginLockout(`PALM_${tenantId}`);
    if (lockInfo.locked) {
      errBox.innerText = `🛡️ 安全熔断：连续输错次数过多，请 ${lockInfo.remainMins} 分钟后再试。`;
      errBox.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.innerText = '核验身份中...';
    errBox.classList.add('hidden');

    if (rawKey.includes(':') || rawKey.includes('：')) {
      const [subAcc, subPwd] = rawKey.split(/[:：]/).map((s) => s.trim());
      const { data: tenantList } = await supabase
        .from('platform_tenant')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .limit(1);

      if (!tenantList || tenantList.length === 0) {
        AuthSecurity.recordLoginFailure(`PALM_${tenantId}`);
        btn.disabled = false;
        btn.innerText = '核验身份 · 进入移动工作台';
        errBox.innerText = '⚠️ 商号代号不存在或已暂歇！';
        errBox.classList.remove('hidden');
        return;
      }

      const { data: subList } = await supabase
        .from('tenant_sub_user')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('account_name', subAcc)
        .eq('is_active', true)
        .limit(1);

      let subValid = false;
      if (subList && subList.length > 0) {
        subValid = await AuthSecurity.verifyPassword(subPwd, subList[0].password_hash, tenantId);
      }

      if (!subValid) {
        const failRec = AuthSecurity.recordLoginFailure(`PALM_${tenantId}`);
        btn.disabled = false;
        btn.innerText = '核验身份 · 进入移动工作台';
        errBox.innerText = `⚠️ 属员子账号或密码不正确（还可尝试 ${Math.max(0, 5 - failRec.count)} 次）！`;
        errBox.classList.remove('hidden');
        return;
      }

      AuthSecurity.clearLoginFailure(`PALM_${tenantId}`);
      const currentEpoch = Number(tenantList[0].session_epoch || 1);
      const sessionObj = {
        tenantId,
        sessionEpoch: currentEpoch,
        roleCode: subList[0].role_code || 'driver',
        accountCode: subList[0].account_name,
        operatorName: subList[0].real_name || subAcc
      };
      localStorage.setItem(PALM_SESSION_KEY, JSON.stringify(sessionObj));
      localStorage.setItem('baigong_palm_last_tid', tenantId);
      driverState.currentAgent = sessionObj.tenantId;
      driverState.sessionEpoch = currentEpoch;
      driverState.currentRoleCode = sessionObj.roleCode;
      driverState.effectiveViewRole = sessionObj.roleCode;
      driverState.currentAccountCode = sessionObj.accountCode;
      driverState.currentOperatorName = sessionObj.operatorName;

      btn.disabled = false;
      btn.innerText = '核验身份 · 进入移动工作台';
      document.getElementById('palm-auth-gate').classList.add('hidden');
      await callbacks?.onBootWorkspace?.();
      if (wantBindPin && !AuthSecurity.getDeviceQuickPinInfo(tenantId)) {
        window.openPalmPinSetupModal();
      }
      return;
    }

    const { data: tenants } = await supabase
      .from('platform_tenant')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .limit(1);

    let ownerValid = false;
    if (tenants && tenants.length > 0) {
      ownerValid = await AuthSecurity.verifyPassword(rawKey, tenants[0].access_key, tenantId);
    }

    if (!ownerValid) {
      const failRec = AuthSecurity.recordLoginFailure(`PALM_${tenantId}`);
      btn.disabled = false;
      btn.innerText = '核验身份 · 进入移动工作台';
      errBox.innerText = `⚠️ 商号代号或安家主密码不符（还可尝试 ${Math.max(0, 5 - failRec.count)} 次）！`;
      errBox.classList.remove('hidden');
      return;
    }

    AuthSecurity.clearLoginFailure(`PALM_${tenantId}`);
    const currentEpoch = Number(tenants[0].session_epoch || 1);
    const sessionObj = {
      tenantId,
      sessionEpoch: currentEpoch,
      roleCode: 'owner',
      accountCode: '',
      operatorName: '大当家掌柜'
    };
    localStorage.setItem(PALM_SESSION_KEY, JSON.stringify(sessionObj));
    localStorage.setItem('baigong_palm_last_tid', tenantId);
    driverState.currentAgent = tenantId;
    driverState.sessionEpoch = currentEpoch;
    driverState.currentRoleCode = 'owner';
    driverState.effectiveViewRole = 'owner_cockpit';
    driverState.currentAccountCode = '';
    driverState.currentOperatorName = '大当家掌柜';

    btn.disabled = false;
    btn.innerText = '核验身份 · 进入移动工作台';
    document.getElementById('palm-auth-gate').classList.add('hidden');
    await callbacks?.onBootWorkspace?.();
    if (wantBindPin && !AuthSecurity.getDeviceQuickPinInfo(tenantId)) {
      window.openPalmPinSetupModal();
    }
  };

  window.logoutPalmTerminal = function () {
    if (!confirm('确认退出当前掌中宝登录？')) return;
    localStorage.removeItem(PALM_SESSION_KEY);
    document.getElementById('palm-auth-gate').classList.remove('hidden');
  };
}
