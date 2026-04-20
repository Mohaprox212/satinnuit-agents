/**
 * SatinNuit — Plateforme d'agents IA
 * ════════════════════════════════════════════════════════════════
 *  Agents actifs :
 *   · Conversion   — rapport quotidien + alertes horaires
 *   · Design QA    — audit vitrine quotidien
 *   · SEO          — articles + méta hebdomadaires
 *   · Trafic Viral — scripts TikTok/Reels quotidiens
 *   · Finance      — CA, marges, projections quotidiens
 *   · Client       — emails, J+7, paniers (continu)
 *   · Superviseur  — santé système + alertes (continu)
 *
 *  Variables Railway requises :
 *   SHOPIFY_TOKEN, SHOPIFY_STORE, PRODUCT_GID
 *   REPORT_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   CONTACT_EMAIL, CONTACT_IMAP_PASS, CONTACT_SMTP_PASS
 *   SELL_PRICE, COGS  (optionnel : AD_SPEND_DAILY)
 */

'use strict';

const express = require('express');
const cron    = require('node-cron');

// ─── Agents ───────────────────────────────────────────────────────────────────
const { runDailyReport, runHourlyCheck, getQuickStats }                         = require('./agents/conversion');
const { runDesignQualityReport }                                                 = require('./agents/design-quality');
const { runWeeklySEOReport }                                                     = require('./agents/seo');
const { runDailyTrafficReport }                                                  = require('./agents/traffic');
const { runDailyFinanceReport }                                                  = require('./agents/finance');
const { runEmailCheck, runFollowUpEmails, runCartRecovery, sendClientActivityReport } = require('./agents/customer');
const supervisor                                                                 = require('./agents/supervisor');

// ─── Utils ────────────────────────────────────────────────────────────────────
const { sendEmail }    = require('./utils/mailer');
const { testConnection } = require('./utils/imap-client');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─── Compteurs service client ─────────────────────────────────────────────────
const clientStats = { emailsProcessed: 0, escalated: 0, followUpsSent: 0, cartRecoverySent: 0 };

// ═══════════════════════════════════════════════════════════════════════════════
//  ENDPOINTS HTTP
// ═══════════════════════════════════════════════════════════════════════════════

// ── Accueil ──────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const s = supervisor.getStatus();
  const agentStatuses = Object.fromEntries(
    Object.entries(s.agents).map(([id, a]) => [id, { status: a.status, lastRun: a.lastRun }])
  );
  res.json({
    service : 'SatinNuit Agents Platform',
    version : '2.0.0',
    uptime  : s.uptime,
    store   : process.env.SHOPIFY_STORE || 'non configuré',
    time    : new Date().toISOString(),
    agents  : agentStatuses,
  });
});

// ── Health checks ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, uptime: supervisor.getStatus().uptime }));

app.get('/health/agents', (req, res) => res.json(supervisor.getStatus()));

// ── Stats live ───────────────────────────────────────────────────────────────
app.get('/stats', async (req, res) => {
  try {
    const stats = await getQuickStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Diagnostic IMAP ──────────────────────────────────────────────────────────
app.get('/client/status', async (req, res) => {
  const result = await testConnection();
  res.json({ imap: result, contactEmail: process.env.CONTACT_EMAIL || 'contact.satinnuit@gmail.com' });
});

// ── Diagnostic SMTP — test connexion + envoi email de test ───────────────────
app.post('/diag/smtp', async (req, res) => {
  const nodemailer = require('nodemailer');
  const net        = require('net');

  const cfg = {
    host : process.env.SMTP_HOST || '',
    port : parseInt(process.env.SMTP_PORT || '465'),
    user : process.env.SMTP_USER || '',
    pass : (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    to   : process.env.REPORT_EMAIL || '',
  };

  // ── Étape 0 : test TCP raw (5s max) ──────────────────────────────────────
  const tcpResult = await new Promise(resolve => {
    const sock = new net.Socket();
    const done = (ok, msg) => { try { sock.destroy(); } catch(_){} resolve({ ok, msg }); };
    sock.setTimeout(5000);
    sock.connect(cfg.port, cfg.host, () => done(true, `TCP OK ${cfg.host}:${cfg.port}`));
    sock.on('error',   e  => done(false, `TCP error: ${e.message}`));
    sock.on('timeout', () => done(false, `TCP timeout ${cfg.host}:${cfg.port}`));
  });
  if (!tcpResult.ok) {
    return res.json({ ok: false, step: 'tcp', tcpResult, config: {
      host: cfg.host, port: cfg.port, user: cfg.user || 'MANQUANT',
      pass: cfg.pass ? cfg.pass.slice(0,4)+'****' : 'MANQUANT', to: cfg.to || 'MANQUANT',
    }});
  }

  // Résumé config (mot de passe masqué)
  const cfgSummary = {
    host: cfg.host || 'MANQUANT',
    port: cfg.port,
    user: cfg.user || 'MANQUANT',
    pass: cfg.pass ? cfg.pass.slice(0,4) + '****' + cfg.pass.slice(-2) : 'MANQUANT',
    to  : cfg.to   || 'MANQUANT',
  };

  if (!cfg.host || !cfg.user || !cfg.pass) {
    return res.json({ ok: false, step: 'config', config: cfgSummary, error: 'Variables SMTP manquantes' });
  }

  const transporter = nodemailer.createTransport({
    host  : cfg.host,
    port  : cfg.port,
    secure: cfg.port === 465,
    auth  : { user: cfg.user, pass: cfg.pass },
  });

  // Étape 1 : vérifier la connexion (timeout 15s)
  try {
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('verify() timeout 15s')), 15000)),
    ]);
  } catch (err) {
    return res.json({ ok: false, step: 'verify', config: cfgSummary, error: err.message });
  }

  // Étape 2 : envoyer l'email de test
  try {
    const info = await transporter.sendMail({
      from   : `"SatinNuit Agents" <${cfg.user}>`,
      to     : cfg.to,
      subject: '✅ Test SMTP — SatinNuit Agents fonctionne',
      html   : `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
          <h2 style="color:#2c2c2c">✅ Test SMTP réussi</h2>
          <p>Cet email confirme que la plateforme <strong>SatinNuit Agents</strong> peut envoyer des emails.</p>
          <table style="border-collapse:collapse;width:100%;margin-top:16px">
            <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600">Serveur SMTP</td><td style="padding:6px 12px">${cfg.host}:${cfg.port}</td></tr>
            <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600">Expéditeur</td><td style="padding:6px 12px">${cfg.user}</td></tr>
            <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600">Destinataire</td><td style="padding:6px 12px">${cfg.to}</td></tr>
            <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600">Heure</td><td style="padding:6px 12px">${new Date().toISOString()}</td></tr>
          </table>
          <p style="margin-top:24px;color:#888;font-size:12px">SatinNuit Agents Platform</p>
        </div>`,
    });
    return res.json({ ok: true, step: 'sent', config: cfgSummary, messageId: info.messageId });
  } catch (err) {
    return res.json({ ok: false, step: 'send', config: cfgSummary, error: err.message });
  }
});

// ── Diagnostic environnement + Shopify GraphQL ───────────────────────────────
app.get('/diag', async (req, res) => {
  const https = require('https');
  const STORE = process.env.SHOPIFY_STORE || 'ggz3rz-cx.myshopify.com';
  const TOKEN = process.env.SHOPIFY_TOKEN || '';

  // Variables d'env présentes ?
  const envCheck = {
    SHOPIFY_TOKEN  : TOKEN  ? `SET (${TOKEN.slice(0,8)}...)` : 'MANQUANT',
    SHOPIFY_STORE  : process.env.SHOPIFY_STORE  ? `SET (${STORE})` : `DEFAULT (${STORE})`,
    PRODUCT_GID    : process.env.PRODUCT_GID    ? 'SET' : 'DEFAULT',
    REPORT_EMAIL   : process.env.REPORT_EMAIL   ? 'SET' : 'MANQUANT',
    SMTP_HOST      : process.env.SMTP_HOST      ? 'SET' : 'MANQUANT',
    SMTP_USER      : process.env.SMTP_USER      ? 'SET' : 'MANQUANT',
    SMTP_PASS      : process.env.SMTP_PASS      ? 'SET' : 'MANQUANT',
    CONTACT_EMAIL  : process.env.CONTACT_EMAIL  ? 'SET' : 'MANQUANT',
    CONTACT_IMAP_PASS : process.env.CONTACT_IMAP_PASS ? 'SET' : 'MANQUANT',
  };

  // Test GraphQL Shopify direct depuis Railway
  const gqlTest = await new Promise(resolve => {
    const body = JSON.stringify({ query: '{ shop { name myshopifyDomain } }' });
    const req = https.request({
      hostname: STORE,
      path: '/admin/api/2024-10/graphql.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res2 => {
      let d = ''; let chunks = 0;
      res2.on('data', c => { d += c; chunks++; });
      res2.on('end', () => resolve({
        status: res2.statusCode,
        bodyLength: d.length,
        bodyPreview: d.slice(0, 300),
        chunks,
      }));
    });
    req.on('error', e => resolve({ error: e.message }));
    req.setTimeout(10000, () => resolve({ error: 'timeout 10s' }));
    req.write(body);
    req.end();
  });

  // Test GraphQL orders scope
  const ordersTest = await new Promise(resolve => {
    const body = JSON.stringify({ query: '{ orders(first:1) { nodes { id } } }' });
    const req = https.request({
      hostname: STORE,
      path: '/admin/api/2024-10/graphql.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res2 => {
      let d = '';
      res2.on('data', c => d += c);
      res2.on('end', () => resolve({ status: res2.statusCode, body: d.slice(0, 300) }));
    });
    req.on('error', e => resolve({ error: e.message }));
    req.setTimeout(10000, () => resolve({ error: 'timeout 10s' }));
    req.write(body);
    req.end();
  });

  res.json({ env: envCheck, shopTest: gqlTest, ordersTest });
});

// ── Déclenchements manuels ───────────────────────────────────────────────────
const MANUAL_TRIGGERS = [
  { path: '/run/conversion',    agent: 'conversion_daily',  fn: () => runDailyReport(),          label: 'Conversion'      },
  { path: '/run/design-quality',agent: 'design_quality',    fn: () => runDesignQualityReport(),   label: 'Design & Qualité' },
  { path: '/run/seo',           agent: 'seo_weekly',        fn: () => runWeeklySEOReport(),        label: 'SEO'             },
  { path: '/run/traffic',       agent: 'traffic_daily',     fn: () => runDailyTrafficReport(),     label: 'Trafic & Viral'  },
  { path: '/run/finance',       agent: 'finance_daily',     fn: () => runDailyFinanceReport(),     label: 'Finance'         },
  { path: '/run/email-check',   agent: 'client_email',      fn: () => runEmailCheck(sendEmail),   label: 'Client (emails)' },
  { path: '/run/followup',      agent: 'client_followup',   fn: () => runFollowUpEmails(),         label: 'Client (J+7)'    },
  { path: '/run/cart-recovery', agent: 'client_cart',       fn: () => runCartRecovery(),           label: 'Client (paniers)'},
  { path: '/run/health-report', agent: null,                 fn: () => supervisor.runHealthReport(), label: 'Health Report'  },
];

for (const trigger of MANUAL_TRIGGERS) {
  app.post(trigger.path, async (req, res) => {
    res.json({ started: true, message: `${trigger.label} lancé`, agent: trigger.agent });
    try {
      if (trigger.agent) {
        await supervisor.track(trigger.agent, trigger.fn);
      } else {
        await trigger.fn();
      }
    } catch (err) {
      supervisor.log.error('MANUAL', `Erreur déclenchement ${trigger.path}`, { error: err.message });
    }
  });
}

// ── Webhooks Shopify ─────────────────────────────────────────────────────────
app.post('/webhooks/orders/created', (req, res) => {
  res.sendStatus(200);
  const order = req.body;
  if (!order) return;
  const amount   = parseFloat(order.total_price || 0).toFixed(2);
  const customer = order.customer?.first_name || 'Client';
  const items    = (order.line_items || []).map(i => `${i.quantity}× ${i.title}`).join(', ');
  supervisor.log.info('WEBHOOK', `Commande #${order.order_number}`, { customer, amount, items });
});

app.post('/webhooks/checkouts/create', (req, res) => {
  res.sendStatus(200);
  const ch = req.body;
  if (!ch) return;
  supervisor.log.info('WEBHOOK', `Panier créé`, { email: ch.email || 'anonyme', total: ch.total_price });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PLANIFICATION CRON
// ═══════════════════════════════════════════════════════════════════════════════

const TZ = { timezone: 'Europe/Paris' };

// ── Superviseur — rapport santé à 6h00 ───────────────────────────────────────
cron.schedule('0 6 * * *', async () => {
  supervisor.log.info('CRON', 'Rapport santé global...');
  try { await supervisor.runHealthReport(); }
  catch (err) { supervisor.log.error('CRON', 'Erreur rapport santé', { error: err.message }); }
}, TZ);

// ── Superviseur — vérification retards toutes les 15 min ─────────────────────
cron.schedule('*/15 * * * *', async () => {
  try { await supervisor.checkOverdue(); }
  catch (err) { supervisor.log.error('CRON', 'Erreur check retards', { error: err.message }); }
}, TZ);

// ── Trafic & Viral — quotidien 6h30 ──────────────────────────────────────────
cron.schedule('30 6 * * *', async () => {
  try { await supervisor.track('traffic_daily', runDailyTrafficReport); }
  catch (err) { supervisor.log.error('CRON', 'Traffic', { error: err.message }); }
}, TZ);

// ── Finance — quotidien 7h30 ──────────────────────────────────────────────────
cron.schedule('30 7 * * *', async () => {
  try { await supervisor.track('finance_daily', runDailyFinanceReport); }
  catch (err) { supervisor.log.error('CRON', 'Finance', { error: err.message }); }
}, TZ);

// ── Conversion — quotidien 8h00 ───────────────────────────────────────────────
cron.schedule('0 8 * * *', async () => {
  try { await supervisor.track('conversion_daily', runDailyReport); }
  catch (err) { supervisor.log.error('CRON', 'Conversion daily', { error: err.message }); }
}, TZ);

// ── SEO — lundi 7h00 (hebdomadaire) ──────────────────────────────────────────
cron.schedule('0 7 * * 1', async () => {
  try { await supervisor.track('seo_weekly', runWeeklySEOReport); }
  catch (err) { supervisor.log.error('CRON', 'SEO', { error: err.message }); }
}, TZ);

// ── Design & Qualité — quotidien 9h00 ────────────────────────────────────────
cron.schedule('0 9 * * *', async () => {
  try { await supervisor.track('design_quality', runDesignQualityReport); }
  catch (err) { supervisor.log.error('CRON', 'Design QA', { error: err.message }); }
}, TZ);

// ── Client emails — toutes les 30 min ────────────────────────────────────────
cron.schedule('*/30 * * * *', async () => {
  try {
    const r = await supervisor.track('client_email', () => runEmailCheck(sendEmail));
    if (r) {
      clientStats.emailsProcessed += r.processed || 0;
      clientStats.escalated       += r.escalated  || 0;
    }
  } catch (err) { supervisor.log.error('CRON', 'Client email', { error: err.message }); }
}, TZ);

// ── Suivi J+7 — quotidien 10h00 ──────────────────────────────────────────────
cron.schedule('0 10 * * *', async () => {
  try {
    const r = await supervisor.track('client_followup', runFollowUpEmails);
    if (r) clientStats.followUpsSent += r.sent || 0;
  } catch (err) { supervisor.log.error('CRON', 'Client J+7', { error: err.message }); }
}, TZ);

// ── Paniers abandonnés — quotidien 11h00 ─────────────────────────────────────
cron.schedule('0 11 * * *', async () => {
  try {
    const r = await supervisor.track('client_cart', runCartRecovery);
    if (r) clientStats.cartRecoverySent += r.sent || 0;
  } catch (err) { supervisor.log.error('CRON', 'Client paniers', { error: err.message }); }
}, TZ);

// ── Rapport service client — lundi 8h30 ──────────────────────────────────────
cron.schedule('30 8 * * 1', async () => {
  try {
    await sendClientActivityReport(sendEmail, { ...clientStats });
    Object.keys(clientStats).forEach(k => clientStats[k] = 0);
  } catch (err) { supervisor.log.error('CRON', 'Client rapport', { error: err.message }); }
}, TZ);

// ── Conversion check horaire ──────────────────────────────────────────────────
cron.schedule('0 * * * *', async () => {
  try { await supervisor.track('conversion_hourly', runHourlyCheck); }
  catch (err) { supervisor.log.error('CRON', 'Conversion hourly', { error: err.message }); }
}, TZ);

// ═══════════════════════════════════════════════════════════════════════════════
//  DÉMARRAGE
// ═══════════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════╗',
    '║         🌙 SatinNuit Agents Platform v2.0               ║',
    '╚══════════════════════════════════════════════════════════╝',
    `   PORT    : ${PORT}`,
    `   STORE   : ${process.env.SHOPIFY_STORE || '⚠️  non défini'}`,
    `   EMAIL   : ${process.env.REPORT_EMAIL  || '⚠️  non défini'}`,
    '',
    '   PLANNING DES AGENTS :',
    '   ┌─────────────────────────────────────────────────┐',
    '   │ 06h00  Superviseur — rapport santé global       │',
    '   │ 06h30  Trafic & Viral — scripts TikTok/Reels   │',
    '   │ 07h00  SEO — article + méta (lundi seulement)  │',
    '   │ 07h30  Finance — CA, marges, projections        │',
    '   │ 08h00  Conversion — rapport commandes           │',
    '   │ 09h00  Design & Qualité — audit vitrine         │',
    '   │ 10h00  Client — suivi post-achat J+7            │',
    '   │ 11h00  Client — relance paniers abandonnés      │',
    '   │ */30   Client — lecture emails entrants         │',
    '   │ */15   Superviseur — vérification retards       │',
    '   └─────────────────────────────────────────────────┘',
    '',
    `   Dashboard : http://localhost:${PORT}/health/agents`,
    '',
  ];
  lines.forEach(l => console.log(l));
  supervisor.log.info('STARTUP', 'Plateforme démarrée', { port: PORT, nodeVer: process.version });
});
