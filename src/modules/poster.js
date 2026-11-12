// src/modules/poster.js - 店门花纸定制工作台 Canvas 引擎（普适百工百业 · 无损升级版）
export let posterState = {
  shopName: '厚德便民商行',
  title: '源头直供 · 匠心优选正品好货',
  subTitle: '厂家原装直配 · 诚实守信挑看',
  price: '59.9',
  slogan: '备好即送，随心挑看，绝不耽误事儿',
  theme: 'red'
};

export function initPosterStudio(products = [], customShopName = '') {
  // 自动同步当前页面上的门店招牌名称（普适便利店、餐饮、五金、汽修等各行各业）
  const resolveShopName = () => {
    if (customShopName && customShopName.trim()) return customShopName.trim();
    const domTitle = document.getElementById('store-title')?.innerText?.trim();
    return domTitle || posterState.shopName;
  };

  window.openPosterStudio = function () {
    posterState.shopName = resolveShopName();
    const select = document.getElementById('poster-select-prod');

    if (Array.isArray(products) && products.length > 0) {
      select.innerHTML = products
        .map(p => `<option value="${p.id}">${p.name} (进价:¥${p.tier_1_price})</option>`)
        .join('');

      // 默认选中第一件在售商品并同步其标题与建议零售价
      const first = products[0];
      posterState.title = first.name;
      posterState.subTitle = `${first.spec || '原厂原装'} · 正品保真挑看`;
      posterState.price = (parseFloat(first.tier_1_price || 0) * 1.18).toFixed(1);
      const priceInput = document.getElementById('poster-input-price');
      if (priceInput) priceInput.value = posterState.price;
    } else {
      select.innerHTML = `<option value="default">源头直供 · 匠心优选正品好货</option>`;
    }

    window.openModal('poster-studio-modal');
    window.updateCustomPoster();
  };

  window.onPosterProductChange = function (prodId) {
    const match = (products || []).find(p => p.id == prodId);
    if (match) {
      posterState.title = match.name;
      posterState.subTitle = `${match.spec || '原厂原装'} · 正品保真挑看`;
      posterState.price = (parseFloat(match.tier_1_price || 0) * 1.18).toFixed(1);
      const priceInput = document.getElementById('poster-input-price');
      if (priceInput) priceInput.value = posterState.price;
    }
    window.updateCustomPoster();
  };

  window.updateCustomPoster = function () {
    posterState.shopName = resolveShopName();
    posterState.price = document.getElementById('poster-input-price')?.value.trim() || '59.9';
    posterState.theme = document.getElementById('poster-select-theme')?.value || 'red';
    posterState.slogan = document.getElementById('poster-input-slogan')?.value.trim() || '备好即送，随心挑看，绝不耽误事儿';
    drawCanvasPoster();
  };

  window.downloadPoster = function () {
    const link = document.createElement('a');
    link.download = `${posterState.shopName}-惠民告示花纸.png`;
    link.href = document.getElementById('poster-canvas').toDataURL('image/png');
    link.click();
  };
}

function drawCanvasPoster() {
  const canvas = document.getElementById('poster-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // 背景底色（支持朱红、雅金、瓷青三种传统格调）
  ctx.fillStyle = posterState.theme === 'red' ? '#881337' : (posterState.theme === 'gold' ? '#b45309' : '#0f766e');
  ctx.fillRect(0, 0, 300, 420);

  // 金边花框
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, 276, 396);

  // 门店招牌抬頭（动态适配百工百业实体门店）
  ctx.fillStyle = '#fef08a';
  ctx.font = posterState.shopName.length > 10 ? 'bold 13px sans-serif' : 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`【 ${posterState.shopName} 】`, 150, 44);

  // 普适行业品质背书
  ctx.fillStyle = '#fecdd3';
  ctx.font = '11px sans-serif';
  ctx.fillText('厂家源头直配 · 物勒工名保真行货', 150, 68);

  // 主推商品名称
  ctx.fillStyle = '#ffffff';
  ctx.font = posterState.title.length > 12 ? 'bold 16px sans-serif' : 'bold 20px sans-serif';
  ctx.fillText(posterState.title, 150, 112);

  // 价格白底圆角卡片
  ctx.fillStyle = '#fffbeb';
  ctx.beginPath();
  ctx.roundRect(32, 136, 236, 122, 18);
  ctx.fill();

  ctx.fillStyle = '#9f1239';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('亲邻惠客心意价', 150, 164);

  ctx.fillStyle = '#be123c';
  ctx.font = '900 44px sans-serif';
  ctx.fillText(`¥${posterState.price}`, 150, 214);

  ctx.fillStyle = '#78716c';
  ctx.font = '11px sans-serif';
  ctx.fillText(posterState.subTitle, 150, 238);

  // 掌柜心意口号
  ctx.fillStyle = '#fef08a';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(posterState.slogan, 150, 288);

  // 普适各行各业的取货与服务指引
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px sans-serif';
  ctx.fillText('• 取货登记：本商铺前台接待处', 150, 326);
  ctx.fillText('• 备好即送，随到随取，绝不耽误事儿', 150, 348);
}
