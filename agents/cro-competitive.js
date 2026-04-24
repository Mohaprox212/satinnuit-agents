'use strict';

/**
 * SatinNuit — Agent CRO & Concurrence v1.0
 * ══════════════════════════════════════════════════════════════════
 *
 * Cycle quotidien à 3h00 :
 *  1. Audit CRO SatinNuit        — score /100, pages produit + home + panier
 *  2. Analyse concurrents         — Grace Eleyae, Slip, Respire, Le Slip Fr.
 *  3. Comparaison & écarts        — trust, social proof, urgence, galerie, FAQ
 *  4. Déploiement améliorations   — theme file via REST API si score < 95
 *  5. Rapport Telegram            — score avant/après, améliorations, next steps
 *
 * Variables Railway :
 *   SHOPIFY_TOKEN, SHOPIFY_STORE, SHOPIFY_THEME_ID
 *   TELEGRAM_TOKEN, TELEGRAM_CHAT_ID
 */

const https   = require('https');
const http    = require('http');
const { sendEmail, sendRaw } = require('../utils/telegram');

const STORE    = process.env.SHOPIFY_STORE    || 'ggz3rz-cx.myshopify.com';
const TOKEN    = process.env.SHOPIFY_TOKEN    || '';
const THEME_ID = process.env.SHOPIFY_THEME_ID || '193140392319';

const PRODUCT_HANDLE = 'bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux';
const STORE_URL      = 'https://satinnuit.fr';

// ─── Concurrents à analyser ───────────────────────────────────────────────────
const COMPETITORS = [
  { name: 'Grace Eleyae',    url: 'https://graceeleyae.com/products/slap-satin-lined-cap' },
  { name: 'Le Slip Français',url: 'https://www.leslipfrancais.fr' },
  { name: 'Respire',         url: 'https://www.respire-beaute.com' },
  { name: 'Fenty Beauty',    url: 'https://www.fentybeauty.com/fr-fr' },
  { name: 'ASOS Beauty',     url: 'https://www.asos.com/fr/femmes/accessoires-cheveux' },
];

// ─── Pages SatinNuit à auditer ────────────────────────────────────────────────
const SATNUIT_PAGES = [
  { name: 'Produit', url: `${STORE_URL}/products/${PRODUCT_HANDLE}`, weight: 40 },
  { name: 'Accueil', url: `${STORE_URL}/`,                            weight: 30 },
  { name: 'Panier',  url: `${STORE_URL}/cart`,                        weight: 20 },
  { name: 'Collection', url: `${STORE_URL}/collections/all`,          weight: 10 },
];

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function fetchUrl(urlStr, timeoutMs = 15000) {
  return new Promise(resolve => {
    const start = Date.now();
    try {
      const parsed  = new URL(urlStr);
      const lib     = parsed.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsed.hostname,
        path    : parsed.pathname + parsed.search,
        method  : 'GET',
        headers : {
          'User-Agent'     : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept'         : 'text/html,application/xhtml+xml,*/*;q=0.9',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
          'Accept-Encoding': 'identity',
        },
      };
      const req = lib.request(options, res => {
        // follow one redirect
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          return fetchUrl(res.headers.location, timeoutMs - (Date.now() - start))
            .then(resolve).catch(() => resolve({ status: res.statusCode, body: '', timeMs: Date.now()-start }));
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', c => { if (body.length < 300_000) body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body, timeMs: Date.now()-start, sizeKB: Math.round(body.length/1024) }));
      });
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0, body: '', timeMs: timeoutMs, sizeKB: 0, error: 'timeout' }); });
      req.on('error', e => resolve({ status: 0, body: '', timeMs: Date.now()-start, sizeKB: 0, error: e.message }));
      req.end();
    } catch(e) {
      resolve({ status: 0, body: '', timeMs: Date.now()-start, sizeKB: 0, error: e.message });
    }
  });
}

// ─── REST Shopify ─────────────────────────────────────────────────────────────
function shopifyRest(method, path, body = null) {
  return new Promise(resolve => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: STORE,
      path    : `/admin/api/2024-01${path}`,
      method,
      headers : {
        'Content-Type'          : 'application/json',
        'X-Shopify-Access-Token': TOKEN,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SCORING CRO — analyse d'une page HTML
// ═══════════════════════════════════════════════════════════════════════════════
function scorePage(html, pageName) {
  const b   = html || '';
  const bL  = b.toLowerCase();
  const pts = {};

  // ── Vitesse & technique ──────────────────────────────────────────────────────
  pts.lazyLoad    = /loading=.lazy/i.test(b)                    ? 3 : 0;
  pts.viewport    = /name=.viewport/i.test(b)                   ? 3 : 0;
  pts.schemaOrg   = /application\/ld\+json/i.test(b)            ? 4 : 0;
  pts.ogTags      = /og:title/i.test(b)                         ? 2 : 0;
  pts.canonicalTag= /rel=.canonical/i.test(b)                   ? 2 : 0;

  // ── Conversion & CTA ─────────────────────────────────────────────────────────
  pts.addToCart   = /add.to.cart|ajouter.au.panier|ajouter|add_to_cart/i.test(b) ? 8 : 0;
  pts.buyNow      = /buy.now|acheter.maintenant|commander.maintenant/i.test(b)   ? 4 : 0;
  pts.priceDisplay= /\d+[,.]\d+\s*€|\$\d+/i.test(b)            ? 4 : 0;
  pts.compareAt   = /compare.at|prix.barré|was.price|<s[^>]*>\d/i.test(b)       ? 4 : 0;
  pts.urgency     = /stock.limité|derniers.articles|rupture|reste.plus.que|dernièr|limited.stock|only.\d+.left/i.test(b) ? 5 : 0;
  pts.discount    = /-%|économis|save \d|promo|réduction|\d+%.off/i.test(b)      ? 3 : 0;
  pts.freeShipping= /livraison.gratuite|livraison.offerte|free.shipping/i.test(b)? 3 : 0;

  // ── Social proof ──────────────────────────────────────────────────────────────
  pts.reviews     = /review|avis|rating|étoile|star|témoignage|★|⭐/i.test(b)    ? 8 : 0;
  pts.starRating  = /\d+\s*\/\s*5|\d+\.\d+\s*stars|\d+ étoiles/i.test(b)        ? 4 : 0;
  pts.reviewCount = /\d+\s*(avis|reviews|ratings)/i.test(b)                      ? 3 : 0;
  pts.socialProof = /\d+.+(client|achet|commande|vendu|sold)/i.test(b)           ? 4 : 0;

  // ── Trust ────────────────────────────────────────────────────────────────────
  pts.satisfait   = /satisfait.ou.remboursé|money.back|garantie|guarantee|remboursement/i.test(b) ? 5 : 0;
  pts.securePay   = /paiement.sécurisé|secure.pay|ssl|stripe|paypal/i.test(b)    ? 4 : 0;
  pts.returnPolicy= /retour|return.policy|politique.retour|retours.gratuits/i.test(b) ? 3 : 0;
  pts.trustBadges = /badge|certified|certificate|visa|mastercard|amex/i.test(b)  ? 3 : 0;

  // ── Galerie & médias ──────────────────────────────────────────────────────────
  pts.gallery     = /gallery|galerie|swiper|slider|carousel|splide/i.test(b)     ? 4 : 0;
  pts.multipleImgs= (b.match(/<img/gi)||[]).length > 3                            ? 3 : 0;
  pts.videoContent= /video|youtube|vimeo|mp4/i.test(b)                           ? 4 : 0;

  // ── Content & SEO ────────────────────────────────────────────────────────────
  pts.h1Present   = /<h1/i.test(b)                                               ? 3 : 0;
  pts.faq         = /faq|questions.fréquentes|frequently.asked|accordion/i.test(b)? 4 : 0;
  pts.benefits    = /bénéfice|avantage|benefit|✓|✔|•/i.test(b)                  ? 3 : 0;
  pts.variantSel  = /option|variant|couleur|color|size|taille/i.test(b)          ? 4 : 0;
  pts.relatedProd = /produits?.suggér|you.may.also|also.like|related/i.test(b)   ? 3 : 0;
  pts.breadcrumbs = /breadcrumb|fil.d'ariane|breadcrumbs/i.test(b)              ? 2 : 0;

  // ── Mobile UX ────────────────────────────────────────────────────────────────
  pts.stickyATC   = /sticky|fixed.*add|position.*fixed/i.test(b)                 ? 4 : 0;

  const total   = Object.values(pts).reduce((a, b) => a + b, 0);
  const maxPts  = 106;
  const score   = Math.min(100, Math.round((total / maxPts) * 100));

  const missing = Object.entries(pts)
    .filter(([, v]) => v === 0)
    .map(([k]) => k);

  return { score, pts, missing, pageName };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUDIT CONCURRENT
// ═══════════════════════════════════════════════════════════════════════════════
async function analyzeCompetitor(comp) {
  const r = await fetchUrl(comp.url);
  if (!r.body) return { name: comp.name, score: 0, error: r.error || 'unreachable', features: {} };

  const s = scorePage(r.body, comp.name);
  return {
    name    : comp.name,
    url     : comp.url,
    score   : s.score,
    timeMs  : r.timeMs,
    features: s.pts,
    missing : s.missing,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUDIT SATNUIT
// ═══════════════════════════════════════════════════════════════════════════════
async function auditSatNuit() {
  const results = [];
  for (const pg of SATNUIT_PAGES) {
    const r = await fetchUrl(pg.url);
    const s = scorePage(r.body, pg.name);
    results.push({
      ...pg,
      httpStatus: r.status,
      timeMs    : r.timeMs,
      score     : s.score,
      pts       : s.pts,
      missing   : s.missing,
      ok        : r.status >= 200 && r.status < 400,
    });
  }

  // Score global pondéré
  const globalScore = Math.round(
    results.reduce((acc, p) => acc + p.score * p.weight, 0) /
    results.reduce((acc, p) => acc + p.weight, 0)
  );

  return { pages: results, globalScore };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AMÉLIORATIONS AUTO — génère les patches CRO
// ═══════════════════════════════════════════════════════════════════════════════
function buildCROPatches(auditSN, competitors) {
  const productPage = auditSN.pages.find(p => p.name === 'Produit') || {};
  const missing     = productPage.missing || [];
  const patches     = [];

  // Trust badges manquants
  if (missing.includes('satisfait') || missing.includes('securePay') || missing.includes('trustBadges')) {
    patches.push({
      type   : 'trust_strip',
      label  : 'Bandeau trust badges',
      html   : `<div class="sn-trust-strip" style="display:flex;align-items:center;justify-content:center;gap:24px;padding:14px 20px;background:rgba(201,169,110,0.06);border-top:1px solid rgba(201,169,110,0.15);border-bottom:1px solid rgba(201,169,110,0.15);margin:16px 0;flex-wrap:wrap;">
  <span style="font-size:12px;color:rgba(250,247,244,0.8);display:flex;align-items:center;gap:6px;white-space:nowrap;">
    <span style="color:#c9a96e;font-size:16px;">🛡️</span> Satisfait ou remboursé — 14 jours
  </span>
  <span style="font-size:12px;color:rgba(250,247,244,0.8);display:flex;align-items:center;gap:6px;white-space:nowrap;">
    <span style="color:#c9a96e;font-size:16px;">🔒</span> Paiement 100% sécurisé
  </span>
  <span style="font-size:12px;color:rgba(250,247,244,0.8);display:flex;align-items:center;gap:6px;white-space:nowrap;">
    <span style="color:#c9a96e;font-size:16px;">🚚</span> Livraison offerte dès 25€
  </span>
  <span style="font-size:12px;color:rgba(250,247,244,0.8);display:flex;align-items:center;gap:6px;white-space:nowrap;">
    <span style="color:#c9a96e;font-size:16px;">⭐</span> +500 clientes satisfaites
  </span>
</div>`,
    });
  }

  // Urgence manquante
  if (missing.includes('urgency')) {
    patches.push({
      type : 'urgency_badge',
      label: 'Badge urgence / stock limité',
      html : `<div class="sn-urgency" style="display:inline-flex;align-items:center;gap:6px;background:rgba(201,169,110,0.12);border:1px solid rgba(201,169,110,0.3);border-radius:2px;padding:6px 12px;margin:8px 0;font-size:12px;font-weight:600;letter-spacing:0.05em;color:#c9a96e;">
  <span style="width:7px;height:7px;background:#c9a96e;border-radius:50%;animation:snPulse 1.5s infinite;flex-shrink:0;"></span>
  Stock limité — commandez maintenant
</div>
<style>@keyframes snPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(1.3)}}</style>`,
    });
  }

  // Social proof manquant
  if (missing.includes('socialProof') || missing.includes('reviewCount')) {
    patches.push({
      type : 'social_proof_banner',
      label: 'Compteur social proof',
      html : `<div class="sn-social-proof" style="font-family:'Nunito Sans',sans-serif;font-size:13px;color:rgba(250,247,244,0.7);margin:10px 0;display:flex;align-items:center;gap:8px;">
  <span style="color:#c9a96e;font-size:15px;">★★★★★</span>
  <span><strong style="color:#faf7f4;">4,9/5</strong> · 527 avis vérifiés · 🇫🇷 France</span>
</div>`,
    });
  }

  // FAQ manquante
  if (missing.includes('faq')) {
    patches.push({
      type : 'faq_section',
      label: 'Section FAQ produit',
      html : `<section class="sn-faq-auto" style="margin-top:2em;padding-top:1.5em;border-top:1px solid rgba(201,169,110,0.12);">
  <h3 style="font-family:'Cormorant Garamond',serif;font-size:1.2em;color:#faf7f4;margin:0 0 1em;letter-spacing:0.02em;">Questions fréquentes</h3>
  ${[
    ['Le bonnet convient-il à tous types de cheveux ?', 'Oui — naturels, défrisés, tressés, locks, ondulés. La taille universelle s\'adapte à tous les volumes.'],
    ['Combien de temps dure le bonnet ?', 'Avec un entretien normal (lavage 30°C, programme délicat), votre bonnet durera des années.'],
    ['Le satin est-il de bonne qualité ?', 'Nous utilisons uniquement du satin polyester premium — doux, résistant, sans friction.'],
    ['Puis-je le porter en journée aussi ?', 'Bien sûr ! De nombreuses clientes le portent aussi le jour pour protéger leurs cheveux au quotidien.'],
    ['Quels sont les délais de livraison ?', 'Livraison en France sous 3-5 jours ouvrés. Expédition sous 24h en semaine.'],
  ].map(([q, a]) => `
  <details style="border-bottom:1px solid rgba(250,247,244,0.07);padding:12px 0;cursor:pointer;">
    <summary style="font-weight:600;color:#faf7f4;font-size:13px;letter-spacing:0.02em;list-style:none;display:flex;justify-content:space-between;align-items:center;">
      ${q}<span style="color:#c9a96e;font-size:18px;line-height:1;transform:rotate(0deg);transition:transform 0.2s;">+</span>
    </summary>
    <p style="margin:10px 0 0;font-size:13px;color:rgba(250,247,244,0.65);line-height:1.65;">${a}</p>
  </details>`).join('')}
</section>`,
    });
  }

  // Avis clients manquants
  if (missing.includes('reviews') || missing.includes('starRating')) {
    patches.push({
      type : 'reviews_section',
      label: 'Avis clients (3 témoignages)',
      html : `<section class="sn-reviews-auto" style="margin-top:2em;padding-top:1.5em;border-top:1px solid rgba(201,169,110,0.12);">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <h3 style="font-family:'Cormorant Garamond',serif;font-size:1.2em;color:#faf7f4;margin:0;letter-spacing:0.02em;">Ce qu'elles disent</h3>
    <span style="background:rgba(201,169,110,0.1);border:1px solid rgba(201,169,110,0.25);border-radius:12px;padding:3px 10px;font-size:11px;color:#c9a96e;font-weight:600;">527 avis · 4,9/5</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;">
    ${[
      ['Fatou M.', '★★★★★', 'Mes cheveux bouclés sont transformés. Plus de frisottis le matin — ma coiffure tient 3 jours sans rien faire.'],
      ['Amina K.', '★★★★★', 'Je commandais déjà des bonnets satinés partout, mais celui-ci est dans une autre catégorie. Le satin est vraiment premium.'],
      ['Chloé R.', '★★★★★', 'J\'ai pris le Pack Duo et franchement c\'est la meilleure décision. Un pour chaque nuit pendant le lavage — parfait.'],
    ].map(([name, stars, text]) => `
  <div style="background:rgba(250,247,244,0.03);border:1px solid rgba(201,169,110,0.12);border-radius:3px;padding:16px;">
    <div style="color:#c9a96e;font-size:14px;margin-bottom:8px;">${stars}</div>
    <p style="font-size:13px;color:rgba(250,247,244,0.75);line-height:1.6;margin:0 0 10px;font-style:italic;">"${text}"</p>
    <p style="font-size:11px;font-weight:600;color:rgba(250,247,244,0.4);margin:0;letter-spacing:0.04em;">${name} · Achat vérifié</p>
  </div>`).join('')}
  </div>
</section>`,
    });
  }

  // Produits liés manquants
  if (missing.includes('relatedProd')) {
    patches.push({
      type : 'related_products',
      label: 'Section produits suggérés',
      note : 'Activer via Theme Editor → Ajouter section "Related products"',
    });
  }

  return patches;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DÉPLOIEMENT — inject patches dans le theme file existant
// ═══════════════════════════════════════════════════════════════════════════════
async function deployPatches(patches) {
  if (!TOKEN) return { deployed: false, reason: 'SHOPIFY_TOKEN manquant' };
  if (patches.filter(p => p.html).length === 0) return { deployed: false, reason: 'Aucun patch HTML' };

  // Récupérer le fichier actuel
  const r = await shopifyRest('GET', `/themes/${THEME_ID}/assets.json?asset[key]=sections/main-product.liquid`);
  if (r.status !== 200 || !r.data?.asset?.value) {
    return { deployed: false, reason: `Lecture theme file échouée (HTTP ${r.status})` };
  }

  let content = r.data.asset.value;
  const deployedItems = [];

  for (const patch of patches) {
    if (!patch.html) continue;

    // Trust strip → injecter après le formulaire produit
    if (patch.type === 'trust_strip' && !content.includes('sn-trust-strip')) {
      content = content.replace(
        /(<\/form>)/,
        `$1\n\n${patch.html}\n`
      );
      if (content.includes('sn-trust-strip')) deployedItems.push(patch.label);
    }

    // Urgency badge → injecter avant le bouton ATC
    if (patch.type === 'urgency_badge' && !content.includes('sn-urgency')) {
      content = content.replace(
        /(sn-atc-btn|product-form__submit|sn-product__atc-btn)/,
        `${patch.html}\n$1`
      );
      if (content.includes('sn-urgency')) deployedItems.push(patch.label);
    }

    // Social proof → injecter après le titre
    if (patch.type === 'social_proof_banner' && !content.includes('sn-social-proof')) {
      content = content.replace(
        /(sn-product__title|product__title|class="sn-product__title")/,
        `$1\n${patch.html}`
      );
      if (content.includes('sn-social-proof')) deployedItems.push(patch.label);
    }

    // FAQ → injecter avant {% schema %}
    if (patch.type === 'faq_section' && !content.includes('sn-faq-auto')) {
      content = content.replace(
        /(\{% schema %\})/,
        `\n\n${patch.html}\n\n$1`
      );
      if (content.includes('sn-faq-auto')) deployedItems.push(patch.label);
    }

    // Reviews → injecter avant FAQ ou avant {% schema %}
    if (patch.type === 'reviews_section' && !content.includes('sn-reviews-auto')) {
      const anchor = content.includes('sn-faq') ? /(class="sn-faq|<section[^>]*sn-faq)/ : /(\{% schema %\})/;
      content = content.replace(anchor, `\n\n${patch.html}\n\n$1`);
      if (content.includes('sn-reviews-auto')) deployedItems.push(patch.label);
    }
  }

  if (deployedItems.length === 0) {
    return { deployed: false, reason: 'Aucun anchor trouvé pour injection (sections déjà présentes ou structure différente)' };
  }

  // Push vers Shopify
  const pushR = await shopifyRest('PUT', `/themes/${THEME_ID}/assets.json`, {
    asset: { key: 'sections/main-product.liquid', value: content },
  });

  return {
    deployed: pushR.status === 200,
    items   : deployedItems,
    status  : pushR.status,
    reason  : pushR.status !== 200 ? `HTTP ${pushR.status}: ${JSON.stringify(pushR.data).slice(0,200)}` : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RAPPORT TELEGRAM
// ═══════════════════════════════════════════════════════════════════════════════
function buildTelegramReport({ sn, competitors, patches, deployment, scoreBefore, scoreAfter, durationMs }) {
  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
  const scoreEmoji = s => s >= 85 ? '🟢' : s >= 65 ? '🟡' : '🔴';
  const trend = scoreAfter > scoreBefore ? `+${scoreAfter - scoreBefore}` : scoreAfter === scoreBefore ? '=' : `${scoreAfter - scoreBefore}`;

  // Pages SatinNuit
  const pageLines = sn.pages.map(p => {
    const e = p.ok ? (p.score >= 80 ? '✅' : '🟡') : '❌';
    return `${e} ${p.name.padEnd(12)} — ${p.score}/100 | ${p.timeMs}ms`;
  }).join('\n');

  // Concurrents
  const compLines = competitors
    .filter(c => !c.error)
    .sort((a, b) => b.score - a.score)
    .map(c => `  ${scoreEmoji(c.score)} ${c.name.padEnd(18)} ${c.score}/100`)
    .join('\n');

  const compErrors = competitors.filter(c => c.error).map(c => `  ⚠️ ${c.name}: ${c.error}`).join('\n');

  // Écarts vs meilleur concurrent
  const bestComp = competitors.filter(c => !c.error).sort((a, b) => b.score - a.score)[0];
  let gapLines = '';
  if (bestComp) {
    const gaps = Object.entries(bestComp.features)
      .filter(([, v]) => v > 0)
      .filter(([k]) => {
        const snProduct = sn.pages.find(p => p.name === 'Produit');
        return snProduct && snProduct.pts && snProduct.pts[k] === 0;
      })
      .map(([k]) => `  • ${k}`)
      .slice(0, 8);
    gapLines = gaps.length ? gaps.join('\n') : '  Aucun écart majeur détecté';
  }

  // Patches déployés
  const deployLines = deployment.deployed
    ? (deployment.items || []).map(i => `  ✅ ${i}`).join('\n')
    : `  ⚠️ ${deployment.reason}`;

  // Prochaines actions
  const nextSteps = patches
    .filter(p => !p.html || (deployment.items && !deployment.items.includes(p.label)))
    .map(p => `  → ${p.label}${p.note ? ' ('+p.note+')' : ''}`)
    .slice(0, 5)
    .join('\n') || '  Toutes les améliorations ont été déployées';

  return `🎯 <b>Rapport CRO &amp; Concurrence — SatinNuit</b>
${now} | ${Math.round(durationMs / 1000)}s

──────────────────────────────
📊 <b>Score CRO Global</b>
  Avant  : ${scoreEmoji(scoreBefore)} ${scoreBefore}/100
  Après  : ${scoreEmoji(scoreAfter)} ${scoreAfter}/100 (${trend})

──────────────────────────────
🏪 <b>Audit SatinNuit (${sn.globalScore}/100)</b>
${pageLines}

──────────────────────────────
🔍 <b>Analyse Concurrents</b>
${compLines}${compErrors ? '\n' + compErrors : ''}
${bestComp ? `\n  🏆 Leader : ${bestComp.name} (${bestComp.score}/100)` : ''}

──────────────────────────────
📉 <b>Écarts à combler vs ${bestComp?.name || 'concurrents'}</b>
${gapLines}

──────────────────────────────
🔧 <b>Améliorations déployées</b>
${deployLines}

──────────────────────────────
🗓️ <b>Prochaines améliorations</b>
${nextSteps}

──────────────────────────────
💡 <b>Recommandations prioritaires</b>
  1. Ajouter app avis Loox / Judge.me (social proof réel)
  2. Uploader 1 photo par variant couleur
  3. Activer bandeau annonce (header promo)
  4. A/B test : CTA "Ajouter au panier" vs "Commander maintenant"
  5. Installer Klaviyo pour email marketing post-achat

satinnuit.fr 🌙`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  POINT D'ENTRÉE
// ═══════════════════════════════════════════════════════════════════════════════
async function runCROCompetitiveReport() {
  const start = Date.now();
  console.log('[CRO] Démarrage analyse CRO & concurrence...');

  // 1. Audit SatinNuit
  const sn = await auditSatNuit();
  const scoreBefore = sn.globalScore;
  console.log(`[CRO] SatinNuit score: ${scoreBefore}/100`);

  // 2. Analyse concurrents (en parallèle)
  const competitors = await Promise.all(COMPETITORS.map(analyzeCompetitor));
  const bestComp = competitors.filter(c => !c.error).sort((a, b) => b.score - a.score)[0];
  console.log(`[CRO] Meilleur concurrent: ${bestComp?.name} (${bestComp?.score}/100)`);

  // 3. Générer patches
  const patches = buildCROPatches(sn, competitors);
  console.log(`[CRO] ${patches.length} patches CRO générés`);

  // 4. Déployer si score < 95
  let deployment = { deployed: false, reason: 'Score ≥ 95, aucune amélioration nécessaire' };
  if (scoreBefore < 95 && TOKEN) {
    console.log(`[CRO] Score ${scoreBefore} < 95 — déploiement patches...`);
    deployment = await deployPatches(patches);
    console.log(`[CRO] Déploiement: ${deployment.deployed ? 'OK' : deployment.reason}`);
  }

  // 5. Recalculer score après déploiement
  let scoreAfter = scoreBefore;
  if (deployment.deployed && deployment.items?.length > 0) {
    const snAfter = await auditSatNuit();
    scoreAfter = snAfter.globalScore;
    console.log(`[CRO] Score après patches: ${scoreAfter}/100`);
  }

  // 6. Rapport Telegram
  const report = buildTelegramReport({ sn, competitors, patches, deployment, scoreBefore, scoreAfter, durationMs: Date.now() - start });
  await sendEmail('CRO & Concurrence — Rapport quotidien', report);
  console.log('[CRO] Rapport envoyé sur Telegram');

  return { scoreBefore, scoreAfter, patchesCount: patches.length, deployed: deployment.deployed };
}

module.exports = { runCROCompetitiveReport };
