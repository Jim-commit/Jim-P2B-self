// src/modules/tools.js - 掌柜实用百宝箱与提货小本交互逻辑
import { supabase, currentTenant } from '../lib/supabase.js';
import { sendWechatNotice } from '../lib/notify.js';

let cratesInStore = parseInt(localStorage.getItem('crates_count') || '6');

// 通用弹窗显隐
window.openModal = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
};

window.closeModal = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
};

// 缺货捎话登记
window.submitDemandRequest = function() {
  const name = document.getElementById('demand-input-name').value.trim();
  const qty = document.getElementById('demand-input-qty').value.trim();
  if (!name) return alert('烦请写一下想找的货品名字！');
  
  sendWechatNotice(`📝 缺货登记：${name}`, `门店：利民平价便利店\n商品：${name} (${qty || '按箱进'})\n[👉 打开总代中台查验](https://goods-lucky.vercel.app/hq.html?tenant=${currentTenant})`);
  alert(`已转告老张师傅与库房！一旦调到现货，老张师傅第一时间随车捎来。`);
  window.closeModal('demand-request-modal');
};

// 周转筐备忘
window.changeCrates = function(delta) {
  cratesInStore += delta;
  if (cratesInStore < 0) cratesInStore = 0;
  localStorage.setItem('crates_count', cratesInStore);
  const countEl = document.getElementById('crates-count');
  if (countEl) countEl.innerText = `${cratesInStore} 个`;
};

// 毛利速算器运算
window.runMarginCalc = function() {
  const cost = parseFloat(document.getElementById('calc-case-cost').value) || 0;
  const qty = parseInt(document.getElementById('calc-case-qty').value) || 1;
  const retail = parseFloat(document.getElementById('calc-retail-price').value) || 0;
  const unit = cost / qty;
  const profit = retail - unit;
  const margin = retail > 0 ? (profit / retail) * 100 : 0;
  
  document.getElementById('calc-unit-cost').innerText = `¥${unit.toFixed(2)} / 件`;
  document.getElementById('calc-profit-unit').innerText = `¥${profit.toFixed(2)}`;
  document.getElementById('calc-margin-rate').innerText = `${margin.toFixed(1)}%`;
};

// 往期对账查询
window.showHistoryStatements = async function() {
  window.closeStoreMenu();
  window.openModal('statements-modal');
  const listContainer = document.getElementById('statements-list');
  
  const { data: historyOrders } = await supabase
    .from('orders')
    .select('*')
    .order('id', { ascending: false })
    .limit(6);

  if (!historyOrders || historyOrders.length === 0) {
    listContainer.innerHTML = '<div class="p-6 text-center text-stone-400 text-xs">店里暂无往来对账单据</div>';
    return;
  }

  listContainer.innerHTML = historyOrders.map(o => `
    <div class="p-3 bg-stone-50 border border-stone-200/80 rounded-2xl space-y-1">
      <div class="flex justify-between items-center">
        <span class="font-bold text-stone-800 font-mono text-xs">单号: ${o.order_no}</span>
        <span class="text-[10px] px-2 py-0.5 rounded font-bold ${o.pay_status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
          ${o.pay_status === 'PAID' ? '已结清' : '挂账中'}
        </span>
      </div>
      <div class="flex justify-between text-stone-500 text-[11px]">
        <span>送货时间: ${new Date(o.created_at).toLocaleDateString()}</span>
        <span>实收金额: <b class="text-emerald-800 font-mono font-bold">¥${o.actual_amount || o.total_amount}</b></span>
      </div>
      ${o.reject_reason ? `<div class="text-[10px] text-stone-400 pt-0.5 border-t border-stone-100 mt-1">备注凭证: ${o.reject_reason}</div>` : ''}
    </div>
  `).join('');
};

// 方案 B：邻里提货与核销状态切换
window.togglePickup = function(el) {
  const icon = el.querySelector('.status-icon');
  const name = el.querySelector('.font-bold');
  const tag = el.querySelector('.status-tag');
  
  const isDone = icon.classList.contains('bg-emerald-600');
  if (isDone) {
    icon.className = 'status-icon w-4 h-4 rounded-full border border-stone-300 flex items-center justify-center text-[10px] text-transparent';
    name.classList.remove('line-through', 'opacity-60');
    tag.className = 'status-tag text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded font-medium';
    tag.innerText = '待来店取';
    el.className = 'flex justify-between items-center p-2.5 bg-stone-50 rounded-2xl border border-stone-100 hover:bg-emerald-50/50 transition cursor-pointer';
  } else {
    icon.className = 'status-icon w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]';
    name.classList.add('line-through', 'opacity-60');
    tag.className = 'status-tag text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium';
    tag.innerText = '已提走付清';
    el.className = 'flex justify-between items-center p-2.5 bg-emerald-50/40 rounded-2xl border border-emerald-100 cursor-pointer';
  }
};

// 方案 B：添加邻里提货条目
window.addPickupNote = function() {
  const name = prompt('输入邻居房号或称呼（例：301王阿姨）：');
  if (!name) return;
  const list = document.getElementById('pickup-note-list');
  const div = document.createElement('div');
  div.className = 'flex justify-between items-center p-2.5 bg-stone-50 rounded-2xl border border-stone-100 hover:bg-emerald-50/50 transition cursor-pointer';
  div.onclick = function() { window.togglePickup(this); };
  div.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="status-icon w-4 h-4 rounded-full border border-stone-300 flex items-center justify-center text-[10px] text-transparent">✓</span>
      <span class="font-bold text-stone-800">${name}</span>
      <span class="text-stone-400">· 1桶</span>
    </div>
    <span class="status-tag text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded font-medium">待来店取</span>
  `;
  list.appendChild(div);
};
