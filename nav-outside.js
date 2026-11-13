// Phone menu: tapping anywhere outside the two menu panels (the dimmed page, the header, or the small gap
// between the tab bar and the product list) closes the menu.
(function () {
  var links = document.getElementById('nav-links');
  var hamburger = document.getElementById('nav-hamburger');
  if (!links || !hamburger) return;
  // A few pages have the menu button but no dimming layer behind the menu. Add one, and keep it in step
  // with the menu, so those pages dim like the rest and taps on the page beneath don't fire.
  var overlay = document.getElementById('nav-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    overlay.id = 'nav-overlay';
    document.body.appendChild(overlay);
  }
  new MutationObserver(function () {
    overlay.classList.toggle('open', links.classList.contains('open'));
  }).observe(links, { attributes: true, attributeFilter: ['class'] });
  var phone = window.matchMedia('(max-width: 600px)');
  function inside(r, x, y) { return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  document.addEventListener('click', function (e) {
    if (!phone.matches || !links.classList.contains('open')) return;
    if (hamburger.contains(e.target)) return;            // the menu button toggles the menu itself
    var l = links.getBoundingClientRect();
    var dd = links.querySelector('.nav-dropdown');
    var d = dd ? dd.getBoundingClientRect() : l;
    var bar = { left: l.left, right: l.right, top: l.top, bottom: d.top - 8 };   // the tab bar panel
    if (inside(d, e.clientX, e.clientY) || inside(bar, e.clientX, e.clientY)) return;
    hamburger.classList.remove('open');
    links.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }, true);
})();
