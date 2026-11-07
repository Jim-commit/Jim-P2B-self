// src/lib/notify.js - 微信推送与防崩通道
const SERVERCHAN_SENDKEY = 'SCT464122TDPF8WjfPxmKjBVqJzoANzloL';

export async function sendWechatNotice(title, desp) {
  if (!SERVERCHAN_SENDKEY || SERVERCHAN_SENDKEY.includes('REPLACE')) {
    console.warn('[微信通知] 未检测到有效的 ServerChan Key，已静默跳过');
    return { code: -1 };
  }

  const endpoint = `https://sctapi.ftqq.com/${SERVERCHAN_SENDKEY}.send`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title, desp }),
    });
    return await response.json();
  } catch (err) {
    console.error('[微信通知] 网络异常已隔离，不影响核心交易流程:', err);
    return { code: 500 };
  }
}
