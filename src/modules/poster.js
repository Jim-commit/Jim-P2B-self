// src/modules/poster.js - 店门花纸定制工作台引擎
export let posterState = {
  title: '金龙鱼 黄金比例食用调和油 5L',
  subTitle: '大厂正规批次 · 街坊随心挑看',
  price: '59.9',
  slogan: '备好即送，随心挑看，绝不耽误事儿',
  theme: 'red'
};

export function initPosterStudio(products) {
  window.openPosterStudio = function() {
    const select = document.getElementById('poster-select-prod');
    if (products.length > 0) {
      select.innerHTML = products.map(p => `<option value="${p.id}">${p.name} (进价:¥${p.tier_1_price})</option>`).join('');
    } else {
      select.innerHTML = `<option value="default">金龙鱼 黄金比例食用调和油 5L</option>`;
    }
    window.openModal('poster-studio-modal');
    window.updateCustomPoster();
  };

  window.onPosterProductChange = function(prodId) {
    const match = products.find(p => p.id == prodId);
    if (match) {
      posterState.title = match.name;
      posterState.subTitle = `${match.spec || '原厂原装'} · 街坊随心挑看`;
      posterState.price = (match.tier_1_price * 1.18).toFixed(1);
      document.getElementById('poster-input-price').value = posterState.price;
    }
    window.updateCustomPoster();
  };

  window.updateCustomPoster = function() {
    posterState.price = document.getElementById('poster-input-price').value.trim() || '59.9';
    posterState.theme = document.getElementById('poster-select-theme').value;
    posterState.slogan = document.getElementById('poster-input-slogan').value.trim() || '备好即送，随心挑看，绝不耽误事儿';
    drawCanvasPoster();
  };

  window.downloadPoster = function() {
    const link = document.createElement('a');
    link.download = `便民告示花纸.png`;
    link.href = document.getElementById('poster-canvas').toDataURL('image/png');
    link.click();
  };
}

function drawCanvasPoster() {
  const canvas = document.getElementById('poster-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = posterState.theme === 'red' ? '#881337' : (posterState.theme === 'gold' ? '#b45309' : '#0f766e');
  ctx.fillRect(0, 0, 300, 420);

  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, 276, 396);

  ctx.fillStyle = '#fef08a';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('【 利民平价便利店 】', 150, 44);

  ctx.fillStyle = '#fecdd3';
  ctx.font = '11px sans-serif';
  ctx.fillText('总代源头直配 · 新鲜当月好批次', 150, 68);

  ctx.fillStyle = '#ffffff';
  ctx.font = posterState.title.length > 12 ? 'bold 17px sans-serif' : 'bold 20px sans-serif';
  ctx.fillText(posterState.title, 150, 112);

  ctx.fillStyle = '#fffbeb';
  ctx.beginPath();
  ctx.roundRect(32, 136, 236, 122, 18);
  ctx.fill();

  ctx.fillStyle = '#9f1239';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('街坊邻里心意价', 150, 164);

  ctx.fillStyle = '#be123c';
  ctx.font = '900 44px sans-serif';
  ctx.fillText(`¥${posterState.price}`, 150, 214);

  ctx.fillStyle = '#78716c';
  ctx.font = '11px sans-serif';
  ctx.fillText(posterState.subTitle, 150, 238);

  ctx.fillStyle = '#fef08a';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(posterState.slogan, 150, 288);

  ctx.fillStyle = '#ffffff';
  ctx.font = '11px sans-serif';
  ctx.fillText('• 取货地点：本便利店收银台', 150, 326);
  ctx.fillText('• 备好即送，随到随取，绝不耽误事儿', 150, 348);
}
