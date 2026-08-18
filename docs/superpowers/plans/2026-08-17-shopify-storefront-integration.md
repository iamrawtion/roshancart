# Shopify Storefront API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing static ShopNow site to a Shopify development store — real products via Storefront API, real Shopify cart, redirect to Shopify hosted checkout.

**Architecture:** Pure client-side. Browser calls Shopify Storefront GraphQL API directly with a public token stored in `shopify-config.js`. No backend required. Existing Bootstrap UI, CSS, and Convert tracking preserved throughout.

**Tech Stack:** Vanilla JS (ES6+), Shopify Storefront API (GraphQL), Bootstrap 4.3.1, Convert Experiences SDK.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `shopify-config.js` | Store domain + Storefront token (one place to configure) |
| Rewrite | `script.js` | Fetch products, render cards, Shopify cart mutations, checkout redirect |
| Modify | `grocery.html` | Remove hardcoded cards, add product containers, load new scripts |
| Modify | `checkout.js` | `validate()` reads checkoutUrl from sessionStorage and redirects |
| Modify | `checkout.html` | No structural change — checkout.js handles redirect |
| Keep | `thankyou.html` | Unchanged — used for direct Convert testing |
| Keep | `index.html` | Unchanged |
| Keep | All CSS files | Unchanged |

---

## Task 1: Create `shopify-config.js`

**Files:**
- Create: `shopify-config.js`

- [ ] **Step 1: Create the config file**

Create `/Users/roshannagekar/Documents/convert/roshancart/shopify-config.js` with:

```js
// Replace these with your Shopify development store values
const SHOPIFY_DOMAIN = 'your-store.myshopify.com';
const SHOPIFY_STOREFRONT_TOKEN = 'your-storefront-api-token';
const SHOPIFY_API_VERSION = '2024-01';
```

- [ ] **Step 2: Verify the file exists**

Run: `ls -la /Users/roshannagekar/Documents/convert/roshancart/shopify-config.js`
Expected: file listed with size > 0

- [ ] **Step 3: Commit**

```bash
git add shopify-config.js
git commit -m "add Shopify config file with placeholder credentials"
```

---

## Task 2: Rewrite `script.js` with Shopify Storefront API

**Files:**
- Rewrite: `script.js`

This is the core of the integration. The new script:
1. Fetches products from Shopify via GraphQL
2. Groups them by tag and renders Bootstrap cards
3. Creates/updates a Shopify cart on "Add to cart"
4. Stores `checkoutUrl` in sessionStorage for checkout redirect

- [ ] **Step 1: Open the existing `script.js` and replace its entire contents**

Replace the entire contents of `script.js` with:

```js
// ── Shopify Storefront helpers ──────────────────────────────────────────────

async function shopifyFetch(query, variables = {}) {
    const res = await fetch(`https://${SHOPIFY_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);
    const { data, errors } = await res.json();
    if (errors) throw new Error(errors[0].message);
    return data;
}

// ── Product fetching & rendering ────────────────────────────────────────────

const CATEGORY_ORDER = ['grocery', 'beauty', 'clothes', 'shoes'];

async function fetchAndRenderProducts() {
    const data = await shopifyFetch(`
        {
            products(first: 50) {
                edges {
                    node {
                        id
                        title
                        tags
                        variants(first: 1) {
                            edges {
                                node {
                                    id
                                    priceV2 { amount currencyCode }
                                }
                            }
                        }
                        images(first: 1) {
                            edges {
                                node { url altText }
                            }
                        }
                    }
                }
            }
        }
    `);

    const products = data.products.edges.map(e => {
        const node = e.node;
        const variant = node.variants.edges[0]?.node;
        const image = node.images.edges[0]?.node;
        return {
            variantId: variant?.id,
            title: node.title,
            price: parseFloat(variant?.priceV2.amount || 0).toFixed(2),
            imageUrl: image?.url || '',
            imageAlt: image?.altText || node.title,
            tags: node.tags.map(t => t.toLowerCase()),
        };
    });

    // Update Convert tracking with first product found
    if (products.length > 0) {
        const first = products[0];
        if (typeof _conv_product_name !== 'undefined') {
            // eslint-disable-next-line no-global-assign
            _conv_product_name = first.title;
            _conv_product_price = first.price;
            // Use variantId as SKU since Shopify doesn't expose SKU via Storefront without extra scope
            _conv_product_sku = first.variantId;
        }
    }

    CATEGORY_ORDER.forEach(category => {
        const container = document.getElementById(`products-${category}`);
        if (!container) return;
        const categoryProducts = products.filter(p => p.tags.includes(category));
        if (categoryProducts.length === 0) {
            container.innerHTML = '<p class="text-center text-muted">No products found in Shopify for this category.</p>';
            return;
        }
        container.innerHTML = categoryProducts.map(p => `
            <div class="card col-sm-3 m-1 ml-5" style="width: 18rem;">
                <img src="${p.imageUrl}" class="card-img-top img-responsive" alt="${p.imageAlt}">
                <div class="card-body">
                    <h5 class="card-title text-center">${p.title}</h5>
                    <p class="card-text text-center display-3">$${p.price}</p>
                    <div class="text-center">
                        <a tabindex="0"
                           onclick="addToCart('${p.variantId}', '${p.title.replace(/'/g, "\\'")}', '${p.price}')"
                           class="btn">Add to cart</a>
                    </div>
                </div>
            </div>
        `).join('');
    });
}

// ── Cart state ──────────────────────────────────────────────────────────────

let cartId = sessionStorage.getItem('shopify_cart_id') || null;
let cartItems = []; // { variantId, title, price, quantity }

async function addToCart(variantId, title, price) {
    const existing = cartItems.find(i => i.variantId === variantId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cartItems.push({ variantId, title, price: parseFloat(price), quantity: 1 });
    }

    if (!cartId) {
        await createCart(variantId);
    } else {
        await addLineToCart(variantId);
    }
    updateSidebar();
}

async function createCart(variantId) {
    const data = await shopifyFetch(`
        mutation cartCreate($input: CartInput!) {
            cartCreate(input: $input) {
                cart {
                    id
                    checkoutUrl
                }
                userErrors { field message }
            }
        }
    `, {
        input: {
            lines: [{ quantity: 1, merchandiseId: variantId }]
        }
    });
    const cart = data.cartCreate.cart;
    cartId = cart.id;
    sessionStorage.setItem('shopify_cart_id', cartId);
    sessionStorage.setItem('shopify_checkout_url', cart.checkoutUrl);
}

async function addLineToCart(variantId) {
    const data = await shopifyFetch(`
        mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
            cartLinesAdd(cartId: $cartId, lines: $lines) {
                cart {
                    id
                    checkoutUrl
                }
                userErrors { field message }
            }
        }
    `, {
        cartId,
        lines: [{ quantity: 1, merchandiseId: variantId }]
    });
    const cart = data.cartLinesAdd.cart;
    sessionStorage.setItem('shopify_checkout_url', cart.checkoutUrl);
}

// ── Sidebar UI ──────────────────────────────────────────────────────────────

function updateSidebar() {
    const sidebarList = document.getElementById('sidebarList');
    const sidebarTotal = document.getElementById('sidebarTotal');
    if (!sidebarList) return;

    sidebarList.innerHTML = '';
    if (cartItems.length === 0) {
        sidebarList.innerHTML = '<li class="empty-msg">Your cart is empty</li>';
        sidebarTotal.innerHTML = '';
        return;
    }
    cartItems.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `${item.title} <span class="price">x${item.quantity} — $${(item.price * item.quantity).toFixed(2)}</span>`;
        sidebarList.appendChild(li);
    });
    const total = cartItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
    sidebarTotal.innerHTML = `Total: <span>$${total.toFixed(2)}</span>`;
}

// ── Modal cart UI ───────────────────────────────────────────────────────────

function cart() {
    const list = document.querySelector('.list');
    const billEl = document.querySelector('.bill');
    if (!list) return;
    list.innerHTML = '';
    if (cartItems.length === 0) {
        if (billEl) billEl.innerHTML = 'Your cart is empty';
        return;
    }
    cartItems.forEach(item => {
        const li = document.createElement('li');
        li.style.textAlign = 'left';
        li.innerHTML = `${item.title} <span class="price">x${item.quantity} — $${(item.price * item.quantity).toFixed(2)}</span>`;
        list.appendChild(li);
    });
    const total = cartItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
    if (billEl) billEl.innerHTML = `Total Bill is $${total.toFixed(2)}`;
}

// ── Checkout redirect ───────────────────────────────────────────────────────

function goToCheckout() {
    const checkoutUrl = sessionStorage.getItem('shopify_checkout_url');
    if (!checkoutUrl) {
        alert('Your cart is empty. Please add items before checking out.');
        return;
    }
    window.location.href = checkoutUrl;
}

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Only fetch products on the grocery/category page
    if (document.getElementById('products-grocery')) {
        fetchAndRenderProducts().catch(err => {
            console.error('Failed to load products from Shopify:', err);
            CATEGORY_ORDER.forEach(cat => {
                const container = document.getElementById(`products-${cat}`);
                if (container) {
                    container.innerHTML = '<p class="text-center text-muted col-12">Unable to load products. Check Shopify config.</p>';
                }
            });
        });
    }
    updateSidebar();
});
```

- [ ] **Step 2: Verify file saved correctly**

Run: `wc -l /Users/roshannagekar/Documents/convert/roshancart/script.js`
Expected: output shows ~150+ lines

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "rewrite script.js with Shopify Storefront API integration"
```

---

## Task 3: Update `grocery.html` — remove hardcoded cards, add dynamic containers

**Files:**
- Modify: `grocery.html`

The hardcoded product card HTML gets replaced with empty container divs that `script.js` fills in. The checkout button in the sidebar and modal must call `goToCheckout()` instead of linking directly to `checkout.html`.

- [ ] **Step 1: Replace the Grocery product section**

In `grocery.html`, find and replace the entire `<div id="grocery" class="row ml-3 m-5">` block (lines 78–105) with:

```html
  <div id="grocery" class="row ml-3 m-5">
    <div id="products-grocery" class="d-flex flex-wrap w-100">
      <p class="text-center text-muted col-12">Loading products…</p>
    </div>
  </div>
```

- [ ] **Step 2: Replace the Beauty product section**

Find and replace the entire `<div id="beauty" class="row ml-3 m-5">` block (lines 109–136) with:

```html
  <div id="beauty" class="row ml-3 m-5">
    <div id="products-beauty" class="d-flex flex-wrap w-100">
      <p class="text-center text-muted col-12">Loading products…</p>
    </div>
  </div>
```

- [ ] **Step 3: Replace the Clothes product section**

Find and replace the entire `<div id="clothes" class="row ml-3 m-5">` block (lines 141–168) with:

```html
  <div id="clothes" class="row ml-3 m-5">
    <div id="products-clothes" class="d-flex flex-wrap w-100">
      <p class="text-center text-muted col-12">Loading products…</p>
    </div>
  </div>
```

- [ ] **Step 4: Replace the Shoes product section**

Find and replace the entire `<div id="shoes" class="row ml-3 m-5">` block (lines 173–201) with:

```html
  <div id="shoes" class="row ml-3 m-5">
    <div id="products-shoes" class="d-flex flex-wrap w-100">
      <p class="text-center text-muted col-12">Loading products…</p>
    </div>
  </div>
```

- [ ] **Step 5: Update sidebar checkout button**

Find:
```html
      <a href="checkout.html" class="btn sidebar-checkout">Checkout</a>
```
Replace with:
```html
      <a href="#" onclick="goToCheckout(); return false;" class="btn sidebar-checkout">Checkout</a>
```

- [ ] **Step 6: Update modal checkout button**

Find:
```html
              <a href="checkout.html" class="btn checkout m-3">Checkout</a>
```
Replace with:
```html
              <a href="#" onclick="goToCheckout(); return false;" class="btn checkout m-3">Checkout</a>
```

- [ ] **Step 7: Add `shopify-config.js` before `script.js` in the script tags**

Find:
```html
  <script src="script.js"></script>
```
Replace with:
```html
  <script src="shopify-config.js"></script>
  <script src="script.js"></script>
```

- [ ] **Step 8: Verify no hardcoded card divs remain**

Run: `grep -n "addToCart([0-9]" /Users/roshannagekar/Documents/convert/roshancart/grocery.html`
Expected: no output (zero matches)

- [ ] **Step 9: Commit**

```bash
git add grocery.html
git commit -m "replace hardcoded product cards with dynamic Shopify containers"
```

---

## Task 4: Update `checkout.js` to redirect to Shopify checkout

**Files:**
- Modify: `checkout.js`

The `validate()` function must read `shopify_checkout_url` from `sessionStorage` and redirect there instead of navigating to `thankyou.html`.

- [ ] **Step 1: Replace `validate()` in `checkout.js`**

Find:
```js
function validate() {
    autofill();
    window.location.href = "thankyou.html";
}
```
Replace with:
```js
function validate() {
    autofill();
    const checkoutUrl = sessionStorage.getItem('shopify_checkout_url');
    if (!checkoutUrl) {
        alert('Your cart is empty. Please add items before checking out.');
        window.location.href = 'grocery.html';
        return;
    }
    window.location.href = checkoutUrl;
}
```

- [ ] **Step 2: Verify the change**

Run: `grep -n "thankyou" /Users/roshannagekar/Documents/convert/roshancart/checkout.js`
Expected: no output (zero matches)

- [ ] **Step 3: Commit**

```bash
git add checkout.js
git commit -m "update checkout.js to redirect to Shopify hosted checkout URL"
```

---

## Task 5: Update Convert tracking in `grocery.html` to use dynamic product data

**Files:**
- Modify: `grocery.html`

The `_conv_product_sku`, `_conv_product_name`, and `_conv_product_price` variables in the Convert block are currently hardcoded. `script.js` already updates them after the API call. But we need to make the JS variables writable (i.e., declared with `var`, not `const`) — they already are. Verify the Convert block uses `var` declarations and that the variable names match exactly what `script.js` writes to.

- [ ] **Step 1: Verify Convert variables are declared with `var` in `grocery.html`**

Run: `grep -n "_conv_product" /Users/roshannagekar/Documents/convert/roshancart/grocery.html`
Expected output (all lines use `var`):
```
  var _conv_product_sku = "SKU-COOK-OIL-001";
  var _conv_product_name = "Cooking Oil";
  var _conv_product_price = "10.5";
```

- [ ] **Step 2: Confirm `script.js` updates match the exact variable names**

Run: `grep -n "_conv_product" /Users/roshannagekar/Documents/convert/roshancart/script.js`
Expected: lines assigning `_conv_product_name`, `_conv_product_price`, `_conv_product_sku`

- [ ] **Step 3: No code change needed — variables are already `var` and script.js updates them after load**

This task is a verification-only step. If grep output in Step 1 shows `const` or `let`, change them to `var`.

- [ ] **Step 4: Commit (only if changes were needed)**

```bash
git add grocery.html
git commit -m "ensure Convert tracking vars are var-declared for dynamic update"
```

---

## Task 6: Manual Shopify admin setup checklist

This task is done by the developer in the Shopify admin UI — not by code.

- [ ] **Step 1: Create development store**

Go to partners.shopify.com → Stores → Add store → Development store. Give it a name.

- [ ] **Step 2: Add 12 products with correct tags**

In Shopify admin → Products → Add product. Create these 12 products and add the tag matching their category:

| Product | Price | Tag |
|---------|-------|-----|
| Cooking Oil | $10.50 | grocery |
| Pasta | $6.25 | grocery |
| Instant Cupcake Mixture | $5.00 | grocery |
| All-in-1 | $260.00 | beauty |
| Zero Makeup Kit | $20.50 | beauty |
| Lip Tints | $12.75 | beauty |
| Lawn Dress | $15.00 | clothes |
| Lawn-Chiffon Combo | $15.00 | clothes |
| Toddler Frock | $10.50 | clothes |
| Metallic Shine Heels | $25.00 | shoes |
| Blood Red Combo | $20.50 | shoes |
| Rose Gold Sandals | $13.45 | shoes |

Upload the local images from `./images/` to each product.

- [ ] **Step 3: Create Storefront API access token**

Shopify admin → Settings → Apps and sales channels → Develop apps → Create an app → Configure Storefront API scopes:
- `unauthenticated_read_product_listings`
- `unauthenticated_read_product_inventory`
- `unauthenticated_write_checkouts`

Install the app → API credentials → Copy the Storefront API access token.

- [ ] **Step 4: Fill in `shopify-config.js`**

Open `shopify-config.js` and replace:
- `your-store.myshopify.com` with your actual store domain (e.g., `my-test-shop.myshopify.com`)
- `your-storefront-api-token` with the token copied in Step 3

- [ ] **Step 5: Commit config (token is public-safe for sandbox)**

```bash
git add shopify-config.js
git commit -m "populate Shopify dev store credentials in config"
```

---

## Task 7: End-to-end verification

- [ ] **Step 1: Open `grocery.html` in a browser**

Run a local server:
```bash
cd /Users/roshannagekar/Documents/convert/roshancart && python3 -m http.server 8080
```
Open: `http://localhost:8080/grocery.html`

Expected: Products load from Shopify within ~1–2 seconds, replacing "Loading products…" text. All 4 category sections show real products.

- [ ] **Step 2: Add an item to cart**

Click "Add to cart" on any product.
Expected:
- Sidebar updates with the product name, quantity, and price
- No console errors
- `sessionStorage` has `shopify_cart_id` and `shopify_checkout_url` set (check in DevTools → Application → Session Storage)

- [ ] **Step 3: Click Checkout from sidebar**

Click the "Checkout" button in the sidebar.
Expected: Browser redirects to `https://<your-store>.myshopify.com/checkouts/...` — the real Shopify checkout page showing the cart items.

- [ ] **Step 4: Verify modal cart**

Go back, add items, click "My Cart" in navbar.
Expected: Modal shows correct items, quantities, and total.

- [ ] **Step 5: Verify Convert tracking**

Open DevTools → Console. Run:
```js
console.log(_conv_product_name, _conv_product_price, _conv_product_sku);
```
Expected: real product name, price, and variant ID from Shopify (not the old hardcoded values).

- [ ] **Step 6: Verify `index.html` is unaffected**

Open `http://localhost:8080/index.html`. Expected: page loads normally, category buttons work, Convert tracking fires (check Network tab for Convert SDK request).

- [ ] **Step 7: Stop local server**

Press `Ctrl+C` in the terminal running the Python server.

---

## Task 8: Final commit and push

- [ ] **Step 1: Verify clean git status**

Run: `git status`
Expected: working tree clean (all changes committed)

- [ ] **Step 2: Push to remote**

```bash
git push origin main
```

Expected: GitHub Actions deploys to GitHub Pages automatically (check `.github/workflows/static.yml`).
