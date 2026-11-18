export const MarketingCanvas = {
  styles: {
    'neighborhood': {
      name: '🏮 邻里老友风',
      bg: '#fdfbf7',
      headerBg: '#064e3b',
      headerText: '#ffffff',
      subText: '#a7f3d0',
      priceColor: '#991b1b',
      boxBg: '#fef3c7',
      boxBorder: '#f59e0b',
      boxTextColor: '#92400e',
      defaultTagline: '合作门店信誉背书 · 源头直供保真 · 随时到店自提',
      defaultNote: '💬 掌柜交心话：源头合作社与正规工坊直供，数量实在！直接在群里回复「我要1件」，门店给您留现货！'
    },
    'hotdeal': {
      name: '🤝 抱团集采风',
      bg: '#fff5f5',
      headerBg: '#b91c1c',
      headerText: '#ffffff',
      subText: '#fecaca',
      priceColor: '#dc2626',
      boxBg: '#fee2e2',
      boxBorder: '#ef4444',
      boxTextColor: '#7f1d1d',
      defaultTagline: '产区源头直发 · 邻里抱团集采 · 阳光工价更实在',
      defaultNote: '💬 掌柜交代：这批货走的是源头抱团集采惠价，按需拼满即安排送货师傅随车直达门店！'
    },
    'honest': {
      name: '⭐ 严选厚道风',
      bg: '#faf6f0',
      headerBg: '#78350f',
      headerText: '#ffffff',
      subText: '#fde68a',
      priceColor: '#b45309',
      boxBg: '#fef3c7',
      boxBorder: '#d97706',
      boxTextColor: '#78350f',
      defaultTagline: '拒绝杂牌山寨 · 正道源头良品 · 自己家也天天用',
      defaultNote: '💬 掌柜承诺：老实做买卖，品质不忽悠！端上桌的、卖给街坊的，件件物勒工名、源头可溯！'
    },
    'brand': {
      name: '🏛️ 产区专柜风',
      bg: '#f8fafc',
      headerBg: '#1e293b',
      headerText: '#ffffff',
      subText: '#94a3b8',
      priceColor: '#0f172a',
      boxBg: '#e2e8f0',
      boxBorder: '#94a3b8',
      boxTextColor: '#1e293b',
      defaultTagline: '产区直发质检保真 · 专柜同源品质 · 支持扫码验真',
      defaultNote: '💬 品质叮咛：村社合作社与匠心工坊源头直供，规格齐全，支持物勒工名溯源验真！'
    }
  },

  generate(canvas, prod, storeName, styleKey = 'neighborhood', customTitle = '', customTagline = '', customPrice = null, customNote = '') {
    const style = this.styles[styleKey] || this.styles['neighborhood'];
    const ctx = canvas.getContext('2d');
    canvas.width = 600;
    canvas.height = 840;

    // 1. 底色与牌匾
    ctx.fillStyle = style.bg;
    ctx.fillRect(0, 0, 600, 840);
    ctx.fillStyle = style.headerBg;
    ctx.fillRect(30, 30, 540, 110);

    ctx.fillStyle = style.headerText;
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(customTitle.trim() || `【${storeName}】源头直供现货`, 300, 75);

    ctx.font = '15px sans-serif';
    ctx.fillStyle = style.subText;
    ctx.fillText(customTagline.trim() || style.defaultTagline, 300, 110);

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 100, 160, 400, 320);
        this.drawDetails(ctx, prod, style, customPrice, customNote);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => {
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(100, 160, 400, 320);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('源头正品封装', 300, 320);
        this.drawDetails(ctx, prod, style, customPrice, customNote);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = prod.image_url || '';
    });
  },

  drawDetails(ctx, prod, style, customPrice, customNote) {
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(prod.name, 300, 520);

    ctx.fillStyle = '#6b7280';
    ctx.font = '16px sans-serif';
    ctx.fillText(`规格：${prod.spec || '整装'} · 源头直供保真`, 300, 555);

    const price = customPrice !== null && !isNaN(customPrice) ? parseFloat(customPrice) : (parseFloat(prod.tier_1_price) * 1.15);
    ctx.fillStyle = style.priceColor;
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText(`邻里集采便民价：¥${price.toFixed(1)}`, 300, 620);

    ctx.fillStyle = style.boxBg;
    ctx.fillRect(45, 665, 510, 120);
    ctx.strokeStyle = style.boxBorder;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(45, 665, 510, 120);

    ctx.fillStyle = style.boxTextColor;
    ctx.font = 'bold 17px sans-serif';
    this.wrapText(ctx, customNote.trim() || style.defaultNote, 300, 705, 480, 26);
  },

  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const lines = text.split('\n');
    let curY = y;
    for (let i = 0; i < lines.length; i++) {
      let line = '';
      for (const char of lines[i].split('')) {
        const testLine = line + char;
        if (ctx.measureText(testLine).width > maxWidth && line !== '') {
          ctx.fillText(line, x, curY);
          line = char;
          curY += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, curY);
      curY += lineHeight;
    }
  }
};
