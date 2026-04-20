'use strict';

/**
 * SatinNuit — Notifications Telegram
 * ─────────────────────────────────────────────────────────────────
 * Remplace le système SMTP pour tous les rapports agents.
 * Utilise l'API Bot Telegram (HTTPS natif, aucun package requis).
 *
 * Variables Railway :
 *   TELEGRAM_TOKEN   — token du bot (8335757794:AAF...)
 *   TELEGRAM_CHAT_ID — votre chat ID (5898350449)
 */

const https = require('https');

const TOKEN   = process.env.TELEGRAM_TOKEN   || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// ─── Conversion HTML → texte lisible ─────────────────────────────────────────

function htmlToText(html) {
  return html
    // Supprimer style / script
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Titres → majuscules + saut de ligne
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, t) => '\n\n▶ ' + t.replace(/<[^>]+>/g, '').trim() + '\n')
    // Séparateur
    .replace(/<hr[^>]*>/gi, '\n──────────\n')
    // Sauts de ligne
    .replace(/<br\s*\/?>/gi, '\n')
    // Éléments bloc → saut
    .replace(/<\/(?:p|div|tr|section|article|li)[^>]*>/gi, '\n')
    .replace(/<(?:p|div|tr|section|article)[^>]*>/gi, '')
    // Listes
    .replace(/<li[^>]*>/gi, '• ')
    // Cellules tableau
    .replace(/<(?:td|th)[^>]*>/gi, ' ')
    // Supprimer toutes les balises restantes
    .replace(/<[^>]+>/g, '')
    // Décoder les entités HTML
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#?\w+;/g, ' ')
    // Nettoyer les espaces
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Échapper pour Telegram parse_mode HTML
function esc(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Découpage des longs messages (limite Telegram : 4096 chars) ──────────────

function splitMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= maxLen) { chunks.push(rest); break; }
    let cut = rest.lastIndexOf('\n', maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  return chunks;
}

// ─── Envoi d'un message brut ──────────────────────────────────────────────────

function sendRaw(text, chatId = CHAT_ID) {
  if (!TOKEN || !chatId) {
    console.warn('[TELEGRAM] TOKEN ou CHAT_ID manquant — message ignoré');
    return Promise.resolve(false);
  }

  const body = JSON.stringify({
    chat_id   : chatId,
    text      : text.slice(0, 4096),
    parse_mode: 'HTML',
  });

  return new Promise(resolve => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path    : `/bot${TOKEN}/sendMessage`,
      method  : 'POST',
      headers : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.ok) {
            console.log(`[TELEGRAM] ✓ Message envoyé (chat:${chatId})`);
            resolve(true);
          } else {
            console.error('[TELEGRAM] ✗ API error:', j.description);
            resolve(false);
          }
        } catch { resolve(false); }
      });
    });
    req.on('error', e => { console.error('[TELEGRAM] ✗ Network:', e.message); resolve(false); });
    req.write(body);
    req.end();
  });
}

// ─── Interface principale (drop-in replacement de sendEmail) ──────────────────

/**
 * sendTelegram — même signature que sendEmail pour une migration sans friction.
 * @param {string}  subject   — sujet / titre du rapport
 * @param {string}  htmlBody  — contenu HTML (converti automatiquement en texte)
 * @param {string}  [_to]     — ignoré (toujours envoyé au TELEGRAM_CHAT_ID)
 */
async function sendTelegram(subject, htmlBody, _to) {
  const bodyText = htmlBody ? htmlToText(htmlBody) : '';
  const header   = subject  ? `<b>${esc(subject)}</b>\n\n` : '';
  const fullText = header + esc(bodyText);

  const chunks = splitMessage(fullText);
  let allOk = true;
  for (const chunk of chunks) {
    const ok = await sendRaw(chunk);
    if (!ok) allOk = false;
  }
  return allOk;
}

module.exports = {
  sendTelegram,
  sendRaw,
  // Alias pour migration sans modifier les call sites dans les agents
  sendEmail: sendTelegram,
};
