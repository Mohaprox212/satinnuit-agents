'use strict';

/**
 * Client IMAP pour lire les emails de contact.satinnuit@gmail.com
 * Utilise imapflow (API async/await moderne) + mailparser
 */

const { ImapFlow }    = require('imapflow');
const { simpleParser } = require('mailparser');

function makeClient() {
  return new ImapFlow({
    host  : 'imap.gmail.com',
    port  : 993,
    secure: true,
    auth  : {
      user: process.env.CONTACT_EMAIL || 'contact.satinnuit@gmail.com',
      pass: process.env.CONTACT_IMAP_PASS || '',
    },
    logger: false,
    tls   : { rejectUnauthorized: false },
  });
}

/**
 * Récupère tous les emails non lus, les parse et les marque comme lus.
 * @returns {Promise<Email[]>}
 */
async function fetchUnseenEmails() {
  if (!process.env.CONTACT_IMAP_PASS) {
    console.warn('[IMAP] CONTACT_IMAP_PASS non défini — lecture email désactivée');
    return [];
  }

  const client = makeClient();
  const emails  = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Chercher les messages non lus
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) {
        console.log('[IMAP] Aucun email non lu');
        return [];
      }

      console.log(`[IMAP] ${uids.length} email(s) non lu(s) trouvé(s)`);

      // Télécharger + parser chaque email
      for await (const msg of client.fetch(uids, { source: true }, { uid: true })) {
        try {
          const parsed = await simpleParser(msg.source);
          const fromAddr = parsed.from?.value?.[0];

          emails.push({
            uid        : msg.uid,
            from       : fromAddr?.address || '',
            fromName   : fromAddr?.name    || '',
            subject    : parsed.subject    || '(Sans sujet)',
            text       : (parsed.text      || '').trim(),
            html       : (parsed.html      || ''),
            date       : parsed.date       || new Date(),
            messageId  : parsed.messageId  || '',
            inReplyTo  : parsed.inReplyTo  || '',
            references : Array.isArray(parsed.references)
              ? parsed.references.join(' ')
              : (parsed.references || ''),
          });
        } catch (parseErr) {
          console.warn('[IMAP] Erreur parsing message uid=' + msg.uid + ':', parseErr.message);
        }
      }

      // Marquer comme lus
      if (uids.length > 0) {
        await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error('[IMAP] Erreur connexion:', err.message);
    try { await client.logout(); } catch (_) {}
  }

  return emails;
}

/**
 * Teste la connexion IMAP sans lire de messages.
 */
async function testConnection() {
  if (!process.env.CONTACT_IMAP_PASS) return { ok: false, error: 'CONTACT_IMAP_PASS manquant' };
  const client = makeClient();
  try {
    await client.connect();
    const status = await client.status('INBOX', { messages: true, unseen: true });
    await client.logout();
    return { ok: true, messages: status.messages, unseen: status.unseen };
  } catch (err) {
    try { await client.logout(); } catch (_) {}
    return { ok: false, error: err.message };
  }
}

module.exports = { fetchUnseenEmails, testConnection };
