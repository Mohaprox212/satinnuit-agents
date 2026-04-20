'use strict';

/**
 * SatinNuit — Agent Finance Autonome
 *
 * Actions quotidiennes (7h30 Paris) :
 *  1. Récupère toutes les commandes du jour, de la semaine, du mois via Shopify GraphQL
 *  2. Calcule la marge nette par commande (prix - COGS - Shopify fees - livraison)
 *  3. Analyse les tendances : couleurs, pays, heures, paniers
 *  4. Compare les périodes (J-7, M-1) pour détecter les tendances
 *  5. Détecte les anomalies (chute des ventes, marges anormales, remboursements)
 *  6. Envoie un rapport financier complet par email
 *
 * ─── Modèle financier ───────────────────────────────────────────────────────
 *  Prix de vente    : 14,99 € (SELL_PRICE)
 *  Coût produit     : 1,38 €  (COGS)
 *  Frais Shopify    : 1,9% + 0,10 € (plan Basic avec Shopify Payments France)
 *  Frais livraison  : ~4,50 € France / ~6,00 € international (estimé)
 *  ─────────────────────────────────────────
 *  Marge brute      : 14,99 - 1,38 = 13,61 €  (90,8%)
 *  Frais gateway    : ~0,39 €
 *  Frais livraison  : ~4,50 €
 *  Marge nette est. : ~8,72 €  (~58%)
 */

const https   = require('https');
const { sendEmail } = require('../utils/telegram');

const STORE = process.env.SHOPIFY_STORE || 'ggz3rz-cx.myshopify.com';
const TOKEN = process.env.SHOPIFY_TOKEN || '';

// ─── Constantes financières (configurables via env) ───────────────────────────

const SELL_PRICE    = parseFloat(process.env.SELL_PRICE    || '14.99');  // Prix de vente moyen
const COGS          = parseFloat(process.env.COGS          || '1.38');   // Coût fournisseur
const SHIP_FR       = parseFloat(process.env.SHIP_COST_FR  || '4.50');   // Livraison France
const SHIP_INTL     = parseFloat(process.env.SHIP_COST_INT || '6.00');   // Livraison international
const SHOPIFY_RATE  = parseFloat(process.env.SHOPIFY_RATE  || '0.019');  // 1,9% Shopify Payments
const SHOPIFY_FIXED = parseFloat(process.env.SHOPIFY_FIXED || '0.10');   // 0,10€ fixe par transaction
const AD_SPEND_DAILY = parseFloat(process.env.AD_SPEND_DAILY || '0');    // Budget pub/jour (optionnel)

// ─── GraphQL helper ───────────────────────────────────────────────────────────

function gql(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req  = https.request({
      hostname: STORE,
      path    : '/admin/api/2024-10/graphql.json',
      method  : 'POST',
      headers : {
        'Content-Type'           : 'application/json',
        'X-Shopify-Access-Token' : TOKEN,
        'Content-Length'         : Buffer.byteLength(body),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(new Error('JSON: ' + d.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Récupération des commandes sur une période ───────────────────────────────

const ORDER_QUERY = `
  query($query: String!, $cursor: String) {
    orders(first: 250, query: $query, after: $cursor, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        cancelledAt
        financialStatus
        displayFulfillmentStatus
        totalPriceSet          { shopMoney { amount currencyCode } }
        subtotalPriceSet       { shopMoney { amount } }
        totalShippingPriceSet  { shopMoney { amount } }
        totalDiscountsSet      { shopMoney { amount } }
        totalTaxSet            { shopMoney { amount } }
        totalRefundedSet       { shopMoney { amount } }
        shippingAddress        { country countryCode }
        customer               { firstName lastName email }
        lineItems(first: 15) {
          nodes {
            title
            variantTitle
            quantity
            originalUnitPriceSet { shopMoney { amount } }
            discountedUnitPriceSet { shopMoney { amount } }
          }
        }
      }
    }
  }
`;

async function fetchOrders(hoursBack) {
  const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
  const filter = `created_at:>='${since}' -financial_status:voided`;

  const orders = [];
  let cursor = null;

  do {
    const result = await gql(ORDER_QUERY, { query: filter, cursor });
    const page   = result?.data?.orders;
    if (!page) break;
    orders.push(...(page.nodes || []));
    cursor = page.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  return orders;
}

// ─── Calcul de la marge par commande ─────────────────────────────────────────

function calcMargin(order) {
  const revenue    = parseFloat(order.totalPriceSet?.shopMoney?.amount || 0);
  const shipping   = parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || 0);
  const discounts  = parseFloat(order.totalDiscountsSet?.shopMoney?.amount || 0);
  const refunded   = parseFloat(order.totalRefundedSet?.shopMoney?.amount || 0);

  // Nombre d'unités commandées
  const units = (order.lineItems?.nodes || []).reduce((sum, i) => sum + i.quantity, 0) || 1;

  // Pays pour frais de livraison réels
  const country    = order.shippingAddress?.countryCode || 'FR';
  const shipCost   = country === 'FR' ? SHIP_FR : SHIP_INTL;

  // Frais Shopify Payments (sur le montant total encaissé)
  const netRevenue   = revenue - refunded;
  const gatewayFees  = parseFloat((netRevenue * SHOPIFY_RATE + SHOPIFY_FIXED).toFixed(2));

  // COGS total (tous les articles de la commande)
  const cogsTotal    = COGS * units;

  // Marge nette
  const netProfit    = parseFloat((netRevenue - cogsTotal - gatewayFees - shipCost).toFixed(2));
  const grossProfit  = parseFloat((netRevenue - cogsTotal).toFixed(2));
  const marginPct    = netRevenue > 0 ? parseFloat(((netProfit / netRevenue) * 100).toFixed(1)) : 0;
  const markupPct    = cogsTotal > 0  ? parseFloat(((grossProfit / cogsTotal) * 100).toFixed(1)) : 0;

  return {
    revenue, shipping, discounts, refunded,
    netRevenue, cogsTotal, gatewayFees, shipCost,
    netProfit, grossProfit, marginPct, markupPct,
    units, country,
  };
}

// ─── Agrégation des métriques ─────────────────────────────────────────────────

function aggregateMetrics(orders) {
  if (!orders.length) {
    return {
      orderCount: 0, units: 0,
      totalRevenue: 0, totalNetProfit: 0, totalCOGS: 0,
      totalGatewayFees: 0, totalShipCosts: 0, totalRefunded: 0,
      avgOrderValue: 0, avgMarginPct: 0, avgNetProfit: 0,
      topColors: [], topCountries: [], hourDistrib: Array(24).fill(0),
      cancelledCount: 0, refundCount: 0,
      peakHour: 0,
    };
  }

  let totalRevenue = 0, totalNetProfit = 0, totalCOGS = 0;
  let totalGatewayFees = 0, totalShipCosts = 0, totalRefunded = 0, totalUnits = 0;
  const colorCounts   = {};
  const countryCounts = {};
  const hourDistrib   = Array(24).fill(0);
  let cancelledCount  = 0;
  let refundCount     = 0;

  for (const order of orders) {
    if (order.cancelledAt) { cancelledCount++; continue; }

    const m = calcMargin(order);
    totalRevenue     += m.netRevenue;
    totalNetProfit   += m.netProfit;
    totalCOGS        += m.cogsTotal;
    totalGatewayFees += m.gatewayFees;
    totalShipCosts   += m.shipCost;
    totalRefunded    += m.refunded;
    totalUnits       += m.units;

    if (m.refunded > 0) refundCount++;

    // Couleurs
    for (const item of order.lineItems?.nodes || []) {
      const color = item.variantTitle || item.title || 'Inconnu';
      colorCounts[color] = (colorCounts[color] || 0) + item.quantity;
    }

    // Pays
    const cc = order.shippingAddress?.countryCode || 'FR';
    const cn = order.shippingAddress?.country     || 'France';
    const key = `${cc}|${cn}`;
    countryCounts[key] = (countryCounts[key] || 0) + 1;

    // Heure
    const h = new Date(order.createdAt).getHours();
    hourDistrib[h]++;
  }

  const validOrders  = orders.filter(o => !o.cancelledAt);
  const orderCount   = validOrders.length;
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
  const avgMarginPct  = orderCount > 0 ? (totalNetProfit / totalRevenue * 100) : 0;
  const avgNetProfit  = orderCount > 0 ? totalNetProfit / orderCount : 0;
  const peakHour      = hourDistrib.indexOf(Math.max(...hourDistrib));

  const topColors = Object.entries(colorCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([color, qty]) => ({
      color,
      qty,
      revenue  : parseFloat((qty * SELL_PRICE).toFixed(2)),
      netProfit: parseFloat((qty * (SELL_PRICE - COGS - SHIP_FR * (qty / Math.max(totalUnits, 1)) * orderCount / Math.max(orderCount, 1))).toFixed(2)),
    }));

  const topCountries = Object.entries(countryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([key, count]) => {
      const [code, name] = key.split('|');
      return { code, name, count, pct: parseFloat((count / orderCount * 100).toFixed(1)) };
    });

  return {
    orderCount, units: totalUnits,
    totalRevenue    : parseFloat(totalRevenue.toFixed(2)),
    totalNetProfit  : parseFloat(totalNetProfit.toFixed(2)),
    totalCOGS       : parseFloat(totalCOGS.toFixed(2)),
    totalGatewayFees: parseFloat(totalGatewayFees.toFixed(2)),
    totalShipCosts  : parseFloat(totalShipCosts.toFixed(2)),
    totalRefunded   : parseFloat(totalRefunded.toFixed(2)),
    avgOrderValue   : parseFloat(avgOrderValue.toFixed(2)),
    avgMarginPct    : parseFloat(avgMarginPct.toFixed(1)),
    avgNetProfit    : parseFloat(avgNetProfit.toFixed(2)),
    cancelledCount, refundCount,
    topColors, topCountries, hourDistrib, peakHour,
  };
}

// ─── Détection d'anomalies ────────────────────────────────────────────────────

function detectAnomalies(today, week, month, prevWeek) {
  const alerts = [];

  // Aucune vente aujourd'hui (si des jours précédents en ont eu)
  if (today.orderCount === 0 && week.orderCount > 0) {
    const avgDaily = week.orderCount / 7;
    if (avgDaily >= 1) {
      alerts.push({ level: 'warning', msg: `Aucune commande aujourd'hui — moyenne habituelle : ${avgDaily.toFixed(1)}/jour` });
    }
  }

  // Chute des ventes semaine sur semaine
  if (prevWeek.orderCount > 0) {
    const weekDrop = ((prevWeek.orderCount - week.orderCount) / prevWeek.orderCount * 100);
    if (weekDrop > 30) {
      alerts.push({ level: 'danger', msg: `⚠️ Ventes en baisse de ${weekDrop.toFixed(0)}% cette semaine vs semaine dernière (${week.orderCount} vs ${prevWeek.orderCount} commandes)` });
    } else if (weekDrop > 15) {
      alerts.push({ level: 'warning', msg: `Légère baisse des ventes : -${weekDrop.toFixed(0)}% vs semaine dernière` });
    } else if (weekDrop < -20) {
      alerts.push({ level: 'success', msg: `🚀 Pic de ventes : +${Math.abs(weekDrop).toFixed(0)}% vs semaine dernière !` });
    }
  }

  // Marge nette sous 40%
  if (today.orderCount > 0 && today.avgMarginPct < 40) {
    alerts.push({ level: 'danger', msg: `Marge nette faible : ${today.avgMarginPct}% (cible >50%)` });
  }

  // Taux de remboursement élevé
  if (today.orderCount > 0) {
    const refundRate = today.refundCount / today.orderCount * 100;
    if (refundRate > 10) {
      alerts.push({ level: 'danger', msg: `Taux de remboursement élevé : ${refundRate.toFixed(0)}% aujourd'hui` });
    }
  }

  // Panier moyen anormalement bas
  if (today.orderCount > 2 && today.avgOrderValue < SELL_PRICE * 0.8) {
    alerts.push({ level: 'warning', msg: `Panier moyen bas : ${today.avgOrderValue.toFixed(2)}€ (prix standard ${SELL_PRICE}€) — vérifier les remises actives` });
  }

  return alerts;
}

// ─── Projection mensuelle ─────────────────────────────────────────────────────

function projectMonth(week, month) {
  const dayOfMonth    = new Date().getDate();
  const daysInMonth   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const avgDailyOrders  = week.orderCount / 7;
  const avgDailyRevenue = week.totalRevenue / 7;
  const avgDailyProfit  = week.totalNetProfit / 7;

  const projOrders  = month.orderCount + Math.round(avgDailyOrders * daysRemaining);
  const projRevenue = parseFloat((month.totalRevenue + avgDailyRevenue * daysRemaining).toFixed(2));
  const projProfit  = parseFloat((month.totalNetProfit + avgDailyProfit * daysRemaining).toFixed(2));

  return { projOrders, projRevenue, projProfit, daysRemaining, avgDailyOrders };
}

// ─── ROI Publicité ────────────────────────────────────────────────────────────

function calcROI(revenue, adSpend) {
  if (adSpend <= 0) return null;
  const roas    = parseFloat((revenue / adSpend).toFixed(2));
  const roiPct  = parseFloat(((revenue - adSpend) / adSpend * 100).toFixed(1));
  return { roas, roiPct, adSpend, revenue };
}

// ─── Construction du rapport HTML ─────────────────────────────────────────────

function buildFinanceReportHtml(today, week, month, prevWeek, anomalies, projection, roi) {
  const dateStr = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const monthName = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  function fmt(n)  { return n.toFixed(2).replace('.', ',') + ' €'; }
  function fmtK(n) { return n >= 1000 ? (n/1000).toFixed(1) + 'k€' : fmt(n); }
  function pct(n)  { return n.toFixed(1) + '%'; }

  function kpiCard(label, value, sub, color) {
    return `
      <div style="flex:1;padding:18px;text-align:center;border-right:1px solid #f0f0f0;min-width:0">
        <div style="font-size:24px;font-weight:700;color:${color}">${value}</div>
        <div style="font-size:11px;color:#999;margin-top:3px;text-transform:uppercase;letter-spacing:1px">${esc(label)}</div>
        ${sub ? `<div style="font-size:11px;color:#bbb;margin-top:2px">${esc(sub)}</div>` : ''}
      </div>`;
  }

  function section(title, content) {
    return `
      <div style="padding:0 24px 24px">
        <h2 style="font-size:14px;font-weight:700;color:#1a1a2e;margin:0 0 14px;text-transform:uppercase;letter-spacing:1px;border-left:3px solid #2c3e50;padding-left:10px">
          ${title}
        </h2>
        ${content}
      </div>`;
  }

  // ── Tableau waterfall marge ──
  function marginWaterfall(m) {
    if (m.orderCount === 0) return '<p style="color:#999;font-size:13px">Aucune commande sur la période.</p>';
    const rows = [
      { label: 'Chiffre d\'affaires brut',  value: m.totalRevenue,     color: '#27ae60', sign: '' },
      { label: `Coût produit (${m.units} unités × ${COGS}€)`, value: -m.totalCOGS, color: '#e74c3c', sign: '−' },
      { label: 'Frais livraison estimés',   value: -m.totalShipCosts,  color: '#e74c3c', sign: '−' },
      { label: 'Frais Shopify Payments',    value: -m.totalGatewayFees,color: '#e74c3c', sign: '−' },
      { label: 'Remboursements',            value: -m.totalRefunded,   color: '#e74c3c', sign: '−', skip: m.totalRefunded === 0 },
    ].filter(r => !r.skip);

    const netRow = { label: 'Bénéfice net', value: m.totalNetProfit, color: m.totalNetProfit >= 0 ? '#27ae60' : '#e74c3c' };

    const rowHtml = rows.map(r => `
      <tr>
        <td style="padding:8px 12px;font-size:13px;color:#444;border-bottom:1px solid #f5f5f5">${esc(r.label)}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:right;color:${r.color};font-weight:600;border-bottom:1px solid #f5f5f5">
          ${r.sign}${fmt(Math.abs(r.value))}
        </td>
      </tr>`).join('');

    return `
      <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#f0f0f0">
            <th style="padding:9px 12px;text-align:left;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Poste</th>
            <th style="padding:9px 12px;text-align:right;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">${m.orderCount} commande(s)</th>
          </tr>
        </thead>
        <tbody>
          ${rowHtml}
          <tr style="background:#fff;border-top:2px solid #e0e0e0">
            <td style="padding:10px 12px;font-size:14px;font-weight:700;color:${netRow.color}">${esc(netRow.label)}</td>
            <td style="padding:10px 12px;font-size:14px;font-weight:700;color:${netRow.color};text-align:right">${fmt(netRow.value)}</td>
          </tr>
          <tr style="background:#f8f8f8">
            <td style="padding:6px 12px;font-size:12px;color:#888">Marge nette moyenne</td>
            <td style="padding:6px 12px;font-size:12px;color:#888;text-align:right">${pct(m.avgMarginPct)} · ${fmt(m.avgNetProfit)}/cmd</td>
          </tr>
        </tbody>
      </table>`;
  }

  // ── Top couleurs ──
  function colorTable(m) {
    if (!m.topColors.length) return '<p style="color:#999;font-size:13px">Données insuffisantes.</p>';
    const rows = m.topColors.map((c, i) => `
      <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
        <td style="padding:8px 12px;font-size:13px">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  '} ${esc(c.color)}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:center;font-weight:600">${c.qty}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:right;color:#27ae60">${fmt(c.revenue)}</td>
      </tr>`).join('');
    return `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f0f0f0">
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Couleur</th>
          <th style="padding:9px 12px;text-align:center;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Qté</th>
          <th style="padding:9px 12px;text-align:right;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">CA</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Top pays ──
  function countryTable(m) {
    if (!m.topCountries.length) return '<p style="color:#999;font-size:13px">Données insuffisantes.</p>';
    const flags = { FR: '🇫🇷', BE: '🇧🇪', CH: '🇨🇭', LU: '🇱🇺', MC: '🇲🇨', CA: '🇨🇦', MA: '🇲🇦', SN: '🇸🇳', CM: '🇨🇲', CI: '🇨🇮', US: '🇺🇸', DE: '🇩🇪', ES: '🇪🇸', GB: '🇬🇧', IT: '🇮🇹' };
    const rows = m.topCountries.map(c => `
      <tr>
        <td style="padding:8px 12px;font-size:13px">${flags[c.code] || '🌍'} ${esc(c.name)}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:center;font-weight:600">${c.count}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:right">
          <div style="background:#e8f5e9;border-radius:4px;height:8px;width:${c.pct}%;max-width:100%;display:inline-block;vertical-align:middle"></div>
          <span style="color:#888;font-size:12px;margin-left:6px">${c.pct}%</span>
        </td>
      </tr>`).join('');
    return `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f0f0f0">
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Pays</th>
          <th style="padding:9px 12px;text-align:center;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Cmds</th>
          <th style="padding:9px 12px;text-align:right;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Part</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Alertes ──
  const alertHtml = anomalies.length
    ? anomalies.map(a => {
        const colors = { danger: '#fdedec', warning: '#fef9e7', success: '#eafaf1' };
        const borders = { danger: '#e74c3c', warning: '#f39c12', success: '#27ae60' };
        const icons   = { danger: '🚨', warning: '⚠️', success: '✅' };
        return `
          <div style="background:${colors[a.level]};border-left:4px solid ${borders[a.level]};padding:10px 14px;border-radius:0 6px 6px 0;margin-bottom:8px;font-size:13px">
            ${icons[a.level]} ${esc(a.msg)}
          </div>`;
      }).join('')
    : '<div style="background:#eafaf1;border-left:4px solid #27ae60;padding:10px 14px;border-radius:0 6px 6px 0;font-size:13px">✅ Aucune anomalie détectée — tout est normal !</div>';

  // ── ROI pub ──
  const roiHtml = roi ? `
    <div style="background:#f3e8ff;border-radius:8px;padding:16px;margin-bottom:20px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#6c11ff">📢 ROI Publicité (estimation)</p>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <div><span style="font-size:11px;color:#888">Budget pub</span><br><strong>${fmt(roi.adSpend)}</strong></div>
        <div><span style="font-size:11px;color:#888">CA généré</span><br><strong style="color:#27ae60">${fmt(roi.revenue)}</strong></div>
        <div><span style="font-size:11px;color:#888">ROAS</span><br><strong style="color:#6c11ff">${roi.roas}x</strong></div>
        <div><span style="font-size:11px;color:#888">ROI</span><br><strong style="color:${roi.roiPct >= 0 ? '#27ae60' : '#e74c3c'}">${roi.roiPct >= 0 ? '+' : ''}${roi.roiPct}%</strong></div>
      </div>
    </div>` : '';

  // ── Comparaison semaine ──
  let compareHtml = '';
  if (prevWeek.orderCount > 0 || week.orderCount > 0) {
    const chgOrders  = prevWeek.orderCount > 0  ? (week.orderCount  - prevWeek.orderCount)  / prevWeek.orderCount  * 100 : 0;
    const chgRevenue = prevWeek.totalRevenue > 0 ? (week.totalRevenue - prevWeek.totalRevenue) / prevWeek.totalRevenue * 100 : 0;
    const chgProfit  = prevWeek.totalNetProfit > 0 ? (week.totalNetProfit - prevWeek.totalNetProfit) / prevWeek.totalNetProfit * 100 : 0;
    const arrow = n => n >= 0 ? `<span style="color:#27ae60">▲ +${n.toFixed(0)}%</span>` : `<span style="color:#e74c3c">▼ ${n.toFixed(0)}%</span>`;
    compareHtml = `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f0f0f0">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#888;font-weight:600">Métrique</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#888;font-weight:600">Sem. passée</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#888;font-weight:600">Cette sem.</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#888;font-weight:600">Δ</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #f5f5f5">Commandes</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f5f5f5">${prevWeek.orderCount}</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f5f5f5;font-weight:700">${week.orderCount}</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f5f5f5">${arrow(chgOrders)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #f5f5f5">CA</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f5f5f5">${fmt(prevWeek.totalRevenue)}</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f5f5f5;font-weight:700">${fmt(week.totalRevenue)}</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f5f5f5">${arrow(chgRevenue)}</td></tr>
          <tr><td style="padding:8px 12px">Bénéfice net</td><td style="padding:8px 12px;text-align:right">${fmt(prevWeek.totalNetProfit)}</td><td style="padding:8px 12px;text-align:right;font-weight:700">${fmt(week.totalNetProfit)}</td><td style="padding:8px 12px;text-align:right">${arrow(chgProfit)}</td></tr>
        </tbody>
      </table>`;
  } else {
    compareHtml = '<p style="color:#999;font-size:13px">Données insuffisantes pour la comparaison (boutique récente).</p>';
  }

  // ── Recommandations ──
  const recs = buildRecommendations(today, week, month, projection, anomalies);

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif">
<div style="max-width:720px;margin:0 auto;background:#fff">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1a1a2e,#2c3e50);padding:32px">
    <table style="width:100%"><tr>
      <td>
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:1px">💰 SatinNuit — Rapport Financier</h1>
        <p style="color:#a0b0c0;margin:6px 0 0;font-size:13px">${esc(dateStr)}</p>
      </td>
      <td style="text-align:right;vertical-align:middle">
        <div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:10px 16px;display:inline-block">
          <div style="font-size:22px;font-weight:700;color:${today.totalNetProfit >= 0 ? '#2ecc71' : '#e74c3c'}">${fmt(today.totalNetProfit)}</div>
          <div style="font-size:11px;color:#a0b0c0;margin-top:2px">bénéfice net aujourd'hui</div>
        </div>
      </td>
    </tr></table>
  </div>

  <!-- KPIs Aujourd'hui -->
  <div style="border-bottom:3px solid #f0f0f0">
    <div style="padding:12px 24px 4px"><p style="margin:0;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px">📅 Aujourd'hui</p></div>
    <div style="display:flex">
      ${kpiCard("Commandes",   today.orderCount,                    `${today.units} unité(s)`,    '#2c3e50')}
      ${kpiCard("CA",          fmtK(today.totalRevenue),            `moy. ${fmt(today.avgOrderValue)}`, '#27ae60')}
      ${kpiCard("Bénéfice",   fmtK(today.totalNetProfit),          `marge ${pct(today.avgMarginPct)}`,  today.totalNetProfit >= 0 ? '#27ae60' : '#e74c3c')}
      ${kpiCard("Heure pointe", today.orderCount > 0 ? `${today.peakHour}h` : '–', today.orderCount > 0 ? `pic du jour` : 'aucune cmd', '#8e44ad')}
    </div>
  </div>

  <!-- KPIs Semaine -->
  <div style="border-bottom:3px solid #f0f0f0">
    <div style="padding:12px 24px 4px"><p style="margin:0;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px">📊 7 derniers jours</p></div>
    <div style="display:flex">
      ${kpiCard("Commandes",  week.orderCount,                     `${week.units} unités`,       '#2c3e50')}
      ${kpiCard("CA",         fmtK(week.totalRevenue),             `${fmt(week.totalRevenue)}`,  '#27ae60')}
      ${kpiCard("Bénéfice",  fmtK(week.totalNetProfit),           `marge ${pct(week.avgMarginPct)}`,   week.totalNetProfit >= 0 ? '#27ae60' : '#e74c3c')}
      ${kpiCard("Moy./jour",  (week.orderCount/7).toFixed(1)+'  ', `cmds/jour`,                 '#3498db')}
    </div>
  </div>

  <!-- KPIs Mois -->
  <div style="border-bottom:3px solid #f0f0f0">
    <div style="padding:12px 24px 4px"><p style="margin:0;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px">📆 ${esc(monthName)}</p></div>
    <div style="display:flex">
      ${kpiCard("Commandes",  month.orderCount,                   `${month.units} unités`,       '#2c3e50')}
      ${kpiCard("CA mois",    fmtK(month.totalRevenue),           `${fmt(month.totalRevenue)}`,  '#27ae60')}
      ${kpiCard("Bénéfice",  fmtK(month.totalNetProfit),         `marge ${pct(month.avgMarginPct)}`, month.totalNetProfit >= 0 ? '#27ae60' : '#e74c3c')}
      ${kpiCard("Proj. fin mois", fmtK(projection.projRevenue),  `${projection.projOrders} cmds est.`, '#9b59b6')}
    </div>
  </div>

  <!-- Alertes -->
  <div style="padding:20px 24px 8px">
    <h2 style="font-size:14px;font-weight:700;color:#1a1a2e;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;border-left:3px solid #e74c3c;padding-left:10px">
      🚨 Alertes & Anomalies
    </h2>
    ${alertHtml}
  </div>

  <!-- ROI Pub -->
  ${roi ? `<div style="padding:8px 24px">${roiHtml}</div>` : ''}

  <!-- Waterfall marge aujourd'hui -->
  ${section('💵 Décomposition des marges — Aujourd\'hui', marginWaterfall(today))}

  <!-- Waterfall marge semaine -->
  ${section('📊 Décomposition des marges — 7 jours', marginWaterfall(week))}

  <!-- Comparaison semaines -->
  ${section('📈 Comparaison hebdomadaire', compareHtml)}

  <!-- Top couleurs -->
  ${section('🎨 Top couleurs vendues (7 jours)', colorTable(week))}

  <!-- Top pays -->
  ${section('🌍 Répartition géographique (7 jours)', countryTable(week))}

  <!-- Projection -->
  <div style="padding:0 24px 24px">
    <h2 style="font-size:14px;font-weight:700;color:#1a1a2e;margin:0 0 14px;text-transform:uppercase;letter-spacing:1px;border-left:3px solid #9b59b6;padding-left:10px">
      🔭 Projection fin de mois
    </h2>
    <div style="background:#f8f0ff;border-radius:8px;padding:16px;display:flex;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:120px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#9b59b6">${projection.projOrders}</div>
        <div style="font-size:11px;color:#888;margin-top:3px">commandes estimées</div>
      </div>
      <div style="flex:1;min-width:120px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#27ae60">${fmtK(projection.projRevenue)}</div>
        <div style="font-size:11px;color:#888;margin-top:3px">CA estimé</div>
      </div>
      <div style="flex:1;min-width:120px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#2980b9">${fmtK(projection.projProfit)}</div>
        <div style="font-size:11px;color:#888;margin-top:3px">bénéfice estimé</div>
      </div>
      <div style="flex:1;min-width:120px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#e67e22">${projection.daysRemaining}</div>
        <div style="font-size:11px;color:#888;margin-top:3px">jours restants</div>
      </div>
    </div>
    <p style="font-size:12px;color:#999;margin:8px 0 0">
      Basé sur une moyenne de ${projection.avgDailyOrders.toFixed(1)} commande(s)/jour sur les 7 derniers jours.
    </p>
  </div>

  <!-- Recommandations -->
  <div style="margin:0 24px 24px;background:#f0f7ff;border-radius:10px;padding:20px">
    <h3 style="margin:0 0 14px;font-size:14px;color:#2980b9;font-weight:700">🤖 Recommandations Agent Finance</h3>
    <ul style="margin:0;padding-left:20px;color:#444;font-size:13px;line-height:2">
      ${recs}
    </ul>
  </div>

  <!-- Footer -->
  <div style="background:#1a1a2e;padding:20px 24px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <a href="https://admin.shopify.com/store/ggz3rz-cx/orders" style="color:#a0b0c0;font-size:12px;text-decoration:none">Voir les commandes →</a>
      <span style="color:#404860;font-size:12px;margin:0 8px">·</span>
      <a href="https://admin.shopify.com/store/ggz3rz-cx/analytics" style="color:#a0b0c0;font-size:12px;text-decoration:none">Analytics →</a>
    </div>
    <p style="color:#404860;font-size:11px;margin:0">SatinNuit Finance Agent · Rapport quotidien</p>
  </div>

</div>
</body>
</html>`;
}

function buildRecommendations(today, week, month, projection, anomalies) {
  const recs = [];
  const hasDanger = anomalies.some(a => a.level === 'danger');

  if (month.orderCount === 0 && week.orderCount === 0) {
    recs.push('🚀 La boutique est prête — lancez vos premières publicités Meta ou TikTok pour générer du trafic et les premières commandes.');
    recs.push(`💡 Objectif J+30 : atteindre 30 commandes (${(30 * (SELL_PRICE - COGS - SHIP_FR)).toFixed(0)}€ de bénéfice net estimé).`);
    recs.push('📱 Publiez votre premier contenu TikTok/Reels dès aujourd\'hui — les scripts sont dans votre pack Trafic & Viral.');
    recs.push('🔗 Vérifiez que le Pixel Meta et le TikTok Pixel sont installés sur votre boutique pour tracker les conversions.');
    return recs.map(r => `<li>${r}</li>`).join('');
  }

  if (hasDanger) recs.push('⚠️ Des alertes critiques ont été détectées ci-dessus — examinez-les en priorité.');

  if (week.orderCount > 0) {
    const dailyAvg = week.orderCount / 7;
    if (dailyAvg >= 3) recs.push(`🎉 Excellent rythme : ${dailyAvg.toFixed(1)} commandes/jour en moyenne ! Augmentez votre budget pub de 20% pour scaler.`);
    else if (dailyAvg >= 1) recs.push(`📈 Bon démarrage : ${dailyAvg.toFixed(1)} cmd/jour. Testez de nouveaux visuels TikTok pour doubler ce chiffre.`);
    else recs.push('📣 Volume faible — concentrez-vous sur 1 vidéo TikTok par jour cette semaine.');
  }

  if (week.avgMarginPct > 55) {
    recs.push(`✅ Excellente marge nette (${week.avgMarginPct}%) — vous êtes au-dessus de la cible de 50%.`);
  } else if (week.avgMarginPct > 40) {
    recs.push(`📊 Marge correcte (${week.avgMarginPct}%) — vérifiez si les frais de livraison peuvent être optimisés (Mondial Relay vs Colissimo).`);
  } else if (week.avgMarginPct > 0) {
    recs.push(`⚠️ Marge sous la cible (${week.avgMarginPct}%) — évitez les codes promo > 10% et vérifiez les frais réels.`);
  }

  if (week.topColors.length > 0) {
    recs.push(`🎨 Couleur star de la semaine : <strong>${esc(week.topColors[0].color)}</strong> — mettez-la en avant dans vos visuels publicitaires.`);
  }

  if (week.topCountries.length > 0 && week.topCountries[0].code !== 'FR') {
    recs.push(`🌍 Attention : ${week.topCountries[0].pct}% des commandes viennent de ${week.topCountries[0].name} — frais de livraison international plus élevés (impact marge).`);
  }

  const projMonthly = projection.projRevenue;
  if (projMonthly >= 1000) {
    recs.push(`🏆 Projection mensuelle : ${projMonthly.toFixed(0)}€ CA. À ce rythme, objectif 1K€/mois atteint !`);
  } else {
    const ordersNeeded = Math.ceil((1000 - month.totalRevenue) / SELL_PRICE);
    recs.push(`🎯 Pour atteindre 1 000€ CA ce mois : encore ${ordersNeeded} commande(s) nécessaires.`);
  }

  if (AD_SPEND_DAILY > 0) {
    const roas = week.totalRevenue / (AD_SPEND_DAILY * 7);
    if (roas < 2) recs.push(`📢 ROAS < 2x — vos publicités ne sont pas rentables actuellement. Testez de nouveaux créatifs.`);
    else if (roas >= 3) recs.push(`📢 Excellent ROAS de ${roas.toFixed(1)}x — augmentez le budget pub !`);
  }

  recs.push('💳 Activez les notifications de commandes instantanées sur votre téléphone pour traiter les commandes dans les 24h.');

  return recs.map(r => `<li>${r}</li>`).join('');
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Point d'entrée principal ─────────────────────────────────────────────────

async function runDailyFinanceReport() {
  const startMs = Date.now();
  console.log('[FINANCE] Démarrage agent Finance...');

  // Récupération parallèle des 3 périodes + semaine précédente
  console.log('[FINANCE] Récupération des commandes (aujourd\'hui / 7j / 30j / 7j précédents)...');
  const [ordersToday, ordersWeek, ordersMonth, ordersPrevWeek] = await Promise.all([
    fetchOrders(24),
    fetchOrders(7 * 24),
    fetchOrders(30 * 24),
    fetchOrders(14 * 24).then(all => {
      // Filtrer pour garder uniquement la semaine d'avant (entre J-14 et J-7)
      const cutoff = Date.now() - 7 * 24 * 3600_000;
      return all.filter(o => new Date(o.createdAt).getTime() < cutoff);
    }),
  ]);

  console.log(`[FINANCE] Commandes : aujourd'hui=${ordersToday.length} / 7j=${ordersWeek.length} / 30j=${ordersMonth.length} / sem.préc.=${ordersPrevWeek.length}`);

  // Agrégation
  const today    = aggregateMetrics(ordersToday);
  const week     = aggregateMetrics(ordersWeek);
  const month    = aggregateMetrics(ordersMonth);
  const prevWeek = aggregateMetrics(ordersPrevWeek);

  console.log(`[FINANCE] CA jour=${today.totalRevenue}€ · semaine=${week.totalRevenue}€ · mois=${month.totalRevenue}€`);
  console.log(`[FINANCE] Marge nette : jour=${today.avgMarginPct}% · semaine=${week.avgMarginPct}%`);

  // Anomalies
  const anomalies = detectAnomalies(today, week, month, prevWeek);
  if (anomalies.length) console.log(`[FINANCE] ${anomalies.length} anomalie(s) détectée(s)`);

  // Projection fin de mois
  const projection = projectMonth(week, month);

  // ROI pub (si AD_SPEND_DAILY configuré)
  const roi = AD_SPEND_DAILY > 0 ? calcROI(today.totalRevenue, AD_SPEND_DAILY) : null;

  const durationMs = Date.now() - startMs;
  console.log(`[FINANCE] Analyse terminée en ${durationMs}ms`);

  // Email
  const html = buildFinanceReportHtml(today, week, month, prevWeek, anomalies, projection, roi);
  const date = new Date().toLocaleDateString('fr-FR');

  const subject = today.orderCount > 0
    ? `💰 SatinNuit — Finance ${date} · ${today.orderCount} cmd · ${today.totalRevenue.toFixed(2)}€ CA · +${today.totalNetProfit.toFixed(2)}€ net`
    : `💰 SatinNuit — Finance ${date} · 0 commande · Semaine: ${week.totalRevenue.toFixed(2)}€ CA`;

  await sendEmail(subject, html);
  console.log('[FINANCE] Rapport financier envoyé ✓');

  return { today, week, month, prevWeek, anomalies, projection };
}

module.exports = { runDailyFinanceReport };
