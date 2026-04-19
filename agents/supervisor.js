'use strict';

/**
 * SatinNuit — Agent Superviseur
 *
 * Responsabilités :
 *  · Tracker chaque exécution d'agent (timing, erreurs, statut)
 *  · Détecter les agents en retard ou en erreur
 *  · Auto-retry une fois en cas d'échec, puis alerter
 *  · Vérifier les endpoints HTTP de l'application
 *  · Rapport de santé global chaque matin à 6h00
 *  · Logger toutes les actions au format structuré
 */

const https = require('https');
const http  = require('http');
const { sendEmail } = require('../utils/mailer');

const ADMIN_EMAIL  = process.env.REPORT_EMAIL || 'mobadi21267@gmail.com';
const STARTUP_TIME = new Date();

// ─── Logger structuré ─────────────────────────────────────────────────────────

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LOG_CURRENT = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'];

const log = {
  _write(level, tag, msg, meta = {}) {
    if (LOG_LEVELS[level] < LOG_CURRENT) return;
    const entry = {
      ts   : new Date().toISOString(),
      level,
      tag,
      msg,
      ...meta,
    };
    const line = `[${entry.ts}] [${level}] [${tag}] ${msg}`;
    if (meta && Object.keys(meta).length) {
      const extra = Object.entries(meta).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
      (level === 'ERROR' ? console.error : console.log)(`${line} | ${extra}`);
    } else {
      (level === 'ERROR' ? console.error : console.log)(line);
    }
  },
  debug : (tag, msg, meta) => log._write('DEBUG', tag, msg, meta),
  info  : (tag, msg, meta) => log._write('INFO',  tag, msg, meta),
  warn  : (tag, msg, meta) => log._write('WARN',  tag, msg, meta),
  error : (tag, msg, meta) => log._write('ERROR', tag, msg, meta),
};

// ─── Registre des agents ───────────────────────────────────────────────────────

/**
 * Spécifications de chaque agent :
 *  maxIntervalH : délai maximum attendu entre deux exécutions
 *  cronDesc     : description lisible du planning
 *  critical     : si true, alerte immédiate en cas d'échec
 */
const AGENT_SPECS = {
  conversion_daily  : { label: 'Conversion (rapport quotidien)',    maxIntervalH: 25,   cronDesc: 'Quotidien 08h00', critical: true  },
  conversion_hourly : { label: 'Conversion (check horaire)',         maxIntervalH: 1.5,  cronDesc: 'Toutes les heures', critical: false },
  design_quality    : { label: 'Design & Qualité',                   maxIntervalH: 25,   cronDesc: 'Quotidien 09h00', critical: false },
  seo_weekly        : { label: 'SEO (article + méta)',               maxIntervalH: 169,  cronDesc: 'Lundi 07h00',    critical: false },
  traffic_daily     : { label: 'Trafic & Viral (scripts)',           maxIntervalH: 25,   cronDesc: 'Quotidien 06h30', critical: false },
  finance_daily     : { label: 'Finance (marges & CA)',              maxIntervalH: 25,   cronDesc: 'Quotidien 07h30', critical: true  },
  client_email      : { label: 'Client (lecture emails)',            maxIntervalH: 0.6,  cronDesc: 'Toutes les 30min', critical: false },
  client_followup   : { label: 'Client (suivi J+7)',                 maxIntervalH: 25,   cronDesc: 'Quotidien 10h00', critical: false },
  client_cart       : { label: 'Client (paniers abandonnés)',        maxIntervalH: 25,   cronDesc: 'Quotidien 11h00', critical: false },
};

// Registre en mémoire (réinitialisé à chaque démarrage Railway)
const registry = {};
for (const [id, spec] of Object.entries(AGENT_SPECS)) {
  registry[id] = {
    ...spec,
    status       : 'pending',   // pending | running | ok | warning | error
    lastRun      : null,        // Date dernière exécution réussie
    lastAttempt  : null,        // Date dernière tentative
    lastError    : null,        // Message d'erreur
    lastDurationMs: null,       // Durée dernière exécution
    runCount     : 0,           // Nb exécutions réussies
    errorCount   : 0,           // Nb erreurs
    retryPending : false,       // Retry en cours
    history      : [],          // Dernières 10 exécutions [{ts, ok, durationMs, error}]
  };
}

// ─── Wrapper d'exécution ──────────────────────────────────────────────────────

/**
 * Exécute une fonction agent en la trackant dans le registre.
 * Gère le retry automatique (1x) et l'alerte email en cas d'échec répété.
 *
 * @param {string} agentId   - Clé dans AGENT_SPECS
 * @param {Function} fn      - Fonction async à exécuter
 * @param {boolean} isRetry  - true si c'est un retry automatique
 */
async function track(agentId, fn, isRetry = false) {
  const entry = registry[agentId];
  if (!entry) {
    log.warn('SUPERVISOR', `Agent inconnu : ${agentId}`);
    return;
  }

  const startMs = Date.now();
  entry.status      = 'running';
  entry.lastAttempt = new Date();
  log.info('SUPERVISOR', `▶ ${entry.label}${isRetry ? ' [RETRY]' : ''}`, { agent: agentId });

  try {
    const result = await fn();
    const durationMs = Date.now() - startMs;

    entry.status        = 'ok';
    entry.lastRun       = new Date();
    entry.lastError     = null;
    entry.lastDurationMs = durationMs;
    entry.runCount++;
    entry.retryPending  = false;
    entry.history       = [{ ts: new Date(), ok: true, durationMs }, ...entry.history].slice(0, 10);

    log.info('SUPERVISOR', `✓ ${entry.label} OK`, { agent: agentId, durationMs });
    return result;

  } catch (err) {
    const durationMs = Date.now() - startMs;

    entry.lastError  = err.message;
    entry.errorCount++;
    entry.history    = [{ ts: new Date(), ok: false, durationMs, error: err.message }, ...entry.history].slice(0, 10);

    log.error('SUPERVISOR', `✗ ${entry.label} ERREUR`, { agent: agentId, error: err.message, isRetry });

    if (!isRetry && !entry.retryPending) {
      // Premier échec → retry automatique dans 2 minutes
      entry.retryPending = true;
      entry.status = 'warning';
      log.warn('SUPERVISOR', `↻ Retry dans 2min — ${entry.label}`, { agent: agentId });

      setTimeout(async () => {
        try {
          await track(agentId, fn, true);
        } catch (retryErr) {
          // Retry aussi échoué → alerte
          entry.status = 'error';
          entry.retryPending = false;
          log.error('SUPERVISOR', `✗✗ Retry échoué — ${entry.label}`, { agent: agentId, error: retryErr.message });
          await sendFailureAlert(agentId, retryErr.message, true);
        }
      }, 2 * 60 * 1000);

    } else if (isRetry) {
      // Retry échoué
      entry.status = 'error';
      entry.retryPending = false;
    } else {
      // Retry déjà en cours
      entry.status = 'warning';
    }

    throw err;
  }
}

// ─── Alertes email ────────────────────────────────────────────────────────────

async function sendFailureAlert(agentId, errorMsg, afterRetry = false) {
  const entry = registry[agentId];
  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px">
  <div style="background:#c0392b;padding:20px;border-radius:6px 6px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">
      🚨 Agent SatinNuit — ${afterRetry ? 'ÉCHEC CRITIQUE' : 'Erreur détectée'}
    </h2>
    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">
      ${afterRetry ? 'Le retry automatique a également échoué.' : 'Un retry automatique a été déclenché.'}
    </p>
  </div>
  <div style="background:#fff;border:1px solid #e0e0e0;padding:20px;border-radius:0 0 6px 6px">
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr><td style="padding:6px;color:#888;width:120px">Agent</td><td style="padding:6px;font-weight:700">${esc(entry.label)}</td></tr>
      <tr><td style="padding:6px;color:#888">Planning</td><td style="padding:6px">${esc(entry.cronDesc)}</td></tr>
      <tr><td style="padding:6px;color:#888">Erreur</td><td style="padding:6px;color:#c0392b;font-family:monospace">${esc(errorMsg.slice(0, 300))}</td></tr>
      <tr><td style="padding:6px;color:#888">Tentatives</td><td style="padding:6px">${entry.errorCount}</td></tr>
      <tr><td style="padding:6px;color:#888">Dernière OK</td><td style="padding:6px">${entry.lastRun ? entry.lastRun.toLocaleString('fr-FR') : 'Jamais'}</td></tr>
      <tr><td style="padding:6px;color:#888">Uptime</td><td style="padding:6px">${formatUptime()}</td></tr>
    </table>
    ${afterRetry ? `
    <div style="background:#fdf3f2;border-left:4px solid #c0392b;padding:12px;margin-top:16px;font-size:13px">
      ⚠️ <strong>Action requise</strong> : L'agent n'a pas pu être redémarré automatiquement.
      Vérifiez les logs Railway et déclenchez manuellement via
      <code>POST /run/${agentId.replace(/_/g, '-')}</code>
    </div>` : `
    <div style="background:#fef9e7;border-left:4px solid #f39c12;padding:12px;margin-top:16px;font-size:13px">
      ↻ Un retry automatique a été planifié dans 2 minutes.
    </div>`}
    <p style="margin-top:16px;font-size:12px;color:#888">
      <a href="https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'votre-app.railway.app'}/health/agents">
        Voir le tableau de bord des agents →
      </a>
    </p>
  </div>
</div>`;

  await sendEmail(
    `🚨 SatinNuit — ${afterRetry ? 'AGENT EN PANNE' : 'Erreur agent'} : ${entry.label}`,
    html,
    ADMIN_EMAIL,
  );
}

async function sendOverdueAlert(agentId, hoursLate) {
  const entry = registry[agentId];
  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px">
  <div style="background:#e67e22;padding:20px;border-radius:6px 6px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">⏰ Agent en retard — ${esc(entry.label)}</h2>
    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">
      L'agent n'a pas été exécuté comme prévu.
    </p>
  </div>
  <div style="background:#fff;border:1px solid #e0e0e0;padding:20px;border-radius:0 0 6px 6px">
    <table style="width:100%;font-size:13px">
      <tr><td style="padding:6px;color:#888;width:120px">Agent</td><td style="padding:6px;font-weight:700">${esc(entry.label)}</td></tr>
      <tr><td style="padding:6px;color:#888">Planning</td><td style="padding:6px">${esc(entry.cronDesc)}</td></tr>
      <tr><td style="padding:6px;color:#888">Retard</td><td style="padding:6px;color:#e67e22;font-weight:700">${hoursLate.toFixed(1)}h de retard</td></tr>
      <tr><td style="padding:6px;color:#888">Dernière OK</td><td style="padding:6px">${entry.lastRun ? entry.lastRun.toLocaleString('fr-FR') : 'Jamais exécuté'}</td></tr>
    </table>
    <div style="background:#fef9e7;border-left:4px solid #e67e22;padding:12px;margin-top:16px;font-size:13px">
      ℹ️ Cela peut être normal si le serveur vient de démarrer. Si le problème persiste, vérifiez les logs Railway.
    </div>
  </div>
</div>`;

  await sendEmail(
    `⏰ SatinNuit — Agent en retard : ${entry.label} (+${hoursLate.toFixed(1)}h)`,
    html,
    ADMIN_EMAIL,
  );
}

// ─── Vérification des endpoints HTTP ─────────────────────────────────────────

const ENDPOINTS_TO_CHECK = [
  { path: '/',             method: 'GET',  label: 'Root endpoint'  },
  { path: '/health',       method: 'GET',  label: 'Health check'   },
  { path: '/stats',        method: 'GET',  label: 'Stats dashboard' },
  { path: '/health/agents',method: 'GET',  label: 'Agent dashboard' },
];

function httpGet(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'SatinNuit-Supervisor/1.0' } }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, ok: res.statusCode < 400, body: body.slice(0, 200) }));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0, ok: false, body: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, ok: false, body: e.message }));
  });
}

async function checkEndpoints() {
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${process.env.PORT || 3000}`;

  const results = [];
  for (const ep of ENDPOINTS_TO_CHECK) {
    const start = Date.now();
    const r = await httpGet(`${baseUrl}${ep.path}`);
    results.push({
      ...ep,
      status  : r.status,
      ok      : r.ok,
      latencyMs: Date.now() - start,
    });
    log.debug('SUPERVISOR', `Endpoint ${ep.path} → ${r.status} (${Date.now() - start}ms)`);
  }
  return results;
}

// ─── Surveillance des retards ─────────────────────────────────────────────────

// Track des alertes déjà envoyées pour éviter les spams
const overdueAlertSent = new Set();

async function checkOverdue() {
  const now = Date.now();
  const uptimeH = (now - STARTUP_TIME.getTime()) / 3600_000;

  for (const [id, entry] of Object.entries(registry)) {
    // Ignorer si agent en cours d'exécution ou en retry
    if (entry.status === 'running' || entry.retryPending) continue;

    // Ignorer les agents qui n'ont jamais eu le temps de tourner depuis le démarrage
    if (!entry.lastRun && uptimeH < entry.maxIntervalH) continue;

    // Calcul du retard
    const lastEventMs = entry.lastRun
      ? entry.lastRun.getTime()
      : STARTUP_TIME.getTime();
    const hoursAgo = (now - lastEventMs) / 3600_000;

    if (hoursAgo > entry.maxIntervalH * 1.5) {
      const alertKey = `${id}-${Math.floor(hoursAgo / entry.maxIntervalH)}`;
      if (!overdueAlertSent.has(alertKey)) {
        overdueAlertSent.add(alertKey);
        log.warn('SUPERVISOR', `Agent en retard : ${entry.label}`, { agent: id, hoursLate: hoursAgo - entry.maxIntervalH });
        await sendOverdueAlert(id, hoursAgo - entry.maxIntervalH);
      }
    }
  }
}

// ─── Rapport de santé global ──────────────────────────────────────────────────

async function runHealthReport() {
  log.info('SUPERVISOR', 'Génération rapport de santé global...');

  const endpointResults = await checkEndpoints();
  const uptime = formatUptime();
  const now    = new Date();

  const agentRows = Object.entries(registry).map(([id, entry]) => {
    const statusColors = { ok: '#27ae60', warning: '#f39c12', error: '#e74c3c', pending: '#95a5a6', running: '#3498db' };
    const statusIcons  = { ok: '✅', warning: '⚠️', error: '🚨', pending: '⏳', running: '▶️' };
    const statusLabels = { ok: 'OK', warning: 'Avertissement', error: 'Erreur', pending: 'En attente', running: 'En cours' };
    const color  = statusColors[entry.status] || '#95a5a6';
    const icon   = statusIcons[entry.status]  || '❓';
    const label  = statusLabels[entry.status] || entry.status;

    const lastRunStr = entry.lastRun
      ? entry.lastRun.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : entry.status === 'pending' ? 'En attente de 1ère exécution' : '—';

    const hoursAgo = entry.lastRun
      ? ((Date.now() - entry.lastRun.getTime()) / 3600_000).toFixed(1) + 'h'
      : '—';

    return `
    <tr style="${entry.status === 'error' ? 'background:#fdf3f2' : entry.status === 'warning' ? 'background:#fef9e7' : ''}">
      <td style="padding:10px 14px;font-size:13px;border-bottom:1px solid #f0f0f0">
        <span style="font-size:16px">${icon}</span>
        <strong style="margin-left:6px">${esc(entry.label)}</strong>
      </td>
      <td style="padding:10px 14px;font-size:12px;border-bottom:1px solid #f0f0f0;color:#888">${esc(entry.cronDesc)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center">
        <span style="background:${color};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;white-space:nowrap">${label}</span>
      </td>
      <td style="padding:10px 14px;font-size:12px;border-bottom:1px solid #f0f0f0;color:#555">${esc(lastRunStr)}</td>
      <td style="padding:10px 14px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:center;color:#888">${hoursAgo}</td>
      <td style="padding:10px 14px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:center">
        <span style="color:#27ae60">${entry.runCount}</span> /
        <span style="color:#e74c3c">${entry.errorCount}</span>
      </td>
    </tr>`;
  }).join('');

  const endpointRows = endpointResults.map(ep => {
    const icon  = ep.ok ? '✅' : '🚨';
    const color = ep.ok ? '#27ae60' : '#e74c3c';
    return `
    <tr>
      <td style="padding:9px 14px;font-size:13px;border-bottom:1px solid #f0f0f0">${icon} <code>${esc(ep.path)}</code></td>
      <td style="padding:9px 14px;font-size:13px;border-bottom:1px solid #f0f0f0">${esc(ep.label)}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #f0f0f0;text-align:center">
        <span style="color:${color};font-weight:700">${ep.status || 'ERR'}</span>
      </td>
      <td style="padding:9px 14px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:right;color:#888">${ep.latencyMs}ms</td>
    </tr>`;
  }).join('');

  // Score global
  const okCount    = Object.values(registry).filter(e => e.status === 'ok' || e.status === 'pending').length;
  const totalCount = Object.keys(registry).length;
  const errorCount = Object.values(registry).filter(e => e.status === 'error').length;
  const warnCount  = Object.values(registry).filter(e => e.status === 'warning').length;
  const healthScore = Math.round((okCount / totalCount) * 100);
  const scoreColor  = healthScore >= 80 ? '#27ae60' : healthScore >= 60 ? '#f39c12' : '#e74c3c';

  const endpointsOk = endpointResults.filter(e => e.ok).length;

  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif">
<div style="max-width:760px;margin:0 auto;background:#fff">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#2c3e50,#1a1a2e);padding:28px">
    <table style="width:100%"><tr>
      <td>
        <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">🛡️ SatinNuit — Rapport de Santé</h1>
        <p style="color:#a0b0c0;margin:6px 0 0;font-size:13px">${esc(dateStr)} · ${esc(timeStr)}</p>
      </td>
      <td style="text-align:right;vertical-align:middle">
        <div style="background:${scoreColor};border-radius:50%;width:60px;height:60px;display:inline-flex;align-items:center;justify-content:center">
          <span style="color:#fff;font-size:20px;font-weight:700">${healthScore}%</span>
        </div>
      </td>
    </tr></table>
  </div>

  <!-- KPIs -->
  <div style="display:flex;border-bottom:3px solid #f0f0f0">
    <div style="flex:1;padding:16px;text-align:center;border-right:1px solid #f0f0f0">
      <div style="font-size:28px;font-weight:700;color:#27ae60">${okCount}</div>
      <div style="font-size:11px;color:#999;margin-top:3px;text-transform:uppercase;letter-spacing:1px">Agents OK</div>
    </div>
    <div style="flex:1;padding:16px;text-align:center;border-right:1px solid #f0f0f0">
      <div style="font-size:28px;font-weight:700;color:#f39c12">${warnCount}</div>
      <div style="font-size:11px;color:#999;margin-top:3px;text-transform:uppercase;letter-spacing:1px">Avertissements</div>
    </div>
    <div style="flex:1;padding:16px;text-align:center;border-right:1px solid #f0f0f0">
      <div style="font-size:28px;font-weight:700;color:#e74c3c">${errorCount}</div>
      <div style="font-size:11px;color:#999;margin-top:3px;text-transform:uppercase;letter-spacing:1px">En erreur</div>
    </div>
    <div style="flex:1;padding:16px;text-align:center;border-right:1px solid #f0f0f0">
      <div style="font-size:28px;font-weight:700;color:#3498db">${endpointsOk}/${endpointResults.length}</div>
      <div style="font-size:11px;color:#999;margin-top:3px;text-transform:uppercase;letter-spacing:1px">Endpoints OK</div>
    </div>
    <div style="flex:1;padding:16px;text-align:center">
      <div style="font-size:16px;font-weight:700;color:#8e44ad">${esc(uptime)}</div>
      <div style="font-size:11px;color:#999;margin-top:3px;text-transform:uppercase;letter-spacing:1px">Uptime</div>
    </div>
  </div>

  <!-- Tableau des agents -->
  <div style="padding:20px 24px">
    <h2 style="font-size:14px;font-weight:700;color:#2c3e50;margin:0 0 14px;text-transform:uppercase;letter-spacing:1px;border-left:3px solid #2c3e50;padding-left:10px">
      🤖 Statut des agents
    </h2>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f8f8f8">
          <th style="padding:10px 14px;text-align:left;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Agent</th>
          <th style="padding:10px 14px;text-align:left;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Planning</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Statut</th>
          <th style="padding:10px 14px;text-align:left;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Dernière exéc.</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Il y a</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">OK/ERR</th>
        </tr>
      </thead>
      <tbody>${agentRows}</tbody>
    </table>
  </div>

  <!-- Tableau des endpoints -->
  <div style="padding:0 24px 24px">
    <h2 style="font-size:14px;font-weight:700;color:#2c3e50;margin:0 0 14px;text-transform:uppercase;letter-spacing:1px;border-left:3px solid #3498db;padding-left:10px">
      🌐 Santé des endpoints HTTP
    </h2>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f8f8f8">
          <th style="padding:9px 14px;text-align:left;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Endpoint</th>
          <th style="padding:9px 14px;text-align:left;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Description</th>
          <th style="padding:9px 14px;text-align:center;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">HTTP</th>
          <th style="padding:9px 14px;text-align:right;font-size:11px;color:#888;font-weight:600;text-transform:uppercase">Latence</th>
        </tr>
      </thead>
      <tbody>${endpointRows}</tbody>
    </table>
  </div>

  <!-- Historique des 10 derniers events -->
  ${buildHistorySection()}

  <!-- Informations système -->
  <div style="padding:0 24px 24px">
    <h2 style="font-size:14px;font-weight:700;color:#2c3e50;margin:0 0 14px;text-transform:uppercase;letter-spacing:1px;border-left:3px solid #8e44ad;padding-left:10px">
      ⚙️ Informations système
    </h2>
    <div style="background:#f8f8f8;border-radius:8px;padding:16px;font-size:13px;font-family:monospace;color:#555">
      <p style="margin:4px 0">NODE_VERSION : ${process.version}</p>
      <p style="margin:4px 0">SHOPIFY_STORE : ${esc(process.env.SHOPIFY_STORE || 'non défini')}</p>
      <p style="margin:4px 0">RAILWAY_DOMAIN: ${esc(process.env.RAILWAY_PUBLIC_DOMAIN || 'local')}</p>
      <p style="margin:4px 0">STARTUP_TIME  : ${STARTUP_TIME.toLocaleString('fr-FR')}</p>
      <p style="margin:4px 0">MEMORY_RSS    : ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB</p>
      <p style="margin:4px 0">TOTAL_RUNS    : ${Object.values(registry).reduce((s, e) => s + e.runCount, 0)}</p>
      <p style="margin:4px 0">TOTAL_ERRORS  : ${Object.values(registry).reduce((s, e) => s + e.errorCount, 0)}</p>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#2c3e50;padding:20px 24px;text-align:center">
    <a href="https://${esc(process.env.RAILWAY_PUBLIC_DOMAIN || 'votre-app.railway.app')}/health/agents"
       style="color:#a0b0c0;font-size:12px;text-decoration:none">
      Voir le tableau de bord live →
    </a>
    <p style="color:#405060;font-size:11px;margin:8px 0 0">SatinNuit Supervisor Agent · Rapport automatique quotidien 6h00</p>
  </div>

</div>
</body>
</html>`;

  await sendEmail(
    `🛡️ SatinNuit — Santé système ${dateStr} · Score ${healthScore}% · ${errorCount} erreur(s)`,
    html,
    ADMIN_EMAIL,
  );

  log.info('SUPERVISOR', `Rapport de santé envoyé (score ${healthScore}%)`);
  return { healthScore, okCount, errorCount, warnCount };
}

function buildHistorySection() {
  const events = [];
  for (const [id, entry] of Object.entries(registry)) {
    for (const h of entry.history) {
      events.push({ agent: entry.label, ...h });
    }
  }
  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const recent = events.slice(0, 15);

  if (!recent.length) return '';

  const rows = recent.map(e => `
    <tr>
      <td style="padding:7px 14px;font-size:12px;border-bottom:1px solid #f5f5f5;color:#888">
        ${new Date(e.ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </td>
      <td style="padding:7px 14px;font-size:12px;border-bottom:1px solid #f5f5f5">${esc(e.agent)}</td>
      <td style="padding:7px 14px;border-bottom:1px solid #f5f5f5;text-align:center">
        ${e.ok
          ? '<span style="color:#27ae60;font-size:14px">✓</span>'
          : '<span style="color:#e74c3c;font-size:14px">✗</span>'}
      </td>
      <td style="padding:7px 14px;font-size:12px;border-bottom:1px solid #f5f5f5;text-align:right;color:#888">
        ${e.durationMs ? (e.durationMs / 1000).toFixed(1) + 's' : '—'}
      </td>
      <td style="padding:7px 14px;font-size:12px;border-bottom:1px solid #f5f5f5;color:#e74c3c;font-family:monospace">
        ${e.error ? esc(e.error.slice(0, 60)) : ''}
      </td>
    </tr>`).join('');

  return `
  <div style="padding:0 24px 24px">
    <h2 style="font-size:14px;font-weight:700;color:#2c3e50;margin:0 0 14px;text-transform:uppercase;letter-spacing:1px;border-left:3px solid #27ae60;padding-left:10px">
      📜 Historique récent (15 derniers événements)
    </h2>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f8f8f8">
          <th style="padding:8px 14px;text-align:left;font-size:11px;color:#888;font-weight:600">Heure</th>
          <th style="padding:8px 14px;text-align:left;font-size:11px;color:#888;font-weight:600">Agent</th>
          <th style="padding:8px 14px;text-align:center;font-size:11px;color:#888;font-weight:600">Résultat</th>
          <th style="padding:8px 14px;text-align:right;font-size:11px;color:#888;font-weight:600">Durée</th>
          <th style="padding:8px 14px;text-align:left;font-size:11px;color:#888;font-weight:600">Erreur</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ─── Endpoint JSON /health/agents ─────────────────────────────────────────────

function getStatus() {
  const agents = {};
  for (const [id, entry] of Object.entries(registry)) {
    agents[id] = {
      label        : entry.label,
      status       : entry.status,
      cronDesc     : entry.cronDesc,
      lastRun      : entry.lastRun,
      lastError    : entry.lastError,
      lastDurationMs: entry.lastDurationMs,
      runCount     : entry.runCount,
      errorCount   : entry.errorCount,
    };
  }
  return {
    service  : 'SatinNuit Supervisor',
    startedAt: STARTUP_TIME,
    uptime   : formatUptime(),
    memory   : `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
    nodeVer  : process.version,
    agents,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime() {
  const ms = Date.now() - STARTUP_TIME.getTime();
  const h  = Math.floor(ms / 3600_000);
  const m  = Math.floor((ms % 3600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}j ${h % 24}h`;
  return `${h}h ${m}min`;
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = {
  track,
  checkOverdue,
  runHealthReport,
  getStatus,
  registry,
  log,
};
