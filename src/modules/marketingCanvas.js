export const MarketingCanvas = {
  generate(canvas, prod, storeName, shopType, price) {
    const ctx = canvas.getContext('2d');
    canvas.width = 600;
    canvas.height = 800;

    // 底色
    ctx.fillStyle = '#faf8f5';
    ctx.fillRect(0, 0, 600, 800);

    // 牌匾根据身份自适应
    const brandColor = (shopType === '餐饮饭店') ? '#78350f' : '#064e3b';
    ctx.fillStyle = brandColor;
    ctx.fillRect(30, 30, 540, 110);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';

    if (shopType === '餐饮饭店') {
      ctx.fillText(`【${storeName}】明厨良心食材通告`, 300, 75);
      ctx.font = '15px sans-serif';
      ctx.fillStyle = '#fde68a';
      ctx.fillText('品牌大厂源头直供 · 拒绝散装杂牌 · 请食客放心吃', 300, 110);
    } else {
      ctx.fillText(`【${storeName}】街坊好货福利`, 300, 75);
      ctx.font = '15px sans-serif';
      ctx.fillStyle = '#a7f3d0';
      ctx.fillText('实体老店信誉背书 · 源头直通平价利民 · 随时到店取货', 300, 110);
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 100, 160, 400, 320);
        this.drawDetails(ctx, prod, shopType, price);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => {
        ctx.fillStyle = '#e7e5e4';
        ctx.fillRect(100, 160, 400, 320);
        ctx.fillStyle = '#a8a29e';
        ctx.font = '22px sans-serif';
        ctx.fillText('正品实物保真包', 300, 320);
        this.drawDetails(ctx, prod, shopType, price);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = prod.image_url || '';
    });
  },

  drawDetails(ctx, prod, shopType, price) {
    ctx.fillStyle = '#1c1917';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(prod.name, 300, 520);

    ctx.fillStyle = '#78716c';
    ctx.font = '17px sans-serif';
    ctx.fillText(`规格：${prod.spec || '整箱装'} · 正品直发保真`, 300, 555);

    if (shopType === '餐饮饭店') {
      ctx.fillStyle = '#92400e';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(`大厨指定采购正品食材`, 300, 620);
    } else {
      ctx.fillStyle = '#991b1b';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText(`老邻居拼单价：¥${(price * 1.15).toFixed(1)}`, 300, 620);
    }

    // 承诺底框
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(50, 665, 500, 100);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(50, 665, 500, 100);

    ctx.fillStyle = '#92400e';
    ctx.font = 'bold 18px sans-serif';
    if (shopType === '餐饮饭店') {
      ctx.fillText('💬 老板承诺：后厨透明，良心选料！', 300, 705);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#b45309';
      ctx.fillText('我们用的油、米、调味，都在这里明明白白公示。', 300, 735);
    } else {
      ctx.fillText('💬 老店掌柜叮咛：好货不多，先到先得！', 300, 705);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#b45309';
      ctx.fillText('微信群直接回复「我要1件」，老板亲自给您留货！', 300, 735);
    }
  }
};
