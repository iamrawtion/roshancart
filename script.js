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
            _conv_product_name = first.title;
            _conv_product_price = first.price;
            // Use variantId as SKU — Storefront API doesn't expose SKU without extra scope
            _conv_product_sku = first.variantId;
        }
    }

    CATEGORY_ORDER.forEach(category => {
        const container = document.getElementById(`products-${category}`);
        if (!container) return;
        const categoryProducts = products.filter(p => p.tags.includes(category));
        if (categoryProducts.length === 0) {
            container.innerHTML = '<p class="text-center text-muted col-12">No products found in Shopify for this category.</p>';
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
        li.innerHTML = `${item.title} <span class="price">x${item.quantity} &mdash; $${(item.price * item.quantity).toFixed(2)}</span>`;
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
        li.innerHTML = `${item.title} <span class="price">x${item.quantity} &mdash; $${(item.price * item.quantity).toFixed(2)}</span>`;
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
