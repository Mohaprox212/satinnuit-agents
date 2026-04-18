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

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service : 'SatinNuit Conversion Agent',
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

// ─── Démarrage ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌙 SatinNuit Conversion Agent démarré sur le port ${PORT}`);
  console.log(`   Store : ${process.env.SHOPIFY_STORE || '⚠️  SHOPIFY_STORE non défini'}`);
  console.log(`   Email : ${process.env.REPORT_EMAIL  || '⚠️  REPORT_EMAIL non défini'}`);
  console.log(`   Rapport quotidien : 08h00 (Paris)\n`);

  // Rapport immédiat au démarrage (désactivé en production — enlever le commentaire pour tester)
  // runDailyReport().catch(console.error);
});
