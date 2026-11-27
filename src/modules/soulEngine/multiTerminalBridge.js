/**
 * 商道相通 · 跨端轻量桥接器 (multiTerminalBridge.js)
 * 职责：专注多端身份联动、门店凑单开产提醒、供货方胶囊名称精简与外勤端桥接
 * 原则：零硬编码、零厚重UI侵入、按页面路径按需激活
 */
(function (global) {
  'use strict';

  const Bridge = {
    version: '4.0.1-slim',

    getPageType() {
      const path = (window.location.pathname || '').toLowerCase();
      if (path.includes('driver')) return 'driver';
      if (path.includes('mall')) return 'mall';
      if (path.includes('supplier')) return 'suppliers';
      return 'index';
    },

    init() {
      const page = this.getPageType();
      if (page === 'index') {
        this.bindStoreSupplierPills();
        this.renderCoProductionBanner();
      } else if (page === 'driver') {
        this.mountDriverQuickBar();
      }
    },

    // 自动精简供货方胶囊展示名称，保持门店货架简洁
    bindStoreSupplierPills() {
      const cleanPills = () => {
        document.querySelectorAll('[data-supplier-pill], .supplier-pill-name').forEach((el) => {
          const raw = (el.getAttribute('data-full-name') || el.textContent || '').trim();
          if (!raw) return;
          if (!el.getAttribute('data-full-name')) el.setAttribute('data-full-name', raw);
          const shortName = raw.replace(/(有限公司|有限责任公司|供应链|商贸行|批发部|旗舰店)$/g, '');
          if (shortName && shortName.length >= 2 && el.textContent !== shortName) {
            el.textContent = shortName;
          }
        });
      };
      cleanPills();
      const observer = new MutationObserver(cleanPills);
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    },

    // 上游供货方「凑单开产」轻量动态接龙横幅（仅在存在有效拼产活动时浮现）
    renderCoProductionBanner() {
      const slot = document.getElementById('co-production-banner-slot');
      if (!slot) return;
      try {
        const raw = localStorage.getItem('sdxt_coprod_campaigns');
        const list = raw ? JSON.parse(raw) : [];
        const active = Array.isArray(list) ? list.find((c) => c && c.active && c.targetQty > 0) : null;
        if (!active) {
          slot.innerHTML = '';
          return;
        }
        const pct = Math.min(100, Math.round(((active.currentQty || 0) / active.targetQty) * 100));
        slot.innerHTML = `
          <div class="sdxt-coprod-bar" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;margin:8px 0;border-radius:12px;background:linear-gradient(90deg,#fffbeb,#fef3c7);border:1px solid #fde68a;font-size:13px;color:#92400e;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🔥 上游凑单开产：${this.escapeHtml(active.title || '定制批次')}</div>
              <div style="font-size:12px;opacity:.85;margin-top:2px;">已凑 ${active.currentQty || 0}/${active.targetQty}${this.escapeHtml(active.unit || '件')}（进度 ${pct}%）· 满额即锁价排产</div>
            </div>
            <button type="button" data-action="join-coprod" data-id="${this.escapeHtml(String(active.id || ''))}" style="flex-shrink:0;padding:6px 12px;border:none;border-radius:8px;background:#d97706;color:#fff;font-weight:600;font-size:12px;cursor:pointer;">跟单凑数</button>
          </div>`;
        slot.querySelector('[data-action="join-coprod"]')?.addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('sdxt:join-coproduction', { detail: active }));
        });
      } catch (_) {
        slot.innerHTML = '';
      }
    },

    // 外勤司机端轻量工具条
    mountDriverQuickBar() {
      if (document.getElementById('sdxt-driver-bridge-bar')) return;
      const bar = document.createElement('div');
      bar.id = 'sdxt-driver-bridge-bar';
      bar.style.cssText = 'position:fixed;bottom:14px;left:14px;right:14px;z-index:900;display:flex;gap:8px;justify-content:space-around;padding:10px;border-radius:14px;background:#0f172a;color:#fff;box-shadow:0 8px 24px rgba(15,23,42,.25);font-size:13px;';
      bar.innerHTML = `
        <button type="button" onclick="window.dispatchEvent(new CustomEvent('sdxt:driver-scan-sign'))" style="flex:1;padding:8px;border:none;border-radius:8px;background:#10b981;color:#fff;font-weight:600;">📦 扫码签收</button>
        <button type="button" onclick="window.dispatchEvent(new CustomEvent('sdxt:driver-report-delay'))" style="flex:1;padding:8px;border:none;border-radius:8px;background:#334155;color:#fff;">⏱️ 路况报备</button>
      `;
      document.body.appendChild(bar);
    },

    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = String(str == null ? '' : str);
      return div.innerHTML.replace(/"/g, '"').replace(/'/g, ''');
    }
  };

  global.MultiTerminalBridge = Bridge;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Bridge.init());
  } else {
    Bridge.init();
  }
})(window);
