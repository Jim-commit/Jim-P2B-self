export const ShopTypeManager = {
  // 兼容历史命名与百工百业全行业图标映射
  icons: {
    '社区便利': '🏪',
    '社区超市': '🏪',
    '便利小铺': '🏮',
    '餐饮饭庄': '🍳',
    '餐饮饭店': '🍳',
    '精品商超': '🏬',
    '批发副食': '📦',
    '五金机电': '🛠️',
    '汽修配件': '🚗',
    '农资农具': '🌾',
    '医药日化': '💊',
    '文体劳保': '📚'
  },

  // 预设百工百业常见业态清单（用于动态渲染下拉框）
  presets: [
    { key: '社区便利', icon: '🏪', desc: '整箱快走 · 邻里常顾' },
    { key: '餐饮饭庄', icon: '🍳', desc: '良材优选 · 大宗特价' },
    { key: '精品商超', icon: '🏬', desc: '名品保真 · 丰俭由人' },
    { key: '五金机电', icon: '🛠️', desc: '规格齐全 · 工地急配' },
    { key: '汽修配件', icon: '🚗', desc: '原厂适配 · 随叫随到' },
    { key: '农资农具', icon: '🌾', desc: '不误农时 · 整车直达' },
    { key: '医药日化', icon: '💊', desc: '批号可溯 · 效期严格' },
    { key: '文体劳保', icon: '📚', desc: '常备库存 · 整件批发' }
  ],

  // 根据店招名称自动识别所属行当
  autoDetect(storeName) {
    if (!storeName) return '社区便利';
    const name = storeName.toLowerCase();
    if (/五金|机电|建材|水暖|电料|管业|涂料|门窗|灯饰/.test(name)) return '五金机电';
    if (/汽修|汽配|保养|轮胎|机油|车行|维修|洗车/.test(name)) return '汽修配件';
    if (/农资|种子|化肥|农药|农机|饲料|兽药|果蔬基地/.test(name)) return '农资农具';
    if (/药店|医药|保健|日化|洗护|美妆|母婴|养生/.test(name)) return '医药日化';
    if (/文体|办公|文具|劳保|印刷|包装|耗材/.test(name)) return '文体劳保';
    if (/饭店|酒店|酒家|菜馆|大排档|烧烤|火锅|餐厅|后厨|食府|小吃|面馆|食堂/.test(name)) return '餐饮饭庄';
    if (/精品|生鲜商超|百货大楼|购物中心|生活超市|大卖场/.test(name)) return '精品商超';
    if (/批发|副食|商行|粮油门市/.test(name)) return '批发副食';
    return '社区便利';
  },

  // 智能匹配各行当最实用的随车捎话口信
  getDynamicNotes(shopType) {
    if (shopType === '餐饮饭庄' || shopType === '餐饮饭店') {
      return ['赶午市早点送', '直接抬进后厨', '货交大厨验收', '随车带好收条'];
    }
    if (shopType === '五金机电') {
      return ['卸到卷帘门内', '急用件优先装车', '带齐随货明细单', '注意防潮勿淋雨'];
    }
    if (shopType === '汽修配件') {
      return ['急修件请优先送', '有旧件/空油桶带回', '核对型号与规格', '放维修工位旁'];
    }
    if (shopType === '农资农具') {
      return ['直接送到田头/仓库', '农忙急用请准点', '核对批次与数量', '大件需帮搭把手'];
    }
    if (shopType === '医药日化') {
      return ['查验生产批号效期', '外箱勿挤压变形', '防晒阴凉处交接', '随货附质检单据'];
    }
    if (shopType === '文体劳保') {
      return ['整件码放库房', '按清单逐箱点验', '需开具正规凭证', '送前提前10分钟电联'];
    }
    if (shopType === '社区便利' || shopType === '社区超市' || shopType === '便利小铺') {
      return ['送货避开早高峰', '帮忙抬进地库', '备点零钱找零', '随车带6个空筐'];
    }
    // 自定义业态通用百业实用口信
    return ['送前提前电联', '按清单逐件点验', '包装完好勿挤压', '备好随车交接单'];
  },

  // 自动适配大宗/协议批发价与标准供货价
  getEffectivePrice(prod, shopType) {
    const bulkTypes = ['餐饮饭庄', '餐饮饭店', '精品商超', '批发副食', '五金机电', '农资农具'];
    if (bulkTypes.includes(shopType) && prod.tier_2_price && parseFloat(prod.tier_2_price) > 0) {
      return parseFloat(prod.tier_2_price);
    }
    return parseFloat(prod.tier_1_price || 0);
  }
};
