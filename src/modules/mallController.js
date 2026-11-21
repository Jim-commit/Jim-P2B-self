import { MallService } from '../services/mallService.js';
import { mallState } from './mall/mallState.js';
import {
  setupTianJieMode,
  setupBrandStoreMode,
  renderDigitalCountersGrid,
  renderCategoryChips,
  renderGoodsGrid,
  initCatalogBindings
} from './mall/mallCatalogModule.js';
import {
  renderVerifiedReviewsWall,
  loadAndRenderC2BDemands,
  initC2BBindings
} from './mall/mallC2BModule.js';
import {
  restoreCart,
  updateCartBadge,
  initCartOrderBindings
} from './mall/mallCartOrderModule.js';

window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

window.exitToTianJie = function () {
  window.location.href = 'mall.html';
};

window.promptEnterBrandStore = function () {
  const code = prompt('请输入合作社/工坊名称关键词或商号代号（如 顺达 或 HZ-91411300X）：');
  if (!code || !code.trim()) return;
  const clean = code.trim().toUpperCase();
  const found = mallState.allTenants.find(
    (t) =>
      (t.tenant_id || '').toUpperCase() === clean ||
      (t.company_name || '').toUpperCase().includes(clean)
  );
  if (!found) {
    return alert(`未找到匹配【${code.trim()}】的在册直供专柜！`);
  }
  window.location.href = `mall.html?t=${found.tenant_id}${mallState.refStoreParam ? `&ref=${mallState.refStoreParam}` : ''}`;
};

window.goToBrandStore = function (tenantId) {
  window.location.href = `mall.html?t=${tenantId}${mallState.refStoreParam ? `&ref=${mallState.refStoreParam}` : ''}`;
};

window.switchMarketMode = async function (mode) {
  mallState.currentMarketMode = mode;
  const isB2C = mode === 'b2c';
  const isCounters = mode === 'counters';
  const isC2B = mode === 'c2b';

  document.getElementById('pane-b2c-market')?.classList.toggle('hidden', !isB2C);
  document.getElementById('pane-counters-market')?.classList.toggle('hidden', !isCounters);
  document.getElementById('pane-c2b-market')?.classList.toggle('hidden', !isC2B);

  document.getElementById('b2c-cart-footer')?.classList.toggle('hidden', isC2B);
  document.getElementById('c2b-publish-footer')?.classList.toggle('hidden', !isC2B);

  const tabs = [
    { id: 'mode-tab-b2c', active: isB2C, activeCls: 'bg-[#1b4332] text-white' },
    { id: 'mode-tab-counters', active: isCounters, activeCls: 'bg-emerald-700 text-white' },
    { id: 'mode-tab-c2b', active: isC2B, activeCls: 'bg-amber-500 text-stone-950' }
  ];

  tabs.forEach((t) => {
    const el = document.getElementById(t.id);
    if (!el) return;
    el.className = t.active
      ? `flex-1 py-2 rounded-xl ${t.activeCls} font-bold shadow transition flex items-center justify-center gap-1`
      : 'flex-1 py-2 rounded-xl text-stone-200 hover:text-white font-bold transition flex items-center justify-center gap-1';
  });

  if (isCounters) renderDigitalCountersGrid();
  else if (isC2B) await loadAndRenderC2BDemands();
};

window.openShareModal = function () {
  const currentUrl = new URL(window.location.href);
  if (mallState.currentTenantParam) currentUrl.searchParams.set('t', mallState.currentTenantParam);
  if (mallState.refStoreParam) currentUrl.searchParams.set('ref', mallState.refStoreParam);

  const shareLink = currentUrl.toString();
  document.getElementById('share-link-text').innerText = shareLink;
  document.getElementById('share-qr-code').src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareLink)}`;
  window.openModal('modal-share');
};

window.copyShareLink = function () {
  const link = document.getElementById('share-link-text').innerText;
  navigator.clipboard.writeText(link).then(() => alert('专属云端扩充货架链接已复制到剪贴簿！'));
};

export async function initMallController() {
  initCatalogBindings();
  initC2BBindings();
  initCartOrderBindings();

  restoreCart();
  updateCartBadge();

  const [tenants, cats] = await Promise.all([
    MallService.fetchActiveTenants(),
    MallService.fetchActiveCategories()
  ]);
  mallState.allTenants = tenants;
  mallState.allCategories = cats;

  const countBadge = document.getElementById('counter-count-badge');
  const quickCountEl = document.getElementById('quick-counter-count');
  if (countBadge) countBadge.innerText = mallState.allTenants.length;
  if (quickCountEl) quickCountEl.innerText = `${mallState.allTenants.length} 家在册直供专柜`;

  if (mallState.currentTenantParam) {
    const matchedTenant = mallState.allTenants.find((t) => (t.tenant_id || '').toUpperCase() === mallState.currentTenantParam);
    if (matchedTenant) mallState.currentTenantParam = matchedTenant.tenant_id;
    setupBrandStoreMode(mallState.currentTenantParam);
  } else {
    setupTianJieMode();
  }

  if (mallState.refStoreParam) {
    const refStore = await MallService.fetchReferrerStore(mallState.refStoreParam);
    if (refStore) {
      mallState.referrerStoreObj = refStore;
      document.getElementById('ref-store-name').innerText = refStore.name;
      document.getElementById('referrer-banner')?.classList.remove('hidden');
    }
  }

  const [products, reviews] = await Promise.all([
    MallService.fetchMallProducts(mallState.currentTenantParam),
    MallService.fetchVerifiedReviews(mallState.currentTenantParam)
  ]);
  mallState.allProducts = products;
  mallState.allReviews = reviews;

  renderCategoryChips();
  renderGoodsGrid();
  renderDigitalCountersGrid();
  renderVerifiedReviewsWall();
}
