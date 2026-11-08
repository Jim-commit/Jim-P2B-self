export const ShopTypeManager = {
  types: ['社区超市', '餐饮饭店', '精品商超', '便利小铺', '批发副食'],
  
  icons: {
    '社区超市': '🏪',
    '餐饮饭店': '🍳',
    '精品商超': '🏬',
    '便利小铺': '🏮',
    '批发副食': '📦'
  },

  // 1. 根据店名精准自动识别店型
  autoDetect(storeName) {
    if (!storeName) return '社区超市';
    const name = storeName.toLowerCase();
    if (/饭店|酒店|酒家|菜馆|大排档|烧烤|火锅|餐厅|后厨|食府|小吃|面馆|煲仔/.test(name)) {
      return '餐饮饭店';
    }
    if (/精品|生鲜商超|百货大楼|购物中心|生活超市/.test(name)) {
      return '精品商超';
    }
    if (/便利|小铺|烟酒|小卖部|驿站/.test(name)) {
      return '便利小铺';
    }
    if (/批发|副食|商行|粮油门市/.test(name)) {
      return '批发副食';
    }
    return '社区超市';
  },

  // 2. 自匹配随车便签
  getDynamicNotes(shopType) {
    if (shopType === '餐饮饭店') {
      return ['赶午市早点送', '直接抬进后厨', '货交大厨验收', '带发票或收条'];
    } else if (shopType === '社区超市') {
      return ['送货避开早高峰', '帮忙抬进地库', '备点零钱找零', '随车带6个空筐'];
    } else if (shopType === '便利小铺') {
      return ['傍晚前送达', '放收银台旁边', '备点一元零钱', '外箱勿挤压'];
    }
    return ['整箱包装完好', '随车清点空筐', '查验生产日期', '备好随车单据'];
  },

  // 3. 优惠阶梯价计算 (饭店自动匹配大客户价)
  getEffectivePrice(prod, shopType) {
    if ((shopType === '餐饮饭店' || shopType === '精品商超') && prod.tier_2_price && parseFloat(prod.tier_2_price) > 0) {
      return parseFloat(prod.tier_2_price);
    }
    return parseFloat(prod.tier_1_price || 0);
  }
};
