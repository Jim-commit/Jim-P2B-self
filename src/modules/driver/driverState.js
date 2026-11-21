import { DriverService } from '../../services/driverService.js';

export const OFFLINE_QUEUE_KEY = 'b2b_driver_offline_queue_v1';
export const PALM_SESSION_KEY = 'baigong_palm_session_v1';

export const driverState = {
  currentAgent: localStorage.getItem('hq_active_agent') || localStorage.getItem('baigong_palm_last_tid') || '',
  currentRoleCode: 'driver',
  effectiveViewRole: 'driver',
  currentAccountCode: '',
  currentOperatorName: '送货师傅',
  currentCarrierLabel: '周转筐',
  globalCarriersList: [{ name: '周转筐', deposit: 15 }],
  allStores: [],
  allProducts: [],
  activeOrders: [],
  deliveredOrdersCache: [],
  inventoryLogsCache: [],
  onlyShowOrders: false,
  proofImagesList: [],
  qcPhotoList: [],
  palmStockMode: 'in_purchase',
  palmVoucherNo: '',
  qcVoucherNo: '',
  palmPinBuffer: '',
  knownActiveOrderIds: new Set(),
  palmQrStream: null,
  palmQrRafId: null,
  pendingPalmQrToken: ''
};

export function isDirectoryLead(o) {
  return (
    o?.order_source === 'b2b_directory_lead' ||
    String(o?.order_no || '').startsWith('LEAD-') ||
    String(o?.note || '').includes('[新店招商线索]') ||
    String(o?.note || '').includes('[新店招商線索]') ||
    String(o?.note || '').includes('[新店合作意向]')
  );
}

export function generateUnifiedVoucherNo(prefix) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const rand4 = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}${h}-${rand4}`;
}

export function getVisibleStoresForSales() {
  if (driverState.currentRoleCode !== 'sales') return driverState.allStores;
  return driverState.allStores.filter((s) => {
    const ownerAcc = s.custom_pricing?.sales_owner || '';
    return !ownerAcc || ownerAcc === driverState.currentAccountCode || ownerAcc === driverState.currentOperatorName;
  });
}

export function speakPalmVoiceNotice(text) {
  const enabled = document.getElementById('chk-palm-voice')?.checked;
  if (!enabled || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

export function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

export function updateOfflineBanner() {
  const queue = getOfflineQueue();
  const banner = document.getElementById('offline-sync-banner');
  const countEl = document.getElementById('offline-queue-count');
  if (!banner || !countEl) return;
  if (queue.length > 0) {
    countEl.innerText = queue.length;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

export function saveOfflineQueue(list) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(list));
  updateOfflineBanner();
}

export function createSignatureController(canvasId) {
  let canvas = null;
  let ctx = null;
  let isDrawing = false;
  let signed = false;

  return {
    init() {
      canvas = document.getElementById(canvasId);
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#1b4332';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      signed = false;

      const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: (clientX - rect.left) * (canvas.width / rect.width),
          y: (clientY - rect.top) * (canvas.height / rect.height)
        };
      };

      const start = (e) => {
        isDrawing = true;
        const p = getPos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      };
      const move = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const p = getPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        signed = true;
      };
      const end = () => {
        isDrawing = false;
      };

      canvas.onmousedown = start;
      canvas.onmousemove = move;
      window.addEventListener('mouseup', end);
      canvas.ontouchstart = start;
      canvas.ontouchmove = move;
      canvas.ontouchend = end;
    },
    clear() {
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        signed = false;
      }
    },
    hasSigned() {
      return signed;
    },
    toDataURL() {
      return canvas ? canvas.toDataURL('image/png') : '';
    }
  };
}

export async function runLightweightOcrOnFile(file) {
  if ('TextDetector' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      const detector = new window.TextDetector();
      const blocks = await detector.detect(bitmap);
      return blocks.map((b) => b.rawValue).join('\n');
    } catch (e) {}
  }
  if (!window.Tesseract) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  if (window.Tesseract) {
    const res = await window.Tesseract.recognize(file, 'chi_sim+eng');
    return res?.data?.text || '';
  }
  return '';
}

export function initOfflineAndUtilityBindings() {
  window.syncOfflineQueue = async function () {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    const btn = document.getElementById('btn-sync-offline');
    if (btn) {
      btn.disabled = true;
      btn.innerText = '同步中...';
    }

    const remaining = [];
    let successCount = 0;

    for (const item of queue) {
      try {
        await DriverService.completeDelivery(item.payload);
        successCount++;
      } catch (err) {
        remaining.push(item);
      }
    }

    saveOfflineQueue(remaining);
    if (btn) {
      btn.disabled = false;
      btn.innerText = '立即同步回库';
    }

    if (successCount > 0) {
      alert(`🎉 已成功将 ${successCount} 笔离线暂存签收单同步写入云端总账！`);
      await window.loadDriverTasks();
    }
    if (remaining.length > 0) {
      alert(`⚠️ 仍有 ${remaining.length} 笔因网络未恢复暂留本地，请移步信号较好区域再点同步。`);
    }
  };

  window.startVoiceInput = function (targetInputId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return alert('当前浏览器暂不支持原生语音识别，请直接手动输入或使用手机输入法自带语音按钮。');
    }
    const targetEl = document.getElementById(targetInputId);
    if (!targetEl) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const origPlaceholder = targetEl.placeholder;
    targetEl.placeholder = '🎤 正在聆听，请直接说话...';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      targetEl.value = targetEl.value ? `${targetEl.value}；${transcript}` : transcript;
    };
    recognition.onerror = () => alert('未听清语音内容，请重试或手动输入。');
    recognition.onend = () => {
      targetEl.placeholder = origPlaceholder;
    };
    recognition.start();
  };

  window.captureGpsForNewLead = function () {
    if (!navigator.geolocation) return alert('当前设备不支持 GPS 定位功能。');
    const addrInput = document.getElementById('lead-addr-input');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const gpsTag = `[GPS:${lng},${lat}]`;
        if (addrInput) {
          const cleanPrev = addrInput.value.replace(/\[GPS:[^\]]+\]/g, '').trim();
          addrInput.value = `${cleanPrev} ${gpsTag}`.trim();
        }
        alert(`📍 门头精准 GPS 坐标已采集成功：${lng}, ${lat}`);
      },
      (err) => alert('获取定位失败，请确认已开启手机定位权限：' + err.message),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  window.navigateToStoreGps = function (storeId) {
    const store = driverState.allStores.find((s) => Number(s.id) === Number(storeId));
    if (!store) return;
    const addr = store.address || store.name || '';
    const gpsMatch = addr.match(/\[GPS:([0-9.]+),([0-9.]+)\]/);
    if (gpsMatch) {
      const lng = gpsMatch[1];
      const lat = gpsMatch[2];
      window.open(`https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(store.name)}`, '_blank');
    } else {
      window.open(`https://uri.amap.com/search?keyword=${encodeURIComponent(addr || store.name)}`, '_blank');
    }
  };
}
