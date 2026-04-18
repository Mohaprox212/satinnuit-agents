'use strict';

const nodemailer = require('nodemailer');

/**
 * Crée un transporteur SMTP.
 * Variables d'environnement :
 *   SMTP_HOST  — ex: smtp.gmail.com
 *   SMTP_PORT  — ex: 587
 *   SMTP_USER  — ton adresse Gmail
 *   SMTP_PASS  — mot de passe d'application Gmail (16 caractères)
 */
function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null; // Email désactivé si non configuré
  }

  return nodemailer.createTransporter({
    host  : process.env.SMTP_HOST,
    port  : parseInt(process.env.SMTP_PORT || '587'),
    secure: parseInt(process.env.SMTP_PORT || '587') === 465,
    auth  : {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
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
    console.log('[MAIL] Email non configuré — message affiché en console:');
    console.log(`  SUJET: ${subject}`);
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
    console.log(`[MAIL] Envoyé → ${recipient} (${info.messageId})`);
    return true;
  } catch (err) {
    console.error('[MAIL] Erreur envoi:', err.message);
    return false;
  }
}

module.exports = { sendEmail };
