const urlParams = new URLSearchParams(window.location.search);
const rawTenantParam = urlParams.get('t') || urlParams.get('tenant');

export const CART_STORAGE_KEY = 'baigong_mall_cart_v1';
export const LAST_CUST_KEY = 'baigong_mall_last_cust_v1';
export const JOINED_DEMANDS_KEY = 'baigong_c2b_joined_ids_v1';

export const mallState = {
  currentTenantParam: rawTenantParam ? rawTenantParam.trim().toUpperCase() : null,
  refStoreParam: urlParams.get('ref') || null,
  allProducts: [],
  allTenants: [],
  allCategories: [],
  allDemands: [],
  allReviews: [],
  pickupStores: [],
  currentMarketMode: 'b2c',
  currentCategoryFilter: 'all',
  currentKeywordFilter: '',
  counterSearchKeyword: '',
  counterTypeFilter: 'all',
  selectedPickupStoreId: '',
  referrerStoreObj: null,
  cart: []
};

export function computePickupPin(order) {
  const seed = String(order?.order_no || order?.id || '1000');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 9000;
  }
  return String(1000 + Math.abs(hash));
}

export function calcMallOnlinePrice(prod, qty = 1) {
  const tenant = mallState.allTenants.find((t) => t.tenant_id === prod.tenant_id) || {};
  const settings = tenant.custom_settings && typeof tenant.custom_settings === 'object' ? tenant.custom_settings : {};
  const onlineBase = parseFloat(prod.tier_2_price || prod.tier_1_price || 0);

  if (settings.onlinePriceEnabled && Array.isArray(settings.onlineTiers) && settings.onlineTiers.length > 0) {
    const sorted = [...settings.onlineTiers].sort((a, b) => parseInt(a.minQty || 1) - parseInt(b.minQty || 1));
    let matched = sorted[0];
    sorted.forEach((t) => {
      if (qty >= parseInt(t.minQty || 1)) matched = t;
    });
    const nextTier = sorted.find((t) => parseInt(t.minQty || 1) > qty);
    const highestTier = sorted[sorted.length - 1];

    const appliedRate = parseFloat(matched?.rate || 1.0);
    const unitPrice = Number((onlineBase * appliedRate).toFixed(2));
    const bulkQty = parseInt(highestTier?.minQty || 5);
    const bulkRate = parseFloat(highestTier?.rate || 1.0);
    const bulkUnitPrice = bulkRate < 1 ? Number((onlineBase * bulkRate).toFixed(2)) : 0;

    return {
      unitPrice,
      basePrice: onlineBase,
      bulkQty,
      bulkUnitPrice,
      hasDiscount: unitPrice < onlineBase,
      tierLabel: matched?.label || (appliedRate < 1 ? `专柜${(appliedRate * 10).toFixed(1)}折` : '网上平准直供价'),
      nextTierHint: nextTier
        ? `再加 ${parseInt(nextTier.minQty) - qty} 件享 ¥${Number((onlineBase * parseFloat(nextTier.rate || 1)).toFixed(2))}/件`
        : ''
    };
  }

  return {
    unitPrice: onlineBase,
    basePrice: onlineBase,
    bulkQty: 5,
    bulkUnitPrice: 0,
    hasDiscount: false,
    tierLabel: '阳光直供正价',
    nextTierHint: ''
  };
}

export function getEffectiveUnitPrice(prod, qty) {
  return calcMallOnlinePrice(prod, qty).unitPrice;
}

export function getTierLabel(prod, qty) {
  return calcMallOnlinePrice(prod, qty).tierLabel;
}

export function getNextTierHint(prod, qty) {
  return calcMallOnlinePrice(prod, qty).nextTierHint;
}
