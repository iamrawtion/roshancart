# Shopify Storefront API Integration Design

## Goal

Wire the existing static ShopNow demo site to a Shopify development store using the Storefront API so that products are fetched dynamically, the cart is a real Shopify cart, and checkout redirects to Shopify's hosted checkout — all without a backend server.

---

## Architecture

Pure client-side. The browser calls Shopify's Storefront API (GraphQL) directly using a public Storefront access token. No backend server is needed. A single `shopify-config.js` file holds the store domain and token — the one place to configure credentials.

The existing 4-page flow (Home → Products → Checkout → Thank You) stays intact. Bootstrap layout, CSS, images, and Convert tracking all remain unchanged.

---

## Pages & Changes

### `shopify-config.js` (new)
Exports two constants: `SHOPIFY_DOMAIN` and `SHOPIFY_STOREFRONT_TOKEN`. Loaded before `script.js` on every page that needs API access.

### `grocery.html`
- Remove all 12 hardcoded product card `<div>` blocks
- Add a `<div id="products-container">` loading skeleton placeholder per category
- Load `shopify-config.js` + updated `script.js`
- After Shopify products load, update `_conv_product_sku`, `_conv_product_name`, `_conv_product_price` with real values from the first product returned

### `script.js`
- Remove hardcoded `products` object
- Add `fetchProducts()` — GraphQL query to Shopify Storefront API, fetches all products with title, price, images, variantId, and tags (used for category grouping)
- Add `renderProducts(products)` — groups products by tag/category, renders Bootstrap cards dynamically
- Replace `addToCart(x)` with `addToCart(variantId, title, price)` — creates or updates a Shopify Storefront cart via GraphQL mutation, stores `cartId` and `checkoutUrl` in `sessionStorage`
- `updateSidebar()` and modal cart UI remain, fed from an in-memory cart array
- Checkout button reads `checkoutUrl` from `sessionStorage` and redirects

### `checkout.html`
- The "Buy" button redirects to the Shopify checkout URL stored in `sessionStorage` instead of `thankyou.html`
- `checkout.js` `validate()` function updated accordingly

### `thankyou.html`
- Kept as-is for direct testing of the Convert `purchase` page type
- Not part of the main checkout flow (Shopify handles order confirmation)

### `index.html`
- No structural changes — category buttons link to `grocery.html#<section>` as before
- Convert tracking variables unchanged

---

## Data Flow

```
Page load (grocery.html)
  → fetchProducts() via Storefront API GraphQL
  → renderProducts() groups by tag, renders cards
  → update _conv_* variables with first product data

User clicks "Add to cart"
  → addToCart(variantId, title, price)
  → cartCreate or cartLinesAdd GraphQL mutation
  → store cartId + checkoutUrl in sessionStorage
  → updateSidebar() re-renders sidebar

User clicks "Checkout"
  → read checkoutUrl from sessionStorage
  → window.location.href = checkoutUrl
  → Shopify hosted checkout
```

---

## Shopify Admin Setup (prerequisites)

1. Create a development store at partners.shopify.com
2. Add 12 products matching the 4 categories — tag each product with its category: `grocery`, `beauty`, `clothes`, `shoes`
3. Admin → Apps → Develop apps → Create app → Configure Storefront API scopes: `unauthenticated_read_product_listings`, `unauthenticated_write_checkouts`, `unauthenticated_write_customers`
4. Copy the Storefront API access token into `shopify-config.js`

---

## Convert Tracking

| Page | `_conv_page_type` | Dynamic updates |
|---|---|---|
| index.html | `home` | None |
| grocery.html | `category` | `_conv_product_sku`, `_conv_product_name`, `_conv_product_price` updated after API load |
| checkout.html | `checkout` | None (static values, sandbox) |
| thankyou.html | `purchase` | None (static values, sandbox) |

---

## What Does NOT Change

- Bootstrap 4.3.1 layout and all CSS files
- Font Awesome icons
- Convert Experiences SDK script on all pages
- Sidebar cart UI structure and modal cart UI
- GitHub Pages deployment workflow
- Product images (local `./images/` files)
