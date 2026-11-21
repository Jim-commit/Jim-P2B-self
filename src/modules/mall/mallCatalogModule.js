import { mallState, calcMallOnlinePrice } from './mallState.js';

export function setupTianJieMode() {
  document.getElementById('mall-header-title').innerText = '百工天街 · 源头平准直供集市';
  document.getElementById('mall-mode-badge').innerText = '天街公域';
  document.getElementById('mall-header-sub').innerText = '物勒工名 · 服务归店 · 产区直达';
  document.getElementById('btn-back-street')?.classList.add('hidden');
  document.getElementById('btn-find-brand')?.classList.remove('hidden');
  document.getElementById('brand-hero-section')?.classList.add('hidden');
  document.getElementById('mode-tab-counters')?.classList.remove('hidden');
  document.getElementById('tianjie-quick-counter-pill')?.classList.remove('hidden');
}

export function setupBrandStoreMode(tenantId) {
  const tenant = mallState.allTenants.find((t) => (t.tenant_id || '').toUpperCase() === (tenantId || '').toUpperCase());
  const name = tenant ? tenant.company_name : tenantId;
  const settings = tenant?.custom_settings && typeof tenant.custom_settings === 'object' ? tenant.custom_settings : {};
  const socialLinks = settings.socialLinks && typeof settings.socialLinks === 'object' ? settings.socialLinks : {};
  const seasonalPause = settings.seasonalPause || {};
  const sponsorOrg = (tenant?.sponsor_org || '').trim();

  document.getElementById('mall-header-title').innerText = `${name} · 数字专柜`;
  document.getElementById('mall-mode-badge').innerText = '源头专柜';
  document.getElementById('mall-header-sub').innerText = '产区直营 · 阳光工价 · 按需直配';
  document.getElementById('btn-back-street')?.classList.remove('hidden');
  document.getElementById('btn-find-brand')?.classList.add('hidden');
  document.getElementById('mode-tab-counters')?.classList.add('hidden');
  document.getElementById('tianjie-quick-counter-pill')?.classList.add('hidden');

  document.getElementById('hero-brand-name').innerText = name;
  let heroDesc = tenant?.brand_origin_desc || '村社合作社与匠心工坊 · 按需直配 · 阳光工价';
  if (seasonalPause.isPaused) {
    heroDesc = `🍵 农忙/盘点暂歇接单：${seasonalPause.reason || '产区集中采收中'}${seasonalPause.resumeDate ? `（预计 ${seasonalPause.resumeDate} 恢复接单）` : ''}`;
  } else if (settings.campaignActive && Array.isArray(settings.promos) && settings.promos.length > 0) {
    heroDesc = `🔥 ${settings.promos[0].title}：${settings.promos[0].rule}`;
  } else if (settings.harvestAidOn) {
    heroDesc = '🌾 丰产助农平准认领季 · 源头新鲜直发 · 欢迎邻里拼单';
  }
  document.getElementById('hero-brand-desc').innerText = heroDesc;
  document.getElementById('hero-tenant-id').innerText = tenant ? tenant.tenant_id : tenantId;

  const isInd = tenant?.business_type === 'individual' || String(tenant?.tenant_id || '').startsWith('GR-');
  document.getElementById('craft-type-text').innerText = isInd
    ? '实名农户 / 手艺人 / 个体匠人专柜'
    : tenant?.business_type === 'factory'
    ? '村社合作社 / 源头工坊专柜'
    : '区域平准仓集散专柜';
  document.getElementById('craft-contact-text').innerText = tenant?.contact_person || '专柜当值执事';
  document.getElementById('craft-story-text').innerText =
    tenant?.brand_origin_desc ||
    '恪守“物勒工名、以考其诚”古训，全系直供良品实行阳光平准正价，优先通过合作门店自提惠及邻里。';

  const mediaBtn = document.getElementById('craft-media-link');
  const mediaUrl = tenant?.video_url || tenant?.media_url || '';
  if (mediaBtn) {
    if (mediaUrl) {
      mediaBtn.href = mediaUrl;
      mediaBtn.classList.remove('hidden');
    } else {
      mediaBtn.classList.add('hidden');
    }
  }

  const archivePanel = document.getElementById('brand-craft-archive-panel');
  if (archivePanel) {
    let matrixEl = document.getElementById('brand-social-matrix-bar');
    if (!matrixEl) {
      matrixEl = document.createElement('div');
      matrixEl.id = 'brand-social-matrix-bar';
      archivePanel.appendChild(matrixEl);
    }
    const btns = [];
    if (sponsorOrg) {
      btns.push(
        `<span class="bg-amber-100 border border-amber-400 text-amber-950 px-2.5 py-1 rounded-xl font-bold text-[10px]">🛡️ 由【${sponsorOrg}】提供品质联保背书</span>`
      );
    }
    if (seasonalPause.isPaused) {
      btns.push(
        `<span class="bg-rose-100 border border-rose-300 text-rose-900 px-2.5 py-1 rounded-xl font-bold text-[10px]">🍵 暂歇接单至 ${seasonalPause.resumeDate || '近期恢复'}</span>`
      );
    }
    if (socialLinks.websiteUrl) {
      btns.push(
        `<a href="${socialLinks.websiteUrl}" target="_blank" class="bg-white border border-stone-200 text-stone-800 px-2.5 py-1 rounded-xl font-bold text-[10px] hover:border-emerald-700 transition">🌐 商号官网</a>`
      );
    }
    if (socialLinks.wechatOa) {
      btns.push(
        `<span class="bg-emerald-50 border border-emerald-200 text-emerald-900 px-2.5 py-1 rounded-xl font-bold text-[10px]">💬 公众号：${socialLinks.wechatOa}</span>`
      );
    }
    if (socialLinks.serviceWx) {
      btns.push(
        `<button type="button" onclick="window.copyCounterWechatService('${socialLinks.serviceWx}')" class="bg-amber-100 border border-amber-300 text-amber-950 px-2.5 py-1 rounded-xl font-bold text-[10px] active:scale-95">📋 复制客服微信: ${socialLinks.serviceWx}</button>`
      );
    }
    matrixEl.className = btns.length > 0 ? 'flex flex-wrap gap-1.5 pt-2 border-t border-stone-200/70' : 'hidden';
    matrixEl.innerHTML = btns.join('');
  }

  document.getElementById('brand-hero-section')?.classList.remove('hidden');
}

export function renderDigitalCountersGrid() {
  const grid = document.getElementById('digital-counters-grid');
  if (!grid) return;

  let list = mallState.allTenants;
  if (mallState.counterTypeFilter === 'factory') {
    list = list.filter((t) => t.business_type === 'factory' || t.business_type === 'coop');
  } else if (mallState.counterTypeFilter === 'agent') {
    list = list.filter((t) => t.business_type !== 'factory' && t.business_type !== 'coop');
  }

  if (mallState.counterSearchKeyword) {
    list = list.filter(
      (t) =>
        (t.company_name || '').toLowerCase().includes(mallState.counterSearchKeyword) ||
        (t.tenant_id || '').toLowerCase().includes(mallState.counterSearchKeyword) ||
        (t.brand_origin_desc || '').toLowerCase().includes(mallState.counterSearchKeyword) ||
        (t.sponsor_org || '').toLowerCase().includes(mallState.counterSearchKeyword)
    );
  }

  if (list.length === 0) {
    grid.innerHTML = '<div class="col-span-full py-12 text-center text-stone-400 text-xs">未找到匹配的产区或工坊专柜。</div>';
    return;
  }

  grid.innerHTML = list
    .map((t) => {
      const tenantProds = mallState.allProducts.filter((p) => p.tenant_id === t.tenant_id);
      const sampleProds = tenantProds.slice(0, 3);
      const isInd = t.business_type === 'individual' || String(t.tenant_id || '').startsWith('GR-');
      const settings = t.custom_settings && typeof t.custom_settings === 'object' ? t.custom_settings : {};
      const seasonalPause = settings.seasonalPause || {};
      const sponsorOrg = (t.sponsor_org || '').trim();

      return `
        <div class="bg-white border ${seasonalPause.isPaused ? 'border-amber-300' : 'border-stone-200 hover:border-emerald-700'} rounded-3xl p-4 shadow-xs transition flex flex-col justify-between space-y-3">
          <div class="space-y-2">
            <div class="flex justify-between items-start gap-2">
              <div>
                <span class="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-mono font-bold">
                  ${isInd ? '👨‍🌾 个人农户 / 手艺人 / 个体匠人' : t.business_type === 'factory' ? '🏭 源头工坊专柜' : '🌾 合作社 / 集散专柜'}
                </span>
                <h3 class="text-sm font-bold text-stone-900 mt-1.5">${t.company_name}</h3>
                <span class="text-[10px] text-stone-400 font-mono block">专柜编号: ${t.tenant_id}</span>
              </div>
              <span class="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-lg font-mono shrink-0">
                云端货架 ${tenantProds.length} 款
              </span>
            </div>

            ${
              sponsorOrg
                ? `<div class="bg-amber-50 border border-amber-300 text-amber-950 px-2.5 py-1 rounded-xl text-[10px] font-bold">
                    🛡️ 由【${sponsorOrg}】提供品质联保
                  </div>`
                : ''
            }

            ${
              seasonalPause.isPaused
                ? `<div class="bg-amber-100 border border-amber-400 text-amber-950 px-2.5 py-1 rounded-xl text-[10px] font-bold">
                    🍵 农忙/盘点暂歇接单${seasonalPause.resumeDate ? `（预计 ${seasonalPause.resumeDate} 恢复）` : ''}
                  </div>`
                : ''
            }

            <p class="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">
              ${t.brand_origin_desc || '物勒工名 · 源头直供 · 支持合作门店自提与按需集采配货'}
            </p>

            ${
              sampleProds.length > 0
                ? `<div class="grid grid-cols-3 gap-1.5 pt-1">
                    ${sampleProds
                      .map((sp) => {
                        const { unitPrice } = calcMallOnlinePrice(sp, 1);
                        return `
                          <div class="bg-stone-50 border border-stone-100 rounded-xl p-1.5 text-center">
                            <div class="w-full h-12 rounded-lg bg-stone-200/60 overflow-hidden flex items-center justify-center mb-1">
                              ${sp.image_url ? `<img src="${sp.image_url}" class="w-full h-full object-cover">` : '<span class="text-[9px] text-stone-400">良品</span>'}
                            </div>
                            <span class="text-[9px] text-stone-700 block truncate">${sp.name}</span>
                            <b class="text-[10px] font-mono text-emerald-900">¥${unitPrice}</b>
                          </div>
                        `;
                      })
                      .join('')}
                  </div>`
                : `<div class="bg-stone-50 rounded-xl p-2 text-[10px] text-stone-400 text-center">该专柜支持按需预订与集采排产</div>`
            }
          </div>

          <div class="pt-2 border-t border-stone-100 flex gap-2 text-xs">
            <button onclick="window.openC2BDemandModal('', '${t.tenant_id}')" class="bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold px-3 py-2 rounded-xl transition">
              🎯 按需询价
            </button>
            <button onclick="window.goToBrandStore('${t.tenant_id}')" class="flex-1 bg-[#1b4332] hover:bg-[#143628] text-white font-bold py-2 rounded-xl shadow active:scale-95 transition">
              进入专柜选货 ➔
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderCategoryChips() {
  const bar = document.getElementById('category-filter-bar');
  const container = document.getElementById('dynamic-cat-chips');
  if (!bar || !container) return;

  let catNames = mallState.allCategories.filter((c) => c.level === 1).map((c) => c.name);
  if (catNames.length === 0 && mallState.allProducts.length > 0) {
    catNames = [...new Set(mallState.allProducts.map((p) => p.category_main).filter(Boolean))];
  }

  if (catNames.length === 0) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  container.innerHTML = catNames
    .map(
      (name) => `
      <button onclick="window.filterMallCategory('${name}')" class="mall-cat-chip bg-white border border-stone-200 text-stone-700 hover:border-emerald-700 px-3 py-1 rounded-xl font-bold transition">
        ${name}
      </button>
    `
    )
    .join('');
}

function updateMatchedTenantShortcut() {
  const box = document.getElementById('matched-tenant-shortcut');
  if (!box) return;

  if (mallState.currentTenantParam || !mallState.currentKeywordFilter) {
    box.classList.add('hidden');
    return;
  }

  const matched = mallState.allTenants.filter(
    (t) =>
      (t.company_name || '').toLowerCase().includes(mallState.currentKeywordFilter) ||
      (t.tenant_id || '').toLowerCase().includes(mallState.currentKeywordFilter)
  );

  if (matched.length === 0) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  box.innerHTML = matched
    .slice(0, 3)
    .map(
      (t) => `
      <div onclick="window.goToBrandStore('${t.tenant_id}')" class="bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-2xl flex justify-between items-center cursor-pointer hover:bg-emerald-100/70 transition">
        <div class="text-xs">
          <span class="text-emerald-800 font-bold">🏛️ 直达产区专柜：${t.company_name}</span>
          <span class="text-[10px] text-emerald-700/80 font-mono ml-1.5">(${t.tenant_id})</span>
        </div>
        <span class="text-[11px] font-bold text-emerald-900">进专柜 ➔</span>
      </div>
    `
    )
    .join('');
}

export function renderGoodsGrid() {
  const container = document.getElementById('mall-goods-grid');
  if (!container) return;

  let filtered = mallState.allProducts;

  if (mallState.currentCategoryFilter !== 'all') {
    filtered = filtered.filter((p) => p.category_main === mallState.currentCategoryFilter);
  }
  if (mallState.currentKeywordFilter) {
    filtered = filtered.filter((p) => {
      const tenant = mallState.allTenants.find((t) => t.tenant_id === p.tenant_id);
      const tName = tenant ? tenant.company_name : p.tenant_id;
      return (
        (p.name || '').toLowerCase().includes(mallState.currentKeywordFilter) ||
        (p.spec || '').toLowerCase().includes(mallState.currentKeywordFilter) ||
        (p.origin_place || '').toLowerCase().includes(mallState.currentKeywordFilter) ||
        (tName || '').toLowerCase().includes(mallState.currentKeywordFilter)
      );
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center space-y-3 bg-white rounded-3xl border border-stone-200 p-6">
        <div class="text-stone-600 font-bold text-xs">当前货架暂无匹配的云端直供良品</div>
        <p class="text-[11px] text-stone-400 max-w-xs mx-auto leading-relaxed">
          日常民生常备品优先配置于附近合作门店，您可逛产区专柜或直接发布真实用度求购榜由源头直供回应。
        </p>
        <div class="flex flex-wrap justify-center gap-2 pt-1">
          ${
            !mallState.currentTenantParam
              ? `<button onclick="window.switchMarketMode('counters')" class="bg-[#1b4332] hover:bg-[#143628] text-white font-bold text-xs px-4 py-2 rounded-xl shadow active:scale-95 transition">
                  🏛️ 逛逛在册产区专柜 (${mallState.allTenants.length})
                </button>`
              : ''
          }
          <button onclick="window.switchMarketMode('c2b'); window.openC2BDemandModal(document.getElementById('mall-search-input')?.value || '');" class="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs px-4 py-2 rounded-xl shadow active:scale-95 transition">
            📢 发求购榜让源头报价
          </button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map((p) => {
      const tenant = mallState.allTenants.find((t) => t.tenant_id === p.tenant_id);
      const tenantName = tenant ? tenant.company_name : p.tenant_id;
      const settings = tenant?.custom_settings && typeof tenant.custom_settings === 'object' ? tenant.custom_settings : {};
      const sponsorOrg = (tenant?.sponsor_org || '').trim();
      const isTenantPaused = !!settings.seasonalPause?.isPaused;
      const tags = Array.isArray(p.tags) ? p.tags : [];
      const isSingleShop = !!mallState.currentTenantParam;
      const priceInfo = calcMallOnlinePrice(p, 1);
      const isHarvestAid = !!settings.harvestAidOn;
      const isStoreRecommended =
        !!mallState.referrerStoreObj ||
        tags.some((t) => String(t).includes('直供') || String(t).includes('严选') || String(t).includes('常备'));

      return `
        <div class="bg-white rounded-3xl p-3 border border-stone-200/80 shadow-sm flex flex-col justify-between space-y-2 hover:shadow-md transition">
          <div class="space-y-1.5">
            <div onclick="window.openProductDetail(${p.id})" class="relative w-full h-32 rounded-2xl bg-stone-100 overflow-hidden flex items-center justify-center cursor-pointer">
              ${p.image_url ? `<img src="${p.image_url}" class="w-full h-full object-cover">` : `<span class="text-stone-300 text-xs">良品封装</span>`}
              <span class="absolute top-1.5 left-1.5 bg-[#1b4332]/80 backdrop-blur-sm text-white text-[9px] px-2 py-0.5 rounded-full font-mono">
                ${p.measure_unit || '件'}装
              </span>
              ${
                priceInfo.bulkUnitPrice > 0
                  ? `<span class="absolute top-1.5 right-1.5 bg-amber-500 text-stone-950 text-[8px] px-1.5 py-0.5 rounded-full font-bold shadow-xs">
                      满${priceInfo.bulkQty}件¥${priceInfo.bulkUnitPrice}
                    </span>`
                  : ''
              }
              ${
                isHarvestAid
                  ? `<span class="absolute bottom-1.5 left-1.5 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md">
                      🌾 丰产平准特惠
                    </span>`
                  : isStoreRecommended
                  ? `<span class="absolute bottom-1.5 left-1.5 bg-amber-100/95 text-amber-950 border border-amber-300 text-[8px] font-bold px-1.5 py-0.5 rounded-md">
                      🌾 源头直供
                    </span>`
                  : ''
              }
              <button type="button" onclick="event.stopPropagation(); window.viewProductTrace(${p.id})" class="absolute bottom-1.5 right-1.5 bg-white/90 backdrop-blur-sm text-emerald-900 border border-emerald-200 text-[9px] font-bold px-2 py-0.5 rounded-lg active:scale-95 shadow-xs">
                📜 验真
              </button>
            </div>

            <div onclick="window.openProductDetail(${p.id})" class="cursor-pointer">
              <b class="text-xs text-stone-900 font-bold block line-clamp-1">${p.name}</b>
              <span class="text-[10px] text-stone-400 font-mono block">${p.spec || '整装'} · ${p.category_main || '常规'}</span>
              ${!isSingleShop ? `<span class="text-[9px] text-emerald-800/80 block truncate mt-0.5">🏭 ${tenantName}</span>` : ''}
              ${sponsorOrg ? `<span class="inline-block bg-amber-50 text-amber-950 border border-amber-300 text-[9px] font-bold px-1.5 py-0.2 rounded mt-0.5">🛡️ ${sponsorOrg}品质联保</span>` : ''}
              ${isTenantPaused ? `<span class="inline-block bg-rose-50 text-rose-800 border border-rose-200 text-[9px] font-bold px-1.5 py-0.2 rounded mt-0.5">🍵 农忙暂歇接单</span>` : ''}
              ${
                tags.length
                  ? `<div class="flex flex-wrap gap-1 mt-1">
                      ${tags.slice(0, 2).map((t) => `<span class="bg-amber-50 text-amber-900 border border-amber-200 text-[9px] px-1.5 rounded">${t}</span>`).join('')}
                    </div>`
                  : ''
              }
            </div>
          </div>

          <div class="pt-2 border-t border-stone-100 flex justify-between items-center">
            <div>
              <span class="text-[9px] text-stone-400 block font-mono">${priceInfo.tierLabel}</span>
              <div class="flex items-baseline gap-1 font-mono">
                <b class="text-sm text-emerald-900 font-bold">¥${priceInfo.unitPrice}</b>
                ${priceInfo.hasDiscount ? `<span class="text-[10px] text-stone-400 line-through">¥${priceInfo.basePrice}</span>` : ''}
              </div>
            </div>

            <div class="flex items-center gap-1">
              ${
                !isSingleShop
                  ? `<button onclick="window.goToBrandStore('${p.tenant_id}')" class="text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold px-2 py-1.5 rounded-xl transition" title="进该产区专柜">
                      专柜
                    </button>`
                  : ''
              }
              <button onclick="window.addToCart(${p.id})" class="bg-[#1b4332] hover:bg-[#143628] text-white font-bold text-xs w-7 h-7 rounded-xl flex items-center justify-center active:scale-95 shadow transition">
                +
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

export function initCatalogBindings() {
  window.copyCounterWechatService = function (wxId) {
    if (!wxId) return;
    navigator.clipboard.writeText(wxId).then(() => {
      alert(`✅ 专柜专属客服微信号【${wxId}】已复制到剪贴板，打开微信添加好友即可直接沟通！`);
    });
  };

  window.toggleCraftArchive = function () {
    const panel = document.getElementById('brand-craft-archive-panel');
    const arrow = document.getElementById('craft-toggle-arrow');
    if (!panel) return;
    const isHidden = panel.classList.toggle('hidden');
    if (arrow) arrow.innerText = isHidden ? '▼' : '▲';
  };

  window.onSearchCounterKeyword = function (val) {
    mallState.counterSearchKeyword = (val || '').trim().toLowerCase();
    renderDigitalCountersGrid();
  };

  window.filterCounterType = function (type) {
    mallState.counterTypeFilter = type;
    document.querySelectorAll('.counter-type-chip').forEach((btn) => {
      const active = btn.dataset.ctype === type;
      btn.className = active
        ? 'counter-type-chip bg-[#1b4332] text-white px-3 py-1 rounded-xl font-bold transition'
        : 'counter-type-chip bg-white border border-stone-200 text-stone-700 hover:border-emerald-700 px-3 py-1 rounded-xl font-bold transition';
    });
    renderDigitalCountersGrid();
  };

  window.filterMallCategory = function (catName) {
    mallState.currentCategoryFilter = catName;
    document.querySelectorAll('.mall-cat-chip').forEach((b) => {
      const isMatch = (catName === 'all' && b.innerText.includes('全部精选')) || b.innerText.trim() === catName;
      b.className = isMatch
        ? 'mall-cat-chip bg-amber-400 text-stone-950 px-3 py-1 rounded-xl font-bold transition'
        : 'mall-cat-chip bg-white border border-stone-200 text-stone-700 hover:border-emerald-700 px-3 py-1 rounded-xl font-bold transition';
    });
    renderGoodsGrid();
  };

  window.onSearchMallKeyword = function (val) {
    mallState.currentKeywordFilter = (val || '').trim().toLowerCase();
    updateMatchedTenantShortcut();
    renderGoodsGrid();
  };

  window.openProductDetail = function (prodId) {
    const p = mallState.allProducts.find((x) => x.id === prodId);
    if (!p) return;

    const tenant = mallState.allTenants.find((t) => t.tenant_id === p.tenant_id);
    const tenantName = tenant ? tenant.company_name : p.tenant_id;
    const priceInfo = calcMallOnlinePrice(p, 1);

    document.getElementById('detail-prod-img').innerHTML = p.image_url
      ? `<img src="${p.image_url}" class="w-full h-full object-cover">`
      : '<span class="text-stone-400 text-xs">源头良品封装</span>';
    document.getElementById('detail-prod-name').innerText = p.name;
    document.getElementById('detail-prod-price').innerText = priceInfo.hasDiscount
      ? `¥${priceInfo.unitPrice} (原价 ¥${priceInfo.basePrice})`
      : `¥${priceInfo.unitPrice}`;
    document.getElementById('detail-prod-spec').innerText = `${p.spec || '整装'} · ${p.measure_unit || '件'}装`;
    document.getElementById('detail-prod-tenant').innerText = tenantName;
    document.getElementById('detail-prod-origin').innerText = p.origin_place || '源头合作社/工坊原产';
    document.getElementById('detail-prod-desc').innerText =
      p.custom_specs?.summary || p.description || p.handover_note || '产区直发，阳光工价，支持实名保真溯源验真。';

    const tierBox = document.getElementById('detail-tier-prices');
    if (priceInfo.bulkUnitPrice > 0) {
      tierBox.innerHTML = `
        <b class="text-amber-900 block mb-1">📊 网上专柜集采阶梯惠价：</b>
        <div class="grid grid-cols-2 gap-1.5 text-center font-mono">
          <div class="bg-white p-1.5 rounded-lg border border-amber-200"><span class="text-[9px] text-stone-400 block">1~${priceInfo.bulkQty - 1}件零售价</span><b>¥${priceInfo.unitPrice}</b></div>
          <div class="bg-white p-1.5 rounded-lg border border-amber-200"><span class="text-[9px] text-stone-400 block">满${priceInfo.bulkQty}件集采惠价</span><b class="text-emerald-800">¥${priceInfo.bulkUnitPrice}</b></div>
        </div>
      `;
      tierBox.classList.remove('hidden');
    } else {
      tierBox.classList.add('hidden');
    }

    const attrsBox = document.getElementById('detail-custom-attrs');
    const customAttrs =
      p.custom_specs && typeof p.custom_specs === 'object' && p.custom_specs.attrs
        ? p.custom_specs.attrs
        : p.custom_attributes && typeof p.custom_attributes === 'object'
        ? p.custom_attributes
        : {};
    const entries = Object.entries(customAttrs);
    if (entries.length > 0) {
      attrsBox.innerHTML = entries
        .map(
          ([k, v]) => `
          <div class="flex justify-between py-1 border-b border-stone-100 last:border-0">
            <span class="text-stone-400">${k}：</span>
            <b class="text-stone-800">${v}</b>
          </div>
        `
        )
        .join('');
      attrsBox.classList.remove('hidden');
    } else {
      attrsBox.classList.add('hidden');
    }

    document.getElementById('btn-detail-add-cart').onclick = () => {
      window.addToCart(p.id);
      window.closeModal('modal-product-detail');
    };

    document.getElementById('btn-detail-c2b-custom').onclick = () => {
      window.closeModal('modal-product-detail');
      window.openC2BDemandModal(p.name, p.tenant_id);
    };

    window.openModal('modal-product-detail');
  };

  window.viewProductTrace = function (prodId) {
    const p = mallState.allProducts.find((x) => x.id === prodId);
    if (!p) return;

    const tenant = mallState.allTenants.find((t) => t.tenant_id === p.tenant_id);
    document.getElementById('trace-prod-name').innerText = p.name;
    document.getElementById('trace-code').innerText = `${p.trace_code_prefix || 'SHUNDA-QC-'}${p.id}`;
    document.getElementById('trace-tenant-name').innerText = tenant ? tenant.company_name : p.tenant_id;
    document.getElementById('trace-origin').innerText = p.origin_place || '源头合作社/工坊原产';
    document.getElementById('trace-category').innerText = `${p.category_main} ➔ ${p.category_sub || '常规'}`;
    document.getElementById('trace-spec').innerText = `${p.spec || '整装'} / ${p.measure_unit || '件'}`;

    window.openModal('modal-trace');
  };
}
