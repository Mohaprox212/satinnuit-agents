/**
 * SatinNuit — Agent Conversion IA
 * Serveur principal : Express + planificateur cron
 *
 * Variables d'environnement requises (Railway) :
 *   SHOPIFY_TOKEN, SHOPIFY_STORE, REPORT_EMAIL,
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */

'use strict';

const express = require('express');
const cron    = require('node-cron');
const { runDailyReport, runHourlyCheck, getQuickStats } = require('./agents/conversion');
const { runDesignQualityReport }                        = require('./agents/design-quality');
const { runWeeklySEOReport }                            = require('./agents/seo');
const { runDailyTrafficReport }                         = require('./agents/traffic');
const { runDailyFinanceReport }                         = require('./agents/finance');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service : 'SatinNuit Agents (Conversion + Design & Qualité)',
    status  : 'running',
    version : '1.0.0',
    store   : process.env.SHOPIFY_STORE || 'non configuré',
    time    : new Date().toISOString(),
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

// ─── Dashboard live ──────────────────────────────────────────────────────────
app.get('/stats', async (req, res) => {
  try {
    const stats = await getQuickStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Endpoints de déclenchement manuel ───────────────────────────────────────
app.post('/run/finance', async (req, res) => {
  res.json({ started: true, message: 'Agent Finance lancé en arrière-plan' });
  try {
    await runDailyFinanceReport();
  } catch (err) {
    console.error('[RUN] Erreur Agent Finance:', err.message);
  }
});

app.post('/run/traffic', async (req, res) => {
  res.json({ started: true, message: 'Agent Trafic & Viral lancé en arrière-plan' });
  try {
    await runDailyTrafficReport();
  } catch (err) {
    console.error('[RUN] Erreur Agent Traffic:', err.message);
  }
});

app.post('/run/seo', async (req, res) => {
  res.json({ started: true, message: 'Agent SEO lancé en arrière-plan' });
  try {
    await runWeeklySEOReport();
  } catch (err) {
    console.error('[RUN] Erreur Agent SEO:', err.message);
  }
});

app.post('/run/design-quality', async (req, res) => {
  res.json({ started: true, message: 'Agent Design & Qualité lancé en arrière-plan' });
  try {
    await runDesignQualityReport();
  } catch (err) {
    console.error('[RUN] Erreur Design & Qualité:', err.message);
  }
});

// ─── Webhook Shopify (nouvelle commande) ──────────────────────────────────────
app.post('/webhooks/orders/created', async (req, res) => {
  res.sendStatus(200); // ack immédiat
  const order = req.body;
  if (!order) return;

  const amount   = parseFloat(order.total_price || 0).toFixed(2);
  const customer = order.customer?.first_name || 'Client';
  const items    = (order.line_items || []).map(i => `${i.quantity}× ${i.title}`).join(', ');

  console.log(`[WEBHOOK] Nouvelle commande #${order.order_number} — ${customer} — ${amount}€ — ${items}`);
});

// ─── Webhook Shopify (panier abandonné) ───────────────────────────────────────
app.post('/webhooks/checkouts/create', async (req, res) => {
  res.sendStatus(200);
  const checkout = req.body;
  if (!checkout) return;
  console.log(`[WEBHOOK] Panier créé : ${checkout.email || 'anonyme'} — ${checkout.total_price}€`);
});

// ─── Planification cron ───────────────────────────────────────────────────────

// Rapport quotidien à 8h00 heure de Paris
cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] Démarrage rapport quotidien...');
  try {
    await runDailyReport();
    console.log('[CRON] Rapport quotidien envoyé ✓');
  } catch (err) {
    console.error('[CRON] Erreur rapport quotidien:', err.message);
  }
}, { timezone: 'Europe/Paris' });

// Vérification horaire des indicateurs clés
cron.schedule('0 * * * *', async () => {
  try {
    await runHourlyCheck();
  } catch (err) {
    console.error('[CRON] Erreur check horaire:', err.message);
  }
}, { timezone: 'Europe/Paris' });

// Agent Finance — tous les jours à 7h30 (Paris)
cron.schedule('30 7 * * *', async () => {
  console.log('[CRON] Démarrage agent Finance...');
  try {
    await runDailyFinanceReport();
    console.log('[CRON] Rapport Finance envoyé ✓');
  } catch (err) {
    console.error('[CRON] Erreur agent Finance:', err.message);
  }
}, { timezone: 'Europe/Paris' });

// Agent Trafic & Viral — tous les jours à 6h30 (Paris)
cron.schedule('30 6 * * *', async () => {
  console.log('[CRON] Démarrage agent Trafic & Viral...');
  try {
    await runDailyTrafficReport();
    console.log('[CRON] Pack Trafic & Viral envoyé ✓');
  } catch (err) {
    console.error('[CRON] Erreur agent Trafic & Viral:', err.message);
  }
}, { timezone: 'Europe/Paris' });

// Agent SEO — tous les lundis à 7h00 (Paris)
cron.schedule('0 7 * * 1', async () => {
  console.log('[CRON] Démarrage agent SEO hebdomadaire...');
  try {
    await runWeeklySEOReport();
    console.log('[CRON] Rapport SEO envoyé ✓');
  } catch (err) {
    console.error('[CRON] Erreur agent SEO:', err.message);
  }
}, { timezone: 'Europe/Paris' });

// Agent Design & Qualité — tous les jours à 9h00 (Paris)
cron.schedule('0 9 * * *', async () => {
  console.log('[CRON] Démarrage agent Design & Qualité...');
  try {
    await runDesignQualityReport();
    console.log('[CRON] Rapport Design & Qualité envoyé ✓');
  } catch (err) {
    console.error('[CRON] Erreur agent Design & Qualité:', err.message);
  }
}, { timezone: 'Europe/Paris' });

// ─── Démarrage ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌙 SatinNuit Conversion Agent démarré sur le port ${PORT}`);
  console.log(`   Store : ${process.env.SHOPIFY_STORE || '⚠️  SHOPIFY_STORE non défini'}`);
  console.log(`   Email : ${process.env.REPORT_EMAIL  || '⚠️  REPORT_EMAIL non défini'}`);
  console.log(`   Rapport Conversion      : 08h00 (Paris)`);
  console.log(`   Rapport Design & Qualité: 09h00 (Paris)`);
  console.log(`   Rapport SEO (hebdo)     : Lundi 07h00 (Paris)`);
  console.log(`   Pack Trafic & Viral     : Quotidien 06h30 (Paris)`);
  console.log(`   Rapport Finance         : Quotidien 07h30 (Paris)\n`);

  // Rapport immédiat au démarrage (désactivé en production — enlever le commentaire pour tester)
  // runDailyReport().catch(console.error);
});
