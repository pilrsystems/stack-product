// Microsoft Clarity (project zj805udt2j). Production only: the live domain, never localhost or *.pages.dev previews.
// Checkout runs on checkout.pilrsystems.com and is tracked by the Clarity Shopify app, so nothing is added there.
// (There is no cookie-consent banner on this site; GA4 and Klaviyo also load unconditionally.)
const PROD_HOSTS = ['pilrsystems.com', 'www.pilrsystems.com']

if (PROD_HOSTS.includes(location.hostname) && !window.clarity) {
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments) }
    t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y)
  })(window, document, 'clarity', 'script', 'zj805udt2j')
}
