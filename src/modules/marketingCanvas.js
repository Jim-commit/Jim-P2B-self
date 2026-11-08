export const MarketingCanvas = {
  styles: {
    'neighborhood': {
      name: '🏮 街坊老友风',
      bg: '#fdfbf7',
      headerBg: '#064e3b',
      headerText: '#ffffff',
      subText: '#a7f3d0',
      priceColor: '#991b1b',
      boxBg: '#fef3c7',
      boxBorder: '#f59e0b',
      boxTextColor: '#92400e',
      defaultTagline: '实体老店信誉背书 · 假一赔十 · 随时到店取货',
      defaultNote: '💬 掌柜交心话：好货不多，先到先得！直接在群里回复「我要1件」，老板给您留现货！'
    },
    'hotdeal': {
      name: '🔥 走量抢批风',
      bg: '#fff5f5',
      headerBg: '#b91c1c',
      headerText: '#ffffff',
      subText: '#fecaca',
      priceColor: '#dc2626',
      boxBg: '#fee2e2',
      boxBorder: '#ef4444',
      boxTextColor: '#7f1d1d',
      defaultTagline: '源头大货直通 · 整箱整提走量 · 手慢拍大腿',
      defaultNote: '💬 掌柜交代：这批货走的是出厂大宗批发价，数量有限，拼满即封单装车！'
    },
    'honest': {
      name: '⭐ 严选厚道风',
      bg: '#faf6f0',
      headerBg: '#78350f',      // 沉稳熟褐色
      headerText: '#ffffff',
      subText: '#fde68a',       // 暖金色
      priceColor: '#b45309',
      boxBg: '#fef3c7',
      boxBorder: '#d97706',
      boxTextColor: '#78350f',
      defaultTagline: '拒绝杂牌山寨 · 大厂正道货源 · 自己家也天天用',
      defaultNote: '💬 掌柜承诺：老实做买卖，品质不忽悠！店里端出来的、卖给大家的，件件保真！'
    },
    'brand': {
      name: '🏬 专柜正品风',
      bg: '#f8fafc',
      headerBg: '#1e293b',      // 质感深蓝
      headerText: '#ffffff',
      subText: '#94a3b8',
      priceColor: '#0f172a',
      boxBg: '#e2e8f0',
      boxBorder: '#94a3b8',
      boxTextColor: '#1e293b',
      defaultTagline: '源头直发质检保真 · 专柜同款品质 · 假一赔百',
      defaultNote: '💬 品质叮咛：源头金牌厂家直通，包装规格齐全，支持防伪验真与正规核销！'
    }
  },

  // 支持全行业自定义：主标题、副标宣语、拼单价格、掌柜手写叮咛
  generate(canvas, prod, storeName, styleKey = 'neighborhood', customTitle = '', customTagline = '', customPrice = null, customNote = '') {
    const style = this.styles[styleKey] || this.styles['neighborhood'];
    const ctx = canvas.getContext('2d');
    canvas.width = 600;
    canvas.height = 840;

    // 1. 底色
    ctx.fillStyle = style.bg;
    ctx.fillRect(0, 0, 600, 840);

    // 2. 顶栏牌匾
    ctx.fillStyle = style.headerBg;
    ctx.fillRect(30, 30, 540, 110);

    ctx.fillStyle = style.headerText;
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';

    const finalTitle = customTitle.trim() || `【${storeName}】正品现货特惠`;
    ctx.fillText(finalTitle, 300, 75);

    ctx.font = '15px sans-serif';
    ctx.fillStyle = style.subText;
    const finalTagline = customTagline.trim() || style.defaultTagline;
    ctx.fillText(finalTagline, 300, 110);

    // 3. 绘制主图与细节
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
        ctx.fillText('正品实物保真包装', 300, 320);
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
    ctx.font = '17px sans-serif';
    ctx.fillText(`规格：${prod.spec || '整箱/整件装'} · 源头正品直通`, 300, 555);

    const price = customPrice !== null && !isNaN(customPrice) ? parseFloat(customPrice) : (parseFloat(prod.tier_1_price) * 1.15);
    ctx.fillStyle = style.priceColor;
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText(`老友拼单特惠价：¥${price.toFixed(1)}`, 300, 620);

    // 底部掌柜特色叮咛框
    ctx.fillStyle = style.boxBg;
    ctx.fillRect(45, 665, 510, 120);
    ctx.strokeStyle = style.boxBorder;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(45, 665, 510, 120);

    ctx.fillStyle = style.boxTextColor;
    ctx.font = 'bold 17px sans-serif';
    
    // 自动折行渲染掌柜自定义叮咛
    const noteText = customNote.trim() || style.defaultNote;
    this.wrapText(ctx, noteText, 300, 705, 480, 26);
  },

  // Canvas 文字智能换行排版
  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const lines = text.split('\n');
    let currentY = y;

    for (let i = 0; i < lines.length; i++) {
      let line = '';
      const chars = lines[i].split('');
      for (let n = 0; n < chars.length; n++) {
        const testLine = line + chars[n];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, x, currentY);
          line = chars[n];
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
    }
  }
};
