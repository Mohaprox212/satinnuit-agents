'use strict';

const https = require('https');

const STORE_DOMAIN = process.env.STOREFRONT_DOMAIN || 'satinnuit.fr';

/**
 * Effectue un GET HTTP(S) sur la boutique vitrine.
 * @param {string} path
 * @returns {{ status: number, body: string, ok: boolean }}
 */
function fetchPage(path) {
  return new Promise((resolve) => {
    const url = `https://${STORE_DOMAIN}${path}`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SatinNuit-QA-Bot/1.0)',
        'Accept'    : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    }, (res) => {
      // Suivi des redirections (max 3)
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://${STORE_DOMAIN}${res.headers.location}`;
        https.get(loc, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SatinNuit-QA-Bot/1.0)' },
        }, (res2) => {
          let body = '';
          res2.on('data', c => body += c);
          res2.on('end', () => resolve({ status: res2.statusCode, body, ok: res2.statusCode < 400 }));
        }).on('error', () => resolve({ status: 0, body: '', ok: false }));
        return;
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, ok: res.statusCode < 400 }));
    });
    req.on('error', () => resolve({ status: 0, body: '', ok: false }));
  });
}

/**
 * Vérifie la présence d'un pattern HTML dans la page.
 */
function checkPresence(body, pattern) {
  if (typeof pattern === 'string') return body.includes(pattern);
  if (pattern instanceof RegExp) return pattern.test(body);
  return false;
}

/**
 * Lance tous les contrôles QA sur la vitrine.
 * @returns {Promise<QAReport>}
 */
async function runQAChecks(productHandle) {
  const handle = productHandle || 'bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux';

  const pages = {
    homepage: '/',
    product : `/products/${handle}`,
    cart    : '/cart',
    collections: '/collections/all',
    contact : '/pages/contact',
    apropos : '/pages/a-propos',
  };

  const checks = {};

  // ─── Récupération parallèle des pages ────────────────────────────────────────
  const results = {};
  await Promise.all(
    Object.entries(pages).map(async ([key, path]) => {
      results[key] = await fetchPage(path);
    })
  );

  // ─── Page d'accueil ───────────────────────────────────────────────────────────
  const home = results.homepage;
  checks.homepage_ok        = { pass: home.ok, label: 'Page d\'accueil accessible', status: home.status };
  checks.homepage_viewport  = { pass: checkPresence(home.body, 'name="viewport"'), label: 'Viewport meta présent' };
  checks.homepage_title     = { pass: checkPresence(home.body, /<title>[^<]{5,}/), label: 'Balise <title> renseignée' };
  checks.homepage_og        = { pass: checkPresence(home.body, 'og:title'), label: 'Open Graph title présent' };

  // ─── Page produit ─────────────────────────────────────────────────────────────
  const prod = results.product;
  checks.product_ok           = { pass: prod.ok, label: 'Page produit accessible', status: prod.status };
  checks.product_add_to_cart  = { pass: checkPresence(prod.body, /add.{0,20}cart|panier/i), label: 'Bouton "Ajouter au panier" présent' };
  checks.product_variant_pick = { pass: checkPresence(prod.body, /variant|couleur|color/i), label: 'Sélecteur de variante présent' };
  checks.product_price        = { pass: checkPresence(prod.body, /class="price|money|prix/i), label: 'Prix affiché' };
  checks.product_description  = { pass: checkPresence(prod.body, /<meta name="description"/i), label: 'Meta description présente' };
  checks.product_schema       = { pass: checkPresence(prod.body, '"@type":"Product"'), label: 'Schema.org Product présent' };
  checks.product_images       = { pass: checkPresence(prod.body, /product-image|ProductImage|\.image/i), label: 'Images produit détectées' };

  // Vérification que les images variantes changent (attribut data-image ou similar)
  const hasMediaGallery = checkPresence(prod.body, /media-gallery|MediaGallery|product__media/i);
  checks.product_media_gallery = { pass: hasMediaGallery, label: 'Galerie media produit présente' };

  // ─── Panier ───────────────────────────────────────────────────────────────────
  const cart = results.cart;
  checks.cart_ok       = { pass: cart.ok, label: 'Page panier accessible', status: cart.status };
  checks.cart_checkout = { pass: checkPresence(cart.body, /checkout|commander|paiement/i), label: 'Bouton checkout dans le panier' };

  // ─── Collection ───────────────────────────────────────────────────────────────
  const col = results.collections;
  checks.collections_ok      = { pass: col.ok, label: 'Page collections accessible', status: col.status };
  checks.collections_product = { pass: checkPresence(col.body, handle.slice(0, 20)), label: 'Produit visible dans la collection' };

  // ─── Pages secondaires ────────────────────────────────────────────────────────
  checks.contact_ok = { pass: results.contact.ok, label: 'Page contact accessible', status: results.contact.status };
  checks.apropos_ok = { pass: results.apropos.ok, label: 'Page "À propos" accessible', status: results.apropos.status };

  // ─── Analyse SEO produit ──────────────────────────────────────────────────────
  const seoChecks = analyzeSEO(prod.body);
  Object.assign(checks, seoChecks);

  // ─── Analyse mobile (heuristique) ────────────────────────────────────────────
  checks.mobile_viewport = { pass: checkPresence(home.body, 'width=device-width'), label: 'Viewport responsive' };
  checks.mobile_font_size = { pass: !checkPresence(prod.body, /font-size:\s*[0-9]{1,1}px/), label: 'Pas de polices trop petites (< 10px)' };

  const passCount = Object.values(checks).filter(c => c.pass).length;
  const totalCount = Object.keys(checks).length;

  return {
    passCount,
    totalCount,
    score     : Math.round((passCount / totalCount) * 100),
    checks,
    testedAt  : new Date().toISOString(),
  };
}

/**
 * Analyse SEO basique sur le HTML de la page produit.
 */
function analyzeSEO(html) {
  const checks = {};

  // Title longueur
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  checks.seo_title_length = {
    pass : title.length >= 30 && title.length <= 65,
    label: `Longueur title (${title.length} car.) — idéal 30-65`,
    value: title.slice(0, 70),
  };

  // Meta description longueur
  const metaMatch = html.match(/<meta name="description" content="([^"]+)"/i);
  const metaDesc = metaMatch ? metaMatch[1].trim() : '';
  checks.seo_meta_length = {
    pass : metaDesc.length >= 100 && metaDesc.length <= 160,
    label: `Longueur meta description (${metaDesc.length} car.) — idéal 100-160`,
    value: metaDesc.slice(0, 160),
  };

  // H1
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  checks.seo_h1 = {
    pass : !!h1Match,
    label: 'Balise H1 présente',
    value: h1Match ? h1Match[1].trim() : '',
  };

  // Alt attributes sur images
  const imgCount = (html.match(/<img /gi) || []).length;
  const altCount = (html.match(/<img [^>]*alt="[^"]+"/gi) || []).length;
  checks.seo_img_alt = {
    pass : imgCount === 0 || (altCount / imgCount) >= 0.8,
    label: `Images avec alt (${altCount}/${imgCount})`,
  };

  return checks;
}

module.exports = { fetchPage, runQAChecks };
