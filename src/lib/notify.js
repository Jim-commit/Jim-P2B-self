// src/lib/notify.js - 个人微信服务通知推送通道
// 请在上线前替换为你的 Server酱 SendKey (https://sct.ftqq.com)
const SERVERCHAN_SENDKEY = 'SCT464122TDPF8WjfPxmKjBVqJzoANzloL';

export async function sendWechatNotice(title, desp) {
  if (!SERVERCHAN_SENDKEY || SERVERCHAN_SENDKEY.includes('REPLACE')) {
    console.warn('[微信通知] 未检测到有效的 ServerChan Key，跳过推送。');
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
    console.error('[微信通知] 推送异常（已隔离保护，不阻断核心业务）:', err);
    return { code: 500 };
  }
}
