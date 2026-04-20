'use strict';

/**
 * SatinNuit — Agent Design & Qualité
 *
 * Rôle (toutes les 24h) :
 *  1. Contrôle Qualité : vérifie toutes les pages de la boutique (HTTP)
 *  2. Audit produit    : variantes, stock, prix, images via API Shopify
 *  3. Amélioration SEO : met à jour la description produit si améliorable
 *  4. Rapport détaillé : envoie un email HTML complet à REPORT_EMAIL
 */

const https   = require('https');
const { gql, getProductVariants } = require('../utils/shopify');
const { runQAChecks }             = require('../utils/storefront');
const { sendEmail }               = require('../utils/telegram');

const STORE      = process.env.SHOPIFY_STORE || 'ggz3rz-cx.myshopify.com';
const TOKEN      = process.env.SHOPIFY_TOKEN || '';
const PRODUCT_GID = process.env.PRODUCT_GID || 'gid://shopify/Product/15619012886911';
const PRODUCT_HANDLE = 'bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux';

// ─── REST API helper ──────────────────────────────────────────────────────────

function shopifyRest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: STORE,
      path    : `/admin/api/2024-10${path}`,
      method,
      headers : {
        'Content-Type'           : 'application/json',
        'X-Shopify-Access-Token' : TOKEN,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Audit produit ────────────────────────────────────────────────────────────

async function auditProduct() {
  const product = await getProductVariants(PRODUCT_GID);
  const variants = product.variants?.nodes || [];

  const issues = [];
  const outOfStock = [];
  const lowStock   = [];
  const noImage    = [];

  // Vérification via REST pour avoir accès aux images
  const restResp = await shopifyRest('GET', `/products/${PRODUCT_GID.split('/').pop()}.json`);
  const restProduct = restResp.data?.product || {};
  const images = restProduct.images || [];
  const variantRest = restProduct.variants || [];

  // Map variantId → image
  const variantImageMap = {};
  for (const img of images) {
    for (const vid of (img.variant_ids || [])) {
      variantImageMap[vid] = img.src;
    }
  }

  for (const v of variantRest) {
    if (v.inventory_quantity !== undefined && v.inventory_quantity <= 0) {
      outOfStock.push(v.title);
    } else if (v.inventory_quantity !== undefined && v.inventory_quantity <= 3) {
      lowStock.push({ title: v.title, qty: v.inventory_quantity });
    }
    if (!variantImageMap[v.id]) {
      noImage.push(v.title);
    }
  }

  if (outOfStock.length > 0) issues.push(`⚠️ Rupture de stock : ${outOfStock.join(', ')}`);
  if (lowStock.length > 0)   issues.push(`📦 Stock faible (≤3) : ${lowStock.map(l => `${l.title} (${l.qty})`).join(', ')}`);
  if (noImage.length > 0)    issues.push(`🖼️ Variantes sans image : ${noImage.join(', ')}`);

  return {
    title       : restProduct.title || product.title,
    variantCount: variantRest.length,
    imageCount  : images.length,
    outOfStock,
    lowStock,
    noImage,
    issues,
    variants    : variantRest.map(v => ({
      title   : v.title,
      price   : v.price,
      stock   : v.inventory_quantity,
      hasImage: !!variantImageMap[v.id],
    })),
  };
}

// ─── Amélioration description produit ─────────────────────────────────────────

const OPTIMIZED_DESCRIPTION = `<div class="product-description">
  <h2>🌙 Bonnet Satin Nuit — Double Couche Réversible</h2>
  <p><strong>Protège et hydrate tous types de cheveux</strong> pendant votre sommeil grâce à notre bonnet en satin de qualité supérieure.</p>

  <h3>✨ Pourquoi choisir notre bonnet satin ?</h3>
  <ul>
    <li><strong>Double couche réversible</strong> — deux styles en un, pratique et élégant</li>
    <li><strong>Satin premium anti-frisottis</strong> — réduit les frottements nocturnes de 90%</li>
    <li><strong>Hydratation préservée</strong> — le satin ne pompe pas l'humidité de vos cheveux</li>
    <li><strong>Taille universelle</strong> — élastique souple adapté à toutes les coiffures</li>
    <li><strong>14 coloris disponibles</strong> — pour s'accorder à votre style</li>
  </ul>

  <h3>💆 Idéal pour</h3>
  <ul>
    <li>Cheveux naturels, défrisés, bouclés, crépus</li>
    <li>Locs, tresses, nattes, vanilles</li>
    <li>Extensions et perruques</li>
    <li>Toutes textures de cheveux</li>
  </ul>

  <h3>🛡️ Matière & Entretien</h3>
  <p>100% polyester satiné · Lavage à la main ou machine (30°C) · Séchage à l'air libre</p>

  <p><em>✅ Livraison rapide · 🔄 Retours faciles · 💬 Support client réactif</em></p>
</div>`;

async function improveProductDescription(productId) {
  const numericId = productId.split('/').pop();
  const resp = await shopifyRest('GET', `/products/${numericId}.json`);
  const current = resp.data?.product?.body_html || '';

  // On n'écrase que si la description actuelle est courte ou générique
  const needsUpdate = current.length < 300
    || !current.includes('Double couche')
    || !current.includes('ul>')
    || !current.includes('frisottis');

  if (!needsUpdate) {
    return { updated: false, reason: 'Description déjà optimisée' };
  }

  const updateResp = await shopifyRest('PUT', `/products/${numericId}.json`, {
    product: { id: numericId, body_html: OPTIMIZED_DESCRIPTION },
  });

  if (updateResp.status === 200) {
    return { updated: true, reason: 'Description mise à jour avec contenu optimisé SEO' };
  } else {
    return { updated: false, reason: `Erreur API: ${updateResp.status}` };
  }
}

// ─── Construction du rapport HTML ─────────────────────────────────────────────

function buildDesignReportHtml(qa, productAudit, descResult, durationMs) {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const scoreColor = qa.score >= 80 ? '#27ae60' : qa.score >= 60 ? '#f39c12' : '#e74c3c';
  const scoreBg    = qa.score >= 80 ? '#eafaf1' : qa.score >= 60 ? '#fef9e7' : '#fdedec';

  // ── Tableau des vérifications QA ──
  const qaRows = Object.entries(qa.checks).map(([key, check]) => {
    const icon   = check.pass ? '✅' : '❌';
    const rowBg  = check.pass ? '' : 'background:#fff5f5';
    const value  = check.value ? `<br><small style="color:#888">${escHtml(String(check.value).slice(0, 80))}</small>` : '';
    return `
      <tr style="${rowBg}">
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${icon}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px">${escHtml(check.label)}${value}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:12px;color:#999">
          ${'status' in check ? check.status : (check.pass ? 'OK' : 'FAIL')}
        </td>
      </tr>`;
  }).join('');

  // ── Tableau des variantes ──
  const variantRows = (productAudit.variants || []).map(v => {
    const stockColor = v.stock <= 0 ? '#e74c3c' : v.stock <= 3 ? '#f39c12' : '#27ae60';
    const imgIcon    = v.hasImage ? '🖼️' : '❌';
    return `
      <tr>
        <td style="padding:7px 12px;border-bottom:1px solid #f0f0f0;font-size:13px">${escHtml(v.title)}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px">${escHtml(v.price)}€</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;color:${stockColor}">
          <strong>${v.stock ?? 'N/A'}</strong>
        </td>
        <td style="padding:7px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${imgIcon}</td>
      </tr>`;
  }).join('');

  // ── Issues résumées ──
  const issueHtml = productAudit.issues.length
    ? productAudit.issues.map(i => `<li>${escHtml(i)}</li>`).join('')
    : '<li style="color:#27ae60">Aucun problème détecté ✅</li>';

  const descBadge = descResult.updated
    ? `<span style="background:#eafaf1;color:#27ae60;padding:2px 8px;border-radius:12px;font-size:12px">✅ Mise à jour</span>`
    : `<span style="background:#f0f0f0;color:#666;padding:2px 8px;border-radius:12px;font-size:12px">ℹ️ Inchangée</span>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<div style="max-width:700px;margin:0 auto;background:#fff">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:24px;font-weight:300;letter-spacing:2px">🌙 SATINNUIT</h1>
    <p style="color:#a0a8c0;margin:8px 0 0;font-size:13px">RAPPORT DESIGN & QUALITÉ</p>
    <p style="color:#7080a0;margin:4px 0 0;font-size:12px">${today}</p>
  </div>

  <!-- Score global -->
  <div style="background:${scoreBg};border-bottom:3px solid ${scoreColor};padding:24px;text-align:center">
    <div style="font-size:52px;font-weight:700;color:${scoreColor}">${qa.score}%</div>
    <div style="font-size:14px;color:#555;margin-top:4px">
      Score QA global — ${qa.passCount}/${qa.totalCount} vérifications réussies
    </div>
    <div style="font-size:12px;color:#999;margin-top:8px">Durée d'audit : ${(durationMs / 1000).toFixed(1)}s</div>
  </div>

  <!-- Alertes produit -->
  <div style="padding:24px">
    <h2 style="font-size:15px;font-weight:600;color:#1a1a2e;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px">
      🛒 Audit Produit — ${escHtml(productAudit.title || 'Bonnet Satin')}
    </h2>
    <div style="background:#f8f8f8;border-radius:8px;padding:16px;margin-bottom:16px">
      <p style="margin:0 0 8px;font-size:13px;color:#555">
        📦 <strong>${productAudit.variantCount}</strong> variantes ·
        🖼️ <strong>${productAudit.imageCount}</strong> images
      </p>
      <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;color:#444;line-height:1.8">
        ${issueHtml}
      </ul>
    </div>
    <p style="font-size:13px;margin:0 0 8px;color:#555">
      Description produit : ${descBadge}
      ${descResult.reason ? `<span style="color:#999;font-size:12px"> — ${escHtml(descResult.reason)}</span>` : ''}
    </p>
  </div>

  <!-- Tableau variantes -->
  <div style="padding:0 24px 24px">
    <h2 style="font-size:15px;font-weight:600;color:#1a1a2e;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px">
      🎨 État des variantes
    </h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f8f8f8">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Variante</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#666;font-weight:600">Prix</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#666;font-weight:600">Stock</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#666;font-weight:600">Image</th>
        </tr>
      </thead>
      <tbody>${variantRows || '<tr><td colspan="4" style="padding:16px;color:#999">Aucune variante</td></tr>'}</tbody>
    </table>
  </div>

  <!-- Tableau QA -->
  <div style="padding:0 24px 24px">
    <h2 style="font-size:15px;font-weight:600;color:#1a1a2e;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px">
      🔍 Contrôle Qualité — Pages vitrine
    </h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f8f8f8">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">État</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Vérification</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#666;font-weight:600">Code</th>
        </tr>
      </thead>
      <tbody>${qaRows}</tbody>
    </table>
  </div>

  <!-- Recommandations -->
  <div style="margin:0 24px 24px;background:#f0f4ff;border-radius:8px;padding:20px">
    <h3 style="margin:0 0 12px;font-size:14px;color:#3a3aff">🤖 Recommandations Agent IA</h3>
    <ul style="margin:0;padding-left:20px;color:#444;font-size:13px;line-height:1.9">
      ${buildRecommendations(qa, productAudit)}
    </ul>
  </div>

  <!-- Footer -->
  <div style="background:#1a1a2e;padding:20px;text-align:center">
    <a href="https://admin.shopify.com/store/ggz3rz-cx" style="color:#a0a8c0;font-size:12px;text-decoration:none">
      Voir le tableau de bord Shopify →
    </a>
    <p style="color:#505878;font-size:11px;margin:8px 0 0">
      SatinNuit Design & Quality Agent · Rapport automatique quotidien
    </p>
  </div>

</div>
</body>
</html>`;
}

function buildRecommendations(qa, productAudit) {
  const recs = [];

  if (qa.score >= 90) recs.push('🟢 Excellent score QA ! Boutique en très bon état.');
  else if (qa.score >= 70) recs.push('🟡 Score QA correct — quelques améliorations possibles ci-dessous.');
  else recs.push('🔴 Score QA faible — des corrections urgentes sont nécessaires.');

  if (!qa.checks.apropos_ok?.pass) {
    recs.push('📄 La page "À propos" retourne une erreur — vérifiez son handle dans l\'admin Shopify (Pages → À propos → modifier l\'URL).');
  }
  if (!qa.checks.product_schema?.pass) {
    recs.push('📊 Schema.org Product manquant — peut réduire la visibilité dans Google Shopping.');
  }
  if (!qa.checks.seo_title_length?.pass) {
    recs.push('📝 Longueur du titre produit à optimiser (idéal : 30-65 caractères).');
  }
  if (!qa.checks.seo_meta_length?.pass) {
    recs.push('📝 Meta description à rédiger (idéal : 100-160 caractères) — améliore le CTR sur Google.');
  }
  if (productAudit.outOfStock.length > 0) {
    recs.push(`⚠️ ${productAudit.outOfStock.length} couleur(s) en rupture de stock — réapprovisionnez rapidement pour ne pas perdre de ventes.`);
  }
  if (productAudit.lowStock.length > 0) {
    recs.push(`📦 ${productAudit.lowStock.length} couleur(s) avec stock ≤3 — commandez du réapprovisionnement.`);
  }
  if (productAudit.noImage.length > 0) {
    recs.push(`🖼️ ${productAudit.noImage.length} variante(s) sans image — ajoutez des photos pour chaque couleur.`);
  }
  if (!qa.checks.seo_img_alt?.pass) {
    recs.push('🖼️ Certaines images n\'ont pas d\'attribut alt — ajoutez des descriptions pour améliorer l\'accessibilité et le SEO.');
  }

  recs.push('📱 Testez votre boutique sur mobile (iPhone + Android) au moins une fois par semaine.');
  recs.push('⭐ Répondez aux avis clients dans les 48h pour améliorer votre taux de conversion.');

  return recs.map(r => `<li>${r}</li>`).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Point d'entrée principal ──────────────────────────────────────────────────

async function runDesignQualityReport() {
  const startMs = Date.now();
  console.log('[DQ] Démarrage agent Design & Qualité...');

  // 1. Contrôle QA storefront
  console.log('[DQ] Vérification des pages vitrine...');
  const qa = await runQAChecks(PRODUCT_HANDLE);
  console.log(`[DQ] QA : ${qa.score}% (${qa.passCount}/${qa.totalCount})`);

  // 2. Audit produit
  console.log('[DQ] Audit produit Shopify...');
  const productAudit = await auditProduct();
  console.log(`[DQ] Produit : ${productAudit.variantCount} variantes, ${productAudit.issues.length} problème(s)`);

  // 3. Amélioration description
  console.log('[DQ] Vérification description produit...');
  const descResult = await improveProductDescription(PRODUCT_GID);
  console.log(`[DQ] Description : ${descResult.reason}`);

  const durationMs = Date.now() - startMs;

  // 4. Email rapport
  const html = buildDesignReportHtml(qa, productAudit, descResult, durationMs);
  const date = new Date().toLocaleDateString('fr-FR');
  const emoji = qa.score >= 80 ? '✅' : qa.score >= 60 ? '⚠️' : '🚨';

  await sendEmail(
    `${emoji} SatinNuit — Rapport Design & Qualité ${date} · Score ${qa.score}%`,
    html,
  );

  console.log(`[DQ] Rapport envoyé (score ${qa.score}%) ✓`);

  return { score: qa.score, qa, productAudit, descResult };
}

module.exports = { runDesignQualityReport };
