/**
 * 商道相通 · 柜台收银与积木会员引擎 (storeCounterPos.js)
 * 职责：
 * 1. 万能输入嗅探（标品条码 + HID扫码枪全局捕获 + 动态规则称重条码解析 + 品名*重量散货算价 + Web Bluetooth台秤读数）
 * 2. 确定性促销结算管线（阶梯批零价 -> 会员专享价/会员日 -> 满减/买赠 -> 自定义抹零 -> 自动攒星）
 * 3. 高频收银工具（暂存挂单/外送单、大额防呆、60秒快捷撤回、语音播报、退货冲抵、58mm/电子小票、防掉包收款码）
 * 4. 熟客与积木式会员核销（赊账消账、微信礼貌对账单、储值卡、计次卡、周期配送、老带新、押金载具寄存）
 */
(function (global) {
  'use strict';

  const StoreCounterPos = {
    cart: [],                 // [{ lineId, itemId, name, unitPrice, qty, weight, isWeigh, subtotal, gift }]
    currentMemberId: '',
    manualAmount: 0,
    lastSaleEvent: null,
    hidBuffer: '',
    hidTimer: null,

    init() {
      this.bindGlobalHidScanner();
    },

    getVault() {
      return global.StoreLocalVault;
    },

    // 全局 HID 有线/蓝牙扫码枪监听（光标不在输入框也能直接连扫）
    bindGlobalHidScanner() {
      document.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.key === 'Enter') {
          if (this.hidBuffer.length >= 4) {
            const code = this.hidBuffer.trim();
            this.hidBuffer = '';
            this.handleUniversalInput(code);
          } else {
            this.hidBuffer = '';
          }
          return;
        }
        if (e.key && e.key.length === 1) {
          this.hidBuffer += e.key;
          clearTimeout(this.hidTimer);
          this.hidTimer = setTimeout(() => { this.hidBuffer = ''; }, 120);
        }
      });
    },

    // 播放清脆提示音
    playBeep(freq = 880) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, 90);
      } catch (_) {}
    },

    // 收款成功语音播报
    speakAmount(payLabel, amount) {
      const policy = this.getVault().getPolicy();
      if (!policy.posSafety.voiceBroadcast || !('speechSynthesis' in window)) return;
      try {
        const utter = new SpeechSynthesisUtterance(`${payLabel}收款${Number(amount).toFixed(2)}元`);
        utter.lang = 'zh-CN';
        utter.rate = 1.05;
        window.speechSynthesis.speak(utter);
      } catch (_) {}
    },

    // 动态规则称重条码解析器（兼容 20~29 前缀及自定义配置码制）
    parseWeighBarcode(code) {
      const hw = this.getVault().getPolicy().hardware;
      const clean = String(code || '').trim();
      if (clean.length !== hw.weighBarcodeLength) return null;
      const prefix = clean.slice(0, 2);
      if (!hw.weighBarcodePrefixes.includes(prefix)) return null;

      const plu = clean.slice(hw.pluStart, hw.pluStart + hw.pluLength).replace(/^0+/, '') || '0';
      const rawVal = Number(clean.slice(hw.valueStart, hw.valueStart + hw.valueLength)) || 0;
      const parsedVal = rawVal / (hw.valueDivisor || 100);
      return { plu, mode: hw.valueMode, value: parsedVal, rawCode: clean };
    },

    // 万能输入框嗅探器：自动识别 称重条码 / 标品条码 / 品名*重量散货 / 纯数字金额
    handleUniversalInput(rawInput) {
      const input = String(rawInput || '').trim();
      if (!input) return { status: 'empty' };
      const catalog = Object.values(this.getVault().activeStoreData.catalog || {}).filter((i) => !i.archived);

      // 1. 嗅探动态规则称重条码（来自条码秤或称重收银一体机标签）
      const weighParsed = this.parseWeighBarcode(input);
      if (weighParsed) {
        const matched = catalog.find((i) => String(i.plu || '').replace(/^0+/, '') === weighParsed.plu);
        const unitPrice = matched ? Number(matched.retailPrice || 0) : 0;
        let weight = 1;
        let subtotal = weighParsed.value;
        if (weighParsed.mode === 'weight') {
          weight = weighParsed.value;
          subtotal = Number((weight * unitPrice).toFixed(2));
        } else if (unitPrice > 0) {
          weight = Number((subtotal / unitPrice).toFixed(3));
        }
        this.addCartLine({
          itemId: matched ? matched.id : `plu_${weighParsed.plu}`,
          name: matched ? matched.name : `散称商品#${weighParsed.plu}`,
          unitPrice,
          qty: 1,
          weight,
          isWeigh: true,
          subtotal
        });
        this.playBeep(960);
        return { status: 'matched-weigh', matched };
      }

      // 2. 嗅探散货快捷输入格式：品名*重量 或 PLU*重量（如 "鸡蛋*2.5"）
      if (input.includes('*')) {
        const [kw, wStr] = input.split('*');
        const weight = parseFloat(wStr);
        if (kw && !isNaN(weight) && weight > 0) {
          const matched = catalog.find((i) => i.name.includes(kw.trim()) || String(i.plu) === kw.trim());
          if (matched) {
            const unitPrice = Number(matched.retailPrice || 0);
            this.addCartLine({
              itemId: matched.id,
              name: matched.name,
              unitPrice,
              qty: 1,
              weight,
              isWeigh: true,
              subtotal: Number((unitPrice * weight).toFixed(2))
            });
            this.playBeep(920);
            return { status: 'matched-weigh-manual', matched };
          }
        }
      }

      // 3. 嗅探常规标品条码（精确匹配）
      const byBarcode = catalog.find((i) => String(i.barcode || '') === input);
      if (byBarcode) {
        this.addCartLine({
          itemId: byBarcode.id,
          name: byBarcode.name,
          unitPrice: Number(byBarcode.retailPrice || 0),
          qty: 1,
          weight: 0,
          isWeigh: false,
          subtotal: Number(byBarcode.retailPrice || 0)
        });
        this.playBeep(880);
        return { status: 'matched-barcode', item: byBarcode };
      }

      // 4. 若为 6~14 位未建档纯数字条码 -> 触发内置快速建档抽屉（绝不使用原生 prompt）
      if (/^\d{6,14}$/.test(input)) {
        window.dispatchEvent(new CustomEvent('sdxt:unknown-barcode', { detail: { barcode: input } }));
        return { status: 'unknown-barcode', barcode: input };
      }

      // 5. 关键词模糊检索
      const fuzzy = catalog.filter((i) => i.name.includes(input));
      return { status: 'fuzzy-list', list: fuzzy };
    },

    // Web Bluetooth 蓝牙电子秤直连读取重量（标准 GATT 串口/Weight Scale 兼容）
    async connectBluetoothScale(onWeightRead) {
      if (!navigator.bluetooth) throw new Error('当前浏览器不支持蓝牙直连，可使用散货快捷算价');
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [0x181d, '0000ffe0-0000-1000-8000-00805f9b34fb']
      });
      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      for (const svc of services) {
        const chars = await svc.getCharacteristics();
        for (const ch of chars) {
          if (ch.properties.notify) {
            await ch.startNotifications();
            ch.addEventListener('characteristicvaluechanged', (e) => {
              const txt = new TextDecoder().decode(e.target.value);
              const m = txt.match(/(\d+\.\d+|\d+)/);
              if (m && typeof onWeightRead === 'function') onWeightRead(parseFloat(m[1]));
            });
            return device.name || '蓝牙电子秤';
          }
        }
      }
      throw new Error('未识别到电子秤数据特征通道');
    },

    addCartLine(line) {
      if (!line.isWeigh) {
        const existing = this.cart.find((c) => c.itemId === line.itemId && !c.isWeigh && !c.gift);
        if (existing) {
          existing.qty += line.qty || 1;
          this.recalculate();
          return;
        }
      }
      this.cart.push({
        lineId: 'ln_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        ...line
      });
      this.recalculate();
    },

    // 确定性促销与价格结算管线（零硬编码）
    recalculate() {
      const vault = this.getVault();
      const policy = vault.getPolicy();
      const catalog = vault.activeStoreData.catalog || {};
      const member = this.currentMemberId ? vault.activeStoreData.members[this.currentMemberId] : null;
      const blocks = policy.loyaltyBlocks;

      // 判断今天是否为设定的会员日
      const now = new Date();
      const isMemberDay = blocks.memberPriceAndDay.enabled && (
        (blocks.memberPriceAndDay.memberDaysOfWeek || []).includes(now.getDay()) ||
        (blocks.memberPriceAndDay.memberDaysOfMonth || []).includes(now.getDate())
      );

      let rawTotal = 0;
      let memberSaved = 0;

      this.cart.forEach((line) => {
        if (line.gift) {
          line.subtotal = 0;
          return;
        }
        const item = catalog[line.itemId];
        if (!item) {
          rawTotal += Number(line.subtotal || 0);
          return;
        }

        // 1. 匹配阶梯批发价（如满5件单价更低）
        let effectiveUnit = Number(item.retailPrice || 0);
        if (!line.isWeigh && Array.isArray(item.tierPrices)) {
          const sortedTiers = [...item.tierPrices].sort((a, b) => b.minQty - a.minQty);
          const hitTier = sortedTiers.find((t) => line.qty >= Number(t.minQty));
          if (hitTier) effectiveUnit = Number(hitTier.price);
        }

        const baseLine = line.isWeigh ? Number(line.subtotal || 0) : Number((effectiveUnit * line.qty).toFixed(2));
        rawTotal += baseLine;

        // 2. 匹配会员专享价 / 会员日折扣
        let finalUnit = effectiveUnit;
        if (blocks.memberPriceAndDay.enabled && member) {
          if (Number(item.memberPrice) > 0 && Number(item.memberPrice) < finalUnit) {
            finalUnit = Number(item.memberPrice);
          } else if (isMemberDay && Number(blocks.memberPriceAndDay.memberDayDiscountPct) > 0) {
            finalUnit = Number((finalUnit * (blocks.memberPriceAndDay.memberDayDiscountPct / 100)).toFixed(2));
          }
        }
        line.appliedUnitPrice = finalUnit;
        line.subtotal = line.isWeigh
          ? (finalUnit !== effectiveUnit && effectiveUnit > 0 ? Number((baseLine * (finalUnit / effectiveUnit)).toFixed(2)) : baseLine)
          : Number((finalUnit * line.qty).toFixed(2));
        memberSaved += Math.max(0, baseLine - line.subtotal);
      });

      const subTotal = this.cart.reduce((s, l) => s + Number(l.subtotal || 0), 0) + Number(this.manualAmount || 0);

      // 3. 匹配满减促销
      let fullReductionSaved = 0;
      let matchedGift = '';
      if (blocks.fullReductionAndGift.enabled && Array.isArray(blocks.fullReductionAndGift.rules)) {
        const sortedRules = [...blocks.fullReductionAndGift.rules].sort((a, b) => b.minAmount - a.minAmount);
        const hitRule = sortedRules.find((r) => subTotal >= Number(r.minAmount));
        if (hitRule) {
          fullReductionSaved = Number(hitRule.minusAmount || 0);
          matchedGift = hitRule.giftName || '';
        }
      }

      let payable = Math.max(0, subTotal - fullReductionSaved);

      // 4. 应用自定义抹零精度
      const rMode = policy.pricing.roundingMode;
      if (rMode === 'yuan') payable = Math.floor(payable);
      else if (rMode === 'jiao') payable = Math.floor(payable * 10) / 10;
      payable = Number(payable.toFixed(2));

      // 5. 预计新增攒星数
      const earnedStars = (blocks.stampReward.enabled && member && blocks.stampReward.amountPerStar > 0)
        ? Math.floor(payable / Number(blocks.stampReward.amountPerStar))
        : 0;

      return {
        rawTotal: Number(rawTotal.toFixed(2)),
        memberSaved: Number(memberSaved.toFixed(2)),
        fullReductionSaved: Number(fullReductionSaved.toFixed(2)),
        matchedGift,
        payable,
        earnedStars,
        isMemberDay
      };
    },

    // 完成收款入账（支持大额防呆检测、扣库存、更新会员余额/攒星/赊账、语音播报）
    async checkout({ payMethod = 'wechat', actualPaid, skipLargeAlert = false, note = '' }) {
      const vault = this.getVault();
      const policy = vault.getPolicy();
      const summary = this.recalculate();
      const finalAmount = actualPaid !== undefined ? Number(actualPaid) : summary.payable;

      if (finalAmount <= 0 && this.cart.length === 0) {
        throw new Error('请先扫码或输入收款金额');
      }

      // 大额收银防呆确认拦截
      const alertThreshold = Number(policy.posSafety.largeAmountAlert || 0);
      if (!skipLargeAlert && alertThreshold > 0 && finalAmount >= alertThreshold) {
        return { needConfirmLarge: true, amount: finalAmount };
      }

      const member = this.currentMemberId ? vault.activeStoreData.members[this.currentMemberId] : null;
      if (payMethod === 'balance') {
        if (!member) throw new Error('请先选择会员再使用储值余额扣款');
        if (Number(member.balance || 0) < finalAmount) throw new Error(`会员余额不足（当前 ¥${Number(member.balance || 0).toFixed(2)}）`);
        member.balance = Number((Number(member.balance) - finalAmount).toFixed(2));
        member.updatedAt = Date.now();
      } else if (payMethod === 'credit') {
        if (!member) throw new Error('赊账挂账需先选择或登记熟客');
        member.creditDebt = Number((Number(member.creditDebt || 0) + finalAmount).toFixed(2));
        member.updatedAt = Date.now();
      }

      // 扣减本地商品库存
      const catalog = vault.activeStoreData.catalog || {};
      this.cart.forEach((line) => {
        const item = catalog[line.itemId];
        if (item) {
          const deduct = line.isWeigh ? Number(line.weight || 0) : Number(line.qty || 1);
          item.stock = Number((Number(item.stock || 0) - deduct).toFixed(3));
        }
      });

      // 累计会员攒星
      if (member && summary.earnedStars > 0) {
        member.stars = Number(member.stars || 0) + summary.earnedStars;
        member.updatedAt = Date.now();
      }

      const evt = await vault.appendEvent({
        type: 'sale',
        amount: finalAmount,
        payMethod,
        items: JSON.parse(JSON.stringify(this.cart)),
        memberId: member ? member.id : '',
        memberName: member ? member.name : '',
        note: note || (summary.matchedGift ? `赠:${summary.matchedGift}` : '')
      });

      this.lastSaleEvent = evt;
      this.cart = [];
      this.manualAmount = 0;
      this.currentMemberId = '';

      const payNames = { wechat: '微信', alipay: '支付宝', cash: '现金', balance: '会员卡', credit: '熟客挂账' };
      this.speakAmount(payNames[payMethod] || '', finalAmount);
      return { ok: true, event: evt };
    },

    // 60秒内快捷撤回刚收错的那一笔
    async undoLastSale() {
      if (!this.lastSaleEvent) throw new Error('暂无可撤回的近期收款');
      const windowMs = (this.getVault().getPolicy().posSafety.undoWindowSec || 60) * 1000;
      if (Date.now() - this.lastSaleEvent.ts > windowMs) {
        throw new Error('已超过快捷撤回时限，请走顾客退货退款流程');
      }
      const vault = this.getVault();
      const target = vault.activeStoreData.txEvents.find((e) => e.eventId === this.lastSaleEvent.eventId);
      if (!target || target.voided) throw new Error('该单据已撤回');

      target.voided = true;
      // 回滚库存
      const catalog = vault.activeStoreData.catalog || {};
      (target.items || []).forEach((line) => {
        const item = catalog[line.itemId];
        if (item) {
          const restore = line.isWeigh ? Number(line.weight || 0) : Number(line.qty || 1);
          item.stock = Number((Number(item.stock || 0) + restore).toFixed(3));
        }
      });
      // 回滚会员余额/赊账
      if (target.memberId && vault.activeStoreData.members[target.memberId]) {
        const m = vault.activeStoreData.members[target.memberId];
        if (target.payMethod === 'balance') m.balance = Number((Number(m.balance || 0) + Number(target.amount)).toFixed(2));
        if (target.payMethod === 'credit') m.creditDebt = Math.max(0, Number((Number(m.creditDebt || 0) - Number(target.amount)).toFixed(2)));
      }
      await vault.persistStore();
      this.lastSaleEvent = null;
      return true;
    },

    // 暂存挂单 & 微信/电话外送单
    async holdCurrentOrder(tagLabel = '', isDelivery = false) {
      if (this.cart.length === 0 && this.manualAmount <= 0) throw new Error('当前篮子为空');
      const vault = this.getVault();
      vault.activeStoreData.heldOrders.push({
        holdId: 'hold_' + Date.now().toString(36),
        tagLabel: tagLabel || (isDelivery ? '外送单' : `挂单#${vault.activeStoreData.heldOrders.length + 1}`),
        isDelivery,
        createdAt: Date.now(),
        cart: JSON.parse(JSON.stringify(this.cart)),
        manualAmount: this.manualAmount,
        memberId: this.currentMemberId
      });
      this.cart = [];
      this.manualAmount = 0;
      this.currentMemberId = '';
      await vault.persistStore();
    },

    async resumeHeldOrder(holdId) {
      const vault = this.getVault();
      const idx = vault.activeStoreData.heldOrders.findIndex((h) => h.holdId === holdId);
      if (idx < 0) return false;
      const [held] = vault.activeStoreData.heldOrders.splice(idx, 1);
      this.cart = held.cart || [];
      this.manualAmount = held.manualAmount || 0;
      this.currentMemberId = held.memberId || '';
      await vault.persistStore();
      return true;
    },

    // 顾客退货退款冲抵（需具备 refund 权限）
    async processRefund({ itemId, qty = 1, refundAmount, refundMethod = 'cash', note = '' }) {
      const vault = this.getVault();
      if (!vault.hasPerm('refund')) throw new Error('当前视角无退货退款权限');
      const item = itemId ? vault.activeStoreData.catalog[itemId] : null;
      if (item) {
        item.stock = Number((Number(item.stock || 0) + Number(qty)).toFixed(3));
      }
      return await vault.appendEvent({
        type: 'refund',
        amount: -Math.abs(Number(refundAmount || 0)),
        payMethod: refundMethod,
        items: item ? [{ itemId: item.id, name: item.name, qty, subtotal: -Math.abs(Number(refundAmount || 0)) }] : [],
        note: note || '顾客退货退款'
      });
    },

    // 熟客与积木式会员核销操作（储值充送/次卡核销/攒星兑礼/押金寄存/生成礼貌对账单）
    async upsertMember(payload) {
      const vault = this.getVault();
      const id = payload.id || 'mem_' + Date.now().toString(36);
      const existing = vault.activeStoreData.members[id] || {
        id, name: '', phone: '', creditDebt: 0, balance: 0, stars: 0, punchCards: [], subscriptions: [], deposits: [], referrerId: ''
      };
      vault.activeStoreData.members[id] = { ...existing, ...payload, id, updatedAt: Date.now() };
      await vault.persistStore();
      return vault.activeStoreData.members[id];
    },

    async settleCreditDebt(memberId, payAmount, payMethod = 'wechat') {
      const vault = this.getVault();
      const m = vault.activeStoreData.members[memberId];
      if (!m) throw new Error('未找到该熟客档案');
      const amt = Math.min(Number(m.creditDebt || 0), Number(payAmount || 0));
      m.creditDebt = Number((Number(m.creditDebt || 0) - amt).toFixed(2));
      m.updatedAt = Date.now();
      await vault.appendEvent({
        type: 'credit_pay',
        amount: amt,
        payMethod,
        memberId: m.id,
        memberName: m.name,
        note: `熟客还账（剩余欠款 ¥${m.creditDebt.toFixed(2)}）`
      });
      return m.creditDebt;
    },

    buildPoliteWechatStatement(memberId) {
      const vault = this.getVault();
      const m = vault.activeStoreData.members[memberId];
      if (!m) return '';
      const storeName = vault.activeStoreData.storeName;
      const recentDebts = vault.activeStoreData.txEvents
        .filter((e) => !e.voided && e.memberId === memberId && e.type === 'sale' && e.payMethod === 'credit')
        .slice(-5)
        .map((e) => `· ${new Date(e.ts).toLocaleDateString()} 消费 ¥${Number(e.amount).toFixed(2)}`)
        .join('\n');
      return `${m.name}您好，咱们【${storeName}】近期往来明细核对：\n${recentDebts || '· 历史往来累计'}\n当前待结合计：¥${Number(m.creditDebt || 0).toFixed(2)}，您方便时核对一下~`;
    },

    // 生成 58mm 热敏小票 / 电子收据打印视图
    printReceipt(eventObj) {
      const vault = this.getVault();
      const policy = vault.getPolicy();
      const header = policy.posSafety.receiptHeader || vault.activeStoreData.storeName;
      const lines = (eventObj.items || []).map((i) =>
        `<div style="display:flex;justify-content:space-between;margin:3px 0;"><span>${i.name}${i.isWeigh ? ` (${i.weight}斤)` : ` x${i.qty}`}</span><span>¥${Number(i.subtotal).toFixed(2)}</span></div>`
      ).join('');
      const win = window.open('', '_blank', 'width=320,height=520');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>小票凭证</title></head>
        <body style="font-family:monospace;width:54mm;margin:0 auto;padding:8px;font-size:12px;">
        <div style="text-align:center;font-weight:bold;font-size:15px;">${header}</div>
        <div style="text-align:center;font-size:11px;margin:4px 0 8px;">${new Date(eventObj.ts).toLocaleString()}</div>
        <hr style="border:none;border-top:1px dashed #000;"/>
        ${lines || '<div>快捷收款</div>'}
        <hr style="border:none;border-top:1px dashed #000;"/>
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;"><span>实付合计</span><span>¥${Number(eventObj.amount).toFixed(2)}</span></div>
        <div style="font-size:11px;margin-top:6px;">收银员：${eventObj.staffName || '当班'}</div>
        <div style="text-align:center;font-size:11px;margin-top:10px;">${policy.posSafety.receiptFooter}</div>
        <script>window.onload=function(){window.print();}</script></body></html>`);
      win.document.close();
    }
  };

  global.StoreCounterPos = StoreCounterPos;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => StoreCounterPos.init());
  } else {
    StoreCounterPos.init();
  }
})(window);
