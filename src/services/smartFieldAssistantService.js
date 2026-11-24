/**
 * 微信文本清单智能拆单解析器（支持口语、换行、逗号顿号混排）
 * 示例输入："土鸡蛋 5箱，菜籽油2桶\n五常大米3袋"
 */
export function parseWechatOrderText(rawText, productCatalog = []) {
  const text = String(rawText || '').trim();
  if (!text) return { matched: [], unmatched: [] };

  // 按换行、逗号、分号、顿号切分片段
  const segments = text
    .split(/[\r\n,，;；、]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const matched = [];
  const unmatched = [];

  segments.forEach((seg) => {
    // 提取尾部或中部的数量（支持 "土鸡蛋5箱"、"土鸡蛋 x 5"、"5箱土鸡蛋"）
    const tailMatch = seg.match(/^(.+?)\s*[xX×*]?\s*(\d+(?:\.\d+)?)\s*(箱|件|袋|桶|斤|公斤|瓶|盒|提|包|捆|个)?$/);
    const headMatch = seg.match(/^(\d+(?:\.\d+)?)\s*(箱|件|袋|桶|斤|公斤|瓶|盒|提|包|捆|个)?\s*(.+)$/);

    let kw = '';
    let qty = 1;

    if (tailMatch && tailMatch[1].trim().length >= 1) {
      kw = tailMatch[1].trim();
      qty = Math.max(1, Math.round(parseFloat(tailMatch[2])));
    } else if (headMatch && headMatch[3].trim().length >= 1) {
      qty = Math.max(1, Math.round(parseFloat(headMatch[1])));
      kw = headMatch[3].trim();
    } else {
      kw = seg;
      qty = 1;
    }

    const cleanKw = kw.replace(/要|来|订|补|共|合计|大约/g, '').trim();
    if (!cleanKw) return;

    // 优先精确包含匹配，其次字符重叠度匹配
    let bestProd = productCatalog.find((p) => (p.name || '').includes(cleanKw) || cleanKw.includes(p.name || ''));
    if (!bestProd && cleanKw.length >= 2) {
      let bestScore = 0;
      productCatalog.forEach((p) => {
        const pName = p.name || '';
        let hit = 0;
        for (const ch of cleanKw) {
          if (pName.includes(ch)) hit += 1;
        }
        const score = hit / Math.max(cleanKw.length, 1);
        if (score >= 0.6 && score > bestScore) {
          bestScore = score;
          bestProd = p;
        }
      });
    }

    if (bestProd) {
      const existing = matched.find((m) => Number(m.product.id) === Number(bestProd.id));
      if (existing) {
        existing.qty += qty;
      } else {
        matched.push({ product: bestProd, qty, rawSegment: seg });
      }
    } else {
      unmatched.push({ rawSegment: seg, keyword: cleanKw, qty });
    }
  });

  return { matched, unmatched };
}

/**
 * 适老化原生中文语音朗读播报（无需任何第三方 SDK）
 */
export function speakChineseNotice(message) {
  try {
    if (!('speechSynthesis' in window)) return false;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(String(message || ''));
    utter.lang = 'zh-CN';
    utter.rate = 0.92;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
    return true;
  } catch (e) {
    return false;
  }
}
