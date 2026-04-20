'use strict';

const nodemailer = require('nodemailer');

/**
 * Crée un transporteur SMTP.
 * Variables d'environnement :
 *   SMTP_HOST  — ex: smtp.gmail.com
 *   SMTP_PORT  — 465 (SSL, recommandé Railway) ou 587 (STARTTLS)
 *   SMTP_USER  — ton adresse Gmail
 *   SMTP_PASS  — mot de passe d'application Gmail (16 caractères, sans espaces)
 */
function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  const host   = process.env.SMTP_HOST;
  const port   = parseInt(process.env.SMTP_PORT || '465');
  const secure = port === 465; // SSL direct sur 465, STARTTLS sur 587

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS.replace(/\s+/g, ''), // supprimer espaces App Password
    },
    // Nécessaire sur Railway (pas de DNS PTR sur les IPs cloud)
    tls: { rejectUnauthorized: false },
  });
}

/**
 * Envoie un email HTML.
 * @param {string} subject
 * @param {string} htmlBody
 * @param {string} [to] — par défaut REPORT_EMAIL
 */
async function sendEmail(subject, htmlBody, to) {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('[MAIL] Email non configuré — message ignoré:', subject);
    return false;
  }

  const recipient = to || process.env.REPORT_EMAIL || '';
  if (!recipient) {
    console.warn('[MAIL] REPORT_EMAIL non défini — email ignoré');
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from   : `"SatinNuit Agent" <${process.env.SMTP_USER}>`,
      to     : recipient,
      subject,
      html   : htmlBody,
    });
    console.log(`[MAIL] ✓ Envoyé → ${recipient} (${info.messageId})`);
    return true;
  } catch (err) {
    console.error('[MAIL] ✗ Erreur envoi:', err.message);
    return false;
  }
}

module.exports = { sendEmail };
