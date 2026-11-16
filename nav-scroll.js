// Hide the header (and any open Shop menu) when scrolling down, bring it back on scroll up.
// Same behaviour the home page, FAQ, About and Why pilr already had; shared here for every other page.
(function () {
  var nav = document.querySelector('.nav');
  if (!nav) return;
  var lastY = window.scrollY || 0;
  function closeMenus() {
    var hamburger = document.getElementById('nav-hamburger');
    var links = document.getElementById('nav-links');
    var overlay = document.getElementById('nav-overlay');
    if (hamburger) hamburger.classList.remove('open');
    if (links) links.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
    var dd = document.querySelector('.nav-has-dropdown');
    if (dd) dd.classList.remove('dropdown-active');
    var dim = document.querySelector('.nav-dim-overlay');
    if (dim) dim.classList.remove('active');
  }
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if (document.querySelector('.product-hero')) { nav.classList.remove('nav--hidden'); lastY = y; return; }   // product pages: the header stays (with the pre-order bar)
    if (y > lastY && y > 80) {
      nav.classList.add('nav--hidden');
      closeMenus();
    } else {
      nav.classList.remove('nav--hidden');
    }
    lastY = y;
  }, { passive: true });
})();
