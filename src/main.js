// ==========================================
// 菜单气泡展开与全局点击收起控制
// ==========================================
window.toggleLeftNavMenu = function (e) {
  e.stopPropagation();
  const leftMenu = document.getElementById('left-nav-menu');
  const rightMenu = document.getElementById('right-nav-menu');
  if (rightMenu) rightMenu.classList.add('hidden');
  if (leftMenu) leftMenu.classList.toggle('hidden');
};

window.toggleRightNavMenu = function (e) {
  e.stopPropagation();
  const leftMenu = document.getElementById('left-nav-menu');
  const rightMenu = document.getElementById('right-nav-menu');
  if (leftMenu) leftMenu.classList.add('hidden');
  if (rightMenu) rightMenu.classList.toggle('hidden');
};

window.closeAllMenus = function () {
  document.getElementById('left-nav-menu')?.classList.add('hidden');
  document.getElementById('right-nav-menu')?.classList.add('hidden');
};

// 监听页面任意空白区域的点击，自动合上菜单
document.addEventListener('click', () => {
  window.closeAllMenus();
});
