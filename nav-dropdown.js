// Shop dropdown for pages that don't carry their own copy of the homepage nav script.
(function () {
  var shopAllLi = document.querySelector('.nav-has-dropdown');
  var shopDropdown = document.querySelector('.nav-dropdown');
  var dimOverlay = document.getElementById('nav-dim-overlay');
  if (!shopAllLi || !shopDropdown || !dimOverlay) return;

  var dropOpen = false;
  var dropCloseTimer = null;

  function openDrop() {
    clearTimeout(dropCloseTimer);
    dropCloseTimer = null;
    shopAllLi.classList.add('dropdown-active');
    dimOverlay.classList.add('active');
    dropOpen = true;
  }
  function closeDrop() {
    clearTimeout(dropCloseTimer);
    dropCloseTimer = null;
    shopAllLi.classList.remove('dropdown-active');
    dimOverlay.classList.remove('active');
    dropOpen = false;
  }
  function inZone(x, y) {
    var li = shopAllLi.getBoundingClientRect();
    var dd = shopDropdown.getBoundingClientRect();
    if (x >= li.left && x <= li.right && y >= li.top && y <= li.bottom) return true;
    if (y >= dd.top && y <= dd.bottom) return true;
    if (y > li.bottom && y < dd.top) return true;
    return false;
  }

  dimOverlay.addEventListener('click', closeDrop);
  shopAllLi.addEventListener('mouseenter', openDrop);
  document.addEventListener('mousemove', function (e) {
    if (!dropOpen) return;
    if (inZone(e.clientX, e.clientY)) {
      clearTimeout(dropCloseTimer);
      dropCloseTimer = null;
    } else if (!dropCloseTimer) {
      dropCloseTimer = setTimeout(closeDrop, 150);
    }
  });
})();
