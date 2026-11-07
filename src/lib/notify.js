// src/lib/notify.js
// 填入在 https://sct.ftqq.com 获取的 SendKey（若未配置则仅记录日志，绝不中断业务）
const SERVERCHAN_SENDKEY = 'SCT464122TDPF8WjfPxmKjBVqJzoANzloL';

export async function sendWechatNotice(title, desp) {
  if (!SERVERCHAN_SENDKEY || SERVERCHAN_SENDKEY.includes('REPLACE')) {
    console.warn('[微信通知] 未配置有效 SendKey，跳过网络推送。');
    return { code: -1, msg: 'No key configured' };
  }

  const endpoint = `https://sctapi.ftqq.com/${SERVERCHAN_SENDKEY}.send`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        title: title,
        desp: desp,
      }),
    });
    return await response.json();
  } catch (err) {
    console.error('[微信通知] 推送异常（不阻断正常业务）:', err);
    return { code: 500, err };
  }
}
