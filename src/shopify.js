/* ─────────────────────────────────────────────
   SHOPIFY STOREFRONT — CART + CHECKOUT
   Config: fill in the three values below
──────────────────────────────────────────────── */

const SHOPIFY_DOMAIN   = 'pilr-2.myshopify.com';
const STOREFRONT_TOKEN = '9396df79576b2d44b767b40cdd0ebe8d';
const PRODUCT_HANDLE   = 'pilr-go';

const API_URL      = `https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`;
const CART_ID_KEY  = 'stack_cart_id';

/* ── GQL fetch helper ─────────────────────── */
async function gql(query, variables = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Storefront API ${res.status}`);
  return res.json();
}

/* ── Cart fragment ────────────────────────── */
const CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  lines(first: 50) {
    edges {
      node {
        id
        quantity
        merchandise {
          ... on ProductVariant {
            id
            title
            price { amount currencyCode }
            product { title featuredImage { url altText } }
          }
        }
      }
    }
  }
  cost {
    subtotalAmount { amount currencyCode }
  }
`;

/* ── Cart API ─────────────────────────────── */
async function cartCreate(variantId, quantity = 1) {
  const { data, errors } = await gql(`
    mutation CartCreate($lines: [CartLineInput!]) {
      cartCreate(input: { lines: $lines }) {
        cart { ${CART_FIELDS} }
        userErrors { field message }
      }
    }
  `, { lines: [{ merchandiseId: variantId, quantity }] });
  if (errors?.length) throw new Error(errors[0].message);
  const errs = data?.cartCreate?.userErrors;
  if (errs?.length) throw new Error(errs[0].message);
  return data.cartCreate.cart;
}

async function cartLinesAdd(cartId, variantId, quantity = 1) {
  const { data, errors } = await gql(`
    mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart { ${CART_FIELDS} }
        userErrors { field message }
      }
    }
  `, { cartId, lines: [{ merchandiseId: variantId, quantity }] });
  if (errors?.length) throw new Error(errors[0].message);
  const errs = data?.cartLinesAdd?.userErrors;
  if (errs?.length) throw new Error(errs[0].message);
  return data.cartLinesAdd.cart;
}

async function fetchCart(cartId) {
  const { data } = await gql(`
    query GetCart($id: ID!) {
      cart(id: $id) { ${CART_FIELDS} }
    }
  `, { id: cartId });
  return data?.cart ?? null;
}

/* ── Product ──────────────────────────────── */
async function getFirstAvailableVariant(handle) {
  const { data } = await gql(`
    query GetProduct($handle: String!) {
      product(handle: $handle) {
        availableForSale
        variants(first: 20) {
          edges {
            node {
              id
              availableForSale
              price { amount currencyCode }
            }
          }
        }
      }
    }
  `, { handle });
  const product = data?.product;
  if (!product?.availableForSale) return null;
  const variants = product.variants.edges.map(e => e.node);
  return variants.find(v => v.availableForSale) ?? null;
}

/* ── Utilities ────────────────────────────── */
function formatMoney({ amount, currencyCode }) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode })
    .format(parseFloat(amount));
}

/* ── Cart drawer ──────────────────────────── */
function injectCartDrawer() {
  const privacyUrl = './privacy-policy.html';
  const tosUrl     = './terms-of-service.html';
  const html = `
    <div id="cart-overlay" class="cart-overlay"></div>
    <aside id="cart-drawer" class="cart-drawer" aria-hidden="true">
      <div class="cart-drawer-head">
        <span class="section-eyebrow" style="margin:0">Your cart</span>
        <button id="cart-close" class="cart-close" aria-label="Close cart">✕</button>
      </div>
      <div id="cart-drawer-body" class="cart-drawer-body">
        <p class="cart-empty">Your cart is empty.</p>
      </div>
      <div class="cart-drawer-foot">
        <div class="cart-subtotal-row">
          <span>Subtotal</span>
          <strong id="cart-subtotal-amount">—</strong>
        </div>
        <div class="cart-tos-row">
          <input type="checkbox" id="cart-tos-checkbox" name="cart-tos" />
          <label for="cart-tos-checkbox">I accept the <a href="${tosUrl}" target="_blank" rel="noopener noreferrer">Terms of Service</a>.</label>
        </div>
        <div class="cart-tos-error" id="cart-tos-error">Please accept the Terms of Service to continue.</div>
        <button id="cart-checkout-btn" class="btn cart-checkout-btn">Checkout</button>
        <p class="cart-legal-row"><a href="${privacyUrl}" target="_blank" rel="noopener noreferrer">Privacy Policy</a> &nbsp;·&nbsp; <a href="${tosUrl}" target="_blank" rel="noopener noreferrer">Terms of Service</a></p>
      </div>
    </aside>`;
  document.body.insertAdjacentHTML('beforeend', html);

  document.getElementById('cart-overlay').addEventListener('click', closeCartDrawer);
  document.getElementById('cart-close').addEventListener('click', closeCartDrawer);

  // TOS gate — block checkout until checkbox is checked
  const tosCheckbox = document.getElementById('cart-tos-checkbox');
  const tosError    = document.getElementById('cart-tos-error');
  const checkoutBtn = document.getElementById('cart-checkout-btn');

  tosCheckbox.addEventListener('change', () => {
    if (tosCheckbox.checked) tosError.classList.remove('visible');
  });

  checkoutBtn.addEventListener('click', () => {
    if (!tosCheckbox.checked) {
      tosError.classList.add('visible');
      tosCheckbox.focus();
      return;
    }
    tosError.classList.remove('visible');
    const url = checkoutBtn.dataset.checkoutUrl;
    if (url && url !== '#') window.location.href = url;
  });
}

function openCartDrawer() {
  document.getElementById('cart-drawer').classList.add('open');
  document.getElementById('cart-overlay').classList.add('open');
  // builder page has overflow:hidden on body — temporarily allow it
  document.body.style.overflow = 'hidden';
}

function closeCartDrawer() {
  document.getElementById('cart-drawer').classList.remove('open');
  document.getElementById('cart-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function renderCartDrawer(cart) {
  const body        = document.getElementById('cart-drawer-body');
  const subtotal    = document.getElementById('cart-subtotal-amount');
  const checkoutBtn = document.getElementById('cart-checkout-btn');

  if (!cart || cart.totalQuantity === 0) {
    body.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    subtotal.textContent = '—';
    checkoutBtn.dataset.checkoutUrl = '#';
    return;
  }

  checkoutBtn.dataset.checkoutUrl = cart.checkoutUrl;

  subtotal.textContent = formatMoney(cart.cost.subtotalAmount);

  const items = cart.lines.edges.map(({ node }) => {
    const m     = node.merchandise;
    const img   = m.product.featuredImage;
    const price = formatMoney(m.price);
    const variantLabel = m.title !== 'Default Title' ? `<div class="cart-item-variant">${m.title}</div>` : '';
    const imgTag = img
      ? `<img src="${img.url}" alt="${img.altText ?? ''}" class="cart-item-img">`
      : `<div class="cart-item-img cart-item-img--placeholder"></div>`;

    return `
      <div class="cart-item">
        ${imgTag}
        <div class="cart-item-info">
          <div class="cart-item-name">${m.product.title}</div>
          ${variantLabel}
          <div class="cart-item-price">${price} × ${node.quantity}</div>
        </div>
      </div>`;
  });

  body.innerHTML = items.join('');
}

/* ── Add to cart flow ─────────────────────── */
async function addToCart(variantId, btn) {
  const original = btn.textContent;
  btn.textContent = 'Adding…';
  btn.disabled = true;

  try {
    let cart;
    const storedId = localStorage.getItem(CART_ID_KEY);

    if (storedId) {
      // Try to add to existing cart; if it's expired create a new one
      try {
        cart = await cartLinesAdd(storedId, variantId);
      } catch {
        cart = await cartCreate(variantId);
        localStorage.setItem(CART_ID_KEY, cart.id);
      }
    } else {
      cart = await cartCreate(variantId);
      localStorage.setItem(CART_ID_KEY, cart.id);
    }

    renderCartDrawer(cart);
    openCartDrawer();
    btn.textContent = 'Added ✓';
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('[Shopify] addToCart error:', err);
    btn.textContent = 'Error — try again';
    btn.disabled = false;
  }
}

/* ── Init buttons ─────────────────────────── */
async function initButtons() {
  const addBtn  = document.getElementById('add-to-cart-btn');
  if (!addBtn) return;

  if (SHOPIFY_DOMAIN.startsWith('YOUR_')) {
    addBtn.textContent = 'Coming soon';
    return;
  }

  try {
    const variant = await getFirstAvailableVariant(PRODUCT_HANDLE);

    if (!variant) {
      addBtn.textContent = 'Sold out';
      addBtn.disabled = true;
      return;
    }

    const price = formatMoney(variant.price);
    addBtn.textContent = `Add to cart — ${price}`;
    addBtn.disabled = false;

    addBtn.addEventListener('click', () => addToCart(variant.id, addBtn));
  } catch (err) {
    console.error('[Shopify] initButtons error:', err);
  }
}

/* ── Klaviyo ──────────────────────────────── */
const KLAVIYO_PUBLIC_KEY  = 'VqA2pQ';
const KLAVIYO_EMAIL_LIST  = 'TFmD8A';
const KLAVIYO_SMS_LIST    = 'RSVKC7';
const KLAVIYO_API_URL     = `https://a.klaviyo.com/client/subscriptions/?company_id=${KLAVIYO_PUBLIC_KEY}`;

async function klaviyoPost(body) {
  const res = await fetch(KLAVIYO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'revision': '2026-07-15',
    },
    body: JSON.stringify(body),
  });
  // 202 Accepted = success for Klaviyo client API
  if (!res.ok && res.status !== 202) throw new Error(`Klaviyo API ${res.status}`);
}

export async function subscribeEmailToKlaviyo(email) {
  await klaviyoPost({
    data: {
      type: 'subscription',
      attributes: {
        profile: {
          data: {
            type: 'profile',
            attributes: { email },
          },
        },
      },
      relationships: {
        list: { data: { type: 'list', id: KLAVIYO_EMAIL_LIST } },
      },
    },
  });
}

export async function subscribePhoneToKlaviyo(rawPhone, email, listId = KLAVIYO_SMS_LIST, customSource = 'SMS Popup') {
  const phoneDigits = rawPhone.replace(/\D/g, '');
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    throw new Error('Phone number must be in E.164 format.');
  }
  const phone = `+${phoneDigits}`;

  await klaviyoPost({
    data: {
      type: 'subscription',
      attributes: {
        custom_source: customSource,
        profile: {
          data: {
            type: 'profile',
            attributes: {
              ...(email ? { email } : {}),
              phone_number: phone,
              subscriptions: {
                sms: {
                  marketing: { consent: 'SUBSCRIBED' },
                },
              },
            },
          },
        },
      },
      relationships: {
        list: { data: { type: 'list', id: listId } },
      },
    },
  });
}

// Expose for non-module scripts
window.subscribeEmailToKlaviyo = subscribeEmailToKlaviyo;
window.subscribePhoneToKlaviyo = subscribePhoneToKlaviyo;

/* ── Mailing list / waitlist ──────────────── */
export async function subscribeEmail(email) {
  const { data, errors } = await gql(`
    mutation CustomerCreate($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        customer { id email }
        customerUserErrors { field message }
      }
    }
  `, {
    input: {
      email,
      acceptsMarketing: true,
    },
  });

  if (errors?.length) throw new Error(errors[0].message);
  const userErrors = data?.customerCreate?.customerUserErrors;
  if (userErrors?.length) throw new Error(userErrors[0].message);
  return data.customerCreate.customer;
}

// Expose for non-module scripts
window.subscribeEmail = subscribeEmail;

/* ── Boot ─────────────────────────────────── */
// Shopify disabled during launch phase — re-enable when shop goes live
// injectCartDrawer();
// initButtons();
