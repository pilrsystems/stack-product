// Phone menu toggle for pages that don't carry their own copy of the homepage nav script.
(function () {
  var hamburger = document.getElementById('nav-hamburger');
  var navLinks = document.getElementById('nav-links');
  if (!hamburger || !navLinks) return;
  var overlay = document.getElementById('nav-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    overlay.id = 'nav-overlay';
    document.body.appendChild(overlay);
  }
  function setOpen(on) {
    hamburger.classList.toggle('open', on);
    navLinks.classList.toggle('open', on);
    overlay.classList.toggle('open', on);
    document.body.style.overflow = on ? 'hidden' : '';
  }
  hamburger.addEventListener('click', function () { setOpen(!navLinks.classList.contains('open')); });
  overlay.addEventListener('click', function () { setOpen(false); });
  navLinks.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
})();
