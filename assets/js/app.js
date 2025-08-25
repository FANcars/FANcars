(function () {
  const state = {
    products: [],
    productsLoaded: false,
  };

  const STORAGE_KEYS = {
    cart: 'cart',
    wishlist: 'wishlist',
  };

  function formatPrice(value, currency) {
    try {
      return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: currency || 'RUB', maximumFractionDigits: 0 }).format(value);
    } catch (e) {
      return value + ' ' + (currency || '₽');
    }
  }

  function getLocalStorageJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function setLocalStorageJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // ignore
    }
  }

  async function loadProducts() {
    if (state.productsLoaded) return state.products;
    const response = await fetch('data/products.json', { cache: 'no-store' });
    const data = await response.json();
    state.products = data;
    state.productsLoaded = true;
    return data;
  }

  function findProductById(productId) {
    return state.products.find(p => String(p.id) === String(productId));
  }

  function getCart() {
    return getLocalStorageJson(STORAGE_KEYS.cart, []);
  }

  function saveCart(cart) {
    setLocalStorageJson(STORAGE_KEYS.cart, cart);
    updateHeaderCounters();
  }

  function addToCart(productId, quantity) {
    const qty = Number(quantity || 1);
    const cart = getCart();
    const existing = cart.find(item => String(item.id) === String(productId));
    if (existing) {
      existing.quantity += qty;
    } else {
      cart.push({ id: productId, quantity: qty });
    }
    saveCart(cart);
  }

  function removeFromCart(productId) {
    const cart = getCart().filter(item => String(item.id) !== String(productId));
    saveCart(cart);
  }

  function setCartQuantity(productId, quantity) {
    const cart = getCart();
    const line = cart.find(item => String(item.id) === String(productId));
    if (line) {
      line.quantity = Math.max(1, Number(quantity || 1));
      saveCart(cart);
    }
  }

  function getWishlist() {
    return new Set(getLocalStorageJson(STORAGE_KEYS.wishlist, []));
  }

  function saveWishlist(set) {
    setLocalStorageJson(STORAGE_KEYS.wishlist, Array.from(set));
    updateHeaderCounters();
  }

  function toggleWishlist(productId) {
    const set = getWishlist();
    if (set.has(String(productId))) set.delete(String(productId)); else set.add(String(productId));
    saveWishlist(set);
    return set.has(String(productId));
  }

  function updateHeaderCounters() {
    const cartCountEl = document.querySelector('[data-cart-count]');
    const wishCountEl = document.querySelector('[data-wishlist-count]');
    if (cartCountEl) {
      const cart = getCart();
      const total = cart.reduce((sum, x) => sum + Number(x.quantity || 0), 0);
      cartCountEl.textContent = String(total);
      cartCountEl.style.display = total > 0 ? 'inline-flex' : 'none';
    }
    if (wishCountEl) {
      const wish = getWishlist();
      const total = wish.size;
      wishCountEl.textContent = String(total);
      wishCountEl.style.display = total > 0 ? 'inline-flex' : 'none';
    }
  }

  function productCardHtml(product) {
    const wish = getWishlist();
    const wished = wish.has(String(product.id));
    return `
      <article class="card" data-id="${product.id}">
        <a class="media" href="product.html?id=${encodeURIComponent(product.id)}" aria-label="${product.name}">
          <img src="${product.images[0]}" alt="${product.name}">
        </a>
        <div class="body">
          <div class="row"><span class="badge">${product.brand} • ${product.scale}</span>${product.featured ? '<span class="badge accent">Хит</span>' : ''}</div>
          <div class="title">${product.name}</div>
          <div class="meta">${product.year} • ${product.color} • ${product.material}</div>
          <div class="row">
            <div class="price">${formatPrice(product.price, product.currency)}</div>
          </div>
          <div class="actions">
            <button class="btn btn-primary" data-action="add-to-cart">В корзину</button>
            <button class="btn btn-ghost" data-action="toggle-wishlist">${wished ? 'В желаемом ✓' : 'В желаемое'}</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderProductsGrid(container, products) {
    container.innerHTML = products.map(productCardHtml).join('');
  }

  function handleGridActions(container) {
    container.addEventListener('click', (event) => {
      const target = event.target.closest('button');
      if (!target) return;
      const card = event.target.closest('[data-id]');
      if (!card) return;
      const productId = card.getAttribute('data-id');
      const action = target.getAttribute('data-action');
      if (action === 'add-to-cart') {
        addToCart(productId, 1);
        target.textContent = 'Добавлено ✓';
        setTimeout(() => { target.textContent = 'В корзину'; }, 800);
      }
      if (action === 'toggle-wishlist') {
        const active = toggleWishlist(productId);
        target.textContent = active ? 'В желаемом ✓' : 'В желаемое';
      }
    });
  }

  // Page initializers
  async function initHome() {
    const grid = document.querySelector('#featured-grid');
    if (!grid) return;
    const products = await loadProducts();
    const featured = products.filter(p => !!p.featured).slice(0, 8);
    renderProductsGrid(grid, featured);
    handleGridActions(grid);
  }

  function matchFilters(product, q, filters) {
    if (q) {
      const text = `${product.name} ${product.brand} ${product.model} ${product.color} ${product.scale}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    if (filters.brand && filters.brand !== 'all' && product.brand !== filters.brand) return false;
    if (filters.scale && filters.scale !== 'all' && product.scale !== filters.scale) return false;
    if (filters.material && filters.material !== 'all' && product.material !== filters.material) return false;
    const priceMin = Number(filters.priceMin || 0);
    const priceMax = Number(filters.priceMax || 0);
    if (priceMin && product.price < priceMin) return false;
    if (priceMax && product.price > priceMax) return false;
    return true;
  }

  function sortProducts(products, sort) {
    const arr = [...products];
    switch (sort) {
      case 'price-asc': arr.sort((a,b) => a.price - b.price); break;
      case 'price-desc': arr.sort((a,b) => b.price - a.price); break;
      case 'year-desc': arr.sort((a,b) => b.year - a.year); break;
      case 'year-asc': arr.sort((a,b) => a.year - b.year); break;
      default: arr.sort((a,b) => Number(b.featured) - Number(a.featured));
    }
    return arr;
  }

  async function initCatalog() {
    const grid = document.querySelector('#catalog-grid');
    if (!grid) return;
    const products = await loadProducts();

    // Populate filter dropdowns
    const brands = Array.from(new Set(products.map(p => p.brand))).sort();
    const scales = Array.from(new Set(products.map(p => p.scale))).sort();
    const materials = Array.from(new Set(products.map(p => p.material))).sort();
    function fillSelect(id, values) {
      const select = document.getElementById(id);
      if (!select) return;
      select.innerHTML = '<option value="all">Все</option>' + values.map(v => `<option value="${v}">${v}</option>`).join('');
    }
    fillSelect('filter-brand', brands);
    fillSelect('filter-scale', scales);
    fillSelect('filter-material', materials);

    let q = '';
    let sort = 'featured';
    let page = 1;
    const pageSize = 12;
    const filters = { brand: 'all', scale: 'all', material: 'all', priceMin: '', priceMax: '' };

    const qInput = document.getElementById('search');
    const brandSelect = document.getElementById('filter-brand');
    const scaleSelect = document.getElementById('filter-scale');
    const materialSelect = document.getElementById('filter-material');
    const priceMinInput = document.getElementById('price-min');
    const priceMaxInput = document.getElementById('price-max');
    const sortSelect = document.getElementById('sort');
    const pagerEl = document.getElementById('pager');

    function apply() {
      const qv = (qInput.value || '').trim().toLowerCase();
      const filtered = products.filter(p => matchFilters(p, qv, filters));
      const sorted = sortProducts(filtered, sortSelect.value);
      const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
      if (page > totalPages) page = totalPages;
      const start = (page - 1) * pageSize;
      const pageItems = sorted.slice(start, start + pageSize);
      renderProductsGrid(grid, pageItems);
      handleGridActions(grid);
      // pager
      pagerEl.innerHTML = '';
      for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = 'btn' + (i === page ? ' btn-secondary' : '');
        btn.textContent = String(i);
        btn.addEventListener('click', () => { page = i; apply(); });
        pagerEl.appendChild(btn);
      }
      document.getElementById('results-count').textContent = String(filtered.length);
    }

    function syncFilters() {
      filters.brand = brandSelect.value;
      filters.scale = scaleSelect.value;
      filters.material = materialSelect.value;
      filters.priceMin = priceMinInput.value;
      filters.priceMax = priceMaxInput.value;
      page = 1;
      apply();
    }

    qInput.addEventListener('input', () => { page = 1; apply(); });
    brandSelect.addEventListener('change', syncFilters);
    scaleSelect.addEventListener('change', syncFilters);
    materialSelect.addEventListener('change', syncFilters);
    priceMinInput.addEventListener('change', syncFilters);
    priceMaxInput.addEventListener('change', syncFilters);
    sortSelect.addEventListener('change', () => { page = 1; apply(); });

    apply();
  }

  async function initProduct() {
    const container = document.getElementById('product-container');
    if (!container) return;
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    const products = await loadProducts();
    const product = products.find(p => String(p.id) === String(id)) || products[0];
    if (!product) return;

    document.title = product.name + ' — ModelCars';

    container.innerHTML = `
      <div class="grid" style="grid-template-columns: 1.1fr 1fr; gap: 24px;">
        <section class="panel" style="background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px;">
          <div class="gallery">
            <img id="main-image" src="${product.images[0]}" alt="${product.name}">
            <div class="thumbs">${product.images.map(src => `<img src="${src}" alt="${product.name}">`).join('')}</div>
          </div>
        </section>
        <section class="panel" style="background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: grid; gap: 12px;">
          <div class="row"><span class="badge">${product.brand}</span><span class="badge">${product.scale}</span><span class="badge">${product.material}</span></div>
          <h1 style="margin: 6px 0 0;">${product.name}</h1>
          <div class="meta">${product.year} • ${product.color}</div>
          <div class="price" style="font-size: 24px;">${formatPrice(product.price, product.currency)}</div>
          <div class="cta-row">
            <button id="add-to-cart" class="btn btn-primary">Добавить в корзину</button>
            <button id="toggle-wishlist" class="btn btn-ghost">В желаемое</button>
          </div>
          <div class="banner">${product.stock > 0 ? 'В наличии: ' + product.stock + ' шт.' : 'Нет в наличии'}</div>
          <p>${product.description}</p>
          <table class="table">
            <tbody>
              <tr><th>Бренд</th><td>${product.brand}</td></tr>
              <tr><th>Модель</th><td>${product.model}</td></tr>
              <tr><th>Масштаб</th><td>${product.scale}</td></tr>
              <tr><th>Год</th><td>${product.year}</td></tr>
              <tr><th>Материал</th><td>${product.material}</td></tr>
              <tr><th>Цвет</th><td>${product.color}</td></tr>
            </tbody>
          </table>
        </section>
      </div>
      <section class="section">
        <h2>Похожие товары</h2>
        <div id="related-grid" class="grid products"></div>
      </section>
    `;

    const thumbs = container.querySelectorAll('.thumbs img');
    const mainImage = container.querySelector('#main-image');
    thumbs.forEach(img => img.addEventListener('click', () => { mainImage.src = img.src; }));

    const wishBtn = container.querySelector('#toggle-wishlist');
    const inWish = getWishlist().has(String(product.id));
    wishBtn.textContent = inWish ? 'В желаемом ✓' : 'В желаемое';
    wishBtn.addEventListener('click', () => { const active = toggleWishlist(product.id); wishBtn.textContent = active ? 'В желаемом ✓' : 'В желаемое'; });

    container.querySelector('#add-to-cart').addEventListener('click', () => addToCart(product.id, 1));

    const related = state.products.filter(p => p.id !== product.id && (p.brand === product.brand || p.scale === product.scale)).slice(0, 8);
    const relatedGrid = document.getElementById('related-grid');
    renderProductsGrid(relatedGrid, related);
    handleGridActions(relatedGrid);

    // JSON-LD
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.description,
      image: product.images,
      brand: { '@type': 'Brand', name: product.brand },
      offers: {
        '@type': 'Offer',
        priceCurrency: product.currency || 'RUB',
        price: String(product.price),
        availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: location.href
      }
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  }

  async function initCart() {
    const tbody = document.querySelector('#cart-body');
    if (!tbody) return;
    await loadProducts();

    function refresh() {
      const cart = getCart();
      tbody.innerHTML = '';
      if (cart.length === 0) {
        document.getElementById('cart-empty').style.display = 'block';
        document.getElementById('cart-summary').style.display = 'none';
        return;
      } else {
        document.getElementById('cart-empty').style.display = 'none';
        document.getElementById('cart-summary').style.display = 'block';
      }
      let subtotal = 0;
      for (const line of cart) {
        const product = findProductById(line.id);
        if (!product) continue;
        const lineTotal = product.price * line.quantity;
        subtotal += lineTotal;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="display:flex; gap:10px; align-items:center;">
            <img src="${product.images[0]}" alt="${product.name}" style="width:64px; height:48px; object-fit:cover; border-radius:8px; border:1px solid var(--border);">
            <a href="product.html?id=${product.id}">${product.name}</a>
          </td>
          <td>${formatPrice(product.price, product.currency)}</td>
          <td>
            <input type="number" min="1" value="${line.quantity}" style="width:80px" data-qty="${product.id}">
          </td>
          <td>${formatPrice(lineTotal, product.currency)}</td>
          <td><button class="btn" data-remove="${product.id}">Удалить</button></td>
        `;
        tbody.appendChild(tr);
      }
      document.getElementById('subtotal').textContent = formatPrice(subtotal);
      const shipping = subtotal > 10000 ? 0 : 700;
      document.getElementById('shipping').textContent = shipping === 0 ? 'Бесплатно' : formatPrice(shipping);
      document.getElementById('total').textContent = formatPrice(subtotal + shipping);
    }

    tbody.addEventListener('change', (e) => {
      const input = e.target.closest('input[data-qty]');
      if (!input) return;
      setCartQuantity(input.getAttribute('data-qty'), Number(input.value));
      refresh();
    });
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-remove]');
      if (!btn) return;
      removeFromCart(btn.getAttribute('data-remove'));
      refresh();
    });

    refresh();
  }

  async function initWishlist() {
    const grid = document.querySelector('#wishlist-grid');
    if (!grid) return;
    const products = await loadProducts();
    const wish = getWishlist();
    const items = products.filter(p => wish.has(String(p.id)));
    if (items.length === 0) {
      document.getElementById('wishlist-empty').style.display = 'block';
      grid.style.display = 'none';
    } else {
      document.getElementById('wishlist-empty').style.display = 'none';
      grid.style.display = '';
      renderProductsGrid(grid, items);
      handleGridActions(grid);
    }
  }

  function initCheckout() {
    const form = document.getElementById('checkout-form');
    if (!form) return;
    const stored = getCart();
    if (!stored.length) {
      const warn = document.getElementById('checkout-empty');
      if (warn) warn.style.display = 'block';
      form.style.display = 'none';
      return;
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // Fake submit
      setLocalStorageJson(STORAGE_KEYS.cart, []);
      updateHeaderCounters();
      location.href = 'checkout.html#success';
    });
  }

  function initCommon() {
    updateHeaderCounters();
    const searchQuick = document.querySelector('#search-quick');
    if (searchQuick) {
      const form = searchQuick.closest('form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = (searchQuick.value || '').trim();
        location.href = 'catalog.html?q=' + encodeURIComponent(q);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    initCommon();
    const page = document.body.getAttribute('data-page');
    if (page === 'home') await initHome();
    if (page === 'catalog') await initCatalog();
    if (page === 'product') await initProduct();
    if (page === 'cart') await initCart();
    if (page === 'wishlist') await initWishlist();
    if (page === 'checkout') initCheckout();
  });
})();