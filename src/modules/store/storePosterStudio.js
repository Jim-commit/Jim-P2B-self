/**
 * 商道相通 · 门店全场景拓客海报与大屏轮播工坊 (storePosterStudio.js)
 * 职责：
 * 1. 单品/组合微信群接龙、预售、拼单海报生成 + 带编号接龙文案一键复制
 * 2. 多品不限数量 A4 打印传单（自动网格分页，同步展示普通零售价与会员专享价对比）
 * 3. 16:9 店内旧平板/电视大屏全屏轮播广告模式
 */
(function (global) {
  'use strict';

  const StorePosterStudio = {
    getVault() {
      return global.StoreLocalVault;
    },

    // 生成微信群接龙/预售标准化接龙文案（一键复制发群）
    buildWechatGroupSolitaireText({ campaignTitle = '今日邻里特惠接龙', items = [], deadline = '今晚20:00截单', pickupTip = '到店自提 / 满额送货' }) {
      const storeName = this.getVault().activeStoreData.storeName;
      const itemLines = items.map((it, idx) => {
        const memTag = Number(it.memberPrice) > 0 && Number(it.memberPrice) < Number(it.retailPrice)
          ? `（会员专享 ¥${Number(it.memberPrice).toFixed(2)}）`
          : '';
        return `${idx + 1}. ${it.name}：¥${Number(it.retailPrice).toFixed(2)}/${it.unit || '份'}${memTag}`;
      }).join('\n');

      return `🔥【${storeName}】${campaignTitle}\n` +
        `⏰ ${deadline} · ${pickupTip}\n` +
        `━━━━━━━━━━━━━━\n` +
        `${itemLines || '1. 本期特惠好物（详情见海报）'}\n` +
        `━━━━━━━━━━━━━━\n` +
        `👇 需要的邻居请直接复制接龙（格式：楼栋房号 + 商品数量）：\n` +
        `1. \n2. `;
    },

    // 生成单品/多品微信群接龙/拼单海报弹窗（支持下载图片或直接截屏转发）
    openGroupPosterModal({ campaignTitle = '邻里新鲜直供 · 限时接龙', items = [], deadline = '今日截单', targetGroupCount = 0 }) {
      const vault = this.getVault();
      const storeName = vault.activeStoreData.storeName;
      const qrImg = vault.activeStoreData.payQrs?.wechat || '';

      const existing = document.getElementById('sdxt-poster-modal');
      if (existing) existing.remove();

      const itemCards = items.slice(0, 6).map((it) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:10px;background:#fff;margin-bottom:8px;box-shadow:0 2px 6px rgba(0,0,0,.04);">
          <div style="min-width:0;padding-right:8px;">
            <div style="font-weight:700;font-size:15px;color:#0f172a;">${it.name}</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px;">规格：${it.unit || '份'}${it.shelfLoc ? ` · ${it.shelfLoc}` : ''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:18px;font-weight:900;color:#dc2626;">¥${Number(it.retailPrice).toFixed(2)}</div>
            ${Number(it.memberPrice) > 0 && Number(it.memberPrice) < Number(it.retailPrice)
              ? `<div style="font-size:11px;color:#d97706;font-weight:600;">会员价 ¥${Number(it.memberPrice).toFixed(2)}</div>`
              : ''}
          </div>
        </div>`).join('');

      const modal = document.createElement('div');
      modal.id = 'sdxt-poster-modal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:1200;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:14px;overflow-y:auto;';
      modal.innerHTML = `
        <div style="width:100%;max-width:400px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,.3);">
          <div id="sdxt-poster-canvas" style="padding:20px 18px;background:linear-gradient(160deg,#dc2626 0%,#ea580c 48%,#fff7ed 48.5%,#fff7ed 100%);">
            <div style="color:#fff;margin-bottom:14px;">
              <div style="display:inline-block;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,.2);font-size:12px;font-weight:600;">🏪 ${storeName}</div>
              <div style="font-size:22px;font-weight:900;margin-top:8px;line-height:1.25;">${campaignTitle}</div>
              <div style="font-size:12px;opacity:.92;margin-top:4px;">⏰ ${deadline}${targetGroupCount > 0 ? ` · 满 ${targetGroupCount} 份成团开抢` : ''}</div>
            </div>
            <div style="margin-top:10px;">${itemCards || '<div style="padding:16px;background:#fff;border-radius:10px;text-align:center;color:#64748b;">请在商品库勾选特惠商品后生成海报</div>'}</div>
            <div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <div style="font-size:12px;color:#334155;line-height:1.5;">
                <div style="font-weight:700;color:#0f172a;">长按识别或微信群接龙下单</div>
                <div>到店报手机号即享会员专享福利</div>
              </div>
              ${qrImg ? `<img src="${qrImg}" alt="门店码" style="width:54px;height:54px;border-radius:6px;object-fit:cover;border:1px solid #e2e8f0;"/>` : ''}
            </div>
          </div>
          <div style="padding:12px 16px;display:flex;gap:8px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <button type="button" id="sdxt-copy-solitaire-btn" style="flex:1;padding:10px;border:none;border-radius:10px;background:#10b981;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">📋 复制群接龙文案</button>
            <button type="button" id="sdxt-close-poster-btn" style="padding:10px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#334155;font-size:13px;cursor:pointer;">关闭</button>
          </div>
        </div>`;

      document.body.appendChild(modal);
      modal.querySelector('#sdxt-close-poster-btn').onclick = () => modal.remove();
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
      modal.querySelector('#sdxt-copy-solitaire-btn').onclick = async (e) => {
        const txt = this.buildWechatGroupSolitaireText({ campaignTitle, items, deadline });
        try {
          await navigator.clipboard.writeText(txt);
          e.target.textContent = '✅ 已复制，去微信群粘贴';
        } catch (_) {
          e.target.textContent = '✅ 文案已准备好';
        }
      };
    },

    // 多品不限数量 A4 打印传单（自动网格排版，含普通价与会员价对比）
    printA4Flyer({ flyerTitle = '本周门店特惠DM单', items = [], promoNote = '到店报手机号注册会员，立享会员专享价！' }) {
      const storeName = this.getVault().activeStoreData.storeName;
      const gridItems = items.map((it) => `
        <div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:10px;break-inside:avoid;background:#fff;">
          <div style="font-size:11px;color:#64748b;">${it.category || '精选好物'}</div>
          <div style="font-weight:800;font-size:15px;color:#0f172a;margin:4px 0;">${it.name}</div>
          <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px;">
            <span style="font-size:20px;font-weight:900;color:#dc2626;">¥${Number(it.retailPrice).toFixed(2)}</span>
            <span style="font-size:11px;color:#64748b;">/${it.unit || '件'}</span>
          </div>
          ${Number(it.memberPrice) > 0 && Number(it.memberPrice) < Number(it.retailPrice)
            ? `<div style="margin-top:4px;padding:2px 6px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:700;display:inline-block;">👑 会员价 ¥${Number(it.memberPrice).toFixed(2)}</div>`
            : ''}
        </div>`).join('');

      const win = window.open('', '_blank', 'width=840,height=1000');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${flyerTitle}</title>
        <style>@page{size:A4;margin:12mm;}body{font-family:system-ui,sans-serif;color:#0f172a;margin:0;}</style>
        </head><body>
        <div style="background:#dc2626;color:#fff;padding:16px 20px;border-radius:12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;opacity:.9;">🏪 ${storeName}</div>
            <div style="font-size:26px;font-weight:900;margin-top:2px;">${flyerTitle}</div>
          </div>
          <div style="font-size:13px;background:rgba(255,255,255,.18);padding:8px 12px;border-radius:8px;max-width:240px;">${promoNote}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">${gridItems}</div>
        <script>window.onload=function(){window.print();}</script></body></html>`);
      win.document.close();
    },

    // 16:9 店内旧平板 / 电视大屏全屏轮播模式
    launchTvSlideshow(items = [], intervalSec = 5) {
      const list = items.length ? items : Object.values(this.getVault().activeStoreData.catalog || {}).filter((i) => !i.archived).slice(0, 12);
      if (!list.length) throw new Error('暂无可轮播的商品，请先在商品总库添加商品');

      const existing = document.getElementById('sdxt-tv-slideshow');
      if (existing) existing.remove();

      const storeName = this.getVault().activeStoreData.storeName;
      let idx = 0;

      const overlay = document.createElement('div');
      overlay.id = 'sdxt-tv-slideshow';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:1500;background:radial-gradient(circle at top right,#1e293b,#090d16);color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:36px 48px;font-family:system-ui,sans-serif;';

      const renderSlide = () => {
        const it = list[idx % list.length];
        const hasMem = Number(it.memberPrice) > 0 && Number(it.memberPrice) < Number(it.retailPrice);
        overlay.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:24px;font-weight:800;color:#fbbf24;">🏪 ${storeName} · 今日特惠看板</div>
            <button type="button" id="sdxt-exit-tv-btn" style="padding:8px 16px;border:1px solid rgba(255,255,255,.25);border-radius:10px;background:rgba(255,255,255,.08);color:#cbd5e1;font-size:14px;cursor:pointer;">退出大屏 (${(idx % list.length) + 1}/${list.length})</button>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:40px;my-auto;">
            <div style="flex:1;">
              <div style="display:inline-block;padding:6px 16px;border-radius:99px;background:#dc2626;font-size:18px;font-weight:700;margin-bottom:16px;">${it.category || '店长推荐'}</div>
              <div style="font-size:64px;font-weight:900;line-height:1.15;letter-spacing:-1px;">${it.name}</div>
              <div style="font-size:24px;color:#94a3b8;margin-top:16px;">单位：${it.unit || '件'}${it.shelfLoc ? ` · 货架位：${it.shelfLoc}` : ''}</div>
            </div>
            <div style="text-align:right;background:rgba(255,255,255,.06);padding:36px 44px;border-radius:28px;border:1px solid rgba(255,255,255,.12);">
              <div style="font-size:22px;color:#cbd5e1;">零售惠民价</div>
              <div style="font-size:96px;font-weight:900;color:#f87171;line-height:1.05;margin-top:8px;">¥${Number(it.retailPrice).toFixed(2)}</div>
              ${hasMem ? `<div style="margin-top:16px;padding:10px 20px;border-radius:14px;background:#f59e0b;color:#0f172a;font-size:28px;font-weight:900;">👑 会员专享 ¥${Number(it.memberPrice).toFixed(2)}</div>` : ''}
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:18px;color:#94a3b8;">
            <span>📱 到店报手机号即享会员福利 · 支持微信/支付宝/现金</span>
            <span>商道相通 · 智慧门店大屏</span>
          </div>`;
        overlay.querySelector('#sdxt-exit-tv-btn').onclick = () => {
          clearInterval(timer);
          overlay.remove();
        };
        idx++;
      };

      document.body.appendChild(overlay);
      renderSlide();
      const timer = setInterval(renderSlide, Math.max(2, Number(intervalSec || 5)) * 1000);
    }
  };

  global.StorePosterStudio = StorePosterStudio;
})(window);
