'use strict';

/**
 * SatinNuit — Agent Client Autonome
 *
 * Actions :
 *  · Toutes les 30 min : lit contact.satinnuit@gmail.com, classifie et répond aux emails
 *  · Quotidien 10h00   : email de suivi 7 jours après commande (demande d'avis)
 *  · Quotidien 11h00   : relance paniers abandonnés (1h–48h)
 *  · Escalade immédiate : cas complexes → mobadi21267@gmail.com
 */

const nodemailer = require('nodemailer');
const https      = require('https');
const { fetchUnseenEmails } = require('../utils/imap-client');

const STORE         = process.env.SHOPIFY_STORE  || 'ggz3rz-cx.myshopify.com';
const TOKEN         = process.env.SHOPIFY_TOKEN  || '';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL  || 'contact.satinnuit@gmail.com';
const ADMIN_EMAIL   = process.env.REPORT_EMAIL   || 'mobadi21267@gmail.com';
const STORE_NAME    = 'SatinNuit';
const PRODUCT_URL   = 'https://satinnuit.fr/products/bonnet-satin-nuit-double-couche-reversible-protege-hydrate-tous-types-de-cheveux';

// ─── Transporteur SMTP dédié service client ───────────────────────────────────

function makeContactTransporter() {
  const pass = process.env.CONTACT_SMTP_PASS || process.env.CONTACT_IMAP_PASS || '';
  if (!pass) return null;
  return nodemailer.createTransport({
    host  : 'smtp.gmail.com',
    port  : 587,
    secure: false,
    auth  : { user: CONTACT_EMAIL, pass },
  });
}

async function sendFrom(to, subject, html, options = {}) {
  const t = makeContactTransporter();
  if (!t) {
    console.log(`[CLIENT] SMTP non configuré — email simulé vers ${to} : ${subject}`);
    return false;
  }
  try {
    const info = await t.sendMail({
      from   : `"${STORE_NAME}" <${CONTACT_EMAIL}>`,
      to,
      subject,
      html,
      ...(options.replyTo  ? { 'Reply-To': options.replyTo }    : {}),
      ...(options.inReplyTo ? { inReplyTo: options.inReplyTo }  : {}),
      ...(options.references? { references: options.references } : {}),
    });
    console.log(`[CLIENT] Email envoyé → ${to} (${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`[CLIENT] Erreur envoi email vers ${to}:`, err.message);
    return false;
  }
}

// ─── Shopify REST helper ───────────────────────────────────────────────────────

function shopifyRest(path) {
  return new Promise((resolve) => {
    https.get({
      hostname: STORE,
      path    : `/admin/api/2024-10${path}`,
      headers : { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
    }).on('error', () => resolve({}));
  });
}

// ─── Classification des emails ────────────────────────────────────────────────

const CATEGORIES = {
  suivi_commande: {
    keywords: ['suivi', 'où est', 'ma commande', 'tracking', 'numéro de suivi', 'colis', 'livraison', 'quand vais-je', 'quand vais je', 'quand est-ce', 'not received', 'pas reçu', 'pas encore reçu', 'statut'],
    priority: 10,
  },
  delai_livraison: {
    keywords: ['délai', 'combien de temps', 'livraison', 'expédition', 'recevoir', 'when will i', 'how long', 'expédié', 'shipped'],
    priority: 8,
  },
  couleurs_tailles: {
    keywords: ['couleur', 'coloris', 'taille', 'disponible', 'stock', 'en stock', 'quelle taille', 'quelle couleur', 'difference', 'différence'],
    priority: 6,
  },
  retour_remboursement: {
    keywords: ['retour', 'remboursement', 'rembourser', 'renvoyer', 'échanger', 'echange', 'retourner', 'refund', 'return', 'ne convient pas'],
    priority: 9,
  },
  reclamation: {
    keywords: ['problème', 'defaut', 'défaut', 'abîmé', 'cassé', 'déchiré', 'qualité', 'déçu', 'mauvais', 'nul', 'honte', 'réclamation', 'plainte', 'damaged', 'broken'],
    priority: 10,
  },
  paiement: {
    keywords: ['paiement', 'payer', 'carte', 'virement', 'paypal', 'payment', 'charged', 'débité', 'doublement'],
    priority: 10,
  },
  complexe_escalade: {
    keywords: ['avocat', 'tribunal', 'litige', 'procédure', 'fraude', 'arnaque', 'signaler', 'chargeback', 'contestation', 'injustice'],
    priority: 99,
  },
};

function classifyEmail(email) {
  const text  = (email.subject + ' ' + email.text).toLowerCase();
  let best    = { cat: 'general', score: 0, priority: 0 };

  for (const [cat, def] of Object.entries(CATEGORIES)) {
    const hits = def.keywords.filter(kw => text.includes(kw)).length;
    if (hits > 0 && (hits > best.score || def.priority > best.priority)) {
      best = { cat, score: hits, priority: def.priority };
    }
  }

  return best.cat;
}

// ─── Templates de réponse ─────────────────────────────────────────────────────

const SIGNATURE = `
<br><br>
<table cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;font-size:13px">
  <tr><td style="font-weight:700;color:#1a1a2e">Service Client SatinNuit</td></tr>
  <tr><td style="color:#888">📧 ${CONTACT_EMAIL}</td></tr>
  <tr><td style="color:#888">🌐 satinnuit.fr</td></tr>
  <tr><td style="color:#888;font-size:12px;margin-top:4px">Disponible du lundi au vendredi, 9h–18h</td></tr>
</table>`;

function greeting(name) {
  return name ? `Bonjour ${name},` : 'Bonjour,';
}

const RESPONSE_TEMPLATES = {

  suivi_commande: (email, orderInfo) => ({
    subject: `Re: ${email.subject}`,
    html   : `
<p>${greeting(email.fromName)}</p>

<p>Merci de nous avoir contactés ! Nous avons bien reçu votre demande concernant le suivi de votre commande.</p>

${orderInfo ? `
<p>Votre commande <strong>${orderInfo.name}</strong> est actuellement : <strong>${orderInfo.status}</strong></p>
${orderInfo.trackingUrl ? `<p>🔍 <a href="${orderInfo.trackingUrl}">Suivre votre colis →</a></p>` : ''}
` : `
<p>Pour retrouver votre numéro de suivi, veuillez :</p>
<ol>
  <li>Vérifier votre email de confirmation de commande (chercher un email de <strong>noreply@shopify.com</strong>)</li>
  <li>Ou visiter notre page de suivi : <a href="https://satinnuit.fr">satinnuit.fr</a> → "Suivre ma commande"</li>
</ol>
`}

<p><strong>Délais de livraison habituels :</strong></p>
<ul>
  <li>🇫🇷 <strong>France métropolitaine</strong> : 3–5 jours ouvrés</li>
  <li>🇧🇪🇨🇭🇱🇺 <strong>Belgique / Suisse / Luxembourg</strong> : 5–7 jours ouvrés</li>
  <li>🌍 <strong>Autres pays</strong> : 7–14 jours ouvrés</li>
</ul>

<p>Si votre commande dépasse ce délai sans arriver, n'hésitez pas à nous répondre avec votre numéro de commande et nous investiguerons immédiatement.</p>

<p>Bien cordialement,</p>
${SIGNATURE}`,
  }),

  delai_livraison: (email) => ({
    subject: `Re: ${email.subject}`,
    html   : `
<p>${greeting(email.fromName)}</p>

<p>Merci pour votre message ! Voici nos délais de livraison estimés :</p>

<table style="border-collapse:collapse;width:100%;max-width:500px;font-size:14px">
  <thead>
    <tr style="background:#1a1a2e;color:#fff">
      <th style="padding:10px 14px;text-align:left">Destination</th>
      <th style="padding:10px 14px;text-align:left">Délai estimé</th>
    </tr>
  </thead>
  <tbody>
    <tr style="background:#f8f8f8">
      <td style="padding:9px 14px;border-bottom:1px solid #eee">🇫🇷 France métropolitaine</td>
      <td style="padding:9px 14px;border-bottom:1px solid #eee"><strong>3–5 jours ouvrés</strong></td>
    </tr>
    <tr>
      <td style="padding:9px 14px;border-bottom:1px solid #eee">🇧🇪🇨🇭🇱🇺 Belgique / Suisse / Luxembourg</td>
      <td style="padding:9px 14px;border-bottom:1px solid #eee"><strong>5–7 jours ouvrés</strong></td>
    </tr>
    <tr style="background:#f8f8f8">
      <td style="padding:9px 14px;border-bottom:1px solid #eee">🇲🇦🇸🇳🇨🇮🇨🇲 Afrique francophone</td>
      <td style="padding:9px 14px;border-bottom:1px solid #eee"><strong>8–14 jours ouvrés</strong></td>
    </tr>
    <tr>
      <td style="padding:9px 14px">🌍 Autres pays</td>
      <td style="padding:9px 14px"><strong>10–21 jours ouvrés</strong></td>
    </tr>
  </tbody>
</table>

<p style="margin-top:16px">📦 <strong>Expédition :</strong> Toutes les commandes sont expédiées sous 24–48h ouvrées après confirmation du paiement. Vous recevrez un email avec votre numéro de suivi dès l'expédition.</p>

<p>Des questions ? Répondez à cet email, nous sommes là pour vous !</p>

<p>Bien cordialement,</p>
${SIGNATURE}`,
  }),

  couleurs_tailles: (email) => ({
    subject: `Re: ${email.subject}`,
    html   : `
<p>${greeting(email.fromName)}</p>

<p>Merci pour votre intérêt pour nos bonnets satin ! Voici toutes les informations dont vous avez besoin :</p>

<h3 style="color:#1a1a2e">🎨 Couleurs disponibles (14 coloris)</h3>
<p>Noir · Blanc · Gris · Beige · Rose · Bordeaux · Bleu marine · Violet · Vert · Rouge · Caramel · Corail · Jaune · Bleu ciel</p>
<p>Toutes les couleurs disponibles sont visibles et commençables directement sur notre site : <a href="${PRODUCT_URL}">voir le produit →</a></p>

<h3 style="color:#1a1a2e">📏 Taille</h3>
<p>Notre bonnet satin est en <strong>taille unique</strong> avec un élastique souple et extensible, adapté à toutes les coiffures :</p>
<ul>
  <li>✅ Cheveux courts à très longs</li>
  <li>✅ Cheveux bouclés, crépus, locs, tresses</li>
  <li>✅ Extensions et perruques</li>
  <li>✅ Volume faible à très volumineux</li>
</ul>

<h3 style="color:#1a1a2e">🔄 Double couche réversible</h3>
<p>Notre bonnet est <strong>double couche</strong> : vous pouvez le porter des deux côtés pour varier les styles. Les deux faces sont en satin premium.</p>

<p>Si vous avez des questions spécifiques sur une couleur ou une coiffure particulière, n'hésitez pas à répondre à cet email !</p>

<p>Bien cordialement,</p>
${SIGNATURE}`,
  }),

  retour_remboursement: (email) => ({
    subject: `Re: ${email.subject}`,
    html   : `
<p>${greeting(email.fromName)}</p>

<p>Merci de nous avoir contactés. Nous sommes désolés que notre produit ne vous convienne pas et nous allons tout faire pour trouver une solution rapide.</p>

<h3 style="color:#1a1a2e">📋 Notre politique de retour</h3>
<ul>
  <li>✅ <strong>Délai</strong> : 30 jours après réception pour effectuer un retour</li>
  <li>✅ <strong>Conditions</strong> : article non utilisé, dans son emballage d'origine</li>
  <li>✅ <strong>Remboursement</strong> : effectué sous 5–7 jours ouvrés après réception du retour</li>
</ul>

<h3 style="color:#1a1a2e">📦 Procédure de retour</h3>
<ol>
  <li>Répondez à cet email avec votre <strong>numéro de commande</strong> et la raison du retour</li>
  <li>Nous vous enverrons l'adresse de retour et les instructions</li>
  <li>Envoyez le colis en recommandé (conservez votre reçu d'envoi)</li>
  <li>Le remboursement est traité dès réception du colis</li>
</ol>

<p>💡 <strong>Alternative :</strong> Si c'est une question de couleur, nous pouvons étudier un échange plutôt qu'un remboursement. Dites-nous ce qui vous conviendrait le mieux.</p>

<p>Bien cordialement,</p>
${SIGNATURE}`,
  }),

  reclamation: (email) => ({
    subject: `Re: ${email.subject} — Traitement prioritaire`,
    html   : `
<p>${greeting(email.fromName)}</p>

<p>Nous avons bien reçu votre message et nous comprenons votre déception. Je vous présente nos sincères excuses pour ce désagrément — ce n'est absolument pas l'expérience que nous souhaitons vous offrir.</p>

<p>Votre réclamation est traitée en <strong>priorité absolue</strong>.</p>

<p>Pour résoudre votre situation le plus rapidement possible, pourriez-vous nous fournir :</p>
<ul>
  <li>📋 Votre <strong>numéro de commande</strong> (ex: #1001)</li>
  <li>📸 Une <strong>photo</strong> du problème constaté (si applicable)</li>
  <li>📝 Une description précise du défaut</li>
</ul>

<p>Dès réception de ces informations, nous nous engageons à vous proposer <strong>sous 24h</strong> l'une des solutions suivantes :</p>
<ul>
  <li>✅ Renvoi immédiat d'un nouveau produit</li>
  <li>✅ Remboursement complet</li>
  <li>✅ Avoir sur votre prochain achat</li>
</ul>

<p>Encore désolés pour ce désagrément. Nous allons rectifier cela immédiatement.</p>

<p>Bien cordialement,</p>
${SIGNATURE}`,
  }),

  paiement: (email) => ({
    subject: `Re: ${email.subject}`,
    html   : `
<p>${greeting(email.fromName)}</p>

<p>Merci de nous avoir contactés concernant votre paiement. Nous prenons ce sujet très au sérieux.</p>

<p>Pour traiter votre demande efficacement, merci de nous fournir :</p>
<ul>
  <li>📋 Votre <strong>numéro de commande</strong></li>
  <li>💳 Le <strong>montant prélevé</strong> et la date de la transaction</li>
  <li>🔎 Le dernier incident rencontré (double débit, erreur, etc.)</li>
</ul>

<p>Notre équipe examinera votre dossier et vous répondra sous <strong>24 heures ouvrées</strong> avec une solution concrète.</p>

<p>Si vous constatez un double prélèvement, sachez que les transactions mises en attente disparaissent généralement sous 3–5 jours ouvrés selon votre banque.</p>

<p>Bien cordialement,</p>
${SIGNATURE}`,
  }),

  general: (email) => ({
    subject: `Re: ${email.subject}`,
    html   : `
<p>${greeting(email.fromName)}</p>

<p>Merci de nous avoir contactés ! Nous avons bien reçu votre message et y répondrons dans les <strong>24 heures ouvrées</strong> (lundi–vendredi, 9h–18h).</p>

<p>En attendant, vous trouverez peut-être la réponse à votre question sur notre site :</p>
<ul>
  <li><a href="https://satinnuit.fr">🌐 satinnuit.fr</a> — notre boutique</li>
  <li><a href="${PRODUCT_URL}">🛒 Notre bonnet satin</a> — photos, coloris, description</li>
</ul>

<p>À très vite,</p>
${SIGNATURE}`,
  }),
};

// ─── Email d'escalade vers l'admin ────────────────────────────────────────────

async function escalateToAdmin(email, category, { sendEmail }) {
  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px">
  <div style="background:#e74c3c;padding:16px;color:#fff;border-radius:6px 6px 0 0">
    <h2 style="margin:0;font-size:18px">🚨 Escalade requise — Email Client</h2>
    <p style="margin:6px 0 0;font-size:13px">Catégorie détectée : <strong>${category}</strong></p>
  </div>
  <div style="background:#fff;border:1px solid #e0e0e0;padding:20px;border-radius:0 0 6px 6px">
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr><td style="padding:6px;color:#888;width:100px">De :</td><td style="padding:6px"><strong>${esc(email.fromName)}</strong> &lt;${esc(email.from)}&gt;</td></tr>
      <tr><td style="padding:6px;color:#888">Sujet :</td><td style="padding:6px">${esc(email.subject)}</td></tr>
      <tr><td style="padding:6px;color:#888">Date :</td><td style="padding:6px">${new Date(email.date).toLocaleString('fr-FR')}</td></tr>
    </table>
    <hr style="border:none;border-top:1px solid #f0f0f0;margin:16px 0">
    <p style="font-size:13px;color:#555;white-space:pre-wrap">${esc(email.text.slice(0, 1500))}</p>
    <hr style="border:none;border-top:1px solid #f0f0f0;margin:16px 0">
    <p style="font-size:12px;color:#888">Pour répondre directement au client : <a href="mailto:${email.from}">${email.from}</a></p>
  </div>
</div>`;

  return sendEmail(`🚨 [Escalade Client] ${email.subject} — de ${email.from}`, html, ADMIN_EMAIL);
}

// ─── Traitement des emails entrants ───────────────────────────────────────────

async function processIncomingEmails(sendEmail) {
  console.log('[CLIENT] Vérification des emails entrants...');

  let emails;
  try {
    emails = await fetchUnseenEmails();
  } catch (err) {
    console.error('[CLIENT] Erreur lecture IMAP:', err.message);
    return { processed: 0, errors: 1 };
  }

  if (!emails.length) {
    console.log('[CLIENT] Aucun email à traiter');
    return { processed: 0, errors: 0 };
  }

  let processed = 0;
  let escalated = 0;

  for (const email of emails) {
    // Ignorer les emails envoyés depuis notre propre adresse
    if (email.from === CONTACT_EMAIL || email.from === ADMIN_EMAIL) continue;
    // Ignorer les auto-réponses/notifications
    if (/noreply|no-reply|mailer-daemon|postmaster/i.test(email.from)) continue;

    console.log(`[CLIENT] Email de ${email.from} : "${email.subject}"`);

    const category = classifyEmail(email);
    console.log(`[CLIENT] Catégorie : ${category}`);

    // Escalade immédiate pour les cas complexes
    if (category === 'complexe_escalade') {
      await escalateToAdmin(email, category, { sendEmail });
      escalated++;
      // On répond quand même au client de manière neutre
      await sendFrom(
        email.from,
        `Re: ${email.subject}`,
        `<p>${greeting(email.fromName)}</p>
<p>Nous avons bien reçu votre message. Votre dossier est transmis à notre responsable qui vous contactera personnellement sous <strong>24 heures</strong>.</p>
${SIGNATURE}`,
        { inReplyTo: email.messageId, references: email.messageId },
      );
      processed++;
      continue;
    }

    // Générer la réponse adaptée
    const templateFn = RESPONSE_TEMPLATES[category] || RESPONSE_TEMPLATES.general;
    const response   = templateFn(email);

    // Envoyer la réponse au client
    const sent = await sendFrom(
      email.from,
      response.subject,
      response.html,
      { inReplyTo: email.messageId, references: email.messageId },
    );

    // Si réclamation, envoyer aussi une notification à l'admin
    if (category === 'reclamation' || category === 'paiement') {
      await escalateToAdmin(email, category, { sendEmail });
      escalated++;
    }

    if (sent) processed++;
  }

  console.log(`[CLIENT] ${processed} email(s) traité(s), ${escalated} escalade(s)`);
  return { processed, escalated, errors: 0 };
}

// ─── Suivi post-achat (J+7) ───────────────────────────────────────────────────

async function sendPostPurchaseFollowUps() {
  console.log('[CLIENT] Suivi post-achat J+7...');

  // Commandes créées entre 168h et 192h (J-7 à J-8)
  const minDate = new Date(Date.now() - 192 * 3600_000).toISOString();
  const maxDate = new Date(Date.now() - 168 * 3600_000).toISOString();

  const data = await shopifyRest(
    `/orders.json?status=any&financial_status=paid` +
    `&created_at_min=${minDate}&created_at_max=${maxDate}` +
    `&fields=id,name,email,customer,line_items,created_at&limit=100`
  );

  const orders = data?.orders || [];
  console.log(`[CLIENT] ${orders.length} commande(s) éligibles suivi J+7`);

  let sent = 0;
  for (const order of orders) {
    const email = order.email || order.customer?.email;
    if (!email) continue;

    const customerName = order.customer?.first_name || 'client';
    const items = (order.line_items || [])
      .map(i => `${i.quantity}× ${i.variant_title || i.title}`).join(', ');

    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:28px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:300;letter-spacing:2px">🌙 SATINNUIT</h1>
    <p style="color:#a0a8c0;margin:8px 0 0;font-size:13px">Votre avis compte pour nous</p>
  </div>
  <div style="padding:28px;background:#fff;border:1px solid #f0f0f0">
    <p style="font-size:15px">Bonjour ${esc(customerName)},</p>

    <p>Il y a une semaine, vous avez reçu votre commande <strong>${esc(order.name)}</strong> (${esc(items)}).</p>

    <p>Nous espérons sincèrement que votre bonnet satin vous donne entière satisfaction et que vos cheveux vous remercient chaque matin ! 🌙</p>

    <div style="background:#f8f8f8;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
      <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#1a1a2e">Comment se passent vos nuits avec SatinNuit ?</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 auto">
        <tr>
          <td style="padding:4px"><a href="mailto:${CONTACT_EMAIL}?subject=Avis+5+étoiles+commande+${order.name}" style="background:#27ae60;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px">⭐⭐⭐⭐⭐ Super !</a></td>
          <td style="padding:4px"><a href="mailto:${CONTACT_EMAIL}?subject=Avis+commande+${order.name}" style="background:#f39c12;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px">😐 Peut mieux faire</a></td>
          <td style="padding:4px"><a href="mailto:${CONTACT_EMAIL}?subject=Problème+commande+${order.name}" style="background:#e74c3c;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px">😞 Problème</a></td>
        </tr>
      </table>
    </div>

    <p style="font-size:13px;color:#888">Votre avis nous aide à améliorer nos produits et aide d'autres clientes à faire leur choix. Si vous avez eu une bonne expérience, n'hésitez pas à laisser un avis sur notre boutique — ça nous aide énormément ! 🙏</p>

    <p style="font-size:13px">Un souci ? Un problème ? Répondez simplement à cet email, nous réglons tout sous 24h.</p>

    <p>Merci d'avoir choisi SatinNuit 🌙</p>
    ${SIGNATURE}
  </div>
</div>`;

    const ok = await sendFrom(email, `${STORE_NAME} — Comment s'est passée votre première semaine ? 🌙`, html);
    if (ok) sent++;
  }

  console.log(`[CLIENT] ${sent} email(s) suivi J+7 envoyé(s)`);
  return { sent };
}

// ─── Relance paniers abandonnés ───────────────────────────────────────────────

async function sendAbandonedCartRecovery() {
  console.log('[CLIENT] Relance paniers abandonnés...');

  // Checkouts mis à jour entre 1h et 48h (abandonné récemment)
  const minDate = new Date(Date.now() - 48 * 3600_000).toISOString();
  const maxDate = new Date(Date.now() -  1 * 3600_000).toISOString();

  const data = await shopifyRest(
    `/checkouts.json?limit=50&updated_at_min=${minDate}&updated_at_max=${maxDate}`
  );

  const checkouts = (data?.checkouts || []).filter(c =>
    c.email &&                               // A un email
    !c.completed_at &&                       // Pas complété
    parseFloat(c.total_price || 0) > 0       // Panier non vide
  );

  console.log(`[CLIENT] ${checkouts.length} panier(s) abandonné(s) éligible(s)`);

  let sent = 0;
  for (const checkout of checkouts) {
    const customerName = checkout.billing_address?.first_name
      || checkout.shipping_address?.first_name
      || '';

    const items = (checkout.line_items || [])
      .map(i => `${i.quantity}× ${i.variant_title || i.title || 'Bonnet Satin'}`)
      .join(', ');

    const total    = parseFloat(checkout.total_price || '0').toFixed(2);
    const checkoutUrl = checkout.abandoned_checkout_url || PRODUCT_URL;

    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:28px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:300;letter-spacing:2px">🌙 SATINNUIT</h1>
    <p style="color:#a0a8c0;margin:8px 0 0;font-size:13px">Vous avez oublié quelque chose…</p>
  </div>
  <div style="padding:28px;background:#fff;border:1px solid #f0f0f0">
    <p style="font-size:15px">Bonjour${customerName ? ` ${esc(customerName)}` : ''},</p>

    <p>Vous avez laissé quelque chose dans votre panier !</p>

    <div style="background:#f8f8f8;border-radius:8px;padding:16px;margin:20px 0">
      <p style="margin:0 0 8px;font-weight:600;color:#1a1a2e">🛒 Votre panier</p>
      <p style="margin:0;color:#555;font-size:14px">${esc(items)}</p>
      <p style="margin:8px 0 0;font-size:16px;font-weight:700;color:#1a1a2e">Total : ${total}€</p>
    </div>

    <p>Vos cheveux méritent la meilleure protection nocturne. Votre bonnet satin vous attend ! 🌙</p>

    <div style="text-align:center;margin:24px 0">
      <a href="${esc(checkoutUrl)}" style="background:#1a1a2e;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600">
        Finaliser ma commande →
      </a>
    </div>

    <p style="font-size:13px;color:#888">⚡ Stock limité — les couleurs partent vite !</p>
    <p style="font-size:13px;color:#888">🔒 Paiement 100% sécurisé · 📦 Livraison rapide · 🔄 Retours 30 jours</p>

    <p style="font-size:12px;color:#bbb">Vous recevez cet email car vous avez commencé une commande sur satinnuit.fr. Si vous ne souhaitez plus recevoir ces rappels, <a href="mailto:${CONTACT_EMAIL}?subject=Désabonnement" style="color:#bbb">cliquez ici</a>.</p>

    ${SIGNATURE}
  </div>
</div>`;

    const ok = await sendFrom(checkout.email, `🛒 Votre panier SatinNuit vous attend !`, html);
    if (ok) sent++;
  }

  console.log(`[CLIENT] ${sent} relance(s) panier envoyée(s)`);
  return { sent };
}

// ─── Rapport d'activité hebdomadaire du service client ───────────────────────

async function sendClientActivityReport(sendEmail, stats) {
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
  <div style="background:#1a1a2e;padding:24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px">🤝 Rapport Service Client</h1>
    <p style="color:#a0a8c0;margin:6px 0 0;font-size:12px">${date}</p>
  </div>
  <div style="padding:24px">
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px">
      ${[
        ['Emails traités', stats.emailsProcessed || 0, '#3498db'],
        ['Escalades', stats.escalated || 0, '#e74c3c'],
        ['Suivis J+7 envoyés', stats.followUpsSent || 0, '#27ae60'],
        ['Paniers relancés', stats.cartRecoverySent || 0, '#f39c12'],
      ].map(([label, val, color]) => `
        <div style="flex:1;min-width:110px;background:#f8f8f8;border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:28px;font-weight:700;color:${color}">${val}</div>
          <div style="font-size:11px;color:#888;margin-top:4px">${label}</div>
        </div>`).join('')}
    </div>
    <p style="font-size:13px;color:#555">
      Le service client tourne normalement. Répondez à cet email si vous souhaitez consulter un email spécifique ou désactiver une fonctionnalité.
    </p>
  </div>
</div>`;

  return sendEmail(`🤝 SatinNuit — Activité Service Client — ${date}`, html, ADMIN_EMAIL);
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Point d'entrée : vérification emails (toutes les 30 min) ────────────────

async function runEmailCheck(sendEmail) {
  return processIncomingEmails(sendEmail);
}

// ─── Point d'entrée : suivi J+7 ──────────────────────────────────────────────

async function runFollowUpEmails() {
  return sendPostPurchaseFollowUps();
}

// ─── Point d'entrée : relance paniers ────────────────────────────────────────

async function runCartRecovery() {
  return sendAbandonedCartRecovery();
}

module.exports = {
  runEmailCheck,
  runFollowUpEmails,
  runCartRecovery,
  sendClientActivityReport,
};
