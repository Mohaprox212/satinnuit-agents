'use strict';

/**
 * SatinNuit — Agent Conversion
 *
 * Rôle :
 *  - Analyse les commandes Shopify en temps réel
 *  - Calcule les métriques de conversion quotidiennes
 *  - Envoie des rapports par email avec recommandations
 *  - Détecte les anomalies (pic de commandes, rupture de stock)
 */

const { getRecentOrders, getShopInfo, getProductVariants } = require('../utils/shopify');
const { sendEmail } = require('../utils/mailer');

const PRODUCT_GID = process.env.PRODUCT_GID || 'gid://shopify/Product/15619012886911';

// ─── Calcul des métriques ──────────────────────────────────────────────────────

function computeMetrics(orders) {
  const totalOrders  = orders.length;
  const totalRevenue = orders.reduce((sum, o) => {
    return sum + parseFloat(o.totalPriceSet?.shopMoney?.amount || 0);
  }, 0);

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Variantes les plus commandées
  const variantCounts = {};
  for (const order of orders) {
    for (const item of order.lineItems?.nodes || []) {
      const key = item.variantTitle || item.title;
      variantCounts[key] = (variantCounts[key] || 0) + item.quantity;
    }
  }

  const topVariants = Object.entries(variantCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  // Commandes par heure
  const hourCounts = Array(24).fill(0);
  for (const order of orders) {
    const h = new Date(order.createdAt).getHours();
    hourCounts[h]++;
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  return { totalOrders, totalRevenue, avgOrderValue, topVariants, peakHour };
}

// ─── Génération du rapport HTML ────────────────────────────────────────────────

function buildReportHtml(metrics, orders, period) {
  const { totalOrders, totalRevenue, avgOrderValue, topVariants, peakHour } = metrics;
  const currency = orders[0]?.totalPriceSet?.shopMoney?.currencyCode || 'EUR';

  const variantRows = topVariants.length
    ? topVariants.map(v => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${v.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center"><strong>${v.qty}</strong></td>
        </tr>`).join('')
    : '<tr><td colspan="2" style="padding:12px;color:#999">Aucune commande sur la période</td></tr>';

  const ordersList = orders.slice(0, 10).map(o => {
    const customer = o.customer
      ? `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim() || o.customer.email
      : 'Anonyme';
    const amount = parseFloat(o.totalPriceSet?.shopMoney?.amount || 0).toFixed(2);
    const items  = (o.lineItems?.nodes || []).map(i => `${i.quantity}× ${i.variantTitle || i.title}`).join(', ');
    const time   = new Date(o.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${o.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${customer}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${items}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right"><strong>${amount} ${currency}</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#999">${time}</td>
      </tr>`;
  }).join('');

  const peakLabel = peakHour !== undefined && totalOrders > 0
    ? `${peakHour}h–${peakHour + 1}h`
    : 'N/A';

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;background:#fff">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px;font-weight:300;letter-spacing:2px">🌙 SATINNUIT</h1>
      <p style="color:#a0a8c0;margin:8px 0 0;font-size:13px">RAPPORT DE CONVERSION — ${period.toUpperCase()}</p>
      <p style="color:#7080a0;margin:4px 0 0;font-size:12px">${today}</p>
    </div>

    <!-- KPI Cards -->
    <div style="display:flex;gap:0;border-bottom:2px solid #f0f0f0">
      <div style="flex:1;padding:24px;text-align:center;border-right:1px solid #f0f0f0">
        <div style="font-size:36px;font-weight:700;color:#1a1a2e">${totalOrders}</div>
        <div style="font-size:12px;color:#999;margin-top:4px;text-transform:uppercase;letter-spacing:1px">Commandes</div>
      </div>
      <div style="flex:1;padding:24px;text-align:center;border-right:1px solid #f0f0f0">
        <div style="font-size:36px;font-weight:700;color:#1a1a2e">${totalRevenue.toFixed(0)}€</div>
        <div style="font-size:12px;color:#999;margin-top:4px;text-transform:uppercase;letter-spacing:1px">Chiffre d'affaires</div>
      </div>
      <div style="flex:1;padding:24px;text-align:center;border-right:1px solid #f0f0f0">
        <div style="font-size:36px;font-weight:700;color:#1a1a2e">${avgOrderValue.toFixed(2)}€</div>
        <div style="font-size:12px;color:#999;margin-top:4px;text-transform:uppercase;letter-spacing:1px">Panier moyen</div>
      </div>
      <div style="flex:1;padding:24px;text-align:center">
        <div style="font-size:36px;font-weight:700;color:#1a1a2e">${peakLabel}</div>
        <div style="font-size:12px;color:#999;margin-top:4px;text-transform:uppercase;letter-spacing:1px">Heure de pointe</div>
      </div>
    </div>

    <!-- Top Variantes -->
    <div style="padding:24px">
      <h2 style="font-size:15px;font-weight:600;color:#1a1a2e;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px">
        🏆 Top couleurs commandées
      </h2>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8f8f8">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Variante</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#666;font-weight:600">Qté vendue</th>
          </tr>
        </thead>
        <tbody>${variantRows}</tbody>
      </table>
    </div>

    <!-- Dernières commandes -->
    <div style="padding:0 24px 24px">
      <h2 style="font-size:15px;font-weight:600;color:#1a1a2e;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px">
        📦 Dernières commandes
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f8f8f8">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">#</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Client</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Produit</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;color:#666;font-weight:600">Montant</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;font-weight:600">Heure</th>
          </tr>
        </thead>
        <tbody>
          ${ordersList || '<tr><td colspan="5" style="padding:16px;color:#999;text-align:center">Aucune commande</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Recommandations IA -->
    <div style="margin:0 24px 24px;background:#f0f4ff;border-radius:8px;padding:20px">
      <h3 style="margin:0 0 12px;font-size:14px;color:#3a3aff">🤖 Recommandations Agent IA</h3>
      <ul style="margin:0;padding-left:20px;color:#444;font-size:13px;line-height:1.8">
        ${totalOrders === 0 ? `
          <li>Aucune commande aujourd'hui — vérifiez vos publicités Meta/TikTok</li>
          <li>Lancez une promotion flash 24h (-15%) pour stimuler les ventes</li>
        ` : `
          <li>Continuez à mettre en avant les couleurs les plus vendues en priorité</li>
          ${totalOrders >= 5 ? `<li>Excellente journée ! ${totalOrders} commandes — CA total ${totalRevenue.toFixed(2)}€</li>` : ''}
          ${avgOrderValue < 20 ? `<li>Panier moyen faible (${avgOrderValue.toFixed(2)}€) — testez un bundle 2 bonnets à prix réduit</li>` : ''}
          ${peakHour >= 18 && peakHour <= 22 ? `<li>Pic de commandes le soir (${peakLabel}) — concentrez vos publicités entre 17h–22h</li>` : ''}
        `}
        <li>Pensez à répondre aux avis clients sur votre boutique</li>
      </ul>
    </div>

    <!-- Footer -->
    <div style="background:#1a1a2e;padding:20px;text-align:center">
      <a href="https://admin.shopify.com/store/ggz3rz-cx" style="color:#a0a8c0;font-size:12px;text-decoration:none">
        Voir le tableau de bord Shopify →
      </a>
      <p style="color:#505878;font-size:11px;margin:8px 0 0">
        SatinNuit Conversion Agent · Rapport automatique
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ─── Fonctions exportées ───────────────────────────────────────────────────────

/**
 * Rapport quotidien (déclenché par cron à 8h00 ou au démarrage).
 */
async function runDailyReport() {
  console.log('[AGENT] Récupération des commandes des 24 dernières heures...');
  const orders  = await getRecentOrders(24);
  const metrics = computeMetrics(orders);

  console.log(`[AGENT] ${metrics.totalOrders} commande(s) — ${metrics.totalRevenue.toFixed(2)}€ CA`);
  if (metrics.topVariants.length) {
    console.log(`[AGENT] Top couleur : ${metrics.topVariants[0].name} (×${metrics.topVariants[0].qty})`);
  }

  const html = buildReportHtml(metrics, orders, '24 dernières heures');
  const date = new Date().toLocaleDateString('fr-FR');
  await sendEmail(
    `🌙 SatinNuit — Rapport du ${date} : ${metrics.totalOrders} commande(s) · ${metrics.totalRevenue.toFixed(2)}€`,
    html,
  );

  return metrics;
}

/**
 * Vérification horaire légère — alerte si pic inhabituel.
 */
async function runHourlyCheck() {
  const orders = await getRecentOrders(1);
  if (orders.length >= 5) {
    console.log(`[AGENT] 🚀 Pic détecté : ${orders.length} commandes en 1 heure !`);
    const metrics = computeMetrics(orders);
    const html    = buildReportHtml(metrics, orders, 'dernière heure');
    await sendEmail(
      `🚀 SatinNuit — Pic de commandes : ${orders.length} en 1h !`,
      html,
    );
  } else if (orders.length > 0) {
    console.log(`[AGENT] Check horaire : ${orders.length} commande(s) sur la dernière heure`);
  }
}

/**
 * Statistiques rapides pour le endpoint /stats.
 */
async function getQuickStats() {
  const [orders24h, orders1h] = await Promise.all([
    getRecentOrders(24),
    getRecentOrders(1),
  ]);

  const m24 = computeMetrics(orders24h);
  const m1  = computeMetrics(orders1h);

  return {
    last24h: {
      orders      : m24.totalOrders,
      revenue     : `${m24.totalRevenue.toFixed(2)}€`,
      avgCart     : `${m24.avgOrderValue.toFixed(2)}€`,
      topVariant  : m24.topVariants[0]?.name || 'N/A',
      peakHour    : `${m24.peakHour}h`,
    },
    lastHour: {
      orders  : m1.totalOrders,
      revenue : `${m1.totalRevenue.toFixed(2)}€`,
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { runDailyReport, runHourlyCheck, getQuickStats };
