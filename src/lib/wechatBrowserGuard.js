export function initWechatBrowserGuide(options = {}) {
  const appName = options.appName || '百工协作工作台';
  const ua = (navigator.userAgent || '').toLowerCase();
  const isWechat = ua.includes('micromessenger');
  if (!isWechat) return;

  const dismissKey = `wx_guide_dismissed_${new Date().toISOString().slice(0, 10)}`;
  if (localStorage.getItem(dismissKey) === '1' && !options.forceShow) return;

  if (document.getElementById('wx-browser-guide-overlay')) return;

  const isIOS = /iphone|ipad|ipod/.test(ua);
  const browserStepText = isIOS
    ? '选择 <b>「在默认浏览器打开」</b> 或 <b>「在 Safari 中打开」</b>'
    : '选择 <b>「在默认浏览器打开」</b>（或 <b>「在浏览器打开」</b>）';
  const addHomeStepText = isIOS
    ? '打开后点底部中间 <b>「分享图标 ⬆️」</b> ➔ <b>「添加到主屏幕」</b>'
    : '打开后点右下角/右上角 <b>「菜单 ≡ / ⋮」</b> ➔ <b>「添加到桌面」</b>';

  const overlay = document.createElement('div');
  overlay.id = 'wx-browser-guide-overlay';
  overlay.className =
    'fixed inset-0 z-[9999] bg-stone-950/90 backdrop-blur-sm text-white flex flex-col justify-between p-6 select-none';

  overlay.innerHTML = `
    <!-- 顶部右上角直指箭头区域 -->
    <div class="flex flex-col items-end pr-2 pt-1">
      <div class="flex items-center gap-2 text-amber-300 animate-bounce">
        <span class="text-sm font-bold bg-amber-500/20 border border-amber-400/50 px-3 py-1 rounded-full">
          请点这里右上角「···」
        </span>
        <svg class="w-10 h-10 text-amber-300" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 38 C 24 34, 32 24, 36 10" />
          <path d="M26 14 L 36 10 L 40 20" />
        </svg>
      </div>
    </div>

    <!-- 中间大字版三步图解卡片 -->
    <div class="bg-stone-900 border border-stone-700 rounded-3xl p-5 max-w-sm mx-auto w-full space-y-4 shadow-2xl">
      <div class="flex items-center gap-2.5 border-b border-stone-800 pb-3">
        <span class="text-2xl">📱</span>
        <div>
          <h3 class="font-bold text-base text-amber-300">把「${appName}」装到手机桌面</h3>
          <p class="text-xs text-stone-400">以后像 App 一样一点秒开，不怕微信聊天刷丢</p>
        </div>
      </div>

      <div class="space-y-3 text-sm leading-relaxed">
        <div class="flex items-start gap-3 bg-stone-950/80 p-3 rounded-2xl border border-stone-800">
          <span class="w-6 h-6 rounded-full bg-amber-400 text-stone-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
          <div>点击手机屏幕右上角的 <b class="text-amber-300 text-base">「···」</b> 按钮</div>
        </div>

        <div class="flex items-start gap-3 bg-stone-950/80 p-3 rounded-2xl border border-stone-800">
          <span class="w-6 h-6 rounded-full bg-emerald-400 text-stone-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
          <div>在弹出菜单中，${browserStepText}</div>
        </div>

        <div class="flex items-start gap-3 bg-stone-950/80 p-3 rounded-2xl border border-stone-800">
          <span class="w-6 h-6 rounded-full bg-sky-400 text-stone-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
          <div>${addHomeStepText}</div>
        </div>
      </div>

      <div class="pt-1 space-y-2">
        <button type="button" id="btn-wx-copy-url"
          class="w-full py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-sm shadow active:scale-95 transition">
          📋 复制链接（去手机浏览器粘贴打开）
        </button>
        <button type="button" id="btn-wx-continue-anyway"
          class="w-full py-2.5 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs transition">
          暂时不装桌面，先在微信里直接用 ➔
        </button>
      </div>
    </div>

    <div class="text-center text-[11px] text-stone-500">
      提示：使用系统浏览器打开，打印单据与拍照上传更顺畅
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('btn-wx-copy-url')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert('✅ 网址已复制！请打开手机自带的「浏览器」或「Safari」，在地址栏粘贴即可打开。');
    } catch {
      prompt('请长按全选复制下方网址，去手机浏览器打开：', window.location.href);
    }
  });

  document.getElementById('btn-wx-continue-anyway')?.addEventListener('click', () => {
    localStorage.setItem(dismissKey, '1');
    overlay.remove();
  });
}
