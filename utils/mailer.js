'use strict';

const nodemailer = require('nodemailer');

/**
 * Crée un transporteur SMTP.
 *
 * Recommandé sur Railway : Brevo (smtp-relay.brevo.com:587)
 *   SMTP_HOST = smtp-relay.brevo.com
 *   SMTP_PORT = 587
 *   SMTP_USER = votre email Brevo
 *   SMTP_PASS = clé SMTP Brevo (SMTP & API → Generate SMTP key)
 *
 * En local (hors Railway) : Gmail fonctionne aussi
 *   SMTP_HOST = smtp.gmail.com
 *   SMTP_PORT = 465
 *   SMTP_PASS = App Password Gmail (16 chars)
 */
function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  const host   = process.env.SMTP_HOST;
  const port   = parseInt(process.env.SMTP_PORT || '587');
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS.replace(/\s+/g, ''),
    },
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
    console.log('[MAIL] SMTP non configuré — ignoré:', subject);
    return false;
  }

  const recipient = to || process.env.REPORT_EMAIL || '';
  if (!recipient) {
    console.warn('[MAIL] REPORT_EMAIL manquant — email ignoré');
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
    console.error('[MAIL] ✗ Erreur:', err.message);
    return false;
  }
}

module.exports = { sendEmail };
