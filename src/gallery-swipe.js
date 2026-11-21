// Product page photos on a phone (600px and narrower):
//  - the big photo is a real swipe carousel: it follows your finger, the next photo slides in and it snaps into place;
//  - the small photo strip underneath stays in step (swipe the big photo and the strip moves; tap a thumbnail and the big photo slides to it).
// The photos themselves, and which thumbnail is highlighted, are still handled by each page's own gallery code;
// this only adds the carousel on top. On wider screens nothing here shows.
const phone = window.matchMedia('(max-width: 600px)')
const frame = document.getElementById('pg-main-frame')
const strip = document.getElementById('pg-thumbs')
const thumbs = Array.prototype.slice.call(document.querySelectorAll('.pg-thumb'))

let swipe = null
let fromSwipe = false

function positionOf(styleText) {
  const m = /object-position:\s*([^;"]+)/.exec(styleText || '')
  return m ? m[1].trim() : ''
}

function slideFor(i, stacked) {
  const slide = document.createElement('div')
  slide.className = 'pg-swipe-slide'
  const src = stacked ? stacked[i] : null
  if (src && src.tagName === 'VIDEO') {
    const v = document.createElement('video')
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata'
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '')
    v.src = src.getAttribute('src') || ''
    if (src.getAttribute('poster')) v.poster = src.getAttribute('poster')
    slide.appendChild(v)
  } else if (src && src.tagName === 'IMG') {
    const img = document.createElement('img')
    img.src = src.getAttribute('src'); img.alt = src.getAttribute('alt') || ''; img.loading = i < 2 ? 'eager' : 'lazy'; img.draggable = false
    const pos = positionOf(src.getAttribute('style'))
    if (pos) img.style.objectPosition = pos
    slide.appendChild(img)
  } else if (thumbs[i] && thumbs[i].dataset.video) {
    const v = document.createElement('video')
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata'
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '')
    v.src = thumbs[i].dataset.video
    if (thumbs[i].dataset.poster) v.poster = thumbs[i].dataset.poster
    const vpos = positionOf(thumbs[i].dataset.imgstyle)
    if (vpos) v.style.objectPosition = vpos
    slide.appendChild(v)
  } else if (thumbs[i] && thumbs[i].dataset.src) {
    const img = document.createElement('img')
    img.src = thumbs[i].dataset.src; img.alt = ''; img.loading = i < 2 ? 'eager' : 'lazy'; img.draggable = false
    const pos = positionOf(thumbs[i].dataset.imgstyle)
    if (pos) img.style.objectPosition = pos
    slide.appendChild(img)
  } else {
    slide.classList.add('pg-swipe-slide--empty')
    slide.textContent = 'Product photo'
  }
  return slide
}

function build() {
  if (swipe || !frame || !thumbs.length) return
  const stacked = Array.prototype.slice.call(frame.querySelectorAll(':scope > .pg-main-img'))
  const useStacked = stacked.length > 1 && stacked.length === thumbs.length ? stacked : null
  swipe = document.createElement('div')
  swipe.className = 'pg-swipe'
  swipe.id = 'pg-swipe'
  thumbs.forEach((_, i) => swipe.appendChild(slideFor(i, useStacked)))
  frame.parentElement.insertBefore(swipe, frame)
  frame.parentElement.classList.add('has-swipe')

  // swiping the big photo -> highlight (and so show) the matching thumbnail
  let timer = null
  swipe.addEventListener('scroll', () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const i = Math.round(swipe.scrollLeft / swipe.clientWidth)
      if (thumbs[i] && !thumbs[i].classList.contains('is-active')) {
        fromSwipe = true
        thumbs[i].click()
        fromSwipe = false
      }
    }, 90)
  }, { passive: true })

  // tapping a thumbnail -> slide the big photo to it
  thumbs.forEach((t, i) => t.addEventListener('click', () => {
    if (fromSwipe) return
    swipe.scrollTo({ left: i * swipe.clientWidth, behavior: 'smooth' })
  }))

  // videos play only while they are the photo on screen
  const vids = swipe.querySelectorAll('video')
  if (vids.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting && en.intersectionRatio > 0.6) en.target.play().catch(() => {})
      else en.target.pause()
    }), { root: swipe, threshold: [0, 0.6, 1] })
    vids.forEach((v) => io.observe(v))
  }
}

if (phone.matches) build()
phone.addEventListener('change', (e) => { if (e.matches) build() })

// keep the current thumbnail in view in the strip
if (strip) {
  const center = () => {
    const active = strip.querySelector('.pg-thumb.is-active')
    if (!active || strip.scrollWidth <= strip.clientWidth) return
    const sr = strip.getBoundingClientRect()
    const ar = active.getBoundingClientRect()
    const left = strip.scrollLeft + (ar.left - sr.left) - (sr.width - ar.width) / 2
    strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }
  new MutationObserver(center).observe(strip, { subtree: true, attributes: true, attributeFilter: ['class'] })
}
