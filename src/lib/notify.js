// src/lib/notify.js

// 填入你刚才在 Server酱 复制的 SendKey
const SERVERCHAN_SENDKEY = 'SCT464122TDPF8WjfPxmKjBVqJzoANzloL'; 

/**
 * 推送微信服务通知到个人微信
 * @param {string} title - 通知标题（如：【新订单提醒】）
 * @param {string} desp - 通知正文（支持 Markdown 语法与超链接）
 */
export async function sendWechatNotice(title, desp) {
  if (!SERVERCHAN_SENDKEY || SERVERCHAN_SENDKEY.startsWith('SCTxxx')) {
    console.warn('未配置有效的 Server酱 SendKey，跳过推送');
    return;
  }

  const url = `https://sctapi.ftqq.com/${SERVERCHAN_SENDKEY}.send`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        title: title,
        desp: desp
      })
    });
    const result = await response.json();
    console.log('微信推送结果：', result);
    return result;
  } catch (error) {
    console.error('微信推送失败：', error);
  }
}
