// Product-page reviews section (#reviews, shell in partials/reviews.html).
//
// Today the section shows placeholder content. To connect Judge.me:
//   1. Add a Netlify function (e.g. netlify/functions/reviews.mjs, routed at
//      /api/reviews in netlify.toml) that calls the Judge.me API with the
//      private API token and the shop domain, and returns the shape below.
//      Keep the token server-side, never in this file.
//   2. Set JUDGEME_ENABLED to true.
// The section's data-product-handle is the page's product handle (confirm it
// matches the Shopify product handle). Search, topic filters, sorting and
// "Load more" all run in the browser on whatever reviews are loaded.
//
// Expected response from /api/reviews?handle=<handle>:
//   { average: 4.9, count: 4728,
//     distribution: { 5: 4100, 4: 500, 3: 80, 2: 30, 1: 18 },
//     reviews: [ { rating: 5, title, body, author, date: '2026-11-16',
//                  verified: true, photo: 'https://…' | null } ] }

const JUDGEME_ENABLED = false
const PAGE_SIZE = 5
const TOPICS_VISIBLE = 5

// Popular topics: label + the words that put a review under it.
const TOPICS = [
  ['Size', /\b(size|sized|small|large|big|compact|fit|fits|capacity|volume)\b/i],
  ['Leakproof', /(leak|spill|airtight|watertight|seal)/i],
  ['Travel-friendly', /(travel|trip|flight|flying|luggage|carry|suitcase|portable|on the go)/i],
  ['TSA', /(\btsa\b|airport|security)/i],
  ['Shipping', /(ship|deliver|arrived|arrival|packag)/i],
  ['Quality', /(quality|sturdy|durable|material|premium|well made|well-made)/i],
  ['Design', /(design|looks|sleek|aesthetic|colou?r|minimal)/i],
  ['Stacking', /(stack|modular|pods?\b)/i],
  ['Easy to clean', /(clean|wash|dishwasher)/i],
  ['Powder', /(powder|scoop|creatine|collagen)/i],
  ['Pills', /(pill|capsule|tablet)/i],
  ['Value', /(value|price|worth|cost)/i],
]

const PLACEHOLDER = {
  average: 0, count: 0, distribution: {},
  reviews: [
    { rating: 5, title: 'Review title', body: 'Placeholder review. The real text will show here once Judge.me is connected.', author: 'Reviewer name', date: 'Date', verified: true, photo: null },
    { rating: 5, title: 'Review title', body: 'Placeholder review. The real text will show here once Judge.me is connected.', author: 'Reviewer name', date: 'Date', verified: true, photo: '' },
    { rating: 5, title: 'Review title', body: 'Placeholder review. The real text will show here once Judge.me is connected.', author: 'Reviewer name', date: 'Date', verified: true, photo: null },
  ],
}

const STAR = '<svg class="rv-star{off}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>'
const CHECK = '<svg class="rv-check" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="currentColor"/><polyline points="7 12.5 10.5 16 17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function stars(n) {
  const r = Math.round(n)
  let out = ''
  for (let i = 1; i <= 5; i++) out += STAR.replace('{off}', i <= r ? '' : ' rv-star--off')
  return '<span class="rv-stars" role="img" aria-label="' + r + ' out of 5 stars">' + out + '</span>'
}

function fmtDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)   // a plain date is local, not UTC (avoids off-by-one-day)
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v)
  return isNaN(d) ? (v || '') : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function mount(root, data) {
  const q = (k) => root.querySelector('[data-rv="' + k + '"]')
  const state = { all: data.reviews || [], topic: null, query: '', sort: 'highest', shown: PAGE_SIZE, moreTopics: false }

  q('average').textContent = Number(data.average).toFixed(1)
  q('count').textContent = Number(data.count).toLocaleString('en-US')
  q('stars').innerHTML = stars(data.average)
  const total = Math.max(1, data.count)
  q('bars').innerHTML = [5, 4, 3, 2, 1].map((n) => {
    const c = (data.distribution && data.distribution[n]) || 0
    return '<div class="rv-bar-row"><span class="rv-bar-num">' + n + '</span>' + STAR.replace('{off}', '') +
      '<span class="rv-bar-track"><span class="rv-bar-fill" style="width:' + Math.round((c / total) * 100) + '%"></span></span>' +
      '<span class="rv-bar-count">' + c.toLocaleString('en-US') + '</span></div>'
  }).join('')

  function drawTopics() {
    const list = state.moreTopics ? TOPICS : TOPICS.slice(0, TOPICS_VISIBLE)
    q('topics').innerHTML = list.map(([label]) =>
      '<button type="button" class="rv-topic' + (state.topic === label ? ' is-active' : '') + '" data-topic="' + esc(label) + '" aria-pressed="' + (state.topic === label) + '">' + esc(label) + '</button>'
    ).join('') + (TOPICS.length > TOPICS_VISIBLE
      ? '<button type="button" class="rv-topics-more" data-rv="topics-more">' + (state.moreTopics ? 'Show less' : 'Show more') + '</button>' : '')
  }

  function visible() {
    const topic = state.topic && TOPICS.find((t) => t[0] === state.topic)[1]
    const needle = state.query.trim().toLowerCase()
    let rows = state.all.filter((r) => {
      const text = [r.title, r.body, r.author].join(' ')
      return (!topic || topic.test(text)) && (!needle || text.toLowerCase().includes(needle))
    })
    const t = (r) => +new Date(r.date) || 0
    rows = rows.slice().sort(state.sort === 'lowest' ? (a, b) => a.rating - b.rating
      : state.sort === 'newest' ? (a, b) => t(b) - t(a)
      : (a, b) => b.rating - a.rating)
    return rows
  }

  function drawList() {
    const rows = visible()
    q('list').innerHTML = rows.length ? rows.slice(0, state.shown).map((r) =>
      '<article class="rv-item"><div class="rv-item-who"><p class="rv-name">' + esc(r.author) + '</p>' +
      (r.verified ? '<p class="rv-verified">' + CHECK + 'Verified Reviewer</p>' : '') + '</div>' +
      '<div class="rv-item-main"><div class="rv-item-head">' + stars(r.rating) + '<span class="rv-date">' + esc(fmtDate(r.date)) + '</span></div>' +
      (r.title ? '<h3 class="rv-item-title">' + esc(r.title) + '</h3>' : '') +
      '<p class="rv-item-body">' + esc(r.body) + '</p>' +
      (r.photo != null && r.photo !== undefined && (r.photo === '' || r.photo)
        ? '<img class="rv-photo" ' + (r.photo ? 'src="' + esc(r.photo) + '" alt="Photo from ' + esc(r.author) + '" loading="lazy"' : 'alt="" aria-hidden="true"') + '>' : '') +
      '</div></article>'
    ).join('') : '<p class="rv-empty">No reviews match your search.</p>'
    const more = q('more')
    more.hidden = rows.length <= state.shown
    // "Read more" on bodies that overflow the 3-line clamp
    q('list').querySelectorAll('.rv-item-body').forEach((p) => {
      if (p.scrollHeight > p.clientHeight + 1) {
        const b = document.createElement('button')
        b.type = 'button'; b.className = 'rv-readmore'; b.textContent = 'Read more'
        b.addEventListener('click', () => { p.classList.add('is-open'); b.remove() })
        p.after(b)
      }
    })
  }

  root.addEventListener('click', (e) => {
    const topic = e.target.closest('.rv-topic')
    if (topic) { state.topic = state.topic === topic.dataset.topic ? null : topic.dataset.topic; state.shown = PAGE_SIZE; drawTopics(); drawList() }
    if (e.target.closest('[data-rv="topics-more"]')) { state.moreTopics = !state.moreTopics; drawTopics() }
    if (e.target.closest('[data-rv="more"]')) { state.shown += PAGE_SIZE; drawList() }
  })
  q('search').addEventListener('input', (e) => { state.query = e.target.value; state.shown = PAGE_SIZE; drawList() })
  q('sort').addEventListener('change', (e) => { state.sort = e.target.value; state.shown = PAGE_SIZE; drawList() })
  drawTopics(); drawList()
}

async function init() {
  const root = document.getElementById('reviews')
  if (!root) return
  let data = PLACEHOLDER
  if (JUDGEME_ENABLED) {
    try {
      const res = await fetch('/api/reviews?handle=' + encodeURIComponent(root.dataset.productHandle))
      if (!res.ok) throw new Error('reviews ' + res.status)
      data = await res.json()
      root.dataset.reviewsSource = 'judgeme'
    } catch (e) {
      console.warn('Reviews not loaded, showing placeholder:', e)
    }
  }
  mount(root, data)
}

init()
