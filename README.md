# Collectible Car Models Store

A modern, responsive static e-commerce website for selling collectible scale model cars. Built with plain HTML, CSS, and JavaScript (no build step), optimized for performance, SEO, and delightful UX.

## Features
- Responsive layout with accessible components
- Homepage with hero and featured products
- Catalog with client-side search, filters, sort, and pagination
- Product detail with gallery, specs, reviews stub, and JSON-LD
- Cart and Wishlist using localStorage with persistent counters
- Checkout form with validation and order confirmation
- SEO: Meta tags, Open Graph, JSON-LD, sitemap, robots

## Run locally
```bash
# From the project root
python3 -m http.server 8000
# Open http://localhost:8000
```

## Structure
```
/ (project root)
  index.html
  catalog.html
  product.html
  cart.html
  wishlist.html
  checkout.html
  sitemap.xml
  robots.txt
  /assets
    /css
      styles.css
    /js
      app.js
  /data
    products.json
```

## Notes
- For demo images we use externally hosted images/placeholders. Replace with your own assets under `assets/images/` for production.
- This is a static demo; integrate with your backend or a headless CMS for real orders.