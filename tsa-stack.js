// Built to travel photo stack. Shared by classic-stack.html and the pod pages;
// loaded with <script type="module" src="./tsa-stack.js"> so it runs after the page is parsed.
// BUILT TO TRAVEL — 3-photo layered stack. `order` holds the
// three card elements in current front->back visual order; each
// card's data-pos (0/1/2) is what the CSS above actually reads.
;(function () {
  var stack = document.getElementById('tsa-stack');
  if (!stack) return;
  var cards = Array.prototype.slice.call(stack.querySelectorAll('.tsa-stack-card'));
  var DURATION = 450;
  var animating = false;

  var order = cards.slice().sort(function (a, b) {
    return parseInt(a.getAttribute('data-pos'), 10) - parseInt(b.getAttribute('data-pos'), 10);
  });

  function reduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function snap(card, pos) {
    card.classList.remove('is-leaving');
    card.style.transition = 'none';
    card.setAttribute('data-pos', pos);
    void card.offsetWidth; // force reflow so the transition stays off for this change
    card.style.transition = '';
  }

  function next() {
    if (animating) return;
    var front = order[0];

    if (reduceMotion()) {
      order.slice(1).forEach(function (card, i) { snap(card, i); });
      snap(front, 2);
      order.push(order.shift());
      return;
    }

    animating = true;
    front.classList.add('is-leaving');
    order.slice(1).forEach(function (card, i) { card.setAttribute('data-pos', i); });

    window.setTimeout(function () {
      snap(front, 2);
      order.push(order.shift());
      animating = false;
    }, DURATION);
  }

  function prev() {
    if (animating) return;
    var back = order[order.length - 1];

    if (reduceMotion()) {
      order.slice(0, order.length - 1).forEach(function (card, i) { snap(card, i + 1); });
      snap(back, 0);
      order.unshift(order.pop());
      return;
    }

    animating = true;
    snap(back, 0);
    back.classList.add('is-leaving');
    order.slice(0, order.length - 1).forEach(function (card, i) { card.setAttribute('data-pos', i + 1); });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { back.classList.remove('is-leaving'); });
    });

    window.setTimeout(function () {
      order.unshift(order.pop());
      animating = false;
    }, DURATION);
  }

  stack.addEventListener('click', function () { next(); userTriggered(); });

  // Trackpad / magic-mouse swipe: a sideways two- or three-finger
  // scroll arrives as wheel events. A swipe flips one photo. The tail of
  // momentum events that follows a swipe is ignored, but a new swipe is
  // recognised even if it starts before that tail has died out (its
  // movement climbs back up from the tail's lowest point), so swipes can follow each other
  // continuously.
  var wx = 0, wy = 0, wLast = 0, wMin = 0, wLocked = false, wLockT = 0;
  stack.addEventListener('wheel', function (e) {
    var now = e.timeStamp;
    if (now - wLast > 120) { wx = 0; wy = 0; wLocked = false; } // quiet gap: new gesture
    wLast = now;
    wx += e.deltaX; wy += e.deltaY;
    if (Math.abs(wx) <= Math.abs(wy)) return; // mostly vertical: let the page scroll
    e.preventDefault();
    var abs = Math.abs(e.deltaX);
    if (wLocked) {
      // wMin is the quietest the tail has got since the flip; movement
      // climbing well back above it is a new swipe starting.
      wMin = Math.min(wMin, abs);
      var fresh = now - wLockT > 300 && abs >= 14 && abs > wMin * 2 + 10;
      if (!fresh) return;
      wLocked = false; wx = e.deltaX; wy = e.deltaY;
    }
    if (Math.abs(wx) < 40 || animating) return; // keep gathering until it's enough and the photos are still
    wLocked = true; wLockT = now; wMin = abs;
    if (wx > 0) next(); else prev();
    wx = 0; wy = 0;
    userTriggered();
  }, { passive: false });

  stack.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); userTriggered(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); userTriggered(); }
  });

  var touchStartX = null;
  stack.addEventListener('touchstart', function (e) {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });
  stack.addEventListener('touchend', function (e) {
    if (touchStartX === null) return;
    var dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) < 30) return;
    if (dx < 0) next(); else prev();
    userTriggered();
  }, { passive: true });


  var hint = document.getElementById('tsa-stack-hint');
  if (hint) {
    hint.addEventListener('click', function (e) {
      e.stopPropagation(); // sits over the stack's own click-to-advance area
      next();
      userTriggered();
    });
  }

  // AUTOPLAY — advances every 3s; pauses while the pointer/keyboard
  // focus is on the stack and whenever the tab isn't visible, and
  // restarts its 3s window after any manual navigation so it
  // doesn't fire right on top of one. Off entirely under
  // prefers-reduced-motion, same as the slide transition itself.
  var AUTOPLAY_MS = 3000;
  var autoplayTimer = null;

  function stopAutoplay() {
    if (autoplayTimer) { window.clearInterval(autoplayTimer); autoplayTimer = null; }
  }
  function startAutoplay() {
    if (reduceMotion() || autoplayTimer) return;
    autoplayTimer = window.setInterval(next, AUTOPLAY_MS);
  }
  var hovering = false;
  function userTriggered() {
    stopAutoplay();
    if (!hovering) startAutoplay();
  }

  stack.addEventListener('mouseenter', function () { hovering = true; stopAutoplay(); });
  stack.addEventListener('mouseleave', function () { hovering = false; startAutoplay(); });
  stack.addEventListener('focusin', stopAutoplay);
  stack.addEventListener('focusout', startAutoplay);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopAutoplay(); else startAutoplay();
  });

  startAutoplay();
})();
