'use strict';

/**
 * SatinNuit — Agent Trafic & Viral
 *
 * Actions quotidiennes (6h30 Paris) :
 *  1. Analyse les tendances du jour (niche cheveux/satin/beauté)
 *  2. Génère 3 scripts vidéo TikTok/Reels (formats variés)
 *  3. Crée légendes, hashtags et hooks d'accroche
 *  4. Recommande les meilleures heures de publication
 *  5. Envoie un pack contenu complet "prêt à filmer" par email
 */

const https = require('https');
const { sendEmail } = require('../utils/mailer');

const STORE = process.env.SHOPIFY_STORE || 'ggz3rz-cx.myshopify.com';
const TOKEN = process.env.SHOPIFY_TOKEN || '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sélection pseudo-aléatoire reproductible par date */
function seededPick(arr, seed) {
  const idx = Math.abs(seed) % arr.length;
  return arr[idx];
}

function dateSeed(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Données de tendances ─────────────────────────────────────────────────────

const TREND_POOL = [
  { topic: 'Routine cheveux naturels', hook_fr: 'Cette routine a CHANGÉ mes cheveux en 7 jours', angle: 'transformation', emoji: '✨' },
  { topic: 'Protection nocturne cheveux', hook_fr: 'Le truc que ta mère ne t\'a PAS dit sur les cheveux', angle: 'secret révélé', emoji: '🤫' },
  { topic: 'Cheveux bouclés definition', hook_fr: 'J\'ai testé 5 techniques pour définir mes boucles', angle: 'test comparatif', emoji: '🔬' },
  { topic: 'Anti-frisottis nuit', hook_fr: 'POV : tu te réveilles avec des cheveux PARFAITS', angle: 'humour relatable', emoji: '😴' },
  { topic: 'Bonnet satin résultats', hook_fr: 'J\'ai dormi avec un bonnet satin 30 nuits de suite', angle: 'défi 30 jours', emoji: '📅' },
  { topic: 'Hydratation cheveux crépus', hook_fr: 'Mes cheveux crépus sont ENFIN hydratés', angle: 'solution problème', emoji: '💧' },
  { topic: 'Coiffure protectrice facile', hook_fr: 'La coiffure de nuit qui change TOUT', angle: 'hack capillaire', emoji: '💡' },
  { topic: 'Entretien locs nuit', hook_fr: 'Comment je protège mes locs chaque soir', angle: 'tutoriel', emoji: '🪢' },
  { topic: 'Routine minimaliste cheveux', hook_fr: 'Ma routine cheveux à SEULEMENT 3 produits', angle: 'minimalisme beauté', emoji: '🪴' },
  { topic: 'Mythes capillaires démystifiés', hook_fr: 'STOP ! On t\'a menti sur tes cheveux', angle: 'éducation virale', emoji: '🚫' },
  { topic: 'Budget beauté cheveux', hook_fr: 'Mes cheveux sont sains avec MOINS de 20€ par mois', angle: 'budget', emoji: '💰' },
  { topic: 'Transition capillaire', hook_fr: '6 mois de transition capillaire — la vérité', angle: 'témoignage honnête', emoji: '🌱' },
  { topic: 'Twist-out parfait', hook_fr: 'Mon twist-out tient 7 jours grâce à cette astuce', angle: 'hack longue durée', emoji: '🔄' },
  { topic: 'Comparatif produits satin', hook_fr: 'Satin VS soie — j\'ai testé les deux pendant 1 mois', angle: 'comparatif', emoji: '⚖️' },
  { topic: 'Erreurs communes cheveux', hook_fr: '5 erreurs que tu fais TOUS LES JOURS avec tes cheveux', angle: 'erreurs à éviter', emoji: '❌' },
  { topic: 'Avant-après coiffure', hook_fr: 'AVANT vs APRÈS 1 semaine de soin capillaire correct', angle: 'avant/après', emoji: '📸' },
  { topic: 'Cheveux sains naturellement', hook_fr: 'Mes cheveux ont poussé de 5 cm en 2 mois — voilà comment', angle: 'pousse cheveux', emoji: '📏' },
  { topic: 'Soirée cheveux protégés', hook_fr: 'Ce que je fais CHAQUE soir avant de dormir', angle: 'routine soir', emoji: '🌙' },
  { topic: 'Hack coiffure rapide', hook_fr: 'Prête en 2 minutes avec des cheveux PARFAITS', angle: 'rapidité', emoji: '⚡' },
  { topic: 'Soin cheveux naturels DIY', hook_fr: 'Le masque capillaire maison qui remplace tout', angle: 'DIY beauté', emoji: '🧴' },
];

const FORMATS = [
  'tutoriel',
  'avant_apres',
  'temoignage',
  'humour_pov',
  'hack_secret',
  'defi',
];

// ─── Bibliothèque de scripts ───────────────────────────────────────────────────

const SCRIPT_TEMPLATES = {

  tutoriel: (trend, topColor) => ({
    format     : '🎓 TUTORIEL',
    duree      : '45–60 secondes',
    difficulte : 'Facile à filmer',
    materiel   : 'Ton bonnet satin SatinNuit, tes produits capillaires, bonne lumière naturelle',
    script     : `
[0–3 sec] HOOK — Texte à l'écran : "${trend.hook_fr.toUpperCase()}"
→ Regarde la caméra, sourcils levés, ton expression = "tu veux savoir mon secret ?"

[3–8 sec] PROBLÈME
→ Montre tes cheveux emmêlés / secs du matin (ou mime-le)
→ Voix off : "Avant, je me réveillais CHAQUE matin avec des cheveux impossibles à coiffer."

[8–20 sec] LA SOLUTION — Étape 1
→ Montre ton bonnet satin${topColor ? ` ${topColor}` : ''} SatinNuit
→ Voix off : "Étape 1 — je rassemble mes cheveux en ananas, comme ça."
→ Zoom sur le geste

[20–35 sec] ÉTAPE 2 + 3
→ "J'applique quelques gouttes d'huile d'argan sur mes longueurs"
→ "Et j'enfile mon bonnet satin — ça prend 30 secondes !"
→ Montre le résultat le matin : cheveux brillants, sans frisottis

[35–45 sec] RÉSULTAT + HOOK FINAL
→ Sourire face caméra
→ Voix off : "Résultat ? Des cheveux PARFAITS chaque matin. Fini les matins galère."
→ Texte à l'écran : "Le lien est dans ma bio 👆"

[45–60 sec] CALL TO ACTION
→ "Si tu veux le même résultat, je t'ai laissé le lien pour le trouver."
→ Montre le bonnet en gros plan, clins d'œil caméra
`.trim(),
    caption    : `${trend.emoji} ${trend.hook_fr}\n\nMa routine nuit en 3 étapes pour des cheveux parfaits au réveil 🌙\n\n✨ Le secret ? Mon bonnet satin double couche — lien dans ma bio !\n\n👇 Dis-moi en commentaire quelle est ta galère capillaire du matin`,
    hashtags   : generateHashtags(trend.topic, 'tutoriel'),
    hook_screen: trend.hook_fr.toUpperCase(),
    tip        : 'Filme en lumière naturelle (fenêtre derrière la caméra). Montre VRAIMENT tes cheveux avant — l\'authenticité = engagement.',
  }),

  avant_apres: (trend, topColor) => ({
    format     : '📸 AVANT / APRÈS',
    duree      : '30–45 secondes',
    difficulte : 'Très facile (2 clips)',
    materiel   : 'Ton téléphone, bonnet satin SatinNuit, 2 vidéos (matin sans protection vs matin avec)',
    script     : `
[0–3 sec] HOOK VISUEL — Split screen ou coupure franche
→ GAUCHE : cheveux défrisés/emmêlés/secs au réveil (sans protection)
→ DROITE : cheveux hydratés/définis/brillants (avec bonnet satin)
→ Son : transition "swoosh" ou son viral du moment

[3–10 sec] CONTEXTE RAPIDE
→ Texte à l'écran : "Ce que j'utilisais avant 👎 VS ce que j'utilise maintenant 👍"
→ Voix off : "Il y a 3 semaines, mes cheveux ressemblaient à ÇA le matin..."
→ Montre le "avant" (authentique, pas trop dramatique)

[10–25 sec] LA TRANSITION
→ Musique qui monte
→ Montre toi en train d'enfiler le bonnet satin le soir
→ "J'ai juste intégré ce geste dans ma routine nuit..."
→ Texte animé : "30 secondes le soir ="

[25–35 sec] LE RÉSULTAT
→ Révélation au réveil — grande énergie, sourire
→ Montre tes cheveux sous plusieurs angles
→ Texte à l'écran : "Des cheveux COMME ÇA chaque matin 😍"

[35–45 sec] CTA
→ "Le bonnet est dans ma bio — il existe en ${topColor ? topColor : '14 coloris'} !"
→ Point vers la caméra + sourire
`.trim(),
    caption    : `${trend.emoji} AVANT ➡️ APRÈS — La différence est INCROYABLE\n\n3 semaines avec mon bonnet satin SatinNuit et mes cheveux ont complètement changé 🙌\n\nPlus de frisottis, plus de cassure, plus de matins galère ✨\n\nLe lien est dans ma bio si tu veux le même résultat !`,
    hashtags   : generateHashtags(trend.topic, 'avant_apres'),
    hook_screen: 'AVANT vs APRÈS 3 SEMAINES',
    tip        : 'L\'avant/après fonctionne TOUJOURS. Sois vraiment authentique dans le "avant" — les gens s\'identifient.',
  }),

  temoignage: (trend, topColor) => ({
    format     : '💬 TÉMOIGNAGE AUTHENTIQUE',
    duree      : '60–90 secondes',
    difficulte : 'Facile (parler face caméra)',
    materiel   : 'Fond propre, bonne lumière, ton énergie naturelle',
    script     : `
[0–3 sec] HOOK DIRECT — Face caméra, confidentiel
→ Voix posée mais intense : "Je vais être HONNÊTE avec vous..."
→ Texte à l'écran : "CE QUE PERSONNE NE DIT SUR ${trend.topic.toUpperCase()}"

[3–15 sec] TON HISTOIRE VRAIE
→ "Pendant des années, mes cheveux cassaient, se desséchaient, et je dépensais une fortune en produits."
→ "J'ai essayé [marque A], [marque B], les masques hors de prix... RIEN ne fonctionnait vraiment."
→ Émotion authentique, regard direct caméra

[15–35 sec] LA DÉCOUVERTE
→ "Et puis une nuit, j'ai réalisé que le problème c'était pas les produits."
→ "C'était CE qui se passait PENDANT MON SOMMEIL."
→ Montre le bonnet satin
→ "Le coton de mon oreiller volait l'hydratation de mes cheveux chaque nuit."

[35–55 sec] LE CHANGEMENT
→ "Depuis que j'utilise ce bonnet satin, mes cheveux ont changé en MOINS D'UNE SEMAINE."
→ Montre tes cheveux actuels — tourne la tête, zoom
→ "Moins de cassure. Plus d'hydratation. Des boucles définies le matin."

[55–75 sec] RECOMMANDATION SINCÈRE
→ "Si j'avais su ça il y a 2 ans, j'aurais économisé des centaines d'euros."
→ "Je vous mets le lien dans ma bio. C'est ${topColor ? `disponible en ${topColor}` : 'disponible en 14 coloris'} et franchement c'est pas cher pour ce que ça apporte."
→ Sourire naturel, signe de tête

[75–90 sec] ENGAGEMENT
→ "Dites-moi en commentaire : vous dormez avec quelque chose sur vos cheveux ?"
`.trim(),
    caption    : `${trend.emoji} Je vous dois cette honnêteté…\n\nJ'ai mis des années à comprendre pourquoi mes cheveux ne poussaient pas. La réponse était dans ma chambre 🌙\n\nMon bonnet satin SatinNuit a tout changé — lien dans ma bio ✨\n\n💬 Et vous, comment vous protégez vos cheveux la nuit ?`,
    hashtags   : generateHashtags(trend.topic, 'temoignage'),
    hook_screen: 'CE QUE PERSONNE NE VOUS DIT SUR VOS CHEVEUX',
    tip        : 'Les témoignages authentiques = le format avec le meilleur taux de conversion. Parle VRAI, sans script parfait.',
  }),

  humour_pov: (trend, topColor) => ({
    format     : '😂 POV HUMOUR / RELATABLE',
    duree      : '15–30 secondes',
    difficulte : 'Fun à filmer',
    materiel   : 'Bonnet satin, expressions exagérées, son viral TikTok',
    script     : `
[0–2 sec] TEXTE À L'ÉCRAN (accroché à une tendance son viral)
→ "POV : C'est ton premier matin avec un bonnet satin"

[2–8 sec] SCÈNE A — L'ATTENTE ANXIEUSE
→ Tu te réveilles, les yeux encore fermés
→ Expression : "Est-ce que ça va marcher ?"
→ Tu poses les mains sur ton bonnet satin avant de l'enlever

[8–15 sec] RÉVÉLATION + RÉACTION EXAGÉRÉE
→ Tu enlèves le bonnet DOUCEMENT
→ Tes cheveux tombent parfaitement
→ Réaction : yeux écarquillés, main sur la bouche, regard caméra "OH MON DIEU"
→ Texte : "MES CHEVEUX ???"

[15–22 sec] CÉLÉBRATION ABSURDE
→ Tu danses, tu appelles un(e) imaginaire : "CHÉRI(E) VIENS VOIR !"
→ OU : tu fais un signe de tête épique au miroir
→ Son : son viral ou drop musical

[22–30 sec] FREEZE FRAME + TEXT
→ Texte final : "Le bonnet satin c'est pas optionnel, c'est une URGENCE 💅"
→ Petite flèche vers ta bio
`.trim(),
    caption    : `😂 Le bonnet satin a COMPLÈTEMENT changé mes matins\n\nJe vous jure que c'est comme ouvrir un cadeau chaque matin 🎁\n\nLe mien est disponible en ${topColor ? topColor : '14 couleurs'} — lien dans ma bio (partez pas sans le prendre sérieusement 😭)\n\n👇 Tag une amie qui EN A BESOIN`,
    hashtags   : generateHashtags(trend.topic, 'humour_pov'),
    hook_screen: 'POV : TON PREMIER MATIN AVEC UN BONNET SATIN',
    tip        : 'Utilise un son viral du moment (regarde les trending sounds TikTok la veille). Le format POV + son trending = combo parfait.',
  }),

  hack_secret: (trend, topColor) => ({
    format     : '🔓 HACK / SECRET RÉVÉLÉ',
    duree      : '30–45 secondes',
    difficulte : 'Très facile',
    materiel   : 'Bonnet satin, produits capillaires, éclairage proche-up',
    script     : `
[0–3 sec] HOOK URGENT
→ Doigt pointé vers caméra
→ "Si tu ne fais PAS ça ce soir, tes cheveux vont souffrir pendant ton sommeil."
→ Texte à l'écran : "LE TRUC À FAIRE CE SOIR ⚠️"

[3–12 sec] LE PROBLÈME QUE PERSONNE NE CONNAÎT
→ "Chaque nuit, ta taie d'oreiller en coton absorbe l'humidité de tes cheveux comme une éponge."
→ Gros plan : mains qui imitent l'absorption
→ "En 8 heures de sommeil, tu perds toute l'hydratation que tu as mis le matin."

[12–25 sec] LE HACK EN 3 TEMPS
→ "Solution ? 3 gestes, 2 minutes."
→ Geste 1 : "Applique une huile légère sur les longueurs"
→ Geste 2 : "Fais un ananas — chignon haut SUPER lâche"
→ Geste 3 : "Bonnet satin — tu mets, t'oublies, tu dors."
→ Montre chaque geste en accéléré (1–2 sec par geste)

[25–35 sec] LE RÉSULTAT PROUVÉ
→ "Le matin ? Des cheveux comme si tu sortais du salon."
→ Montre tes cheveux, tourne, gros plan brillance
→ Sourire satisfait

[35–45 sec] CTA
→ "Le bonnet SatinNuit est dans ma bio — ${topColor ? `en ${topColor} entre autres` : 'en 14 couleurs'}."
→ "Sauvegarde cette vidéo pour ce soir 📌"
`.trim(),
    caption    : `${trend.emoji} LE HACK que personne ne t'a dit 🔓\n\nTa taie en coton détruit tes cheveux chaque nuit. Voilà comment arrêter ça en 2 minutes ⏱️\n\n📌 Sauvegarde pour ce soir !\n\n🛒 Bonnet satin dispo dans ma bio — livraison rapide`,
    hashtags   : generateHashtags(trend.topic, 'hack_secret'),
    hook_screen: 'LE HACK QUE PERSONNE NE T\'A DIT ⚠️',
    tip        : '"Sauvegarde cette vidéo" → cette phrase augmente le taux de sauvegarde de 40%. Les sauvegardes boostent l\'algorithme TikTok.',
  }),

  defi: (trend, topColor) => ({
    format     : '🏆 DÉFI / CHALLENGE',
    duree      : '30–60 secondes',
    difficulte : 'Moyen (nécessite quelques jours de vidéos)',
    materiel   : '30 secondes de vidéo par jour pendant 7 jours, bonnet satin',
    script     : `
[0–3 sec] ANNONCE DU DÉFI
→ "Je teste le BONNET SATIN pendant 7 NUITS DE SUITE."
→ Texte à l'écran : "DÉFI 7 NUITS — RÉSULTATS HONNÊTES"
→ Énergie haute, regard déterminé

[3–10 sec] NUIT 1
→ "Nuit 1 — j'enfile mon bonnet SatinNuit${topColor ? ` en ${topColor}` : ''} pour la première fois."
→ Selfie avec bonnet, pouce levé
→ Texte : "Nuit 1 ✅"

[10–20 sec] AVANCE RAPIDE (Nuits 2–5)
→ Montage accéléré : toi avec bonnet chaque soir
→ Texte qui défile : "Nuit 2 ✅ Nuit 3 ✅ Nuit 4 ✅ Nuit 5 ✅"
→ Transitions rapides, musique rythmée

[20–35 sec] NUIT 7 + RÉSULTAT FINAL
→ "Nuit 7 — regardez l'état de mes cheveux ce matin !"
→ Caméra qui tourne autour de ta tête
→ Expression : amazée, contente
→ Texte : "APRÈS 7 NUITS 👇"

[35–50 sec] COMPARAISON DIRECTE
→ Photo/vidéo "avant" (si possible) vs maint
→ "Moins de frisottis. Plus de brillance. Mes boucles sont DÉFINIES."
→ Montre les détails : pointes, longueurs, lisière

[50–60 sec] CTA + ENGAGEMENT
→ "Je continue le défi — tu veux voir 30 jours ?"
→ "Le bonnet est dans ma bio — dis-moi quelle couleur tu veux !"
`.trim(),
    caption    : `${trend.emoji} J'ai testé le bonnet satin 7 NUITS DE SUITE — voilà les résultats HONNÊTES\n\nJe m'attendais pas à ça aussi vite 😱\n\n👇 Dites-moi si vous voulez voir le défi 30 jours !\n\n🛒 Le bonnet SatinNuit est dans ma bio`,
    hashtags   : generateHashtags(trend.topic, 'defi'),
    hook_screen: 'DÉFI BONNET SATIN 7 NUITS — LES VRAIS RÉSULTATS',
    tip        : 'Les défis créent de la sérialisation (les gens reviennent). Annonce le défi 30 jours à la fin pour maximiser les abonnés.',
  }),
};

// ─── Génération des hashtags ──────────────────────────────────────────────────

function generateHashtags(topic, format) {
  const mega = [
    '#cheveux', '#beaute', '#haircare', '#naturalhair', '#tiktokfrance',
  ];
  const large = [
    '#cheveuxxnaturels', '#cheveuxboucles', '#routinecapillaire', '#soincapillaire',
    '#cheveuxcrepus', '#protectioncapillaire', '#cheveuxsains', '#hairroutine',
    '#beautefrance', '#conseilsbeaute',
  ];
  const medium = [
    '#bonnetsatin', '#bonnetcheveux', '#routinenuit', '#cheveuxhydrytes',
    '#astucecapillaire', '#transitiocapillaire', '#cheveuxnaturelsfrance',
    '#locstyle', '#tressafricaine', '#cheveuxafro',
  ];
  const niche = [
    '#satinnuit', '#bonnetsatinnuit', '#protegervescheveux', '#dormirbien',
    '#cheveuxdumatin',
  ];

  // Tags spécifiques au format
  const formatTags = {
    tutoriel    : ['#tuto', '#tutoriel', '#apprendrebeaute', '#tipsbeaute'],
    avant_apres : ['#avantapres', '#transformation', '#cheveuxglow', '#résultats'],
    temoignage  : ['#avis', '#temoignage', '#honnete', '#cheveuxconfidence'],
    humour_pov  : ['#pov', '#relatable', '#humourbeaute', '#funny'],
    hack_secret : ['#hack', '#astuces', '#secretbeaute', '#lifehack'],
    defi        : ['#challenge', '#defi', '#30jours', '#7jours'],
  };

  const specific = formatTags[format] || [];

  // 30 hashtags total — mix stratégique
  const all = [
    ...mega,
    ...large.slice(0, 8),
    ...medium.slice(0, 10),
    ...niche,
    ...specific.slice(0, 4),
  ].slice(0, 30);

  return all.join(' ');
}

// ─── Récupération des données Shopify ────────────────────────────────────────

async function getTopVariant() {
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const resp = await new Promise((resolve) => {
      https.get({
        hostname: STORE,
        path    : `/admin/api/2024-10/orders.json?status=any&created_at_min=${since}&fields=line_items&limit=50`,
        headers : { 'X-Shopify-Access-Token': TOKEN },
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
      }).on('error', () => resolve({}));
    });

    const counts = {};
    for (const o of resp.orders || []) {
      for (const i of o.line_items || []) {
        const k = i.variant_title || i.title;
        if (k && k !== 'Default Title') counts[k] = (counts[k] || 0) + i.quantity;
      }
    }
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    return sorted[0]?.[0] || null;
  } catch (e) {
    return null;
  }
}

// ─── Génération du pack contenu du jour ──────────────────────────────────────

function generateDailyPack(topColor) {
  const seed = dateSeed(0);
  const dayOfWeek = new Date().getDay(); // 0=dim, 1=lun...

  // Sélection des 3 tendances du jour (différentes chaque jour)
  const trendA = TREND_POOL[(seed % TREND_POOL.length)];
  const trendB = TREND_POOL[((seed + 7) % TREND_POOL.length)];
  const trendC = TREND_POOL[((seed + 13) % TREND_POOL.length)];

  // Sélection des 3 formats du jour (rotation hebdomadaire)
  const formatBase = (Math.floor(seed / 100)) % FORMATS.length;
  const formatA = FORMATS[formatBase % FORMATS.length];
  const formatB = FORMATS[(formatBase + 2) % FORMATS.length];
  const formatC = FORMATS[(formatBase + 4) % FORMATS.length];

  const script1 = SCRIPT_TEMPLATES[formatA](trendA, topColor);
  const script2 = SCRIPT_TEMPLATES[formatB](trendB, topColor);
  const script3 = SCRIPT_TEMPLATES[formatC](trendC, topColor);

  return { script1, script2, script3, trendA, trendB, trendC };
}

// ─── Horaires optimaux de publication ────────────────────────────────────────

function getOptimalTimes() {
  const day = new Date().getDay();
  const schedules = {
    0: [ // Dimanche
      { time: '10h00–12h00', platform: 'TikTok & Reels', reason: 'Dimanche matin = scroll intense, audience détendue' },
      { time: '18h00–20h00', platform: 'TikTok', reason: 'Fin d\'après-midi, pic d\'engagement dominical' },
      { time: '21h00–22h00', platform: 'Instagram Reels', reason: 'Soirée dimanche = forte utilisation mobile' },
    ],
    1: [ // Lundi
      { time: '06h00–08h00', platform: 'TikTok', reason: 'Lundi matin : contenu "motivation/routine" performe très bien' },
      { time: '12h00–13h00', platform: 'Instagram Reels', reason: 'Pause déjeuner = pic d\'engagement' },
      { time: '19h00–21h00', platform: 'TikTok & Reels', reason: 'After-work, meilleure fenêtre de la semaine' },
    ],
    2: [ // Mardi
      { time: '07h00–09h00', platform: 'TikTok', reason: 'Audience active tôt le mardi' },
      { time: '12h00–14h00', platform: 'TikTok & Reels', reason: 'Pic de midi confirmé mardi' },
      { time: '20h00–22h00', platform: 'Instagram Reels', reason: 'Soirée mardi = très fort engagement beauté' },
    ],
    3: [ // Mercredi
      { time: '09h00–11h00', platform: 'TikTok', reason: 'Mercredi : audience jeune (pas d\'école PM) très active' },
      { time: '15h00–17h00', platform: 'TikTok & Reels', reason: 'Après-midi mercredi = pic spécifique France' },
      { time: '20h00–21h30', platform: 'Instagram Reels', reason: 'Soirée milieu de semaine' },
    ],
    4: [ // Jeudi
      { time: '08h00–09h00', platform: 'TikTok', reason: 'Jeudi matin : audience professionnelle active' },
      { time: '12h00–13h30', platform: 'TikTok & Reels', reason: 'Pic de midi jeudi' },
      { time: '19h30–21h00', platform: 'Instagram Reels', reason: 'Meilleur soir de la semaine pour Reels' },
    ],
    5: [ // Vendredi
      { time: '07h00–09h00', platform: 'TikTok', reason: 'Vendredi matin = forte motivation weekend' },
      { time: '16h00–18h00', platform: 'TikTok & Reels', reason: 'Début weekend, relâchement, fort scroll' },
      { time: '21h00–23h00', platform: 'TikTok', reason: 'Vendredi soir = session TikTok longue' },
    ],
    6: [ // Samedi
      { time: '09h00–11h00', platform: 'Instagram Reels', reason: 'Samedi matin = inspiration beauté weekend' },
      { time: '13h00–15h00', platform: 'TikTok & Reels', reason: 'Après-midi samedi = très fort' },
      { time: '20h00–22h00', platform: 'TikTok', reason: 'Samedi soir = pic maximum de la semaine' },
    ],
  };
  return schedules[day] || schedules[1];
}

// ─── Tendances de la semaine ──────────────────────────────────────────────────

function getWeeklyTrends() {
  const month = new Date().getMonth(); // 0–11
  const seasonal = {
    0 : { saison: 'Janvier', tendances: ['Résolutions beauté 2026', 'Routine minimaliste', 'Cheveux secs hiver'] },
    1 : { saison: 'Février', tendances: ['Saint-Valentin cheveux', 'Soin intense hiver', 'Coiffures romantiques'] },
    2 : { saison: 'Mars', tendances: ['Transition printemps', 'Détox capillaire', 'Nouvelles couleurs'] },
    3 : { saison: 'Avril', tendances: ['Pâques beauté', 'Cheveux printemps', 'Routine légère'] },
    4 : { saison: 'Mai', tendances: ['Préparer l\'été', 'UV et protection', 'Coiffures légères'] },
    5 : { saison: 'Juin', tendances: ['Été capillaire', 'Anti-humidité', 'Vacances routine'] },
    6 : { saison: 'Juillet', tendances: ['Plage et cheveux', 'Sel et chlore', 'Routine beach'] },
    7 : { saison: 'Août', tendances: ['Vacances beauté', 'Réparation soleil', 'Coiffures rapides'] },
    8 : { saison: 'Septembre', tendances: ['Rentrée beauté', 'Nouveau départ capillaire', 'Routine automne'] },
    9 : { saison: 'Octobre', tendances: ['Halloween coiffures', 'Cheveux automne', 'Soin intensif'] },
    10: { saison: 'Novembre', tendances: ['Black Friday beauté', 'Soin hiver', 'Routine cocooning'] },
    11: { saison: 'Décembre', tendances: ['Fêtes coiffures', 'Cadeaux beauté', 'Bilan annuel cheveux'] },
  };
  return seasonal[month] || seasonal[3];
}

// ─── Construction du rapport HTML ────────────────────────────────────────────

function buildTrafficReportHtml(pack, topColor, optimalTimes, weeklyTrends) {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const dayName = new Date().toLocaleDateString('fr-FR', { weekday: 'long' }).toUpperCase();

  function scriptCard(script, trend, num, color) {
    const cardColors = ['#e8f4fd', '#fef9e7', '#eafaf1'];
    const borderColors = ['#3498db', '#f39c12', '#27ae60'];
    const bg    = cardColors[(num - 1) % 3];
    const border = borderColors[(num - 1) % 3];

    const scriptLines = script.script
      .split('\n')
      .map(line => {
        if (line.startsWith('[')) {
          return `<p style="margin:6px 0;font-size:13px"><strong style="color:#333">${esc(line)}</strong></p>`;
        } else if (line.startsWith('→')) {
          return `<p style="margin:4px 0 4px 16px;font-size:13px;color:#555">${esc(line)}</p>`;
        } else if (line.trim() === '') {
          return '<br>';
        }
        return `<p style="margin:4px 0;font-size:13px;color:#666">${esc(line)}</p>`;
      }).join('');

    const hashtagLines = script.hashtags.split(' ')
      .map(h => `<span style="background:#f0f4ff;color:#3a3aff;padding:2px 6px;border-radius:8px;font-size:11px;margin:2px;display:inline-block">${esc(h)}</span>`)
      .join('');

    return `
<div style="margin:0 24px 28px;border:2px solid ${border};border-radius:12px;overflow:hidden">

  <!-- Card Header -->
  <div style="background:${border};padding:14px 20px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <span style="color:#fff;font-size:16px;font-weight:700">${esc(script.format)}</span>
      <span style="color:rgba(255,255,255,0.8);font-size:12px;margin-left:12px">${esc(script.duree)}</span>
    </div>
    <span style="background:rgba(255,255,255,0.2);color:#fff;padding:4px 10px;border-radius:20px;font-size:12px">Script #${num}</span>
  </div>

  <!-- Topic & Hook -->
  <div style="background:${bg};padding:16px 20px;border-bottom:1px solid rgba(0,0,0,0.08)">
    <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px">📌 Sujet du jour</p>
    <p style="margin:0 0 10px;font-size:15px;font-weight:600;color:#1a1a2e">${esc(trend.topic)}</p>
    <p style="margin:0 0 4px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px">🎯 Hook (3 premières secondes)</p>
    <div style="background:#fff;border-left:3px solid ${border};padding:10px 14px;border-radius:0 6px 6px 0">
      <p style="margin:0;font-size:14px;font-weight:700;color:#1a1a2e">"${esc(script.hook_screen)}"</p>
    </div>
  </div>

  <!-- Script complet -->
  <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0">
    <p style="margin:0 0 12px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px">🎬 Script complet</p>
    <div style="background:#fafafa;border-radius:6px;padding:14px;font-family:monospace">
      ${scriptLines}
    </div>
  </div>

  <!-- Matériel + Tip -->
  <div style="padding:12px 20px;background:#fffdf0;border-bottom:1px solid #f0f0f0;display:flex;gap:20px">
    <div style="flex:1">
      <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase">📦 Matériel</p>
      <p style="margin:0;font-size:12px;color:#555">${esc(script.materiel)}</p>
    </div>
    <div style="flex:1">
      <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase">💡 Conseil pro</p>
      <p style="margin:0;font-size:12px;color:#555">${esc(script.tip)}</p>
    </div>
  </div>

  <!-- Légende -->
  <div style="padding:14px 20px;border-bottom:1px solid #f0f0f0">
    <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px">✍️ Légende / Caption</p>
    <div style="background:#f8f8f8;border-radius:6px;padding:12px;font-size:13px;color:#333;white-space:pre-line;line-height:1.7">
${esc(script.caption)}
    </div>
  </div>

  <!-- Hashtags -->
  <div style="padding:14px 20px">
    <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px"># Hashtags (30)</p>
    <div>${hashtagLines}</div>
  </div>

</div>`;
  }

  // Horaires
  const timeRows = optimalTimes.map(t => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-weight:700;color:#1a1a2e;font-size:14px">${esc(t.time)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0">
        <span style="background:#e8f4fd;color:#3498db;padding:2px 8px;border-radius:8px;font-size:12px">${esc(t.platform)}</span>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666">${esc(t.reason)}</td>
    </tr>`).join('');

  // Tendances
  const trendBadges = weeklyTrends.tendances
    .map(t => `<span style="background:#fff0e8;color:#e67e22;padding:4px 12px;border-radius:20px;font-size:13px;margin:4px;display:inline-block">🔥 ${esc(t)}</span>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<div style="max-width:720px;margin:0 auto;background:#fff">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#6c11ff,#e91e8c,#ff6b35);padding:0">
    <div style="background:rgba(0,0,0,0.35);padding:32px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;letter-spacing:1px">🚀 SATINNUIT</h1>
      <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;font-weight:600">PACK CONTENU — PRÊT À FILMER</p>
      <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px">${esc(today)} · ${dayName}</p>
      ${topColor ? `<div style="margin-top:12px"><span style="background:rgba(255,255,255,0.2);color:#fff;padding:4px 14px;border-radius:20px;font-size:12px">🏆 Couleur tendance cette semaine : ${esc(topColor)}</span></div>` : ''}
    </div>
  </div>

  <!-- KPIs rapides -->
  <div style="display:flex;border-bottom:3px solid #f0f0f0">
    <div style="flex:1;padding:18px;text-align:center;border-right:1px solid #f0f0f0">
      <div style="font-size:28px;font-weight:700;color:#6c11ff">3</div>
      <div style="font-size:11px;color:#999;margin-top:2px;text-transform:uppercase;letter-spacing:1px">Scripts générés</div>
    </div>
    <div style="flex:1;padding:18px;text-align:center;border-right:1px solid #f0f0f0">
      <div style="font-size:28px;font-weight:700;color:#e91e8c">90</div>
      <div style="font-size:11px;color:#999;margin-top:2px;text-transform:uppercase;letter-spacing:1px">Hashtags inclus</div>
    </div>
    <div style="flex:1;padding:18px;text-align:center;border-right:1px solid #f0f0f0">
      <div style="font-size:28px;font-weight:700;color:#ff6b35">3</div>
      <div style="font-size:11px;color:#999;margin-top:2px;text-transform:uppercase;letter-spacing:1px">Formats variés</div>
    </div>
    <div style="flex:1;padding:18px;text-align:center">
      <div style="font-size:28px;font-weight:700;color:#27ae60">📅</div>
      <div style="font-size:11px;color:#999;margin-top:2px;text-transform:uppercase;letter-spacing:1px">Horaires optimaux</div>
    </div>
  </div>

  <!-- Tendances du moment -->
  <div style="padding:20px 24px;background:#fff8f0;border-bottom:2px solid #f0f0f0">
    <h2 style="font-size:14px;font-weight:700;color:#e67e22;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px">
      🔥 Tendances ${esc(weeklyTrends.saison)} à surfer
    </h2>
    <div>${trendBadges}</div>
    <p style="margin:12px 0 0;font-size:12px;color:#888">
      Intègre ces sujets dans tes scripts et légendes pour un maximum de résonance avec l'algorithme du moment.
    </p>
  </div>

  <!-- Scripts -->
  <div style="padding:24px 0 8px">
    <h2 style="font-size:15px;font-weight:700;color:#1a1a2e;margin:0 0 20px;text-align:center;text-transform:uppercase;letter-spacing:1px">
      🎬 Tes 3 scripts du jour
    </h2>
    ${scriptCard(pack.script1, pack.trendA, 1)}
    ${scriptCard(pack.script2, pack.trendB, 2)}
    ${scriptCard(pack.script3, pack.trendC, 3)}
  </div>

  <!-- Horaires optimaux -->
  <div style="padding:0 24px 24px">
    <h2 style="font-size:15px;font-weight:700;color:#1a1a2e;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px">
      ⏰ Meilleures heures de publication — ${dayName}
    </h2>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f8f8f8">
          <th style="padding:10px 14px;text-align:left;font-size:12px;color:#666;font-weight:600">Heure</th>
          <th style="padding:10px 14px;text-align:left;font-size:12px;color:#666;font-weight:600">Plateforme</th>
          <th style="padding:10px 14px;text-align:left;font-size:12px;color:#666;font-weight:600">Pourquoi</th>
        </tr>
      </thead>
      <tbody>${timeRows}</tbody>
    </table>
    <p style="margin:12px 0 0;font-size:12px;color:#888">
      💡 Poste ton contenu 15 min avant l'heure de pointe pour maximiser la visibilité au pic d'audience.
    </p>
  </div>

  <!-- Stratégie de la semaine -->
  <div style="margin:0 24px 24px;background:#f3e8ff;border-radius:10px;padding:20px">
    <h3 style="margin:0 0 14px;font-size:14px;color:#6c11ff;font-weight:700">🧠 Stratégie contenu optimale</h3>
    <ul style="margin:0;padding-left:20px;color:#444;font-size:13px;line-height:2">
      <li><strong>Fréquence idéale :</strong> 1 vidéo/jour sur TikTok · 3-4 Reels/semaine sur Instagram</li>
      <li><strong>Ratio contenus :</strong> 60% valeur/éducatif · 30% divertissement · 10% vente directe</li>
      <li><strong>Engagement :</strong> Réponds aux commentaires dans les 30 min après publication — c'est clé pour l'algorithme</li>
      <li><strong>Réutilisation :</strong> Chaque script TikTok → adapte en Reel Instagram le lendemain</li>
      <li><strong>CTA bio :</strong> Vérifie que ton lien bio pointe bien vers ton produit SatinNuit</li>
      <li><strong>Son viral :</strong> Consulte les sons tendance TikTok ce matin avant de filmer</li>
    </ul>
  </div>

  <!-- Footer -->
  <div style="background:linear-gradient(135deg,#6c11ff,#e91e8c);padding:20px;text-align:center">
    <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:0">
      🚀 Pack généré automatiquement par <strong>SatinNuit Trafic & Viral Agent</strong>
    </p>
    <p style="color:rgba(255,255,255,0.6);font-size:11px;margin:8px 0 0">
      Nouveau pack dans ta boîte mail demain à 6h30 · Scripts différents chaque jour
    </p>
  </div>

</div>
</body>
</html>`;
}

// ─── Point d'entrée principal ─────────────────────────────────────────────────

async function runDailyTrafficReport() {
  const startMs = Date.now();
  console.log('[TRAFFIC] Démarrage agent Trafic & Viral...');

  // 1. Récupérer la couleur top de la semaine
  const topColor = await getTopVariant();
  console.log(`[TRAFFIC] Top couleur semaine : ${topColor || 'N/A'}`);

  // 2. Générer le pack contenu du jour
  const pack = generateDailyPack(topColor);
  console.log(`[TRAFFIC] Scripts générés : ${pack.script1.format} · ${pack.script2.format} · ${pack.script3.format}`);

  // 3. Horaires optimaux
  const optimalTimes = getOptimalTimes();

  // 4. Tendances de la saison
  const weeklyTrends = getWeeklyTrends();

  const durationMs = Date.now() - startMs;
  console.log(`[TRAFFIC] Pack généré en ${durationMs}ms`);

  // 5. Email rapport
  const html = buildTrafficReportHtml(pack, topColor, optimalTimes, weeklyTrends);
  const date = new Date().toLocaleDateString('fr-FR');

  await sendEmail(
    `🚀 SatinNuit — Pack Trafic & Viral ${date} · 3 scripts prêts à filmer · ${pack.script1.format.split(' ')[1]} · ${pack.script2.format.split(' ')[1]} · ${pack.script3.format.split(' ')[1]}`,
    html,
  );

  console.log('[TRAFFIC] Pack contenu envoyé ✓');

  return { pack, topColor, optimalTimes, weeklyTrends };
}

module.exports = { runDailyTrafficReport };
